# Context-Aware Download Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Download ZIP" button with a context-aware dropdown offering format-appropriate downloads based on repo bucket classification.

**Architecture:** A `getDownloadOptions()` pure function maps `(typeBucket, typeSub)` to menu items. A `DownloadDropdown` component renders the dropdown in RepoDetail. Three new backend functions (`downloadRepoConverted`, `exportBookmarks`, `getTopLevelFolders`) handle the new download types, plus a `getDefaultBranch` helper. The existing conversion pipeline (`convertToPdf`/`convertToDocx`/`convertToEpub`) is reused for repo-level conversions.

**Tech Stack:** React, TypeScript, Electron IPC, marked (lexer for bookmark extraction), JSZip, existing GitHub API helpers

**Spec:** `docs/superpowers/specs/2026-04-08-context-aware-download-menu-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/lib/getDownloadOptions.ts` | Pure function: bucket/sub → menu items array |
| `src/lib/getDownloadOptions.test.ts` | Unit tests for menu option mapping |
| `src/components/DownloadDropdown.tsx` | Dropdown UI component |
| `src/components/DownloadDropdown.test.tsx` | Component tests |

### Modified Files
| File | Changes |
|---|---|
| `electron/github.ts` | Add `getDefaultBranch()`, expand `getRepoTree()` return type to include `sha` |
| `electron/services/downloadService.ts` | Add `downloadRepoConverted()`, `exportBookmarks()`, `getTopLevelFolders()` |
| `electron/ipc/downloadHandlers.ts` | Register 3 new IPC handlers |
| `electron/preload.ts` | Expose 3 new methods on `window.api.download` |
| `src/views/RepoDetail.tsx` | Replace download button with `<DownloadDropdown>` |
| `src/styles/globals.css` | Add dropdown menu styles |

---

## Task 1: `getDownloadOptions` utility

**Files:**
- Create: `src/lib/getDownloadOptions.ts`
- Create: `src/lib/getDownloadOptions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/getDownloadOptions.test.ts
import { describe, it, expect } from 'vitest'
import { getDownloadOptions, type DownloadOption } from './getDownloadOptions'

function getDefault(opts: DownloadOption[]) {
  return opts.find(o => o.isDefault)
}

describe('getDownloadOptions', () => {
  it('returns ePub default for learning/book', () => {
    const opts = getDownloadOptions('learning', 'book')
    expect(getDefault(opts)?.id).toBe('epub')
  })

  it('returns PDF default for learning/tutorial', () => {
    const opts = getDownloadOptions('learning', 'tutorial')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/course', () => {
    const opts = getDownloadOptions('learning', 'course')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/cheatsheet', () => {
    const opts = getDownloadOptions('learning', 'cheatsheet')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/interview-prep', () => {
    const opts = getDownloadOptions('learning', 'interview-prep')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/research-paper', () => {
    const opts = getDownloadOptions('learning', 'research-paper')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns bookmarks default for learning/awesome-list', () => {
    const opts = getDownloadOptions('learning', 'awesome-list')
    expect(getDefault(opts)?.id).toBe('bookmarks')
  })

  it('returns ZIP default for learning/roadmap', () => {
    const opts = getDownloadOptions('learning', 'roadmap')
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('returns ZIP default for learning/coding-challenge', () => {
    const opts = getDownloadOptions('learning', 'coding-challenge')
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('returns ZIP default for dev-tools/algorithm', () => {
    const opts = getDownloadOptions('dev-tools', 'algorithm')
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('returns ZIP default for any non-learning bucket', () => {
    for (const bucket of ['frameworks', 'ai-ml', 'editors', 'lang-projects', 'infrastructure', 'utilities']) {
      const opts = getDownloadOptions(bucket, 'anything')
      expect(getDefault(opts)?.id).toBe('zip')
    }
  })

  it('returns ZIP default when typeSub is null', () => {
    const opts = getDownloadOptions('learning', null)
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('always includes zip, clone, and folder', () => {
    const opts = getDownloadOptions('learning', 'book')
    const ids = opts.map(o => o.id)
    expect(ids).toContain('zip')
    expect(ids).toContain('clone')
    expect(ids).toContain('folder')
  })

  it('has exactly one default', () => {
    const opts = getDownloadOptions('learning', 'book')
    expect(opts.filter(o => o.isDefault)).toHaveLength(1)
  })

  it('includes epub and docx for learning/book but not bookmarks', () => {
    const opts = getDownloadOptions('learning', 'book')
    const ids = opts.map(o => o.id)
    expect(ids).toContain('epub')
    expect(ids).toContain('docx')
    expect(ids).toContain('pdf')
    expect(ids).not.toContain('bookmarks')
  })

  it('includes bookmarks for awesome-list but not epub or docx', () => {
    const opts = getDownloadOptions('learning', 'awesome-list')
    const ids = opts.map(o => o.id)
    expect(ids).toContain('bookmarks')
    expect(ids).not.toContain('epub')
    expect(ids).not.toContain('docx')
  })

  it('non-learning buckets only have zip, clone, folder', () => {
    const opts = getDownloadOptions('frameworks', 'web-framework')
    const ids = opts.map(o => o.id)
    expect(ids).toEqual(['zip', 'clone', 'folder'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/getDownloadOptions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `getDownloadOptions`**

```typescript
// src/lib/getDownloadOptions.ts
export interface DownloadOption {
  id: 'zip' | 'epub' | 'pdf' | 'docx' | 'bookmarks' | 'clone' | 'folder'
  label: string
  icon: string
  isDefault: boolean
}

// Sub-types that get ePub as default
const EPUB_DEFAULT = new Set(['book'])

// Sub-types that get PDF as default
const PDF_DEFAULT = new Set([
  'tutorial', 'course', 'cheatsheet', 'interview-prep', 'research-paper',
])

// Sub-types that get bookmarks as default
const BOOKMARKS_DEFAULT = new Set(['awesome-list'])

// Sub-types that get ePub + DOCX options (long-form markdown)
const HAS_EPUB = new Set(['book', 'tutorial', 'course'])

// Sub-types that get DOCX option
const HAS_DOCX = new Set([
  'book', 'tutorial', 'course', 'cheatsheet', 'interview-prep', 'research-paper',
])

// Sub-types that get PDF option (all learning except those that already default to ZIP)
const HAS_PDF = new Set([
  'book', 'tutorial', 'course', 'cheatsheet', 'interview-prep', 'research-paper',
  'awesome-list', 'roadmap', 'coding-challenge',
])

const ALWAYS: DownloadOption[] = [
  { id: 'zip',    label: 'Download as ZIP',      icon: 'archive',   isDefault: false },
  { id: 'clone',  label: 'Copy clone command',   icon: 'clipboard', isDefault: false },
  { id: 'folder', label: 'Download folder\u2026', icon: 'folder-down', isDefault: false },
]

export function getDownloadOptions(typeBucket: string, typeSub: string | null): DownloadOption[] {
  // Non-learning or null sub → ZIP default
  if (typeBucket !== 'learning' || typeSub == null) {
    return ALWAYS.map(o => o.id === 'zip' ? { ...o, isDefault: true } : o)
  }

  const defaultId: DownloadOption['id'] =
    EPUB_DEFAULT.has(typeSub) ? 'epub' :
    PDF_DEFAULT.has(typeSub) ? 'pdf' :
    BOOKMARKS_DEFAULT.has(typeSub) ? 'bookmarks' :
    'zip'

  const options: DownloadOption[] = []

  // Conditionally add format options
  if (HAS_EPUB.has(typeSub)) {
    options.push({ id: 'epub', label: 'Download as ePub', icon: 'book-open', isDefault: defaultId === 'epub' })
  }
  if (HAS_PDF.has(typeSub)) {
    options.push({ id: 'pdf', label: 'Download as PDF', icon: 'file-text', isDefault: defaultId === 'pdf' })
  }
  if (HAS_DOCX.has(typeSub)) {
    options.push({ id: 'docx', label: 'Download as Word', icon: 'file-type', isDefault: defaultId === 'docx' })
  }
  if (BOOKMARKS_DEFAULT.has(typeSub)) {
    options.push({ id: 'bookmarks', label: 'Export as Bookmarks', icon: 'bookmark', isDefault: defaultId === 'bookmarks' })
  }

  // Always-present items
  options.push(...ALWAYS.map(o => o.id === 'zip' && defaultId === 'zip' ? { ...o, isDefault: true } : o))

  // Move default to top
  options.sort((a, b) => (a.isDefault ? -1 : 0) - (b.isDefault ? -1 : 0))

  return options
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/getDownloadOptions.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/getDownloadOptions.ts src/lib/getDownloadOptions.test.ts
git commit -m "feat(download): add getDownloadOptions utility with tests"
```

---

## Task 2: Backend — `getDefaultBranch` helper and `getRepoTree` type fix

**Files:**
- Modify: `electron/github.ts:99` (add helper), `electron/github.ts:282-298` (expand return type)

- [ ] **Step 1: Add `getDefaultBranch` helper to `electron/github.ts`**

Add after the `getRepo` function (~line 130):

```typescript
export async function getDefaultBranch(
  token: string | null,
  owner: string,
  name: string,
): Promise<string> {
  const repo = await getRepo(token, owner, name)
  return repo.default_branch ?? 'main'
}
```

- [ ] **Step 2: Expand `getRepoTree` return type to include `sha`**

At `electron/github.ts:282-299`, make two changes:

1. Update the function's return type (line 287):
   - From: `Promise<{ path: string; type: string }[]>`
   - To: `Promise<{ path: string; type: string; sha: string }[]>`

2. Update the type assertion on `data` (lines 293-294):
   - From: `tree: { path: string; type: string }[]`
   - To: `tree: { path: string; type: string; sha: string }[]`

The function already returns `data.tree` directly (line 298) — no `.map()` needed. The GitHub API already includes `sha` in tree entries; we're just updating the types to expose it.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All existing tests pass (no regressions from type expansion)

- [ ] **Step 4: Commit**

```bash
git add electron/github.ts
git commit -m "feat(github): add getDefaultBranch helper, include sha in getRepoTree"
```

---

## Task 3: Backend — `downloadRepoConverted`

**Files:**
- Modify: `electron/services/downloadService.ts`

- [ ] **Step 1: Add `downloadRepoConverted` function**

Add after the existing `downloadRepoZip` function (~line 237):

```typescript
// ── Repo-level Markdown Conversion ──

export async function downloadRepoConverted(
  owner: string,
  name: string,
  format: 'pdf' | 'docx' | 'epub',
): Promise<void> {
  const token = getToken() ?? null

  // Resolve default branch and fetch full tree
  const { getDefaultBranch, getRepoTree, getBlobBySha } = await import('../github')
  const branch = await getDefaultBranch(token, owner, name)

  let tree: { path: string; type: string; sha: string }[]
  try {
    tree = await getRepoTree(token, owner, name, branch)
  } catch (err) {
    if (err instanceof Error && err.message.includes('truncated')) {
      const { dialog } = await import('electron')
      dialog.showErrorBox(
        'Repo too large',
        'This repo is too large for full conversion. Use the Files tab to convert individual files or folders.',
      )
      return
    }
    throw err
  }

  // Collect markdown blobs
  const mdEntries = tree
    .filter(e => e.type === 'blob' && isMarkdown(e.path))
    .sort((a, b) => {
      // README files first
      const aIsReadme = /^(.*\/)?readme(\.[^/]+)?$/i.test(a.path)
      const bIsReadme = /^(.*\/)?readme(\.[^/]+)?$/i.test(b.path)
      if (aIsReadme && !bIsReadme) return -1
      if (!aIsReadme && bIsReadme) return 1
      return a.path.localeCompare(b.path)
    })

  if (mdEntries.length === 0) {
    const { dialog } = await import('electron')
    dialog.showErrorBox('No markdown found', 'This repo contains no markdown files to convert.')
    return
  }

  // Fetch and stitch content
  const parts: string[] = []
  for (const entry of mdEntries) {
    const blob = await getBlobBySha(token, owner, name, entry.sha)
    parts.push(blob.content)
  }
  const markdownContent = parts.join('\n\n---\n\n')

  const { marked } = await import('marked')
  const html = await marked.parse(markdownContent)
  const styledHtml = wrapHtml(html, `${owner}-${name}`)

  switch (format) {
    case 'pdf':
      await convertToPdf(styledHtml, `${owner}-${name}`)
      break
    case 'docx':
      await convertToDocx(styledHtml, `${owner}-${name}`)
      break
    case 'epub':
      await convertToEpub(html, `${owner}-${name}`)
      break
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project tsconfig.node.json`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add electron/services/downloadService.ts
git commit -m "feat(download): add downloadRepoConverted for repo-level md conversion"
```

---

## Task 4: Backend — `exportBookmarks`

**Files:**
- Modify: `electron/services/downloadService.ts`

- [ ] **Step 1: Add `exportBookmarks` function**

Add after `downloadRepoConverted`:

```typescript
// ── Bookmark Export for Awesome Lists ──

export async function exportBookmarks(owner: string, name: string): Promise<void> {
  const token = getToken() ?? null
  const { getDefaultBranch, getRepoTree, getBlobBySha } = await import('../github')
  const branch = await getDefaultBranch(token, owner, name)

  let tree: { path: string; type: string; sha: string }[]
  try {
    tree = await getRepoTree(token, owner, name, branch)
  } catch (err) {
    if (err instanceof Error && err.message.includes('truncated')) {
      const { dialog } = await import('electron')
      dialog.showErrorBox('Repo too large', 'This repo is too large for bookmark export. Try a smaller repo.')
      return
    }
    throw err
  }

  const mdEntries = tree
    .filter(e => e.type === 'blob' && isMarkdown(e.path))
    .sort((a, b) => {
      const aIsReadme = /^(.*\/)?readme(\.[^/]+)?$/i.test(a.path)
      const bIsReadme = /^(.*\/)?readme(\.[^/]+)?$/i.test(b.path)
      if (aIsReadme && !bIsReadme) return -1
      if (!aIsReadme && bIsReadme) return 1
      return a.path.localeCompare(b.path)
    })

  if (mdEntries.length === 0) {
    const { dialog } = await import('electron')
    dialog.showErrorBox('No markdown found', 'This repo contains no markdown files to extract bookmarks from.')
    return
  }

  // Parse markdown with marked lexer to extract links
  const { marked } = await import('marked')
  const folders: Map<string, { text: string; url: string }[]> = new Map()
  let currentHeading = name // default folder name

  for (const entry of mdEntries) {
    const blob = await getBlobBySha(token, owner, name, entry.sha)
    const tokens = marked.lexer(blob.content)
    walkTokens(tokens, (token) => {
      if (token.type === 'heading') {
        currentHeading = token.text
      }
      if (token.type === 'link') {
        let url = token.href
        // Convert relative URLs to absolute GitHub URLs
        if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('#')) {
          url = `https://github.com/${owner}/${name}/blob/${branch}/${url}`
        }
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          if (!folders.has(currentHeading)) folders.set(currentHeading, [])
          folders.get(currentHeading)!.push({ text: token.text || url, url })
        }
      }
    })
  }

  // Generate Netscape bookmark HTML
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `  <DT><H3>${escapeHtml(`${owner}/${name}`)}</H3>`,
    '  <DL><p>',
  ]

  for (const [heading, links] of folders) {
    lines.push(`    <DT><H3>${escapeHtml(heading)}</H3>`)
    lines.push('    <DL><p>')
    for (const link of links) {
      lines.push(`      <DT><A HREF="${escapeHtml(link.url)}">${escapeHtml(link.text)}</A>`)
    }
    lines.push('    </DL><p>')
  }

  lines.push('  </DL><p>')
  lines.push('</DL><p>')

  const bookmarkHtml = lines.join('\n')

  const { dialog } = await import('electron')
  const result = await dialog.showSaveDialog(getParentWindow()!, {
    defaultPath: `${owner}-${name}-bookmarks.html`,
    filters: [{ name: 'HTML Bookmark File', extensions: ['html'] }],
  })
  if (result.canceled || !result.filePath) return

  const fs = await import('fs/promises')
  await fs.writeFile(result.filePath, bookmarkHtml, 'utf-8')
}

// Walk marked tokens recursively (handles nested tokens like list items containing links)
function walkTokens(
  tokens: { type: string; text?: string; href?: string; depth?: number; tokens?: unknown[]; items?: unknown[] }[],
  callback: (token: { type: string; text?: string; href?: string; depth?: number }) => void,
): void {
  for (const token of tokens) {
    callback(token)
    if ('tokens' in token && Array.isArray(token.tokens)) {
      walkTokens(token.tokens as typeof tokens, callback)
    }
    if ('items' in token && Array.isArray(token.items)) {
      walkTokens(token.items as typeof tokens, callback)
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project tsconfig.node.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add electron/services/downloadService.ts
git commit -m "feat(download): add exportBookmarks for awesome-list bookmark export"
```

---

## Task 5: Backend — `getTopLevelFolders`

**Files:**
- Modify: `electron/services/downloadService.ts`

- [ ] **Step 1: Add `getTopLevelFolders` function**

Add after `exportBookmarks`:

```typescript
// ── Top-Level Folder Listing ──

export async function getTopLevelFolders(owner: string, name: string): Promise<string[]> {
  const token = getToken() ?? null
  const { getDefaultBranch, getBranch, getTreeBySha } = await import('../github')
  const branch = await getDefaultBranch(token, owner, name)
  const { rootTreeSha } = await getBranch(token, owner, name, branch)
  const entries = await getTreeBySha(token, owner, name, rootTreeSha)
  return entries.filter(e => e.type === 'tree').map(e => e.path)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project tsconfig.node.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add electron/services/downloadService.ts
git commit -m "feat(download): add getTopLevelFolders for folder picker"
```

---

## Task 6: IPC Handlers and Preload Bridge

**Files:**
- Modify: `electron/ipc/downloadHandlers.ts:7-40`
- Modify: `electron/preload.ts:222-233`

- [ ] **Step 1: Register new IPC handlers in `downloadHandlers.ts`**

Add these handlers inside the `registerDownloadHandlers()` function, after the existing handlers:

```typescript
  ipcMain.handle('download:repoConverted', (_event, owner: string, name: string, format: 'pdf' | 'docx' | 'epub') =>
    downloadRepoConverted(owner, name, format),
  )

  ipcMain.handle('download:bookmarks', (_event, owner: string, name: string) =>
    exportBookmarks(owner, name),
  )

  ipcMain.handle('download:topLevelFolders', (_event, owner: string, name: string) =>
    getTopLevelFolders(owner, name),
  )
```

Also extend the existing import on line 2 of `downloadHandlers.ts` — don't add a new import line. Change:
```typescript
import { downloadRawFile, downloadRawFolder, downloadConverted, downloadRepoZip } from '../services/downloadService'
```
To:
```typescript
import { downloadRawFile, downloadRawFolder, downloadConverted, downloadRepoZip, downloadRepoConverted, exportBookmarks, getTopLevelFolders } from '../services/downloadService'
```

- [ ] **Step 2: Add preload bridge methods in `electron/preload.ts`**

Add inside the `download: { ... }` object (after the existing methods around line 233):

```typescript
  repoConverted: (owner: string, name: string, format: 'pdf' | 'docx' | 'epub') =>
    ipcRenderer.invoke('download:repoConverted', owner, name, format),
  bookmarks: (owner: string, name: string) =>
    ipcRenderer.invoke('download:bookmarks', owner, name),
  topLevelFolders: (owner: string, name: string) =>
    ipcRenderer.invoke('download:topLevelFolders', owner, name) as Promise<string[]>,
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --project tsconfig.node.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/downloadHandlers.ts electron/preload.ts
git commit -m "feat(download): register IPC handlers and preload bridge for new download types"
```

---

## Task 7: `DownloadDropdown` component — tests

**Files:**
- Create: `src/components/DownloadDropdown.test.tsx`

- [ ] **Step 1: Write component tests**

```typescript
// src/components/DownloadDropdown.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DownloadDropdown from './DownloadDropdown'

// Mock window.api
const mockRepoZip = vi.fn().mockResolvedValue(undefined)
const mockRepoConverted = vi.fn().mockResolvedValue(undefined)
const mockBookmarks = vi.fn().mockResolvedValue(undefined)
const mockTopLevelFolders = vi.fn().mockResolvedValue(['src', 'docs', 'tests'])
const mockRawFolder = vi.fn().mockResolvedValue(undefined)

Object.defineProperty(window, 'api', {
  value: {
    download: {
      repoZip: mockRepoZip,
      repoConverted: mockRepoConverted,
      bookmarks: mockBookmarks,
      topLevelFolders: mockTopLevelFolders,
      rawFolder: mockRawFolder,
    },
  },
  writable: true,
})

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DownloadDropdown', () => {
  const baseProps = {
    owner: 'facebook',
    name: 'react',
    typeBucket: 'frameworks',
    typeSub: 'ui-library' as string | null,
    defaultBranch: 'main',
  }

  it('renders a download button', () => {
    render(<DownloadDropdown {...baseProps} />)
    expect(screen.getByTitle('Download')).toBeInTheDocument()
  })

  it('opens dropdown on click', () => {
    render(<DownloadDropdown {...baseProps} />)
    fireEvent.click(screen.getByTitle('Download'))
    expect(screen.getByText('Download as ZIP')).toBeInTheDocument()
  })

  it('shows correct options for a non-learning bucket', () => {
    render(<DownloadDropdown {...baseProps} />)
    fireEvent.click(screen.getByTitle('Download'))
    expect(screen.getByText('Download as ZIP')).toBeInTheDocument()
    expect(screen.getByText('Copy clone command')).toBeInTheDocument()
    expect(screen.getByText('Download folder\u2026')).toBeInTheDocument()
    expect(screen.queryByText('Download as ePub')).not.toBeInTheDocument()
  })

  it('shows ePub as highlighted default for learning/book', () => {
    render(<DownloadDropdown {...baseProps} typeBucket="learning" typeSub="book" />)
    fireEvent.click(screen.getByTitle('Download'))
    const epub = screen.getByText('Download as ePub')
    expect(epub.closest('.dl-dropdown__item')).toHaveClass('dl-dropdown__item--default')
  })

  it('shows bookmarks option for learning/awesome-list', () => {
    render(<DownloadDropdown {...baseProps} typeBucket="learning" typeSub="awesome-list" />)
    fireEvent.click(screen.getByTitle('Download'))
    expect(screen.getByText('Export as Bookmarks')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<DownloadDropdown {...baseProps} />)
    fireEvent.click(screen.getByTitle('Download'))
    expect(screen.getByText('Download as ZIP')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Download as ZIP')).not.toBeInTheDocument()
  })

  it('copies clone command to clipboard', async () => {
    render(<DownloadDropdown {...baseProps} />)
    fireEvent.click(screen.getByTitle('Download'))
    fireEvent.click(screen.getByText('Copy clone command'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'git clone https://github.com/facebook/react.git',
    )
  })

  it('calls repoZip when ZIP is clicked', async () => {
    render(<DownloadDropdown {...baseProps} />)
    fireEvent.click(screen.getByTitle('Download'))
    fireEvent.click(screen.getByText('Download as ZIP'))
    await waitFor(() => expect(mockRepoZip).toHaveBeenCalledWith('facebook', 'react'))
  })

  it('calls repoConverted when ePub is clicked', async () => {
    render(<DownloadDropdown {...baseProps} typeBucket="learning" typeSub="book" />)
    fireEvent.click(screen.getByTitle('Download'))
    fireEvent.click(screen.getByText('Download as ePub'))
    await waitFor(() => expect(mockRepoConverted).toHaveBeenCalledWith('facebook', 'react', 'epub'))
  })

  it('shows folder list when Download folder is clicked', async () => {
    render(<DownloadDropdown {...baseProps} />)
    fireEvent.click(screen.getByTitle('Download'))
    fireEvent.click(screen.getByText('Download folder\u2026'))
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('docs')).toBeInTheDocument()
      expect(screen.getByText('tests')).toBeInTheDocument()
    })
  })

  it('calls rawFolder when a folder is selected', async () => {
    render(<DownloadDropdown {...baseProps} />)
    fireEvent.click(screen.getByTitle('Download'))
    fireEvent.click(screen.getByText('Download folder\u2026'))
    await waitFor(() => screen.getByText('src'))
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => expect(mockRawFolder).toHaveBeenCalledWith({
      owner: 'facebook', name: 'react', branch: 'main', path: 'src',
    }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/DownloadDropdown.test.tsx`
Expected: FAIL — component not found

- [ ] **Step 3: Commit test file**

```bash
git add src/components/DownloadDropdown.test.tsx
git commit -m "test(download): add DownloadDropdown component tests"
```

---

## Task 8: `DownloadDropdown` component — implementation

**Files:**
- Create: `src/components/DownloadDropdown.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/DownloadDropdown.tsx
import { useEffect, useRef, useState } from 'react'
import {
  Archive, BookOpen, FileText, FileType, Bookmark,
  Clipboard, FolderDown, Check, X, Loader2, ChevronDown,
} from 'lucide-react'
import { getDownloadOptions, type DownloadOption } from '../lib/getDownloadOptions'

const ICON_MAP: Record<string, React.FC<{ size?: number }>> = {
  'archive': Archive,
  'book-open': BookOpen,
  'file-text': FileText,
  'file-type': FileType,
  'bookmark': Bookmark,
  'clipboard': Clipboard,
  'folder-down': FolderDown,
}

type ItemState = 'idle' | 'loading' | 'done' | 'error'

interface Props {
  owner: string
  name: string
  typeBucket: string
  typeSub: string | null
  defaultBranch: string
}

export default function DownloadDropdown({ owner, name, typeBucket, typeSub, defaultBranch }: Props) {
  const [open, setOpen] = useState(false)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({})
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [folders, setFolders] = useState<string[] | null>(null)
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [folderExpanded, setFolderExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const options = getDownloadOptions(typeBucket, typeSub)

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setFolderExpanded(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setFolderExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function setItem(id: string, state: ItemState, error?: string) {
    setItemStates(prev => ({ ...prev, [id]: state }))
    if (error) setItemErrors(prev => ({ ...prev, [id]: error }))
    if (state === 'done') setTimeout(() => setItemStates(prev => ({ ...prev, [id]: 'idle' })), 2000)
    if (state === 'error') setTimeout(() => setItemStates(prev => ({ ...prev, [id]: 'idle' })), 3000)
  }

  async function handleAction(option: DownloadOption) {
    try {
      setItem(option.id, 'loading')
      switch (option.id) {
        case 'zip':
          await window.api.download.repoZip(owner, name)
          break
        case 'epub':
          await window.api.download.repoConverted(owner, name, 'epub')
          break
        case 'pdf':
          await window.api.download.repoConverted(owner, name, 'pdf')
          break
        case 'docx':
          await window.api.download.repoConverted(owner, name, 'docx')
          break
        case 'bookmarks':
          await window.api.download.bookmarks(owner, name)
          break
        case 'clone':
          await navigator.clipboard.writeText(`git clone https://github.com/${owner}/${name}.git`)
          break
        case 'folder':
          // Handled separately
          return
      }
      setItem(option.id, 'done')
      if (option.id !== 'clone') setOpen(false)
    } catch (err) {
      setItem(option.id, 'error', err instanceof Error ? err.message : 'Failed')
    }
  }

  async function handleFolderToggle() {
    if (folderExpanded) {
      setFolderExpanded(false)
      return
    }
    setFolderExpanded(true)
    if (folders) return
    setFoldersLoading(true)
    try {
      const result = await window.api.download.topLevelFolders(owner, name)
      setFolders(result)
    } catch {
      setFolders([])
    } finally {
      setFoldersLoading(false)
    }
  }

  async function handleFolderDownload(folderPath: string) {
    setItem('folder', 'loading')
    try {
      await window.api.download.rawFolder({ owner, name, branch: defaultBranch, path: folderPath })
      setItem('folder', 'done')
      setOpen(false)
      setFolderExpanded(false)
    } catch (err) {
      setItem('folder', 'error', err instanceof Error ? err.message : 'Failed')
    }
  }

  // Determine button icon from most recent state
  const anyLoading = Object.values(itemStates).some(s => s === 'loading')
  const lastDone = Object.values(itemStates).some(s => s === 'done')
  const lastError = Object.values(itemStates).some(s => s === 'error')

  return (
    <div className="dl-dropdown" ref={ref}>
      <button
        className={`btn-download-repo${anyLoading ? ' downloading' : lastDone ? ' complete' : lastError ? ' error' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title="Download"
      >
        {anyLoading ? <Loader2 size={14} className="spin" /> :
         lastDone ? <Check size={14} /> :
         lastError ? <X size={14} /> :
         <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="dl-dropdown__menu">
          {options.filter(o => o.id !== 'folder').map(option => {
            const Icon = ICON_MAP[option.icon]
            const state = itemStates[option.id] ?? 'idle'
            return (
              <button
                key={option.id}
                className={`dl-dropdown__item${option.isDefault ? ' dl-dropdown__item--default' : ''}`}
                onClick={() => handleAction(option)}
                disabled={state === 'loading'}
                title={state === 'error' ? itemErrors[option.id] ?? 'Failed' : undefined}
              >
                {state === 'loading' ? <Loader2 size={14} className="spin" /> :
                 state === 'done' ? <Check size={14} /> :
                 state === 'error' ? <X size={14} /> :
                 Icon ? <Icon size={14} /> : null}
                <span>{option.label}</span>
              </button>
            )
          })}

          <div className="dl-dropdown__divider" />

          {/* Folder picker */}
          <button
            className="dl-dropdown__item"
            onClick={handleFolderToggle}
          >
            <FolderDown size={14} />
            <span>Download folder{'\u2026'}</span>
          </button>

          {folderExpanded && (
            <div className="dl-dropdown__folders">
              {foldersLoading && <div className="dl-dropdown__loading"><Loader2 size={14} className="spin" /> Loading…</div>}
              {folders && folders.length === 0 && <div className="dl-dropdown__empty">No folders</div>}
              {folders && folders.map(f => (
                <button
                  key={f}
                  className="dl-dropdown__folder-item"
                  onClick={() => handleFolderDownload(f)}
                >
                  <FolderDown size={12} />
                  <span>{f}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run component tests**

Run: `npx vitest run src/components/DownloadDropdown.test.tsx`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/DownloadDropdown.tsx
git commit -m "feat(download): implement DownloadDropdown component"
```

---

## Task 9: Styles for the dropdown

**Files:**
- Modify: `src/styles/globals.css:3778+` (near existing download button styles)

- [ ] **Step 1: Add dropdown styles**

Add after the existing `.btn-download-repo` styles (~line 3814):

Use the project's actual CSS variables (defined in `:root` of `globals.css`): `--bg2`, `--bg3`, `--bg4` for backgrounds; `--border`, `--border2` for borders; `--t1`, `--t2`, `--t3` for text; `--accent-soft`, `--accent-hover` for highlights. Do NOT use `--bg-secondary`, `--text-primary`, etc. — those don't exist.

Note: `@keyframes spin` already exists at line 5470 of `globals.css` — reuse it, don't add a duplicate. Add a `.spin` utility class if one doesn't already exist.

```css
/* ── Download Dropdown ── */

.dl-dropdown {
  position: relative;
  display: inline-block;
}

.dl-dropdown__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 9999;
  min-width: 220px;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: 8px;
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.dl-dropdown__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--t1);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.dl-dropdown__item:hover {
  background: var(--bg3);
}

.dl-dropdown__item:disabled {
  opacity: 0.5;
  cursor: default;
}

.dl-dropdown__item--default {
  font-weight: 600;
  background: var(--accent-soft);
}

.dl-dropdown__item--default:hover {
  background: var(--accent-hover);
}

.dl-dropdown__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--border);
}

.dl-dropdown__folders {
  padding: 2px 0 2px 12px;
}

.dl-dropdown__folder-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 12px;
  background: none;
  border: none;
  color: var(--t3);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.dl-dropdown__folder-item:hover {
  background: var(--bg3);
  color: var(--t1);
}

.dl-dropdown__loading,
.dl-dropdown__empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  color: var(--t3);
  font-size: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(download): add dropdown menu styles"
```

---

## Task 10: Wire `DownloadDropdown` into RepoDetail

**Files:**
- Modify: `src/views/RepoDetail.tsx:1439-1449` (replace download button), `src/views/RepoDetail.tsx:1-10` (add import)

- [ ] **Step 1: Add import for `DownloadDropdown`**

At the top of `src/views/RepoDetail.tsx`, add with the other component imports:

```typescript
import DownloadDropdown from '../components/DownloadDropdown'
```

- [ ] **Step 2: Replace the download button JSX**

Replace lines 1439-1449 (the current download button):

```tsx
<button
  className={`btn-download-repo${downloadState === 'DOWNLOADING' ? ' downloading' : downloadState === 'COMPLETE' ? ' complete' : downloadState === 'ERROR' ? ' error' : ''}`}
  onClick={handleDownload}
  disabled={downloadState === 'DOWNLOADING'}
  title={downloadState === 'ERROR' ? downloadError ?? 'Download failed' : downloadState === 'COMPLETE' ? 'Downloaded!' : 'Download ZIP'}
>
  {downloadState === 'IDLE'        && '↓'}
  {downloadState === 'DOWNLOADING' && '⟳'}
  {downloadState === 'COMPLETE'    && '✓'}
  {downloadState === 'ERROR'       && '✕'}
</button>
```

With:

```tsx
<DownloadDropdown
  owner={owner ?? ''}
  name={name ?? ''}
  typeBucket={typeBucket ?? ''}
  typeSub={repo?.type_sub ?? null}
  defaultBranch={repo?.default_branch ?? 'main'}
/>
```

- [ ] **Step 3: Remove dead code**

The following are no longer needed in `RepoDetail.tsx` since `DownloadDropdown` manages its own state:
- `downloadState` and `downloadError` state declarations (line 457-458)
- `handleDownload` function (lines 817-830)
- `DownloadState` type if it's only used here

Search for other references to these before removing. If they're used elsewhere, leave them.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat(download): replace download button with DownloadDropdown in RepoDetail"
```

---

## Task 11: Manual smoke test

- [ ] **Step 1: Start the app**

Run: `npm run dev` (or the project's dev command)

- [ ] **Step 2: Test with a non-learning repo**

Navigate to any dev-tools or framework repo. Click the download button. Verify:
- Dropdown opens with ZIP (highlighted), Copy clone, Download folder...
- ZIP download works
- Copy clone copies to clipboard
- Download folder... expands and shows folders

- [ ] **Step 3: Test with a learning/book repo**

Navigate to or discover a learning/book repo. Click download. Verify:
- ePub is highlighted default at top
- PDF, DOCX, ZIP, clone, folder options all present
- ePub download triggers save dialog

- [ ] **Step 4: Test with a learning/awesome-list repo**

Verify bookmarks option appears and is highlighted.

- [ ] **Step 5: Test edge cases**

- Escape closes dropdown
- Outside click closes dropdown
- Error states show correctly
- Loading spinners appear during download

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(download): address issues found during smoke test"
```
