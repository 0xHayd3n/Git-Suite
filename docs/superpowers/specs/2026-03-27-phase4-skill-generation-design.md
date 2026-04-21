# Phase 4 — Skill Generation Design

**Date:** 2026-03-27
**Status:** Approved
**Scope:** Anthropic API key storage, Haiku skill generation pipeline, install button state machine, skill file panel

---

## 1. Overview

Phase 4 wires the Anthropic API key entry, the Claude Haiku skill generation pipeline, skill file storage, and the install button state machine across the Discover cards and Repo Detail sidebar. Phases 1–3 are complete and must not be broken.

---

## 2. Architecture

Six discrete units of work with clear boundaries:

| Unit | Location | Responsibility |
|------|----------|----------------|
| Skill generator | `electron/skill-gen.ts` | Pure function: `SkillGenInput + apiKey → markdown string` |
| IPC handlers | `electron/main.ts` | Orchestrate skill-gen, file I/O, DB upsert, key storage |
| Encrypted store | `electron/store.ts` | Second `electron-store` instance with `encryptionKey` for API key |
| Settings view | `src/views/Settings.tsx` | `/settings` route — API key entry only |
| Sidebar nav | `src/components/Sidebar.tsx` | Gear icon at bottom, routes to `/settings` |
| Install state machine | `Discover.tsx`, `RepoDetail.tsx` | Three-state button; skill panel with real data |

---

## 3. Anthropic API Key Storage

### Store

Add a second `electron-store` instance in `electron/store.ts` with a static `encryptionKey`. This is AES-256-cbc — better than plaintext, consistent with the "stored encrypted locally" claim. The API key is never stored in SQLite.

```typescript
interface ApiStoreSchema {
  'anthropic.apiKey'?: string
}

const apiStore = new Store<ApiStoreSchema>({ encryptionKey: 'git-suite-api-key-v1' })

export function getApiKey(): string | undefined {
  return apiStore.get('anthropic.apiKey')
}

export function setApiKey(key: string): void {
  apiStore.set('anthropic.apiKey', key)
}
```

### IPC Handlers

```typescript
ipcMain.handle('settings:getApiKey', async () => getApiKey() ?? null)
ipcMain.handle('settings:setApiKey', async (_, key: string) => setApiKey(key))
```

### Preload bridge additions

```typescript
settings: {
  get: (key) => ipcRenderer.invoke('settings:get', key),
  set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getApiKey: () => ipcRenderer.invoke('settings:getApiKey'),
  setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
}
```

### `window.api` type additions

```typescript
settings: {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  getApiKey(): Promise<string | null>
  setApiKey(key: string): Promise<void>
}
```

---

## 4. Settings View

**Route:** `/settings`
**File:** `src/views/Settings.tsx`

Single section: API Keys.

```
┌─────────────────────────────────────────────────┐
│  ANTHROPIC API KEY                              │
│                                                 │
│  [sk-ant-••••••••••••••••••••••••]  [Update]   │
│                                                 │
│  Used to generate skill files with Claude       │
│  Haiku. Your key is stored encrypted locally   │
│  and never leaves your machine.                 │
└─────────────────────────────────────────────────┘
```

- Input type: `password`; pre-filled with masked value if key exists (controlled via `useState`)
- "Update" button calls `window.api.settings.setApiKey(value)`, shows brief "Saved" confirmation
- On mount: calls `window.api.settings.getApiKey()` and populates the input if a key exists

---

## 5. Sidebar Navigation Update

**File:** `src/components/Sidebar.tsx`

Add a gear icon (`⚙`) nav item in the bottom section, above the Claude Desktop status indicator. Clicking it navigates to `/settings`. Follows existing nav item styles and active-state highlighting.

---

## 6. Skill Generation Pipeline

### `electron/skill-gen.ts`

**Input interface:**

```typescript
interface SkillGenInput {
  owner: string
  name: string
  language: string
  topics: string[]
  readme: string       // raw markdown, may be empty string
  version: string      // from latest release tag, or 'unknown'
}
```

**API call:**

```typescript
import Anthropic from '@anthropic-ai/sdk'

async function generateSkill(input: SkillGenInput, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const readmeTruncated = input.readme.slice(0, 12000) // ~3000 tokens

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Generate a skill file for the GitHub repository "${input.owner}/${input.name}".

Language: ${input.language}
Topics: ${input.topics.join(', ')}
Version: ${input.version}

README: ${readmeTruncated}

Produce a skill.md file with exactly three depth sections using these exact markers:

## [CORE] Maximum 80 lines. Include: install command, the 3 most common usage patterns with brief code examples, critical gotchas. Any model reading only this section should be able to immediately use the library correctly.

## [EXTENDED] Maximum 120 additional lines. Include: secondary API surface, less common patterns, integration tips, configuration options.

## [DEEP] Maximum 200 additional lines. Include: edge cases, internals, advanced configuration, known issues, performance considerations.

Rules:
- Write for an AI model as the reader, not a human
- Be dense and precise — no conversational filler
- Prefer short code examples over prose descriptions
- Each section must be independently useful if read alone
- Do not reproduce licence text, contributor lists, or changelog entries
- Start immediately with the first section marker — no preamble`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export { generateSkill, SkillGenInput }
```

### Dependency

Add `@anthropic-ai/sdk` to `package.json` dependencies.

---

## 7. IPC Handlers — Skill CRUD

```typescript
ipcMain.handle('skill:generate', async (_, owner: string, name: string) => {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Anthropic API key set')

  const token = getToken() ?? null
  const readme = await getReadme(token, owner, name) ?? ''
  const releases = await getReleases(token, owner, name)
  const version = releases[0]?.tag_name ?? 'unknown'

  // Note: repos.id is the numeric GitHub ID; look up by owner+name instead.
  // RepoRow is a renderer-side type — use an inline type here in the main process.
  const repo = db.prepare('SELECT * FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { language: string | null; topics: string | null } | undefined
  const language = repo?.language ?? ''
  const topics = JSON.parse(repo?.topics ?? '[]') as string[]

  const content = await generateSkill({ owner, name, language, topics, readme, version }, apiKey)

  // Save to disk
  const dir = path.join(app.getPath('userData'), 'skills', owner)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${name}.skill.md`), content, 'utf8')

  // Save to SQLite
  db.prepare(`
    INSERT OR REPLACE INTO skills (repo_id, filename, content, version, generated_at, active, enabled_components)
    VALUES (?, ?, ?, ?, ?, 1, NULL)
  `).run(`${owner}/${name}`, `${name}.skill.md`, content, version, new Date().toISOString())

  return { content, version }
})

ipcMain.handle('skill:get', async (_, owner: string, name: string) => {
  return db.prepare('SELECT * FROM skills WHERE repo_id = ?').get(`${owner}/${name}`) ?? null
})

ipcMain.handle('skill:delete', async (_, owner: string, name: string) => {
  db.prepare('DELETE FROM skills WHERE repo_id = ?').run(`${owner}/${name}`)
  const filePath = path.join(app.getPath('userData'), 'skills', owner, `${name}.skill.md`)
  await fs.unlink(filePath).catch(() => {}) // ignore if file doesn't exist
  // Note: does NOT clear repos.saved_at — unsave flow is deferred to Phase 5.
})
```

### Preload bridge additions

```typescript
skill: {
  generate: (owner, name) => ipcRenderer.invoke('skill:generate', owner, name),
  get: (owner, name) => ipcRenderer.invoke('skill:get', owner, name),
  delete: (owner, name) => ipcRenderer.invoke('skill:delete', owner, name),
}
```

### `window.api` type additions

```typescript
skill: {
  generate(owner: string, name: string): Promise<{ content: string; version: string }>
  get(owner: string, name: string): Promise<SkillRow | null>
  delete(owner: string, name: string): Promise<void>
}
```

Where `SkillRow` mirrors the DB schema:

```typescript
interface SkillRow {
  repo_id: string
  filename: string
  content: string
  version: string
  generated_at: string
  active: number
  enabled_components: string | null
}
```

---

## 8. Install Button State Machine

Three states per repo. Derived on mount from `skill:get` result; stored in React component state.

| State | Label | Style |
|-------|-------|-------|
| `UNINSTALLED` | `+ Install` | Purple outline button |
| `GENERATING` | `⟳ Generating...` | Amber tint, disabled |
| `INSTALLED` | `✓ Installed` | Green tint, non-interactive |

**Transition flow:**

```
click "+ Install"
  → if no apiKey: show inline message "Add an API key in Settings to install skills." (link to /settings)
  → set state = GENERATING  (immediate — before API call)
  → call window.api.skill.generate(owner, name)
  → on success: set state = INSTALLED; update skill panel data in sidebar
  → on error: set state = UNINSTALLED; show "Generation failed — try again" in red below button
```

**On mount:** call `window.api.skill.get(owner, name)` — if row exists, set state = `INSTALLED`.

**Applied to:**
1. Install button on Discover cards (was "Save")
2. Install button on Repo Detail sidebar (was "Save"/"Saved")

**Note:** Renaming "Save" → "Install" everywhere. Saving a repo (setting `saved_at`) is now implicit when clicking Install; it no longer has a standalone button.

**SavedRepos context sync:** When the Install button is clicked in the renderer, call the context's `saveRepo(owner, name)` method (from `useSavedRepos()`). Do **not** call `window.api.github.saveRepo` separately — the context method already does this internally. This keeps `isSaved()` in sync without requiring a remount and avoids a double IPC call.

---

## 9. Skill File Panel (Repo Detail Sidebar)

After a skill is installed, the sidebar skill panel displays real data from the generated content.

### Line count parser

```typescript
function parseSkillDepths(content: string): { core: number; extended: number; deep: number } {
  const coreMatch    = content.match(/## \[CORE\]([\s\S]*?)(?=## \[EXTENDED\]|$)/)
  const extMatch     = content.match(/## \[EXTENDED\]([\s\S]*?)(?=## \[DEEP\]|$)/)
  const deepMatch    = content.match(/## \[DEEP\]([\s\S]*?)$/)
  return {
    core:     coreMatch  ? coreMatch[1].trim().split('\n').length  : 0,
    extended: extMatch   ? extMatch[1].trim().split('\n').length   : 0,
    deep:     deepMatch  ? deepMatch[1].trim().split('\n').length  : 0,
  }
}
```

### Depth bars

| Bar | Width formula | Colour |
|-----|--------------|--------|
| Core | `(core / total) * 100%` | `#34d399` |
| Extended | `((core + extended) / total) * 100%` | `#a78bfa` |
| Deep | `100%` | `#7c3aed` |

Line counts shown next to labels as `~N lines`.

**CSS layout model:** The three bars are rendered as an absolutely-positioned stack inside a fixed-height container. Deep (100%) is the bottommost layer; Extended sits on top; Core sits on top of Extended. Z-index stacking order: Deep (z:1), Extended (z:2), Core (z:3). This produces a visual where each wider bar is revealed as the background of the narrower bar above it.

---

## 10. Skill File Tab (Repo Detail)

When skill is installed, the "Skill file" tab renders the actual skill.md content as a styled code block. The three section headers are highlighted in different accent colours:

| Header | Colour |
|--------|--------|
| `## [CORE]` | `#34d399` (green) |
| `## [EXTENDED]` | `#a78bfa` (purple) |
| `## [DEEP]` | `#7c3aed` (deep purple) |

Implementation: render as a `<pre>` block, split on lines, apply `<span>` with inline colour to header lines.

---

## 11. Error Handling

| Error | Behaviour |
|-------|-----------|
| No API key | Inline message below Install button: "Add an API key in Settings to install skills." with link to `/settings`. Button does not enter GENERATING state. |
| Haiku API error | Revert button to UNINSTALLED. Show "Generation failed — try again" in red below button. |
| README not found | `getReadme` returns `null` → pass empty string `''` to generator. Haiku produces minimal skill from topics and language. |

---

## 12. Files Changed / Created

| Action | Path |
|--------|------|
| Create | `electron/skill-gen.ts` |
| Modify | `electron/store.ts` — add `apiStore`, export `getApiKey`, `setApiKey` |
| Modify | `electron/main.ts` — add `settings:getApiKey`, `settings:setApiKey`, `skill:generate`, `skill:get`, `skill:delete` handlers |
| Modify | `electron/preload.ts` — bridge new IPC channels |
| Create | `src/views/Settings.tsx` |
| Modify | `src/components/Sidebar.tsx` — add Settings gear icon |
| Modify | `src/App.tsx` — add `/settings` route |
| Modify | `src/views/Discover.tsx` — rename Save→Install, add state machine |
| Modify | `src/views/RepoDetail.tsx` — rename Save→Install, add state machine, populate skill panel |
| Modify | `src/env.d.ts` — add new `window.api` types |
| Modify | `src/types/repo.ts` — add `SkillRow` interface |
| Modify | `package.json` — add `@anthropic-ai/sdk` dependency |
| Modify | `src/App.test.tsx` — add `getApiKey: vi.fn()`, `setApiKey: vi.fn()` to `settings` in `makeApi()`, and add `skill: { generate: vi.fn(), get: vi.fn(), delete: vi.fn() }` namespace |
