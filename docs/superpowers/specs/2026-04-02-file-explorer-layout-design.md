# File Explorer Layout Redesign — Design Spec

## Goal

Refactor the Files tab layout to match the Windows File Explorer pattern: a unified toolbar row (navigation + address bar + search), view mode switching (Details, List, Small Icons, Large Icons), and navigation history (back/forward/up).

## Overview

This is a layout and style refactor of existing pieces, not a ground-up rebuild. The sidebar tree, breadcrumb, search, and file viewing components all stay — they get repositioned and restyled to match Explorer's layout. The main content area gains view mode switching for directory listings.

## Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  FilesToolbar (full width)                               │
│  [← →] [↑]  [ breadcrumb / editable path         ] [🔍] │
├─────────────┬────────────────────────────────────────────┤
│             │  ViewModeBar (right side only)              │
│  Sidebar    │  12 items            [≡] [⊞] [⊟] [▦]     │
│  Tree       ├────────────────────────────────────────────┤
│  (unchanged)│                                            │
│             │  Main Content                              │
│             │  (Details / List / Small Icons / Large)     │
│             │                                            │
├─────────────┴────────────────────────────────────────────┤
│  Footer: item count                                      │
└──────────────────────────────────────────────────────────┘
```

The toolbar row spans the full width above the sidebar+content split. The sidebar tree is unchanged. The view mode bar sits at the top of the content area (right side only) and only appears when viewing a directory.

## Component Design

### FilesToolbar (new: `src/components/FilesToolbar.tsx`)

A single horizontal bar spanning the full width of the Files tab. Three zones:

**Left zone — Navigation buttons:**
- **Back** (`ArrowLeft` icon): navigate to previous path in history. Disabled when `historyIndex === 0`.
- **Forward** (`ArrowRight` icon): navigate to next path in history. Disabled when `historyIndex === history.length - 1`.
- **Up** (`ArrowUp` icon): navigate to parent directory. Disabled when at root (`selectedPath` is null or empty).
- All buttons: 28x28px, same style as CodeToolbar buttons. Gap of 2px between them.

**Center zone — Address bar (modified BreadcrumbBar):**
- Fills remaining space (`flex: 1`).
- **Default state**: renders the existing clickable breadcrumb segments with file/folder icon and copy button. Wrapped in a container with a subtle border (like Explorer's address bar).
- **Edit state**: clicking the address bar background (not on a segment or copy button) switches to an `<input>` pre-filled with the current path. Press Enter to navigate to the typed path via `onPathSubmit`. Press Escape or blur to cancel and revert to breadcrumb view.
- The container has the same height as the nav buttons for visual alignment.

**Right zone — Search input:**
- Replaces `FileTreeFilter` in the sidebar.
- Default: compact search icon button.
- On click/focus: expands to a text input (200px) with search icon, placeholder "Search files...", and clear button.
- Filters the sidebar tree (same `filterText` mechanism as before).
- Keyboard shortcut `Ctrl+Shift+F` focuses the search input.
- On blur with empty value: collapses back to icon button.

```tsx
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
```

**Styling:**
- Background: `var(--bg2)`
- Border-bottom: `1px solid var(--border)`
- Padding: `4px 8px`
- Height: ~40px
- Flex row, `align-items: center`, `gap: 6px`

### BreadcrumbBar (modified: `src/components/BreadcrumbBar.tsx`)

Extended with click-to-edit functionality:

```tsx
interface Props {
  path: string
  onNavigate: (path: string) => void
  onPathSubmit: (path: string) => void  // NEW: called when user types a path and presses Enter
  isDirectory?: boolean
}
```

**New behavior:**
- Wrapping container gets an `onClick` handler. If the click target is the container itself (not a segment button, copy button, or current span), enter edit mode.
- Edit mode: renders an `<input type="text">` with `defaultValue={path}`, auto-focused, `font-family: JetBrains Mono`, same font size.
- On Enter: calls `onPathSubmit(inputValue)`, exits edit mode.
- On Escape: exits edit mode, reverts to breadcrumb view.
- On blur: exits edit mode (cancel).

The existing segment click, copy-path, and icon rendering behavior is unchanged.

### ViewModeBar (new: `src/components/ViewModeBar.tsx`)

A compact bar between the toolbar and directory listing content. Only renders when viewing a directory.

The `ViewMode` type is exported from this file and imported by `DirectoryListing`, `FileContentPanel`, and `FilesTab`.

```tsx
export type ViewMode = 'details' | 'list' | 'small-icons' | 'large-icons'

interface ViewModeBarProps {
  itemCount: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}
```

**Layout:**
- Left side: `{itemCount} items` label
- Right side: four icon buttons in a button group
  - Details: `List` icon from lucide-react
  - List: `AlignJustify` icon
  - Small Icons: `LayoutGrid` icon
  - Large Icons: `Grid2x2` icon (or similar)
- Active button gets accent background/color
- Buttons are 24x24px, border-radius only on the outer edges (button group style)

**Styling:**
- Height: ~30px
- Padding: `4px 16px`
- Background: `var(--bg)` (or transparent)
- Border-bottom: `1px solid var(--border)`
- Font: 11px Inter, color `var(--t3)`

### DirectoryListing (modified: `src/components/DirectoryListing.tsx`)

Accepts a `viewMode` prop and renders the directory contents accordingly.

```tsx
interface DirectoryListingProps {
  entries: TreeEntry[]
  onSelect: (entry: TreeEntry, fullPath: string) => void
  basePath: string
  viewMode: ViewMode    // NEW
  filterText?: string   // NEW — hides non-matching entries when search is active
}
```

When `filterText` is provided and non-empty, entries whose `path` (case-insensitive) does not contain the filter string are hidden from all view modes.

**Details view** (`viewMode === 'details'`):
- Current table layout — column headers (Name, Type, Size), rows with icon + name + type + size, folder chevron on hover, footer with counts. Essentially what exists now.

**List view** (`viewMode === 'list'`):
- Single column of compact rows.
- Each row: icon (14px) + filename only.
- No Type/Size columns, no column headers.
- Tighter vertical padding: `3px 16px`.
- No footer.

**Small Icons view** (`viewMode === 'small-icons'`):
- CSS grid: `grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))`
- Each cell: vertically stacked — icon (16px) on top, filename below (single line, ellipsis truncation, centered text).
- Padding: `8px` per cell.
- Gap: `4px`.

**Large Icons view** (`viewMode === 'large-icons'`):
- CSS grid: `grid-template-columns: repeat(auto-fill, minmax(130px, 1fr))`
- Each cell: vertically stacked — icon (48px) on top, filename below (max 2 lines, centered text, `overflow: hidden`, `text-overflow: ellipsis`, `display: -webkit-box`, `-webkit-line-clamp: 2`).
- Padding: `12px 8px` per cell.
- Gap: `8px`.
- For image files (`.png`, `.jpg`, `.gif`, `.svg`, `.webp`): show a thumbnail preview using the raw GitHub URL (`https://raw.githubusercontent.com/{owner}/{name}/{branch}/{path}`) instead of the generic Image icon. The thumbnail has `max-width: 48px`, `max-height: 48px`, `object-fit: contain`.

**Clicking any item** in any view mode triggers `onSelect` with the same behavior as now — folders navigate into the directory, files open in the content viewer.

### FileContentPanel (modified: `src/components/FileContentPanel.tsx`)

- Accepts `viewMode` prop, passes it to `DirectoryListing`.
- Renders `ViewModeBar` above the directory listing when showing a directory (`selectedEntry?.type === 'tree'`) or when showing the root listing (`!selectedPath && dirEntries !== null`). The `BreadcrumbBar` is removed from `FileContentPanel` — it now lives in `FilesToolbar`.
- When viewing a file (blob), no `ViewModeBar` — the `CodeToolbar` or file-specific UI takes its place as before.

```tsx
interface Props {
  // ... existing props
  viewMode: ViewMode        // NEW
  onViewModeChange: (mode: ViewMode) => void  // NEW
}
```

### FilesTab (modified: `src/components/FilesTab.tsx`)

Layout restructure and new state:

**New state:**
```tsx
const [viewMode, setViewMode] = useLocalStorage<ViewMode>('files:viewMode', 'details')
const [pathHistory, setPathHistory] = useState<string[]>([''])  // '' = root
const [historyIndex, setHistoryIndex] = useState(0)
```

**Navigation history logic:**

A `skipHistoryRef` flag prevents history pushes during back/forward navigation. A `silentNavigate` function handles navigating to a path without pushing to history — it reuses the same tree-walking logic as `handleNavigateToFile` (expand dirs, fetch subtrees/blobs, set selectedPath/selectedEntry).

```tsx
const skipHistoryRef = useRef(false)

// Called by handleSelectFile, handleBreadcrumbNavigate, handleNavigateToFile, and handlePathSubmit
// to push to history. Each of these checks skipHistoryRef before pushing.
function pushHistory(path: string) {
  if (skipHistoryRef.current) return
  setPathHistory(prev => [...prev.slice(0, historyIndex + 1), path])
  setHistoryIndex(prev => prev + 1)
}

// Silent navigation — walks the tree, expands dirs, fetches blob if needed,
// WITHOUT pushing to history. Used by goBack and goForward.
async function silentNavigate(path: string) {
  skipHistoryRef.current = true
  try {
    if (!path) {
      // Navigate to root
      setSelectedPath(null)
      setSelectedEntry(null)
      setBlobContent(null)
    } else {
      // Reuse handleNavigateToFile logic (walk tree, expand dirs, select target)
      await handleNavigateToFile(path)
    }
  } finally {
    skipHistoryRef.current = false
  }
}

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
  // goUp pushes to history (it's user-initiated, not a back/forward action)
  pushHistory(parent || '')
  silentNavigate(parent || '')
}
```

**History integration with existing navigation:**

All user-initiated navigation functions call `pushHistory(path)` after setting the path:
- `handleSelectFile` — called when clicking a file/folder in the tree or directory listing
- `handleBreadcrumbNavigate` — called when clicking a breadcrumb segment
- `handleNavigateToFile` — called from markdown internal links
- `handlePathSubmit` — NEW, called when user types a path in the address bar. This reuses `handleNavigateToFile` to walk the tree.

Each checks `skipHistoryRef.current` before pushing, so back/forward navigation does not create duplicate history entries.

`handlePathSubmit` is defined as:
```tsx
const handlePathSubmit = useCallback((path: string) => {
  handleNavigateToFile(path)
}, [handleNavigateToFile])
```

**Layout restructure:**
```tsx
return (
  <div className="files-tab">
    {/* Toolbar spans full width — ABOVE the sidebar+content split */}
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
    {/* Sidebar + Content split — BELOW the toolbar */}
    <div className="files-tab__body">
      {!isCollapsed ? (
        <div className="files-tab__tree" style={{ width: sidebarWidth }}>
          <FileTreePanel ... />
        </div>
      ) : (
        <button className="files-tab__expand-btn" ...>
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
          ...existingProps
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
    </div>
  </div>
)
```

**Key layout CSS change:**
```css
.files-tab {
  display: flex;
  flex-direction: column;  /* Changed from row — toolbar stacks above body */
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

The `files-tab__body` div takes over the old flex-row role, holding the sidebar + resize handle + content area.

**Keyboard shortcuts:**
- `Ctrl+Shift+F` → focus search input in toolbar (moved from sidebar filter)
- `Ctrl+B` → toggle sidebar (unchanged)
- `Alt+Left` → go back
- `Alt+Right` → go forward
- `Alt+Up` → go up
- `Backspace` → go up (only when `document.activeElement` is not an `input`, `textarea`, or `[contenteditable]`)

### FileTreeFilter (removed: `src/components/FileTreeFilter.tsx`)

This component is removed. Its search input functionality moves into `FilesToolbar`. The `filterText` state and `filterRef` stay in `FilesTab.tsx`, just wired to the toolbar instead. The test file `src/components/FileTreeFilter.test.tsx` (if it exists) must also be removed.

## File Structure Summary

| File | Action |
|------|--------|
| `src/components/FilesToolbar.tsx` | **Create** — unified toolbar with nav buttons, address bar, search |
| `src/components/ViewModeBar.tsx` | **Create** — view mode toggle + item count |
| `src/components/FilesTab.tsx` | **Modify** — layout restructure, history state, viewMode state |
| `src/components/BreadcrumbBar.tsx` | **Modify** — add click-to-edit path input |
| `src/components/DirectoryListing.tsx` | **Modify** — accept viewMode, render 4 layouts |
| `src/components/FileContentPanel.tsx` | **Modify** — pass viewMode, render ViewModeBar |
| `src/components/FileTreeFilter.tsx` | **Remove** — search moves to FilesToolbar |
| `src/components/FileTreeFilter.test.tsx` | **Remove** (if exists) — component removed |
| `src/styles/globals.css` | **Modify** — toolbar styles, view mode grids, address bar, layout restructure |

## What Does NOT Change

- `FileTreePanel.tsx` — sidebar tree unchanged
- `FileIcon.tsx` — reused across all view modes
- `CodeViewer.tsx` — file viewing unchanged
- `ReadmeRenderer.tsx` — markdown rendering unchanged
- `CodeToolbar.tsx` — code file toolbar unchanged
- `ImagePreview`, `VideoPlayer`, `FileMetaView` — file type viewers unchanged
- `useResizable.ts` — sidebar resize unchanged
- `useLocalStorage.ts` — reused for viewMode persistence

## Edge Cases

- **Empty directories**: all view modes show "This folder is empty" centered message
- **Path submission with invalid path**: breadcrumb edit mode calls `onPathSubmit` which walks the tree — if the path doesn't exist, no navigation happens (no error shown, breadcrumb reverts)
- **Search while in non-Details view**: search filters the tree sidebar and the main content grid/list (items not matching are hidden)
- **View mode persistence**: stored in localStorage as `files:viewMode`, defaults to `'details'`
- **Switching view mode while viewing a file**: no effect — view mode only applies to directory listings. When navigating back to a directory, the persisted view mode is used.
- **Large Icons thumbnails**: only for recognized image extensions. Non-image files show FileIcon at 48px. Thumbnail load failures fall back to the FileIcon.
