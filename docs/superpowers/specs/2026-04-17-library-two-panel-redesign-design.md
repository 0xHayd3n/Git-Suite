# Library Two-Panel Redesign

**Date:** 2026-04-17

## Overview

Redesign the Library page into a two-panel layout with a Steam-library-style left sidebar showing all installed and starred repos, and a cleaned-up right panel for the grid/list view.

## Layout

```
[icon rail 56px fixed] | [LibrarySidebar 220px fixed] | [main content flex-1]
```

- Icon rail and LibrarySidebar both `position: fixed`, full `100vh`
- Main content uses `padding-left: 276px` (56 + 220)
- `DiscoverSidebar` is removed from Library entirely

## New Component: LibrarySidebar

**Files:** `src/components/LibrarySidebar.tsx` + `src/components/LibrarySidebar.css`

- Fixed, full-height panel sitting immediately right of the icon rail
- Scrollable list of repos: all installed repos + starred repos, merged and deduped by `row.id`
- Each row: 24px avatar + repo name only — no tags, no active toggle, no section headers
- Avatar fallback: show first letter of repo name in a muted circle when `avatar_url` is null
- Starred-but-not-installed repos get a small muted star indicator on their row
- Selected row (whose detail panel is open) gets a highlighted background
- Clicking an **installed** row opens `LibraryDetailPanel` containing `LibraryFilesDetail`
- Clicking a **starred-only** row opens `LibraryDetailPanel` containing `NotInstalledDetail` — widen `NotInstalledDetail`'s prop type from `LibraryRow` to `RepoRow` (both `LibraryRow` and `StarredRepoRow` extend it; the component only needs `owner`, `name`, and display fields). When `onInstalled` fires (skill generated successfully), `Library.tsx` must add the new row to `rows: LibraryRow[]` by re-fetching installed repos from the DB (same as the existing `onInstalled` path on library cards)
- Border-right separating it from main content

### Data sources
- Installed repos: the **unfiltered** `rows: LibraryRow[]` from Library state (not the filtered/sorted subset — the All/Active/Inactive filter applies only to the main grid, never to the sidebar list)
- Starred repos: fetch via `window.api.starred.getAll()` in `Library.tsx` on mount, pass as `starredRows: StarredRepoRow[]` prop to `LibrarySidebar`
- Merge into: `Map<string, { row: LibraryRow | StarredRepoRow; isStarred: boolean; isInstalled: boolean }>` keyed by `row.id`

### Empty states
- **0 installed + 0 starred:** sidebar is empty; main content shows existing "No skills installed yet" CTA
- **0 installed + >0 starred:** sidebar shows starred repos only; main content shows "No skills installed yet — browse your starred repos to install" (or similar prompt, not the old generic CTA)
- **>0 installed + 0 starred:** sidebar shows installed repos only, no star indicators

## Topbar Changes (library-topbar-v2)

- **Remove** Recent / A–Z sort dropdown
- **Remove** bottom border/underline on the topbar (remove `border-bottom` CSS)
- **Move** GridHeader (grid/list toggle + settings icon) to the **right side** of the topbar using `margin-left: auto` or flexbox justify
- All / Active / Inactive segment buttons remain on the left
- Result: `[All | Active | Inactive]` ←flex gap→ `[grid | list | settings]`

## Main Grid Changes

Remove from all card and list-row renders in `LibraryGrid.tsx` (and any sub-row component):
- **Bucket section headers** — the `library-bucket-section-header` wrapper with title + count
- **Tag badges** — subtype/language pill badges on each item
- **Active toggles** — the on/off switch on the right of each list row / card

The grid always renders the flat `<div className="library-grid">` layout. The `filtersApplied` conditional in `LibraryGrid` is removed — sectioned mode is gone entirely. Also remove: the `filtersApplied` prop from `LibraryGridProps` and its call site in `Library.tsx`, and the `REPO_BUCKETS` import (only used in the sectioned path).

## Interaction

- Clicking a repo in `LibrarySidebar` sets `selectedRepoId: string | null` state in `Library.tsx`
- If the selected row is installed: open `LibraryDetailPanel` with `LibraryFilesDetail` as child
- If the selected row is starred-only: open `LibraryDetailPanel` with `NotInstalledDetail` as child
- Closing the detail panel sets `selectedRepoId` to null, deselecting the sidebar row
- The All/Active/Inactive filter applies only to the main grid, not the sidebar

## Files to Change

| File | Change |
|---|---|
| `src/components/LibrarySidebar.tsx` | New component |
| `src/components/LibrarySidebar.css` | New styles |
| `src/views/Library.tsx` | Remove DiscoverSidebar; add LibrarySidebar; fetch starred on mount; topbar changes; wire selectedRepoId state; route detail panel child based on installed vs starred-only; delete dead state/logic that fed DiscoverSidebar and the sort dropdown: `sort`, `selectedSubtypes`, `selectedLanguages`, `activeVerification`, `activePanel`, `appliedFilters`, `skillStatus`, `subSkillIds`, `itemCounts` |
| `src/styles/globals.css` | Update `.library-root-v2` padding-left to 276px; replace comment with `/* 56px icon rail + 220px LibrarySidebar */` |
| `src/components/LibraryGrid.tsx` | Remove bucket section headers, tag badges, active toggles; remove `filtersApplied` prop and `REPO_BUCKETS` import |
| `src/components/NotInstalledDetail.tsx` | Widen prop type from `LibraryRow` to `RepoRow` |
