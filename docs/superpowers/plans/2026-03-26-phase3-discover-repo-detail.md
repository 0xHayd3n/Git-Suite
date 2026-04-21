# Phase 3 — Discover & Repo Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Discover view (repo grid browser) and Repo Detail view, including the BannerSVG system, SavedReposContext, and all supporting data layer plumbing.

**Architecture:** Seven IPC channels feed data from SQLite/GitHub API to the renderer (6 defined in the spec + `getRelatedRepos` for sidebar related repos). A shared `SavedReposContext` tracks saved-repo state across both views. `BannerSVG` generates deterministic SVGs from a djb2+LCG seed — no DB caching in this phase. All `searchRepos`/`getRepo` IPC handlers return normalized DB row objects (`RepoRow`) to avoid API vs. DB field-name mismatches.

**Tech Stack:** React 18, TypeScript, better-sqlite3, Electron IPC, react-markdown + remark-gfm, JetBrains Mono, CSS custom properties

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/types/repo.ts` | `RepoRow` interface + `parseTopics` helper |
| Modify | `src/env.d.ts` | Add new `window.api.github` channel types |
| Modify | `electron/db.ts` | Add 5 new columns + ALTER TABLE migrations |
| Modify | `electron/github.ts` | Update `githubHeaders`, update `getRepo` sig, add `searchRepos`/`getReadme`/`getReleases`, add `GitHubRelease` |
| Modify | `electron/main.ts` | Add 7 new `ipcMain.handle` entries |
| Modify | `electron/preload.ts` | Expose 7 new IPC channels |
| Create | `electron/upsert.test.ts` | Integration tests for cache + saved_at preservation |
| Create | `src/contexts/SavedRepos.tsx` | SavedReposContext provider |
| Modify | `src/App.tsx` | Wrap with SavedReposProvider |
| Create | `src/components/BannerSVG.tsx` | Deterministic SVG banner, pure function |
| Modify | `src/styles/globals.css` | Discover + RepoDetail CSS |
| Modify | `src/views/Discover.tsx` | Full Discover view (replaces stub) |
| Modify | `src/views/RepoDetail.tsx` | Full Repo Detail view (replaces stub) |
| Modify | `electron/db.test.ts` | Tests for new columns |
| Modify | `electron/github.test.ts` | Tests for new helpers |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install react-markdown and remark-gfm**

```bash
cd D:/Coding/Git-Suite
npm install react-markdown remark-gfm
```

Expected output: `added N packages` with no errors. Both will appear in `dependencies` in package.json.

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown and remark-gfm"
```

---

## Task 2: DB schema — four new columns

**Files:**
- Modify: `electron/db.ts`
- Modify: `electron/db.test.ts`

The `repos` table needs five new columns: `discovered_at TEXT`, `discover_query TEXT`, `watchers INTEGER`, `size INTEGER`, `open_issues INTEGER`. On upgrades the columns don't exist yet — use `try/catch` per `ALTER TABLE` since SQLite has no `IF NOT EXISTS` for `ALTER TABLE`.

- [ ] **Step 1: Write failing tests for new columns**

Add to the `initSchema` describe block in `electron/db.test.ts`:

```ts
it('repos table has Phase 3 columns', () => {
  const cols = db.prepare('PRAGMA table_info(repos)').all() as { name: string }[]
  const names = cols.map((c) => c.name)
  expect(names).toContain('discovered_at')
  expect(names).toContain('discover_query')
  expect(names).toContain('watchers')
  expect(names).toContain('size')
  expect(names).toContain('open_issues')
})

it('initSchema is idempotent for Phase 3 columns — no throw on second call', () => {
  expect(() => initSchema(db)).not.toThrow()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "Phase 3 columns"
```

Expected: `FAIL` — columns don't exist yet.

- [ ] **Step 3: Implement schema changes in db.ts**

In `initSchema`, add the four new columns to the `CREATE TABLE IF NOT EXISTS repos` statement (so fresh installs get them), then add four `ALTER TABLE` try/catch blocks after the main `db.exec(...)` call (for upgrades from Phase 1/2).

The full `CREATE TABLE repos` string (replace the existing one) should include these columns at the end before the closing `);`:

```sql
discovered_at  TEXT,
discover_query TEXT,
watchers       INTEGER,
size           INTEGER,
open_issues    INTEGER
```

After `db.exec(...)`, add:

```ts
// Phase 3 migrations — idempotent via try/catch (SQLite has no ALTER TABLE ... IF NOT EXISTS)
try { db.exec(`ALTER TABLE repos ADD COLUMN discovered_at TEXT`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN discover_query TEXT`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN watchers INTEGER`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN size INTEGER`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN open_issues INTEGER`) } catch {}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|Phase 3)"
```

Expected: all tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add electron/db.ts electron/db.test.ts
git commit -m "feat: add discovered_at, discover_query, watchers, size columns to repos"
```

---

## Task 3: GitHub API helpers

**Files:**
- Modify: `electron/github.ts`
- Modify: `electron/github.test.ts`

Changes needed:
1. `githubHeaders` accepts `string | null` and omits `Authorization` when null
2. `GitHubRepo` interface extended with `watchers_count`, `size`, `open_issues_count`
3. `getRepo` signature updated to `token: string | null`
4. New `searchRepos` function (search response type inlined as `{ items: GitHubRepo[] }`)
5. New `GitHubRelease` interface and `getReleases` function
6. New `getReadme` function

- [ ] **Step 1: Write failing tests for new functionality**

Add to `electron/github.test.ts`:

```ts
describe('searchRepos', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns items from search API', async () => {
    const items = [{ id: 1, name: 'repo1', owner: { login: 'alice' }, stargazers_count: 500 }]
    mockFetch.mockResolvedValue(makeResponse({ items }))
    const result = await searchRepos(null, 'stars:>1000')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('repo1')
  })

  it('omits Authorization when token is null', async () => {
    mockFetch.mockResolvedValue(makeResponse({ items: [] }))
    await searchRepos(null, 'stars:>1000')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBeUndefined()
  })

  it('includes Authorization when token is provided', async () => {
    mockFetch.mockResolvedValue(makeResponse({ items: [] }))
    await searchRepos('tok', 'stars:>1000')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer tok')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, {}, false))
    await expect(searchRepos(null, 'q')).rejects.toThrow('GitHub API error: 401')
  })
})

describe('getReadme', () => {
  beforeEach(() => mockFetch.mockReset())

  it('base64-decodes content and returns markdown string', async () => {
    const content = Buffer.from('# Hello').toString('base64')
    mockFetch.mockResolvedValue(makeResponse({ content, encoding: 'base64' }))
    const result = await getReadme(null, 'alice', 'repo')
    expect(result).toBe('# Hello')
  })

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) })
    const result = await getReadme(null, 'alice', 'repo')
    expect(result).toBeNull()
  })

  it('throws on other non-ok responses', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, {}, false))
    await expect(getReadme(null, 'alice', 'repo')).rejects.toThrow('GitHub API error: 401')
  })
})

describe('getReleases', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns releases array', async () => {
    const releases = [{ tag_name: 'v1.0', name: 'Release 1', published_at: '2024-01-01', body: null }]
    mockFetch.mockResolvedValue(makeResponse(releases))
    const result = await getReleases(null, 'alice', 'repo')
    expect(result).toHaveLength(1)
    expect(result[0].tag_name).toBe('v1.0')
  })

  it('omits Authorization when token is null', async () => {
    mockFetch.mockResolvedValue(makeResponse([]))
    await getReleases(null, 'alice', 'repo')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBeUndefined()
  })
})
```

Also update the import line at the top of `github.test.ts` to import the new functions:
```ts
import { getUser, getStarred, exchangeCode, getRepo, searchRepos, getReadme, getReleases } from './github'
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(searchRepos|getReadme|getReleases|FAIL)"
```

Expected: multiple FAIL lines for the new tests.

- [ ] **Step 3: Implement changes in github.ts**

Replace the contents of `electron/github.ts` with the following (preserving all existing exports):

```ts
export const CLIENT_ID = 'Ov23liJxy53KWDh27mQx'
const CLIENT_SECRET = '<redacted>'
const BASE = 'https://api.github.com'

export const OAUTH_URL =
  `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=read:user&redirect_uri=gitsuite://oauth/callback`

// Accept null — omit Authorization header for unauthenticated calls (60 req/hr)
function githubHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export interface GitHubUser {
  login: string
  avatar_url: string
  public_repos: number
}

export interface GitHubRepo {
  id: number
  name: string
  owner: { login: string }
  description: string | null
  language: string | null
  topics: string[]
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  size: number
  license: { spdx_id: string } | null
  homepage: string | null
  updated_at: string
}

export interface GitHubRelease {
  tag_name: string
  name: string | null
  published_at: string
  body: string | null
}

export async function getUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${BASE}/user`, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json() as Promise<GitHubUser>
}

export async function getStarred(token: string): Promise<GitHubRepo[]> {
  const results: GitHubRepo[] = []
  let url: string | null = `${BASE}/user/starred?per_page=100`
  let pagesFetched = 0

  while (url && pagesFetched < 10) {
    const res = await fetch(url, { headers: githubHeaders(token) })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
    const data = (await res.json()) as GitHubRepo[]
    results.push(...data)
    pagesFetched++
    const link = res.headers.get('Link') ?? ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }

  return results
}

export async function getRepo(token: string | null, owner: string, name: string): Promise<GitHubRepo> {
  const res = await fetch(`${BASE}/repos/${owner}/${name}`, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json() as Promise<GitHubRepo>
}

export async function searchRepos(token: string | null, query: string): Promise<GitHubRepo[]> {
  const url = `${BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=18`
  const res = await fetch(url, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = (await res.json()) as { items: GitHubRepo[] }
  return data.items
}

export async function getReadme(token: string | null, owner: string, name: string): Promise<string | null> {
  const res = await fetch(`${BASE}/repos/${owner}/${name}/readme`, { headers: githubHeaders(token) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = (await res.json()) as { content: string; encoding: string }
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

export async function getReleases(token: string | null, owner: string, name: string): Promise<GitHubRelease[]> {
  const res = await fetch(`${BASE}/repos/${owner}/${name}/releases?per_page=10`, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json() as Promise<GitHubRelease[]>
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  })
  if (!res.ok) throw new Error(`OAuth exchange failed: ${res.status}`)
  const data = (await res.json()) as { access_token?: string; error_description?: string }
  if (!data.access_token) {
    throw new Error(data.error_description ?? 'OAuth exchange failed')
  }
  return data.access_token
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗)"
```

Expected: all tests pass including the new `searchRepos`, `getReadme`, `getReleases` tests.

- [ ] **Step 5: Commit**

```bash
git add electron/github.ts electron/github.test.ts
git commit -m "feat: add searchRepos, getReadme, getReleases; githubHeaders accepts null token"
```

---

## Task 4: RepoRow type + env.d.ts update

**Files:**
- Create: `src/types/repo.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Create src/types/repo.ts**

Create the file `src/types/repo.ts`:

```ts
/** Mirrors the `repos` SQLite table schema. All IPC handlers that return repo data use this shape. */
export interface RepoRow {
  id: string
  owner: string
  name: string
  description: string | null
  language: string | null
  topics: string           // JSON string, e.g. '["cli","rust"]'
  stars: number | null
  forks: number | null
  license: string | null
  homepage: string | null
  updated_at: string | null
  saved_at: string | null
  type: string | null
  banner_svg: string | null
  discovered_at: string | null
  discover_query: string | null
  watchers: number | null
  size: number | null
  open_issues: number | null
}

export interface ReleaseRow {
  tag_name: string
  name: string | null
  published_at: string
  body: string | null
}

/** Parse the JSON topics string from a RepoRow into a string array. */
export function parseTopics(topics: string | null): string[] {
  if (!topics) return []
  try { return JSON.parse(topics) as string[] } catch { return [] }
}

/** Format a star count: 76200 → "76.2k", 500 → "500" */
export function formatStars(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
```

- [ ] **Step 2: Update src/env.d.ts with new API channels**

Replace the file `src/env.d.ts`:

```ts
import type { RepoRow, ReleaseRow } from './types/repo'

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
      }
    }
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/repo.ts src/env.d.ts
git commit -m "feat: RepoRow type and updated window.api type declarations"
```

---

## Task 5: IPC handlers in main.ts

**Files:**
- Modify: `electron/main.ts`

Add 6 new `ipcMain.handle` entries. The key correctness requirements are:
- `searchRepos` upsert uses `saved_at = repos.saved_at` (preserves user saves)
- `getRepo` upsert preserves `discovered_at`, `discover_query`, and `saved_at`
- Both handlers return DB row objects (not raw API objects)
- `getReleases` IPC handler must **not** swallow errors — let them propagate to the renderer so the "Failed to load releases." error state is shown
- `saved_at = repos.saved_at` requires SQLite ≥ 3.35 (released 2021). `better-sqlite3` ships its own SQLite binary so this is always met in production, but worth noting if running tests with a system SQLite.

- [ ] **Step 1: Add import for new github helpers**

At the top of `electron/main.ts`, update the github import line:

```ts
import { OAUTH_URL, exchangeCode, getUser, getStarred, getRepo, searchRepos, getReadme, getReleases } from './github'
```

- [ ] **Step 2: Add the 6 IPC handlers**

Add these handlers after the existing `github:disconnect` handler in `electron/main.ts`:

```ts
ipcMain.handle('github:searchRepos', async (_event, query: string) => {
  const db = getDb(app.getPath('userData'))
  const cacheKey = `discover:${query}`
  const cacheRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(cacheKey) as
    | { value: string }
    | undefined

  if (cacheRow && Date.now() - Number(cacheRow.value) < 7_200_000) {
    return db.prepare('SELECT * FROM repos WHERE discover_query = ?').all(query)
  }

  const token = getToken() ?? null
  const items = await searchRepos(token, query)
  const now = String(Date.now())

  const upsert = db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                       homepage, updated_at, saved_at, type, banner_svg,
                       discovered_at, discover_query, watchers, size, open_issues)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, name) DO UPDATE SET
      id             = excluded.id,
      description    = excluded.description,
      language       = excluded.language,
      topics         = excluded.topics,
      stars          = excluded.stars,
      forks          = excluded.forks,
      updated_at     = excluded.updated_at,
      discovered_at  = excluded.discovered_at,
      discover_query = excluded.discover_query,
      watchers       = excluded.watchers,
      size           = excluded.size,
      open_issues    = excluded.open_issues,
      saved_at       = repos.saved_at
  `)

  db.transaction(() => {
    for (const repo of items) {
      upsert.run(
        String(repo.id), repo.owner.login, repo.name, repo.description, repo.language,
        JSON.stringify(repo.topics ?? []), repo.stargazers_count, repo.forks_count,
        repo.license?.spdx_id ?? null, repo.homepage, repo.updated_at,
        now, query, repo.watchers_count, repo.size, repo.open_issues_count,
      )
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(cacheKey, now)
  })()

  return db.prepare('SELECT * FROM repos WHERE discover_query = ?').all(query)
})

ipcMain.handle('github:getRepo', async (_event, owner: string, name: string) => {
  const token = getToken() ?? null
  const db = getDb(app.getPath('userData'))
  const repo = await getRepo(token, owner, name)

  db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                       homepage, updated_at, saved_at, type, banner_svg,
                       discovered_at, discover_query, watchers, size, open_issues)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
    ON CONFLICT(owner, name) DO UPDATE SET
      id             = excluded.id,
      description    = excluded.description,
      language       = excluded.language,
      topics         = excluded.topics,
      stars          = excluded.stars,
      forks          = excluded.forks,
      updated_at     = excluded.updated_at,
      watchers       = excluded.watchers,
      size           = excluded.size,
      open_issues    = excluded.open_issues,
      saved_at       = repos.saved_at,
      discovered_at  = repos.discovered_at,
      discover_query = repos.discover_query
  `).run(
    String(repo.id), owner, name, repo.description, repo.language,
    JSON.stringify(repo.topics ?? []), repo.stargazers_count, repo.forks_count,
    repo.license?.spdx_id ?? null, repo.homepage, repo.updated_at,
    repo.watchers_count, repo.size, repo.open_issues_count,
  )

  return db.prepare('SELECT * FROM repos WHERE owner = ? AND name = ?').get(owner, name)
})

ipcMain.handle('github:getReadme', async (_event, owner: string, name: string) => {
  const token = getToken() ?? null
  return getReadme(token, owner, name)
})

ipcMain.handle('github:getReleases', async (_event, owner: string, name: string) => {
  const token = getToken() ?? null
  return getReleases(token, owner, name)  // errors propagate to renderer → "Failed to load releases." UI state
})

ipcMain.handle('github:saveRepo', async (_event, owner: string, name: string) => {
  const db = getDb(app.getPath('userData'))
  db.prepare('UPDATE repos SET saved_at = ? WHERE owner = ? AND name = ?')
    .run(new Date().toISOString(), owner, name)
})

ipcMain.handle('github:getSavedRepos', async () => {
  const db = getDb(app.getPath('userData'))
  return db.prepare('SELECT owner, name FROM repos WHERE saved_at IS NOT NULL').all()
})
```

- [ ] **Step 3: Add getRelatedRepos IPC handler**

Add this handler after `github:getSavedRepos` in `electron/main.ts`:

```ts
ipcMain.handle('github:getRelatedRepos', async (_event, owner: string, name: string, topicsJson: string) => {
  const db = getDb(app.getPath('userData'))
  const topics: string[] = (() => { try { return JSON.parse(topicsJson) } catch { return [] } })()
  const capped = topics.slice(0, 5)
  if (capped.length === 0) return []

  const rows: Record<string, unknown>[] = []
  for (const topic of capped) {
    const found = db.prepare(
      `SELECT * FROM repos WHERE topics LIKE ? AND NOT (owner = ? AND name = ?) LIMIT 10`
    ).all(`%"${topic}"%`, owner, name) as Record<string, unknown>[]
    rows.push(...found)
  }

  const seen = new Set<string>()
  return rows
    .filter((r) => {
      const key = `${r.owner}/${r.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => ((b.stars as number) ?? 0) - ((a.stars as number) ?? 0))
    .slice(0, 3)
})
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add searchRepos, getRepo, getReadme, getReleases, saveRepo, getSavedRepos, getRelatedRepos IPC handlers"
```

---

## Task 5b: IPC upsert integration tests

**Files:**
- Create: `electron/upsert.test.ts`

Tests for the critical SQL correctness requirements of the new IPC handlers — specifically cache freshness and `saved_at` preservation. These use `better-sqlite3` directly (same pattern as `db.test.ts`) to verify the upsert logic without needing Electron.

- [ ] **Step 1: Create electron/upsert.test.ts**

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  initSchema(db)
})

afterEach(() => db.close())

function insertRepo(overrides: Partial<Record<string, unknown>> = {}) {
  const defaults = {
    id: '1', owner: 'alice', name: 'foo', description: null, language: 'Python',
    topics: '[]', stars: 100, forks: 10, license: null, homepage: null,
    updated_at: '2024-01-01', saved_at: null, type: null, banner_svg: null,
    discovered_at: null, discover_query: null, watchers: null, size: null, open_issues: null,
  }
  const row = { ...defaults, ...overrides }
  db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                       homepage, updated_at, saved_at, type, banner_svg, discovered_at,
                       discover_query, watchers, size, open_issues)
    VALUES (@id, @owner, @name, @description, @language, @topics, @stars, @forks, @license,
            @homepage, @updated_at, @saved_at, @type, @banner_svg, @discovered_at,
            @discover_query, @watchers, @size, @open_issues)
  `).run(row)
}

describe('searchRepos upsert — saved_at preservation', () => {
  it('preserves saved_at when the same repo appears in a discover search', () => {
    // Simulate a previously-saved repo
    insertRepo({ saved_at: '2024-06-01T00:00:00Z' })

    // Simulate what searchRepos upsert does
    db.prepare(`
      INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                         homepage, updated_at, saved_at, type, banner_svg,
                         discovered_at, discover_query, watchers, size, open_issues)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)
      ON CONFLICT(owner, name) DO UPDATE SET
        id             = excluded.id,
        description    = excluded.description,
        language       = excluded.language,
        topics         = excluded.topics,
        stars          = excluded.stars,
        forks          = excluded.forks,
        updated_at     = excluded.updated_at,
        discovered_at  = excluded.discovered_at,
        discover_query = excluded.discover_query,
        watchers       = excluded.watchers,
        size           = excluded.size,
        open_issues    = excluded.open_issues,
        saved_at       = repos.saved_at
    `).run('1', 'alice', 'foo', 'desc', 'Python', '[]', 200, 20, null, null,
           '2024-07-01', '2024-07-01T00:00:00Z', 'stars:>1000', 5, 1024, 3)

    const row = db.prepare('SELECT saved_at, stars FROM repos WHERE owner = ? AND name = ?').get('alice', 'foo') as Record<string, unknown>
    expect(row.saved_at).toBe('2024-06-01T00:00:00Z')  // preserved
    expect(row.stars).toBe(200)  // updated
  })
})

describe('getRepo upsert — preserves discovered_at and saved_at', () => {
  it('does not overwrite discovered_at or saved_at when re-fetching a repo', () => {
    insertRepo({ discovered_at: '2024-05-01T00:00:00Z', discover_query: 'stars:>1000', saved_at: '2024-06-01T00:00:00Z' })

    // Simulate what getRepo upsert does
    db.prepare(`
      INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                         homepage, updated_at, saved_at, type, banner_svg,
                         discovered_at, discover_query, watchers, size, open_issues)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
      ON CONFLICT(owner, name) DO UPDATE SET
        id             = excluded.id,
        description    = excluded.description,
        language       = excluded.language,
        topics         = excluded.topics,
        stars          = excluded.stars,
        forks          = excluded.forks,
        updated_at     = excluded.updated_at,
        watchers       = excluded.watchers,
        size           = excluded.size,
        open_issues    = excluded.open_issues,
        saved_at       = repos.saved_at,
        discovered_at  = repos.discovered_at,
        discover_query = repos.discover_query
    `).run('1', 'alice', 'foo', 'updated desc', 'Python', '[]', 300, 30, null, null, '2024-08-01', 10, 2048, 5)

    const row = db.prepare('SELECT * FROM repos WHERE owner = ? AND name = ?').get('alice', 'foo') as Record<string, unknown>
    expect(row.saved_at).toBe('2024-06-01T00:00:00Z')       // preserved
    expect(row.discovered_at).toBe('2024-05-01T00:00:00Z')  // preserved
    expect(row.discover_query).toBe('stars:>1000')           // preserved
    expect(row.stars).toBe(300)                              // updated
  })
})

describe('saveRepo UPDATE', () => {
  it('sets saved_at on an existing row', () => {
    insertRepo()
    const ts = '2024-09-01T12:00:00.000Z'
    db.prepare('UPDATE repos SET saved_at = ? WHERE owner = ? AND name = ?').run(ts, 'alice', 'foo')
    const row = db.prepare('SELECT saved_at FROM repos WHERE owner = ? AND name = ?').get('alice', 'foo') as Record<string, unknown>
    expect(row.saved_at).toBe(ts)
  })

  it('no-ops silently when row does not exist', () => {
    const info = db.prepare('UPDATE repos SET saved_at = ? WHERE owner = ? AND name = ?').run('2024-01-01', 'ghost', 'missing')
    expect(info.changes).toBe(0)
  })
})

describe('discover cache key', () => {
  it('stores and retrieves a cache timestamp from settings', () => {
    const key = 'discover:stars:>1000'
    const now = String(Date.now())
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, now)
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string }
    expect(Number(row.value)).toBeCloseTo(Number(now), -3)
  })
})
```

- [ ] **Step 2: Run the new tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(upsert|PASS|FAIL)"
```

Expected: all 5 new integration tests pass.

- [ ] **Step 3: Commit**

```bash
git add electron/upsert.test.ts
git commit -m "test: IPC upsert integration tests — cache, saved_at preservation, saveRepo"
```

---

## Task 6: Preload — expose new channels

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add new channels to preload.ts**

Replace the `github` block in `electron/preload.ts`:

```ts
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: expose searchRepos, getRepo, getReadme, getReleases, saveRepo, getSavedRepos in preload"
```

---

## Task 7: SavedReposContext + App.tsx wiring

**Files:**
- Create: `src/contexts/SavedRepos.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/contexts/SavedRepos.tsx**

```tsx
import { createContext, useContext, useEffect, useState, useRef } from 'react'

interface SavedReposContextValue {
  isSaved: (owner: string, name: string) => boolean
  saveRepo: (owner: string, name: string) => Promise<void>
  loading: boolean
}

const SavedReposContext = createContext<SavedReposContextValue>({
  isSaved: () => false,
  saveRepo: async () => {},
  loading: true,
})

export function SavedReposProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const setRef = useRef(saved)
  setRef.current = saved

  useEffect(() => {
    window.api.github.getSavedRepos()
      .then((rows) => {
        setSaved(new Set(rows.map((r) => `${r.owner}/${r.name}`)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const isSaved = (owner: string, name: string) => setRef.current.has(`${owner}/${name}`)

  const saveRepo = async (owner: string, name: string) => {
    const key = `${owner}/${name}`
    setSaved((prev) => new Set([...prev, key]))  // optimistic
    await window.api.github.saveRepo(owner, name)
  }

  return (
    <SavedReposContext.Provider value={{ isSaved, saveRepo, loading }}>
      {children}
    </SavedReposContext.Provider>
  )
}

export function useSavedRepos() {
  return useContext(SavedReposContext)
}
```

- [ ] **Step 2: Update src/App.tsx to wrap with SavedReposProvider**

Replace the `App` default export in `src/App.tsx`:

```tsx
import { SavedReposProvider } from './contexts/SavedRepos'
// ... (keep all other existing imports)

export default function App() {
  return (
    <MemoryRouter
      initialEntries={['/discover']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SavedReposProvider>
        <AppContent />
      </SavedReposProvider>
    </MemoryRouter>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/SavedRepos.tsx src/App.tsx
git commit -m "feat: SavedReposContext — track saved repos across views"
```

---

## Task 8: BannerSVG component

**Files:**
- Create: `src/components/BannerSVG.tsx`

This is a pure function component that generates a unique deterministic SVG for each repo. Uses djb2 hash as a seed, then an LCG PRNG for element variation. No DB writes in Phase 3.

- [ ] **Step 1: Create src/components/BannerSVG.tsx**

```tsx
import React from 'react'

export interface BannerSVGProps {
  owner: string
  name: string
  language: string
  topics: string[]
  size: 'card' | 'detail'
}

// ── Language configuration ───────────────────────────────────────
export interface LangConfig {
  bg: string
  primary: string
  secondary: string
  abbr: string
}

const LANG_MAP: Record<string, LangConfig> = {
  Python:     { bg: '#050d12', primary: '#0e9bbf', secondary: '#1ab8d8', abbr: 'Py' },
  TypeScript: { bg: '#080608', primary: '#a78bfa', secondary: '#7c3aed', abbr: 'Ts' },
  JavaScript: { bg: '#080600', primary: '#facc15', secondary: '#eab308', abbr: 'Js' },
  Rust:       { bg: '#090404', primary: '#f87171', secondary: '#dc2626', abbr: 'Rs' },
  Go:         { bg: '#020905', primary: '#4ade80', secondary: '#16a34a', abbr: 'Go' },
}

const ML_CONFIG: LangConfig  = { bg: '#07030f', primary: '#a78bfa', secondary: '#7c3aed', abbr: 'ML' }
const CLI_CONFIG: LangConfig = { bg: '#080810', primary: '#7c3aed', secondary: '#534AB7', abbr: 'CL' }
const GEN_CONFIG: LangConfig = { bg: '#080810', primary: '#7c3aed', secondary: '#534AB7', abbr: '—' }

export function getLangConfig(language: string, topics: string[]): LangConfig {
  const t = topics.map((x) => x.toLowerCase())
  if (t.some((x) => ['machine-learning', 'deep-learning', 'nlp', 'data'].includes(x))) return ML_CONFIG
  if (t.some((x) => ['cli', 'tui', 'command-line'].includes(x))) return CLI_CONFIG
  return LANG_MAP[language] ?? GEN_CONFIG
}

// ── Seeded PRNG ───────────────────────────────────────────────────
function djb2(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
  return h
}

function makePrng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// ── Pattern generators ────────────────────────────────────────────
type Rng = () => number

function patternNodes(rng: Rng, w: number, h: number, primary: string, secondary: string): React.ReactNode[] {
  const count = 7 + Math.floor(rng() * 5)
  const nodes: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) nodes.push({ x: rng() * w, y: rng() * h * 0.85 })
  const labels = ['GET', 'POST', 'PUT', 'DEL']
  const lines: React.ReactNode[] = []
  nodes.forEach((a, i) => {
    nodes.forEach((b, j) => {
      if (j > i && rng() > 0.6) {
        lines.push(<line key={`l${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={primary} strokeWidth="0.5" strokeOpacity="0.35" />)
      }
    })
  })
  const dots = nodes.map((n, i) => (
    <g key={`n${i}`}>
      <circle cx={n.x} cy={n.y} r={2.5 + rng() * 2} fill={i % 2 === 0 ? primary : secondary} fillOpacity="0.6" />
      {i < 4 && <text x={n.x + 4} y={n.y + 3} fontSize="4" fill={primary} fillOpacity="0.5" fontFamily="monospace">{labels[i]}</text>}
    </g>
  ))
  return [...lines, ...dots]
}

function patternRects(rng: Rng, w: number, h: number, primary: string): React.ReactNode[] {
  const count = 4 + Math.floor(rng() * 4)
  const labels = ['Button', 'Form', 'Modal', 'Card', 'Input', 'Table', 'Menu']
  const rects: React.ReactNode[] = []
  for (let i = 0; i < count; i++) {
    const rw = 30 + rng() * 60
    const rh = 12 + rng() * 20
    const x = rng() * (w - rw)
    const y = rng() * (h * 0.8 - rh)
    rects.push(
      <g key={`r${i}`}>
        <rect x={x} y={y} width={rw} height={rh} fill="none" stroke={primary} strokeWidth="0.5" strokeOpacity="0.3" rx="1" />
        <text x={x + 3} y={y + 8} fontSize="4" fill={primary} fillOpacity="0.4" fontFamily="monospace">{labels[i % labels.length]}</text>
      </g>
    )
  }
  return rects
}

function patternPolygons(rng: Rng, w: number, h: number, primary: string, secondary: string): React.ReactNode[] {
  const shapes: React.ReactNode[] = []
  for (let i = 0; i < 6; i++) {
    const cx = rng() * w
    const cy = rng() * h * 0.85
    const size = 8 + rng() * 14
    const sides = rng() > 0.5 ? 3 : (rng() > 0.5 ? 4 : 6)
    const pts = Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2 - Math.PI / 2
      return `${cx + Math.cos(a) * size},${cy + Math.sin(a) * size}`
    }).join(' ')
    shapes.push(<polygon key={`p${i}`} points={pts} fill="none" stroke={i % 2 === 0 ? primary : secondary} strokeWidth="0.6" strokeOpacity="0.35" />)
  }
  return shapes
}

function patternCircles(rng: Rng, w: number, h: number, primary: string, secondary: string): React.ReactNode[] {
  const count = 8 + Math.floor(rng() * 5)
  const circles: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < count; i++) circles.push({ x: rng() * w, y: rng() * h * 0.85, r: 4 + rng() * 14 })
  const lines: React.ReactNode[] = []
  circles.forEach((a, i) => {
    circles.forEach((b, j) => {
      if (j > i && rng() > 0.65) {
        lines.push(<line key={`cl${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={primary} strokeWidth="0.4" strokeOpacity="0.2" />)
      }
    })
  })
  const dots = circles.map((c, i) => (
    <circle key={`c${i}`} cx={c.x} cy={c.y} r={c.r} fill={i % 2 === 0 ? primary : secondary} fillOpacity={0.08 + rng() * 0.12} stroke={primary} strokeWidth="0.4" strokeOpacity="0.3" />
  ))
  return [...lines, ...dots]
}

function patternGrid(rng: Rng, w: number, h: number, primary: string): React.ReactNode[] {
  const cols = 8, rows = 5
  const cellW = w / (cols + 2), cellH = (h * 0.75) / rows
  const cells: React.ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const opacity = 0.05 + rng() * 0.4
      cells.push(<rect key={`g${r}-${c}`} x={cellW + c * cellW} y={h * 0.05 + r * cellH} width={cellW * 0.8} height={cellH * 0.8} fill={primary} fillOpacity={opacity} />)
    }
  }
  return cells
}

function patternTerminal(rng: Rng, w: number, h: number, primary: string): React.ReactNode[] {
  const boxes: React.ReactNode[] = []
  const cmds = ['run', 'build', 'test', 'deploy', 'lint', 'check']
  for (let i = 0; i < 3; i++) {
    const bw = 40 + rng() * 50
    const bh = 18 + rng() * 12
    const x = 4 + rng() * (w - bw - 8)
    const y = 6 + i * (h * 0.28)
    boxes.push(
      <g key={`t${i}`}>
        <rect x={x} y={y} width={bw} height={bh} fill="none" stroke={primary} strokeWidth="0.6" strokeOpacity="0.4" />
        <text x={x + 3} y={y + 8} fontSize="4.5" fill={primary} fillOpacity="0.5" fontFamily="monospace">$ {cmds[(i + Math.floor(rng() * 3)) % cmds.length]}</text>
        <text x={x + 3} y={y + 14} fontSize="3.5" fill={primary} fillOpacity="0.25" fontFamily="monospace">{'──────────'}</text>
      </g>
    )
  }
  return boxes
}

function patternGeneric(rng: Rng, w: number, h: number, primary: string, secondary: string): React.ReactNode[] {
  const count = 10 + Math.floor(rng() * 6)
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) pts.push({ x: rng() * w, y: rng() * h * 0.85 })
  const lines: React.ReactNode[] = []
  pts.forEach((a, i) => {
    pts.forEach((b, j) => {
      if (j > i && rng() > 0.75) {
        lines.push(<line key={`gl${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={primary} strokeWidth="0.4" strokeOpacity="0.25" />)
      }
    })
  })
  const dots = pts.map((p, i) => (
    <circle key={`gd${i}`} cx={p.x} cy={p.y} r={1.5 + rng() * 1.5} fill={i % 2 === 0 ? primary : secondary} fillOpacity="0.5" />
  ))
  return [...lines, ...dots]
}

// ── Bottom-edge monospace label fragments ─────────────────────────
const LANG_LABELS: Record<string, string[]> = {
  Python:     ['async def', 'pydantic', 'def __init__'],
  TypeScript: ['interface', 'useState', ':React.FC'],
  JavaScript: ['async/await', '=>', 'module.exports'],
  Rust:       ['fn main()', 'impl', 'match'],
  Go:         ['Model', 'Update', 'View'],
}
const ML_LABELS  = ['attention', 'embeddings', 'nn.Module']
const CLI_LABELS = ['--help', 'stdin', 'Arg::new']

function getLabels(language: string, topics: string[]): string[] {
  const t = topics.map((x) => x.toLowerCase())
  if (t.some((x) => ['machine-learning', 'deep-learning', 'nlp', 'data'].includes(x))) return ML_LABELS
  if (t.some((x) => ['cli', 'tui', 'command-line'].includes(x))) return CLI_LABELS
  return LANG_LABELS[language] ?? []
}

// ── Main component ────────────────────────────────────────────────
export default function BannerSVG({ owner, name, language, topics, size }: BannerSVGProps) {
  const seed = djb2(`${owner}/${name}`)
  const rng = makePrng(seed)
  const cfg = getLangConfig(language, topics)
  const [w, h] = size === 'card' ? [260, 72] : [500, 175]
  const vb = `0 0 ${w} ${h}`

  let pattern: React.ReactNode[]
  const lang = language ?? ''
  const t = topics.map((x) => x.toLowerCase())
  if (t.some((x) => ['machine-learning', 'deep-learning', 'nlp', 'data'].includes(x))) {
    pattern = patternGrid(rng, w, h, cfg.primary)
  } else if (t.some((x) => ['cli', 'tui', 'command-line'].includes(x))) {
    pattern = patternTerminal(rng, w, h, cfg.primary)
  } else if (lang === 'Python') {
    pattern = patternNodes(rng, w, h, cfg.primary, cfg.secondary)
  } else if (lang === 'TypeScript' || lang === 'JavaScript') {
    pattern = patternRects(rng, w, h, cfg.primary)
  } else if (lang === 'Rust') {
    pattern = patternPolygons(rng, w, h, cfg.primary, cfg.secondary)
  } else if (lang === 'Go') {
    pattern = patternCircles(rng, w, h, cfg.primary, cfg.secondary)
  } else {
    pattern = patternGeneric(rng, w, h, cfg.primary, cfg.secondary)
  }

  const labels = getLabels(language, topics)
  const labelSpacing = w / (labels.length + 1)

  return (
    <svg
      viewBox={vb}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width={w} height={h} fill={cfg.bg} />

      {/* Pattern */}
      {pattern}

      {/* Monospace label fragments — bottom edge */}
      {labels.map((label, i) => (
        <text
          key={label}
          x={labelSpacing * (i + 1)}
          y={h - 4}
          fontSize={size === 'detail' ? 7 : 5}
          fill={cfg.primary}
          fillOpacity="0.12"
          fontFamily="monospace"
          textAnchor="middle"
        >
          {label}
        </text>
      ))}

      {/* Gradient scrim — ensures overlay text is always legible */}
      <defs>
        <linearGradient id={`scrim-${owner}-${name}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(10,10,14,0)" />
          <stop offset="100%" stopColor="rgba(10,10,14,0.82)" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#scrim-${owner}-${name})`} />
    </svg>
  )
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BannerSVG.tsx
git commit -m "feat: BannerSVG — deterministic SVG banners with language patterns and gradient scrim"
```

---

## Task 9: Discover and RepoDetail CSS

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Append Discover and RepoDetail styles to globals.css**

Append the following to the end of `src/styles/globals.css`:

```css
/* ── Discover ───────────────────────────────────────────────────── */

.discover {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.discover-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 10px 18px;
  flex-shrink: 0;
}

.discover-search {
  flex: 1;
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 5px;
  padding: 7px 12px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--t1);
  outline: none;
}
.discover-search::placeholder { color: var(--t3); }
.discover-search:focus { border-color: var(--accent-border); }

.discover-sort-btn {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 7px 11px;
  font-size: 11px;
  color: var(--t2);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}
.discover-sort-btn.active { color: #a78bfa; border-color: var(--accent-border); }

.discover-chips {
  display: flex;
  gap: 5px;
  padding: 12px 18px;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
}
.discover-chips::-webkit-scrollbar { display: none; }

.discover-chip {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  border: 1px solid var(--border);
  color: var(--t3);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  background: none;
  flex-shrink: 0;
}
.discover-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: #a78bfa;
}

.discover-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 18px 24px;
}

.discover-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 9px;
  color: var(--t3);
  letter-spacing: 0.13em;
  text-transform: uppercase;
  padding: 12px 0 10px;
}
.discover-section-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}

.discover-status {
  font-size: 11px;
  color: var(--t2);
  padding: 24px 0;
  text-align: center;
}

.discover-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

/* ── Repo Card ──────────────────────────────────────────────────── */

.repo-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.repo-card:hover { border-color: var(--border2); background: var(--bg4); }

.repo-card-banner {
  position: relative;
  height: 72px;
  overflow: hidden;
  flex-shrink: 0;
}

.repo-card-lang-badge {
  position: absolute;
  top: 7px;
  left: 8px;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  z-index: 2;
  pointer-events: none;
}

.repo-card-body {
  padding: 10px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}

.repo-card-title-row { display: flex; flex-direction: column; gap: 1px; }
.repo-card-name { font-size: 11px; font-weight: 700; color: var(--t1); }
.repo-card-owner { font-size: 9px; color: var(--t2); }

.repo-card-desc {
  font-size: 10px;
  color: var(--t2);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.repo-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  min-height: 14px;
}
.repo-card-tag {
  font-size: 8px;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid var(--border);
  color: var(--t3);
}

.repo-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 4px;
}

.repo-card-stars {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--t2);
}

.save-btn {
  background: transparent;
  border: 1px solid var(--accent-border);
  color: #a78bfa;
  font-size: 9px;
  padding: 3px 9px;
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
}
.save-btn.saved {
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.2);
  color: #34d399;
  pointer-events: none;
}

/* ── Repo Detail ────────────────────────────────────────────────── */

.repo-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.repo-detail-breadcrumb {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 9px 20px;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.repo-detail-breadcrumb-link { color: var(--t2); cursor: pointer; background: none; border: none; font-size: 10px; font-family: inherit; padding: 0; }
.repo-detail-breadcrumb-link:hover { color: var(--t1); }
.repo-detail-breadcrumb-sep { color: var(--t3); opacity: 0.4; }
.repo-detail-breadcrumb-current { color: var(--t1); }

.repo-detail-banner {
  position: relative;
  height: 175px;
  flex-shrink: 0;
  overflow: hidden;
}

.repo-detail-banner-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  padding: 16px 22px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  z-index: 2;
}

.repo-detail-lang-badge-lg {
  width: 38px;
  height: 38px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.repo-detail-banner-title { display: flex; flex-direction: column; gap: 2px; }
.repo-detail-banner-name {
  font-size: 20px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 4px rgba(0,0,0,0.6);
  line-height: 1.1;
}
.repo-detail-banner-owner { font-size: 10px; color: rgba(255,255,255,0.45); }

.repo-detail-stats-bar {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 10px 22px;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 10px;
  color: var(--t2);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.repo-detail-stat-value { color: var(--t1); font-weight: 700; }
.repo-detail-stat-sep { color: var(--t3); opacity: 0.4; }

.repo-detail-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.repo-detail-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.repo-detail-tabs {
  display: flex;
  padding: 0 22px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.repo-detail-tab {
  padding: 9px 14px;
  font-size: 11px;
  color: var(--t2);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.repo-detail-tab.active { color: #a78bfa; border-bottom-color: var(--accent); }

.repo-detail-tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
}

.repo-detail-placeholder {
  font-size: 11px;
  color: var(--t2);
}

/* Markdown styles */
.repo-md { font-size: 11px; line-height: 1.7; color: var(--t2); }
.repo-md h1 { font-size: 16px; color: var(--t1); margin: 0 0 12px; }
.repo-md h2 { font-size: 13px; color: var(--t1); margin: 16px 0 8px; }
.repo-md h3 { font-size: 11px; color: var(--t1); margin: 12px 0 6px; }
.repo-md p { margin: 0 0 10px; }
.repo-md a { color: #a78bfa; text-decoration: none; }
.repo-md a:hover { text-decoration: underline; }
.repo-md strong { color: var(--t1); font-weight: 700; }
.repo-md pre {
  background: var(--bg4);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 0 0 10px;
}
.repo-md code { color: #a78bfa; font-size: 10px; font-family: 'JetBrains Mono', monospace; }
.repo-md pre code { color: #a78bfa; font-size: 10px; }
.repo-md ul, .repo-md ol { padding-left: 18px; margin: 0 0 10px; }
.repo-md li { margin-bottom: 3px; }
.repo-md table { border-collapse: collapse; width: 100%; margin: 0 0 10px; font-size: 10px; }
.repo-md th, .repo-md td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; }
.repo-md th { background: var(--bg4); color: var(--t1); }
.repo-md blockquote {
  border-left: 3px solid var(--accent);
  padding: 4px 12px;
  margin: 0 0 10px;
  color: var(--t2);
}

/* Releases */
.repo-releases { display: flex; flex-direction: column; gap: 12px; }
.repo-release-item {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 14px;
}
.repo-release-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.repo-release-tag { font-size: 11px; font-weight: 700; color: #a78bfa; }
.repo-release-name { font-size: 10px; color: var(--t1); }
.repo-release-date { font-size: 9px; color: var(--t3); margin-left: auto; }
.repo-release-body { font-size: 9px; color: var(--t2); line-height: 1.5; white-space: pre-wrap; }

/* ── Repo Detail Sidebar ────────────────────────────────────────── */

.repo-detail-sidebar {
  width: 220px;
  min-width: 220px;
  border-left: 1px solid var(--border);
  background: var(--bg2);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  overflow-y: auto;
}

.save-btn-full {
  width: 100%;
  padding: 10px;
  font-size: 11px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--accent-border);
  color: #a78bfa;
  cursor: pointer;
  font-family: inherit;
}
.save-btn-full.saved {
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.2);
  color: #34d399;
  pointer-events: none;
}

.skill-panel {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
}
.skill-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}
.skill-panel-filename { font-size: 10px; color: var(--t2); }
.skill-panel-status { font-size: 9px; color: var(--t3); }
.skill-panel-body { padding: 12px; }
.skill-depth-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.skill-depth-label { font-size: 9px; color: var(--t3); width: 52px; flex-shrink: 0; }
.skill-depth-meta { font-size: 8px; color: var(--t3); width: 52px; text-align: right; }
.skill-depth-track {
  flex: 1;
  height: 3px;
  background: var(--bg4);
  border-radius: 2px;
  position: relative;
}
.skill-depth-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 3px;
  border-radius: 2px;
}
.skill-panel-note {
  font-size: 9px;
  color: var(--t3);
  line-height: 1.6;
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 4px;
}

.repo-meta-section { display: flex; flex-direction: column; gap: 6px; }
.repo-meta-label {
  font-size: 9px;
  color: var(--t3);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 2px;
}
.repo-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
}
.repo-meta-key { color: var(--t3); }
.repo-meta-val { color: var(--t2); }

.related-repos-section { display: flex; flex-direction: column; gap: 6px; }
.related-repo-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.related-repo-card:hover { border-color: var(--border2); }
.related-repo-name { font-size: 11px; color: var(--t1); }
.related-repo-desc {
  font-size: 9px;
  color: var(--t3);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.related-repo-stars { font-size: 9px; color: var(--t2); }
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: Discover and RepoDetail CSS"
```

---

## Task 10: Discover view

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Replace Discover.tsx stub**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BannerSVG, { getLangConfig } from '../components/BannerSVG'
import { useSavedRepos } from '../contexts/SavedRepos'
import { parseTopics, formatStars, type RepoRow } from '../types/repo'

const CHIPS = ['All', 'Python', 'TypeScript', 'Rust', 'Go', 'CLI', 'Web', 'Data/ML'] as const

const CHIP_QUERIES: Record<string, string> = {
  'All':        'stars:>1000',
  'Python':     'language:python+stars:>1000',
  'TypeScript': 'language:typescript+stars:>1000',
  'Rust':       'language:rust+stars:>1000',
  'Go':         'language:go+stars:>1000',
  'CLI':        'topic:cli+stars:>1000',
  'Web':        'topic:web+stars:>1000',
  'Data/ML':    'topic:machine-learning+stars:>1000',
}

// ── Star SVG icon ─────────────────────────────────────────────────
function StarIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
      <path d="M4.5 1l.9 2.7H8L5.7 5.3l.9 2.7L4.5 6.5 1.9 8l.9-2.7L.5 3.7h2.6L4.5 1z"
        fill="currentColor" />
    </svg>
  )
}

// ── Repo Card ─────────────────────────────────────────────────────
function RepoCard({ repo, onNavigate }: { repo: RepoRow; onNavigate: (path: string) => void }) {
  const { isSaved, saveRepo } = useSavedRepos()
  const saved = isSaved(repo.owner, repo.name)
  const topics = parseTopics(repo.topics)
  const cfg = getLangConfig(repo.language ?? '', topics)

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    saveRepo(repo.owner, repo.name)
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
            className={`save-btn${saved ? ' saved' : ''}`}
            onClick={handleSave}
          >
            {saved ? '✓ Saved' : '+ Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Discover view ─────────────────────────────────────────────────
export default function Discover() {
  const [repos, setRepos] = useState<RepoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeChip, setActiveChip] = useState('All')
  const [sort, setSort] = useState<'stars' | 'updated'>('stars')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const query = CHIP_QUERIES[activeChip]
    setLoading(true)
    setError(null)
    window.api.github.searchRepos(query)
      .then(setRepos)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeChip])

  const filtered = repos
    .filter((r) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) =>
      sort === 'stars'
        ? (b.stars ?? 0) - (a.stars ?? 0)
        : new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
    )

  return (
    <div className="discover">
      <div className="discover-topbar">
        <input
          className="discover-search"
          placeholder="Search repos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`discover-sort-btn${sort === 'stars' ? ' active' : ''}`}
          onClick={() => setSort('stars')}
        >
          ★ Stars
        </button>
        <button
          className={`discover-sort-btn${sort === 'updated' ? ' active' : ''}`}
          onClick={() => setSort('updated')}
        >
          Updated
        </button>
      </div>

      <div className="discover-chips">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            className={`discover-chip${activeChip === chip ? ' active' : ''}`}
            onClick={() => setActiveChip(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="discover-content">
        <div className="discover-section-header">
          <span>Trending this week</span>
          <div className="discover-section-line" />
        </div>

        {loading && <div className="discover-status">Loading…</div>}
        {error && <div className="discover-status">Failed to load — {error}</div>}
        {!loading && !error && (
          <div className="discover-grid">
            {filtered.map((repo) => (
              <RepoCard
                key={`${repo.owner}/${repo.name}`}
                repo={repo}
                onNavigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: Discover view — repo grid with search, filter chips, sort, banner cards"
```

---

## Task 11: RepoDetail view

**Files:**
- Modify: `src/views/RepoDetail.tsx`

This is the most complex view. It has lazy-loaded README + releases tabs, a sidebar with multiple panels, and a related-repos query. The `getRelatedRepos` IPC channel was already added to `main.ts`, `preload.ts`, and `env.d.ts` in Tasks 5/6/4.

**Releases fetching strategy:** Releases are fetched eagerly on mount (alongside `getRepo`) so the stats bar "Version" field is populated immediately — not lazily on tab activation. The Releases tab itself still shows a loading state while the fetch is in progress.

- [ ] **Step 1: Replace RepoDetail.tsx stub**

```tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BannerSVG, { getLangConfig } from '../components/BannerSVG'
import { useSavedRepos } from '../contexts/SavedRepos'
import { parseTopics, formatStars, type RepoRow, type ReleaseRow } from '../types/repo'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatSize(kb: number | null): string {
  if (kb == null) return '—'
  return `${kb.toLocaleString()} KB`
}

// ── Tab IDs ───────────────────────────────────────────────────────
type Tab = 'readme' | 'skill' | 'releases' | 'collections'
const TABS: { id: Tab; label: string }[] = [
  { id: 'readme', label: 'README' },
  { id: 'skill', label: 'Skill file' },
  { id: 'releases', label: 'Releases' },
  { id: 'collections', label: 'Collections' },
]

export default function RepoDetail() {
  const { owner, name } = useParams<{ owner: string; name: string }>()
  const navigate = useNavigate()
  const { isSaved, saveRepo } = useSavedRepos()

  const [repo, setRepo] = useState<RepoRow | null>(null)
  const [repoError, setRepoError] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('readme')

  // Tab state
  const [readme, setReadme] = useState<string | null | 'loading' | 'error'>('loading')
  const [readmeFetched, setReadmeFetched] = useState(false)
  // Releases fetched eagerly on mount (needed for stats bar "Version" field)
  const [releases, setReleases] = useState<ReleaseRow[] | 'loading' | 'error'>('loading')
  const [related, setRelated] = useState<RepoRow[]>([])

  // Fetch repo metadata + releases eagerly on mount
  useEffect(() => {
    if (!owner || !name) return
    window.api.github.getRepo(owner, name)
      .then((row) => {
        setRepo(row)
        // Fetch related repos using the repo's topics
        window.api.github.getRelatedRepos(owner, name, row.topics ?? '[]')
          .then(setRelated)
          .catch(() => {})
      })
      .catch(() => setRepoError(true))

    window.api.github.getReleases(owner, name)
      .then((r) => setReleases(r))
      .catch(() => setReleases('error'))
  }, [owner, name])

  // Lazy README fetch — only when README tab is first activated
  useEffect(() => {
    if (activeTab !== 'readme' || readmeFetched || !owner || !name) return
    setReadmeFetched(true)
    window.api.github.getReadme(owner, name)
      .then((md) => setReadme(md))
      .catch(() => setReadme('error'))
  }, [activeTab, readmeFetched, owner, name])

  const topics = parseTopics(repo?.topics ?? null)
  const cfg = getLangConfig(repo?.language ?? '', topics)
  const saved = isSaved(owner ?? '', name ?? '')

  // Stats bar version: first release tag
  const version = typeof releases === 'object' && Array.isArray(releases) && releases.length > 0
    ? releases[0].tag_name
    : '—'

  // Breadcrumb language segment
  const langSegment = repo === null && !repoError
    ? '…'
    : (repo?.language ?? null)

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
          owner={owner ?? ''}
          name={name ?? ''}
          language={repo?.language ?? ''}
          topics={topics}
          size="detail"
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
              {/* Tab bar */}
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

              {/* Tab content */}
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
                  <p className="repo-detail-placeholder">Install this repo to generate a skill file.</p>
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
          {/* Save button — hidden if getRepo failed */}
          {!repoError && (
            <button
              className={`save-btn-full${saved ? ' saved' : ''}`}
              onClick={() => !saved && saveRepo(owner ?? '', name ?? '')}
            >
              {saved ? '✓ Saved' : '+ Save'}
            </button>
          )}

          {/* Skill file panel (Phase 3: static placeholder) */}
          <div className="skill-panel">
            <div className="skill-panel-header">
              <span className="skill-panel-filename">{name}.skill.md</span>
              <span className="skill-panel-status">— not installed</span>
            </div>
            <div className="skill-panel-body">
              {[
                { label: 'Core', meta: '~80 lines', pct: 30, color: '#34d399' },
                { label: 'Extended', meta: '~200 lines', pct: 60, color: '#a78bfa' },
                { label: 'Deep', meta: '~420 lines', pct: 100, color: '#7c3aed' },
              ].map((d) => (
                <div key={d.label} className="skill-depth-row">
                  <span className="skill-depth-label">{d.label}</span>
                  <div className="skill-depth-track">
                    <div className="skill-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
                  </div>
                  <span className="skill-depth-meta">{d.meta}</span>
                </div>
              ))}
              <p className="skill-panel-note">Models read as far as context allows.</p>
            </div>
          </div>

          {/* Repository metadata */}
          {repo && (
            <div className="repo-meta-section">
              <span className="repo-meta-label">Repository</span>
              {[
                { k: 'License', v: repo.license ?? '—' },
                { k: 'Language', v: repo.language ?? '—' },
                { k: 'Size', v: formatSize(repo.size) },
                { k: 'Watchers', v: repo.watchers?.toLocaleString() ?? '—' },
                { k: 'Contributors', v: '—' },
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

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error)"
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: RepoDetail view — banner, stats, tabs, README, releases, sidebar"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass. Note any failures and fix them before proceeding.

- [ ] **Step 2: Build and run the app in dev mode**

```bash
npm run dev
```

Verify manually:
- Discover loads and shows a 3-column grid of repo cards from GitHub
- Each card has a unique banner, language badge, description, stars, + Save button
- Filter chips change the results
- Search filters live
- Sort toggles work
- Clicking a card navigates to `/repo/:owner/:name`
- Repo Detail shows breadcrumb, banner, stats bar, tabs
- README tab renders markdown
- Releases tab shows release list
- Skill file and Collections tabs show placeholders
- Save button works from both Discover card and detail page — shows ✓ Saved in both places after saving

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 3 complete — Discover view, Repo Detail, BannerSVG"
```
