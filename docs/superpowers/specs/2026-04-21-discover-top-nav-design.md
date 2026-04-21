# Discover Top Nav — Design Spec

**Date:** 2026-04-21  
**Status:** Approved

## Summary

Replace the left sidebar rail on the Discover page with a compact floating pill nav at the top-center of the screen. This is a page-specific alternative mode — no other pages are affected. The sidebar continues to be used by Library and any other consumers of `DiscoverSidebar`.

## Visual Design

The nav is a compact glass pill, horizontally centered, positioned ~10px from the top of the app area (below the Electron titlebar). It bleeds into the hero image that sits behind it.

**Button order (left → right):**

```
[ Home ]  [ Browse ]  |  [logo]  |  [ Blocks ]  [ Filters ]
```

- A 1px vertical separator sits on each side of the logo
- The logo is the same `logoSrc` asset — `DiscoverTopNav` imports it directly: `import logoSrc from '../assets/logo.png'`
- Buttons: icon + text label, 11px, same glass style as sidebar rail buttons
- Active state: lighter background + higher opacity text (same as `.rail-icon-active`)
- Badge on Blocks showing `selectedLanguages.length + selectedSubtypes.length` when > 0; badge on Filters showing `(filters.stars?1:0) + (filters.activity?1:0) + (filters.license?1:0) + activeVerification.size` when > 0. Both counts computed directly from props in `DiscoverTopNav` — same values as the sidebar derives locally.
- The pill has the same glass background, border, border-radius, backdrop-filter as the sidebar rail

**Drop panels:**
- The pill wrapper is `position: fixed`. Panels are `position: absolute` children of the pill, so they are positioned relative to the pill's own box (fixed elements are containing blocks for absolute descendants in CSS).
- Panel positioning: `top: 100%` (directly below the pill), `left: 50%; transform: translateX(-50%)` (horizontally centered under the pill). This avoids screen-edge overflow regardless of which button was clicked.
- Width: 300px
- Same glass background, border-radius, backdrop-filter as the sidebar panel
- Same panel content (`FilterPanel` for Blocks, `AdvancedPanel` for Filters) — no UI changes
- Close on click-outside: `mousedown` listener checks if target is outside both pill ref and panel ref
- Only one panel open at a time

## Component Architecture

### New files
- `src/components/DiscoverTopNav.tsx`
- `src/components/DiscoverTopNav.css`

### Modified files
- `src/components/DiscoverSidebar.tsx` — change `function FilterPanel` and `function AdvancedPanel` to `export function FilterPanel` and `export function AdvancedPanel`. Both are already fully prop-driven with no module-level closures; this is the only change to this file.
- `src/views/Discover.tsx` — swap `<DiscoverSidebar>` for `<DiscoverTopNav>`, remove `discover-layout` wrapper div, remove left-margin offset from `discover-main`
- `src/components/DiscoverSidebar.css` — no changes

### Props interface

`DiscoverTopNav` reuses `DiscoverSidebarProps` exported from `DiscoverSidebar.tsx`. That interface contains only data and callbacks (no geometry props): `selectedSubtypes`, `onSelectedSubtypesChange`, `filters`, `selectedLanguages`, `activeVerification`, `onFilterChange`, `onSelectedLanguagesChange`, `onVerificationToggle`, `activePanel`, `onActivePanelChange`, `showLanding`, `onHomeClick`, `onBrowseClick`, `mode`, `skillStatus`, `onSkillStatusChange`, `itemCounts`. The call-site in `Discover.tsx` is a near-identical swap.

`onHomeClick` and `onBrowseClick` are confirmed props in `DiscoverSidebarProps`.

### `AdvancedPanel` — `mode` prop

`AdvancedPanel` requires a `mode: 'discover' | 'library'` prop. `DiscoverTopNav` always passes `mode="discover"` (it is only rendered on the Discover page). This value is also available via the `mode` prop on `DiscoverSidebarProps` (defaults to `'discover'`), so `DiscoverTopNav` can forward `props.mode ?? 'discover'`.

### `activePanel` — `'buckets'` value

`activePanel` is typed as `'buckets' | 'filters' | 'advanced' | null`. `DiscoverTopNav` never sets `activePanel` to `'buckets'` — that value belongs to bucket navigation in the sidebar which is not ported. If `activePanel === 'buckets'` arrives via props (e.g., from a snapshot restore), `DiscoverTopNav` renders no panel (treat it like `null`). The toggle handlers only ever set `'filters'`, `'advanced'`, or `null`.

## Layout Changes in Discover.tsx

**Current structure:**
```jsx
<div className="discover">
  <div className="discover-layout">
    <DiscoverSidebar ... />          {/* position:fixed — doesn't affect flow */}
    <div className="discover-main">...</div>
  </div>
</div>
```

`discover-layout` exists only as a wrapper alongside the fixed sidebar. It is safe to remove.

**New structure:**
```jsx
<div className="discover">
  <DiscoverTopNav ... />             {/* position:fixed, top-centered */}
  <div className="discover-main">...</div>
</div>
```

The `discover-main` left margin/padding that offsets the 56px sidebar rail must be removed. Grep `discover-main` across all CSS files (`src/styles/globals.css`, `src/views/Discover.css` if it exists, `src/components/DiscoverSidebar.css`) to locate the exact rule before editing. After removal `discover-main` fills full width.

`scrollRef` attaches to `discover-main` (or a child scroll container) — confirm the ref attachment is preserved after removing the wrapping div.

## State Management

No new state. `activePanel` (already in `Discover.tsx`) drives which panel is open. Top nav receives `activePanel` and `onActivePanelChange` via props.

## Behavior

- **Home**: calls `onHomeClick`; active when `showLanding === true`
- **Browse**: calls `onBrowseClick`; active when `showLanding === false`
- **Blocks**: toggles `activePanel` between `'filters'` and `null`
- **Filters**: toggles `activePanel` between `'advanced'` and `null`
- **`activePanel === 'buckets'`**: renders no panel in the top nav. Normalize when rendering: `const resolvedPanel = activePanel === 'buckets' ? null : activePanel`. Do NOT set `activePanel` to `'buckets'` from `DiscoverTopNav`.
- Panel close: `mousedown` on document, checked against a **single pill container ref**. Because panels are `position: absolute` children of the pill, the pill ref alone covers both the pill and any open panel — do NOT copy the two-ref (`railRef` + `panelRef`) pattern from `DiscoverSidebar` where they are siblings.

## What Is NOT Changing

- `DiscoverSidebar` behavior — only gains two named exports
- The Dock
- Panel content logic and UI (`FilterPanel`, `AdvancedPanel`)
- All props passed from `Discover.tsx`

## Scope

~5 files. ~200–250 lines net new (new component + CSS). ~20–30 lines changed across `Discover.tsx` and `DiscoverSidebar.tsx`.
