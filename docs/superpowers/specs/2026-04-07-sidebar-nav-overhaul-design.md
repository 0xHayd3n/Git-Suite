# Sidebar Navigation Overhaul — Design Spec

**Date:** 2026-04-07
**Status:** Approved

---

## Overview

Overhaul the app sidebar to match the visual style of the reference design (Oliya). Introduces a logo/wordmark header, moves search from individual view topbars into the sidebar (always visible, route-aware), and replaces the right-border active indicator on nav items with a rounded rectangle background highlight.

---

## Goals

- Sidebar search is always visible regardless of active route
- Searching filters content within the current view
- Nav active state uses rounded rectangle background instead of right-side accent border
- App logo + "Git-Suite" wordmark appears at the top of the sidebar
- Existing sort controls and other view-level toolbar elements are untouched

---

## Architecture

### SearchContext

A new React context (`src/contexts/Search.tsx`) holds a single piece of state: the current search query string.

```ts
interface SearchContextValue {
  query: string
  setQuery: (q: string) => void
  inputRef: React.RefObject<HTMLInputElement> | null
  setInputRef: (ref: React.RefObject<HTMLInputElement>) => void
}
```

- Exported as `SearchProvider` and `useSearch()` hook
- **Provider placement:** `<SearchProvider>` must be placed **inside** `MemoryRouter` (alongside `ProfileOverlayProvider` and `SavedReposProvider`) so that `useLocation()` is available to any consumer. It must NOT wrap the `MemoryRouter` itself.
- **No auto-reset on route change.** Query persists as the user navigates between views. Users clear it manually. This avoids a conflict with Discover's snapshot restore mechanism (see below).

### Sidebar

`src/components/Sidebar.tsx` is updated with:

1. **App header** — a small icon SVG + "Git-Suite" wordmark in bold, separated from the nav by a thin divider.
2. **Search input** — full-width rounded input with a search icon on the left and a `/` kbd hint on the right (decorative only — keyboard binding is deferred to a follow-on spec). Reads/writes `SearchContext.query`. Placeholder is route-aware:
   - `/discover` → `"Search repos…"`
   - `/library` → `"Filter skills…"`
   - `/starred` → `"Filter starred…"`
   - `/collections` → `"Filter collections…"`
   - fallback → `"Search…"`
3. **Nav items** — active state switches from `border-right` accent to a full-row rounded rectangle background (`var(--accent-soft)`). Icon opacity is 1 on active, 0.5 otherwise.
4. **Bottom section** — Settings item (same rounded style) + status dots. Unchanged functionally.

Width increases from 200px → 240px.

### View wiring

#### Discover (special case — bidirectional sync with context)

Discover's `query` state is entangled with the `discoverStateStore` snapshot/restore mechanism. Snapshot objects include `query` as a field alongside `repos`, `viewMode`, `activeTags`, `appliedFilters`, etc. Moving this state fully into context would break snapshot restore.

Resolution: Discover keeps its own local `query` state (renamed `discoverQuery` to avoid naming collision with the context setter) for all existing logic (search submission, suggestions, mode detection, snapshot save). It **bidirectionally syncs** with `SearchContext` whose setter is aliased as `setContextQuery`:

- **On mount:** call `setContextQuery(restoredSnapshot.current !== null ? restoredSnapshot.current.query : contextQuery)` so the sidebar reflects the correct initial value. Using an explicit null-check (not `??`) is required because a snapshot with `query: ''` is a valid empty-string restore that must not fall through to `contextQuery`. No change to `discoverQuery` state at mount — its `useState` initialiser already handles the snapshot.
- **Inbound (sidebar → Discover):** a `useEffect([contextQuery])` writes `contextQuery` into `discoverQuery` via `setDiscoverQuery` when they differ (`if (contextQuery !== discoverQuery) setDiscoverQuery(contextQuery)`). This allows the sidebar input to drive Discover's search.
- **Outbound (Discover → sidebar):** wherever `discoverQuery` is updated from within Discover (suggestion click, search submission, clear), also call `setContextQuery(newValue)` to keep the sidebar input in sync.
- **Loop guard:** the value comparison in the inbound effect (`contextQuery !== discoverQuery`) prevents infinite cycles between the two sync directions.

Discover's existing topbar `<input>` is removed. The sidebar input serves as the search entry point. However, the suggestion dropdown and its associated state (`showSuggestions`, `suggestionIndex`, `inputRef`, keyboard nav, blur/focus handlers) must remain functional. To achieve this:
- `SearchContext` is extended with an optional `inputRef: React.RefObject<HTMLInputElement> | null` field, written by the sidebar and read by Discover.
- The suggestion dropdown continues to be rendered in Discover's JSX, positioned relative to the sidebar input's `getBoundingClientRect()` (using `position: fixed` instead of `position: absolute` so it can escape the sidebar's layout). Coordinates are read fresh from `inputRef.current.getBoundingClientRect()` on each render cycle when `showSuggestions` is true.
- All existing suggestion keyboard navigation (`onKeyDown`) and `onBlur`/`onFocus` handlers are re-attached to the sidebar input via the forwarded ref.

#### Library

- Remove `filter` state (`useState('')`) and the filter `<input>` in `library-topbar`
- Read `query` from `useSearch()` and use it as the filter value directly
- Sort buttons in the topbar remain untouched

#### Starred

- Remove `search` state (`useState('')`) and the search `<input>` in `starred-topbar` (not in the account bar)
- Read `query` from `useSearch()`
- Sort/filter controls remain untouched

#### Collections

- Remove `search` state (`useState('')`) and the search `<input>` from `collections-topbar`
- Read `query` from `useSearch()` to filter the left-side collection list (same filtering logic, just sourced from context instead of local state)
- The modal-internal `repoSearch` state (used inside `NewCollectionModal` to filter library rows) is **not** touched — it is modal-scoped and should remain local

---

## CSS Changes (`globals.css`)

- `.sidebar` width: `200px` → `240px`
- `.nav-item`: remove `border-right: 2px solid transparent`
- `.nav-item.active` and `.sidebar-nav-item.active`: remove `border-right-color`; add `border-radius: 8px` to `.nav-item.active`; background stays `var(--accent-soft)` (already set — no token change needed)
- Add `.sidebar-header` styles: flex row, align-items center, gap, padding, font-weight bold
- Add `.sidebar-search` styles: rounded input, search icon left, `/` hint right

---

## Files Changed

| File | Change |
|------|--------|
| `src/contexts/Search.tsx` | **New** — SearchContext, SearchProvider, useSearch |
| `src/App.tsx` | Add `<SearchProvider>` inside `MemoryRouter`, alongside existing providers |
| `src/components/Sidebar.tsx` | App header, search input (reads/writes context), rounded-rect nav items |
| `src/views/Discover.tsx` | Remove topbar search input; bidirectional sync with SearchContext |
| `src/views/Library.tsx` | Remove filter input + local state, consume useSearch |
| `src/views/Starred.tsx` | Remove search input from `starred-topbar` + local state, consume useSearch |
| `src/views/Collections.tsx` | Remove search input from `collections-topbar` + local state, consume useSearch |
| `src/styles/globals.css` | Sidebar width, nav-item border removal, rounded-rect active, sidebar-header/search styles |

---

## Out of Scope

- BucketNav component — no changes (bucket/subtype filter state is Discover-internal)
- Settings view — no search input present
- RepoDetail view — no changes
- Any backend/IPC changes
- `NewCollectionModal` internal `repoSearch` state — remains local
- Keyboard shortcut binding `/` to focus sidebar search — deferred to a follow-on spec
