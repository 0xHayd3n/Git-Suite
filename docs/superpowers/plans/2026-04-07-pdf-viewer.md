# PDF Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an embedded PDF viewer to the file browser so PDF files render inline with zoom, text selection, annotations, and search.

**Architecture:** New `PdfViewer` component using PDF.js (`pdfjs-dist`) renders base64 blob data already fetched by `FilesTab`. Integrates into `FileContentPanel`'s conditional rendering chain alongside existing viewers. Virtualized page rendering for memory efficiency.

**Tech Stack:** pdfjs-dist, React, TypeScript, CSS

**Spec:** `docs/superpowers/specs/2026-04-07-pdf-viewer-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/PdfViewer.tsx` | PDF rendering component with toolbar, zoom, search, virtualized pages |
| Modify | `src/components/DirectoryListing.tsx` | Add `isPdfFile` export |
| Modify | `src/components/FileContentPanel.tsx` | Add PDF branch to conditional chain |
| Modify | `src/components/FilesTab.tsx` | PDF-aware size limits in two code paths |
| Modify | `src/styles/globals.css` | PDF viewer styles |
| Modify | `package.json` | Add `pdfjs-dist` dependency |

---

### Task 1: Install pdfjs-dist

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

```bash
npm install pdfjs-dist
```

- [ ] **Step 2: Verify it installed**

```bash
node -e "require('pdfjs-dist/package.json').version"
```

Expected: prints a version number (e.g. `4.x.x`)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdfjs-dist dependency"
```

---

### Task 2: Add isPdfFile helper

**Files:**
- Modify: `src/components/DirectoryListing.tsx:292` (insert before `isVideoFile`)

- [ ] **Step 1: Add the isPdfFile function**

In `src/components/DirectoryListing.tsx`, add this exported function right before the `isVideoFile` function (line 292):

```tsx
export function isPdfFile(filename: string): boolean {
  return filename.split('.').pop()?.toLowerCase() === 'pdf'
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors related to `isPdfFile`

- [ ] **Step 3: Commit**

```bash
git add src/components/DirectoryListing.tsx
git commit -m "feat(pdf): add isPdfFile helper to DirectoryListing"
```

---

### Task 3: Create PdfViewer component — loading and basic rendering

**Files:**
- Create: `src/components/PdfViewer.tsx`

This is the core component. It converts base64 data to a PDF.js document, renders pages to canvases with text and annotation layers, and provides a toolbar.

- [ ] **Step 1: Create PdfViewer.tsx with full implementation**

Create `src/components/PdfViewer.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer, AnnotationLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ZoomIn, ZoomOut, RotateCcw, Search, X, ChevronUp, ChevronDown } from 'lucide-react'

// Configure PDF.js worker — try Vite URL resolution first.
// If this fails at runtime, see Task 8 troubleshooting for fallbacks.
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

interface Props {
  data: string // base64-encoded PDF
  owner?: string
  name?: string
  branch?: string
  path?: string
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const PAGE_BUFFER = 2 // render this many pages above/below viewport

export default function PdfViewer({ data, owner, name, branch, path }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pageDimensions, setPageDimensions] = useState<Map<number, { w: number; h: number }>>(new Map())

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ page: number; index: number }[]>([])
  const [searchIndex, setSearchIndex] = useState(-1)
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderedPages = useRef<Set<number>>(new Set())
  const renderingPages = useRef<Set<number>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const rafRef = useRef<number>(0)
  const zoomGeneration = useRef(0)

  // Convert base64 to Uint8Array
  const pdfData = useMemo(() => {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }, [data])

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const loadingTask = getDocument({ data: pdfData })
    loadingTask.promise
      .then(async doc => {
        if (cancelled) { doc.destroy(); return }
        // Destroy previous document if any
        pdfRef.current?.destroy()
        pdfRef.current = doc
        setPdf(doc)
        setTotalPages(doc.numPages)

        // Pre-compute page dimensions at zoom=1 for stable layout
        const dims = new Map<number, { w: number; h: number }>()
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const vp = page.getViewport({ scale: 1 })
          dims.set(i, { w: vp.width, h: vp.height })
        }
        if (!cancelled) {
          setPageDimensions(dims)
          setLoading(false)
        }
      })
      .catch(err => {
        if (cancelled) return
        setLoading(false)
        if (err?.name === 'PasswordException') {
          setError('This PDF is password-protected and cannot be viewed here.')
        } else {
          setError('Failed to load PDF.')
        }
      })

    return () => {
      cancelled = true
      loadingTask.destroy?.()
      pdfRef.current?.destroy()
      pdfRef.current = null
    }
  }, [pdfData])

  // Render a single page
  const renderPage = useCallback(async (pageNum: number, gen: number) => {
    if (!pdf || renderedPages.current.has(pageNum) || renderingPages.current.has(pageNum)) return
    const pageDiv = pageRefs.current.get(pageNum)
    if (!pageDiv) return

    renderingPages.current.add(pageNum)

    try {
      const page = await pdf.getPage(pageNum)
      // Stale zoom generation — discard
      if (gen !== zoomGeneration.current) { renderingPages.current.delete(pageNum); return }
      if (!pageRefs.current.has(pageNum)) { renderingPages.current.delete(pageNum); return }

      const viewport = page.getViewport({ scale: zoom * window.devicePixelRatio })
      const displayViewport = page.getViewport({ scale: zoom })

      // Clear previous content (keep dimensions)
      pageDiv.innerHTML = ''

      // Canvas layer
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${displayViewport.width}px`
      canvas.style.height = `${displayViewport.height}px`
      pageDiv.appendChild(canvas)

      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise

      // Check generation again after async render
      if (gen !== zoomGeneration.current) { renderingPages.current.delete(pageNum); return }

      // Text layer (PDF.js v4 API: import TextLayer directly)
      const textContent = await page.getTextContent()
      const textDiv = document.createElement('div')
      textDiv.className = 'pdf-viewer__text-layer'
      textDiv.style.width = `${displayViewport.width}px`
      textDiv.style.height = `${displayViewport.height}px`
      pageDiv.appendChild(textDiv)

      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport: displayViewport,
      })
      await textLayer.render()

      // Highlight search matches on this page if applicable
      if (highlightedPage === pageNum && searchQuery) {
        highlightTextOnPage(textDiv, searchQuery)
      }

      // Annotation layer (PDF.js v4 API: import AnnotationLayer directly)
      const annotations = await page.getAnnotations()
      if (annotations.length > 0) {
        const annotDiv = document.createElement('div')
        annotDiv.className = 'pdf-viewer__annotation-layer'
        annotDiv.style.width = `${displayViewport.width}px`
        annotDiv.style.height = `${displayViewport.height}px`
        pageDiv.appendChild(annotDiv)

        const annotLayer = new AnnotationLayer({
          div: annotDiv,
          accessibilityManager: null as any,
          annotationCanvasMap: null as any,
          page,
          viewport: displayViewport,
        })
        await annotLayer.render({
          viewport: displayViewport,
          annotations,
          div: annotDiv,
          page,
          linkService: {
            getDestinationHash: () => '#',
            getAnchorUrl: () => '#',
            addLinkAttributes: (link: HTMLAnchorElement, url: string) => {
              link.href = url
              link.target = '_blank'
              link.rel = 'noopener noreferrer'
            },
            navigateTo: () => {},
            goToDestination: () => {},
            goToPage: () => {},
          } as any,
          downloadManager: null as any,
          renderForms: false,
          imageResourcesPath: '',
        })
      }

      renderedPages.current.add(pageNum)
    } catch {
      // Individual page render failure — leave placeholder
    } finally {
      renderingPages.current.delete(pageNum)
    }
  }, [pdf, zoom, highlightedPage, searchQuery])

  // Highlight search text on a rendered text layer
  function highlightTextOnPage(textDiv: HTMLDivElement, query: string) {
    const spans = textDiv.querySelectorAll('span')
    const lowerQuery = query.toLowerCase()
    for (const span of spans) {
      const text = span.textContent?.toLowerCase() ?? ''
      if (text.includes(lowerQuery)) {
        span.classList.add('pdf-viewer__text-highlight')
      }
    }
  }

  // Destroy pages outside buffer — preserve dimensions for stable scroll
  const destroyPage = useCallback((pageNum: number) => {
    if (!renderedPages.current.has(pageNum)) return
    const pageDiv = pageRefs.current.get(pageNum)
    if (pageDiv) {
      pageDiv.innerHTML = ''
      // Dimensions stay set via style.width/height from pageDimensions
    }
    renderedPages.current.delete(pageNum)
  }, [])

  // Determine visible pages and render/destroy (debounced via rAF)
  const updateVisiblePages = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container || !totalPages) return

      const scrollTop = container.scrollTop
      const viewportHeight = container.clientHeight
      const gen = zoomGeneration.current

      let firstVisible = 1
      let lastVisible = 1

      for (let i = 1; i <= totalPages; i++) {
        const pageDiv = pageRefs.current.get(i)
        if (!pageDiv) continue
        const top = pageDiv.offsetTop
        const bottom = top + pageDiv.offsetHeight
        if (bottom > scrollTop && top < scrollTop + viewportHeight) {
          if (firstVisible === 1 || i < firstVisible) firstVisible = i
          lastVisible = i
        }
      }

      setCurrentPage(firstVisible)

      // Render visible + buffer
      const renderStart = Math.max(1, firstVisible - PAGE_BUFFER)
      const renderEnd = Math.min(totalPages, lastVisible + PAGE_BUFFER)

      for (let i = renderStart; i <= renderEnd; i++) {
        renderPage(i, gen)
      }

      // Destroy pages outside buffer
      for (const pageNum of renderedPages.current) {
        if (pageNum < renderStart || pageNum > renderEnd) {
          destroyPage(pageNum)
        }
      }
    })
  }, [totalPages, renderPage, destroyPage])

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container || !pdf) return

    updateVisiblePages()
    container.addEventListener('scroll', updateVisiblePages)
    return () => {
      container.removeEventListener('scroll', updateVisiblePages)
      cancelAnimationFrame(rafRef.current)
    }
  }, [pdf, updateVisiblePages])

  // Re-render on zoom change
  useEffect(() => {
    zoomGeneration.current++
    renderedPages.current.clear()
    renderingPages.current.clear()
    updateVisiblePages()
  }, [zoom, updateVisiblePages])

  // Ctrl+F handler scoped to PDF viewer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'f' && !e.shiftKey) {
        // Only handle if PDF viewer is mounted
        if (containerRef.current) {
          e.preventDefault()
          e.stopPropagation()
          setSearchOpen(true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
        }
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
        setSearchResults([])
        setSearchIndex(-1)
        setHighlightedPage(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [searchOpen])

  // Search functionality
  const handleSearch = useCallback(async () => {
    if (!pdf || !searchQuery.trim()) {
      setSearchResults([])
      setSearchIndex(-1)
      setHighlightedPage(null)
      return
    }

    const query = searchQuery.toLowerCase()
    const results: { page: number; index: number }[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const text = textContent.items.map((item: any) => item.str).join(' ').toLowerCase()

      let idx = 0
      while ((idx = text.indexOf(query, idx)) !== -1) {
        results.push({ page: i, index: idx })
        idx += query.length
      }
    }

    setSearchResults(results)
    setSearchIndex(results.length > 0 ? 0 : -1)

    if (results.length > 0) {
      setHighlightedPage(results[0].page)
      scrollToPage(results[0].page)
    }
  }, [pdf, searchQuery])

  const scrollToPage = useCallback((pageNum: number) => {
    const pageDiv = pageRefs.current.get(pageNum)
    if (pageDiv && containerRef.current) {
      pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleSearchNext = useCallback(() => {
    if (searchResults.length === 0) return
    const next = (searchIndex + 1) % searchResults.length
    setSearchIndex(next)
    setHighlightedPage(searchResults[next].page)
    scrollToPage(searchResults[next].page)
  }, [searchResults, searchIndex, scrollToPage])

  const handleSearchPrev = useCallback(() => {
    if (searchResults.length === 0) return
    const prev = (searchIndex - 1 + searchResults.length) % searchResults.length
    setSearchIndex(prev)
    setHighlightedPage(searchResults[prev].page)
    scrollToPage(searchResults[prev].page)
  }, [searchResults, searchIndex, scrollToPage])

  // Zoom handlers
  const zoomIn = useCallback(() => {
    setZoom(z => {
      const next = ZOOM_STEPS.find(s => s > z)
      return next ?? z
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(z => {
      const prev = [...ZOOM_STEPS].reverse().find(s => s < z)
      return prev ?? z
    })
  }, [])

  const zoomReset = useCallback(() => setZoom(1), [])

  // Set page div ref
  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(pageNum, el)
    } else {
      pageRefs.current.delete(pageNum)
    }
  }, [])

  // GitHub URL for download link in error states
  const githubUrl = owner && name && branch && path
    ? `https://github.com/${owner}/${name}/blob/${branch}/${path}`
    : null

  // Error state — with download link per spec
  if (error) {
    return (
      <div className="pdf-viewer__error">
        <p>{error}</p>
        {githubUrl && (
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="pdf-viewer__error-link">
            View on GitHub
          </a>
        )}
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="file-content-panel__loading">
        <span className="spin-ring" style={{ width: 14, height: 14 }} />
      </div>
    )
  }

  // Memoize pages array
  const pages = useMemo(() =>
    Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages]
  )

  return (
    <>
      <div className="pdf-viewer__toolbar">
        <div className="pdf-viewer__toolbar-left">
          <span className="code-toolbar__lang-badge">PDF</span>
          <span className="code-toolbar__meta">
            Page {currentPage} of {totalPages}
          </span>
        </div>
        <div className="pdf-viewer__toolbar-center">
          <button className="code-toolbar__btn" onClick={zoomOut} title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <span className="code-toolbar__meta" style={{ minWidth: 40, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button className="code-toolbar__btn" onClick={zoomIn} title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button className="code-toolbar__btn" onClick={zoomReset} title="Reset zoom">
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="pdf-viewer__toolbar-right">
          <button
            className={`code-toolbar__btn${searchOpen ? ' code-toolbar__btn--active' : ''}`}
            onClick={() => {
              setSearchOpen(o => !o)
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
            }}
            title="Search (Ctrl+F)"
          >
            <Search size={14} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="pdf-viewer__search">
          <input
            ref={searchInputRef}
            className="pdf-viewer__search-input"
            type="text"
            placeholder="Search in PDF..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) handleSearchPrev()
                else if (searchResults.length > 0 && searchIndex >= 0) handleSearchNext()
                else handleSearch()
              }
            }}
          />
          {searchResults.length > 0 && (
            <span className="pdf-viewer__search-count">
              {searchIndex + 1} / {searchResults.length}
            </span>
          )}
          <button className="code-toolbar__btn" onClick={handleSearchPrev} title="Previous match">
            <ChevronUp size={14} />
          </button>
          <button className="code-toolbar__btn" onClick={handleSearchNext} title="Next match">
            <ChevronDown size={14} />
          </button>
          <button className="code-toolbar__btn" onClick={() => {
            setSearchOpen(false)
            setSearchQuery('')
            setSearchResults([])
            setSearchIndex(-1)
            setHighlightedPage(null)
          }} title="Close search">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="pdf-viewer__container" ref={containerRef}>
        {pages.map(pageNum => {
          const dim = pageDimensions.get(pageNum)
          return (
            <div
              key={pageNum}
              ref={el => setPageRef(pageNum, el)}
              className="pdf-viewer__page"
              data-page={pageNum}
              style={dim ? { width: dim.w * zoom, height: dim.h * zoom } : undefined}
            />
          )
        })}
      </div>
    </>
  )
}
```

**Important notes about this implementation:**

- **PDF.js v4 imports:** `TextLayer` and `AnnotationLayer` are imported as named exports directly from `pdfjs-dist`, not via `pdfjsLib.*` namespace. The `AnnotationLayer` uses the v4 constructor/render pattern. If the installed version has a different API shape, adjust at implementation time — the key point is to check the actual exports.
- **Document cleanup:** Uses `pdfRef` to track and destroy the `PDFDocumentProxy` on unmount or when data changes, preventing memory leaks.
- **Stable page dimensions:** Pre-computes page dimensions at load time and applies `width`/`height` via inline styles on page divs. This ensures scroll position calculations remain stable even when pages are destroyed (cleared) during virtualization.
- **Zoom generation counter:** `zoomGeneration` ref prevents stale renders from a previous zoom level from being added to `renderedPages`.
- **Debounced scroll:** `updateVisiblePages` uses `requestAnimationFrame` to throttle scroll handler calls.
- **Search highlighting:** When search navigates to a page, matching text layer spans get a highlight class (`pdf-viewer__text-highlight`).
- **Error state download link:** Error states include a "View on GitHub" link when `owner`/`name`/`branch`/`path` props are provided.

- [ ] **Step 2: Verify the app compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: no TypeScript errors (component is not yet wired in)

- [ ] **Step 3: Commit**

```bash
git add src/components/PdfViewer.tsx
git commit -m "feat(pdf): create PdfViewer component with virtualized rendering, zoom, search"
```

---

### Task 4: Add PDF viewer styles

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add PDF viewer CSS**

Add the following styles to `src/styles/globals.css`, right after the `.code-toolbar` section (after line ~7155):

```css
/* ── PDF Viewer ────────────────────────────────────────────────── */

.pdf-viewer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 12px;
  background: #0d1117;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.pdf-viewer__toolbar-left,
.pdf-viewer__toolbar-center,
.pdf-viewer__toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pdf-viewer__toolbar-center {
  gap: 2px;
}
.pdf-viewer__container {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: #161b22;
}
.pdf-viewer__page {
  position: relative;
  background: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  min-height: 200px;
}
.pdf-viewer__page canvas {
  display: block;
}
.pdf-viewer__text-layer {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  opacity: 0.25;
  line-height: 1;
}
.pdf-viewer__text-layer span {
  position: absolute;
  white-space: pre;
  color: transparent;
}
.pdf-viewer__text-layer span::selection {
  background: rgba(0, 100, 255, 0.3);
}
.pdf-viewer__annotation-layer {
  position: absolute;
  top: 0;
  left: 0;
}
.pdf-viewer__annotation-layer a {
  position: absolute;
  cursor: pointer;
}
.pdf-viewer__annotation-layer a:hover {
  opacity: 0.2;
  background: rgba(255, 255, 0, 0.3);
}
.pdf-viewer__search {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  background: #0d1117;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.pdf-viewer__search-input {
  flex: 1;
  max-width: 260px;
  height: 24px;
  padding: 0 8px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--radius-sm);
  color: #c9d1d9;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  outline: none;
}
.pdf-viewer__search-input:focus {
  border-color: var(--accent);
}
.pdf-viewer__search-count {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #484f58;
  min-width: 50px;
  text-align: center;
}
.pdf-viewer__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: #484f58;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}
.pdf-viewer__error-link {
  color: var(--accent-light);
  font-size: 12px;
  text-decoration: underline;
}
.pdf-viewer__text-highlight {
  background: rgba(255, 200, 0, 0.4) !important;
  color: transparent !important;
  border-radius: 2px;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(pdf): add PDF viewer styles matching CodeToolbar patterns"
```

---

### Task 5: Integrate into FileContentPanel

**Files:**
- Modify: `src/components/FileContentPanel.tsx:1-3` (imports)
- Modify: `src/components/FileContentPanel.tsx:129` (conditional chain)

- [ ] **Step 1: Add imports**

In `src/components/FileContentPanel.tsx`, add to the imports at the top:

```tsx
import PdfViewer from './PdfViewer'
import { DirectoryListing, ImagePreview, VideoPlayer, FileMetaView, isImageFile, isVideoFile, isPdfFile } from './DirectoryListing'
```

(This replaces the existing `DirectoryListing` import on line 3, adding `isPdfFile`.)

- [ ] **Step 2: Add `isPdfFile` guard to `isCodeFile` variable**

In `FileContentPanel.tsx` line 94, add `!isPdfFile(filename)` to the `isCodeFile` guard to prevent the CodeToolbar from rendering above the PDF viewer:

Replace:
```tsx
  const isCodeFile = selectedEntry?.type === 'blob' && blobContent !== null && !isBinaryContent(blobContent) && !isImageFile(filename) && !isVideoFile(filename) && !isMarkdownFile(filename) && !blobLoading
```

With:
```tsx
  const isCodeFile = selectedEntry?.type === 'blob' && blobContent !== null && !isBinaryContent(blobContent) && !isImageFile(filename) && !isVideoFile(filename) && !isPdfFile(filename) && !isMarkdownFile(filename) && !blobLoading
```

- [ ] **Step 3: Add PDF branch to the conditional chain**

In `FileContentPanel.tsx`, insert a new branch after the `isVideoFile` check (after line 131) and before the `blobLoading` check (line 133):

```tsx
      ) : isPdfFile(filename) && blobRawBase64 ? (
        <PdfViewer data={blobRawBase64} owner={owner} name={name} branch={branch} path={selectedPath ?? undefined} />
```

The full chain around the insertion point should read:

```tsx
      ) : isVideoFile(filename) ? (
        <VideoPlayer rawUrl={rawUrl} filename={filename} />
      ) : isPdfFile(filename) && blobRawBase64 ? (
        <PdfViewer data={blobRawBase64} owner={owner} name={name} branch={branch} path={selectedPath ?? undefined} />
      ) : blobLoading ? (
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | head -20
```

Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/components/FileContentPanel.tsx
git commit -m "feat(pdf): integrate PdfViewer into FileContentPanel rendering chain"
```

---

### Task 6: PDF-aware file size limits in FilesTab

**Files:**
- Modify: `src/components/FilesTab.tsx:299-307` (handleSelectFile)
- Modify: `src/components/FilesTab.tsx:209-210` (initialPath effect)

- [ ] **Step 1: Add isPdfFile import**

In `src/components/FilesTab.tsx`, add `isPdfFile` to the existing import from `./DirectoryListing`:

```tsx
import { isVideoFile, isPdfFile } from './DirectoryListing'
```

(Replaces the existing `import { isVideoFile } from './DirectoryListing'` on line 9.)

- [ ] **Step 2: Update handleSelectFile size limit**

In `handleSelectFile` (around line 304), replace:

```tsx
    if (entry.size && entry.size > 1_000_000) {
      pushHistory(fullPath)
      return
    }
```

With:

```tsx
    const isPdf = isPdfFile(fullPath)
    if (!isPdf && entry.size && entry.size > 1_000_000) {
      pushHistory(fullPath)
      return
    }
    if (isPdf && entry.size && entry.size > 50_000_000) {
      pushHistory(fullPath)
      return
    }
```

- [ ] **Step 3: Update initialPath navigation size limit**

In the `initialPath` navigation effect (around line 210), replace:

```tsx
          if (targetEntry.size && targetEntry.size > 1_000_000) return
```

With:

```tsx
          const isPdf = isPdfFile(initialPath)
          if (!isPdf && targetEntry.size && targetEntry.size > 1_000_000) return
          if (isPdf && targetEntry.size && targetEntry.size > 50_000_000) return
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | head -20
```

Expected: compiles without errors

- [ ] **Step 5: Commit**

```bash
git add src/components/FilesTab.tsx
git commit -m "feat(pdf): raise file size limit to 50MB for PDF files"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test PDF viewing**

Navigate to a repo that contains a PDF file. Click on the PDF in the file tree. Verify:

1. The PDF renders inline (not the FileMetaView fallback)
2. Pages display correctly with continuous scroll
3. Zoom in/out/reset work
4. Text can be selected and copied
5. Page indicator shows correct current page
6. Annotations (links, highlights) display if present in the PDF

- [ ] **Step 3: Test search**

With a PDF open, press Ctrl+F. Verify:

1. Search bar appears
2. Typing a query and pressing Enter finds matches
3. Match count displays
4. Next/prev navigation works
5. Escape closes search

- [ ] **Step 4: Test error handling**

Try to view a password-protected PDF if available, or verify that the error state renders for corrupt data.

- [ ] **Step 5: Test large file behavior**

Verify that files over 50MB still show the FileMetaView fallback, and that normal non-PDF files still have the 1MB limit.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(pdf): address issues found during manual testing"
```

---

### Task 8: Troubleshooting — PDF.js worker

If the build or runtime fails due to the PDF.js worker not loading, try these alternatives in order:

**Option A:** Copy the worker to public directory:

```bash
cp node_modules/pdfjs-dist/build/pdf.worker.mjs public/pdf.worker.mjs
```

Then update the worker config in `PdfViewer.tsx`:

```tsx
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
```

**Option B:** Disable the worker (slower but works as fallback):

```tsx
pdfjsLib.GlobalWorkerOptions.workerSrc = ''
```

**Option C:** Use a CDN (if online access is acceptable):

```tsx
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
```
