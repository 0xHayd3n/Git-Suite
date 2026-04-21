# Phase 7: Starred View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/starred` view — a scrollable list of the user's GitHub-starred repos with time-bucket grouping, filter chips, sort buttons, search, and a per-row install button that drives the full Haiku skill-generation pipeline.

**Architecture:** Eight sequential tasks — DB migration → github.ts API update → main.ts IPC updates → preload/types → CSS → Starred.tsx view. Each task is independently committable and leaves the app in a working state.

**Tech Stack:** Electron, React 18, TypeScript, better-sqlite3, React Router v6, Vite (via electron-vite), CSS custom properties.

---

## File Map

| File | Change |
|---|---|
| `electron/db.ts` | Add `starred_at TEXT` migration |
| `electron/github.ts` | Add `GitHubStarredRepo` type; update `getStarred()` to use star+json header and return `GitHubStarredRepo[]` |
| `electron/main.ts` | Update `github:getStarred` handler (force param + `starred_at` upsert); add `starred:getAll` handler |
| `electron/preload.ts` | Expose `starred.getAll` and update `github.getStarred` to accept `force?` |
| `src/types/repo.ts` | Add `starred_at` to `RepoRow`; add `StarredRepoRow` interface |
| `src/env.d.ts` | Add `StarredRepoRow` import; add `window.api.starred`; update `getStarred` signature |
| `src/styles/globals.css` | Add all starred-view CSS classes |
| `src/views/Starred.tsx` | Full implementation (replace stub) |

---

## Task 1: DB Migration — `starred_at` column

**Files:**
- Modify: `electron/db.ts:66-71`

This adds a `starred_at TEXT` column to `repos`. The migration is idempotent (same `try/catch` pattern used for all Phase 3 migrations). We also need to add `starred_at` to `RepoRow` so TypeScript knows about it everywhere repos are returned.

- [ ] **Step 1: Add the migration to `db.ts`**

Open `electron/db.ts`. After the last migration line (`try { db.exec('ALTER TABLE repos ADD COLUMN open_issues INTEGER') } catch {}`), add:

```typescript
  // Phase 7 migration
  try { db.exec(`ALTER TABLE repos ADD COLUMN starred_at TEXT`) } catch {}
```

- [ ] **Step 2: Add `starred_at` to `RepoRow` in `src/types/repo.ts`**

Open `src/types/repo.ts`. In the `RepoRow` interface, after `open_issues: number | null`, add:

```typescript
  starred_at: string | null
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npm run typecheck
```
Expected: no errors. (If `typecheck` script doesn't exist, run `npx tsc --noEmit`.)

- [ ] **Step 4: Commit**

```bash
git add electron/db.ts src/types/repo.ts
git commit -m "feat(db): add starred_at column to repos table"
```

---

## Task 2: Update `github.ts` — star+json header and `starred_at` data

**Files:**
- Modify: `electron/github.ts`

The current `getStarred()` uses `Accept: application/vnd.github+json` and returns `GitHubRepo[]`. We need it to use `Accept: application/vnd.github.star+json`, which wraps each result as `{ starred_at: string; repo: GitHubRepo }`. The `githubHeaders()` helper hard-codes the wrong Accept value, so `getStarred()` must build its own headers inline.

- [ ] **Step 1: Add the `GitHubStarredRepo` interface**

Open `electron/github.ts`. After the closing `}` of `GitHubRelease` (around line 43), add:

```typescript
export interface GitHubStarredRepo {
  starred_at: string
  repo: GitHubRepo
}
```

- [ ] **Step 2: Replace the `getStarred()` function body**

Replace the entire `getStarred` function (lines 51-68) with:

```typescript
export async function getStarred(token: string): Promise<GitHubStarredRepo[]> {
  const results: GitHubStarredRepo[] = []
  let url: string | null = `${BASE}/user/starred?per_page=100`
  let pagesFetched = 0

  // Build headers manually — githubHeaders() uses application/vnd.github+json
  // but the star+json variant is required to receive the starred_at timestamp.
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.star+json',
    Authorization: `Bearer ${token}`,
  }

  while (url && pagesFetched < 10) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
    const data = (await res.json()) as GitHubStarredRepo[]
    results.push(...data)
    pagesFetched++
    const link = res.headers.get('Link') ?? ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }

  return results
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors. The return type change will surface in `main.ts` where `getStarred` is called — that's expected and will be fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add electron/github.ts
git commit -m "feat(github): use star+json header to capture starred_at timestamps"
```

---

## Task 3: Update `main.ts` — `github:getStarred` handler + new `starred:getAll`

**Files:**
- Modify: `electron/main.ts:229-275` (github:getStarred handler)
- Modify: `electron/main.ts` (add starred:getAll after settings IPC section, around line 433)

Two changes: (1) update the existing `github:getStarred` handler to accept a `force` param, unpack the new `GitHubStarredRepo[]` shape, and store `starred_at` while preserving `saved_at`/`type`/`banner_svg`; (2) add a new `starred:getAll` handler.

- [ ] **Step 1: Update the import from `github.ts`**

In `electron/main.ts` line 8, add `GitHubStarredRepo` to the import (it's a type, so use the existing named import):

```typescript
import { OAUTH_URL, exchangeCode, getUser, getStarred, getRepo, searchRepos, getReadme, getReleases } from './github'
import type { GitHubStarredRepo } from './github'
```

Or, if you prefer one line:
```typescript
import { OAUTH_URL, exchangeCode, getUser, getStarred, getRepo, searchRepos, getReadme, getReleases, type GitHubStarredRepo } from './github'
```

- [ ] **Step 2: Replace the `github:getStarred` IPC handler**

Find the handler starting at line 229:
```typescript
ipcMain.handle('github:getStarred', async () => {
```

Replace the entire handler (lines 229-275) with:

```typescript
ipcMain.handle('github:getStarred', async (_, force?: boolean) => {
  const token = getToken()
  if (!token) return // no token (user skipped onboarding)

  const db = getDb(app.getPath('userData'))
  const lastRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('last_starred_sync') as
    | { value: string }
    | undefined

  if (!force && lastRow && Date.now() - Number(lastRow.value) < 3_600_000) return // cache fresh

  const starredItems = await getStarred(token)

  const upsert = db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks,
                       license, homepage, updated_at, starred_at, saved_at, type, banner_svg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(owner, name) DO UPDATE SET
      description = excluded.description,
      language    = excluded.language,
      topics      = excluded.topics,
      stars       = excluded.stars,
      forks       = excluded.forks,
      updated_at  = excluded.updated_at,
      starred_at  = excluded.starred_at,
      saved_at    = repos.saved_at,
      type        = repos.type,
      banner_svg  = repos.banner_svg
  `)
  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  db.transaction(() => {
    for (const item of starredItems) {
      const repo = item.repo
      upsert.run(
        String(repo.id),
        repo.owner.login,
        repo.name,
        repo.description,
        repo.language,
        JSON.stringify(repo.topics ?? []),
        repo.stargazers_count,
        repo.forks_count,
        repo.license?.spdx_id ?? null,
        repo.homepage,
        repo.updated_at,
        item.starred_at,
      )
    }
    setSetting.run('last_starred_sync', String(Date.now()))
    setSetting.run('starred_repo_count', String(starredItems.length))
  })()
})
```

- [ ] **Step 3: Add the `starred:getAll` handler**

Add this block after the `settings:setApiKey` handler (after line 433):

```typescript
// ── Starred IPC ─────────────────────────────────────────────────
ipcMain.handle('starred:getAll', async () => {
  const db = getDb(app.getPath('userData'))
  return db.prepare(`
    SELECT
      repos.*,
      CASE WHEN skills.repo_id IS NOT NULL THEN 1 ELSE 0 END AS installed
    FROM repos
    LEFT JOIN skills ON repos.id = skills.repo_id
    WHERE repos.starred_at IS NOT NULL
    ORDER BY repos.starred_at DESC
  `).all()
})
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors. The `item.repo` access pattern now matches the updated `GitHubStarredRepo` type.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat(ipc): update getStarred handler (force param + starred_at), add starred:getAll"
```

---

## Task 4: Update `preload.ts` and type declarations

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/types/repo.ts`
- Modify: `src/env.d.ts`

Wire the new IPC channels through the context bridge and update TypeScript declarations.

- [ ] **Step 1: Read `electron/preload.ts`**

Open the file to see its current structure before editing.

- [ ] **Step 2: Update `preload.ts`**

Find the line that exposes `getStarred`:
```typescript
getStarred:    () => ipcRenderer.invoke('github:getStarred'),
```

Replace it with:
```typescript
getStarred:    (force?: boolean) => ipcRenderer.invoke('github:getStarred', force),
```

Then add a `starred` namespace. Find the end of the `contextBridge.exposeInMainWorld('api', { ... })` call and add a `starred` key alongside the existing keys:

```typescript
starred: {
  getAll: () => ipcRenderer.invoke('starred:getAll'),
},
```

- [ ] **Step 3: Add `StarredRepoRow` to `src/types/repo.ts`**

Open `src/types/repo.ts`. After the `CollectionRepoRow` interface (end of file), add:

```typescript
/** Returned by starred:getAll — repos WHERE starred_at IS NOT NULL, LEFT JOIN skills. */
export interface StarredRepoRow extends RepoRow {
  installed: number  // 0 or 1 — 1 if a skill exists for this repo
}
```

- [ ] **Step 4: Update `src/env.d.ts`**

Open `src/env.d.ts`.

Update line 1 to add `StarredRepoRow` to the import:
```typescript
import type { RepoRow, ReleaseRow, SkillRow, LibraryRow, CollectionRow, CollectionRepoRow, StarredRepoRow } from './types/repo'
```

Update `getStarred` in the `github` namespace:
```typescript
getStarred:    (force?: boolean) => Promise<void>
```

Add a `starred` namespace after the `collection` block:
```typescript
starred: {
  getAll(): Promise<StarredRepoRow[]>
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/preload.ts src/types/repo.ts src/env.d.ts
git commit -m "feat(types): add StarredRepoRow, wire starred:getAll through preload and env.d.ts"
```

---

## Task 5: Add CSS for the Starred view

**Files:**
- Modify: `src/styles/globals.css` (append at end)

All new CSS goes at the bottom of the existing file. Use the existing CSS token names (`--bg`, `--bg2`, `--bg3`, `--t1`, `--t2`, `--t3`, `--accent`, `--accent-soft`, `--accent-border`, `--border`, `--border2`, `--status-ok`). Look at how `.install-btn`, `.filter-chip`, and `.repo-row` are styled for reference patterns.

- [ ] **Step 1: Append the starred-view CSS**

Open `src/styles/globals.css` and append the following at the end of the file:

```css
/* ── Starred View ──────────────────────────────────────────────── */

.starred-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* GitHub account bar */
.github-account-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.account-bar-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid var(--accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #a78bfa;
  flex-shrink: 0;
}

.account-bar-username {
  font-size: 11px;
  font-weight: 700;
  color: var(--t1);
}

.account-bar-handle {
  font-size: 10px;
  color: var(--t3);
}

.account-bar-sync {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
}

.account-bar-sync-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #34d399;
  flex-shrink: 0;
}

.account-bar-sync-text {
  font-size: 9px;
  color: var(--t3);
}

.starred-sync-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: 1px solid var(--border2);
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 10px;
  color: var(--t2);
  cursor: pointer;
  margin-left: 8px;
}

.starred-sync-btn:hover {
  border-color: var(--accent-border);
  color: var(--t1);
}

.starred-sync-btn svg {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}

.starred-sync-btn.syncing svg {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* Topbar */
.starred-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.starred-topbar .search-input {
  flex: 1;
}

.starred-sort-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 10px;
  color: var(--t3);
  cursor: pointer;
}

.starred-sort-btn:hover {
  color: var(--t2);
}

.starred-sort-btn.active {
  border-color: var(--border2);
  color: var(--t2);
}

/* Filter chips */
.starred-filter-chips {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.starred-chip {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  border: 1px solid var(--border);
  color: var(--t3);
  cursor: pointer;
  background: transparent;
}

.starred-chip:hover {
  border-color: var(--border2);
  color: var(--t2);
}

.starred-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: #a78bfa;
}

/* List area */
.starred-list {
  flex: 1;
  overflow-y: auto;
}

/* Section headers — sticky with blur glass effect */
.starred-section-header {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgba(10, 10, 14, 0.96);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 20px;
}

.starred-section-label {
  font-size: 9px;
  text-transform: uppercase;
  color: var(--t3);
  letter-spacing: 0.05em;
  white-space: nowrap;
  flex-shrink: 0;
}

.starred-section-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}

.starred-section-count {
  font-size: 9px;
  color: var(--t3);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Individual repo rows */
.starred-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 20px;
  border-bottom: 1px solid var(--border);
}

.starred-row:hover {
  background: var(--bg3);
}

/* Language colour dot */
.starred-lang-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Info block */
.starred-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.starred-name-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.starred-owner {
  font-size: 12px;
  color: var(--t3);
}

.starred-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--t1);
}

.starred-description {
  font-size: 10px;
  color: var(--t3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Right side */
.starred-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.starred-star-count {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--t2);
}

.starred-star-count svg {
  width: 9px;
  height: 9px;
}

/* Install button */
.starred-install-btn {
  background: transparent;
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  padding: 5px 12px;
  font-size: 9px;
  color: #a78bfa;
  cursor: pointer;
  white-space: nowrap;
}

.starred-install-btn:hover:not(:disabled) {
  background: var(--accent-soft);
}

.starred-install-btn.generating {
  background: rgba(251, 191, 36, 0.08);
  border-color: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  cursor: default;
}

.starred-install-btn.installed {
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.2);
  color: #34d399;
  pointer-events: none;
}

/* Empty / error states */
.starred-empty {
  padding: 48px 20px;
  text-align: center;
  font-size: 12px;
  color: var(--t3);
}
```

- [ ] **Step 2: Verify the app still builds / no CSS syntax errors**

```bash
npm run build
```
Expected: build succeeds (CSS parse errors would show here).

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(css): add starred view styles"
```

---

## Task 6: Implement `Starred.tsx` — skeleton + data loading

**Files:**
- Modify: `src/views/Starred.tsx` (replace stub)

Build the component in two steps: this task creates the skeleton with data loading, state shape, and the account bar / topbar / filter chips — no row rendering yet. This lets us verify the data pipeline works before building the complex list.

**Before writing code, read these files for patterns:**
- `src/views/Discover.tsx` — install button pattern, SavedReposContext usage
- `src/views/Library.tsx` — list rendering patterns
- `src/styles/globals.css` lines 1–20 — CSS token names

- [ ] **Step 1: Write the skeleton with data loading**

Replace `src/views/Starred.tsx` with:

```tsx
import { useState, useEffect, useCallback, useContext } from 'react'
import type { StarredRepoRow } from '../types/repo'
import { formatStars } from '../types/repo'
import { SavedReposContext } from '../contexts/SavedRepos'

type SortKey = 'recent' | 'stars' | 'az'
type FilterKey = 'all' | 'not-installed' | 'installed'
type InstallState = 'UNINSTALLED' | 'GENERATING' | 'INSTALLED'

const LANG_COLORS: Record<string, string> = {
  Python: '#3b82f6',
  TypeScript: '#facc15',
  JavaScript: '#facc15',
  Rust: '#f87171',
  Go: '#4ade80',
  C: '#60a5fa',
  'C++': '#60a5fa',
}
function langColor(lang: string | null): string {
  return lang ? (LANG_COLORS[lang] ?? '#6b6b80') : '#6b6b80'
}

export default function Starred() {
  const { saveRepo } = useContext(SavedReposContext)

  // Data
  const [rows, setRows] = useState<StarredRepoRow[]>([])
  const [loading, setLoading] = useState(true)

  // Account bar
  const [userLogin, setUserLogin] = useState<string | null>(null)
  const [userAvatar, setUserAvatar] = useState<string | null>(null)
  const [syncedAgo, setSyncedAgo] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Controls
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [filter, setFilter] = useState<FilterKey>('all')

  // Per-row install state: key = "owner/name"
  const [installStates, setInstallStates] = useState<Record<string, InstallState>>({})
  const [installErrors, setInstallErrors] = useState<Record<string, string | null>>({})

  const loadRows = useCallback(async () => {
    const data = await window.api.starred.getAll()
    setRows(data)
    // Initialise install states from DB
    setInstallStates((prev) => {
      const next = { ...prev }
      for (const r of data) {
        const key = `${r.owner}/${r.name}`
        if (!(key in next)) {
          next[key] = r.installed ? 'INSTALLED' : 'UNINSTALLED'
        }
      }
      return next
    })
    setLoading(false)
  }, [])

  // Load sync timestamp
  const loadSyncedAgo = useCallback(async () => {
    const val = await window.api.settings.get('last_starred_sync')
    if (!val) { setSyncedAgo(null); return }
    const mins = Math.floor((Date.now() - Number(val)) / 60_000)
    setSyncedAgo(mins < 1 ? 'just now' : `${mins} min ago`)
  }, [])

  useEffect(() => {
    // Load user info
    window.api.github.getUser().then(({ login, avatarUrl }) => {
      setUserLogin(login)
      setUserAvatar(avatarUrl)
    }).catch(() => {})

    loadSyncedAgo()
    loadRows()
  }, [loadRows, loadSyncedAgo])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await window.api.github.getStarred(true)
      await loadRows()
      await loadSyncedAgo()
    } finally {
      setSyncing(false)
    }
  }

  // ── Derived data ────────────────────────────────────────────────

  // Sort
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'stars') return (b.stars ?? 0) - (a.stars ?? 0)
    if (sort === 'az') return a.name.localeCompare(b.name)
    // 'recent' — already sorted by starred_at DESC from DB; maintain order
    return 0
  })

  // Counts for chips (unfiltered, unsearched)
  const totalCount = rows.length
  const installedCount = rows.filter((r) => installStates[`${r.owner}/${r.name}`] === 'INSTALLED' || r.installed).length
  const notInstalledCount = totalCount - installedCount

  // Filter + search
  const visible = sorted.filter((r) => {
    const key = `${r.owner}/${r.name}`
    const state = installStates[key]
    const isInstalled = state === 'INSTALLED' || r.installed === 1
    if (filter === 'installed' && !isInstalled) return false
    if (filter === 'not-installed' && isInstalled) return false
    if (search) {
      const q = search.toLowerCase()
      const matches =
        r.name.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false)
      if (!matches) return false
    }
    return true
  })

  // Time buckets
  const now = Date.now()
  const buckets: { label: string; rows: StarredRepoRow[] }[] = []
  const week: StarredRepoRow[] = []
  const month: StarredRepoRow[] = []
  const older: StarredRepoRow[] = []
  let hasDates = false

  for (const r of visible) {
    if (!r.starred_at) { older.push(r); continue }
    hasDates = true
    const age = now - new Date(r.starred_at).getTime()
    if (age < 7 * 86_400_000) week.push(r)
    else if (age < 30 * 86_400_000) month.push(r)
    else older.push(r)
  }

  if (hasDates) {
    if (week.length)  buckets.push({ label: 'This week',  rows: week })
    if (month.length) buckets.push({ label: 'This month', rows: month })
    if (older.length) buckets.push({ label: 'Older',      rows: older })
  } else {
    buckets.push({ label: 'All starred', rows: visible })
  }

  // ── Install handler ─────────────────────────────────────────────
  const handleInstall = async (owner: string, name: string) => {
    const key = `${owner}/${name}`
    const apiKey = await window.api.settings.getApiKey()
    if (!apiKey) {
      setInstallErrors((p) => ({ ...p, [key]: 'no-key' }))
      return
    }
    setInstallErrors((p) => ({ ...p, [key]: null }))
    setInstallStates((p) => ({ ...p, [key]: 'GENERATING' }))
    try {
      await saveRepo(owner, name)
      await window.api.skill.generate(owner, name)
      setInstallStates((p) => ({ ...p, [key]: 'INSTALLED' }))
    } catch {
      setInstallStates((p) => ({ ...p, [key]: 'UNINSTALLED' }))
      setInstallErrors((p) => ({ ...p, [key]: 'failed' }))
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  const initial = userLogin?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="starred-layout">
      {/* GitHub account bar */}
      <div className="github-account-bar">
        <div className="account-bar-avatar">{initial}</div>
        <span className="account-bar-username">{userLogin ?? '—'}</span>
        {userLogin && (
          <span className="account-bar-handle">github.com/{userLogin}</span>
        )}
        <div className="account-bar-sync">
          <div className="account-bar-sync-dot" />
          <span className="account-bar-sync-text">
            {syncedAgo ? `synced ${syncedAgo}` : 'not synced'}
          </span>
          <button
            className={`starred-sync-btn${syncing ? ' syncing' : ''}`}
            onClick={handleSync}
            disabled={syncing}
          >
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8.5 5A3.5 3.5 0 1 1 5 1.5" strokeLinecap="round" />
              <path d="M5 0v2.5L7 1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sync GitHub
          </button>
        </div>
      </div>

      {/* Topbar */}
      <div className="starred-topbar">
        <input
          className="search-input"
          placeholder="Search starred repos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(['recent', 'stars', 'az'] as SortKey[]).map((s) => (
          <button
            key={s}
            className={`starred-sort-btn${sort === s ? ' active' : ''}`}
            onClick={() => setSort(s)}
          >
            {s === 'recent' ? 'Recent' : s === 'stars' ? 'Stars' : 'A–Z'}
          </button>
        ))}
      </div>

      {/* Filter chips */}
      <div className="starred-filter-chips">
        <button
          className={`starred-chip${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All {totalCount}
        </button>
        <button
          className={`starred-chip${filter === 'not-installed' ? ' active' : ''}`}
          onClick={() => setFilter('not-installed')}
        >
          Not installed {notInstalledCount}
        </button>
        <button
          className={`starred-chip${filter === 'installed' ? ' active' : ''}`}
          onClick={() => setFilter('installed')}
        >
          Installed {installedCount}
        </button>
      </div>

      {/* List */}
      <div className="starred-list">
        {loading && (
          <div className="starred-empty">Loading starred repos…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="starred-empty">
            No starred repos found. Try syncing GitHub.
          </div>
        )}
        {!loading && rows.length > 0 && visible.length === 0 && (
          <div className="starred-empty">No repos match your filter.</div>
        )}
        {!loading && buckets.map((bucket) => (
          <div key={bucket.label}>
            <div className="starred-section-header">
              <span className="starred-section-label">{bucket.label}</span>
              <div className="starred-section-line" />
              <span className="starred-section-count">{bucket.rows.length}</span>
            </div>
            {bucket.rows.map((r) => {
              const key = `${r.owner}/${r.name}`
              const state = installStates[key] ?? (r.installed ? 'INSTALLED' : 'UNINSTALLED')
              const err = installErrors[key]
              return (
                <div key={key} className="starred-row">
                  <div
                    className="starred-lang-dot"
                    style={{ background: langColor(r.language) }}
                  />
                  <div className="starred-info">
                    <div className="starred-name-row">
                      <span className="starred-owner">{r.owner}/</span>
                      <span className="starred-name">{r.name}</span>
                      {r.type && (
                        <span className={`type-badge type-${r.type}`}>{r.type}</span>
                      )}
                    </div>
                    {r.description && (
                      <div className="starred-description" title={r.description}>
                        {r.description}
                      </div>
                    )}
                    {err === 'no-key' && (
                      <div style={{ fontSize: 9, color: '#f87171', marginTop: 2 }}>
                        Set your Anthropic API key in Settings first.
                      </div>
                    )}
                    {err === 'failed' && (
                      <div style={{ fontSize: 9, color: '#f87171', marginTop: 2 }}>
                        Generation failed. Try again.
                      </div>
                    )}
                  </div>
                  <div className="starred-right">
                    <div className="starred-star-count">
                      <svg viewBox="0 0 9 9" fill="currentColor">
                        <path d="M4.5 0l1.1 2.2 2.4.35-1.75 1.7.41 2.4L4.5 5.5l-2.16 1.15.41-2.4L1 2.55l2.4-.35z" />
                      </svg>
                      {formatStars(r.stars)}
                    </div>
                    <button
                      className={`starred-install-btn${state === 'GENERATING' ? ' generating' : state === 'INSTALLED' ? ' installed' : ''}`}
                      onClick={() => state === 'UNINSTALLED' && handleInstall(r.owner, r.name)}
                      disabled={state === 'GENERATING'}
                    >
                      {state === 'GENERATING' ? '⟳ Generating…' : state === 'INSTALLED' ? '✓ Installed' : '+ Install'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Start the dev server and smoke-test the view**

```bash
npm run dev
```

Navigate to the Starred view via the sidebar. Verify:
- Account bar shows username + handle (or `—` if not connected)
- Filter chips show counts
- Sort buttons are clickable
- Search input is visible
- If starred repos exist in the DB: rows appear grouped by time bucket
- Sync button shows "Sync GitHub" and triggers a refresh when clicked

- [ ] **Step 4: Commit**

```bash
git add src/views/Starred.tsx
git commit -m "feat(ui): implement Starred view with data loading, bucketing, filtering, and install pipeline"
```

---

## Task 7: Final verification

**Files:** None — verification only.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: all existing tests pass (no regressions from the type changes).

- [ ] **Step 2: Run typecheck one final time**

```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Smoke-test the install flow**

With the dev server running:
1. Navigate to Starred view
2. Find a repo showing `+ Install`
3. Click it — button should immediately change to `⟳ Generating…`
4. Wait for generation — button should change to `✓ Installed`
5. Reload the view (navigate away and back) — button should still show `✓ Installed`

- [ ] **Step 4: Smoke-test the Sync button**

1. Note the "synced N min ago" text
2. Click "Sync GitHub" — icon should spin briefly
3. After sync: "synced just now" should appear
4. List should refresh

- [ ] **Step 5: Smoke-test filter chips**

1. Click "Installed" chip — only rows with `✓ Installed` are shown
2. Click "Not installed" chip — only rows with `+ Install` are shown
3. Click "All" — all rows return
4. Type in search box — rows filter by name/owner/description

- [ ] **Step 6: Final commit**

If any fixes were needed during smoke-testing, commit them now:

```bash
git add -p
git commit -m "fix(starred): smoke-test fixes"
```

---

## Spec Reference

`docs/superpowers/specs/2026-03-27-phase7-starred-view-design.md`
