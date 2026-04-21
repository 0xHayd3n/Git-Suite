# SmartBar Restructure Design

**Date:** 2026-04-12
**Status:** Draft

## Summary

Restructure the Discover page SmartBar to reduce clutter by:
1. Moving sort controls (Recommended/Popular/Forked/Rising) out of the SmartBar into a minimal text dropdown below the divider
2. Integrating the filter icon into the search bar
3. Merging layout controls (grid/list toggle, column count, list density/fields) into the filter dropdown as a new "Layout" tab
4. Removing the standalone layout button from the SmartBar

## Current State

**SmartBar:** `[Search] | [Buckets] | [Sort views] | [Filter btn] [Layout btn]`

The SmartBar contains five distinct sections separated by dividers. The sort views (Recommended, Most Popular, Most Forked, Rising) are rendered as a glass-backed segmented control (`smart-bar-views`). Filter and Layout are separate icon buttons in `smart-bar-actions`.

**Key files:**
- `src/components/SmartBar.tsx` — SmartBar component
- `src/components/LayoutDropdown.tsx` — Layout dropdown (grid/list, columns, density, fields)
- `src/components/FilterDropdown.tsx` — Filter panel (verification, activity, stars, license, topics, languages)
- `src/views/Discover.tsx` — Orchestrates all components, manages state
- `src/lib/discoverQueries.ts` — VIEW_MODES array and ViewModeKey type
- `src/styles/globals.css` — All related CSS

## Proposed State

**SmartBar:** `[Search 🔍 ⚙] | [Buckets]`

**Below divider (right-aligned):** `Sort by: Recommended ▾`

### Change 1: Sort Dropdown

Remove the `smart-bar-views` segmented control from SmartBar. Replace with a minimal text-based dropdown rendered right-aligned between the SmartBar divider and the grid content.

**Closed state:** `Sort by:` label (dimmed) + active sort name (brighter, medium weight) + chevron-down icon. No background, no border — plain text style.

**Open state:** Glass dropdown panel (same `rgba(18,18,24,0.85)` + `blur(24px)` + `14px` radius treatment as other dropdowns). Options listed vertically with 4px internal padding. Active option highlighted with its own accent color and tinted background (using each VIEW_MODE's `accent` value — purple for Recommended, blue for Popular, teal for Forked, amber for Rising). Hover state: `rgba(255,255,255,0.06)` background.

**Placement:** Rendered inside `discover-content` area (below the SmartBar `::after` divider), right-aligned with `padding: 8px 20px`, sitting above the grid. This keeps it visually associated with the content it controls.

**Component:** New `SortDropdown` component. Props: `value: ViewModeKey`, `onChange: (key: ViewModeKey) => void`. Uses the existing `VIEW_MODES` array from `discoverQueries.ts`. Manages its own open/close state. Closes on outside click and Escape key.

### Change 2: Filter Icon in Search Bar

Move the filter (funnel) icon from `smart-bar-actions` into the search bar, positioned at the right end after the input. The icon uses the same `var(--t3)` color, and shows the existing filter badge count when filters are active.

Clicking the filter icon opens the filter dropdown panel, which is now positioned absolutely relative to the SmartBar (unchanged from current behavior after the earlier fix).

### Change 3: Layout Tab in Filter Dropdown

Add a "Layout" tab as the last entry in the FilterDropdown's left tab list. When selected, the right content area shows:

- **View Mode** section: List/Grid segmented toggle (reuses existing `layout-segment-btn` styling)
- **Columns** section (visible when mode is grid): Column count buttons 5-10 (reuses existing `layout-column-btn` styling)
- **Density** section (visible when mode is list): Compact/Comfortable segmented toggle
- **Fields** section (visible when mode is list): Checkbox list for Description, Tags, Stats, Type badge, Verification badge

Layout changes apply immediately (no need for Apply button) since they're display preferences, not search filters. The Apply/Clear All footer only affects filter state, not layout state.

The standalone `LayoutDropdown` component and its trigger button are removed from the SmartBar.

### Change 4: SmartBar Cleanup

Remove from SmartBar:
- `smart-bar-views` section and its divider
- `smart-bar-actions` section and its divider
- Filter button (moved into search bar)
- Layout button (removed entirely)

The SmartBar becomes: `[Search (with filter icon)] | [Buckets]`

This leaves only one `smart-bar-divider` between search and buckets.

## CSS Changes

**Remove:** `.smart-bar-views`, `.smart-bar-view-tab`, `.smart-bar-actions`, `.smart-bar-action-btn` classes (unused after restructure).

**Add:**
- `.sort-dropdown` — container with flex, right-alignment
- `.sort-dropdown-trigger` — text-only button (no background/border), flex with gap for label + value + chevron
- `.sort-dropdown-panel` — glass dropdown panel, absolute positioned
- `.sort-dropdown-option` — individual option with hover/active states
- `.smart-bar-search-filter` — filter icon button inside search bar

**Modify:**
- `.smart-bar-search` — add `justify-content: space-between` or ensure filter icon sits at the right end
- `.smart-bar` — remove last two dividers and actions section
- FilterDropdown — add 'layout' to FilterTab type, add Layout tab content

## Component Changes

### New: `SortDropdown.tsx`
- Renders "Sort by: {active} ▾" trigger
- Glass dropdown with VIEW_MODES options on click
- Manages open/close state
- Props: `value`, `onChange`

### Modified: `SmartBar.tsx`
- Remove VIEW_MODES import and view mode tabs
- Remove LayoutDropdown import and rendering
- Move filter button into search bar area
- Remove `smart-bar-actions` section
- Remove two `smart-bar-divider` elements (keep only the one between search and buckets)
- Add `onFilterClick` trigger inside the search bar
- Add `filterBadgeCount` prop to display badge on filter icon
- Remove unused `selectedSubTypes` and `onSubTypeChange` props from interface

### Modified: `FilterDropdown.tsx`
- Add `'layout'` to `FilterTab` type
- Add Layout tab to left tab list
- Add layout content panel (view mode toggle, columns, density, fields)
- Accept `layoutPrefs` and `onLayoutChange` props
- Layout changes apply immediately via `onLayoutChange` (not staged with Apply)

### Modified: `Discover.tsx`
- Render `SortDropdown` inside `discover-content` area (above grid, right-aligned)
- Pass layout props to FilterDropdown instead of LayoutDropdown
- Pass `filterBadgeCount` to SmartBar
- Remove LayoutDropdown usage
- Remove unused `VIEW_MODE_ICONS` import

### Removed: Standalone `LayoutDropdown` usage in SmartBar
- The `LayoutDropdown.tsx` file must be kept for its type exports (`LayoutPrefs`, `LayoutMode`, etc.) since they are imported by `Discover.tsx`, `DiscoverGrid.tsx`, and `RepoListRow.tsx`. Remove only the component's default export and its UI code, or keep the file as-is for type re-exports.

### Test files requiring updates
- `SmartBar.test.tsx` — update props (remove viewMode/layout, add filterBadgeCount)
- `Discover.test.tsx` — update for SortDropdown rendering and removed SmartBar props
- `LayoutDropdown` tests — remove or rewrite for FilterDropdown layout tab

## State Management

No changes to state management. All existing state (`viewMode`, `layoutPrefs`, `filterDropdownOpen`, etc.) stays in `Discover.tsx`. Only the rendering location changes.

## Migration Notes

- `LayoutDropdown.tsx` types (`LayoutPrefs`, `LayoutMode`, `ListDensity`, `ListFields`, `DEFAULT_LAYOUT_PREFS`, `LAYOUT_STORAGE_KEY`) are imported by `Discover.tsx`, `DiscoverGrid.tsx`, and `RepoListRow.tsx`. These exports must remain available.
- `ViewModeIcons.tsx` must be kept — it is used by `NavBar.tsx` and `DiscoverLanding.tsx`. Only the SmartBar and Discover.tsx imports are removed.
- When reopening the filter dropdown, `filterDropdownInitialTab` should reset to a filter tab (e.g. `'verification'`) rather than remembering `'layout'`, since layout is a display preference and users opening the filter icon expect filter controls.
