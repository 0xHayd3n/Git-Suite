# Markdown Icons, Context Menu & Download System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update markdown/folder icons, add a right-click context menu, and build a download/conversion service for files and folders.

**Architecture:** Icon changes in `FileIcon.tsx` + smart folder detection in tree/listing components. A new `ContextMenu` React component triggered via `onContextMenu`. Download/conversion handled by a new Electron main-process service communicating via IPC, using `marked` for markdown→HTML, Electron `printToPDF` for PDF, `html-docx-js` for Word, `epub-gen-memory` for ePub, and `jszip` for folder zipping.

**Tech Stack:** React 18, TypeScript, Electron, lucide-react, marked, html-docx-js, epub-gen-memory, jszip

**Spec:** `docs/superpowers/specs/2026-04-07-markdown-icons-context-menu-download-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/FileIcon.tsx` | Modify: markdown icon `BookOpen` → `FileText` |
| `src/components/FileTreePanel.tsx` | Modify: smart folder icons, `onContextMenu` prop |
| `src/components/DirectoryListing.tsx` | Modify: smart folder icons, `onContextMenu` prop |
| `src/components/FilesTab.tsx` | Modify: context menu state, pass props, render `ContextMenu` |
| `src/components/ContextMenu.tsx` | Create: right-click context menu with submenu |
| `src/styles/globals.css` | Modify: context menu styling |
| `electron/services/downloadService.ts` | Create: download + conversion logic |
| `electron/ipc/downloadHandlers.ts` | Create: IPC handler registration |
| `electron/preload.ts` | Modify: expose `download` namespace |
| `electron/main.ts` | Modify: import + call `registerDownloadHandlers()` |

---

### Task 1: Change Markdown File Icon

**Files:**
- Modify: `src/components/FileIcon.tsx:133-135`

- [ ] **Step 1: Update the markdown icon mapping**

In `src/components/FileIcon.tsx`, the imports at the top include `BookOpen`. Add `FileText` to the imports if not already present (it is — used for `.txt`/`.log`), then change the three markdown entries:

```typescript
// Before (lines 133-135):
md:   { icon: BookOpen,     color: '#3b82f6' },
mdx:  { icon: BookOpen,     color: '#3b82f6' },
markdown: { icon: BookOpen,  color: '#3b82f6' },

// After:
md:   { icon: FileText,     color: '#3b82f6' },
mdx:  { icon: FileText,     color: '#3b82f6' },
markdown: { icon: FileText,  color: '#3b82f6' },
```

Note: `BookOpen` may still be used elsewhere (smart folder icons). Only remove the `BookOpen` import if it's no longer referenced anywhere in this file after the change.

- [ ] **Step 2: Verify the change**

Run: `npx vitest run src/components/FileIcon --reporter=verbose`
Expected: All existing tests pass (no tests specifically assert BookOpen for markdown).

- [ ] **Step 3: Commit**

```bash
git add src/components/FileIcon.tsx
git commit -m "feat(files): change markdown icon from BookOpen to FileText"
```

---

### Task 2: Smart Folder Icons in FileTreePanel

**Files:**
- Modify: `src/components/FileTreePanel.tsx:1-2, 107-108`

- [ ] **Step 1: Add BookOpen import and markdown detection helper**

In `src/components/FileTreePanel.tsx`, update the lucide-react import (line 2) to include `BookOpen`:

```typescript
// Before:
import { ChevronRight, Folder } from 'lucide-react'

// After:
import { ChevronRight, Folder, BookOpen } from 'lucide-react'
```

Add a helper constant after the `Props` interface (after line 25):

```typescript
const MD_EXTENSIONS = new Set(['md', 'mdx', 'markdown'])

function isMdFolder(sha: string, treeData: Map<string, TreeEntry[]>): boolean {
  const children = treeData.get(sha)
  if (!children) return false
  let count = 0
  for (const c of children) {
    if (c.type === 'blob') {
      const ext = c.path.split('.').pop()?.toLowerCase() ?? ''
      if (MD_EXTENSIONS.has(ext)) {
        count++
        if (count >= 2) return true
      }
    }
  }
  return false
}
```

- [ ] **Step 2: Replace folder icon rendering**

Replace the folder icon line (line 108):

```typescript
// Before:
<Folder size={14} className="file-tree__icon file-tree__icon--folder" />

// After:
{isMdFolder(entry.sha, treeData) ? (
  <BookOpen size={14} className="file-tree__icon" style={{ color: '#3b82f6' }} />
) : (
  <Folder size={14} className="file-tree__icon file-tree__icon--folder" />
)}
```

This uses `entry.sha` directly since `treeData` is keyed by SHA. If the folder's children aren't loaded yet, `treeData.get(entry.sha)` returns `undefined` → `isMdFolder` returns `false` → normal folder icon. Once expanded and children are loaded, the icon upgrades to `BookOpen` if 2+ markdown files are found.

- [ ] **Step 3: Verify the change**

Run: `npx vitest run src/components/FileTreePanel --reporter=verbose`
Expected: Existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/FileTreePanel.tsx
git commit -m "feat(files): show BookOpen icon for folders with 2+ markdown files in tree"
```

---

### Task 3: Smart Folder Icons in DirectoryListing

**Files:**
- Modify: `src/components/DirectoryListing.tsx:1, 127, 153, 184, 232`

- [ ] **Step 1: Add BookOpen import and markdown detection helper**

In `src/components/DirectoryListing.tsx`, update the lucide-react import (line 1):

```typescript
// Before:
import { Folder, ChevronRight, Image as ImageIcon, FileQuestion, Play } from 'lucide-react'

// After:
import { Folder, ChevronRight, Image as ImageIcon, FileQuestion, Play, BookOpen } from 'lucide-react'
```

Add props for tree data needed by the smart icon detection. Update the `DirectoryListingProps` interface (line 15-26) to add an optional `treeData` prop:

```typescript
interface DirectoryListingProps {
  entries: TreeEntry[]
  onSelect: (entry: TreeEntry, fullPath: string) => void
  basePath: string
  viewMode?: ViewMode
  filterText?: string
  sortField?: SortField
  sortDirection?: SortDirection
  owner?: string
  name?: string
  branch?: string
  treeData?: Map<string, TreeEntry[]>  // for smart folder icon detection
}
```

Add the same helper (after the interface, before `sortEntries`):

```typescript
const MD_EXTENSIONS_DIR = new Set(['md', 'mdx', 'markdown'])

function isMdFolder(sha: string, treeData?: Map<string, TreeEntry[]>): boolean {
  if (!treeData) return false
  const children = treeData.get(sha)
  if (!children) return false
  let count = 0
  for (const c of children) {
    if (c.type === 'blob') {
      const ext = c.path.split('.').pop()?.toLowerCase() ?? ''
      if (MD_EXTENSIONS_DIR.has(ext)) {
        count++
        if (count >= 2) return true
      }
    }
  }
  return false
}
```

- [ ] **Step 2: Destructure treeData from props**

In the `DirectoryListing` function signature, add `treeData` to the destructured props:

```typescript
export default function DirectoryListing({
  entries, onSelect, basePath, viewMode = 'details',
  filterText, sortField = 'name', sortDirection = 'asc',
  owner, name, branch, treeData,
}: DirectoryListingProps) {
```

- [ ] **Step 3: Create a folder icon helper inside the component**

Add a helper function inside `DirectoryListing` (after the `sorted` variable) to avoid repetition across 4 view modes:

```typescript
const folderIcon = (entry: TreeEntry, size: number) =>
  isMdFolder(entry.sha, treeData)
    ? <BookOpen size={size} className="dir-listing__icon" style={{ color: '#3b82f6' }} />
    : <Folder size={size} className="dir-listing__icon dir-listing__icon--folder" />
```

- [ ] **Step 4: Replace all 4 folder icon sites**

Replace each `<Folder size={N} .../>` in the 4 view modes with `folderIcon(entry, N)`:

**List view (line ~127):**
```typescript
// Before:
<Folder size={14} className="dir-listing__icon dir-listing__icon--folder" />
// After:
{folderIcon(entry, 14)}
```

**Small icons view (line ~153):**
```typescript
// Before:
<Folder size={16} className="dir-listing__icon dir-listing__icon--folder" />
// After:
{folderIcon(entry, 16)}
```

**Large icons view (line ~184):**
```typescript
// Before:
<Folder size={48} className="dir-listing__icon dir-listing__icon--folder" />
// After:
{folderIcon(entry, 48)}
```

**Details view (line ~232):**
```typescript
// Before:
<Folder size={14} className="dir-listing__icon dir-listing__icon--folder" />
// After:
{folderIcon(entry, 14)}
```

- [ ] **Step 5: Verify the change**

Run: `npx vitest run src/components/DirectoryListing --reporter=verbose`
Expected: Existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/DirectoryListing.tsx
git commit -m "feat(files): show BookOpen icon for folders with 2+ markdown files in listing"
```

---

### Task 4: Pass treeData to DirectoryListing from FilesTab

**Files:**
- Modify: `src/components/FilesTab.tsx`

- [ ] **Step 1: Find where DirectoryListing is rendered and add treeData prop**

In `FilesTab.tsx`, `DirectoryListing` is rendered inside `FileContentPanel`. We need to find where `FileContentPanel` receives its props and ensure `treeData` is passed through to `DirectoryListing`.

Read `src/components/FileContentPanel.tsx` to see how it renders `DirectoryListing` and whether it already receives `treeData`. If not, thread `treeData` through from `FilesTab` → `FileContentPanel` → `DirectoryListing`.

Add `treeData` prop to the `FileContentPanel` render in `FilesTab.tsx` and pass it through in `FileContentPanel.tsx`:

```typescript
// In FilesTab.tsx where FileContentPanel is rendered:
<FileContentPanel
  // ...existing props...
  treeData={treeData}
/>
```

Then in `FileContentPanel.tsx`, accept and forward `treeData` to `DirectoryListing`.

- [ ] **Step 2: Verify**

Run: `npx vitest run src/components --reporter=verbose`
Expected: All component tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/FilesTab.tsx src/components/FileContentPanel.tsx
git commit -m "feat(files): thread treeData through to DirectoryListing for smart icons"
```

---

### Task 5: Create the ContextMenu Component

**Files:**
- Create: `src/components/ContextMenu.tsx`

- [ ] **Step 1: Write the ContextMenu component**

Create `src/components/ContextMenu.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { Download, ChevronRight } from 'lucide-react'

export interface ContextMenuTarget {
  path: string
  type: 'blob' | 'tree'
  hasMarkdown: boolean   // for folders: has any .md children; for blobs: is itself .md
  fullPath: string
}

interface ContextMenuProps {
  x: number
  y: number
  target: ContextMenuTarget
  onClose: () => void
  onDownloadRaw: (target: ContextMenuTarget) => void
  onDownloadConverted: (target: ContextMenuTarget, format: 'docx' | 'pdf' | 'epub') => void
}

const MD_EXTENSIONS = new Set(['md', 'mdx', 'markdown'])

function isMarkdownFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MD_EXTENSIONS.has(ext)
}

export default function ContextMenu({ x, y, target, onClose, onDownloadRaw, onDownloadConverted }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [submenuOpen, setSubmenuOpen] = useState(false)

  const isFolder = target.type === 'tree'
  const isMd = !isFolder && isMarkdownFile(target.path)
  const showConvertOptions = isMd || (isFolder && target.hasMarkdown)

  // Close on click outside, Escape, or scroll
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 9999,
  }

  // Simple download (no submenu) for non-markdown files
  if (!showConvertOptions) {
    return (
      <div ref={menuRef} className="ctx-menu" style={style}>
        <button
          className="ctx-menu__item"
          onClick={() => { onDownloadRaw(target); onClose() }}
        >
          <Download size={14} />
          <span>Download</span>
        </button>
      </div>
    )
  }

  // Download with submenu for markdown files/folders
  return (
    <div ref={menuRef} className="ctx-menu" style={style}>
      <div
        className="ctx-menu__item ctx-menu__item--parent"
        onMouseEnter={() => setSubmenuOpen(true)}
        onMouseLeave={() => setSubmenuOpen(false)}
      >
        <Download size={14} />
        <span>Download</span>
        <ChevronRight size={12} className="ctx-menu__arrow" />

        {submenuOpen && (
          <div className="ctx-menu ctx-menu--sub">
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadRaw(target); onClose() }}
            >
              Raw {isFolder ? '(.zip)' : `(.${target.path.split('.').pop()})`}
            </button>
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadConverted(target, 'docx'); onClose() }}
            >
              Word (.docx)
            </button>
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadConverted(target, 'pdf'); onClose() }}
            >
              PDF (.pdf)
            </button>
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadConverted(target, 'epub'); onClose() }}
            >
              ePub (.epub)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ContextMenu.tsx
git commit -m "feat(files): add ContextMenu component with download submenu"
```

---

### Task 6: Add Context Menu Styling

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add context menu CSS**

Append to `src/styles/globals.css`:

```css
/* ── Context Menu ── */
.ctx-menu {
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 180px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
  font-size: 13px;
}
.ctx-menu--sub {
  position: absolute;
  left: 100%;
  top: -4px;
}
.ctx-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: none;
  color: var(--t1);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  position: relative;
  white-space: nowrap;
}
.ctx-menu__item:hover {
  background: var(--bg3);
}
.ctx-menu__item--parent {
  position: relative;
}
.ctx-menu__arrow {
  margin-left: auto;
  color: var(--t3);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(files): add context menu styling"
```

---

### Task 7: Wire Context Menu into FilesTab

**Files:**
- Modify: `src/components/FilesTab.tsx`
- Modify: `src/components/FileTreePanel.tsx`
- Modify: `src/components/DirectoryListing.tsx`

- [ ] **Step 1: Add context menu state and handlers to FilesTab**

In `src/components/FilesTab.tsx`, add imports and state:

```typescript
// Add to imports:
import ContextMenu, { ContextMenuTarget } from './ContextMenu'

// Add state after other useState calls (~line 65):
const [ctxMenu, setCtxMenu] = useState<{
  x: number; y: number; target: ContextMenuTarget
} | null>(null)
```

Add handler functions (after the existing handlers, before the `return`):

```typescript
const handleContextMenu = useCallback((e: React.MouseEvent, entry: TreeEntry, fullPath: string) => {
  e.preventDefault()
  const isDir = entry.type === 'tree'
  const ext = entry.path.split('.').pop()?.toLowerCase() ?? ''
  const mdExts = new Set(['md', 'mdx', 'markdown'])

  let hasMarkdown = false
  if (isDir) {
    // Check loaded children, default true for unloaded
    const sha = expandedDirs.get(fullPath) ?? entry.sha
    const children = treeData.get(sha)
    hasMarkdown = children
      ? children.some(c => c.type === 'blob' && mdExts.has(c.path.split('.').pop()?.toLowerCase() ?? ''))
      : true  // unloaded folder: assume yes, service handles gracefully
  } else {
    hasMarkdown = mdExts.has(ext)
  }

  setCtxMenu({
    x: e.clientX,
    y: e.clientY,
    target: { path: entry.path, type: entry.type, hasMarkdown, fullPath },
  })
}, [expandedDirs, treeData])

const handleDownloadRaw = useCallback((target: ContextMenuTarget) => {
  if (target.type === 'tree') {
    window.api.download.rawFolder({ owner, name, branch, path: target.fullPath })
  } else {
    window.api.download.rawFile({ owner, name, branch, path: target.fullPath })
  }
}, [owner, name, branch])

const handleDownloadConverted = useCallback((target: ContextMenuTarget, format: 'docx' | 'pdf' | 'epub') => {
  window.api.download.convert({
    owner, name, branch,
    path: target.fullPath,
    format,
    isFolder: target.type === 'tree',
  })
}, [owner, name, branch])
```

- [ ] **Step 2: Pass onContextMenu to child components**

Pass `handleContextMenu` to `FileTreePanel`:

```typescript
<FileTreePanel
  // ...existing props...
  onContextMenu={handleContextMenu}
/>
```

Pass it through `FileContentPanel` to `DirectoryListing`:

```typescript
<FileContentPanel
  // ...existing props...
  onContextMenu={handleContextMenu}
/>
```

- [ ] **Step 3: Render the ContextMenu**

Add at the end of the `FilesTab` return, just before the closing `</div>`:

```typescript
{ctxMenu && (
  <ContextMenu
    x={ctxMenu.x}
    y={ctxMenu.y}
    target={ctxMenu.target}
    onClose={() => setCtxMenu(null)}
    onDownloadRaw={handleDownloadRaw}
    onDownloadConverted={handleDownloadConverted}
  />
)}
```

- [ ] **Step 4: Add onContextMenu prop to FileTreePanel**

In `src/components/FileTreePanel.tsx`, add to the `Props` interface:

```typescript
onContextMenu?: (e: React.MouseEvent, entry: TreeEntry, fullPath: string) => void
```

Destructure it in the component and add to each `<button>`:

```typescript
// On the button element (line ~82):
onContextMenu={onContextMenu ? (e) => onContextMenu(e, entry, fullPath) : undefined}
```

- [ ] **Step 5: Add onContextMenu prop to DirectoryListing**

In `src/components/DirectoryListing.tsx`, add to `DirectoryListingProps`:

```typescript
onContextMenu?: (e: React.MouseEvent, entry: TreeEntry, fullPath: string) => void
```

Destructure it and add to each `<button>` in all 4 view modes:

```typescript
// On each button element:
onContextMenu={onContextMenu ? (e) => onContextMenu(e, entry, fullPath) : undefined}
```

- [ ] **Step 6: Thread onContextMenu through FileContentPanel**

Read `FileContentPanel.tsx`, add `onContextMenu` to its props interface, and forward it to `DirectoryListing`.

- [ ] **Step 7: Verify everything compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/FilesTab.tsx src/components/FileTreePanel.tsx src/components/DirectoryListing.tsx src/components/FileContentPanel.tsx
git commit -m "feat(files): wire context menu into file tree and directory listing"
```

---

### Task 8: Install Dependencies

**Files:** `package.json`

- [ ] **Step 1: Install conversion and zip libraries**

```bash
npm install marked jszip html-docx-js epub-gen-memory
npm install -D @types/html-docx-js
```

Note: `marked` is needed for main-process markdown→HTML. `jszip` for folder zipping. `html-docx-js` for Word conversion. `epub-gen-memory` for ePub. Check if `@types/marked` is needed (marked 4+ ships its own types).

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install marked, jszip, html-docx-js, epub-gen-memory for download service"
```

---

### Task 9: Create the Download Service

**Files:**
- Create: `electron/services/downloadService.ts`

- [ ] **Step 1: Write the download service**

Create `electron/services/downloadService.ts`:

```typescript
import { BrowserWindow, dialog } from 'electron'
import { marked } from 'marked'
import JSZip from 'jszip'
import { getToken } from '../store'
import { getTreeBySha, getBlobBySha, getBranch, getFileContent } from '../github'

const MD_EXTENSIONS = new Set(['md', 'mdx', 'markdown'])

function isMarkdown(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MD_EXTENSIONS.has(ext)
}

interface DownloadParams {
  owner: string
  name: string
  branch: string
  path: string
}

interface ConvertParams extends DownloadParams {
  format: 'docx' | 'pdf' | 'epub'
  isFolder: boolean
}

// ── Raw File Download ──

export async function downloadRawFile(params: DownloadParams): Promise<void> {
  const { owner, name, path } = params
  const filename = path.split('/').pop() ?? 'file'
  const token = getToken() ?? null

  // Fetch content via GitHub Contents API
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${params.branch}`,
    { headers: githubHeaders(token) }
  )
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`)
  const json = await res.json()
  const buffer = Buffer.from(json.content, 'base64')

  const result = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'All Files', extensions: ['*'] }],
  })
  if (result.canceled || !result.filePath) return

  const fs = await import('fs/promises')
  await fs.writeFile(result.filePath, buffer)
}

// ── Raw Folder Download (as .zip) ──

export async function downloadRawFolder(params: DownloadParams): Promise<void> {
  const { owner, name, branch, path } = params
  const token = getToken() ?? null
  const folderName = path.split('/').pop() ?? 'folder'

  // Get branch to find root tree, then navigate to the target folder
  const branchInfo = await getBranch(token, owner, name, branch)
  const treeSha = await resolveTreeSha(token, owner, name, branchInfo.rootTreeSha, path)
  if (!treeSha) throw new Error('Folder not found')

  const entries = await getTreeBySha(token, owner, name, treeSha)
  const zip = new JSZip()

  // Only immediate children (not recursive per spec)
  for (const entry of entries) {
    if (entry.type === 'blob') {
      const blob = await getBlobBySha(token, owner, name, entry.sha)
      zip.file(entry.path, Buffer.from(blob.rawBase64, 'base64'))
    }
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const result = await dialog.showSaveDialog({
    defaultPath: `${folderName}.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  })
  if (result.canceled || !result.filePath) return

  const fs = await import('fs/promises')
  await fs.writeFile(result.filePath, zipBuffer)
}

// ── Convert Markdown → Format ──

export async function downloadConverted(params: ConvertParams): Promise<void> {
  const { owner, name, branch, path, format, isFolder } = params
  const token = getToken() ?? null

  // Gather markdown content
  let markdownContent: string
  let defaultName: string

  if (isFolder) {
    const folderName = path.split('/').pop() ?? 'document'
    defaultName = folderName

    const branchInfo = await getBranch(token, owner, name, branch)
    const treeSha = await resolveTreeSha(token, owner, name, branchInfo.rootTreeSha, path)
    if (!treeSha) throw new Error('Folder not found')

    const entries = await getTreeBySha(token, owner, name, treeSha)
    const mdEntries = entries
      .filter(e => e.type === 'blob' && isMarkdown(e.path))
      .sort((a, b) => a.path.localeCompare(b.path))

    if (mdEntries.length === 0) {
      throw new Error('No markdown files found in this folder')
    }

    const parts: string[] = []
    for (const entry of mdEntries) {
      const blob = await getBlobBySha(token, owner, name, entry.sha)
      parts.push(blob.content)
    }
    markdownContent = parts.join('\n\n---\n\n')
  } else {
    defaultName = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'document'

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${branch}`,
      { headers: githubHeaders(token) }
    )
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`)
    const json = await res.json()
    markdownContent = Buffer.from(json.content, 'base64').toString('utf-8')
  }

  // Convert markdown to HTML
  const html = await marked.parse(markdownContent)
  const styledHtml = wrapHtml(html, defaultName)

  // Convert to target format
  switch (format) {
    case 'pdf':
      await convertToPdf(styledHtml, defaultName)
      break
    case 'docx':
      await convertToDocx(styledHtml, defaultName)
      break
    case 'epub':
      await convertToEpub(html, defaultName, markdownContent)
      break
  }
}

// ── PDF via hidden BrowserWindow ──

async function convertToPdf(html: string, defaultName: string): Promise<void> {
  const win = new BrowserWindow({ show: false, width: 800, height: 600 })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
    })

    const result = await dialog.showSaveDialog({
      defaultPath: `${defaultName}.pdf`,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })
    if (result.canceled || !result.filePath) return

    const fs = await import('fs/promises')
    await fs.writeFile(result.filePath, pdfBuffer)
  } finally {
    win.destroy()
  }
}

// ── DOCX via html-docx-js ──

async function convertToDocx(html: string, defaultName: string): Promise<void> {
  const htmlDocx = await import('html-docx-js')
  const docxBuffer = htmlDocx.asBlob(html)

  const result = await dialog.showSaveDialog({
    defaultPath: `${defaultName}.docx`,
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  })
  if (result.canceled || !result.filePath) return

  const fs = await import('fs/promises')
  const arrayBuffer = await docxBuffer.arrayBuffer()
  await fs.writeFile(result.filePath, Buffer.from(arrayBuffer))
}

// ── ePub via epub-gen-memory ──

async function convertToEpub(html: string, defaultName: string, _rawMarkdown: string): Promise<void> {
  const { default: epub } = await import('epub-gen-memory')
  const epubBuffer = await epub({
    title: defaultName,
    author: 'Git Suite Export',
    content: [{ title: defaultName, data: html }],
  })

  const result = await dialog.showSaveDialog({
    defaultPath: `${defaultName}.epub`,
    filters: [{ name: 'ePub Book', extensions: ['epub'] }],
  })
  if (result.canceled || !result.filePath) return

  const fs = await import('fs/promises')
  await fs.writeFile(result.filePath, epubBuffer)
}

// ── Helpers ──

function githubHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function wrapHtml(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1f2328; }
    h1, h2, h3 { border-bottom: 1px solid #d1d9e0; padding-bottom: 0.3em; }
    pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
    code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 85%; background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #d1d9e0; color: #636c76; margin: 0; padding: 0 1em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d9e0; padding: 6px 13px; }
    th { background: #f6f8fa; font-weight: 600; }
    img { max-width: 100%; }
    hr { border: none; border-top: 1px solid #d1d9e0; margin: 2em 0; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

// Navigate tree to find a subfolder's SHA
async function resolveTreeSha(
  token: string | null,
  owner: string,
  name: string,
  rootSha: string,
  path: string
): Promise<string | null> {
  if (!path) return rootSha
  const parts = path.split('/')
  let currentSha = rootSha
  for (const part of parts) {
    const entries = await getTreeBySha(token, owner, name, currentSha)
    const match = entries.find(e => e.path === part && e.type === 'tree')
    if (!match) return null
    currentSha = match.sha
  }
  return currentSha
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors. Note: some library imports may need adjustment depending on exact package APIs — fix any type issues.

- [ ] **Step 3: Commit**

```bash
git add electron/services/downloadService.ts
git commit -m "feat(download): add download service with raw, zip, pdf, docx, epub support"
```

---

### Task 10: Create IPC Download Handlers

**Files:**
- Create: `electron/ipc/downloadHandlers.ts`

- [ ] **Step 1: Write the IPC handlers**

Create `electron/ipc/downloadHandlers.ts`:

```typescript
import { ipcMain } from 'electron'
import { downloadRawFile, downloadRawFolder, downloadConverted } from '../services/downloadService'

export function registerDownloadHandlers(): void {
  ipcMain.handle('download:rawFile', (_event, params) => {
    return downloadRawFile(params)
  })

  ipcMain.handle('download:rawFolder', (_event, params) => {
    return downloadRawFolder(params)
  })

  ipcMain.handle('download:convert', (_event, params) => {
    return downloadConverted(params)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc/downloadHandlers.ts
git commit -m "feat(download): add IPC download handlers"
```

---

### Task 11: Register Handlers and Expose Preload API

**Files:**
- Modify: `electron/main.ts:28, ~1630`
- Modify: `electron/preload.ts:5-51`

- [ ] **Step 1: Register download handlers in main.ts**

Add import at the top of `electron/main.ts` (near line 28, alongside the verification import):

```typescript
import { registerDownloadHandlers } from './ipc/downloadHandlers'
```

Add the registration call near line 1630 (alongside `registerVerificationHandlers()`):

```typescript
registerDownloadHandlers()
```

- [ ] **Step 2: Expose download API in preload.ts**

In `electron/preload.ts`, add the `download` namespace inside the `contextBridge.exposeInMainWorld('api', {` object (after the `github` block, around line 51):

```typescript
download: {
  rawFile:  (params: { owner: string; name: string; branch: string; path: string }) =>
    ipcRenderer.invoke('download:rawFile', params),
  rawFolder: (params: { owner: string; name: string; branch: string; path: string }) =>
    ipcRenderer.invoke('download:rawFolder', params),
  convert:  (params: { owner: string; name: string; branch: string; path: string; format: string; isFolder: boolean }) =>
    ipcRenderer.invoke('download:convert', params),
},
```

- [ ] **Step 3: Add TypeScript type declarations for window.api.download**

In `src/env.d.ts`, add the `download` namespace inside the `Window.api` interface (after the `verification` block, around line 153):

```typescript
download: {
  rawFile(params: { owner: string; name: string; branch: string; path: string }): Promise<void>
  rawFolder(params: { owner: string; name: string; branch: string; path: string }): Promise<void>
  convert(params: { owner: string; name: string; branch: string; path: string; format: string; isFolder: boolean }): Promise<void>
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat(download): register IPC handlers and expose preload download API"
```

---

### Task 12: End-to-End Smoke Test

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

- [ ] **Step 2: Test icon changes**

1. Navigate to a repo with markdown files → verify they show `FileText` icon (page with lines), not `BookOpen`
2. Expand a folder that contains 2+ markdown files → verify the folder icon changes to `BookOpen` (blue)
3. Check that `LICENSE.md` still shows the `Scale` icon

- [ ] **Step 3: Test context menu — non-markdown file**

1. Right-click a `.ts` or `.js` file → verify a context menu appears with a single "Download" option
2. Click "Download" → verify a native Save As dialog opens
3. Save the file → verify the content is correct

- [ ] **Step 4: Test context menu — markdown file**

1. Right-click a `.md` file → verify the context menu shows "Download" with an arrow
2. Hover over "Download" → verify submenu appears with: Raw (.md), Word (.docx), PDF (.pdf), ePub (.epub)
3. Test each format:
   - Raw: saves the `.md` file
   - Word: saves a `.docx` file, open in Word to verify content
   - PDF: saves a `.pdf` file, open to verify rendered markdown
   - ePub: saves an `.epub` file, open in an ePub reader to verify

- [ ] **Step 5: Test context menu — folder**

1. Right-click a folder → verify context menu shows "Download" with submenu
2. "Raw (.zip)" → saves a zip containing the folder's immediate children
3. If folder has markdown files, test Word/PDF/ePub options → verify they aggregate markdown content

- [ ] **Step 6: Test edge cases**

1. Right-click a folder with no markdown files → verify only "Raw (.zip)" appears (no conversion options)
2. Cancel the Save As dialog → verify nothing happens (no error)
3. Right-click a collapsed folder → verify conversion options appear (defaults to showing them)

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
