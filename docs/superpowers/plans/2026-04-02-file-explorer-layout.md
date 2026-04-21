# File Explorer Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Files tab layout to match Windows File Explorer — unified toolbar row (navigation + address bar + search), view mode switching (Details, List, Small Icons, Large Icons), and navigation history (back/forward/up).

**Architecture:** Layout restructure of existing components. The `files-tab` container switches from horizontal flex to vertical flex (toolbar above, body below). New `FilesToolbar` spans full width above the sidebar+content split. New `ViewModeBar` sits at top of content area for directory views. `BreadcrumbBar` gains click-to-edit. `DirectoryListing` gains 4 view modes. `FileTreeFilter` is removed; its search moves to the toolbar.

**Tech Stack:** React 18, TypeScript, lucide-react icons, CSS custom properties, `useLocalStorage` hook

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/ViewModeBar.tsx` | **Create** | Exports `ViewMode` type, renders item count + 4 view mode toggle buttons |
| `src/components/FilesToolbar.tsx` | **Create** | Unified toolbar: back/forward/up nav buttons, address bar (BreadcrumbBar), search input |
| `src/components/BreadcrumbBar.tsx` | **Modify** | Add `onPathSubmit` prop + click-to-edit address bar behavior |
| `src/components/DirectoryListing.tsx` | **Modify** | Accept `viewMode` + `filterText` props, render 4 view layouts |
| `src/components/FileContentPanel.tsx` | **Modify** | Remove BreadcrumbBar, add ViewModeBar, pass viewMode to DirectoryListing |
| `src/components/FilesTab.tsx` | **Modify** | Layout restructure, navigation history state, viewMode state, keyboard shortcuts, remove FileTreeFilter |
| `src/styles/globals.css` | **Modify** | Toolbar styles, view mode bar, grid layouts, address bar, layout restructure |
| `src/components/FileTreeFilter.tsx` | **Remove** | Search moves to FilesToolbar |
| `src/components/FileTreeFilter.test.tsx` | **Remove** | Component removed |

---

### Task 1: Create ViewModeBar Component

This component exports the `ViewMode` type used by multiple files and renders the view mode toggle bar.

**Files:**
- Create: `src/components/ViewModeBar.tsx`

- [ ] **Step 1: Create ViewModeBar.tsx**

```tsx
import { List, AlignJustify, LayoutGrid, Grid2x2 } from 'lucide-react'

export type ViewMode = 'details' | 'list' | 'small-icons' | 'large-icons'

interface ViewModeBarProps {
  itemCount: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

const VIEW_MODES: { mode: ViewMode; icon: typeof List; label: string }[] = [
  { mode: 'details', icon: List, label: 'Details' },
  { mode: 'list', icon: AlignJustify, label: 'List' },
  { mode: 'small-icons', icon: LayoutGrid, label: 'Small Icons' },
  { mode: 'large-icons', icon: Grid2x2, label: 'Large Icons' },
]

export default function ViewModeBar({ itemCount, viewMode, onViewModeChange }: ViewModeBarProps) {
  return (
    <div className="view-mode-bar">
      <span className="view-mode-bar__count">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
      <div className="view-mode-bar__buttons">
        {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            className={`view-mode-bar__btn${viewMode === mode ? ' view-mode-bar__btn--active' : ''}`}
            title={label}
            onClick={() => onViewModeChange(mode)}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: No TypeScript errors related to ViewModeBar

- [ ] **Step 3: Commit**

```bash
git add src/components/ViewModeBar.tsx
git commit -m "feat: create ViewModeBar component with ViewMode type export"
```

---

### Task 2: Modify BreadcrumbBar — Click-to-Edit Address Bar

Add `onPathSubmit` prop and click-to-edit behavior so users can type a path directly.

**Files:**
- Modify: `src/components/BreadcrumbBar.tsx`

- [ ] **Step 1: Add onPathSubmit prop and edit state**

In `src/components/BreadcrumbBar.tsx`, update the imports, interface, and component:

Replace the entire file content with:

```tsx
import { useState, useRef, useEffect } from 'react'
import { Clipboard, Check, Folder } from 'lucide-react'
import FileIcon from './FileIcon'

interface Props {
  path: string
  onNavigate: (path: string) => void
  onPathSubmit?: (path: string) => void
  isDirectory?: boolean
}

export default function BreadcrumbBar({ path, onNavigate, onPathSubmit, isDirectory }: Props) {
  const segments = path.split('/')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only enter edit mode if clicking the container background itself
    if (e.target === e.currentTarget && onPathSubmit) {
      setEditing(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = inputRef.current?.value.trim() ?? ''
      onPathSubmit?.(value)
      setEditing(false)
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="breadcrumb-bar breadcrumb-bar--editing">
        <input
          ref={inputRef}
          className="breadcrumb-bar__edit-input"
          type="text"
          defaultValue={path}
          onKeyDown={handleKeyDown}
          onBlur={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="breadcrumb-bar" onClick={handleContainerClick}>
      <button
        className="breadcrumb-bar__segment"
        onClick={() => onNavigate('')}
      >
        root
      </button>
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1
        const segPath = segments.slice(0, i + 1).join('/')
        return (
          <span key={segPath}>
            <span className="breadcrumb-bar__sep">/</span>
            {isLast ? (
              <span className="breadcrumb-bar__current">
                {isDirectory
                  ? <Folder size={13} color="var(--accent)" />
                  : <FileIcon filename={segment} size={13} />
                }
                {segment}
              </span>
            ) : (
              <button
                className="breadcrumb-bar__segment"
                onClick={() => onNavigate(segPath)}
              >
                {segment}
              </button>
            )}
          </span>
        )
      })}
      <button className="breadcrumb-bar__copy" title="Copy file path" onClick={handleCopyPath}>
        {copied ? <Check size={12} /> : <Clipboard size={12} />}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/BreadcrumbBar.tsx
git commit -m "feat: add click-to-edit address bar to BreadcrumbBar"
```

---

### Task 3: Create FilesToolbar Component

Unified toolbar with navigation buttons (back/forward/up), address bar (BreadcrumbBar), and search input.

**Files:**
- Create: `src/components/FilesToolbar.tsx`

- [ ] **Step 1: Create FilesToolbar.tsx**

```tsx
import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, Search, X } from 'lucide-react'
import BreadcrumbBar from './BreadcrumbBar'

function RootAddressBar({ onPathSubmit }: { onPathSubmit: (path: string) => void }) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  if (editing) {
    return (
      <div className="files-toolbar__root-label files-toolbar__root-label--editing">
        <input
          ref={inputRef}
          className="breadcrumb-bar__edit-input"
          type="text"
          defaultValue=""
          placeholder="Type a path..."
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const value = inputRef.current?.value.trim() ?? ''
              if (value) onPathSubmit(value)
              setEditing(false)
            } else if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
          onBlur={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="files-toolbar__root-label" onClick={() => setEditing(true)}>
      <span className="breadcrumb-bar__current">root</span>
    </div>
  )
}

interface FilesToolbarProps {
  // Navigation
  canGoBack: boolean
  canGoForward: boolean
  canGoUp: boolean
  onGoBack: () => void
  onGoForward: () => void
  onGoUp: () => void
  // Address bar
  currentPath: string | null
  isDirectory: boolean
  onNavigateBreadcrumb: (path: string) => void
  onPathSubmit: (path: string) => void
  // Search
  searchValue: string
  onSearchChange: (value: string) => void
}

export default function FilesToolbar({
  canGoBack, canGoForward, canGoUp,
  onGoBack, onGoForward, onGoUp,
  currentPath, isDirectory, onNavigateBreadcrumb, onPathSubmit,
  searchValue, onSearchChange,
}: FilesToolbarProps) {
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Expose focus method for keyboard shortcut
  useEffect(() => {
    const el = searchInputRef.current
    if (searchExpanded && el) {
      el.focus()
    }
  }, [searchExpanded])

  // Allow parent to focus search via ref on the input
  useEffect(() => {
    function handleFocusSearch(e: CustomEvent) {
      setSearchExpanded(true)
    }
    window.addEventListener('files-toolbar:focus-search', handleFocusSearch as EventListener)
    return () => window.removeEventListener('files-toolbar:focus-search', handleFocusSearch as EventListener)
  }, [])

  const handleSearchBlur = () => {
    if (!searchValue) {
      setSearchExpanded(false)
    }
  }

  return (
    <div className="files-toolbar">
      {/* Left zone — Navigation buttons */}
      <div className="files-toolbar__nav">
        <button
          className="files-toolbar__nav-btn"
          title="Back (Alt+Left)"
          disabled={!canGoBack}
          onClick={onGoBack}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          className="files-toolbar__nav-btn"
          title="Forward (Alt+Right)"
          disabled={!canGoForward}
          onClick={onGoForward}
        >
          <ArrowRight size={14} />
        </button>
        <button
          className="files-toolbar__nav-btn"
          title="Up (Alt+Up)"
          disabled={!canGoUp}
          onClick={onGoUp}
        >
          <ArrowUp size={14} />
        </button>
      </div>

      {/* Center zone — Address bar */}
      <div className="files-toolbar__address">
        {currentPath ? (
          <BreadcrumbBar
            path={currentPath}
            onNavigate={onNavigateBreadcrumb}
            onPathSubmit={onPathSubmit}
            isDirectory={isDirectory}
          />
        ) : (
          <RootAddressBar onPathSubmit={onPathSubmit} />
        )}
      </div>

      {/* Right zone — Search */}
      {searchExpanded ? (
        <div className="files-toolbar__search files-toolbar__search--expanded">
          <Search size={12} className="files-toolbar__search-icon" />
          <input
            ref={searchInputRef}
            className="files-toolbar__search-input"
            type="text"
            placeholder="Search files..."
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            onBlur={handleSearchBlur}
          />
          {searchValue && (
            <button
              className="files-toolbar__search-clear"
              title="Clear search"
              onMouseDown={e => { e.preventDefault(); onSearchChange('') }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ) : (
        <button
          className="files-toolbar__search-btn"
          title="Search files (Ctrl+Shift+F)"
          onClick={() => setSearchExpanded(true)}
        >
          <Search size={14} />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/FilesToolbar.tsx
git commit -m "feat: create FilesToolbar with nav buttons, address bar, and search"
```

---

### Task 4: Modify DirectoryListing — 4 View Modes + Filter

Add `viewMode` and `filterText` props. Render Details (existing), List, Small Icons, and Large Icons layouts.

**Files:**
- Modify: `src/components/DirectoryListing.tsx`

- [ ] **Step 1: Update DirectoryListing interface and add view mode rendering**

In `src/components/DirectoryListing.tsx`, make these changes:

**Add import for ViewMode at the top (line 2):**

```tsx
import type { ViewMode } from './ViewModeBar'
```

**Update the `DirectoryListingProps` interface (lines 14-18) to:**

```tsx
interface DirectoryListingProps {
  entries: TreeEntry[]
  onSelect: (entry: TreeEntry, fullPath: string) => void
  basePath: string
  viewMode?: ViewMode
  filterText?: string
  owner?: string
  name?: string
  branch?: string
}
```

**Update the component signature and add filtering (line 58):**

Replace the existing `DirectoryListing` function (lines 58-99) with:

```tsx
const IMAGE_EXTENSIONS_SET = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'])

export function DirectoryListing({ entries, onSelect, basePath, viewMode = 'details', filterText, owner, name, branch }: DirectoryListingProps) {
  let sorted = sortEntries(entries)

  // Filter entries when search is active
  if (filterText) {
    const lower = filterText.toLowerCase()
    sorted = sorted.filter(e => e.path.toLowerCase().includes(lower))
  }

  const folderCount = sorted.filter(e => e.type === 'tree').length
  const fileCount = sorted.length - folderCount

  if (sorted.length === 0 && filterText) {
    return (
      <div className="dir-listing dir-listing--empty">
        <p>No matching items</p>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="dir-listing dir-listing--empty">
        <p>This folder is empty</p>
      </div>
    )
  }

  // ── List view ──
  if (viewMode === 'list') {
    return (
      <div className="dir-listing dir-listing--list">
        {sorted.map(entry => {
          const fullPath = basePath ? `${basePath}/${entry.path}` : entry.path
          const isDir = entry.type === 'tree'
          return (
            <button
              key={entry.sha + entry.path}
              className="dir-listing__list-row"
              onClick={() => onSelect(entry, fullPath)}
            >
              {isDir ? (
                <Folder size={14} className="dir-listing__icon dir-listing__icon--folder" />
              ) : (
                <FileIcon filename={entry.path} size={14} className="dir-listing__icon" />
              )}
              <span className="dir-listing__name">{entry.path}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // ── Small Icons view ──
  if (viewMode === 'small-icons') {
    return (
      <div className="dir-listing dir-listing--small-icons">
        {sorted.map(entry => {
          const fullPath = basePath ? `${basePath}/${entry.path}` : entry.path
          const isDir = entry.type === 'tree'
          return (
            <button
              key={entry.sha + entry.path}
              className="dir-listing__icon-cell"
              onClick={() => onSelect(entry, fullPath)}
            >
              {isDir ? (
                <Folder size={16} className="dir-listing__icon dir-listing__icon--folder" />
              ) : (
                <FileIcon filename={entry.path} size={16} className="dir-listing__icon" />
              )}
              <span className="dir-listing__icon-label">{entry.path}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // ── Large Icons view ──
  if (viewMode === 'large-icons') {
    return (
      <div className="dir-listing dir-listing--large-icons">
        {sorted.map(entry => {
          const fullPath = basePath ? `${basePath}/${entry.path}` : entry.path
          const isDir = entry.type === 'tree'
          const ext = entry.path.split('.').pop()?.toLowerCase() ?? ''
          const isImage = !isDir && IMAGE_EXTENSIONS_SET.has(ext)
          const rawUrl = isImage && owner && name && branch
            ? `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${fullPath}`
            : null
          return (
            <button
              key={entry.sha + entry.path}
              className="dir-listing__icon-cell dir-listing__icon-cell--large"
              onClick={() => onSelect(entry, fullPath)}
            >
              {isDir ? (
                <Folder size={48} className="dir-listing__icon dir-listing__icon--folder" />
              ) : rawUrl ? (
                <img
                  src={rawUrl}
                  alt={entry.path}
                  className="dir-listing__thumb"
                  onError={e => {
                    // Fallback to FileIcon on load error
                    const target = e.currentTarget
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = ''
                  }}
                />
              ) : (
                <FileIcon filename={entry.path} size={48} className="dir-listing__icon" />
              )}
              {rawUrl && (
                <span className="dir-listing__thumb-fallback" style={{ display: 'none' }}>
                  <FileIcon filename={entry.path} size={48} className="dir-listing__icon" />
                </span>
              )}
              <span className="dir-listing__icon-label dir-listing__icon-label--large">{entry.path}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // ── Details view (default) ──
  return (
    <div className="dir-listing">
      <div className="dir-listing__header">
        <span className="dir-listing__header-name">Name</span>
        <span className="dir-listing__header-type">Type</span>
        <span className="dir-listing__header-size">Size</span>
      </div>
      {sorted.map(entry => {
        const fullPath = basePath ? `${basePath}/${entry.path}` : entry.path
        const isDir = entry.type === 'tree'
        return (
          <button
            key={entry.sha + entry.path}
            className="dir-listing__row"
            onClick={() => onSelect(entry, fullPath)}
          >
            {isDir ? (
              <Folder size={14} className="dir-listing__icon dir-listing__icon--folder" />
            ) : (
              <FileIcon filename={entry.path} size={14} className="dir-listing__icon" />
            )}
            <span className="dir-listing__name">{entry.path}</span>
            <span className="dir-listing__type">{isDir ? 'Folder' : getFileType(entry.path)}</span>
            <span className="dir-listing__size">
              {!isDir && entry.size != null ? formatSize(entry.size) : isDir ? '—' : ''}
            </span>
            {isDir && <ChevronRight size={12} className="dir-listing__chevron" />}
          </button>
        )
      })}
      <div className="dir-listing__footer">
        {folderCount > 0 && <span>{folderCount} folder{folderCount !== 1 ? 's' : ''}</span>}
        {folderCount > 0 && fileCount > 0 && <span className="dir-listing__footer-sep">&middot;</span>}
        {fileCount > 0 && <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/DirectoryListing.tsx
git commit -m "feat: add 4 view modes and filterText to DirectoryListing"
```

---

### Task 5: Modify FileContentPanel — Remove BreadcrumbBar, Add ViewModeBar

Remove BreadcrumbBar from FileContentPanel (it now lives in FilesToolbar). Add ViewModeBar above directory listings.

**Files:**
- Modify: `src/components/FileContentPanel.tsx`

- [ ] **Step 1: Update FileContentPanel**

In `src/components/FileContentPanel.tsx`:

**Replace line 1 (BreadcrumbBar import) — remove it entirely:**

Remove:
```tsx
import BreadcrumbBar from './BreadcrumbBar'
```

**Add ViewModeBar import after the existing imports (after line 5):**

```tsx
import ViewModeBar from './ViewModeBar'
import type { ViewMode } from './ViewModeBar'
```

**Update the Props interface (lines 31-49) — remove `onNavigateBreadcrumb`, add `viewMode` and `onViewModeChange`:**

Replace the Props interface with:

```tsx
interface Props {
  selectedPath: string | null
  selectedEntry: TreeEntry | null
  blobContent: string | null
  blobRawBase64: string | null
  blobLoading: boolean
  owner: string
  name: string
  branch: string
  dirEntries: TreeEntry[] | null
  onSelectEntry: (entry: TreeEntry, fullPath: string) => void
  onNavigateToFile?: (path: string) => void
  wordWrap: boolean
  onToggleWordWrap: () => void
  lineCount: number
  onLineCountReady: (count: number) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  filterText?: string
}
```

**Update the component destructuring (lines 51-56) — remove `onNavigateBreadcrumb`, add `viewMode`, `onViewModeChange`, and `filterText`:**

```tsx
export default function FileContentPanel({
  selectedPath, selectedEntry, blobContent, blobRawBase64, blobLoading,
  owner, name, branch,
  dirEntries, onSelectEntry, onNavigateToFile,
  wordWrap, onToggleWordWrap, lineCount, onLineCountReady,
  viewMode, onViewModeChange, filterText,
}: Props) {
```

**Update the root directory listing block (lines 57-69) — add ViewModeBar:**

Replace:
```tsx
  if (!selectedPath) {
    if (dirEntries) {
      return (
        <div className="file-content-panel">
          <DirectoryListing
            entries={dirEntries}
            onSelect={onSelectEntry}
            basePath=""
          />
        </div>
      )
    }
```

With:
```tsx
  if (!selectedPath) {
    if (dirEntries) {
      return (
        <div className="file-content-panel">
          <ViewModeBar
            itemCount={dirEntries.length}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
          <DirectoryListing
            entries={dirEntries}
            onSelect={onSelectEntry}
            basePath=""
            viewMode={viewMode}
            filterText={filterText}
            owner={owner}
            name={name}
            branch={branch}
          />
        </div>
      )
    }
```

**Remove the BreadcrumbBar line from the main return (line 86):**

Remove:
```tsx
      <BreadcrumbBar path={selectedPath} onNavigate={onNavigateBreadcrumb} isDirectory={selectedEntry?.type === 'tree'} />
```

**Update the directory listing branch (lines 98-103) — add ViewModeBar and pass viewMode:**

Replace:
```tsx
      {selectedEntry?.type === 'tree' && dirEntries ? (
        <DirectoryListing
          entries={dirEntries}
          onSelect={onSelectEntry}
          basePath={selectedPath}
        />
```

With:
```tsx
      {selectedEntry?.type === 'tree' && dirEntries ? (
        <>
          <ViewModeBar
            itemCount={dirEntries.length}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
          <DirectoryListing
            entries={dirEntries}
            onSelect={onSelectEntry}
            basePath={selectedPath}
            viewMode={viewMode}
            filterText={filterText}
            owner={owner}
            name={name}
            branch={branch}
          />
        </>
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/FileContentPanel.tsx
git commit -m "feat: add ViewModeBar to FileContentPanel, remove BreadcrumbBar"
```

---

### Task 6: Modify FilesTab — Layout Restructure, History, Keyboard Shortcuts

Major restructure: vertical flex layout, FilesToolbar above sidebar+content, navigation history, viewMode state, keyboard shortcuts, remove FileTreeFilter.

**Files:**
- Modify: `src/components/FilesTab.tsx`
- Remove: `src/components/FileTreeFilter.tsx`
- Remove: `src/components/FileTreeFilter.test.tsx`

- [ ] **Step 1: Delete FileTreeFilter files**

Delete `src/components/FileTreeFilter.tsx` and `src/components/FileTreeFilter.test.tsx`.

- [ ] **Step 2: Rewrite FilesTab.tsx**

Replace the entire content of `src/components/FilesTab.tsx` with:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import FileTreePanel from './FileTreePanel'
import FileContentPanel from './FileContentPanel'
import FilesToolbar from './FilesToolbar'
import type { ViewMode } from './ViewModeBar'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useResizable } from '../hooks/useResizable'
import { isVideoFile } from './DirectoryListing'
import { ChevronRight } from 'lucide-react'

interface TreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

interface Props {
  owner: string
  name: string
  branch: string
  initialPath?: string | null
}

export default function FilesTab({ owner, name, branch, initialPath }: Props) {
  const [rootTreeSha, setRootTreeSha] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryKey, setRetryKey] = useState(0)

  const [expandedDirs, setExpandedDirs] = useState<Map<string, string>>(new Map())
  const [treeData, setTreeData] = useState<Map<string, TreeEntry[]>>(new Map())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<TreeEntry | null>(null)
  const [blobContent, setBlobContent] = useState<string | null>(null)
  const [blobRawBase64, setBlobRawBase64] = useState<string | null>(null)
  const [blobLoading, setBlobLoading] = useState(false)
  const [treeLoading, setTreeLoading] = useState<Set<string>>(new Set())
  const [errorDirs, setErrorDirs] = useState<Set<string>>(new Set())
  const [wordWrap, setWordWrap] = useLocalStorage('files:wordWrap', false)
  const handleToggleWordWrap = useCallback(() => setWordWrap(w => !w), [setWordWrap])
  const [lineCount, setLineCount] = useState(0)
  const [filterText, setFilterText] = useState('')

  // View mode — persisted
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('files:viewMode', 'details')

  // Navigation history
  const [pathHistory, setPathHistory] = useState<string[]>([''])
  const [historyIndex, setHistoryIndex] = useState(0)
  const skipHistoryRef = useRef(false)

  const { width: sidebarWidth, isCollapsed, toggleCollapse, handleProps } = useResizable({
    storageKey: 'files:sidebarWidth',
    defaultWidth: 220,
    minWidth: 180,
    maxWidth: 600,
  })

  // ── Navigation history helpers ──

  function pushHistory(path: string) {
    if (skipHistoryRef.current) return
    setPathHistory(prev => [...prev.slice(0, historyIndex + 1), path])
    setHistoryIndex(prev => prev + 1)
  }

  // ── Keyboard shortcuts ──

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+Shift+F → focus search in toolbar
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('files-toolbar:focus-search'))
      }
      // Ctrl+B → toggle sidebar
      if (e.ctrlKey && e.key === 'b' && !e.shiftKey) {
        e.preventDefault()
        toggleCollapse()
      }
      // Alt+Left → go back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      }
      // Alt+Right → go forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      }
      // Alt+Up → go up
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault()
        goUp()
      }
      // Backspace → go up (only when not in an input/textarea/contenteditable)
      if (e.key === 'Backspace') {
        const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
        const isEditable = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable
        if (!isEditable) {
          e.preventDefault()
          goUp()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleCollapse, historyIndex, pathHistory, selectedPath])

  // ── Resolve branch → root tree SHA ──

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const { rootTreeSha: sha } = await window.api.github.getBranch(owner, name, branch)
        if (cancelled) return
        setRootTreeSha(sha)
        const entries = await window.api.github.getTree(owner, name, sha)
        if (cancelled) return
        setTreeData(prev => new Map(prev).set(sha, entries))
      } catch (err) {
        if (branch === 'main') {
          try {
            const { rootTreeSha: sha } = await window.api.github.getBranch(owner, name, 'master')
            if (cancelled) return
            setRootTreeSha(sha)
            const entries = await window.api.github.getTree(owner, name, sha)
            if (cancelled) return
            setTreeData(prev => new Map(prev).set(sha, entries))
            setLoading(false)
            return
          } catch {
            // Fall through to error
          }
        }
        if (!cancelled) setError('Unable to load repository files.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [owner, name, branch, retryKey])

  // ── Navigate to initial path ──

  useEffect(() => {
    if (!initialPath || !rootTreeSha) return

    let cancelled = false

    ;(async () => {
      const segments = initialPath.split('/')
      let currentSha = rootTreeSha
      let currentPath = ''
      const localTreeData = new Map<string, TreeEntry[]>()

      async function getEntries(sha: string): Promise<TreeEntry[]> {
        if (localTreeData.has(sha)) return localTreeData.get(sha)!
        const entries = await window.api.github.getTree(owner, name, sha)
        localTreeData.set(sha, entries)
        setTreeData(prev => new Map(prev).set(sha, entries))
        return entries
      }

      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]
        currentPath = currentPath ? `${currentPath}/${segment}` : segment

        try {
          const entries = await getEntries(currentSha)
          if (cancelled) return
          const dirEntry = entries.find(e => e.path === segment && e.type === 'tree')
          if (!dirEntry) return
          setExpandedDirs(prev => new Map(prev).set(currentPath, dirEntry.sha))
          currentSha = dirEntry.sha
        } catch {
          return
        }
      }

      const lastSegment = segments[segments.length - 1]
      try {
        const entries = await getEntries(currentSha)
        if (cancelled) return
        const targetEntry = entries.find(e => e.path === lastSegment)
        if (!targetEntry) return

        setSelectedPath(initialPath)
        setSelectedEntry(targetEntry)

        if (targetEntry.type === 'blob') {
          if (targetEntry.size && targetEntry.size > 1_000_000) return
          setBlobLoading(true)
          try {
            const result = await window.api.github.getBlob(owner, name, targetEntry.sha)
            if (!cancelled) {
              setBlobContent(result.content)
              setBlobRawBase64(result.rawBase64)
            }
          } catch {
            // Content panel will show fallback
          } finally {
            if (!cancelled) setBlobLoading(false)
          }
        }
      } catch {
        return
      }
    })()

    return () => { cancelled = true }
  }, [initialPath, rootTreeSha, owner, name])

  // ── Handlers ──

  const handleToggleDir = useCallback(async (path: string, sha: string) => {
    if (errorDirs.has(path)) {
      setErrorDirs(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    }

    if (expandedDirs.has(path)) {
      setExpandedDirs(prev => {
        const next = new Map(prev)
        next.delete(path)
        return next
      })
      return
    }

    if (!treeData.has(sha)) {
      setTreeLoading(prev => new Set(prev).add(path))
      try {
        const entries = await window.api.github.getTree(owner, name, sha)
        setTreeData(prev => new Map(prev).set(sha, entries))
      } catch {
        setTreeLoading(prev => {
          const next = new Set(prev)
          next.delete(path)
          return next
        })
        setErrorDirs(prev => new Set(prev).add(path))
        return
      }
      setTreeLoading(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    }

    setExpandedDirs(prev => new Map(prev).set(path, sha))
    setSelectedPath(path)
    setSelectedEntry({ path: path.split('/').pop()!, mode: '', type: 'tree', sha })
    setBlobContent(null)
  }, [expandedDirs, treeData, errorDirs, owner, name])

  const handleSelectFile = useCallback(async (entry: TreeEntry, fullPath: string) => {
    setSelectedPath(fullPath)
    setSelectedEntry({ ...entry, path: entry.path })
    setBlobContent(null)
    setBlobRawBase64(null)

    if (entry.type === 'tree') {
      if (!treeData.has(entry.sha)) {
        try {
          const entries = await window.api.github.getTree(owner, name, entry.sha)
          setTreeData(prev => new Map(prev).set(entry.sha, entries))
        } catch {
          // Directory listing will show empty
        }
      }
      setExpandedDirs(prev => new Map(prev).set(fullPath, entry.sha))
      pushHistory(fullPath)
      return
    }

    if (isVideoFile(fullPath)) {
      pushHistory(fullPath)
      return
    }

    if (entry.size && entry.size > 1_000_000) {
      pushHistory(fullPath)
      return
    }

    setBlobLoading(true)
    try {
      const result = await window.api.github.getBlob(owner, name, entry.sha)
      setBlobContent(result.content)
      setBlobRawBase64(result.rawBase64)
    } catch {
      setBlobContent(null)
    } finally {
      setBlobLoading(false)
    }
    pushHistory(fullPath)
  }, [owner, name, treeData, historyIndex])

  const handleBreadcrumbNavigate = useCallback((path: string) => {
    if (!path) {
      setSelectedPath(null)
      setSelectedEntry(null)
      setBlobContent(null)
      pushHistory('')
      return
    }
    const sha = expandedDirs.get(path)
    if (sha) {
      setSelectedPath(path)
      setSelectedEntry({ path: path.split('/').pop()!, mode: '', type: 'tree', sha })
      setBlobContent(null)
      pushHistory(path)
    }
  }, [expandedDirs, historyIndex])

  const handleNavigateToFile = useCallback(async (targetPath: string) => {
    if (!rootTreeSha) return

    const segments = targetPath.split('/')
    let currentSha = rootTreeSha

    let currentPath = ''
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      currentPath = currentPath ? `${currentPath}/${segment}` : segment

      let entries = treeData.get(currentSha)
      if (!entries) {
        try {
          entries = await window.api.github.getTree(owner, name, currentSha)
          setTreeData(prev => new Map(prev).set(currentSha, entries!))
        } catch { return }
      }

      const dirEntry = entries.find(e => e.path === segment && e.type === 'tree')
      if (!dirEntry) return
      setExpandedDirs(prev => new Map(prev).set(currentPath, dirEntry.sha))
      currentSha = dirEntry.sha
    }

    const lastSegment = segments[segments.length - 1]
    let entries = treeData.get(currentSha)
    if (!entries) {
      try {
        entries = await window.api.github.getTree(owner, name, currentSha)
        setTreeData(prev => new Map(prev).set(currentSha, entries!))
      } catch { return }
    }

    const targetEntry = entries.find(e => e.path === lastSegment)
    if (!targetEntry) return

    handleSelectFile(targetEntry, targetPath)
  }, [rootTreeSha, treeData, owner, name, handleSelectFile])

  const handlePathSubmit = useCallback((path: string) => {
    handleNavigateToFile(path)
  }, [handleNavigateToFile])

  // ── Silent navigation (for back/forward — no history push) ──

  const silentNavigate = useCallback(async (path: string) => {
    skipHistoryRef.current = true
    try {
      if (!path) {
        setSelectedPath(null)
        setSelectedEntry(null)
        setBlobContent(null)
        setBlobRawBase64(null)
      } else {
        await handleNavigateToFile(path)
      }
    } finally {
      skipHistoryRef.current = false
    }
  }, [handleNavigateToFile])

  function goBack() {
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    silentNavigate(pathHistory[newIndex])
  }

  function goForward() {
    if (historyIndex >= pathHistory.length - 1) return
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    silentNavigate(pathHistory[newIndex])
  }

  function goUp() {
    if (!selectedPath) return
    const parent = selectedPath.split('/').slice(0, -1).join('/')
    pushHistory(parent || '')
    silentNavigate(parent || '')
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="files-tab">
        <div className="files-tab__loading">
          <span className="spin-ring" style={{ width: 16, height: 16 }} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="files-tab">
        <div className="files-tab__error">
          <p>{error}</p>
          <button onClick={() => setRetryKey(k => k + 1)}>Retry</button>
        </div>
      </div>
    )
  }

  const selectedDirEntries = selectedEntry?.type === 'tree'
    ? treeData.get(selectedEntry.sha) ?? null
    : !selectedPath && rootTreeSha
      ? treeData.get(rootTreeSha) ?? null
      : null

  return (
    <div className="files-tab">
      <FilesToolbar
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < pathHistory.length - 1}
        canGoUp={!!selectedPath}
        onGoBack={goBack}
        onGoForward={goForward}
        onGoUp={goUp}
        currentPath={selectedPath}
        isDirectory={selectedEntry?.type === 'tree' || !selectedPath}
        onNavigateBreadcrumb={handleBreadcrumbNavigate}
        onPathSubmit={handlePathSubmit}
        searchValue={filterText}
        onSearchChange={setFilterText}
      />
      <div className="files-tab__body">
        {!isCollapsed ? (
          <div className="files-tab__tree" style={{ width: sidebarWidth }}>
            {rootTreeSha && treeData.has(rootTreeSha) && (
              <FileTreePanel
                entries={treeData.get(rootTreeSha)!}
                expandedDirs={expandedDirs}
                treeData={treeData}
                treeLoading={treeLoading}
                errorDirs={errorDirs}
                selectedPath={selectedPath}
                basePath=""
                depth={0}
                onToggleDir={handleToggleDir}
                onSelectFile={handleSelectFile}
                filterText={filterText}
              />
            )}
          </div>
        ) : (
          <button className="files-tab__expand-btn" title="Show sidebar (Ctrl+B)" onClick={toggleCollapse}>
            <ChevronRight size={14} />
          </button>
        )}
        {!isCollapsed && (
          <div className="files-tab__resize-handle" {...handleProps}>
            <div className="files-tab__resize-line" />
          </div>
        )}
        <div className="files-tab__content">
          <FileContentPanel
            selectedPath={selectedPath}
            selectedEntry={selectedEntry}
            blobContent={blobContent}
            blobRawBase64={blobRawBase64}
            blobLoading={blobLoading}
            owner={owner}
            name={name}
            branch={branch}
            dirEntries={selectedDirEntries}
            onSelectEntry={handleSelectFile}
            onNavigateToFile={handleNavigateToFile}
            wordWrap={wordWrap}
            onToggleWordWrap={handleToggleWordWrap}
            lineCount={lineCount}
            onLineCountReady={setLineCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            filterText={filterText}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git rm src/components/FileTreeFilter.tsx src/components/FileTreeFilter.test.tsx
git add src/components/FilesTab.tsx
git commit -m "feat: restructure FilesTab layout with toolbar, history, and view modes

Remove FileTreeFilter — search now lives in FilesToolbar.
Add navigation history (back/forward/up) with skipHistoryRef pattern.
Add viewMode state persisted to localStorage.
Add keyboard shortcuts: Alt+arrows for navigation, Backspace for up."
```

---

### Task 7: CSS Updates

Add styles for FilesToolbar, ViewModeBar, address bar editing, view mode grid layouts, and update files-tab layout.

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Update .files-tab layout from horizontal to vertical flex**

In `src/styles/globals.css`, find `.files-tab` (line 1532) and replace:

```css
.files-tab {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

With:

```css
.files-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.files-tab__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 2: Add FilesToolbar styles**

Add the following after the `.files-tab__error button:hover` rule (after line 6613):

```css
/* ── Files Toolbar ─────────────────────────────────────────────────── */
.files-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.files-toolbar__nav {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.files-toolbar__nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--t2);
  cursor: pointer;
}
.files-toolbar__nav-btn:hover:not(:disabled) {
  background: var(--bg3);
  color: var(--t1);
}
.files-toolbar__nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.files-toolbar__address {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  height: 28px;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.files-toolbar__address .breadcrumb-bar {
  border: none;
  padding: 0 8px;
  height: 100%;
  margin: 0;
  background: none;
  flex: 1;
  min-width: 0;
}
.files-toolbar__root-label {
  padding: 0 8px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--t2);
  cursor: pointer;
  flex: 1;
  display: flex;
  align-items: center;
  height: 100%;
}
.files-toolbar__root-label--editing {
  padding: 0;
}
.files-toolbar__search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--t2);
  cursor: pointer;
  flex-shrink: 0;
}
.files-toolbar__search-btn:hover {
  background: var(--bg3);
  color: var(--t1);
}
.files-toolbar__search {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.files-toolbar__search--expanded {
  width: 200px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  padding: 0 8px;
  gap: 6px;
}
.files-toolbar__search-icon {
  flex-shrink: 0;
  color: var(--t3);
}
.files-toolbar__search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t1);
  outline: none;
}
.files-toolbar__search-input::placeholder {
  color: var(--t3);
}
.files-toolbar__search-clear {
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
.files-toolbar__search-clear:hover {
  background: var(--bg3);
  color: var(--t1);
}
```

- [ ] **Step 3: Add BreadcrumbBar edit mode styles**

Add after the existing `.breadcrumb-bar__copy:hover` rule (around line 1530):

```css
.breadcrumb-bar--editing {
  padding: 0;
}
.breadcrumb-bar__edit-input {
  width: 100%;
  height: 100%;
  border: none;
  background: none;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--t1);
  outline: none;
  padding: 0 8px;
}
```

- [ ] **Step 4: Add ViewModeBar styles**

Add after the FilesToolbar styles:

```css
/* ── View Mode Bar ─────────────────────────────────────────────────── */
.view-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 4px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.view-mode-bar__count {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t3);
}
.view-mode-bar__buttons {
  display: flex;
}
.view-mode-bar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  background: none;
  color: var(--t3);
  cursor: pointer;
  margin-left: -1px;
}
.view-mode-bar__btn:first-child {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  margin-left: 0;
}
.view-mode-bar__btn:last-child {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.view-mode-bar__btn:hover {
  background: var(--bg3);
  color: var(--t1);
}
.view-mode-bar__btn--active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  z-index: 1;
}
.view-mode-bar__btn--active:hover {
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Step 5: Add DirectoryListing view mode styles**

Add after the existing `.dir-listing__footer-sep` rule (after line 6268):

```css
/* ── Directory listing: empty state ── */
.dir-listing--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--t3);
}
/* ── Directory listing: List view ── */
.dir-listing--list {
  padding: 0;
}
.dir-listing__list-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 3px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--t1);
  text-align: left;
}
.dir-listing__list-row:hover {
  background: var(--bg3);
}
/* ── Directory listing: Small Icons view ── */
.dir-listing--small-icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 4px;
  padding: 8px;
}
.dir-listing__icon-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t1);
  text-align: center;
}
.dir-listing__icon-cell:hover {
  background: var(--bg3);
}
.dir-listing__icon-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
/* ── Directory listing: Large Icons view ── */
.dir-listing--large-icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  padding: 12px;
}
.dir-listing__icon-cell--large {
  padding: 12px 8px;
}
.dir-listing__icon-label--large {
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  max-width: 100%;
  word-break: break-all;
}
.dir-listing__thumb {
  max-width: 48px;
  max-height: 48px;
  object-fit: contain;
}
.dir-listing__thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 6: Remove .file-tree-filter styles**

Delete the `.file-tree-filter` CSS block (lines 6508-6548 — from `.file-tree-filter {` through `.file-tree-filter__clear:hover { ... }`).

- [ ] **Step 7: Verify no build errors**

Run: `npm run build 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add CSS for FilesToolbar, ViewModeBar, view mode grids, and layout restructure"
```

---

### Task 8: Manual Testing & Polish

Verify everything works end-to-end in the running app.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test checklist**

Verify each of these manually:

1. **Layout**: Toolbar appears above sidebar+content split, spanning full width
2. **Nav buttons**: Back/Forward/Up buttons appear, disabled states work correctly
3. **Address bar**: Breadcrumb shows in toolbar address bar. Clicking background enters edit mode. Enter navigates, Escape cancels.
4. **Search**: Icon button expands to search input. Filters sidebar tree. Collapses on blur when empty.
5. **View modes**: Details/List/Small Icons/Large Icons all render correctly. Active button highlighted.
6. **View mode persistence**: Refresh page — view mode preserved from localStorage
7. **Keyboard shortcuts**: Alt+Left (back), Alt+Right (forward), Alt+Up (up), Backspace (up when not in input), Ctrl+Shift+F (search focus), Ctrl+B (sidebar toggle)
8. **Navigation history**: Navigate through folders, use back/forward to traverse history
9. **Empty directory**: Shows "This folder is empty" message in all view modes
10. **Large Icons thumbnails**: Image files show thumbnail preview, non-images show FileIcon at 48px
11. **Root listing**: Shows directory listing by default with ViewModeBar

- [ ] **Step 3: Fix any issues found during testing**

- [ ] **Step 4: Final commit if any polish changes were needed**

```bash
git add -A
git commit -m "fix: polish file explorer layout after testing"
```
