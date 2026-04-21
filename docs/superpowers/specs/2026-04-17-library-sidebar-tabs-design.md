# Library Sidebar Tabs — Design Spec

**Date:** 2026-04-17
**Status:** Approved

---

## Overview

Restructure the Library view to use a VS Code-style NavRail with two icon+label tab buttons — **Repositories** and **Collections** — replacing the current single-purpose `LibrarySidebar`. Clicking the active tab collapses its panel (giving main content more space). Collections moves out of its own dock tab and into the Library sidebar.

---

## User-facing changes

| Before | After |
|--------|-------|
| Library view has a single repo-list sidebar | Library view has a NavRail with Repositories + Collections buttons |
| Collections is a separate dock tab | Collections lives inside Library's NavRail panel |
| Clicking Library dock button → repo list | Clicking Library dock button → Library view (last active tab remembered) |
| Dock: Discover / Library / Collections / Profile | Dock: Discover / Library / Profile |

Note: the `?select=<id>` deep-link query param that `Collections.tsx` previously supported is removed. This is a known breaking change; no migration is required since it was an internal navigation detail.

---

## Layout

```
┌──────┬──────────────────────────────────────────────┐
│ Rail │ Panel (220px)         │ Main area             │
│ 56px │                       │                       │
│  🖼  │ [Repos btn active]    │                       │
│      │ ─────────────────     │  RepoDetail or        │
│ Repo │  All │ Active │ Inact │  CollDetail           │
│ Coll │  • anthropic-sdk      │                       │
│      │  • claude-code        │                       │
│      │  • react              │                       │
└──────┴───────────────────────┴───────────────────────┘
```

- Rail buttons are icon + small label below (like VS Code Activity Bar)
- Active button is highlighted; clicking it again collapses the panel to 0 width
- The main area expands via CSS flex/grid to fill the freed space
- Collapse/expand animates with a CSS transition (~150ms)

---

## Routing

All nested under `/library`:

| Route | Renders in main area |
|-------|----------------------|
| `/library` | Empty state (select a repo or collection) |
| `/library/repo/:owner/:name` | `RepoDetail` (existing) |
| `/library/collection/:id` | `CollectionDetail` (new, wraps existing `CollDetail`) |

The `/collections` top-level route is replaced with `<Navigate to="/library" replace />` to avoid broken navigation for any in-memory links.

---

## Component breakdown

### `NavRail.tsx` (modified)

Currently renders only a logo and imports `./DiscoverSidebar.css`. Extended to accept:

```ts
interface NavRailProps {
  activePanel: 'repos' | 'collections' | null
  onPanelToggle: (panel: 'repos' | 'collections') => void
}
```

Renders:
- Logo (unchanged)
- `Repositories` button — icon + label, active/collapsed state
- `Collections` button — icon + label, active/collapsed state

State is owned by `Library.tsx` and passed down. The `CollectionsIcon` SVG already exists in `Dock.tsx` and can be copied/shared. A list-lines icon suits Repositories.

### `Library.tsx` (modified)

- Owns `activePanel: 'repos' | 'collections' | null` state (default `'repos'`)
- Renders `NavRail` with toggle handler
- Conditionally renders `LibrarySidebar` (repos) or `CollectionsSidebar` (collections) based on `activePanel`
- Adds nested route `collection/:id → CollectionDetail`
- Panel wrapper has `overflow: hidden` + `width` transition for collapse animation
- **Empty-state guard**: currently uses `useMatch('/library/repo/:owner/:name')` to decide whether to show the outlet or the empty state. Must be updated to also match `/library/collection/:id`. Use two `useMatch` calls (one for repo, one for collection) and show the outlet if either matches, empty state otherwise.
- **`selectedId` for CollectionsSidebar**: derive the current collection ID from `useMatch('/library/collection/:id')?.params.id ?? null` and pass it as `selectedId` to `CollectionsSidebar` so the correct row appears highlighted.
- **`isDiscoverPage`** in `App.tsx` already includes `/library` and needs no change for this feature.

### `LibrarySidebar.tsx` (minor changes)

No functional changes. Remove any assumption that it's always visible — it's now conditionally rendered.

### `CollectionsSidebar.tsx` (new)

Slim sidebar showing the collections list. Props:

```ts
interface CollectionsSidebarProps {
  selectedId: string | null
  onSelect: (id: string) => void
}
```

- Fetches `window.api.collection.getAll()` on mount
- Renders collection rows (name + icon/color)
- "+ New collection" button at bottom opens `NewCollectionModal`
- Clicking a row calls `onSelect(id)` → `Library.tsx` calls `navigate('/library/collection/:id')`

Does **not** contain the full `CollDetail` — that's the main area's job.

### `CollectionDetail.tsx` (new — owns all collection state)

Route component rendered at `/library/collection/:id`. This is **not** a thin wrapper — it must own all the state and handlers that `Collections.tsx` currently provides for the detail panel:

- Reads `:id` from `useParams()`
- Local state: `detail: CollectionRepoRow[]`, `installing: Set<string>`, `libraryRows: LibraryRow[]`
- Fetches `window.api.collection.getDetail(id)` on `id` change
- Fetches `window.api.library.getAll()` for install status
- Implements `handleToggle`, `handleDelete`, `handleInstall`, `handleInstallAll` (same logic as `Collections.tsx`)
- Renders `<CollDetail coll={...} repos={detail} onToggle={...} onDelete={...} onInstall={...} onInstallAll={...} installing={installing} />`
- On delete, calls `navigate('/library')` to return to empty state

**Obtaining the `coll` object:** `CollectionsSidebar` passes the full `CollectionRow` via router state when navigating: `navigate('/library/collection/:id', { state: { coll, collectionName: coll.name } })`. `CollectionDetail` reads it via `useLocation().state?.coll`. If state is absent (e.g. a direct deep-link or future external navigation), fall back to calling `window.api.collection.getAll()` and finding the row by id. This matches the existing pattern used by `repoAvatarUrl` in `RepoDetail`.

### `NavBar.tsx` (modified)

- Remove `'/collections': 'Collections'` from `ROUTE_LABELS`
- Add a new `else if (path.startsWith('/library/collection/'))` branch in the breadcrumb if-else chain (inserted before the final `else` block at line ~150), reading `location.state?.collectionName` for the label and pushing one breadcrumb segment

### `Dock.tsx` (modified)

- Remove `Collections` from `NAV_ITEMS`
- Remove `'/collections'` from `getTabPrefix`
- Remove `'/collections'` from `getSearchPlaceholder`
- The `lastTabPath` ref keyed on `/collections` will naturally become a dead key — no migration needed

### `App.tsx` (modified)

- Remove `import Collections`
- Replace the `/collections` `<Route>` with `<Route path="/collections" element={<Navigate to="/library" replace />} />`
- `isDiscoverPage` needs no change (already includes `/library`)

---

## CSS

### NavRail buttons — add to `DiscoverSidebar.css`

`NavRail.tsx` already imports `./DiscoverSidebar.css`, so new NavRail button styles go there:

```css
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
.nav-rail-btn:hover { background: rgba(255,255,255,0.06); color: var(--t2); }
.nav-rail-btn.active { background: rgba(255,255,255,0.1); color: var(--t1); }
.nav-rail-btn-label { font-size: 9px; font-weight: 500; }
```

### Panel collapse — add to `LibrarySidebar.css`

```css
.library-panel {
  width: 220px;
  transition: width 0.15s ease;
  overflow: hidden;
}
.library-panel.collapsed {
  width: 0;
}
```

Note: collapsed panels remain in the DOM but have `width: 0; overflow: hidden`, so their content is not visible. For accessibility, add `aria-hidden="true"` and `tabIndex={-1}` to interactive elements inside a collapsed panel (or use `display: none` after the transition ends via `transitionend` listener).

---

## Data flow

```
Library.tsx
  ├── activePanel state ('repos' | 'collections' | null)
  ├── repoMatch = useMatch('/library/repo/:owner/:name')
  ├── collMatch = useMatch('/library/collection/:id')
  ├── NavRail (activePanel, onPanelToggle)
  ├── [activePanel === 'repos'] LibrarySidebar
  │     installedRows, starredRows, selectedId=repoMatch?.params, onSelect → navigate('/library/repo/...')
  ├── [activePanel === 'collections'] CollectionsSidebar
  │     selectedId=collMatch?.params.id, onSelect → navigate('/library/collection/:id', {state:{collectionName}})
  └── <main>
        <Routes>
          repo/:owner/:name  → RepoDetail (existing)
          collection/:id     → CollectionDetail (new, owns all state/handlers)
          (index)            → empty state [shown when neither repoMatch nor collMatch]
        </Routes>
```

---

## Out of scope

- Keyboard shortcut to toggle panels
- Persisting last-active panel across sessions (can be added later via localStorage)
- Search/filter within CollectionsSidebar (existing search context can be wired later)
- Any changes to `RepoDetail`, `CollDetail`, or `NewCollectionModal` internals
