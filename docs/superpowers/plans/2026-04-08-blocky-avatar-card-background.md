# Blocky Avatar Card Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain gradient background in RepoCard's DitherBackground with a pixelated (8x8) version of the repo's avatar image, tinted with the bucket gradient color.

**Architecture:** Add a `<canvas>` element to DitherBackground that draws the avatar at 8x8 resolution and displays it full-size with `image-rendering: pixelated`. Layer a gradient tint (multiply blend) and screen overlay on top, then the existing dither + watermark above that. All inline styles, matching existing patterns.

**Tech Stack:** React (useEffect, useRef, useState), HTML Canvas API, CSS mix-blend-mode

**Spec:** `docs/superpowers/specs/2026-04-08-blocky-avatar-card-background-design.md`

---

### Task 1: Add pixelated canvas layer to DitherBackground

**Files:**
- Modify: `src/components/DitherBackground.tsx`

- [ ] **Step 1: Add useEffect, useRef, useState imports**

In `src/components/DitherBackground.tsx`, change line 1 from:

```tsx
import { memo, useId } from 'react'
```

to:

```tsx
import { memo, useEffect, useId, useRef, useState } from 'react'
```

- [ ] **Step 2: Add canvas ref and loaded state inside the component**

Inside the `DitherBackground` function body, after `const d = stop1` (line 37), add:

```tsx
const canvasRef = useRef<HTMLCanvasElement>(null)
const [pixelReady, setPixelReady] = useState(false)

useEffect(() => {
  const canvas = canvasRef.current
  if (!canvas || !avatarUrl) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  setPixelReady(false)

  let cancelled = false
  const img = new Image()
  img.crossOrigin = 'anonymous'

  img.onload = () => {
    if (cancelled) return
    canvas.width = 8
    canvas.height = 8
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, 8, 8)
    setPixelReady(true)
  }

  img.onerror = () => {
    if (cancelled) return
    setPixelReady(false)
  }

  img.src = avatarUrl

  return () => {
    cancelled = true
    img.src = ''
  }
}, [avatarUrl])
```

- [ ] **Step 3: Add the canvas element as the first child of the outer div**

Replace the outer `<div>` opening and its first child. The current structure starts at line 39 with the outer div. Insert the canvas, tint, and screen overlay layers before the existing SVG dither.

The full JSX return becomes:

```tsx
return (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      background: `linear-gradient(135deg, ${stop1} 0%, ${stop2} 100%)`,
    }}
  >
    {/* Layer 1: Pixelated avatar canvas */}
    {avatarUrl && (
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
          zIndex: 1,
          opacity: pixelReady ? 1 : 0,
        }}
      />
    )}

    {/* Layer 2: Bucket gradient tint (multiply blend) */}
    {pixelReady && (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${stop1} 0%, ${stop2} 100%)`,
          mixBlendMode: 'multiply',
          opacity: 0.45,
          zIndex: 2,
        }}
      />
    )}

    {/* Layer 3: Screen overlay (prevents very dark avatars from going black) */}
    {pixelReady && (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'white',
          mixBlendMode: 'screen',
          opacity: 0.1,
          zIndex: 3,
        }}
      />
    )}

    {/* Layer 4: SVG dither overlay */}
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
      width="100%"
      height="100%"
    >
      {/* ... existing defs and rects unchanged ... */}
    </svg>

    {/* Layer 5: Avatar watermark */}
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
          zIndex: 5,
        }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )}
  </div>
)
```

**Important:** The SVG dither section (defs, patterns, rects) remains exactly as-is — only the `style` prop on the `<svg>` gets `zIndex: 4` added.

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Visual verification**

Run: `npm run dev`
Open the app and navigate to a view with repo cards. Confirm:
1. Cards with avatars show chunky 8x8 pixelated background
2. Bucket tint color is visible over the pixels
3. Dither patterns render on top
4. Avatar watermark circle renders above everything
5. Glass panel text is legible
6. Cards without avatars fall back to gradient-only background

- [ ] **Step 6: Commit**

```bash
git add src/components/DitherBackground.tsx
git commit -m "feat(card): add pixelated avatar background to DitherBackground"
```
