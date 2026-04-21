# Components Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Components tab to the repo detail page that renders a Git Suite-branded Storybook component explorer — split panel with a scrollable component list on the left and a sandboxed story iframe on the right — shown only when a publicly accessible Storybook instance is detected.

**Architecture:** Detection runs in the Electron main process (where cross-origin HTTP fetch is unrestricted) via a new `storybook:detect` IPC handler backed by a testable `electron/storybookDetector.ts` utility; the result is cached in a new `storybook_url` column on the `repos` table. Index parsing happens in a pure utility (`storybookParser.ts`) called by a second handler (`storybook:getIndex`). The UI is extracted into `StorybookExplorer.tsx` and wired into the existing `RepoDetail.tsx` tab system using the same visibility pattern as the `releases` tab.

**Tech Stack:** TypeScript, React 18, Electron IPC, better-sqlite3, Vitest

---

## Architecture Decisions

### Tab Visibility Strategy

The `releases` tab remains in `visibleTabs` while `releases === 'loading'` (so the user doesn't watch the tab appear mid-load). The Components tab follows the same pattern:

- `storybookState === 'detecting'` → tab is visible (shows loading skeleton)
- `storybookState` is an object with a `url` field → tab is visible (fully functional)
- `storybookState === null` → tab is hidden (detection complete, not found)

This means the tab appears immediately on every repo load, then disappears if detection fails (~1–2 s). This is acceptable; the existing `releases` tab already does this.

### Detection Candidate URLs

Run in the **main process** only (renderer cannot do cross-origin fetch freely). Tried in order:

1. `repo.homepage` — the repo's declared website (from GitHub API, stored in `repos.homepage`)
2. `https://{owner}.github.io/{name}/` — canonical GitHub Pages location for a user/org repo
3. `https://{owner}.github.io/` — for repos named `{owner}.github.io` (the org root page)

For each candidate URL, probe two paths:
- `{candidate}/index.json` — Storybook 7+ (CSF3, `v: 4` or `v: 5`)
- `{candidate}/stories.json` — Storybook 6.x (CSF2, `v: 3`)

A 200 response with parseable JSON is a confirmed hit. The `storybook_url` stored is the **base candidate** (not the probe path); the index path is derived at render time.

**README scanning is a secondary trigger.** When the README loads in RepoDetail, if `storybookState` is still `null`, extract any `https://…storybook…` or `https://…chromatic…` links and re-run `storybook:detect` with those candidates as overrides. This catches repos with custom Storybook domains.

### Caching Schema

New column on `repos` table:
- `storybook_url TEXT` — `NULL` = never detected OR checked and not found, `{URL}` = confirmed base URL

No expiry timestamp for v1 — a found Storybook URL is unlikely to move. Because transient network failures are indistinguishable from "repo truly has no Storybook", detection does **not** persist a negative result — `NULL` always means "try again next time". Only a confirmed URL is written to the database.

### Index Parsing

Both Storybook index formats are handled by `storybookParser.ts`:

**v4 (`index.json`, Storybook 7+):**
```json
{
  "v": 4,
  "entries": {
    "button--primary": { "type": "story", "name": "Primary", "title": "Button", "id": "button--primary" },
    "button--secondary": { "type": "story", "name": "Secondary", "title": "Button" }
  }
}
```

**v3 (`stories.json`, Storybook 6):**
```json
{
  "v": 3,
  "stories": {
    "button--primary": { "name": "Primary", "kind": "Button", "story": "Primary" }
  }
}
```

Parsing produces `StorybookComponent[]` where each component groups its stories and exposes a `defaultStoryId` (first story, or whichever story is named `Primary` or `Default`).

Component name is taken from the last path segment of `title`/`kind` (e.g., `"Forms/TextField"` → `"TextField"`). Group is the preceding segments joined with ` / `. Only entries with `type === 'story'` (v4) or no `type` field (v3) are included; `type: 'docs'` entries are skipped.

### Variant Display

Variants (stories) for the selected component expand **inline below the component row** in the left panel — a collapsible sub-list. This keeps the right panel area clean for the iframe and avoids a dropdown that would overlap the preview.

### Iframe

```
{storybookUrl}/iframe.html?id={storyId}&viewMode=story
```

Storybook's `/iframe.html` endpoint renders a single story in isolation — no Storybook chrome. It is the standard way to embed individual stories.

Sandbox attributes: `sandbox="allow-scripts allow-same-origin"`. This lets the story scripts run and access their own origin's APIs (needed by most component libraries), while preventing the iframe from navigating the top-level window, opening popups, or accessing Electron internals.

The iframe background is set to `transparent` via CSS, with the host container using `var(--bg2)` so unthemed components don't flash a white background against the dark shell.

### CSS Modifier for Full-Bleed Tab

The `.repo-detail-tab-body` class applies `padding: 20px 22px` and `overflow-y: auto` to all tabs. The Components tab needs `padding: 0` and `overflow: hidden` so the split panel can manage its own independent scroll areas. A modifier class `.repo-detail-tab-body--full-bleed` is added in `globals.css` and applied conditionally in RepoDetail.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `src/utils/storybookParser.ts` | Parse Storybook index.json / stories.json into `StorybookComponent[]` |
| **Create** | `src/utils/storybookParser.test.ts` | Unit tests for the parser |
| **Create** | `electron/storybookDetector.ts` | Pure async utility: probe candidate URLs, return confirmed base URL or null |
| **Create** | `electron/storybookDetector.test.ts` | Unit tests for the detector (fetch mocked via Vitest) |
| **Create** | `src/components/StorybookExplorer.tsx` | Split-panel Components tab UI (left list + right iframe) |
| **Modify** | `electron/db.ts` | Add Phase 14 migration: `repos.storybook_url TEXT` |
| **Modify** | `electron/main.ts` | Add `storybook:detect` and `storybook:getIndex` IPC handlers (call `storybookDetector`) |
| **Modify** | `electron/preload.ts` | Add `storybook` namespace to `window.api` |
| **Modify** | `src/views/RepoDetail.tsx` | Add `components` tab type, state, detection trigger, README re-scan trigger, visibility rule, render `StorybookExplorer` |
| **Modify** | `src/styles/globals.css` | Add `.repo-detail-tab-body--full-bleed` modifier + Components tab panel styles |

---

## Task 1: `storybookParser.ts` utility + tests

**Files:**
- Create: `src/utils/storybookParser.ts`
- Create: `src/utils/storybookParser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/utils/storybookParser.test.ts
import { describe, it, expect } from 'vitest'
import { parseStorybookIndex } from './storybookParser'

const V4_INDEX = {
  v: 4,
  entries: {
    'button--primary':   { type: 'story', id: 'button--primary',   name: 'Primary',   title: 'Button' },
    'button--secondary': { type: 'story', id: 'button--secondary', name: 'Secondary', title: 'Button' },
    'button--docs':      { type: 'docs',  id: 'button--docs',      name: 'Docs',      title: 'Button' },
    'card--default':     { type: 'story', id: 'card--default',      name: 'Default',   title: 'Card' },
    'textfield--empty':  { type: 'story', id: 'textfield--empty',  name: 'Empty',     title: 'Forms/TextField' },
  },
}

const V3_STORIES = {
  v: 3,
  stories: {
    'button--primary':   { name: 'Primary',   kind: 'Button',          story: 'Primary'   },
    'button--secondary': { name: 'Secondary', kind: 'Button',          story: 'Secondary' },
    'card--default':     { name: 'Default',   kind: 'Card',            story: 'Default'   },
    'textfield--empty':  { name: 'Empty',     kind: 'Forms/TextField', story: 'Empty'     },
  },
}

describe('parseStorybookIndex — v4', () => {
  it('groups stories by component title', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const names = result.map(c => c.name)
    expect(names).toContain('Button')
    expect(names).toContain('Card')
    expect(names).toContain('TextField')
  })

  it('extracts the last path segment as component name', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const tf = result.find(c => c.name === 'TextField')
    expect(tf).toBeDefined()
    expect(tf!.group).toBe('Forms')
  })

  it('skips docs entries', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const btn = result.find(c => c.name === 'Button')!
    expect(btn.stories.every(s => s.name !== 'Docs')).toBe(true)
  })

  it('sets defaultStoryId to a story named Primary if present', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const btn = result.find(c => c.name === 'Button')!
    expect(btn.defaultStoryId).toBe('button--primary')
  })

  it('sets defaultStoryId to first story when no Primary/Default', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const tf = result.find(c => c.name === 'TextField')!
    expect(tf.defaultStoryId).toBe('textfield--empty')
  })

  it('sets group to null for top-level components', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const btn = result.find(c => c.name === 'Button')!
    expect(btn.group).toBeNull()
  })

  it('returns components sorted alphabetically by name', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const names = result.map(c => c.name)
    expect(names).toEqual([...names].sort())
  })
})

describe('parseStorybookIndex — v3', () => {
  it('parses v3 stories.json format', () => {
    const result = parseStorybookIndex(V3_STORIES)
    const names = result.map(c => c.name)
    expect(names).toContain('Button')
    expect(names).toContain('Card')
    expect(names).toContain('TextField')
  })

  it('reads kind field as component title in v3', () => {
    const result = parseStorybookIndex(V3_STORIES)
    const tf = result.find(c => c.name === 'TextField')!
    expect(tf.group).toBe('Forms')
  })
})

describe('parseStorybookIndex — edge cases', () => {
  it('returns empty array for empty entries', () => {
    expect(parseStorybookIndex({ v: 4, entries: {} })).toEqual([])
  })

  it('returns empty array for unrecognised format', () => {
    expect(parseStorybookIndex({ v: 99 })).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- storybookParser
```

Expected: `parseStorybookIndex is not a function` / module not found

- [ ] **Step 3: Implement `storybookParser.ts`**

```typescript
// src/utils/storybookParser.ts

export interface StorybookStory {
  id: string       // e.g. "button--primary"
  name: string     // e.g. "Primary"
}

export interface StorybookComponent {
  name: string          // last segment of title path, e.g. "TextField"
  group: string | null  // preceding segments joined with " / ", e.g. "Forms"
  stories: StorybookStory[]
  defaultStoryId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStorybookIndex(raw: any): StorybookComponent[] {
  // Normalise both v3 and v4 into a flat list of { id, name, title } story objects
  const stories: { id: string; name: string; title: string }[] = []

  if (raw?.v >= 4 && raw.entries) {
    for (const [id, entry] of Object.entries(raw.entries as Record<string, any>)) {
      if (entry.type === 'docs') continue
      if (entry.type && entry.type !== 'story') continue
      stories.push({ id, name: entry.name ?? id, title: entry.title ?? '' })
    }
  } else if (raw?.v === 3 && raw.stories) {
    for (const [id, entry] of Object.entries(raw.stories as Record<string, any>)) {
      stories.push({ id, name: entry.name ?? entry.story ?? id, title: entry.kind ?? '' })
    }
  } else {
    return []
  }

  // Group by title
  const map = new Map<string, { id: string; name: string }[]>()
  for (const s of stories) {
    const arr = map.get(s.title) ?? []
    arr.push({ id: s.id, name: s.name })
    map.set(s.title, arr)
  }

  const components: StorybookComponent[] = []
  for (const [title, storyList] of map) {
    const segments = title.split('/')
    const name  = segments[segments.length - 1].trim()
    const group = segments.length > 1 ? segments.slice(0, -1).join(' / ').trim() : null

    const preferred = storyList.find(
      s => /^(primary|default)$/i.test(s.name)
    ) ?? storyList[0]

    components.push({
      name,
      group,
      stories: storyList,
      defaultStoryId: preferred.id,
    })
  }

  return components.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npm test -- storybookParser
```

Expected: all tests green

- [ ] **Step 5: Commit**

```bash
git add src/utils/storybookParser.ts src/utils/storybookParser.test.ts
git commit -m "feat: add storybookParser utility for index.json / stories.json"
```

---

## Task 2: `storybookDetector.ts` utility + tests

The URL-probing logic lives in a standalone module so it can be unit-tested without spinning up Electron.

**Files:**
- Create: `electron/storybookDetector.ts`
- Create: `electron/storybookDetector.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// electron/storybookDetector.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { probeStorybookUrl, buildCandidates } from './storybookDetector'

afterEach(() => { vi.restoreAllMocks() })

describe('buildCandidates', () => {
  it('includes homepage when provided', () => {
    const result = buildCandidates('owner', 'repo', 'https://example.com/storybook', [])
    expect(result[0]).toBe('https://example.com/storybook')
  })

  it('includes GitHub Pages URL', () => {
    const result = buildCandidates('owner', 'repo', null, [])
    expect(result).toContain('https://owner.github.io/repo')
  })

  it('adds root GitHub Pages URL for owner.github.io repos', () => {
    const result = buildCandidates('owner', 'owner.github.io', null, [])
    expect(result).toContain('https://owner.github.io')
  })

  it('appends extra candidates at the end', () => {
    const result = buildCandidates('owner', 'repo', null, ['https://custom.example.com'])
    expect(result[result.length - 1]).toBe('https://custom.example.com')
  })

  it('deduplicates candidates', () => {
    const result = buildCandidates('owner', 'repo', 'https://owner.github.io/repo', [])
    const count = result.filter(u => u === 'https://owner.github.io/repo').length
    expect(count).toBe(1)
  })
})

describe('probeStorybookUrl', () => {
  it('returns base URL on first successful index.json probe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ v: 4, entries: {} })),
    }))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBe('https://example.com/sb')
  })

  it('strips trailing slash from the base URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ v: 4, entries: {} })),
    }))
    const result = await probeStorybookUrl('https://example.com/sb/')
    expect(result).toBe('https://example.com/sb')
  })

  it('tries stories.json when index.json returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('') })   // index.json
      .mockResolvedValueOnce({ ok: true,  text: () => Promise.resolve(JSON.stringify({ v: 3, stories: {} })) }) // stories.json
    )
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBe('https://example.com/sb')
  })

  it('returns null when all probes fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('') }))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBeNull()
  })

  it('returns null when response is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<html>not json</html>'),
    }))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- storybookDetector
```

Expected: `probeStorybookUrl is not a function` / module not found

- [ ] **Step 3: Implement `electron/storybookDetector.ts`**

```typescript
// electron/storybookDetector.ts

/** Build the ordered list of candidate base URLs to probe. */
export function buildCandidates(
  owner: string,
  name: string,
  homepage: string | null,
  extraCandidates: string[],
): string[] {
  const seen = new Set<string>()
  const add = (u: string) => { const n = u.replace(/\/$/, ''); if (n) seen.add(n) }

  if (homepage) add(homepage)
  add(`https://${owner}.github.io/${name}`)
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    add(`https://${owner}.github.io`)
  }
  for (const c of extraCandidates) add(c)

  return [...seen]
}

/** Probe one base URL — try all known Storybook index paths in order.
 *  Returns the normalised base URL on success, or null. */
export async function probeStorybookUrl(base: string): Promise<string | null> {
  const b = base.replace(/\/$/, '')
  const probes = [
    `${b}/index.json`,
    `${b}/stories.json`,
    `${b}/storybook-static/index.json`,
    `${b}/storybook-static/stories.json`,
  ]
  for (const url of probes) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const text = await res.text()
      JSON.parse(text)  // throws if not valid JSON
      return b
    } catch {
      // network error, timeout, or invalid JSON — try next probe
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npm test -- storybookDetector
```

Expected: all tests green

- [ ] **Step 5: Commit**

```bash
git add electron/storybookDetector.ts electron/storybookDetector.test.ts
git commit -m "feat: add storybookDetector utility with URL probing and candidate building"
```

---

## Task 3: DB migration + `storybook:detect` IPC handler

**Files:**
- Modify: `electron/db.ts`
- Modify: `electron/main.ts`

### 3a — DB migration

- [ ] **Step 1: Add Phase 14 migration to `electron/db.ts`**

After the existing Phase 13 block (line 111–112):

```typescript
  // Phase 14 migration — Storybook detection cache
  try { db.exec(`ALTER TABLE repos ADD COLUMN storybook_url TEXT`) } catch {}
```

- [ ] **Step 2: Verify migration runs cleanly (no test needed — follows identical pattern to all prior migrations; manual smoke-test by running `npm run dev` and checking app starts)**

### 3b — IPC handlers

- [ ] **Step 3: Add imports and handlers to `electron/main.ts`**

At the top of `main.ts`, alongside existing imports:
```typescript
import { probeStorybookUrl, buildCandidates } from './storybookDetector'
```

Add the two handlers after the existing `repo:extractColor` handler (around line 1047):

```typescript
// ── Storybook IPC ───────────────────────────────────────────────────────────

ipcMain.handle('storybook:detect', async (_event, owner: string, name: string, extraCandidates?: string[]) => {
  const db = getDb(app.getPath('userData'))

  // 1. Return cached URL if already confirmed
  const cached = db.prepare('SELECT storybook_url FROM repos WHERE owner = ? AND name = ?')
    .get(owner, name) as { storybook_url: string | null } | undefined
  if (cached?.storybook_url) {
    return cached.storybook_url  // already confirmed URL
  }

  // 2. Build candidates from DB homepage + GitHub Pages pattern + extras
  const repoRow = db.prepare('SELECT homepage FROM repos WHERE owner = ? AND name = ?')
    .get(owner, name) as { homepage: string | null } | undefined
  const candidates = buildCandidates(owner, name, repoRow?.homepage ?? null, extraCandidates ?? [])

  // 3. Probe candidates in order — first hit wins
  for (const candidate of candidates) {
    const found = await probeStorybookUrl(candidate)
    if (found) {
      db.prepare('UPDATE repos SET storybook_url = ? WHERE owner = ? AND name = ?')
        .run(found, owner, name)
      return found
    }
  }

  // 4. Not found — return null without writing to DB so detection retries next visit
  return null
})

ipcMain.handle('storybook:getIndex', async (_event, storybookUrl: string) => {
  const base = storybookUrl.replace(/\/$/, '')
  const candidates = [
    `${base}/index.json`,
    `${base}/stories.json`,
    `${base}/storybook-static/index.json`,
    `${base}/storybook-static/stories.json`,
  ]
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      return await res.json()  // raw — renderer parses with storybookParser.ts
    } catch {
      // try next
    }
  }
  return null
})
```

- [ ] **Step 4: Commit**

```bash
git add electron/db.ts electron/main.ts
git commit -m "feat: add storybook_url DB column and storybook IPC handlers"
```

---

## Task 4: Preload bridge extension

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Confirm `window.api.openExternal` is already in `electron/preload.ts` (line 6)**

Run:
```bash
grep -n "openExternal" electron/preload.ts
```
Expected output: `6:  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),`

`StorybookExplorer.tsx` uses `window.api.openExternal` — it must be present before the component is built. If the grep shows no match, add it to the preload bridge before continuing.

- [ ] **Step 2: Add `storybook` namespace after the `translate` block (around line 143)**

```typescript
  storybook: {
    detect:   (owner: string, name: string, extraCandidates?: string[]) =>
      ipcRenderer.invoke('storybook:detect', owner, name, extraCandidates),
    getIndex: (storybookUrl: string) =>
      ipcRenderer.invoke('storybook:getIndex', storybookUrl),
  },
```

- [ ] **Step 3: Add TypeScript declaration for `window.api.storybook` in `src/env.d.ts`**

Read `src/env.d.ts` first to find the exact insertion point, then add:

```typescript
storybook: {
  detect:   (owner: string, name: string, extraCandidates?: string[]) => Promise<string | null>
  getIndex: (storybookUrl: string) => Promise<unknown>
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/env.d.ts
git commit -m "feat: expose storybook IPC bridge on window.api"
```

---

## Task 5: `StorybookExplorer` component + CSS

**Files:**
- Create: `src/components/StorybookExplorer.tsx`
- Modify: `src/styles/globals.css`

### 5a — CSS

- [ ] **Step 1: Add styles to `src/styles/globals.css`** (append after the `.repo-detail-tab-body` block, around line 1643)

```css
/* ── Components tab (full-bleed tab body modifier) ──────────────────── */
.repo-detail-tab-body--full-bleed {
  padding: 0;
  overflow: hidden;
}

/* ── StorybookExplorer split panel ──────────────────────────────────── */
.sb-explorer {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.sb-list {
  width: 30%;
  min-width: 180px;
  max-width: 280px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  flex-shrink: 0;
  padding: 12px 0;
}

.sb-list-item {
  display: block;
  width: 100%;
  padding: 7px 16px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--t2);
  transition: color 0.1s, background 0.1s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sb-list-item:hover  { color: var(--t1); background: var(--bg3); }
.sb-list-item.active { color: var(--accent-text); background: var(--accent-soft); }

.sb-list-group-label {
  padding: 10px 16px 4px;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 600;
  color: var(--t3);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.sb-variant-item {
  display: block;
  width: 100%;
  padding: 5px 16px 5px 28px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t3);
  transition: color 0.1s;
}
.sb-variant-item:hover  { color: var(--t2); }
.sb-variant-item.active { color: var(--accent-text); }

.sb-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg2);
  overflow: hidden;
}

.sb-preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t3);
}

.sb-preview-frame-wrap {
  flex: 1;
  overflow: hidden;
  padding: 20px;
  background: var(--bg2);
}

.sb-preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
}

.sb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--t3);
}

.sb-detecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--t3);
}
```

### 5b — Component

- [ ] **Step 2: Create `src/components/StorybookExplorer.tsx`**

```typescript
// src/components/StorybookExplorer.tsx
import { useState, useEffect } from 'react'
import { parseStorybookIndex, type StorybookComponent } from '../utils/storybookParser'

interface Props {
  storybookUrl: string         // confirmed base URL, e.g. "https://owner.github.io/repo"
  repoName: string             // for the toolbar label
}

type LoadState = 'loading' | 'error' | 'ready'

export default function StorybookExplorer({ storybookUrl, repoName }: Props) {
  const [loadState, setLoadState]           = useState<LoadState>('loading')
  const [components, setComponents]         = useState<StorybookComponent[]>([])
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null)
  const [selectedStoryId, setSelectedStoryId]     = useState<string | null>(null)
  const [iframeError, setIframeError]       = useState(false)

  // Fetch and parse the index on mount (or when the url changes)
  useEffect(() => {
    setLoadState('loading')
    setComponents([])
    setSelectedComponent(null)
    setSelectedStoryId(null)
    setIframeError(false)

    window.api.storybook.getIndex(storybookUrl)
      .then((raw) => {
        if (!raw) { setLoadState('error'); return }
        const parsed = parseStorybookIndex(raw)
        if (parsed.length === 0) { setLoadState('error'); return }
        setComponents(parsed)
        setSelectedComponent(parsed[0].name)
        setSelectedStoryId(parsed[0].defaultStoryId)
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [storybookUrl])

  function selectComponent(comp: StorybookComponent) {
    setSelectedComponent(comp.name)
    setSelectedStoryId(comp.defaultStoryId)
    setIframeError(false)
  }

  function selectVariant(storyId: string) {
    setSelectedStoryId(storyId)
    setIframeError(false)
  }

  if (loadState === 'loading') {
    return (
      <div className="sb-detecting">
        <span>Loading components…</span>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="sb-empty">
        No component preview available for {repoName}.
      </div>
    )
  }

  // Group components by their group label (null = top-level)
  const grouped = new Map<string | null, StorybookComponent[]>()
  for (const comp of components) {
    const arr = grouped.get(comp.group) ?? []
    arr.push(comp)
    grouped.set(comp.group, arr)
  }
  // Render top-level first, then named groups alphabetically
  const groupOrder: (string | null)[] = [
    null,
    ...[...grouped.keys()].filter(k => k !== null).sort() as string[],
  ]

  const iframeSrc = selectedStoryId
    ? `${storybookUrl}/iframe.html?id=${encodeURIComponent(selectedStoryId)}&viewMode=story`
    : null

  const activeComp = components.find(c => c.name === selectedComponent) ?? null

  return (
    <div className="sb-explorer">
      {/* Left panel — component list */}
      <div className="sb-list">
        {groupOrder.map(group => {
          const items = grouped.get(group)
          if (!items) return null
          return (
            <div key={group ?? '__top__'}>
              {group && <div className="sb-list-group-label">{group}</div>}
              {items.map(comp => (
                <div key={comp.name}>
                  <button
                    className={`sb-list-item${selectedComponent === comp.name ? ' active' : ''}`}
                    onClick={() => selectComponent(comp)}
                  >
                    {comp.name}
                  </button>
                  {/* Variant sub-list — only shown for the selected component */}
                  {selectedComponent === comp.name && comp.stories.length > 1 && (
                    <div>
                      {comp.stories.map(story => (
                        <button
                          key={story.id}
                          className={`sb-variant-item${selectedStoryId === story.id ? ' active' : ''}`}
                          onClick={() => selectVariant(story.id)}
                        >
                          {story.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Right panel — preview */}
      <div className="sb-preview">
        {/* Toolbar: component name + story name + external link */}
        <div className="sb-preview-toolbar">
          {activeComp && (
            <>
              <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{activeComp.name}</span>
              {selectedStoryId && (
                <>
                  <span style={{ color: 'var(--border)' }}>›</span>
                  <span>{activeComp.stories.find(s => s.id === selectedStoryId)?.name ?? ''}</span>
                </>
              )}
              <div style={{ flex: 1 }} />
              {iframeSrc && (
                <button
                  onClick={() => window.api.openExternal(iframeSrc)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--t3)', fontFamily: 'Inter, sans-serif', fontSize: 11,
                    padding: '2px 6px',
                  }}
                  title="Open in browser"
                >
                  ↗
                </button>
              )}
            </>
          )}
        </div>

        {/* iframe */}
        <div className="sb-preview-frame-wrap">
          {iframeError ? (
            <div className="sb-empty">Could not load component preview.</div>
          ) : iframeSrc ? (
            <iframe
              key={iframeSrc}
              className="sb-preview-frame"
              src={iframeSrc}
              sandbox="allow-scripts allow-same-origin"
              title={`${selectedComponent} — ${repoName} Storybook`}
              onError={() => setIframeError(true)}
            />
          ) : (
            <div className="sb-empty">Select a component to preview.</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/StorybookExplorer.tsx src/styles/globals.css
git commit -m "feat: add StorybookExplorer split-panel component and CSS"
```

---

## Task 6: Wire into `RepoDetail.tsx`

**Files:**
- Modify: `src/views/RepoDetail.tsx`

This is the largest modification. There are five distinct changes:

### 6a — Type and ALL_TABS

- [ ] **Step 1: Update the `Tab` type and `ALL_TABS` array (line 277–288)**

Change:
```typescript
type Tab = 'readme' | 'skill' | 'releases' | 'collections' | 'related' | 'videos' | 'posts' | 'websites' | 'commands'
```
To:
```typescript
type Tab = 'readme' | 'skill' | 'releases' | 'collections' | 'related' | 'videos' | 'posts' | 'websites' | 'commands' | 'components'
```

Add to `ALL_TABS` array after the `'commands'` entry:
```typescript
  { id: 'components', label: 'Components' },
```

### 6b — Import

- [ ] **Step 2: Add imports near the top of the file, after the existing component imports**

```typescript
import StorybookExplorer from '../components/StorybookExplorer'
```

### 6c — State

- [ ] **Step 3: Add Storybook state variables (after the `commands` state declarations, around line 384)**

```typescript
  // Storybook / Components tab state
  // 'detecting' while IPC call is in-flight; string = confirmed URL; null = not found
  const [storybookState, setStorybookState] = useState<'detecting' | string | null>('detecting')
  const [storybookReadmeScanned, setStorybookReadmeScanned] = useState(false)
```

### 6d — Reset on route change

- [ ] **Step 4: Add reset lines inside the main `useEffect` that resets on `[owner, name]` (around line 391–420)**

Inside the reset block, after `setCommands([])`:
```typescript
    setStorybookState('detecting')
    setStorybookReadmeScanned(false)
```

Also add the detection call at the end of the same `useEffect`, after the existing `window.api.github.isStarred` call:
```typescript
    // Storybook detection (non-blocking)
    window.api.storybook.detect(owner, name)
      .then(url => setStorybookState(url))
      .catch(() => setStorybookState(null))
```

### 6e — README re-scan trigger

- [ ] **Step 5: Add a `useEffect` that fires when the README loads, after the existing `extractYouTubeLinks` effect (around line 464)**

```typescript
  // Secondary Storybook detection: scan README for storybook.io / chromatic.com links
  useEffect(() => {
    if (storybookReadmeScanned) return
    if (storybookState !== null && storybookState !== 'detecting') return // already found
    if (typeof readme !== 'string' || !readme) return
    setStorybookReadmeScanned(true)

    // Extract any URLs that look like Storybook deployments
    const matches = readme.match(/https?:\/\/[^\s)"']+(?:storybook|chromatic)[^\s)"']*/gi)
    if (!matches?.length) return

    // Deduplicate and strip to base URL (no path beyond 2 segments)
    const candidates = [...new Set(matches.map(u => {
      try {
        const p = new URL(u)
        return `${p.protocol}//${p.host}`
      } catch { return null }
    }).filter(Boolean))] as string[]

    if (!owner || !name) return
    window.api.storybook.detect(owner, name, candidates)
      .then(url => { if (url) setStorybookState(url) })
      .catch(() => {})
  }, [readme, storybookState, storybookReadmeScanned, owner, name])
```

### 6f — `visibleTabs` filter

- [ ] **Step 6: Update the `visibleTabs` filter (around line 644–651)**

Add to the filter:
```typescript
    (t.id !== 'components' || storybookState === 'detecting' || typeof storybookState === 'string') &&
```

Full updated filter:
```typescript
  const visibleTabs = ALL_TABS.filter(t =>
    (t.id !== 'releases'   || releases === 'loading' || hasReleases) &&
    (t.id !== 'related'    || related.length > 0) &&
    (t.id !== 'videos'     || videoLinks.length > 0) &&
    (t.id !== 'posts'      || socialPosts.length > 0) &&
    (t.id !== 'websites'   || websiteLinks.length > 0) &&
    (t.id !== 'commands'   || commands.length > 0) &&
    (t.id !== 'components' || storybookState === 'detecting' || typeof storybookState === 'string')
  )
```

### 6g — Tab body modifier class

- [ ] **Step 7: Apply the full-bleed modifier to `.repo-detail-tab-body` when the components tab is active (around line 773)**

Change:
```typescript
              <div className="repo-detail-tab-body">
```
To:
```typescript
              <div className={`repo-detail-tab-body${activeTab === 'components' ? ' repo-detail-tab-body--full-bleed' : ''}`}>
```

### 6h — Render the Components tab

- [ ] **Step 8: Add the `components` tab render block inside `.repo-detail-tab-body`, after the `commands` block (around line 1063)**

```typescript
                {activeTab === 'components' && (
                  storybookState === 'detecting' ? (
                    <div className="sb-detecting">
                      <span>Detecting Storybook…</span>
                    </div>
                  ) : typeof storybookState === 'string' ? (
                    <StorybookExplorer
                      storybookUrl={storybookState}
                      repoName={name ?? ''}
                    />
                  ) : (
                    <div className="sb-empty">No component preview available.</div>
                  )
                )}
```

- [ ] **Step 9: Run the app and manually verify**

```
npm run dev
```

Checklist:
- Navigate to a repo without Storybook → Components tab should briefly appear then vanish
- Navigate to a repo with a public Storybook (e.g., search GitHub for repos with `storybook` topic and a `homepage` pointing to GitHub Pages) → Components tab remains; left panel shows component list; clicking a component loads the iframe; clicking a variant updates the iframe
- Verify that re-navigating to the same repo loads the cached `storybook_url` instantly (no 1-2 s wait)

- [ ] **Step 10: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: wire Components tab into RepoDetail with Storybook detection and StorybookExplorer"
```

---

## Edge Cases and Ambiguities to Resolve Before Implementation

1. **`AbortSignal.timeout` availability**: Available in Node 17.3+ and all Electron 31 builds. Confirmed safe. If you encounter a build error, replace with a manual `AbortController` + `setTimeout`.

2. **CSP in production build**: Electron does not enforce a CSP by default, and this app does not configure one (checked `electron/main.ts` — no `Content-Security-Policy` header is set). The sandboxed iframe will work without changes. If a CSP is added in future, `frame-src` must be set to `https:`.

3. **`window.api.storybook` TypeScript types in `env.d.ts`**: The file must be updated in Task 4. If `env.d.ts` does not currently declare the `window.api` shape (check the file before editing), the types are instead inferred from the contextBridge assignment — in that case, skip the `env.d.ts` edit.

4. **`onError` on `<iframe>`**: The iframe `onError` handler fires for network-level failures, but Storybook's `iframe.html` returning a 404 renders a blank page without triggering `onError`. If blank preview is a concern, a post-message handshake from the story iframe back to the host would be needed — defer to a follow-up.

5. **Storybook deployed under a sub-path other than `/storybook-static/`**: The current probe list covers the two most common layouts. If a custom path is found in README scanning, the `extraCandidates` mechanism will cover it.

6. **Large component libraries** (100+ components): The left panel is a simple scrollable list with no virtualisation. This is acceptable for v1 — most public Storybooks have 10–60 components.

7. **Dark-themed Storybook vs light-themed component**: The iframe background is `transparent`; the host `sb-preview-frame-wrap` uses `var(--bg2)`. If the component renders a white background itself (e.g., a white card on a white background), it will be invisible against `var(--bg2)`. Consider making the frame-wrap use a light fallback like `#f4f4f5` or expose a "light canvas" toggle button in the toolbar in a follow-up.

8. **`storybook_url` caching — NULL means "retry"**: The implementation never writes a negative result to the DB (`NULL` = not yet found OR not found this session). This means detection re-runs on every app restart for repos without Storybook. This is acceptable for v1 but will add network overhead for large starred-repo lists. A future optimisation is to add a `storybook_checked_at` timestamp column and skip re-detection for repos checked within the last N days.
