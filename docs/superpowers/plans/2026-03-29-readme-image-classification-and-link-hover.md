# README Image Classification & Link Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify README images as logo/compact or content treatment before rendering, and show a URL status bar when hovering over links.

**Architecture:** A custom rehype plugin walks the HAST tree after markdown→HTML conversion, tagging image nodes with contextual signals (`dataLinked`, `dataHeadingCtx`) and paragraphs with `dataLogoRow`. A pure classifier function translates these signals into a treatment decision. The React `img` renderer then applies the appropriate CSS and click behaviour. A hover state on the `a` renderer drives a fixed-position status bar element styled like a browser URL preview.

**Tech Stack:** react-markdown v10, unist-util-visit (already a transitive dep), vitest, React Testing Library

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/badgeParser.ts` | Modify | Export `looksLikeBadgeUrl` (currently private) |
| `src/utils/imageClassifier.ts` | **Create** | Pure `classifyImage()` function + signal types |
| `src/utils/imageClassifier.test.ts` | **Create** | Unit tests for classification heuristics |
| `src/components/ReadmeRenderer.tsx` | Modify | Rehype plugin, updated renderers, status bar state |
| `src/components/ReadmeRenderer.test.tsx` | **Create** | Component integration tests for classification + hover |
| `src/styles/globals.css` | Modify | New CSS classes: `rm-img-logo`, `rm-img-content`, `rm-logo-row`, `rm-status-bar` |

---

## Edge Cases to Know Before Implementing

1. **rehype-sanitize strips unknown attributes.** The rehype plugin must run **after** `rehypeSanitize` so that `dataLinked`, `dataHeadingCtx`, `dataLogoRow` are not stripped. Plugin order: `[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeImageClassifier]`.

2. **HAST property naming.** In HAST, `data-foo-bar` attributes are stored as `fooBar` camelCase properties. Set `node.properties.dataLinked = true` in the plugin; read `node.properties?.dataLinked` in the component.

3. **Logo images must not trigger the lightbox.** Only content-treatment images should be click-to-expand. Logo images are already inside `<a>` tags in most cases — the existing `a` renderer already opens those links externally. Logo images without an anchor get no click handler at all.

4. **`rm-img` CSS is referenced widely.** Keep the existing `rm-img` selector unchanged. The new `rm-img-logo` and `rm-img-content` classes are additive — the img renderer will use these new classes, dropping the old `rm-img rm-img-clickable` combination only on the component side.

5. **`unist-util-visit` is a transitive dep, not a declared dep.** Import it without adding to `package.json`. If it ever breaks, add it explicitly. The import path is `'unist-util-visit'`.

6. **HAST `text` nodes have a `value` property, not `children`.** When extracting text from heading nodes, check `c.type === 'text'` and use `(c as Text).value`.

7. **Aspect-ratio post-load fires asynchronously.** The `onLoad` path causes a second render for any image that turns out to be wide-and-short. This is intentional and only happens once per image per mount.

8. **Status bar is `position: fixed`.** Since `.repo-detail-tab-body` is the scroll container and `ReadmeRenderer` is a child of it, a `position: absolute; bottom: 0` wouldn't stick to the visible viewport. Fixed positioning at `bottom: 0; left: 0` (browser status bar position) is the correct approach for Electron.

---

## Task 1: Export `looksLikeBadgeUrl` from `badgeParser.ts`

`classifyImage()` in the next task needs badge-domain detection. Rather than duplicating the domain list, export the existing private function.

**Files:**
- Modify: `src/utils/badgeParser.ts:67`

- [ ] **Step 1: Write a failing test for the export**

Add to a new file `src/utils/badgeParser.test.ts` (create it):

```typescript
import { describe, it, expect } from 'vitest'
import { looksLikeBadgeUrl } from './badgeParser'

describe('looksLikeBadgeUrl', () => {
  it('returns true for shields.io URLs', () => {
    expect(looksLikeBadgeUrl('https://img.shields.io/npm/v/react')).toBe(true)
  })
  it('returns false for PNG screenshots', () => {
    expect(looksLikeBadgeUrl('https://raw.githubusercontent.com/owner/repo/main/docs/screenshot.png')).toBe(false)
  })
  it('returns false for SVG logos not from badge services', () => {
    expect(looksLikeBadgeUrl('https://example.com/logo.svg')).toBe(false)
  })
  it('returns true for GitHub Actions badge SVGs', () => {
    expect(looksLikeBadgeUrl('https://github.com/owner/repo/actions/workflows/ci.yml/badge.svg')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm it fails (export not public yet)**

```
npx vitest run src/utils/badgeParser.test.ts
```

Expected: `SyntaxError` or "does not provide an export named 'looksLikeBadgeUrl'"

- [ ] **Step 3: Export the function**

In `src/utils/badgeParser.ts`, line 67, change:

```typescript
function looksLikeBadgeUrl(url: string): boolean {
```

to:

```typescript
export function looksLikeBadgeUrl(url: string): boolean {
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run src/utils/badgeParser.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/badgeParser.ts src/utils/badgeParser.test.ts
git commit -m "feat: export looksLikeBadgeUrl from badgeParser for reuse"
```

---

## Task 2: Create `imageClassifier.ts`

A pure function with zero React dependencies. Takes contextual signals, returns a treatment string.

**Files:**
- Create: `src/utils/imageClassifier.ts`
- Create: `src/utils/imageClassifier.test.ts`

- [ ] **Step 1: Write the test file first**

Create `src/utils/imageClassifier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { classifyImage } from './imageClassifier'

describe('classifyImage', () => {
  const base = { src: 'https://example.com/image.png', isLinked: false, nearestHeadingText: '' }

  // ── Signal: linked image ──────────────────────────────────────────
  it('classifies a linked image as logo', () => {
    expect(classifyImage({ ...base, isLinked: true })).toBe('logo')
  })

  it('classifies an unlinked image with no context as content', () => {
    expect(classifyImage(base)).toBe('content')
  })

  // ── Signal: sponsor heading context ──────────────────────────────
  it('classifies as logo when nearest heading contains "sponsors"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Our Sponsors' })).toBe('logo')
  })
  it('classifies as logo when nearest heading contains "backers"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Backers' })).toBe('logo')
  })
  it('classifies as logo when nearest heading contains "built with"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Built With' })).toBe('logo')
  })
  it('classifies as logo when nearest heading contains "thanks to"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Thanks to' })).toBe('logo')
  })
  it('does NOT classify as logo for unrelated heading', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Installation' })).toBe('content')
  })

  // ── Signal: badge domain ──────────────────────────────────────────
  it('classifies a shields.io image as logo', () => {
    expect(classifyImage({ ...base, src: 'https://img.shields.io/npm/v/foo' })).toBe('logo')
  })
  it('classifies a badgen.net image as logo', () => {
    expect(classifyImage({ ...base, src: 'https://badgen.net/badge/version/1.0.0/green' })).toBe('logo')
  })

  // ── Signal: declared dimensions ──────────────────────────────────
  it('classifies as logo when declared width/height gives >2.5 ratio and height <120', () => {
    expect(classifyImage({ ...base, declaredWidth: 400, declaredHeight: 80 })).toBe('logo')
  })
  it('does NOT classify as logo when height is too tall', () => {
    expect(classifyImage({ ...base, declaredWidth: 400, declaredHeight: 150 })).toBe('content')
  })
  it('does NOT classify as logo when ratio is square-ish', () => {
    expect(classifyImage({ ...base, declaredWidth: 200, declaredHeight: 150 })).toBe('content')
  })
  it('ignores dimensions when only one is provided', () => {
    expect(classifyImage({ ...base, declaredWidth: 400 })).toBe('content')
  })
})
```

- [ ] **Step 2: Run to confirm they all fail**

```
npx vitest run src/utils/imageClassifier.test.ts
```

Expected: All 13 tests FAIL — module not found.

- [ ] **Step 3: Implement `imageClassifier.ts`**

Create `src/utils/imageClassifier.ts`:

```typescript
import { looksLikeBadgeUrl } from './badgeParser'

export type ImageTreatment = 'logo' | 'content'

export interface ImageContext {
  src:               string
  isLinked:          boolean
  nearestHeadingText: string
  declaredWidth?:    number
  declaredHeight?:   number
}

const SPONSOR_HEADING_KEYWORDS = [
  'sponsor', 'backer', 'supporter', 'built with', 'thanks to',
  'made by', 'powered by', 'contributors', 'partner',
]

export function classifyImage(ctx: ImageContext): ImageTreatment {
  // 1. Known badge domain
  if (ctx.src && looksLikeBadgeUrl(ctx.src)) return 'logo'

  // 2. Linked image (wrapped in <a>)
  if (ctx.isLinked) return 'logo'

  // 3. Sponsor/partner heading context
  const heading = ctx.nearestHeadingText.toLowerCase()
  if (SPONSOR_HEADING_KEYWORDS.some(kw => heading.includes(kw))) return 'logo'

  // 4. Declared dimensions: wide-and-short banner/logo
  if (ctx.declaredWidth !== undefined && ctx.declaredHeight !== undefined) {
    const ratio = ctx.declaredWidth / ctx.declaredHeight
    if (ratio > 2.5 && ctx.declaredHeight < 120) return 'logo'
  }

  return 'content'
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run src/utils/imageClassifier.test.ts
```

Expected: 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/imageClassifier.ts src/utils/imageClassifier.test.ts
git commit -m "feat: add imageClassifier utility with heuristic classification"
```

---

## Task 3: Add CSS for new image treatments

No new logic — just the styles. Writing these first means the component tests in Task 4 can assert on class names without depending on CSS loading (JSDOM ignores CSS anyway, so the class names are what matter in tests).

**Files:**
- Modify: `src/styles/globals.css` (append to the `rm-*` section around line 1803)

- [ ] **Step 1: Add the new CSS classes**

Find the block containing `.rm-img` (around line 1803 in globals.css) and add the following immediately after `.rm-img-clickable:hover`:

```css
/* ── Logo treatment: inline, constrained height ── */
.rm-img-logo {
  display: inline-block;
  height: auto;
  max-height: 100px;
  width: auto;
  max-width: 200px;
  object-fit: contain;
  vertical-align: middle;
  margin: 4px 4px 4px 0;
}

/* ── Content treatment: block, subtle framing, zoom cursor ── */
.rm-img-content {
  display: block;
  max-width: min(90%, 640px);
  height: auto;
  max-height: 480px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid var(--border);
  margin: 10px 0;
  cursor: zoom-in;
  transition: opacity 0.15s;
}
.rm-img-content:hover { opacity: 0.88; }

/* ── Logo row paragraph: flexbox flow for sponsor grids ── */
.rm-logo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 8px 0;
}

/* ── Link hover status bar (browser-style URL preview) ── */
.rm-status-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  max-width: 50vw;
  padding: 3px 12px 3px 10px;
  background: var(--bg3);
  border-top: 1px solid var(--border2);
  border-right: 1px solid var(--border2);
  border-radius: 0 4px 0 0;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t2);
  z-index: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  animation: rm-status-in 0.1s ease;
}

@keyframes rm-status-in {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add CSS for logo/content image treatments and status bar"
```

---

## Task 4: Add rehype plugin and update renderers in `ReadmeRenderer.tsx`

This is the core task. It wires the classifier into the rendering pipeline.

**Files:**
- Create: `src/components/ReadmeRenderer.test.tsx`
- Modify: `src/components/ReadmeRenderer.tsx`

### Step group A: write failing tests first

- [ ] **Step 1: Create `ReadmeRenderer.test.tsx`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import ReadmeRenderer from './ReadmeRenderer'

// window.api.openExternal is called inside the <a> onClick handler.
// We stub it so any test that triggers a click (or future tests) won't throw.
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: { openExternal: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
})

// JSDOM doesn't fire onLoad, so post-load refinement is not tested here
// (covered separately in Task 5).

const defaultProps = {
  repoOwner: 'owner',
  repoName: 'repo',
  branch: 'main',
}

function renderMd(content: string) {
  return render(<ReadmeRenderer {...defaultProps} content={content} />)
}

// ── Image classification ──────────────────────────────────────────────

describe('image classification', () => {
  it('renders a linked image with rm-img-logo class', async () => {
    const { container } = renderMd('[![Logo](https://example.com/logo.png)](https://example.com)')
    const img = container.querySelector('img')
    expect(img?.className).toContain('rm-img-logo')
  })

  it('does NOT add rm-img-clickable to a linked image', async () => {
    const { container } = renderMd('[![Logo](https://example.com/logo.png)](https://example.com)')
    const img = container.querySelector('img')
    expect(img?.className).not.toContain('rm-img-clickable')
  })

  it('renders a standalone image under a sponsor heading with rm-img-logo', async () => {
    const md = '## Sponsors\n\n![logo](https://example.com/logo.png)'
    const { container } = renderMd(md)
    const img = container.querySelector('img')
    expect(img?.className).toContain('rm-img-logo')
  })

  it('renders a standalone image under an unrelated heading with rm-img-content', async () => {
    const md = '## Installation\n\n![screenshot](https://example.com/screen.png)'
    const { container } = renderMd(md)
    const img = container.querySelector('img')
    expect(img?.className).toContain('rm-img-content')
  })

  it('renders an unlinked image with no context as rm-img-content', async () => {
    const { container } = renderMd('![screenshot](https://example.com/screen.png)')
    const img = container.querySelector('img')
    expect(img?.className).toContain('rm-img-content')
  })

  it('applies rm-logo-row to a paragraph containing only linked images', async () => {
    const md = [
      '[![a](https://example.com/a.png)](https://a.com)',
      '[![b](https://example.com/b.png)](https://b.com)',
    ].join(' ')
    const { container } = renderMd(md)
    const p = container.querySelector('p')
    expect(p?.className).toContain('rm-logo-row')
  })

  it('does NOT apply rm-logo-row to a paragraph with mixed content', async () => {
    const md = 'Some text and [![img](https://example.com/a.png)](https://a.com)'
    const { container } = renderMd(md)
    const p = container.querySelector('p')
    expect(p?.className).not.toContain('rm-logo-row')
  })
})

// ── Link hover status bar ─────────────────────────────────────────────

describe('link hover status bar', () => {
  it('shows no status bar initially', () => {
    const { container } = renderMd('[link text](https://example.com)')
    expect(container.querySelector('.rm-status-bar')).toBeNull()
  })

  it('shows status bar with URL on link mouseenter', async () => {
    const { container } = renderMd('[link text](https://example.com/page)')
    const link = container.querySelector('a')!
    link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    const bar = container.querySelector('.rm-status-bar')
    expect(bar).not.toBeNull()
    expect(bar?.textContent).toBe('https://example.com/page')
  })

  it('hides status bar on link mouseleave', async () => {
    const { container } = renderMd('[link text](https://example.com/page)')
    const link = container.querySelector('a')!
    link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    link.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    expect(container.querySelector('.rm-status-bar')).toBeNull()
  })

  it('does not show status bar for anchor links (#hash)', () => {
    const { container } = renderMd('[section](#install)')
    const link = container.querySelector('a')!
    link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    // anchor links have no http prefix — should not display
    const bar = container.querySelector('.rm-status-bar')
    // bar may appear but should not contain an http URL
    if (bar) {
      expect(bar.textContent).not.toMatch(/^https?:\/\//)
    }
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```
npx vitest run src/components/ReadmeRenderer.test.tsx
```

Expected: Multiple failures — `rm-img-logo`, `rm-img-content`, `rm-logo-row`, `rm-status-bar` don't exist yet.

### Step group B: implement the changes

- [ ] **Step 3: Add imports to `ReadmeRenderer.tsx`**

At the top of the file, after the existing imports, add:

```typescript
import { visit, SKIP } from 'unist-util-visit'
import type { Root, Element, Text } from 'hast'
import { classifyImage } from '../utils/imageClassifier'
```

- [ ] **Step 4: Add the rehype plugin function**

Add this function immediately before the `sanitizeSchema` definition (before line 9):

```typescript
// ── HAST text extraction helper ────────────────────────────────────
function extractNodeText(node: Element): string {
  return node.children
    .map(c => {
      if (c.type === 'text') return (c as Text).value
      if (c.type === 'element') return extractNodeText(c as Element)
      return ''
    })
    .join('')
}

// ── Rehype plugin: tag images with contextual classification signals ──
// Runs AFTER rehype-sanitize so data-* properties are not stripped.
function rehypeImageClassifier() {
  return (tree: Root) => {
    let lastHeadingText = ''

    visit(tree, 'element', (node: Element) => {
      // Track the most-recently-seen h2/h3 heading text
      if (node.tagName === 'h2' || node.tagName === 'h3') {
        lastHeadingText = extractNodeText(node)
        return
      }

      // Tag img children of <a> as linked, then skip subtree to avoid
      // visiting the img child again through the img branch below.
      if (node.tagName === 'a') {
        const imgChild = node.children.find(
          (c): c is Element => c.type === 'element' && (c as Element).tagName === 'img'
        )
        if (imgChild) {
          imgChild.properties = imgChild.properties ?? {}
          imgChild.properties.dataLinked = true
          imgChild.properties.dataHeadingCtx = lastHeadingText
        }
        return SKIP
      }

      // Tag every <img> with its heading context (linked imgs are already tagged
      // and skipped via SKIP in the <a> handler above)
      if (node.tagName === 'img') {
        node.properties = node.properties ?? {}
        if (node.properties.dataHeadingCtx === undefined) {
          node.properties.dataHeadingCtx = lastHeadingText
        }
        return
      }

      // Tag paragraphs whose non-whitespace content is entirely linked images
      if (node.tagName === 'p') {
        const significant = node.children.filter(
          c => !(c.type === 'text' && (c as Text).value.trim() === '')
        )
        const allLinkedImgs =
          significant.length > 0 &&
          significant.every(c => {
            if (c.type !== 'element') return false
            const el = c as Element
            return (
              el.tagName === 'a' &&
              el.children.length === 1 &&
              el.children[0].type === 'element' &&
              (el.children[0] as Element).tagName === 'img'
            )
          })
        if (allLinkedImgs) {
          node.properties = node.properties ?? {}
          node.properties.dataLogoRow = true
        }
      }
    })
  }
}
```

- [ ] **Step 5: Update the `rehypePlugins` array**

In `ReadmeRenderer`, change:

```typescript
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
```

to:

```typescript
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeImageClassifier]}
```

- [ ] **Step 6: Add `hoveredUrl` state**

In the `ReadmeRenderer` function body, after the `lightbox` state declaration, add:

```typescript
const [hoveredUrl, setHoveredUrl] = useState<string | null>(null)
```

- [ ] **Step 7: Update the `img` component renderer**

Replace the existing `img:` entry in the `components` object with:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
img: ({ src, alt, node }: any) => {
  const isLinked = node?.properties?.dataLinked === true
  const headingCtx = (node?.properties?.dataHeadingCtx as string) ?? ''
  const declaredWidth  = typeof node?.properties?.width  === 'number' ? node.properties.width  : parseInt(String(node?.properties?.width  ?? '')) || undefined
  const declaredHeight = typeof node?.properties?.height === 'number' ? node.properties.height : parseInt(String(node?.properties?.height ?? '')) || undefined

  const treatment = classifyImage({
    src: src ?? '',
    isLinked,
    nearestHeadingText: headingCtx,
    declaredWidth,
    declaredHeight,
  })

  if (treatment === 'logo') {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        className="rm-img-logo"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }

  // Content treatment
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className="rm-img-content"
      onClick={() => src && setLightbox({ src, alt: alt ?? '' })}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
},
```

- [ ] **Step 8: Update the `p` component renderer**

Replace the existing `p:` entry with:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
p: ({ children, node }: any) => {
  const isLogoRow = node?.properties?.dataLogoRow === true
  return <p className={isLogoRow ? 'rm-logo-row' : 'rm-p'}>{children}</p>
},
```

- [ ] **Step 9: Update the `a` component renderer to drive the status bar**

Replace the existing `a:` entry with:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
a: ({ href, children }: any) => (
  <a
    className="rm-link"
    href={href}
    onMouseEnter={() => setHoveredUrl(href ?? null)}
    onMouseLeave={() => setHoveredUrl(null)}
    onClick={(e) => {
      e.preventDefault()
      if (!href) return
      if (href.startsWith('http://') || href.startsWith('https://')) {
        window.api.openExternal(href)
      }
    }}
  >
    {children}
  </a>
),
```

- [ ] **Step 10: Add the status bar element to the render output**

In the return JSX of `ReadmeRenderer`, inside `<div className="readme-body">`, add the status bar just before the closing `</div>` of `readme-body`:

```tsx
{hoveredUrl && (
  <div className="rm-status-bar">{hoveredUrl}</div>
)}
```

The full structure of the return should end like:

```tsx
    </div>

    {lightbox && (
      <div className="rm-lightbox" ...>
        ...
      </div>
    )}

    {hoveredUrl && (
      <div className="rm-status-bar">{hoveredUrl}</div>
    )}
  </div>   {/* readme-body */}
```

- [ ] **Step 11: Run all tests to confirm they pass**

```
npx vitest run src/components/ReadmeRenderer.test.tsx
```

Expected: All tests PASS (note: `mouseenter`/`mouseleave` tests require `bubbles: true` on the event, which is already in the test code above).

- [ ] **Step 12: Run the full test suite**

```
npm test
```

Expected: All existing tests still pass.

- [ ] **Step 13: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: classify README images as logo/content and add link hover status bar"
```

---

## Task 5: Post-load aspect ratio refinement

Catches images that weren't classified as logo at render time (no linked/heading/dimension signals) but turn out to be wide-and-short after loading — e.g. standalone sponsor logos without anchor tags.

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Add a test for the post-load path**

Add to `ReadmeRenderer.test.tsx`, inside a new `describe` block:

```typescript
describe('post-load aspect ratio refinement', () => {
  it('upgrades a wide-and-short content image to logo class after onLoad fires', () => {
    const { container } = renderMd('![wide banner](https://example.com/banner.png)')
    const img = container.querySelector('img')!

    // Simulate a wide-and-short image loading (JSDOM doesn't actually load images)
    Object.defineProperty(img, 'naturalWidth',  { value: 500, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 40,  configurable: true })
    img.dispatchEvent(new Event('load'))

    // After the state update, the img should have the logo class
    expect(img.className).toContain('rm-img-logo')
  })

  it('does NOT upgrade a tall image after onLoad', () => {
    const { container } = renderMd('![diagram](https://example.com/diagram.png)')
    const img = container.querySelector('img')!
    Object.defineProperty(img, 'naturalWidth',  { value: 600, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true })
    img.dispatchEvent(new Event('load'))
    expect(img.className).not.toContain('rm-img-logo')
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose
```

Expected: The 2 new post-load tests FAIL.

- [ ] **Step 3: Add `logoUrls` state and onLoad handler**

In `ReadmeRenderer`, add state after `hoveredUrl`:

```typescript
const [logoUrls, setLogoUrls] = useState<Set<string>>(new Set())
```

- [ ] **Step 4: Update the content-treatment img to use onLoad refinement**

In the `img` renderer, after determining `treatment === 'content'`, the returned JSX becomes:

```tsx
const isUpgraded = src ? logoUrls.has(src) : false

if (treatment === 'logo' || isUpgraded) {
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className="rm-img-logo"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
}

// Content treatment with post-load upgrade check
return (
  <img
    src={src}
    alt={alt ?? ''}
    className="rm-img-content"
    onClick={() => src && setLightbox({ src, alt: alt ?? '' })}
    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    onLoad={(e) => {
      const el = e.target as HTMLImageElement
      const ratio = el.naturalWidth / el.naturalHeight
      if (ratio > 3 && el.naturalHeight < 80 && src) {
        setLogoUrls(prev => new Set([...prev, src]))
      }
    }}
  />
)
```

Note: The `isUpgraded` check must be placed **before** the content-treatment return, and the logo-treatment branch is merged with the upgraded check. Restructure the img renderer as one block:

```tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
img: ({ src, alt, node }: any) => {
  const isLinked = node?.properties?.dataLinked === true
  const headingCtx = (node?.properties?.dataHeadingCtx as string) ?? ''
  const declaredWidth  = typeof node?.properties?.width  === 'number' ? node.properties.width  : parseInt(String(node?.properties?.width  ?? '')) || undefined
  const declaredHeight = typeof node?.properties?.height === 'number' ? node.properties.height : parseInt(String(node?.properties?.height ?? '')) || undefined

  const treatment = classifyImage({ src: src ?? '', isLinked, nearestHeadingText: headingCtx, declaredWidth, declaredHeight })
  const isUpgraded = src ? logoUrls.has(src) : false

  if (treatment === 'logo' || isUpgraded) {
    return (
      <img src={src} alt={alt ?? ''} className="rm-img-logo"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
    )
  }

  return (
    <img src={src} alt={alt ?? ''} className="rm-img-content"
      onClick={() => src && setLightbox({ src, alt: alt ?? '' })}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      onLoad={(e) => {
        const el = e.target as HTMLImageElement
        if (el.naturalWidth / el.naturalHeight > 3 && el.naturalHeight < 80 && src) {
          setLogoUrls(prev => new Set([...prev, src]))
        }
      }}
    />
  )
},
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/components/ReadmeRenderer.test.tsx
```

Expected: All tests PASS (note: the post-load test dispatches `load` events synchronously on the DOM node — in React Testing Library this triggers the `onLoad` prop, causing a state update).

If the post-load tests fail because the state update isn't picked up synchronously, wrap the assertion in `waitFor`:

```typescript
import { waitFor } from '@testing-library/react'
// ...
await waitFor(() => {
  expect(img.className).toContain('rm-img-logo')
})
```

- [ ] **Step 6: Run full test suite**

```
npm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: upgrade wide-and-short images to logo treatment post-load"
```

---

## Scope note

The link hover status bar (state, `a` renderer updates, and status bar element) was implemented in Task 4 Steps 6, 9, and 10. No separate task is needed — it is fully covered there.

---

## Known limitations / follow-up opportunities

- **Anchor-only images inside table cells** are not currently detected as logo rows (the `dataLogoRow` paragraph check only matches `<p>` tags). This is an acceptable edge case.
- **Very tall content images** (e.g. infographics) are capped at `max-height: 480px` by the content CSS but this means they may be squished with `object-fit: contain`. Consider `overflow: auto` or a scroll wrapper for extremely tall images in a future pass.
- **The status bar uses `position: fixed`**, which means it sits at the bottom-left of the OS window regardless of which pane is active. If future layouts have multiple simultaneous panels with links, this should be scoped to a containing element via a portal.
- **`unist-util-visit` is a transitive dependency.** If the dependency tree changes and it is removed, add it explicitly: `npm install -D unist-util-visit`.
