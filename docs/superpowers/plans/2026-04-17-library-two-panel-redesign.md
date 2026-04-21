# Library Two-Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Library page into a Steam-style two-panel layout: a compact full-height left sidebar listing all installed + starred repos, and a cleaned-up right panel with grid/list view.

**Architecture:** A new `LibrarySidebar` component replaces `DiscoverSidebar` in Library. `Library.tsx` fetches starred repos on mount, merges them with installed rows, and routes the detail panel to either `LibraryFilesDetail` (installed) or `NotInstalledDetail` (starred-only) based on the selected repo. Card/list-row sub-components have tags and active toggles stripped out.

**Tech Stack:** React 18, TypeScript, Electron IPC (`window.api.*`), CSS custom properties, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-04-17-library-two-panel-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/NotInstalledDetail.tsx` | Modify | Widen prop type from `LibraryRow` → `RepoRow` |
| `src/components/LibraryCard.tsx` | Modify | Remove active dot, all badge tags, inline toggle |
| `src/components/LibraryListRow.tsx` | Modify | Remove all badge tags, active dot, toggle |
| `src/components/LibraryGrid.tsx` | Modify | Remove `filtersApplied` prop, REPO_BUCKETS import, sectioned mode; remove `onToggleActive` threading |
| `src/components/LibrarySidebar.tsx` | Create | Steam-style compact repo list (installed + starred merged) |
| `src/components/LibrarySidebar.css` | Create | Styles for LibrarySidebar |
| `src/views/Library.tsx` | Modify | Replace DiscoverSidebar with LibrarySidebar; fetch starred on mount; topbar cleanup; detail panel routing |
| `src/styles/globals.css` | Modify | Update `.library-root-v2` padding-left to 276px; remove `.library-topbar-v2` border-bottom |

---

### Task 1: Widen NotInstalledDetail prop type

**Files:**
- Modify: `src/components/NotInstalledDetail.tsx`

`NotInstalledDetail` currently accepts `row: LibraryRow`. The new sidebar will pass `StarredRepoRow` objects for starred-only repos. Both types extend `RepoRow`, and `NotInstalledDetail` only reads fields present on `RepoRow` (`owner`, `name`, `avatar_url`, `description`, `stars`, `language`). The `generate()` IPC call only needs `owner` and `name`.

- [ ] **Step 1: Update the import and Props type**

Change line 3 from `import type { LibraryRow }` to `import type { RepoRow }`, and change the Props interface `row` field from `LibraryRow` to `RepoRow`:

```tsx
import type { RepoRow } from '../types/repo'

interface Props {
  row: RepoRow
  onInstalled: () => void
}
```

Also update the `handleInstall` function body (line 16–17) to drop the result variable and call `onInstalled()` with no arguments:

```tsx
const result = await window.api.skill.generate(row.owner, row.name)
onInstalled(result)
```
becomes:
```tsx
await window.api.skill.generate(row.owner, row.name)
onInstalled()
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | grep NotInstalledDetail
```

Expected: no output (no errors for this file).

- [ ] **Step 3: Commit**

```bash
git add src/components/NotInstalledDetail.tsx
git commit -m "refactor(library): widen NotInstalledDetail prop to RepoRow"
```

---

### Task 2: Strip tags and active toggle from LibraryCard

**Files:**
- Modify: `src/components/LibraryCard.tsx`

Remove: the active dot span, the badges div (type badge, VerificationBadge, enhanced badge), the inline toggle div. Also remove the `onToggleActive` prop and unused imports.

- [ ] **Step 1: Rewrite LibraryCard**

Replace the entire file with:

```tsx
import { Boxes } from 'lucide-react'
import { useProfileOverlay } from '../contexts/ProfileOverlay'
import type { LibraryRow } from '../types/repo'

export interface LibraryCardProps {
  row: LibraryRow
  selected: boolean
  hasSubSkill: boolean
  onSelect: () => void
}

export default function LibraryCard({ row, selected, hasSubSkill, onSelect }: LibraryCardProps) {
  const { openProfile } = useProfileOverlay()

  return (
    <div
      className={`library-card${selected ? ' selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      {hasSubSkill && (
        <span className="library-sub-skill-indicator" aria-label="Has interactive detail">
          <Boxes size={12} />
        </span>
      )}

      <div className="library-card-header">
        <div className="library-card-title-block">
          <span className="library-card-name">{row.name}</span>
          <button
            className="owner-name-btn library-card-owner"
            onClick={(e) => { e.stopPropagation(); openProfile(row.owner) }}
          >
            {row.owner}
          </button>
        </div>
      </div>

      {row.description && (
        <p className="library-card-description">{row.description}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | grep LibraryCard
```

Expected: no output. If there are errors about `onToggleActive` being passed somewhere, note the file — it will be cleaned up in Task 4 (LibraryGrid).

- [ ] **Step 3: Commit**

```bash
git add src/components/LibraryCard.tsx
git commit -m "refactor(library): remove tags and active toggle from LibraryCard"
```

---

### Task 3: Strip tags and active toggle from LibraryListRow

**Files:**
- Modify: `src/components/LibraryListRow.tsx`

Remove: all badge/tag elements, the active dot, the Toggle. Remove `onToggle` prop and unused imports.

- [ ] **Step 1: Rewrite LibraryListRow**

Replace the entire file with:

```tsx
import type { LibraryRow } from '../types/repo'

export default function LibraryListRow({
  row, selected, onSelect,
}: {
  row: LibraryRow
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={`library-row${selected ? ' selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      <div className="library-row-info">
        <span className="library-row-name">{row.name}</span>
        <span className="library-row-owner">{row.owner}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | grep LibraryListRow
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/LibraryListRow.tsx
git commit -m "refactor(library): remove tags and active toggle from LibraryListRow"
```

---

### Task 4: Simplify LibraryGrid

**Files:**
- Modify: `src/components/LibraryGrid.tsx`

Remove: `filtersApplied` prop, `REPO_BUCKETS` import, sectioned rendering path. Remove `onToggleActive` from props and `renderRow` calls (children no longer accept it). Grid always renders flat.

- [ ] **Step 1: Rewrite LibraryGrid**

Replace the entire file with:

```tsx
import LibraryCard from './LibraryCard'
import LibraryListRow from './LibraryListRow'
import type { LibraryRow } from '../types/repo'
import type { LayoutPrefs } from './LayoutDropdown'

export interface LibraryGridProps {
  rows: LibraryRow[]
  selectedId: string | null
  layoutPrefs: LayoutPrefs
  subSkillIds: Set<string>
  onSelect: (row: LibraryRow) => void
}

export default function LibraryGrid({
  rows, selectedId, layoutPrefs, subSkillIds, onSelect,
}: LibraryGridProps) {
  const isList = layoutPrefs.mode === 'list'

  return (
    <div
      className={isList ? 'library-list' : 'library-grid'}
      style={!isList ? { gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))` } : undefined}
    >
      {rows.map(row =>
        isList ? (
          <LibraryListRow
            key={row.id}
            row={row}
            selected={selectedId === row.id}
            onSelect={() => onSelect(row)}
          />
        ) : (
          <LibraryCard
            key={row.id}
            row={row}
            selected={selectedId === row.id}
            hasSubSkill={subSkillIds.has(row.id)}
            onSelect={() => onSelect(row)}
          />
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | grep -E "LibraryGrid|filtersApplied"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/LibraryGrid.tsx
git commit -m "refactor(library): remove sectioned mode and filtersApplied from LibraryGrid"
```

---

### Task 5: Create LibrarySidebar component and CSS

**Files:**
- Create: `src/components/LibrarySidebar.tsx`
- Create: `src/components/LibrarySidebar.css`

The sidebar is a fixed 220px panel sitting right of the icon rail (at `left: 56px`). It shows a merged, deduped list of installed repos and starred repos keyed by `row.id`. Each item shows a 24px avatar (or initial fallback) + repo name. Starred-only items show a small star indicator. The selected item is highlighted.

- [ ] **Step 1: Create LibrarySidebar.tsx**

```tsx
import './LibrarySidebar.css'
import { Star } from 'lucide-react'
import type { LibraryRow, StarredRepoRow, RepoRow } from '../types/repo'

interface SidebarEntry {
  row: RepoRow
  isInstalled: boolean
  isStarred: boolean
}

interface Props {
  installedRows: LibraryRow[]
  starredRows: StarredRepoRow[]
  selectedId: string | null
  onSelect: (row: RepoRow, isInstalled: boolean) => void
}

export default function LibrarySidebar({ installedRows, starredRows, selectedId, onSelect }: Props) {
  const entries: SidebarEntry[] = (() => {
    const map = new Map<string, SidebarEntry>()
    for (const row of installedRows) {
      map.set(row.id, { row, isInstalled: true, isStarred: false })
    }
    for (const row of starredRows) {
      if (map.has(row.id)) {
        map.get(row.id)!.isStarred = true
      } else {
        map.set(row.id, { row, isInstalled: false, isStarred: true })
      }
    }
    return Array.from(map.values())
  })()

  return (
    <aside className="library-sidebar">
      {entries.length === 0 && (
        <div className="library-sidebar-empty">No repos yet</div>
      )}
      {entries.map(({ row, isInstalled, isStarred }) => (
        <button
          key={row.id}
          className={`library-sidebar-item${selectedId === row.id ? ' selected' : ''}`}
          onClick={() => onSelect(row, isInstalled)}
          title={`${row.owner}/${row.name}`}
        >
          <span className="library-sidebar-avatar">
            {row.avatar_url
              ? <img src={row.avatar_url} alt="" />
              : <span className="library-sidebar-avatar-fallback">{row.name[0].toUpperCase()}</span>
            }
          </span>
          <span className="library-sidebar-name">{row.name}</span>
          {!isInstalled && isStarred && (
            <span className="library-sidebar-star" aria-label="Starred, not installed">
              <Star size={10} />
            </span>
          )}
        </button>
      ))}
    </aside>
  )
}
```

- [ ] **Step 2: Create LibrarySidebar.css**

```css
.library-sidebar {
  position: fixed;
  left: 56px;
  top: 0;
  width: 220px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border-right: 1px solid var(--glass-border);
  z-index: 150;
  padding: 8px 0;
}

.library-sidebar-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--t3);
}

.library-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  border-radius: 0;
  color: var(--t2);
  transition: background 0.1s;
}

.library-sidebar-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--t1);
}

.library-sidebar-item.selected {
  background: rgba(255, 255, 255, 0.08);
  color: var(--t1);
}

.library-sidebar-avatar {
  width: 24px;
  height: 24px;
  min-width: 24px;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.library-sidebar-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.library-sidebar-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--glass-border);
  font-size: 11px;
  font-weight: 600;
  color: var(--t2);
}

.library-sidebar-name {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-sidebar-star {
  color: var(--t3);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Check TypeScript**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | grep LibrarySidebar
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/LibrarySidebar.tsx src/components/LibrarySidebar.css
git commit -m "feat(library): add LibrarySidebar component"
```

---

### Task 6: Refactor Library.tsx

**Files:**
- Modify: `src/views/Library.tsx`

This is the largest change. Remove `DiscoverSidebar` and all state that fed it. Add `LibrarySidebar`, starred rows fetch, `selectedRepoId` state, simplified filtering (segment only), and detail panel routing.

- [ ] **Step 1: Replace Library.tsx**

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { type LibraryRow, type StarredRepoRow, type SubSkillRow, type RepoRow } from '../types/repo'
import { useSearch } from '../contexts/Search'
import { useToast } from '../contexts/Toast'
import LibrarySidebar from '../components/LibrarySidebar'
import LibraryGrid from '../components/LibraryGrid'
import LibraryDetailPanel from '../components/LibraryDetailPanel'
import LibraryFilesDetail from '../components/LibraryFilesDetail'
import NotInstalledDetail from '../components/NotInstalledDetail'
import GridHeader from '../components/GridHeader'
import {
  DEFAULT_LAYOUT_PREFS,
  type LayoutPrefs,
} from '../components/LayoutDropdown'

const LIBRARY_LAYOUT_KEY = 'library-layout-prefs'

function loadLayoutPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(LIBRARY_LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT_PREFS
    return { ...DEFAULT_LAYOUT_PREFS, ...(JSON.parse(raw) as Partial<LayoutPrefs>) }
  } catch {
    return DEFAULT_LAYOUT_PREFS
  }
}

type ActiveSegment = 'all' | 'active' | 'inactive'

export default function Library() {
  const { query: filter } = useSearch()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [rows, setRows] = useState<LibraryRow[]>([])
  const [starredRows, setStarredRows] = useState<StarredRepoRow[]>([])
  const [subSkillIds, setSubSkillIds] = useState<Set<string>>(new Set())
  const [activeSegment, setActiveSegment] = useState<ActiveSegment>('active')
  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPrefs>(loadLayoutPrefs)

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [componentsSubSkill, setComponentsSubSkill] = useState<SubSkillRow | null>(null)
  const [mcpToolsSubSkill, setMcpToolsSubSkill] = useState<SubSkillRow | null>(null)

  useEffect(() => {
    try { localStorage.setItem(LIBRARY_LAYOUT_KEY, JSON.stringify(layoutPrefs)) } catch {}
  }, [layoutPrefs])

  useEffect(() => {
    window.api.library.getAll().then(setRows).catch(() => {
      toast('Failed to load library', 'error')
    })
    window.api.starred.getAll().then(setStarredRows).catch(() => {})
  }, [toast])

  const selectedInstalled = useMemo(
    () => rows.find(r => r.id === selectedRepoId) ?? null,
    [rows, selectedRepoId]
  )
  const selectedStarred = useMemo(
    () => starredRows.find(r => r.id === selectedRepoId) ?? null,
    [starredRows, selectedRepoId]
  )

  useEffect(() => {
    if (!selectedInstalled) return
    if (componentsSubSkill || mcpToolsSubSkill) {
      setSubSkillIds(prev => {
        if (prev.has(selectedInstalled.id)) return prev
        const next = new Set(prev)
        next.add(selectedInstalled.id)
        return next
      })
    }
  }, [selectedInstalled, componentsSubSkill, mcpToolsSubSkill])

  const handleSidebarSelect = useCallback((row: RepoRow, isInstalled: boolean) => {
    if (selectedRepoId === row.id && panelOpen) {
      setPanelOpen(false)
      setSelectedRepoId(null)
      return
    }
    setSelectedRepoId(row.id)
    setPanelOpen(true)
    setComponentsSubSkill(null)
    setMcpToolsSubSkill(null)
    if (isInstalled) {
      window.api.skill.getSubSkill(row.owner, row.name, 'components').then(setComponentsSubSkill).catch(() => null)
      window.api.skill.getSubSkill(row.owner, row.name, 'mcp-tools').then(setMcpToolsSubSkill).catch(() => null)
    }
  }, [selectedRepoId, panelOpen])

  const handleGridSelect = useCallback((row: LibraryRow) => {
    handleSidebarSelect(row, true)
  }, [handleSidebarSelect])

  const searchFiltered = useMemo(() => {
    const q = filter.toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.name.toLowerCase().includes(q)
      || r.owner.toLowerCase().includes(q)
      || (r.description ?? '').toLowerCase().includes(q)
      || (r.language ?? '').toLowerCase().includes(q)
    )
  }, [rows, filter])

  const sorted = useMemo(() => {
    const list = searchFiltered.filter(r => {
      if (activeSegment === 'active'   && r.active !== 1) return false
      if (activeSegment === 'inactive' && r.active !== 0) return false
      return true
    })
    list.sort((a, b) => (b.generated_at ?? '').localeCompare(a.generated_at ?? ''))
    return list
  }, [searchFiltered, activeSegment])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setSelectedRepoId(null)
  }, [])

  const isEmpty = rows.length === 0 && starredRows.length === 0
  const onlyStarred = rows.length === 0 && starredRows.length > 0

  return (
    <div className="library-root-v2">
      <LibrarySidebar
        installedRows={rows}
        starredRows={starredRows}
        selectedId={selectedRepoId}
        onSelect={handleSidebarSelect}
      />

      <main className="library-main">
        <div className="library-topbar-v2">
          <div className="library-segmented" role="radiogroup" aria-label="Filter by active state">
            {(['all', 'active', 'inactive'] as const).map(seg => (
              <button
                key={seg}
                className={`library-segment${activeSegment === seg ? ' active' : ''}`}
                onClick={() => setActiveSegment(seg)}
                aria-pressed={activeSegment === seg}
              >
                {seg === 'all' ? 'All' : seg === 'active' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>

          <GridHeader
            viewMode="all"
            onViewModeChange={() => {}}
            layoutPrefs={layoutPrefs}
            onLayoutChange={setLayoutPrefs}
            activeFilters={{ languages: [], subtypes: [] }}
            onRemoveLanguage={() => {}}
            onRemoveSubtype={() => {}}
            hideViewMode
          />
        </div>

        <div className="library-body-v2">
          <div className="library-grid-scroll">
            {isEmpty ? (
              <div className="library-empty">
                <p>No skills installed yet</p>
                <button className="lib-btn-regen" onClick={() => navigate('/discover')}>
                  Go to Discover
                </button>
              </div>
            ) : onlyStarred ? (
              <div className="library-empty">
                <p>No skills installed yet</p>
                <p className="library-empty-hint">Select a starred repo from the sidebar to install it.</p>
              </div>
            ) : sorted.length === 0 ? (
              <p className="library-no-results">No skills match your filters.</p>
            ) : (
              <LibraryGrid
                rows={sorted}
                selectedId={selectedRepoId}
                layoutPrefs={layoutPrefs}
                subSkillIds={subSkillIds}
                onSelect={handleGridSelect}
              />
            )}
          </div>

          <LibraryDetailPanel open={panelOpen} onClose={closePanel}>
            {selectedInstalled ? (
              <LibraryFilesDetail
                key={selectedInstalled.id}
                row={selectedInstalled}
                onToggleActive={(v) => {
                  const active = v ? 1 : 0
                  setRows(prev => prev.map(r => r.id === selectedInstalled.id ? { ...r, active } : r))
                  window.api.skill.toggle(selectedInstalled.owner, selectedInstalled.name, active)
                }}
                onInstalled={(result) => {
                  const updated = { ...selectedInstalled, installed: 1, active: 1, ...result }
                  setRows(prev => prev.map(r => r.id === selectedInstalled.id ? updated : r))
                  toast('Skill installed', 'success')
                }}
              />
            ) : selectedStarred ? (
              <NotInstalledDetail
                key={selectedStarred.id}
                row={selectedStarred}
                onInstalled={() => {
                  window.api.library.getAll().then(setRows).catch(() => {})
                  toast('Skill installed', 'success')
                }}
              />
            ) : (
              <div className="library-detail-empty">
                <span>Select a skill to view details</span>
              </div>
            )}
          </LibraryDetailPanel>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If errors appear about `onToggleActive` being passed to `LibraryGrid`, that prop was removed in Task 4 — verify Task 4 is complete.

- [ ] **Step 3: Commit**

```bash
git add src/views/Library.tsx
git commit -m "feat(library): replace DiscoverSidebar with LibrarySidebar, wire two-panel layout"
```

---

### Task 7: Update globals.css

**Files:**
- Modify: `src/styles/globals.css`

Two CSS changes: (1) `library-root-v2` padding-left 56px → 276px with updated comment, (2) remove `border-bottom` from `library-topbar-v2`.

- [ ] **Step 1: Update `.library-root-v2` padding-left (line 10209)**

Change:
```css
  padding-left: 56px; /* offset for the fixed DiscoverSidebar rail */
```
To:
```css
  padding-left: 276px; /* 56px icon rail + 220px LibrarySidebar */
```

- [ ] **Step 2: Remove border-bottom from `.library-topbar-v2` (line 10222)**

Change:
```css
.library-topbar-v2 {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
```
To:
```css
.library-topbar-v2 {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  flex-wrap: wrap;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(library): update layout padding and remove topbar underline"
```

---

### Task 8: Move GridHeader to right side of topbar

**Files:**
- Modify: `src/styles/globals.css`

The `GridHeader` should sit on the right side of the topbar. The segment buttons stay left. `GridHeader` renders a root div with class `grid-header-wrapper`. Target that inside `.library-topbar-v2` with `margin-left: auto`.

- [ ] **Step 1: Add margin-left: auto to push GridHeader right**

In `globals.css`, after the `.library-topbar-v2` block, add:

```css
.library-topbar-v2 .grid-header-wrapper {
  margin-left: auto;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(library): align GridHeader to right side of topbar"
```

---

### Task 9: Final TypeScript check

- [ ] **Step 1: Full TypeScript compile**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1
```

Expected: no errors. If any appear, read the error carefully — most will be about removed props still being passed at a call site. Fix inline.

- [ ] **Step 2: If any errors, fix and commit**

```bash
git add -p
git commit -m "fix(library): resolve remaining TypeScript errors from two-panel redesign"
```
