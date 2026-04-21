# Repo Type Banner Patterns — Design Spec

**Date:** 2026-04-02
**Status:** Approved

---

## Overview

Overhaul the `BannerSVG` component so that the background pattern for each repo card is determined by the repo's **classified type** (`framework`, `tool`, `application`, `learning`, `awesome-list`, `other`) rather than a hash of the owner/name. Each type gets one bespoke SVG pattern designed to visually reflect its meaning. Color remains avatar-derived; language/topic color bias is removed entirely.

---

## Goals

- Pattern is semantically meaningful — users can visually associate a pattern with a repo category
- Colors stay personal to each repo (avatar-derived HSL palette)
- No language or topic influence on color or pattern
- Repos of the same type look similar but not pixel-identical (seed-driven positional variation)

---

## Pattern Definitions

One fixed SVG pattern per repo type, designed to echo the type's icon and meaning:

| Type | Icon | Pattern Concept | Description |
|---|---|---|---|
| `framework` | `LuLayers` | Stacked layer bars | Overlapping horizontal slabs of decreasing width, evoking architecture diagrams or layer cakes |
| `tool` | `LuWrench` | Cog outlines | Circular cog/gear shapes with teeth, scattered at varying sizes and rotations |
| `application` | `LuMonitor` | Window chrome | Simplified app/browser window outlines (titlebar + content area), tiled across the banner |
| `learning` | `LuBookOpen` | Open book pages | Repeated open-book silhouettes or page-turn arc motifs |
| `awesome-list` | `LuStar` | Star field | Scattered 5-point star shapes at varying sizes and opacities |
| `other` | `null` | Scattered dots | Simple neutral dots at random positions — generic, non-committal |

The `djb2` seed (hash of `owner/name`) is passed into each pattern function to vary element positions, sizes, and opacities deterministically, so two repos of the same type look similar but not identical.

---

## Architecture

### `BannerSVG.tsx`

**Props change:**

```ts
// Before
interface BannerSVGProps {
  owner: string
  name: string
  language: string
  topics: string[]
  size: 'card' | 'detail'
  bannerColor?: HSL | null
  avatarUrl?: string | null
}

// After
interface BannerSVGProps {
  owner: string
  name: string
  repoType: RepoType         // drives pattern selection
  size: 'card' | 'detail'
  bannerColor?: HSL | null
  avatarUrl?: string | null
}
```

**Pattern selection:**

Replace `seed % ALL_PATTERNS.length` with a direct type-to-function lookup:

```ts
const PATTERN_BY_TYPE: Record<RepoType, PatternFn> = {
  'framework':    patternLayers,
  'tool':         patternCogs,
  'application':  patternWindows,
  'learning':     patternBooks,
  'awesome-list': patternStars,
  'other':        patternDots,
}

const patternFn = PATTERN_BY_TYPE[repoType]
const pattern = patternFn(rng, w, h, col.tone)
```

This replaces the existing dispatch at line 393:
```ts
// Old — removed
const patternIdx = seed % ALL_PATTERNS.length
const pattern = ALL_PATTERNS[patternIdx](rng, w, h, col.tone, col.tone)
```

**Pattern function signature:**

```ts
type Rng = () => number
type PatternFn = (rng: Rng, w: number, h: number, tone: string) => React.ReactNode[]
```

- `rng` is produced by `makePrng(seed)` before being passed in (same as today)
- `tone` is the dark mid-tone color (`col.tone`) used for embossing — patterns do NOT use `primary` or `secondary` directly
- Return type is `React.ReactNode[]` (matching existing pattern functions)

**Color object shape (internal, unchanged):**

```ts
type ColEntry = {
  bg: string       // very dark background fill
  primary: string  // accent color (used in gradient, labels)
  secondary: string
  tone: string     // muted mid-tone for pattern drawing (embossing effect)
}
```

**Color selection:**

Remove all language/topic bias logic from the banner color path. Color is determined solely by:

1. If `bannerColor` (avatar HSL) is present → `deriveBannerPalette(bannerColor)` and derive `tone` from `bannerColor.h` + sat clamp (as today at line 370)
2. If `bannerColor` is null → `PALETTE[seed % PALETTE.length]` (no language bias, just seed-based neutral fallback)

`PALETTE` (the 16-color array) is kept. `LANG_BIAS`, `ML_BIAS`, `CLI_BIAS`, and `pickPalette()` are removed.

**`getLangConfig` (exported function — kept but simplified):**

`getLangConfig` is used by `Library.tsx` and `RepoDetail.tsx` for language color badges (a separate UI element from the banner). It is kept but refactored to remove its internal use of `pickPalette`/`LANG_BIAS`:

```ts
export function getLangConfig(language: string): LangConfig {
  const seed = djb2(language)
  const col = PALETTE[seed % PALETTE.length]  // no bias, just deterministic by language
  const abbr = language ? language.slice(0, 2) : '—'
  return { ...col, abbr }
}
```

The `topics` parameter is removed from its signature since it was only needed for `ML_BIAS`/`CLI_BIAS` topic detection. Callers (`Library.tsx`, `RepoDetail.tsx`) must be updated to drop the `topics` argument.

Note: the seed changes from `djb2(language + topics.join(','))` to `djb2(language)`. This is intentional — it removes topic influence — but will visually reassign badge colors for any language where topics previously altered the hash. This is an accepted consequence of the bias removal.

**Bottom-edge monospace labels:**

`getLabels()` and the bottom label rendering are kept. The function currently takes `(_language, _topics, seed)` but the first two params are unused (prefixed `_`). Simplify to:

```ts
function getLabels(seed: number): string[] { ... }
```

Update the call site at line 395 from `getLabels(language, topics, seed)` to `getLabels(seed)`.

---

### `RepoCard.tsx`

Thread `repoType` (already available for the accent border) into `BannerSVG`. Remove `language` and `topics` from the `BannerSVG` call.

### `RepoDetail.tsx`

- Add import: `import { classifyRepoType, type RepoType } from '../lib/classifyRepoType'` (not currently imported in this file)
- Call `classifyRepoType(repo)` inline to obtain `repoType` and pass it to `BannerSVG`
- Remove `language` and `topics` from the `BannerSVG` call
- Update the `getLangConfig` call at line 723 to drop the `topics` argument: `getLangConfig(repo?.language ?? '')`

### `Collections.tsx`

Collections are not classified repos. Pass `repoType="other"` to `BannerSVG`. Remove `language` and `topics` from the call. `bannerColor` and `avatarUrl` remain absent — this is intentional; collections have no owner avatar or dominant color, so the component falls back to `PALETTE[seed % 16]`.

### `Library.tsx`

Update all three `getLangConfig` call sites (lines 56, 153, 301) to drop the `topics` argument: `getLangConfig(lang)`.

### `color.ts`

No changes required. `deriveBannerPalette()` remains unchanged.

### `electron/color-extractor.ts`

No changes required.

---

## Pattern Functions — Detailed Spec

All patterns receive `tone` as their sole color. All positional values (counts, offsets, sizes, opacities) are derived from `rng()` calls for seed-driven variation.

### `patternLayers` (framework)

- Draw 4–6 horizontal rounded rectangles (`rx="2"`) stacked vertically with gaps
- Each bar is slightly narrower than the one above (left-anchored, decreasing width by ~10–20% per bar)
- Widths range from ~60% to ~95% of banner width
- Vertical positions evenly spaced, slight jitter from `rng()`
- Opacity varies per bar: `0.15`–`0.4` via `rng()`
- All filled with `tone`, no stroke

### `patternCogs` (tool)

- Draw 3–5 cog shapes at varying positions and sizes
- Each cog: a circle + 8 evenly-spaced radial rectangles (teeth) extending outward from the circumference
- Radii range from `10px`–`24px`; tooth length ~30% of radius
- Rotation per cog driven by `rng()` (0–360°)
- Stroke `tone`, `strokeWidth="0.6"`, fill `none`, opacity `0.2`–`0.4`

### `patternWindows` (application)

- Draw 3–4 window outlines, each as: a thin titlebar rect + a taller content rect below it
- Titlebar height: ~6px; content height: `16px`–`28px`; width: `50px`–`90px`
- Three small dots (`r="1.5"`) in the titlebar (traffic lights), spaced 5px apart from the left edge
- Positions scattered across banner with slight overlaps allowed
- Stroke `tone`, `strokeWidth="0.5"`, fill `none`, opacity `0.2`–`0.35`

### `patternBooks` (learning)

- Draw 3–5 open-book silhouettes
- Each book: two symmetric arcs meeting at a central spine point — left arc curves up-left, right arc curves up-right
- 2–3 inner page arcs fanning out from the spine inside each half
- Size varies: spine width `20px`–`40px`, height `15px`–`30px`
- Slight rotation per book (`-10°` to `+10°`) via `rng()`
- Stroke `tone`, `strokeWidth="0.6"`, fill `none`, opacity `0.2`–`0.4`

### `patternStars` (awesome-list)

- Draw 10–15 5-point star polygons scattered across the banner
- Outer radius: `5px`–`16px` (inner radius = outer * 0.4)
- Each star rotated by `rng()` (0–72° for natural variation)
- Opacity per star: `0.1`–`0.45` via `rng()`
- Fill `tone`, no stroke

### `patternDots` (other)

- Draw 14–20 circles scattered across the banner
- Radii: `2px`–`5px` via `rng()`
- Opacity per dot: `0.1`–`0.35` via `rng()`
- Fill `tone`, no stroke
- No connections or lines — purely neutral

---

## Data Flow

```
RepoCard / RepoDetail
  ├── parses banner_color JSON → HSL | null
  ├── has repoType (RepoCard: from prop; RepoDetail: classifyRepoType(repo))
  └── renders BannerSVG
        ├── bannerColor → deriveBannerPalette() OR PALETTE[seed % 16]
        ├── repoType → PATTERN_BY_TYPE[repoType]
        ├── djb2(owner/name) → seed → makePrng(seed) → rng
        └── renders: radial gradient + pattern layer + avatar + bottom scrim + labels
```

---

## What Is Removed

**From `BannerSVG.tsx`:**
- `LANG_BIAS` constant
- `ML_BIAS` constant
- `CLI_BIAS` constant
- `pickPalette()` function
- `ALL_PATTERNS` array
- All 10 existing pattern functions: `patternNodes`, `patternRects`, `patternPolygons`, `patternCircles`, `patternGrid`, `patternTerminal`, `patternGeneric`, `patternWaves`, `patternHex`, `patternStreaks`
- `language` and `topics` props from `BannerSVGProps`
- `topics` parameter from `getLangConfig` signature

**From call sites:**
- `language` and `topics` arguments at all `BannerSVG` usages
- `topics` argument from all `getLangConfig` call sites

---

## What Is Unchanged

- `PALETTE` (16-color array) — kept as neutral fallback
- `djb2()` seeding function
- `makePrng()` PRNG factory
- `deriveBannerPalette()` in `color.ts`
- Avatar color extraction in `electron/color-extractor.ts`
- `banner_color` database column and schema
- SVG structure (radial gradient + pattern + avatar + scrim + bottom labels)
- `getLabels()` function (just update call site to pass `seed` only)
- Card/detail size variants
- `repoTypeConfig.ts` accent border colors
- `getLangConfig` export (kept, simplified — no `topics` arg)

---

## Files to Modify

| File | Change |
|---|---|
| `src/components/BannerSVG.tsx` | Replace props, remove bias logic + 10 old patterns, add 6 new patterns + type→pattern lookup, simplify `getLangConfig` |
| `src/components/RepoCard.tsx` | Pass `repoType` to `BannerSVG`, remove `language`/`topics` props |
| `src/views/RepoDetail.tsx` | Call `classifyRepoType(repo)` for `repoType`; update `BannerSVG` call; drop `topics` from `getLangConfig` call |
| `src/views/Collections.tsx` | Pass `repoType="other"` to `BannerSVG`; remove `language`/`topics` |
| `src/views/Library.tsx` | Drop `topics` argument from all 3 `getLangConfig` call sites |
