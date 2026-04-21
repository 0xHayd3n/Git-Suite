# Nested Repo Type System Design

**Date:** 2026-04-03
**Status:** Approved

## Summary

Replace the existing flat 6-type repo classifier with a two-tier nested taxonomy (6 buckets × multiple sub-types). Add `type_bucket` and `type_sub` to the SQLite schema. Persist classification at upsert time in the Electron main process. Introduce a 6-column multi-select `TypeFilterDropdown` in the Discover filter row. Keep the existing card accent color system intact via a backward-compatible shim on `classifyRepoType`.

## Background

The current classifier (`src/lib/classifyRepoType.ts`) assigns one of 6 flat types to each repo using a scoring heuristic. The type filter in Discover uses a single-column `TypeDropdown`. As the taxonomy grows, a two-tier nested system gives users finer-grained filtering (e.g. "show me only linters and build tools, not all dev-tools"). The existing Languages filter and card accent colors must remain unaffected.

## Architecture Decision

**Approach A (DB-persisted):** Classification runs in the Electron main process at upsert time. `type_bucket` and `type_sub` are written to SQLite. The Discover filter reads `repo.type_sub` directly from the `RepoRow`. Cards continue to use a shimmed `classifyRepoType()` that maps bucket → legacy type for accent colors.

Chosen over:
- **Approach B** (renderer-only): no DB persistence, contradicts spec.
- **Approach C** (hybrid write-back): extra IPC round-trip complexity.

## Phase 1 — Taxonomy Constants

**File:** `src/constants/repoTypes.ts`

```ts
export type RepoSubType = { id: string; label: string; bucket: string }
export type RepoBucket  = { id: string; label: string; color: string; subTypes: RepoSubType[] }
```

**`REPO_BUCKETS: RepoBucket[]`** — 6 buckets:

| id | label | color | sub-types |
|---|---|---|---|
| dev-tools | Dev Tools | blue (#3b82f6) | algorithm, testing, build-tool, pkg-manager, linter, formatter, debugger, vcs-tool |
| ai-ml | AI & ML | purple (#8b5cf6) | ai-model, ml-framework, dataset, neural-net, ai-agent, prompt-lib |
| editors | Editors & IDEs | teal (#14b8a6) | code-editor, ide, terminal, notebook, text-editor |
| lang-projects | Language Projects | amber (#f59e0b) | lang-impl, style-guide, transpiler, runtime, compiler |
| infrastructure | Infrastructure | coral (#ef4444) | database, container, devops, cloud-platform, monitoring, networking |
| utilities | Utilities | gray (#6b7280) | cli-tool, library, platform, api-client, boilerplate, plugin |

Also exported: `REPO_SUB_TYPES: RepoSubType[]` — flat list derived from `REPO_BUCKETS` for O(1) lookup in filter predicates.

## Phase 2 — SQLite Schema Migration

**`electron/db.ts`** — Phase 16 migration (idempotent try/catch, consistent with all prior phases):

```ts
// Phase 16 migration — nested repo type system
try { db.exec(`ALTER TABLE repos ADD COLUMN type_bucket TEXT`) } catch {}
try { db.exec(`ALTER TABLE repos ADD COLUMN type_sub    TEXT`) } catch {}
```

Existing rows receive `NULL` for both columns — no error, no data loss.

**`src/types/repo.ts`** — `RepoRow` gains two new nullable fields:

```ts
type_bucket: string | null  // e.g. "dev-tools"
type_sub:    string | null  // e.g. "algorithm"
```

The existing `type: string | null` field remains in the interface (column cannot be dropped in SQLite without table rebuild; it becomes unused for classification but causes no harm).

**`src/lib/classifyRepoType.test.ts`** — the `makeRepo` factory must also be updated to include the two new fields so it continues to satisfy the `RepoRow` interface:

```ts
type_bucket: null,
type_sub:    null,
```

## Phase 3 — Classifier Rewrite

**File:** `src/lib/classifyRepoType.ts` (rewritten in-place)

### New core function

```ts
export function classifyRepoBucket(
  repo: { name: string; description: string | null; topics: string }
): { bucket: string; subType: string } | null
```

**Priority order:** topics → name → description → `null`

Rules are evaluated top-down; first match wins. Key rules:

| Signal | Bucket | SubType |
|---|---|---|
| topics: `machine-learning`, `deep-learning`, `neural-network`, `llm`, `gpt`, `transformer` | ai-ml | ai-model or ml-framework |
| topics: `ai-agent`, `agent`, `langchain` | ai-ml | ai-agent |
| topics: `prompt`, `prompt-engineering` | ai-ml | prompt-lib |
| topics: `algorithm`, `data-structures` | dev-tools | algorithm |
| topics: `testing`, `jest`, `pytest`, `mocha`, `test-framework`, `vitest` | dev-tools | testing |
| topics/name: `eslint`, `prettier`, `rubocop`, `linter` | dev-tools | linter |
| topics/name: `formatter`, `autopep8` | dev-tools | formatter |
| topics/name: `webpack`, `vite`, `rollup`, `cmake`, `gradle`, `build-tool` | dev-tools | build-tool |
| topics/name: `npm`, `pip`, `cargo`, `homebrew`, `pkg-manager` | dev-tools | pkg-manager |
| topics/name: `debugger`, `gdb`, `lldb` | dev-tools | debugger |
| topics/name: `git`, `vcs`, `svn`, `mercurial` | dev-tools | vcs-tool |
| topics/name: `vscode`, `neovim`, `vim`, `emacs`, `zed`, `helix` | editors | code-editor |
| topics/name: `intellij`, `eclipse`, `xcode`, `android-studio` | editors | ide |
| topics/name: `terminal`, `shell`, `iterm`, `alacritty`, `wezterm` | editors | terminal |
| topics/name: `notebook`, `jupyter` | editors | notebook |
| topics: `docker`, `container` | infrastructure | container |
| topics/name: `kubernetes`, `helm`, `terraform`, `devops`, `ansible` | infrastructure | devops |
| topics/name: `database`, `postgres`, `mysql`, `sqlite`, `mongodb`, `redis` | infrastructure | database |
| topics/name: `monitoring`, `observability`, `prometheus`, `grafana`, `datadog` | infrastructure | monitoring |
| topics/name: `networking`, `proxy`, `nginx`, `caddy`, `load-balancer` | infrastructure | networking |
| topics: `cli`, `command-line` | utilities | cli-tool |
| topics: `plugin`, `extension` | utilities | plugin |
| topics/name: `boilerplate`, `starter`, `template` | utilities | boilerplate |
| topics: `library`, `lib` | utilities | library |
| topics: `api-client`, `sdk` | utilities | api-client |
| No match | — | null |

### Backward-compatible shim

`RepoType` union and `classifyRepoType` signature are **unchanged** — all existing callers (`RepoCard`, `RepoListRow`, `BannerSVG`, `RepoDetail`, `REPO_TYPE_CONFIG`) require zero modifications.

```ts
export type RepoType = 'awesome-list' | 'learning' | 'framework' | 'tool' | 'application' | 'other'

const BUCKET_TO_LEGACY: Record<string, RepoType> = {
  'dev-tools':      'tool',
  'ai-ml':          'framework',
  'editors':        'application',
  'lang-projects':  'framework',
  'infrastructure': 'tool',
  'utilities':      'tool',
}

export function classifyRepoType(repo: RepoRow): RepoType {
  const result = classifyRepoBucket(repo)
  return result ? (BUCKET_TO_LEGACY[result.bucket] ?? 'other') : 'other'
}
```

**Note on existing tests:** The new taxonomy has no `'awesome-list'` or `'learning'` bucket — those concepts don't exist in the new system. The 5 existing `classifyRepoType` tests that assert `'awesome-list'` or `'learning'` return values must be **deleted** when rewriting the classifier; they test scoring logic that no longer exists. New tests should be written for `classifyRepoBucket` verifying `{ bucket, subType }` outputs against the new rule set.

### Electron integration

`electron/main.ts` imports `classifyRepoBucket` from `../src/lib/classifyRepoType` (consistent with the existing `../src/types/repo` import pattern).

Four upsert sites are updated to classify and persist:
1. `github:getStarred`
2. `github:searchRepos`
3. `github:getRepo`
4. `upsertAndReturnRepoRows()` shared helper

The minimal `github:starRepo` upsert (only sets `starred_at`, no repo metadata) is left unchanged — there is no name/description/topics data available at that point to classify.

Each upsert adds `type_bucket` and `type_sub` to the INSERT column list and the `ON CONFLICT DO UPDATE` clause.

## Phase 4 — TypeFilterDropdown Component

**File:** `src/components/TypeFilterDropdown.tsx`

### Props

```ts
interface TypeFilterDropdownProps {
  selected: string[]
  onChange: (selected: string[]) => void
}
```

### Trigger button

Uses `.discover-filter-icon-btn` class (matches the Filters button in the same row). Shows `"Type"` when empty; `"Type · N"` with `.filter-badge` count when active. Chevron icon on right. When selections exist, adds the `.has-filters` modifier class (same as the Filters button, not `.active` which is a `.view-tab` modifier with different styling).

### Panel

Absolutely positioned below the button. Dark glassmorphism: `var(--bg2)` background, `var(--border2)` border, `border-radius: var(--radius)`, JetBrains Mono font (inherited). No heavy box-shadow.

**Layout:** CSS grid, 6 equal columns — one per bucket.

Each column:
- **Sticky header** — bucket label, colored to match bucket's accent (`color` field from `REPO_BUCKETS`)
- **Sub-type rows** — label text; clicking toggles that sub-type id in `selected`. Active state shown with a colored left border or background tint. Multi-select across buckets fully supported.

**Close behaviour:**
- Click outside — `useEffect` with document `mousedown` handler, same pattern as existing `TypeDropdown`
- `Escape` key — `useEffect` keydown handler
- No backdrop overlay, no apply/cancel step (live filtering)

### CSS classes (added to `globals.css`)

| Class | Purpose |
|---|---|
| `.tfd-panel` | Positioned dropdown card |
| `.tfd-grid` | 6-column CSS grid container |
| `.tfd-col` | Single bucket column |
| `.tfd-col-header` | Sticky bucket label row, colored |
| `.tfd-item` | Sub-type row, hover + active states |
| `.tfd-item.active` | Selected sub-type visual |

## Phase 5 — Discover View Wiring

### State changes

| Change | Detail |
|---|---|
| Add | `selectedTypes: string[]` (default `[]`) |
| Remove | `activeTypes: Set<RepoType>` |
| Remove | `handleTypeToggle` callback |
| Keep | `repoTypes: Map<string, RepoType>` — still drives card accent colors |
| Keep | All `classifyRepoType` calls that build `repoTypes` |

### Filter predicate (updated `useMemo`)

New clause added alongside existing predicates:
```ts
(selectedTypes.length === 0 || (r.type_sub != null && selectedTypes.includes(r.type_sub)))
```

Uncategorized repos (`type_sub = null`) are automatically excluded when any type filter is active — the `!= null` guard covers this without special-casing.

### Layout

`TypeFilterDropdown` placed in `discover-filter-row` as a peer of the Filters button:

```
[✓ shield] [~ shield]  [Type ▾]  [Filters ▾]  [Layout ▾]
```

`TypeDropdown` import and usage removed from `discover-view-tabs`.

### Snapshot

`selectedTypes` is not persisted in the discover snapshot (consistent with `activeTypes` today — type filters reset on navigation).

### Unchanged

- `FilterDropdown` (Languages tab untouched)
- `RepoCard`, `RepoListRow`, `BannerSVG`, `RepoDetail`
- `REPO_TYPE_CONFIG`, accent color system

## File Change Summary

| Action | File |
|---|---|
| Create | `src/constants/repoTypes.ts` |
| Modify | `src/types/repo.ts` — add `type_bucket`, `type_sub` to `RepoRow` |
| Modify | `electron/db.ts` — Phase 16 migration |
| Rewrite | `src/lib/classifyRepoType.ts` — new `classifyRepoBucket` + shim |
| Modify | `src/lib/classifyRepoType.test.ts` — add tests for `classifyRepoBucket` |
| Modify | `electron/main.ts` — import classifier, update 4 upsert sites |
| Create | `src/components/TypeFilterDropdown.tsx` |
| Modify | `src/views/Discover.tsx` — swap state, swap component, update filter predicate |
| Modify | `src/styles/globals.css` — new `.tfd-*` classes |
| Delete | `src/components/TypeDropdown.tsx` — replaced by TypeFilterDropdown |
| Delete | `src/components/TypeDropdown.test.tsx` — no longer has a subject to test |

## Out of Scope

- Rewiring card accent colors to use bucket colors (future pass)
- Removing the `type` column from SQLite
- Persisting `selectedTypes` in the discover snapshot
- Changes to `TypeDropdown.tsx` (file can be deleted once Discover no longer imports it)
- Changes to `FilterDropdown`, Languages filter, or any other view
