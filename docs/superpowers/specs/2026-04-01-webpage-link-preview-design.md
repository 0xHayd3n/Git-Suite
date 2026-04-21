# Webpage Link Preview Design

**Date:** 2026-04-01
**Feature:** Hover popover previews for external links in ReadmeRenderer
**Scope:** All external `<a>` links that are not already YouTube video links

---

## 1. Overview

When users hover over any external hyperlink in a rendered README, a popover appears showing a rich preview of the linked page: favicon, domain, title, description, og:image thumbnail, and the full URL. This mirrors the existing YouTube preview popover in style and interaction, but is adapted for generic web pages.

Metadata is fetched via an Electron IPC handler in the main process, which is the appropriate place for network I/O in Electron apps and avoids CSP friction. The renderer calls the IPC handler through the existing `window.api` contextBridge (the same pattern every other feature in the app uses).

### Link pipeline context

The existing `rehypeFootnoteLinks` plugin keeps every external `<a>` element intact and appends a `<sup>[n]</sup>` footnote reference after it. It also creates a References section at the bottom containing `.rm-reference-url` anchors with the raw URL as text. Both the inline `<a>` elements and the `.rm-reference-url` anchors in the References section are in scope as hover trigger targets — the hover popover will work on either.

---

## 2. Architecture

```
ReadmeRenderer (renderer process)
  └─ a override (non-YouTube, non-image-only external links)
       ├─ hover (inline <a> or .rm-reference-url anchor)
       │    └─ window.api.linkPreview.fetch(url)
       │         └─ ipcRenderer.invoke('fetch-link-preview', url)
       │              └─ main process: net.fetch HTML → parse OG/meta tags
       └─ <LinkPreviewPopover> rendered at root of ReadmeRenderer
            (position: fixed, coordinates from getBoundingClientRect)

linkPreviewFetcher.ts (renderer utility)
  └─ module-level Map cache + in-flight deduplication
  └─ calls window.api.linkPreview.fetch(url)

electron/preload.ts
  └─ window.api.linkPreview.fetch = (url) =>
       ipcRenderer.invoke('fetch-link-preview', url)

electron/main.ts (IPC handler)
  └─ ipcMain.handle('fetch-link-preview', ...)
       └─ net.fetch(url, { headers: { 'User-Agent': ... } })  // Electron net module
       └─ parse <head> for og:title, og:description, og:image,
                         meta description, <title>, <link rel="icon">
```

---

## 3. IPC Handler (Main Process)

**Channel:** `fetch-link-preview`
**Location:** `electron/main.ts` — added alongside existing IPC handlers

**Request:** `url: string`

**Response:**
```ts
interface LinkPreviewResult {
  title:       string   // og:title → <title> → ''
  description: string   // og:description → meta[name=description] → ''
  imageUrl:    string   // og:image (absolute) → ''
  faviconUrl:  string   // <link rel="icon|shortcut icon"> → '/favicon.ico' fallback → ''
  domain:      string   // hostname extracted from url
}
```

**Implementation notes:**
- Use `net.fetch` from the Electron `net` module (`import { net } from 'electron'`) rather than the Node global `fetch`. This respects the session's proxy settings and is the recommended approach per Electron documentation for main-process HTTP requests. It is available in all supported Electron versions.
- Fetch with a browser-like `User-Agent` to avoid bot-blocking
- 6-second `AbortSignal.timeout`
- Read at most the first 100 KB of the response body — most `<head>` sections are well under this limit
- Parse only the `<head>` section using a simple regex/string scan (no full DOM parse needed); stop at `</head>` or first `<body>` tag
- `og:image` values that are relative URLs are resolved against the page's origin
- On any error (network, timeout, non-200), return all empty strings (the popover degrades gracefully to favicon + domain + URL)
- No result caching in the main process — caching is the renderer's responsibility

---

## 4. Preload Bridge (`electron/preload.ts` + `src/env.d.ts`)

### `electron/preload.ts`

Add a `linkPreview` namespace to the existing `window.api` contextBridge object:

```ts
linkPreview: {
  fetch: (url: string) => ipcRenderer.invoke('fetch-link-preview', url),
},
```

This follows the same pattern as all other IPC features in the app (e.g., `window.api.github.*`, `window.api.storybook.*`). The renderer never calls `ipcRenderer` directly.

### `src/env.d.ts`

Add the `linkPreview` entry to the `Window` interface so TypeScript accepts `window.api.linkPreview.fetch(url)` in the renderer:

```ts
linkPreview: {
  fetch: (url: string) => Promise<import('./utils/linkPreviewFetcher').LinkPreviewResult>
}
```

This is required alongside the `preload.ts` change — omitting it produces a TypeScript compile error on every `window.api.linkPreview` call site.

**Implementation order:** `src/utils/linkPreviewFetcher.ts` must be created *before* `src/env.d.ts` is updated, because the ambient declaration uses an `import()` type that references the module. If `env.d.ts` is updated first, the TypeScript build will fail until the module exists.

---

## 5. Cache Singleton (`src/utils/linkPreviewFetcher.ts`)

A module-level singleton so the cache survives React re-renders and is shared across all ReadmeRenderer instances.

```ts
export interface LinkPreviewResult { /* as above */ }

const cache    = new Map<string, LinkPreviewResult>()
const inflight = new Map<string, Promise<LinkPreviewResult>>()

export async function fetchLinkPreview(url: string): Promise<LinkPreviewResult>
export function getCachedPreview(url: string): LinkPreviewResult | undefined
```

**Behaviour:**
- If `cache.has(url)` → return cached value synchronously (via `getCachedPreview`) or as an immediately resolved promise
- If `inflight.has(url)` → return the existing promise (deduplication — prevents duplicate IPC calls for the same URL)
- Otherwise: create promise, store in `inflight`, call `window.api.linkPreview.fetch(url)`, store result in `cache`, delete from `inflight`
- Cache is unbounded for a single session (READMEs rarely contain more than ~50 unique external links)
- `getCachedPreview` is used by the IntersectionObserver prefetch path to check before firing IPC

---

## 6. ReadmeRenderer Integration

### State additions
```ts
const [hoverLink, setHoverLink]             = useState<string | null>(null)
const [hoverLinkRect, setHoverLinkRect]     = useState<DOMRect | null>(null)
const linkHoverTimerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null)
const currentHoverHrefRef                    = useRef<string | null>(null)
```

`linkHoverTimerRef` is a separate, independent ref from the existing `hoverTimerRef` used by the YouTube popover. The two popover systems operate entirely independently and never share timer state.

`hoverLink` is **not** added to the `mdComponents` dependency array. The `a` override uses `setHoverLink` (a stable setter) and `onMouseEnter`/`onMouseLeave` handlers, neither of which reads `hoverLink` directly, so there is no stale closure concern. Additionally, `linkHoverTimerRef`, `currentHoverHrefRef`, `fetchLinkPreview`, and `getCachedPreview` are all stable references (refs and module-level functions) that also do not require addition to the dep array. This mirrors the existing exclusion of `hoverVideo` and `hoverTimerRef` from the `[fnHistory, activeVideo]` dep array.

There is no need for a local cache ref. `getCachedPreview(url)` from the module singleton is a synchronous `Map.get` call and can be read directly during render.

### Image-only link detection (rehype plugin)
A new lightweight rehype plugin — `rehypeImageOnlyLinks` — **runs AFTER `rehypeSanitize`** (matching the placement of every other data-stamping plugin in the file, so `data-*` properties are not stripped) and **after `rehypeFootnoteLinks`** as the final plugin in the array.

**Note on responsibilities:** `rehypeFootnoteLinks` already has its own `allImages` guard that skips image-only `<a>` elements, so those links are never converted to footnotes regardless of plugin order. `rehypeImageOnlyLinks` serves a separate and distinct purpose: it stamps `dataImgOnly = true` so the `a` component override in `mdComponents` can skip rendering the link preview popover at React render time. Do not remove `rehypeFootnoteLinks`'s existing guard — the two mechanisms are independent.

**Note on attribute preservation:** Because `rehypeImageOnlyLinks` runs *after* `rehypeSanitize`, the `data-img-only` attribute is added to the HAST tree after sanitization is complete. ReactMarkdown reads HAST node properties directly when invoking component overrides — it does not re-sanitize. This is the established, verified pattern used by every data-stamping plugin in the file: `dataYtId` (`rehypeYouTubeLinks`), `dataLinked`/`dataBadgeRow`/`dataLogoRow` (`rehypeImageClassifier`), etc. No schema change is required.

The full `rehypePlugins` array becomes:
```ts
[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection,
 rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks,
 rehypeFootnoteLinks, rehypeImageOnlyLinks]
```

The plugin stamps `dataImgOnly = true` (boolean, matching the codebase convention for all other boolean stamps) on any `<a>` element whose only *significant* children are `<img>` nodes. Whitespace-only text nodes are excluded from consideration using the same filter as `rehypeImageClassifier`: `filter(c => !(c.type === 'text' && (c as Text).value.trim() === ''))`. This correctly handles the common markdown output `<a>\n<img ...>\n</a>`.

```ts
// Runs AFTER rehype-sanitize so data-* properties are not stripped.
function rehypeImageOnlyLinks(): (tree: Root) => void {
  return (tree) => {
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

The `a` component override reads `node?.properties?.dataImgOnly` and skips the popover when it is `=== true` (boolean).

### `a` override changes
The existing `a` override handles YouTube links first (unchanged). For all other external links (`href.startsWith('http://') || href.startsWith('https://')`), skip if `dataImgOnly === true`. Otherwise attach hover handlers:

```ts
onMouseEnter={(e) => {
  // Immediately dismiss any previously-visible popover so moving between
  // links doesn't leave a stale popover on screen during the new 300ms debounce.
  setHoverLink(null)
  currentHoverHrefRef.current = href
  if (linkHoverTimerRef.current) clearTimeout(linkHoverTimerRef.current)
  const el = e.currentTarget as HTMLElement
  linkHoverTimerRef.current = setTimeout(() => {
    // Capture rect inside the timer so it is fresh after any scroll during
    // the 300 ms debounce. el remains valid for the component lifetime.
    const rect = el.getBoundingClientRect()
    fetchLinkPreview(href).then((_data) => {
      // Guard against stale fetches: only show popover if this href
      // is still the most-recently-hovered link (handles rapid hover
      // across multiple links where an older fetch might resolve last)
      if (currentHoverHrefRef.current === href) {
        setHoverLink(href)
        setHoverLinkRect(rect)
      }
    })
  }, 300)
}}
onMouseLeave={() => {
  currentHoverHrefRef.current = null
  if (linkHoverTimerRef.current) clearTimeout(linkHoverTimerRef.current)
  linkHoverTimerRef.current = setTimeout(() => setHoverLink(null), 80)
}}
```

`currentHoverHrefRef` tracks the most-recently-hovered href. The `.then()` callback checks whether the ref still matches before opening the popover — this prevents a slow-resolving fetch for link A from opening the popover after the user has already moved to link B. The `setHoverLink(null)` at the start of `onMouseEnter` immediately dismisses any previously-visible popover so no stale popover lingers while the 300 ms debounce counts down on the new link. This matches the spirit of the existing YouTube popover's `setHoverVideo(prev => prev?.id === ytId ? {...prev} : prev)` guard.

Because `setHoverLink(href)` is only called from inside the `.then()` callback — which fires *after* `fetchLinkPreview` has already stored the result in `cache` — `getCachedPreview(hoverLink)` is guaranteed to return a defined `LinkPreviewResult` by the time the popover renders. There is no loading state.

**External link detection:** `href.startsWith('http://') || href.startsWith('https://')` — matching the exact guard used in all other locations in the codebase. This covers both inline `<a>` elements and `.rm-reference-url` anchors in the References section.

### `LinkPreviewPopover` rendering
`<LinkPreviewPopover>` is rendered **outside** the `mdComponents` tree, at the root of the `ReadmeRenderer` return value alongside the existing YouTube popover. It is `null` when `hoverLink` is `null`.

```tsx
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

The `onMouseEnter`/`onMouseLeave` callbacks on the popover allow the user to move the mouse from the link onto the popover without it dismissing — matching the existing YouTube popover behaviour.

### Viewport prefetching (IntersectionObserver)
A `useEffect` with dependency `[rewrittenContent]` sets up a single `IntersectionObserver` after the README content changes:

```ts
useEffect(() => {
  if (!containerRef.current) return  // guard: DOM not yet mounted
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const href = (entry.target as HTMLAnchorElement).href
      if (href && !getCachedPreview(href)) fetchLinkPreview(href)
    }
  }, { threshold: 0 })

  const links = containerRef.current.querySelectorAll(
    'a[href^="http"]:not([data-yt-id]):not([data-img-only])'
  )
  links.forEach(el => observer.observe(el))
  return () => observer.disconnect()
}, [rewrittenContent])
```

The selector covers both inline `<a>` elements and `.rm-reference-url` anchors, since both match `a[href^="http"]`.

---

## 7. `LinkPreviewPopover` Component

A new component in `ReadmeRenderer.tsx` (~65 lines).

### Props
```ts
interface LinkPreviewPopoverProps {
  url:          string
  rect:         DOMRect | null
  data:         LinkPreviewResult          // always defined — see §6
  onMouseEnter: () => void
  onMouseLeave: () => void
}
```

`data` is always a defined `LinkPreviewResult` because `setHoverLink` is only called after `fetchLinkPreview` has completed and stored the result in cache. The popover never needs to render a loading/spinner state.

### Layout (top to bottom)
1. **og:image** — full popover width (~280px), `max-height: 140px`, `object-fit: cover`. Omitted entirely if `imageUrl` is empty.
2. **Favicon + domain row** — 16×16 `<img>` with `onError` fallback to an inline globe SVG; hostname in muted text.
3. **Title** — bold, 2-line CSS clamp. Falls back to bare URL if empty.
4. **Description** — 3-line CSS clamp. Omitted if empty.
5. **Full URL** — small text, single-line ellipsis truncation; uses `.rm-link-popover-url` class.

### States (two, not three)
- **Success** (most fields populated): full layout above
- **Error / no metadata** (`data` present but all fields empty): favicon row + full URL only

### Positioning & animation
The popover uses `position: fixed` with coordinates derived from `rect`:
```ts
style={{ top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0 }}
```
This is identical to how the existing YouTube popover positions itself. Width: 280px. Same CSS fade-in transition and `z-index: 600` as the YouTube popover.

The element receives **both** class names: `className="rm-yt-popover rm-link-popover"`. The `.rm-yt-popover` base class provides all shared styles including `overflow: hidden` (which clips the og:image to the border-radius automatically). The `.rm-link-popover` modifier overrides only `padding-top: 0` so the og:image sits flush at the top with no gap.

---

## 8. CSS Additions (`src/styles/globals.css`)

```css
/* Link preview popover modifier — applies on top of .rm-yt-popover */
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
.rm-link-popover-desc       { font-size: 12px; color: var(--t3);
                               padding: 2px 10px 0;
                               display: -webkit-box; -webkit-line-clamp: 3;
                               -webkit-box-orient: vertical; overflow: hidden; }
.rm-link-popover-url        { font-size: 9px; opacity: 0.6; padding: 3px 10px 8px;
                               white-space: nowrap; overflow: hidden;
                               text-overflow: ellipsis; }
```

`var(--t3)` (value `#9090a0`) is the existing design token for muted text used throughout the codebase (e.g., `.rm-yt-popover-author`, `.rm-yt-popover-url`). A dedicated `.rm-link-popover-url` class is defined rather than reusing `.rm-yt-popover-url`, because the YouTube URL class relies on the padding of its parent `.rm-yt-popover-info` container; the link preview URL row sits at a different nesting level and needs its own horizontal padding.

---

## 9. Testing

### `ReadmeRenderer.test.tsx` additions

**Mock setup:** Update the `window.api` object in the shared `beforeEach` to include `linkPreview` alongside the existing mocks:

```ts
value: {
  openExternal: vi.fn().mockResolvedValue(undefined),
  linkPreview: {
    fetch: vi.fn().mockResolvedValue({
      title: 'Test Page', description: 'A test page', imageUrl: '',
      faviconUrl: '', domain: 'example.com'
    })
  }
  // ...other existing window.api entries...
},
```

**Timer setup:** Tests that exercise the hover delay or dismiss delay must use `vi.useFakeTimers()` (in a `beforeEach` or per-test) and `vi.advanceTimersByTimeAsync(N)` to advance through the 300 ms debounce or 80 ms dismiss. Restore with `vi.useRealTimers()` in `afterEach` to avoid contaminating other tests.

**Loading state:** There is no loading state to test — `data` is always defined when the popover renders (see §7). The `LinkPreviewPopover` component can be tested in isolation with an empty-fields `LinkPreviewResult` to exercise the error/degraded state.

New test cases:

| Test | Assertion |
|------|-----------|
| External non-YouTube link renders `<a>` normally (no popover by default) | Popover absent before hover |
| Hover on external link after 300 ms shows `<LinkPreviewPopover>` | Popover present with correct data |
| Mouse leave after 80 ms hides popover | Popover absent |
| Mouse leaving before 300 ms (before fetch starts) does not show popover | Popover never appears |
| Mouse moving from link to popover cancels dismiss timer | Popover remains visible |
| Rapid hover: moving from link A to link B before A's fetch resolves shows B's preview | Popover shows B's data, not A's |
| YouTube links do NOT trigger link preview popover | YouTube popover shown, not link preview popover |
| Relative links and anchor (`#`) links do NOT get popover | No popover rendered |
| Image-only links (`<img>` inside `<a>`) do NOT get popover | No popover, `data-img-only` stamped |
| Error state (empty-fields `LinkPreviewResult`) renders favicon row + URL only | No title/description/image |

### `src/utils/linkPreviewFetcher.test.ts` (new file)

The test setup mocks `window.api.linkPreview.fetch` (not `ipcRenderer.invoke` directly).

| Test | Assertion |
|------|-----------|
| Cache hit returns without IPC call | `window.api.linkPreview.fetch` not called |
| In-flight deduplication: two concurrent calls → one IPC call | `fetch` called once |
| On IPC error, returns empty-string `LinkPreviewResult` | No throw |

---

## 10. Out of Scope

- Internal links (`/path`, `#anchor`) — no popover
- YouTube links — handled by existing YouTube popover
- Image links (`<img>` wrapped in `<a>`) — stamped `data-img-only` by `rehypeImageOnlyLinks`, skipped in `a` override
- Mailto / tel links — no popover (`http://` / `https://` guard excludes them)
- Result persistence across app restarts — session-only cache is sufficient
- User-configurable enable/disable toggle — can be added later if needed
