# Discover Sidebar Panel Design

## Summary

Replace the current global Sidebar (floating logo button + slide-out nav panel) and horizontal FilterBar with a new Discover-specific sidebar panel. The sidebar has two parts: a persistent narrow icon rail (always visible on the Discover route) and an expandable content panel that opens when an icon is clicked.

App-wide navigation (Discover, Library, Collections, Starred) remains in the bottom nav bar — unchanged. The sidebar rail is purely for Discover view controls: Buckets and Filters.

Browse All / Recommended are removed from the sidebar and replaced with a simple All/Recommended pill toggle in the grid header area.

## Motivation

The current layout spreads category browsing, filtering, and view mode switching across multiple horizontal bars (FilterBar chips, SortDropdown, DiscoverSuggestions). This design consolidates all Discover-specific controls into a single, organized side panel — giving filters and buckets proper vertical space to be scannable rather than crammed into chip popovers.

## Component Changes

### New

- **`DiscoverSidebar.tsx`** — Main component containing the icon rail + expandable panel. Renders two sub-sections internally (not separate files): `BucketsPanel` and `FiltersPanel`, shown conditionally based on which icon is active.

### Removed

- **`Sidebar.tsx`** + **`Sidebar.test.tsx`** — Deleted (already dead code — not rendered anywhere, only imported by its own test). Clean up the files.
- **`FilterBar.tsx`** — Deleted. All filter controls move into DiscoverSidebar's FiltersPanel.
- **`SortDropdown.tsx`** — Deleted (already dead code — not imported anywhere).
- **`SmartBar.tsx`** + **`SmartBar.test.tsx`** — Deleted. SmartBar currently handles bucket tabs, subtype selection, and view mode switching in Discover.tsx. All of this functionality moves into DiscoverSidebar (buckets → BucketsPanel, view mode → grid header toggle).
- **`DiscoverLanding.tsx`** + **`DiscoverLanding.test.tsx`** — Deleted. The landing page (shown when `viewMode === null`) is no longer needed. The Discover view now always shows the grid with the sidebar rail — "All" is the default view mode. The SmartBar search functionality that DiscoverLanding duplicated remains in the existing search/SmartBar area.
- **`LanguagePopover.tsx`** — Deleted. Language selection moves inline into FiltersPanel as a simplified search + chip selector.
- **`LayoutPopover.tsx`** — Functionality preserved but triggered from the grid header bar instead of FilterBar.

### Modified

- **`Discover.tsx`** — Renders `DiscoverSidebar` instead of FilterBar and SmartBar. Adds the All/Recommended toggle + layout controls in a header bar above the grid. Removes the `viewMode === null` landing page branch. Continues to own all filter state and pass it down as props.
- **`Dock.tsx`** — Remove the `isDiscoverLanding` conditional logic that hides elements when on the landing page (landing page no longer exists).
- **`DiscoverGrid.tsx`** — No changes. Receives filtered data as before.

## Icon Rail

- Fixed 48px wide column, always visible on the Discover route
- Two icons stacked vertically:
  1. **Buckets** — grid/category icon
  2. **Filters** — funnel icon
- Active icon: highlighted background + border
- Inactive icons: reduced opacity

### Toggle logic

- Click inactive icon → expand panel to that section
- Click active icon → collapse panel back to rail-only
- Only one panel open at a time

### Active filter badges

- When panel is collapsed but filters/buckets are active, show a small dot badge on the relevant icon
- Buckets icon: badge when any subtypes are selected
- Filters icon: badge when any filter (language, stars, activity, license, verified) is set

### Animation

- Panel width transition: 0 → 240px via CSS transition
- Content fades in after width settles to avoid layout jank

## Buckets Panel

- 240px wide, vertically scrollable
- Header: "Buckets" label

### Content structure

- Subtypes grouped under their parent type (e.g., "Applications", "Libraries", "AI / ML")
- Each group: uppercase section label (bucket/type name)
- Each subtype row: colored dot (from `REPO_BUCKETS` color) + subtype name + repo count (right-aligned)
- Multi-select: clicking a subtype toggles its selection; selected subtypes get highlighted background

### Bottom summary

- Appears when any subtypes are selected
- Shows: "N selected" count + chips for each selected subtype (with × to remove) + "Clear all" link
- Sticky/pinned at panel bottom

### Data source

- Types and subtypes from `REPO_BUCKETS` in `src/constants/repoTypes.ts`
- Same data that currently drives DiscoverSuggestions subtype suggestions

## Filters Panel

- Same 240px panel, vertically scrollable
- Header: "Filters" label

### Sections (in order)

1. **Language** — Search input + quick-select chips for popular languages. Clicking a chip toggles it. Search narrows visible chips. Single-select.
2. **Stars** — Radio-style list: Any, 100+, 1,000+, 10,000+. One active at a time.
3. **Activity** — Radio-style list: Any, Last 7 days, Last 30 days, Last 6 months. One active at a time.
4. **License** — Radio-style list: Any, MIT, Apache 2.0, GPL 3.0. One active at a time.
5. **Verification** — Checkbox-style: Official, Likely Official. Multi-select.

### Behavior

- Selecting any filter immediately updates the grid (no "apply" button)
- Active option shown via highlighted background
- Bottom summary: count of active filters + "Clear all" (same pattern as Buckets panel)

## All/Recommended Toggle & Layout Controls

### Grid header bar

Thin bar above the grid content, replaces the old FilterBar row:

- **Left**: Result count (e.g., "546 repos")
- **Center-right**: Grid/list toggle + settings cog (layout popover)
- **Right**: All/Recommended pill toggle

### All/Recommended toggle

- Pill-style segmented control with two options
- "All" = full trending/default feed
- "Recommended" = curated repos
- Replaces the SortDropdown entirely

### Layout controls

- Grid/list toggle and settings cog (column count, density, field visibility) work identically to today
- Just repositioned from FilterBar into the grid header bar
- Layout prefs still saved to localStorage

## State Architecture

### Owned by `Discover.tsx` (passed as props)

- `filters: SearchFilters` — language, stars, activity, license
- `activeVerification: Set<'verified' | 'likely'>`
- `selectedSubtypes: string[]` — selected subtype IDs (named `selectedSubtypes` not `selectedBuckets` to avoid confusion with the parent bucket/type concept)
- `viewMode: 'all' | 'recommended'` — replaces current `'recommended' | 'browse' | null`. The `null` state (which previously triggered the DiscoverLanding page) is eliminated; `'all'` is the default. The `'browse'` state is also eliminated since bucket selection is now handled via the sidebar panel rather than a separate view mode.
- `layoutPrefs: LayoutPrefs`
- All corresponding `onChange` callbacks

### Local to `DiscoverSidebar`

- `activePanel: 'buckets' | 'filters' | null` — which panel is expanded
- No other state — it's a controlled component

### State snapshot system

The existing `discoverStateStore` continues to save/restore sidebar state (selectedSubtypes, filters, activePanel, viewMode) on navigation, so back-navigation restores the full state. The `DiscoverSnapshot` interface in `discoverStateStore.ts` will need updating to include `selectedSubtypes`, `activePanel`, and the new `viewMode` type.

## Scope Boundaries

### In scope

- New DiscoverSidebar component with rail + panel
- Remove Sidebar, FilterBar, SmartBar, SortDropdown, DiscoverLanding, LanguagePopover
- All/Recommended toggle in grid header
- Layout controls repositioned to grid header
- Bucket multi-select filtering
- Filter panel with all current filter types

### Out of scope

- Changes to Library, Collections, Starred views
- Changes to Repo Detail view
- Changes to bottom nav bar
- New filter types beyond what currently exists
- Repo count computation for bucket subtypes (can show counts if available, omit if expensive)
