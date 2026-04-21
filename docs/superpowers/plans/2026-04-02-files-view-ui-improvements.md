# Files View — UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Files tab with a code viewer toolbar, line numbers, file tree enhancements, breadcrumb improvements, and a resizable sidebar split.

**Architecture:** Extend existing component tree (`FilesTab → FileTreePanel + FileContentPanel → CodeViewer / BreadcrumbBar`) with new sub-components and hooks. No architectural changes — purely additive UI improvements layered onto the current rendering pipeline.

**Tech Stack:** React 18, Shiki (existing), lucide-react icons, CSS custom properties (existing design tokens in `globals.css`), Vitest + @testing-library/react

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src/hooks/useLocalStorage.ts` | Generic hook to persist state in `localStorage` with SSR-safe fallback |
| `src/hooks/useResizable.ts` | Pointer-event-based drag resize logic, returns width + handlers |
| `src/components/CodeToolbar.tsx` | Slim toolbar row with language badge, line count, file size, copy/wrap buttons |
| `src/components/FileTreeFilter.tsx` | Compact search input for filtering the file tree |

### Modified files

| File | Changes |
|------|---------|
| `src/components/CodeViewer.tsx` | Add line number gutter, word-wrap toggle support, expose line count |
| `src/components/FileTreePanel.tsx` | Indent guides, split file name/extension rendering, folder item counts, chevron animation |
| `src/components/BreadcrumbBar.tsx` | Copy-path button, separator opacity tweak |
| `src/components/FileContentPanel.tsx` | Integrate `CodeToolbar` between breadcrumb and content |
| `src/components/FilesTab.tsx` | Resizable sidebar, keyboard shortcuts (`Ctrl+B` sidebar toggle, `Ctrl+Shift+F` filter focus), filter state |
| `src/styles/globals.css` | All new CSS for toolbar, line numbers, indent guides, resize handle, filter input, animations |

---

## Task 1: `useLocalStorage` Hook

**Files:**
- Create: `src/hooks/useLocalStorage.ts`
- Test: `src/hooks/useLocalStorage.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/hooks/useLocalStorage.test.ts
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from './useLocalStorage'

beforeEach(() => localStorage.clear())

it('returns the initial value when localStorage is empty', () => {
  const { result } = renderHook(() => useLocalStorage('key', 42))
  expect(result.current[0]).toBe(42)
})

it('persists value to localStorage on update', () => {
  const { result } = renderHook(() => useLocalStorage('key', 0))
  act(() => result.current[1](10))
  expect(result.current[0]).toBe(10)
  expect(JSON.parse(localStorage.getItem('key')!)).toBe(10)
})

it('reads existing value from localStorage on mount', () => {
  localStorage.setItem('key', JSON.stringify('hello'))
  const { result } = renderHook(() => useLocalStorage('key', ''))
  expect(result.current[0]).toBe('hello')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useLocalStorage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// src/hooks/useLocalStorage.ts
import { useState, useCallback } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item !== null ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const nextValue = value instanceof Function ? value(prev) : value
      try { localStorage.setItem(key, JSON.stringify(nextValue)) } catch { /* quota */ }
      return nextValue
    })
  }, [key])

  return [storedValue, setValue]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useLocalStorage.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLocalStorage.ts src/hooks/useLocalStorage.test.ts
git commit -m "feat(files): add useLocalStorage hook for persisting UI preferences"
```

---

## Task 2: `useResizable` Hook

**Files:**
- Create: `src/hooks/useResizable.ts`
- Test: `src/hooks/useResizable.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/hooks/useResizable.test.ts
import { renderHook, act } from '@testing-library/react'
import { useResizable } from './useResizable'

beforeEach(() => localStorage.clear())

it('returns initial width from defaults', () => {
  const { result } = renderHook(() => useResizable({ storageKey: 'w', defaultWidth: 220, minWidth: 180, maxWidth: 500 }))
  expect(result.current.width).toBe(220)
  expect(result.current.isCollapsed).toBe(false)
})

it('toggles collapsed state', () => {
  const { result } = renderHook(() => useResizable({ storageKey: 'w', defaultWidth: 220, minWidth: 180, maxWidth: 500 }))
  act(() => result.current.toggleCollapse())
  expect(result.current.isCollapsed).toBe(true)
  act(() => result.current.toggleCollapse())
  expect(result.current.isCollapsed).toBe(false)
})

it('clamps width to min/max', () => {
  const { result } = renderHook(() => useResizable({ storageKey: 'w', defaultWidth: 220, minWidth: 180, maxWidth: 500 }))
  act(() => result.current.setWidth(100))
  expect(result.current.width).toBe(180)
  act(() => result.current.setWidth(9999))
  expect(result.current.width).toBe(500)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useResizable.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// src/hooks/useResizable.ts
import { useCallback, useRef, useEffect } from 'react'
import { useLocalStorage } from './useLocalStorage'

interface Options {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

export function useResizable({ storageKey, defaultWidth, minWidth, maxWidth }: Options) {
  const [width, setWidthRaw] = useLocalStorage(storageKey, defaultWidth)
  const [isCollapsed, setIsCollapsed] = useLocalStorage(`${storageKey}:collapsed`, false)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const setWidth = useCallback((w: number) => {
    setWidthRaw(Math.min(maxWidth, Math.max(minWidth, w)))
  }, [minWidth, maxWidth, setWidthRaw])

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [setIsCollapsed])

  const onDragStart = useCallback((e: React.PointerEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [width])

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    setWidth(startWidth.current + delta)
  }, [setWidth])

  const onDragEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  const onDoubleClick = useCallback(() => {
    toggleCollapse()
  }, [toggleCollapse])

  return {
    width,
    setWidth,
    isCollapsed,
    toggleCollapse,
    handleProps: {
      onPointerDown: onDragStart,
      onPointerMove: onDragMove,
      onPointerUp: onDragEnd,
      onDoubleClick,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useResizable.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useResizable.ts src/hooks/useResizable.test.ts
git commit -m "feat(files): add useResizable hook for drag-to-resize sidebar"
```

---

## Task 3: `CodeToolbar` Component

**Files:**
- Create: `src/components/CodeToolbar.tsx`
- Test: `src/components/CodeToolbar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/CodeToolbar.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CodeToolbar from './CodeToolbar'

it('renders language, line count, and file size', () => {
  render(<CodeToolbar language="javascript" lineCount={142} fileSize={4200} wordWrap={false} onToggleWordWrap={() => {}} />)
  expect(screen.getByText('JavaScript')).toBeInTheDocument()
  expect(screen.getByText('142 lines')).toBeInTheDocument()
  expect(screen.getByText('4.1 KB')).toBeInTheDocument()
})

it('calls onToggleWordWrap when wrap button clicked', async () => {
  const onToggle = vi.fn()
  render(<CodeToolbar language="typescript" lineCount={10} fileSize={500} wordWrap={false} onToggleWordWrap={onToggle} />)
  await userEvent.click(screen.getByTitle('Toggle word wrap'))
  expect(onToggle).toHaveBeenCalledOnce()
})

it('copies content to clipboard on copy button click', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  const original = navigator.clipboard
  Object.assign(navigator, { clipboard: { writeText } })
  render(<CodeToolbar language="go" lineCount={5} fileSize={100} wordWrap={false} onToggleWordWrap={() => {}} content="package main" />)
  await userEvent.click(screen.getByTitle('Copy file contents'))
  expect(writeText).toHaveBeenCalledWith('package main')
  Object.assign(navigator, { clipboard: original })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CodeToolbar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```tsx
// src/components/CodeToolbar.tsx
import { useState, useCallback } from 'react'
import { Clipboard, Check, WrapText, AlignLeft } from 'lucide-react'

interface Props {
  language: string
  lineCount: number
  fileSize: number
  wordWrap: boolean
  onToggleWordWrap: () => void
  content?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatLanguage(lang: string): string {
  const map: Record<string, string> = {
    javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX',
    json: 'JSON', yaml: 'YAML', css: 'CSS', html: 'HTML', python: 'Python',
    ruby: 'Ruby', go: 'Go', rust: 'Rust', bash: 'Bash', toml: 'TOML',
    xml: 'XML', sql: 'SQL', graphql: 'GraphQL', markdown: 'Markdown',
    diff: 'Diff', dockerfile: 'Dockerfile', c: 'C', cpp: 'C++', java: 'Java',
    swift: 'Swift', kotlin: 'Kotlin', php: 'PHP', lua: 'Lua', zig: 'Zig',
    elixir: 'Elixir', haskell: 'Haskell', text: 'Plain Text',
  }
  return map[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1)
}

export default function CodeToolbar({ language, lineCount, fileSize, wordWrap, onToggleWordWrap, content }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <div className="code-toolbar">
      <div className="code-toolbar__left">
        <span className="code-toolbar__lang-badge">{formatLanguage(language)}</span>
        <span className="code-toolbar__meta">{lineCount} lines</span>
        <span className="code-toolbar__divider">·</span>
        <span className="code-toolbar__meta">{formatSize(fileSize)}</span>
      </div>
      <div className="code-toolbar__right">
        <button
          className="code-toolbar__btn"
          title="Copy file contents"
          onClick={handleCopy}
          disabled={!content}
        >
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
        </button>
        <button
          className={`code-toolbar__btn${wordWrap ? ' code-toolbar__btn--active' : ''}`}
          title="Toggle word wrap"
          onClick={onToggleWordWrap}
        >
          {wordWrap ? <WrapText size={14} /> : <AlignLeft size={14} />}
        </button>
      </div>
    </div>
  )
}

export { formatSize, formatLanguage }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CodeToolbar.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/CodeToolbar.tsx src/components/CodeToolbar.test.tsx
git commit -m "feat(files): add CodeToolbar component with language badge, metadata, and actions"
```

---

## Task 4: Line Numbers in `CodeViewer`

**Files:**
- Modify: `src/components/CodeViewer.tsx`

This task adds a line number gutter to the code viewer and wires in word-wrap support. The existing Shiki pipeline stays untouched — line numbers are rendered as a parallel column.

- [ ] **Step 1: Add `wordWrap` and `onLineSelect` props, add `highlightedLine` state**

Update the `Props` interface and component signature in `src/components/CodeViewer.tsx`:

```tsx
interface Props {
  content: string
  filename: string
  wordWrap?: boolean
  onLineCountReady?: (count: number) => void
}
```

- [ ] **Step 2: Restructure the render output to include a line number gutter**

Replace the return JSX with a two-column layout: a `code-viewer__gutter` column (line numbers) and a `code-viewer__code` column (existing content). Line numbers are generated from `content.split('\n').length`.

```tsx
export default function CodeViewer({ content, filename, wordWrap, onLineCountReady }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lang = detectLanguage(filename)
  const lines = content.split('\n')
  const lineCount = lines.length

  useEffect(() => {
    onLineCountReady?.(lineCount)
  }, [lineCount, onLineCountReady])

  useEffect(() => {
    let cancelled = false
    if (lang === 'text') { setHtml(null); return }
    getHighlighter().then(highlighter => {
      if (cancelled) return
      try {
        setHtml(highlighter.codeToHtml(content, { lang, theme: 'github-dark' }))
      } catch { setHtml(null) }
    })
    return () => { cancelled = true }
  }, [content, lang])

  return (
    <div className={`code-viewer${wordWrap ? ' code-viewer--wrap' : ''}`} ref={containerRef}>
      <div className="code-viewer__gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <div
            key={i}
            className={`code-viewer__line-number${highlightedLine === i + 1 ? ' code-viewer__line-number--active' : ''}`}
            onClick={() => setHighlightedLine(prev => prev === i + 1 ? null : i + 1)}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className="code-viewer__code">
        {html ? (
          <div className="code-viewer__highlighted" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="code-viewer__plain"><code>{content}</code></pre>
        )}
      </div>
      {/* Line highlight is applied via the gutter's active class + a CSS highlight on the
         corresponding code line. When word-wrap is enabled, the positional overlay approach
         breaks because wrapped lines shift vertical positions. Instead, use a per-line
         wrapper approach: Shiki's output must be post-processed to wrap each .line in a
         div, OR use a simpler approach — apply the highlight background to the gutter row
         only (which always stays aligned) and skip the full-width stripe when word-wrap
         is on. The gutter highlight is sufficient visual feedback. */}
    </div>
  )
}
```

- [ ] **Step 3: Remove the old `code-viewer__lang` element**

The language label has moved to the `CodeToolbar`. Remove the `<div className="code-viewer__lang">` from the render output.

- [ ] **Step 4: Visually test in the app**

Run: `npm run dev`
Open a repository → Files tab → select a source file. Verify:
- Line numbers appear in a left gutter with muted colour
- Clicking a line number highlights that line
- The old language label in the top-right is gone

- [ ] **Step 5: Commit**

```bash
git add src/components/CodeViewer.tsx
git commit -m "feat(files): add line number gutter with click-to-highlight"
```

---

## Task 5: Line Numbers & Code Viewer CSS

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Merge flex layout into existing `.code-viewer` rule**

In `globals.css`, find the existing `.code-viewer` rule (search for `.code-viewer {`) and add `display: flex;` to it. The existing rule already has `position: relative`, `font-family`, `font-size`, `line-height`, `background`, and `min-height` — preserve all of these and just add the flex display. Then add the new modifier and child rules after the existing block:

```css
/* Add display: flex to the EXISTING .code-viewer rule — do NOT create a duplicate */
/* .code-viewer { ... existing props ... display: flex; } */
.code-viewer--wrap .code-viewer__code {
  white-space: pre-wrap;
  word-break: break-word;
}
.code-viewer--wrap .code-viewer__highlighted pre {
  white-space: pre-wrap;
  word-break: break-word;
}
.code-viewer--wrap .code-viewer__plain {
  white-space: pre-wrap;
  word-break: break-word;
}

.code-viewer__gutter {
  flex-shrink: 0;
  min-width: 48px;
  width: auto;
  padding: 16px 0;
  background: #090d13;
  text-align: right;
  user-select: none;
  -webkit-user-select: none;
  border-right: 1px solid rgba(255,255,255,0.06);
}
.code-viewer__line-number {
  padding: 0 10px 0 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #484f58;
  cursor: pointer;
}
.code-viewer__line-number:hover {
  color: #8b949e;
}
.code-viewer__line-number--active {
  color: #c9d1d9;
}
.code-viewer__code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}
.code-viewer__line-highlight {
  position: absolute;
  left: 0;
  right: 0;
  height: 1.5em;
  background: rgba(109,40,217,0.08);
  pointer-events: none;
}
/* Hide the full-width highlight stripe when word-wrap is on, since line heights vary.
   The gutter's active line number styling is still visible. */
.code-viewer--wrap .code-viewer__line-highlight {
  display: none;
}
```

- [ ] **Step 2: Remove old `.code-viewer__lang` styles**

Search for `.code-viewer__lang` in `globals.css` and delete the entire rule block (the selector and its declarations).

- [ ] **Step 3: Visually verify**

Run: `npm run dev`
Verify gutter renders with correct alignment, highlight stripe works, word-wrap toggles correctly.

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(files): add line number gutter and word-wrap CSS"
```

---

## Task 6: Integrate `CodeToolbar` into `FileContentPanel`

**Files:**
- Modify: `src/components/FileContentPanel.tsx`
- Modify: `src/components/FilesTab.tsx`

- [ ] **Step 1: Add toolbar state to `FilesTab`**

In `FilesTab.tsx`, add word-wrap state and pass it down:

```tsx
import { useLocalStorage } from '../hooks/useLocalStorage'

// Inside component:
const [wordWrap, setWordWrap] = useLocalStorage('files:wordWrap', false)
const [lineCount, setLineCount] = useState(0)
```

Pass `wordWrap`, `setWordWrap`, `lineCount`, `setLineCount` through `FileContentPanel` props.

- [ ] **Step 2: Add `CodeToolbar` to `FileContentPanel`**

In `FileContentPanel.tsx`, render `CodeToolbar` between the `BreadcrumbBar` and the code content — only when displaying a code file (not directory, not image, not markdown, not loading):

```tsx
import CodeToolbar from './CodeToolbar'

// After BreadcrumbBar, before CodeViewer:
{showToolbar && (
  <CodeToolbar
    language={lang}
    lineCount={lineCount}
    fileSize={selectedEntry?.size ?? 0}
    wordWrap={wordWrap}
    onToggleWordWrap={() => setWordWrap(w => !w)}
    content={blobContent ?? undefined}
  />
)}
```

Where `showToolbar` is true when rendering the `CodeViewer` case (not directory/image/markdown/loading/binary).

- [ ] **Step 3: Pass `wordWrap` and `onLineCountReady` to `CodeViewer`**

```tsx
<CodeViewer content={blobContent} filename={filename} wordWrap={wordWrap} onLineCountReady={setLineCount} />
```

- [ ] **Step 4: Visually verify toolbar renders**

Run: `npm run dev`
Verify: toolbar shows language badge, line count, file size. Copy button works. Word wrap toggle works.

- [ ] **Step 5: Commit**

```bash
git add src/components/FileContentPanel.tsx src/components/FilesTab.tsx
git commit -m "feat(files): integrate CodeToolbar into file content panel"
```

---

## Task 7: CodeToolbar CSS

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add toolbar styles**

```css
/* ── Code toolbar ───────────────────────────────────────────────────── */
.code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 12px;
  background: #0d1117;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.code-toolbar__left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.code-toolbar__lang-badge {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #c9d1d9;
  background: rgba(255,255,255,0.06);
  padding: 2px 8px;
  border-radius: 10px;
}
.code-toolbar__meta {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #484f58;
}
.code-toolbar__divider {
  color: #484f58;
  font-size: 11px;
}
.code-toolbar__right {
  display: flex;
  align-items: center;
  gap: 2px;
}
.code-toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: #484f58;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.code-toolbar__btn:hover {
  background: rgba(255,255,255,0.08);
  color: #c9d1d9;
}
.code-toolbar__btn--active {
  color: var(--accent-light);
}
.code-toolbar__btn:disabled {
  opacity: 0.3;
  cursor: default;
}
```

- [ ] **Step 2: Verify styles look integrated**

Run: `npm run dev`
Verify toolbar feels native to the dark code area, buttons show tooltips on hover, active state on word-wrap toggle.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(files): add CodeToolbar styles"
```

---

## Task 8: File Tree — Indent Guides + Chevron Animation

**Files:**
- Modify: `src/components/FileTreePanel.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add indent guide rendering**

In `FileTreePanel.tsx`, for each tree node at depth > 0, render thin vertical connector lines. Add `position: relative` to the node container and render guide lines using pseudo-elements via a CSS class that takes depth as a CSS variable:

```tsx
<button
  className={`file-tree__node${isSelected ? ' file-tree__node--selected' : ''}`}
  style={{ paddingLeft: 8 + depth * 16, '--depth': depth } as React.CSSProperties}
  ...
>
```

- [ ] **Step 2: Add chevron rotation transition in CSS**

```css
.file-tree__chevron {
  flex-shrink: 0;
  color: var(--t3);
  transition: transform 150ms ease;
}
.file-tree__chevron--expanded {
  transform: rotate(90deg);
}
```

Update `FileTreePanel.tsx` to always render `ChevronRight` with a conditional `--expanded` class instead of swapping between `ChevronRight` and `ChevronDown`. Also update the import to remove `ChevronDown` (it is no longer used):

```tsx
import { ChevronRight, Folder, File } from 'lucide-react'  // removed ChevronDown
```

```tsx
{isDir ? (
  errorDirs.has(fullPath) ? (
    <span ...>!</span>
  ) : isLoading ? (
    <span className="spin-ring" ... />
  ) : (
    <ChevronRight
      size={14}
      className={`file-tree__chevron${isExpanded ? ' file-tree__chevron--expanded' : ''}`}
    />
  )
) : (
  <span style={{ width: 14, flexShrink: 0 }} />
)}
```

- [ ] **Step 3: Add indent guide CSS**

```css
/* Indent guides */
.file-tree__node {
  position: relative;
}
.file-tree__indent-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
  opacity: 0.25;
}
```

In the component, render guide lines for each depth level:

```tsx
{Array.from({ length: depth }, (_, i) => (
  <span
    key={i}
    className="file-tree__indent-guide"
    style={{ left: 14 + i * 16 }}
  />
))}
```

- [ ] **Step 4: Visually verify indent guides and chevron animation**

Run: `npm run dev`
Verify: guides appear at each nesting level, chevron rotates smoothly on expand/collapse.

- [ ] **Step 5: Commit**

```bash
git add src/components/FileTreePanel.tsx src/styles/globals.css
git commit -m "feat(files): add indent guides and chevron animation to file tree"
```

---

## Task 9: File Tree — Name/Extension Split + Folder Counts + Active Indicator

**Files:**
- Modify: `src/components/FileTreePanel.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Split file name and extension rendering**

Replace the `<span className="file-tree__name">{entry.path}</span>` with:

```tsx
{isDir ? (
  <>
    <span className="file-tree__name file-tree__name--folder">{entry.path}</span>
    {!isExpanded && childCount !== undefined && (
      <span className="file-tree__count">{childCount}</span>
    )}
  </>
) : (
  <span className="file-tree__name">
    {baseName}<span className="file-tree__ext">{ext}</span>
  </span>
)}
```

Where `baseName` and `ext` are computed from `entry.path`:
```tsx
const dotIdx = entry.path.lastIndexOf('.')
const baseName = dotIdx > 0 ? entry.path.slice(0, dotIdx) : entry.path
const ext = dotIdx > 0 ? entry.path.slice(dotIdx) : ''
```

For folder counts, compute `childCount` from `treeData.get(entry.sha)?.length`.

- [ ] **Step 2: Add selected indicator and folder name styles**

```css
.file-tree__node--selected {
  background: var(--accent-soft);
  color: var(--accent-text);
  border-left: 2px solid var(--accent);
}
.file-tree__name--folder {
  font-weight: 500;
}
.file-tree__ext {
  color: var(--t3);
}
.file-tree__count {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  color: var(--t3);
  margin-left: 4px;
  opacity: 0.7;
}
```

- [ ] **Step 3: Visually verify**

Run: `npm run dev`
Verify: file extensions dimmed, folders show counts when collapsed, selected file has left accent bar.

- [ ] **Step 4: Commit**

```bash
git add src/components/FileTreePanel.tsx src/styles/globals.css
git commit -m "feat(files): split name/ext rendering, add folder counts and active indicator"
```

---

## Task 10: `FileTreeFilter` Component

**Files:**
- Create: `src/components/FileTreeFilter.tsx`
- Test: `src/components/FileTreeFilter.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/FileTreeFilter.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileTreeFilter from './FileTreeFilter'

it('renders with placeholder text', () => {
  render(<FileTreeFilter value="" onChange={() => {}} />)
  expect(screen.getByPlaceholderText('Filter files...')).toBeInTheDocument()
})

it('calls onChange on input', async () => {
  const onChange = vi.fn()
  render(<FileTreeFilter value="" onChange={onChange} />)
  await userEvent.type(screen.getByPlaceholderText('Filter files...'), 'tsx')
  expect(onChange).toHaveBeenCalled()
})

it('shows clear button when value is non-empty', () => {
  render(<FileTreeFilter value="test" onChange={() => {}} />)
  expect(screen.getByTitle('Clear filter')).toBeInTheDocument()
})

it('hides clear button when value is empty', () => {
  render(<FileTreeFilter value="" onChange={() => {}} />)
  expect(screen.queryByTitle('Clear filter')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FileTreeFilter.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```tsx
// src/components/FileTreeFilter.tsx
import { useRef, forwardRef, useImperativeHandle } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
}

export interface FileTreeFilterHandle {
  focus: () => void
}

const FileTreeFilter = forwardRef<FileTreeFilterHandle, Props>(({ value, onChange }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  return (
    <div className="file-tree-filter">
      <Search size={12} className="file-tree-filter__icon" />
      <input
        ref={inputRef}
        className="file-tree-filter__input"
        type="text"
        placeholder="Filter files..."
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button
          className="file-tree-filter__clear"
          title="Clear filter"
          onClick={() => onChange('')}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
})

FileTreeFilter.displayName = 'FileTreeFilter'
export default FileTreeFilter
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/FileTreeFilter.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/FileTreeFilter.tsx src/components/FileTreeFilter.test.tsx
git commit -m "feat(files): add FileTreeFilter component"
```

---

## Task 11: File Tree Filter CSS

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add filter styles**

```css
/* ── File tree filter ─────────────────────────────────────────────── */
.file-tree-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}
.file-tree-filter__icon {
  flex-shrink: 0;
  color: var(--t3);
}
.file-tree-filter__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t1);
  outline: none;
}
.file-tree-filter__input::placeholder {
  color: var(--t3);
}
.file-tree-filter__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  color: var(--t3);
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
}
.file-tree-filter__clear:hover {
  background: var(--bg3);
  color: var(--t1);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(files): add FileTreeFilter styles"
```

---

## Task 12: Wire Filter into `FilesTab`

**Files:**
- Modify: `src/components/FilesTab.tsx`
- Modify: `src/components/FileTreePanel.tsx`

- [ ] **Step 1: Add filter state and logic in `FilesTab`**

Add filter state and a function that recursively filters tree entries, keeping parent folders of matching files intact:

```tsx
const [filterText, setFilterText] = useState('')
const filterRef = useRef<{ focus: () => void }>(null)
```

Create a `filterEntries` function that takes root entries and returns filtered entries. A file matches if its full path (case-insensitive) contains the filter text. A folder matches if any descendant matches. Use debounced input (150ms) in the filter component.

- [ ] **Step 2: Render `FileTreeFilter` above `FileTreePanel` in the sidebar**

```tsx
<div className="files-tab__tree" style={sidebarStyle}>
  <FileTreeFilter ref={filterRef} value={filterText} onChange={setFilterText} />
  <FileTreePanel entries={filteredEntries} ... />
</div>
```

- [ ] **Step 3: Add keyboard shortcut `Ctrl+Shift+F` to focus filter**

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault()
      filterRef.current?.focus()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

- [ ] **Step 4: Add filtering logic to `FileTreePanel`**

Pass `filterText` as a prop to `FileTreePanel`. When filter is active, the panel should check if each entry's path matches (case-insensitive contains). Folders are shown if they have matching descendants (recursively checked through `treeData`). For efficiency with large trees, the filter runs on already-loaded entries only — no additional API calls.

**Important:** `filterText` must also be passed through the recursive `<FileTreePanel>` call within the component (around the existing recursive render at the bottom of the component).

```tsx
// In FileTreePanel props:
filterText?: string

// Add a recursive match helper (inside the component or as a standalone function):
function hasMatchingDescendant(sha: string, filter: string, treeData: Map<string, TreeEntry[]>): boolean {
  const children = treeData.get(sha)
  if (!children) return false
  return children.some(c => {
    if (c.path.toLowerCase().includes(filter)) return true
    if (c.type === 'tree') return hasMatchingDescendant(c.sha, filter, treeData)
    return false
  })
}

// In render:
const lowerFilter = filterText?.toLowerCase() ?? ''
const filtered = filterText
  ? sorted.filter(entry => {
      if (entry.path.toLowerCase().includes(lowerFilter)) return true
      if (entry.type === 'tree') return hasMatchingDescendant(entry.sha, lowerFilter, treeData)
      return false
    })
  : sorted

// In the recursive <FileTreePanel> call, add:
// filterText={filterText}
```

- [ ] **Step 5: Visually verify filter works**

Run: `npm run dev`
Verify: typing filters the tree, parent folders of matches stay visible, clear button resets, `Ctrl+Shift+F` focuses the input.

- [ ] **Step 6: Commit**

```bash
git add src/components/FilesTab.tsx src/components/FileTreePanel.tsx
git commit -m "feat(files): wire file tree filter with keyboard shortcut"
```

---

## Task 13: Breadcrumb Improvements

**Files:**
- Modify: `src/components/BreadcrumbBar.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add copy-path button**

Add a clipboard button that appears on hover over the breadcrumb bar. Copies the full path (excluding "root/"):

```tsx
import { useState } from 'react'
import { Clipboard, Check } from 'lucide-react'

// Inside component:
const [copied, setCopied] = useState(false)

const handleCopyPath = async () => {
  await navigator.clipboard.writeText(path)
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}

// At end of breadcrumb bar:
<button className="breadcrumb-bar__copy" title="Copy file path" onClick={handleCopyPath}>
  {copied ? <Check size={12} /> : <Clipboard size={12} />}
</button>
```

- [ ] **Step 2: Update separator opacity in CSS**

```css
.breadcrumb-bar__sep {
  color: var(--t3);
  margin: 0 4px;
  opacity: 0.5;
}
```

- [ ] **Step 3: Add copy button CSS**

```css
.breadcrumb-bar__copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--t3);
  cursor: pointer;
  border-radius: var(--radius-sm);
  margin-left: 8px;
  opacity: 0;
  transition: opacity 150ms;
}
.breadcrumb-bar:hover .breadcrumb-bar__copy {
  opacity: 1;
}
.breadcrumb-bar__copy:hover {
  background: var(--bg3);
  color: var(--t1);
}
```

- [ ] **Step 4: Visually verify**

Run: `npm run dev`
Verify: hovering breadcrumb shows copy button, clicking copies path, separator opacity reduced.

- [ ] **Step 5: Commit**

```bash
git add src/components/BreadcrumbBar.tsx src/styles/globals.css
git commit -m "feat(files): add copy-path button to breadcrumb bar"
```

---

## Task 14: Resizable Sidebar

**Files:**
- Modify: `src/components/FilesTab.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Wire `useResizable` into `FilesTab`**

```tsx
import { useResizable } from '../hooks/useResizable'
import { ChevronRight } from 'lucide-react'

// Inside component:
const { width: sidebarWidth, isCollapsed, toggleCollapse, handleProps } = useResizable({
  storageKey: 'files:sidebarWidth',
  defaultWidth: 220,
  minWidth: 180,
  maxWidth: 600,  // will be further constrained by 50% in CSS
})
```

- [ ] **Step 2: Update the layout JSX**

Replace the fixed-width sidebar with dynamic width and a resize handle:

```tsx
<div className="files-tab">
  {!isCollapsed && (
    <div className="files-tab__tree" style={{ width: sidebarWidth }}>
      <FileTreeFilter ... />
      <FileTreePanel ... />
    </div>
  )}
  <div className="files-tab__resize-handle" {...handleProps}>
    <div className="files-tab__resize-line" />
  </div>
  {isCollapsed && (
    <button className="files-tab__expand-btn" title="Show sidebar (Ctrl+B)" onClick={toggleCollapse}>
      <ChevronRight size={14} />
    </button>
  )}
  <div className="files-tab__content">
    <FileContentPanel ... />
  </div>
</div>
```

- [ ] **Step 3: Add `Ctrl+B` keyboard shortcut**

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'b' && !e.shiftKey) {
      e.preventDefault()
      toggleCollapse()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [toggleCollapse])
```

Combine this with the existing `Ctrl+Shift+F` handler into one `useEffect`.

- [ ] **Step 4: Add resize handle and collapse CSS**

```css
/* ── Resize handle ──────────────────────────────────────────────────── */
.files-tab__resize-handle {
  width: 5px;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.files-tab__resize-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
  background: var(--border);
  transition: background 150ms;
}
.files-tab__resize-handle:hover .files-tab__resize-line {
  background: var(--accent);
  width: 2px;
  left: 1px;
}
.files-tab__expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  flex-shrink: 0;
  border: none;
  border-right: 1px solid var(--border);
  background: var(--bg2);
  color: var(--t3);
  cursor: pointer;
}
.files-tab__expand-btn:hover {
  background: var(--bg3);
  color: var(--t1);
}
```

- [ ] **Step 5: Update `.files-tab__tree` to remove fixed width**

Change the existing CSS rule from `width: 220px` to remove the width (now controlled inline via style prop) and add `max-width: 50%`:

```css
.files-tab__tree {
  flex-shrink: 0;
  max-width: 50%;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  overflow-x: hidden;
}
```

- [ ] **Step 6: Visually verify**

Run: `npm run dev`
Verify: drag handle appears between sidebar and content, dragging resizes smoothly, double-click collapses, `Ctrl+B` toggles, width persists on reload.

- [ ] **Step 7: Commit**

```bash
git add src/components/FilesTab.tsx src/styles/globals.css
git commit -m "feat(files): add resizable sidebar with drag handle and Ctrl+B toggle"
```

---

## Task 15: Final Integration Test + Polish

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Visual QA checklist**

Open the app (`npm run dev`) and verify:

1. **Code toolbar:** language badge, line count, file size shown. Copy works. Word wrap toggles.
2. **Line numbers:** gutter visible, line click highlights, numbers don't get selected when copying code.
3. **File tree:** indent guides visible at nesting levels, chevron animates, extensions dimmed, folders show counts, filter works with keyboard shortcut.
4. **Breadcrumb:** copy-path button appears on hover, separators dimmed.
5. **Resizable sidebar:** drag to resize, double-click to collapse, `Ctrl+B` to toggle, width persists.
6. **Edge cases:** empty repo, very deep nesting, binary files, very large files (>1MB), image files, markdown files all render without errors.

- [ ] **Step 3: Fix any issues discovered**

Address any visual or functional issues found in QA.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "polish(files): final integration fixes for Files view UI improvements"
```
