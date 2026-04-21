# Discover Sub-Tab Navigation Design

**Date:** 2026-04-09
**Status:** Draft

## Summary

Move the Discover view mode tabs (Recommended, Most Popular, Most Forked, Rising) from the main content area into the sidebar navigation as nested sub-tabs under the Discover nav item. Add icons to each sub-tab and display the active sub-tab's icon inline in the NavBar breadcrumb.

## Current State

- **Sidebar** (`src/components/Sidebar.tsx`): Renders four top-level nav items (Discover, My Library, Collections, Starred). No sub-tab nesting exists.
- **DiscoverModeTabs** (`src/components/DiscoverModeTabs.tsx`): Horizontal tab bar rendered inside the Discover view's content area. Controls `viewMode` state local to `Discover.tsx`.
- **NavBar** (`src/components/NavBar.tsx`): Breadcrumb-style URL bar. On Discover, shows `Git Suite / Discover`. Uses `ROUTE_LABELS` for top-level routes and `RepoNav` context for repo detail pages.
- **View modes** defined in `src/lib/discoverQueries.ts` as `VIEW_MODES` array with keys: `recommended`, `popular`, `forked`, `rising`.

## Design

### 1. Sidebar Sub-Tabs (Accent Rail Style)

When the current route is `/discover`, the sidebar renders a sub-tab group beneath the Discover nav item:

- **Visual treatment**: Indented vertical list with a continuous accent-colored bar on the left edge. The active sub-tab gets a brighter/thicker bar segment and a subtle background highlight.
- **Items**: Recommended, Most Popular, Most Forked, Rising — each with a small SVG icon (14px).
- **Behavior**: Clicking a sub-tab updates the active view mode. The Discover nav item itself remains clickable and navigates to `/discover` with the default view mode (Recommended).
- **Visibility**: Sub-tabs only appear when the route starts with `/discover`. On all other routes they are hidden.

### 2. Collapsed Sidebar

When the sidebar is collapsed (icon-only mode) and on the `/discover` route:

- Four small icon buttons (24px tap target) stack vertically below the Discover icon.
- The active sub-tab icon gets the accent highlight.
- Each icon has a tooltip on hover showing the label (e.g., "Most Popular").
- On non-Discover routes, only the Discover icon is shown (no stacked sub-icons).

### 3. NavBar Breadcrumb

When on the Discover route, the breadcrumb updates from:

```
Git Suite / Discover
```

to:

```
Git Suite / Discover / [icon] Recommended
```

- The sub-tab's SVG icon renders inline before the label in the final breadcrumb segment.
- "Discover" becomes a clickable segment (navigates to `/discover`).
- The sub-tab name is the terminal (non-clickable) segment, displayed with its icon.
- Icon size in the URL bar: 12px, matching the existing `FileIcon` pattern.

### 4. Icons

| View Mode | Icon | Description |
|-----------|------|-------------|
| Recommended | 5-point star | Curated/featured picks |
| Most Popular | Flame | Hot/high-star repos |
| Most Forked | Git fork | Branch splitting from a single point |
| Rising | Trend line with arrow | Upward graph line, signals growth |

All icons are stroke-based SVGs at `strokeWidth="1.3"` (matching the most common weight in the existing sidebar nav icons, which range from 1.1 to 1.5).

### 5. State Management

The `viewMode` state currently lives locally in `Discover.tsx`. It needs to be accessible from both the Sidebar (to render/control sub-tabs) and NavBar (to render the breadcrumb).

**Approach: URL search parameter**

- Use `?view=recommended|popular|forked|rising` on the `/discover` route.
- Sidebar reads the current search param to highlight the active sub-tab and writes it on click via `navigate('/discover?view=popular')` (full path, not `setSearchParams`, so it works from any route).
- NavBar reads the search param to render the correct icon and label in the breadcrumb.
- Discover view reads the search param as its initial `viewMode` (replacing the local state default).
- Default: when no `?view` param is present, treat as `recommended`.
- This gives free deep-linking and back/forward support.

**Snapshot store reconciliation (`src/lib/discoverStateStore.ts`):**

The snapshot store saves `viewMode` as part of the Discover state for back-navigation restore. With the move to URL params:

- The snapshot store continues to save `viewMode` — it is part of the full Discover state snapshot.
- On back-navigation (`navigationType === 'POP'`), the snapshot's `viewMode` takes precedence. Discover should sync the URL param to match: call `setSearchParams({ view: snapshot.viewMode }, { replace: true })` after restoring from snapshot. This keeps the URL bar, sidebar, and NavBar all consistent with the restored state.
- On fresh navigation to `/discover?view=X`, the URL param is the source of truth (no snapshot exists).
- Import `ViewModeKey` from `discoverQueries.ts` instead of re-declaring the type locally in the snapshot store.

### 6. Removal of DiscoverModeTabs

- The `DiscoverModeTabs` component is removed from the Discover view's content area.
- The `DiscoverModeTabs.tsx` file can be deleted.
- The toolbar area in Discover simplifies since the mode tabs no longer occupy space there.

## Components Changed

| File | Change |
|------|--------|
| `src/components/Sidebar.tsx` | Add sub-tab rendering with accent rail, collapsed icon stack, view mode icons |
| `src/components/NavBar.tsx` | Add discover sub-tab icon + label to breadcrumb segments |
| `src/views/Discover.tsx` | Read `?view` param for initial viewMode; remove `DiscoverModeTabs` usage |
| `src/components/DiscoverModeTabs.tsx` | Delete |
| `src/lib/discoverQueries.ts` | No changes (VIEW_MODES data stays as-is) |
| `src/lib/discoverStateStore.ts` | Import `ViewModeKey` from `discoverQueries.ts` instead of local re-declaration |
| `src/styles/globals.css` | Add styles for sidebar sub-tabs, accent rail, collapsed icon stack |

## Edge Cases

- **Direct navigation to `/discover`** (no `?view` param): defaults to `recommended`.
- **Invalid `?view` value**: falls back to `recommended`.
- **Route change away from Discover**: sub-tabs hide, NavBar reverts to simple route label.
- **Back/forward browser navigation**: `?view` param in URL drives the correct sub-tab state.
- **Sidebar collapsed on non-Discover route**: no sub-tab icons shown, just the main Discover icon.
- **Snapshot restore on back-navigation**: snapshot `viewMode` takes precedence, URL param is synced to match via `replace: true`.
- **Accessibility**: Sub-tabs use `aria-current="page"` on the active item. Collapsed icon buttons include `aria-label` matching the view mode label.
- **Transitions**: Sub-tab appearance/disappearance is instant (no animation), consistent with the existing sidebar behavior.
