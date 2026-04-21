# Repo Detail Glass Panel Design

**Date:** 2026-04-08
**Status:** Approved

## Summary

Transform the RepoDetail view so the banner becomes a full chiaroscuro background (identical to Discover cards) and the tabs + content area floats in a frosted glass panel with rounded corners.

## Current State

The RepoDetail view has three sections stacked vertically:
1. **Breadcrumb bar** — navigation, plain dark background
2. **Banner** — 190px fixed height, flat gray `BannerSVG` placeholder, with an absolutely-positioned overlay containing identity info (avatar, name, owner, stats)
3. **Body** — tabs + tab content, plain dark background, fills remaining space

## Proposed Changes

### Layout Restructure

**Current structure:**
```
.repo-detail
  ├── .repo-detail-breadcrumb
  ├── .repo-detail-banner          (190px fixed, BannerSVG + overlay)
  └── .repo-detail-body            (tabs + content)
```

**New structure:**
```
.repo-detail
  ├── .repo-detail-breadcrumb
  └── .repo-detail-stage           (flex: 1, position: relative)
        ├── <ChiaroscuroBackground>  (fills entire stage, absolute inset: 0)
        ├── .repo-detail-banner-overlay  (identity + stats, relative positioned)
        └── .repo-detail-glass      (tabs + content, floating glass panel)
              ├── .repo-detail-tabs
              └── .repo-detail-tab-body
```

### Component Changes (RepoDetail.tsx)

1. **Remove** `BannerSVG` import and usage
2. **Import** `ChiaroscuroBackground` from `../components/ChiaroscuroBackground`
3. **Import** `getSubTypeConfig`, `getBucketGradient`, `getBucketColor` from `../config/repoTypeConfig` (same pattern as RepoCard)
4. **Remove** the `.repo-detail-banner` wrapper div
5. **Add** a `.repo-detail-stage` wrapper around everything below the breadcrumb
6. **Place** `<ChiaroscuroBackground avatarUrl={repo?.avatar_url} fallbackGradient={gradient} />` as the first child of the stage
7. **Derive** `gradient` using `getBucketGradient(typeConfig?.accentColor ?? getBucketColor(typeBucket))` — identical to RepoCard
8. **Make** `.repo-detail-banner-overlay` a direct child of the stage (no longer inside a fixed-height banner)
9. **Wrap** the existing `.repo-detail-body` in a new `.repo-detail-glass` div

### CSS Changes (globals.css)

**Remove/modify:**
- `.repo-detail-banner` — remove entirely (no longer exists)
- `.repo-detail-banner-overlay` — change from `position: absolute; bottom: 0` to `position: relative`. Remove the light-mode color re-scoping (`--t1`, `--t2`, `--t3`, `--bg4`, `--border`, `--border2` overrides) since text now sits on a dark chiaroscuro background and should use the default dark-theme variables.

**Add:**
```css
.repo-detail-stage {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.repo-detail-glass {
  position: relative;
  z-index: 2;
  margin: 0 16px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

**Modify:**
- `.repo-detail-banner-overlay` — add `position: relative; z-index: 2;` so it sits above the chiaroscuro background. Remove the absolute positioning and light-mode variable overrides.
- `.repo-detail-banner-name` — change `color: rgba(0,0,0,0.85)` to `color: var(--t1)` (light text for dark background).
- `.repo-detail-banner-owner` — change `color: rgba(0,0,0,0.60) !important` to `color: var(--t2) !important` (light text for dark background).
- `.repo-detail-banner-desc` — change `color: rgba(0,0,0,0.45)` to `color: var(--t3)` (light text for dark background).
- `.repo-detail-tabs` border-bottom remains as-is (uses `var(--border)` which is semi-transparent and works against the glass).

### Files Modified

| File | Change |
|------|--------|
| `src/views/RepoDetail.tsx` | Layout restructure, swap BannerSVG for ChiaroscuroBackground |
| `src/styles/globals.css` | Remove `.repo-detail-banner`, add `.repo-detail-stage` and `.repo-detail-glass`, modify `.repo-detail-banner-overlay` |

### What Does NOT Change

- Breadcrumb bar — stays as-is
- Tab content rendering — all tab panels remain unchanged
- Identity overlay content — avatar, name, owner, stats layout stays the same
- ChiaroscuroBackground component — reused as-is, no modifications
- `.repo-detail-body`, `.repo-detail-main`, `.repo-detail-tabs`, `.repo-detail-tab`, `.repo-detail-tab-body` — internal styling unchanged, just re-parented under the glass container
