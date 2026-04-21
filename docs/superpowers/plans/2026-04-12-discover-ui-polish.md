# Discover UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five UI issues in the Discover view — integrate the orphan LayoutDropdown into SmartBar, make SmartBar background transparent, fix stretched dither images, remove featured card spanning, and darken the card info glass effect.

**Architecture:** Each change is independent and touches different files/concerns, so they can be implemented in any order. CSS-only changes are grouped together. Component changes are separate tasks.

**Tech Stack:** React, TypeScript, CSS, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-04-12-discover-ui-polish-design.md`

---

### Task 1: Integrate LayoutDropdown into SmartBar

**Files:**
- Modify: `src/components/SmartBar.tsx`
- Modify: `src/views/Discover.tsx:860-894`
- Modify: `src/components/SmartBar.test.tsx`

- [ ] **Step 1: Update SmartBar to accept layout props and render LayoutDropdown**

In `src/components/SmartBar.tsx`:

1. Add import for `LayoutDropdown` and its types:
```tsx
import LayoutDropdown from './LayoutDropdown'
import type { LayoutPrefs } from './LayoutDropdown'
```

2. Replace the `onLayoutClick` prop with `layoutPrefs` and `onLayoutChange` in the interface:
```tsx
interface SmartBarProps {
  query: string
  onQueryChange: (q: string) => void
  activeBucket: string | null
  onBucketChange: (bucketId: string | null) => void
  selectedSubTypes: string[]
  onSubTypeChange: (ids: string[]) => void
  viewMode: ViewModeKey
  onViewModeChange: (key: ViewModeKey) => void
  onFilterClick: () => void
  layoutPrefs: LayoutPrefs
  onLayoutChange: (prefs: LayoutPrefs) => void
  inputRef?: React.Ref<HTMLInputElement>
}
```

3. Update the destructured props (remove `onLayoutClick`, add `layoutPrefs`, `onLayoutChange`).

4. Replace the plain layout button (lines 101-103):
```tsx
<button className="smart-bar-action-btn" onClick={onLayoutClick} title="Layout">
  <LayoutGrid size={14} />
</button>
```
with:
```tsx
<LayoutDropdown prefs={layoutPrefs} onChange={onLayoutChange} />
```

5. Remove the `LayoutGrid` import from lucide-react (keep `Search` and `SlidersHorizontal`).

- [ ] **Step 2: Update Discover.tsx to pass layout props to SmartBar and remove standalone LayoutDropdown**

In `src/views/Discover.tsx`:

1. Remove the standalone `<LayoutDropdown>` at line 894.

2. Update the `<SmartBar>` call (lines 860-872) — remove `onLayoutClick={() => {}}` and add the layout props:
```tsx
<SmartBar
  query={contextQuery}
  onQueryChange={setContextQuery}
  activeBucket={activeBucket}
  onBucketChange={handleBucketChange}
  selectedSubTypes={selectedTypes}
  onSubTypeChange={setSelectedTypes}
  viewMode={viewMode ?? 'recommended'}
  onViewModeChange={setViewMode}
  onFilterClick={() => setFilterDropdownOpen(o => !o)}
  layoutPrefs={layoutPrefs}
  onLayoutChange={handleLayoutChange}
  inputRef={discoverInputRef}
/>
```

3. Remove the `LayoutDropdown` import from Discover.tsx if it's no longer used directly (keep the type imports `LayoutPrefs`, `LAYOUT_STORAGE_KEY`, `DEFAULT_LAYOUT_PREFS` if still needed).

- [ ] **Step 3: Update SmartBar tests**

In `src/components/SmartBar.test.tsx`:

1. Update `baseProps` — remove `onLayoutClick`, add layout props:
```tsx
import { DEFAULT_LAYOUT_PREFS } from './LayoutDropdown'

const baseProps = {
  query: '',
  onQueryChange: vi.fn(),
  activeBucket: null,
  onBucketChange: vi.fn(),
  selectedSubTypes: [],
  onSubTypeChange: vi.fn(),
  viewMode: 'recommended' as ViewModeKey,
  onViewModeChange: vi.fn(),
  onFilterClick: vi.fn(),
  layoutPrefs: DEFAULT_LAYOUT_PREFS,
  onLayoutChange: vi.fn(),
}
```

2. Remove any test that clicks the layout button and asserts `onLayoutClick` was called (if one exists). The LayoutDropdown has its own test file.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/SmartBar.test.tsx src/views/Discover.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SmartBar.tsx src/views/Discover.tsx src/components/SmartBar.test.tsx
git commit -m "feat: integrate LayoutDropdown into SmartBar, remove orphan instance"
```

---

### Task 2: CSS changes — transparent SmartBar, darker card glass, remove featured styles

**Files:**
- Modify: `src/styles/globals.css:7747` (SmartBar background)
- Modify: `src/styles/globals.css:1456` (repo-card-info glass)
- Modify: `src/styles/globals.css:8949-8962` (featured card styles)

- [ ] **Step 1: Make SmartBar background transparent**

In `src/styles/globals.css`, at line 7747, change:
```css
background: rgba(255, 255, 255, 0.02);
```
to:
```css
background: transparent;
```

Keep the `border-bottom: 1px solid var(--border);` on line 7746.

- [ ] **Step 2: Add dark glass effect to `.repo-card-info`**

In `src/styles/globals.css`, at line 1456, change:
```css
.repo-card-info { padding: 9px 9px 8px; }
```
to:
```css
.repo-card-info { padding: 9px 9px 8px; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
```

- [ ] **Step 3: Remove featured card CSS rules**

In `src/styles/globals.css`, delete lines 8949-8962 (the entire `.repo-card-featured` block):
```css
.repo-card-featured .repo-card-desc {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
}

.repo-card-featured .repo-card-dither {
  height: 65px !important;
}

.repo-card-featured .repo-card-tag,
.repo-card-featured .repo-card-owner,
.repo-card-featured .repo-card-stats span {
  display: inline !important;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: transparent SmartBar, darker card glass, remove featured card styles"
```

---

### Task 3: Fix stretched dithered backgrounds

**Files:**
- Modify: `src/hooks/useBayerDither.ts:148-150`
- Modify: `src/hooks/useBayerDither.test.ts`

- [ ] **Step 1: Write test for aspect ratio correction helper**

The cover-style correction logic should be extracted as a pure exported function so it can be unit tested. In `src/hooks/useBayerDither.test.ts`, add:

```ts
import { rgbToHsl, hslToRgb, BAYER8, coverUV } from './useBayerDither'

describe('coverUV', () => {
  it('returns u,v unchanged when aspects match (square into square)', () => {
    const result = coverUV(0.25, 0.75, 100, 100, 100, 100)
    expect(result.u).toBeCloseTo(0.25)
    expect(result.v).toBeCloseTo(0.75)
  })

  it('compresses v range when output is wider than source', () => {
    // 400x100 output (aspect 4) from 100x100 source (aspect 1)
    // v should be compressed toward 0.5
    const result = coverUV(0.5, 0.0, 100, 100, 400, 100)
    expect(result.u).toBeCloseTo(0.5)
    expect(result.v).toBeCloseTo(0.5 + (0.0 - 0.5) * (1 / 4))
    // = 0.5 + (-0.5) * 0.25 = 0.375
    expect(result.v).toBeCloseTo(0.375)
  })

  it('compresses u range when output is taller than source', () => {
    // 100x400 output (aspect 0.25) from 100x100 source (aspect 1)
    // u should be compressed toward 0.5
    const result = coverUV(0.0, 0.5, 100, 100, 100, 400)
    expect(result.u).toBeCloseTo(0.5 + (0.0 - 0.5) * (1 / 4))
    expect(result.u).toBeCloseTo(0.375)
    expect(result.v).toBeCloseTo(0.5)
  })

  it('center point stays centered regardless of aspect', () => {
    const result = coverUV(0.5, 0.5, 200, 200, 600, 100)
    expect(result.u).toBeCloseTo(0.5)
    expect(result.v).toBeCloseTo(0.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useBayerDither.test.ts`
Expected: FAIL — `coverUV` is not exported / doesn't exist.

- [ ] **Step 3: Implement coverUV and apply it in renderCamera**

In `src/hooks/useBayerDither.ts`:

1. Add the exported helper function (place it after the `hslToRgb` function, before the Camera definitions):
```ts
// ── Cover-style aspect ratio correction ─────────────────────────
export function coverUV(
  u: number, v: number,
  imgW: number, imgH: number,
  outW: number, outH: number,
): { u: number; v: number } {
  const srcAspect = imgW / imgH
  const outAspect = outW / outH
  if (outAspect > srcAspect) {
    // Output is wider than source — compress v toward center
    v = 0.5 + (v - 0.5) * (srcAspect / outAspect)
  } else if (outAspect < srcAspect) {
    // Output is taller than source — compress u toward center
    u = 0.5 + (u - 0.5) * (outAspect / srcAspect)
  }
  return { u, v }
}
```

2. In `renderCamera`, after line 148 (`const { u, v } = camera.sample(...)`) and before line 150 (the bounds check), apply the correction. Replace:
```ts
      const { u, v } = camera.sample(x / w, y / h, t)

      if (u < 0 || u > 1 || v < 0 || v > 1) {
```
with:
```ts
      const raw = camera.sample(x / w, y / h, t)
      const { u, v } = coverUV(raw.u, raw.v, imgW, imgH, w, h)

      if (u < 0 || u > 1 || v < 0 || v > 1) {
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/useBayerDither.test.ts`
Expected: All tests pass (existing + new `coverUV` tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBayerDither.ts src/hooks/useBayerDither.test.ts
git commit -m "fix: apply cover-style aspect correction to dither backgrounds"
```

---

### Task 4: Remove featured card spanning for uniform sizing

**Files:**
- Modify: `src/components/DiscoverGrid.tsx:153-178`

- [ ] **Step 1: Remove featured card logic from DiscoverGrid**

In `src/components/DiscoverGrid.tsx`, replace the grid-mode map block (lines 153-195):
```tsx
      {visibleRepos.map((repo, i) => {
        const featuredCount = (layoutPrefs.columns >= 6) ? 3 : 2
        const isFeatured = viewMode === 'recommended' && i < featuredCount
        if (isFeatured) {
          return (
            <div
              key={repo.id ?? `${repo.owner}/${repo.name}`}
              style={{ gridColumn: 'span 2' }}
              className="repo-card-featured"
            >
              <RepoCard
                repo={repo}
                viewMode={viewMode}
                onNavigate={onNavigate}
                onTagClick={onTagClick}
                onOwnerClick={onOwnerClick}
                typeSub={repo.type_sub}
                typeBucket={repo.type_bucket}
                verificationTier={verification.getTier(repo.id)}
                verificationSignals={verification.getSignals(repo.id)}
                verificationResolving={verification.isResolving(repo.id)}
                focused={i === focusIndex}
              />
            </div>
          )
        }
        return (
          <RepoCard
            key={repo.id ?? `${repo.owner}/${repo.name}`}
            repo={repo}
            viewMode={viewMode}
            onNavigate={onNavigate}
            onTagClick={onTagClick}
            onOwnerClick={onOwnerClick}
            typeSub={repo.type_sub}
            typeBucket={repo.type_bucket}
            verificationTier={verification.getTier(repo.id)}
            verificationSignals={verification.getSignals(repo.id)}
            verificationResolving={verification.isResolving(repo.id)}
            focused={i === focusIndex}
          />
        )
      })}
```

with the simplified version (no featured branch):
```tsx
      {visibleRepos.map((repo, i) => (
        <RepoCard
          key={repo.id ?? `${repo.owner}/${repo.name}`}
          repo={repo}
          viewMode={viewMode}
          onNavigate={onNavigate}
          onTagClick={onTagClick}
          onOwnerClick={onOwnerClick}
          typeSub={repo.type_sub}
          typeBucket={repo.type_bucket}
          verificationTier={verification.getTier(repo.id)}
          verificationSignals={verification.getSignals(repo.id)}
          verificationResolving={verification.isResolving(repo.id)}
          focused={i === focusIndex}
        />
      ))}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/views/Discover.test.tsx`
Expected: All tests pass. (No dedicated DiscoverGrid test file exists; Discover.test.tsx exercises it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/DiscoverGrid.tsx
git commit -m "refactor: remove featured card spanning for uniform grid sizing"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass with no regressions.

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: No type errors.
