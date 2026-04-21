# Webpage Link Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover popovers to all external links in ReadmeRenderer, showing favicon, domain, title, description, og:image, and URL — fetched via Electron IPC and cached in a module-level singleton.

**Architecture:** A new `linkPreviewFetcher.ts` utility handles caching and IPC calls. A new `ipcMain.handle('fetch-link-preview')` in `electron/main.ts` uses `net.fetch` to fetch HTML and parse OG/meta tags. `ReadmeRenderer.tsx` gains a `rehypeImageOnlyLinks` rehype plugin, new state/refs for hover tracking, hover handlers on the `a` override, and a `LinkPreviewPopover` component rendered at the root of the return tree alongside the existing YouTube popover.

**Tech Stack:** TypeScript, React, Electron (`net` module, IPC), ReactMarkdown, HAST (`unist-util-visit`), Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/utils/linkPreviewFetcher.ts` | **Create** | Module-level cache + IPC call wrapper |
| `src/utils/linkPreviewFetcher.test.ts` | **Create** | Unit tests for cache and dedup behaviour |
| `electron/main.ts` | **Modify** | Add `fetch-link-preview` IPC handler |
| `electron/preload.ts` | **Modify** | Expose `window.api.linkPreview.fetch` via contextBridge |
| `src/env.d.ts` | **Modify** | Add `linkPreview` TypeScript types to `Window.api` |
| `src/components/ReadmeRenderer.tsx` | **Modify** | Plugin, state, hover handlers, popover component |
| `src/components/ReadmeRenderer.test.tsx` | **Modify** | Integration tests for hover behaviour |
| `src/styles/globals.css` | **Modify** | `.rm-link-popover*` CSS classes |

---

## Task 1: Cache Singleton (`linkPreviewFetcher.ts`)

**Files:**
- Create: `src/utils/linkPreviewFetcher.ts`
- Create: `src/utils/linkPreviewFetcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/linkPreviewFetcher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock window.api before importing the module under test
const mockFetch = vi.fn()
Object.defineProperty(globalThis, 'window', {
  value: { api: { linkPreview: { fetch: mockFetch } } },
  writable: true,
})

// Import AFTER mock is set up so module-level code sees the mock
const { fetchLinkPreview, getCachedPreview } = await import('./linkPreviewFetcher')

const emptyResult = { title: '', description: '', imageUrl: '', faviconUrl: '', domain: '' }

beforeEach(() => {
  mockFetch.mockResolvedValue(emptyResult)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('getCachedPreview', () => {
  it('returns undefined for an uncached URL', () => {
    expect(getCachedPreview('https://never-fetched.com')).toBeUndefined()
  })
})

describe('fetchLinkPreview', () => {
  it('calls window.api.linkPreview.fetch and returns result', async () => {
    const result = await fetchLinkPreview('https://example.com/a')
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/a')
    expect(result).toEqual(emptyResult)
  })

  it('caches result — second call does NOT invoke IPC', async () => {
    await fetchLinkPreview('https://example.com/cached')
    mockFetch.mockClear()
    const result = await fetchLinkPreview('https://example.com/cached')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResult)
  })

  it('getCachedPreview returns result after fetch', async () => {
    await fetchLinkPreview('https://example.com/sync')
    expect(getCachedPreview('https://example.com/sync')).toEqual(emptyResult)
  })

  it('in-flight deduplication: concurrent calls produce one IPC call', async () => {
    const [r1, r2] = await Promise.all([
      fetchLinkPreview('https://example.com/dedup'),
      fetchLinkPreview('https://example.com/dedup'),
    ])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
  })

  it('on IPC error, returns empty-string result without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'))
    const result = await fetchLinkPreview('https://example.com/error')
    expect(result).toEqual(emptyResult)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/Coding/Git-Suite
npx vitest run src/utils/linkPreviewFetcher.test.ts
```

Expected: errors — module not found.

- [ ] **Step 3: Create `src/utils/linkPreviewFetcher.ts`**

```ts
// ── Link preview cache + IPC bridge ──────────────────────────────────────────
// Module-level singleton: survives React re-renders, shared across all
// ReadmeRenderer instances in the same renderer process.

export interface LinkPreviewResult {
  title:       string
  description: string
  imageUrl:    string
  faviconUrl:  string
  domain:      string
}

const EMPTY: LinkPreviewResult = { title: '', description: '', imageUrl: '', faviconUrl: '', domain: '' }

const cache    = new Map<string, LinkPreviewResult>()
const inflight = new Map<string, Promise<LinkPreviewResult>>()

/** Synchronous cache read — returns undefined if not yet fetched. */
export function getCachedPreview(url: string): LinkPreviewResult | undefined {
  return cache.get(url)
}

/**
 * Fetch link preview metadata for `url`.
 * - Returns cached value immediately if already fetched.
 * - Deduplicates concurrent requests for the same URL (one IPC call max).
 * - Never throws — returns empty strings on any error.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewResult> {
  const cached = cache.get(url)
  if (cached) return cached

  const existing = inflight.get(url)
  if (existing) return existing

  const promise = (async () => {
    try {
      const result = await window.api.linkPreview.fetch(url)
      cache.set(url, result)
      return result
    } catch {
      const fallback = { ...EMPTY }
      cache.set(url, fallback)
      return fallback
    } finally {
      inflight.delete(url)
    }
  })()

  inflight.set(url, promise)
  return promise
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/utils/linkPreviewFetcher.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/linkPreviewFetcher.ts src/utils/linkPreviewFetcher.test.ts
git commit -m "feat: add linkPreviewFetcher cache singleton with IPC bridge"
```

---

## Task 2: IPC Handler in Main Process

**Files:**
- Modify: `electron/main.ts` (add `net` import + new handler near the end of the IPC block)

- [ ] **Step 1: Add `net` to the Electron import in `electron/main.ts`**

Find the first line of `electron/main.ts`:
```ts
import { app, BrowserWindow, ipcMain, shell, protocol } from 'electron'
```
Change to:
```ts
import { app, BrowserWindow, ipcMain, shell, protocol, net } from 'electron'
```

- [ ] **Step 2: Add the IPC handler**

Find the last `ipcMain.handle(...)` call in the file (search for the final occurrence) and append the new handler after it:

```ts
// ── Link preview metadata fetch ───────────────────────────────────────────
ipcMain.handle('fetch-link-preview', async (_event, url: string) => {
  const EMPTY = { title: '', description: '', imageUrl: '', faviconUrl: '', domain: '' }

  let domain = ''
  try { domain = new URL(url).hostname } catch { return EMPTY }

  try {
    const res = await net.fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return { ...EMPTY, domain }

    // Read at most 100 KB — <head> is always within that
    const reader = res.body?.getReader()
    if (!reader) return { ...EMPTY, domain }
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < 100_000) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.length
    }
    reader.cancel().catch(() => {})
    const html = new TextDecoder().decode(
      chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c })
    )

    // Only parse up to </head> or <body
    const headEnd = html.search(/<\/head>|<body[\s>]/i)
    const head = headEnd > -1 ? html.slice(0, headEnd) : html

    const og  = (prop: string) => head.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]
                               ?? head.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'))?.[1]
                               ?? ''
    const meta = (name: string) => head.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]
                                ?? head.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'))?.[1]
                                ?? ''
    const title       = og('title') || head.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || ''
    const description = og('description') || meta('description')
    let   imageUrl    = og('image')
    const faviconRaw  = head.match(/<link[^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]
                     ?? head.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["']/i)?.[1]
                     ?? ''

    // Resolve relative URLs
    const origin = new URL(url).origin
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = imageUrl.startsWith('/') ? `${origin}${imageUrl}` : `${origin}/${imageUrl}`
    }
    const faviconUrl = faviconRaw
      ? (faviconRaw.startsWith('http') ? faviconRaw : faviconRaw.startsWith('/') ? `${origin}${faviconRaw}` : `${origin}/${faviconRaw}`)
      : `${origin}/favicon.ico`

    return { title, description, imageUrl, faviconUrl, domain }
  } catch {
    return { ...EMPTY, domain }
  }
})
```

- [ ] **Step 3: Verify TypeScript compiles (no type errors)**

```bash
cd D:/Coding/Git-Suite
npx tsc --noEmit
```

Expected: no errors related to `net` or the new handler.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add fetch-link-preview IPC handler using net.fetch"
```

---

## Task 3: Preload Bridge + TypeScript Types

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add `linkPreview` to `electron/preload.ts`**

In `electron/preload.ts`, find the `contextBridge.exposeInMainWorld('api', {` block. Add `linkPreview` as the last entry before the closing `})`:

```ts
  linkPreview: {
    fetch: (url: string) => ipcRenderer.invoke('fetch-link-preview', url),
  },
```

- [ ] **Step 2: Add `linkPreview` types to `src/env.d.ts`**

In `src/env.d.ts`, find the `interface Window { api: {` block and add `linkPreview` as the last entry before the closing `}`:

```ts
      linkPreview: {
        fetch: (url: string) => Promise<import('./utils/linkPreviewFetcher').LinkPreviewResult>
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors on `window.api.linkPreview`.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/env.d.ts
git commit -m "feat: expose linkPreview IPC bridge via contextBridge and env.d.ts types"
```

---

## Task 4: `rehypeImageOnlyLinks` Plugin

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Write the failing test**

In `ReadmeRenderer.test.tsx`, find the `describe` block for YouTube tests (or add a new `describe('link preview', ...)` block) and add:

```ts
it('image-only links get data-img-only stamped and no link preview popover', async () => {
  const { container } = render(
    <ReadmeRenderer
      content={'[![badge](https://img.shields.io/badge/test-passing-green)](https://example.com)'}
      repoOwner="owner" repoName="repo" branch="main"
    />
  )
  // The <a> wrapping the image should carry data-img-only
  const link = container.querySelector('a[data-img-only]')
  expect(link).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `a[data-img-only]` not found.

- [ ] **Step 3: Add `rehypeImageOnlyLinks` to `ReadmeRenderer.tsx`**

After the `rehypeFootnoteLinks` function definition (around line 329 in the file), add the new plugin:

```ts
// ── Rehype plugin: stamp image-only <a> elements ──────────────────────────
// Runs AFTER rehype-sanitize so data-* properties are not stripped.
// Purpose: lets the `a` component override skip the link preview popover
// for linked images. Note: rehypeFootnoteLinks already has its own allImages
// guard — this stamp is only for the render-time popover guard.
function rehypeImageOnlyLinks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return
      const significant = node.children.filter(
        c => !(c.type === 'text' && (c as Text).value.trim() === '')
      )
      const allImages = significant.length > 0 && significant.every(
        c => c.type === 'element' && (c as Element).tagName === 'img'
      )
      if (allImages) {
        node.properties = node.properties ?? {}
        node.properties.dataImgOnly = true
      }
    })
  }
}
```

Then find the `rehypePlugins` array in the `<ReactMarkdown>` JSX (around line 965) and add `rehypeImageOnlyLinks` as the last entry:

```ts
// Before:
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks, rehypeFootnoteLinks]}
// After:
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks, rehypeFootnoteLinks, rehypeImageOnlyLinks]}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | grep -E "PASS|FAIL|image-only"
```

Expected: PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: add rehypeImageOnlyLinks plugin to stamp data-img-only on image-wrapped links"
```

---

## Task 5: State, Refs, and Hover Handlers on `a` Override

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `ReadmeRenderer.test.tsx` (in a new `describe('link preview popover', () => {` block). Note these tests use fake timers:

```ts
describe('link preview popover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('external link renders <a> without popover before hover', () => {
    const { container } = render(
      <ReadmeRenderer content={'[visit](https://example.com)'} repoOwner="o" repoName="r" branch="main" />
    )
    expect(container.querySelector('.rm-link-popover')).toBeNull()
  })

  it('popover appears after 300ms hover on external link', async () => {
    const { container } = render(
      <ReadmeRenderer content={'[visit](https://example.com)'} repoOwner="o" repoName="r" branch="main" />
    )
    const link = container.querySelector('a.rm-link')!
    fireEvent.mouseEnter(link)
    await vi.advanceTimersByTimeAsync(300)
    // wait for the mock fetch promise to resolve
    await Promise.resolve()
    expect(container.querySelector('.rm-link-popover')).not.toBeNull()
  })

  it('popover disappears 80ms after mouse leaves', async () => {
    const { container } = render(
      <ReadmeRenderer content={'[visit](https://example.com)'} repoOwner="o" repoName="r" branch="main" />
    )
    const link = container.querySelector('a.rm-link')!
    fireEvent.mouseEnter(link)
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()
    fireEvent.mouseLeave(link)
    await vi.advanceTimersByTimeAsync(80)
    expect(container.querySelector('.rm-link-popover')).toBeNull()
  })

  it('mouse leave before 300ms prevents popover from appearing', async () => {
    const { container } = render(
      <ReadmeRenderer content={'[visit](https://example.com)'} repoOwner="o" repoName="r" branch="main" />
    )
    const link = container.querySelector('a.rm-link')!
    fireEvent.mouseEnter(link)
    await vi.advanceTimersByTimeAsync(100)  // leave before 300ms
    fireEvent.mouseLeave(link)
    await vi.advanceTimersByTimeAsync(500)
    await Promise.resolve()
    expect(container.querySelector('.rm-link-popover')).toBeNull()
  })

  it('relative and anchor links do not get popover', async () => {
    const { container } = render(
      <ReadmeRenderer content={'[local](#section) [rel](/path)'} repoOwner="o" repoName="r" branch="main" />
    )
    const links = container.querySelectorAll('a')
    for (const link of links) {
      fireEvent.mouseEnter(link)
      await vi.advanceTimersByTimeAsync(300)
      await Promise.resolve()
    }
    expect(container.querySelector('.rm-link-popover')).toBeNull()
  })

  it('youtube links do not trigger link preview popover', async () => {
    const { container } = render(
      <ReadmeRenderer
        content={'[watch](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'}
        repoOwner="o" repoName="r" branch="main"
      />
    )
    const link = container.querySelector('a[data-yt-id]')!
    fireEvent.mouseEnter(link)
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()
    expect(container.querySelector('.rm-link-popover')).toBeNull()
  })
})
```

Also update the shared `beforeEach` `window.api` mock at the top of the test file to include `linkPreview`:

```ts
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    writable: true,
    value: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      linkPreview: {
        fetch: vi.fn().mockResolvedValue({
          title: 'Test Page', description: 'A description', imageUrl: '',
          faviconUrl: '', domain: 'example.com',
        }),
      },
    },
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | grep -E "link preview|FAIL" | head -20
```

Expected: new tests FAIL.

- [ ] **Step 3: Add state and refs to `ReadmeRenderer`**

Find the block where `hoverVideo` and `hoverTimerRef` are declared (around line 613) and add after them:

```ts
// Link preview popover state — independent from the YouTube popover system
const [hoverLink, setHoverLink]         = useState<string | null>(null)
const [hoverLinkRect, setHoverLinkRect] = useState<DOMRect | null>(null)
const linkHoverTimerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null)
const currentHoverHrefRef                = useRef<string | null>(null)
```

- [ ] **Step 4: Add import for `fetchLinkPreview` and `getCachedPreview`**

At the top of `ReadmeRenderer.tsx`, add:

```ts
import { fetchLinkPreview, getCachedPreview } from '../utils/linkPreviewFetcher'
```

- [ ] **Step 5: Add hover handlers to the `a` override**

Find the "Default non-YouTube link behavior" section in the `a` override (around line 845). The current return is:

```tsx
return (
  <a
    className={nodeClass ?? 'rm-link'}
    href={href}
    onClick={(e) => { ... }}
  >
    {children}
  </a>
)
```

Change it to attach hover handlers for external links:

```tsx
const isExternal = href
  ? href.startsWith('http://') || href.startsWith('https://')
  : false
const isImgOnly  = node?.properties?.dataImgOnly === true

return (
  <a
    className={nodeClass ?? 'rm-link'}
    href={href}
    onClick={(e) => { /* existing onClick — unchanged */ }}
    {...(isExternal && !isImgOnly ? {
      onMouseEnter: (e: React.MouseEvent) => {
        setHoverLink(null)
        currentHoverHrefRef.current = href!
        if (linkHoverTimerRef.current) clearTimeout(linkHoverTimerRef.current)
        const el = e.currentTarget as HTMLElement
        linkHoverTimerRef.current = setTimeout(() => {
          const rect = el.getBoundingClientRect()
          fetchLinkPreview(href!).then(() => {
            if (currentHoverHrefRef.current === href) {
              setHoverLink(href!)
              setHoverLinkRect(rect)
            }
          })
        }, 300)
      },
      onMouseLeave: () => {
        currentHoverHrefRef.current = null
        if (linkHoverTimerRef.current) clearTimeout(linkHoverTimerRef.current)
        linkHoverTimerRef.current = setTimeout(() => setHoverLink(null), 80)
      },
    } : {})}
  >
    {children}
  </a>
)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | grep -E "link preview|PASS|FAIL" | head -30
```

Expected: all link preview tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: add link preview hover state and a-override handlers"
```

---

## Task 6: `LinkPreviewPopover` Component + CSS

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to the `describe('link preview popover', ...)` block:

```ts
it('popover shows title and domain from fetched data', async () => {
  const { container } = render(
    <ReadmeRenderer content={'[visit](https://example.com)'} repoOwner="o" repoName="r" branch="main" />
  )
  const link = container.querySelector('a.rm-link')!
  fireEvent.mouseEnter(link)
  await vi.advanceTimersByTimeAsync(300)
  await Promise.resolve()
  expect(container.querySelector('.rm-link-popover-title')?.textContent).toBe('Test Page')
  expect(container.querySelector('.rm-link-popover-domain')?.textContent).toBe('example.com')
})

it('popover with empty fields shows URL row only (no title or description)', async () => {
  // Override the mock to return empty data
  ;(window.api.linkPreview.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    title: '', description: '', imageUrl: '', faviconUrl: '', domain: 'example.com',
  })
  const { container } = render(
    <ReadmeRenderer content={'[visit](https://example.com/empty)'} repoOwner="o" repoName="r" branch="main" />
  )
  const link = container.querySelector('a.rm-link')!
  fireEvent.mouseEnter(link)
  await vi.advanceTimersByTimeAsync(300)
  await Promise.resolve()
  expect(container.querySelector('.rm-link-popover-title')).toBeNull()
  expect(container.querySelector('.rm-link-popover-url')).not.toBeNull()
})

it('mouse enter on popover cancels the dismiss timer', async () => {
  const { container } = render(
    <ReadmeRenderer content={'[visit](https://example.com)'} repoOwner="o" repoName="r" branch="main" />
  )
  const link = container.querySelector('a.rm-link')!
  fireEvent.mouseEnter(link)
  await vi.advanceTimersByTimeAsync(300)
  await Promise.resolve()
  // Now leave the link — starts 80ms dismiss timer
  fireEvent.mouseLeave(link)
  // Enter the popover before timer fires
  const popover = container.querySelector('.rm-link-popover')!
  fireEvent.mouseEnter(popover)
  await vi.advanceTimersByTimeAsync(200)  // well past 80ms
  // Popover should still be visible
  expect(container.querySelector('.rm-link-popover')).not.toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | grep -E "title|domain|dismiss|FAIL" | head -20
```

Expected: FAIL — no `.rm-link-popover-title` etc.

- [ ] **Step 3: Add `LinkPreviewPopover` component to `ReadmeRenderer.tsx`**

Add this component definition just before the `ReadmeRenderer` function (e.g., near `TheatreEmbed`):

```tsx
// ── Link preview popover ──────────────────────────────────────────────────
// `data` is always defined by the time this renders — setHoverLink is only
// called after fetchLinkPreview has resolved and stored the result in cache.

import type { LinkPreviewResult } from '../utils/linkPreviewFetcher'

interface LinkPreviewPopoverProps {
  url:          string
  rect:         DOMRect | null
  data:         LinkPreviewResult
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const GLOBE_SVG = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 1.5C6 4 5 6 5 8s1 4 3 6.5M8 1.5C10 4 11 6 11 8s-1 4-3 6.5M1.5 8h13" />
  </svg>
)

function LinkPreviewPopover({ url, rect, data, onMouseEnter, onMouseLeave }: LinkPreviewPopoverProps) {
  const hasContent = !!(data.title || data.description || data.imageUrl)
  return (
    <div
      className="rm-yt-popover rm-link-popover"
      style={{ top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {data.imageUrl && (
        <img
          src={data.imageUrl}
          alt=""
          className="rm-link-popover-image"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="rm-link-popover-meta">
        {data.faviconUrl ? (
          <img
            src={data.faviconUrl}
            alt=""
            className="rm-link-popover-favicon"
            onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createElementNS('http://www.w3.org/2000/svg', 'svg')) }}
          />
        ) : (
          <span className="rm-link-popover-favicon">{GLOBE_SVG}</span>
        )}
        <span className="rm-link-popover-domain">{data.domain}</span>
      </div>
      {hasContent && data.title && (
        <div className="rm-link-popover-title">{data.title}</div>
      )}
      {hasContent && data.description && (
        <div className="rm-link-popover-desc">{data.description}</div>
      )}
      <div className="rm-link-popover-url">{url}</div>
    </div>
  )
}
```

- [ ] **Step 4: Render the popover at the root of `ReadmeRenderer`**

In the `ReadmeRenderer` return, after the `{/* YouTube hover popover */}` block (around line 988) and before the `.rm-status-bar` div, add:

```tsx
{/* Link preview popover */}
{hoverLink && (
  <LinkPreviewPopover
    url={hoverLink}
    rect={hoverLinkRect}
    data={getCachedPreview(hoverLink)!}
    onMouseEnter={() => {
      if (linkHoverTimerRef.current) clearTimeout(linkHoverTimerRef.current)
    }}
    onMouseLeave={() => {
      linkHoverTimerRef.current = setTimeout(() => setHoverLink(null), 80)
    }}
  />
)}
```

- [ ] **Step 5: Add CSS to `src/styles/globals.css`**

Find the `.rm-yt-popover` block and add the link preview modifier classes after it:

```css
/* ── Link preview popover ─────────────────────────────────────────────── */
/* Modifier on top of .rm-yt-popover — only overrides what differs */
.rm-link-popover            { padding-top: 0; }
.rm-link-popover-image      { width: 100%; max-height: 140px; object-fit: cover;
                               display: block; }
.rm-link-popover-meta       { display: flex; align-items: center; gap: 6px;
                               padding: 8px 10px 0; }
.rm-link-popover-favicon    { width: 16px; height: 16px; flex-shrink: 0; }
.rm-link-popover-domain     { font-size: 11px; color: var(--t3); }
.rm-link-popover-title      { font-weight: 600; font-size: 13px; padding: 4px 10px 0;
                               display: -webkit-box; -webkit-line-clamp: 2;
                               -webkit-box-orient: vertical; overflow: hidden; }
.rm-link-popover-desc       { font-size: 12px; color: var(--t3); padding: 2px 10px 0;
                               display: -webkit-box; -webkit-line-clamp: 3;
                               -webkit-box-orient: vertical; overflow: hidden; }
.rm-link-popover-url        { font-size: 9px; opacity: 0.6; padding: 3px 10px 8px;
                               white-space: nowrap; overflow: hidden;
                               text-overflow: ellipsis; }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose
```

Expected: all link preview tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx src/styles/globals.css
git commit -m "feat: add LinkPreviewPopover component and CSS classes"
```

---

## Task 7: IntersectionObserver Prefetch

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`

- [ ] **Step 1: Add the `useEffect` for viewport prefetching**

In `ReadmeRenderer.tsx`, find the block of `useEffect` calls (around line 640–700). Add a new `useEffect` after the others:

```ts
// Prefetch link previews as they scroll into view
useEffect(() => {
  if (!containerRef.current) return
  const container = containerRef.current
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const href = (entry.target as HTMLAnchorElement).href
      if (href && !getCachedPreview(href)) fetchLinkPreview(href)
    }
  }, { threshold: 0 })

  const links = container.querySelectorAll<HTMLAnchorElement>(
    'a[href^="http"]:not([data-yt-id]):not([data-img-only])'
  )
  links.forEach(el => observer.observe(el))
  return () => observer.disconnect()
}, [rewrittenContent])
```

- [ ] **Step 2: Run full test suite to verify no regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReadmeRenderer.tsx
git commit -m "feat: add IntersectionObserver viewport prefetch for link previews"
```

---

## Task 8: Rapid-Hover Race Test

**Files:**
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Add the rapid-hover race test**

In the `describe('link preview popover', ...)` block, add:

```ts
it('rapid hover A→B: only B popover shows when A fetch resolves late', async () => {
  let resolveA!: (v: LinkPreviewResult) => void
  const fetchMock = window.api.linkPreview.fetch as ReturnType<typeof vi.fn>
  // First call (for A) returns a promise we control
  fetchMock.mockImplementationOnce(() => new Promise(r => { resolveA = r }))
  // Second call (for B) resolves immediately
  fetchMock.mockResolvedValueOnce({ title: 'B Page', description: '', imageUrl: '', faviconUrl: '', domain: 'b.com' })

  const { container } = render(
    <ReadmeRenderer
      content={'[A](https://a.com) [B](https://b.com)'}
      repoOwner="o" repoName="r" branch="main"
    />
  )
  const [linkA, linkB] = container.querySelectorAll('a.rm-link')

  // Hover A, wait for debounce, fetch starts but doesn't resolve yet
  fireEvent.mouseEnter(linkA)
  await vi.advanceTimersByTimeAsync(300)

  // Move to B — A's fetch is still pending
  fireEvent.mouseLeave(linkA)
  fireEvent.mouseEnter(linkB)
  await vi.advanceTimersByTimeAsync(300)
  await Promise.resolve()  // B's fetch resolves

  // B's popover should be showing
  expect(container.querySelector('.rm-link-popover-domain')?.textContent).toBe('b.com')

  // Now resolve A's fetch late — should NOT replace B's popover
  resolveA({ title: 'A Page', description: '', imageUrl: '', faviconUrl: '', domain: 'a.com' })
  await Promise.resolve()
  expect(container.querySelector('.rm-link-popover-domain')?.textContent).toBe('b.com')
})
```

You'll need to import `LinkPreviewResult` at the top of the test file:

```ts
import type { LinkPreviewResult } from '../utils/linkPreviewFetcher'
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | grep -E "rapid|PASS|FAIL"
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReadmeRenderer.test.tsx
git commit -m "test: add rapid-hover race condition test for link preview"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Full TypeScript type check**

```bash
cd D:/Coding/Git-Suite
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

Expected: all tests pass (existing 41 + new ~15).

- [ ] **Step 3: Manual smoke test in Electron**

Start the app:
```bash
npm run dev
```

- Open any repo with a README that has external links.
- Hover an external link — wait ~300ms — verify popover appears with favicon, domain, title (or URL-only if site has no OG tags).
- Move mouse onto the popover — verify it stays visible.
- Move mouse away — verify it dismisses after ~80ms.
- Hover a YouTube link — verify it shows the YouTube popover, not the link preview popover.
- Hover a linked badge image — verify no popover appears.
- Check the References section at the bottom — verify `.rm-reference-url` links also show the popover on hover.

- [ ] **Step 4: Final commit (if any last tweaks)**

```bash
git add -p  # stage only intentional changes
git commit -m "fix: link preview smoke test tweaks"
```
