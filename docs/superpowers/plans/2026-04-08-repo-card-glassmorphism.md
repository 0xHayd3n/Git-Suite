# Repo Card Glassmorphism Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat banner-over-body repo card layout with a full-bleed gradient background, SVG crosshatch dithering, translucent avatar watermark, and a floating glassmorphic content panel.

**Architecture:** The card's JSX structure changes from `[banner div][body div]` to `[full-bleed bg layer][glass panel]`. A new `DitherBackground` component renders the gradient + SVG patterns + avatar watermark. The glass panel replaces `.repo-card-body` with new CSS. Bucket gradients are stored as a hard-coded lookup in `repoTypeConfig.ts`.

**Tech Stack:** React, CSS (globals.css), inline SVG patterns, Electron/Chromium `backdrop-filter`

**Spec:** `docs/superpowers/specs/2026-04-08-repo-card-glassmorphism-redesign.md`

---

## File Map

| File | Role | Action |
|------|------|--------|
| `src/config/repoTypeConfig.ts` | Bucket gradient lookup | Modify — add `BUCKET_GRADIENTS` map and `getBucketGradient()` |
| `src/components/DitherBackground.tsx` | SVG dither + gradient + avatar watermark | Create |
| `src/components/RepoCard.tsx` | Card layout and content | Modify — replace banner/body with bg layer + glass panel |
| `src/components/ProfileOverlay.tsx` | Skeleton grid uses `repo-card-body` | Modify — change to `repo-card-panel` |
| `src/styles/globals.css` | Card CSS classes | Modify — restyle for glassmorphism |

---

### Task 1: Add bucket gradient lookup to repoTypeConfig

**Files:**
- Modify: `src/config/repoTypeConfig.ts`

- [ ] **Step 1: Add `BUCKET_GRADIENTS` map and `getBucketGradient` function**

Add after the existing `BUCKET_COLOR_MAP` (line 32):

```typescript
// Bucket gradient mapping — each bucket hex → [darkStop, lightStop]
const BUCKET_GRADIENTS = new Map<string, [string, string]>([
  ['#3b82f6', ['#2563eb', '#0ea5e9']],  // Dev Tools
  ['#06b6d4', ['#0891b2', '#22d3ee']],  // Frameworks
  ['#8b5cf6', ['#7c3aed', '#a855f7']],  // AI & ML
  ['#f97316', ['#ea580c', '#fb923c']],  // Learning
  ['#14b8a6', ['#0d9488', '#2dd4bf']],  // Editors & IDEs
  ['#f59e0b', ['#d97706', '#fbbf24']],  // Lang Projects
  ['#ef4444', ['#dc2626', '#f87171']],  // Infrastructure
  ['#6b7280', ['#4b5563', '#9ca3af']],  // Utilities
])

export function getBucketGradient(bucketColor: string | null | undefined): [string, string] {
  if (!bucketColor) return ['#4b5563', '#9ca3af']
  return BUCKET_GRADIENTS.get(bucketColor) ?? ['#4b5563', '#9ca3af']
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/config/repoTypeConfig.ts
git commit -m "feat(card): add bucket gradient lookup for glassmorphism cards"
```

---

### Task 2: Create DitherBackground component

**Files:**
- Create: `src/components/DitherBackground.tsx`

- [ ] **Step 1: Create the component**

This component renders the full-bleed background layer: gradient, 6 SVG dither patterns, and the avatar watermark image.

```tsx
import { memo, useId } from 'react'

interface DitherBackgroundProps {
  gradient: [string, string]
  avatarUrl?: string | null
  ownerName: string
}

/**
 * Hex colour → rgba string at given alpha.
 * Accepts #rrggbb or #rgb.
 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const DitherBackground = memo(function DitherBackground({
  gradient,
  avatarUrl,
  ownerName,
}: DitherBackgroundProps) {
  // useId() generates a unique ID per component instance, preventing
  // SVG pattern ID collisions when multiple cards render on the same page.
  const uid = useId()
  const pid = (name: string) => `${name}-${uid}`

  const [stop1, stop2] = gradient
  // Derive dither colours from the darker gradient stop
  const d = stop1

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${stop1} 0%, ${stop2} 100%)`,
      }}
    >
      {/* SVG dither overlay */}
      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        width="100%"
        height="100%"
      >
        <defs>
          {/* Diagonal lines (top-left → bottom-right) */}
          <pattern id={pid('d1')} width="5" height="5" patternUnits="userSpaceOnUse">
            <line x1="0" y1="5" x2="5" y2="0" stroke={hexToRgba(d, 0.2)} strokeWidth="0.5" />
          </pattern>
          {/* Diagonal lines (opposite) */}
          <pattern id={pid('d2')} width="5" height="5" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="5" y2="5" stroke={hexToRgba(d, 0.16)} strokeWidth="0.5" />
          </pattern>
          {/* Horizontal accent lines */}
          <pattern id={pid('h')} width="7" height="7" patternUnits="userSpaceOnUse">
            <line x1="0" y1="3.5" x2="7" y2="3.5" stroke={hexToRgba(d, 0.1)} strokeWidth="0.4" />
          </pattern>
          {/* Dense crosshatch clusters */}
          <pattern id={pid('cl')} width="12" height="12" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="3" y2="3" stroke={hexToRgba(d, 0.25)} strokeWidth="0.6" />
            <line x1="3" y1="0" x2="0" y2="3" stroke={hexToRgba(d, 0.25)} strokeWidth="0.6" />
            <line x1="6" y1="6" x2="9" y2="9" stroke={hexToRgba(d, 0.18)} strokeWidth="0.5" />
            <line x1="9" y1="6" x2="6" y2="9" stroke={hexToRgba(d, 0.18)} strokeWidth="0.5" />
          </pattern>
          {/* Tonal blobs */}
          <radialGradient id={pid('t1')} cx="20%" cy="25%" r="45%">
            <stop offset="0%" stopColor={hexToRgba(d, 0.15)} />
            <stop offset="100%" stopColor={hexToRgba(d, 0)} />
          </radialGradient>
          <radialGradient id={pid('t2')} cx="80%" cy="70%" r="40%">
            <stop offset="0%" stopColor={hexToRgba(d, 0.12)} />
            <stop offset="100%" stopColor={hexToRgba(d, 0)} />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pid('d1')})`} />
        <rect width="100%" height="100%" fill={`url(#${pid('d2')})`} />
        <rect width="100%" height="100%" fill={`url(#${pid('h')})`} />
        <rect width="100%" height="100%" fill={`url(#${pid('cl')})`} />
        <rect width="100%" height="100%" fill={`url(#${pid('t1')})`} />
        <rect width="100%" height="100%" fill={`url(#${pid('t2')})`} />
      </svg>

      {/* Avatar watermark */}
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={ownerName}
          style={{
            position: 'absolute',
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -55%)',
            width: 180,
            height: 180,
            borderRadius: '50%',
            objectFit: 'cover',
            opacity: 0.35,
            filter: 'blur(1px)',
          }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
    </div>
  )
})

export default DitherBackground
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/DitherBackground.tsx
git commit -m "feat(card): create DitherBackground component for glassmorphism cards"
```

---

### Task 3: Update globals.css — card glass panel styles

**Files:**
- Modify: `src/styles/globals.css`

This task reskins all `.repo-card*` classes. The changes are grouped here so CSS is done in one pass.

- [ ] **Step 1: Restyle `.repo-card` base class**

Replace the existing `.repo-card` block (lines 1081–1094) with:

```css
.repo-card {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
  animation: card-in 0.18s ease forwards;
  transition: border-color 0.15s, box-shadow 0.15s;
}
```

- [ ] **Step 2: Restyle `.repo-card:hover`**

Replace the existing `.repo-card:hover` block (lines 1095–1100) with:

```css
.repo-card:hover {
  border-color: rgba(255,255,255,0.35);
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}
```

- [ ] **Step 3: Restyle `.repo-card-banner` to full-bleed background layer**

Replace the existing `.repo-card-banner` block (lines 1141–1148) with:

```css
.repo-card-banner {
  flex: 1;
  min-height: 140px;
}
```

This is now a spacer div that pushes the glass panel down, not a container for BannerSVG.

- [ ] **Step 4: Add `.repo-card-panel` glass panel class**

Add a new class after `.repo-card-banner`:

```css
.repo-card-panel {
  margin: 0 8px 8px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 -2px 20px rgba(0,0,0,0.04);
  border: 1px solid rgba(255,255,255,0.35);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 2;
}
```

- [ ] **Step 5: Override text colours for glass panel children**

Update these existing classes to use white-family colours:

`.repo-card-name` — change `color: var(--t1)` to `color: #fff`

`.card-owner-link` — change `color: var(--t3)` to `color: rgba(255,255,255,0.8)`. Also update `.card-owner-link:hover` to `color: #fff`.

`.repo-card-desc` — change `color: var(--t2)` to `color: rgba(255,255,255,0.9)`. Also change `line-height: 1.55` to `line-height: 1.45` (per spec)

`.repo-card-stat-item` — change `color: var(--t3)` to `color: rgba(255,255,255,0.7)`

`.repo-card-footer` — change `border-top: 1px solid var(--border)` to `border-top: 1px solid rgba(255,255,255,0.15)`. Change `color` of `.repo-card-stats` children to inherit.

`.repo-card-stats .stat-type-icon` — change `border-right: 1px solid var(--border)` to `border-right: 1px solid rgba(255,255,255,0.15)`

- [ ] **Step 6: Override tag pill colours for glass panel**

Update `.repo-card-tag`:
- `background: rgba(255,255,255,0.15)` (was `var(--bg3)`)
- `color: rgba(255,255,255,0.85)` (was `var(--t3)`)
- Add `border: 1px solid rgba(255,255,255,0.2)`

Update `.repo-card-tag:not(.active):hover`:
- `background: rgba(255,255,255,0.25)` (was green)
- `color: #fff` (was `#16a34a`)

Update `.repo-card-tag.active` and `.repo-card-tag.active:hover`:
- `background: rgba(255,255,255,0.3)` (was green)
- `color: #fff` (was `#16a34a`)

- [ ] **Step 7: Override star button and install button for glass panel**

Update `.btn-card-star`:
- `color: rgba(255,255,255,0.7)` (was `var(--t3)`)

Update `.btn-card-star:hover`:
- `background: rgba(255,255,255,0.15)` (was amber)
- `border-color: rgba(255,255,255,0.25)` (was amber)
- `color: #fff` (was `#f59e0b`)

Update `.btn-card-star.starred`:
- `color: #fbbf24` (keep gold but brighter for visibility on glass)

**Important:** `.install-btn` is used globally by `RepoListRow.tsx`, `Starred.tsx`, and `RepoDetail.tsx`. Do NOT modify the global `.install-btn` class. Instead, add scoped overrides:

```css
.repo-card .install-btn {
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.3);
  color: #fff;
}
.repo-card .install-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.3);
}
```

- [ ] **Step 8: Update `ProfileOverlay.tsx` skeleton and remove `.repo-card-body`**

`src/components/ProfileOverlay.tsx` has a `SkeletonGrid` component (line 83) that uses `className="repo-card-body"`. Change it to `className="repo-card-panel"`:

```tsx
// In ProfileOverlay.tsx SkeletonGrid, around line 83:
<div className="repo-card-panel">
```

Then remove the `.repo-card-body` CSS rule from `globals.css` (lines 1166–1172), since it is now fully replaced by `.repo-card-panel`.

Also remove the `.repo-card-lang-badge` CSS rule (lines 1150–1164) — no component uses this class.

- [ ] **Step 9: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(card): restyle card CSS for glassmorphism layout"
```

---

### Task 4: Rewrite RepoCard.tsx layout

**Files:**
- Modify: `src/components/RepoCard.tsx`

- [ ] **Step 1: Update imports**

At the top of `RepoCard.tsx`:
- Remove: `import BannerSVG from './BannerSVG'`
- Add: `import DitherBackground from './DitherBackground'`
- Add: `import { getBucketGradient, getBucketColor } from '../config/repoTypeConfig'` (alongside existing `getSubTypeConfig` import)

- [ ] **Step 2: Update `getUpdatedColor` helper**

Replace the existing `getUpdatedColor` function (lines 30–36) with:

```typescript
function getUpdatedColor(updatedAt: string | null): string {
  if (!updatedAt) return 'rgba(255,255,255,0.7)'
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000)
  if (days < 1) return 'rgba(255,255,255,0.95)'
  if (days < 6) return 'rgba(255,255,255,0.85)'
  return 'rgba(255,255,255,0.7)'
}
```

- [ ] **Step 3: Update CardTags inline colour**

In the `CardTags` component, find the two inline `color: 'var(--t3)'` references (in the "+N more" button style around line 118, and the "less" button style around line 130). Change both to:

```typescript
color: 'rgba(255,255,255,0.7)',
```

- [ ] **Step 4: Remove left accent border logic**

In the `RepoCard` component body, remove these lines (around lines 291–294):

```typescript
const accentBorderLeft = typeConfig
  ? `2px solid ${typeConfig.accentColor}`
  : undefined
```

And remove `style={{ borderLeft: accentBorderLeft }}` from the root `<div>` (around line 300).

- [ ] **Step 5: Compute gradient and replace banner/body with new layout**

Add gradient computation near the top of the component (after `typeConfig`). Use `getBucketColor(typeBucket)` as a fallback when `typeSub` is null but `typeBucket` is known:

```typescript
const gradient = getBucketGradient(typeConfig?.accentColor ?? getBucketColor(typeBucket))
```

Replace the card's return JSX. The full new return block:

```tsx
return (
  <div
    ref={cardRef}
    className={`repo-card${focused ? ' kb-focused' : ''}`}
    onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
    onMouseLeave={() => setTagsExpanded(false)}
  >
    {/* Full-bleed background */}
    <DitherBackground
      gradient={gradient}
      avatarUrl={repo.avatar_url}
      ownerName={repo.owner}
    />

    {/* Spacer pushes glass panel down */}
    <div className="repo-card-banner" />

    {/* Glass panel */}
    <div className="repo-card-panel">
      {/* Avatar + title + owner */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        {repo.avatar_url && (
          <img
            src={repo.avatar_url}
            alt={repo.owner}
            style={{
              width: 24, height: 24,
              borderRadius: '50%',
              border: 'none',
              flexShrink: 0,
              marginTop: 1,
              objectFit: 'cover',
            }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="repo-card-title-row">
            <span className="repo-card-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {repo.name}
              <VerificationBadge
                tier={verificationTier ?? null}
                signals={verificationSignals ?? []}
                resolving={verificationResolving}
                size="sm"
                variant="icon"
              />
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span
                className="card-owner-link"
                onClick={e => { e.stopPropagation(); onOwnerClick?.(repo.owner) }}
              >
                {repo.owner}
              </span>
              {isVerified && <VerifiedBadge size={10} />}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="repo-card-desc">
        {displayDescription ? parseEmoji(displayDescription) : ''}
      </p>

      {/* Tags */}
      <CardTags
        tags={topics}
        onTagClick={onTagClick}
        expanded={tagsExpanded}
        onExpand={() => setTagsExpanded(true)}
        onCollapse={() => setTagsExpanded(false)}
        activeTags={activeTags}
      />

      {/* Footer */}
      <div className="repo-card-footer">
        <div className="repo-card-stats">
          {typeConfig && typeConfig.icon && (
            <span className="vb-wrap stat-type-icon">
              {(() => { const Icon = typeConfig.icon; return <Icon size={11} style={{ color: '#fff' }} /> })()}
              <span className="vb-tooltip" style={{
                position: 'absolute', bottom: 'calc(100% + 5px)', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
                padding: '4px 8px', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500,
                color: '#fff', whiteSpace: 'nowrap', opacity: 0, pointerEvents: 'none',
                transition: 'opacity 0.15s', zIndex: 100,
              }}>
                {typeConfig.label}
              </span>
            </span>
          )}
          <span className="repo-card-stat-item">
            ★ {formatCount(repo.stars)}
          </span>
          <span className="repo-card-stat-item">
            ⑂ {formatCount(repo.forks)}
          </span>
          <span className="repo-card-stat-item">
            ◎ {formatCount(repo.open_issues)}
          </span>
          {(repo.pushed_at ?? repo.updated_at) && (
            <span
              className="repo-card-stat-item"
              style={{ color: getUpdatedColor(repo.pushed_at ?? repo.updated_at) }}
            >
              ◷ {formatRecency(repo.pushed_at ?? repo.updated_at)}
            </span>
          )}
        </div>

        <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className={`btn-card-star${isStarred ? ' starred' : ''}`}
            onClick={handleStar}
            title={isStarred ? 'Unstar on GitHub' : 'Star on GitHub'}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
            </svg>
          </button>
          <button
            className="install-btn"
            onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  </div>
)
```

Key changes from the old JSX:
- `BannerSVG` replaced by `DitherBackground` (positioned absolute, full-bleed)
- Old `.repo-card-banner` div is now an empty spacer (pushes panel down)
- `.repo-card-body` renamed to `.repo-card-panel`
- `marginBottom: 2` removed from avatar row
- Small avatar: `border: 'none'`, added `objectFit: 'cover'`
- Sub-type icon: `color: '#fff'` (was `typeConfig.accentColor`)
- Tooltip: `background: 'rgba(0,0,0,0.75)'`, `color: '#fff'` (was `var(--bg4)` / accent)
- `borderLeft: accentBorderLeft` removed from root div

- [ ] **Step 5b: Override VerificationBadge and VerifiedBadge colours**

Both badge components render inside the glass panel and need white colouring. Add `style={{ color: '#fff' }}` wrappers or pass a colour prop:

For `VerificationBadge` (around the `<span className="repo-card-name">` area), wrap with a style override:

```tsx
<span style={{ color: '#fff' }}>
  <VerificationBadge
    tier={verificationTier ?? null}
    signals={verificationSignals ?? []}
    resolving={verificationResolving}
    size="sm"
    variant="icon"
  />
</span>
```

For `VerifiedBadge`, same approach:

```tsx
<span style={{ color: '#fff' }}>
  {isVerified && <VerifiedBadge size={10} />}
</span>
```

Check whether these components use `currentColor` or hard-coded colours. If they use `currentColor`, the wrapping `color: '#fff'` is sufficient. If they use hard-coded SVG fill/stroke colours, modify the components to accept an optional `color` prop that overrides the default.

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 7: Commit**

```bash
git add src/components/RepoCard.tsx
git commit -m "feat(card): rewrite RepoCard layout with glassmorphism design"
```

---

### Task 5: Visual verification and contrast check

**Files:**
- None (manual testing)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or equivalent). Open the app and navigate to a view that shows repo cards (Discover or Library).

- [ ] **Step 2: Check all 8 bucket colours render correctly**

Scroll through cards or filter by bucket to see cards from each of the 8 buckets. Verify:
- Gradient fills the entire card
- Crosshatch dither pattern is visible
- Avatar watermark appears centred and translucent
- Glass panel sits at the bottom with rounded corners and frosted effect
- All text is readable (white on glass)

- [ ] **Step 3: Check contrast on lighter buckets**

Pay special attention to Learning (orange) and Lang Projects (amber) cards. If text is hard to read, add `text-shadow: 0 1px 2px rgba(0,0,0,0.3)` to `.repo-card-panel` in `globals.css`.

- [ ] **Step 4: Test interactive states**

Verify:
- Card hover changes border colour
- Tag expand/collapse works
- Tag hover/active states show white variants
- Star button toggles
- Open button navigates
- Keyboard focus outline renders
- Owner name click triggers owner filter

- [ ] **Step 5: Test edge cases**

- Card with no `avatar_url` — watermark and small avatar should not render
- Card with long description — 2-line clamp works
- Card with no tags — layout doesn't break
- Card with no type classification — falls back to grey gradient (Utilities)

- [ ] **Step 6: Commit any fixes**

```bash
git add -u
git commit -m "fix(card): visual adjustments from glassmorphism testing"
```

