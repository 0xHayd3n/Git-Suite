# Context-Aware Download Menu

**Date:** 2026-04-08
**Status:** Draft

## Overview

Replace the single "Download ZIP" button on the RepoDetail page with a context-aware dropdown menu that offers format-appropriate download options based on the repo's `type_bucket` and `type_sub` classification. The smart default is visually highlighted at the top of the menu.

## Motivation

Git Suite categorizes repos into 8 buckets with 89 sub-types, but the download experience is one-size-fits-all (ZIP). A "book" repo and a "framework" repo have fundamentally different user intents when downloading. Learning-oriented repos (books, tutorials, cheatsheets) are best consumed as ePub/PDF, while code repos are best as ZIP. The conversion backend already exists for individual files/folders — this feature surfaces it at the repo level.

## Design Decisions

- **Dropdown with highlighted default** (not a split button): clicking the download button always opens the menu, with the smart default bolded at top. Two clicks for any action, but clearer and simpler.
- **Inline tree picker** for selective folder download: the "Download folder..." menu item expands inline to show top-level directories.
- **Copy clone command** available for all repo types (not just code buckets).
- **Netscape HTML bookmark format** for awesome-list export (universally importable by browsers).

## Menu Structure by Bucket

| Bucket / Sub-type | Highlighted Default | Other Options |
|---|---|---|
| `learning/book` | ePub | PDF, DOCX, ZIP, Copy clone, Download folder... |
| `learning/tutorial`, `learning/course` | PDF | ePub, DOCX, ZIP, Copy clone, Download folder... |
| `learning/cheatsheet`, `learning/interview-prep`, `learning/research-paper` | PDF | DOCX, ZIP, Copy clone, Download folder... |
| `learning/awesome-list` | Bookmarks (.html) | PDF, ZIP, Copy clone, Download folder... |
| `learning/roadmap`, `learning/coding-challenge` | ZIP | PDF, Copy clone, Download folder... |
| All non-learning buckets | ZIP | Copy clone, Download folder... |

### Always-Present Items
- **Download as ZIP** — full repo zipball from GitHub API
- **Copy clone command** — copies `git clone https://github.com/{owner}/{name}.git` to clipboard
- **Download folder...** — expands inline tree picker for selective folder download

### Conditionally-Present Items (learning bucket only)
- Download as ePub (book, tutorial, course)
- Download as PDF (all learning sub-types)
- Download as DOCX (book, tutorial, course, cheatsheet, interview-prep, research-paper)
- Export as Bookmarks (awesome-list only)

## Backend

### Branch Resolution

All three new backend functions need the repo's default branch. None take `branch` as a parameter — they resolve it internally. A shared helper `getDefaultBranch(token, owner, name)` should be added to `electron/github.ts` that calls the existing `getRepo()` function and returns `repo.default_branch`. This avoids duplicating the fetch and reuses the existing `GitHubRepo` response.

**Note:** `getRepoTree()` currently returns `{ path: string; type: string }[]` but its entries also include `sha` in the raw GitHub API response. Its return type must be expanded to include `sha: string` so that `getBlobBySha()` can be called on the results.

### New: `downloadRepoConverted(owner, name, format)`

Repo-level markdown conversion that stitches all markdown files into a single document.

1. Resolve default branch via `getDefaultBranch()`
2. Fetch full repo tree recursively via `getRepoTree()` (the existing helper in `electron/github.ts` that uses `?recursive=1`)
3. Collect all `.md`/`.mdx`/`.markdown` blob entries
4. Sort: README files first (case-insensitive), then alphabetically by path
5. Fetch each blob's content via `getBlobBySha()`
6. Stitch into single markdown string with `---` separators between files
7. Convert via existing `convertToPdf`/`convertToDocx`/`convertToEpub` helpers

Parameters:
- `owner: string`
- `name: string`
- `format: 'pdf' | 'docx' | 'epub'`

Saves to user-selected location via save dialog (same pattern as existing conversions).

**Error handling:** If `getRepoTree()` throws due to a truncated tree (very large repos), catch the error and show a user-facing dialog: "This repo is too large for full conversion. Use the Files tab to convert individual files or folders."

### New: `exportBookmarks(owner, name)`

Parses all markdown files in the repo for links and generates a Netscape HTML bookmark file.

1. Resolve default branch via `getDefaultBranch()`
2. Fetch full repo tree recursively via `getRepoTree()`
3. Collect all markdown blob entries, fetch content via `getBlobBySha()`
4. Parse each file using the `marked` lexer (already a dependency) to extract tokens — this correctly handles reference-style links, ignores code blocks, and distinguishes images from links
5. Walk tokens: collect `link` tokens (skip `image` tokens). For relative URLs, convert to absolute GitHub URLs (`https://github.com/{owner}/{name}/blob/{branch}/{path}`)
6. Group links by the nearest preceding heading token for folder structure in the bookmark file
7. Generate Netscape bookmark HTML format
8. Save via save dialog with `.html` extension

**Error handling:** Same truncated-tree handling as `downloadRepoConverted`.

### New: `getTopLevelFolders(owner, name)`

Lightweight call returning top-level directory names.

1. Resolve default branch via `getDefaultBranch()`
2. Fetch branch metadata via `getBranch(token, owner, name, defaultBranch)` to obtain `rootTreeSha`
3. Get root tree via `getTreeBySha(token, owner, name, rootTreeSha)` (non-recursive)
4. Filter to `type === 'tree'` entries
5. Return `string[]` of directory names

### New IPC Handlers

Register in `downloadHandlers.ts`:
- `download:repoConverted` → `downloadRepoConverted(owner, name, format)`
- `download:bookmarks` → `exportBookmarks(owner, name)`
- `download:topLevelFolders` → `getTopLevelFolders(owner, name)` (returns `string[]`)

### Existing (unchanged)
- `download:repoZip` — full repo ZIP
- `download:rawFile` — single file download
- `download:rawFolder` — folder as ZIP
- `download:convert` — single file/folder markdown conversion

## Preload / API Bridge

New methods on `window.api.download`:

```typescript
repoConverted(owner: string, name: string, format: 'pdf' | 'docx' | 'epub'): Promise<void>
bookmarks(owner: string, name: string): Promise<void>
topLevelFolders(owner: string, name: string): Promise<string[]>
```

Copy clone command uses `navigator.clipboard.writeText()` directly — no IPC needed.

## Frontend

### `DownloadDropdown` Component

New component replacing the current download button in `RepoDetail.tsx`.

**Props:**
- `owner: string`
- `name: string`
- `typeBucket: string`
- `typeSub: string | null` — when null, falls through to bucket-level default (ZIP)
- `defaultBranch: string` — needed for the folder picker's `rawFolder` call

**Behavior:**
- Renders a button matching the current `↓` button styling
- On click, opens a positioned dropdown menu below the button
- Dropdown closes on: outside click, Escape key, or selecting an action
- Each menu item can independently be in IDLE/DOWNLOADING/COMPLETE/ERROR state
- On error, the failed item shows an error icon and the error message appears as a tooltip (same pattern as current button's `title` attribute)
- Main button icon reflects the most recent action state (spinner while downloading, checkmark on success)

**Menu rendering:**
1. `getDownloadOptions(typeBucket, typeSub)` utility returns ordered array: `{ id, label, icon, isDefault }`
2. Default option renders bold with subtle accent background (bucket color)
3. Divider after format options
4. "Copy clone command" with clipboard icon
5. Divider
6. "Download folder..." as last item

### `getDownloadOptions` Utility

Pure function mapping `(typeBucket, typeSub)` → menu item array.

```typescript
interface DownloadOption {
  id: 'zip' | 'epub' | 'pdf' | 'docx' | 'bookmarks' | 'clone' | 'folder'
  label: string
  icon: string  // lucide icon name
  isDefault: boolean
}

function getDownloadOptions(typeBucket: string, typeSub: string | null): DownloadOption[]
```

When `typeSub` is null, the function treats the repo as if it were a generic member of its bucket — ZIP default for all buckets including learning.

### Inline Folder Picker

When "Download folder..." is clicked:
1. Fetches top-level folders via `window.api.download.topLevelFolders(owner, name)`
2. Shows loading spinner while fetching
3. Expands inline within the menu to show folder names with folder icons
4. Clicking a folder triggers `window.api.download.rawFolder(...)` for that path
5. Clicking again or pressing Escape collapses back

### Styling

- Follows existing dark theme patterns (same bg, border, text colors as app)
- Menu positioned below button, viewport-clamped
- Default option: subtle accent background using bucket color at low opacity
- Hover states match existing button hover patterns
- Dividers: thin border matching existing separator styles

## Testing

### Unit: `getDownloadOptions`
- Returns ePub as default for `learning/book`
- Returns PDF as default for `learning/tutorial`
- Returns bookmarks as default for `learning/awesome-list`
- Returns ZIP as default for `dev-tools/algorithm`
- Returns ZIP as default for any non-learning bucket
- Always includes ZIP, clone, and folder options
- Default option has `isDefault: true`, all others `false`
- Returns ZIP as default when `typeSub` is null (any bucket)

### Component: `DownloadDropdown`
- Renders button, opens dropdown on click
- Shows correct items for a given bucket type
- Default option is visually highlighted (bold class or accent bg)
- Closes on outside click
- Closes on Escape key
- Copy clone command writes correct URL to clipboard

### Backend
- `exportBookmarks`: given markdown with `[links](urls)`, produces valid Netscape bookmark HTML with correct folder groupings
- `downloadRepoConverted`: collects markdown files, sorts README first, stitches with separators
- `getTopLevelFolders`: returns only top-level tree entries (not blobs, not nested)

## Files to Create/Modify

### New Files
- `src/components/DownloadDropdown.tsx` — dropdown component
- `src/components/DownloadDropdown.test.tsx` — component tests
- `src/lib/getDownloadOptions.ts` — menu option utility
- `src/lib/getDownloadOptions.test.ts` — utility tests

### Modified Files
- `electron/services/downloadService.ts` — add `downloadRepoConverted`, `exportBookmarks`, `getTopLevelFolders`
- `electron/ipc/downloadHandlers.ts` — register 3 new IPC handlers
- `electron/preload.ts` (or equivalent) — expose 3 new methods on `window.api.download`
- `src/views/RepoDetail.tsx` — replace download button with `<DownloadDropdown>`
- `src/styles/globals.css` — dropdown menu styles
