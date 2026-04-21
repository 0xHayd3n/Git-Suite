# Markdown Icons, Smart Folder Icons & Context Menu Download System

**Date:** 2026-04-07
**Status:** Approved

## Overview

Three related changes to the file explorer:

1. Update markdown file icons from `BookOpen` to `FileText`
2. Dynamically show `BookOpen` as the folder icon when a folder contains 2+ markdown files
3. Add a right-click context menu with download/conversion options for all files and folders

## 1. Icon Changes

### Markdown File Icon

- **File:** `src/components/FileIcon.tsx`
- **Change:** Replace `BookOpen` with `FileText` for extensions `.md`, `.mdx`, `.markdown`
- **Color:** Stays `#3b82f6` (blue)
- **Note:** The exact-filename match for `LICENSE.md` (`Scale` icon) takes precedence and is unaffected

### Smart Folder Icons

- **Files:** `src/components/FileTreePanel.tsx`, `src/components/DirectoryListing.tsx`
- **Behavior:** When a folder's children are known and contain 2+ markdown files (`.md`, `.mdx`, `.markdown`), render `BookOpen` (blue, `#3b82f6`) instead of the default `Folder` (accent/violet)
- **Fallback:** Collapsed/unfetched folders show the normal `Folder` icon. The icon upgrades to `BookOpen` once children are loaded and the condition is met
- **Detection:** Count children where `type === 'blob'` and the filename ends with a markdown extension

## 2. Context Menu System

### Component: `ContextMenu`

A new React component (`src/components/ContextMenu.tsx`) that renders as a positioned overlay on right-click.

**Behavior:**
- Triggered via `onContextMenu` on file/folder rows in both `FileTreePanel` and `DirectoryListing`
- Positioned at cursor coordinates, clamped to viewport bounds
- Closes on click-outside, Escape key, or scroll
- Supports nested submenus (hover to open)

### Menu Structure

**Single non-markdown file:**
```
Download
```
Plain download — saves the raw file via Save As dialog.

**Single markdown file:**
```
Download  →  Raw (.md)
              Word (.docx)
              PDF (.pdf)
              ePub (.epub)
```

**Folder:**
```
Download  →  Raw (.zip)
              Word (.docx)    ← only if folder contains markdown files
              PDF (.pdf)      ← only if folder contains markdown files
              ePub (.epub)    ← only if folder contains markdown files
```

- Raw folder download zips all folder contents
- Conversion options only appear if the folder contains at least one markdown file
- Conversion only aggregates the markdown files within the folder (non-markdown files are ignored)
- Markdown files are concatenated in alphabetical order with `---` separators

### State Management

Context menu state (open, position, target item metadata) lives in `FilesTab.tsx` and is passed down to child components. Target item metadata includes: `path`, `type` ('blob' | 'tree'), `hasMarkdown` (boolean, for folders).

**`hasMarkdown` resolution for folders:**
- For expanded folders (children already loaded): computed from loaded tree data
- For collapsed/unfetched folders: defaults to `true` (show all conversion options). If the download service finds no markdown files, it shows a brief "No markdown files found" message and aborts gracefully

**Icon threshold vs. conversion threshold:** Smart folder icons require 2+ markdown files (a single `.md` doesn't make a folder "markdown-centric"), while conversion options appear with 1+ markdown files (even a single file can be usefully converted).

## 3. Download Service

### File: `electron/services/downloadService.ts`

A new service in the Electron main process handling all download and conversion logic.

**Responsibilities:**
- Fetch raw file/folder content from GitHub API
- Convert markdown to various formats
- Open native Save As dialog with appropriate file filters
- Write output to the user-chosen path

### Conversion Libraries

| Format | Library | Notes |
|--------|---------|-------|
| Word (.docx) | `html-docx-js` or similar | Render markdown → HTML → docx. Avoids building a full markdown AST-to-docx converter. First iteration supports: headings, paragraphs, bold/italic, code blocks, lists |
| PDF (.pdf) | Electron `printToPDF` | Render markdown to HTML, load into a hidden `BrowserWindow`, call `webContents.printToPDF()`, then destroy the window |
| ePub (.epub) | `epub-gen-memory` | Pure JS. Takes HTML content, produces epub buffer |
| ZIP (.zip) | `jszip` | Pure JS, no native deps. Works in both Node and browser contexts |

### Markdown-to-HTML Pipeline

Since both PDF, ePub, and docx need HTML as an intermediate step, a shared markdown-to-HTML renderer is used. The app already uses `react-markdown` with `remark-gfm` and `remark-emoji` in the renderer. For the main process, use `marked` (or `unified`/`remark`) as a standalone markdown-to-HTML converter since `react-markdown` requires React. This ensures consistent GFM support across formats.

## 4. IPC Layer

### File: `electron/ipc/downloadHandlers.ts`

Follows the existing IPC handler pattern (like `verificationHandlers.ts`). Export a `registerDownloadHandlers()` function, imported and called from `main.ts`.

**Channels:**

| Channel | Params | Description |
|---------|--------|-------------|
| `download:raw-file` | `{ owner, repo, branch, path }` | Download single file raw, open Save As |
| `download:raw-folder` | `{ owner, repo, branch, path }` | Fetch folder contents, zip, open Save As |
| `download:convert` | `{ owner, repo, branch, path, format, isFolder }` | Fetch markdown(s), convert to format, open Save As |

**Format values:** `'docx'`, `'pdf'`, `'epub'`

### Preload Bridge

Add download methods to the existing preload API at `window.api` (matching the existing pattern in `electron/preload.ts`):

- `window.api.download.rawFile(params)`
- `window.api.download.rawFolder(params)`
- `window.api.download.convert(params)`

## 5. Data Flow

```
User right-clicks file/folder
  → ContextMenu opens at cursor position
  → User hovers "Download" → submenu appears
  → User clicks format option
  → Renderer calls window.api.download.*(params)
  → IPC sends to main process
  → downloadService fetches from GitHub API
  → For conversions: markdown → HTML → target format
  → Native Save As dialog opens
  → User picks location → file written to disk
  → Success/error returned to renderer
```

## 6. Scope & Constraints

- **First iteration:** No progress indicators — the Save As dialog appearing signals completion
- **Folder conversion:** Only markdown files are included; other file types are ignored
- **Aggregation order:** Alphabetical by filename
- **Separator:** `---` (horizontal rule) between concatenated markdown files
- **Nested folders:** Conversion handles only immediate children (not recursive). Raw `.zip` download is also immediate-children-only in the first iteration — noted as a known limitation
- **Libraries:** All pure JS / built-in Electron — no external tools like pandoc required
- **API calls:** Folder downloads make N+1 API calls (1 tree + N blobs). For the first iteration, no batching or rate limiting — acceptable for typical folder sizes. Large folders (100+ files) may be slow; consider a file count warning in a future iteration

## 7. Error Handling

- All download/convert operations return promises to the renderer. Failures are rejected promises with a descriptive error message
- **GitHub API errors** (404, rate limit, network failure): Renderer shows a toast notification with the error
- **Conversion failures** (malformed markdown, library errors): Same toast notification pattern
- **Save As cancellation:** Silent no-op — user cancelled, nothing to report
- **No markdown files found** (folder conversion where folder has no `.md` files): Show a brief "No markdown files found in this folder" toast and abort

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/ContextMenu.tsx` | Right-click context menu component |
| `electron/services/downloadService.ts` | Download & conversion logic |
| `electron/ipc/downloadHandlers.ts` | IPC handler registration |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/FileIcon.tsx` | `BookOpen` → `FileText` for markdown extensions |
| `src/components/FileTreePanel.tsx` | Smart folder icons + onContextMenu handler |
| `src/components/DirectoryListing.tsx` | Smart folder icons + onContextMenu handler |
| `src/components/FilesTab.tsx` | Context menu state management, render ContextMenu |
| `electron/preload.ts` (or equivalent) | Expose download IPC methods |
| `electron/main.ts` (or equivalent) | Register download IPC handlers |
| `src/styles/globals.css` | Context menu and submenu styling |
