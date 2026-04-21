# A4 Content Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo detail view to use a fixed 794px (A4) content panel with a standalone glass TOC panel on the left.

**Architecture:** Three-panel flex layout (TOC | Content | Sidebar) centered via `justify-content: center`. TOC panel only renders on README tab when headings exist. TocNav is extracted from ReadmeRenderer into its own module; heading data flows up via `onTocReady` callback and is passed to TocNav as a prop (TocNav no longer queries the DOM itself for the heading list — only for live scroll-spy position checks).

**Tech Stack:** React, CSS (no new dependencies)

**Spec:** `docs/superpowers/specs/2026-04-16-a4-content-layout-design.md`

---

### Task 1: Extract TocNav into its own module

**Files:**
- Create: `src/components/TocNav.tsx`
- Modify: `src/components/ReadmeRenderer.tsx:42-59` (scrollTargetIntoView)
- Modify: `src/components/ReadmeRenderer.tsx:721-857` (TocNav + TocItem)

- [ ] **Step 1: Create `src/components/TocNav.tsx`**

Move `TocItem`, `scrollTargetIntoView`, and `TocNav` out of ReadmeRenderer into a new file. TocNav now receives `headings` as a prop (extracted once by the parent) and only owns scroll-spy behavior. It needs two refs: one for the scroll container (article body) and one for the headings container (readme body, used for live `getBoundingClientRect` reads during scroll).

```tsx
// src/components/TocNav.tsx
import { memo, useState, useRef, useEffect } from 'react'

export interface TocItem {
  id: string
  text: string
  level: number
  parentId: string | null
}

/**
 * Scrolls ONLY the nearest ancestor that has a real scrollbar.
 * Using Element.scrollIntoView() would also shift the scrollTop of every
 * `overflow: hidden` ancestor in the chain.
 */
export function scrollTargetIntoView(target: HTMLElement): void {
  let el: HTMLElement | null = target.parentElement
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const containerRect = el.getBoundingClientRect()
      const targetRect    = target.getBoundingClientRect()
      el.scrollTo({
        top: el.scrollTop + (targetRect.top - containerRect.top),
        behavior: 'smooth',
      })
      return
    }
    el = el.parentElement
  }
  window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' })
}

/**
 * Standalone table-of-contents nav with scroll spy.
 *
 * Props:
 * - headings: TOC items extracted by the parent (ReadmeRenderer → RepoDetail).
 *   TocNav does NOT extract these itself — the parent owns the canonical list.
 * - scrollContainerRef: the element whose scroll events drive the active highlight
 *   (the .article-layout-body pane).
 * - headingsContainerRef: the element to query live during scroll for current
 *   heading positions (the .readme-body div inside ReadmeRenderer).
 */
const TocNav = memo(function TocNav({
  headings,
  scrollContainerRef,
  headingsContainerRef,
}: {
  headings: TocItem[]
  scrollContainerRef: React.RefObject<HTMLElement>
  headingsContainerRef: React.RefObject<HTMLElement>
}) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? '')
  const isNavigating            = useRef(false)
  const navTimeoutRef           = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset activeId when heading list changes (e.g. switching repos)
  useEffect(() => {
    setActiveId(headings[0]?.id ?? '')
  }, [headings])

  useEffect(() => {
    if (headings.length < 2) return
    const scrollEl     = scrollContainerRef.current
    const headingsRoot = headingsContainerRef.current
    if (!scrollEl || !headingsRoot) return

    const paneTop   = scrollEl.getBoundingClientRect().top
    const threshold = paneTop + 80

    let rafId      = 0
    let lastActive = headings[0].id

    const updateActive = () => {
      if (isNavigating.current) return
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const liveHeadings = Array.from(
          headingsRoot.querySelectorAll('h2[id], h3[id]')
        ) as HTMLElement[]
        let active = headings[0].id
        for (const h of liveHeadings) {
          if (h.getBoundingClientRect().top <= threshold) active = h.id
        }
        if (active !== lastActive) {
          lastActive = active
          setActiveId(active)
        }
      })
    }

    updateActive()
    scrollEl.addEventListener('scroll', updateActive, { passive: true })
    return () => {
      scrollEl.removeEventListener('scroll', updateActive)
      if (rafId) cancelAnimationFrame(rafId)
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
    }
  }, [headings, scrollContainerRef, headingsContainerRef])

  if (headings.length < 2) return null

  const activeItem   = headings.find(t => t.id === activeId)
  const expandedH2Id = activeItem?.level === 2 ? activeItem.id : (activeItem?.parentId ?? null)
  const h2sWithChildren = new Set(
    headings.filter(t => t.parentId !== null).map(t => t.parentId!)
  )

  return (
    <nav className="rm-toc" aria-label="On this page">
      <span className="rm-toc-label">On this page</span>
      {headings.map(item => {
        if (item.level === 3 && item.parentId !== expandedH2Id) return null
        const hasChildren = item.level === 2 && h2sWithChildren.has(item.id)
        const isExpanded  = hasChildren && item.id === expandedH2Id
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={[
              'rm-toc-item',
              `rm-toc-h${item.level}`,
              activeId === item.id ? 'rm-toc-active'   : '',
              isExpanded            ? 'rm-toc-expanded' : '',
            ].filter(Boolean).join(' ')}
            title={item.text}
            onClick={(e) => {
              e.preventDefault()
              isNavigating.current = true
              if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
              navTimeoutRef.current = setTimeout(() => { isNavigating.current = false }, 1000)
              const heading = document.getElementById(item.id)
              if (heading) scrollTargetIntoView(heading)
              setActiveId(item.id)
            }}
          >
            <span className="rm-toc-text">{item.text}</span>
            {hasChildren && (
              <span className="rm-toc-chevron" aria-hidden="true">
                <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
})

export default TocNav
```

- [ ] **Step 2: Remove TocItem, scrollTargetIntoView, and TocNav from ReadmeRenderer**

In `src/components/ReadmeRenderer.tsx`:

1. Delete the `scrollTargetIntoView` function (lines 42–59).
2. Delete the `TocItem` interface (line 721).
3. Delete the entire `TocNav` component (lines 726–857).
4. Add an import for `scrollTargetIntoView` at the top — it is still called at **line 1520** (anchor-click handler for `#hash` links in the markdown's `a` component override) and will be used by the TOC extraction effect added in Task 2. Add:

```tsx
import { scrollTargetIntoView } from './TocNav'
```

- [ ] **Step 3: Remove TocNav render from rm-body-row**

In `ReadmeRenderer.tsx`, change the render at lines 1647–1659 from:

```tsx
<div className="rm-body-row">
  <TocNav content={content} containerRef={containerRef} />
  <div className="rm-content">
```

to:

```tsx
<div className="rm-body-row">
  <div className="rm-content">
```

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: Compiles with no errors. TocNav extraction is complete but not yet rendered anywhere — the TOC simply won't appear until Task 3 wires it up. The `#hash` anchor navigation in markdown content still works because `scrollTargetIntoView` is imported from the new module.

- [ ] **Step 5: Commit**

```bash
git add src/components/TocNav.tsx src/components/ReadmeRenderer.tsx
git commit -m "refactor: extract TocNav into standalone module"
```

---

### Task 2: Add onTocReady callback and readmeBodyRef to ReadmeRenderer

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx:997-1008` (Props + component + refs)
- Modify: `src/components/ReadmeRenderer.tsx:1645-1646` (containerRef attachment)

- [ ] **Step 1: Update imports and Props**

At the top of `ReadmeRenderer.tsx`, update the existing `scrollTargetIntoView` import (from Task 1 Step 2) to also bring in `TocItem`:

```tsx
import { scrollTargetIntoView, type TocItem } from './TocNav'
```

Change the `Props` interface (line 997) to:

```tsx
interface Props {
  content: string
  repoOwner: string
  repoName: string
  branch?: string
  basePath?: string
  onNavigateToFile?: (path: string) => void
  onTocReady?: (headings: TocItem[]) => void
  readmeBodyRef?: React.RefObject<HTMLDivElement>
}
```

Update the component signature (line 1006):

```tsx
export default function ReadmeRenderer({ content, repoOwner, repoName, branch = 'main', basePath = '', onNavigateToFile, onTocReady, readmeBodyRef }: Props) {
```

- [ ] **Step 2: Replace `containerRef` with a callback ref that syncs `readmeBodyRef`**

Replace the `useRef` declaration at line 1008:

```tsx
const containerRef = useRef<HTMLDivElement>(null)
```

with a callback ref that writes to both the internal ref and the external `readmeBodyRef`:

```tsx
const containerRef = useRef<HTMLDivElement>(null)

// Callback ref: attach to .readme-body, and also populate external readmeBodyRef
// so RepoDetail can pass that element to the external TocNav as headingsContainerRef.
const setContainerRef = useCallback((el: HTMLDivElement | null) => {
  (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
  if (readmeBodyRef) {
    (readmeBodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el
  }
}, [readmeBodyRef])
```

Note: `useCallback` is already imported in ReadmeRenderer. Verify by checking the top-of-file imports; if not, add it.

- [ ] **Step 3: Swap `ref={containerRef}` to `ref={setContainerRef}` on the readme-body div**

At line 1646, change:

```tsx
<div className={`readme-body${tts.status !== 'idle' ? ' tts-playing' : ''}`} ref={containerRef}>
```

to:

```tsx
<div className={`readme-body${tts.status !== 'idle' ? ' tts-playing' : ''}`} ref={setContainerRef}>
```

- [ ] **Step 4: Add the heading-extraction effect**

After the `setContainerRef` declaration, add:

```tsx
const prevHeadingIds = useRef<string>('')

useEffect(() => {
  if (!onTocReady) return
  const container = containerRef.current
  if (!container) return

  // Wait one frame for ReactMarkdown to populate the DOM with headings
  const rafId = requestAnimationFrame(() => {
    const domHeadings = Array.from(
      container.querySelectorAll('h2[id], h3[id]')
    ) as HTMLElement[]

    let lastH2Id: string | null = null
    const items: TocItem[] = []
    for (const h of domHeadings) {
      const text = h.textContent?.trim() ?? ''
      if (!text) continue
      const level = parseInt(h.tagName[1])
      if (level === 2) lastH2Id = h.id
      items.push({ id: h.id, text, level, parentId: level === 3 ? lastH2Id : null })
    }

    // Only notify parent when the heading list actually changes
    // (prevents infinite re-render loops on unrelated re-renders)
    const idKey = items.map(i => i.id).join(',')
    if (idKey !== prevHeadingIds.current) {
      prevHeadingIds.current = idKey
      onTocReady(items)
    }
  })
  return () => cancelAnimationFrame(rafId)
}, [content, onTocReady])
```

- [ ] **Step 5: Verify the app builds**

Run: `npm run build`
Expected: Compiles — new props are optional, nothing breaks. The callback ref works for both internal scroll-spy ancestors (via the same DOM element) and the external `readmeBodyRef`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReadmeRenderer.tsx
git commit -m "feat: add onTocReady callback and readmeBodyRef to ReadmeRenderer"
```

---

### Task 3: Add bodyRef prop to ArticleLayout

**Files:**
- Modify: `src/components/ArticleLayout.tsx` (full file)

ArticleLayout is consumed only in `RepoDetail.tsx` (verified via grep — no other consumers). The `bodyRef` prop is optional, so no existing call sites break.

- [ ] **Step 1: Add bodyRef to ArticleLayoutProps**

Change `src/components/ArticleLayout.tsx` to:

```tsx
// src/components/ArticleLayout.tsx
import React from 'react'
import './ArticleLayout.css'

export type ArticleLayoutProps = {
  byline: React.ReactNode
  title: React.ReactNode
  tabs: React.ReactNode
  body: React.ReactNode
  actionRow: React.ReactNode
  /** When true, body renders without internal padding (for Files / Components tabs) */
  fullBleedBody?: boolean
  /** Forwarded ref to the scrollable .article-layout-body div */
  bodyRef?: React.RefObject<HTMLDivElement>
}

export function ArticleLayout({
  byline,
  title,
  tabs,
  body,
  actionRow,
  fullBleedBody = false,
  bodyRef,
}: ArticleLayoutProps) {
  return (
    <div className="article-layout">
      <div className="article-layout-byline">{byline}</div>
      <div className="article-layout-title">{title}</div>
      <hr className="article-layout-divider" />
      <div className="article-layout-tabs-slot">{tabs}</div>
      <hr className="article-layout-divider" />
      <div
        ref={bodyRef}
        className={`article-layout-body${fullBleedBody ? ' article-layout-body--full-bleed' : ''}`}
      >
        {body}
      </div>
      <hr className="article-layout-divider" />
      <div className="article-layout-actions">{actionRow}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ArticleLayout.tsx
git commit -m "feat: add optional bodyRef prop to ArticleLayout"
```

---

### Task 4: Wire up TOC panel in RepoDetail

**Files:**
- Modify: `src/views/RepoDetail.tsx` (imports line 1, state, JSX at 993, ReadmeRenderer call at 1054)

- [ ] **Step 1: Add imports and state in RepoDetail**

At the top of `src/views/RepoDetail.tsx`, update the React import (currently line 1):

```tsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
```

Add a new import after the `ReadmeRenderer` import (line 13):

```tsx
import TocNav, { type TocItem } from '../components/TocNav'
```

Inside the `RepoDetail` component body (near the other `useState`/`useRef` declarations), add:

```tsx
const [tocHeadings, setTocHeadings] = useState<TocItem[]>([])
const readmeBodyRef  = useRef<HTMLDivElement>(null)
const articleBodyRef = useRef<HTMLDivElement>(null)
const handleTocReady = useCallback((headings: TocItem[]) => setTocHeadings(headings), [])
```

- [ ] **Step 2: Clear TOC headings when switching away from README tab**

Add this effect alongside the state declarations (or anywhere in the component body) so the TOC panel doesn't flash stale headings when returning to README:

```tsx
useEffect(() => {
  if (activeTab !== 'readme') setTocHeadings([])
}, [activeTab])
```

- [ ] **Step 3: Add the TOC panel to the layout JSX**

At line 993, change:

```tsx
<div className="repo-detail-layout">
  <div className="repo-detail-article-panel">
```

to:

```tsx
<div className="repo-detail-layout">
  {activeTab === 'readme' && tocHeadings.length >= 2 && (
    <div className="repo-detail-toc-panel">
      <TocNav
        headings={tocHeadings}
        scrollContainerRef={articleBodyRef}
        headingsContainerRef={readmeBodyRef}
      />
    </div>
  )}
  <div className="repo-detail-article-panel">
```

- [ ] **Step 4: Pass `bodyRef` to ArticleLayout**

At the `<ArticleLayout` call (starts near line 1000), add the `bodyRef` prop:

```tsx
<ArticleLayout
  byline={bylineNode}
  title={titleNode}
  tabs={tabsNode}
  bodyRef={articleBodyRef}
  body={
    ...
```

- [ ] **Step 5: Pass new props to ReadmeRenderer**

At the `<ReadmeRenderer` call (line 1054), add the two new props:

```tsx
<ReadmeRenderer
  content={
    showOriginal || !readmeTranslated
      ? (cleanedReadme || readme as string)
      : (cleanedDisplayReadme || displayReadme)
  }
  repoOwner={owner ?? ''}
  repoName={name ?? ''}
  branch={repo?.default_branch ?? 'main'}
  onNavigateToFile={handleNavigateToFile}
  onTocReady={handleTocReady}
  readmeBodyRef={readmeBodyRef}
/>
```

- [ ] **Step 6: Verify the app builds**

Run: `npm run build`
Expected: Compiles — the TOC panel now renders structurally, but its visual styling comes from Task 5.

- [ ] **Step 7: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: wire up standalone TOC panel in repo detail layout"
```

---

### Task 5: Update CSS for the three-panel layout

**Files:**
- Modify: `src/styles/globals.css:2344-2370` (panel layout rules)
- Modify: `src/styles/globals.css:2385` (add new TOC panel rule below)
- Modify: `src/styles/globals.css:3154-3184` (rm-body-row, rm-content, rm-toc)

- [ ] **Step 1: Update `.repo-detail-layout` — add centering**

In `globals.css` line 2344, change:

```css
.repo-detail-layout {
  position: relative;
  z-index: 2;
  margin: 0 16px 96px;
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
}
```

to:

```css
.repo-detail-layout {
  position: relative;
  z-index: 2;
  margin: 0 16px 96px;
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
}
```

(Keep the existing comment about the bottom margin intact.)

- [ ] **Step 2: Change article panel to fixed A4 width**

Change `.repo-detail-article-panel` (line 2357) from:

```css
.repo-detail-article-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(13, 17, 23, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
```

to:

```css
.repo-detail-article-panel {
  width: 794px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(13, 17, 23, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
```

(Drop `min-width: 0` — no longer needed since `flex-shrink: 0`.)

- [ ] **Step 3: Add TOC panel styles**

After `.repo-detail-sidebar-panel` (after line 2385), add:

```css
.repo-detail-toc-panel {
  width: 200px;
  flex-shrink: 0;
  align-self: stretch;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(13, 17, 23, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

@media (max-width: 1300px) {
  .repo-detail-toc-panel { display: none; }
}
```

- [ ] **Step 4: Simplify rm-body-row — remove the 3-column grid**

Change `.rm-body-row` (line 3155) from:

```css
.rm-body-row {
  display: grid;
  grid-template-columns: 1fr 620px 1fr;
  align-items: start;
}
```

to:

```css
.rm-body-row {
  display: block;
}
```

Also update the comment immediately above (line 3154) from `/* Flex row: readme content + sticky TOC nav */` to `/* Simple block wrapper for readme content (TOC now lives in external panel) */`.

- [ ] **Step 5: Simplify rm-content — remove grid column**

Change `.rm-content` (line 3163) from:

```css
.rm-content {
  grid-column: 2;
  min-width: 0;
  padding: 24px 0 32px;
}
```

to:

```css
.rm-content {
  min-width: 0;
  padding: 24px 0 32px;
}
```

- [ ] **Step 6: Restyle rm-toc for panel context**

Change `.rm-toc` (line 3170) from:

```css
.rm-toc {
  grid-column: 1;
  justify-self: end;
  width: 200px;
  position: sticky;
  top: 24px;
  align-self: start;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  padding-top: 26px;
  padding-right: 20px;
  box-sizing: border-box;
}
```

to:

```css
.rm-toc {
  padding: 18px 12px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  flex: 1;
  min-height: 0;
}
```

(The `.rm-toc::-webkit-scrollbar { display: none; }` rule on line 3185 continues to work and does not need changes.)

- [ ] **Step 7: Verify the app builds**

Run: `npm run build`
Expected: Compiles with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: CSS for A4 content panel, standalone TOC panel, centered layout"
```

---

### Task 6: Verify and fix edge cases

**Files:**
- Possibly modify: `src/views/RepoDetail.tsx`, `src/styles/globals.css`

- [ ] **Step 1: Verify README tab with TOC**

Launch the app and navigate to a repo with a README that has multiple headings (e.g., facebook/react). Confirm:
- Three panels visible: TOC (200px) | Content (794px) | Sidebar (220px)
- TOC scroll spy highlights the correct heading as you scroll
- Clicking a TOC item smooth-scrolls the content to that heading
- TOC panel scrolls independently if the heading list is long

- [ ] **Step 2: Verify non-README tab**

Switch to the Files tab. Confirm:
- TOC panel disappears
- Content panel stays at 794px
- Content and sidebar remain centered (content shifts right by ~110px as expected)

- [ ] **Step 3: Verify short README (< 2 headings)**

Navigate to a repo with a minimal README (only one or zero h2/h3 headings). Confirm:
- TOC panel does not render (no empty glass panel)
- Layout is two-panel: Content + Sidebar

- [ ] **Step 4: Verify TTS and hash-link navigation still work**

- Start TTS playback on a README. Confirm heading-based auto-scroll and playback controls work as before.
- Click a `#hash` link inside rendered markdown (e.g. a footnote ref). Confirm it smooth-scrolls correctly (verifies `scrollTargetIntoView` import works from the new module).

- [ ] **Step 5: Verify responsive behavior**

Resize the window below ~1300px. Confirm:
- TOC panel hides via media query
- Content + sidebar remain visible and centered

- [ ] **Step 6: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: edge cases for A4 layout"
```
