# Light Card Banners Design

## Summary

Flip the card banner SVGs from dark (near-black backgrounds with bright accents) to light (white-to-pastel gradients with soft pastel pattern elements). This creates an airier, more modern look while preserving the unique per-repo pattern identity.

## Approach

Invert the existing palette system. The SVG structure, seeded PRNG, and pattern-selection-by-repo-type all stay the same — only the color values change.

## Color Palette Inversion

### `deriveBannerPalette()` in `src/utils/color.ts`

Current dark values:

| Property       | Current                          |
|----------------|----------------------------------|
| bg             | `hsl(h, sat*25%, 5%)`           |
| gradientCenter | `hsl(h, sat*55%, 16%)`          |
| primary        | `hsl(h, sat*75%, 52%)`          |
| secondary      | `hsl(h, sat*65%, 68%)`          |
| textFaint      | `hsl(h, sat*35%, 22%)`          |

The `textFaint` property is removed entirely — it was only used for the monospace labels which are being dropped. No downstream consumers reference it.

New light values:

| Property       | New                              | Description                           |
|----------------|----------------------------------|---------------------------------------|
| bg             | `hsl(h, sat*15%, 97%)`          | Near-white with a whisper of hue      |
| gradientCenter | `hsl(h, sat*30%, 88%)`          | Soft pastel tint — the color payoff   |
| primary        | `hsl(h, sat*40%, 72%)`          | Muted pastel for pattern fills        |
| secondary      | `hsl(h, sat*35%, 80%)`          | Even softer variant                   |

### Hardcoded 16-color `PALETTE` in `BannerSVG.tsx`

Each of the 16 entries gets the same inversion treatment — dark `bg` values become near-white, bright `primary`/`secondary` become soft pastels, and `tone` values shift from ~20% lightness to ~82% lightness.

### Pattern tone in `BannerSVG.tsx`

The avatar-derived tone (used for pattern rendering) changes from `hsl(h, sat*45%, 22%)` to `hsl(h, sat*25%, 82%)` — subtle pastel shapes on a light background.

## BannerSVG Component Changes

### Remove

- **Bottom scrim:** The linear gradient (`scrimId`) and its `<rect>` overlay — no longer needed since there's no dark-to-legible transition required.
- **Monospace labels:** The `labels.map(...)` text elements and the `getLabels()` / `GENERIC_LABELS` supporting code.
- **Avatar in banner:** The circular glow, ring, `<image>` element, and `avatarClipId` clip path. The `avatarUrl` prop is removed from `BannerSVGProps`.

### Keep unchanged

- Seeded PRNG (`djb2`, `makePrng`)
- Pattern selection by repo type (`PATTERN_BY_TYPE`)
- All 6 pattern generators: dots, stars, layers, cogs, windows, books
- `size` prop and card (260x72) vs detail (500x175) dimensions
- Radial gradient structure (illuminates from left-center)

### Adjust

- Pattern fill opacities: bump from current ~0.1–0.35 range to ~0.15–0.45 range. On a light background, the current low opacities would be too faint.

## Downstream Impact

### `src/components/RepoCard.tsx`

- Stop passing `avatarUrl` to `BannerSVG` (prop removed).
- No other changes — card body, tags, footer, stats unchanged.

### `src/views/RepoDetail.tsx`

- Renders `<BannerSVG>` with `avatarUrl={repo?.avatar_url}` at line ~903. Remove the `avatarUrl` prop.

### Detail page components

- `ComponentDetail.tsx` and `GenericDetail.tsx` only import `getLangConfig` from `BannerSVG` — they do not render the component. No changes needed.
- `CollDetail.tsx` renders `<BannerSVG>` but does not pass `avatarUrl`. No changes needed.

### No changes needed

- `RepoListRow.tsx` (doesn't use banners)
- `.repo-card-banner` CSS (just a container, dimensions stay the same)
- Any other components

## Files Changed

1. `src/utils/color.ts` — flip `deriveBannerPalette` to light output, remove `textFaint`
2. `src/components/BannerSVG.tsx` — flip hardcoded palette, remove avatar/labels/scrim, adjust pattern opacities
3. `src/components/RepoCard.tsx` — stop passing `avatarUrl` to BannerSVG
4. `src/views/RepoDetail.tsx` — stop passing `avatarUrl` to BannerSVG
