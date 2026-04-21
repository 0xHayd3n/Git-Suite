# Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add infinite scroll to the Discover view so cards load continuously as the user scrolls, across all three search paths (trending, raw, tagged).

**Architecture:** IntersectionObserver sentinel at the bottom of the card grid triggers next-page fetches. Backend search functions gain a `page` parameter that flows through to the GitHub API. A `fetchGeneration` ref guards against stale responses when searches change mid-flight.

**Tech Stack:** React, Electron IPC, GitHub Search API, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-infinite-scroll-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `electron/smart-search.ts` | Modify | Add `page` param to `rawSearch` and `tagSearch`, change `rawSearch` perPage to 20 |
| `electron/smart-search.test.ts` | Modify | Add tests for page param passthrough |
| `electron/main.ts` | Modify | Add `page` param to `search:raw` and `search:tagged` IPC handlers, include in cache keys |
| `electron/preload.ts` | Modify | Add `page` param to `search.raw()` and `search.tagged()` bridge |
| `src/env.d.ts` | Modify | Update type declarations for search functions |
| `src/lib/discoverStateStore.ts` | Modify | Add `page`, `hasMore`, `searchPath` to snapshot type |
| `src/views/Discover.tsx` | Modify | Add infinite scroll state, IntersectionObserver, load-more logic, skeleton append |

---

### Task 1: Add `page` parameter to backend search functions

**Files:**
- Modify: `electron/smart-search.ts:62-73` (`rawSearch`)
- Modify: `electron/smart-search.ts:76-114` (`tagSearch`)
- Test: `electron/smart-search.test.ts`

- [ ] **Step 1: Write tests for `rawSearch` page parameter**

In `electron/smart-search.test.ts`, the existing tests only cover `rankResults`. Add a new describe block. Since `rawSearch` calls `searchRepos` (imported as `githubSearch`), we need to mock `./github`.

```typescript
// Add at top of file, after existing imports:
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock the github module
vi.mock('./github', () => ({
  searchRepos: vi.fn().mockResolvedValue([]),
}))

import { rawSearch, tagSearch } from './smart-search'
import { searchRepos } from './github'

const mockSearchRepos = vi.mocked(searchRepos)

describe('rawSearch', () => {
  beforeEach(() => mockSearchRepos.mockReset().mockResolvedValue([]))

  it('passes page parameter to searchRepos', async () => {
    await rawSearch('tok', 'react', undefined, undefined, 3)
    expect(mockSearchRepos).toHaveBeenCalledWith('tok', 'react', 20, undefined, undefined, 3)
  })

  it('defaults page to 1 when omitted', async () => {
    await rawSearch('tok', 'react')
    expect(mockSearchRepos).toHaveBeenCalledWith('tok', 'react', 20, undefined, undefined, 1)
  })

  it('uses perPage of 20', async () => {
    await rawSearch('tok', 'react')
    expect(mockSearchRepos).toHaveBeenCalledWith('tok', expect.any(String), 20, expect.anything(), expect.anything(), expect.anything())
  })
})

describe('tagSearch', () => {
  beforeEach(() => mockSearchRepos.mockReset().mockResolvedValue([]))

  it('passes page parameter to all sub-queries', async () => {
    await tagSearch('tok', ['react', 'hooks'], 'react hooks', undefined, undefined, 2)
    for (const call of mockSearchRepos.mock.calls) {
      expect(call[5]).toBe(2) // page argument (6th positional)
    }
  })

  it('defaults page to 1 when omitted', async () => {
    await tagSearch('tok', ['react'], 'react')
    for (const call of mockSearchRepos.mock.calls) {
      expect(call[5]).toBe(1)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/smart-search.test.ts`
Expected: FAIL — `rawSearch` and `tagSearch` don't accept `page` param yet, and `rawSearch` passes `30` not `20`.

- [ ] **Step 3: Implement `page` parameter in `rawSearch`**

In `electron/smart-search.ts`, modify `rawSearch` (lines 62-73):

```typescript
// Raw search — single query, fast
export async function rawSearch(
  token: string | null,
  query: string,
  language?: string,
  filters?: SearchFilters,
  page = 1,
): Promise<SearchResult[]> {
  let q = query
  if (language) q += ` language:${language}`
  const fq = buildFilterQuery(filters)
  if (fq) q += ` ${fq}`
  return githubSearch(token, q, 20, undefined, undefined, page) as Promise<SearchResult[]>
}
```

- [ ] **Step 4: Implement `page` parameter in `tagSearch`**

In `electron/smart-search.ts`, modify `tagSearch` (lines 76-114):

```typescript
// Natural language search — multi-query with tags
export async function tagSearch(
  token: string | null,
  tags: string[],
  originalQuery: string,
  language?: string,
  filters?: SearchFilters,
  page = 1,
): Promise<SearchResult[]> {
  const langSuffix   = language ? ` language:${language}` : ''
  const filterSuffix = filters  ? ` ${buildFilterQuery(filters)}` : ''
  const suffix       = langSuffix + filterSuffix

  const topicQuery   = tags.slice(0, 3).map(t => `topic:${t}`).join(' ')
  const keywordQuery = tags.slice(0, 4).join(' ')

  const queries = [
    topicQuery   ? topicQuery   + suffix : null,
    keywordQuery ? keywordQuery + suffix : null,
    originalQuery + suffix,
  ].filter(Boolean) as string[]

  const results = await Promise.allSettled(
    queries.map(q => githubSearch(token, q, 20, undefined, undefined, page) as Promise<SearchResult[]>)
  )

  const seen = new Set<string>()
  const merged: SearchResult[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const repo of result.value) {
        if (!seen.has(repo.full_name)) {
          seen.add(repo.full_name)
          merged.push(repo)
        }
      }
    }
  }

  return rankResults(merged, tags)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run electron/smart-search.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/smart-search.ts electron/smart-search.test.ts
git commit -m "feat: add page parameter to rawSearch and tagSearch"
```

---

### Task 2: Add `page` parameter to IPC handlers and preload bridge

**Files:**
- Modify: `electron/main.ts:1190-1238` (`search:raw` and `search:tagged` handlers)
- Modify: `electron/preload.ts:130-133` (search bridge)
- Modify: `src/env.d.ts:115-116` (type declarations)

- [ ] **Step 1: Update `search:raw` IPC handler**

In `electron/main.ts`, modify the handler at line 1190. Add `page` param and include it in the cache key:

```typescript
ipcMain.handle('search:raw', async (_, query: string, language?: string, filters?: SearchFilters, page?: number) => {
  const token = getToken() ?? null
  const db = getDb(app.getPath('userData'))
  const p = page ?? 1
  const filterKey = filters ? JSON.stringify(filters) : ''
  const cacheKey = `raw:${query}:${language ?? 'all'}:${filterKey}:p${p}`
  const TTL = 30 * 60 * 1000

  const cached = db.prepare(
    'SELECT results, fetched_at FROM search_cache WHERE cache_key = ?'
  ).get(cacheKey) as { results: string; fetched_at: string } | undefined

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL) {
    return JSON.parse(cached.results)
  }

  const apiResults = await rawSearch(token, query, language, filters, p)
  const rows = upsertAndReturnRepoRows(db, apiResults, query)

  db.prepare(
    'INSERT OR REPLACE INTO search_cache (cache_key, results, fetched_at) VALUES (?, ?, ?)'
  ).run(cacheKey, JSON.stringify(rows), new Date().toISOString())

  return rows
})
```

- [ ] **Step 2: Update `search:tagged` IPC handler**

In `electron/main.ts`, modify the handler at line 1215:

```typescript
ipcMain.handle('search:tagged', async (_, tags: string[], originalQuery: string, language?: string, filters?: SearchFilters, page?: number) => {
  const token = getToken() ?? null
  const db = getDb(app.getPath('userData'))
  const p = page ?? 1
  const filterKey = filters ? JSON.stringify(filters) : ''
  const cacheKey = `tagged:${[...tags].sort().join(',')}:${language ?? 'all'}:${filterKey}:p${p}`
  const TTL = 60 * 60 * 1000

  const cached = db.prepare(
    'SELECT results, fetched_at FROM search_cache WHERE cache_key = ?'
  ).get(cacheKey) as { results: string; fetched_at: string } | undefined

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL) {
    return JSON.parse(cached.results)
  }

  const apiResults = await tagSearch(token, tags, originalQuery, language, filters, p)
  const rows = upsertAndReturnRepoRows(db, apiResults, originalQuery)

  db.prepare(
    'INSERT OR REPLACE INTO search_cache (cache_key, results, fetched_at) VALUES (?, ?, ?)'
  ).run(cacheKey, JSON.stringify(rows), new Date().toISOString())

  return rows
})
```

- [ ] **Step 3: Update preload bridge**

In `electron/preload.ts`, modify lines 130-133:

```typescript
  search: {
    raw:            (query: string, language?: string, filters?: import('./smart-search').SearchFilters, page?: number) =>
      ipcRenderer.invoke('search:raw', query, language, filters, page),
    tagged:         (tags: string[], originalQuery: string, language?: string, filters?: import('./smart-search').SearchFilters, page?: number) =>
      ipcRenderer.invoke('search:tagged', tags, originalQuery, language, filters, page),
```

- [ ] **Step 4: Update type declarations**

In `src/env.d.ts`, modify lines 115-116:

```typescript
      search: {
        raw(query: string, language?: string, filters?: SearchFilters, page?: number): Promise<RepoRow[]>
        tagged(tags: string[], originalQuery: string, language?: string, filters?: SearchFilters, page?: number): Promise<RepoRow[]>
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: add page parameter to search IPC handlers and preload bridge"
```

---

### Task 3: Update snapshot type for pagination state

**Files:**
- Modify: `src/lib/discoverStateStore.ts:18-29`

- [ ] **Step 1: Add pagination fields to `DiscoverSnapshot`**

In `src/lib/discoverStateStore.ts`, modify the `DiscoverSnapshot` interface (line 18):

```typescript
export interface DiscoverSnapshot {
  query: string
  repos: RepoRow[]
  viewMode: ViewModeKey
  activeLanguage: string
  appliedFilters: SearchFilters
  mode: 'raw' | 'natural'
  detectedTags: string[]
  activeTags: string[]
  relatedTags: string[]
  scrollTop: number
  page: number
  hasMore: boolean
  searchPath: 'trending' | 'raw' | 'tagged'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/discoverStateStore.ts
git commit -m "feat: add page, hasMore, searchPath to DiscoverSnapshot type"
```

---

### Task 4: Add infinite scroll state and load-more logic to Discover

**Files:**
- Modify: `src/views/Discover.tsx`

This is the main task. It adds state variables, the `loadMore` function, searchPath tracking, fetchGeneration guard, and updates the snapshot save/restore.

- [ ] **Step 1: Add new state variables and refs**

After the existing `layoutPrefs` state (line 158), add:

```typescript
  const [page, setPage] = useState(() => restoredSnapshot.current?.page ?? 1)
  const [hasMore, setHasMore] = useState(() => restoredSnapshot.current?.hasMore ?? true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchPath, setSearchPath] = useState<'trending' | 'raw' | 'tagged'>(
    () => restoredSnapshot.current?.searchPath ?? 'trending'
  )
  const fetchGeneration = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 2: Set `searchPath` in each search function**

In `loadTrending` (around line 251), add `setSearchPath('trending')` right after `setLoading(true)`:

```typescript
  const loadTrending = useCallback(async (filters?: SearchFilters) => {
    setLoading(true)
    setSearchPath('trending')
    setPage(1)
    setHasMore(true)
    fetchGeneration.current += 1
    setError(null)
    setRepos([])
    // ... rest unchanged
```

In `runTagSearch` (around line 315), add `setSearchPath('tagged')` and reset pagination:

```typescript
  const runTagSearch = useCallback(async (tags: string[], filters?: SearchFilters) => {
    setLoading(true)
    setSearchPath('tagged')
    setPage(1)
    setHasMore(true)
    fetchGeneration.current += 1
    // ... rest unchanged
```

In `handleSearch` (around line 333), for the raw branch add `setSearchPath('raw')` and reset pagination. Add right after `setLoading(true)` and `setError(null)`:

```typescript
    setPage(1)
    setHasMore(true)
    fetchGeneration.current += 1
```

And inside the `if (searchMode === 'raw')` block, add `setSearchPath('raw')` at the top.

- [ ] **Step 3: Extract `buildTrendingQuery` helper**

The existing `loadTrending` builds its query string inline with filter logic. Extract this into a helper function so both `loadTrending` and `loadMore` use identical queries. Add this above `loadTrending`:

```typescript
  /** Build the GitHub search query for trending mode (shared by loadTrending and loadMore). */
  function buildTrendingQuery(vm: ViewModeKey, lang: string, filters: SearchFilters): string {
    const baseQ = buildViewModeQuery(vm, lang, '')
    const filterParts: string[] = []
    if (filters.activity === 'week')     filterParts.push('pushed:>' + (() => { const d = new Date(); d.setDate(d.getDate() - 7);  return d.toISOString().split('T')[0] })())
    if (filters.activity === 'month')    filterParts.push('pushed:>' + (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })())
    if (filters.activity === 'halfyear') filterParts.push('pushed:>' + (() => { const d = new Date(); d.setDate(d.getDate() - 180); return d.toISOString().split('T')[0] })())
    if (filters.stars)    filterParts.push(`stars:>${filters.stars}`)
    if (filters.license)  filterParts.push(`license:${filters.license}`)
    if (filters.topics?.length) filterParts.push(...filters.topics)
    return [baseQ, ...filterParts].filter(Boolean).join('+')
  }
```

Then update `loadTrending` to use it — replace the inline query building (lines 257-265) with:

```typescript
    const q = buildTrendingQuery(viewMode, activeLanguage, filters ?? {})
```

- [ ] **Step 4: Add pagination resets to `handleSearch` fallback branch**

In `handleSearch`, the natural-language branch has a catch block (around line 370) that falls back to `search.raw()`. This branch also needs pagination resets and `searchPath` assignment:

```typescript
      } catch (e: unknown) {
        setAnalysing(false)
        setSearchPath('raw')
        try {
          const res = await window.api.search.raw(q, langFilter, filters)
          // ... existing code ...
```

The `setPage(1)`, `setHasMore(true)`, and `fetchGeneration.current += 1` are already set earlier in `handleSearch` (before the mode branch), so they don't need to repeat here. Only `setSearchPath('raw')` is needed.

- [ ] **Step 5: Write the `loadMore` function**

Add after the `handleSearch` function:

```typescript
  const PER_PAGE = 20

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return
    setLoadingMore(true)
    const gen = fetchGeneration.current
    const nextPage = page + 1

    try {
      let newResults: RepoRow[]
      if (searchPath === 'trending') {
        // Reuse the same query-building logic as loadTrending
        const q = buildTrendingQuery(viewMode, activeLanguage, appliedFilters)
        const { sort: s, order: o } = getViewModeSort(viewMode)
        newResults = await window.api.github.searchRepos(q, s, o, nextPage)
      } else if (searchPath === 'raw') {
        const langFilter = activeLanguage || undefined
        newResults = await window.api.search.raw(query, langFilter, appliedFilters, nextPage)
      } else {
        const langFilter = activeLanguage || undefined
        newResults = await window.api.search.tagged(activeTags, query, langFilter, appliedFilters, nextPage)
      }

      // Discard stale response
      if (gen !== fetchGeneration.current) return

      // Deduplicate against existing repos
      const existingIds = new Set(repos.map(r => r.id))
      const unique = newResults.filter(r => !existingIds.has(r.id))

      if (unique.length > 0) {
        setRepos(prev => [...prev, ...unique])
        setRepoTypes(prev => {
          const next = new Map(prev)
          for (const r of unique) next.set(r.id, classifyRepoType(r))
          return next
        })
        extractMissingColors(unique)
        const newIds = unique.map(r => r.id).filter(Boolean)
        if (newIds.length) window.api.verification.prioritise(newIds).catch(() => {})
      }

      setPage(nextPage)
      if (searchPath === 'tagged') {
        setHasMore(newResults.length > 0)
      } else {
        setHasMore(newResults.length === PER_PAGE)
      }
    } catch {
      // API error (e.g. GitHub 422 at 1000-result cap) — stop pagination
      setHasMore(false)
    } finally {
      if (gen === fetchGeneration.current) {
        setLoadingMore(false)
      }
    }
  }, [loadingMore, loading, hasMore, page, searchPath, viewMode, activeLanguage, appliedFilters, query, activeTags, repos, extractMissingColors])
```

- [ ] **Step 6: Update snapshot save in `navigateToRepo`**

Modify `navigateToRepo` (line 388) to include the new fields:

```typescript
  function navigateToRepo(path: string) {
    saveDiscoverSnapshot({
      query, repos, viewMode, activeLanguage, appliedFilters,
      mode, detectedTags, activeTags, relatedTags,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
      page, hasMore, searchPath,
    })
    navigate(path)
  }
```

- [ ] **Step 7: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: add infinite scroll state, loadMore function, and searchPath tracking"
```

---

### Task 5: Add IntersectionObserver and loading-more skeleton UI

**Files:**
- Modify: `src/views/Discover.tsx` (useEffect + render section)

- [ ] **Step 1: Add IntersectionObserver useEffect**

Add after the existing scroll listener useEffect (after line 313):

First, add a ref to hold the latest `loadMore` callback (avoids observer churn). Add near the other refs:

```typescript
  const loadMoreRef = useRef(loadMore)
  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])
```

Then add the observer effect:

```typescript
  // IntersectionObserver for infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreRef.current()
      },
      { rootMargin: '0px 0px 400px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])  // stable — never recreated; loadMore guards are inside the callback
```

Note: the `loadMore` function itself has the `if (loadingMore || loading || !hasMore) return` guard, so the observer callback does not need to duplicate those checks.

- [ ] **Step 2: Add sentinel div and loading-more skeletons to grid rendering**

In the render section, modify the grid/list card rendering block (lines 683-721). Add the sentinel and loading-more skeletons inside each layout branch.

Replace the block at lines 683-721 with:

```tsx
        {!loading && !error && repos.length > 0 && (
          layoutPrefs.mode === 'list' ? (
            <div className="discover-list">
              {visibleRepos.map(repo => (
                <RepoListRow
                  key={`${repo.owner}/${repo.name}`}
                  repo={repo}
                  onNavigate={navigateToRepo}
                  onTagClick={addTag}
                  onOwnerClick={openProfile}
                  repoType={repoTypes.get(repo.id)}
                  verificationTier={verification.getTier(repo.id)}
                  density={layoutPrefs.density}
                  fields={layoutPrefs.fields}
                />
              ))}
              {loadingMore && Array.from({ length: 3 }).map((_, i) => (
                <div key={`skel-${i}`} className="repo-list-row repo-list-row--comfortable" style={{
                  height: 52, background: 'var(--bg3)',
                  animation: 'shimmer 1.5s infinite',
                }} />
              ))}
              <div ref={sentinelRef} style={{ height: 0 }} />
            </div>
          ) : (
            <div ref={gridRef} className="discover-grid" style={{ gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))` }}>
              {visibleRepos.map(repo => (
                <RepoCard
                  key={`${repo.owner}/${repo.name}`}
                  repo={repo}
                  onNavigate={navigateToRepo}
                  onTagClick={addTag}
                  onOwnerClick={openProfile}
                  repoType={repoTypes.get(repo.id)}
                  verificationTier={verification.getTier(repo.id)}
                  verificationSignals={verification.getSignals(repo.id)}
                  verificationResolving={verification.isResolving(repo.id)}
                />
              ))}
              {loadingMore && Array.from({ length: layoutPrefs.columns }).map((_, i) => (
                <div key={`skel-${i}`} style={{
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', height: 280,
                  animation: 'shimmer 1.5s infinite',
                }} />
              ))}
              <div ref={sentinelRef} style={{ height: 0 }} />
            </div>
          )
        )}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: add IntersectionObserver sentinel and loading-more skeleton UI"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass. No regressions.

- [ ] **Step 2: Manual smoke test**

Start the app (`npm start`) and verify:
1. Open Discover — trending cards load as before
2. Scroll down — new cards load with shimmer skeletons at the bottom
3. Type a search query — results reset, scroll to top, infinite scroll works on new results
4. Switch view mode (Popular → Most Forked) — results reset, infinite scroll works
5. Navigate to a repo detail, press back — scroll position and all loaded cards are restored
6. Switch between grid and list layouts — sentinel and skeletons work in both modes

- [ ] **Step 3: Final commit if any fixes needed**
