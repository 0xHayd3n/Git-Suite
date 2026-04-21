# Phase 5: My Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the My Library view — a full management interface for installed skills with a type-aware detail panel and component browser.

**Architecture:** Eight backend files are modified to add IPC handlers and extend skill generation; five frontend files are modified or replaced to add the Library view, CSS, types, and parse utilities. The Library view is a single file with all sub-components inline following the existing Discover/RepoDetail pattern. Component manifests are parsed from the skill markdown at render time — no second AI call, no schema migration.

**Tech Stack:** Electron + React + TypeScript + better-sqlite3 + Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-phase5-my-library-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `electron/skill-gen.ts` | Modify | Accept `isComponents` + `enabledComponents` flags, conditionally append component prompt |
| `electron/main.ts` | Modify | Component detection, extended `skill:generate`, 4 new IPC handlers |
| `electron/preload.ts` | Modify | Expose all new channels under `window.api` |
| `src/env.d.ts` | Modify | Type declarations for all new API methods |
| `src/types/repo.ts` | Modify | Add `LibraryRow` interface |
| `src/utils/skillParse.ts` | Modify | Add `parseComponents()` export |
| `src/views/Library.tsx` | Replace | Full Library view implementation |
| `src/styles/globals.css` | Modify | Library-specific CSS classes |

---

## Task 1: Extend `skill-gen.ts` for component libraries

**Files:**
- Modify: `electron/skill-gen.ts`
- Test: `electron/skill-gen.test.ts`

- [ ] **Step 1: Write failing tests for component prompt behavior**

Add to `electron/skill-gen.test.ts`:

```typescript
it('appends component prompt when isComponents and enabledComponents provided', async () => {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [CORE]\nok' }] })
  await generateSkill(
    { ...baseInput, isComponents: true, enabledComponents: ['Button', 'Input'] },
    'sk-ant-test'
  )
  const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
  expect(prompt).toContain('Button, Input')
  expect(prompt).toContain('#### headings')
  expect(prompt).toContain('### ComponentName')
})

it('does not append component prompt when isComponents is false', async () => {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [CORE]\nok' }] })
  await generateSkill({ ...baseInput, isComponents: false }, 'sk-ant-test')
  const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
  expect(prompt).not.toContain('component library')
})

it('does not append component prompt when enabledComponents is absent', async () => {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [CORE]\nok' }] })
  await generateSkill({ ...baseInput, isComponents: true }, 'sk-ant-test')
  const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
  expect(prompt).not.toContain('ONLY for these enabled components')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /d/Coding/Git-Suite && npx vitest run electron/skill-gen.test.ts
```

Expected: 3 new tests FAIL (property `isComponents` doesn't exist on `SkillGenInput`)

- [ ] **Step 3: Extend `SkillGenInput` and `generateSkill` in `skill-gen.ts`**

Replace the entire file:

```typescript
import Anthropic from '@anthropic-ai/sdk'

export interface SkillGenInput {
  owner: string
  name: string
  language: string
  topics: string[]
  readme: string
  version: string
  isComponents?: boolean
  enabledComponents?: string[]
}

const COMPONENT_PROMPT_APPEND = (list: string) => `

This is a component library. Generate documentation ONLY for these enabled components: ${list}.
For each component, include:
- Import statement
- Props interface (key props only)
- 1–2 usage examples
Organise by category using #### headings (Form & Input, Overlay & Feedback, Navigation & Layout).
Use ### ComponentName for each component heading.
Do not use ## headings for components or categories — only #### and ### to avoid conflicting with the depth section markers.`

export async function generateSkill(input: SkillGenInput, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const readmeTruncated = input.readme.slice(0, 12000)

  const componentSuffix =
    input.isComponents && input.enabledComponents
      ? COMPONENT_PROMPT_APPEND(input.enabledComponents.join(', '))
      : ''

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
- Start immediately with the first section marker — no preamble${componentSuffix}`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd /d/Coding/Git-Suite && npx vitest run electron/skill-gen.test.ts
```

Expected: all tests PASS (4 original + 3 new = 7 total)

- [ ] **Step 5: Commit**

```bash
cd /d/Coding/Git-Suite && git add electron/skill-gen.ts electron/skill-gen.test.ts && git commit -m "feat: extend skill-gen for component library prompt"
```

---

## Task 2: Extend `skill:generate` in `main.ts`

**Files:**
- Modify: `electron/main.ts` lines 339–371

- [ ] **Step 1: Replace the `skill:generate` handler**

Replace lines 339–371 of `electron/main.ts` (the entire `skill:generate` handler):

```typescript
ipcMain.handle('skill:generate', async (_, owner: string, name: string, options?: { enabledComponents?: string[] }) => {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Anthropic API key set')

  const token = getToken() ?? null
  const readme = await getReadme(token, owner, name) ?? ''
  const releases = await getReleases(token, owner, name)
  const version = releases[0]?.tag_name ?? 'unknown'

  const db = getDb(app.getPath('userData'))
  const repo = db.prepare('SELECT id, language, topics FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { id: string; language: string | null; topics: string | null } | undefined
  if (!repo) throw new Error(`Repo ${owner}/${name} not found in database`)

  const language = repo.language ?? ''
  const topics = JSON.parse(repo.topics ?? '[]') as string[]

  // Component detection
  const isComponents =
    topics.some((t: string) => ['components', 'ui-components', 'design-system', 'component-library'].includes(t)) ||
    /ui|components|design.?system/i.test(name)

  if (isComponents) {
    db.prepare("UPDATE repos SET type='components' WHERE id=?").run(repo.id)
  }

  const content = await generateSkill(
    { owner, name, language, topics, readme, version, isComponents, enabledComponents: options?.enabledComponents },
    apiKey
  )

  const dir = path.join(app.getPath('userData'), 'skills', owner)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${name}.skill.md`), content, 'utf8')

  const generated_at = new Date().toISOString()
  // Use upsert that preserves existing active and enabled_components on regenerate.
  // INSERT sets active=1 and enabled_components=NULL for brand-new rows only.
  // ON CONFLICT updates only the content fields — user's toggle state and component
  // selections are not touched.
  db.prepare(`
    INSERT INTO skills (repo_id, filename, content, version, generated_at, active, enabled_components)
    VALUES (?, ?, ?, ?, ?, 1, NULL)
    ON CONFLICT(repo_id) DO UPDATE SET
      filename     = excluded.filename,
      content      = excluded.content,
      version      = excluded.version,
      generated_at = excluded.generated_at
  `).run(repo.id, `${name}.skill.md`, content, version, generated_at)

  return { content, version, generated_at }
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /d/Coding/Git-Suite && git add electron/main.ts && git commit -m "feat: extend skill:generate with component detection and generated_at return"
```

---

## Task 3: Add new IPC handlers to `main.ts`

**Files:**
- Modify: `electron/main.ts` — add after the existing `skill:delete` handler (after line 387)

- [ ] **Step 1: Add the four new handlers**

Insert after the `skill:delete` handler (after line 387, before the `// ── App lifecycle` comment):

```typescript
// ── Library IPC ─────────────────────────────────────────────────
ipcMain.handle('library:getAll', async () => {
  const db = getDb(app.getPath('userData'))
  return db.prepare(`
    SELECT r.*, s.active, s.version, s.generated_at, s.filename, s.content, s.enabled_components
    FROM repos r
    INNER JOIN skills s ON r.id = s.repo_id
    ORDER BY s.generated_at DESC
  `).all()
})

ipcMain.handle('skill:toggle', async (_, owner: string, name: string, active: number) => {
  const db = getDb(app.getPath('userData'))
  db.prepare(
    'UPDATE skills SET active = ? WHERE repo_id = (SELECT id FROM repos WHERE owner = ? AND name = ?)'
  ).run(active, owner, name)
})

ipcMain.handle('skill:setEnabledComponents', async (_, owner: string, name: string, enabled: string[]) => {
  const db = getDb(app.getPath('userData'))
  db.prepare(
    'UPDATE skills SET enabled_components = ? WHERE repo_id = (SELECT id FROM repos WHERE owner = ? AND name = ?)'
  ).run(JSON.stringify(enabled), owner, name)
})

ipcMain.handle('library:getCollections', async (_, repoId: string) => {
  const db = getDb(app.getPath('userData'))
  const rows = db.prepare(`
    SELECT c.name FROM collections c
    JOIN collection_repos cr ON cr.collection_id = c.id
    WHERE cr.repo_id = ?
  `).all(repoId) as { name: string }[]
  return rows.map((r) => r.name)
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /d/Coding/Git-Suite && git add electron/main.ts && git commit -m "feat: add library:getAll, skill:toggle, skill:setEnabledComponents, library:getCollections IPC handlers"
```

---

## Task 4: Update `preload.ts` and `env.d.ts`

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Update `preload.ts`**

Replace the entire `skill` block and add `library` block. The full updated file:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

const callbackWrappers = new Map<Function, (...args: unknown[]) => void>()

contextBridge.exposeInMainWorld('api', {
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  github: {
    connect:       () => ipcRenderer.invoke('github:connect'),
    exchange:      (code: string) => ipcRenderer.invoke('github:exchange', code),
    getUser:       () => ipcRenderer.invoke('github:getUser'),
    getStarred:    () => ipcRenderer.invoke('github:getStarred'),
    disconnect:    () => ipcRenderer.invoke('github:disconnect'),
    searchRepos:   (query: string) => ipcRenderer.invoke('github:searchRepos', query),
    getRepo:       (owner: string, name: string) => ipcRenderer.invoke('github:getRepo', owner, name),
    getReadme:     (owner: string, name: string) => ipcRenderer.invoke('github:getReadme', owner, name),
    getReleases:   (owner: string, name: string) => ipcRenderer.invoke('github:getReleases', owner, name),
    saveRepo:        (owner: string, name: string) => ipcRenderer.invoke('github:saveRepo', owner, name),
    getSavedRepos:   () => ipcRenderer.invoke('github:getSavedRepos'),
    getRelatedRepos: (owner: string, name: string, topicsJson: string) =>
      ipcRenderer.invoke('github:getRelatedRepos', owner, name, topicsJson),
    onCallback:    (cb: (code: string) => void) => {
      const wrapper = (_: unknown, code: string) => cb(code)
      callbackWrappers.set(cb, wrapper)
      ipcRenderer.on('oauth:callback', wrapper)
    },
    offCallback: (cb: (code: string) => void) => {
      const wrapper = callbackWrappers.get(cb)
      if (wrapper) {
        ipcRenderer.removeListener('oauth:callback', wrapper)
        callbackWrappers.delete(cb)
      }
    },
  },

  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getApiKey: () => ipcRenderer.invoke('settings:getApiKey'),
    setApiKey: (key: string) => ipcRenderer.invoke('settings:setApiKey', key),
  },

  skill: {
    generate: (owner: string, name: string, options?: { enabledComponents?: string[] }) =>
      ipcRenderer.invoke('skill:generate', owner, name, options),
    get: (owner: string, name: string) => ipcRenderer.invoke('skill:get', owner, name),
    delete: (owner: string, name: string) => ipcRenderer.invoke('skill:delete', owner, name),
    toggle: (owner: string, name: string, active: number) =>
      ipcRenderer.invoke('skill:toggle', owner, name, active),
    setEnabledComponents: (owner: string, name: string, enabled: string[]) =>
      ipcRenderer.invoke('skill:setEnabledComponents', owner, name, enabled),
  },

  library: {
    getAll: () => ipcRenderer.invoke('library:getAll'),
    getCollections: (repoId: string) => ipcRenderer.invoke('library:getCollections', repoId),
  },
})
```

- [ ] **Step 2: Update `src/env.d.ts`**

Replace the entire file:

```typescript
import type { RepoRow, ReleaseRow, SkillRow, LibraryRow } from './types/repo'

export {}

declare global {
  interface Window {
    api: {
      windowControls: {
        minimize: () => void
        maximize: () => void
        close:    () => void
      }
      github: {
        connect:       () => Promise<void>
        exchange:      (code: string) => Promise<void>
        getUser:       () => Promise<{ login: string; avatarUrl: string; publicRepos: number }>
        getStarred:    () => Promise<void>
        disconnect:    () => Promise<void>
        onCallback:    (cb: (code: string) => void) => void
        offCallback:   (cb: (code: string) => void) => void
        searchRepos:   (query: string) => Promise<RepoRow[]>
        getRepo:       (owner: string, name: string) => Promise<RepoRow>
        getReadme:     (owner: string, name: string) => Promise<string | null>
        getReleases:   (owner: string, name: string) => Promise<ReleaseRow[]>
        saveRepo:         (owner: string, name: string) => Promise<void>
        getSavedRepos:    () => Promise<{ owner: string; name: string }[]>
        getRelatedRepos:  (owner: string, name: string, topicsJson: string) => Promise<RepoRow[]>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
        getApiKey(): Promise<string | null>
        setApiKey(key: string): Promise<void>
      }
      skill: {
        generate(owner: string, name: string, options?: { enabledComponents?: string[] }): Promise<{ content: string; version: string; generated_at: string }>
        get(owner: string, name: string): Promise<SkillRow | null>
        delete(owner: string, name: string): Promise<void>
        toggle(owner: string, name: string, active: number): Promise<void>
        setEnabledComponents(owner: string, name: string, enabled: string[]): Promise<void>
      }
      library: {
        getAll(): Promise<LibraryRow[]>
        getCollections(repoId: string): Promise<string[]>
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /d/Coding/Git-Suite && git add electron/preload.ts src/env.d.ts && git commit -m "feat: expose library and extended skill IPC channels in preload and env types"
```

---

## Task 5: Add `LibraryRow` to `src/types/repo.ts`

**Files:**
- Modify: `src/types/repo.ts`

Note: this task must run before the `env.d.ts` TypeScript check in Task 4 can pass — the tasks are ordered so this comes first in git history, and the tsc check below confirms everything compiles together.

- [ ] **Step 1: Append `LibraryRow` to the end of `src/types/repo.ts`**

```typescript
/** Returned by library:getAll — repos INNER JOIN skills. All skill fields are non-null (INNER JOIN guarantee). */
export interface LibraryRow extends RepoRow {
  active: number
  version: string
  generated_at: string
  filename: string
  content: string
  enabled_components: string | null  // JSON string[] | null; null means all enabled
}
```

- [ ] **Step 2: Verify TypeScript compiles (validates Task 4 + Task 5 together)**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /d/Coding/Git-Suite && git add src/types/repo.ts && git commit -m "feat: add LibraryRow type"
```

---

## Task 6: Add `parseComponents` to `src/utils/skillParse.ts`

**Files:**
- Modify: `src/utils/skillParse.ts`
- Test: create `src/utils/skillParse.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/skillParse.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseComponents } from './skillParse'

const SAMPLE = `
## [CORE]
Some core content

#### Form & Input
### Button
Button docs here

### Input
Input docs here

#### Overlay & Feedback
### Dialog
Dialog docs here

## [EXTENDED]
Extended content
`

describe('parseComponents', () => {
  it('extracts component names with their categories', () => {
    const result = parseComponents(SAMPLE)
    expect(result).toEqual([
      { name: 'Button', category: 'Form & Input' },
      { name: 'Input',  category: 'Form & Input' },
      { name: 'Dialog', category: 'Overlay & Feedback' },
    ])
  })

  it('returns empty array when no ### headings exist', () => {
    expect(parseComponents('## [CORE]\nsome content\n## [EXTENDED]\nmore')).toEqual([])
  })

  it('uses "General" as category when no #### heading precedes the first component', () => {
    const content = '## [CORE]\n### Button\ndocs\n'
    expect(parseComponents(content)).toEqual([{ name: 'Button', category: 'General' }])
  })

  it('does not emit ## depth markers as components', () => {
    const result = parseComponents(SAMPLE)
    expect(result.map((c) => c.name)).not.toContain('[CORE]')
    expect(result.map((c) => c.name)).not.toContain('[EXTENDED]')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /d/Coding/Git-Suite && npx vitest run src/utils/skillParse.test.ts
```

Expected: FAIL — `parseComponents` is not exported

- [ ] **Step 3: Add `parseComponents` to `skillParse.ts`**

Append to `src/utils/skillParse.ts`:

```typescript
export interface ComponentEntry { name: string; category: string }

export function parseComponents(content: string): ComponentEntry[] {
  const results: ComponentEntry[] = []
  let currentCategory = 'General'

  for (const line of content.split('\n')) {
    const categoryMatch = line.match(/^####\s+(.+)$/)
    const componentMatch = line.match(/^###\s+(.+)$/)

    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim()
    } else if (componentMatch) {
      results.push({ name: componentMatch[1].trim(), category: currentCategory })
    }
  }

  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /d/Coding/Git-Suite && npx vitest run src/utils/skillParse.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /d/Coding/Git-Suite && git add src/utils/skillParse.ts src/utils/skillParse.test.ts && git commit -m "feat: add parseComponents to skillParse"
```

---

## Task 7: Library view — topbar, list column, and stat pills

**Files:**
- Replace: `src/views/Library.tsx`
- Modify: `src/styles/globals.css`

This task builds the left half of the view. The detail panel is left as a placeholder. The full file will be expanded in Tasks 8–10.

- [ ] **Step 1: Add CSS for the library layout, topbar, stat pills, section headers, and list rows**

Append to `src/styles/globals.css`:

```css
/* ══════════════════════════════════════════════════════════════
   Library view
══════════════════════════════════════════════════════════════ */

.library-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Topbar ── */
.library-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.library-search {
  flex: 1;
  padding: 5px 9px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--t1);
  font-family: inherit;
  font-size: 11px;
  outline: none;
}

.library-search:focus { border-color: var(--border2); }
.library-search::placeholder { color: var(--t3); }

.library-sort-btn {
  padding: 4px 9px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--t3);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.library-sort-btn:hover { color: var(--t2); border-color: var(--border2); }
.library-sort-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: #a78bfa;
}

/* ── Body ── */
.library-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── List column ── */
.library-list-col {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.library-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* ── Stat pills ── */
.library-pills {
  display: flex;
  gap: 4px;
  padding: 8px 8px 4px;
}

.library-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 6px;
}

.library-pill-value {
  font-size: 12px;
  font-weight: 700;
  color: var(--t1);
  line-height: 1;
}

.library-pill-label {
  font-size: 7px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--t3);
}

/* ── Section headers ── */
.library-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 4px;
}

.library-section-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--t3);
  white-space: nowrap;
}

.library-section-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ── List rows ── */
.library-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  margin: 0 4px;
}

.library-row:hover { background: var(--bg3); }
.library-row.selected { background: var(--bg3); border-color: var(--border2); }
.library-row.inactive { opacity: 0.45; }

.library-row-lang {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
}

.library-row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.library-row-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--t1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-row-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}

.library-type-badge {
  font-size: 7px;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid;
}

.library-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.library-active-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Toggle switch ── */
.lib-toggle {
  position: relative;
  width: 24px;
  height: 13px;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 7px;
  border: 1px solid;
  transition: background 0.15s, border-color 0.15s;
}

.lib-toggle.on {
  background: rgba(124, 58, 237, 0.45);
  border-color: var(--accent);
}

.lib-toggle.off {
  background: var(--bg4);
  border-color: var(--border2);
}

.lib-toggle-knob {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}

.lib-toggle.on  .lib-toggle-knob { left: 13px; }
.lib-toggle.off .lib-toggle-knob { left: 2px; }

/* Mini toggle (22×12) for component cards */
.lib-toggle-mini {
  width: 22px;
  height: 12px;
}

.lib-toggle-mini .lib-toggle-knob {
  width: 7px;
  height: 7px;
}

.lib-toggle-mini.on  .lib-toggle-knob { left: 12px; }
.lib-toggle-mini.off .lib-toggle-knob { left: 2px; }
```

- [ ] **Step 2: Write the Library view — list column only, detail panel as placeholder**

Replace `src/views/Library.tsx` with:

```typescript
import { useState, useEffect, useCallback } from 'react'
import BannerSVG, { getLangConfig } from '../components/BannerSVG'
import { parseTopics, type LibraryRow } from '../types/repo'
import { parseSkillDepths, parseComponents, type ComponentEntry } from '../utils/skillParse'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// ── Type badge colours ────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  components: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.2)',    label: 'components' },
  framework:  { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', border: 'rgba(251,191,36,0.18)',   label: 'framework' },
  cli:        { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.18)',    label: 'cli' },
  data:       { bg: 'rgba(59,130,246,0.1)',  color: '#60a5fa', border: 'rgba(59,130,246,0.18)',   label: 'data' },
  lib:        { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af', border: 'rgba(156,163,175,0.18)',  label: 'lib' },
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, mini = false }: { on: boolean; onChange: (v: boolean) => void; mini?: boolean }) {
  return (
    <div
      className={`lib-toggle${mini ? ' lib-toggle-mini' : ''} ${on ? 'on' : 'off'}`}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
    >
      <div className="lib-toggle-knob" />
    </div>
  )
}

// ── List row ──────────────────────────────────────────────────────────────────

function LibraryListRow({
  row, selected, onSelect, onToggle,
}: {
  row: LibraryRow
  selected: boolean
  onSelect: () => void
  onToggle: (active: boolean) => void
}) {
  const lang = row.language ?? ''
  const cfg = getLangConfig(lang, parseTopics(row.topics))
  const badge = row.type ? TYPE_BADGE[row.type] : null

  return (
    <div
      className={`library-row${selected ? ' selected' : ''}${row.active === 0 ? ' inactive' : ''}`}
      onClick={onSelect}
    >
      <div
        className="library-row-lang"
        style={{ background: cfg.bg, color: cfg.primary }}
      >
        {cfg.abbr}
      </div>
      <div className="library-row-info">
        <span className="library-row-name">{row.name}</span>
        {badge && (
          <div className="library-row-badges">
            <span
              className="library-type-badge"
              style={{ background: badge.bg, color: badge.color, borderColor: badge.border }}
            >
              {badge.label}
            </span>
          </div>
        )}
      </div>
      <div className="library-row-right">
        <div
          className="library-active-dot"
          style={{ background: row.active === 1 ? '#34d399' : 'var(--t3)' }}
        />
        <Toggle on={row.active === 1} onChange={onToggle} />
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="library-section-header">
      <span className="library-section-label">{label}</span>
      <div className="library-section-line" />
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function Library() {
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<'active' | 'az' | 'recent'>('active')
  const [selected, setSelected] = useState<LibraryRow | null>(null)
  const [activeTab, setActiveTab] = useState<'components' | 'skill' | 'details'>('components')
  const [componentSearch, setComponentSearch] = useState('')
  const [collections, setCollections] = useState<string[]>([])
  const [regenerating, setRegenerating] = useState(false)

  // Load on mount
  useEffect(() => {
    window.api.library.getAll().then((data) => {
      setRows(data)
      if (data.length > 0) selectRow(data[0])
    })
  }, [])

  function selectRow(row: LibraryRow) {
    setSelected(row)
    setActiveTab(row.type === 'components' ? 'components' : 'skill')
    setComponentSearch('')
    setCollections([])
    window.api.library.getCollections(row.id).then(setCollections)
  }

  function handleToggle(row: LibraryRow, newActive: boolean) {
    const active = newActive ? 1 : 0
    // Optimistic update
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, active } : r))
    setSelected((prev) => prev?.id === row.id ? { ...prev, active } : prev)
    window.api.skill.toggle(row.owner, row.name, active)
  }

  // ── Filtering + sorting ──
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'az') return a.name.localeCompare(b.name)
    if (sort === 'recent') return b.generated_at.localeCompare(a.generated_at)
    // 'active': active first, then by generated_at desc
    if (a.active !== b.active) return b.active - a.active
    return b.generated_at.localeCompare(a.generated_at)
  })

  // ── Grouping ──
  const componentRows = sorted.filter((r) => r.type === 'components')
  const otherRows = sorted.filter((r) => r.type !== 'components')
  const activeRows = otherRows.filter((r) => r.active === 1)
  const inactiveRows = otherRows.filter((r) => r.active === 0)

  return (
    <div className="library-root">
      {/* Topbar */}
      <div className="library-topbar">
        <input
          className="library-search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {(['active', 'az', 'recent'] as const).map((s) => (
          <button
            key={s}
            className={`library-sort-btn${sort === s ? ' active' : ''}`}
            onClick={() => setSort(s)}
          >
            {s === 'active' ? 'Active' : s === 'az' ? 'A–Z' : 'Recent'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="library-body">
        {/* List column */}
        <div className="library-list-col">
          <div className="library-list-scroll">
            {/* Stat pills */}
            <div className="library-pills">
              {[
                { value: rows.length, label: 'Skills' },
                { value: rows.filter((r) => r.active === 1).length, label: 'Active' },
                { value: 0, label: 'Updates' },
              ].map(({ value, label }) => (
                <div key={label} className="library-pill">
                  <span className="library-pill-value">{value}</span>
                  <span className="library-pill-label">{label}</span>
                </div>
              ))}
            </div>

            {/* Component libs section */}
            {componentRows.length > 0 && (
              <>
                <SectionHeader label="Component libs" />
                {componentRows.map((row) => (
                  <LibraryListRow
                    key={row.id}
                    row={row}
                    selected={selected?.id === row.id}
                    onSelect={() => selectRow(row)}
                    onToggle={(v) => handleToggle(row, v)}
                  />
                ))}
              </>
            )}

            {/* Active section */}
            {activeRows.length > 0 && (
              <>
                <SectionHeader label="Active" />
                {activeRows.map((row) => (
                  <LibraryListRow
                    key={row.id}
                    row={row}
                    selected={selected?.id === row.id}
                    onSelect={() => selectRow(row)}
                    onToggle={(v) => handleToggle(row, v)}
                  />
                ))}
              </>
            )}

            {/* Inactive section */}
            {inactiveRows.length > 0 && (
              <>
                <SectionHeader label="Inactive" />
                {inactiveRows.map((row) => (
                  <LibraryListRow
                    key={row.id}
                    row={row}
                    selected={selected?.id === row.id}
                    onSelect={() => selectRow(row)}
                    onToggle={(v) => handleToggle(row, v)}
                  />
                ))}
              </>
            )}

            {rows.length === 0 && (
              <p style={{ padding: '20px 12px', fontSize: 11, color: 'var(--t2)' }}>
                No skills installed yet.
              </p>
            )}
          </div>
        </div>

        {/* Detail panel — placeholder, expanded in Tasks 8–10 */}
        <div className="library-detail-col">
          {selected ? (
            <p style={{ padding: 20, fontSize: 11, color: 'var(--t2)' }}>
              {selected.owner}/{selected.name} selected
            </p>
          ) : (
            <p style={{ padding: 20, fontSize: 11, color: 'var(--t3)' }}>
              Select a skill to view details.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

Also add to `globals.css`:

```css
/* ── Detail column ── */
.library-detail-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 3: Verify the app compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd /d/Coding/Git-Suite && git add src/views/Library.tsx src/styles/globals.css && git commit -m "feat: library view — topbar, list column, stat pills, section grouping"
```

---

## Task 8: Generic detail panel

**Files:**
- Modify: `src/views/Library.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add CSS for generic detail panel**

Append to `src/styles/globals.css`:

```css
/* ── Generic detail panel ── */
.lib-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.lib-detail-lang {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.lib-detail-title-block {
  flex: 1;
  min-width: 0;
}

.lib-detail-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--t1);
}

.lib-detail-owner {
  font-size: 9px;
  color: var(--t3);
  margin-top: 2px;
}

.lib-detail-active-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.lib-detail-active-label {
  font-size: 10px;
  color: var(--t2);
}

.lib-detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Skill file section ── */
.lib-skill-panel {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
}

.lib-skill-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}

.lib-skill-panel-filename {
  font-size: 10px;
  color: var(--t2);
}

.lib-skill-panel-status-ok {
  font-size: 9px;
  color: #34d399;
}

.lib-skill-panel-body {
  padding: 12px;
}

.lib-skill-note {
  font-size: 9px;
  color: var(--t3);
  margin-top: 8px;
}

/* ── Details key-value section ── */
.lib-details-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lib-details-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--t3);
  margin-bottom: 4px;
}

.lib-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.lib-detail-key {
  font-size: 10px;
  color: var(--t2);
  flex-shrink: 0;
}

.lib-detail-val {
  font-size: 10px;
  color: var(--t1);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Action buttons ── */
.lib-actions {
  display: flex;
  gap: 8px;
}

.lib-btn-regen {
  flex: 1;
  padding: 6px 10px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  color: #a78bfa;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.lib-btn-regen:hover:not(:disabled) { background: rgba(124, 58, 237, 0.15); }
.lib-btn-regen:disabled { opacity: 0.5; cursor: default; }

.lib-btn-remove {
  flex: 1;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  color: rgba(239, 68, 68, 0.5);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.lib-btn-remove:hover {
  background: rgba(239, 68, 68, 0.07);
  color: #f87171;
}
```

- [ ] **Step 2: Add `GenericDetail` component and replace detail placeholder in `Library.tsx`**

Add the `GenericDetail` component inside `Library.tsx` before the `Library` default export, and update the detail column in the JSX.

Add after the `SectionHeader` component definition:

```typescript
// ── Skill depth bars (reused from RepoDetail pattern) ────────────────────────

function SkillDepthBars({ content }: { content: string }) {
  const depths = parseSkillDepths(content)
  const total = depths.core + depths.extended + depths.deep || 1
  return (
    <>
      {[
        { label: 'Core',     lines: depths.core,     pct: Math.round((depths.core / total) * 100),                                  color: '#34d399' },
        { label: 'Extended', lines: depths.extended, pct: Math.round(((depths.core + depths.extended) / total) * 100),              color: '#a78bfa' },
        { label: 'Deep',     lines: depths.deep,     pct: 100,                                                                      color: '#7c3aed' },
      ].map((d) => (
        <div key={d.label} className="skill-depth-row">
          <span className="skill-depth-label">{d.label}</span>
          <div className="skill-depth-track">
            <div className="skill-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
          </div>
          <span className="skill-depth-meta">~{d.lines} lines</span>
        </div>
      ))}
    </>
  )
}

// ── Detail KV row ─────────────────────────────────────────────────────────────

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="lib-detail-row">
      <span className="lib-detail-key">{k}</span>
      <span className="lib-detail-val">{v}</span>
    </div>
  )
}

// ── Generic detail panel ──────────────────────────────────────────────────────

function GenericDetail({
  row, collections, onToggle, onRegenerate, onRemove, regenerating,
}: {
  row: LibraryRow
  collections: string[]
  onToggle: (active: boolean) => void
  onRegenerate: () => void
  onRemove: () => void
  regenerating: boolean
}) {
  const lang = row.language ?? ''
  const cfg = getLangConfig(lang, parseTopics(row.topics))
  const skillSizeKb = (row.content.length / 1024).toFixed(1)
  const collectionsStr = collections.length > 0 ? collections.join(', ') : '—'

  return (
    <>
      {/* Header */}
      <div className="lib-detail-header">
        <div className="lib-detail-lang" style={{ background: cfg.bg, color: cfg.primary }}>
          {cfg.abbr}
        </div>
        <div className="lib-detail-title-block">
          <div className="lib-detail-title">{row.name}</div>
          <div className="lib-detail-owner">{row.owner}</div>
        </div>
        <div className="lib-detail-active-row">
          <span className="lib-detail-active-label">Active</span>
          <Toggle on={row.active === 1} onChange={onToggle} />
        </div>
      </div>

      {/* Body */}
      <div className="lib-detail-body">
        {/* Skill file section */}
        <div className="lib-skill-panel">
          <div className="lib-skill-panel-header">
            <span className="lib-skill-panel-filename">{row.name}.skill.md</span>
            <span className="lib-skill-panel-status-ok">✓ current</span>
          </div>
          <div className="lib-skill-panel-body">
            <SkillDepthBars content={row.content} />
            <p className="lib-skill-note">
              Generated from v{row.version} · {daysSince(row.generated_at)}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="lib-details-section">
          <span className="lib-details-label">Details</span>
          <DetailRow k="Saved"          v={formatDate(row.saved_at)} />
          <DetailRow k="Repo version"   v={row.version} />
          <DetailRow k="Skill size"     v={`${skillSizeKb} KB`} />
          <DetailRow k="Language"       v={row.language ?? '—'} />
          <DetailRow k="License"        v={row.license ?? '—'} />
          <DetailRow k="In collections" v={collectionsStr} />
        </div>

        {/* Actions */}
        <div className="lib-actions">
          <button className="lib-btn-regen" onClick={onRegenerate} disabled={regenerating}>
            {regenerating ? '⟳ Regenerating…' : '↺ Regenerate'}
          </button>
          <button className="lib-btn-remove" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </>
  )
}
```

Replace the detail column placeholder inside the `Library` component's JSX:

```tsx
{/* Detail column */}
<div className="library-detail-col">
  {selected ? (
    selected.type === 'components' ? (
      <p style={{ padding: 20, fontSize: 11, color: 'var(--t2)' }}>
        Component panel — coming in Task 9
      </p>
    ) : (
      <GenericDetail
        row={selected}
        collections={collections}
        onToggle={(v) => handleToggle(selected, v)}
        onRegenerate={async () => {
          setRegenerating(true)
          try {
            const result = await window.api.skill.generate(selected.owner, selected.name)
            setRows((prev) => prev.map((r) =>
              r.id === selected.id
                ? { ...r, content: result.content, version: result.version, generated_at: result.generated_at }
                : r
            ))
            setSelected((prev) => prev ? { ...prev, content: result.content, version: result.version, generated_at: result.generated_at } : prev)
          } finally {
            setRegenerating(false)
          }
        }}
        onRemove={async () => {
          await window.api.skill.delete(selected.owner, selected.name)
          setRows((prev) => {
            const next = prev.filter((r) => r.id !== selected.id)
            setSelected(next.length > 0 ? next[0] : null)
            return next
          })
        }}
        regenerating={regenerating}
      />
    )
  ) : (
    <p style={{ padding: 20, fontSize: 11, color: 'var(--t3)' }}>
      Select a skill to view details.
    </p>
  )}
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd /d/Coding/Git-Suite && git add src/views/Library.tsx src/styles/globals.css && git commit -m "feat: library generic detail panel — skill depth bars, metadata, regen/remove"
```

---

## Task 9: Component detail panel — header, tabs, and component grid

**Files:**
- Modify: `src/views/Library.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add CSS for component detail panel**

Append to `src/styles/globals.css`:

```css
/* ── Component detail header ── */
.lib-comp-header {
  padding: 16px 18px 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.lib-comp-header-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.lib-comp-type-pill {
  display: inline-block;
  font-size: 7px;
  padding: 1px 5px;
  border-radius: 2px;
  background: rgba(139,92,246,0.12);
  color: #a78bfa;
  border: 1px solid rgba(139,92,246,0.2);
  margin-bottom: 4px;
}

.lib-comp-count-line {
  font-size: 9px;
  color: var(--t3);
  margin-bottom: 10px;
}

/* ── Tab bar (reuses repo-detail-tab styles) ── */
.lib-comp-tabs {
  display: flex;
  gap: 0;
}

.lib-comp-tab {
  padding: 10px 16px;
  font-size: 11px;
  color: var(--t2);
  border-bottom: 2px solid transparent;
  background: transparent;
  border-top: none;
  border-left: none;
  border-right: none;
  cursor: pointer;
  font-family: inherit;
}

.lib-comp-tab:hover { color: var(--t1); }
.lib-comp-tab.active { color: #a78bfa; border-bottom-color: var(--accent); }

/* ── Components tab ── */
.lib-comp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.lib-comp-search {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--t1);
  font-family: inherit;
  font-size: 10px;
  outline: none;
}

.lib-comp-search:focus { border-color: var(--border2); }
.lib-comp-search::placeholder { color: var(--t3); }

.lib-comp-count-text {
  font-size: 10px;
  color: var(--t2);
  white-space: nowrap;
  flex-shrink: 0;
}

.lib-comp-select-all {
  font-size: 10px;
  color: #a78bfa;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  padding: 0;
}

.lib-comp-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
}

.lib-comp-category-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--t3);
  margin: 8px 0 6px;
}

.lib-comp-category-label:first-child { margin-top: 0; }

.lib-comp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 6px;
}

/* ── Component card ── */
.lib-comp-card {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px 10px;
  cursor: pointer;
}

.lib-comp-card.active {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.lib-comp-card.inactive { opacity: 0.38; }

.lib-comp-card-name {
  flex: 1;
  font-size: 10px;
  color: var(--t1);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-comp-preview {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Component footer bar ── */
.lib-comp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.lib-comp-footer-note {
  font-size: 9px;
  color: var(--t3);
}

.lib-comp-rebuild-btn {
  padding: 5px 10px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  color: #a78bfa;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.lib-comp-rebuild-btn:hover:not(:disabled) { background: rgba(124, 58, 237, 0.15); }
.lib-comp-rebuild-btn:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 2: Add component preview renderer and `ComponentDetail` inside `Library.tsx`**

Add before the `Library` default export:

```typescript
// ── Component preview ─────────────────────────────────────────────────────────

function ComponentPreview({ name }: { name: string }) {
  const n = name.toLowerCase()
  if (n === 'button') return (
    <button style={{ background: '#e8e8f0', color: '#0a0a0e', fontFamily: 'inherit', fontSize: 8, padding: '3px 8px', borderRadius: 3, border: 'none', cursor: 'default' }}>Button</button>
  )
  if (n === 'input') return (
    <div style={{ background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 3, padding: '3px 6px', fontSize: 8, color: 'var(--t3)', width: 60 }}>Input</div>
  )
  if (n === 'select') return (
    <div style={{ background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 3, padding: '3px 6px', fontSize: 8, color: 'var(--t3)', width: 60, display: 'flex', justifyContent: 'space-between' }}>Select <span>▾</span></div>
  )
  if (n === 'badge') return (
    <div style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid var(--accent-border)', borderRadius: 20, padding: '2px 7px', fontSize: 8, color: '#a78bfa' }}>Badge</div>
  )
  if (n === 'switch') return (
    <div style={{ width: 24, height: 13, background: 'rgba(124,58,237,0.45)', border: '1px solid var(--accent)', borderRadius: 7, position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 13, width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
    </div>
  )
  if (n === 'checkbox') return (
    <div style={{ width: 11, height: 11, background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#fff', fontSize: 7, lineHeight: 1 }}>✓</span>
    </div>
  )
  if (n === 'slider') return (
    <div style={{ width: 60, height: 4, background: 'var(--border2)', borderRadius: 2, position: 'relative' }}>
      <div style={{ width: '60%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '58%', width: 8, height: 8, borderRadius: '50%', background: '#fff', border: '1px solid var(--border2)' }} />
    </div>
  )
  if (n === 'tooltip') return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '2px 6px', fontSize: 8, color: 'var(--t2)' }}>Tooltip</div>
  )
  if (n === 'dialog') return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 4, padding: '4px 8px', fontSize: 8, color: 'var(--t2)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>Dialog</div>
  )
  if (n === 'progress') return (
    <div style={{ width: 60, height: 5, background: 'var(--border2)', borderRadius: 3 }}>
      <div style={{ width: '65%', height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
    </div>
  )
  if (n === 'tabs') return (
    <div style={{ display: 'flex', gap: 4 }}>
      <div style={{ fontSize: 8, color: '#a78bfa', borderBottom: '1px solid var(--accent)', paddingBottom: 1 }}>Tab1</div>
      <div style={{ fontSize: 8, color: 'var(--t3)' }}>Tab2</div>
    </div>
  )
  if (n === 'avatar') return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#a78bfa' }}>AB</div>
  )
  if (n === 'card') return (
    <div style={{ background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', fontSize: 8, color: 'var(--t2)' }}>Card</div>
  )
  if (n === 'separator') return (
    <div style={{ width: 60, height: 1, background: 'var(--border2)' }} />
  )
  return <span style={{ fontSize: 8, color: 'var(--t3)' }}>{name}</span>
}

// ── Component detail panel ────────────────────────────────────────────────────

function ComponentDetail({
  row, collections, activeTab, onTabChange, componentSearch, onComponentSearchChange,
  onToggleComponent, onSelectAll, onRebuild, onToggleActive, regenerating,
}: {
  row: LibraryRow
  collections: string[]
  activeTab: 'components' | 'skill' | 'details'
  onTabChange: (t: 'components' | 'skill' | 'details') => void
  componentSearch: string
  onComponentSearchChange: (v: string) => void
  onToggleComponent: (name: string) => void
  onSelectAll: () => void
  onRebuild: () => void
  onToggleActive: (v: boolean) => void
  regenerating: boolean
}) {
  const lang = row.language ?? ''
  const cfg = getLangConfig(lang, parseTopics(row.topics))
  const allComponents: ComponentEntry[] = parseComponents(row.content)
  const enabledNames: string[] | null = row.enabled_components
    ? (() => { try { return JSON.parse(row.enabled_components) as string[] } catch { return null } })()
    : null
  const enabledSet = enabledNames ? new Set(enabledNames) : null
  const isEnabled = (name: string) => enabledSet === null ? true : enabledSet.has(name)
  const enabledCount = enabledSet === null ? allComponents.length : enabledNames!.length
  const totalCount = allComponents.length
  const skillSizeKb = (row.content.length / 1024).toFixed(1)
  const collectionsStr = collections.length > 0 ? collections.join(', ') : '—'
  const skillLineCount = row.content.split('\n').length

  // Group by category
  const categories = Array.from(new Set(allComponents.map((c) => c.category)))
  const filtered = allComponents.filter((c) =>
    c.name.toLowerCase().includes(componentSearch.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="lib-comp-header">
        <div className="lib-comp-header-top">
          <div className="lib-detail-lang" style={{ background: cfg.bg, color: cfg.primary }}>
            {cfg.abbr}
          </div>
          <div className="lib-detail-title-block">
            <div className="lib-detail-title">{row.name}</div>
            <div className="lib-detail-owner">{row.owner}</div>
          </div>
          <div className="lib-detail-active-row">
            <span className="lib-detail-active-label">Active</span>
            <Toggle on={row.active === 1} onChange={onToggleActive} />
          </div>
        </div>
        <span className="lib-comp-type-pill">component library</span>
        <p className="lib-comp-count-line">
          {enabledCount} of {totalCount} enabled · skill file {skillLineCount} lines
        </p>
        <div className="lib-comp-tabs">
          {(['components', 'skill', 'details'] as const).map((t) => (
            <button
              key={t}
              className={`lib-comp-tab${activeTab === t ? ' active' : ''}`}
              onClick={() => onTabChange(t)}
            >
              {t === 'components' ? 'Components' : t === 'skill' ? 'Skill file' : 'Details'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'components' && (
        <>
          <div className="lib-comp-toolbar">
            <input
              className="lib-comp-search"
              placeholder="Search components…"
              value={componentSearch}
              onChange={(e) => onComponentSearchChange(e.target.value)}
            />
            <span className="lib-comp-count-text">{enabledCount} / {totalCount}</span>
            <button className="lib-comp-select-all" onClick={onSelectAll}>Select all</button>
          </div>

          <div className="lib-comp-body">
            {categories.map((cat) => {
              const catComps = filtered.filter((c) => c.category === cat)
              if (catComps.length === 0) return null
              return (
                <div key={cat}>
                  <div className="lib-comp-category-label">{cat}</div>
                  <div className="lib-comp-grid">
                    {catComps.map((comp) => {
                      const on = isEnabled(comp.name)
                      return (
                        <div
                          key={comp.name}
                          className={`lib-comp-card ${on ? 'active' : 'inactive'}`}
                          onClick={() => onToggleComponent(comp.name)}
                        >
                          <span className="lib-comp-card-name">{comp.name}</span>
                          <div className="lib-comp-preview">
                            <ComponentPreview name={comp.name} />
                          </div>
                          <Toggle on={on} onChange={() => onToggleComponent(comp.name)} mini />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {allComponents.length === 0 && (
              <p style={{ fontSize: 10, color: 'var(--t2)', padding: '8px 0' }}>
                No components found in skill file.
              </p>
            )}
          </div>

          <div className="lib-comp-footer">
            <span className="lib-comp-footer-note">Skill file reflects enabled components</span>
            <button className="lib-comp-rebuild-btn" onClick={onRebuild} disabled={regenerating}>
              {regenerating ? '⟳ Rebuilding…' : '↺ Rebuild skill'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'skill' && (
        <div className="lib-detail-body">
          <div className="lib-skill-panel">
            <div className="lib-skill-panel-header">
              <span className="lib-skill-panel-filename">{row.name}.skill.md</span>
              <span className="lib-skill-panel-status-ok">✓ current</span>
            </div>
            <div className="lib-skill-panel-body">
              <SkillDepthBars content={row.content} />
              <p className="lib-skill-note">
                Generated from v{row.version} · {daysSince(row.generated_at)}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'details' && (
        <div className="lib-detail-body">
          <div className="lib-details-section">
            <span className="lib-details-label">Details</span>
            <DetailRow k="Saved"          v={formatDate(row.saved_at)} />
            <DetailRow k="Repo version"   v={row.version} />
            <DetailRow k="Skill size"     v={`${skillSizeKb} KB`} />
            <DetailRow k="Language"       v={row.language ?? '—'} />
            <DetailRow k="License"        v={row.license ?? '—'} />
            <DetailRow k="In collections" v={collectionsStr} />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update the detail column in `Library` JSX to use `ComponentDetail`**

Replace the component panel placeholder in the detail column:

```tsx
selected.type === 'components' ? (
  <ComponentDetail
    row={selected}
    collections={collections}
    activeTab={activeTab}
    onTabChange={setActiveTab}
    componentSearch={componentSearch}
    onComponentSearchChange={setComponentSearch}
    onToggleComponent={(name) => {
      const allComponents = parseComponents(selected.content)
      const enabledNames: string[] | null = selected.enabled_components
        ? (() => { try { return JSON.parse(selected.enabled_components) as string[] } catch { return null } })()
        : null
      const currentSet = enabledNames ? new Set(enabledNames) : new Set(allComponents.map((c) => c.name))
      if (currentSet.has(name)) currentSet.delete(name)
      else currentSet.add(name)
      const newEnabled = Array.from(currentSet)
      // Optimistic update
      setRows((prev) => prev.map((r) => r.id === selected.id ? { ...r, enabled_components: JSON.stringify(newEnabled) } : r))
      setSelected((prev) => prev ? { ...prev, enabled_components: JSON.stringify(newEnabled) } : prev)
      window.api.skill.setEnabledComponents(selected.owner, selected.name, newEnabled)
    }}
    onSelectAll={() => {
      const allComponents = parseComponents(selected.content)
      const newEnabled = allComponents.map((c) => c.name)
      // Store as explicit full list (not null) so state and DB stay in sync.
      // null-means-all is only the initial state for newly installed skills.
      const newJson = JSON.stringify(newEnabled)
      setRows((prev) => prev.map((r) => r.id === selected.id ? { ...r, enabled_components: newJson } : r))
      setSelected((prev) => prev ? { ...prev, enabled_components: newJson } : prev)
      window.api.skill.setEnabledComponents(selected.owner, selected.name, newEnabled)
    }}
    onRebuild={async () => {
      const allComponents = parseComponents(selected.content)
      const enabledNames: string[] | null = selected.enabled_components
        ? (() => { try { return JSON.parse(selected.enabled_components) as string[] } catch { return null } })()
        : null
      const enabledList = enabledNames ?? allComponents.map((c) => c.name)
      setRegenerating(true)
      try {
        const result = await window.api.skill.generate(selected.owner, selected.name, { enabledComponents: enabledList })
        setRows((prev) => prev.map((r) =>
          r.id === selected.id
            ? { ...r, content: result.content, generated_at: result.generated_at }
            : r
        ))
        setSelected((prev) => prev ? { ...prev, content: result.content, generated_at: result.generated_at } : prev)
      } finally {
        setRegenerating(false)
      }
    }}
    onToggleActive={(v) => handleToggle(selected, v)}
    regenerating={regenerating}
  />
) : (
  // ... existing GenericDetail
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /d/Coding/Git-Suite && git add src/views/Library.tsx src/styles/globals.css && git commit -m "feat: component detail panel with component grid, previews, and rebuild"
```

---

## Task 10: Final wiring and run all tests

**Files:**
- No new files

- [ ] **Step 1: Run the full test suite**

```bash
cd /d/Coding/Git-Suite && npx vitest run
```

Expected: all tests pass (skill-gen tests + skillParse tests + any existing tests)

- [ ] **Step 2: Final TypeScript check**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit any lint/type fixes if needed, then final commit**

```bash
cd /d/Coding/Git-Suite && git add -A && git commit -m "feat: Phase 5 My Library — complete"
```

---

## Deliverable Checklist

- [ ] My Library shows all installed repos in grouped sections (Component libs / Active / Inactive)
- [ ] Toggling a skill on/off in the list updates SQLite and reflects immediately
- [ ] Clicking a row shows the correct detail panel (generic vs component)
- [ ] Generic repos show skill file panel with depth bars, metadata, regenerate/remove buttons
- [ ] Regenerate updates the skill file panel with new content and line counts
- [ ] Remove deletes from SQLite + disk, selects next row
- [ ] Repos with type = 'components' show the component browser
- [ ] Component grid shows self-referential previews
- [ ] Toggling components updates `enabled_components` in SQLite
- [ ] Rebuild skill regenerates with only enabled components
- [ ] Component type detection runs at install time in `skill:generate`
- [ ] `skill:generate` returns `generated_at` in its response
