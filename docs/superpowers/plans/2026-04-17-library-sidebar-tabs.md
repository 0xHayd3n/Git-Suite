# Library Sidebar Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Library view to use a VS Code-style NavRail with Repositories and Collections tab buttons, moving Collections out of the dock and into the Library sidebar.

**Architecture:** `Library.tsx` owns `activePanel` state and passes it to an extended `NavRail`. Clicking a rail button shows its sidebar panel (LibrarySidebar for repos, new CollectionsSidebar for collections); clicking the active button collapses the panel. A new `CollectionDetail` route component renders at `/library/collection/:id` and owns all collection state/handlers.

**Tech Stack:** React 18, React Router v6 (MemoryRouter, nested routes, `useMatch`/`useParams`/`useLocation`), TypeScript, Vitest + React Testing Library, Electron IPC via `window.api`

---

## File map

| File | Change |
|------|--------|
| `src/components/Dock.tsx` | Remove Collections from NAV_ITEMS + getTabPrefix + getSearchPlaceholder |
| `src/App.tsx` | Replace /collections Route with Navigate redirect |
| `src/components/DiscoverSidebar.css` | Add .nav-rail-btn styles |
| `src/components/LibrarySidebar.css` | Add .library-panel collapse styles |
| `src/components/NavRail.tsx` | Add activePanel/onPanelToggle props + render rail buttons |
| `src/components/CollectionsSidebar.tsx` | New — slim collections list panel |
| `src/components/CollectionsSidebar.test.tsx` | New — tests for CollectionsSidebar |
| `src/views/CollectionDetail.tsx` | New — route component owning all collection state |
| `src/views/CollectionDetail.test.tsx` | New — tests for CollectionDetail |
| `src/views/Library.tsx` | Rewire: activePanel state, two useMatch calls, two sidebar panels, two nested routes |
| `src/views/Library.test.tsx` | Update existing tests for new structure |
| `src/views/Collections.tsx` | No changes (kept as-is; its route is replaced, not deleted) |
| `src/components/NavBar.tsx` | Add /library/collection/:id breadcrumb branch |

---

## Task 1: Remove Collections from Dock

**Files:**
- Modify: `src/components/Dock.tsx`

- [ ] **Step 1: Open Dock.tsx and remove the Collections entry from NAV_ITEMS (line 77)**

  Current NAV_ITEMS at line 74–79:
  ```ts
  const NAV_ITEMS = [
    { label: 'Discover',    path: '/discover',    icon: <DiscoverIcon /> },
    { label: 'Library',     path: '/library',     icon: <LibraryIcon /> },
    { label: 'Collections', path: '/collections', icon: <CollectionsIcon /> },
    { label: 'Profile',     path: '/profile',     icon: <ProfileIcon /> },
  ]
  ```
  Change to:
  ```ts
  const NAV_ITEMS = [
    { label: 'Discover', path: '/discover', icon: <DiscoverIcon /> },
    { label: 'Library',  path: '/library',  icon: <LibraryIcon /> },
    { label: 'Profile',  path: '/profile',  icon: <ProfileIcon /> },
  ]
  ```

- [ ] **Step 2: Remove /collections from getTabPrefix (line 99–103)**

  Current:
  ```ts
  function getTabPrefix(pathname: string): string | null {
    if (pathname.startsWith('/discover') || pathname.startsWith('/repo/')) return '/discover'
    if (pathname.startsWith('/library'))     return '/library'
    if (pathname.startsWith('/collections')) return '/collections'
    if (pathname.startsWith('/profile'))     return '/profile'
    if (pathname.startsWith('/settings'))    return '/settings'
    return null
  }
  ```
  Remove the `/collections` line.

- [ ] **Step 3: Remove /collections from getSearchPlaceholder (line 83–90)**

  Current:
  ```ts
  function getSearchPlaceholder(pathname: string): string {
    if (pathname.startsWith('/discover'))    return 'Search repos…'
    if (pathname.startsWith('/library'))     return 'Filter skills…'
    if (pathname.startsWith('/starred'))     return 'Filter starred…'
    if (pathname.startsWith('/collections')) return 'Filter collections…'
    if (pathname.startsWith('/profile'))     return 'Search profile…'
    return 'Search…'
  }
  ```
  Remove the `/collections` line.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/Dock.tsx
  git commit -m "feat(dock): remove Collections tab — moves to Library sidebar"
  ```

---

## Task 2: Redirect /collections route in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the /collections Route with a Navigate redirect**

  Current (line 66):
  ```tsx
  <Route path="/collections" element={<Collections />} />
  ```
  Replace with:
  ```tsx
  <Route path="/collections" element={<Navigate to="/library" replace />} />
  ```

- [ ] **Step 2: Remove the orphaned nested route under /library**

  Currently App.tsx has `<Route path="/library" element={<Library />}>` with a nested child:
  ```tsx
  <Route path="/library" element={<Library />}>
    <Route path="repo/:owner/:name" element={<RepoDetail />} />
  </Route>
  ```
  Library.tsx in Task 7 will switch from `<Outlet>` to an internal `<Routes>`, making this child an orphan (it will never render). Change the `/library` route to a self-closing element with no children:
  ```tsx
  <Route path="/library/*" element={<Library />} />
  ```
  The `/*` wildcard is required so React Router passes sub-paths like `/library/repo/...` and `/library/collection/...` down into Library's internal `<Routes>`.

- [ ] **Step 3: Remove the Collections import (line 15)**

  Remove:
  ```ts
  import Collections from './views/Collections'
  ```

- [ ] **Step 4: Verify Navigate is already imported**

  Line 2 already has: `import { MemoryRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'`
  No change needed.

- [ ] **Step 5: Commit**
  ```bash
  git add src/App.tsx
  git commit -m "feat(routing): redirect /collections to /library, convert /library to wildcard route"
  ```

---

## Task 3: Add CSS — NavRail buttons and panel collapse

**Files:**
- Modify: `src/components/DiscoverSidebar.css` (NavRail imports this file)
- Modify: `src/components/LibrarySidebar.css`

- [ ] **Step 1: Append NavRail button styles to DiscoverSidebar.css**

  Add at the bottom of the file:
  ```css
  /* ── NavRail activity buttons ────────────────────────── */

  .nav-rail-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: 44px;
    padding: 6px 0;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--t3);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .nav-rail-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--t2);
  }

  .nav-rail-btn.active {
    background: rgba(255, 255, 255, 0.1);
    color: var(--t1);
  }

  .nav-rail-btn-label {
    font-size: 9px;
    font-weight: 500;
  }
  ```

- [ ] **Step 2: Append panel collapse styles to LibrarySidebar.css**

  Add at the bottom of `src/components/LibrarySidebar.css`:
  ```css
  /* ── Collapsible panel wrapper ───────────────────────── */

  .library-panel {
    width: 220px;
    transition: width 0.15s ease;
    overflow: hidden;
    flex-shrink: 0;
  }

  .library-panel.collapsed {
    width: 0;
  }
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add src/components/DiscoverSidebar.css src/components/LibrarySidebar.css
  git commit -m "feat(library): add NavRail button and panel collapse CSS"
  ```

---

## Task 4: Extend NavRail with panel toggle buttons

**Files:**
- Modify: `src/components/NavRail.tsx`

The current file (12 lines) renders only a logo. We extend it with two icon+label buttons.

- [ ] **Step 1: Replace the full file content**

  ```tsx
  import logoSrc from '../assets/logo.png'
  import './DiscoverSidebar.css'

  function ReposIcon() {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z" />
      </svg>
    )
  }

  function CollectionsIcon() {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      </svg>
    )
  }

  interface NavRailProps {
    activePanel: 'repos' | 'collections' | null
    onPanelToggle: (panel: 'repos' | 'collections') => void
  }

  export default function NavRail({ activePanel, onPanelToggle }: NavRailProps) {
    return (
      <div className="nav-rail-standalone">
        <div className="sidebar-rail">
          <img src={logoSrc} alt="Git Suite" className="rail-logo" />
          <button
            type="button"
            className={`nav-rail-btn${activePanel === 'repos' ? ' active' : ''}`}
            onClick={() => onPanelToggle('repos')}
            aria-label="Repositories"
            title="Repositories"
          >
            <ReposIcon />
            <span className="nav-rail-btn-label">Repos</span>
          </button>
          <button
            type="button"
            className={`nav-rail-btn${activePanel === 'collections' ? ' active' : ''}`}
            onClick={() => onPanelToggle('collections')}
            aria-label="Collections"
            title="Collections"
          >
            <CollectionsIcon />
            <span className="nav-rail-btn-label">Colls</span>
          </button>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**
  ```bash
  cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: no errors for `NavRail.tsx`. (Library.tsx will error until Task 7 — that's fine.)

- [ ] **Step 3: Commit**
  ```bash
  git add src/components/NavRail.tsx
  git commit -m "feat(nav-rail): add Repositories and Collections panel toggle buttons"
  ```

---

## Task 5: Build CollectionsSidebar (TDD)

**Files:**
- Create: `src/components/CollectionsSidebar.tsx`
- Create: `src/components/CollectionsSidebar.test.tsx`

- [ ] **Step 1: Write the failing test file**

  Create `src/components/CollectionsSidebar.test.tsx`:
  ```tsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import CollectionsSidebar from './CollectionsSidebar'
  import { ToastProvider } from '../contexts/Toast'

  const mockCollections = [
    {
      id: 'user-1', name: 'My Stack', description: 'Tools I use',
      owner: 'user', active: 1, created_at: '2026-01-01T00:00:00.000Z',
      color_start: '#3b82f6', color_end: '#6366f1',
      repo_count: 2, saved_count: 2,
    },
    {
      id: 'community-1', name: 'Python API', description: 'FastAPI etc',
      owner: 'git-suite', active: 1, created_at: '2026-01-01T00:00:00.000Z',
      color_start: '#10b981', color_end: '#059669',
      repo_count: 5, saved_count: 3,
    },
  ]

  function wrap(ui: React.ReactElement) {
    return render(
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    )
  }

  beforeEach(() => {
    vi.stubGlobal('api', {
      collection: {
        getAll: vi.fn().mockResolvedValue(mockCollections),
        create: vi.fn().mockResolvedValue('new-id'),
      },
      library: { getAll: vi.fn().mockResolvedValue([]) },
    })
  })

  describe('CollectionsSidebar', () => {
    it('renders collection names after load', async () => {
      const onSelect = vi.fn()
      wrap(<CollectionsSidebar selectedId={null} onSelect={onSelect} />)
      expect(await screen.findByText('My Stack')).toBeInTheDocument()
      expect(screen.getByText('Python API')).toBeInTheDocument()
    })

    it('highlights the selected collection', async () => {
      const onSelect = vi.fn()
      wrap(<CollectionsSidebar selectedId="user-1" onSelect={onSelect} />)
      await screen.findByText('My Stack')
      const item = screen.getByText('My Stack').closest('[data-collection-id]')
      expect(item).toHaveClass('selected')
    })

    it('calls onSelect with collection id when a row is clicked', async () => {
      const onSelect = vi.fn()
      wrap(<CollectionsSidebar selectedId={null} onSelect={onSelect} />)
      await screen.findByText('Python API')
      fireEvent.click(screen.getByText('Python API'))
      expect(onSelect).toHaveBeenCalledWith('community-1', expect.any(Object))
    })

    it('shows a New collection button', async () => {
      wrap(<CollectionsSidebar selectedId={null} onSelect={vi.fn()} />)
      await screen.findByText('My Stack')
      expect(screen.getByText(/new collection/i)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run tests — expect failure (component not yet created)**
  ```bash
  cd D:/Coding/Git-Suite && npx vitest run src/components/CollectionsSidebar.test.tsx 2>&1 | tail -20
  ```
  Expected: FAIL — "Cannot find module './CollectionsSidebar'"

- [ ] **Step 3: Create CollectionsSidebar.tsx**

  Create `src/components/CollectionsSidebar.tsx`:
  ```tsx
  import { useState, useEffect, useCallback } from 'react'
  import type { CollectionRow } from '../types/repo'
  import NewCollectionModal from './NewCollectionModal'
  import { useToast } from '../contexts/Toast'

  interface CollectionsSidebarProps {
    selectedId: string | null
    onSelect: (id: string, coll: CollectionRow) => void
  }

  export default function CollectionsSidebar({ selectedId, onSelect }: CollectionsSidebarProps) {
    const [collections, setCollections] = useState<CollectionRow[]>([])
    const [showModal, setShowModal] = useState(false)
    const { toast } = useToast()

    const load = useCallback(async () => {
      const colls = await window.api.collection.getAll()
      setCollections(colls)
    }, [])

    useEffect(() => { load() }, [load])

    async function handleCreate(newId: string) {
      setShowModal(false)
      await load()
      toast('Collection created', 'success')
      const updated = await window.api.collection.getAll()
      const newColl = updated.find(c => c.id === newId)
      if (newColl) onSelect(newId, newColl)
    }

    return (
      <aside className="library-sidebar">
        <div className="library-sidebar-list">
          {collections.length === 0 && (
            <div className="library-sidebar-empty">No collections</div>
          )}
          {collections.map(coll => (
            <button
              key={coll.id}
              type="button"
              data-collection-id={coll.id}
              className={`library-sidebar-item installed${selectedId === coll.id ? ' selected' : ''}`}
              onClick={() => onSelect(coll.id, coll)}
              title={coll.name}
            >
              <span
                className="library-sidebar-avatar"
                style={{ background: `linear-gradient(135deg, ${coll.color_start ?? 'var(--bg3)'}, ${coll.color_end ?? 'var(--bg4)'})` }}
              />
              <span className="library-sidebar-name">{coll.name}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '8px', flexShrink: 0 }}>
          <button
            type="button"
            className="library-sidebar-seg"
            style={{ width: '100%' }}
            onClick={() => setShowModal(true)}
          >
            + New collection
          </button>
        </div>

        {showModal && (
          <NewCollectionModal
            libraryRows={[]}
            onClose={() => setShowModal(false)}
            onCreate={handleCreate}
          />
        )}
      </aside>
    )
  }
  ```

  > **Note on test:** The test's `onSelect` call signature is `(id, coll)` — update the `data-collection-id` attribute on the button matches `[data-collection-id]` selector used in the test.

- [ ] **Step 4: Run tests — expect pass**
  ```bash
  cd D:/Coding/Git-Suite && npx vitest run src/components/CollectionsSidebar.test.tsx 2>&1 | tail -20
  ```
  Expected: 4 tests pass.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/CollectionsSidebar.tsx src/components/CollectionsSidebar.test.tsx
  git commit -m "feat(library): add CollectionsSidebar panel component"
  ```

---

## Task 6: Build CollectionDetail route component (TDD)

**Files:**
- Create: `src/views/CollectionDetail.tsx`
- Create: `src/views/CollectionDetail.test.tsx`

- [ ] **Step 1: Write the failing test file**

  Create `src/views/CollectionDetail.test.tsx`:
  ```tsx
  import { render, screen, waitFor } from '@testing-library/react'
  import { MemoryRouter, Route, Routes } from 'react-router-dom'
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import CollectionDetail from './CollectionDetail'
  import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
  import { ToastProvider } from '../contexts/Toast'

  vi.mock('../components/CollDetail', () => ({
    default: ({ coll }: any) => <div data-testid="coll-detail">{coll?.name}</div>,
  }))

  const mockColl = {
    id: 'user-1', name: 'My Stack', description: 'Tools',
    owner: 'user', active: 1, created_at: '2026-01-01T00:00:00.000Z',
    color_start: '#3b82f6', color_end: '#6366f1',
    repo_count: 2, saved_count: 2,
  }

  function wrap(id: string, state?: object) {
    return render(
      <MemoryRouter initialEntries={[{ pathname: `/library/collection/${id}`, state }]}>
        <ProfileOverlayProvider>
          <ToastProvider>
            <Routes>
              <Route path="/library/collection/:id" element={<CollectionDetail />} />
              <Route path="/library" element={<div>library home</div>} />
            </Routes>
          </ToastProvider>
        </ProfileOverlayProvider>
      </MemoryRouter>
    )
  }

  beforeEach(() => {
    vi.stubGlobal('api', {
      collection: {
        getAll: vi.fn().mockResolvedValue([mockColl]),
        getDetail: vi.fn().mockResolvedValue([]),
        toggle: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      library: { getAll: vi.fn().mockResolvedValue([]) },
      github: { saveRepo: vi.fn().mockResolvedValue(undefined) },
      skill: { generate: vi.fn().mockResolvedValue({ content: '', version: 'v1', generated_at: '' }) },
    })
  })

  describe('CollectionDetail', () => {
    it('renders CollDetail with coll from router state', async () => {
      wrap('user-1', { coll: mockColl, collectionName: 'My Stack' })
      expect(await screen.findByTestId('coll-detail')).toHaveTextContent('My Stack')
    })

    it('falls back to fetching coll when state is absent', async () => {
      wrap('user-1') // no state
      expect(await screen.findByTestId('coll-detail')).toHaveTextContent('My Stack')
    })
  })
  ```

- [ ] **Step 2: Run tests — expect failure**
  ```bash
  cd D:/Coding/Git-Suite && npx vitest run src/views/CollectionDetail.test.tsx 2>&1 | tail -20
  ```
  Expected: FAIL — "Cannot find module './CollectionDetail'"

- [ ] **Step 3: Create CollectionDetail.tsx**

  Port the state and handlers from `Collections.tsx` lines 11–98 into a new route component:

  Create `src/views/CollectionDetail.tsx`:
  ```tsx
  import { useState, useEffect, useCallback } from 'react'
  import { useParams, useLocation, useNavigate } from 'react-router-dom'
  import type { CollectionRow, CollectionRepoRow, LibraryRow } from '../types/repo'
  import { useToast } from '../contexts/Toast'
  import CollDetail from '../components/CollDetail'

  export default function CollectionDetail() {
    const { id } = useParams<{ id: string }>()
    const location = useLocation()
    const navigate = useNavigate()
    const { toast } = useToast()

    const stateCol = (location.state as any)?.coll as CollectionRow | undefined
    const [coll, setColl] = useState<CollectionRow | null>(stateCol ?? null)
    const [detail, setDetail] = useState<CollectionRepoRow[]>([])
    const [libraryRows, setLibraryRows] = useState<LibraryRow[]>([])
    const [installing, setInstalling] = useState<Set<string>>(new Set())

    useEffect(() => {
      window.api.library.getAll().then(setLibraryRows).catch(() => {})
    }, [])

    useEffect(() => {
      if (!id) return
      if (!stateCol) {
        window.api.collection.getAll().then(colls => {
          setColl(colls.find(c => c.id === id) ?? null)
        }).catch(() => {})
      }
      window.api.collection.getDetail(id).then(setDetail).catch(() => {})
    }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

    async function handleToggle() {
      if (!coll || !id) return
      const newActive = coll.active === 1 ? 0 : 1
      await window.api.collection.toggle(id, newActive)
      setColl(prev => prev ? { ...prev, active: newActive } : prev)
    }

    async function handleDelete() {
      if (!id) return
      await window.api.collection.delete(id)
      toast('Collection deleted', 'success')
      navigate('/library')
    }

    async function handleInstall(owner: string, name: string) {
      if (!id) return
      const key = `${owner}/${name}`
      setInstalling(prev => new Set(prev).add(key))
      try {
        await window.api.github.saveRepo(owner, name)
        await window.api.skill.generate(owner, name)
        const rows = await window.api.collection.getDetail(id)
        setDetail(rows)
        toast(`${name} installed`, 'success')
      } catch {
        toast(`Failed to install ${name}`, 'error')
      } finally {
        setInstalling(prev => { const s = new Set(prev); s.delete(key); return s })
      }
    }

    async function handleInstallAll() {
      if (!id) return
      const missing = detail.filter(r => r.saved === 0)
      await Promise.all(
        missing.map(async r => {
          const key = `${r.owner}/${r.name}`
          setInstalling(prev => new Set(prev).add(key))
          try {
            await window.api.github.saveRepo(r.owner, r.name)
            await window.api.skill.generate(r.owner, r.name)
          } catch {
            // individual failure — continue
          } finally {
            setInstalling(prev => { const s = new Set(prev); s.delete(key); return s })
          }
        })
      )
      const rows = await window.api.collection.getDetail(id)
      setDetail(rows)
      toast('All missing skills installed', 'success')
    }

    if (!coll) return null

    return (
      <CollDetail
        coll={coll}
        repos={detail}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onInstall={handleInstall}
        onInstallAll={handleInstallAll}
        installing={installing}
      />
    )
  }
  ```

- [ ] **Step 4: Run tests — expect pass**
  ```bash
  cd D:/Coding/Git-Suite && npx vitest run src/views/CollectionDetail.test.tsx 2>&1 | tail -20
  ```
  Expected: 2 tests pass.

- [ ] **Step 5: Commit**
  ```bash
  git add src/views/CollectionDetail.tsx src/views/CollectionDetail.test.tsx
  git commit -m "feat(library): add CollectionDetail route component"
  ```

---

## Task 7: Rewire Library.tsx — main integration

**Files:**
- Modify: `src/views/Library.tsx`
- Modify: `src/views/Library.test.tsx`

This is the central wiring task. Current `Library.tsx` is 77 lines.

- [ ] **Step 1: Read Library.test.tsx to understand existing coverage**
  ```bash
  cat -n D:/Coding/Git-Suite/src/views/Library.test.tsx
  ```
  Understand which tests rely on the old `match` variable and sidebar structure.

- [ ] **Step 2: Replace Library.tsx**

  ```tsx
  import { useState, useEffect, useCallback, useMemo } from 'react'
  import { useNavigate, useMatch, Routes, Route } from 'react-router-dom'
  import { type LibraryRow, type StarredRepoRow, type RepoRow } from '../types/repo'
  import type { CollectionRow } from '../types/repo'
  import { useToast } from '../contexts/Toast'
  import NavRail from '../components/NavRail'
  import LibrarySidebar from '../components/LibrarySidebar'
  import CollectionsSidebar from '../components/CollectionsSidebar'
  import RepoDetail from './RepoDetail'
  import CollectionDetail from './CollectionDetail'

  type ActiveSegment = 'all' | 'active' | 'inactive'
  type ActivePanel = 'repos' | 'collections' | null

  export default function Library() {
    const { toast } = useToast()
    const navigate = useNavigate()

    const repoMatch  = useMatch('/library/repo/:owner/:name')
    const collMatch  = useMatch('/library/collection/:id')
    const hasDetail  = repoMatch !== null || collMatch !== null

    const [activePanel, setActivePanel] = useState<ActivePanel>('repos')
    const [rows, setRows] = useState<LibraryRow[]>([])
    const [starredRows, setStarredRows] = useState<StarredRepoRow[]>([])
    const [activeSegment, setActiveSegment] = useState<'all' | 'active' | 'inactive'>('all')

    useEffect(() => {
      window.api.library.getAll().then(setRows).catch(() => {
        toast('Failed to load library', 'error')
      })
      window.api.starred.getAll().then(setStarredRows).catch(() => {})
    }, [toast])

    const repoSelectedId = useMemo(() => {
      if (!repoMatch) return null
      const { owner, name } = repoMatch.params
      return (
        rows.find(r => r.owner === owner && r.name === name)?.id ??
        starredRows.find(r => r.owner === owner && r.name === name)?.id ??
        null
      )
    }, [repoMatch, rows, starredRows])

    const collSelectedId = collMatch?.params.id ?? null

    const handlePanelToggle = useCallback((panel: 'repos' | 'collections') => {
      setActivePanel(prev => prev === panel ? null : panel)
    }, [])

    const handleRepoSelect = useCallback((row: RepoRow, _isInstalled: boolean) => {
      navigate(`/library/repo/${row.owner}/${row.name}`)
    }, [navigate])

    const handleCollSelect = useCallback((id: string, coll: CollectionRow) => {
      navigate(`/library/collection/${id}`, { state: { coll, collectionName: coll.name } })
    }, [navigate])

    return (
      <div className="library-root-v2">
        <NavRail activePanel={activePanel} onPanelToggle={handlePanelToggle} />

        <div className={`library-panel${activePanel === 'repos' ? '' : ' collapsed'}`}>
          <LibrarySidebar
            installedRows={rows}
            starredRows={starredRows}
            selectedId={repoSelectedId}
            activeSegment={activeSegment}
            onSegmentChange={setActiveSegment}
            onSelect={handleRepoSelect}
          />
        </div>

        <div className={`library-panel${activePanel === 'collections' ? '' : ' collapsed'}`}>
          <CollectionsSidebar
            selectedId={collSelectedId}
            onSelect={handleCollSelect}
          />
        </div>

        <main className="library-main">
          <div className="library-detail-area">
            {hasDetail ? (
              <Routes>
                <Route path="repo/:owner/:name" element={<RepoDetail />} />
                <Route path="collection/:id" element={<CollectionDetail />} />
              </Routes>
            ) : (
              <div className="library-detail-empty">
                <div className="library-detail-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </div>
                <h2 className="library-detail-empty-title">Your Library</h2>
                <p className="library-detail-empty-sub">
                  {rows.length > 0
                    ? <>{rows.length} skill{rows.length !== 1 ? 's' : ''} installed{starredRows.length > 0 ? ` · ${starredRows.length} starred` : ''}</>
                    : 'No skills installed yet'}
                </p>
                <p className="library-detail-empty-hint">Select a repo or collection from the sidebar to view details.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }
  ```

  > **Key differences from original:**
  > - `match` → `repoMatch` + `collMatch`; `hasDetail` replaces the single match check
  > - `Outlet` is replaced by inline `<Routes>` since we now handle two detail routes
  > - Two `library-panel` wrappers wrap their respective sidebars
  > - `handleSidebarSelect` → `handleRepoSelect`; new `handleCollSelect`
  > - `NavRail` now receives props

- [ ] **Step 3: Update Library.test.tsx for new structure**

  Read the full test file first:
  ```bash
  cat -n D:/Coding/Git-Suite/src/views/Library.test.tsx
  ```

  Add the following mocks and update tests to account for:
  - `NavRail` now needs props — add `window.api.collection.getAll` mock to the global `api` stub
  - `CollectionsSidebar` is now rendered — mock it to avoid IPC calls in repo-focused tests

  At the top of the test file, add a mock for CollectionsSidebar:
  ```tsx
  vi.mock('../components/CollectionsSidebar', () => ({
    default: () => <div data-testid="collections-sidebar" />,
  }))
  ```

  In the `beforeEach` `api` stub, add:
  ```ts
  collection: { getAll: vi.fn().mockResolvedValue([]) },
  starred: { getAll: vi.fn().mockResolvedValue([]) },
  ```
  (if `starred` is not already mocked — check the file)

  Any test asserting on `<Outlet />` or `match` internals will need adjustment. The sidebar content and empty state text should still be present.

- [ ] **Step 4: Run Library tests**
  ```bash
  cd D:/Coding/Git-Suite && npx vitest run src/views/Library.test.tsx 2>&1 | tail -30
  ```
  Expected: all tests pass. Fix any failures before proceeding.

- [ ] **Step 5: Run full test suite to catch regressions**
  ```bash
  cd D:/Coding/Git-Suite && npx vitest run 2>&1 | tail -30
  ```
  Expected: all passing (or same failures as before this task — baseline regressions are not your problem).

- [ ] **Step 6: Commit**
  ```bash
  git add src/views/Library.tsx src/views/Library.test.tsx
  git commit -m "feat(library): wire NavRail panel tabs, Repositories + Collections sidebar"
  ```

---

## Task 8: Update NavBar breadcrumb for collection routes

**Files:**
- Modify: `src/components/NavBar.tsx`

- [ ] **Step 1: Remove stale /collections entry from ROUTE_LABELS (line 21–26)**

  Current:
  ```ts
  const ROUTE_LABELS: Record<string, string> = {
    '/library':     'My Library',
    '/collections': 'Collections',
    '/starred':     'Starred',
    '/settings':    'Settings',
  }
  ```
  Remove the `'/collections': 'Collections'` line.

- [ ] **Step 2: Add breadcrumb branch for /library/collection/:id**

  In the `else if / else` chain at the bottom of the segment-building block (around line 137–153), insert a new branch **before** the final `else`:

  Current structure (abbreviated):
  ```ts
  } else if (path.startsWith('/discover')) {
    // ... discover breadcrumb
  } else {
    const label = ROUTE_LABELS[path]
    if (label) segments.push({ label })
  }
  ```

  Add a new `else if` before the final `else`:
  ```ts
  } else if (path.startsWith('/library/collection/')) {
    const collectionName = (location.state as any)?.collectionName as string | undefined
    segments.push({ label: 'Library', onClick: () => navigate('/library') })
    if (collectionName) segments.push({ label: collectionName })
  } else {
    const label = ROUTE_LABELS[path]
    if (label) segments.push({ label })
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**
  ```bash
  cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors.

- [ ] **Step 4: Run full test suite**
  ```bash
  cd D:/Coding/Git-Suite && npx vitest run 2>&1 | tail -20
  ```
  Expected: all passing.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/NavBar.tsx
  git commit -m "feat(navbar): add breadcrumb for /library/collection/:id, remove stale /collections label"
  ```

---

## Done

All tasks complete. The Library view now has:
- NavRail with Repositories + Collections toggle buttons
- Collapsible sidebar panel per tab
- CollectionDetail route rendering in the main area
- Collections removed from the dock
- NavBar breadcrumbs for collection detail views
