# Discover Top Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the left sidebar on the Discover page with a compact glass pill nav floating at the top-center, keeping the same Home / Browse / Blocks / Filters functionality.

**Architecture:** `DiscoverTopNav` is a new `position: fixed` component that accepts the same props as `DiscoverSidebar`. `FilterPanel` and `AdvancedPanel` are exported from `DiscoverSidebar.tsx` and imported into `DiscoverTopNav`. `Discover.tsx` swaps in the new component — the `discover-layout` wrapper and `discover-main` structure are otherwise unchanged.

**Tech Stack:** React 18, TypeScript, CSS (no new deps), vitest + @testing-library/react for tests.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/components/DiscoverSidebar.tsx` | Export `FilterPanel` and `AdvancedPanel` |
| Create | `src/components/DiscoverTopNav.test.tsx` | Tests for the pill nav |
| Create | `src/components/DiscoverTopNav.tsx` | Pill nav + panel orchestration |
| Create | `src/components/DiscoverTopNav.css` | Styles for pill, buttons, badge, panel |
| Modify | `src/views/Discover.tsx` | Swap `<DiscoverSidebar>` → `<DiscoverTopNav>` |

---

## Task 1: Export the panel components from DiscoverSidebar

**Files:**
- Modify: `src/components/DiscoverSidebar.tsx:152` (FilterPanel declaration)
- Modify: `src/components/DiscoverSidebar.tsx:581` (AdvancedPanel declaration)

- [ ] **Step 1: Add `export` to FilterPanel and AdvancedPanel**

In `src/components/DiscoverSidebar.tsx`, make these two one-word changes:

```diff
-function FilterPanel({
+export function FilterPanel({
```

```diff
-function AdvancedPanel({
+export function AdvancedPanel({
```

No other changes to this file.

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
npx vitest run src/components/DiscoverSidebar.test.tsx
```

Expected: all tests pass (the exports don't change any behavior).

- [ ] **Step 3: Commit**

```bash
git add src/components/DiscoverSidebar.tsx
git commit -m "refactor(discover): export FilterPanel and AdvancedPanel for reuse"
```

---

## Task 2: Write failing tests for DiscoverTopNav

**Files:**
- Create: `src/components/DiscoverTopNav.test.tsx`

- [ ] **Step 1: Create the test file**

Create `src/components/DiscoverTopNav.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DiscoverTopNav from './DiscoverTopNav'

const baseProps = {
  selectedSubtypes: [],
  onSelectedSubtypesChange: vi.fn(),
  filters: {},
  selectedLanguages: [],
  activeVerification: new Set<'verified' | 'likely'>(),
  onFilterChange: vi.fn(),
  onSelectedLanguagesChange: vi.fn(),
  onVerificationToggle: vi.fn(),
  activePanel: null as 'buckets' | 'filters' | 'advanced' | null,
  onActivePanelChange: vi.fn(),
  showLanding: false,
  onHomeClick: vi.fn(),
  onBrowseClick: vi.fn(),
}

describe('DiscoverTopNav — rendering', () => {
  it('renders without crashing', () => {
    expect(() => render(<DiscoverTopNav {...baseProps} />)).not.toThrow()
  })

  it('shows Home and Browse buttons', () => {
    render(<DiscoverTopNav {...baseProps} />)
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument()
  })

  it('shows Blocks and Filters buttons', () => {
    render(<DiscoverTopNav {...baseProps} />)
    expect(screen.getByRole('button', { name: /blocks/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument()
  })
})

describe('DiscoverTopNav — active state', () => {
  it('Home button has active class when showLanding is true', () => {
    render(<DiscoverTopNav {...baseProps} showLanding={true} />)
    expect(screen.getByRole('button', { name: /home/i })).toHaveClass('dtn-btn-active')
  })

  it('Browse button has active class when showLanding is false', () => {
    render(<DiscoverTopNav {...baseProps} showLanding={false} />)
    expect(screen.getByRole('button', { name: /browse/i })).toHaveClass('dtn-btn-active')
  })
})

describe('DiscoverTopNav — panel toggle', () => {
  it('calls onActivePanelChange("filters") when Blocks is clicked and panel is closed', () => {
    const onActivePanelChange = vi.fn()
    render(<DiscoverTopNav {...baseProps} onActivePanelChange={onActivePanelChange} />)
    fireEvent.click(screen.getByRole('button', { name: /blocks/i }))
    expect(onActivePanelChange).toHaveBeenCalledWith('filters')
  })

  it('calls onActivePanelChange(null) when Blocks is clicked and filters panel is open', () => {
    const onActivePanelChange = vi.fn()
    render(<DiscoverTopNav {...baseProps} activePanel="filters" onActivePanelChange={onActivePanelChange} />)
    fireEvent.click(screen.getByRole('button', { name: /blocks/i }))
    expect(onActivePanelChange).toHaveBeenCalledWith(null)
  })

  it('calls onActivePanelChange("advanced") when Filters is clicked and panel is closed', () => {
    const onActivePanelChange = vi.fn()
    render(<DiscoverTopNav {...baseProps} onActivePanelChange={onActivePanelChange} />)
    fireEvent.click(screen.getByRole('button', { name: /filters/i }))
    expect(onActivePanelChange).toHaveBeenCalledWith('advanced')
  })

  it('treats activePanel="buckets" as null (no panel rendered)', () => {
    render(<DiscoverTopNav {...baseProps} activePanel="buckets" />)
    // Neither panel content should appear
    expect(screen.queryByText('Blocks')).not.toBeNull() // button exists
    expect(screen.queryByText('Language')).not.toBeInTheDocument() // FilterPanel not shown
    expect(screen.queryByText('Stars')).not.toBeInTheDocument() // AdvancedPanel not shown
  })
})

describe('DiscoverTopNav — badges', () => {
  it('shows Blocks badge when languages are selected', () => {
    render(<DiscoverTopNav {...baseProps} selectedLanguages={['typescript', 'rust']} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows Blocks badge combining languages and subtypes', () => {
    render(<DiscoverTopNav {...baseProps} selectedLanguages={['python']} selectedSubtypes={['cli-tool']} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows Filters badge when stars filter is active', () => {
    render(<DiscoverTopNav {...baseProps} filters={{ stars: 1000 }} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows no badge when nothing is selected', () => {
    render(<DiscoverTopNav {...baseProps} />)
    // No badge text — numbers '1', '2', etc. should not appear
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
})

describe('DiscoverTopNav — panel content', () => {
  it('shows FilterPanel content when activePanel is "filters"', () => {
    render(<DiscoverTopNav {...baseProps} activePanel="filters" />)
    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('shows AdvancedPanel content when activePanel is "advanced"', () => {
    render(<DiscoverTopNav {...baseProps} activePanel="advanced" />)
    expect(screen.getByText('Stars')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
npx vitest run src/components/DiscoverTopNav.test.tsx
```

Expected: `Cannot find module './DiscoverTopNav'` — confirms tests are wired correctly.

---

## Task 3: Create DiscoverTopNav.css

**Files:**
- Create: `src/components/DiscoverTopNav.css`

- [ ] **Step 1: Write the stylesheet**

Create `src/components/DiscoverTopNav.css`:

```css
/* ── Pill container ──────────────────────────────────────────── */

.discover-top-nav {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  padding: 5px 6px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.04) inset;
  z-index: 200;
  -webkit-app-region: drag;
}

/* ── Buttons ─────────────────────────────────────────────────── */

.dtn-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  color: rgba(255, 255, 255, 0.5);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  -webkit-app-region: no-drag;
  white-space: nowrap;
  position: relative;
}

.dtn-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
}

.dtn-btn.dtn-btn-active {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.dtn-btn svg {
  flex-shrink: 0;
}

/* ── Separator ───────────────────────────────────────────────── */

.dtn-sep {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 4px;
  flex-shrink: 0;
}

/* ── Logo ────────────────────────────────────────────────────── */

.dtn-logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  margin: 0 3px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* ── Badge ───────────────────────────────────────────────────── */

.dtn-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  background: var(--t1);
  color: var(--bg);
  font-size: 9px;
  font-weight: 700;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  line-height: 1;
  pointer-events: none;
}

/* ── Drop panel ──────────────────────────────────────────────── */

/*
  The pill is position:fixed — its absolute children are positioned
  relative to the pill's own box, not the viewport.
*/
.dtn-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 14px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 10;
}
```

---

## Task 4: Implement DiscoverTopNav.tsx

**Files:**
- Create: `src/components/DiscoverTopNav.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/DiscoverTopNav.tsx`:

```tsx
import { useRef, useEffect } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { FilterPanel, AdvancedPanel, type DiscoverSidebarProps } from './DiscoverSidebar'
import logoSrc from '../assets/logo.png'
import './DiscoverTopNav.css'

function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  )
}

function BrowseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  )
}

function BlocksIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" />
    </svg>
  )
}

export default function DiscoverTopNav(props: DiscoverSidebarProps) {
  const {
    selectedSubtypes, onSelectedSubtypesChange,
    filters, selectedLanguages, activeVerification,
    onFilterChange, onSelectedLanguagesChange, onVerificationToggle,
    activePanel, onActivePanelChange,
    showLanding, onHomeClick, onBrowseClick,
    mode = 'discover', skillStatus, onSkillStatusChange, itemCounts,
  } = props

  const pillRef = useRef<HTMLDivElement>(null)

  // Normalize 'buckets' → null (top nav never produces 'buckets')
  const resolvedPanel = activePanel === 'buckets' ? null : activePanel

  const filterCount = selectedLanguages.length + selectedSubtypes.length
  const advancedCount =
    (filters.stars    ? 1 : 0) +
    (filters.activity ? 1 : 0) +
    (filters.license  ? 1 : 0) +
    activeVerification.size

  const toggle = (panel: 'filters' | 'advanced') => {
    onActivePanelChange(resolvedPanel === panel ? null : panel)
  }

  // Single pill ref covers both pill and panels (panels are absolute children of pill)
  useEffect(() => {
    if (!resolvedPanel) return
    const handler = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        onActivePanelChange(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [resolvedPanel, onActivePanelChange])

  return (
    <div ref={pillRef} className="discover-top-nav">
      <button
        type="button"
        className={`dtn-btn${showLanding ? ' dtn-btn-active' : ''}`}
        onClick={onHomeClick}
        aria-label="Home"
      >
        <HomeIcon />
        <span>Home</span>
      </button>

      <button
        type="button"
        className={`dtn-btn${!showLanding ? ' dtn-btn-active' : ''}`}
        onClick={onBrowseClick}
        aria-label="Browse"
      >
        <BrowseIcon />
        <span>Browse</span>
      </button>

      <span className="dtn-sep" aria-hidden="true" />

      <img src={logoSrc} alt="Git Suite" className="dtn-logo" />

      <span className="dtn-sep" aria-hidden="true" />

      <button
        type="button"
        className={`dtn-btn${resolvedPanel === 'filters' ? ' dtn-btn-active' : ''}`}
        onClick={() => toggle('filters')}
        aria-label="Blocks"
      >
        <BlocksIcon />
        <span>Blocks</span>
        {filterCount > 0 && resolvedPanel !== 'filters' && (
          <span className="dtn-badge">{filterCount}</span>
        )}
      </button>

      <button
        type="button"
        className={`dtn-btn${resolvedPanel === 'advanced' ? ' dtn-btn-active' : ''}`}
        onClick={() => toggle('advanced')}
        aria-label="Filters"
      >
        <SlidersHorizontal size={13} />
        <span>Filters</span>
        {advancedCount > 0 && resolvedPanel !== 'advanced' && (
          <span className="dtn-badge">{advancedCount}</span>
        )}
      </button>

      {resolvedPanel === 'filters' && (
        <div className="dtn-panel">
          <FilterPanel
            selectedLanguages={selectedLanguages}
            onSelectedLanguagesChange={onSelectedLanguagesChange}
            selectedSubtypes={selectedSubtypes}
            onSelectedSubtypesChange={onSelectedSubtypesChange}
            itemCounts={itemCounts}
          />
        </div>
      )}

      {resolvedPanel === 'advanced' && (
        <div className="dtn-panel">
          <AdvancedPanel
            filters={filters}
            activeVerification={activeVerification}
            onFilterChange={onFilterChange}
            onVerificationToggle={onVerificationToggle}
            mode={mode ?? 'discover'}
            skillStatus={skillStatus}
            onSkillStatusChange={onSkillStatusChange}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the tests — all should pass**

```bash
npx vitest run src/components/DiscoverTopNav.test.tsx
```

Expected: all tests pass. If any fail, diagnose before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/components/DiscoverTopNav.tsx src/components/DiscoverTopNav.css src/components/DiscoverTopNav.test.tsx
git commit -m "feat(discover): add DiscoverTopNav pill component"
```

---

## Task 5: Wire DiscoverTopNav into Discover.tsx

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Swap the import**

In `src/views/Discover.tsx`, change:

```diff
-import DiscoverSidebar, { type SearchFilters } from '../components/DiscoverSidebar'
+import DiscoverSidebar, { type SearchFilters } from '../components/DiscoverSidebar'
+import DiscoverTopNav from '../components/DiscoverTopNav'
```

Actually, `SearchFilters` is still needed (used for `appliedFilters` state type). Keep the `DiscoverSidebar` import for the type, just add the new import:

```diff
 import DiscoverSidebar, { type SearchFilters } from '../components/DiscoverSidebar'
+import DiscoverTopNav from '../components/DiscoverTopNav'
```

- [ ] **Step 2: Verify discover-main has no sidebar left-offset**

Before editing JSX, grep for any left-margin or left-padding offset on `.discover-main` in the CSS files:

```bash
grep -n "discover-main" src/styles/globals.css src/components/DiscoverSidebar.css
```

Look for any `margin-left`, `padding-left`, or similar property. In the current codebase `.discover-main` in `globals.css:1388` has `flex: 1; min-width: 0` with no explicit left offset — the content already fills full width because the sidebar is `position: fixed` (not in the flex flow). **If you find a left-offset rule, remove it.** If not, no CSS change is needed.

> **Note on discover-layout:** The spec mentions removing the `discover-layout` wrapper, but this plan retains it intentionally. `discover-main` uses `flex: 1` which requires a flex parent — removing `discover-layout` without also converting `.discover-main` to use `height: 100%; width: 100%` would break its sizing. Keeping the wrapper is safe and produces identical visual output.

- [ ] **Step 3: Replace the component in the JSX**

Find the `<div className="discover-layout">` block in the render (around line 913). It currently looks like:

```tsx
<div className="discover-layout">
  <DiscoverSidebar
    selectedSubtypes={selectedSubtypes}
    onSelectedSubtypesChange={(s) => { setShowLanding(false); setSelectedSubtypes(s) }}
    filters={appliedFilters}
    selectedLanguages={selectedLanguages}
    activeVerification={activeVerification}
    onFilterChange={handleFilterChange}
    onSelectedLanguagesChange={(langs) => { setShowLanding(false); setSelectedLanguages(langs) }}
    onVerificationToggle={handleVerificationToggle}
    activePanel={activePanel}
    onActivePanelChange={setActivePanel}
    showLanding={showLanding}
    onHomeClick={handleHomeClick}
    onBrowseClick={exitLanding}
  />
  <div className="discover-main">
```

Change it to:

```tsx
<div className="discover-layout">
  <DiscoverTopNav
    selectedSubtypes={selectedSubtypes}
    onSelectedSubtypesChange={(s) => { setShowLanding(false); setSelectedSubtypes(s) }}
    filters={appliedFilters}
    selectedLanguages={selectedLanguages}
    activeVerification={activeVerification}
    onFilterChange={handleFilterChange}
    onSelectedLanguagesChange={(langs) => { setShowLanding(false); setSelectedLanguages(langs) }}
    onVerificationToggle={handleVerificationToggle}
    activePanel={activePanel}
    onActivePanelChange={setActivePanel}
    showLanding={showLanding}
    onHomeClick={handleHomeClick}
    onBrowseClick={exitLanding}
  />
  <div className="discover-main">
```

The only JSX change is `DiscoverSidebar` → `DiscoverTopNav`. All props are identical.

- [ ] **Step 4: Confirm scrollRef still attaches**

In `Discover.tsx`, `scrollRef` is attached to `discover-content` (a div inside `discover-main`). Since `discover-main` is unchanged structurally, this attachment is preserved. Visually confirm the ref is still on the same element — search for `ref={scrollRef}` in `Discover.tsx` and make sure it's inside `discover-main`.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. The DiscoverSidebar tests still pass (component unchanged). The DiscoverTopNav tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat(discover): use top nav pill on Discover page"
```

---

## Done

At this point the Discover page shows the floating pill nav at the top center. The sidebar rail no longer renders on Discover. All other pages (Library, etc.) continue using `DiscoverSidebar` unchanged.
