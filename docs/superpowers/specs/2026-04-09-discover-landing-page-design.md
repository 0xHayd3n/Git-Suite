# Discover Landing Page

**Date:** 2026-04-09
**Status:** Draft

## Overview

Add a Google-style search landing page as the default Discover view. When the user navigates to Discover (or the app launches), they see a centered page with the logo + wordmark, a search bar, and pills for the sub-sections (Recommended, Most Popular, Most Forked, Rising). Searching or clicking a pill transitions into the existing Discover results UI.

## Motivation

Currently, navigating to Discover immediately loads the Recommended view with API calls and a full filter/grid UI. A dedicated landing page provides a cleaner entry point that focuses the user on the search action and gives equal visibility to all sub-sections.

## Architecture

Landing is represented as `viewMode: null` rather than a new `'landing'` string in the `ViewModeKey` union. The existing `VIEW_MODES` array and `ViewModeKey` type are untouched — `buildViewModeQuery`, `getViewModeSort`, NavBar breadcrumbs, and sidebar sub-tabs all continue to work without modification.

No new routes are introduced — `/discover` without a `?view=` query parameter renders the landing page (`viewMode = null`). With a `?view=` parameter, it renders the existing results UI as before.

This approach keeps everything in one route and one component tree, avoiding duplicate search logic or routing complexity.

## Components

### New: `DiscoverLanding`

A presentational component rendered inside `Discover.tsx` when `viewMode === null`.

**Contents:**
- App logo (`src/assets/logo.png`) to the left of "Git Suite" wordmark, horizontally aligned
- A search input (auto-focused on mount)
- 4 pill buttons: Recommended, Most Popular, Most Forked, Rising

**Props:**
- `onSearch(query: string)` — called when the user submits a search
- `onSelectMode(mode: ViewMode)` — called when the user clicks a sub-section pill

**Styling:**
- Vertically and horizontally centered in the content area
- Search bar: `--bg2` background, `--border2` border, `border-radius: 10px`, max-width ~480px
- Pills: `--bg2` background, `--border` border, `border-radius: 20px`, subtle text color
- Dark background matches `--bg` (`#121214`)

### Modified: `Discover.tsx`

- Widen the `viewMode` state type to `ViewModeKey | null` (null = landing)
- Change the `?view=` param parser: when the param is absent or not a recognized key, set `viewMode = null` instead of falling back to `'recommended'` (the current default)
- When `viewMode === null`: render `<DiscoverLanding>`, hide the filter bar, BucketNav, DiscoverGrid, and all filter UI. Skip all trending/search effects.
- On `onSearch`: set query in Search context, switch to `'recommended'` view mode, trigger `handleSearch`
- On `onSelectMode`: switch to the selected view mode, trigger `loadTrending`
- Guard `saveDiscoverSnapshot()`: skip saving when `viewMode === null` so landing state is never captured in the snapshot stack

### Modified: `Sidebar.tsx`

- Clicking the main "Discover" nav button navigates to `/discover` without a `?view=` param (shows landing)
- Sub-tab buttons (Recommended, etc.) continue to navigate with `?view=recommended`, etc.
- Update `currentViewMode` fallback: when `?view=` is absent, resolve to `null` instead of `'recommended'` so no sub-tab appears highlighted during landing state

### Modified: `NavBar.tsx`

- Update the view mode breadcrumb logic: when `viewMode` is `null` (landing), suppress the sub-tab breadcrumb segment entirely — show only the "Discover" breadcrumb, not "Discover > Recommended"

### Modified: `App.tsx`

- Default redirect from `/` to `/discover` remains unchanged (now shows landing instead of Recommended)

### Unchanged

`discoverQueries.ts` (VIEW_MODES, ViewModeKey, query/sort functions), BucketNav, DiscoverGrid, Search context, discoverStateStore — no modifications needed.

## Data Flow

### App launch
1. Router navigates to `/discover` (no `?view=` param)
2. Discover reads the absence of `view` param → sets `viewMode = null`
3. Renders `DiscoverLanding` with auto-focused search input
4. No API calls are made

### User searches
1. `DiscoverLanding` calls `onSearch(query)`
2. Discover sets the query in Search context, switches `viewMode` to `'recommended'`, triggers `handleSearch`
3. Landing unmounts, filter bar + grid appear with results

### User clicks a pill
1. `DiscoverLanding` calls `onSelectMode('popular')` (or whichever mode)
2. Discover sets `viewMode` to that mode, triggers `loadTrending`
3. Landing unmounts, full Discover UI appears with trending results

### User clicks "Discover" in sidebar from results view
1. Navigates to `/discover` (no `?view=` param)
2. Discover detects landing mode, clears current results/query, renders landing page

### Back navigation
- Navigating from results → repo detail → back restores the results snapshot (not landing)
- Landing has no state worth snapshotting

## Testing

- **`DiscoverLanding` unit tests:** renders logo, wordmark, search input, 4 pills; calls `onSearch` on Enter; calls `onSelectMode` on pill click
- **`Discover` test updates:** verify landing renders when no `?view=` param; verify transition from landing to results on search and pill click

## Error Handling

None needed — the landing page is purely static UI with no API calls. Error handling lives in the existing search/trending flows.
