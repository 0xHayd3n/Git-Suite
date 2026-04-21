# PDF Viewer Design

**Date:** 2026-04-07
**Status:** Approved

## Overview

Add an embedded PDF viewer to the expanded repo file browser, so PDF files render inline instead of falling through to the `FileMetaView` download fallback. Uses Mozilla's PDF.js library for client-side rendering with full interactive features.

## Approach

**PDF.js (pdfjs-dist)** — the industry-standard browser PDF renderer. Renders directly from the base64 blob data already fetched by `FilesTab`. No Electron main process or IPC changes required.

## Architecture

```
FilesTab (fetches blob)
  → blobRawBase64
    → FileContentPanel (detects .pdf)
      → PdfViewer (renders via PDF.js)
```

### Detection Flow

`FileContentPanel` gains an `isPdfFile()` check inserted into its conditional rendering chain after `isVideoFile` and before the `blobLoading` fallback. PDFs are detected by extension (`.pdf`) and routed to the new `PdfViewer` component when `blobRawBase64` is available.

### File Size Handling

The current `handleSelectFile` in `FilesTab` skips blob fetching for files over 1MB. This limit is raised to 50MB specifically for PDF files, which are commonly larger than code files.

The same size-limit fix must also be applied to the `initialPath` navigation effect (`FilesTab.tsx:210`), which has its own 1MB check for deep-linked file URLs.

### Ordering Safety

The PDF check fires before `blobContent === null` and `isBinaryContent` in the conditional chain. This is important because PDFs will have non-null `blobContent` that appears binary — without the early PDF check, they would route to `FileMetaView`. The ordering ensures PDFs are caught first.

## PdfViewer Component

**File:** `src/components/PdfViewer.tsx`

### Props

| Prop   | Type     | Description                        |
|--------|----------|------------------------------------|
| `data` | `string` | Base64-encoded PDF content         |

### Features

- **Virtualized continuous scroll** — renders only visible pages plus a small buffer; pages outside the viewport are destroyed to manage memory. Essential for large PDFs within the 50MB limit
- **Zoom controls** — zoom in, zoom out, reset; percentage display
- **Text layer** — PDF.js text layer overlay enables native text selection and copy
- **Annotation layer** — renders existing highlights, comments, links, and form fields
- **In-document search** — Ctrl+F triggers PDF.js `FindController` with match highlighting, match count, prev/next navigation. The handler is scoped to the PDF viewer container (only active when a PDF is displayed) to avoid conflicts with Electron's built-in find or other app shortcuts
- **Page indicator** — current page (based on scroll position) and total page count
- **Loading state** — spinner while PDF.js parses the document

### Toolbar

```
[Zoom- | 100% | Zoom+]    [Page 3 of 12]    [Search icon]
```

Styled to match the existing `CodeToolbar` component (same height, background, border, font).

## Integration Points

### FileContentPanel.tsx

New conditional branch in the render chain:

```tsx
) : isPdfFile(filename) && blobRawBase64 ? (
  <PdfViewer data={blobRawBase64} />
) : blobLoading ? (
```

The `isPdfFile` helper is defined in `DirectoryListing.tsx` and exported alongside `isImageFile` and `isVideoFile`, since it is needed in both `FileContentPanel` and `FilesTab`.

### FilesTab.tsx

Modify `handleSelectFile` to allow PDFs up to 50MB (current limit is 1MB for all files):

```tsx
const isPdf = fullPath.toLowerCase().endsWith('.pdf')
if (!isPdf && entry.size && entry.size > 1_000_000) {
  pushHistory(fullPath)
  return
}
if (isPdf && entry.size && entry.size > 50_000_000) {
  pushHistory(fullPath)
  return
}
```

Also modify the `initialPath` navigation effect (line ~210) with the same PDF-aware size check.

### No Changes Required

- No IPC handlers — rendering is client-side only
- No Electron main process changes
- No new preload APIs

## Styling

### New Styles (in existing CSS structure)

- **`.pdf-viewer`** — scrollable container filling the content panel
- **`.pdf-viewer__toolbar`** — matches `CodeToolbar` patterns
- **`.pdf-viewer__page`** — wrapper for each page (canvas + text layer + annotation layer)
- **`.pdf-viewer__search`** — search overlay bar with match count and navigation

### PDF.js Layers

Each page consists of three stacked layers:
1. **Canvas** — the rendered page pixels
2. **Text div** — invisible text positioned over canvas for selection
3. **Annotation div** — clickable links, form fields, highlights

Uses a minimal subset of PDF.js text/annotation layer CSS, themed to match the app.

## Dependencies

| Package      | Purpose                          |
|--------------|----------------------------------|
| `pdfjs-dist` | PDF.js official npm distribution |

The PDF.js worker is configured via `pdfjsLib.GlobalWorkerOptions.workerSrc`. In this Electron + Vite environment, the worker `.mjs` file is imported directly from `pdfjs-dist/build/pdf.worker.mjs` — Vite handles the bundling. If bundler issues arise, fall back to copying the worker to the public directory and referencing it by path.

## Error Handling

- **Corrupt PDFs** — if PDF.js fails to parse the document, display a fallback error state with a link to view/download from GitHub (similar to `FileMetaView`)
- **Password-protected PDFs** — show a message that password-protected PDFs are not supported, with a download link
- **Render failures** — individual page render errors are caught per-page; other pages continue to render

## What This Does NOT Include

- PDF export/save — already handled by the existing download service
- Annotation editing — view-only display of existing annotations
- Thumbnail sidebar — not needed per requirements
- Print support — users can download and print externally
