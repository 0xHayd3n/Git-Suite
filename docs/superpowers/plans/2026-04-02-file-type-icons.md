# File-Type-Specific Icons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic file icons with colored, file-type-specific icons across the file tree, directory listing, and breadcrumb bar.

**Architecture:** A single `FileIcon` component resolves filenames to icons via two-tier lookup (exact filename → extension). It uses `react-icons/si` for brand/language icons and `lucide-react` for utility types, with a fallback to the generic `File` icon. Three consumers swap their current generic icon for `<FileIcon>`.

**Tech Stack:** React 18, TypeScript, react-icons/si (Simple Icons), lucide-react

**Spec:** `docs/superpowers/specs/2026-04-02-file-type-icons-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/FileIcon.tsx` | **Create** | Icon resolution logic: filename → icon component + color |
| `src/components/FileTreePanel.tsx` | **Modify** | Replace `<File>` with `<FileIcon>` for blob entries |
| `src/components/DirectoryListing.tsx` | **Modify** | Replace `<File>` with `<FileIcon>` in listing rows |
| `src/components/BreadcrumbBar.tsx` | **Modify** | Add `<FileIcon>` next to current segment, accept `isDirectory` prop |
| `src/components/FileContentPanel.tsx` | **Modify** | Pass `isDirectory` to BreadcrumbBar |
| `src/styles/globals.css` | **Modify** | Update `.breadcrumb-bar__current` for inline-flex icon layout |

---

### Task 1: Create the FileIcon component

**Files:**
- Create: `src/components/FileIcon.tsx`

This is the core component. It contains:
1. A `FILENAME_ICONS` map for exact filename matches (case-sensitive)
2. An `EXTENSION_ICONS` map for extension matches (case-insensitive)
3. The `FileIcon` component that resolves and renders the icon

- [ ] **Step 1: Create FileIcon.tsx with the full icon mapping and component**

```tsx
// src/components/FileIcon.tsx
import type { ComponentType } from 'react'
import {
  SiJavascript, SiTypescript, SiPython, SiRust, SiGo, SiRuby, SiPhp,
  SiKotlin, SiSwift, SiC, SiCplusplus, SiCss, SiHtml5,
  SiVuedotjs, SiSvelte, SiLua, SiZig, SiElixir, SiHaskell, SiDart,
  SiGnubash, SiDocker, SiR, SiScala, SiClojure, SiErlang, SiJulia,
  SiOcaml, SiSolidity, SiCoffeescript, SiElm,
  SiGit, SiNodedotjs, SiEslint, SiPrettier, SiVite, SiWebpack,
  SiRollupdotjs, SiBabel, SiJest, SiVitest, SiYarn, SiPnpm,
} from 'react-icons/si'
import {
  File, Scale, Settings, Lock, Braces, FileCode, Code, BookOpen,
  Database, GitBranch, Image, Play, Music, Archive, FileDiff,
  FileText, Table, Coffee, Folder,
} from 'lucide-react'

type IconDef = {
  icon: ComponentType<{ size?: number; color?: string }>
  color: string
}

// ── Exact filename matches (case-sensitive) ──────────────────────────
const FILENAME_ICONS: Record<string, IconDef> = {
  'Dockerfile':        { icon: SiDocker,     color: '#0ea5e9' },
  '.dockerignore':     { icon: SiDocker,     color: '#0ea5e9' },
  '.gitignore':        { icon: SiGit,        color: '#f97316' },
  '.gitattributes':    { icon: SiGit,        color: '#f97316' },
  '.gitmodules':       { icon: SiGit,        color: '#f97316' },
  'LICENSE':           { icon: Scale,        color: '#9ca3af' },
  'LICENSE.md':        { icon: Scale,        color: '#9ca3af' },
  'Makefile':          { icon: Settings,     color: '#9ca3af' },
  '.env':              { icon: Lock,         color: '#f59e0b' },
  '.env.local':        { icon: Lock,         color: '#f59e0b' },
  '.env.example':      { icon: Lock,         color: '#f59e0b' },
  'package.json':      { icon: SiNodedotjs,  color: '#16a34a' },
  'package-lock.json': { icon: SiNodedotjs,  color: '#16a34a' },
  'tsconfig.json':     { icon: SiTypescript,  color: '#3178c6' },
  '.eslintrc.json':    { icon: SiEslint,     color: '#4b32c3' },
  '.eslintrc.js':      { icon: SiEslint,     color: '#4b32c3' },
  '.prettierrc':       { icon: SiPrettier,   color: '#f7b93e' },
  '.prettierrc.json':  { icon: SiPrettier,   color: '#f7b93e' },
  'vite.config.ts':    { icon: SiVite,       color: '#646cff' },
  'vite.config.js':    { icon: SiVite,       color: '#646cff' },
  'webpack.config.js': { icon: SiWebpack,    color: '#8dd6f9' },
  'rollup.config.js':  { icon: SiRollupdotjs,color: '#ec4a3f' },
  '.babelrc':          { icon: SiBabel,      color: '#f5da55' },
  'babel.config.js':   { icon: SiBabel,      color: '#f5da55' },
  'jest.config.ts':    { icon: SiJest,       color: '#c21325' },
  'jest.config.js':    { icon: SiJest,       color: '#c21325' },
  'vitest.config.ts':  { icon: SiVitest,     color: '#6e9f18' },
  'yarn.lock':         { icon: SiYarn,       color: '#2c8ebb' },
  'pnpm-lock.yaml':    { icon: SiPnpm,       color: '#f69220' },
}

// ── Extension matches (keys are lowercase, no dot) ───────────────────
const EXTENSION_ICONS: Record<string, IconDef> = {
  // JavaScript / TypeScript
  js:   { icon: SiJavascript, color: '#ca8a04' },
  mjs:  { icon: SiJavascript, color: '#ca8a04' },
  cjs:  { icon: SiJavascript, color: '#ca8a04' },
  jsx:  { icon: SiJavascript, color: '#ca8a04' },
  ts:   { icon: SiTypescript,  color: '#3178c6' },
  mts:  { icon: SiTypescript,  color: '#3178c6' },
  cts:  { icon: SiTypescript,  color: '#3178c6' },
  tsx:  { icon: SiTypescript,  color: '#3178c6' },
  // Python
  py:   { icon: SiPython,     color: '#2563eb' },
  pyw:  { icon: SiPython,     color: '#2563eb' },
  // Systems
  rs:   { icon: SiRust,       color: '#b45309' },
  go:   { icon: SiGo,         color: '#16a34a' },
  c:    { icon: SiC,          color: '#2563eb' },
  h:    { icon: SiC,          color: '#2563eb' },
  cpp:  { icon: SiCplusplus,  color: '#7c3aed' },
  hpp:  { icon: SiCplusplus,  color: '#7c3aed' },
  cc:   { icon: SiCplusplus,  color: '#7c3aed' },
  cxx:  { icon: SiCplusplus,  color: '#7c3aed' },
  // JVM
  java: { icon: Coffee,       color: '#dc2626' },
  kt:   { icon: SiKotlin,     color: '#7c3aed' },
  kts:  { icon: SiKotlin,     color: '#7c3aed' },
  scala:{ icon: SiScala,      color: '#dc2626' },
  // Mobile
  swift:{ icon: SiSwift,      color: '#f97316' },
  dart: { icon: SiDart,       color: '#0ea5e9' },
  // Web
  rb:   { icon: SiRuby,       color: '#dc2626' },
  php:  { icon: SiPhp,        color: '#6d28d9' },
  css:  { icon: SiCss,        color: '#3b82f6' },
  scss: { icon: SiCss,        color: '#3b82f6' },
  sass: { icon: SiCss,        color: '#3b82f6' },
  less: { icon: SiCss,        color: '#3b82f6' },
  html: { icon: SiHtml5,      color: '#f97316' },
  htm:  { icon: SiHtml5,      color: '#f97316' },
  vue:  { icon: SiVuedotjs,   color: '#16a34a' },
  svelte:{ icon: SiSvelte,    color: '#f97316' },
  // Functional
  hs:   { icon: SiHaskell,    color: '#5b21b6' },
  ex:   { icon: SiElixir,     color: '#7c3aed' },
  exs:  { icon: SiElixir,     color: '#7c3aed' },
  elm:  { icon: SiElm,        color: '#0ea5e9' },
  clj:  { icon: SiClojure,    color: '#16a34a' },
  cljs: { icon: SiClojure,    color: '#16a34a' },
  erl:  { icon: SiErlang,     color: '#dc2626' },
  ml:   { icon: SiOcaml,      color: '#f97316' },
  mli:  { icon: SiOcaml,      color: '#f97316' },
  jl:   { icon: SiJulia,      color: '#7c3aed' },
  // Other languages
  lua:  { icon: SiLua,        color: '#2563eb' },
  zig:  { icon: SiZig,        color: '#f59e0b' },
  r:    { icon: SiR,          color: '#2563eb' },
  sol:  { icon: SiSolidity,   color: '#6d28d9' },
  coffee:{ icon: SiCoffeescript, color: '#b45309' },
  // Shell
  sh:   { icon: SiGnubash,    color: '#16a34a' },
  bash: { icon: SiGnubash,    color: '#16a34a' },
  zsh:  { icon: SiGnubash,    color: '#16a34a' },
  dockerfile: { icon: SiDocker, color: '#0ea5e9' },
  // Data / Config
  json: { icon: Braces,       color: '#ca8a04' },
  jsonc:{ icon: Braces,       color: '#ca8a04' },
  yaml: { icon: FileCode,     color: '#e879f9' },
  yml:  { icon: FileCode,     color: '#e879f9' },
  toml: { icon: FileCode,     color: '#9ca3af' },
  xml:  { icon: Code,         color: '#f97316' },
  svg:  { icon: Code,         color: '#f97316' },
  sql:  { icon: Database,     color: '#3b82f6' },
  graphql: { icon: GitBranch, color: '#e535ab' },
  gql:  { icon: GitBranch,    color: '#e535ab' },
  csv:  { icon: Table,        color: '#16a34a' },
  tsv:  { icon: Table,        color: '#16a34a' },
  // Docs
  md:   { icon: BookOpen,     color: '#3b82f6' },
  mdx:  { icon: BookOpen,     color: '#3b82f6' },
  markdown: { icon: BookOpen,  color: '#3b82f6' },
  txt:  { icon: FileText,     color: '#9ca3af' },
  text: { icon: FileText,     color: '#9ca3af' },
  log:  { icon: FileText,     color: '#9ca3af' },
  pdf:  { icon: FileText,     color: '#dc2626' },
  // Media
  png:  { icon: Image,        color: '#16a34a' },
  jpg:  { icon: Image,        color: '#16a34a' },
  jpeg: { icon: Image,        color: '#16a34a' },
  gif:  { icon: Image,        color: '#16a34a' },
  webp: { icon: Image,        color: '#16a34a' },
  ico:  { icon: Image,        color: '#16a34a' },
  bmp:  { icon: Image,        color: '#16a34a' },
  mp4:  { icon: Play,         color: '#f97316' },
  webm: { icon: Play,         color: '#f97316' },
  mov:  { icon: Play,         color: '#f97316' },
  ogg:  { icon: Play,         color: '#f97316' },
  mp3:  { icon: Music,        color: '#7c3aed' },
  wav:  { icon: Music,        color: '#7c3aed' },
  flac: { icon: Music,        color: '#7c3aed' },
  aac:  { icon: Music,        color: '#7c3aed' },
  // Archives
  zip:  { icon: Archive,      color: '#9ca3af' },
  tar:  { icon: Archive,      color: '#9ca3af' },
  gz:   { icon: Archive,      color: '#9ca3af' },
  rar:  { icon: Archive,      color: '#9ca3af' },
  '7z': { icon: Archive,      color: '#9ca3af' },
  // Misc
  lock: { icon: Lock,         color: '#9ca3af' },
  diff: { icon: FileDiff,     color: '#f59e0b' },
  patch:{ icon: FileDiff,     color: '#f59e0b' },
}

const FALLBACK: IconDef = { icon: File, color: '#6b6b80' }

function resolveIcon(filename: string): IconDef {
  // 1. Exact filename match (case-sensitive)
  const filenameMatch = FILENAME_ICONS[filename]
  if (filenameMatch) return filenameMatch

  // 2. Extension match (case-insensitive)
  const dotIdx = filename.lastIndexOf('.')
  if (dotIdx > 0) {
    const ext = filename.slice(dotIdx + 1).toLowerCase()
    const extMatch = EXTENSION_ICONS[ext]
    if (extMatch) return extMatch
  }

  // 3. Fallback
  return FALLBACK
}

interface FileIconProps {
  filename: string    // basename only, e.g. "index.ts"
  size?: number       // defaults to 14
  className?: string  // forwarded to wrapper span
}

export default function FileIcon({ filename, size = 14, className }: FileIconProps) {
  const { icon: Icon, color } = resolveIcon(filename)
  return (
    <span className={className} style={{ display: 'inline-flex', flexShrink: 0 }}>
      <Icon size={size} color={color} />
    </span>
  )
}

/** Export for BreadcrumbBar to render folder icon */
export { Folder }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to FileIcon.tsx

- [ ] **Step 3: Commit**

```bash
git add src/components/FileIcon.tsx
git commit -m "feat(files): create FileIcon component with file-type icon resolution"
```

---

### Task 2: Integrate FileIcon into FileTreePanel

**Files:**
- Modify: `src/components/FileTreePanel.tsx` (line 2 imports, line 109 icon render)

- [ ] **Step 1: Replace File import with FileIcon import**

In `src/components/FileTreePanel.tsx`, change line 2:

```tsx
// Before:
import { ChevronRight, Folder, File } from 'lucide-react'

// After:
import { ChevronRight, Folder } from 'lucide-react'
import FileIcon from './FileIcon'
```

- [ ] **Step 2: Replace File icon usage with FileIcon**

In `src/components/FileTreePanel.tsx`, change line 109:

```tsx
// Before:
<File size={14} className="file-tree__icon file-tree__icon--file" />

// After:
<FileIcon filename={entry.path} size={14} className="file-tree__icon" />
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `npx tsc --noEmit`
Expected: No errors. Launch the app and open the Files tab — file icons should now be colorful per type. Folder icons should remain unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/FileTreePanel.tsx
git commit -m "feat(files): use FileIcon in file tree panel"
```

---

### Task 3: Integrate FileIcon into DirectoryListing

**Files:**
- Modify: `src/components/DirectoryListing.tsx` (line 1 imports, line 47 icon render)

- [ ] **Step 1: Replace File import with FileIcon import**

In `src/components/DirectoryListing.tsx`, change the imports:

```tsx
// Before:
import { Folder, File, Image as ImageIcon, FileQuestion, Play } from 'lucide-react'

// After:
import { Folder, Image as ImageIcon, FileQuestion, Play } from 'lucide-react'
import FileIcon from './FileIcon'
```

`File` is no longer needed — it's not used by `ImagePreview`, `VideoPlayer`, or `FileMetaView`.

- [ ] **Step 2: Replace File icon usage with FileIcon**

In `src/components/DirectoryListing.tsx`, change line 47 (inside the `sorted.map` render):

```tsx
// Before:
<File size={14} className="dir-listing__icon" />

// After:
<FileIcon filename={entry.path} size={14} className="dir-listing__icon" />
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `npx tsc --noEmit`
Expected: No errors. Navigate to a directory in the Files tab — the directory listing should show colorful file icons.

- [ ] **Step 4: Commit**

```bash
git add src/components/DirectoryListing.tsx
git commit -m "feat(files): use FileIcon in directory listing"
```

---

### Task 4: Integrate FileIcon into BreadcrumbBar

**Files:**
- Modify: `src/components/BreadcrumbBar.tsx` (add icon to current segment)
- Modify: `src/components/FileContentPanel.tsx` (pass `isDirectory` prop)
- Modify: `src/styles/globals.css` (update `.breadcrumb-bar__current`)

This task requires passing an `isDirectory` hint so the breadcrumb only shows `FileIcon` for files and a `Folder` icon for directories.

- [ ] **Step 1: Update BreadcrumbBar to accept and use isDirectory prop**

In `src/components/BreadcrumbBar.tsx`:

```tsx
// Full updated file:
import { useState } from 'react'
import { Clipboard, Check, Folder } from 'lucide-react'
import FileIcon from './FileIcon'

interface Props {
  path: string
  onNavigate: (path: string) => void
  isDirectory?: boolean  // true when viewing a directory, false/undefined for files
}

export default function BreadcrumbBar({ path, onNavigate, isDirectory }: Props) {
  const segments = path.split('/')

  const [copied, setCopied] = useState(false)

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  return (
    <div className="breadcrumb-bar">
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

- [ ] **Step 2: Pass isDirectory from FileContentPanel to BreadcrumbBar**

In `src/components/FileContentPanel.tsx`, update the BreadcrumbBar usage (line 74):

```tsx
// Before:
<BreadcrumbBar path={selectedPath} onNavigate={onNavigateBreadcrumb} />

// After:
<BreadcrumbBar path={selectedPath} onNavigate={onNavigateBreadcrumb} isDirectory={selectedEntry?.type === 'tree'} />
```

- [ ] **Step 3: Update CSS for breadcrumb current segment**

In `src/styles/globals.css`, update the `.breadcrumb-bar__current` rule (around line 1501):

```css
/* Before: */
.breadcrumb-bar__current {
  color: var(--t1);
  font-weight: 500;
}

/* After: */
.breadcrumb-bar__current {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--t1);
  font-weight: 500;
}
```

- [ ] **Step 4: Verify it compiles and renders**

Run: `npx tsc --noEmit`
Expected: No errors. Select a file — its icon should appear in the breadcrumb next to the filename. Select a directory — a folder icon should appear instead.

- [ ] **Step 5: Commit**

```bash
git add src/components/BreadcrumbBar.tsx src/components/FileContentPanel.tsx src/styles/globals.css
git commit -m "feat(files): add file/folder icon to breadcrumb bar current segment"
```

---

### Task 5: Clean up unused CSS

**Files:**
- Modify: `src/styles/globals.css` (line 6465)

The `.file-tree__icon--file` CSS class set `color: var(--t3)` for the old generic file icon. Since `FileIcon` now applies its own inline color, this class is no longer used.

- [ ] **Step 1: Remove the unused rule**

In `src/styles/globals.css`, delete the rule at line 6465:

```css
/* Remove this: */
.file-tree__icon--file {
  color: var(--t3);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "chore: remove unused .file-tree__icon--file CSS rule"
```
