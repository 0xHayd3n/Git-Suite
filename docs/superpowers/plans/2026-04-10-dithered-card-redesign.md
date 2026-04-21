# Dithered Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Chiaroscuro blurred-avatar card backgrounds with animated Bayer-dithered halftone backgrounds, redesign card layout to a modern big-title format with author row, and add frosted glass corner blur effects.

**Architecture:** New `useBayerDither` hook handles canvas-based 8x8 Bayer ordered dithering with animated camera angles and crossfade transitions. A new `DitherBackground` component replaces `ChiaroscuroBackground`, rendering the dithered canvas with frosted glass corner overlays. `RepoCard` is restructured to remove decorative frame elements and use a bottom-third content layout with large repo name and author row. All old Chiaroscuro CSS classes are removed and replaced with new dither-specific styles.

**Tech Stack:** React 18, TypeScript, Canvas 2D API, CSS backdrop-filter, Electron-vite

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/hooks/useBayerDither.ts` | Canvas-based Bayer dithering engine: image loading, color processing, camera animation, crossfade rendering |
| Create | `src/components/DitherBackground.tsx` | Card background component: renders dither canvas + frosted glass corner overlays |
| Modify | `src/components/RepoCard.tsx` | Replace ChiaroscuroBackground with DitherBackground, remove decorative frame, restructure to big-title + author layout |
| Modify | `src/styles/globals.css` | Remove `.chia-bg-*` / `.card-corner-marks` / `.card-rule-*` styles, add `.dither-canvas` / `.corner-glass` / new card content styles, update `.repo-card` (sharp corners, no border, no shadow) |
| Delete | `src/components/ChiaroscuroBackground.tsx` | No longer needed — replaced by DitherBackground |
| Create | `src/components/DitherBackground.test.tsx` | Tests for DitherBackground rendering and canvas initialization |
| Create | `src/hooks/useBayerDither.test.ts` | Tests for dither hook: color math, Bayer matrix, camera sequences |
| Modify | `src/components/DiscoverGrid.tsx` | Update skeleton loader styles (sharp corners, no border) |

---

### Task 1: Create the Bayer Dither Hook

**Files:**
- Create: `src/hooks/useBayerDither.ts`
- Create: `src/hooks/useBayerDither.test.ts`

This hook loads an avatar image, extracts color data, and renders animated Bayer-dithered frames onto a canvas element. It handles the full rendering pipeline: image loading, bilinear sampling, HSL color processing, light-area protection, complementary tint dithering, camera angle simulation, and crossfade transitions.

- [ ] **Step 1: Write failing tests for color utility functions**

Create `src/hooks/useBayerDither.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { rgbToHsl, hslToRgb, BAYER8 } from './useBayerDither'

describe('rgbToHsl', () => {
  it('converts pure red', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0)
    expect(h).toBeCloseTo(0, 1)
    expect(s).toBeCloseTo(1, 1)
    expect(l).toBeCloseTo(0.5, 1)
  })

  it('converts pure white', () => {
    const [h, s, l] = rgbToHsl(255, 255, 255)
    expect(s).toBe(0)
    expect(l).toBeCloseTo(1, 1)
  })

  it('converts pure black', () => {
    const [h, s, l] = rgbToHsl(0, 0, 0)
    expect(s).toBe(0)
    expect(l).toBe(0)
  })

  it('converts mid-blue', () => {
    const [h, s, l] = rgbToHsl(0, 128, 255)
    expect(h).toBeGreaterThan(0.5)
    expect(h).toBeLessThan(0.7)
    expect(s).toBeCloseTo(1, 1)
  })
})

describe('hslToRgb', () => {
  it('round-trips pure red', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('converts gray (zero saturation)', () => {
    const [r, g, b] = hslToRgb(0.5, 0, 0.5)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })
})

describe('BAYER8', () => {
  it('is an 8x8 matrix', () => {
    expect(BAYER8).toHaveLength(8)
    BAYER8.forEach(row => expect(row).toHaveLength(8))
  })

  it('contains values 0-63', () => {
    const flat = BAYER8.flat()
    expect(Math.min(...flat)).toBe(0)
    expect(Math.max(...flat)).toBe(63)
    // All 64 unique values
    expect(new Set(flat).size).toBe(64)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useBayerDither.test.ts`
Expected: FAIL — module `./useBayerDither` does not exist

- [ ] **Step 3: Write the Bayer dither hook with exported utilities**

Create `src/hooks/useBayerDither.ts`:

```typescript
import { useEffect, useRef, useCallback } from 'react'

// ── Bayer 8x8 ordered dither matrix ──────────────────────────────
export const BAYER8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

// ── Color conversion utilities ───────────────────────────────────
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h, s, l]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ]
}

// ── Camera definitions ───────────────────────────────────────────
interface CameraSample { u: number; v: number }
interface Camera {
  name: string
  sample: (nx: number, ny: number, t: number) => CameraSample
}

const CAMERAS: Camera[] = [
  {
    name: 'straight',
    sample(nx, ny, t) {
      return {
        u: nx * 0.7 + 0.15 + Math.sin(t * 0.4) * 0.08,
        v: ny * 0.7 + 0.15 + Math.cos(t * 0.3) * 0.08,
      }
    },
  },
  {
    name: 'tightZoomA',
    sample(nx, ny, t) {
      return {
        u: 0.2 + Math.sin(t * 0.5) * 0.1 + nx * 0.3,
        v: 0.2 + Math.cos(t * 0.4) * 0.1 + ny * 0.3,
      }
    },
  },
  {
    name: 'tilt45',
    sample(nx, ny, t) {
      const scale = 0.55 + ny * 0.45
      return {
        u: 0.5 + (nx - 0.5) * scale * 0.8 + Math.sin(t * 0.5) * 0.05,
        v: ny * ny * 0.7 + 0.1,
      }
    },
  },
  {
    name: 'tightZoomB',
    sample(nx, ny, t) {
      return {
        u: 0.5 + Math.cos(t * 0.45) * 0.1 + nx * 0.3,
        v: 0.5 + Math.sin(t * 0.55) * 0.1 + ny * 0.3,
      }
    },
  },
  {
    name: 'centered',
    sample(nx, ny, t) {
      const s = 0.85 + Math.sin(t * 0.8) * 0.02
      const o = (1 - s) / 2
      return { u: nx * s + o, v: ny * s + o }
    },
  },
]

const HOLD_DURATIONS = [180, 180, 180, 180, 120]
const FADE_FRAMES = 24
const TOTAL_CYCLE = HOLD_DURATIONS.reduce((a, b) => a + b, 0)

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
}

// ── Dominant hue extraction ──────────────────────────────────────
function extractDominantHue(
  srcData: ImageData, imgW: number, imgH: number,
): { dominantHue: number; tintColor: [number, number, number] } {
  const cx = Math.floor(imgW / 2), cy = Math.floor(imgH / 2)
  const radius = Math.floor(Math.min(imgW, imgH) * 0.35)
  let hueSum = 0, satSum = 0, count = 0

  for (let y = cy - radius; y < cy + radius; y += 3) {
    for (let x = cx - radius; x < cx + radius; x += 3) {
      if (x < 0 || x >= imgW || y < 0 || y >= imgH) continue
      const i = (y * imgW + x) * 4
      const [h, s, l] = rgbToHsl(srcData.data[i], srcData.data[i + 1], srcData.data[i + 2])
      if (s > 0.15 && l > 0.1 && l < 0.9) {
        hueSum += h * s
        satSum += s
        count++
      }
    }
  }

  if (count === 0 || satSum < 0.1) {
    return { dominantHue: 0.75, tintColor: [220, 210, 235] }
  }

  const dominantHue = hueSum / satSum
  const tintHue = (dominantHue + 0.08) % 1.0
  const tintColor = hslToRgb(tintHue, 0.35, 0.88)
  return { dominantHue, tintColor }
}

// ── Per-frame camera rendering ───────────────────────────────────
function renderCamera(
  srcData: ImageData, imgW: number, imgH: number,
  w: number, h: number,
  camIdx: number, t: number,
  tintColor: [number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  const data = srcData.data
  const camera = CAMERAS[camIdx]
  const [tR, tG, tB] = tintColor

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const { u, v } = camera.sample(x / w, y / h, t)

      if (u < 0 || u > 1 || v < 0 || v > 1) {
        out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 255
        continue
      }

      // Bilinear sample
      const fx = u * (imgW - 1), fy = v * (imgH - 1)
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, imgW - 1), y1 = Math.min(y0 + 1, imgH - 1)
      const wx = fx - x0, wy = fy - y0

      const i00 = (y0 * imgW + x0) * 4
      const i10 = (y0 * imgW + x1) * 4
      const i01 = (y1 * imgW + x0) * 4
      const i11 = (y1 * imgW + x1) * 4

      const sr = data[i00] * (1 - wx) * (1 - wy) + data[i10] * wx * (1 - wy) + data[i01] * (1 - wx) * wy + data[i11] * wx * wy
      const sg = data[i00 + 1] * (1 - wx) * (1 - wy) + data[i10 + 1] * wx * (1 - wy) + data[i01 + 1] * (1 - wx) * wy + data[i11 + 1] * wx * wy
      const sb = data[i00 + 2] * (1 - wx) * (1 - wy) + data[i10 + 2] * wx * (1 - wy) + data[i01 + 2] * (1 - wx) * wy + data[i11 + 2] * wx * wy

      let [h2, s2, l2] = rgbToHsl(sr, sg, sb)
      const bayerVal = BAYER8[y % 8][x % 8] / 64

      // Light area protection: very bright → pure white
      if (l2 > 0.92) {
        out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 255
        continue
      }

      // Light area: dither between white and complementary tint
      if (l2 > 0.7) {
        const lightFactor = (l2 - 0.7) / 0.22
        const threshold = lightFactor * 0.8 + 0.1
        if (bayerVal > threshold) {
          const colorBlend = 1.0 - lightFactor
          out[i]     = Math.round(tR * (1 - colorBlend * 0.3) + sr * colorBlend * 0.3)
          out[i + 1] = Math.round(tG * (1 - colorBlend * 0.3) + sg * colorBlend * 0.3)
          out[i + 2] = Math.round(tB * (1 - colorBlend * 0.3) + sb * colorBlend * 0.3)
          out[i + 3] = 255
        } else {
          out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 255
        }
        continue
      }

      // Mid/dark areas: boost saturation + S-curve contrast + Bayer quantize
      s2 = Math.min(1, s2 * 2.0)
      const p = 2.0
      const lp = Math.pow(l2, p)
      l2 = lp / (lp + Math.pow(1 - l2, p))
      const [cr, cg, cb] = hslToRgb(h2, s2, l2)

      const levels = 6
      const rq = Math.floor((cr / 255 + (bayerVal - 0.5) / levels) * levels) / levels * 255
      const gq = Math.floor((cg / 255 + (bayerVal - 0.5) / levels) * levels) / levels * 255
      const bq = Math.floor((cb / 255 + (bayerVal - 0.5) / levels) * levels) / levels * 255

      out[i]     = Math.max(0, Math.min(255, rq))
      out[i + 1] = Math.max(0, Math.min(255, gq))
      out[i + 2] = Math.max(0, Math.min(255, bq))
      out[i + 3] = 255
    }
  }
  return out
}

// ── Hook ─────────────────────────────────────────────────────────
export function useBayerDither(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  avatarUrl: string | null | undefined,
  containerWidth: number,
  containerHeight: number,
) {
  const animRef = useRef<number>(0)
  const frameRef = useRef(0)
  const phaseRef = useRef(Math.floor(Math.random() * TOTAL_CYCLE))
  const visibleRef = useRef(true)

  const cleanup = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = 0
    }
  }, [])

  useEffect(() => {
    cleanup()
    if (!avatarUrl || !canvasRef.current || containerWidth <= 0 || containerHeight <= 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = 0.35
    const w = Math.floor(containerWidth * scale)
    const h = Math.floor(containerHeight * scale)
    canvas.width = w
    canvas.height = h

    // Pause animation when card is not visible (performance optimization)
    const io = new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting },
      { threshold: 0 },
    )
    io.observe(canvas)

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (cancelled) return

      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = img.width
      srcCanvas.height = img.height
      const srcCtx = srcCanvas.getContext('2d')
      if (!srcCtx) return
      srcCtx.drawImage(img, 0, 0)

      let srcData: ImageData
      try {
        srcData = srcCtx.getImageData(0, 0, img.width, img.height)
      } catch {
        // Canvas tainted by CORS — abort
        return
      }

      const { tintColor } = extractDominantHue(srcData, img.width, img.height)

      function render() {
        if (cancelled) return
        // Skip rendering when not visible (saves CPU for off-screen cards)
        if (!visibleRef.current) {
          animRef.current = requestAnimationFrame(render)
          return
        }
        frameRef.current++
        const t = frameRef.current * 0.003
        const cycleFrame = (frameRef.current + phaseRef.current) % TOTAL_CYCLE

        let accumulated = 0, currentCam = 0, frameInHold = 0
        for (let i = 0; i < CAMERAS.length; i++) {
          if (cycleFrame < accumulated + HOLD_DURATIONS[i]) {
            currentCam = i
            frameInHold = cycleFrame - accumulated
            break
          }
          accumulated += HOLD_DURATIONS[i]
        }

        const nextCam = (currentCam + 1) % CAMERAS.length
        const fadeStart = HOLD_DURATIONS[currentCam] - FADE_FRAMES
        const isFading = frameInHold >= fadeStart

        const currentPixels = renderCamera(
          srcData, img.width, img.height, w, h, currentCam, t, tintColor,
        )

        if (isFading) {
          const nextPixels = renderCamera(
            srcData, img.width, img.height, w, h, nextCam, t, tintColor,
          )
          const fadeProgress = easeOutCubic((frameInHold - fadeStart) / FADE_FRAMES)

          const final = new Uint8ClampedArray(w * h * 4)
          for (let i = 0; i < final.length; i += 4) {
            final[i]     = Math.floor(currentPixels[i]     * (1 - fadeProgress) + nextPixels[i]     * fadeProgress)
            final[i + 1] = Math.floor(currentPixels[i + 1] * (1 - fadeProgress) + nextPixels[i + 1] * fadeProgress)
            final[i + 2] = Math.floor(currentPixels[i + 2] * (1 - fadeProgress) + nextPixels[i + 2] * fadeProgress)
            final[i + 3] = 255
          }
          ctx.putImageData(new ImageData(final, w, h), 0, 0)
        } else {
          ctx.putImageData(new ImageData(currentPixels, w, h), 0, 0)
        }

        animRef.current = requestAnimationFrame(render)
      }

      render()
    }

    img.onerror = () => {
      // Failed to load avatar — leave canvas empty (black)
    }

    img.src = avatarUrl

    return () => {
      cancelled = true
      io.disconnect()
      cleanup()
    }
  }, [avatarUrl, containerWidth, containerHeight, canvasRef, cleanup])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useBayerDither.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBayerDither.ts src/hooks/useBayerDither.test.ts
git commit -m "feat: add useBayerDither hook for animated halftone card backgrounds"
```

---

### Task 2: Create the DitherBackground Component

**Files:**
- Create: `src/components/DitherBackground.tsx`
- Create: `src/components/DitherBackground.test.tsx`

This component renders the dithered canvas background with frosted glass corner blur overlays. It uses the `useBayerDither` hook and manages canvas sizing via a ResizeObserver on the parent container.

- [ ] **Step 1: Write failing test for DitherBackground**

Create `src/components/DitherBackground.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import DitherBackground from './DitherBackground'

// Mock the dither hook — we don't test canvas rendering here
vi.mock('../hooks/useBayerDither', () => ({
  useBayerDither: vi.fn(),
}))

describe('DitherBackground', () => {
  it('renders a canvas with dither-canvas class', () => {
    const { container } = render(
      <DitherBackground avatarUrl="https://example.com/avatar.png" />,
    )
    const canvas = container.querySelector('canvas.dither-canvas')
    expect(canvas).toBeTruthy()
  })

  it('renders two frosted glass corner overlays', () => {
    const { container } = render(
      <DitherBackground avatarUrl="https://example.com/avatar.png" />,
    )
    const glasses = container.querySelectorAll('.corner-glass')
    expect(glasses).toHaveLength(2)
    expect(container.querySelector('.corner-glass-tl')).toBeTruthy()
    expect(container.querySelector('.corner-glass-br')).toBeTruthy()
  })

  it('still renders canvas when avatarUrl is null', () => {
    const { container } = render(
      <DitherBackground avatarUrl={null} />,
    )
    // Still renders the container but canvas will be empty
    const canvas = container.querySelector('canvas.dither-canvas')
    expect(canvas).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DitherBackground.test.tsx`
Expected: FAIL — module `./DitherBackground` does not exist

- [ ] **Step 3: Write the DitherBackground component**

Create `src/components/DitherBackground.tsx`:

```typescript
import { memo, useRef, useState, useEffect } from 'react'
import { useBayerDither } from '../hooks/useBayerDither'

interface DitherBackgroundProps {
  avatarUrl?: string | null
  fallbackGradient?: [string, string]
}

const DitherBackground = memo(function DitherBackground({
  avatarUrl,
  fallbackGradient,
}: DitherBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useBayerDither(canvasRef, avatarUrl ?? null, size.width, size.height)

  const fallbackBg = fallbackGradient
    ? `linear-gradient(135deg, ${fallbackGradient[0]} 0%, ${fallbackGradient[1]} 100%)`
    : '#1a1a1f'

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: fallbackBg }}>
      <canvas ref={canvasRef} className="dither-canvas" />
      <div className="corner-glass corner-glass-tl" />
      <div className="corner-glass corner-glass-br" />
    </div>
  )
})

export default DitherBackground
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/DitherBackground.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/DitherBackground.tsx src/components/DitherBackground.test.tsx
git commit -m "feat: add DitherBackground component with frosted glass corners"
```

---

### Task 3: Add Dither and Glass CSS Styles

**Files:**
- Modify: `src/styles/globals.css:1207-1260` (replace `.repo-card` base + `.chia-bg-*` styles)
- Modify: `src/styles/globals.css:1298-1350` (remove `.card-corner-marks` / `.card-rule-*` styles)

This task updates the card's root styles and adds the new dither-specific CSS classes. The old Chiaroscuro layers and decorative frame elements are removed.

- [ ] **Step 1: Update `.repo-card` base styles**

In `src/styles/globals.css`, find the `.repo-card` block (around line 1207) and replace:

```css
/* OLD — replace this: */
.repo-card {
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
  animation: card-in 0.18s ease forwards;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
  aspect-ratio: 3 / 4;
  background: #2a2a32;
  box-shadow: none;
}
.repo-card:hover {
  box-shadow: inset 0 0 60px rgba(0,0,0,0.25);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.18);
}
```

With:

```css
/* NEW */
.repo-card {
  border: none;
  border-radius: 0;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
  animation: card-in 0.18s ease forwards;
  transition: transform 0.2s;
  aspect-ratio: 3 / 4;
  background: #000;
}
.repo-card:hover {
  transform: translateY(-2px);
}
```

- [ ] **Step 2: Remove all `.chia-bg-*` styles**

Delete the entire block from `.chia-bg-base` through `.chia-bg-tint` (around lines 1228-1256):

```css
/* DELETE all of these: */
.chia-bg-base { ... }
.chia-bg-highlight { ... }
.chia-bg-light { ... }
.chia-bg-shadow { ... }
.chia-bg-vignette { ... }
.chia-bg-tint { ... }
```

- [ ] **Step 3: Remove decorative frame styles**

Delete the entire block for corner marks and rules (around lines 1298-1350):

```css
/* DELETE all of these: */
.card-corner-marks { ... }
.card-corner-marks::before, .card-corner-marks::after { ... }
.card-corner-marks::before { ... }
.card-corner-marks::after { ... }
.card-corner-bl, .card-corner-br { ... }
.card-corner-bl::before, .card-corner-br::before { ... }
.card-corner-bl::before { ... }
.card-corner-br::before { ... }
.card-rule-top { ... }
.card-rule-bottom { ... }
.card-rule-left { ... }
.card-rule-right { ... }
```

- [ ] **Step 4: Add dither canvas and frosted glass styles**

Add these new styles in the same area where the Chiaroscuro styles were:

```css
/* ── Dither background ────────────────────────────────────────── */
.dither-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  z-index: 0;
}

/* Frosted glass blur in corners */
.corner-glass {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  inset: 0;
  backdrop-filter: blur(24px) brightness(1.08);
  -webkit-backdrop-filter: blur(24px) brightness(1.08);
}
.corner-glass-tl {
  -webkit-mask-image: radial-gradient(ellipse 70% 70% at 0% 0%, black 0%, transparent 50%);
  mask-image: radial-gradient(ellipse 70% 70% at 0% 0%, black 0%, transparent 50%);
}
.corner-glass-br {
  -webkit-mask-image: radial-gradient(ellipse 70% 70% at 100% 100%, black 0%, transparent 50%);
  mask-image: radial-gradient(ellipse 70% 70% at 100% 100%, black 0%, transparent 50%);
}
```

- [ ] **Step 5: Add new card content layout styles**

Add these styles to replace the old `.card-art-title` and `.card-hover-overlay` blocks. Find `.card-art-title` (around line 1354) and replace through `.card-art-owner:hover` (around line 1394):

```css
/* ── Card content — bottom third ──────────────────────────────── */
.card-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 3;
  padding: 0 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-repo-name {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
  line-height: 1.1;
  text-shadow: 0 2px 20px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5);
  word-break: break-word;
}

.card-author-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-author-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.25);
  flex-shrink: 0;
}
.card-author-name {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: color 0.2s;
}
.card-author-name:hover {
  color: rgba(255,255,255,0.85);
}

.card-desc {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 6: Update keyboard focus style for sharp corners**

The shared `.kb-focused` block (around line 1259) has a multi-selector for `.repo-card`, `.repo-list-row`, `.starred-row`, etc. **Do NOT modify that shared block.** Only modify the standalone `.repo-card.kb-focused` override (around line 1268):

```css
/* OLD */
.repo-card.kb-focused {
  box-shadow: var(--shadow-md);
}
```

Replace with:

```css
/* NEW */
.repo-card.kb-focused {
  border-radius: 0;
  box-shadow: none;
}
```

- [ ] **Step 7: Update `.card-hover-overlay` to remove background gradient**

**IMPORTANT:** This must happen in the same CSS task, before RepoCard JSX is changed in Task 4, to avoid a broken intermediate state where the old gradient covers the new card-content.

Find `.card-hover-overlay` (around line 1464) and update:

```css
/* OLD */
.card-hover-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  z-index: 4;
  padding: 20px 20px 18px;
  background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 50%, transparent 100%);
  display: flex; flex-direction: column;
  transition: background 0.25s ease;
}
.repo-card:hover .card-hover-overlay {
  background: linear-gradient(0deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
}
```

Replace with:

```css
/* NEW — no gradient at rest, subtle gradient on hover for stats readability */
.card-hover-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 4;
  padding: 20px 20px 18px;
  background: none;
  display: flex;
  flex-direction: column;
  transition: background 0.25s ease;
}
.repo-card:hover .card-hover-overlay {
  background: linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
}
```

- [ ] **Step 8: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: replace chiaroscuro styles with dither canvas and glass corner CSS"
```

---

### Task 4: Update RepoCard Component

**Files:**
- Modify: `src/components/RepoCard.tsx:1-351`

This task rewires RepoCard to use the new DitherBackground component and the modern layout. It removes the decorative frame elements, the old title section, and the gradient overlay in favor of a clean bottom-third content area with large repo name and author row.

- [ ] **Step 1: Update imports**

In `src/components/RepoCard.tsx`, replace line 4:

```typescript
// OLD
import ChiaroscuroBackground from './ChiaroscuroBackground'

// NEW
import DitherBackground from './DitherBackground'
```

- [ ] **Step 2: Replace the card body JSX**

Find the return statement (line 233). Replace the entire JSX block inside the `<div className="repo-card">` — from the ChiaroscuroBackground through the end of the card-hover-overlay. The new structure is:

```tsx
return (
  <div
    ref={cardRef}
    className={`repo-card${focused ? ' kb-focused' : ''}`}
    onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
    onMouseEnter={() => { setHovered(true); ogImage.fetch() }}
    onMouseLeave={() => { setHovered(false); setTagsExpanded(false) }}
  >
    {/* Dithered halftone background */}
    <DitherBackground avatarUrl={repo.avatar_url} fallbackGradient={gradient} />

    {/* Bottom content — repo name, author, description */}
    <div className="card-content">
      <div className="card-repo-name">
        {repo.name}
        <VerificationBadge
          tier={verificationTier ?? null}
          signals={verificationSignals ?? []}
          resolving={verificationResolving}
          size="sm"
          variant="icon"
        />
      </div>
      <div className="card-author-row">
        {repo.avatar_url && (
          <img
            className="card-author-avatar"
            src={repo.avatar_url}
            alt=""
          />
        )}
        <span
          className="card-author-name"
          onClick={e => { e.stopPropagation(); onOwnerClick?.(repo.owner) }}
        >
          {repo.owner}
          {isVerified && <span style={{ color: '#fff', marginLeft: 4 }}><VerifiedBadge size={10} /></span>}
        </span>
      </div>
      {displayDescription && (
        <p className="card-desc">{parseEmoji(displayDescription)}</p>
      )}
    </div>

    {/* Hover overlay — stats, tags, OG image (expands on hover) */}
    <div className="card-hover-overlay" onClick={e => e.stopPropagation()}>
      {ogImage.ogImageUrl && imgLoaded && !imgError && (
        <div className={`og-image-preview${hovered ? ' visible' : ''}`}>
          <div className="og-image-frame">
            <img src={ogImage.ogImageUrl} alt="" />
          </div>
        </div>
      )}
      {ogImage.ogImageUrl && !imgLoaded && !imgError && (
        <img
          src={ogImage.ogImageUrl}
          alt=""
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          style={{ display: 'none' }}
        />
      )}

      <div className="card-overlay-interactive">
        <div>
          <div className="repo-card-stats">
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

          <CardTags
            tags={topics}
            onTagClick={onTagClick}
            expanded={tagsExpanded}
            onExpand={() => setTagsExpanded(true)}
            onCollapse={() => setTagsExpanded(false)}
            activeTags={activeTags}
          />

          {typeConfig && typeConfig.icon && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 5, marginTop: 4,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500,
                color: typeConfig.accentColor, opacity: 0.85,
              }}>
                {(() => { const Icon = typeConfig.icon; return <Icon size={11} /> })()}
                {typeConfig.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)
```

- [ ] **Step 3: Remove the unused `useWhitewashAvatar` import and usage**

The whitewash avatar was used for the old title icon. Remove:
- Line 5: `import { useWhitewashAvatar } from '../hooks/useWhitewashAvatar'`
- Line 177: `const whitewashSrc = useWhitewashAvatar(repo.avatar_url)`

Keep `getBucketGradient`, `getBucketColor`, `getSubTypeConfig` imports and the `gradient` computation — these are still used for the `DitherBackground fallbackGradient` prop and the hover overlay type icon. Keep `typeBucket` in the props interface since `DiscoverGrid.tsx` still passes it.

- [ ] **Step 4: Verify the app builds**

Run: `npx electron-vite build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/components/RepoCard.tsx
git commit -m "feat: replace card layout with dithered background and modern big-title design"
```

---

### Task 5: Delete ChiaroscuroBackground

**Files:**
- Delete: `src/components/ChiaroscuroBackground.tsx`

- [ ] **Step 1: Verify no other files import ChiaroscuroBackground**

Run: `grep -r "ChiaroscuroBackground" src/ --include="*.tsx" --include="*.ts"`
Expected: No matches (only RepoCard imported it, and we changed that in Task 4)

- [ ] **Step 2: Delete the file**

```bash
rm src/components/ChiaroscuroBackground.tsx
```

- [ ] **Step 3: Verify build still succeeds**

Run: `npx electron-vite build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add -A src/components/ChiaroscuroBackground.tsx
git commit -m "chore: remove ChiaroscuroBackground — replaced by DitherBackground"
```

---

### Task 6: Clean Up Unused CSS and Update Skeletons

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/components/DiscoverGrid.tsx`

Remove any remaining CSS that references the old card structure (`.card-overlay-desc`, `.card-art-owner`, `.card-art-title .avatar-icon`, `.card-art-title .name`) since these are no longer in the DOM. Also update skeleton loader styles to match the new card design.

- [ ] **Step 1: Search for orphaned selectors**

Run: `grep -n "card-art-title\|card-overlay-desc\|card-art-owner" src/styles/globals.css`

Delete any CSS blocks that match selectors no longer present in the JSX.

- [ ] **Step 2: Update skeleton loader styles in DiscoverGrid.tsx**

Find the skeleton loader div (around line 56-62 in `DiscoverGrid.tsx`) and update its inline styles to match the new card design:
- Change `borderRadius: 'var(--radius-lg)'` to `borderRadius: 0`
- Change `border: '1px solid var(--border)'` to `border: 'none'`
- Change `background` to `'#000'`

- [ ] **Step 3: Verify no visual regressions**

Run: `npx electron-vite dev`
Expected: Cards look identical to before this cleanup. No style changes.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including new dither tests.

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "chore: remove orphaned CSS from old card layout"
```

---

### Task 7: Verify End-to-End

**Files:** None (manual verification)

- [ ] **Step 1: Run full build**

Run: `npx electron-vite build`
Expected: Clean build, zero errors, zero warnings

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Visual verification**

Launch the app: `npx electron-vite dev`

Verify:
1. Navigate to Discover view
2. Cards show animated Bayer-dithered halftone backgrounds of the avatar
3. White/light areas of avatars are clean (no black dots)
4. Camera angles cycle through: straight → tight zoom A → tilt 45° → tight zoom B → centered
5. Crossfade transitions between camera angles
6. Frosted glass blur is visible in top-left and bottom-right corners
7. Card has sharp corners (no border-radius), no border, no shadow
8. Large repo name is prominent in the bottom third
9. Author row shows avatar + owner name below repo name
10. Description text appears below author
11. Hover reveals stats, tags, OG image
12. Keyboard focus outline works on cards
13. Cards in "Most Popular" and other sections also use the new style

- [ ] **Step 4: Commit any final tweaks**

```bash
git add -A
git commit -m "feat: complete dithered card redesign with Bayer halftone backgrounds"
```
