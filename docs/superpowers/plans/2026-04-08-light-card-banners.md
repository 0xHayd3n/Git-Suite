# Light Card Banners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip card banner SVGs from dark (near-black + bright accents) to light (white-to-pastel gradient + soft pastel patterns), removing the in-banner avatar, monospace labels, and bottom scrim.

**Architecture:** Invert the colour values in `deriveBannerPalette()` and the hardcoded 16-colour `PALETTE`, remove unused SVG elements (avatar, labels, scrim), and update the detail-page overlay CSS from light-on-dark to dark-on-light.

**Tech Stack:** React, SVG, CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-08-light-card-banners-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/utils/color.ts` | Modify | Flip `deriveBannerPalette` to light output, remove `textFaint` |
| `src/components/BannerSVG.tsx` | Modify | Flip hardcoded PALETTE, remove avatar/labels/scrim, bump pattern opacities |
| `src/components/RepoCard.tsx` | Modify | Remove `avatarUrl` prop from `<BannerSVG>` call |
| `src/views/RepoDetail.tsx` | Modify | Remove `avatarUrl` prop from `<BannerSVG>` call, remove dark gradient overlay div, update inline avatar border |
| `src/styles/globals.css` | Modify | Flip `.repo-detail-banner-overlay` CSS vars and `.repo-detail-banner-name`/`-owner`/`-desc` from white-on-dark to dark-on-light |
| `src/components/BannerSVG.test.tsx` | Modify | Update tests: remove avatar-related assertions, add light-palette assertions |

---

### Task 1: Flip `deriveBannerPalette` to light output

**Files:**
- Modify: `src/utils/color.ts:10-27`

- [ ] **Step 1: Write a failing test for the new light palette**

Create `src/utils/color.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveBannerPalette } from './color'

describe('deriveBannerPalette', () => {
  it('produces light background (97% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    // bg should contain 97% — near-white
    expect(palette.bg).toMatch(/97%/)
  })

  it('produces pastel gradientCenter (88% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette.gradientCenter).toMatch(/88%/)
  })

  it('produces muted primary (72% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette.primary).toMatch(/72%/)
  })

  it('produces soft secondary (80% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette.secondary).toMatch(/80%/)
  })

  it('does not return textFaint property', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette).not.toHaveProperty('textFaint')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/color.test.ts`
Expected: FAIL — lightness values don't match (current palette is dark)

- [ ] **Step 3: Update `deriveBannerPalette` to produce light values**

In `src/utils/color.ts`, replace the function body:

```ts
export function deriveBannerPalette(dominant: HSL) {
  const { h, s } = dominant
  const sat = Math.min(Math.max(s, 0.35), 0.85)
  return {
    bg:             `hsl(${h}, ${Math.round(sat * 15)}%, 97%)`,
    gradientCenter: `hsl(${h}, ${Math.round(sat * 30)}%, 88%)`,
    primary:        `hsl(${h}, ${Math.round(sat * 40)}%, 72%)`,
    secondary:      `hsl(${h}, ${Math.round(sat * 35)}%, 80%)`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/color.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/color.ts src/utils/color.test.ts
git commit -m "feat(banner): flip deriveBannerPalette to light output, remove textFaint"
```

---

### Task 2: Flip hardcoded PALETTE in BannerSVG to light values

**Files:**
- Modify: `src/components/BannerSVG.tsx:25-42`

- [ ] **Step 1: Write a failing test for light palette backgrounds**

Add to `src/components/BannerSVG.test.tsx`:

```tsx
it('renders light background fills (no near-black bg)', () => {
  const { container } = render(
    <BannerSVG owner="a" name="b" typeBucket={null} size="card" />
  )
  const rects = container.querySelectorAll('rect')
  const bgRect = rects[0] // first rect is the bg fill
  const fill = bgRect?.getAttribute('fill') ?? ''
  // Should NOT be a dark colour — old palette had #050d12 etc.
  expect(fill).not.toMatch(/^#0[0-9a-f]{5}$/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: FAIL — bg rect fill is still a dark hex like `#050d12`

- [ ] **Step 3: Replace PALETTE with light values**

In `src/components/BannerSVG.tsx`, replace the `PALETTE` array (lines 25-42):

```tsx
const PALETTE: (Omit<LangConfig, 'abbr'> & { tone: string })[] = [
  { bg: '#f0f8fb', primary: 'hsl(193,30%,72%)', secondary: 'hsl(193,25%,80%)', tone: 'hsl(193,25%,82%)' },  //  0 cyan
  { bg: '#f5f2fa', primary: 'hsl(261,30%,72%)', secondary: 'hsl(261,25%,80%)', tone: 'hsl(261,25%,82%)' },  //  1 purple
  { bg: '#faf8f0', primary: 'hsl(48,30%,72%)',  secondary: 'hsl(48,25%,80%)',  tone: 'hsl(48,25%,82%)' },   //  2 yellow
  { bg: '#faf2f2', primary: 'hsl(0,30%,72%)',   secondary: 'hsl(0,25%,80%)',   tone: 'hsl(0,25%,82%)' },    //  3 red
  { bg: '#f0faf3', primary: 'hsl(142,30%,72%)', secondary: 'hsl(142,25%,80%)', tone: 'hsl(142,25%,82%)' },  //  4 green
  { bg: '#f0f6fa', primary: 'hsl(199,30%,72%)', secondary: 'hsl(199,25%,80%)', tone: 'hsl(199,25%,82%)' },  //  5 sky
  { bg: '#faf4f0', primary: 'hsl(24,30%,72%)',  secondary: 'hsl(24,25%,80%)',  tone: 'hsl(24,25%,82%)' },   //  6 orange
  { bg: '#faf0f5', primary: 'hsl(322,30%,72%)', secondary: 'hsl(322,25%,80%)', tone: 'hsl(322,25%,82%)' },  //  7 pink
  { bg: '#f2f2fa', primary: 'hsl(235,30%,72%)', secondary: 'hsl(235,25%,80%)', tone: 'hsl(235,25%,82%)' },  //  8 indigo
  { bg: '#f0faf6', primary: 'hsl(160,30%,72%)', secondary: 'hsl(160,25%,80%)', tone: 'hsl(160,25%,82%)' },  //  9 emerald
  { bg: '#faf6f0', primary: 'hsl(43,30%,72%)',  secondary: 'hsl(43,25%,80%)',  tone: 'hsl(43,25%,82%)' },   // 10 amber
  { bg: '#f8f0fa', primary: 'hsl(293,30%,72%)', secondary: 'hsl(293,25%,80%)', tone: 'hsl(293,25%,82%)' },  // 11 fuchsia
  { bg: '#f0fafa', primary: 'hsl(174,30%,72%)', secondary: 'hsl(174,25%,80%)', tone: 'hsl(174,25%,82%)' },  // 12 teal
  { bg: '#faf3f0', primary: 'hsl(16,30%,72%)',  secondary: 'hsl(16,25%,80%)',  tone: 'hsl(16,25%,82%)' },   // 13 coral
  { bg: '#f2f4fa', primary: 'hsl(213,30%,72%)', secondary: 'hsl(213,25%,80%)', tone: 'hsl(213,25%,82%)' },  // 14 blue
  { bg: '#f5f2fa', primary: 'hsl(277,30%,72%)', secondary: 'hsl(277,25%,80%)', tone: 'hsl(277,25%,82%)' },  // 15 violet
]
```

Also update the avatar-derived tone (line ~303) from:
```tsx
tone: `hsl(${bannerColor!.h}, ${Math.round(sat * 45)}%, 22%)`,
```
to:
```tsx
tone: `hsl(${bannerColor!.h}, ${Math.round(sat * 25)}%, 82%)`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BannerSVG.tsx src/components/BannerSVG.test.tsx
git commit -m "feat(banner): flip hardcoded PALETTE to light pastel values"
```

---

### Task 3: Remove avatar, labels, and scrim from BannerSVG

**Files:**
- Modify: `src/components/BannerSVG.tsx`
- Modify: `src/components/BannerSVG.test.tsx`

- [ ] **Step 1: Write a failing test asserting no `<image>` or `<text>` in output**

Add to `src/components/BannerSVG.test.tsx`:

```tsx
it('does not render avatar image elements', () => {
  const { container } = render(
    <BannerSVG owner="a" name="b" typeBucket={null} size="card" />
  )
  expect(container.querySelectorAll('image')).toHaveLength(0)
})

it('does not render monospace label text elements', () => {
  const { container } = render(
    <BannerSVG owner="a" name="b" typeBucket={null} size="card" />
  )
  expect(container.querySelectorAll('text')).toHaveLength(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: FAIL — avatar/labels may still render (labels always render; avatar only with prop, so the `text` test should fail)

- [ ] **Step 3: Remove avatar, labels, and scrim from BannerSVG**

In `src/components/BannerSVG.tsx`:

1. Remove `avatarUrl` from `BannerSVGProps` interface (line 11)
2. Remove `avatarUrl` from the destructured props (line 289)
3. Remove `GENERIC_LABELS` array (lines 273-282)
4. Remove `getLabels` function (lines 284-286)
5. Remove the `scrimId` linear gradient from `<defs>` (lines 346-349)
6. Remove the `avatarClipId` clip path from `<defs>` (lines 351-355)
7. Remove the `avatarClipId`, `scrimId` variable declarations (lines 315-316)
8. Remove avatar dimension variables `ar`, `ax`, `ay` (lines 319-321)
9. Remove the `labels` and `labelSpacing` variables (lines 328-329)
10. Remove the avatar rendering block: outer glow circle, ring circle, and `<image>` (lines 367-384)
11. Remove the labels `.map(...)` block (lines 387-400)
12. Remove the scrim `<rect>` (line 403)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BannerSVG.tsx src/components/BannerSVG.test.tsx
git commit -m "feat(banner): remove avatar, monospace labels, and bottom scrim"
```

---

### Task 4: Bump pattern fill opacities for light background

**Files:**
- Modify: `src/components/BannerSVG.tsx` (pattern functions, lines 70-260)

- [ ] **Step 1: Update opacity ranges in all 6 pattern generators**

In each pattern function, adjust the `fillOpacity` and `strokeOpacity` values:

| Pattern | Current opacity range | New opacity range |
|---------|----------------------|-------------------|
| `patternDots` (line 83) | `0.1 + rng() * 0.25` | `0.15 + rng() * 0.30` |
| `patternStars` (line 108) | `0.1 + rng() * 0.35` | `0.15 + rng() * 0.35` |
| `patternLayers` (line 137) | `0.15 + rng() * 0.25` | `0.20 + rng() * 0.25` |
| `patternCogs` stroke (line 161) | `opacity` (0.2 + rng() * 0.2) | `0.25 + rng() * 0.20` |
| `patternCogs` fill (line 180) | same `opacity` var | same adjusted var |
| `patternWindows` (line 196) | `0.2 + rng() * 0.15` | `0.25 + rng() * 0.20` |
| `patternBooks` (line 226) | `0.2 + rng() * 0.2` | `0.25 + rng() * 0.20` |
| `patternBooks` pages (line 249) | `opacity * 0.6` | `opacity * 0.6` (unchanged — relative) |

- [ ] **Step 2: Run existing tests to confirm nothing breaks**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/BannerSVG.tsx
git commit -m "feat(banner): bump pattern opacities for light background visibility"
```

---

### Task 5: Remove `avatarUrl` from downstream callers

**Files:**
- Modify: `src/components/RepoCard.tsx:311-316`
- Modify: `src/views/RepoDetail.tsx:899-904`

- [ ] **Step 1: Remove `avatarUrl` prop from RepoCard's BannerSVG call**

In `src/components/RepoCard.tsx`, change lines 311-316 from:

```tsx
<BannerSVG
  owner={repo.owner} name={repo.name}
  typeBucket={typeBucket ?? null}
  size="card" bannerColor={bannerColor}
  avatarUrl={repo.avatar_url}
/>
```

to:

```tsx
<BannerSVG
  owner={repo.owner} name={repo.name}
  typeBucket={typeBucket ?? null}
  size="card" bannerColor={bannerColor}
/>
```

- [ ] **Step 2: Remove `avatarUrl` prop from RepoDetail's BannerSVG call**

In `src/views/RepoDetail.tsx`, change lines 899-904 from:

```tsx
<BannerSVG
  owner={owner ?? ''} name={name ?? ''}
  typeBucket={typeBucket}
  size="detail" bannerColor={bannerColor}
  avatarUrl={repo?.avatar_url}
/>
```

to:

```tsx
<BannerSVG
  owner={owner ?? ''} name={name ?? ''}
  typeBucket={typeBucket}
  size="detail" bannerColor={bannerColor}
/>
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors (the prop no longer exists, no one passes it)

- [ ] **Step 4: Commit**

```bash
git add src/components/RepoCard.tsx src/views/RepoDetail.tsx
git commit -m "feat(banner): remove avatarUrl prop from BannerSVG callers"
```

---

### Task 6: Update RepoDetail banner overlay for light background

**Files:**
- Modify: `src/views/RepoDetail.tsx:906-911` (dark gradient overlay div)
- Modify: `src/views/RepoDetail.tsx:919` (avatar border inline style)
- Modify: `src/styles/globals.css:1410-1430` (banner overlay CSS vars)
- Modify: `src/styles/globals.css:1531-1548` (banner name/owner/desc colours)

- [ ] **Step 1: Remove the dark gradient overlay div in RepoDetail**

In `src/views/RepoDetail.tsx`, delete the div at lines ~905-911:

```tsx
{/* Dark-to-transparent gradient overlay */}
<div style={{
  position: 'absolute', inset: 0,
  background: 'linear-gradient(to bottom, rgba(10,10,14,0) 30%, rgba(10,10,14,0.88) 100%)',
  borderRadius: 'inherit',
  pointerEvents: 'none',
}} />
```

- [ ] **Step 2: Update the avatar border from white to dark**

In `src/views/RepoDetail.tsx`, change the avatar `<img>` border (line ~919) from:

```tsx
border: '1px solid rgba(255,255,255,0.15)'
```

to:

```tsx
border: '1px solid rgba(0,0,0,0.10)'
```

- [ ] **Step 3: Flip `.repo-detail-banner-overlay` CSS vars to dark-on-light**

In `src/styles/globals.css`, update lines ~1421-1429:

```css
.repo-detail-banner-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 22px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  z-index: 2;

  --t1:      rgba(0,0,0,0.88);
  --t2:      rgba(0,0,0,0.60);
  --t3:      rgba(0,0,0,0.38);
  --bg4:     rgba(255,255,255,0.96);
  --border:  rgba(0,0,0,0.08);
  --border2: rgba(0,0,0,0.15);
}
```

- [ ] **Step 4: Flip banner name/owner/desc colours to dark text**

In `src/styles/globals.css`:

`.repo-detail-banner-name` (line ~1531):
```css
.repo-detail-banner-name {
  font-family: 'Inter', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: rgba(0,0,0,0.85);
  text-shadow: none;
  line-height: 1.1;
}
```

`.repo-detail-banner-owner` (line ~1539):
```css
.repo-detail-banner-owner {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(0,0,0,0.60) !important;
}
```

`.repo-detail-banner-desc` (line ~1544):
```css
.repo-detail-banner-desc {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  color: rgba(0,0,0,0.45);
  /* rest unchanged */
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat(banner): update detail overlay to dark-on-light for light banners"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Visual smoke test**

Run: `npm run dev`
Check:
- Card banners show white-to-pastel gradient (not dark)
- Patterns visible as soft pastels
- No avatar image in banners
- No monospace labels at bottom
- No dark scrim
- Detail page banner text is dark and legible on light background
- Detail page banner overlay text (owner, stats) readable

- [ ] **Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix(banner): visual polish adjustments for light banners"
```
