# Discover Sub-Tab Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Discover view mode tabs (Recommended, Most Popular, Most Forked, Rising) from the content area into the sidebar as nested sub-tabs with icons, and show the active mode icon in the NavBar breadcrumb.

**Architecture:** State management via URL search param `?view=` on `/discover` route. Sidebar reads the param to render accent-rail sub-tabs; NavBar reads it for breadcrumb icon+label. Snapshot store reconciliation on back-navigation via `replace: true`. DiscoverModeTabs component deleted.

**Tech Stack:** React, React Router (MemoryRouter), TypeScript, CSS

**Spec:** `docs/superpowers/specs/2026-04-09-discover-subtab-navigation-design.md`

---

### Task 1: Add view mode icon components and data

**Files:**
- Create: `src/components/ViewModeIcons.tsx`
- Modify: `src/lib/discoverQueries.ts`

- [ ] **Step 1: Create `ViewModeIcons.tsx` with four icon components**

```tsx
// src/components/ViewModeIcons.tsx
import type { ViewModeKey } from '../lib/discoverQueries'

export function RecommendedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="view-mode-icon">
      <path d="M8 2 L9.2 6.2 L13 6.5 L10 9.2 L11 13.5 L8 11 L5 13.5 L6 9.2 L3 6.5 L6.8 6.2Z"/>
    </svg>
  )
}

export function PopularIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="view-mode-icon">
      <path d="M8 1.5 C8 1.5 3 5.5 3 9.5 C3 12 5.2 14 8 14 C10.8 14 13 12 13 9.5 C13 5.5 8 1.5 8 1.5Z"/>
      <path d="M8 8 C8 8 6 9.5 6 11 C6 12.1 6.9 13 8 13 C9.1 13 10 12.1 10 11 C10 9.5 8 8 8 8Z"/>
    </svg>
  )
}

export function ForkedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="view-mode-icon">
      <circle cx="8" cy="3" r="1.5"/>
      <circle cx="4.5" cy="13" r="1.5"/>
      <circle cx="11.5" cy="13" r="1.5"/>
      <path d="M8 4.5 L8 7 L4.5 11.5"/>
      <path d="M8 7 L11.5 11.5"/>
    </svg>
  )
}

export function RisingIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="view-mode-icon">
      <path d="M2 13 L6 7 L9.5 10 L14 3"/>
      <path d="M10.5 3 L14 3 L14 6.5"/>
    </svg>
  )
}

export const VIEW_MODE_ICONS: Record<ViewModeKey, (props: { size?: number }) => JSX.Element> = {
  recommended: RecommendedIcon,
  popular: PopularIcon,
  forked: ForkedIcon,
  rising: RisingIcon,
}
```

- [ ] **Step 2: Export `ViewModeKey` type from `discoverQueries.ts`**

Verify `ViewModeKey` is already exported (it is — `export type ViewModeKey`). No change needed. Confirm by reading the file.

- [ ] **Step 3: Commit**

```bash
git add src/components/ViewModeIcons.tsx
git commit -m "feat: add view mode icon components for discover sub-tabs"
```

---

### Task 2: Fix `discoverStateStore.ts` type import

**Files:**
- Modify: `src/lib/discoverStateStore.ts:1-9`

- [ ] **Step 1: Replace local `ViewModeKey` type with import**

In `src/lib/discoverStateStore.ts`, add an import on line 8 (after the `RepoRow` import) and delete the local type on line 9:

Replace:
```ts
import type { RepoRow } from '../types/repo'

type ViewModeKey = 'recommended' | 'popular' | 'forked' | 'rising'
```

With:
```ts
import type { RepoRow } from '../types/repo'
import type { ViewModeKey } from './discoverQueries'
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors related to `discoverStateStore.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/discoverStateStore.ts
git commit -m "refactor: import ViewModeKey from discoverQueries instead of local declaration"
```

---

### Task 3: Add sidebar sub-tab styles

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add accent rail sub-tab CSS after the `.nav-item.active .nav-icon` rule (around line 435)**

```css
/* ── Discover sub-tabs (accent rail) ─────────────────────────── */
.sidebar-subtabs {
  margin-left: 18px;
  border-left: 2px solid var(--border);
  padding-left: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 2px;
  margin-top: 2px;
}

.sidebar-subtab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-left: -2px;
  padding-left: 10px;
  border-left: 2px solid transparent;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 400;
  color: var(--t3);
  cursor: pointer;
  border-top: none;
  border-right: none;
  border-bottom: none;
  background: none;
  border-radius: 0 4px 4px 0;
  white-space: nowrap;
  text-align: left;
}

.sidebar-subtab:hover {
  color: var(--t2);
  background: var(--bg3);
}

.sidebar-subtab.active {
  color: var(--accent-text);
  background: var(--accent-soft);
  border-left-color: var(--accent);
  font-weight: 500;
}

.sidebar-subtab .view-mode-icon {
  opacity: 0.5;
  flex-shrink: 0;
}

.sidebar-subtab.active .view-mode-icon {
  opacity: 1;
}

/* ── Collapsed sidebar sub-tab icons ─────────────────────────── */
.sidebar-subtabs-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-bottom: 4px;
}

.sidebar-subtab-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: none;
  background: none;
  color: var(--t3);
  cursor: pointer;
  padding: 0;
}

.sidebar-subtab-icon:hover {
  background: var(--bg3);
  color: var(--t2);
}

.sidebar-subtab-icon.active {
  background: var(--accent-soft);
  color: var(--accent-text);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add sidebar sub-tab accent rail and collapsed icon CSS"
```

---

### Task 4: Add sub-tabs to Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add imports at top of file**

Add after the existing imports (line 3). Also add `Fragment` to the existing `import { useState, useEffect, useRef } from 'react'` on line 1:

```tsx
import { useState, useEffect, useRef, Fragment } from 'react'
```

And add these new imports:

```tsx
import { useSearchParams } from 'react-router-dom'
import { VIEW_MODES, type ViewModeKey } from '../lib/discoverQueries'
import { VIEW_MODE_ICONS } from './ViewModeIcons'
```

- [ ] **Step 2: Add helper to read current view mode from search params**

Inside the `Sidebar` component function (after the existing state declarations around line 119), add:

```tsx
const [searchParams] = useSearchParams()
const isDiscover = location.pathname.startsWith('/discover')
const currentViewMode: ViewModeKey = (() => {
  if (!isDiscover) return 'recommended'
  const v = searchParams.get('view')
  return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
})()
```

- [ ] **Step 3: Render expanded sub-tabs after the Discover nav item**

Replace the `sidebar-nav` section (lines 198-211) with:

```tsx
<nav className="sidebar-nav">
  {NAV_ITEMS.map(({ label, path, icon }) => (
    <Fragment key={label}>
      <button
        data-nav
        className={`nav-item${location.pathname === path || (path === '/discover' && isDiscover) ? ' active' : ''}`}
        onClick={() => navigate(path)}
        title={collapsed ? label : undefined}
      >
        {icon}
        {!collapsed && label}
      </button>
      {/* Discover sub-tabs */}
      {path === '/discover' && isDiscover && !collapsed && (
        <div className="sidebar-subtabs">
          {VIEW_MODES.map(vm => {
            const Icon = VIEW_MODE_ICONS[vm.key]
            return (
              <button
                key={vm.key}
                className={`sidebar-subtab${currentViewMode === vm.key ? ' active' : ''}`}
                onClick={() => navigate(`/discover?view=${vm.key}`)}
                aria-current={currentViewMode === vm.key ? 'page' : undefined}
              >
                <Icon size={14} />
                {vm.label}
              </button>
            )
          })}
        </div>
      )}
      {/* Collapsed sub-tab icons */}
      {path === '/discover' && isDiscover && collapsed && (
        <div className="sidebar-subtabs-collapsed">
          {VIEW_MODES.map(vm => {
            const Icon = VIEW_MODE_ICONS[vm.key]
            return (
              <button
                key={vm.key}
                className={`sidebar-subtab-icon${currentViewMode === vm.key ? ' active' : ''}`}
                onClick={() => navigate(`/discover?view=${vm.key}`)}
                title={vm.label}
                aria-label={vm.label}
              >
                <Icon size={12} />
              </button>
            )
          })}
        </div>
      )}
    </Fragment>
  ))}
</nav>
```

Note: Add `import React from 'react'` at the top if not already present, or use `<></>` fragments instead (the existing file imports from `'react'` — check if `React` is in scope for `React.Fragment`). If the file uses named imports like `import { useState, ... } from 'react'`, add `Fragment` to that import and use `<Fragment>` instead of `<React.Fragment>`.

- [ ] **Step 4: Fix the Discover nav item active state**

The current code uses `location.pathname === path` which means Discover is only active on exact `/discover`. Update the active check for Discover specifically: when `path === '/discover'`, use `isDiscover` (which is `pathname.startsWith('/discover')`). This is already handled in the replacement code above via the `(path === '/discover' && isDiscover)` condition.

- [ ] **Step 5: Run type check and dev server to verify visually**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add discover sub-tabs to sidebar with accent rail"
```

---

### Task 5: Update NavBar breadcrumb for Discover sub-tabs

**Files:**
- Modify: `src/components/NavBar.tsx`

- [ ] **Step 1: Add imports**

Add after existing imports:

```tsx
import { useSearchParams } from 'react-router-dom'
import { VIEW_MODES, type ViewModeKey } from '../lib/discoverQueries'
import { VIEW_MODE_ICONS } from './ViewModeIcons'
```

- [ ] **Step 2: Add search param reading inside the NavBar component**

After `const path = location.pathname` (line 38), add:

```tsx
const [searchParams] = useSearchParams()
```

- [ ] **Step 3: Remove `/discover` from `ROUTE_LABELS`**

It's now handled by the dedicated branch below, so remove the dead entry:

```tsx
const ROUTE_LABELS: Record<string, string> = {
  '/library':     'My Library',
  '/collections': 'Collections',
  '/starred':     'Starred',
  '/settings':    'Settings',
}
```

- [ ] **Step 4: Update the non-repo breadcrumb logic**

Replace the `else` block (lines 111-114):

```tsx
  } else {
    const label = ROUTE_LABELS[path]
    if (label) segments.push({ label })
  }
```

with:

```tsx
  } else if (path.startsWith('/discover')) {
    // Discover with sub-tab icon in breadcrumb
    const v = searchParams.get('view')
    const viewMode: ViewModeKey = (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
    const vm = VIEW_MODES.find(m => m.key === viewMode)!
    const Icon = VIEW_MODE_ICONS[viewMode]

    segments.push({ label: 'Discover', onClick: () => navigate('/discover') })
    segments.push({
      label: vm.label,
      icon: <Icon size={12} />,
    })
  } else {
    const label = ROUTE_LABELS[path]
    if (label) segments.push({ label })
  }
```

- [ ] **Step 5: Add CSS for view-mode-icon spacing in URL bar**

In `src/styles/globals.css`, add after the `.app-navbar-url-fileicon` rule (around line 1547):

```css
.app-navbar-url-current .view-mode-icon {
  margin-right: 3px;
}
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/components/NavBar.tsx src/styles/globals.css
git commit -m "feat: show discover view mode icon in NavBar breadcrumb"
```

---

### Task 6: Update Discover.tsx to use URL param for viewMode

**Files:**
- Modify: `src/views/Discover.tsx`

The URL `?view=` param is the single source of truth. Instead of syncing a local state with the URL bidirectionally, derive `viewMode` directly from `searchParams`. A one-time mount effect handles snapshot restore by writing to the URL.

- [ ] **Step 1: Move `useSearchParams` to top of component and remove duplicate**

The existing `const [searchParams, setSearchParams] = useSearchParams()` is on line 163. Move it up to the top of the component (after line 70, near other hook calls). Remove the line 163 occurrence.

- [ ] **Step 2: Replace local viewMode state with derived value**

Replace the viewMode initialization (lines 81-84):

```tsx
const [viewMode, setViewMode] = useState<ViewModeKey>(() => {
  const v = restoredSnapshot.current?.viewMode
  return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
})
```

with a derived value:

```tsx
const viewMode: ViewModeKey = (() => {
  const v = searchParams.get('view')
  return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
})()
```

- [ ] **Step 3: Add snapshot restore effect**

Add a one-time effect that syncs the URL param from the snapshot on back-navigation:

```tsx
// On back-navigation, restore viewMode from snapshot into URL param
useEffect(() => {
  if (restoredSnapshot.current?.viewMode) {
    const snapshotView = restoredSnapshot.current.viewMode
    const urlView = searchParams.get('view') ?? 'recommended'
    if (snapshotView !== urlView) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('view', snapshotView)
        return next
      }, { replace: true })
    }
  }
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Create a `setViewMode` helper for internal callers**

Some code inside Discover.tsx calls `setViewMode` (e.g., when resetting state). Create a helper that writes to the URL:

```tsx
const setViewMode = (mode: ViewModeKey) => {
  setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('view', mode)
    return next
  }, { replace: true })
}
```

This keeps the same API for any internal callers that previously used `setViewMode`.

- [ ] **Step 5: Remove DiscoverModeTabs import and usage**

Remove the import (line 24):
```tsx
import DiscoverModeTabs from '../components/DiscoverModeTabs'
```

Remove the tab row in the render (lines 738-741):
```tsx
      {/* Tab row */}
      <div className="discover-view-row">
        <DiscoverModeTabs viewMode={viewMode} onChange={setViewMode} />
      </div>
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: drive discover viewMode from URL search param, remove DiscoverModeTabs"
```

---

### Task 7: Delete DiscoverModeTabs and clean up CSS

**Files:**
- Delete: `src/components/DiscoverModeTabs.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Delete the component file**

```bash
rm src/components/DiscoverModeTabs.tsx
```

- [ ] **Step 2: Remove the `.discover-view-tabs` and `.view-tab` CSS**

In `src/styles/globals.css`, remove the block from `.discover-view-tabs` through `.view-tab.active` (lines 1024-1052):

```css
.discover-view-tabs {
  display: flex;
  gap: 0;
}

.view-tab {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--t3);
  cursor: pointer;
  ...
}
.view-tab:hover { color: var(--t2); }
.view-tab.active {
  color: var(--t1);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
```

Also remove the `.discover-view-row` styles if they exist (search for `discover-view-row` in the CSS).

- [ ] **Step 3: Verify no remaining references**

Run: `grep -r "DiscoverModeTabs\|discover-view-tabs\|view-tab" src/` — should find nothing.

- [ ] **Step 4: Commit**

```bash
git add -u src/components/DiscoverModeTabs.tsx src/styles/globals.css
git commit -m "chore: delete DiscoverModeTabs component and related CSS"
```

---

### Task 8: Update Sidebar tests

**Files:**
- Modify: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Add test for sub-tabs visible on /discover route**

```tsx
it('shows discover sub-tabs when on /discover route', async () => {
  setupApi('testuser')
  renderWithRouter('/discover')
  await waitFor(() => {
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Most Popular')).toBeInTheDocument()
    expect(screen.getByText('Most Forked')).toBeInTheDocument()
    expect(screen.getByText('Rising')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Add test for sub-tabs hidden on other routes**

```tsx
it('hides discover sub-tabs on non-discover routes', async () => {
  setupApi('testuser')
  renderWithRouter('/library')
  await waitFor(() => {
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument()
    expect(screen.queryByText('Most Popular')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Add test for active sub-tab from URL param**

```tsx
it('highlights active sub-tab from URL search param', async () => {
  setupApi('testuser')
  renderWithRouter('/discover?view=popular')
  await waitFor(() => {
    const popularBtn = screen.getByText('Most Popular').closest('button')
    expect(popularBtn).toHaveClass('active')
  })
})
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/Sidebar.test.tsx`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.test.tsx
git commit -m "test: add sidebar discover sub-tab tests"
```

---

### Task 9: Visual verification and polish

- [ ] **Step 1: Start dev server and verify all states**

Run: `npm run dev`

Check:
1. Discover route shows accent rail sub-tabs in sidebar
2. Clicking sub-tabs changes the view and URL param updates
3. NavBar shows `Git Suite / Discover / [icon] Label`
4. Collapsing sidebar shows stacked icons below Discover
5. Navigating to Library hides sub-tabs
6. Back button from a repo detail page restores correct sub-tab
7. Direct navigation to `/discover?view=forked` selects Most Forked

- [ ] **Step 2: Fix any visual issues with spacing or alignment**

Adjust CSS values as needed for pixel-perfect alignment with existing nav items.

- [ ] **Step 3: Final commit if adjustments made**

```bash
git add -A
git commit -m "style: polish discover sub-tab spacing and alignment"
```
