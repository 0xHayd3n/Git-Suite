# Discover View Redesign

**Date:** 2026-03-31
**Status:** Approved

---

## Overview

A four-phase redesign of the Discover view that restructures the tab row into three functional zones, adds a repo type classifier, introduces a card accent system, and unifies the filter controls into a single dropdown panel.

---

## Phase 1: Tab Row Restructure

### Layout

The existing `.discover-view-tabs` container becomes a single `display: flex; justify-content: space-between; align-items: center` row with three zones.

### Zone A (left) — Sort tabs

Three `<button class="view-tab">` elements: Most Popular, Most Forked, Rising.

- Remove `recently_updated` from `VIEW_MODES` entirely.
- Update the local `ViewModeKey` type in **both** `src/views/Discover.tsx` and `src/lib/discoverStateStore.ts` from `'popular' | 'updated' | 'forked' | 'rising'` to `'popular' | 'forked' | 'rising'`. When restoring a snapshot whose `viewMode` is `'updated'`, fall back to `'popular'`.
- Existing tab styling (underline on active, accent color) unchanged.

### Zone B (centre) — Type filter tabs

Six toggle buttons: Awesome List, Learning, Framework, Tool, Application, Other.

- Each has a small icon + text label (icons come from `REPO_TYPE_CONFIG`, see Phase 3).
- Active state: filled pill style (accent background, white text) — visually distinct from sort tabs which use an underline.
- Clicking toggles the type in/out of a `Set<RepoType>` held in `activeTypes` state in `Discover.tsx`.
- `activeTypes` is initialised to `new Set<RepoType>()` (empty — all repos visible by default).
- Multiple types can be active simultaneously (union/additive filtering).
- When `activeTypes` is empty, all repos show.
- `activeTypes` is **not** included in `DiscoverSnapshot` — it resets to empty on back-navigation by design.

### Zone C (right) — Filter controls

A `1px solid var(--border)` vertical divider, a funnel icon button (`LuFilter` from `react-icons/lu`), and a `Languages` text button.

- Both open the unified `FilterDropdown` (see Phase 4).
- Filter icon opens to the last-used tab (default: Activity tab).
- Languages button opens directly to the Languages tab.
- When any filter is active, the funnel button shows a circular badge with the active-filter count.
- The funnel button always has `aria-label={filterBadgeCount > 0 ? \`Filters (${filterBadgeCount} active)\` : 'Filters'}`.
- Remove the `LanguageDropdown` JSX block (currently defined inline in `Discover.tsx`) from the top-right corner of the view.

**Zone C DOM structure:** Wrap Zone C contents (divider + Filter button + Languages button + `FilterDropdown`) in a `<div style={{ position: 'relative' }}>`. `FilterDropdown` is rendered inside this wrapper so its `position: absolute` anchors to it. `FilterDropdown` is **conditionally rendered**: `{filterDropdownOpen && <FilterDropdown ... />}`.

---

## Phase 2: Repo Type Classifier

### File

`src/lib/classifyRepoType.ts`

### Interface

```typescript
export type RepoType =
  | 'awesome-list'
  | 'learning'
  | 'framework'
  | 'tool'
  | 'application'
  | 'other'

export function classifyRepoType(repo: RepoRow): RepoType
```

### Approach

Pure, synchronous, no API calls. Additive scoring — each signal adds points to a type bucket; highest score wins; ties fall back to `other`.

### Topics parsing

`RepoRow.topics` is typed as non-nullable `string`. Parse with `JSON.parse(repo.topics) as string[]` inside a try/catch. If parsing fails, treat topics as empty array.

### Description matching

All description-keyword signals use **case-insensitive substring matching** (lowercase both the description and the search term before calling `.includes()`). `repo.description` may be null — treat null as empty string.

### Scoring table

| Signal | awesome-list | learning | framework | tool | application |
|--------|:-----------:|:--------:|:---------:|:----:|:-----------:|
| topic: `awesome-list` | +10 | | | | |
| topic: `tutorial`, `course`, `roadmap`, `education`, `learn` | | +5 each | | | |
| topic: `framework`, `library` | | | +5 each | | |
| topic: `cli`, `tool`, `plugin`, `extension` | | | | +5 each | |
| topic: `app`, `application`, `desktop`, `mobile`, `web-app` | | | | | +5 each |
| name starts with `awesome-` | +8 | | | | |
| name ends with `-cli` | | | | +6 | |
| name ends with `-framework` or `-lib` | | | +6 | | |
| name ends with `-app` or `-desktop` | | | | | +6 |
| name ends with `-boilerplate`, `-starter`, or `-template` | | | | | +4 |
| desc contains `"curated list"`, `"collection of"`, `"awesome"` | +6 | | | | |
| desc contains `"learn"`, `"guide to"`, `"how to"`, `"tutorial"` | | +4 | | | |
| desc contains `"framework for"`, `"library for"` | | | +4 | | |
| desc contains `"cli"`, `"command-line tool"` | | | | +4 | |

**Note on boilerplate/template:** Repos matching `*-boilerplate`, `*-starter`, `*-template` name patterns are classified as `application` with no special-casing. There is no seventh `RepoType` variant.

### Integration in Discover.tsx

`RepoRow.id` is `string`. The map key type is `string`.

After `loadTrending()` (and after each search) resolves, both `repos` and `repoTypes` are updated in the same React state batch:

```typescript
setRepos(fetchedRepos)
setRepoTypes(new Map<string, RepoType>(fetchedRepos.map(r => [r.id, classifyRepoType(r)])))
```

New state variable: `repoTypes: Map<string, RepoType>` (initialised to `new Map()`).

During the brief render before the map is populated, `repoTypes.get(r.id) ?? 'other'` falls through to `'other'` — acceptable; no visual glitch.

Type filtering applied to produce `visibleRepos` for rendering:

```typescript
const visibleRepos = repos.filter(r =>
  activeTypes.size === 0 || activeTypes.has(repoTypes.get(r.id) ?? 'other')
)
```

No DB persistence — client-side only, reclassified on every fetch.

---

## Phase 3: Card Accent System

### Icons

Use `react-icons/lu` (Lucide icons via react-icons, already installed). **Do not install `lucide-react`.**

### File

`src/config/repoTypeConfig.ts`

### Config shape

```typescript
import { LuStar, LuBookOpen, LuLayers, LuWrench, LuMonitor } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { RepoType } from '../lib/classifyRepoType'

export const REPO_TYPE_CONFIG: Record<RepoType, {
  label: string
  icon: IconType | null
  accentColor: string
}> = {
  'awesome-list': { label: 'Awesome List', icon: LuStar,     accentColor: '#f59e0b' },
  'learning':     { label: 'Learning',     icon: LuBookOpen, accentColor: '#3b82f6' },
  'framework':    { label: 'Framework',    icon: LuLayers,   accentColor: '#8b5cf6' },
  'tool':         { label: 'Tool',         icon: LuWrench,   accentColor: '#10b981' },
  'application':  { label: 'Application', icon: LuMonitor,  accentColor: '#ef4444' },
  'other':        { label: 'Other',         icon: null,       accentColor: 'transparent' },
}
```

Zone B type filter tabs in `Discover.tsx` also render icons from this config. When `REPO_TYPE_CONFIG[type].icon` is `null` (i.e., the "Other" type), render the text label only — no icon element.

Zone C filter button uses `LuFilter` from `react-icons/lu`.

### RepoCard changes

- Accept optional prop `repoType?: RepoType`.
- **CSS change in `globals.css`:** Replace the `.repo-card` `border` shorthand with four individual properties:
  ```css
  border-top: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  ```
  Also update the `.repo-card:hover` rule: replace `border-color: var(--border2)` (a shorthand that would override all four sides) with three individual properties that leave `border-left-color` alone:
  ```css
  border-top-color: var(--border2);
  border-right-color: var(--border2);
  border-bottom-color: var(--border2);
  ```
  This ensures the accent `borderLeft` inline style is not overridden on hover.
- **Inline style on `.repo-card`:**
  ```tsx
  style={{ borderLeft: repoType && repoType !== 'other' ? `2px solid ${accentColor}` : undefined }}
  ```
- In the **card body** (`.repo-card-body`), immediately **after** the `<CardTags>` component (between tags and the footer), render a type badge when `repoType` is defined and `repoType !== 'other'`:
  - Icon component at 10px (if `icon` is not null)
  - Label text at 11px
  - Both colored with `accentColor`
  - `4px` top margin to separate it from the tags above
- `other` type and undefined `repoType`: no badge rendered, no `borderLeft` override. The badge suppression check is `repoType !== 'other'` (explicit — not inferred from empty label).

> **Note:** `CardTags` is in `.repo-card-body`, not in `.repo-card-footer`. The footer contains stats and action buttons only.

### Prop threading

`Discover.tsx` passes `repoType={repoTypes.get(repo.id)}` to each `<RepoCard>`. Library and other views pass nothing — prop is optional with no-op defaults.

---

## Phase 4: Filter Dropdown Unification

### File

`src/components/FilterDropdown.tsx`

### Props

```typescript
type FilterTab = 'activity' | 'stars' | 'license' | 'topics' | 'languages'

interface FilterDropdownProps {
  initialTab: FilterTab        // controlled by Discover.tsx; passed fresh on each mount
  filters: SearchFilters       // the committed (applied) filter state from Discover.tsx
  activeLanguage: string       // the committed language state from Discover.tsx
  languages: LangDef[]         // pass LANGUAGES imported from src/lib/languages.ts
  onClose: () => void
  onChange: (filters: SearchFilters, language: string) => void
}
```

`LangDef` is the interface exported from `src/lib/languages.ts` (the type of each element in the `LANGUAGES` array).

No `open` prop — the component is conditionally rendered, so it is always open when mounted.

### Language categories

The `LANGUAGE_CATEGORIES` constant (currently defined locally in `Discover.tsx` alongside the inline `LanguageDropdown` JSX) must move into `FilterDropdown.tsx` alongside the lifted language grid JSX. It does not need to be exported.

### Control model

`FilterDropdown` uses **internal staging state** — copies of `filters` and `activeLanguage` edited inside the panel. The parent's committed state is not updated until the user commits. On mount, internal state is initialised from the incoming props. No `useEffect` watching an `open` prop is needed.

- **Apply:** calls `onChange(stagedFilters, stagedLanguage)` then `onClose()`.
- **Clear All:** resets staged state to defaults, then calls `onChange({}, '')` and `onClose()` — commits the clear and closes in one action.
- **Click outside / ESC:** calls `onClose()` only — staged changes are discarded.

`activeTab` is internal state initialised from `initialTab` on mount.

### `onChange` handler in Discover.tsx — trigger pattern

`handleSearch` currently has the signature `handleSearch(overrideFilters?: SearchFilters, overrideQuery?: string)`. It reads `activeLanguage` from the React closure. Calling `setActiveLanguage(newLanguage)` then `handleSearch(newFilters)` in the same synchronous frame will use the stale (pre-update) language.

To fix this, **extend `handleSearch` to accept an optional third parameter `overrideLanguage?: string`** and use it in place of the closed-over `activeLanguage` when provided:

```typescript
const handleSearch = async (
  overrideFilters?: SearchFilters,
  overrideQuery?: string,
  overrideLanguage?: string,
) => {
  const filters  = overrideFilters  ?? appliedFilters
  const q        = overrideQuery    ?? query
  const langFilter = (overrideLanguage !== undefined ? overrideLanguage : activeLanguage) || undefined
  // ... rest of function uses langFilter instead of activeLanguage directly
}
```

Then `handleFilterChange` becomes:

```typescript
function handleFilterChange(newFilters: SearchFilters, newLanguage: string) {
  setAppliedFilters(newFilters)
  setActiveLanguage(newLanguage)
  handleSearch(newFilters, undefined, newLanguage)
}
```

**Do NOT rely on the existing `useEffect([viewMode, activeLanguage])` for this** — that effect omits `appliedFilters` intentionally and will not fire when only filters change.

### Pre-existing bug: `loadTrending` ignores its `filters` parameter

`loadTrending` currently passes only `viewMode` and `activeLanguage` to `buildViewModeQuery`, silently ignoring the `filters` argument. As part of Phase 4 implementation, fix `loadTrending` to incorporate `filters` into the GitHub search query. The simplest approach: build the base query as before, then append filter qualifiers (`pushed:>date`, `stars:>N`, `license:MIT`, topic terms) by calling the same filter-to-query-string logic already used in `handleSearch`/`search.raw`. This is required for filter changes to actually affect trending results.

### Layout

- Rendered inside the Zone C `position: relative` wrapper.
- `position: absolute; top: calc(100% + 6px); right: 0`
- Width: `min(480px, calc(100vw - 32px))`
- Two-column layout: left column 140px (vertical tab list), right column fills remainder.
- Same `box-shadow` and `border-radius` as existing lang dropdown panel.

### Tab contents

| Tab | Content |
|-----|---------|
| Activity | Radio group: Any time / Last 7 days / Last 30 days / Last 6 months |
| Stars | Radio group: Any / >100 / >1 000 / >10 000 |
| License | Radio group: Any / MIT / Apache 2.0 / GPL 3.0 |
| Topics | Text input + tag chips (existing topics filter UI moved here) |
| Languages | Full language category grid (lifted from `LanguageDropdown` JSX + `LANGUAGE_CATEGORIES` constant) |

### Active tab state

`Discover.tsx` owns `filterDropdownInitialTab: FilterTab` state (default `'activity'`):
- Filter icon clicked → keep current value, set `filterDropdownOpen = true`.
- Languages button clicked → set `filterDropdownInitialTab = 'languages'`, set `filterDropdownOpen = true`.

Because `FilterDropdown` is conditionally rendered, the fresh `initialTab` prop is consumed on each mount.

### Badge

In Zone C, when `count > 0` show `<span className="filter-badge">{count}</span>` overlaying the funnel button.

`count` computed in `Discover.tsx`:

```typescript
const filterBadgeCount =
  (activeLanguage !== '' ? 1 : 0) +
  (appliedFilters.activity ? 1 : 0) +
  (appliedFilters.stars ? 1 : 0) +
  (appliedFilters.license ? 1 : 0) +
  (appliedFilters.topics?.length ? 1 : 0)  // topics collectively count as 1
```

`appliedFilters` is the **committed** state in `Discover.tsx` (drives search queries). There is no separate staging copy in `Discover.tsx`.

### Discover.tsx state changes

- Remove `filterPanelOpen` state and all slide-down filter panel JSX.
- Remove the inline `LanguageDropdown` JSX block, `LANGUAGE_CATEGORIES` constant, and related hover-timer refs.
- Add `filterDropdownOpen: boolean` (default `false`).
- Add `filterDropdownInitialTab: FilterTab` (default `'activity'`).
- Existing `appliedFilters` and `activeLanguage` state remain unchanged and continue to drive queries.

---

## File Inventory

| Action | File |
|--------|------|
| New | `src/lib/classifyRepoType.ts` |
| New | `src/config/repoTypeConfig.ts` |
| New | `src/components/FilterDropdown.tsx` |
| Modified | `src/views/Discover.tsx` |
| Modified | `src/components/RepoCard.tsx` |
| Modified | `src/styles/globals.css` |
| Modified | `src/lib/discoverStateStore.ts` (remove `'updated'` from local `ViewModeKey` type) |
| Removed | Inline `LanguageDropdown` JSX/logic from `Discover.tsx` (absorbed into `FilterDropdown`) |

---

## Out of Scope

- DB persistence of `repo_type` (client-side classification only).
- Type filtering in Library, Starred, or Collections views.
- Changing the natural-language / raw search mode UI.
- Any changes to the RepoDetail view.
- `activeTypes` snapshot persistence (resets to empty on back-navigation by design).
