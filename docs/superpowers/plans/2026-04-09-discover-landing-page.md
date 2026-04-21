# Discover Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google-style search landing page as the default Discover view, with logo + wordmark, centered search bar, and sub-section pills.

**Architecture:** Landing state is represented as `viewMode: null` (not a new ViewModeKey). When no `?view=` query param is present, Discover renders a `DiscoverLanding` component instead of the filter bar + grid. Searching or clicking a pill transitions to the existing results UI.

**Tech Stack:** React, TypeScript, React Router, CSS

**Spec:** `docs/superpowers/specs/2026-04-09-discover-landing-page-design.md`

---

### Task 1: Create `DiscoverLanding` Component with Tests

**Files:**
- Create: `src/components/DiscoverLanding.tsx`
- Create: `src/components/DiscoverLanding.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/DiscoverLanding.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DiscoverLanding from './DiscoverLanding'

describe('DiscoverLanding', () => {
  const onSearch = vi.fn()
  const onSelectMode = vi.fn()

  beforeEach(() => {
    onSearch.mockClear()
    onSelectMode.mockClear()
  })

  it('renders logo, wordmark, search input, and 4 pills', () => {
    render(<DiscoverLanding onSearch={onSearch} onSelectMode={onSelectMode} />)
    expect(screen.getByAltText('Git Suite')).toBeInTheDocument()
    expect(screen.getByText('Git Suite')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search repositories...')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Most Popular')).toBeInTheDocument()
    expect(screen.getByText('Most Forked')).toBeInTheDocument()
    expect(screen.getByText('Rising')).toBeInTheDocument()
  })

  it('calls onSearch when Enter is pressed with a query', () => {
    render(<DiscoverLanding onSearch={onSearch} onSelectMode={onSelectMode} />)
    const input = screen.getByPlaceholderText('Search repositories...')
    fireEvent.change(input, { target: { value: 'react' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSearch).toHaveBeenCalledWith('react')
  })

  it('does not call onSearch when Enter is pressed with empty query', () => {
    render(<DiscoverLanding onSearch={onSearch} onSelectMode={onSelectMode} />)
    const input = screen.getByPlaceholderText('Search repositories...')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('calls onSelectMode when a pill is clicked', () => {
    render(<DiscoverLanding onSearch={onSearch} onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByText('Most Popular'))
    expect(onSelectMode).toHaveBeenCalledWith('popular')
    fireEvent.click(screen.getByText('Most Forked'))
    expect(onSelectMode).toHaveBeenCalledWith('forked')
    fireEvent.click(screen.getByText('Rising'))
    expect(onSelectMode).toHaveBeenCalledWith('rising')
    fireEvent.click(screen.getByText('Recommended'))
    expect(onSelectMode).toHaveBeenCalledWith('recommended')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/DiscoverLanding.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the `DiscoverLanding` component**

```tsx
// src/components/DiscoverLanding.tsx
import { useState, useEffect, useRef } from 'react'
import { VIEW_MODES, type ViewModeKey } from '../lib/discoverQueries'
import logo from '../assets/logo.png'

interface Props {
  onSearch: (query: string) => void
  onSelectMode: (mode: ViewModeKey) => void
}

export default function DiscoverLanding({ onSearch, onSelectMode }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && query.trim()) {
      onSearch(query.trim())
    }
  }

  return (
    <div className="discover-landing">
      <div className="discover-landing-brand">
        <img src={logo} alt="Git Suite" className="discover-landing-logo" />
        <span className="discover-landing-wordmark">Git Suite</span>
      </div>

      <input
        ref={inputRef}
        type="text"
        className="discover-landing-search"
        placeholder="Search repositories..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="discover-landing-pills">
        {VIEW_MODES.map(vm => (
          <button
            key={vm.key}
            className="discover-landing-pill"
            onClick={() => onSelectMode(vm.key)}
          >
            {vm.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/DiscoverLanding.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverLanding.tsx src/components/DiscoverLanding.test.tsx
git commit -m "feat: add DiscoverLanding component with tests"
```

---

### Task 2: Add CSS for `DiscoverLanding`

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add landing page styles**

Append to the end of `src/styles/globals.css`:

```css
/* ── Discover Landing ──────────────────────────────────────────── */

.discover-landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 20px;
}

.discover-landing-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 40px;
}

.discover-landing-logo {
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

.discover-landing-wordmark {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--t1);
  letter-spacing: -0.5px;
}

.discover-landing-search {
  width: 100%;
  max-width: 480px;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: 10px;
  padding: 12px 18px;
  font-size: var(--text-base);
  color: var(--t1);
  outline: none;
  margin-bottom: 28px;
}

.discover-landing-search:focus {
  border-color: var(--accent-border);
}

.discover-landing-search::placeholder {
  color: var(--t3);
}

.discover-landing-pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.discover-landing-pill {
  background: var(--bg2);
  border: 1px solid var(--border);
  color: var(--t2);
  padding: 7px 16px;
  border-radius: 20px;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.discover-landing-pill:hover {
  background: var(--bg3);
  border-color: var(--border2);
}
```

- [ ] **Step 2: Verify styles render correctly**

Run: `npx vitest run src/components/DiscoverLanding.test.tsx`
Expected: PASS (tests still pass — CSS doesn't break functionality)

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add DiscoverLanding CSS"
```

---

### Task 3: Integrate Landing into `Discover.tsx`

**Files:**
- Modify: `src/views/Discover.tsx:81-84` (viewMode derivation)
- Modify: `src/views/Discover.tsx:338-345` (viewMode effect guard)
- Modify: `src/views/Discover.tsx:629-635` (snapshot guard)
- Modify: `src/views/Discover.tsx:747-877` (conditional render)

- [ ] **Step 1: Widen viewMode type and change fallback**

In `src/views/Discover.tsx`, change the viewMode derivation at lines 81–84 from:

```typescript
  const viewMode: ViewModeKey = (() => {
    const v = searchParams.get('view')
    return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
  })()
```

To:

```typescript
  const viewMode: ViewModeKey | null = (() => {
    const v = searchParams.get('view')
    return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : null
  })()
```

- [ ] **Step 2: Guard the viewMode effect to skip landing**

In `src/views/Discover.tsx`, change the viewMode effect at lines 338–345 from:

```typescript
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      if (restoredFromSnapshot.current) return
    }
    recommendedCache.current = null
    if (!discoverQuery.trim()) loadTrending(appliedFilters)
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps
```

To:

```typescript
  useEffect(() => {
    if (viewMode === null) return
    if (!hasMounted.current) {
      hasMounted.current = true
      if (restoredFromSnapshot.current) return
    }
    recommendedCache.current = null
    if (!discoverQuery.trim()) loadTrending(appliedFilters)
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Guard `saveDiscoverSnapshot` to skip landing**

In `src/views/Discover.tsx`, change `navigateToRepo` at lines 629–639 from:

```typescript
  function navigateToRepo(path: string) {
    saveDiscoverSnapshot({
      query: discoverQuery, repos, viewMode, activeLanguage, appliedFilters,
      mode, detectedTags, activeTags, relatedTags,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
      page, hasMore, searchPath,
    })
```

To:

```typescript
  function navigateToRepo(path: string) {
    if (viewMode !== null) {
      saveDiscoverSnapshot({
        query: discoverQuery, repos, viewMode, activeLanguage, appliedFilters,
        mode, detectedTags, activeTags, relatedTags,
        scrollTop: scrollRef.current?.scrollTop ?? 0,
        page, hasMore, searchPath,
      })
    }
```

- [ ] **Step 4: Add the import for DiscoverLanding**

At the top of `src/views/Discover.tsx` (after line 28), add:

```typescript
import DiscoverLanding from '../components/DiscoverLanding'
```

- [ ] **Step 5: Add landing handlers and conditional render**

Add two handler functions before the return statement (around line 745), after the `handleSelectTopic` function:

```typescript
  function handleLandingSearch(q: string) {
    setDiscoverQuery(q)
    setContextQuery(q)
    setSearchParams({ view: 'recommended' })
    handleSearch(undefined, q)
  }

  function handleLandingSelectMode(mode: ViewModeKey) {
    setSearchParams({ view: mode })
  }
```

Then change the return block. Wrap the existing JSX in a landing check. Replace the return (line 747 onwards) with:

```tsx
  if (viewMode === null) {
    return (
      <div className="discover">
        <DiscoverLanding onSearch={handleLandingSearch} onSelectMode={handleLandingSelectMode} />
      </div>
    )
  }

  return (
    <div className="discover">
      {/* ... existing JSX unchanged ... */}
```

Note: Keep ALL existing JSX inside the second return exactly as-is. Only add the early return for the landing case above it.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (existing tests should still pass; may need to add `?view=recommended` to tests that expect the results UI)

- [ ] **Step 7: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: integrate DiscoverLanding into Discover view"
```

---

### Task 4: Update Sidebar viewMode Fallback

**Files:**
- Modify: `src/components/Sidebar.tsx:127-137`

- [ ] **Step 1: Change the viewMode fallback to null**

In `src/components/Sidebar.tsx`, change lines 127–137 from:

```typescript
  const currentViewMode: ViewModeKey = (() => {
    if (isDiscover) {
      const v = searchParams.get('view')
      return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
    }
    if (isRepoFromDiscover) {
      const v = (location.state as any)?.fromDiscoverView
      return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
    }
    return 'recommended'
  })()
```

To:

```typescript
  const currentViewMode: ViewModeKey | null = (() => {
    if (isDiscover) {
      const v = searchParams.get('view')
      return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : null
    }
    if (isRepoFromDiscover) {
      const v = (location.state as any)?.fromDiscoverView
      return (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
    }
    return null
  })()
```

Note: The `isRepoFromDiscover` case keeps `'recommended'` fallback because if you're viewing a repo from discover, the previous state should have had a real view mode.

- [ ] **Step 2: Update the sub-tab active class**

The existing active class logic `currentViewMode === vm.key` at line 237 will automatically work — when `currentViewMode` is `null`, no sub-tab will match, so none will be highlighted. No code change needed here, but verify the `active` class no longer appears on any sub-tab when on landing.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/Sidebar.test.tsx`
(If this file exists; if not, run the full suite)
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "fix: sidebar shows no active sub-tab on discover landing"
```

---

### Task 5: Update NavBar Breadcrumb for Landing

**Files:**
- Modify: `src/components/NavBar.tsx:146-157`

- [ ] **Step 1: Suppress sub-tab breadcrumb on landing**

In `src/components/NavBar.tsx`, change lines 146–157 from:

```typescript
  } else if (path.startsWith('/discover')) {
    // Discover with sub-tab icon in breadcrumb
    const v = searchParams.get('view')
    const viewMode: ViewModeKey = (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : 'recommended'
    const vm = VIEW_MODES.find(m => m.key === viewMode)!
    const Icon = VIEW_MODE_ICONS[viewMode]

    segments.push({ label: 'Discover', icon: <DiscoverBreadcrumbIcon />, onClick: () => navigate('/discover') })
    segments.push({
      label: vm.label,
      icon: <Icon size={12} />,
    })
```

To:

```typescript
  } else if (path.startsWith('/discover')) {
    const v = searchParams.get('view')
    const viewMode: ViewModeKey | null = (v === 'recommended' || v === 'popular' || v === 'forked' || v === 'rising') ? v : null

    segments.push({ label: 'Discover', icon: <DiscoverBreadcrumbIcon />, onClick: () => navigate('/discover') })
    if (viewMode) {
      const vm = VIEW_MODES.find(m => m.key === viewMode)!
      const Icon = VIEW_MODE_ICONS[viewMode]
      segments.push({
        label: vm.label,
        icon: <Icon size={12} />,
      })
    }
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/components/NavBar.test.tsx`
(If this file exists; if not, run the full suite)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/NavBar.tsx
git commit -m "fix: NavBar shows only 'Discover' breadcrumb on landing page"
```

---

### Task 6: Update Existing Discover Tests

**Files:**
- Modify: any existing `src/views/Discover.test.tsx` (if it exists)

- [ ] **Step 1: Check for existing Discover tests**

Run: `ls src/views/Discover.test.tsx 2>/dev/null && echo EXISTS || echo NONE`

If NONE, skip to Step 3.

- [ ] **Step 2: Update tests that expect results UI**

Any test that renders `<Discover />` without setting `?view=` will now see the landing page instead of the results UI. Update those tests to include `?view=recommended` in the route if they expect the results UI.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit (if changes were made)**

```bash
git add -A
git commit -m "test: update Discover tests for landing page default"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run the full test suite one more time**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Start the dev server and manually verify**

Run: `npm run dev` (or the project's dev command)

Verify:
1. App launches → shows landing page (logo, wordmark, search bar, pills)
2. Type a query and press Enter → transitions to results view with search results
3. Click "Most Popular" pill → transitions to Most Popular trending view
4. Click "Discover" in sidebar → returns to landing page
5. NavBar shows only "Discover" on landing, "Discover > Most Popular" on results
6. No sub-tab is highlighted in sidebar on landing page
7. Navigate to a repo from results → press back → returns to results (not landing)

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
