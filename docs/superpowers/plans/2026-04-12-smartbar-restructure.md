# SmartBar Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the SmartBar by moving sort controls to a dropdown below the divider, integrating the filter icon into the search bar, and merging layout controls into the filter dropdown.

**Architecture:** The SmartBar shrinks to just Search (with embedded filter icon) + Bucket pills. A new SortDropdown component renders right-aligned below the divider inside the content area. The FilterDropdown gains a Layout tab that replaces the standalone LayoutDropdown.

**Tech Stack:** React, TypeScript, CSS (globals.css), Vitest

**Spec:** `docs/superpowers/specs/2026-04-12-smartbar-restructure-design.md`

---

### Task 1: Create SortDropdown component

**Files:**
- Create: `src/components/SortDropdown.tsx`

- [ ] **Step 1: Create `SortDropdown.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { VIEW_MODES, type ViewModeKey } from '../lib/discoverQueries'

interface SortDropdownProps {
  value: ViewModeKey
  onChange: (key: ViewModeKey) => void
}

export default function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const active = VIEW_MODES.find(vm => vm.key === value) ?? VIEW_MODES[0]

  return (
    <div ref={containerRef} className="sort-dropdown">
      <button className="sort-dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span className="sort-dropdown-label">Sort by:</span>
        <span className="sort-dropdown-value">{active.label}</span>
        <ChevronDown size={12} style={{ opacity: 0.5 }} />
      </button>
      {open && (
        <div className="sort-dropdown-panel">
          {VIEW_MODES.map(vm => (
            <button
              key={vm.key}
              className={`sort-dropdown-option${vm.key === value ? ' active' : ''}`}
              style={vm.key === value ? { color: vm.accent, backgroundColor: `${vm.accent}1f` } : undefined}
              onClick={() => { onChange(vm.key); setOpen(false) }}
            >
              {vm.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add SortDropdown CSS to `globals.css`**

Add the following after the Smart Bar section (after `.smart-bar-action-btn:hover` around line 7900):

```css
/* ── Sort Dropdown ─────────────────────────────────────────────── */
.sort-dropdown {
  position: relative;
  display: flex;
  justify-content: flex-end;
  padding: 8px 0 0;
}

.sort-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.sort-dropdown-label {
  font-size: 12px;
  color: var(--t3);
}

.sort-dropdown-value {
  font-size: 12px;
  color: var(--t1);
  font-weight: 500;
}

.sort-dropdown-panel {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  z-index: 100;
  min-width: 160px;
  background: rgba(18, 18, 24, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  padding: 4px;
}

.sort-dropdown-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--t2);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.sort-dropdown-option:hover {
  background: rgba(255, 255, 255, 0.06);
}
```

- [ ] **Step 3: Verify the component renders in isolation**

Run: `npx tsc --noEmit 2>&1 | grep SortDropdown`
Expected: No errors related to SortDropdown

- [ ] **Step 4: Commit**

```bash
git add src/components/SortDropdown.tsx src/styles/globals.css
git commit -m "feat: add SortDropdown component with glass panel styling"
```

---

### Task 2: Add Layout tab to FilterDropdown

**Files:**
- Modify: `src/components/FilterDropdown.tsx`
- Modify: `src/styles/globals.css` (layout CSS already exists, no new CSS needed)

- [ ] **Step 1: Add `'layout'` to FilterTab type and add layout props**

In `FilterDropdown.tsx`, change:
```tsx
export type FilterTab = 'verification' | 'activity' | 'stars' | 'license' | 'topics' | 'languages'
```
to:
```tsx
export type FilterTab = 'verification' | 'activity' | 'stars' | 'license' | 'topics' | 'languages' | 'layout'
```

Add layout imports at top:
```tsx
import type { LayoutPrefs, LayoutMode, ListDensity, ListFields } from './LayoutDropdown'
```

Add to `FilterDropdownProps` interface:
```tsx
  layoutPrefs?: LayoutPrefs
  onLayoutChange?: (prefs: LayoutPrefs) => void
```

- [ ] **Step 2: Add Layout tab button and content panel**

Add `'layout'` to the tab list array in the render (line 130):
```tsx
{(['verification', 'activity', 'stars', 'license', 'topics', 'languages', 'layout'] as FilterTab[]).map(tab => (
```

Add the layout content panel after the `languages` tab content (before the closing `</div>` of `fdd-content`):
```tsx
{activeTab === 'layout' && layoutPrefs && onLayoutChange && (
  <div className="fdd-layout">
    <div className="layout-section-label">View Mode</div>
    <div className="layout-segment-row" style={{ marginBottom: 12 }}>
      {(['list', 'grid'] as LayoutMode[]).map(m => (
        <button
          key={m}
          className={`layout-segment-btn${layoutPrefs.mode === m ? ' active' : ''}`}
          onClick={() => onLayoutChange({ ...layoutPrefs, mode: m })}
        >
          {m === 'list' ? 'List' : 'Grid'}
        </button>
      ))}
    </div>

    {layoutPrefs.mode === 'grid' ? (
      <>
        <div className="layout-section-label">Columns</div>
        <div className="layout-columns-row">
          {[5, 6, 7, 8, 9, 10].map(n => (
            <button
              key={n}
              className={`layout-column-btn${layoutPrefs.columns === n ? ' active' : ''}`}
              onClick={() => onLayoutChange({ ...layoutPrefs, columns: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </>
    ) : (
      <>
        <div className="layout-section-label">Density</div>
        <div className="layout-density-row" style={{ marginBottom: 12 }}>
          {(['compact', 'comfortable'] as ListDensity[]).map(d => (
            <button
              key={d}
              className={`layout-segment-btn${layoutPrefs.density === d ? ' active' : ''}`}
              onClick={() => onLayoutChange({ ...layoutPrefs, density: d })}
            >
              {d === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          ))}
        </div>
        <div className="layout-section-label">Fields</div>
        {([
          { key: 'description' as keyof ListFields, label: 'Description' },
          { key: 'tags' as keyof ListFields, label: 'Tags' },
          { key: 'stats' as keyof ListFields, label: 'Stats' },
          { key: 'type' as keyof ListFields, label: 'Type badge' },
          { key: 'verification' as keyof ListFields, label: 'Verification badge' },
        ]).map(({ key, label }) => (
          <label key={key} className="layout-field-row">
            <input
              type="checkbox"
              aria-label={label}
              checked={layoutPrefs.fields[key]}
              onChange={() => onLayoutChange({
                ...layoutPrefs,
                fields: { ...layoutPrefs.fields, [key]: !layoutPrefs.fields[key] },
              })}
            />
            {label}
          </label>
        ))}
      </>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep FilterDropdown`
Expected: No new errors from FilterDropdown

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterDropdown.tsx
git commit -m "feat: add Layout tab to FilterDropdown"
```

---

### Task 3: Restructure SmartBar — remove views/actions, embed filter icon

**Files:**
- Modify: `src/components/SmartBar.tsx`

- [ ] **Step 1: Update SmartBarProps interface**

Remove these props:
- `selectedSubTypes: string[]`
- `onSubTypeChange: (ids: string[]) => void`
- `viewMode: ViewModeKey`
- `onViewModeChange: (key: ViewModeKey) => void`
- `layoutPrefs: LayoutPrefs`
- `onLayoutChange: (prefs: LayoutPrefs) => void`

Add this prop:
- `filterBadgeCount: number`

Update the destructured parameters in the function signature to match — remove `viewMode`, `onViewModeChange`, `selectedSubTypes`, `onSubTypeChange`, `layoutPrefs`, `onLayoutChange` and add `filterBadgeCount`.

Remove these imports:
- `VIEW_MODES`, `ViewModeKey` from `discoverQueries`
- `VIEW_MODE_ICONS` from `ViewModeIcons`
- `LayoutDropdown`, `LayoutPrefs` from `LayoutDropdown`

Add this import:
- `Filter` from `lucide-react`

- [ ] **Step 2: Rewrite the SmartBar render**

Replace the entire return JSX with:
```tsx
return (
  <div className="smart-bar">
    {/* Search input with filter icon */}
    <div className="smart-bar-search">
      <Search className="smart-bar-search-icon" size={14} />
      <input
        className="smart-bar-search-input"
        type="text"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder="Search repositories…"
        ref={inputRef}
      />
      <button
        className="smart-bar-search-filter"
        onClick={onFilterClick}
        title="Filter"
      >
        <Filter size={12} />
        {filterBadgeCount > 0 && (
          <span className="filter-badge">{filterBadgeCount}</span>
        )}
      </button>
    </div>

    <div className="smart-bar-divider" />

    {/* Bucket segmented control */}
    <div className="smart-bar-buckets">
      <button
        className={`smart-bar-bucket-pill${activeBucket === null ? ' active' : ''}`}
        onClick={() => onBucketChange(null)}
      >
        All
      </button>
      {REPO_BUCKETS.map(bucket => {
        const isActive = activeBucket === bucket.id
        const color = getBucketColor(bucket.id)
        return (
          <button
            key={bucket.id}
            className={`smart-bar-bucket-pill${isActive ? ' active' : ''}`}
            onClick={() => onBucketChange(isActive ? null : bucket.id)}
            style={isActive && color ? { color, backgroundColor: `${color}1f` } : undefined}
          >
            {bucket.label}
          </button>
        )
      })}
    </div>
  </div>
)
```

- [ ] **Step 3: Add CSS for filter icon in search bar**

Add to `globals.css` after `.smart-bar-search-input::placeholder`:
```css
.smart-bar-search-filter {
  display: flex;
  align-items: center;
  position: relative;
  background: none;
  border: none;
  color: var(--t3);
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
  transition: color 0.15s;
}
.smart-bar-search-filter:hover {
  color: var(--t1);
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep SmartBar`
Expected: Errors in `Discover.tsx` (expected — will fix in next task) and `SmartBar.test.tsx` (expected — will fix in Task 5). No errors in `SmartBar.tsx` itself.

- [ ] **Step 5: Commit**

```bash
git add src/components/SmartBar.tsx src/styles/globals.css
git commit -m "refactor: simplify SmartBar to search+filter and buckets only"
```

---

### Task 4: Update Discover.tsx — wire SortDropdown, update FilterDropdown props, remove LayoutDropdown

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Update imports**

Remove:
```tsx
import { VIEW_MODE_ICONS } from '../components/ViewModeIcons'
```

Add:
```tsx
import SortDropdown from '../components/SortDropdown'
```

Keep `FilterDropdown` and `LayoutDropdown` type imports (types still needed).

- [ ] **Step 2: Update SmartBar props**

Change the `<SmartBar>` call (around line 860) to:
```tsx
<SmartBar
  query={contextQuery}
  onQueryChange={setContextQuery}
  activeBucket={activeBucket}
  onBucketChange={handleBucketChange}
  onFilterClick={() => setFilterDropdownOpen(o => !o)}
  filterBadgeCount={filterBadgeCount}
  inputRef={discoverInputRef}
/>
```

- [ ] **Step 3: Pass layout props to FilterDropdown**

Update the FilterDropdown rendering (around line 878) to pass layout props:
```tsx
<FilterDropdown
  initialTab={filterDropdownInitialTab}
  filters={appliedFilters}
  activeLanguage={activeLanguage}
  activeVerification={activeVerification}
  languages={LANGUAGES}
  layoutPrefs={layoutPrefs}
  onLayoutChange={handleLayoutChange}
  onClose={(lastTab) => {
    setFilterDropdownInitialTab(lastTab === 'layout' ? 'verification' : lastTab)
    setFilterDropdownOpen(false)
  }}
  onChange={handleFilterChange}
  onVerificationToggle={handleVerificationToggle}
/>
```

Note the `lastTab === 'layout' ? 'verification' : lastTab` — this ensures reopening defaults to a filter tab, not layout.

- [ ] **Step 4: Add SortDropdown inside discover-content**

Inside the `discover-content` div (line 977), add the SortDropdown as the first child before the related tags row:
```tsx
<SortDropdown value={viewMode ?? 'recommended'} onChange={setViewMode} />
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep "Discover.tsx"`
Expected: Only pre-existing errors (getRecommended, type narrowing). No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "refactor: wire SortDropdown and layout-in-filter in Discover"
```

---

### Task 5: Update tests

**Files:**
- Modify: `src/components/SmartBar.test.tsx`

- [ ] **Step 1: Update SmartBar test base props and assertions**

Replace entire file:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SmartBar from './SmartBar'
import { REPO_BUCKETS } from '../constants/repoTypes'

const baseProps = {
  query: '',
  onQueryChange: vi.fn(),
  activeBucket: null,
  onBucketChange: vi.fn(),
  onFilterClick: vi.fn(),
  filterBadgeCount: 0,
}

describe('SmartBar', () => {
  it('renders all bucket pills (All + 8 buckets)', () => {
    render(<SmartBar {...baseProps} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    for (const bucket of REPO_BUCKETS) {
      expect(screen.getByText(bucket.label)).toBeInTheDocument()
    }
  })

  it('clicking a bucket calls onBucketChange with bucket id', () => {
    const onBucketChange = vi.fn()
    render(<SmartBar {...baseProps} onBucketChange={onBucketChange} />)
    fireEvent.click(screen.getByText('Dev Tools'))
    expect(onBucketChange).toHaveBeenCalledWith('dev-tools')
  })

  it('clicking All calls onBucketChange(null)', () => {
    const onBucketChange = vi.fn()
    render(<SmartBar {...baseProps} activeBucket="dev-tools" onBucketChange={onBucketChange} />)
    fireEvent.click(screen.getByText('All'))
    expect(onBucketChange).toHaveBeenCalledWith(null)
  })

  it('active bucket pill has active class', () => {
    render(<SmartBar {...baseProps} activeBucket="dev-tools" />)
    const devToolsPill = screen.getByText('Dev Tools').closest('.smart-bar-bucket-pill')
    expect(devToolsPill).toHaveClass('active')
  })

  it('search input reflects query prop', () => {
    render(<SmartBar {...baseProps} query="react hooks" />)
    expect(screen.getByRole('textbox')).toHaveValue('react hooks')
  })

  it('calls onQueryChange when typing in search input', () => {
    const onQueryChange = vi.fn()
    render(<SmartBar {...baseProps} onQueryChange={onQueryChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'typescript' } })
    expect(onQueryChange).toHaveBeenCalledWith('typescript')
  })

  it('clicking filter icon calls onFilterClick', () => {
    const onFilterClick = vi.fn()
    render(<SmartBar {...baseProps} onFilterClick={onFilterClick} />)
    fireEvent.click(screen.getByTitle('Filter'))
    expect(onFilterClick).toHaveBeenCalled()
  })

  it('shows filter badge when filterBadgeCount > 0', () => {
    render(<SmartBar {...baseProps} filterBadgeCount={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('clicking active bucket toggles it off', () => {
    const onBucketChange = vi.fn()
    render(<SmartBar {...baseProps} activeBucket="dev-tools" onBucketChange={onBucketChange} />)
    fireEvent.click(screen.getByText('Dev Tools'))
    expect(onBucketChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/components/SmartBar.test.tsx`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/SmartBar.test.tsx
git commit -m "test: update SmartBar tests for restructured props"
```

---

### Task 6: Update remaining test files

**Files:**
- Modify: `src/views/Discover.test.tsx` (if it references SmartBar props that changed)
- Delete or gut: any `LayoutDropdown` test file

- [ ] **Step 1: Check Discover.test.tsx for broken SmartBar prop references**

Run: `grep -n "viewMode\|onViewModeChange\|layoutPrefs\|onLayoutChange\|selectedSubTypes\|onSubTypeChange" src/views/Discover.test.tsx`

If matches are found in mock/render calls, update them to remove the deleted SmartBar props. The SmartBar is rendered by Discover internally so these may appear in mock setups.

- [ ] **Step 2: Remove LayoutDropdown test if it exists**

Run: `find src/ -name "*LayoutDropdown*test*" -o -name "*layout-dropdown*test*"`

If found, delete the file — the standalone LayoutDropdown component no longer exists.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: Pass (pre-existing failures in Discover.test.tsx unrelated to this work are acceptable)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: update Discover and remove LayoutDropdown tests"
```

---

### Task 7: CSS cleanup — remove unused Smart Bar styles

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Remove unused CSS classes**

Remove these class blocks from globals.css (around lines 7840-7900):
- `.smart-bar-views` (and its children)
- `.smart-bar-view-tab`, `.smart-bar-view-tab:hover`, `.smart-bar-view-tab.active`
- `.smart-bar-actions`
- `.smart-bar-action-btn`, `.smart-bar-action-btn:hover`

These are no longer rendered by any component.

- [ ] **Step 2: Verify no references remain**

Run: `grep -r "smart-bar-views\|smart-bar-view-tab\|smart-bar-actions\|smart-bar-action-btn" src/`
Expected: No matches (LayoutDropdown.tsx no longer uses `smart-bar-action-btn` after the SmartBar restructure removed it)

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "chore: remove unused SmartBar CSS classes"
```

---

### Task 8: Strip LayoutDropdown component code, keep type exports

**Files:**
- Modify: `src/components/LayoutDropdown.tsx`

- [ ] **Step 1: Remove component UI, keep types and constants**

Replace the file contents with just the type exports:
```tsx
// ── Types & constants (used by Discover.tsx, DiscoverGrid.tsx, RepoListRow.tsx) ──

export type LayoutMode = 'grid' | 'list'
export type ListDensity = 'compact' | 'comfortable'

export interface ListFields {
  description: boolean
  tags: boolean
  stats: boolean
  type: boolean
  verification: boolean
}

export interface LayoutPrefs {
  mode: LayoutMode
  columns: number
  density: ListDensity
  fields: ListFields
}

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  mode: 'grid',
  columns: 5,
  density: 'comfortable',
  fields: { description: true, tags: true, stats: true, type: true, verification: true },
}

export const LAYOUT_STORAGE_KEY = 'discover-layout-prefs'
```

- [ ] **Step 2: Verify all consumers still compile**

Run: `npx tsc --noEmit 2>&1 | grep -i "LayoutDropdown\|layoutdropdown"`
Expected: No import errors. (DiscoverGrid, RepoListRow, Discover all import types only.)

- [ ] **Step 3: Commit**

```bash
git add src/components/LayoutDropdown.tsx
git commit -m "refactor: strip LayoutDropdown UI, keep type exports"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: Only pre-existing errors, no new errors from this work.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (some pre-existing failures in Discover.test.tsx may remain — those are unrelated).

- [ ] **Step 3: Verify CSS has no orphaned layout-dropdown-panel references**

Run: `grep -r "layout-dropdown-panel" src/`
Expected: Only `globals.css` (the CSS definition can remain for now or be cleaned up separately — the FilterDropdown layout tab reuses the existing `layout-segment-btn`/`layout-column-btn` classes which are still needed).

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: SmartBar restructure cleanup"
```
