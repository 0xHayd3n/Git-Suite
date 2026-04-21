# Recommended Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Recommended" tab as the first tab in the Discover view, showing repos tailored to the user's installed/starred repos or broadly popular repos for new users.

**Architecture:** A new `github:getRecommended` IPC handler in the Electron main process aggregates topics from saved/starred repos, queries GitHub API with those topics, and filters out already-installed repos. The Discover view adds "Recommended" as the first tab in `VIEW_MODES` and calls this handler via `window.api.github.getRecommended(page)`. For cold-start users, the handler falls back to `stars:>50000` for broadly popular repos.

**Tech Stack:** Electron IPC, SQLite (better-sqlite3), GitHub Search API, React, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-recommended-tab-design.md`

---

### Task 1: Add `getRecommended` to Preload

**Files:**
- Modify: `electron/preload.ts:14-49` (github namespace)

- [ ] **Step 1: Add the preload entry**

In `electron/preload.ts`, inside the `github: { ... }` object (after line 30, near `isStarred`), add:

```ts
getRecommended: (page?: number) => ipcRenderer.invoke('github:getRecommended', page),
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add getRecommended to preload github namespace"
```

---

### Task 2: Implement `github:getRecommended` IPC Handler

**Files:**
- Modify: `electron/main.ts` (after the `github:getRelatedRepos` handler, around line 620)

- [ ] **Step 1: Add the IPC handler**

After the `github:getRelatedRepos` handler (which ends around line 620), add:

```ts
ipcMain.handle('github:getRecommended', async (_event, page?: number) => {
  const token = getToken() ?? null
  const db = getDb(app.getPath('userData'))
  const pageNum = page ?? 1

  // Gather topics from user's saved and starred repos
  const userRepos = db.prepare(
    'SELECT topics FROM repos WHERE saved_at IS NOT NULL OR starred_at IS NOT NULL'
  ).all() as { topics: string | null }[]

  let query: string
  let sort = 'stars'
  let order = 'desc'

  if (userRepos.length > 0) {
    // Count topic frequency across all user repos
    const topicCounts = new Map<string, number>()
    for (const row of userRepos) {
      const topics: string[] = (() => { try { return JSON.parse(row.topics ?? '[]') } catch { return [] } })()
      for (const t of topics) {
        topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
      }
    }

    // Take top 5 most frequent topics
    const topTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic)

    if (topTopics.length > 0) {
      query = topTopics.map(t => `topic:${t}`).join(' ') + ' stars:>100'
    } else {
      // User has repos but none have topics — fall back to popular
      query = 'stars:>50000'
    }
  } else {
    // Cold start: no saved/starred repos
    query = 'stars:>50000'
  }

  const items = await searchRepos(token, query, 20, sort, order, pageNum)
  if (items.length === 0) return []

  const now = new Date().toISOString()

  // Upsert into DB (same pattern as github:searchRepos)
  const upsert = db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                       homepage, updated_at, pushed_at, saved_at, type, banner_svg,
                       discovered_at, discover_query, watchers, size, open_issues, default_branch, avatar_url,
                       type_bucket, type_sub)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, name) DO UPDATE SET
      description    = excluded.description,
      language       = excluded.language,
      topics         = excluded.topics,
      stars          = excluded.stars,
      forks          = excluded.forks,
      updated_at     = excluded.updated_at,
      pushed_at      = excluded.pushed_at,
      discovered_at  = excluded.discovered_at,
      discover_query = excluded.discover_query,
      watchers       = excluded.watchers,
      size           = excluded.size,
      open_issues    = excluded.open_issues,
      default_branch = excluded.default_branch,
      avatar_url     = COALESCE(excluded.avatar_url, repos.avatar_url),
      saved_at       = repos.saved_at,
      banner_color   = repos.banner_color,
      type_bucket    = excluded.type_bucket,
      type_sub       = excluded.type_sub
  `)

  db.transaction(() => {
    for (const repo of items) {
      const classified = classifyRepoBucket({ name: repo.name, description: repo.description, topics: JSON.stringify(repo.topics ?? []) })
      upsert.run(
        String(repo.id), repo.owner.login, repo.name, repo.description, repo.language,
        JSON.stringify(repo.topics ?? []), repo.stargazers_count, repo.forks_count,
        repo.license?.spdx_id ?? null, repo.homepage, repo.updated_at, repo.pushed_at,
        now, 'recommended', repo.watchers_count, repo.size, repo.open_issues_count,
        repo.default_branch ?? 'main', repo.owner.avatar_url ?? null,
        classified?.bucket ?? null, classified?.subType ?? null,
      )
    }
  })()

  // Non-blocking: extract dominant colour
  setImmediate(() => {
    for (const repo of items) {
      if (!repo.owner.avatar_url) continue
      const row = db.prepare('SELECT banner_color FROM repos WHERE owner = ? AND name = ?')
        .get(repo.owner.login, repo.name) as { banner_color: string | null } | undefined
      if (row?.banner_color) continue
      extractDominantColor(repo.owner.avatar_url)
        .then(color => {
          db.prepare('UPDATE repos SET banner_color = ? WHERE owner = ? AND name = ?')
            .run(JSON.stringify(color), repo.owner.login, repo.name)
        })
        .catch(() => {/* non-critical */})
    }
  })

  // Read back from DB and filter out already-saved repos
  return items
    .map(r => db.prepare('SELECT * FROM repos WHERE owner = ? AND name = ?').get(r.owner.login, r.name))
    .filter(Boolean)
    .filter((r: any) => !r.saved_at)
})
```

**Key points:**
- The upsert pattern is identical to the existing `github:searchRepos` handler — copy it exactly.
- `searchRepos` is imported from `./github` (already imported at the top of `main.ts`).
- `classifyRepoBucket` is imported from `../src/lib/classifyRepoType` (already imported).
- `extractDominantColor` is already available in scope.
- The `discover_query` is set to `'recommended'` to differentiate in the DB.
- Post-fetch filtering excludes repos where `saved_at` is not null.

- [ ] **Step 2: Verify the handler compiles**

Run: `npx tsc --noEmit -p electron/tsconfig.json` (or whatever the electron build command is). If no tsconfig exists for electron, just verify the app starts.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add github:getRecommended IPC handler"
```

---

### Task 3: Update ViewModeKey and VIEW_MODES

**Files:**
- Modify: `src/views/Discover.tsx:36-42` (VIEW_MODES and type)
- Modify: `src/lib/discoverStateStore.ts:9` (ViewModeKey type)

- [ ] **Step 1: Update `discoverStateStore.ts`**

In `src/lib/discoverStateStore.ts`, line 9, change:

```ts
type ViewModeKey = 'popular' | 'forked' | 'rising'
```

to:

```ts
type ViewModeKey = 'recommended' | 'popular' | 'forked' | 'rising'
```

- [ ] **Step 2: Update `VIEW_MODES` in `Discover.tsx`**

In `src/views/Discover.tsx`, replace lines 36-40:

```ts
const VIEW_MODES = [
  { key: 'popular', label: 'Most Popular' },
  { key: 'forked',  label: 'Most Forked' },
  { key: 'rising',  label: 'Rising' },
] as const
```

with:

```ts
const VIEW_MODES = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'popular', label: 'Most Popular' },
  { key: 'forked',  label: 'Most Forked' },
  { key: 'rising',  label: 'Rising' },
] as const
```

- [ ] **Step 3: Update the default `viewMode` state**

In `src/views/Discover.tsx`, line 118-121, change the initial state:

```ts
const [viewMode, setViewMode] = useState<ViewModeKey>(() => {
    const v = restoredSnapshot.current?.viewMode
    return (v === 'popular' || v === 'forked' || v === 'rising') ? v : 'popular'
  })
```

to:

```ts
const [viewMode, setViewMode] = useState<ViewModeKey>(() => {
    const v = restoredSnapshot.current?.viewMode
    return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
  })
```

- [ ] **Step 4: Commit**

```bash
git add src/views/Discover.tsx src/lib/discoverStateStore.ts
git commit -m "feat: add Recommended as first tab in VIEW_MODES"
```

---

### Task 4: Wire `loadTrending` and `loadMore` to Call `getRecommended`

**Files:**
- Modify: `src/views/Discover.tsx` (loadTrending and loadMore functions)

- [ ] **Step 1: Update `buildViewModeQuery` to handle `recommended`**

In `src/views/Discover.tsx`, the `buildViewModeQuery` function (line 44-64) has a switch statement. Since `recommended` doesn't use this function (it calls a separate IPC handler), add a case that returns an empty string so TypeScript doesn't complain:

```ts
function buildViewModeQuery(viewMode: ViewModeKey, langKey: string, search: string): string {
  const trimmed = search.trim()
  const langFilter = langKey ? `language:${langKey}` : ''

  if (trimmed) {
    return [trimmed, langFilter].filter(Boolean).join('+')
  }

  const now = new Date()
  switch (viewMode) {
    case 'recommended':
      return '' // handled by separate IPC handler
    case 'popular':
      return ['stars:>100', langFilter].filter(Boolean).join('+')
    case 'forked':
      return ['forks:>50', langFilter].filter(Boolean).join('+')
    case 'rising': {
      const d = new Date(now)
      d.setDate(d.getDate() - 90)
      return [`created:>${d.toISOString().split('T')[0]}`, 'stars:>10', langFilter].filter(Boolean).join('+')
    }
  }
}
```

- [ ] **Step 2: Update `loadTrending` to call `getRecommended`**

In the `loadTrending` function (line 282-305), replace the try block:

```ts
    try {
      const q = buildTrendingQuery(viewMode, activeLanguage, filters ?? {})
      const { sort: s, order: o } = getViewModeSort(viewMode)
      const data = await window.api.github.searchRepos(q, s, o)
```

with:

```ts
    try {
      let data: RepoRow[]
      if (viewMode === 'recommended') {
        data = await window.api.github.getRecommended()
      } else {
        const q = buildTrendingQuery(viewMode, activeLanguage, filters ?? {})
        const { sort: s, order: o } = getViewModeSort(viewMode)
        data = await window.api.github.searchRepos(q, s, o)
      }
```

The rest of the try block (setRepos, setRepoTypes, verification, extractMissingColors) stays the same.

- [ ] **Step 3: Update `loadMore` to call `getRecommended` for pagination**

In the `loadMore` function (line 445-498), inside the `if (searchPath === 'trending')` branch (line 453-456), replace:

```ts
      if (searchPath === 'trending') {
        const q = buildTrendingQuery(viewMode, activeLanguage, appliedFilters)
        const { sort: s, order: o } = getViewModeSort(viewMode)
        newResults = await window.api.github.searchRepos(q, s, o, nextPage)
```

with:

```ts
      if (searchPath === 'trending') {
        if (viewMode === 'recommended') {
          newResults = await window.api.github.getRecommended(nextPage)
        } else {
          const q = buildTrendingQuery(viewMode, activeLanguage, appliedFilters)
          const { sort: s, order: o } = getViewModeSort(viewMode)
          newResults = await window.api.github.searchRepos(q, s, o, nextPage)
        }
```

- [ ] **Step 4: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: wire loadTrending and loadMore to getRecommended handler"
```

---

### Task 5: Integration Tests

**Files:**
- Modify: `src/views/Discover.test.tsx`

- [ ] **Step 1: Add `getRecommended` mock to `makeDiscoverApi`**

In `src/views/Discover.test.tsx`, inside the `makeDiscoverApi` function, add `getRecommended` to the `github` object (after `unstarRepo`, around line 41):

```ts
getRecommended: vi.fn().mockResolvedValue([{
  owner: 'vercel', name: 'next.js', description: 'The React framework',
  language: 'TypeScript', stars: 100000, forks: 20000, open_issues: 500,
  watchers: 100000, size: 50000, license: 'MIT', topics: '[]',
  updated_at: '2024-01-01', saved_at: null,
}]),
```

- [ ] **Step 2: Add the test describe block**

At the end of `Discover.test.tsx`, add:

```ts
describe('Recommended tab', () => {
  beforeEach(() => {
    localStorage.clear()
    makeDiscoverApi()
  })

  it('renders Recommended as the first tab', () => {
    renderDiscover()
    const tabs = screen.getAllByRole('button').filter(b => b.classList.contains('view-tab'))
    expect(tabs[0]).toHaveTextContent('Recommended')
  })

  it('Recommended is the default active tab', () => {
    renderDiscover()
    const tabs = screen.getAllByRole('button').filter(b => b.classList.contains('view-tab'))
    expect(tabs[0].classList.contains('active')).toBe(true)
  })

  it('calls getRecommended on initial load', async () => {
    renderDiscover()
    await waitFor(() => {
      expect(window.api.github.getRecommended).toHaveBeenCalled()
    })
  })

  it('switching to Most Popular calls searchRepos instead', async () => {
    renderDiscover()
    await waitFor(() => expect(window.api.github.getRecommended).toHaveBeenCalled())
    ;(window.api.github.searchRepos as ReturnType<typeof vi.fn>).mockClear()
    const popularTab = screen.getByRole('button', { name: 'Most Popular' })
    fireEvent.click(popularTab)
    await waitFor(() => {
      expect(window.api.github.searchRepos).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 3: Verify existing tests still work**

The `getRecommended` mock returns the same `vercel/next.js` data as `searchRepos`, so existing tests that wait for `next.js` to appear on mount will continue to work — the Recommended tab (now default) renders the same mock data.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/views/Discover.test.tsx`
Expected: All tests PASS (existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add src/views/Discover.test.tsx
git commit -m "test: add Recommended tab integration tests"
```

---

### Task 6: Manual Verification

- [ ] **Step 1: Test cold start**

Clear the app database or use a fresh user account. Open Discover. Verify:
- Recommended tab is first and active
- Shows broadly popular repos (high star counts, diverse languages)
- Infinite scroll loads more pages

- [ ] **Step 2: Test with saved/starred repos**

Star or install a few repos (e.g. React, TypeScript-related). Go back to Discover. Verify:
- Recommended tab shows repos matching those topics
- Already-installed repos do not appear in results
- Results differ from the Most Popular tab

- [ ] **Step 3: Test tab switching**

Click through all 4 tabs: Recommended → Most Popular → Most Forked → Rising. Verify:
- Each tab loads its own results
- Coming back to Recommended re-fetches (no stale cache)
- No console errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: No regressions in existing tests
