# Repo Type Banner Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `BannerSVG`'s hash-random pattern selection with six bespoke SVG patterns driven by classified repo type, and remove all language/topic color bias.

**Architecture:** All pattern logic lives in `BannerSVG.tsx`. The 10 existing random patterns are deleted and replaced with 6 type-specific functions (`patternLayers`, `patternCogs`, `patternWindows`, `patternBooks`, `patternStars`, `patternDots`) keyed by a `PATTERN_BY_TYPE` record. The `language`/`topics` props are removed from `BannerSVGProps` and replaced with `repoType: RepoType`. Color stays avatar-derived (`bannerColor` → `deriveBannerPalette`) with a plain seed-based fallback; all language/topic bias constants are deleted.

**Tech Stack:** React, TypeScript, SVG, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-04-02-repo-type-banner-patterns-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/components/BannerSVG.tsx` | Modify | Remove bias constants + 10 old patterns; simplify `getLangConfig`/`getLabels`; change props interface; add 6 new patterns + `PATTERN_BY_TYPE` |
| `src/components/BannerSVG.test.tsx` | Create | Tests for `getLangConfig` and per-type rendering |
| `src/components/RepoCard.tsx` | Modify | Pass `repoType` to `BannerSVG`; remove `language`/`topics` |
| `src/views/RepoDetail.tsx` | Modify | Import `classifyRepoType`; derive `repoType`; update `BannerSVG` + `getLangConfig` calls |
| `src/views/Collections.tsx` | Modify | Pass `repoType="other"` to `BannerSVG`; remove `language`/`topics` |
| `src/views/Library.tsx` | Modify | Drop `topics` arg from 3 `getLangConfig` call sites |

---

## Task 1: Create test file with baseline getLangConfig tests

**Files:**
- Create: `src/components/BannerSVG.test.tsx`

- [ ] **Step 1: Write failing tests for `getLangConfig`**

```tsx
// src/components/BannerSVG.test.tsx
import { describe, it, expect } from 'vitest'
import { getLangConfig } from './BannerSVG'

describe('getLangConfig', () => {
  it('returns an object with bg, primary, secondary, abbr fields', () => {
    const cfg = getLangConfig('TypeScript')
    expect(cfg).toHaveProperty('bg')
    expect(cfg).toHaveProperty('primary')
    expect(cfg).toHaveProperty('secondary')
    expect(cfg).toHaveProperty('abbr')
  })

  it('returns deterministic result for same language', () => {
    expect(getLangConfig('Python')).toEqual(getLangConfig('Python'))
  })

  it('uses first two chars as abbr', () => {
    expect(getLangConfig('Rust').abbr).toBe('Ru')
  })

  it('uses em-dash for empty language', () => {
    expect(getLangConfig('').abbr).toBe('—')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails (function signature mismatch — `getLangConfig` currently requires `topics` arg)**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: TypeScript compile error — `getLangConfig` expects 2 arguments

- [ ] **Step 3: Commit the test file as-is (failing is fine — we implement next)**

```bash
git add src/components/BannerSVG.test.tsx
git commit -m "test: add BannerSVG getLangConfig baseline tests"
```

---

## Task 2: Remove bias constants, simplify getLangConfig and getLabels

**Files:**
- Modify: `src/components/BannerSVG.tsx` (lines 45–114, 351–353, 395)
- Modify: `src/views/Library.tsx` (lines 56, 153, 301)
- Modify: `src/views/RepoDetail.tsx` (line 723)

- [ ] **Step 1: In `BannerSVG.tsx`, delete `LANG_BIAS`, `ML_BIAS`, `CLI_BIAS`, and `pickPalette()`**

Delete lines 44–114 (the three bias constants and `pickPalette` function). Keep everything above (the `PALETTE` array, `djb2`, `makePrng`) and everything below (`getLangConfig`).

- [ ] **Step 2: Simplify `getLangConfig` — remove `topics` param, seed from language only**

Replace the existing `getLangConfig` function (currently lines 108–114) with:

```ts
export function getLangConfig(language: string): LangConfig {
  const seed = djb2(language)
  const col = PALETTE[seed % PALETTE.length]
  const abbr = language ? language.slice(0, 2) : '—'
  return { ...col, abbr }
}
```

- [ ] **Step 3: Simplify `getLabels` — remove unused `_language` and `_topics` params**

Replace:
```ts
function getLabels(_language: string, _topics: string[], seed: number): string[] {
  return GENERIC_LABELS[seed % GENERIC_LABELS.length]
}
```
With:
```ts
function getLabels(seed: number): string[] {
  return GENERIC_LABELS[seed % GENERIC_LABELS.length]
}
```

- [ ] **Step 4: Update `getLabels` call site in `BannerSVG` component body**

Find (currently line ~395):
```ts
const labels = getLabels(language, topics, seed)
```
Replace with:
```ts
const labels = getLabels(seed)
```

- [ ] **Step 5: Update `getLangConfig` call sites in `Library.tsx`**

All three call sites (lines 56, 153, 301) currently pass `parseTopics(row.topics)` as the second arg. Remove it:

```ts
// Before (each site)
const cfg = getLangConfig(lang, parseTopics(row.topics))
// After
const cfg = getLangConfig(lang)
```

- [ ] **Step 6: Update `getLangConfig` call site in `RepoDetail.tsx`**

Line 723:
```ts
// Before
const cfg = getLangConfig(repo?.language ?? '', topics)
// After
const cfg = getLangConfig(repo?.language ?? '')
```

- [ ] **Step 7: Run the getLangConfig tests — they should now pass**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: All 4 tests PASS

- [ ] **Step 8: Run full test suite to catch any broken call sites**

Run: `npx vitest run`
Expected: All tests pass (TypeScript should be happy — no remaining `topics` arg passed to `getLangConfig`)

- [ ] **Step 9: Commit**

```bash
git add src/components/BannerSVG.tsx src/views/Library.tsx src/views/RepoDetail.tsx
git commit -m "refactor: remove language/topic bias from BannerSVG, simplify getLangConfig and getLabels"
```

---

## Task 3: Update BannerSVGProps — add repoType, remove language/topics

**Files:**
- Modify: `src/components/BannerSVG.tsx` (props interface + component signature)
- Modify: `src/components/RepoCard.tsx`
- Modify: `src/views/RepoDetail.tsx`
- Modify: `src/views/Collections.tsx`

- [ ] **Step 1: Add import of `RepoType` to `BannerSVG.tsx`**

At the top of `BannerSVG.tsx`, add:
```ts
import { type RepoType } from '../lib/classifyRepoType'
```

- [ ] **Step 2: Update `BannerSVGProps` interface**

Replace:
```ts
export interface BannerSVGProps {
  owner: string
  name: string
  language: string
  topics: string[]
  size: 'card' | 'detail'
  bannerColor?: HSL | null
  avatarUrl?: string | null
}
```
With:
```ts
export interface BannerSVGProps {
  owner: string
  name: string
  repoType: RepoType
  size: 'card' | 'detail'
  bannerColor?: HSL | null
  avatarUrl?: string | null
}
```

- [ ] **Step 3: Update the component function signature**

Replace:
```ts
export default function BannerSVG({ owner, name, language, topics, size, bannerColor, avatarUrl }: BannerSVGProps) {
```
With:
```ts
export default function BannerSVG({ owner, name, repoType, size, bannerColor, avatarUrl }: BannerSVGProps) {
```

- [ ] **Step 4: Update `RepoCard.tsx` — pass repoType, remove language/topics**

Find the `<BannerSVG` call in `RepoCard.tsx` (around line 327). Remove the `language` and `topics` props and add `repoType`:

```tsx
// Before
<BannerSVG
  owner={...}
  name={...}
  language={repo.language ?? ''}
  topics={parseTopics(repo.topics)}
  size="card"
  bannerColor={bannerColor}
  avatarUrl={repo.avatar_url}
/>

// After
<BannerSVG
  owner={...}
  name={...}
  repoType={repoType}
  size="card"
  bannerColor={bannerColor}
  avatarUrl={repo.avatar_url}
/>
```

(`repoType` is already available in `RepoCard` for the accent border — no new prop threading needed.)

- [ ] **Step 5: Update `RepoDetail.tsx` — add classifyRepoType import, derive repoType, update BannerSVG call**

Add import near the top of `RepoDetail.tsx`:
```ts
import { classifyRepoType, type RepoType } from '../lib/classifyRepoType'
```

In the component body, derive `repoType` near the other derived values (around line 721):
```ts
const repoType: RepoType = repo ? classifyRepoType(repo) : 'other'
```

Update the `<BannerSVG` call (around line 779):
```tsx
// Before
<BannerSVG
  owner={owner ?? ''} name={name ?? ''}
  language={repo?.language ?? ''} topics={topics}
  size="detail" bannerColor={bannerColor}
  avatarUrl={repo?.avatar_url}
/>

// After
<BannerSVG
  owner={owner ?? ''} name={name ?? ''}
  repoType={repoType}
  size="detail" bannerColor={bannerColor}
  avatarUrl={repo?.avatar_url}
/>
```

- [ ] **Step 6: Update `Collections.tsx` — pass repoType="other", remove language/topics**

Find the `<BannerSVG` call in `Collections.tsx` (around line 244):
```tsx
// Before
<BannerSVG
  owner={coll.owner}
  name={coll.name}
  language={langs[0] ?? ''}
  topics={[]}
  size="detail"
/>

// After
<BannerSVG
  owner={coll.owner}
  name={coll.name}
  repoType="other"
  size="detail"
/>
```

- [ ] **Step 7: Run full test suite — TypeScript should be satisfied at all call sites**

Run: `npx vitest run`
Expected: All tests pass, no TypeScript errors. The old `ALL_PATTERNS` dispatch is still in place and still compiles — it is not removed until Task 4.

- [ ] **Step 8: Commit**

```bash
git add src/components/BannerSVG.tsx src/components/RepoCard.tsx src/views/RepoDetail.tsx src/views/Collections.tsx
git commit -m "refactor: replace language/topics props with repoType in BannerSVG"
```

---

## Task 4: Write the 6 new pattern functions

**Files:**
- Modify: `src/components/BannerSVG.tsx` — add 6 pattern functions, replace `ALL_PATTERNS` with `PATTERN_BY_TYPE`

All patterns have this signature:
```ts
type PatternFn = (rng: Rng, w: number, h: number, tone: string) => React.ReactNode[]
```

All use `tone` (dark mid-tone) for fill/stroke — never `primary` or `secondary` directly.

- [ ] **Step 1: Delete the 10 old pattern functions and `ALL_PATTERNS`**

Delete everything from `// ── Pattern generators ──` down through `const ALL_PATTERNS: PatternFn[] = [...]` (lines 116–336 approximately). **Important:** `type Rng = () => number` is declared on line 117 inside this block — do NOT delete it. Keep it in place (or move it just above the new `PatternFn` type). The six new pattern functions reference `Rng` in their signatures and will fail to compile without it.

Replace the old `PatternFn` type with the new 4-arg signature:
```ts
type Rng = () => number   // keep this
type PatternFn = (rng: Rng, w: number, h: number, tone: string) => React.ReactNode[]
```

- [ ] **Step 2: Write `patternDots` (other)**

```ts
function patternDots(rng: Rng, w: number, h: number, tone: string): React.ReactNode[] {
  const count = 14 + Math.floor(rng() * 7)
  const dots: React.ReactNode[] = []
  for (let i = 0; i < count; i++) {
    const r = 2 + rng() * 3
    dots.push(
      <circle
        key={`d${i}`}
        cx={rng() * w}
        cy={rng() * h * 0.9}
        r={r}
        fill={tone}
        fillOpacity={0.1 + rng() * 0.25}
      />
    )
  }
  return dots
}
```

- [ ] **Step 3: Write `patternStars` (awesome-list)**

```ts
function patternStars(rng: Rng, w: number, h: number, tone: string): React.ReactNode[] {
  const count = 10 + Math.floor(rng() * 6)
  const stars: React.ReactNode[] = []
  for (let i = 0; i < count; i++) {
    const cx = rng() * w
    const cy = rng() * h * 0.9
    const outerR = 5 + rng() * 11
    const innerR = outerR * 0.4
    const rotation = rng() * 72
    const pts = Array.from({ length: 10 }, (_, k) => {
      const angle = (k / 10) * Math.PI * 2 - Math.PI / 2 + (rotation * Math.PI / 180)
      const r = k % 2 === 0 ? outerR : innerR
      return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
    }).join(' ')
    stars.push(
      <polygon
        key={`s${i}`}
        points={pts}
        fill={tone}
        fillOpacity={0.1 + rng() * 0.35}
      />
    )
  }
  return stars
}
```

- [ ] **Step 4: Write `patternLayers` (framework)**

```ts
function patternLayers(rng: Rng, w: number, h: number, tone: string): React.ReactNode[] {
  const count = 4 + Math.floor(rng() * 3)
  const layers: React.ReactNode[] = []
  const barH = 6 + rng() * 4
  const totalSpan = h * 0.7
  const spacing = totalSpan / count
  const topOffset = h * 0.1
  for (let i = 0; i < count; i++) {
    // Each bar is narrower than the one above (top bar widest)
    const widthFraction = 0.95 - i * (0.1 + rng() * 0.05)
    const barW = w * Math.max(widthFraction, 0.5)
    const y = topOffset + i * spacing + (rng() - 0.5) * 4
    layers.push(
      <rect
        key={`l${i}`}
        x={0}
        y={y}
        width={barW}
        height={barH}
        rx={2}
        fill={tone}
        fillOpacity={0.15 + rng() * 0.25}
      />
    )
  }
  return layers
}
```

- [ ] **Step 5: Write `patternCogs` (tool)**

```ts
function patternCogs(rng: Rng, w: number, h: number, tone: string): React.ReactNode[] {
  const count = 3 + Math.floor(rng() * 3)
  const cogs: React.ReactNode[] = []
  const TEETH = 8
  for (let i = 0; i < count; i++) {
    const cx = rng() * w
    const cy = rng() * h * 0.85
    const r = 10 + rng() * 14
    const toothLen = r * 0.30
    const rotation = rng() * 360
    const opacity = 0.2 + rng() * 0.2

    // Hub circle
    cogs.push(
      <circle
        key={`ch${i}`}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={tone}
        strokeWidth={0.6}
        strokeOpacity={opacity}
        transform={`rotate(${rotation}, ${cx}, ${cy})`}
      />
    )
    // Teeth: evenly-spaced radial rectangles
    for (let t = 0; t < TEETH; t++) {
      const angle = (t / TEETH) * 2 * Math.PI
      const tx = cx + Math.cos(angle) * r
      const ty = cy + Math.sin(angle) * r
      const deg = (angle * 180) / Math.PI
      cogs.push(
        <rect
          key={`ct${i}-${t}`}
          x={tx - 1}
          y={ty - toothLen / 2}
          width={2}
          height={toothLen}
          fill={tone}
          fillOpacity={opacity}
          transform={`rotate(${deg + rotation + 90}, ${tx}, ${ty})`}
        />
      )
    }
  }
  return cogs
}
```

- [ ] **Step 6: Write `patternWindows` (application)**

```ts
function patternWindows(rng: Rng, w: number, h: number, tone: string): React.ReactNode[] {
  const count = 3 + Math.floor(rng() * 2)
  const windows: React.ReactNode[] = []
  for (let i = 0; i < count; i++) {
    const winW = 50 + rng() * 40
    const contentH = 16 + rng() * 12
    const titleH = 6
    const x = rng() * (w - winW)
    const y = rng() * (h * 0.75 - contentH - titleH)
    const opacity = 0.2 + rng() * 0.15

    // Titlebar
    windows.push(
      <rect key={`wt${i}`} x={x} y={y} width={winW} height={titleH}
        fill="none" stroke={tone} strokeWidth={0.5} strokeOpacity={opacity} rx={1} />
    )
    // Content area
    windows.push(
      <rect key={`wc${i}`} x={x} y={y + titleH} width={winW} height={contentH}
        fill="none" stroke={tone} strokeWidth={0.5} strokeOpacity={opacity} />
    )
    // Traffic-light dots
    for (let d = 0; d < 3; d++) {
      windows.push(
        <circle key={`wd${i}-${d}`}
          cx={x + 5 + d * 5} cy={y + 3} r={1.5}
          fill={tone} fillOpacity={opacity} />
      )
    }
  }
  return windows
}
```

- [ ] **Step 7: Write `patternBooks` (learning)**

```ts
function patternBooks(rng: Rng, w: number, h: number, tone: string): React.ReactNode[] {
  const count = 3 + Math.floor(rng() * 3)
  const books: React.ReactNode[] = []
  for (let i = 0; i < count; i++) {
    const cx = rng() * w
    const cy = rng() * h * 0.8
    const halfW = 10 + rng() * 10  // half-spine width
    const bookH = 15 + rng() * 15
    const rotation = (rng() - 0.5) * 20
    const opacity = 0.2 + rng() * 0.2
    const pageCount = 2 + Math.floor(rng() * 2)

    const transform = `rotate(${rotation}, ${cx}, ${cy})`

    // Outer left arc (spine to top-left)
    books.push(
      <path key={`bo${i}-l`}
        d={`M ${cx} ${cy} Q ${cx - halfW * 1.2} ${cy - bookH * 0.6} ${cx - halfW} ${cy - bookH}`}
        fill="none" stroke={tone} strokeWidth={0.6} strokeOpacity={opacity}
        transform={transform} />
    )
    // Outer right arc (spine to top-right)
    books.push(
      <path key={`bo${i}-r`}
        d={`M ${cx} ${cy} Q ${cx + halfW * 1.2} ${cy - bookH * 0.6} ${cx + halfW} ${cy - bookH}`}
        fill="none" stroke={tone} strokeWidth={0.6} strokeOpacity={opacity}
        transform={transform} />
    )
    // Inner page arcs
    for (let p = 0; p < pageCount; p++) {
      const t = (p + 1) / (pageCount + 1)
      books.push(
        <path key={`bp${i}-${p}`}
          d={`M ${cx} ${cy} Q ${cx - halfW * 0.9 * t} ${cy - bookH * 0.5 * t} ${cx - halfW * t} ${cy - bookH * t}`}
          fill="none" stroke={tone} strokeWidth={0.4} strokeOpacity={opacity * 0.6}
          transform={transform} />
      )
      books.push(
        <path key={`bpr${i}-${p}`}
          d={`M ${cx} ${cy} Q ${cx + halfW * 0.9 * t} ${cy - bookH * 0.5 * t} ${cx + halfW * t} ${cy - bookH * t}`}
          fill="none" stroke={tone} strokeWidth={0.4} strokeOpacity={opacity * 0.6}
          transform={transform} />
      )
    }
  }
  return books
}
```

- [ ] **Step 8: Add `PATTERN_BY_TYPE` lookup and update the dispatch**

After all 6 pattern functions, add:

```ts
const PATTERN_BY_TYPE: Record<RepoType, PatternFn> = {
  'framework':    patternLayers,
  'tool':         patternCogs,
  'application':  patternWindows,
  'learning':     patternBooks,
  'awesome-list': patternStars,
  'other':        patternDots,
}
```

In the component body, replace the old dispatch:
```ts
// Old — delete these two lines
const patternIdx = seed % ALL_PATTERNS.length
const pattern = ALL_PATTERNS[patternIdx](rng, w, h, col.tone, col.tone)
```
With:
```ts
const pattern = PATTERN_BY_TYPE[repoType](rng, w, h, col.tone)
```

- [ ] **Step 9: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass, no TypeScript errors

- [ ] **Step 10: Commit**

```bash
git add src/components/BannerSVG.tsx
git commit -m "feat: add 6 repo-type-driven SVG patterns, replace hash-random selection"
```

---

## Task 5: Add per-type rendering tests

**Files:**
- Modify: `src/components/BannerSVG.test.tsx`

- [ ] **Step 1: Add render tests for each repo type**

Add to `src/components/BannerSVG.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import BannerSVG from './BannerSVG'
import type { RepoType } from '../lib/classifyRepoType'

const ALL_TYPES: RepoType[] = ['framework', 'tool', 'application', 'learning', 'awesome-list', 'other']

describe('BannerSVG', () => {
  it.each(ALL_TYPES)('renders without error for repoType=%s', (repoType) => {
    expect(() =>
      render(
        <BannerSVG
          owner="testowner"
          name="testrepo"
          repoType={repoType}
          size="card"
        />
      )
    ).not.toThrow()
  })

  it.each(ALL_TYPES)('renders an SVG for repoType=%s', (repoType) => {
    const { container } = render(
      <BannerSVG
        owner="testowner"
        name="testrepo"
        repoType={repoType}
        size="card"
      />
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders detail size', () => {
    const { container } = render(
      <BannerSVG owner="a" name="b" repoType="other" size="detail" />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 175')
  })

  it('renders card size', () => {
    const { container } = render(
      <BannerSVG owner="a" name="b" repoType="other" size="card" />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 260 72')
  })

  it('produces different SVG content for different repo types', () => {
    const renderType = (t: RepoType) =>
      render(<BannerSVG owner="a" name="b" repoType={t} size="card" />).container.innerHTML

    const frameworks = renderType('framework')
    const tools = renderType('tool')
    expect(frameworks).not.toEqual(tools)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/components/BannerSVG.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/BannerSVG.test.tsx
git commit -m "test: add per-type rendering tests for BannerSVG"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full test suite one more time**

Run: `npx vitest run`
Expected: All tests pass with no TypeScript errors

- [ ] **Step 2: Build to confirm no compile errors**

Run: `npm run build`
Expected: Clean compile

- [ ] **Step 3: Manual smoke test**

Launch the app (`npm run dev` or Electron dev command). Open the Discover view and verify:
- Framework repos show horizontal layered bars
- Tool repos show cog shapes
- Application repos show window chrome
- Learning repos show open-book arcs
- Awesome-list repos show star field
- Other repos show plain dots
- Colors are still avatar-derived (not uniform per type)

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -p
git commit -m "fix: <describe any fixup>"
```
