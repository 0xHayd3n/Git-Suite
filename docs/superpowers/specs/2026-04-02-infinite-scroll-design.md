# Infinite Scroll for Discover View

## Summary

Add infinite scroll to the Discover view so that cards load continuously as the user scrolls down, using an IntersectionObserver sentinel pattern. Applies to all three search paths: trending, raw search, and tag search. Loads until GitHub API returns empty or the API's 1,000-result hard limit is reached.

## Current State

- Three search paths exist: trending (`github:searchRepos`), raw (`search:raw`), and tagged (`search:tagged`)
- All return a single batch (20–30 results) with no pagination
- The backend `searchRepos` function already accepts a `page` parameter but it is unused by the frontend
- `rawSearch` and `tagSearch` do not accept a `page` parameter
- `rawSearch` uses `perPage=30`, `tagSearch` fires 3 sub-queries of `perPage=20` each and merges/deduplicates/ranks results

## Design

### New State in Discover Component

Four new state variables:

- `page` (number, default 1) — current page number, reset to 1 on any fresh search
- `hasMore` (boolean, default true) — set to false when a fetch returns fewer results than expected or an API error occurs
- `loadingMore` (boolean, default false) — true while fetching the next page; distinct from `loading` which covers the initial full-grid skeleton
- `searchPath` (`'trending' | 'raw' | 'tagged'`) — tracks which search path produced the current results, so load-more knows which fetch to repeat

### Backend Changes

**`perPage` normalisation:** Both `rawSearch` and `tagSearch` are changed to use `perPage=20` per query. This creates a consistent page size across all paths.

**`rawSearch`** — Add an optional `page` parameter (default 1) that flows through to `searchRepos`. Change `perPage` from 30 to 20.

**`tagSearch` pagination strategy:** `tagSearch` fires 3 sub-queries and merges results. For pagination, pass the `page` parameter to all three sub-queries. Each sub-query requests its own page N. The same deduplication and `rankResults` logic applies to each page. This means subsequent pages may yield fewer unique results than page 1 (due to cross-query overlap), but results are still meaningful and correctly ranked within each page. `hasMore` for tag search is set to false when all three sub-queries return fewer than `perPage` results (i.e., when the merged result set is empty after dedup).

**`search:raw` IPC handler** — Accept `page` parameter. Include page in the cache key so each page is cached independently.

**`search:tagged` IPC handler** — Accept `page` parameter. Pass `page` to `tagSearch`. Include page in the cache key.

**Preload bridge** — `search.raw()` and `search.tagged()` gain an optional `page` parameter at the end of their signatures.

**Type declarations** — Update `env.d.ts` to reflect the new parameter on both search functions.

### IntersectionObserver Sentinel

A zero-height `<div>` placed after the last card inside both grid and list containers. A ref is attached and observed with `IntersectionObserver`.

**Observer config:**
- `rootMargin: '0px 0px 400px 0px'` — triggers 400px before the sentinel enters the viewport
- Fires the "load more" callback only when `!loadingMore && !loading && hasMore`
- Created/destroyed via a `useEffect` that depends on the sentinel ref and the guard conditions

### Load More Flow

1. Sentinel enters viewport → guard conditions pass
2. `setLoadingMore(true)`
3. Determine which fetch to call based on `searchPath` state:
   - `'trending'` → `window.api.github.searchRepos(query, sort, order, page + 1)`
   - `'raw'` → `window.api.search.raw(query, language, filters, page + 1)`
   - `'tagged'` → `window.api.search.tagged(tags, query, language, filters, page + 1)`
4. Deduplicate new results against existing repo IDs in the frontend (keyed by `id` field). Note: the backend `tagSearch` already deduplicates across sub-queries using `full_name` — this frontend dedup handles cross-page overlap where a repo appeared on a previous page
5. Append to `repos`, merge into `repoTypes` map (using spread: `new Map([...prev, ...newEntries])`), run `extractMissingColors` on new results (all search paths, for consistency), trigger `verification.prioritise` for new IDs only
6. `setPage(p => p + 1)`, determine `hasMore`, `setLoadingMore(false)`

**`hasMore` determination:**
- Trending / raw: `hasMore = results.length === 20`
- Tagged: `hasMore = mergedResults.length > 0` (since dedup reduces count unpredictably)
- On API error (including GitHub's 422 at 1,000-result cap): `setHasMore(false)`

### Staleness Guard

A `fetchGeneration` ref (number, incremented on each fresh search) is captured at the start of every fetch. When the response arrives, if the current generation doesn't match, the response is discarded. This prevents stale "load more" responses from appending to new search results when the user changes queries mid-flight.

### Reset Behavior

Any action that starts a fresh search resets to page 1 with full-grid skeleton loading:
- New query submission
- View mode change (popular/forked/rising)
- Language change
- Filter changes
- Tag additions/removals

Each of these increments `fetchGeneration` and sets `page=1`, `hasMore=true`, `loadingMore=false`.

### searchPath Assignment

Each initial search sets `searchPath` when it fires:
- `loadTrending()` → sets `searchPath = 'trending'`
- `handleSearch()` raw branch → sets `searchPath = 'raw'`
- `runTagSearch()` (called from `handleSearch` natural branch or tag changes) → sets `searchPath = 'tagged'`

This must happen at the same time as `setRepos` so load-more always has the correct path.

### Loading Indicators

**Initial load (existing):** Full grid of shimmer skeleton cards — unchanged.

**Load more:** A partial row of skeleton cards appended below the last real card while `loadingMore` is true:
- Grid mode: `layoutPrefs.columns` skeleton cards (one row)
- List mode: 3 skeleton rows

Uses the same shimmer animation style as the existing initial-load skeletons.

### Snapshot & Back-Navigation

`page`, `hasMore`, and `searchPath` are added to the Discover snapshot object so back-navigation restores the full scrolled state without re-fetching earlier pages (all repos are already in the snapshot's `repos` array). `loadingMore` is NOT saved — it defaults to `false` on restore since there is no in-flight fetch to continue.

The `navigateToRepo` function must include `page`, `hasMore`, and `searchPath` in the snapshot object passed to `saveDiscoverSnapshot`.

After snapshot restore, the IntersectionObserver is active immediately. Since the scroll position is also restored, the sentinel will only be in-viewport if the user was already at the bottom — which is the correct behavior (load more if they were at the end).

## GitHub API Limits

The GitHub Search API returns a maximum of 1,000 results per query (page 50 at 20 per page). Requesting beyond this returns a 422 error. The load-more error handler catches this and sets `hasMore = false`, stopping further fetches gracefully.

## Files to Modify

1. `electron/smart-search.ts` — Add `page` param to `rawSearch` and `tagSearch`, change `rawSearch` perPage from 30 to 20
2. `electron/main.ts` — Add `page` param to `search:raw` and `search:tagged` IPC handlers, include in cache keys
3. `electron/preload.ts` — Add `page` param to `search.raw()` and `search.tagged()` bridge functions
4. `src/env.d.ts` — Update type declarations for search functions
5. `src/views/Discover.tsx` — Add `page`/`hasMore`/`loadingMore`/`searchPath` state, `fetchGeneration` ref, IntersectionObserver setup, load-more logic, skeleton append rendering, snapshot save/restore updates
6. `src/lib/discoverStateStore.ts` — Add `page`, `hasMore`, and `searchPath` to snapshot type
