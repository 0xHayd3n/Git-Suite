# Phase 4 — Skill Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Anthropic API key entry, Claude Haiku skill generation pipeline, install button state machine, and skill file panel across the app.

**Architecture:** A new pure-function module (`electron/skill-gen.ts`) calls the Anthropic SDK; five new IPC handlers in `main.ts` orchestrate it with file I/O and SQLite; the renderer gains a Settings view, a three-state Install button on every repo card and sidebar, and a live skill file panel in RepoDetail.

**Tech Stack:** `@anthropic-ai/sdk`, `electron-store` (encrypted), `better-sqlite3`, React + vitest + `@testing-library/react`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `electron/skill-gen.ts` | Pure async function: `SkillGenInput + apiKey → markdown` |
| Modify | `electron/store.ts` | Add second encrypted `electron-store` for Anthropic key |
| Modify | `electron/main.ts` | Add `settings:getApiKey`, `settings:setApiKey`, `skill:generate`, `skill:get`, `skill:delete` IPC handlers |
| Modify | `electron/preload.ts` | Bridge the 5 new IPC channels |
| Create | `src/views/Settings.tsx` | `/settings` route — API key input only |
| Modify | `src/App.tsx` | Add `/settings` route |
| Modify | `src/components/Sidebar.tsx` | Gear icon nav item → `/settings` |
| Modify | `src/views/Discover.tsx` | Replace Save button with Install state machine |
| Modify | `src/views/RepoDetail.tsx` | Replace Save button with Install state machine; live skill panel + skill tab |
| Modify | `src/types/repo.ts` | Add `SkillRow` interface |
| Modify | `src/env.d.ts` | Add new `window.api` types for settings key + skill namespace |
| Modify | `src/styles/globals.css` | Add Install button states + error text + Settings view styles |
| Modify | `src/App.test.tsx` | Add `getApiKey`, `setApiKey`, `skill` stubs to `makeApi()` |
| Create | `electron/skill-gen.test.ts` | Tests for `generateSkill` function |
| Create | `src/views/Settings.test.tsx` | Tests for Settings view |
| Create | `src/views/Discover.test.tsx` | Tests for RepoCard install states |
| Create | `src/utils/skillParse.ts` | Exported `parseSkillDepths` utility (shared by RepoDetail + tests) |
| Create | `src/views/RepoDetail.test.tsx` | Tests for `parseSkillDepths` + install state |

---

## Task 1: Install @anthropic-ai/sdk

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Verify it appears in dependencies**

Open `package.json` and confirm `"@anthropic-ai/sdk"` is in `"dependencies"` (not devDependencies — the main process needs it at runtime).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @anthropic-ai/sdk dependency"
```

---

## Task 2: Types — SkillRow, window.api additions, test mock

**Files:**
- Modify: `src/types/repo.ts`
- Modify: `src/env.d.ts`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add `SkillRow` to `src/types/repo.ts`**

Append after the existing `ReleaseRow` interface:

```typescript
/** Mirrors the `skills` SQLite table schema. */
export interface SkillRow {
  repo_id: string
  filename: string
  content: string
  version: string
  generated_at: string
  active: number
  enabled_components: string | null
}
```

- [ ] **Step 2: Extend `src/env.d.ts` with new API types**

The file currently ends with the `settings` block. Replace the entire `settings` block and add the `skill` namespace:

```typescript
import type { RepoRow, ReleaseRow, SkillRow } from './types/repo'

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
        get(key: string): Promise<string | null>
        set(key: string, value: string): Promise<void>
        getApiKey(): Promise<string | null>
        setApiKey(key: string): Promise<void>
      }
      skill: {
        generate(owner: string, name: string): Promise<{ content: string; version: string }>
        get(owner: string, name: string): Promise<SkillRow | null>
        delete(owner: string, name: string): Promise<void>
      }
    }
  }
}
```

- [ ] **Step 3: Update `src/App.test.tsx` — add new stubs to `makeApi()`**

Extend the `makeApi()` function so it satisfies the new `window.api` type:

```typescript
function makeApi(overrides: Partial<typeof window.api> = {}) {
  return {
    windowControls: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
    github: {
      connect: vi.fn(), exchange: vi.fn(),
      getUser: vi.fn(), getStarred: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(), onCallback: vi.fn(), offCallback: vi.fn(),
      getSavedRepos: vi.fn().mockResolvedValue([]),
      saveRepo: vi.fn().mockResolvedValue(undefined),
      searchRepos: vi.fn().mockResolvedValue([]),
      getRepo: vi.fn().mockResolvedValue(null),
      getReadme: vi.fn().mockResolvedValue(null),
      getReleases: vi.fn().mockResolvedValue([]),
      getRelatedRepos: vi.fn().mockResolvedValue([]),
    },
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      getApiKey: vi.fn().mockResolvedValue(null),
      setApiKey: vi.fn().mockResolvedValue(undefined),
    },
    skill: {
      generate: vi.fn().mockResolvedValue({ content: '', version: 'unknown' }),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }
}
```

- [ ] **Step 4: Run existing tests — must all pass**

```bash
npx vitest run src/App.test.tsx
```

Expected: 5 tests pass. If TypeScript errors appear, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/types/repo.ts src/env.d.ts src/App.test.tsx
git commit -m "feat: add SkillRow type and extend window.api with settings key + skill namespace"
```

---

## Task 3: API key encrypted store + IPC handlers

**Files:**
- Modify: `electron/store.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Extend `electron/store.ts` with a second encrypted store**

Append to the end of the file (after the existing `clearGitHubUser` function):

```typescript
// ── Anthropic API key store (encrypted) ─────────────────────────
interface ApiStoreSchema {
  'anthropic.apiKey'?: string
}

// Static encryptionKey = AES-256-cbc obfuscation at rest.
const apiStore = new Store<ApiStoreSchema>({ encryptionKey: 'git-suite-api-key-v1' })

export function getApiKey(): string | undefined {
  return apiStore.get('anthropic.apiKey')
}

export function setApiKey(key: string): void {
  apiStore.set('anthropic.apiKey', key)
}
```

- [ ] **Step 2: Update the import in `electron/main.ts`**

The current import on line 5 is:
```typescript
import { getToken, setToken, clearToken, setGitHubUser, clearGitHubUser } from './store'
```

Change it to:
```typescript
import { getToken, setToken, clearToken, setGitHubUser, clearGitHubUser, getApiKey, setApiKey } from './store'
```

- [ ] **Step 3: Add the two settings IPC handlers to `electron/main.ts`**

Append the following block directly after the existing `settings:set` handler (around line 331), before the `// ── App lifecycle` comment:

```typescript
ipcMain.handle('settings:getApiKey', async () => getApiKey() ?? null)
ipcMain.handle('settings:setApiKey', async (_, key: string) => setApiKey(key))
```

- [ ] **Step 4: Update `electron/preload.ts` — extend the `settings` bridge**

The current `settings` block in `preload.ts` is:
```typescript
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },
```

Replace it with:
```typescript
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getApiKey: () => ipcRenderer.invoke('settings:getApiKey'),
    setApiKey: (key: string) => ipcRenderer.invoke('settings:setApiKey', key),
  },
```

- [ ] **Step 5: Run tests — must all pass**

```bash
npx vitest run src/App.test.tsx
```

Expected: 5 tests pass (no regression).

- [ ] **Step 6: Commit**

```bash
git add electron/store.ts electron/main.ts electron/preload.ts
git commit -m "feat: encrypted API key store with settings:getApiKey/setApiKey IPC"
```

---

## Task 4: Skill generator — electron/skill-gen.ts

**Files:**
- Create: `electron/skill-gen.ts`
- Create: `electron/skill-gen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/skill-gen.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Declare module-level mock handle BEFORE vi.mock (vi.mock is hoisted).
// This lets us inspect calls in tests without re-creating instances.
const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

// Imports must come after vi.mock declarations
import { generateSkill } from './skill-gen'
import Anthropic from '@anthropic-ai/sdk'

const SUCCESS_RESPONSE = {
  content: [{ type: 'text', text: '## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz' }],
}

describe('generateSkill', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(SUCCESS_RESPONSE)
  })

  it('instantiates Anthropic with the provided apiKey', async () => {
    await generateSkill({
      owner: 'vercel', name: 'next.js', language: 'TypeScript',
      topics: ['react', 'ssr'], readme: '# Next.js', version: 'v14.0.0',
    }, 'sk-ant-test-key')

    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test-key' })
  })

  it('returns the text content from the API response', async () => {
    const result = await generateSkill({
      owner: 'vercel', name: 'next.js', language: 'TypeScript',
      topics: [], readme: '', version: 'unknown',
    }, 'sk-ant-key')

    expect(result).toContain('## [CORE]')
  })

  it('truncates README to 12000 characters in the prompt', async () => {
    const longReadme = 'x'.repeat(20000)
    await generateSkill({
      owner: 'test', name: 'repo', language: 'Go',
      topics: [], readme: longReadme, version: 'unknown',
    }, 'sk-ant-key')

    // mockCreate was called once; inspect the message content
    const call = mockCreate.mock.calls[0][0]
    const promptContent: string = call.messages[0].content
    expect(promptContent.includes('x'.repeat(12001))).toBe(false)
    expect(promptContent.includes('x'.repeat(11999))).toBe(true)
  })

  it('returns empty string when API response has no text block', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'image' }] })
    const result = await generateSkill({
      owner: 'a', name: 'b', language: '', topics: [], readme: '', version: 'unknown',
    }, 'sk-ant-key')
    expect(result).toBe('')
  })
})
```

- [ ] **Step 2: Run the test — expect failure (module not found)**

```bash
npx vitest run electron/skill-gen.test.ts
```

Expected: FAIL — `Cannot find module './skill-gen'`

- [ ] **Step 3: Create `electron/skill-gen.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

export interface SkillGenInput {
  owner: string
  name: string
  language: string
  topics: string[]
  readme: string       // raw markdown, may be empty string
  version: string      // from latest release tag, or 'unknown'
}

export async function generateSkill(input: SkillGenInput, apiKey: string): Promise<string> {
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
- Start immediately with the first section marker — no preamble`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run electron/skill-gen.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen.ts electron/skill-gen.test.ts
git commit -m "feat: skill generator — generateSkill calls Claude Haiku"
```

---

## Task 5: Skill CRUD IPC handlers + preload bridge

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add imports to `electron/main.ts`**

At the top of `main.ts`, `fs` from Node's built-in `fs/promises` is needed. Add it to the existing imports:

```typescript
import fs from 'fs/promises'
```

Also add the skill-gen import:

```typescript
import { generateSkill } from './skill-gen'
```

`SkillGenInput` is not needed as a named import — TypeScript infers the argument type from the function signature. The existing imports already include `path` and `app` so no change needed there.

- [ ] **Step 2: Add the three skill IPC handlers to `electron/main.ts`**

Append after the `settings:setApiKey` handler (inserted in Task 3), still before `// ── App lifecycle`:

```typescript
// ── Skill IPC ────────────────────────────────────────────────────
ipcMain.handle('skill:generate', async (_, owner: string, name: string) => {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Anthropic API key set')

  const token = getToken() ?? null
  const db = getDb(app.getPath('userData'))
  const readme = await getReadme(token, owner, name) ?? ''
  const releases = await getReleases(token, owner, name)
  const version = releases[0]?.tag_name ?? 'unknown'

  // repos.id is the numeric GitHub ID (e.g. "12345678") — look up by owner+name.
  // skills.repo_id REFERENCES repos(id) so we MUST use the numeric id as FK value.
  const repo = db.prepare('SELECT id, language, topics FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { id: string; language: string | null; topics: string | null } | undefined
  if (!repo) throw new Error(`Repo ${owner}/${name} not found in database`)
  const language = repo.language ?? ''
  const topics: string[] = (() => { try { return JSON.parse(repo.topics ?? '[]') } catch { return [] } })()

  const content = await generateSkill({ owner, name, language, topics, readme, version }, apiKey)

  // Save to disk
  const dir = path.join(app.getPath('userData'), 'skills', owner)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${name}.skill.md`), content, 'utf8')

  // Upsert to SQLite — use numeric repo.id to satisfy the FK constraint
  db.prepare(`
    INSERT OR REPLACE INTO skills (repo_id, filename, content, version, generated_at, active, enabled_components)
    VALUES (?, ?, ?, ?, ?, 1, NULL)
  `).run(repo.id, `${name}.skill.md`, content, version, new Date().toISOString())

  return { content, version }
})

ipcMain.handle('skill:get', async (_, owner: string, name: string) => {
  const db = getDb(app.getPath('userData'))
  // JOIN to resolve owner/name → numeric repos.id for the FK lookup
  return db.prepare(`
    SELECT s.* FROM skills s
    JOIN repos r ON s.repo_id = r.id
    WHERE r.owner = ? AND r.name = ?
  `).get(owner, name) ?? null
})

ipcMain.handle('skill:delete', async (_, owner: string, name: string) => {
  const db = getDb(app.getPath('userData'))
  db.prepare(`
    DELETE FROM skills WHERE repo_id = (
      SELECT id FROM repos WHERE owner = ? AND name = ?
    )
  `).run(owner, name)
  const filePath = path.join(app.getPath('userData'), 'skills', owner, `${name}.skill.md`)
  await fs.unlink(filePath).catch(() => {}) // ignore if file doesn't exist
  // Note: does NOT clear repos.saved_at — unsave flow is deferred to Phase 5
})
```

- [ ] **Step 3: Update `electron/preload.ts` — add skill bridge**

After the `settings` block (closing `},`) and before the final `})`, add:

```typescript
  skill: {
    generate: (owner: string, name: string) => ipcRenderer.invoke('skill:generate', owner, name),
    get:      (owner: string, name: string) => ipcRenderer.invoke('skill:get', owner, name),
    delete:   (owner: string, name: string) => ipcRenderer.invoke('skill:delete', owner, name),
  },
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all existing tests pass. There are no new unit tests for these handlers (they require a running Electron process) — correctness will be verified during manual smoke testing in the final task.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat: skill:generate/get/delete IPC handlers + preload bridge"
```

---

## Task 6: Settings view + route + sidebar nav

**Files:**
- Create: `src/views/Settings.tsx`
- Create: `src/views/Settings.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Write the failing tests**

Create `src/views/Settings.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Settings from './Settings'

function setup(apiKey: string | null = null) {
  Object.defineProperty(window, 'api', {
    value: {
      settings: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        getApiKey: vi.fn().mockResolvedValue(apiKey),
        setApiKey: vi.fn().mockResolvedValue(undefined),
      },
    },
    writable: true,
    configurable: true,
  })
  return render(<MemoryRouter><Settings /></MemoryRouter>)
}

describe('Settings', () => {
  it('renders the API key section heading', () => {
    setup()
    expect(screen.getByText('ANTHROPIC API KEY')).toBeInTheDocument()
  })

  it('pre-fills input when a key already exists', async () => {
    setup('sk-ant-existing-key')
    await waitFor(() => {
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement
        || screen.getByDisplayValue('sk-ant-existing-key')
      expect(input).toBeInTheDocument()
    })
  })

  it('calls setApiKey with current input value on Update click', async () => {
    setup()
    const input = screen.getByPlaceholderText(/sk-ant/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'sk-ant-new-key' } })
    fireEvent.click(screen.getByRole('button', { name: /update/i }))
    await waitFor(() => {
      expect(window.api.settings.setApiKey).toHaveBeenCalledWith('sk-ant-new-key')
    })
  })

  it('shows "Saved" confirmation after Update click', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /update/i }))
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run the tests — expect failure (module not found)**

```bash
npx vitest run src/views/Settings.test.tsx
```

Expected: FAIL — `Cannot find module './Settings'`

- [ ] **Step 3: Create `src/views/Settings.tsx`**

```typescript
import { useState, useEffect } from 'react'

export default function Settings() {
  const [apiKey, setApiKeyLocal] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getApiKey().then((key) => {
      if (key) setApiKeyLocal(key)
    }).catch(() => {})
  }, [])

  const handleUpdate = async () => {
    await window.api.settings.setApiKey(apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="settings-view">
      <div className="settings-section">
        <span className="settings-section-label">ANTHROPIC API KEY</span>
        <div className="settings-key-row">
          <input
            type="password"
            className="settings-key-input"
            placeholder="sk-ant-…"
            value={apiKey}
            onChange={(e) => { setApiKeyLocal(e.target.value); setSaved(false) }}
          />
          <button className="settings-update-btn" onClick={handleUpdate}>
            {saved ? 'Saved' : 'Update'}
          </button>
        </div>
        <p className="settings-key-hint">
          Used to generate skill files with Claude Haiku. Your key is stored encrypted
          locally and never leaves your machine.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/views/Settings.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Add `/settings` route to `src/App.tsx`**

Add the import alongside the other view imports:
```typescript
import Settings from './views/Settings'
```

Add the route inside the `<Routes>` block, after the `/onboarding` route:
```tsx
<Route path="/settings" element={<Settings />} />
```

- [ ] **Step 6: Add Settings gear icon to `src/components/Sidebar.tsx`**

Add a `SettingsIcon` component alongside the other inline SVG icons at the top of the file:

```typescript
function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M2.8 11.2l1.1-1.1M10.1 3.9l1.1-1.1"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
```

Then, inside the `Sidebar` component, add the Settings button in the `sidebar-status` section. The current markup is:

```tsx
<div className="sidebar-status">
  <span className={`status-dot${githubUsername ? ' active' : ' inactive'}`} />
  <span className="status-text">
    {githubUsername ? `${githubUsername} — connected` : 'GitHub — not connected'}
  </span>
</div>
```

Replace it with:

```tsx
<div className="sidebar-bottom">
  <button
    className={`nav-item${location.pathname === '/settings' ? ' active' : ''}`}
    onClick={() => navigate('/settings')}
  >
    <SettingsIcon />
    Settings
  </button>
  <div className="sidebar-status">
    <span className={`status-dot${githubUsername ? ' active' : ' inactive'}`} />
    <span className="status-text">
      {githubUsername ? `${githubUsername} — connected` : 'GitHub — not connected'}
    </span>
  </div>
</div>
```

- [ ] **Step 7: Add CSS for Settings view and sidebar-bottom to `src/styles/globals.css`**

Append to the end of `globals.css`:

```css
/* ── Settings view ── */
.settings-view {
  padding: 24px 28px;
  max-width: 520px;
}

.settings-section {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
}

.settings-section-label {
  display: block;
  font-size: 10px;
  color: var(--t2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.settings-key-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.settings-key-input {
  flex: 1;
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 4px;
  color: var(--t1);
  font-family: inherit;
  font-size: 11px;
  padding: 7px 10px;
  outline: none;
}

.settings-key-input:focus {
  border-color: var(--accent-border);
}

.settings-update-btn {
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  color: #a78bfa;
  font-size: 11px;
  padding: 7px 14px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}

.settings-update-btn:hover {
  background: rgba(124, 58, 237, 0.18);
}

.settings-key-hint {
  font-size: 10px;
  color: var(--t2);
  line-height: 1.5;
}

/* ── Sidebar bottom ── */
.sidebar-bottom {
  margin-top: auto;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
```

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/views/Settings.tsx src/views/Settings.test.tsx src/App.tsx src/components/Sidebar.tsx src/styles/globals.css
git commit -m "feat: Settings view with API key entry + sidebar gear icon nav"
```

---

## Task 7: Install state machine — Discover cards

**Files:**
- Create: `src/views/Discover.test.tsx`
- Modify: `src/views/Discover.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Write the failing tests**

Create `src/views/Discover.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SavedReposProvider } from '../contexts/SavedRepos'
import Discover from './Discover'
import type { RepoRow } from '../types/repo'

const MOCK_REPO: RepoRow = {
  id: '1', owner: 'facebook', name: 'react',
  description: 'A JS library', language: 'JavaScript',
  topics: '["ui","javascript"]', stars: 200000, forks: 40000,
  license: 'MIT', homepage: null, updated_at: '2024-01-01T00:00:00Z',
  saved_at: null, type: null, banner_svg: null, discovered_at: null,
  discover_query: null, watchers: 200000, size: 50000, open_issues: 500,
}

function setup(overrides: Partial<typeof window.api> = {}) {
  Object.defineProperty(window, 'api', {
    value: {
      github: {
        searchRepos: vi.fn().mockResolvedValue([MOCK_REPO]),
        getSavedRepos: vi.fn().mockResolvedValue([]),
        saveRepo: vi.fn().mockResolvedValue(undefined),
      },
      settings: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        getApiKey: vi.fn().mockResolvedValue('sk-ant-test'),
        setApiKey: vi.fn().mockResolvedValue(undefined),
      },
      skill: {
        generate: vi.fn().mockResolvedValue({ content: '## [CORE]\nfoo', version: 'v1' }),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      ...overrides,
    },
    writable: true, configurable: true,
  })
  return render(
    <MemoryRouter>
      <SavedReposProvider>
        <Discover />
      </SavedReposProvider>
    </MemoryRouter>
  )
}

describe('Discover RepoCard install state', () => {
  it('shows "+ Install" when skill not installed', async () => {
    setup()
    await waitFor(() => screen.getByText('react'))
    expect(screen.getByText('+ Install')).toBeInTheDocument()
  })

  it('shows "✓ Installed" when skill row exists on mount', async () => {
    setup({
      skill: {
        generate: vi.fn(),
        get: vi.fn().mockResolvedValue({
          repo_id: 'facebook/react', filename: 'react.skill.md',
          content: '## [CORE]\nfoo', version: 'v1',
          generated_at: '2024-01-01', active: 1, enabled_components: null,
        }),
        delete: vi.fn(),
      },
    } as Partial<typeof window.api>)
    await waitFor(() => screen.getByText('✓ Installed'))
    expect(screen.getByText('✓ Installed')).toBeInTheDocument()
  })

  it('transitions to "⟳ Generating..." immediately on click', async () => {
    // skill.generate never resolves, so we stay in GENERATING
    setup({
      skill: {
        generate: vi.fn().mockReturnValue(new Promise(() => {})),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
    } as Partial<typeof window.api>)
    await waitFor(() => screen.getByText('react'))
    fireEvent.click(screen.getByText('+ Install'))
    await waitFor(() => screen.getByText('⟳ Generating...'))
  })

  it('shows no-key message and does not generate when apiKey is null', async () => {
    const mockGenerate = vi.fn()
    setup({
      settings: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        getApiKey: vi.fn().mockResolvedValue(null),
        setApiKey: vi.fn(),
      },
      skill: {
        generate: mockGenerate,
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
    } as Partial<typeof window.api>)
    await waitFor(() => screen.getByText('react'))
    fireEvent.click(screen.getByText('+ Install'))
    await waitFor(() => screen.getByText(/Add an API key/))
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('shows error and reverts to "+ Install" on generation failure', async () => {
    setup({
      skill: {
        generate: vi.fn().mockRejectedValue(new Error('API error')),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
    } as Partial<typeof window.api>)
    await waitFor(() => screen.getByText('react'))
    fireEvent.click(screen.getByText('+ Install'))
    await waitFor(() => screen.getByText('Generation failed — try again'))
    expect(screen.getByText('+ Install')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
npx vitest run src/views/Discover.test.tsx
```

Expected: FAIL (old Save button found, not Install).

- [ ] **Step 3: Update `src/views/Discover.tsx` — replace RepoCard**

Replace the entire `RepoCard` component (lines 31–78) with the new version:

```typescript
type InstallState = 'UNINSTALLED' | 'GENERATING' | 'INSTALLED'

function RepoCard({ repo, onNavigate }: { repo: RepoRow; onNavigate: (path: string) => void }) {
  const { saveRepo } = useSavedRepos()
  const navigate = useNavigate()
  const topics = parseTopics(repo.topics)
  const cfg = getLangConfig(repo.language ?? '', topics)

  const [installState, setInstallState] = useState<InstallState>('UNINSTALLED')
  const [installError, setInstallError] = useState<'no-key' | 'failed' | null>(null)

  // On mount: check if skill already installed
  useEffect(() => {
    window.api.skill.get(repo.owner, repo.name)
      .then((row) => { if (row) setInstallState('INSTALLED') })
      .catch(() => {})
  }, [repo.owner, repo.name])

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const apiKey = await window.api.settings.getApiKey()
    if (!apiKey) {
      setInstallError('no-key')
      return
    }
    setInstallState('GENERATING')
    setInstallError(null)
    try {
      await saveRepo(repo.owner, repo.name)
      await window.api.skill.generate(repo.owner, repo.name)
      setInstallState('INSTALLED')
    } catch {
      setInstallState('UNINSTALLED')
      setInstallError('failed')
    }
  }

  return (
    <div className="repo-card" onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}>
      <div className="repo-card-banner">
        <BannerSVG owner={repo.owner} name={repo.name} language={repo.language ?? ''} topics={topics} size="card" />
        <div
          className="repo-card-lang-badge"
          style={{ background: `${cfg.primary}33`, color: cfg.primary }}
        >
          {cfg.abbr}
        </div>
      </div>
      <div className="repo-card-body">
        <div className="repo-card-title-row">
          <span className="repo-card-name">{repo.name}</span>
          <span className="repo-card-owner">{repo.owner}</span>
        </div>
        {repo.description && <p className="repo-card-desc">{repo.description}</p>}
        {topics.length > 0 && (
          <div className="repo-card-tags">
            {topics.slice(0, 3).map((t) => <span key={t} className="repo-card-tag">{t}</span>)}
          </div>
        )}
        <div className="repo-card-footer">
          <span className="repo-card-stars">
            <StarIcon /> {formatStars(repo.stars)}
          </span>
          <button
            className={`install-btn${installState === 'GENERATING' ? ' generating' : installState === 'INSTALLED' ? ' installed' : ''}`}
            onClick={handleInstall}
            disabled={installState === 'GENERATING' || installState === 'INSTALLED'}
          >
            {installState === 'UNINSTALLED' && '+ Install'}
            {installState === 'GENERATING' && '⟳ Generating...'}
            {installState === 'INSTALLED' && '✓ Installed'}
          </button>
        </div>
        {installError === 'no-key' && (
          <p className="install-error" onClick={(e) => e.stopPropagation()}>
            Add an API key in{' '}
            <button className="install-error-link" onClick={(e) => { e.stopPropagation(); navigate('/settings') }}>
              Settings
            </button>{' '}
            to install skills.
          </p>
        )}
        {installError === 'failed' && (
          <p className="install-error">Generation failed — try again</p>
        )}
      </div>
    </div>
  )
}
```

The `isSaved` import from `useSavedRepos` is no longer used in RepoCard — remove it from the destructure: `const { saveRepo } = useSavedRepos()`.

- [ ] **Step 4: Add install button CSS to `src/styles/globals.css`**

Append to the end of `globals.css`:

```css
/* ── Install button (Discover cards) ── */
.install-btn {
  background: transparent;
  border: 1px solid var(--accent-border);
  color: #a78bfa;
  border-radius: 3px;
  font-size: 9px;
  padding: 3px 8px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}

.install-btn:hover:not(:disabled) {
  background: var(--accent-soft);
}

.install-btn.generating {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.25);
  color: #f59e0b;
  cursor: default;
}

.install-btn.installed {
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.2);
  color: #34d399;
  cursor: default;
}

.install-error {
  font-size: 9px;
  color: #f87171;
  margin-top: 4px;
  line-height: 1.4;
}

.install-error-link {
  color: #a78bfa;
  text-decoration: underline;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}
```

- [ ] **Step 5: Run the tests — expect pass**

```bash
npx vitest run src/views/Discover.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/Discover.tsx src/views/Discover.test.tsx src/styles/globals.css
git commit -m "feat: install state machine on Discover repo cards"
```

---

## Task 8: Install state machine + skill panel + skill tab — RepoDetail

**Files:**
- Create: `src/views/RepoDetail.test.tsx`
- Modify: `src/views/RepoDetail.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Create `src/utils/skillParse.ts`**

This exports `parseSkillDepths` so both `RepoDetail.tsx` and tests can import the same implementation:

```typescript
export function parseSkillDepths(content: string): { core: number; extended: number; deep: number } {
  const coreMatch  = content.match(/## \[CORE\]([\s\S]*?)(?=## \[EXTENDED\]|$)/)
  const extMatch   = content.match(/## \[EXTENDED\]([\s\S]*?)(?=## \[DEEP\]|$)/)
  const deepMatch  = content.match(/## \[DEEP\]([\s\S]*?)$/)
  return {
    core:     coreMatch  ? coreMatch[1].trim().split('\n').length  : 0,
    extended: extMatch   ? extMatch[1].trim().split('\n').length   : 0,
    deep:     deepMatch  ? deepMatch[1].trim().split('\n').length  : 0,
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/views/RepoDetail.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SavedReposProvider } from '../contexts/SavedRepos'
import RepoDetail from './RepoDetail'
import { parseSkillDepths } from '../utils/skillParse'
import type { RepoRow } from '../types/repo'

// ── parseSkillDepths unit tests ───────────────────────────────────
describe('parseSkillDepths', () => {
  it('counts lines in each section', () => {
    const content = `## [CORE]\nline1\nline2\n## [EXTENDED]\nlineA\n## [DEEP]\nlineX\nlineY\nlineZ`
    const result = parseSkillDepths(content)
    expect(result.core).toBe(2)
    expect(result.extended).toBe(1)
    expect(result.deep).toBe(3)
  })

  it('returns zeros when sections are missing', () => {
    expect(parseSkillDepths('no sections here')).toEqual({ core: 0, extended: 0, deep: 0 })
  })

  it('trims leading/trailing newlines before counting', () => {
    const content = `## [CORE]\n\nline1\n\n## [EXTENDED]\nlineA\n## [DEEP]\nlineX`
    expect(parseSkillDepths(content).core).toBe(1)
  })
})

// ── RepoDetail install state tests ───────────────────────────────
const MOCK_REPO: RepoRow = {
  id: '1', owner: 'vercel', name: 'next.js',
  description: 'React framework', language: 'TypeScript',
  topics: '["react","ssr"]', stars: 100000, forks: 20000,
  license: 'MIT', homepage: null, updated_at: '2024-01-01T00:00:00Z',
  saved_at: null, type: null, banner_svg: null, discovered_at: null,
  discover_query: null, watchers: 100000, size: 20000, open_issues: 200,
}

// generateFn allows individual tests to control skill.generate behaviour
function setupDetail(
  skillRow: object | null = null,
  apiKey: string | null = 'sk-ant-test',
  generateFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
    content: '## [CORE]\ninstall: npm i\n## [EXTENDED]\nextra\n## [DEEP]\ndeep',
    version: 'v14.0',
  }),
) {
  Object.defineProperty(window, 'api', {
    value: {
      github: {
        getRepo: vi.fn().mockResolvedValue(MOCK_REPO),
        getReleases: vi.fn().mockResolvedValue([{ tag_name: 'v14.0', name: 'v14', published_at: '2024-01-01', body: null }]),
        getRelatedRepos: vi.fn().mockResolvedValue([]),
        getReadme: vi.fn().mockResolvedValue(null),
        getSavedRepos: vi.fn().mockResolvedValue([]),
        saveRepo: vi.fn().mockResolvedValue(undefined),
      },
      settings: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        getApiKey: vi.fn().mockResolvedValue(apiKey),
        setApiKey: vi.fn(),
      },
      skill: {
        generate: generateFn,
        get: vi.fn().mockResolvedValue(skillRow),
        delete: vi.fn(),
      },
    },
    writable: true, configurable: true,
  })
  return render(
    <MemoryRouter initialEntries={['/repo/vercel/next.js']}>
      <SavedReposProvider>
        <Routes>
          <Route path="/repo/:owner/:name" element={<RepoDetail />} />
        </Routes>
      </SavedReposProvider>
    </MemoryRouter>
  )
}

describe('RepoDetail install button', () => {
  it('shows "+ Install" when skill not installed', async () => {
    setupDetail(null)
    await waitFor(() => screen.getByText('next.js'))
    expect(screen.getByText('+ Install')).toBeInTheDocument()
  })

  it('shows "✓ Installed" when skill row exists on mount', async () => {
    setupDetail({
      repo_id: '12345', filename: 'next.js.skill.md',
      content: '## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz',
      version: 'v14.0', generated_at: '2024-01-01', active: 1, enabled_components: null,
    })
    await waitFor(() => screen.getByText('✓ Installed'))
  })

  it('transitions to generating on click', async () => {
    // Pass a never-resolving generate fn so the button stays in GENERATING state
    const neverResolves = vi.fn().mockReturnValue(new Promise(() => {}))
    setupDetail(null, 'sk-ant-test', neverResolves)
    await waitFor(() => screen.getByText('next.js'))
    fireEvent.click(screen.getByText('+ Install'))
    await waitFor(() => screen.getByText('⟳ Generating...'))
  })
})

describe('RepoDetail skill tab', () => {
  it('shows skill content in Skill file tab when installed', async () => {
    const content = '## [CORE]\ninstall: npm i next\n## [EXTENDED]\nextra\n## [DEEP]\ndeep'
    setupDetail({
      repo_id: '12345', filename: 'next.js.skill.md',
      content, version: 'v14.0', generated_at: '2024-01-01', active: 1, enabled_components: null,
    })
    await waitFor(() => screen.getByText('✓ Installed'))
    fireEvent.click(screen.getByText('Skill file'))
    await waitFor(() => screen.getByText(/install: npm i next/))
  })
})
```

- [ ] **Step 3: Run the tests — expect failure**

```bash
npx vitest run src/views/RepoDetail.test.tsx
```

Expected: `parseSkillDepths` tests fail (`Cannot find module '../utils/skillParse'`); RepoDetail install tests also fail (old Save button). Both will be fixed in the next steps.

- [ ] **Step 4: Update `src/views/RepoDetail.tsx`**

This is the largest change. Replace the full file content with the updated version below. Key changes:
1. Add `InstallState` type and `parseSkillDepths` function
2. Add `installState`, `installError`, `skillContent` state
3. On mount: call `skill.get()` to initialise state
4. Replace the Save button with the Install state machine
5. Populate skill panel with real data
6. Populate skill file tab with highlighted content

Full updated file:

```typescript
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BannerSVG, { getLangConfig } from '../components/BannerSVG'
import { useSavedRepos } from '../contexts/SavedRepos'
import { parseTopics, formatStars, type RepoRow, type ReleaseRow, type SkillRow } from '../types/repo'
import { parseSkillDepths } from '../utils/skillParse'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatSize(kb: number | null): string {
  if (kb == null) return '—'
  return `${kb.toLocaleString()} KB`
}

// ── Skill utilities ───────────────────────────────────────────────
type InstallState = 'UNINSTALLED' | 'GENERATING' | 'INSTALLED'

// ── Skill file tab renderer ───────────────────────────────────────
const SECTION_COLORS: Record<string, string> = {
  '## [CORE]':     '#34d399',
  '## [EXTENDED]': '#a78bfa',
  '## [DEEP]':     '#7c3aed',
}

function SkillFileContent({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <pre className="skill-file-pre">
      {lines.map((line, i) => {
        const color = SECTION_COLORS[line.trim()]
        return (
          <span key={i} style={color ? { color, fontWeight: 600 } : undefined}>
            {line}{'\n'}
          </span>
        )
      })}
    </pre>
  )
}

// ── Tab IDs ───────────────────────────────────────────────────────
type Tab = 'readme' | 'skill' | 'releases' | 'collections'
const TABS: { id: Tab; label: string }[] = [
  { id: 'readme',      label: 'README' },
  { id: 'skill',       label: 'Skill file' },
  { id: 'releases',    label: 'Releases' },
  { id: 'collections', label: 'Collections' },
]

export default function RepoDetail() {
  const { owner, name } = useParams<{ owner: string; name: string }>()
  const navigate = useNavigate()
  const { saveRepo } = useSavedRepos()

  const [repo, setRepo] = useState<RepoRow | null>(null)
  const [repoError, setRepoError] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('readme')

  const [readme, setReadme] = useState<string | null | 'loading' | 'error'>('loading')
  const [readmeFetched, setReadmeFetched] = useState(false)
  const [releases, setReleases] = useState<ReleaseRow[] | 'loading' | 'error'>('loading')
  const [related, setRelated] = useState<RepoRow[]>([])

  // Install state
  const [installState, setInstallState] = useState<InstallState>('UNINSTALLED')
  const [installError, setInstallError] = useState<'no-key' | 'failed' | null>(null)
  const [skillRow, setSkillRow] = useState<SkillRow | null>(null)

  // Fetch repo metadata + releases + initial skill state on mount
  useEffect(() => {
    if (!owner || !name) return

    window.api.github.getRepo(owner, name)
      .then((row) => {
        setRepo(row)
        window.api.github.getRelatedRepos(owner, name, row.topics ?? '[]')
          .then(setRelated)
          .catch(() => {})
      })
      .catch(() => setRepoError(true))

    window.api.github.getReleases(owner, name)
      .then((r) => setReleases(r))
      .catch(() => setReleases('error'))

    // Check if skill already installed
    window.api.skill.get(owner, name)
      .then((row) => {
        if (row) {
          setSkillRow(row)
          setInstallState('INSTALLED')
        }
      })
      .catch(() => {})
  }, [owner, name])

  // Lazy README fetch
  useEffect(() => {
    if (activeTab !== 'readme' || readmeFetched || !owner || !name) return
    setReadmeFetched(true)
    window.api.github.getReadme(owner, name)
      .then((md) => setReadme(md))
      .catch(() => setReadme('error'))
  }, [activeTab, readmeFetched, owner, name])

  const handleInstall = async () => {
    const apiKey = await window.api.settings.getApiKey()
    if (!apiKey) {
      setInstallError('no-key')
      return
    }
    setInstallState('GENERATING')
    setInstallError(null)
    try {
      await saveRepo(owner ?? '', name ?? '')
      await window.api.skill.generate(owner ?? '', name ?? '')
      const freshRow = await window.api.skill.get(owner ?? '', name ?? '')
      setSkillRow(freshRow)
      setInstallState('INSTALLED')
    } catch {
      setInstallState('UNINSTALLED')
      setInstallError('failed')
    }
  }

  const topics = parseTopics(repo?.topics ?? null)
  const cfg = getLangConfig(repo?.language ?? '', topics)

  const version = typeof releases === 'object' && Array.isArray(releases) && releases.length > 0
    ? releases[0].tag_name
    : '—'

  const langSegment = repo === null && !repoError ? '…' : (repo?.language ?? null)

  // Skill panel data
  const skillDepths = skillRow ? parseSkillDepths(skillRow.content) : null
  const depthTotal = skillDepths ? skillDepths.core + skillDepths.extended + skillDepths.deep : 1

  return (
    <div className="repo-detail">
      {/* Breadcrumb */}
      <div className="repo-detail-breadcrumb">
        <button className="repo-detail-breadcrumb-link" onClick={() => navigate(-1)}>Discover</button>
        {langSegment && (
          <>
            <span className="repo-detail-breadcrumb-sep">›</span>
            <button className="repo-detail-breadcrumb-link" onClick={() => navigate('/discover')}>
              {langSegment}
            </button>
          </>
        )}
        <span className="repo-detail-breadcrumb-sep">›</span>
        <span className="repo-detail-breadcrumb-current">{name}</span>
      </div>

      {/* Banner */}
      <div className="repo-detail-banner">
        <BannerSVG
          owner={owner ?? ''} name={name ?? ''}
          language={repo?.language ?? ''} topics={topics} size="detail"
        />
        <div className="repo-detail-banner-overlay">
          <div
            className="repo-detail-lang-badge-lg"
            style={{ background: `${cfg.primary}33`, color: cfg.primary }}
          >
            {cfg.abbr}
          </div>
          <div className="repo-detail-banner-title">
            <span className="repo-detail-banner-name">{name}</span>
            <span className="repo-detail-banner-owner">{owner}</span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {repo && !repoError && (
        <div className="repo-detail-stats-bar">
          <span><span className="repo-detail-stat-value">{formatStars(repo.stars)}</span> stars</span>
          <span className="repo-detail-stat-sep">·</span>
          <span><span className="repo-detail-stat-value">{formatStars(repo.forks)}</span> forks</span>
          <span className="repo-detail-stat-sep">·</span>
          <span><span className="repo-detail-stat-value">{formatStars(repo.open_issues)}</span> issues</span>
          <span className="repo-detail-stat-sep">·</span>
          <span>Version <span className="repo-detail-stat-value">{version}</span></span>
          <span className="repo-detail-stat-sep">·</span>
          <span>Updated <span className="repo-detail-stat-value">{formatDate(repo.updated_at)}</span></span>
        </div>
      )}

      {/* Body */}
      <div className="repo-detail-body">
        {/* Main column */}
        <div className="repo-detail-main">
          {repoError ? (
            <div style={{ padding: 20, fontSize: 11, color: 'var(--t2)' }}>
              Could not load repo — check your connection.
            </div>
          ) : (
            <>
              <div className="repo-detail-tabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`repo-detail-tab${activeTab === t.id ? ' active' : ''}`}
                    onClick={() => setActiveTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="repo-detail-tab-body">
                {activeTab === 'readme' && (
                  readme === 'loading' ? (
                    <p className="repo-detail-placeholder">Loading README…</p>
                  ) : readme === 'error' ? (
                    <p className="repo-detail-placeholder">Failed to load README.</p>
                  ) : readme === null ? (
                    <p className="repo-detail-placeholder">No README available.</p>
                  ) : (
                    <div className="repo-md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
                    </div>
                  )
                )}

                {activeTab === 'skill' && (
                  skillRow ? (
                    <SkillFileContent content={skillRow.content} />
                  ) : (
                    <p className="repo-detail-placeholder">Install this repo to generate a skill file.</p>
                  )
                )}

                {activeTab === 'releases' && (
                  releases === 'loading' ? (
                    <p className="repo-detail-placeholder">Loading releases…</p>
                  ) : releases === 'error' ? (
                    <p className="repo-detail-placeholder">Failed to load releases.</p>
                  ) : (releases as ReleaseRow[]).length === 0 ? (
                    <p className="repo-detail-placeholder">No releases found.</p>
                  ) : (
                    <div className="repo-releases">
                      {(releases as ReleaseRow[]).map((r) => (
                        <div key={r.tag_name} className="repo-release-item">
                          <div className="repo-release-header">
                            <span className="repo-release-tag">{r.tag_name}</span>
                            {r.name && <span className="repo-release-name">{r.name}</span>}
                            <span className="repo-release-date">{formatDate(r.published_at)}</span>
                          </div>
                          {r.body && (
                            <p className="repo-release-body">
                              {r.body.slice(0, 200)}{r.body.length > 200 ? '…' : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {activeTab === 'collections' && (
                  <p className="repo-detail-placeholder">Not in any collections.</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="repo-detail-sidebar">
          {/* Install button */}
          {!repoError && (
            <div>
              <button
                className={`install-btn-full${installState === 'GENERATING' ? ' generating' : installState === 'INSTALLED' ? ' installed' : ''}`}
                onClick={handleInstall}
                disabled={installState === 'GENERATING' || installState === 'INSTALLED'}
              >
                {installState === 'UNINSTALLED' && '+ Install'}
                {installState === 'GENERATING' && '⟳ Generating...'}
                {installState === 'INSTALLED' && '✓ Installed'}
              </button>
              {installError === 'no-key' && (
                <p className="install-error">
                  Add an API key in{' '}
                  <button className="install-error-link" onClick={() => navigate('/settings')}>
                    Settings
                  </button>{' '}
                  to install skills.
                </p>
              )}
              {installError === 'failed' && (
                <p className="install-error">Generation failed — try again</p>
              )}
            </div>
          )}

          {/* Skill panel */}
          <div className="skill-panel">
            <div className="skill-panel-header">
              <span className="skill-panel-filename">{name}.skill.md</span>
              <span className="skill-panel-status">
                {installState === 'INSTALLED' ? `v${skillRow?.version ?? ''}` : '— not installed'}
              </span>
            </div>
            <div className="skill-panel-body">
              {skillDepths ? (
                <>
                  {[
                    { label: 'Core',     lines: skillDepths.core,     pct: Math.round((skillDepths.core / depthTotal) * 100),                              color: '#34d399' },
                    { label: 'Extended', lines: skillDepths.extended, pct: Math.round(((skillDepths.core + skillDepths.extended) / depthTotal) * 100),     color: '#a78bfa' },
                    { label: 'Deep',     lines: skillDepths.deep,     pct: 100,                                                                            color: '#7c3aed' },
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
              ) : (
                <>
                  {[
                    { label: 'Core',     meta: '~80 lines',  pct: 30,  color: '#34d399' },
                    { label: 'Extended', meta: '~200 lines', pct: 60,  color: '#a78bfa' },
                    { label: 'Deep',     meta: '~420 lines', pct: 100, color: '#7c3aed' },
                  ].map((d) => (
                    <div key={d.label} className="skill-depth-row">
                      <span className="skill-depth-label">{d.label}</span>
                      <div className="skill-depth-track">
                        <div className="skill-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
                      </div>
                      <span className="skill-depth-meta">{d.meta}</span>
                    </div>
                  ))}
                </>
              )}
              <p className="skill-panel-note">Models read as far as context allows.</p>
            </div>
          </div>

          {/* Repository metadata */}
          {repo && (
            <div className="repo-meta-section">
              <span className="repo-meta-label">Repository</span>
              {[
                { k: 'License',        v: repo.license ?? '—' },
                { k: 'Language',       v: repo.language ?? '—' },
                { k: 'Size',           v: formatSize(repo.size) },
                { k: 'Watchers',       v: repo.watchers?.toLocaleString() ?? '—' },
                { k: 'Contributors',   v: '—' },
                { k: 'In collections', v: '—' },
              ].map(({ k, v }) => (
                <div key={k} className="repo-meta-row">
                  <span className="repo-meta-key">{k}</span>
                  <span className="repo-meta-val">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Related repos */}
          {related.length > 0 && (
            <div className="related-repos-section">
              <span className="repo-meta-label">Related</span>
              {related.map((r) => (
                <div
                  key={`${r.owner}/${r.name}`}
                  className="related-repo-card"
                  onClick={() => navigate(`/repo/${r.owner}/${r.name}`)}
                >
                  <span className="related-repo-name">{r.name}</span>
                  {r.description && <p className="related-repo-desc">{r.description}</p>}
                  <span className="related-repo-stars">★ {formatStars(r.stars)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add CSS for install-btn-full and skill-file-pre to `src/styles/globals.css`**

Append to the end of `globals.css`:

```css
/* ── Install button (full width, RepoDetail sidebar) ── */
.install-btn-full {
  width: 100%;
  padding: 10px;
  font-size: 11px;
  background: transparent;
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  color: #a78bfa;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 6px;
}

.install-btn-full:hover:not(:disabled) {
  background: var(--accent-soft);
}

.install-btn-full.generating {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.25);
  color: #f59e0b;
  cursor: default;
}

.install-btn-full.installed {
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.2);
  color: #34d399;
  cursor: default;
}

/* ── Skill file tab content ── */
.skill-file-pre {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1.6;
  color: var(--t2);
  white-space: pre-wrap;
  word-break: break-word;
  padding: 16px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 4px;
  margin: 0;
  overflow-y: auto;
  max-height: 600px;
}
```

- [ ] **Step 6: Run the failing tests — expect pass**

```bash
npx vitest run src/views/RepoDetail.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests pass (no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/utils/skillParse.ts src/views/RepoDetail.tsx src/views/RepoDetail.test.tsx src/styles/globals.css
git commit -m "feat: install state machine + live skill panel + skill tab in RepoDetail"
```

---

## Final verification

After all tasks are complete, run the full test suite one more time and start the app:

```bash
npm test
npm run dev
```

Manual smoke test:
1. Navigate to `/settings` — API key section renders, Update saves and shows "Saved"
2. Go to Discover — cards show `+ Install`; clicking without API key shows the no-key inline message
3. Set a real Anthropic API key in Settings
4. Click `+ Install` on a repo card — button goes amber immediately, then green after ~2–5s
5. Open the repo's detail page — button shows `✓ Installed`, skill panel shows real line counts, Skill file tab shows highlighted markdown
6. The Settings gear icon appears in the sidebar bottom; clicking it navigates to `/settings`
