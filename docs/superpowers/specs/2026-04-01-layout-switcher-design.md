# Layout Switcher Design

**Date:** 2026-04-01
**Status:** Approved

## Summary

Add a "Layout ▾" dropdown to the Discover page filter row that lets users switch between Grid and List view modes. Grid mode lets users control the column count (1–5). List mode lets users pick a density (compact/comfortable) and toggle which fields are shown per row. All preferences persist to `localStorage`.

## Background

The Discover page currently renders repos in a hardcoded 3-column grid using `RepoCard`. There is no way to switch layout or density. A layout switcher adds meaningful browsing flexibility: power users who know what they're looking for benefit from a compact list; discovery-oriented users benefit from a wider grid with full cards.

## Design

### Trigger Button & Placement

- A "Layout ▾" button is added to the filter row (`.discover-filter-row`), to the right of the "Filters" button, as a **sibling element** alongside the existing `<div style={{ position: 'relative' }}>` wrapper that contains the Filters button and `FilterDropdown`. Do not nest it inside that wrapper.
- Uses the same `.discover-filter-icon-btn` tab style as the Filters button.
- Icon: `LuLayoutGrid` from `react-icons/lu`.
- Label beside the icon reflects the current mode: `Layout: Grid` or `Layout: List`.
- Clicking toggles the panel open/closed.
- **Accessibility:** The trigger button must have `aria-label` (e.g. `"Layout options"`), `aria-expanded={open}`, and `aria-haspopup="dialog"`.
- Panel closes on click-outside (document `mousedown`) or Escape key. No backdrop overlay.
- `LayoutDropdown` follows the **`TypeDropdown` self-contained model**: it owns its panel open/close state internally via `useState`, manages its own `containerRef` for click-outside detection, and wraps itself in a `position: relative` div. No outer wrapper needed in `Discover.tsx`.

### Dropdown Panel

A compact card (~260px wide), absolutely positioned below-right of the trigger button (`right: 0; top: calc(100% + 4px)`). Three sections separated by thin horizontal dividers:

**1. Mode toggle**
Two full-width segmented buttons: `List` and `Grid`. The active one is highlighted with the accent colour. Switching modes updates the view immediately and live-writes to `localStorage`.

**2. Mode controls (context-sensitive)**

_When Grid is selected:_
- Label: "Columns"
- A row of 5 numbered buttons: `1 2 3 4 5`. The active count is highlighted. Clicking a number updates the grid immediately.

_When List is selected:_
- **Density toggle:** Two small buttons `Compact` and `Comfortable`. Active one highlighted.
- **Field toggles:** A vertical list of checkboxes:
  - Description (default: on)
  - Tags (default: on)
  - Stats (default: on)
  - Type badge (default: on)
  - Verification badge (default: on)
- All field toggles update the list view immediately.

**3. No apply/close footer** — all changes are live.

### List View Rendering

In list mode, each repo renders as a horizontal row instead of a `RepoCard`. A new `RepoListRow` component handles this.

**Always shown (not toggleable):**
- Owner avatar (24px)
- Repo name (bold) + owner name
- Action buttons: star + install (pinned to the right)

**Toggleable fields** (each conditionally rendered based on `fields` prop):
- **Description** — single line, truncated with `text-overflow: ellipsis`, shown by default
- **Tags** — inline chips (up to 3, no expand behaviour), shown by default
- **Stats** — stars, forks, last-updated, shown by default
- **Type badge** — coloured label from `REPO_TYPE_CONFIG`, shown by default
- **Verification badge** — Official/Likely Official label (`verificationTier !== null`), shown by default. `verificationTier` is `'verified' | 'likely' | null` — render nothing when `null`.

**Density:**
- **Compact** — tight vertical padding (~8px top/bottom), `font-size: 11px` for description
- **Comfortable** — relaxed vertical padding (~14px top/bottom), `font-size: 12px` for description

The banner SVG is **never shown** in list view regardless of density or field toggles.

**Skeleton in list mode:** Render 12 skeleton rows (simple `div` with shimmer animation, same height as a comfortable row) instead of the 9-item grid skeleton. In grid mode with N columns, render `N × 3` skeleton cards.

### Grid View Rendering

Grid mode renders `RepoCard` as-is. Column count is applied via **inline style** on the grid container div:

```tsx
<div
  ref={gridRef}
  className="discover-grid"
  style={{ gridTemplateColumns: `repeat(${prefs.columns}, minmax(0, 1fr))` }}
>
```

This overrides the CSS `grid-template-columns` rule. The CSS `.discover-grid` rule remains as the fallback default (3 columns).

### Persistence

All preferences are saved to `localStorage` under the key `discover-layout-prefs` as a single JSON object:

```json
{
  "mode": "grid",
  "columns": 3,
  "density": "comfortable",
  "fields": {
    "description": true,
    "tags": true,
    "stats": true,
    "type": true,
    "verification": true
  }
}
```

**On mount**, `Discover.tsx` reads this key inside a `try/catch`. If the key is missing or the JSON is malformed or has unexpected values, fall back to `DEFAULT_LAYOUT_PREFS` silently. Clamp `columns` to `[1, 5]` after parsing. Any change writes the full object back immediately via `JSON.stringify`.

**Layout prefs are always read from `localStorage` — they do not need to be included in the `discoverStateStore` snapshot.** The snapshot handles scroll/query/results restoration on back-navigation; localStorage handles persistent user preferences independently.

### Component Structure

**New files:**
- `src/components/LayoutDropdown.tsx` — Self-contained dropdown. Owns panel open/close state, `containerRef`, document listeners. Accepts `prefs: LayoutPrefs` and `onChange: (prefs: LayoutPrefs) => void`.
- `src/components/RepoListRow.tsx` — List row renderer. Accepts the same core props as `RepoCard` plus `density: ListDensity` and `fields: ListFields`. `verificationTier` is `'verified' | 'likely' | null`.
- `src/components/LayoutDropdown.test.tsx` — Tests: renders trigger button; panel hidden by default; opens on click; shows Grid controls when mode is grid; shows List controls when mode is list; clicking column button calls onChange with updated columns; toggling a field calls onChange with updated fields; closes on Escape; closes on click-outside.
- `src/components/RepoListRow.test.tsx` — Tests: renders repo name and owner always; renders description when `fields.description = true`; hides description when `fields.description = false`; applies compact class when `density = 'compact'`; applies comfortable class when `density = 'comfortable'`; renders no verification badge when `verificationTier = null`.

**Modified files:**
- `src/views/Discover.tsx` — Add `layoutPrefs` state (initialised from localStorage), `handleLayoutChange` callback (writes to localStorage + sets state), pass `layoutPrefs` and `handleLayoutChange` to `<LayoutDropdown>`, switch grid/list rendering based on `layoutPrefs.mode`, apply inline `style` for column count on grid div, update skeleton to respect mode and column count.
- `src/styles/globals.css` — Add `.layout-dropdown-panel`, `.layout-segment-row`, `.layout-segment-btn`, `.layout-columns-row`, `.layout-column-btn`, `.layout-field-row`, `.repo-list-row`, `.repo-list-row-compact`, `.repo-list-row-comfortable`, `.repo-list-row-body`, `.repo-list-row-actions`, `.repo-list-row-meta`.

### Types

Defined in `src/components/LayoutDropdown.tsx` and imported by `Discover.tsx` and `RepoListRow.tsx`:

```typescript
export type LayoutMode = 'grid' | 'list'
export type ListDensity = 'compact' | 'comfortable'

export interface ListFields {
  description: boolean
  tags: boolean
  stats: boolean
  type: boolean
  verification: boolean
}

export interface LayoutPrefs {
  mode: LayoutMode
  columns: number          // 1–5, grid mode only
  density: ListDensity     // list mode only
  fields: ListFields       // list mode only
}

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  mode: 'grid',
  columns: 3,
  density: 'comfortable',
  fields: { description: true, tags: true, stats: true, type: true, verification: true },
}

export const LAYOUT_STORAGE_KEY = 'discover-layout-prefs'
```

### Props

**LayoutDropdown:**
```typescript
interface LayoutDropdownProps {
  prefs: LayoutPrefs
  onChange: (prefs: LayoutPrefs) => void
}
```

**RepoListRow:**
```typescript
interface RepoListRowProps {
  repo: RepoRow
  onNavigate: (path: string) => void
  onTagClick: (tag: string) => void
  onOwnerClick?: (owner: string) => void
  repoType?: RepoType
  verificationTier?: 'verified' | 'likely' | null
  verificationSignals?: string[]
  verificationResolving?: boolean
  density: ListDensity
  fields: ListFields
}
```

## Out of Scope

- No layout switcher for My Library, Collections, or other views — Discover only.
- No server-side or cross-device sync of preferences.
- No animation between layout transitions.
- Banner is never shown in list view (no toggle for it).
- Tags in list view show up to 3 chips only — no expand-on-click behaviour.
- No overflow/truncation handling for the filter row at narrow window widths.
