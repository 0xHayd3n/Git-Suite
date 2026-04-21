# Chiaroscuro Card Redesign — Design Spec

**Date:** 2026-04-08
**Status:** Approved

## Overview

Complete overhaul of the `RepoCard` component from the current pixelated-avatar + glassmorphism-panel layout to a full-overlay artistic card inspired by fine-art gallery prints. The avatar becomes a Rembrandt-style chiaroscuro painting that fills the entire card, with all text overlaid directly on the artwork.

## Visual Reference

The design is modeled after a gallery poster aesthetic (reference: Gehirn brand card) — portrait-ratio cards with elegant serif typography, corner registration marks (`+`), thin rule lines forming an inner frame, and a white-washed avatar icon next to a centered title.

## Card Dimensions

- **Aspect ratio:** 3:4 (portrait), taller and narrower than the current 340px fixed-height cards
- **Implementation:** `aspect-ratio: 3 / 4` on the card container, removing the fixed `height: 340px`
- **Grid:** `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))` (existing grid adapts naturally)

## Background — Chiaroscuro Effect

The avatar image is transformed into an artistic painting using layered CSS filters and overlays. Six layers composited on top of each other:

1. **Base layer** — Avatar at `cover` size, scaled 1.4x, with `blur(25px) saturate(2) contrast(1.6) brightness(0.55)`. Creates the deep color field.
2. **Highlight layer** — Same avatar, `blur(8px) saturate(1.5) contrast(1.3) brightness(1.2)`, at `opacity: 0.25` with `mix-blend-mode: soft-light`. Adds detail and luminosity.
3. **Directional light** — `radial-gradient` from upper-left (`30% 25%`) with warm `rgba(255,220,180,0.2)`. Simulates the Rembrandt light source.
4. **Deep shadow** — `radial-gradient` from lower-right (`75% 80%`) with `rgba(0,0,0,0.5)`. Creates dramatic shadow.
5. **Vignette** — `radial-gradient` centered slightly left-of-center, transparent core fading to `rgba(0,0,0,0.65)`.
6. **Warm tint** — Solid `rgba(60,30,10,0.12)` with `mix-blend-mode: color`. Adds the old-master warmth.

**Always full color.** No grayscale-to-color hover transition. The painting stays vibrant at all times.

### Fallback (No Avatar)
When `avatar_url` is null or the image fails to load, fall back to the existing bucket gradient (`getBucketGradient`) as a solid background. The chiaroscuro overlay layers (directional light, shadow, vignette, warm tint) still render on top of the gradient to maintain the moody aesthetic. The title avatar icon is hidden when processing fails.

## Decorative Frame Elements

### Corner Marks
- `+` characters at all four corners of the card
- Font: Inter, 14px, weight 300
- Color: `rgba(255,255,255,0.3)`
- Position: 14px from edges

### Rule Lines
- **Horizontal rules** (top and bottom): 1px, `rgba(255,255,255,0.12)`, inset 28-30px from edges
- **Vertical rules** (left and right): 1px, `rgba(255,255,255,0.08)`, connecting top and bottom rules
- Forms a subtle rectangular frame within the card

## Layout — Full Overlay

No glassmorphism panel. All content is overlaid on the painting.

### Title Area (Top, Centered)
- **Position:** `absolute`, top 38px, centered horizontally
- **Avatar icon** (22x22px) + **repo name** + **VerificationBadge** in a flex row with `justify-content: center`
- **Font:** Cormorant Garamond, 22px, weight 600, `rgba(255,255,255,0.95)`
- **No text-shadow** — clean text directly on the painting
- **No border/outline** on the avatar icon
- **VerificationBadge** renders inline after the repo name (same `sm`/`icon` variant as current)
- **VerifiedBadge** (org-level) renders next to the owner name in the description area

### Avatar Icon Processing
The small avatar next to the title is processed via canvas to create a white silhouette:
1. Load avatar into a hidden `<canvas>` element (44x44)
2. For each pixel, compute luminance: `0.299*R + 0.587*G + 0.114*B`
3. Pixels below luminance threshold (110): set fully transparent (`alpha = 0`)
4. Pixels above threshold: set to white (`R=G=B=255`) with alpha proportional to brightness: `alpha = ((luminance - threshold) / (255 - threshold)) * 255`
5. Export processed canvas to a data URL and display as `<img>`

The image must be loaded with `crossOrigin = 'anonymous'` to allow `getImageData()`. If the canvas is tainted (security error), fall back to hiding the icon entirely.

This produces a white ghost of the avatar's light areas, ensuring visual harmony regardless of the original avatar's colors.

### Description Area (Bottom, Centered)
- **Position:** `absolute`, bottom 40px, inset 36px from sides
- **Text:** Cormorant Garamond, 14px, italic, `rgba(255,255,255,0.82)`
- **Line clamp:** 3 lines max
- **Owner name** below description: Inter, 10px, uppercase, letter-spacing 1.5px, `rgba(255,255,255,0.45)`
- **No text-shadow**
- **On hover:** translates up 48px to make room for the hover overlay

### Hover Overlay (Bottom)
Revealed on card hover with a fade-in + slide-up transition:

- **Background:** `linear-gradient(0deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)`
- **Transition:** `opacity 0.25s ease, transform 0.25s ease` (starts translated 8px down, slides to 0)
- **Contents:**
  - **Tags row** — centered flex-wrap, same pill style as current (Inter 9px, `rgba(255,255,255,0.12)` background, `rgba(255,255,255,0.15)` border)
  - **Stats row** — type icon (with tooltip), stars, forks, issues, recency with color-coded text (Inter 10px, `rgba(255,255,255,0.65)`). Preserves existing `formatRecency`, `getUpdatedColor`, and `getSubTypeConfig` helpers.
  - **Actions** — star button + "Open" button, same style as current cards
  - **Learn/Download** — learn and download buttons with their state indicators move into the hover overlay actions area, preserving existing `handleLearn`/`handleDownload` handlers and `learnState`/`downloadState` tracking

### Card Hover Effects
- `box-shadow: 0 8px 40px rgba(0,0,0,0.4)`
- `transform: translateY(-2px)`
- No color/filter transitions on the background painting

## Components Affected

### `RepoCard.tsx`
- Remove `DitherBackground` import and usage
- Remove `repo-card-banner` spacer div
- Remove `repo-card-panel` glassmorphism wrapper
- Restructure to: background layers → frame decorations → title → description → hover overlay
- Add canvas-based avatar processing (useEffect + useRef)
- Move title to top-center, description to bottom-center
- Tags and stats move into the hover overlay

### `DitherBackground.tsx`
- **Replace entirely** — the pixelated 8x8 canvas + SVG dither patterns are replaced by the chiaroscuro CSS filter stack
- New component (or inline in RepoCard) renders the 6 background layers from an avatar URL

### `globals.css`
- Remove/replace: `.repo-card-banner`, `.repo-card-panel`, `.dither-bg-img` and its hover filter transition
- Update `.repo-card` to use `aspect-ratio: 3/4` instead of `height: 340px`
- Add new classes for the chiaroscuro layers, frame marks, title, description, and hover overlay
- Remove grayscale-to-color hover transition on `.dither-bg-img`

## Typography

- **Title:** Cormorant Garamond (Google Fonts), 22px, weight 600
- **Description:** Cormorant Garamond, 14px, italic
- **Owner:** Inter, 10px, uppercase, letter-spacing 1.5px
- **Stats/tags/buttons:** Inter (unchanged from current)
- **Corner marks:** Inter, 14px, weight 300

Cormorant Garamond must be added as a Google Fonts import (weights: 400 italic, 600 regular). Use `font-display: swap` to avoid FOUT blocking.

## Animations

- **Card entry:** Preserve existing `card-in 0.18s ease forwards` animation
- **Hover transitions:** Both description translate and overlay slide-up use `0.25s ease` timing, coordinated to run simultaneously
- **Emoji parsing:** Preserve existing `parseEmoji()` on description text

## Existing Features Preserved

- Click navigates to repo detail (`/repo/:owner/:name`)
- Star/unstar button (in hover overlay)
- Tag click filtering (in hover overlay)
- Owner click navigation
- Keyboard focus outline (`kb-focused` class)
- Description translation
- Verification badges
- Learn/download functionality
- Mouse-leave collapses expanded tags
