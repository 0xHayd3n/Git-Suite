# Discover View UI Polish

**Date:** 2026-04-12
**Status:** Draft

## Summary

Five targeted UI fixes to the Discover view: remove a duplicate layout toggle, clear the SmartBar background, fix stretched dither images, enforce uniform card sizing, and darken the card glass effect for readability.

## Changes

### 1. Integrate LayoutDropdown into SmartBar

**Problem:** The SmartBar has a `LayoutGrid` button (line 102) that fires `onLayoutClick`, but it's wired to a no-op (`onLayoutClick={() => {}}` at Discover.tsx:870). Meanwhile, a separate standalone `<LayoutDropdown>` renders below the SmartBar at Discover.tsx:894, creating a visible orphan layout icon. The SmartBar button does nothing; the standalone dropdown is the only functional one.

**Solution:**
- Remove the standalone `<LayoutDropdown prefs={layoutPrefs} onChange={handleLayoutChange} />` from `Discover.tsx:894`.
- Render `<LayoutDropdown>` inside SmartBar, replacing the plain `LayoutGrid` button with the full `LayoutDropdown` component (which already renders its own `LayoutGrid` button and manages its own open/close state).
- Remove the `onLayoutClick` prop from SmartBar since the dropdown handles its own toggle.

**Files:** `src/views/Discover.tsx`, `src/components/SmartBar.tsx`, `src/components/LayoutDropdown.tsx`

### 2. Remove SmartBar background

**Problem:** `.smart-bar` in `globals.css:7747` has `background: rgba(255, 255, 255, 0.02)` which creates a faint visible strip that obstructs the clear background behind it.

**Solution:**
- Change `.smart-bar` background to `transparent`.
- Keep the `border-bottom: 1px solid var(--border)` — it provides subtle separation for the controls without the filled background.

**Files:** `src/styles/globals.css`

### 3. Fix stretched dithered backgrounds

**Problem:** The dither canvas uses `width: 100%; height: 100%` CSS, but the source avatar images are square while card headers are wide and short (~250x65px). The canvas stretches the image to fill, distorting proportions.

**Solution:**
- In `useBayerDither.ts`, apply cover-style aspect ratio correction in `renderCamera`. The correction must be applied to the `u`/`v` values returned by `camera.sample()` (after line 148, before the out-of-bounds check at line 150), so it works with all camera animations rather than fighting them.
- Compute `srcAspect = imgW / imgH` and `outAspect = w / h`. If `outAspect > srcAspect` (output is wider than source), compress the V range to `v = 0.5 + (v - 0.5) * (srcAspect / outAspect)`, sampling a horizontal strip from the center. Otherwise compress U similarly.
- Note: `w`/`h` are already scaled down by 0.25x in the hook, but the aspect ratio is preserved so the correction math is unaffected.

**Files:** `src/hooks/useBayerDither.ts`

### 4. Uniform card sizing

**Problem:** Featured cards in `DiscoverGrid.tsx` use `gridColumn: 'span 2'`, making them double-width. This breaks visual uniformity.

**Solution:**
- Remove the featured card spanning logic from `DiscoverGrid.tsx`. All cards render at `1fr` width.
- Remove any featured-specific CSS (`.repo-card-featured` styles).
- Cards use natural content height — no fixed height constraint needed since the dither header is fixed-height and info sections are similar in size.

**Files:** `src/components/DiscoverGrid.tsx`, `src/styles/globals.css`

### 5. Darker glass effect on cards

**Problem:** `.repo-card` has `background: rgba(255, 255, 255, 0.03)` — nearly invisible, making text hard to read against dithered backgrounds.

**Solution:**
- Apply the dark glass effect to `.repo-card-info` (the text section below the dither header), NOT to `.repo-card` itself. Darkening `.repo-card` would tint the dither header and `backdrop-filter` would blur elements behind the card in the page layout, not the dither content inside it.
- Set `.repo-card-info` to `background: rgba(0, 0, 0, 0.45)` with `backdrop-filter: blur(8px)` and `-webkit-backdrop-filter: blur(8px)`.
- Keep `.repo-card` background as-is (or make it fully transparent) since the dither header should remain vivid.

**Files:** `src/styles/globals.css`

## Files affected

| File | Changes |
|------|---------|
| `src/views/Discover.tsx` | Remove standalone `<LayoutDropdown>`, pass layout props to SmartBar |
| `src/components/SmartBar.tsx` | Replace plain LayoutGrid button with LayoutDropdown component |
| `src/components/LayoutDropdown.tsx` | May need minor adjustments for SmartBar integration |
| `src/styles/globals.css` | Transparent SmartBar bg, darker `.repo-card-info` glass, remove featured card styles |
| `src/hooks/useBayerDither.ts` | Cover-style aspect ratio correction in renderCamera |
| `src/components/DiscoverGrid.tsx` | Remove featured card spanning logic |

## Out of scope

- List view implementation (only grid view changes)
- Card height normalization (natural height is acceptable)
- Any changes to the ViewModeBar component (used only in Files tab)
