# Sidebar Navigation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the sidebar to match the Oliya reference design — app header, always-visible context-aware search input, and rounded-rectangle active nav item highlight — while wiring search to filter content in each view.

**Architecture:** A new `SearchContext` holds a shared query string and a ref to the sidebar's input element. The sidebar writes to context; Library/Starred/Collections read from it directly. Discover bidirectionally syncs with context (keeping its own snapshot-aware local state) and attaches its suggestion-dropdown event handlers to the sidebar input via the forwarded ref.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, React Router v6 (MemoryRouter), globals.css (plain CSS variables)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/contexts/Search.tsx` | **Create** | SearchContext, SearchProvider, useSearch hook |
| `src/App.tsx` | Modify | Wrap AppContent with SearchProvider inside MemoryRouter |
| `src/styles/globals.css` | Modify | Sidebar width, remove border-right from nav items, rounded active state, new header/search styles |
| `src/components/Sidebar.tsx` | Modify | App header, search input wired to context, rounded-rect nav items |
| `src/components/Sidebar.test.tsx` | Modify | Cover header, search input, route-aware placeholder |
| `src/views/Library.tsx` | Modify | Remove `filter` state + input, consume useSearch |
| `src/views/Starred.tsx` | Modify | Remove `search` state + input from starred-topbar, consume useSearch |
| `src/views/Collections.tsx` | Modify | Remove `search` state + input from collections-topbar, consume useSearch |
| `src/views/Discover.tsx` | Modify | Rename query→discoverQuery, bidirectional context sync, remove topbar input, wire suggestion dropdown to sidebar input via ref |

---

## Task 1: Create SearchContext

**Files:**
- Create: `src/contexts/Search.tsx`
- Create: `src/contexts/Search.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/contexts/Search.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchProvider, useSearch } from './Search'

function Consumer() {
  const { query, setQuery } = useSearch()
  return (
    <>
      <span data-testid="query">{query}</span>
      <button onClick={() => setQuery('hello')}>set</button>
    </>
  )
}

function renderWithProvider() {
  return render(<SearchProvider><Consumer /></SearchProvider>)
}

describe('SearchContext', () => {
  it('provides an empty query by default', () => {
    renderWithProvider()
    expect(screen.getByTestId('query')).toHaveTextContent('')
  })

  it('updates query when setQuery is called', () => {
    renderWithProvider()
    fireEvent.click(screen.getByRole('button', { name: 'set' }))
    expect(screen.getByTestId('query')).toHaveTextContent('hello')
  })

  it('provides inputRef as null by default', () => {
    function RefConsumer() {
      const { inputRef } = useSearch()
      return <span data-testid="ref">{inputRef === null ? 'null' : 'set'}</span>
    }
    render(<SearchProvider><RefConsumer /></SearchProvider>)
    expect(screen.getByTestId('ref')).toHaveTextContent('null')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/contexts/Search.test.tsx
```

Expected: FAIL — `Cannot find module './Search'`

- [ ] **Step 3: Implement SearchContext**

Create `src/contexts/Search.tsx`:

```tsx
import { createContext, useContext, useRef, useState, type ReactNode } from 'react'

interface SearchContextValue {
  query: string
  setQuery: (q: string) => void
  inputRef: React.RefObject<HTMLInputElement> | null
  setInputRef: (ref: React.RefObject<HTMLInputElement>) => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [inputRef, setInputRef] = useState<React.RefObject<HTMLInputElement> | null>(null)

  return (
    <SearchContext.Provider value={{ query, setQuery, inputRef, setInputRef }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider')
  return ctx
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/contexts/Search.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/contexts/Search.tsx src/contexts/Search.test.tsx
git commit -m "feat: add SearchContext for shared sidebar query state"
```

---

## Task 2: Register SearchProvider in App.tsx

**Files:**
- Modify: `src/App.tsx`

The provider must go **inside** `<MemoryRouter>` so consumers can call `useLocation()`. It wraps the existing providers alongside `ProfileOverlayProvider` and `SavedReposProvider`.

- [ ] **Step 1: Add import**

In `src/App.tsx`, add to imports:

```tsx
import { SearchProvider } from './contexts/Search'
```

- [ ] **Step 2: Wrap AppContent**

In `src/App.tsx`, the `App` component currently renders:

```tsx
<MemoryRouter ...>
  <ProfileOverlayProvider>
    <SavedReposProvider>
      <AppContent />
    </SavedReposProvider>
  </ProfileOverlayProvider>
</MemoryRouter>
```

Change it to:

```tsx
<MemoryRouter ...>
  <ProfileOverlayProvider>
    <SavedReposProvider>
      <SearchProvider>
        <AppContent />
      </SearchProvider>
    </SavedReposProvider>
  </ProfileOverlayProvider>
</MemoryRouter>
```

- [ ] **Step 3: Run full test suite to verify no regression**

```bash
npm test
```

Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: register SearchProvider in app tree"
```

---

## Task 3: CSS — sidebar width, nav active style, new header/search styles

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Update sidebar width**

In `globals.css` at lines 214–222, change:

```css
.sidebar {
  width: 200px;
  min-width: 200px;
```

to:

```css
.sidebar {
  width: 240px;
  min-width: 240px;
```

- [ ] **Step 2: Remove border-right from .nav-item**

At line 240, change:

```css
  border-right: 2px solid transparent;
```

to (delete the line entirely or set to `none`):

```css
  border-right: none;
```

- [ ] **Step 3: Update .nav-item.active — remove border, add border-radius**

At lines 253–257, change:

```css
.nav-item.active {
  color: var(--accent-text);
  background: var(--accent-soft);
  border-right-color: var(--accent);
}
```

to:

```css
.nav-item.active {
  color: var(--accent-text);
  background: var(--accent-soft);
  border-radius: 8px;
}
```

- [ ] **Step 4: Remove border-right from .sidebar-nav-item and .sidebar-nav-item.active**

At line 3268, change:

```css
  border-right: 2px solid transparent;
```

to:

```css
  border-right: none;
```

At lines 3280–3284, change:

```css
.sidebar-nav-item.active {
  color: var(--accent-text);
  background: var(--accent-soft);
  border-right-color: var(--accent);
}
```

to:

```css
.sidebar-nav-item.active {
  color: var(--accent-text);
  background: var(--accent-soft);
  border-radius: 8px;
}
```

- [ ] **Step 5: Add sidebar-header styles**

After the `.sidebar { ... }` block (after line 222), add:

```css
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.sidebar-header-icon {
  width: 26px;
  height: 26px;
  background: var(--t1);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-header-wordmark {
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--t1);
  letter-spacing: -0.01em;
}
```

- [ ] **Step 6: Add sidebar-search styles**

After the sidebar-header block, add:

```css
.sidebar-search-wrap {
  padding: 0 10px 8px;
  flex-shrink: 0;
}

.sidebar-search-inner {
  position: relative;
  display: flex;
  align-items: center;
}

.sidebar-search-icon {
  position: absolute;
  left: 10px;
  color: var(--t3);
  pointer-events: none;
  flex-shrink: 0;
}

.sidebar-search-input {
  width: 100%;
  padding: 7px 32px 7px 32px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--t1);
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  transition: border-color 0.1s;
  box-sizing: border-box;
}

.sidebar-search-input::placeholder {
  color: var(--t3);
}

.sidebar-search-input:focus {
  border-color: var(--border2);
}

.sidebar-search-kbd {
  position: absolute;
  right: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  color: var(--t3);
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 3px;
  padding: 1px 4px;
  pointer-events: none;
}
```

- [ ] **Step 7: Adjust sidebar-nav padding to account for new header**

The `.sidebar-nav` at line 224 currently has `padding-top: 8px`. The header and search are now above it, so reduce to:

```css
.sidebar-nav {
  flex: 1;
  padding-top: 4px;
  overflow-y: auto;
}
```

Also add horizontal padding so the nav items have the appearance of floating tiles (the rounded active rect needs room to breathe). Update `.nav-item` padding:

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  margin: 1px 6px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--t2);
  cursor: pointer;
  border-right: none;
  border-radius: 6px;
  transition: background 0.1s, color 0.1s;
  text-decoration: none;
  width: calc(100% - 12px);
  text-align: left;
  background: none;
}
```

Also update `.sidebar-nav-item` to match (lines 3258–3273):

```css
.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  margin: 1px 6px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--t2);
  cursor: pointer;
  border-right: none;
  border-radius: 6px;
  transition: background 0.1s, color 0.1s;
  width: calc(100% - 12px);
  text-align: left;
  background: none;
}
```

- [ ] **Step 8: Run tests**

```bash
npm test
```

Expected: all tests pass (CSS changes have no test coverage, visual verification done at runtime)

- [ ] **Step 9: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: sidebar width 240px, rounded-rect nav active state, add header/search CSS"
```

---

## Task 4: Overhaul Sidebar component

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write new/updated failing tests**

Add to `src/components/Sidebar.test.tsx` (the existing `setupApi` function and `renderWithRouter` helper need to wrap with `SearchProvider`). Update the file:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Sidebar from './Sidebar'
import { SearchProvider } from '../contexts/Search'

function renderWithRouter(initialRoute = '/discover') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SearchProvider>
        <Routes>
          <Route path="*" element={<Sidebar />} />
        </Routes>
      </SearchProvider>
    </MemoryRouter>
  )
}

// setupApi stays unchanged — copy it from the existing file

// ── NEW TESTS to add at the end of the describe block ──

// it('renders Git-Suite header wordmark', () => {
//   renderWithRouter()
//   expect(screen.getByText('Git-Suite')).toBeInTheDocument()
// })

// it('renders search input', () => {
//   renderWithRouter()
//   expect(screen.getByRole('textbox')).toBeInTheDocument()
// })

// it('shows "Search repos…" placeholder on /discover', () => {
//   renderWithRouter('/discover')
//   expect(screen.getByPlaceholderText('Search repos…')).toBeInTheDocument()
// })

// it('shows "Filter skills…" placeholder on /library', () => {
//   renderWithRouter('/library')
//   expect(screen.getByPlaceholderText('Filter skills…')).toBeInTheDocument()
// })

// it('shows "Filter starred…" placeholder on /starred', () => {
//   renderWithRouter('/starred')
//   expect(screen.getByPlaceholderText('Filter starred…')).toBeInTheDocument()
// })

// it('shows "Filter collections…" placeholder on /collections', () => {
//   renderWithRouter('/collections')
//   expect(screen.getByPlaceholderText('Filter collections…')).toBeInTheDocument()
// })

// it('typing in search updates context query', () => {
//   renderWithRouter()
//   const input = screen.getByRole('textbox')
//   fireEvent.change(input, { target: { value: 'react' } })
//   expect(input).toHaveValue('react')
// })
```

Uncomment the new tests and add them to the describe block. Keep all existing tests intact.

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: new tests FAIL (Git-Suite text not found, no search input)

- [ ] **Step 3: Implement the new Sidebar**

Replace `src/components/Sidebar.tsx` with:

```tsx
import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSearch } from '../contexts/Search'

// ── App header icon ──────────────────────────────────────────────
function AppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1.2l1.7 3.5 3.8.55-2.75 2.68.65 3.77L7 9.9l-3.4 1.8.65-3.77L1.5 5.25l3.8-.55L7 1.2z"
        fill="currentColor"
      />
    </svg>
  )
}

// ── Search icon ─────────────────────────────────────────────────
function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="sidebar-search-icon">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
      <line x1="8.6" y1="8.6" x2="11.5" y2="11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// ── Inline SVG icons (unchanged from original) ───────────────────
function DiscoverIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8.8" y1="8.8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <path d="M2.5 2h9v9.5L7 9 2.5 11.5V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function CollectionsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function StarredIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <path d="M7 1.5l1.5 3.1 3.4.5-2.5 2.4.6 3.4L7 9.2l-3 1.7.6-3.4L2.1 5l3.4-.5L7 1.5z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.5 2.5l1 1M10.5 10.5l1 1M11.5 2.5l-1 1M3.5 10.5l-1 1"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

// ── Nav items config ─────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Discover',    path: '/discover',    icon: <DiscoverIcon /> },
  { label: 'My Library',  path: '/library',     icon: <LibraryIcon /> },
  { label: 'Collections', path: '/collections', icon: <CollectionsIcon /> },
  { label: 'Starred',     path: '/starred',     icon: <StarredIcon /> },
]

// ── Route-aware placeholder ──────────────────────────────────────
function getSearchPlaceholder(pathname: string): string {
  if (pathname.startsWith('/discover'))    return 'Search repos…'
  if (pathname.startsWith('/library'))     return 'Filter skills…'
  if (pathname.startsWith('/starred'))     return 'Filter starred…'
  if (pathname.startsWith('/collections')) return 'Filter collections…'
  return 'Search…'
}

// ── Component ────────────────────────────────────────────────────
export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { query, setQuery, setInputRef } = useSearch()
  const inputRef = useRef<HTMLInputElement>(null)

  // Status indicators (same logic as before)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [mcpConfigured, setMcpConfigured] = useState(false)
  const mcpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    window.api.settings.get('github_username')
      .then((val) => setGithubUsername(val && val.length > 0 ? val : null))
      .catch(() => {})

    const checkMcp = () => {
      window.api.mcp.getStatus()
        .then((status) => setMcpConfigured(status.configured))
        .catch(() => {})
    }

    checkMcp()
    mcpIntervalRef.current = setInterval(checkMcp, 10_000)
    return () => { if (mcpIntervalRef.current) clearInterval(mcpIntervalRef.current) }
  }, [])

  // Register input ref in context after mount so Discover can attach handlers.
  // useEffect fires after the DOM commit, so inputRef.current is assigned by then.
  useEffect(() => { setInputRef(inputRef) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const githubActive = !!githubUsername
  const bothActive   = githubActive && mcpConfigured
  const githubClass  = bothActive ? 'pulse' : githubActive ? 'active' : 'inactive'
  const mcpClass     = bothActive ? 'pulse' : mcpConfigured ? 'active' : 'inactive'

  return (
    <aside className="sidebar">
      {/* ── App header ── */}
      <div className="sidebar-header">
        <div className="sidebar-header-icon">
          <AppIcon />
        </div>
        <span className="sidebar-header-wordmark">Git-Suite</span>
      </div>

      {/* ── Search ── */}
      <div className="sidebar-search-wrap">
        <div className="sidebar-search-inner">
          <SearchIcon />
          <input
            ref={inputRef}
            className="sidebar-search-input"
            placeholder={getSearchPlaceholder(location.pathname)}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <span className="sidebar-search-kbd">/</span>
        </div>
      </div>

      {/* ── Nav items ── */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ label, path, icon }) => (
          <button
            key={label}
            data-nav
            className={`nav-item${location.pathname === path ? ' active' : ''}`}
            onClick={() => navigate(path)}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      {/* ── Bottom ── */}
      <div className="sidebar-bottom">
        <div className="sidebar-divider" />
        <button
          className={`sidebar-nav-item${location.pathname === '/settings' ? ' active' : ''}`}
          onClick={() => navigate('/settings')}
        >
          <SettingsIcon />
          Settings
        </button>
        <div className="sidebar-status">
          <span className={`status-dot ${githubClass}`} />
          <span className="status-text">
            {githubUsername ? `${githubUsername} — connected` : 'GitHub — not connected'}
          </span>
        </div>
        <div className="sidebar-status">
          <span className={`status-dot ${mcpClass}`} />
          <span className="status-text">Claude Desktop</span>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: all tests pass (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat: overhaul sidebar with app header, search input, and rounded-rect nav"
```

---

## Task 5: Wire Library to SearchContext

**Files:**
- Modify: `src/views/Library.tsx`

- [ ] **Step 1: Add useSearch import**

At the top of `src/views/Library.tsx`, add:

```tsx
import { useSearch } from '../contexts/Search'
```

- [ ] **Step 2: Remove local filter state, consume context**

In the `Library` function body, remove:

```tsx
const [filter, setFilter] = useState('')
```

Replace it with:

```tsx
const { query: filter } = useSearch()
```

- [ ] **Step 3: Remove the filter input from the topbar**

In the JSX, remove these lines (around line 508–513):

```tsx
<input
  className="library-search"
  placeholder="Filter…"
  value={filter}
  onChange={(e) => setFilter(e.target.value)}
/>
```

The `library-topbar` div still renders — just without the input.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/views/Library.tsx
git commit -m "feat: wire Library filter to SearchContext"
```

---

## Task 6: Wire Starred to SearchContext

**Files:**
- Modify: `src/views/Starred.tsx`

- [ ] **Step 1: Add useSearch import**

```tsx
import { useSearch } from '../contexts/Search'
```

- [ ] **Step 2: Remove local search state, consume context**

Remove:

```tsx
const [search, setSearch] = useState('')
```

Replace with:

```tsx
const { query: search } = useSearch()
```

- [ ] **Step 3: Remove the search input from starred-topbar**

Remove from the `starred-topbar` div (lines ~195–200):

```tsx
<input
  className="search-input"
  placeholder="Search starred repos…"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
/>
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/views/Starred.tsx
git commit -m "feat: wire Starred search to SearchContext"
```

---

## Task 7: Wire Collections to SearchContext

**Files:**
- Modify: `src/views/Collections.tsx`

- [ ] **Step 1: Add useSearch import**

```tsx
import { useSearch } from '../contexts/Search'
```

- [ ] **Step 2: Remove local search state, consume context**

Remove:

```tsx
const [search, setSearch] = useState('')
```

Replace with:

```tsx
const { query: search } = useSearch()
```

- [ ] **Step 3: Remove search input from collections-topbar**

Remove from the `collections-topbar` div (lines ~492–497):

```tsx
<input
  className="collections-search"
  placeholder="Search collections…"
  value={search}
  onChange={e => setSearch(e.target.value)}
/>
```

The `+ New collection` button remains.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/views/Collections.tsx
git commit -m "feat: wire Collections search to SearchContext"
```

---

## Task 8: Wire Discover to SearchContext (bidirectional sync + suggestion dropdown)

This is the most complex task. Discover keeps its own local query state (needed for snapshot restore) and bidirectionally syncs with SearchContext.

**Files:**
- Modify: `src/views/Discover.tsx`

### Step group A: Rename query→discoverQuery and consume context

- [ ] **Step A1: Add useSearch import and destructure context**

Add to imports:

```tsx
import { useSearch } from '../contexts/Search'
```

At the top of the `Discover` function body (after the existing hooks), add:

```tsx
const { query: contextQuery, setQuery: setContextQuery, inputRef: sidebarInputRef } = useSearch()
```

- [ ] **Step A2: Rename local query state**

Find the state declaration (line ~238):

```tsx
const [query, setQuery] = useState(() => restoredSnapshot.current?.query ?? '')
```

Change to:

```tsx
const [discoverQuery, setDiscoverQuery] = useState(() => restoredSnapshot.current?.query ?? '')
```

- [ ] **Step A3: Rename all local references**

Do a **word-boundary** find-and-replace within `Discover.tsx` only. Use `\bquery\b` → `discoverQuery` and `\bsetQuery\b` → `setDiscoverQuery` so partial matches like `contextQuery`, `overrideQuery`, `setContextQuery` are NOT affected.

- Replace `\bquery\b` → `discoverQuery` (reads: value, deps, snapshot, getSectionLabel, showHistory, etc.)
- Replace `\bsetQuery\b` → `setDiscoverQuery` (write calls inside Discover's own handlers)

**Caution:** Perform the rename BEFORE running the code (compile + test), then verify these names are intact: `contextQuery`, `setContextQuery`, `overrideQuery`. If any of those were accidentally changed, revert them immediately.

Key locations to check after rename:
- `useState` initialiser: `restoredSnapshot.current?.query ?? ''` → stays as `''` (snapshot field name stays `query`)
- `saveDiscoverSnapshot({ query: discoverQuery, ... })` at line ~772
- `getSectionLabel()` uses `discoverQuery`
- `showHistory` at line ~255 uses `discoverQuery.trim()`
- Suggestions `useEffect` deps: `[discoverQuery, allTopics]`
- `handleSearch`: `const q = overrideQuery ?? discoverQuery`
- `allVisible` useMemo deps include `discoverQuery`
- `loadMore` uses `discoverQuery`
- `runTagSearch` closure uses `discoverQuery`

- [ ] **Step A4: Run tests to check for regressions**

```bash
npm test
```

Expected: all tests pass (the rename is mechanical)

### Step group B: Add mount-time context seed

- [ ] **Step B1: Add mount useEffect to seed context**

After all the `useState` declarations in `Discover`, add:

```tsx
// Seed context query from snapshot on mount (or carry forward context value if no snapshot)
useEffect(() => {
  setContextQuery(restoredSnapshot.current !== null ? restoredSnapshot.current.query : contextQuery)
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

### Step group C: Add inbound sync (sidebar → Discover)

- [ ] **Step C1: Add inbound useEffect**

```tsx
// Inbound: sidebar search drives discoverQuery
useEffect(() => {
  if (contextQuery !== discoverQuery) setDiscoverQuery(contextQuery)
}, [contextQuery]) // eslint-disable-line react-hooks/exhaustive-deps
```

### Step group D+E: Outbound sync AND topbar input removal (do these together)

**Important:** Complete D and E as a single atomic set of changes and commit them together. Between Step D and Step E, the app is in a broken intermediate state (the old `onChange` on the topbar input calls `setDiscoverQuery` but not `setContextQuery`). Applying D+E atomically avoids this.

Every place in Discover where `setDiscoverQuery` is called from a user action, also call `setContextQuery` with the same value. There are 6 call sites:

- [ ] **Step D1: History entry selected (keyboard Enter, ~line 852)**

```tsx
// Before:
setDiscoverQuery(entry)
// After:
setDiscoverQuery(entry); setContextQuery(entry)
```

- [ ] **Step D2: Subtype selected (keyboard Enter, ~line 861)**

```tsx
// Before:
setDiscoverQuery('')
// After:
setDiscoverQuery(''); setContextQuery('')
```

- [ ] **Step D3: Topic completed (keyboard Enter, ~line 871)**

```tsx
// Before:
setDiscoverQuery(completed + ' ')
// After:
setDiscoverQuery(completed + ' '); setContextQuery(completed + ' ')
```

- [ ] **Step D4: History entry mousedown (~line 911)**

```tsx
// Before:
setDiscoverQuery(entry)
// After:
setDiscoverQuery(entry); setContextQuery(entry)
```

- [ ] **Step D5: Subtype mousedown (~line 957)**

```tsx
// Before:
setDiscoverQuery('')
// After:
setDiscoverQuery(''); setContextQuery('')
```

- [ ] **Step D6: Topic mousedown (~line 966)**

```tsx
// Before:
setDiscoverQuery(completed + ' ')
// After:
setDiscoverQuery(completed + ' '); setContextQuery(completed + ' ')
```

### Step group E: Remove topbar input, attach handlers to sidebar input via ref

- [ ] **Step E1: Add handler refs**

Handlers reference live state so we use a ref-forwarding pattern to keep them current. Add these after the existing `useRef` declarations:

```tsx
const keyDownHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
const blurHandlerRef = useRef<(e: FocusEvent) => void>(() => {})
const focusHandlerRef = useRef<(e: FocusEvent) => void>(() => {})
```

- [ ] **Step E2: Assign current handlers**

In the render body (before the `return`), assign the current handler implementations to these refs so they always capture the latest state:

```tsx
keyDownHandlerRef.current = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const max = (discoverQuery.trim() === '' && searchHistory.entries.length > 0)
      ? searchHistory.entries.length - 1
      : suggestions.length - 1
    setSuggestionIndex(i => Math.min(i + 1, max))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); setSuggestionIndex(i => Math.max(i - 1, -1))
  } else if (e.key === 'Escape') {
    setShowSuggestions(false); setSuggestionIndex(-1)
  } else if (e.key === 'Enter') {
    if (showHistory && suggestionIndex >= 0 && searchHistory.entries[suggestionIndex]) {
      const entry = searchHistory.entries[suggestionIndex]
      setDiscoverQuery(entry); setContextQuery(entry)
      setShowSuggestions(false); setSuggestionIndex(-1)
      handleSearch(undefined, entry)
    } else if (suggestionIndex >= 0 && suggestions[suggestionIndex]?.kind === 'subtype') {
      const s = suggestions[suggestionIndex] as SubtypeSuggestion
      setSelectedTypes([s.subTypeId])
      setDiscoverQuery(''); setContextQuery('')
      setShowSuggestions(false); setSuggestionIndex(-1)
    } else if (suggestionIndex >= 0 && suggestions[suggestionIndex]?.kind === 'topic') {
      const words = discoverQuery.trimEnd().split(/\s+/)
      words[words.length - 1] = (suggestions[suggestionIndex] as TopicSuggestion).label
      const completed = words.join(' ')
      setDiscoverQuery(completed + ' '); setContextQuery(completed + ' ')
      setShowSuggestions(false); setSuggestionIndex(-1)
      handleSearch(undefined, completed)
    } else {
      setShowSuggestions(false)
      handleSearch()
    }
  }
}

blurHandlerRef.current = () => {
  setTimeout(() => setShowSuggestions(false), 150)
}

focusHandlerRef.current = () => {
  if (discoverQuery.trim() === '' && searchHistory.entries.length > 0) {
    setShowSuggestions(true); setSuggestionIndex(-1)
  } else if (suggestions.length > 0) {
    setShowSuggestions(true)
  }
}
```

- [ ] **Step E3: Attach handlers to sidebar input via useEffect**

Note: React does not track `ref.current` mutations, so `sidebarInputRef?.current` in the dep array will not reliably detect if the sidebar input re-mounts. In practice Sidebar is mounted for the full app lifetime so this is fine — use `sidebarInputRef` (the object) as the dep, not `.current`.

```tsx
useEffect(() => {
  const el = sidebarInputRef?.current
  if (!el) return
  const handleKeyDown = (e: KeyboardEvent) => keyDownHandlerRef.current(e)
  const handleBlur    = (e: FocusEvent)    => blurHandlerRef.current(e)
  const handleFocus   = (e: FocusEvent)    => focusHandlerRef.current(e)
  el.addEventListener('keydown', handleKeyDown)
  el.addEventListener('blur',    handleBlur)
  el.addEventListener('focus',   handleFocus)
  return () => {
    el.removeEventListener('keydown', handleKeyDown)
    el.removeEventListener('blur',    handleBlur)
    el.removeEventListener('focus',   handleFocus)
  }
}, [sidebarInputRef]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step E4: Remove topbar input element**

In the JSX `return`, find the `<div style={{ position: 'relative', flex: 1 }}>` wrapper that contains the `<input ref={inputRef} className="discover-search" .../>` and the suggestions dropdown.

Remove the `<input ... />` element entirely (lines ~830–891). Keep the outer `<div style={{ position: 'relative', flex: 1 }}>` and its children that render the suggestions dropdown.

Also remove the `inputRef` usage in the now-deleted input (`ref={inputRef}` was on the Discover input — the `inputRef` ref object in Discover can be removed since we now use `sidebarInputRef`). Remove the `const inputRef = useRef<HTMLInputElement>(null)` declaration in Discover.

- [ ] **Step E5: Update suggestions dropdown to use position: fixed**

The suggestions dropdown currently uses `position: 'absolute'`. Change it to use the sidebar input's screen coordinates. Compute `rect` as a variable just before the `return` in the render body, then use it in the JSX:

```tsx
// Compute dropdown anchor coords from the sidebar input — used by the suggestions dropdown
const suggestionAnchor = (showSuggestions && (showHistory || suggestions.length > 0))
  ? sidebarInputRef?.current?.getBoundingClientRect() ?? null
  : null
```

Then in the JSX, replace the old dropdown wrapper:

```tsx
{suggestionAnchor && (
  <div ref={suggestionsRef} style={{
    position: 'fixed',
    top: suggestionAnchor.bottom + 4,
    left: suggestionAnchor.left,
    width: suggestionAnchor.width,
    background: 'var(--bg2)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    zIndex: 1000, overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
  }}>
    {/* existing dropdown contents unchanged */}
  </div>
)}
```

Coordinates are read from `getBoundingClientRect()` on each render cycle when `showSuggestions` is true (via the `suggestionAnchor` variable recomputed every render).

- [ ] **Step F: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step G: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: wire Discover to SearchContext with bidirectional sync and forwarded input ref"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite one more time**

```bash
npm test
```

Expected: all tests pass, no regressions

- [ ] **Step 2: Manual smoke test checklist**

Launch the app (`npm run dev` or electron start command) and verify:

1. Sidebar shows "Git-Suite" wordmark and icon in the header
2. Search input is visible below the header on all routes
3. Typing in search on /library filters the skills list in real time
4. Typing in search on /starred filters the starred repos list
5. Typing in search on /collections filters the collections list
6. On /discover, typing in the sidebar search drives the Discover query (suggestions appear, Enter submits search)
7. Navigating from /discover to /library preserves the search term in the sidebar
8. Active nav item has rounded-rectangle background, no right-side border accent
9. Settings item at the bottom also uses rounded-rectangle active style
10. Clearing the search (type a term, then delete all characters) resets the view to its unfiltered state across all four views

- [ ] **Step 3: Final commit (if any last-minute fixes)**

```bash
git add -p
git commit -m "fix: post-integration corrections to sidebar nav overhaul"
```
