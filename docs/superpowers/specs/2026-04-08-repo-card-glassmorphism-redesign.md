# Repo Card Glassmorphism Redesign

## Summary

Redesign repo cards from the current flat banner-over-body layout to a full-bleed gradient background with a floating glassmorphic content panel. The banner spans the entire card, coloured by bucket accent, overlaid with multi-layer SVG crosshatch dithering and a large translucent repo avatar. All text content sits in a rounded frosted-glass panel pinned to the bottom of the card.

## Current State

- **`RepoCard.tsx`** — renders a 72 px banner (`BannerSVG`) above a white card body containing avatar, title, description, tags, and footer stats.
- **`BannerSVG.tsx`** — renders a plain `#f5f5f7` rectangle. Exports `getLangConfig` (palette lookup by language hash) — unused by the new design but kept for external consumers (`ComponentDetail.tsx`, `GenericDetail.tsx`, `RepoDetail.tsx`, `LangBadge.tsx`, and tests).
- **`globals.css`** — `.repo-card`, `.repo-card-banner`, `.repo-card-body`, `.repo-card-footer`, and related classes define current layout.
- **`repoTypeConfig.ts`** — `getBucketColor()` returns the bucket's hex colour; `getSubTypeConfig()` returns `{ label, icon, accentColor }`.
- **`repoTypes.ts`** — `REPO_BUCKETS` defines 8 buckets, each with an `id`, `label`, and `color` (hex).

## Design

### Card Structure

```
┌──────────────────────────────────┐
│  Full-bleed gradient background  │  ← bucket accent gradient
│  + SVG crosshatch dither layers  │
│  + large avatar (180 px, 35%α)   │
│                                  │
│  ┌────────────────────────────┐  │  ← 8 px margin from card edges
│  │  Frosted glass panel       │  │
│  │  ┌──┐ name                 │  │  ← 24 px avatar (no border), repo name, owner
│  │  └──┘ owner                │  │
│  │  description (2 lines)     │  │
│  │  [tag] [tag] [tag]         │  │
│  │  ─────────────────────     │  │
│  │  ★ 65k  ⑂ 16k   [☆][Open]│  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### Background Layer

1. **Gradient base** — `linear-gradient(135deg, <stop1>, <stop2>)` derived from the bucket colour via `getBucketGradient()`. Each bucket maps to a hard-coded two-stop gradient (see Bucket Gradient Mapping table).

2. **SVG dither overlay** — six `<rect>` elements stacked inside an inline `<svg>`, each filled with a different `<pattern>`:
   - Diagonal lines (top-left → bottom-right), 5 px cell, 0.5 px stroke, 20 % opacity in bucket hue
   - Diagonal lines (opposite direction), 5 px cell, 16 % opacity
   - Horizontal accent lines, 7 px cell, 10 % opacity
   - Dense crosshatch clusters (small X marks), 12 px cell, 18–25 % opacity
   - Two `radialGradient` tonal blobs (20 % / 25 % position, 40–45 % radius, 12–15 % opacity)

   Pattern colours are derived from the bucket colour at low opacity so they tint correctly regardless of base hue.

3. **Avatar watermark** — `repo.avatar_url` rendered as an `<img>` at 180 × 180 px, `border-radius: 50%`, `opacity: 0.35`, `filter: blur(1px)`, centred horizontally and positioned at ~45 % from the top of the card.

### Glass Panel

- **Position**: pinned to the bottom of the card with `margin: 0 8px 8px 8px`.
- **Shape**: `border-radius: 12px`.
- **Material**: `background: rgba(255, 255, 255, 0.35)`, `backdrop-filter: blur(20px) saturate(1.4)`, `border: 1px solid rgba(255,255,255,0.35)`, `box-shadow: 0 -2px 20px rgba(0,0,0,0.04)` (negative Y-offset intentional — casts shadow upward to simulate light from below the panel, creating lift).
- **Padding**: 14 px, flex column with 8 px gap.
- **Text colour**: all text inside the panel is white (`#fff` or `rgba(255,255,255,0.7–0.9)` for secondary text).

### Panel Content (top → bottom)

1. **Title row** — flex row: 24 px circular avatar (`border: none`, `object-fit: cover`) + column of repo name (13 px, 600 weight, white) and owner (12 px, `rgba(255,255,255,0.8)`).
2. **Description** — 12 px, `line-height: 1.45`, `rgba(255,255,255,0.9)`, 2-line clamp.
3. **Tags** — pill-shaped, `rgba(255,255,255,0.15)` background, `rgba(255,255,255,0.85)` text, `1px solid rgba(255,255,255,0.2)` border, 10 px font. Hover state: `rgba(255,255,255,0.25)` background, `#fff` text. Active state: `rgba(255,255,255,0.3)` background, `#fff` text. Expand/collapse behaviour unchanged.
4. **Footer** — separated by `1px solid rgba(255,255,255,0.15)` top border, 8 px padding-top. Stats in `rgba(255,255,255,0.7)` 11 px. Star button and Open button styled with white-on-transparent glass treatment (`rgba(255,255,255,0.15–0.2)` bg, `rgba(255,255,255,0.25–0.3)` border).

### Colour Overrides Inside Glass Panel

All text-bearing elements inside the glass panel must switch from CSS variable colours to white-family values. This includes:

- `.repo-card-name` — `color: #fff` (was `var(--t1)`)
- `.card-owner-link` — `color: rgba(255,255,255,0.8)` (was `var(--t3)`)
- `.repo-card-desc` — `color: rgba(255,255,255,0.9)` (was `var(--t2)`)
- `.repo-card-stat-item` — `color: rgba(255,255,255,0.7)` (was `var(--t3)`)
- `CardTags` "+N more" / "less" buttons — inline `color` overridden to `rgba(255,255,255,0.7)` (was `var(--t3)`)
- `.repo-card-tag` — glass-themed pill styling (see Tags above)
- `getUpdatedColor` recency colours — replace `var(--t3)` fallback with `rgba(255,255,255,0.7)`, replace `#16a34a` / `#2563eb` with `rgba(255,255,255,0.95)` / `rgba(255,255,255,0.85)` respectively, since bright green/blue won't read well on all gradient backgrounds
- `VerificationBadge` and `VerifiedBadge` — set to white (`#fff`) inside the glass panel
- Sub-type icon in footer — `color: #fff` (was `typeConfig.accentColor`)
- Card outer border — `1px solid rgba(255,255,255,0.2)` (was `var(--border)`); hover changes to `rgba(255,255,255,0.35)`

### Removed Elements

- **Left accent border** (`borderLeft: 2px solid accentColor`) — removed. The full-bleed gradient carries bucket identity.
- **`BannerSVG` rendering** — the component is no longer rendered inside the card. `BannerSVG.tsx` itself is kept (it exports `getLangConfig` used elsewhere) but `RepoCard` stops importing/rendering it.
- **Small avatar border** — the 24 px circular avatar in the title row has `border: none`.

### What Stays the Same

- Card dimensions (width controlled by grid parent).
- Card border-radius (`var(--radius-lg)` = `10px`).
- Click handler, keyboard focus outline, mouse-leave tag collapse.
- `card-in` animation (`0.18s ease forwards`).
- `formatCount`, `formatRecency` helpers.
- Star/Open button functionality.
- Emoji shortcode parser.
- Translation logic.
- Sub-type icon in footer stats row (colour changes to white).

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/RepoCard.tsx` | Replace banner + body layout with full-bleed bg + glass panel. Remove `BannerSVG` import. Add inline SVG dither patterns. Render large avatar watermark. Restyle all text to white. Remove `borderLeft` accent. |
| `src/components/BannerSVG.tsx` | No changes needed — kept for `getLangConfig` export. Card stops rendering it. |
| `src/config/repoTypeConfig.ts` | Add `BUCKET_GRADIENTS` lookup map (bucket hex → `[stop1, stop2]`) and a `getBucketGradient(bucketColor)` function that returns the pair. Values are hard-coded from the table below. |
| `src/styles/globals.css` | Restyle `.repo-card` (remove white bg, set `overflow: hidden`, `position: relative`). Remove/repurpose `.repo-card-banner` (now full-bleed bg layer). Replace `.repo-card-body` with `.repo-card-panel` (glass effect). Update all child classes for white-on-glass colours (see "Colour Overrides" section). Card border changes to `rgba(255,255,255,0.2)`. Hover border changes to `rgba(255,255,255,0.35)`. `card-in` animation retained. |

## Bucket Gradient Mapping

Each bucket's single hex colour maps to a two-stop gradient. The primary stop is the bucket colour; the secondary is generated by shifting hue +20° and increasing lightness. Example mappings:

| Bucket | Hex | Gradient |
|--------|-----|----------|
| Dev Tools | `#3b82f6` | `#2563eb → #0ea5e9` |
| Frameworks | `#06b6d4` | `#0891b2 → #22d3ee` |
| AI & ML | `#8b5cf6` | `#7c3aed → #a855f7` |
| Learning | `#f97316` | `#ea580c → #fb923c` |
| Editors & IDEs | `#14b8a6` | `#0d9488 → #2dd4bf` |
| Lang Projects | `#f59e0b` | `#d97706 → #fbbf24` |
| Infrastructure | `#ef4444` | `#dc2626 → #f87171` |
| Utilities | `#6b7280` | `#4b5563 → #9ca3af` |

These are hard-coded in `repoTypeConfig.ts` rather than computed, to ensure consistent visual results.

## SVG Pattern Architecture

Each card renders its own `<svg>` element containing `<defs>` with the 6 pattern/gradient definitions. SVG pattern IDs are scoped to their containing `<svg>` element, so no ID collisions occur between cards. This is simpler than shared `<defs>` and avoids lifecycle management.

The 6 patterns per card is lightweight — each is a few `<line>` elements. Performance impact is negligible for typical grid sizes (12–30 cards visible).

## Theme

This design is light-mode only. The app currently has no dark mode. If dark mode is added in the future, the glass panel values (`rgba(255,255,255,...)`) and white text would need dark-mode variants — but that is out of scope for this spec.

## Accessibility

- **Contrast**: white text on the glass panel achieves adequate contrast because the panel sits over saturated, mid-to-dark gradients. The `backdrop-filter: blur(20px) saturate(1.4)` further enriches the colour behind the panel. For lighter buckets (Learning `#f97316`, Lang Projects `#f59e0b`), the gradient secondary stops are darker shades (`#ea580c`, `#d97706`), keeping the blurred backdrop sufficiently dark. During implementation, verify WCAG AA (4.5:1) contrast for all 8 buckets by inspecting rendered cards; if any bucket fails, darken its gradient secondary stop or add `text-shadow: 0 1px 2px rgba(0,0,0,0.3)` as a fallback.
- The card remains fully keyboard-navigable with the existing focus outline.
- Avatar images retain `alt` attributes.
- Star/Open buttons retain existing `title` attributes.

## Testing

- Visual regression: verify cards render correctly across all 8 bucket colours.
- Verify `backdrop-filter` renders in Electron's Chromium (supported since Chromium 76).
- Confirm tag expand/collapse, star toggle, and navigation still work.
- Test cards with missing `avatar_url` — the watermark should gracefully not render; small avatar should hide via existing `onError` handler.
- Test long descriptions (2-line clamp) and long repo names (text overflow).
