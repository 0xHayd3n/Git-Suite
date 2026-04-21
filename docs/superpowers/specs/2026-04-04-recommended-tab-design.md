# Recommended Tab Design

## Overview

Add a "Recommended" tab as the first tab in the Discover view. It shows repos tailored to the user's interests based on their installed and starred repos. For new users with no data, it falls back to a curated set of broadly popular repos.

## Decisions

- **Tab position:** First tab, before Most Popular / Most Forked / Rising
- **Default tab:** Recommended is the default on mount (replaces Most Popular as default)
- **Data source:** Hybrid — local DB for topic extraction + GitHub API for search results
- **Cold start:** Single GitHub API query for `stars:>50000` sorted by stars desc
- **Freshness:** Computed every time the tab is selected (no session cache)
- **Pagination:** Same as other tabs — infinite scroll, page param passed through
- **Exclusions:** Repos the user has already saved (installed) are filtered out

## IPC Handler

### `github:getRecommended`

**File:** `electron/main.ts` (new handler alongside existing `github:` handlers)

**Signature:** `getRecommended(page?: number) → RepoRow[]`

**When user has saved/starred repos:**

1. Query DB: `SELECT topics FROM repos WHERE saved_at IS NOT NULL OR starred_at IS NOT NULL`
2. Parse all `topics` JSON arrays, count frequency of each topic across all repos
3. Take the top 5 most frequent topics
4. Build GitHub search query: `topic:{top1} topic:{top2} topic:{top3} topic:{top4} topic:{top5} stars:>100`
   - Multiple `topic:` qualifiers act as OR in GitHub search
   - `stars:>100` filters out low-quality repos
   - Sort by stars descending
5. Call GitHub search API with the constructed query and the `page` param
6. Post-fetch: exclude repos where `saved_at IS NOT NULL` in local DB (user already installed)
7. Return results as `RepoRow[]` (same format as `searchRepos`)

**Cold start (no saved/starred repos):**

1. Detect: no rows in DB with `saved_at IS NOT NULL OR starred_at IS NOT NULL`
2. Query GitHub API: `stars:>50000` sorted by stars desc, with `page` param
3. Return results — broadly popular repos across different languages/categories

**Uses:** Existing `getToken()`, `searchRepos()` from `github.ts`, `getDb()` for DB access. All established patterns in the file.

## Preload Wiring

**File:** `electron/preload.ts`

Add to the `github` namespace:

```ts
getRecommended: (page?: number) => ipcRenderer.invoke('github:getRecommended', page),
```

Same pattern as existing `searchRepos` entry.

## Discover View Integration

**File:** `src/views/Discover.tsx`

### Tab definition

```ts
type ViewModeKey = 'recommended' | 'popular' | 'forked' | 'rising'

const VIEW_MODES = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'popular', label: 'Most Popular' },
  { key: 'forked',  label: 'Most Forked' },
  { key: 'rising',  label: 'Rising' },
]
```

### Default state

Initial `viewMode` state changes from `'popular'` to `'recommended'`.

### Loading logic

The existing `loadTrending` function branches on `viewMode` to build different queries. Add a `recommended` branch that calls `window.api.github.getRecommended(page)` instead of `searchRepos`. The result is the same `RepoRow[]` shape, so classification, verification, and rendering work unchanged.

No query/sort configuration needed for `recommended` — the IPC handler builds the query internally.

## Files Changed

| File | Change |
|---|---|
| `electron/main.ts` | New `github:getRecommended` IPC handler |
| `electron/preload.ts` | Add `getRecommended` to github namespace |
| `src/views/Discover.tsx` | Add Recommended tab, update default viewMode, add loading branch |
| `src/views/Discover.test.tsx` | Add integration tests for Recommended tab |

## Testing

### Integration tests (additions to `Discover.test.tsx`)

- Recommended tab renders as the first tab in the tab bar
- Recommended tab is the default active tab on mount
- Clicking "Most Popular" switches away from Recommended
- `getRecommended` is called on initial load (since it's the default tab)

### Manual verification

- Cold start (no saved/starred): shows broadly popular repos across categories
- With saved/starred repos: shows repos related to user's topics/interests
- Pagination works (infinite scroll loads subsequent pages)
- Saved repos are excluded from results
- Tab switching works correctly between all 4 tabs
