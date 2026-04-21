# Bucket Tab Bar Design

**Date:** 2026-04-03
**Status:** Approved

## Summary

Replace the `TypeFilterDropdown` button in the Discover filter row with six inline bucket tab buttons — one per repo type bucket. Hovering a tab reveals a connected sub-type panel for multi-select filtering. The `selectedTypes: string[]` state and filter predicate in `Discover.tsx` are unchanged.

## Background

The current `TypeFilterDropdown` hides all type filtering behind a single "Type ▾" button. The new design surfaces the six buckets (Dev Tools, AI & ML, Editors & IDEs, Language Projects, Infrastructure, Utilities) as first-class tab buttons in the filter row, making the taxonomy immediately visible and accessible without an extra click.

## Layout

The filter row (`discover-filter-row`) changes from `justify-content: flex-end` to `justify-content: space-between`. The row becomes two zones:

- **Left**: `BucketTabBar` — six bucket tabs, left-aligned, `display: flex; align-items: center`
- **Right**: existing controls unchanged — verification shield buttons, Filters dropdown, Layout dropdown, wrapped in a `display: flex; align-items: center` div

```
[Dev Tools] [AI & ML] [Editors & IDEs] [Language Projects] [Infrastructure] [Utilities]    [🛡][🛡] [Filters▾] [Layout▾]
```

Bucket tab labels match `bucket.label` from `REPO_BUCKETS` exactly. `white-space: nowrap` is inherited from the tab base styles; no label truncation. If the window is too narrow, the row wraps (consistent with existing `flex-wrap: wrap` on the row).

## Component: `BucketTabBar`

**File:** `src/components/BucketTabBar.tsx`

**Props:**
```ts
interface BucketTabBarProps {
  selected: string[]
  onChange: (selected: string[]) => void
}
```

`BucketTabBar` tracks `openBucketId: string | null` at the top level. Only one panel is open at a time. When the cursor enters Tab B while Tab A's panel is open, Tab A closes immediately (no timer — the timer only applies to closing on mouse-leave into empty space). This prevents two panels being visible simultaneously when scanning across tabs.

Renders one `BucketTab` per entry in `REPO_BUCKETS`, passing `openBucketId`, `setOpenBucketId`, `selected`, and `onChange`.

### BucketTab (internal sub-component)

Each `BucketTab` receives:
- `bucket: RepoBucket`
- `openBucketId: string | null` and `setOpenBucketId: (id: string | null) => void`
- `selected: string[]` and `onChange: (selected: string[]) => void`
- A shared `closeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>` — passed down from `BucketTabBar` so the single timer is shared across all tabs

`open` is derived: `openBucketId === bucket.id` (no local state in `BucketTab`).

**Hover behaviour:**
- `onMouseEnter` tab → clear shared close timer; `setOpenBucketId(bucket.id)` (immediately closes any other open panel)
- `onMouseLeave` tab → start 150ms shared timer to call `setOpenBucketId(null)`
- `onMouseEnter` panel → clear shared close timer (keeps panel open while cursor is over it)
- `onMouseLeave` panel → start 150ms shared timer to call `setOpenBucketId(null)`

No keyboard or click trigger on the tab itself (hover only, as specified).

**Tab visual states:**

| State | Color | Bottom border | Weight |
|---|---|---|---|
| Default | `var(--t3)` | transparent | 500 |
| Hovered (any selection state) | `var(--t2)` (if inactive) / `var(--t1)` (if active, unchanged) | `bucket.color` | unchanged |
| Active (has selections) | `var(--t1)` | `bucket.color` | 600 |

An active bucket tab being hovered stays at `var(--t1)` — it is already at full brightness. The hover transition only brightens inactive tabs.

When active, the tab label shows a count inline: `"Dev Tools · 2"`. No separate badge element.

The tab button uses the same base styles as `.view-tab` (Inter font, 12px, `padding: 9px 0`, `margin-right: 16px`, `margin-bottom: -1px`, `border-bottom: 2px solid transparent`).

**Tab wrapper div:**

Each `BucketTab` wraps its tab button and panel in a `div` with `position: relative; height: 100%; display: flex; align-items: center`. `height: 100%` ensures the wrapper fills the filter row so that `top: 100%` on the panel aligns correctly with the filter row's bottom border.

**Sub-type panel:**

Positioned `absolute`, `top: 100%`, `left: 0`, anchored to the bucket tab's wrapping `div`. Because the wrapper is full-height of the filter row, `top: 100%` places the panel's top edge exactly at the filter row's bottom border, achieving the seamless connection.

Styling:
- `background: var(--bg2)`
- `border: 1px solid var(--border)`, `border-top: none` — connects flush to the filter row's bottom border
- `border-left: 2px solid <bucket.color>` — accent stripe identifying the bucket
- No `box-shadow` — flat, integrated feel
- `min-width: 140px`
- `padding: 4px 0`
- `z-index: 150`

Sub-type items (`.btb-item`):
- Full-width toggle buttons, `font-size: 11px`, `color: var(--t2)`
- Default: `padding: 5px 10px`
- Hover: `background: var(--bg3)`, `color: var(--t1)`
- Active (selected): left border `2px solid <bucket.color>`, `padding-left: 8px` (reduced by 2px to keep text optically aligned), `background: var(--accent-soft)`, `color: var(--t1)`, font-weight 500

Active state left border and padding are applied via inline style (using `bucket.color`) since the color varies per bucket.

Clicking a sub-type toggles its id in `selected` via `onChange`.

There is no "clear bucket" affordance within the panel — deselection is done by clicking active items individually. This is out of scope.

## CSS classes (added to `globals.css`)

| Class | Purpose |
|---|---|
| `.btb-tab` | Bucket tab button base styles |
| `.btb-tab.active` | Active bucket (has selected sub-types) |
| `.btb-panel` | Sub-type dropdown panel |
| `.btb-item` | Sub-type toggle button |
| `.btb-item:hover` | Hover state |

Active `.btb-item` state is applied via inline style only (bucket color varies). `.btb-item.active` CSS class sets `background: var(--accent-soft)`, `color: var(--t1)`, `font-weight: 500`, `padding-left: 8px` — the colored left border is added inline.

## Tests (`BucketTabBar.test.tsx`)

Use `@testing-library/react` with `vi.useFakeTimers()` to control the 150ms close delay. Cover:

1. Renders 6 bucket tab buttons with correct labels
2. No panel visible initially
3. `mouseenter` on a tab shows its panel
4. `mouseleave` tab then advance 150ms — panel closes
5. `mouseleave` tab then `mouseenter` panel — panel stays open (timer cancelled)
6. Clicking a sub-type calls `onChange` with correct id toggled
7. `mouseenter` Tab B while Tab A panel is open — Tab A panel closes immediately, Tab B opens

## Discover.tsx changes

1. Remove `TypeFilterDropdown` import; add `BucketTabBar` import
2. In `discover-filter-row` JSX: render `<BucketTabBar selected={selectedTypes} onChange={setSelectedTypes} />` on the left; wrap the existing right-side controls (shields, Filters, Layout) in a `<div style={{ display: 'flex', alignItems: 'center' }}>` on the right
3. Update `.discover-filter-row` CSS: `justify-content: space-between`
4. `selectedTypes` state, `setSelectedTypes`, and the `visibleRepos` filter predicate are **unchanged**

## File Change Summary

`TypeFilterDropdown` is imported only by `src/views/Discover.tsx` — confirmed by codebase search. No other consumers exist.

| Action | File |
|---|---|
| Create | `src/components/BucketTabBar.tsx` |
| Create | `src/components/BucketTabBar.test.tsx` |
| Delete | `src/components/TypeFilterDropdown.tsx` |
| Delete | `src/components/TypeFilterDropdown.test.tsx` |
| Modify | `src/views/Discover.tsx` — remove `TypeFilterDropdown` import + usage, add `BucketTabBar`, wrap right-side controls |
| Modify | `src/views/Discover.test.tsx` — update `TypeFilterDropdown integration` describe block label to `BucketTabBar integration` |
| Modify | `src/styles/globals.css` — new `.btb-*` classes, `justify-content: space-between` on `.discover-filter-row` |

## Out of Scope

- Keyboard navigation of bucket tabs or sub-type panels
- Clicking a bucket tab to filter to all sub-types in that bucket
- "Clear bucket" affordance within a panel
- Changes to `selectedTypes` persistence or snapshot behaviour
- Changes to the view-mode tab row (Most Popular / Most Forked / Rising)
- Changes to the Filters or Layout dropdowns
- Label truncation or horizontal scroll for narrow windows (relies on existing `flex-wrap: wrap`)
