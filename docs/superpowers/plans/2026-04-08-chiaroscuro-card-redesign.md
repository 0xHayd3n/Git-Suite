# Chiaroscuro Card Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pixelated-avatar + glassmorphism-panel RepoCard with a full-overlay chiaroscuro art card featuring Rembrandt-style dramatic lighting, serif typography, and decorative frame elements.

**Architecture:** Rewrite `DitherBackground.tsx` into a new `ChiaroscuroBackground.tsx` component with 6 CSS filter layers. Restructure `RepoCard.tsx` to use full-overlay layout (no panel). Add canvas-based avatar silhouette processing as a custom hook. Update `globals.css` to replace all `.repo-card-*` panel/banner styles with new chiaroscuro classes.

**Tech Stack:** React, CSS (filters, blend modes, gradients), Canvas API, Google Fonts (Cormorant Garamond)

**Spec:** `docs/superpowers/specs/2026-04-08-chiaroscuro-card-redesign-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/useWhitewashAvatar.ts` | Canvas-based avatar → white silhouette processing hook |
| Create | `src/components/ChiaroscuroBackground.tsx` | 6-layer chiaroscuro background from avatar URL |
| Modify | `src/components/RepoCard.tsx` | Full-overlay layout, new structure, hover overlay |
| Modify | `src/styles/globals.css` | Replace card panel/banner CSS with chiaroscuro classes |
| Modify | `src/index.html` | Add Google Fonts link for Cormorant Garamond |
| Delete | `src/components/DitherBackground.tsx` | Replaced by ChiaroscuroBackground |

---

### Task 1: Add Cormorant Garamond Font

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Add Google Fonts link to index.html**

In `src/index.html`, add inside `<head>` before `<title>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,400&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Verify the app still loads**

Run: `npm run dev` (or the existing dev command), confirm the app renders without errors in the console.

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat(card): add Cormorant Garamond font for chiaroscuro cards"
```

---

### Task 2: Create useWhitewashAvatar Hook

**Files:**
- Create: `src/hooks/useWhitewashAvatar.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useWhitewashAvatar.ts`:

```typescript
import { useEffect, useRef, useState } from 'react'

/**
 * Processes an avatar image into a white silhouette:
 * dark pixels → transparent, light pixels → white.
 * Returns a data URL for the processed image, or null.
 */
export function useWhitewashAvatar(avatarUrl: string | null | undefined): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!avatarUrl) {
      setDataUrl(null)
      return
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (cancelled) return
      canvas.width = 44
      canvas.height = 44
      ctx.drawImage(img, 0, 0, 44, 44)

      try {
        const imageData = ctx.getImageData(0, 0, 44, 44)
        const data = imageData.data
        const threshold = 110

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b

          if (luminance < threshold) {
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0
          } else {
            const alpha = Math.min(255, Math.round(((luminance - threshold) / (255 - threshold)) * 255))
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = alpha
          }
        }

        ctx.putImageData(imageData, 0, 0)
        setDataUrl(canvas.toDataURL())
      } catch {
        // Canvas tainted (CORS) — hide the icon
        setDataUrl(null)
      }
    }

    img.onerror = () => {
      if (!cancelled) setDataUrl(null)
    }

    img.src = avatarUrl
    return () => { cancelled = true }
  }, [avatarUrl])

  return dataUrl
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useWhitewashAvatar.ts
git commit -m "feat(card): add useWhitewashAvatar hook for avatar silhouette processing"
```

---

### Task 3: Create ChiaroscuroBackground Component

**Files:**
- Create: `src/components/ChiaroscuroBackground.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ChiaroscuroBackground.tsx`:

```tsx
import { memo } from 'react'

interface ChiaroscuroBackgroundProps {
  avatarUrl?: string | null
  fallbackGradient: [string, string]
}

const ChiaroscuroBackground = memo(function ChiaroscuroBackground({
  avatarUrl,
  fallbackGradient,
}: ChiaroscuroBackgroundProps) {
  const [stop1, stop2] = fallbackGradient
  const hasBg = !!avatarUrl
  const bgImage = hasBg ? `url('${avatarUrl}')` : undefined
  const fallback = `linear-gradient(135deg, ${stop1} 0%, ${stop2} 100%)`

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Layer 1: Base — deep color field */}
      <div
        className="chia-bg-base"
        style={{
          backgroundImage: hasBg ? bgImage : undefined,
          background: hasBg ? undefined : fallback,
        }}
      />
      {/* Layer 2: Highlight — detail + luminosity */}
      {hasBg && (
        <div
          className="chia-bg-highlight"
          style={{ backgroundImage: bgImage }}
        />
      )}
      {/* Layer 3: Directional warm light (upper-left) */}
      <div className="chia-bg-light" />
      {/* Layer 4: Deep shadow (lower-right) */}
      <div className="chia-bg-shadow" />
      {/* Layer 5: Vignette */}
      <div className="chia-bg-vignette" />
      {/* Layer 6: Warm tint */}
      <div className="chia-bg-tint" />
    </div>
  )
})

export default ChiaroscuroBackground
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ChiaroscuroBackground.tsx
git commit -m "feat(card): add ChiaroscuroBackground component with 6-layer effect"
```

---

### Task 4: Add Chiaroscuro CSS Classes

**Files:**
- Modify: `src/styles/globals.css`

This task replaces the old card CSS (`.repo-card`, `.dither-bg-img`, `.repo-card-banner`, `.repo-card-panel`, etc.) with the new chiaroscuro classes. The card's existing CSS runs from approximately line 1082 to line 1348. Replace the relevant blocks.

- [ ] **Step 1: Update `.repo-card` base class**

Replace the `.repo-card` block (line 1082-1093) — change `height: 340px` to `aspect-ratio: 3 / 4`:

```css
.repo-card {
  border: none;
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
  animation: card-in 0.18s ease forwards;
  transition: box-shadow 0.2s, transform 0.2s;
  aspect-ratio: 3 / 4;
}
```

- [ ] **Step 2: Update `.repo-card:hover`**

Replace the hover block (line 1094-1096):

```css
.repo-card:hover {
  box-shadow: 0 8px 40px rgba(0,0,0,0.4);
  transform: translateY(-2px);
}
```

- [ ] **Step 3: Replace `.dither-bg-img` and its hover with chiaroscuro layer classes**

Remove the `.dither-bg-img` block (lines 1097-1112) and add:

```css
/* ── Chiaroscuro background layers ──────────────────────────────── */
.chia-bg-base {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  filter: blur(25px) saturate(2) contrast(1.6) brightness(0.55);
  transform: scale(1.4);
}
.chia-bg-highlight {
  position: absolute; inset: 0;
  background-size: cover; background-position: center 20%;
  filter: blur(8px) saturate(1.5) contrast(1.3) brightness(1.2);
  opacity: 0.25; mix-blend-mode: soft-light;
}
.chia-bg-light {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 30% 25%, rgba(255,220,180,0.2) 0%, transparent 50%);
}
.chia-bg-shadow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 75% 80%, rgba(0,0,0,0.5) 0%, transparent 60%);
}
.chia-bg-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 40% 35%, transparent 25%, rgba(0,0,0,0.65) 100%);
}
.chia-bg-tint {
  position: absolute; inset: 0;
  background: rgba(60,30,10,0.12);
  mix-blend-mode: color;
}
```

- [ ] **Step 4: Remove old card layout blocks**

Find and delete these CSS blocks (locate by class name, not line number — earlier edits will have shifted positions):
- `.repo-card-banner { ... }` — the spacer div
- `.repo-card-panel { ... }` — the glassmorphism panel
- `.repo-card-stars { ... }` — the old star display (no longer used)

These blocks are no longer referenced in the new layout.

- [ ] **Step 5: Add decorative frame classes**

```css
/* ── Card frame decorations ─────────────────────────────────────── */
.card-corner-marks {
  position: absolute; inset: 0; z-index: 2;
  pointer-events: none;
}
.card-corner-marks::before,
.card-corner-marks::after {
  content: '+';
  position: absolute;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 300;
  color: rgba(255,255,255,0.3);
  line-height: 1;
}
.card-corner-marks::before { top: 14px; left: 16px; }
.card-corner-marks::after { top: 14px; right: 16px; }
.card-corner-bl,
.card-corner-br {
  position: absolute; inset: 0;
  pointer-events: none;
}
.card-corner-bl::before,
.card-corner-br::before {
  content: '+';
  position: absolute;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 300;
  color: rgba(255,255,255,0.3);
  line-height: 1;
}
.card-corner-bl::before { bottom: 14px; left: 16px; }
.card-corner-br::before { bottom: 14px; right: 16px; }

.card-rule-top {
  position: absolute; top: 28px; left: 30px; right: 30px;
  height: 1px; background: rgba(255,255,255,0.12);
  z-index: 2; pointer-events: none;
}
.card-rule-bottom {
  position: absolute; bottom: 28px; left: 30px; right: 30px;
  height: 1px; background: rgba(255,255,255,0.12);
  z-index: 2; pointer-events: none;
}
.card-rule-left {
  position: absolute; top: 28px; bottom: 28px; left: 28px;
  width: 1px; background: rgba(255,255,255,0.08);
  z-index: 2; pointer-events: none;
}
.card-rule-right {
  position: absolute; top: 28px; bottom: 28px; right: 28px;
  width: 1px; background: rgba(255,255,255,0.08);
  z-index: 2; pointer-events: none;
}
```

- [ ] **Step 6: Replace `.repo-card-title-row` / `.repo-card-name` / `.card-owner-link` with new title and description classes**

Find and remove these CSS blocks by class name: `.repo-card-title-row`, `.repo-card-name`, `.card-owner-link`, `.card-owner-link:hover`, and `.repo-card-desc`. Replace with:

```css
/* ── Card title (top, centered) ─────────────────────────────────── */
.card-art-title {
  position: absolute; top: 38px; left: 20px; right: 20px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  z-index: 3;
}
.card-art-title .avatar-icon {
  width: 22px; height: 22px;
  flex-shrink: 0;
}
.card-art-title .name {
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 22px; font-weight: 600; color: rgba(255,255,255,0.95);
  letter-spacing: 0.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Card description (bottom, centered) ────────────────────────── */
.card-art-desc {
  position: absolute; bottom: 40px; left: 36px; right: 36px;
  z-index: 3; text-align: center;
  transition: transform 0.25s ease;
}
.repo-card:hover .card-art-desc {
  transform: translateY(-48px);
}
.card-art-desc p {
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 14px; color: rgba(255,255,255,0.82);
  line-height: 1.55; letter-spacing: 0.2px;
  font-style: italic;
  display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; overflow: hidden;
  margin: 0;
}
.card-art-owner {
  font-family: 'Inter', sans-serif;
  font-size: 10px; color: rgba(255,255,255,0.45);
  margin-top: 6px; display: inline-block;
  letter-spacing: 1.5px; text-transform: uppercase;
  cursor: pointer;
  transition: color 0.12s;
}
.card-art-owner:hover {
  color: rgba(255,255,255,0.7);
}
```

- [ ] **Step 7: Replace `.repo-card-footer` with hover overlay CSS**

Find and remove the `.repo-card-footer` and `.repo-card:hover .repo-card-footer` CSS blocks by class name. Replace with:

```css
/* ── Card hover overlay ─────────────────────────────────────────── */
.card-hover-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  z-index: 4;
  padding: 14px 20px 18px;
  background: linear-gradient(0deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 60%, transparent 100%);
  opacity: 0; transform: translateY(8px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  display: flex; flex-direction: column; gap: 8px;
}
.repo-card:hover .card-hover-overlay {
  opacity: 1; transform: translateY(0);
}
```

- [ ] **Step 8: Update `.discover-grid` for portrait cards**

The current `.discover-grid` uses `repeat(3, minmax(0, 1fr))` (line 1066). Update to allow the narrower portrait cards to fill properly:

```css
.discover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  align-items: start;
}
```

- [ ] **Step 9: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(card): replace card CSS with chiaroscuro classes and full-overlay layout"
```

---

### Task 5: Rewrite RepoCard Component

**Files:**
- Modify: `src/components/RepoCard.tsx`

This is the main structural change. The card goes from banner + panel to full-overlay.

- [ ] **Step 1: Update imports**

At the top of `src/components/RepoCard.tsx`, replace the `DitherBackground` import with `ChiaroscuroBackground` and add the hook:

```typescript
import ChiaroscuroBackground from './ChiaroscuroBackground'
import { useWhitewashAvatar } from '../hooks/useWhitewashAvatar'
```

Remove: `import DitherBackground from './DitherBackground'`

- [ ] **Step 2: Add whitewash hook call inside the component**

Inside the `RepoCard` component function, after the existing state declarations, add:

```typescript
const whitewashSrc = useWhitewashAvatar(repo.avatar_url)
```

- [ ] **Step 3: Rewrite the JSX return**

Replace the entire return block (from `return (` to the closing `)`) with the new full-overlay structure. The key changes:
- `DitherBackground` → `ChiaroscuroBackground` with `fallbackGradient={gradient}`
- Remove `repo-card-banner` spacer div
- Remove `repo-card-panel` wrapper div
- Add corner marks and rule lines
- Title moves to top-center with whitewashed avatar icon
- Description moves to bottom-center
- Tags, stats, and actions move into a hover overlay div

```tsx
return (
  <div
    ref={cardRef}
    className={`repo-card${focused ? ' kb-focused' : ''}`}
    onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
    onMouseLeave={() => setTagsExpanded(false)}
  >
    {/* Chiaroscuro background */}
    <ChiaroscuroBackground
      avatarUrl={repo.avatar_url}
      fallbackGradient={gradient}
    />

    {/* Decorative frame */}
    <div className="card-corner-marks">
      <div className="card-corner-bl" />
      <div className="card-corner-br" />
    </div>
    <div className="card-rule-top" />
    <div className="card-rule-bottom" />
    <div className="card-rule-left" />
    <div className="card-rule-right" />

    {/* Title — top center */}
    <div className="card-art-title">
      {whitewashSrc && (
        <img className="avatar-icon" src={whitewashSrc} alt="" />
      )}
      <span className="name">
        {repo.name}
        <VerificationBadge
          tier={verificationTier ?? null}
          signals={verificationSignals ?? []}
          resolving={verificationResolving}
          size="sm"
          variant="icon"
        />
      </span>
    </div>

    {/* Description — bottom center */}
    <div className="card-art-desc">
      <p>{displayDescription ? parseEmoji(displayDescription) : ''}</p>
      <span
        className="card-art-owner"
        onClick={e => { e.stopPropagation(); onOwnerClick?.(repo.owner) }}
      >
        {repo.owner}
        {isVerified && <span style={{ color: '#fff', marginLeft: 4 }}><VerifiedBadge size={10} /></span>}
      </span>
    </div>

    {/* Hover overlay — tags, stats, actions */}
    <div className="card-hover-overlay" onClick={e => e.stopPropagation()}>
      <CardTags
        tags={topics}
        onTagClick={onTagClick}
        expanded={tagsExpanded}
        onExpand={() => setTagsExpanded(true)}
        onCollapse={() => setTagsExpanded(false)}
        activeTags={activeTags}
      />

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
        <span className="repo-card-stat-item">★ {formatCount(repo.stars)}</span>
        <span className="repo-card-stat-item">⑂ {formatCount(repo.forks)}</span>
        <span className="repo-card-stat-item">◎ {formatCount(repo.open_issues)}</span>
        {(repo.pushed_at ?? repo.updated_at) && (
          <span
            className="repo-card-stat-item"
            style={{ color: getUpdatedColor(repo.pushed_at ?? repo.updated_at) }}
          >
            ◷ {formatRecency(repo.pushed_at ?? repo.updated_at)}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {/* Learn button — preserves existing handleLearn/learnState/learnError */}
        {learnState !== 'LEARNED' && (
          <button
            className="install-btn"
            onClick={handleLearn}
            disabled={learnState === 'LEARNING'}
            title={learnError === 'no-key' ? 'No API key configured' : learnError === 'failed' ? 'Learn failed' : 'Learn this repo'}
          >
            {learnState === 'LEARNING' ? '...' : 'Learn'}
          </button>
        )}
        {/* Download button — preserves existing handleDownload/downloadState */}
        <button
          className="install-btn"
          onClick={handleDownload}
          disabled={downloadState === 'DOWNLOADING'}
          title={downloadError ?? (downloadState === 'COMPLETE' ? 'Downloaded!' : 'Download ZIP')}
        >
          {downloadState === 'DOWNLOADING' ? '...' : downloadState === 'COMPLETE' ? '✓' : '↓'}
        </button>
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
)
```

- [ ] **Step 4: Commit**

```bash
git add src/components/RepoCard.tsx
git commit -m "feat(card): rewrite RepoCard with chiaroscuro full-overlay layout"
```

---

### Task 6: Delete DitherBackground

**Files:**
- Delete: `src/components/DitherBackground.tsx`

- [ ] **Step 1: Delete the file**

```bash
git rm src/components/DitherBackground.tsx
```

- [ ] **Step 2: Verify no other imports reference it**

Run: `grep -r "DitherBackground" src/` — should return zero results.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(card): remove DitherBackground, replaced by ChiaroscuroBackground"
```

---

### Task 7: Visual Verification and Polish

**Files:**
- Possibly: `src/styles/globals.css`, `src/components/RepoCard.tsx`

- [ ] **Step 1: Run the app and visually verify**

Run the dev server. Navigate to the Discover view where cards are displayed. Check:
- Cards render with portrait 3:4 aspect ratio
- Chiaroscuro background shows the avatar as an artistic painting
- Corner `+` marks and rule lines are visible
- Title is centered at top with whitewashed avatar icon
- Description is at bottom with italic serif font
- Hover reveals tags, stats, and action buttons
- Description translates up on hover
- Cards with no avatar fall back to gradient background
- Keyboard focus outline still works

- [ ] **Step 2: Verify all interactive features work**

Test:
- Click card → navigates to repo detail
- Click owner name → fires onOwnerClick
- Click tag → fires onTagClick
- Click star → toggles star state
- Click Open → navigates to repo detail
- Mouse leave → collapses expanded tags

- [ ] **Step 3: Fix any visual issues found**

Adjust CSS values (spacing, opacity, font sizes) as needed based on how the real cards render vs. the mockup.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(card): polish chiaroscuro card visual details"
```
