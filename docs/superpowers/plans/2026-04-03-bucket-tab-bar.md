# Bucket Tab Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `TypeFilterDropdown` button in the Discover filter row with six inline bucket tab buttons that reveal a connected sub-type panel on hover.

**Architecture:** A new `BucketTabBar` component manages `openBucketId` state at the top level so only one panel is open at a time. Each `BucketTab` sub-component handles hover events using a single shared `closeTimerRef` passed from the parent. The `selectedTypes: string[]` state and filter predicate in `Discover.tsx` are unchanged — only the UI widget changes.

**Tech Stack:** React, TypeScript, vitest + @testing-library/react, `vi.useFakeTimers()` for hover delay tests, CSS custom properties (`var(--bg2)`, `var(--border)`, `var(--t1/2/3)`, `var(--accent-soft)`).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/components/BucketTabBar.tsx` | New tab bar + panel component |
| Create | `src/components/BucketTabBar.test.tsx` | Tests for BucketTabBar |
| Delete | `src/components/TypeFilterDropdown.tsx` | Replaced by BucketTabBar |
| Delete | `src/components/TypeFilterDropdown.test.tsx` | No longer has a subject |
| Modify | `src/views/Discover.tsx` | Swap import + JSX, restructure filter row |
| Modify | `src/views/Discover.test.tsx` | Update describe block for new component |
| Modify | `src/styles/globals.css` | Add `.btb-*` classes, update `.discover-filter-row` |

---

## Background: what you need to know

**REPO_BUCKETS** — defined in `src/constants/repoTypes.ts`. It's an array of 6 objects with shape `{ id: string, label: string, color: string, subTypes: { id: string, label: string, bucket: string }[] }`. Import it with: `import { REPO_BUCKETS, type RepoBucket } from '../constants/repoTypes'`

**CSS design tokens used** — `var(--bg2)` (panel background), `var(--border)` (border color), `var(--t1/t2/t3)` (text colors light→dark), `var(--accent-soft)` (active sub-type background). These are already defined globally.

**Running tests** — use `npm test` (not `npx vitest run`) because it rebuilds the native `better-sqlite3` binary first. Pre-existing failures in `Discover.test.tsx` (IntersectionObserver) and `LayoutDropdown.test.tsx` are expected and unrelated.

**The filter predicate in Discover.tsx** (`selectedTypes`) does not change at all. Only the component rendering it changes.

---

## Task 1: Create `BucketTabBar.tsx`

**Files:**
- Create: `src/components/BucketTabBar.tsx`

- [ ] **Step 1: Write the full component**

Create `src/components/BucketTabBar.tsx` with this exact content:

```tsx
import { useState, useRef } from 'react'
import { REPO_BUCKETS, type RepoBucket } from '../constants/repoTypes'

interface BucketTabBarProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

interface BucketTabProps {
  bucket: RepoBucket
  selected: string[]
  onChange: (selected: string[]) => void
  openBucketId: string | null
  setOpenBucketId: (id: string | null) => void
  closeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
}

function BucketTab({ bucket, selected, onChange, openBucketId, setOpenBucketId, closeTimerRef }: BucketTabProps) {
  const open = openBucketId === bucket.id
  const activeSubTypes = bucket.subTypes.filter(s => selected.includes(s.id))
  const isActive = activeSubTypes.length > 0

  function clearTimer() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function scheduleClose() {
    clearTimer()
    closeTimerRef.current = setTimeout(() => setOpenBucketId(null), 150)
  }

  function toggle(subTypeId: string) {
    if (selected.includes(subTypeId)) {
      onChange(selected.filter(id => id !== subTypeId))
    } else {
      onChange([...selected, subTypeId])
    }
  }

  const label = isActive ? `${bucket.label} · ${activeSubTypes.length}` : bucket.label

  return (
    <div
      style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}
      onMouseEnter={() => { clearTimer(); setOpenBucketId(bucket.id) }}
      onMouseLeave={scheduleClose}
    >
      <button
        className={`btb-tab${isActive ? ' active' : ''}`}
        style={isActive || open ? { borderBottomColor: bucket.color, color: isActive ? 'var(--t1)' : 'var(--t2)' } : undefined}
      >
        {label}
      </button>

      {open && (
        <div
          className="btb-panel"
          style={{ borderLeftColor: bucket.color }}
          onMouseEnter={clearTimer}
          onMouseLeave={scheduleClose}
        >
          {bucket.subTypes.map(sub => {
            const active = selected.includes(sub.id)
            return (
              <button
                key={sub.id}
                className={`btb-item${active ? ' active' : ''}`}
                style={active ? { borderLeftColor: bucket.color, paddingLeft: '8px' } : undefined}
                onClick={() => toggle(sub.id)}
              >
                {sub.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function BucketTabBar({ selected, onChange }: BucketTabBarProps) {
  const [openBucketId, setOpenBucketId] = useState<string | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {REPO_BUCKETS.map(bucket => (
        <BucketTab
          key={bucket.id}
          bucket={bucket}
          selected={selected}
          onChange={onChange}
          openBucketId={openBucketId}
          setOpenBucketId={setOpenBucketId}
          closeTimerRef={closeTimerRef}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify the file exists**

```bash
ls src/components/BucketTabBar.tsx
```

Expected: file listed.

---

## Task 2: Add `.btb-*` CSS classes and update filter row layout

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Update `.discover-filter-row`**

Find the `.discover-filter-row` rule in `src/styles/globals.css` (around line 6386). Change `justify-content: flex-end` to `justify-content: space-between`:

```css
.discover-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
```

- [ ] **Step 2: Append `.btb-*` classes**

At the end of `src/styles/globals.css`, append:

```css
/* ── BucketTabBar ────────────────────────────────────────────────── */
.btb-tab {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--t3);
  cursor: pointer;
  padding: 9px 0;
  margin-right: 16px;
  margin-bottom: -1px;
  border-bottom: 2px solid transparent;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.12s, border-color 0.12s;
}
.btb-tab:hover { color: var(--t2); }
.btb-tab.active {
  color: var(--t1);
  font-weight: 600;
}

.btb-panel {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 150;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-top: none;
  border-left: 2px solid;
  padding: 4px 0;
  min-width: 140px;
}

.btb-item {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 11px;
  color: var(--t2);
  background: none;
  border: none;
  border-left: 2px solid transparent;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s, color 0.1s;
}
.btb-item:hover {
  background: var(--bg3);
  color: var(--t1);
}
.btb-item.active {
  background: var(--accent-soft);
  color: var(--t1);
  font-weight: 500;
  padding-left: 8px;
}
```

- [ ] **Step 3: Verify no syntax errors**

```bash
npx tsc --noEmit 2>&1 | grep "globals.css" | head -5
```

Expected: no output (CSS files aren't type-checked; just confirming no import errors).

---

## Task 3: Write tests for `BucketTabBar`

**Files:**
- Create: `src/components/BucketTabBar.test.tsx`

- [ ] **Step 1: Write the test file**

Create `src/components/BucketTabBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import BucketTabBar from './BucketTabBar'
import { REPO_BUCKETS } from '../constants/repoTypes'

function renderBar(selected: string[] = [], onChange = vi.fn()) {
  return render(<BucketTabBar selected={selected} onChange={onChange} />)
}

describe('BucketTabBar', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders 6 bucket tab buttons with correct labels', () => {
    renderBar()
    for (const bucket of REPO_BUCKETS) {
      expect(screen.getByRole('button', { name: bucket.label })).toBeInTheDocument()
    }
    expect(REPO_BUCKETS).toHaveLength(6)
  })

  it('no panel is visible initially', () => {
    renderBar()
    // Sub-type labels only appear inside panels
    expect(screen.queryByRole('button', { name: 'Algorithm' })).not.toBeInTheDocument()
  })

  it('mouseenter on a tab shows its sub-type panel', () => {
    renderBar()
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Dev Tools' }).parentElement!)
    expect(screen.getByRole('button', { name: 'Algorithm' })).toBeInTheDocument()
  })

  it('mouseleave tab then 150ms — panel closes', () => {
    renderBar()
    const wrapper = screen.getByRole('button', { name: 'Dev Tools' }).parentElement!
    fireEvent.mouseEnter(wrapper)
    expect(screen.getByRole('button', { name: 'Algorithm' })).toBeInTheDocument()
    fireEvent.mouseLeave(wrapper)
    act(() => vi.advanceTimersByTime(150))
    expect(screen.queryByRole('button', { name: 'Algorithm' })).not.toBeInTheDocument()
  })

  it('mouseleave tab then mouseenter panel — panel stays open (timer cancelled)', () => {
    renderBar()
    const wrapper = screen.getByRole('button', { name: 'Dev Tools' }).parentElement!
    fireEvent.mouseEnter(wrapper)
    fireEvent.mouseLeave(wrapper)
    // Enter panel before timer fires
    const panel = wrapper.querySelector('.btb-panel')!
    fireEvent.mouseEnter(panel)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole('button', { name: 'Algorithm' })).toBeInTheDocument()
  })

  it('clicking a sub-type calls onChange with that sub-type id added', () => {
    const onChange = vi.fn()
    renderBar([], onChange)
    const wrapper = screen.getByRole('button', { name: 'Dev Tools' }).parentElement!
    fireEvent.mouseEnter(wrapper)
    fireEvent.click(screen.getByRole('button', { name: 'Algorithm' }))
    expect(onChange).toHaveBeenCalledWith(['algorithm'])
  })

  it('clicking an active sub-type deselects it', () => {
    const onChange = vi.fn()
    renderBar(['algorithm'], onChange)
    const wrapper = screen.getByRole('button', { name: /Dev Tools/ }).parentElement!
    fireEvent.mouseEnter(wrapper)
    fireEvent.click(screen.getByRole('button', { name: 'Algorithm' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('mouseenter Tab B while Tab A panel is open — Tab A closes immediately, Tab B opens', () => {
    renderBar()
    const devToolsWrapper = screen.getByRole('button', { name: 'Dev Tools' }).parentElement!
    const aiMlWrapper = screen.getByRole('button', { name: 'AI & ML' }).parentElement!
    fireEvent.mouseEnter(devToolsWrapper)
    expect(screen.getByRole('button', { name: 'Algorithm' })).toBeInTheDocument()
    // Enter Tab B without leaving Tab A first
    fireEvent.mouseEnter(aiMlWrapper)
    expect(screen.queryByRole('button', { name: 'Algorithm' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI Model' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests — expect failures (component not wired into DOM yet is fine, but logic should work)**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(BucketTabBar|PASS|FAIL|✓|✗)" | head -20
```

Expected: all 7 BucketTabBar tests PASS (the component file exists from Task 1).

If any fail, read the error carefully and fix `BucketTabBar.tsx` before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/components/BucketTabBar.tsx src/components/BucketTabBar.test.tsx src/styles/globals.css
git commit -m "feat: add BucketTabBar component with hover-reveal sub-type panels"
```

---

## Task 4: Wire `BucketTabBar` into `Discover.tsx` and remove `TypeFilterDropdown`

**Files:**
- Modify: `src/views/Discover.tsx`
- Delete: `src/components/TypeFilterDropdown.tsx`
- Delete: `src/components/TypeFilterDropdown.test.tsx`

- [ ] **Step 1: Update the import in `Discover.tsx`**

In `src/views/Discover.tsx`, line 13, replace:
```ts
import TypeFilterDropdown from '../components/TypeFilterDropdown'
```
with:
```ts
import BucketTabBar from '../components/BucketTabBar'
```

- [ ] **Step 2: Replace the filter row JSX**

Find the `discover-filter-row` div (around line 664). Replace the entire div with:

```tsx
{/* Filter row — left: bucket tabs, right: filters */}
<div className="discover-filter-row">
  <BucketTabBar selected={selectedTypes} onChange={setSelectedTypes} />
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <button
      className={`discover-verification-btn${activeVerification.has('verified') ? ' active' : ''}`}
      onClick={() => handleVerificationToggle('verified')}
      title="Official"
    >
      <span className="discover-verification-check">{activeVerification.has('verified') && <LuCheck size={9} />}</span>
      <ShieldCheck size={12} color="#7c3aed" fill="#7c3aed" />
    </button>
    <button
      className={`discover-verification-btn${activeVerification.has('likely') ? ' active' : ''}`}
      onClick={() => handleVerificationToggle('likely')}
      title="Partial Official"
    >
      <span className="discover-verification-check">{activeVerification.has('likely') && <LuCheck size={9} />}</span>
      <Shield size={12} color="#16a34a" fill="#16a34a" />
    </button>
    <div style={{ position: 'relative' }}>
      <button
        className={`discover-filter-icon-btn${filterBadgeCount > 0 ? ' has-filters' : ''}`}
        aria-label={filterBadgeCount > 0 ? `Filters (${filterBadgeCount} active)` : 'Filters'}
        onClick={() => setFilterDropdownOpen(o => !o)}
      >
        <LuFilter size={11} />
        Filters
        {filterBadgeCount > 0 && (
          <span className="filter-badge">{filterBadgeCount}</span>
        )}
      </button>
      {filterDropdownOpen && (
        <FilterDropdown
          initialTab={filterDropdownInitialTab}
          filters={appliedFilters}
          activeLanguage={activeLanguage}
          languages={LANGUAGES}
          onClose={(lastTab) => {
            setFilterDropdownInitialTab(lastTab)
            setFilterDropdownOpen(false)
          }}
          onChange={handleFilterChange}
        />
      )}
    </div>
    {/* Layout dropdown */}
    <LayoutDropdown prefs={layoutPrefs} onChange={handleLayoutChange} />
  </div>
</div>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "Discover.tsx" | head -10
```

Expected: no errors from `Discover.tsx`.

- [ ] **Step 4: Delete the old component files**

```bash
git rm src/components/TypeFilterDropdown.tsx src/components/TypeFilterDropdown.test.tsx
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|Tests |Test Files)" | tail -5
```

Expected: same 2 pre-existing failing test files (Discover.test.tsx IntersectionObserver, LayoutDropdown.test.tsx). No new failures.

- [ ] **Step 6: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: replace TypeFilterDropdown with BucketTabBar in Discover filter row"
```

---

## Task 5: Update `Discover.test.tsx` integration tests

**Files:**
- Modify: `src/views/Discover.test.tsx`

The existing `TypeFilterDropdown integration in Discover` describe block tests the old "Type ▾" click-to-open behaviour. Replace it with tests matching the new hover-to-open behaviour.

- [ ] **Step 1: Find the describe block**

In `src/views/Discover.test.tsx`, find the block starting at line 142:
```ts
describe('TypeFilterDropdown integration in Discover', () => {
```

- [ ] **Step 2: Replace the entire block**

Replace it with:

```tsx
describe('BucketTabBar integration in Discover', () => {
  beforeEach(() => {
    makeDiscoverApi()
  })

  it('renders all 6 bucket tab labels in the filter row', () => {
    renderDiscover()
    expect(screen.getByRole('button', { name: 'Dev Tools' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI & ML' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Utilities' })).toBeInTheDocument()
  })

  it('does not render sub-type labels before hovering', () => {
    renderDiscover()
    expect(screen.queryByRole('button', { name: 'Algorithm' })).not.toBeInTheDocument()
  })

  it('hovering a bucket tab shows its sub-type panel', () => {
    renderDiscover()
    const devToolsWrapper = screen.getByRole('button', { name: 'Dev Tools' }).parentElement!
    fireEvent.mouseEnter(devToolsWrapper)
    expect(screen.getByRole('button', { name: 'Algorithm' })).toBeInTheDocument()
  })

  it('clicking a sub-type adds it to the filter', () => {
    renderDiscover()
    const devToolsWrapper = screen.getByRole('button', { name: 'Dev Tools' }).parentElement!
    fireEvent.mouseEnter(devToolsWrapper)
    fireEvent.click(screen.getByRole('button', { name: 'Algorithm' }))
    // Tab label updates to show count
    expect(screen.getByRole('button', { name: /Dev Tools · 1/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(BucketTabBar|TypeFilter|FAIL|Tests |Test Files)" | tail -10
```

Expected: BucketTabBar integration tests pass. No new failures beyond the pre-existing 2 files.

- [ ] **Step 4: Commit**

```bash
git add src/views/Discover.test.tsx
git commit -m "test: update Discover integration tests for BucketTabBar"
```

---

## Done

After Task 5, run the full suite one final time:

```bash
npm test 2>&1 | grep -E "(Tests |Test Files)" | tail -3
```

Expected: 2 failing test files (pre-existing), all BucketTabBar and integration tests passing.
