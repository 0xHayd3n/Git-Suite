# Repo Detail — Unified Panel Design

**Date:** 2026-04-18  
**Status:** Approved

## Overview

Collapse the current 3-column repo detail layout (TOC panel | article panel | stats sidebar) into a single unified article panel. Stats and repository metadata move into a new Stats tab. The TOC ("On This Page") moves inside the article panel as an inline right mini-sidebar.

## Current State

`RepoDetail` renders a 3-column CSS grid:
- **Column 1** (`.repo-detail-toc-panel`, 200px): `TocNav` — "On This Page" heading list, only visible on readme tab
- **Column 2** (`.repo-detail-article-panel`, 794px max): `ArticleLayout` with tab bar and content body
- **Column 3** (`.repo-detail-sidebar-panel`, 220px): Stats, Repository info, Skills Folder, badges, Topics, Related repos — always visible

## Design

### 1. Layout

Replace the 3-column `.repo-detail-layout` grid with a single column. The unified panel:
- `max-width: 1100px`, centered
- On fullbleed tabs (Files, Components): `max-width: 1600px`, matching existing fullbleed behavior (the `data-fullbleed-tab` attribute remains on the layout element; its CSS rule is updated from a grid override to a `max-width` override)
- Replaces `.repo-detail-article-panel` as the sole panel element
- Delete `.repo-detail-toc-panel` and `.repo-detail-sidebar-panel` columns (JSX + CSS)
- Update the `pointer-events` re-enable rule in `globals.css` inside `.library-detail-area` — it currently targets `.repo-detail-toc-panel`, `.repo-detail-article-panel`, `.repo-detail-sidebar-panel` and must be updated to target the new unified panel class

### 2. Inline TOC (`ArticleLayout` `tocSlot`)

`ArticleLayout` gains a `tocSlot?: ReactNode` prop.

**Visibility contract:** `RepoDetail` is responsible for conditional rendering — it passes `tocSlot` only when `activeTab === 'readme' && tocHeadings.length >= 2`. `ArticleLayout` renders the slot whenever it is non-null (no tab awareness inside `ArticleLayout`).

When `tocSlot` is provided, `.article-layout-body` renders as a horizontal flex layout:

```
[ content (flex: 1) ] [ 1px divider ] [ tocSlot (200px wide, sticky top) ]
```

- The existing `TocNav` component is passed in unchanged from `RepoDetail`
- The divider uses the existing `--glass-border` variable
- CSS changes go in `ArticleLayout.css`

### 3. Stats Tab

Add `'stats'` to the `Tab` union type in `RepoDetail`.

The Stats tab appears in the tab bar alongside README, Files, Skills Folder, etc.

When active, it renders all current right-sidebar content in a **responsive CSS grid tile layout**:
- `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- Each section becomes a glass-styled tile using `--glass-bg` / `--glass-border` / `border-radius: 12px`
- No `tocSlot` is passed for the stats tab
- Stats tab uses standard (non-fullbleed) body layout

**Tile mapping from current sidebar sections:**

| Tile | Content | Condition |
|------|---------|-----------|
| Stats | Forks, Issues counts, Version (when not `'—'`) | Always |
| Repository | License, Size, Watchers, Default branch, **View on GitHub button** (inlined here) | Always |
| Skills Folder | Core/Extended/Deep depth bars + action buttons | Only when `learnState === 'LEARNED' && skillRow` |
| Badges | Package, quality, misc badge pills | Only when non-empty (existing behavior) |
| Community | Social icon links | Only when non-empty |
| Topics | Clickable tag buttons | Only when `topics.length > 0` |
| Related | Related repo cards | Only when `related.length > 0` |

Tiles with no content are omitted entirely (matching current sidebar behavior). This covers the asynchronous loading case — badge and related tiles simply won't appear until the data is available.

The `<div className="skills-folder-actions">` block (Relearn all / Enhance all) stays within the Skills Folder tile.

The `<a className="btn-view-github">` link moves into the Repository tile (replacing its current position below the Repository section in the sidebar).

## Files Affected

| File | Change |
|------|--------|
| `src/views/RepoDetail.tsx` | Remove 3-column grid; add `stats` tab; move sidebar JSX into stats tab tile render; pass `tocSlot` to `ArticleLayout` conditionally |
| `src/components/ArticleLayout.tsx` | Add `tocSlot?: ReactNode` prop; two-column flex body layout when tocSlot is non-null |
| `src/components/ArticleLayout.css` | Add `.article-layout-body--with-toc` flex layout + divider + sticky TOC column styles |
| `src/styles/globals.css` | Remove `.repo-detail-toc-panel` / `.repo-detail-sidebar-panel` styles; update `.library-detail-area` pointer-events rule; update `data-fullbleed-tab` override from grid to max-width; add stats tile grid styles |

## Out of Scope

- No changes to `TocNav` internals
- No changes to tab content other than stats
- No changes to the Skills Folder panel internals
- No responsive/mobile breakpoint work
