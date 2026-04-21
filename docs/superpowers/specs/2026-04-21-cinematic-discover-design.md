# Cinematic Discover Layout

**Date:** 2026-04-21
**Status:** Approved

## Overview

Add a cinematic hero banner and a horizontal "Recommended for You" row above the existing Discover grid. The hero shows the top recommended repo with a full-width dither-art background. The row shows the next 7 recommended repos as horizontally scrollable cards. Below both, the existing "All" grid continues unchanged.

## Decisions

- **Hero background:** Dither-art style (uses existing `DitherBackground` component), consistent with existing RepoCard visual language.
- **Sidebar:** Already `position: fixed` — no layout changes needed. Hero/row content indented `~80px` from left to clear the rail.
- **"More →" button:** Navigates to the recommended view (`?view=recommended`) of the existing Discover grid.
- **Grid below:** Defaults to `viewMode = 'all'`. No tab switcher shown — the hero+row section replaces the need for a "Recommended" tab.
- **Data source:** `window.api.github.getRecommended()` — reuses the existing `recommendedCache` already present in `Discover.tsx`.

## New Components

### `src/components/DiscoverHero.tsx`

```
Props:
  repo: RepoRow | null        — the featured repo (items[0])
  onNavigate: (path) => void  — navigate to repo detail
  onStar?: (id, starred) => void
```

Layout (bottom-left text over full-width banner):
- Background: `<DitherBackground avatarUrl={repo.avatar_url} />` full-bleed, height ~220px
- Bottom-fade: `linear-gradient(to bottom, transparent, var(--bg))` so it dissolves into the page
- Top-right: owner avatar + owner name
- Bottom-left (padded `80px` left to clear sidebar rail):
  - Label: `FEATURED · TOP RECOMMENDED` (9px, uppercase, accent color)
  - Title: `owner / name` (28px bold)
  - Description: truncated to one line
  - Meta row: language dot + name, stars, forks, last pushed
  - Actions: "View Repo ↗" (primary) + "♡ Star" (ghost)

### `src/components/DiscoverRow.tsx`

```
Props:
  repos: RepoRow[]            — items[1..7]
  onNavigate: (path) => void
  onMore: () => void          — called when "More →" is clicked
```

Layout:
- Section header: "Recommended for You" (left) + "More →" pill button (right)
- Horizontal scroll container (`overflow-x: auto`, no scrollbar), full width of `discover-main`
- Cards: 170×104px, `DitherBackground` with `avatarUrl`, name + meta overlay at bottom
- No max-width constraint — row fills all available space

## Changes to `Discover.tsx`

1. **Fetch recommended on mount** (always, not gated on `viewMode === 'recommended'`):
   - If `recommendedCache.current` is populated, derive hero/row from it immediately.
   - Otherwise call `window.api.github.getRecommended()`, populate cache, then derive.
   - `heroRepo = items[0]?.repo ?? null`
   - `rowRepos = items.slice(1, 8).map(i => i.repo)`
   - Store both in state: `const [heroRepo, setHeroRepo] = useState<RepoRow | null>(null)` and `const [rowRepos, setRowRepos] = useState<RepoRow[]>([])`

2. **Render hero + row above grid** when `showLanding === false`. `showLanding` is only the onboarding/empty-state landing — it is set to `false` by `exitLanding()` and `handleSearch()` and never re-set during active search, so the hero and row remain visible while search results are shown below.
   ```tsx
   {!showLanding && (
     <>
       <DiscoverHero repo={heroRepo} onNavigate={navigateToRepo} onStar={handleHeroStar} />
       <DiscoverRow repos={rowRepos} onNavigate={navigateToRepo} onMore={() => setViewMode('recommended')} />
     </>
   )}
   ```
   `handleHeroStar` is a local handler in `Discover.tsx` that calls `window.api.github.starRepo` / `unstarRepo`. `DiscoverHero` owns the optimistic starred UI state internally (same pattern as `RepoCard`).

3. **Default view stays `'all'`** — no change to existing viewMode logic.

4. **"More →"** calls `setViewMode('recommended')`, which pushes `?view=recommended` into the URL — the existing GridHeader + DiscoverGrid then shows the full recommended list.

## CSS

### `DiscoverHero.css`
- `.discover-hero` — `position: relative; height: 220px; overflow: hidden; flex-shrink: 0`
- `.discover-hero-fade` — absolute bottom gradient into `var(--bg)`
- `.discover-hero-content` — absolute, bottom-left, `padding: 0 32px 24px 80px`
- `.discover-hero-avatar` — absolute top-right
- Button styles defined locally in `DiscoverHero.css` (`.discover-hero-btn-primary`, `.discover-hero-btn-ghost`) — do not rely on external class names

### `DiscoverRow.css`
- `.discover-row` — `padding: 14px 28px`
- `.discover-row-header` — flex, space-between
- `.discover-row-more` — pill button, accent color
- `.discover-row-cards` — `display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none`
- `.discover-row-card` — `flex-shrink: 0; width: 170px; height: 104px; border-radius: 10px`

## What Does Not Change

- `DiscoverLanding` — shown when `showLanding === true`, untouched
- `DiscoverGrid` — untouched
- `GridHeader` — untouched
- `DiscoverSidebar` / rail — untouched
- All search, tag, filter, pagination, snapshot restore logic — untouched

## Behavior Notes

- Hero and row remain visible while a search is active (they sit above the grid and scroll away naturally).
- If `getRecommended()` fails or returns empty, hero renders `null` (no hero shown) and row renders empty (section hidden).
- Star action in hero mirrors the existing star logic in `RepoCard` — optimistic UI, calls `window.api.github.starRepo`.
