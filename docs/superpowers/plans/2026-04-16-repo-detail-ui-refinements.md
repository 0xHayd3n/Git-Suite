# Repo Detail UI Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply four coordinated UI refinements to the expanded repo view — nav bar trim + breadcrumb de-pill, inline Clone options panel (replacing the portal dropdown), Star button restyle with count + gold active state, and sidebar divider removal.

**Architecture:** Changes are scoped to the repo detail view and its direct collaborators. The portal-based `DownloadDropdown` is replaced by an inline `CloneOptionsPanel` rendered through a new `actionRowExtras` slot on `ArticleLayout`. State for the panel lives in `RepoDetail`; the Clone button is the sole toggle. No global state, no new context providers.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + @testing-library/react, Tailwind-less CSS in `src/styles/globals.css`, lucide-react icons.

**Spec:** [docs/superpowers/specs/2026-04-16-repo-detail-ui-refinements-design.md](../specs/2026-04-16-repo-detail-ui-refinements-design.md)

---

## File Structure

**Modify**
- `src/components/NavBar.tsx` — remove Home/Refresh/Forward buttons; replace `/` breadcrumb separators with `ChevronRight`
- `src/components/ArticleLayout.tsx` — add optional `actionRowExtras` prop between action row and tabs
- `src/views/RepoDetail.tsx` — action-row restyle (Clone + Star), `cloneOpen` state, pass panel via `actionRowExtras`, sidebar divider/stars cleanup
- `src/styles/globals.css` — flat breadcrumb band, `ChevronRight` separator styling, Star gold state, `.clone-panel` styles, sidebar section gap, remove `.article-action-btn--starred` and `.dl-dropdown__*` blocks
- `src/components/DownloadDropdown.test.tsx` → `src/components/CloneOptionsPanel.test.tsx` — adapt tests for the new component (controlled `open` prop, no trigger button)

**Create**
- `src/components/CloneOptionsPanel.tsx` — inline panel hosting clone URL tabs, GitHub Desktop action, download items, and download-folder subsection

**Delete (after grep-confirming no remaining callers)**
- `src/components/DownloadDropdown.tsx`

Each task ends with a commit. The final cleanup task is separate so the refactor history stays clean.

---

## Task 1: Nav bar trim + breadcrumb restyle

**Files:**
- Modify: `src/components/NavBar.tsx:157–214`
- Modify: `src/styles/globals.css` — search for `.app-navbar-url-segment`, `.app-navbar-url-sep`, `.app-navbar-btn`

- [ ] **Step 1: Remove Forward, Refresh, and Home buttons from `NavBar.tsx`**

In `NavBar.tsx:171–194`, delete the three `<button className="app-navbar-btn">` elements for Forward (lines 171–181), Refresh (182–189), and Home (190–194). Keep the Back button at 160–170 exactly as-is.

Remaining `<div className="app-navbar-controls">` block should contain only the Back button.

- [ ] **Step 2: Add `ChevronRight` import from lucide-react**

At the top of `NavBar.tsx` (line 3), change:
```ts
import { Folder } from 'lucide-react'
```
to:
```ts
import { Folder, ChevronRight } from 'lucide-react'
```

- [ ] **Step 3: Replace `/` separator with `<ChevronRight>` icon**

In `NavBar.tsx:200–211`, change the breadcrumb rendering from:
```tsx
{segments.map((seg, i) => (
  <span key={i}>
    <span className="app-navbar-url-sep">/</span>
    {seg.onClick ? (
      <button className="app-navbar-url-segment" onClick={seg.onClick}>{seg.icon}{seg.label}</button>
    ) : (
      <span className="app-navbar-url-current">
        {seg.icon}{seg.label}
      </span>
    )}
  </span>
))}
```
to:
```tsx
{segments.map((seg, i) => (
  <span key={i}>
    <ChevronRight size={12} className="app-navbar-url-sep-icon" aria-hidden="true" />
    {seg.onClick ? (
      <button className="app-navbar-url-segment" onClick={seg.onClick}>{seg.icon}{seg.label}</button>
    ) : (
      <span className="app-navbar-url-current">
        {seg.icon}{seg.label}
      </span>
    )}
  </span>
))}
```

- [ ] **Step 4: Update breadcrumb CSS in `globals.css`**

Locate the `.app-navbar-url-segment`, `.app-navbar-url-current`, and `.app-navbar-url-sep` rules (search the file for `app-navbar-url-segment`).

Changes:
1. `.app-navbar-url-segment`: remove any `border-radius`, `background`, and `border` declarations that produce the pill effect. Set:
   ```css
   border-radius: 0;
   background: transparent;
   border: none;
   ```
   Keep padding, color, font, hover rules.
2. `.app-navbar-url-current`: same treatment — strip pill styling if present.
3. Find the outer breadcrumb container (`.app-navbar-url` or `.app-navbar-url-text`). Add a faint band background to the container that wraps all segments:
   ```css
   .app-navbar-url {
     /* existing rules */
     background: rgba(255, 255, 255, 0.03);
     border-radius: 0;
     border: none;
   }
   ```
   Only add `background` if the existing rule doesn't already set one; otherwise adjust to the rgba value above.
4. Delete the `.app-navbar-url-sep` rule (no longer needed — it styled the `/` text).
5. Add a new rule for the chevron separator:
   ```css
   .app-navbar-url-sep-icon {
     color: var(--t3);
     margin: 0 4px;
     vertical-align: middle;
     flex-shrink: 0;
   }
   ```

- [ ] **Step 5: Visual verification (manual)**

User will test visually. Skip `npm run dev` — per project feedback, do not launch preview servers.

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar.tsx src/styles/globals.css
git commit -m "feat(navbar): remove home/refresh/forward, flatten breadcrumb with chevron separators"
```

---

## Task 2: ArticleLayout — add `actionRowExtras` slot

**Files:**
- Modify: `src/components/ArticleLayout.tsx:5–23, 97–128`

- [ ] **Step 1: Add `actionRowExtras` to `ArticleLayoutProps`**

In `ArticleLayout.tsx:5–23`, add the new optional prop after `actionRow`:

```ts
export type ArticleLayoutProps = {
  byline: React.ReactNode
  title: React.ReactNode
  titleExtras?: React.ReactNode
  description?: React.ReactNode
  tabs: React.ReactNode
  body: React.ReactNode
  actionRow: React.ReactNode
  /** Optional content rendered between the action row and the tabs divider (e.g. inline clone panel) */
  actionRowExtras?: React.ReactNode
  navBar?: React.ReactNode
  dither?: React.ReactNode
  fullBleedBody?: boolean
  scrollRef?: React.RefObject<HTMLDivElement>
}
```

- [ ] **Step 2: Destructure the new prop in the component**

In `ArticleLayout.tsx:27–39`, add `actionRowExtras,` to the destructure list (e.g. after `actionRow,`).

- [ ] **Step 3: Render the extras between action row and divider**

In `ArticleLayout.tsx:116–118`, update:
```tsx
<div className="article-layout-actions">{actionRow}</div>
</div>
<hr className="article-layout-divider" />
```
to:
```tsx
<div className="article-layout-actions">{actionRow}</div>
{actionRowExtras && <div className="article-layout-action-row-extras">{actionRowExtras}</div>}
</div>
<hr className="article-layout-divider" />
```

Note: the extras slot sits **inside** the top panel (before the `</div>` at line 117) so it participates in the top-panel height measurement used by the smart-collapse logic.

- [ ] **Step 4: Baseline style for the extras slot**

In `src/components/ArticleLayout.css`, add (near the `.article-layout-actions` rule):

```css
.article-layout-action-row-extras {
  /* No padding; child component controls its own spacing.
     No background, no border — purely a slot. */
}
```

This is a placeholder rule; the child `CloneOptionsPanel` defines its own padding in Task 3.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` (or `npx tsc --noEmit` if there's no typecheck script).
Expected: no new errors. Existing `ArticleLayout` callers should still compile — `actionRowExtras` is optional.

- [ ] **Step 6: Commit**

```bash
git add src/components/ArticleLayout.tsx src/components/ArticleLayout.css
git commit -m "feat(article-layout): add actionRowExtras slot between action row and tabs"
```

---

## Task 3: Create `CloneOptionsPanel` component

**Files:**
- Create: `src/components/CloneOptionsPanel.tsx`
- Create: `src/components/CloneOptionsPanel.test.tsx` (adapted from `DownloadDropdown.test.tsx`)
- Modify: `src/styles/globals.css` (add `.clone-panel*` rules)

The panel owns its internal state (itemStates, cloneTab, folders, etc.) — identical to what `DownloadDropdown` owns today — but `open` becomes a controlled prop. When `open === false`, the component returns `null`.

- [ ] **Step 1: Write the failing test — panel renders nothing when closed**

Create `src/components/CloneOptionsPanel.test.tsx` with (adapt window.api mocks from the existing `DownloadDropdown.test.tsx`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CloneOptionsPanel from './CloneOptionsPanel'

// (Copy the window.api mock block from DownloadDropdown.test.tsx verbatim.)
// (Copy the navigator.clipboard mock block from DownloadDropdown.test.tsx verbatim.)

beforeEach(() => {
  vi.clearAllMocks()
})

const defaultProps = {
  owner: 'sindresorhus',
  name: 'awesome',
  typeBucket: 'resource',
  typeSub: null,
  defaultBranch: 'main',
}

describe('CloneOptionsPanel', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<CloneOptionsPanel {...defaultProps} open={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the clone URL tabs when open is true', () => {
    render(<CloneOptionsPanel {...defaultProps} open={true} />)
    expect(screen.getByText('HTTPS')).toBeInTheDocument()
    expect(screen.getByText('SSH')).toBeInTheDocument()
    expect(screen.getByText('GitHub CLI')).toBeInTheDocument()
  })

  it('copies the active clone URL to clipboard', async () => {
    render(<CloneOptionsPanel {...defaultProps} open={true} />)
    const copyBtn = screen.getByTitle('Copy to clipboard')
    fireEvent.click(copyBtn)
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/sindresorhus/awesome.git')
    })
  })

  it('calls repoZip when ZIP download is clicked', async () => {
    render(<CloneOptionsPanel {...defaultProps} open={true} />)
    const zipBtn = await screen.findByText(/ZIP/i)
    fireEvent.click(zipBtn.closest('button')!)
    await waitFor(() => {
      expect(mockRepoZip).toHaveBeenCalledWith('sindresorhus', 'awesome')
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/CloneOptionsPanel.test.tsx`
Expected: FAIL — "Cannot find module './CloneOptionsPanel'".

- [ ] **Step 3: Create `CloneOptionsPanel.tsx`**

Create `src/components/CloneOptionsPanel.tsx`. Port the existing `DownloadDropdown` internals, removing the trigger button, the portal, outside-click/Escape handlers, and the position-measurement effect. Full source:

```tsx
import { useRef, useState } from 'react'
import {
  Archive, BookOpen, FileText, FileType, Bookmark,
  FolderDown, Check, X, Loader2, Copy, Monitor,
} from 'lucide-react'
import { getDownloadOptions, type DownloadOption } from '../lib/getDownloadOptions'

const ICON_MAP: Record<string, React.FC<{ size?: number }>> = {
  'archive': Archive,
  'book-open': BookOpen,
  'file-text': FileText,
  'file-type': FileType,
  'bookmark': Bookmark,
  'folder-down': FolderDown,
}

type ItemState = 'idle' | 'loading' | 'done' | 'error'
type CloneTab = 'https' | 'ssh' | 'cli'

interface Props {
  owner: string
  name: string
  typeBucket: string
  typeSub: string | null
  defaultBranch: string
  open: boolean
}

export default function CloneOptionsPanel({
  owner, name, typeBucket, typeSub, defaultBranch, open,
}: Props) {
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({})
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [folders, setFolders] = useState<string[] | null>(null)
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [folderExpanded, setFolderExpanded] = useState(false)
  const [cloneTab, setCloneTab] = useState<CloneTab>('https')
  const [urlCopied, setUrlCopied] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  const options = getDownloadOptions(typeBucket, typeSub)
  const downloadOptions = options.filter(o => o.id !== 'folder' && o.id !== 'clone')

  const cloneUrls: Record<CloneTab, string> = {
    https: `https://github.com/${owner}/${name}.git`,
    ssh: `git@github.com:${owner}/${name}.git`,
    cli: `gh repo clone ${owner}/${name}`,
  }

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
        case 'zip':       await window.api.download.repoZip(owner, name); break
        case 'epub':      await window.api.download.repoConverted(owner, name, 'epub'); break
        case 'pdf':       await window.api.download.repoConverted(owner, name, 'pdf'); break
        case 'docx':      await window.api.download.repoConverted(owner, name, 'docx'); break
        case 'bookmarks': await window.api.download.bookmarks(owner, name); break
        case 'clone':
        case 'folder': return
      }
      setItem(option.id, 'done')
    } catch (err) {
      setItem(option.id, 'error', err instanceof Error ? err.message : 'Failed')
    }
  }

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(cloneUrls[cloneTab])
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch { /* ignore */ }
  }

  function handleOpenDesktop() {
    window.open(`x-github-client://openRepo/https://github.com/${owner}/${name}`, '_self')
  }

  async function handleFolderToggle() {
    if (folderExpanded) { setFolderExpanded(false); return }
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
      setFolderExpanded(false)
    } catch (err) {
      setItem('folder', 'error', err instanceof Error ? err.message : 'Failed')
    }
  }

  if (!open) return null

  return (
    <section className="clone-panel">
      {/* Clone URL row */}
      <div className="clone-panel__clone-row">
        <div className="clone-panel__tabs">
          {(['https', 'ssh', 'cli'] as CloneTab[]).map(t => (
            <button
              key={t}
              className={`clone-panel__tab${cloneTab === t ? ' clone-panel__tab--active' : ''}`}
              onClick={() => setCloneTab(t)}
            >
              {t === 'https' ? 'HTTPS' : t === 'ssh' ? 'SSH' : 'GitHub CLI'}
            </button>
          ))}
        </div>
        <div className="clone-panel__url-row">
          <input
            ref={urlRef}
            className="clone-panel__url"
            value={cloneUrls[cloneTab]}
            readOnly
            onClick={() => urlRef.current?.select()}
          />
          <button
            className="clone-panel__copy"
            onClick={handleCopyUrl}
            title="Copy to clipboard"
          >
            {urlCopied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Open with GitHub Desktop */}
      <button className="clone-panel__item" onClick={handleOpenDesktop}>
        <Monitor size={14} />
        <span>Open with GitHub Desktop</span>
      </button>

      {/* Download options */}
      <div className="clone-panel__downloads">
        {downloadOptions.map(option => {
          const Icon = ICON_MAP[option.icon]
          const state = itemStates[option.id] ?? 'idle'
          return (
            <button
              key={option.id}
              className={`clone-panel__item${option.isDefault ? ' clone-panel__item--default' : ''}`}
              onClick={() => handleAction(option)}
              disabled={state === 'loading'}
              title={state === 'error' ? itemErrors[option.id] ?? 'Failed' : undefined}
            >
              {state === 'loading' ? <Loader2 size={14} className="spin" /> :
               state === 'done'    ? <Check size={14} /> :
               state === 'error'   ? <X size={14} /> :
               Icon ? <Icon size={14} /> : null}
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>

      {/* Download folder subsection */}
      <button className="clone-panel__item" onClick={handleFolderToggle}>
        <FolderDown size={14} />
        <span>Download folder{'\u2026'}</span>
      </button>
      {folderExpanded && (
        <div className="clone-panel__folders">
          {foldersLoading && (
            <div className="clone-panel__loading">
              <Loader2 size={14} className="spin" /> Loading…
            </div>
          )}
          {folders && folders.length === 0 && <div className="clone-panel__empty">No folders</div>}
          {folders && folders.map(f => (
            <button
              key={f}
              className="clone-panel__folder-item"
              onClick={() => handleFolderDownload(f)}
            >
              <FolderDown size={12} />
              <span>{f}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/CloneOptionsPanel.test.tsx`
Expected: all four tests pass.

- [ ] **Step 5: Add `.clone-panel` CSS to `globals.css`**

Append after the existing `.article-action-btn` rules (search the file for `.article-action-btn`):

```css
/* ── Inline clone options panel ────────────────────────────── */
.clone-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px) 0;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.clone-panel__clone-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.clone-panel__tabs {
  display: flex;
  gap: var(--space-3, 12px);
}

.clone-panel__tab {
  background: transparent;
  border: none;
  padding: 4px 2px;
  font-family: Inter, sans-serif;
  font-size: 12px;
  color: var(--t3);
  cursor: pointer;
  border-bottom: 1px solid transparent;
}
.clone-panel__tab:hover { color: var(--t2); }
.clone-panel__tab--active {
  color: var(--t1);
  border-bottom-color: var(--accent);
}

.clone-panel__url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clone-panel__url {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--t2);
  font-family: JetBrains Mono, monospace;
  font-size: 12px;
  padding: 4px 0;
  outline: none;
}
.clone-panel__url:focus { border-bottom-color: var(--accent); }

.clone-panel__copy {
  background: transparent;
  border: none;
  color: var(--t3);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
}
.clone-panel__copy:hover { color: var(--t1); }

.clone-panel__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--t2);
  font-family: Inter, sans-serif;
  font-size: 12px;
  padding: 4px 0;
  cursor: pointer;
  text-align: left;
}
.clone-panel__item:hover { color: var(--t1); }
.clone-panel__item:disabled { opacity: 0.5; cursor: not-allowed; }

.clone-panel__downloads {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.clone-panel__folders {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 22px; /* indent, no nested box */
}

.clone-panel__folder-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--t3);
  font-family: Inter, sans-serif;
  font-size: 11px;
  padding: 2px 0;
  cursor: pointer;
  text-align: left;
}
.clone-panel__folder-item:hover { color: var(--t1); }

.clone-panel__loading,
.clone-panel__empty {
  font-size: 11px;
  color: var(--t3);
  padding-left: 22px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
```

If `--space-2`, `--space-3`, `--space-4` tokens don't exist in the codebase, the fallback `px` values in the rules above apply.

- [ ] **Step 6: Run the test suite to confirm nothing else regressed**

Run: `npx vitest run src/components/`
Expected: all tests pass. The old `DownloadDropdown.test.tsx` still passes at this stage (the component still exists; it's deleted in Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/components/CloneOptionsPanel.tsx src/components/CloneOptionsPanel.test.tsx src/styles/globals.css
git commit -m "feat(clone-panel): inline clone options panel with URL tabs, desktop, downloads, folder"
```

---

## Task 4: RepoDetail action row — Clone button + Star restyle + panel wiring

**Files:**
- Modify: `src/views/RepoDetail.tsx` — imports, UI state, `RepoArticleActionRow` props + render, `ArticleLayout` usage
- Modify: `src/styles/globals.css` — remove `.article-action-btn--starred` pill treatment, add `.article-action-btn--star-on` gold state, add `.article-action-btn--clone-active` subtle active cue

- [ ] **Step 1: Update imports in `RepoDetail.tsx`**

Add `GitBranch` (from lucide-react) and `CloneOptionsPanel` to existing imports. Remove the `DownloadDropdown` import.

```ts
// before
import DownloadDropdown from '../components/DownloadDropdown'
import { Brain, /* …existing lucide imports… */ } from 'lucide-react'

// after
import CloneOptionsPanel from '../components/CloneOptionsPanel'
import { Brain, GitBranch, /* …existing lucide imports… */ } from 'lucide-react'
```

- [ ] **Step 2: Add `cloneOpen` UI state**

Inside `RepoDetail` (locate other `useState` calls, e.g. `hoveredBox`, `relearningTarget`), add:

```ts
const [cloneOpen, setCloneOpen] = useState(false)
```

- [ ] **Step 3: Extend `RepoArticleActionRowProps`**

In `RepoDetail.tsx:1790–1810`, add two props:

```ts
type RepoArticleActionRowProps = {
  learnState: 'UNLEARNED' | 'LEARNING' | 'ENHANCING' | 'LEARNED'
  starred: boolean
  starWorking: boolean
  starCount: number                // NEW
  cloneOpen: boolean               // NEW
  onToggleClone: () => void        // NEW
  onLearn: () => void
  onUnlearn: () => void
  onStar: () => void
  // (owner/name/typeBucket/typeSub/defaultBranch props can be removed since Clone button no longer owns them — they move to the panel caller. Keep them if used elsewhere in the row; otherwise remove.)
  translationStatus?: { /* unchanged */ } | null
}
```

Check whether `owner/name/typeBucket/typeSub/defaultBranch` are used anywhere else in `RepoArticleActionRow` after removing `<DownloadDropdown>`. If not, drop them from the props and the function signature.

- [ ] **Step 4: Replace the Star button JSX**

In `RepoDetail.tsx:1850–1860`, replace with:

```tsx
<button
  className={`article-action-btn${starred ? ' article-action-btn--star-on' : ''}`}
  onClick={onStar}
  disabled={starWorking}
  title={starred ? 'Unstar on GitHub' : 'Star on GitHub'}
>
  <svg viewBox="0 0 16 16" width={14} height={14} fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <path d="M8 1.5l1.85 3.75 4.15.6-3 2.93.7 4.1L8 10.77l-3.7 1.96.7-4.1-3-2.93 4.15-.6z" />
  </svg>
  <span>{formatCount(starCount)}</span>
</button>
```

Note: `formatCount` is already imported in `RepoDetail.tsx` (used in the sidebar). No new import needed.

- [ ] **Step 5: Replace `<DownloadDropdown>` with a Clone toggle button**

In `RepoDetail.tsx:1862–1869`, replace the `<DownloadDropdown>` block with:

```tsx
<button
  className={`article-action-btn${cloneOpen ? ' article-action-btn--clone-active' : ''}`}
  onClick={onToggleClone}
  aria-expanded={cloneOpen}
  title="Clone options"
>
  <GitBranch size={14} />
  <span>Clone</span>
</button>
```

Reorder the row so the final layout is `Learn · Clone · Star` (Clone comes before Star — move the new Clone button ahead of the Star button JSX).

- [ ] **Step 6: Pass new props from `RepoDetail` to `RepoArticleActionRow`**

Find the call site of `<RepoArticleActionRow … />` (inside the `ArticleLayout` props construction, around `actionRow={…}`). Add:

```tsx
actionRow={
  <RepoArticleActionRow
    /* …existing props… */
    starCount={repo?.stars ?? 0}
    cloneOpen={cloneOpen}
    onToggleClone={() => setCloneOpen(v => !v)}
  />
}
```

- [ ] **Step 7: Add `actionRowExtras` with the `CloneOptionsPanel`**

In the same `ArticleLayout` props block, after `actionRow={…}`, add:

```tsx
actionRowExtras={
  repo && (
    <CloneOptionsPanel
      open={cloneOpen}
      owner={owner}
      name={name}
      typeBucket={typeBucket}
      typeSub={typeSub}
      defaultBranch={repo.default_branch ?? 'main'}
    />
  )
}
```

`owner`, `name`, `typeBucket`, `typeSub` are already available in scope (used today for the `DownloadDropdown` inside the action row).

- [ ] **Step 8: Update `globals.css`**

Locate the `.article-action-btn--starred` rule (search for `article-action-btn--starred`). **Delete the entire rule** — the old pill-background treatment for starred state is replaced by gold recoloring.

Locate the `.article-action-btn` base rule and add, directly below:

```css
.article-action-btn--star-on {
  color: #e3b341;
}
.article-action-btn--star-on svg {
  color: #e3b341;
  fill: #e3b341;
}
.article-action-btn--star-on span {
  color: #e3b341;
}

.article-action-btn--clone-active {
  color: var(--t1);
}
```

- [ ] **Step 9: Typecheck and run tests**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run src/`
Expected: all tests pass (no test file targets `RepoDetail` or `RepoArticleActionRow`, but `CloneOptionsPanel.test.tsx` should still pass).

- [ ] **Step 10: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat(repo-detail): Clone button + inline panel, Star restyle with count + gold active"
```

---

## Task 5: RepoDetail sidebar simplification

**Files:**
- Modify: `src/views/RepoDetail.tsx:1468–1782` — remove all `<SidebarDivider />` calls in the sidebar panel; remove the Stars row; wrap sections in a gap container

- [ ] **Step 1: Remove the Stars row from the STATS block**

In `RepoDetail.tsx:1477–1481`, delete the Stars entry from the stats array:

```ts
// before
([
  { key: 'Stars',   val: formatCount(repo.stars),       icon: 'star' as const },
  { key: 'Forks',   val: formatCount(repo.forks),       icon: 'fork' as const },
  { key: 'Issues',  val: formatCount(repo.open_issues), icon: 'issue' as const },
  ...(version !== '—' ? [{ key: 'Version', val: version, icon: 'tag' as const }] : []),
])

// after
([
  { key: 'Forks',   val: formatCount(repo.forks),       icon: 'fork' as const },
  { key: 'Issues',  val: formatCount(repo.open_issues), icon: 'issue' as const },
  ...(version !== '—' ? [{ key: 'Version', val: version, icon: 'tag' as const }] : []),
])
```

Also delete the orphaned `icon === 'star' && …` branch inside the `.map()` (lines 1487–1491) — the star SVG will no longer be referenced.

- [ ] **Step 2: Remove every `<SidebarDivider />` inside the sidebar panel**

Locate and delete these occurrences (line numbers from the pre-edit file; they will shift after Step 1):
- `RepoDetail.tsx:1506` — after STATS
- `RepoDetail.tsx:1631` — before Repository
- `RepoDetail.tsx:1673` — before Packages
- `RepoDetail.tsx:1683` — before Quality
- `RepoDetail.tsx:1693` — before Community
- `RepoDetail.tsx:1705` — before Badges
- `RepoDetail.tsx:1716` — before Topics
- `RepoDetail.tsx:1733` — before Related repos

Re-grep after Step 1: `rg 'SidebarDivider' src/views/RepoDetail.tsx` should return **zero** matches when done.

Note: the `SidebarDivider` function definition at `RepoDetail.tsx:411–413` stays. Leaving it defined is harmless; if another caller exists after this cleanup (confirm with `rg 'SidebarDivider' src/`), it remains in use.

- [ ] **Step 3: Wrap the sidebar sections with a gap container**

In `RepoDetail.tsx:1471`, change:
```tsx
<div className="repo-detail-sidebar">
```
to:
```tsx
<div className="repo-detail-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
```

(24 px ≈ `var(--space-6)`; if the design system exposes that token, prefer the variable.)

- [ ] **Step 4: Verify no other sidebar regressions**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run src/`
Expected: all tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat(repo-detail): simplify sidebar — remove dividers, drop redundant stars row"
```

---

## Task 6: Delete `DownloadDropdown` and orphan CSS

**Files:**
- Delete: `src/components/DownloadDropdown.tsx`
- Delete: `src/components/DownloadDropdown.test.tsx`
- Modify: `src/styles/globals.css` — remove the `.dl-dropdown__*` block (roughly lines 4937–5089 in the pre-refactor file; exact range verified by grep)

- [ ] **Step 1: Confirm DownloadDropdown is orphaned**

Run: `rg 'DownloadDropdown' src/`
Expected: zero matches in application code. The only references should be inside the two `DownloadDropdown` files themselves.

If any other caller exists, **stop** and surface to the user — this task assumed exclusivity.

- [ ] **Step 2: Delete the component and test files**

```bash
git rm src/components/DownloadDropdown.tsx src/components/DownloadDropdown.test.tsx
```

- [ ] **Step 3: Remove `.dl-dropdown__*` CSS from `globals.css`**

Open `src/styles/globals.css`. Find the block starting with the `.dl-dropdown` rule (grep for `dl-dropdown`). Delete every rule whose selector starts with `.dl-dropdown` (the full block — approx 150 lines, the spec references lines 4937–5089).

Verify afterward: `rg 'dl-dropdown' src/` returns zero matches.

- [ ] **Step 4: Typecheck and full test run**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass. (The `DownloadDropdown.test.tsx` is no longer present; `CloneOptionsPanel.test.tsx` replaces it.)

- [ ] **Step 5: Commit**

```bash
git add -A src/components/ src/styles/globals.css
git commit -m "chore(repo-detail): delete orphaned DownloadDropdown + dl-dropdown styles"
```

---

## Final verification

- [ ] **Step 1: Build**

Run: `npm run build` (or the project's equivalent — check `package.json` for the build script).
Expected: build succeeds with no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Hand off to user for visual verification**

Per project norm, the user owns visual testing — do not launch a preview server. Report what was changed and invite the user to open the app and check:
- Nav bar shows only the Back button; breadcrumb is a flat band with `>` chevron separators.
- Action row reads `Learn · Clone · Star`; Star shows the star count and turns gold when starred.
- Clicking Clone expands an inline panel between action row and tabs; clicking Clone again closes it.
- Sidebar has no dividers, no Stars row in Stats; sections separated by spacing.

---

## Notes for the executor

- **Model:** this plan is executable by Sonnet 4.6 — no step requires Opus-grade reasoning.
- **Branch:** per project convention, commit directly to `main`. Do not create feature branches or worktrees.
- **Order dependency:** Tasks 1–5 can be committed independently; Task 6 must run last (after Task 4 stops using `DownloadDropdown`).
- **Do not launch dev servers** to verify visually — the user performs visual verification themselves.
- **TDD ceremony is scoped:** Task 3 (new component with real behavior) uses test-first. Tasks 1, 2, 5, 6 are structural/style changes and use typecheck + full test suite as verification. Task 4 is covered by the component tests from Task 3 plus typecheck.
