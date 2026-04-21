# File-Type-Specific Icons — Design Spec

## Goal

Replace the generic `File` icon in the file tree, directory listing, and breadcrumb bar with colored, file-type-specific icons so users can visually scan file types at a glance.

## Approach

Create a single `FileIcon` component (`src/components/FileIcon.tsx`) that resolves a filename to the appropriate icon. No new dependencies — uses `react-icons/si` (Simple Icons) for language/brand icons and `lucide-react` for utility/generic file types.

## Component Interface

```tsx
interface FileIconProps {
  filename: string   // basename only, e.g. "index.ts", "Dockerfile", ".gitignore" — NOT a full path
  size?: number      // defaults to 14
  className?: string // optional, forwarded to the icon wrapper for spacing/margin
}

export default function FileIcon({ filename, size = 14, className }: FileIconProps)
```

The `filename` prop must be a **basename** (e.g. `"index.ts"`), not a full path (e.g. `"src/components/index.ts"`). The exact-filename matching table depends on matching against just the basename.

Returns a React element — either an SI brand icon with its brand color, a lucide icon with a semantic color, or the fallback lucide `File` icon. The `className` prop is forwarded to a wrapping `<span>` so consumers can apply spacing classes.

## Icon Resolution Order

### 1. Exact Filename Match (highest priority)

| Filename | Icon | Color | Source |
|----------|------|-------|--------|
| `Dockerfile` | SiDocker | #0ea5e9 | react-icons/si |
| `.dockerignore` | SiDocker | #0ea5e9 | react-icons/si |
| `.gitignore` | SiGit | #f97316 | react-icons/si |
| `.gitattributes` | SiGit | #f97316 | react-icons/si |
| `.gitmodules` | SiGit | #f97316 | react-icons/si |
| `LICENSE` | Scale | #9ca3af | lucide-react |
| `LICENSE.md` | Scale | #9ca3af | lucide-react |
| `Makefile` | Settings | #9ca3af | lucide-react |
| `.env` | Lock | #f59e0b | lucide-react |
| `.env.local` | Lock | #f59e0b | lucide-react |
| `.env.example` | Lock | #f59e0b | lucide-react |
| `package.json` | SiNodedotjs | #16a34a | react-icons/si |
| `package-lock.json` | SiNodedotjs | #16a34a | react-icons/si |
| `tsconfig.json` | SiTypescript | #3178c6 | react-icons/si |
| `.eslintrc.json` | SiEslint | #4b32c3 | react-icons/si |
| `.eslintrc.js` | SiEslint | #4b32c3 | react-icons/si |
| `.prettierrc` | SiPrettier | #f7b93e | react-icons/si |
| `.prettierrc.json` | SiPrettier | #f7b93e | react-icons/si |
| `vite.config.ts` | SiVite | #646cff | react-icons/si |
| `vite.config.js` | SiVite | #646cff | react-icons/si |
| `webpack.config.js` | SiWebpack | #8dd6f9 | react-icons/si |
| `rollup.config.js` | SiRollupdotjs | #ec4a3f | react-icons/si |
| `.babelrc` | SiBabel | #f5da55 | react-icons/si |
| `babel.config.js` | SiBabel | #f5da55 | react-icons/si |
| `jest.config.ts` | SiJest | #c21325 | react-icons/si |
| `jest.config.js` | SiJest | #c21325 | react-icons/si |
| `vitest.config.ts` | SiVitest | #6e9f18 | react-icons/si |
| `yarn.lock` | SiYarn | #2c8ebb | react-icons/si |
| `pnpm-lock.yaml` | SiPnpm | #f69220 | react-icons/si |

### 2. Extension Match

#### Language/Brand Icons (react-icons/si)

| Extension(s) | Icon | Color |
|-------------|------|-------|
| `.js`, `.mjs`, `.cjs` | SiJavascript | #ca8a04 |
| `.jsx` | SiJavascript | #ca8a04 |
| `.ts`, `.mts`, `.cts` | SiTypescript | #3178c6 |
| `.tsx` | SiTypescript | #3178c6 |
| `.py`, `.pyw` | SiPython | #2563eb |
| `.rs` | SiRust | #b45309 |
| `.go` | SiGo | #16a34a |
| `.rb` | SiRuby | #dc2626 |
| `.php` | SiPhp | #6d28d9 |
| `.kt`, `.kts` | SiKotlin | #7c3aed |
| `.swift` | SiSwift | #f97316 |
| `.c`, `.h` | SiC | #2563eb |
| `.cpp`, `.hpp`, `.cc`, `.cxx` | SiCplusplus | #7c3aed |
| `.css`, `.scss`, `.sass`, `.less` | SiCss | #3b82f6 |
| `.html`, `.htm` | SiHtml5 | #f97316 |
| `.vue` | SiVuedotjs | #16a34a |
| `.svelte` | SiSvelte | #f97316 |
| `.lua` | SiLua | #2563eb |
| `.zig` | SiZig | #f59e0b |
| `.ex`, `.exs` | SiElixir | #7c3aed |
| `.hs` | SiHaskell | #5b21b6 |
| `.dart` | SiDart | #0ea5e9 |
| `.sh`, `.bash`, `.zsh` | SiGnubash | #16a34a |
| `.dockerfile` | SiDocker | #0ea5e9 |
| `.r` | SiR | #2563eb |
| `.scala` | SiScala | #dc2626 |
| `.clj`, `.cljs` | SiClojure | #16a34a |
| `.erl` | SiErlang | #dc2626 |
| `.jl` | SiJulia | #7c3aed |
| `.ml`, `.mli` | SiOcaml | #f97316 |
| `.sol` | SiSolidity | #6d28d9 |
| `.coffee` | SiCoffeescript | #b45309 |
| `.elm` | SiElm | #0ea5e9 |

#### Utility Icons (lucide-react)

| Extension(s) | Icon | Color |
|-------------|------|-------|
| `.json`, `.jsonc` | Braces | #ca8a04 |
| `.yaml`, `.yml` | FileCode | #e879f9 |
| `.toml` | FileCode | #9ca3af |
| `.xml` | Code | #f97316 |
| `.svg` | Code | #f97316 |
| `.md`, `.mdx`, `.markdown` | BookOpen | #3b82f6 |
| `.sql` | Database | #3b82f6 |
| `.graphql`, `.gql` | GitBranch | #e535ab |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.ico`, `.bmp` | Image | #16a34a |
| `.mp4`, `.webm`, `.mov`, `.ogg` | Play | #f97316 |
| `.mp3`, `.wav`, `.flac`, `.aac` | Music | #7c3aed |
| `.zip`, `.tar`, `.gz`, `.rar`, `.7z` | Archive | #9ca3af |
| `.lock` | Lock | #9ca3af |
| `.diff`, `.patch` | FileDiff | #f59e0b |
| `.txt`, `.text` | FileText | #9ca3af |
| `.log` | FileText | #9ca3af |
| `.pdf` | FileText | #dc2626 |
| `.csv`, `.tsv` | Table | #16a34a |
| `.java` | Coffee | #dc2626 |

### 3. Fallback

Any file not matched by filename or extension gets the lucide `File` icon in `#6b6b80` (muted gray).

## Consumers

### FileTreePanel (`src/components/FileTreePanel.tsx`)

Replace:
```tsx
<File size={14} className="file-tree__icon file-tree__icon--file" />
```
With:
```tsx
<FileIcon filename={entry.path} size={14} className="file-tree__icon" />
```

The `file-tree__icon--file` class can be dropped since color is now set per-icon. The `file-tree__icon` margin/spacing class is passed via `className`.

### DirectoryListing (`src/components/DirectoryListing.tsx`)

Replace the generic `File` icon in the directory listing rows only:
```tsx
<File size={14} className="dir-listing__icon" />
```
With:
```tsx
<FileIcon filename={entry.path} size={14} className="dir-listing__icon" />
```

Note: The `File` import may still be needed if other sub-components (`ImagePreview`, `VideoPlayer`, `FileMetaView`) reference it. If not, it can be removed.

### BreadcrumbBar (`src/components/BreadcrumbBar.tsx`)

Add the file icon next to the final (current) segment. The breadcrumb's last segment can be either a file or a directory — only show `FileIcon` when it's a file (not a directory). This requires passing an `isDirectory` or `selectedType` hint to BreadcrumbBar.

If the last segment is a file:
```tsx
<span className="breadcrumb-bar__current">
  <FileIcon filename={segment} size={13} />
  {segment}
</span>
```

If the last segment is a directory, keep the current text-only rendering (or optionally show the lucide `Folder` icon).

CSS addition for the current segment:
```css
.breadcrumb-bar__current {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
```

## File Structure

| File | Action |
|------|--------|
| `src/components/FileIcon.tsx` | **Create** — icon resolution logic and component |
| `src/components/FileTreePanel.tsx` | **Modify** — swap File → FileIcon |
| `src/components/DirectoryListing.tsx` | **Modify** — swap File → FileIcon |
| `src/components/BreadcrumbBar.tsx` | **Modify** — add FileIcon to current segment |
| `src/styles/globals.css` | **Modify** — minor spacing for breadcrumb icon |

## What Does NOT Change

- Folder icons remain lucide `Folder` — unchanged
- No new npm dependencies
- No changes to the icon sizing system (all icons accept `size` prop)
- The existing `LanguageIcon` component is unrelated (used for repo language badges) and is not touched

## Edge Cases

- **Dotfiles with no extension** (`.gitignore`, `.env`) — handled by exact filename match
- **Compound extensions** (`.test.ts`, `.config.js`) — matched by the final extension (`.ts`, `.js`); special filenames like `vite.config.ts` caught first by exact match
- **Case sensitivity** — filename match is case-sensitive (Unix convention); extension match is case-insensitive
- **Unknown extensions** — fallback to generic File icon
