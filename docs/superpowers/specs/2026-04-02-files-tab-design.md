# Files Tab — Repo File Browser Design Spec

## Context

Git Suite is an Electron desktop application (Electron + React + TypeScript + Vite via electron-vite, better-sqlite3) that browses GitHub repositories. The expanded repo view (`RepoDetail.tsx`) has tabs: README, Skills Folder, Releases, Collections, Related, Videos, Posts, Commands, and Components. The README tab renders repository README files with custom markdown rendering via `ReadmeRenderer.tsx`.

This spec adds a **Files** tab — a two-panel file browser for navigating repository contents — and integrates blob link detection into the README tab for internal repo link navigation.

## Data Layer

### GitHub API Functions

Three new functions in `electron/github.ts`:

1. **`getBranch(token, owner, name, branch)`** — `GET /repos/{owner}/{repo}/branches/{branch}`. Returns `{ commitSha, rootTreeSha }` extracted from the response.

2. **`getTree(token, owner, name, treeSha)`** — `GET /repos/{owner}/{repo}/git/trees/{treeSha}`. Returns `TreeEntry[]` where each entry is `{ path, mode, type: 'blob'|'tree', sha, size? }`. No `?recursive=1` — lazy loading per folder.

3. **`getBlob(token, owner, name, blobSha)`** — `GET /repos/{owner}/{repo}/git/blobs/{blobSha}`. Returns `{ content: string, size: number }`. Base64 content is decoded in the main process before sending to the renderer.

### IPC Channels

New channels in `electron/main.ts` and `electron/preload.ts`:

- `github:getBranch` → `(owner, name, branch)` → `{ commitSha, rootTreeSha }`
- `github:getTree` → `(owner, name, treeSha)` → `TreeEntry[]`
- `github:getBlob` → `(owner, name, blobSha)` → `{ content: string, size: number }`

### Caching Strategy

In-memory caches in the main process (Maps keyed by SHA):

- **`treeCache: Map<string, TreeEntry[]>`** — tree SHA → entries. Content-addressed, never stale.
- **`blobCache: Map<string, string>`** — blob SHA → decoded content. Same immutability guarantee.
- **`branchCache: Map<string, { rootTreeSha: string, timestamp: number }>`** — keyed by `owner/name/branch`. TTL of 5 minutes since branches move. Re-fetch if stale on tab open.

No SQLite persistence — in-memory only, resets on app restart.

### Size Guard

Blobs over 1MB: return only metadata (size, sha) and show a "View on GitHub" link. Avoids memory issues and slow transfers.

## Component Architecture

### Tab Registration

Add `'files'` to the `Tab` union type and `ALL_TABS` array in `RepoDetail.tsx`, positioned after README.

### Component Tree

```
FilesTab (owns state, orchestrates panels)
├── FileTreePanel (~220px fixed width, left)
│   └── TreeNode (recursive)
│       ├── folder: icon + chevron + name (type: 'tree')
│       └── file: icon + name (type: 'blob')
└── FileContentPanel (flex remaining, right)
    ├── BreadcrumbBar (path segments, clickable)
    ├── MarkdownViewer (reuses ReadmeRenderer for .md files)
    ├── CodeViewer (syntax-highlighted, read-only)
    ├── DirectoryListing (table of entries when folder selected)
    ├── ImagePreview (for .png, .jpg, .gif, .svg, .webp)
    └── FileMetaView (fallback — name, size, "View on GitHub")
```

### State (local to FilesTab)

```typescript
rootTreeSha: string | null          // resolved on mount
expandedDirs: Map<string, string>   // path → treeSha (tracks open dirs)
selectedPath: string | null         // currently selected file/folder path
selectedEntry: TreeEntry | null     // entry object for the selection
treeData: Map<string, TreeEntry[]>  // treeSha → children (local cache mirror)
blobContent: string | null          // decoded content of selected blob
blobLoading: boolean
treeLoading: Set<string>            // paths currently loading subtrees
```

### Layout

Horizontal flexbox. Tree panel: `width: 220px; flex-shrink: 0` with subtle right border, independent `overflow-y: auto`. Content panel: `flex: 1; overflow-y: auto`. Reuses the `repo-detail-tab-body--full-bleed` class from the Components tab.

### Interaction Flow

1. **Tab opens** → resolve branch → root tree SHA → fetch root tree → populate tree (folders first, then files, alphabetical within each group)
2. **Folder clicked** → if collapsed, fetch subtree by SHA, expand. If expanded, collapse (toggle).
3. **File clicked** → set selected, fetch blob, render in content panel by extension
4. **Breadcrumb segment clicked** → select that directory, show DirectoryListing, expand tree to that level
5. **DirectoryListing file clicked** → same as tree click — select and render

### External Navigation (initialPath prop)

`FilesTab` accepts an `initialPath` prop. When it changes, the component resolves each directory segment (fetching subtrees sequentially), expands all parent directories, selects the target file, and renders its content. Used for README → Files tab navigation.

## Content Rendering

### Markdown Files (`.md`)

Reuses `ReadmeRenderer` directly with same props (`content`, `repoOwner`, `repoName`, `branch`). Adds a new `basePath` prop to `ReadmeRenderer` so relative image/link paths resolve against the file's directory, not repo root.

### Code/Text Files

`CodeViewer` component:

- **Shiki** for syntax highlighting (TextMate grammars, VS Code-quality)
- Dark theme matching app palette (e.g., `vitesse-dark` or `github-dark`)
- Line numbers in muted gutter (separate column)
- Language identifier badge in top-right corner
- Language detection by file extension mapping
- JetBrains Mono font (already loaded)
- Horizontal scroll for long lines, no word wrap
- Shiki loaded lazily on first render; shows plain `<pre>` with monospace text while initializing

### Directory Listing

`DirectoryListing` — clean table when a folder is selected:

- Columns: icon, name, size (blobs only)
- Folders first, then files, alphabetical
- Click navigates to entry
- No commit message column (would require expensive per-file Commits API)

### Image Preview

For `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`: render decoded content as `<img>` with `max-width: 100%; max-height: 600px`. SVGs render inline. Binary images use base64 data URIs.

### Fallback (FileMetaView)

For binaries, PDFs, fonts, etc.: file name, human-readable size, and "View on GitHub" link (`https://github.com/{owner}/{name}/blob/{branch}/{path}`).

## README Tab Integration — Blob Link Detection

### Link Classification

In `ReadmeRenderer`, intercept rendered `<a>` clicks. Three categories:

1. **Anchor links** (`#heading-name`) — same-page scroll, no change
2. **Internal repo links** — two patterns:
   - Relative paths: `./react/README.md`, `../linters/README.md`, `react/README.md`
   - Absolute GitHub URLs: `https://github.com/{owner}/{name}/(blob|tree)/{branch}/{path}` matching the current repo
3. **External URLs** — existing behaviour via URL status bar / external open

### Relative Path Resolution

Uses the `basePath` prop as resolution base. Standard path normalization: split on `/`, resolve `.` (no-op) and `..` (pop parent), rejoin. ~10-line utility function, no external library.

For absolute GitHub URLs: regex parse `https://github.com/{owner}/{name}/(blob|tree)/{branch}/(.+)`. If owner/name match current repo, extract path and treat as internal.

### Inline File Icon

For links classified as internal, append a small inline icon after link text:

- `lucide-react` `FileText` or `File` icon at 14px
- `display: inline; vertical-align: middle; margin-left: 2px`
- Color inherits from link via `currentColor`
- Only on blob links — not anchors, not external URLs
- Implemented as a custom rehype plugin (consistent with existing `rehypeImageClassifier`, `rehypeLinkPreview` patterns)

### Navigation Flow (README → Files tab)

1. `onClick` handler calls `onNavigateToFile(resolvedPath: string)` callback prop
2. `RepoDetail` receives this, calls `setActiveTab('files')` and sets target path
3. `FilesTab` receives updated `initialPath`, triggers expand-and-select sequence
4. Tree expands to reveal target, file is selected and rendered

Scope boundary: link interception only in `ReadmeRenderer`. CodeViewer and DirectoryListing don't get this treatment.

## Loading States

- **Tab open (branch resolution):** Centered spinner matching existing `.spin-ring` pattern
- **Folder expanding:** Small inline spinner replacing chevron on the expanding folder. Other folders remain interactive.
- **Blob loading:** Skeleton shimmer in content area (muted rectangular blocks). Tree remains interactive.
- **Shiki initialization:** Plain `<pre>` monospace text while loading, re-renders with highlighting when ready.

## Error States

- **Branch resolution failure:** Content area shows "Unable to load repository files" with retry button. Tree stays empty.
- **Subtree fetch failure:** Error icon on folder instead of chevron, tooltip "Failed to load — click to retry". Other folders unaffected.
- **Blob fetch failure:** Content panel shows "Unable to load file" with file name and retry. Tree selection persists.
- **Rate limited (403):** Specific message "GitHub API rate limit reached. Try again in X minutes." Parsed from `X-RateLimit-Reset` header.

## Edge Cases

- **Empty repository (no commits):** Branch resolution 404 → "This repository is empty" in content area.
- **Binary files:** For smaller binaries, detect null bytes in first 512 bytes of decoded content. Show FileMetaView instead of garbled text.
- **Deep paths from README links:** Expand-and-select fetches subtrees one level at a time (sequential — each needs parent's tree SHA). Subtle loading state in tree during cascade.
- **No default branch info:** Fall back to `'main'`, then `'master'` if that 404s.
- **Very large directories (1000+ entries):** GitHub Trees API returns all entries (no pagination). Render all; defer virtual scrolling to implementation if sluggish.

## Design Notes

- Dark monochrome theme, consistent with existing app aesthetic
- Tree panel: subtle indentation guides, folder/file type icons (can use Simple Icons / lucide-react), chevron expand/collapse animation
- Breadcrumb bar: `/`-separated segments, each clickable, current file name in stronger weight
- Code viewer: dark background, muted gutter, language badge top-right
- All new CSS classes follow existing BEM-like naming in `globals.css` (e.g., `.files-tab__tree`, `.files-tab__content`)

## Implementation Order

1. Files tab shell — tab registration, two-panel layout with placeholders
2. Tree panel — recursive TreeNode with lazy subtree loading
3. Content panel — markdown (wire up ReadmeRenderer with basePath)
4. Content panel — CodeViewer with Shiki syntax highlighting
5. Content panel — DirectoryListing and fallbacks (ImagePreview, FileMetaView)
6. BreadcrumbBar with clickable navigation
7. README blob link detection — rehype plugin, inline file icons
8. README → Files tab navigation wiring
9. Caching, loading/error states, edge case handling
