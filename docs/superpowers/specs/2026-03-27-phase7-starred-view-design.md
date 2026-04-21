# Phase 7: Starred View — Design Spec

**Date:** 2026-03-27
**Route:** `/starred`
**Status:** Approved by user spec

---

## 1. Overview

A single-panel view that lists all of the user's GitHub-starred repos pulled from SQLite. Each row has one action: install (generate a Haiku skill) or show as already installed. No detail sidebar — the whole panel is the scrollable list.

---

## 2. Architecture

### New IPC Handlers

| Handler | Purpose |
|---|---|
| `starred:getAll` | Returns all starred repos (where `repos.starred_at IS NOT NULL`) joined with skills for install status |

### Modified IPC Handlers

| Handler | Change |
|---|---|
| `github:getStarred` | (1) Use `application/vnd.github.star+json` accept header to receive `starred_at` per repo. (2) Add optional `force?: boolean` param to bypass 1-hour cache. (3) Upsert `starred_at` into DB. |

### DB Migration

Add `starred_at TEXT` column to `repos` table (idempotent `try/catch` pattern, Phase 7 comment).

The `starred_at` field serves double duty: it marks a repo as "starred by the user" (used in `WHERE starred_at IS NOT NULL` filter) and provides the timestamp for time-bucket grouping.

---

## 3. Data Layer

### `starred:getAll` SQL

```sql
SELECT
  repos.*,
  CASE WHEN skills.repo_id IS NOT NULL THEN 1 ELSE 0 END AS installed
FROM repos
LEFT JOIN skills ON repos.id = skills.repo_id
WHERE repos.starred_at IS NOT NULL
ORDER BY repos.starred_at DESC
```

Returns a `StarredRepoRow[]` type (extends `RepoRow` with `installed: number`). `starred_at` is covered by `repos.*`.

### `github:getStarred` Update

- `getStarred()` in `github.ts` must build its own headers object (not use `githubHeaders()`) so it can set `Accept: application/vnd.github.star+json` — response shape changes from `GitHubRepo[]` to `GitHubStarredRepo[]`
- IPC handler updated signature: `ipcMain.handle('github:getStarred', async (_, force?: boolean) => {...})`
- Skip cache check when `force === true`
- Upsert SQL includes `starred_at` and explicitly preserves `saved_at`, `type`, `banner_svg`:

```sql
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
```

`preload.ts` updated line: `getStarred: (force?: boolean) => ipcRenderer.invoke('github:getStarred', force)`

---

## 4. View Components (all in `Starred.tsx`)

### GitHub Account Bar
- Background `var(--bg2)`, 1px border-bottom `var(--border)`, padding `10px 20px`
- Avatar (24×24, circle, purple tint), username (`--t1` bold 11px), handle (`--t3` 10px)
- Right: sync status (green dot + "synced N min ago" or "not synced") + Sync button
- Sync button: transparent bg, `--border2` border, 10px refresh SVG icon + "Sync GitHub" text
- On click: sets `syncing` state (spins icon) → calls `github:getStarred(force=true)` → re-fetches `starred:getAll` → clears `syncing`

### Topbar
- Background `var(--bg)`, border-bottom, padding `9px 20px`
- Search input (same style as other views)
- Sort buttons: `Recent` (default) | `Stars` | `A–Z` — single-select

### Filter Chips
- Padding `9px 20px`, border-bottom, flex row, gap 5px
- Three chips: `All {n}` | `Not installed {n}` | `Installed {n}`
- Counts derived from the full unfiltered dataset (not affected by search)
- Active chip: `var(--accent-soft)` bg, `var(--accent-border)` border, `#a78bfa` color

### Time-Bucket Sections

Group by `starred_at`:
- **This week** — last 7 days
- **This month** — 8–30 days ago
- **Older** — >30 days ago
- **Fallback** — if all `starred_at` are null, show single "All starred" section with no grouping

Section headers: `position: sticky; top: 0; background: rgba(10,10,14,0.96); backdrop-filter: blur(4px); z-index: 1`
Layout: label (9px uppercase `--t3`) + flex-1 line + count badge (9px `--t3`)

### List Rows
- Flex row, `align-items: center`, gap 12px, padding `11px 20px`, border-bottom
- Hover: `var(--bg3)` background
- **Language dot** — 10px circle with language colour:
  - Python `#3b82f6`, TypeScript/JavaScript `#facc15`, Rust `#f87171`, Go `#4ade80`, C/C++ `#60a5fa`, Other `#6b6b80`
- **Info block** (flex: 1): `{owner}/` in `--t3` + `{name}` in 12px bold `--t1` + type badge. Below: description (10px `--t3`, ellipsis)
- **Right side**: star count (9×9 star icon + 10px `--t2` count) + install button

### Install Button States

| State | Style |
|---|---|
| `+ Install` | transparent bg, `var(--accent-border)` border, `#a78bfa` color, 9px, padding `5px 12px`, border-radius 4px |
| `⟳ Generating...` | `rgba(251,191,36,0.08)` bg, `rgba(251,191,36,0.2)` border, `#fbbf24` color, disabled |
| `✓ Installed` | `rgba(52,211,153,0.08)` bg, `rgba(52,211,153,0.2)` border, `#34d399` color, pointer-events none |

Flow: click → immediately set to `Generating` → `skill:generate(owner, name)` in background → on success set to `Installed`.

---

## 5. Client-Side Logic

### Search
Filter over already-fetched rows by `name`, `owner`, `description` — contains match, case-insensitive. No new IPC calls.

### Sort
- `Recent` — by `starred_at DESC` (default; also the DB sort order)
- `Stars` — by `stars DESC`
- `A–Z` — by `name ASC`

### Filter Chips
Apply after sort, before bucketing. Counts shown on chips always reflect the full unfiltered+unsorted dataset.

### Bucketing
Applied after filter chips + sort. Sections with zero rows are hidden.

### Mount
On mount:
1. Call `window.api.github.getUser()` to get `{ login, avatarUrl }` — store in component state for the account bar. If the call throws (user not connected), show empty/fallback avatar with "not connected" label.
2. Read `last_starred_sync` setting to compute "synced N min ago" text.
3. Call `window.api.starred.getAll()` to load the list.

### Install Flow
Mirrors `Discover.tsx` pattern exactly:
1. Check API key — if missing, show `"no-key"` error (link to Settings)
2. Set row state to `GENERATING`
3. Call `saveRepo(owner, name)` via `SavedReposContext`
4. Call `window.api.skill.generate(owner, name)`
5. On success: set row state to `INSTALLED`
6. On failure: set row state back to `UNINSTALLED`, show error

### Sync Status
- On mount: read `last_starred_sync` setting → compute elapsed minutes → display "synced N min ago"
- After sync completes: update with current timestamp

---

## 6. Types

### `RepoRow` update (in `src/types/repo.ts`)
Add `starred_at: string | null` to `RepoRow` since it becomes a real column on `repos` after the migration. This keeps `RepoRow` as a true mirror of the table schema:

```typescript
// Add to RepoRow interface (after open_issues):
starred_at: string | null
```

### `StarredRepoRow` (in `src/types/repo.ts`)
```typescript
export interface StarredRepoRow extends RepoRow {
  installed: number  // 0 or 1 — computed by the LEFT JOIN
}
```

(`starred_at` is inherited from `RepoRow`; `installed` is the only new field.)

### Updated `GitHubStarredRepo` (in `electron/github.ts`)
```typescript
export interface GitHubStarredRepo {
  starred_at: string
  repo: GitHubRepo
}
```

Note: `getStarred()` must build its own headers rather than calling `githubHeaders()` since it needs `Accept: application/vnd.github.star+json` instead of `application/vnd.github+json`. Example:

```typescript
const headers: Record<string, string> = { Accept: 'application/vnd.github.star+json' }
if (token) headers.Authorization = `Bearer ${token}`
```

---

## 7. API Surface (`preload.ts` + `env.d.ts`)

New IPC bridge additions:
- `window.api.starred.getAll(): Promise<StarredRepoRow[]>`
- Updated: `window.api.github.getStarred(force?: boolean): Promise<void>`

**`env.d.ts` import line** (line 1) — updated to include `StarredRepoRow`:
```typescript
import type { RepoRow, ReleaseRow, SkillRow, LibraryRow, CollectionRow, CollectionRepoRow, StarredRepoRow } from './types/repo'
```

**`env.d.ts` `window.api` addition:**
```typescript
starred: {
  getAll(): Promise<StarredRepoRow[]>
}
```

---

## 8. CSS

New classes in `globals.css`:

```
.starred-layout          — flex column, height 100%, overflow hidden
.github-account-bar      — top bar with avatar, username, sync status
.account-bar-avatar      — 24×24 circle, purple tint
.account-bar-sync        — flex row with green dot + text
.starred-sync-btn        — transparent button with refresh icon
.starred-sync-btn.syncing — spins the icon via CSS animation
.starred-topbar          — search + sort buttons
.starred-sort-btn        — sort button (inactive / active states)
.starred-filter-chips    — chip row
.starred-chip            — individual chip (inactive / .active state)
.starred-list            — flex-1 overflow-y-auto scrollable area
.starred-section-header  — sticky blurred section header
.starred-row             — individual repo row
.starred-row:hover       — bg3 tint
.starred-lang-dot        — 10px language colour dot
.starred-info            — flex-1 info block
.starred-name-row        — owner/name + type badge row
.starred-description     — truncated description
.starred-right           — star count + install button
.starred-star-count      — star icon + count
.starred-install-btn     — three-state install button
.starred-install-btn.generating — yellow generating state
.starred-install-btn.installed  — green installed state
```

---

## 9. Files Changed

| File | Change |
|---|---|
| `electron/db.ts` | Migration: `ALTER TABLE repos ADD COLUMN starred_at TEXT` |
| `electron/github.ts` | Add `GitHubStarredRepo` type; update `getStarred()` to use star+json header and return `GitHubStarredRepo[]` |
| `electron/main.ts` | Update `github:getStarred` handler (force param + `starred_at` upsert); add `starred:getAll` handler |
| `electron/preload.ts` | Expose `starred.getAll` and update `github.getStarred` signature |
| `src/env.d.ts` | Add `StarredRepoRow` import and `window.api.starred.getAll` + updated `getStarred` signature |
| `src/types/repo.ts` | Add `StarredRepoRow` interface |
| `src/views/Starred.tsx` | Full implementation (replace stub) |
| `src/styles/globals.css` | Add starred view styles |

---

## 10. Out of Scope

- Clicking a starred row to navigate to `/repo/:owner/:name` — not specified, not added
- Pagination / virtual scrolling — not specified (up to 1000 repos, acceptable)
- Sorting by `forks` — not specified
- Unstar from this view — not specified
