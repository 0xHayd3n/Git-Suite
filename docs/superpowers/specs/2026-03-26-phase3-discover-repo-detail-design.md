# Phase 3 — Discover & Repo Detail Design

**Date:** 2026-03-26
**Status:** Approved
**Phases complete before this:** 1 (shell, SQLite, routing) and 2 (GitHub OAuth, onboarding, starred sync, sidebar status)

---

## Overview

Phase 3 builds two fully functional views — the Discover repo grid browser and the Repo Detail page — plus the shared BannerSVG system and SavedReposContext that underpin both. No skill generation in this phase; the Save button persists repo metadata to SQLite only.

---

## New Files

| File | Purpose |
|------|---------|
| `src/components/BannerSVG.tsx` | Deterministic SVG banner, pure function |
| `src/contexts/SavedRepos.tsx` | Thin React context tracking saved repo set |
| `src/views/Discover.tsx` | Full Discover view (replaces stub) |
| `src/views/RepoDetail.tsx` | Full Repo Detail view (replaces stub) |

## Modified Files

| File | Change |
|------|--------|
| `electron/github.ts` | Add `searchRepos`, `getRepo` (extend existing stub), `getReadme`, `getReleases` |
| `electron/main.ts` | Add 6 new `ipcMain.handle` entries |
| `electron/db.ts` | Add `discovered_at` column to `repos`; add `github:saveRepo` / `github:getSavedRepos` logic |
| `electron/preload.ts` | Expose new IPC channels under `window.api.github` |
| `src/App.tsx` | Wrap `AppContent` with `SavedReposProvider` |
| `src/styles/globals.css` | Add Discover + RepoDetail styles |

## New Dependencies

- `react-markdown` — README rendering
- `remark-gfm` — GitHub-flavoured markdown (tables, task lists, strikethrough)

---

## Section 1 — BannerSVG

### Overview

`src/components/BannerSVG.tsx` is a pure function component. Given repo metadata it always returns the same SVG — no randomness, no side effects.

### Props

```ts
interface BannerSVGProps {
  owner: string
  name: string
  language: string
  topics: string[]
  size: 'card' | 'detail'
}
```

### Sizing

| `size` | `viewBox` | `preserveAspectRatio` |
|--------|-----------|----------------------|
| `card` | `0 0 260 72` | `xMidYMid slice` |
| `detail` | `0 0 500 175` | `xMidYMid slice` |

### Seed

Simple djb2 hash of `"${owner}/${name}"` → integer seed used to deterministically vary pattern element positions, sizes, and counts.

### Language → Pattern Mapping

| Language | Pattern | Monospace fragments |
|----------|---------|-------------------|
| Python | Network of nodes connected by lines; labels: GET, POST, PUT, DEL | `async def`, `pydantic` |
| TypeScript / JavaScript | Stacked thin-bordered rectangles (UI chrome fragments) | Component names |
| Rust | Angular geometric shapes — triangles, polygons, sparse | `fn main()`, `impl`, `match` |
| Go | Organic floating circles of varying radius, connected by thin curves | `Model`, `Update`, `View` |
| Python ML/data (topics include `machine-learning`, `deep-learning`, `nlp`, `data`) | Grid of small squares with graduated opacity — attention matrix | `attention`, `embeddings` |
| CLI/TUI (topics include `cli`, `tui`) | Bordered terminal boxes with monospace text inside | Command names |
| Generic fallback | Minimal scatter of dots connected by thin lines | — |

### Colour Scheme

| Language | Bg | Primary | Secondary |
|----------|----|---------|-----------|
| Python | `#050d12` | `#0e9bbf` | `#1ab8d8` |
| TypeScript | `#080608` | `#a78bfa` | `#7c3aed` |
| JavaScript | `#080600` | `#facc15` | `#eab308` |
| Rust | `#090404` | `#f87171` | `#dc2626` |
| Go | `#020905` | `#4ade80` | `#16a34a` |
| ML/data | `#07030f` | `#a78bfa` | `#7c3aed` |
| Generic | `#080810` | `#7c3aed` | `#534AB7` |

### Gradient Scrim

All banners have a gradient scrim overlay at full width/height:
```
linear-gradient(to bottom, rgba(10,10,14,0) 0%, rgba(10,10,14,0.82) 100%)
```

### No DB Caching in Phase 3

BannerSVG generates inline on every render. The `repos.banner_svg` column exists but is not populated in Phase 3. Phase 4 will write the SVG string to SQLite when it needs it for skill generation context.

---

## Section 2 — SavedReposContext

```ts
// src/contexts/SavedRepos.tsx
interface SavedReposContextValue {
  isSaved: (owner: string, name: string) => boolean
  saveRepo: (owner: string, name: string) => Promise<void>
  loading: boolean
}
```

- **Init:** on mount calls `window.api.github.getSavedRepos()` → maps results with `"${row.owner}/${row.name}"` → populates a `Set<string>`
- **isSaved:** `(owner, name) => set.has(`${owner}/${name}`)`
- **saveRepo:** calls `window.api.github.saveRepo(owner, name)` IPC, then optimistically adds `"${owner}/${name}"` to the local set
- **No unsave in Phase 3:** The `✓ Saved` button state sets `pointer-events: none`. Unsaving is intentionally out of scope for Phase 3.
- **Placement:** `SavedReposProvider` wraps `AppContent` as a parent inside `MemoryRouter` in `App.tsx`. Concretely, the `App` default export's JSX becomes: `<MemoryRouter ...><SavedReposProvider><AppContent /></SavedReposProvider></MemoryRouter>`. The provider does not go inside `AppContent` itself.

---

## Section 3 — Data Layer

### Schema Changes

Add four new columns to the existing `repos` table: `discovered_at TEXT`, `discover_query TEXT`, `watchers INTEGER`, and `size INTEGER`. SQLite does not support `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Migration strategy: wrap each `ALTER TABLE` in its own try/catch in `initSchema` — if the column already exists the statement throws and is silently ignored. New installs get both columns from the initial `CREATE TABLE` (add them to the schema string there too).

```ts
try { db.exec(`ALTER TABLE repos ADD COLUMN discovered_at TEXT`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN discover_query TEXT`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN watchers INTEGER`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN size INTEGER`) } catch {}
```

`discovered_at` is set when a repo row originates from the Discover search API. Null for starred/saved repos. `discover_query` records which query string produced this row, used for cache retrieval.

### New IPC Handlers

| Channel | Signature | Behaviour |
|---------|-----------|-----------|
All `github:searchRepos` and `github:getRepo` IPC handlers return **DB row objects** (normalized column names: `stars`, `forks`, `updated_at`, etc.) — not raw `GitHubRepo` API objects (which use `stargazers_count`, `forks_count`). This avoids field-name mismatches in the renderer. Define a `RepoRow` interface mirroring the DB schema for use in renderer code.

| Channel | Signature | Behaviour |
|---------|-----------|-----------|
| `github:searchRepos` | `(query: string) → RepoRow[]` | Checks the `settings` table for a `discover:<query>` key. If the timestamp is < 2h old, returns cached DB rows where `discover_query = query`. If stale, hits `/search/repositories?q=<query>&sort=stars&per_page=18`, upserts rows using `String(repo.id)` for the `id` column (same convention as `getStarred`), sets `discovered_at = now` and `discover_query = query`, preserves `saved_at = repos.saved_at`. Updates the settings cache key. Returns the DB rows. |
| `github:getRepo` | `(owner: string, name: string) → RepoRow` | Hits `/repos/:owner/:name` fresh. Maps API fields to DB columns: `id → String(repo.id)`, `stargazers_count → stars`, `forks_count → forks`, `watchers_count → watchers`, `size → size`. (Same `String(repo.id)` convention as `getStarred`.) Upserts into local DB preserving `discovered_at`, `discover_query`, and `saved_at` via `ON CONFLICT(owner,name) DO UPDATE SET`. Returns the DB row after upsert. |
| `github:getReadme` | `(owner: string, name: string) → string \| null` | Hits `/repos/:owner/:name/readme`, base64-decodes, returns raw markdown string. Returns `null` if the API responds 404 (no README). |
| `github:getReleases` | `(owner: string, name: string) → Release[]` | Hits `/repos/:owner/:name/releases?per_page=10`. Returns empty array on error. |
| `github:saveRepo` | `(owner: string, name: string) → void` | Assumes the row already exists. Sets `saved_at = now` using `UPDATE repos SET saved_at = ? WHERE owner = ? AND name = ?`. |
| `github:getSavedRepos` | `() → { owner: string, name: string }[]` | Returns all rows where `saved_at IS NOT NULL`. |

**Additional schema column:** Add `discover_query TEXT` to `repos` to tag which search query a row was fetched for. This allows cache retrieval to return only the rows for the active query without a full table scan on `discovered_at`.

**saveRepo assumption documented:** `github:saveRepo` assumes the row was already upserted by `searchRepos` or `getRepo`. If called on an unknown row it will silently no-op (UPDATE affects 0 rows). In the RepoDetail view, `getRepo` always upserts the row before the sidebar Save button is rendered, so the row will exist. However, if `getRepo` fails (see error handling in Section 5), the Save button must be hidden — it should only be rendered once repo metadata has successfully loaded.

**Optimistic context/DB divergence:** `saveRepo` in `SavedReposContext` optimistically adds the key to the in-memory set before the IPC call returns. If the DB UPDATE silently no-ops (e.g. row doesn't exist), the UI shows `✓ Saved` but the DB is unchanged. This is an acceptable transient inconsistency in Phase 3: the only path where a row might not exist is a programming error (calling Save before getRepo upserts), and the Save button is hidden in the `getRepo`-failed state, which guards against this case.

**searchRepos upsert must preserve `saved_at`:** The `searchRepos` upsert `ON CONFLICT DO UPDATE SET` clause must NOT include `saved_at`. If a repo that was previously saved by the user reappears in a discover search result, the upsert must leave `saved_at` untouched. Use: `saved_at = repos.saved_at` (i.e., keep the existing value) rather than `saved_at = excluded.saved_at` (which would be NULL from the API payload). Same applies for `discovered_at` / `discover_query` — `searchRepos` sets these, `getStarred` must not touch them.

**getStarred upsert compatibility:** The existing `getStarred` upsert in `main.ts` explicitly names all columns and must remain column-explicit. Do NOT change it to `DO UPDATE SET *`. The new `discovered_at`, `discover_query`, `watchers`, and `size` columns are not included in the `getStarred` upsert's `INSERT` column list — they correctly default to `NULL` on insert and are left untouched by the `DO UPDATE SET` clause on subsequent syncs.

### Token Usage

All API-hitting IPC handlers (`searchRepos`, `getRepo`, `getReadme`, `getReleases`) retrieve the token using the existing `getToken()` helper from `store.ts` (returns `string | null`). The token is passed to the helper function.

The helper functions in `github.ts` must be updated to accept `token: string | null`. When `token` is null, omit the `Authorization` header entirely (do not pass `Bearer undefined`). Update `githubHeaders` to accept `string | null` and only include the header when the token is a non-empty string. This gives unauthenticated access (60 req/hr) when the user has not connected GitHub, and authenticated access (5000 req/hr) when they have.

### Discover Cache Freshness

Cache key: a settings row per query string, e.g. key = `discover:stars:>1000`, value = Unix timestamp of last fetch. If `Date.now() - timestamp < 7_200_000` (2 hours), return cached DB rows where `discover_query = <query>` without hitting the API.

---

## Section 4 — Discover View

**Route:** `/discover`

### Data Flow

1. Mount → call `github:searchRepos('stars:>1000')`
2. Chip click → call `github:searchRepos` with appropriate language/topic filter
3. Search input → client-side filter on `name` + `description` of fetched results
4. Sort toggle → client-side sort of fetched results (Stars: by `stars` desc; Updated: by `updated_at` desc)

### Language Chip → API Query Mapping

| Chip | Query fragment |
|------|---------------|
| All | `stars:>1000` |
| Python | `language:python+stars:>1000` |
| TypeScript | `language:typescript+stars:>1000` |
| Rust | `language:rust+stars:>1000` |
| Go | `language:go+stars:>1000` |
| CLI | `topic:cli+stars:>1000` |
| Web | `topic:web+stars:>1000` |
| Data/ML | `topic:machine-learning+stars:>1000` |

### Topbar

- Background `var(--bg2)`, border-bottom `1px solid var(--border)`, padding `10px 18px`
- Search input: `flex: 1`, bg `var(--bg3)`, border `1px solid var(--border2)`, border-radius `5px`, padding `7px 12px`, font `11px JetBrains Mono`, color `var(--t1)`. Focus: `border-color var(--accent-border)`
- Sort buttons: bg `var(--bg3)`, border `1px solid var(--border)`, border-radius `5px`, padding `7px 11px`, font `11px`, color `var(--t2)`. Active: `color #a78bfa`, `border-color var(--accent-border)`

### Filter Chips Row

Horizontally scrollable, padding `12px 18px`, gap `5px`. Chip: padding `4px 10px`, border-radius `20px`, font-size `10px`, border `1px solid var(--border)`, color `var(--t3)`. Active chip: bg `var(--accent-soft)`, border-color `var(--accent-border)`, color `#a78bfa`. Single select.

### Section Header

```css
display: flex; align-items: center; gap: 10px;
font-size: 9px; color: var(--t3);
letter-spacing: 0.13em; text-transform: uppercase;
```
Followed by `flex: 1; height: 1px; background: var(--border)` horizontal rule.

### Repo Card

Anatomy (top → bottom):
1. **Banner** (72px) — `<BannerSVG size="card" />` with gradient scrim
2. **Language badge** — absolute, top-left of banner, 22×22px, border-radius 4px, 7px from top, 8px from left. Semi-transparent language colour bg, 2-letter abbreviation (Py/Ts/Js/Rs/Go/C+), 8px bold text in language colour
3. **Body** — padding `10px 10px 8px`
4. Repo name (bold 11px `var(--t1)`) + owner (9px `var(--t2)`)
5. Description (2-line clamp, 10px `var(--t2)`)
6. Topic tags row (font-size 8px, padding `1px 5px`, border-radius 2px, border `1px solid var(--border)`, color `var(--t3)`)
7. Footer row: star icon + count (9×9px SVG, 10px `var(--t2)`) + Save button

**Card styles:**
- bg `var(--bg3)`, border `1px solid var(--border)`, border-radius `8px`, overflow hidden, cursor pointer
- Hover: border-color `var(--border2)`, bg `var(--bg4)`

**Save button states:**
- `+ Save` — transparent bg, border `1px solid var(--accent-border)`, color `#a78bfa`, font `9px`, padding `3px 9px`, border-radius `3px`
- `✓ Saved` — bg `rgba(52,211,153,0.08)`, border `rgba(52,211,153,0.2)`, color `#34d399`, `pointer-events: none`

**Grid:** `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 12px 18px`

Clicking the card body → `navigate('/repo/:owner/:name')`. Clicking Save → does not navigate.

---

## Section 5 — Repo Detail View

**Route:** `/repo/:owner/:name`

### Data Flow

1. Extract params, call `github:getRepo` on mount for fresh metadata
2. README tab: lazy-fetch `github:getReadme` on first activation
3. Releases tab: lazy-fetch `github:getReleases` on first activation
4. Related repos: query local DB for repos sharing topics (no extra API call)
5. Save button reads/writes SavedReposContext

### Error Handling

| Fetch | Error behaviour |
|-------|----------------|
| `getRepo` fails | Show a minimal error state in the main area: `"Could not load repo — check your connection."` in `var(--t2)`. Banner still renders using route params (owner/name) with `language=""` (generic fallback). **Save button is hidden** when `getRepo` has failed, since the row may not be in the DB. |
| `getReadme` returns null (no README) | Show `"No README available."` placeholder inside the README tab. |
| `getReadme` fetch throws | Show `"Failed to load README."` placeholder. |
| `getReleases` throws | Show `"Failed to load releases."` placeholder inside the Releases tab. |
| Related repos query returns 0 results | Hide the related repos sidebar panel entirely. |

Stats bar "Version" field: populated from the first item of `getReleases`. If releases haven't loaded yet or the array is empty, show `"—"`.

### Breadcrumb

```
Discover › {language} › {repoName}
```
- bg `var(--bg2)`, border-bottom, padding `9px 20px`
- "Discover" and language in `var(--t2)`, clickable (`navigate(-1)` / `navigate('/discover')`)
- Repo name in `var(--t1)`
- Separators `›` in `var(--t3)` opacity 0.4
- **While loading:** language segment shows `…` until `getRepo` resolves. If `language` is null after resolution, the language segment is omitted entirely (`Discover › {repoName}`).

### Banner (detail)

`<BannerSVG size="detail" />` — 175px tall, full width. While `getRepo` is loading, pass `language=""` (empty string) to `BannerSVG`, which triggers the generic fallback pattern. Once `getRepo` resolves, re-render with the actual language. If `getRepo` fails, keep `language=""` (generic fallback). Overlay (absolute, bottom-left, padding `16px 22px`):
- Language badge: 38×38px, border-radius 7px
- Repo title: 20px bold white, `text-shadow: 0 1px 4px rgba(0,0,0,0.6)`
- Owner: 10px `rgba(255,255,255,0.45)`

### Stats Bar

bg `var(--bg2)`, border-bottom, padding `10px 22px`. Flex row, gap `14px`. Stats: Stars, Forks, Issues, Version (latest release tag), Updated. Values bold `var(--t1)`, labels `var(--t2)`. Separator `·`.

### Tab Bar

Tabs: **README** | **Skill file** | **Releases** | **Collections**

- Padding `0 22px`, border-bottom `1px solid var(--border)`
- Tab: padding `9px 14px`, font `11px`, color `var(--t2)`
- Active: color `#a78bfa`, border-bottom `2px solid var(--accent)`, margin-bottom `-1px`

### Tab Content

**README:** `react-markdown` + `remark-gfm`. Code blocks: bg `var(--bg4)`, border `1px solid var(--border)`, border-radius `4px`, padding `10px 12px`, color `#a78bfa`, font-size `10px`. Rendered inside a scrollable container with padding `20px 22px`.

**Skill file:** Fully clickable tab; renders a placeholder message: `"Install this repo to generate a skill file."` styled in `var(--t2)` at `11px`, padding `20px 22px`. Not greyed out — selecting the tab just shows the placeholder. Phase 4 replaces the placeholder content.

**Releases:** List of up to 10 releases. Each: tag, name, date, description excerpt. Simple list, padding `20px 22px`.

**Collections:** Placeholder — `"Not in any collections."` (Phase 6).

### Layout Split

```
[main column flex:1] | [sidebar 220px]
```
Content area below the tab bar, padding `0 22px` on main.

### Sidebar

**Save button:** Full width, same states as card button, padding `10px`, font-size `11px`, border-radius `6px`.

**Skill file panel:** bg `var(--bg3)`, border, border-radius `7px`, overflow hidden.
- Header: padding `9px 12px`, border-bottom, flex row — filename left, status right (`"— not installed"` in `var(--t3)` for Phase 3)
- Body: padding `12px`. Three depth rows (Core / Extended / Deep) with progress bars. Note: `"Models read as far as context allows."` (Phase 3: all static placeholder data)

**Repository metadata:** Section label `9px uppercase var(--t3)`. Key-value rows: flex space-between, `10px`. Fields: License, Language, Size, Watchers, Contributors, In collections.

Data sources per field:
- **License** — `repos.license` (already in schema)
- **Language** — `repos.language` (already in schema)
- **Size** — `repos.size` (new column, populated by `getRepo`; show in KB, e.g. `"14,230 KB"`)
- **Watchers** — `repos.watchers` (new column, populated by `getRepo`)
- **Contributors** — Show `"—"` in Phase 3. Fetching contributors requires a separate API call (`/repos/:owner/:name/contributors`); deferred to a future phase.
- **In collections** — Show `"—"` in Phase 3 (Phase 6 wires this up).

**Related repos:** 3 cards from local DB (repos sharing topics). Each: bg `var(--bg3)`, border, border-radius `6px`, padding `10px`, cursor pointer. Name `11px var(--t1)`, description `9px var(--t3)` 2-line clamp, stars `9px var(--t2)`.

**Related repos query:** `topics` is stored as a JSON string (e.g. `'["cli","rust","async"]'`). To find related repos: parse the current repo's topics in JS, take the first 5 topics (cap to avoid too many queries), then for each topic issue one SQLite query: `SELECT * FROM repos WHERE topics LIKE ? AND NOT (owner = ? AND name = ?) LIMIT 10` with `%"topicName"%` as the LIKE pattern. Collect all result rows, deduplicate by `owner/name`, sort by `stars` desc, take the top 3. If fewer than 1 result after deduplication, hide the related repos panel entirely.

---

## Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Markdown rendering | `react-markdown` + `remark-gfm` | Real-world READMEs need GFM support |
| Saved state management | React Context (`SavedReposContext`) | Keeps Save button in sync across Discover and RepoDetail without re-fetching |
| SavedReposProvider placement | Wraps `AppContent` inside `MemoryRouter` in `App` default export | Context does not need router; avoids any entanglement with routing hooks |
| No unsave in Phase 3 | `✓ Saved` is non-interactive (`pointer-events: none`) | Unsave / library management is Phase 5 scope |
| BannerSVG DB caching | Deferred to Phase 4 | No consumer in Phase 3; avoids extra IPC per card |
| Discover cache storage | `discovered_at` + `discover_query` columns on `repos` table | Avoids a second table; per-query freshness via settings rows |
| SQLite migration strategy | try/catch around each `ALTER TABLE` (one per new column) | SQLite has no `IF NOT EXISTS` for `ALTER TABLE` |
| `getStarred` upsert unchanged | Keep column-explicit — do not add new columns | Prevents `discovered_at`/`discover_query`/`watchers`/`size` being overwritten with NULL on subsequent starred syncs |
| IPC return type | Both `searchRepos` and `getRepo` return `RepoRow` (DB shape) | Avoids `stargazers_count` vs `stars` field-name mismatch in renderer |
| Contributors field | Show `"—"` in Phase 3 | Requires separate `/contributors` API call; deferred |
| Related repos | LIKE-based topic match on local DB | No extra API call; GFM JSON string format handled in JS |
| Back navigation | `navigate(-1)` from breadcrumb | Preserves Discover scroll position |
