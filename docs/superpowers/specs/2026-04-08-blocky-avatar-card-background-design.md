# Blocky Avatar Card Background

## Summary

Replace the plain gradient background in RepoCard with a pixelated (8x8) version of the repo's avatar image, tinted with the bucket gradient color. The existing dither pattern overlay and avatar watermark remain, creating a layered visual identity for each card.

## Layer Stack (bottom to top)

1. **Pixelated avatar (8x8)** — the repo/owner avatar drawn to an 8x8 canvas and scaled up with `image-rendering: pixelated`, filling the entire card background. Produces large, chunky color blocks.
2. **Bucket gradient tint** — the existing `linear-gradient(135deg, stop1, stop2)` overlaid with `mix-blend-mode: multiply` at ~45% opacity, preserving the bucket color identity.
3. **Dither patterns** — the existing SVG dither overlays (diagonal lines, crosshatch, horizontal lines, radial blobs) layered on top, unchanged from current implementation.
4. **Avatar watermark** — the existing 180x180px circular avatar at 35% opacity with `blur(1px)`, centered in the upper portion of the card. The contrast between the crisp watermark and blocky background creates visual depth.
5. **Glass panel** — the existing glassmorphic content panel (`rgba(255,255,255,0.35)`, `backdrop-filter: blur(20px) saturate(1.4)`) at the bottom of the card, unchanged.

## Changes to DitherBackground

The `DitherBackground` component currently renders: gradient base → SVG dither patterns → avatar watermark.

### New behavior

- Accept the `avatarUrl` prop (already available) and render a pixelated version as the base layer instead of the plain gradient.
- **Pixelation technique**: Use an offscreen `<canvas>` element. Draw the avatar image at 8x8 resolution, then display the canvas at full size with `image-rendering: pixelated`. This is GPU-friendly and avoids runtime pixel manipulation.
- The gradient tint layer sits on top of the canvas with `mix-blend-mode: multiply` at `opacity: 0.45`.
- A new **screen overlay** div (`background: white; mix-blend-mode: screen; opacity: 0.1`) sits above the tint to prevent very dark avatars from making the card fully black.
- Dither patterns and avatar watermark render above the screen overlay, same as today.
- Z-index ordering is explicit via inline styles to ensure correct stacking within the component's existing inline-style approach: canvas (`z-index: 1`) → tint (`z-index: 2`) → screen overlay (`z-index: 3`) → dither (`z-index: 4`) → watermark (`z-index: 5`).

### Fallback (no avatar)

If no `avatarUrl` is available, fall back to the owner's GitHub avatar (the `avatarUrl` prop already resolves to the owner avatar in most cases). If neither is available, fall back to the current gradient-only background — the pixelation layer is simply omitted.

### Image loading

- The avatar is loaded via `new Image()` with `crossOrigin = 'anonymous'`.
- Draw to canvas happens in an `onload` callback.
- On error, the pixelation layer is skipped and the card renders with the existing gradient + dither (graceful degradation).
- The canvas draw is a one-time operation per mount (or when `avatarUrl` changes), wrapped in a `useEffect`.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/DitherBackground.tsx` | Add canvas-based pixelation layer beneath the existing gradient, add screen overlay div, restructure z-index stacking. All new styles are inline (matching the component's existing pattern). |

## Files Unchanged

- `src/components/RepoCard.tsx` — no prop changes needed; `DitherBackground` already receives `avatarUrl`.
- `src/config/repoTypeConfig.ts` — gradient/tint system unchanged.
- Glass panel styling — unchanged.

## Performance Considerations

- Drawing an image to an 8x8 canvas is trivial — effectively free.
- `image-rendering: pixelated` is a CSS hint that avoids GPU-intensive interpolation (cheaper than the alternative).
- One `<canvas>` element per card adds minimal DOM weight.
- The avatar image is already being loaded for the watermark, so no additional network request.

## Edge Cases

- **CORS errors on avatar load**: The `crossOrigin = 'anonymous'` attribute handles GitHub-hosted avatars. On canvas draw failure, skip the pixelation layer silently.
- **Transparent/white avatars**: The multiply-blended bucket tint ensures the card still reads as its bucket color even if the avatar is mostly white.
- **Very dark avatars**: The screen overlay (`background: white; mix-blend-mode: screen; opacity: 0.1`) described in the layer stack prevents the card from going fully black.
