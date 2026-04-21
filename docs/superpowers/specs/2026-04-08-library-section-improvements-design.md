# Library Section Improvements — Design Spec

**Date:** 2026-04-08
**Scope:** All three library-area views (Library, Collections, Discover) — toast notifications, component extraction, empty states, accessibility, responsive design, icon standardization, and tests.
**Approach:** Layer-by-layer (Approach C) — shared foundations first, then view decomposition, then UX/a11y/responsive across all views simultaneously.

---

## Layer 1: Shared Components

### 1.1 Toast Notification System

**New files:**
- `src/contexts/Toast.tsx` — `ToastProvider` context + `useToast()` hook

**Behavior:**
- `useToast()` returns `{ toast(message, type?) }` where `type` is `'success' | 'error' | 'info'` (default: `'info'`)
- Toasts render in a React portal to `document.body` at the bottom-right corner of the app (z-index above titlebar)
- Auto-dismiss: 3s for success/info, 5s for errors
- Stack vertically, animate in/out with CSS transitions (slide-in from right, fade-out)
- Max 3 visible at once; oldest dismissed when limit exceeded
- Each toast has a manual dismiss (X) button

**Integration points:**
- Library: regenerate (success/error), enhance (success/error), toggle (silent — no toast), remove (success/error)
- Collections: toggle (silent), delete (success), install (success/error), install-all (success/error), create (success/error)
- Discover: save/star operations (already in RepoCard — wire error toasts)

**CSS:** Added to `globals.css` under a `/* ── Toasts */` section.

### 1.2 Toggle Component

**New file:** `src/components/Toggle.tsx`

Unifies the duplicated Toggle from Library.tsx and Collections.tsx.

```typescript
interface ToggleProps {
  on: boolean
  onChange: (value: boolean) => void
  mini?: boolean
  ariaLabel: string  // required for a11y
}
```

- Renders as a `<button>` with `role="switch"`, `aria-checked={on}`, `aria-label={ariaLabel}`
- Reuses existing `lib-toggle` CSS classes
- **Migration note:** Collections.tsx currently uses `{ on: boolean; onToggle: () => void }` (void callback). All Collections call sites (`CollRow`, `CollDetail`) must update to pass `(value: boolean) => void` or use an adapter wrapper at the call site

### 1.3 LangBadge Component

**New file:** `src/components/LangBadge.tsx`

Replaces the inline `LangBadge` in Collections.tsx and the manual `getLangConfig` usage in Library's `LibraryListRow`.

```typescript
interface LangBadgeProps {
  lang: string | null
  size?: number  // default 24
}
```

- Uses `getLangConfig` from `BannerSVG.tsx` internally (no duplicated color maps)
- `getLangConfig` already provides `abbr`, `bg`, and `primary` fields with fallback logic for unknown languages — verify the fallback matches Collections' current `lang.slice(0, 2)` behavior before deleting
- Deletes `LANG_ABBR`, `LANG_BG`, `LANG_TEXT` from Collections.tsx

### 1.4 Other Small Shared Components

**New files:**
- `src/components/SectionHeader.tsx` — `{ label: string }` — section divider with line
- `src/components/DetailRow.tsx` — `{ k: string; v: string }` — key-value pair display

Both are trivial extractions from Library.tsx with no API changes.

---

## Layer 2: View Decomposition

### 2.1 Library.tsx Extraction

**Extracted to `src/components/`:**

| Component | Props summary |
|-----------|--------------|
| `LibraryListRow` | `row, selected, onSelect, onToggle` |
| `SkillDepthBars` | `content: string` |
| `ComponentPreview` | `name: string` |
| `GenericDetail` | `row, collections, onToggle, onRegenerate, onEnhance, onRemove, regenerating, componentsSubSkill, versionedInstalls` |
| `ComponentDetail` | `row, collections, activeTab, onTabChange, componentSearch, onComponentSearchChange, onToggleComponent, onSelectAll, onRebuild, onToggleActive, onEnhance, regenerating, componentsSubSkill, versionedInstalls` |

**Helpers that move with components:**
- `formatDate`, `daysSince`, `parseSignals` — move to `src/utils/dateHelpers.ts` (shared by GenericDetail and ComponentDetail)

**What remains in Library.tsx (~150 lines):**
- State declarations (rows, selected, sort, etc.)
- `useEffect` for data loading
- Event handlers (handleToggle, handleEnhance, etc.)
- Layout JSX composing the extracted components

### 2.2 Collections.tsx Extraction

**Extracted to `src/components/`:**

| Component | Props summary |
|-----------|--------------|
| `CollRow` | `coll, selected, onClick, onToggle` |
| `CollDetail` | `coll, repos, onToggle, onDelete, onInstall, onInstallAll, installing` |
| `NewCollectionModal` | `libraryRows, onClose, onCreate` |

**What remains in Collections.tsx (~120 lines):**
- State, data loading, event handlers, layout

### 2.3 Discover.tsx Decomposition

**Extracted to `src/components/`:**

| Component | Responsibility |
|-----------|---------------|
| `DiscoverModeTabs` | Trending/Popular/Forked/Rising tab bar (note: `ViewModeBar` name is taken by the file browser component) |
| `DiscoverSuggestions` | Search suggestions dropdown (history, topics, subtypes) |
| `DiscoverFilters` | Filter state management + FilterDropdown trigger button |
| `VerificationToggles` | Official / Likely Official toggle buttons |
| `DiscoverGrid` | Grid/list rendering + infinite scroll sentinel + skeleton loading |

**Extracted to `src/lib/`:**

| Module | Contents |
|--------|---------|
| `discoverQueries.ts` | `buildViewModeQuery`, `getViewModeSort`, `SUB_TYPE_KEYWORD` map (~80 entries), `VIEW_MODES` array, and `ViewModeKey` type — pure functions and constants |

**What remains in Discover.tsx (~250 lines):**
- Top-level state orchestration
- Data fetching effects
- Snapshot persistence logic (scroll position restoration stays in parent; `DiscoverGrid` receives no restore-related props)
- Composing sub-components

**Hook placement:** `DiscoverSuggestions` calls `useSearchHistory` internally. `VerificationToggles` calls `useVerification` internally. These hooks stay with the components that use their data.

---

## Layer 3: UX Improvements

### 3.1 Toast Integration

Wire `useToast()` into async operations across all three views:

**Library:**
- Regenerate: `toast('Skill regenerated', 'success')` / `toast('Failed to regenerate skill', 'error')`
- Enhance: `toast('Skill enhanced to Tier 2', 'success')` / `toast('Enhancement failed', 'error')`
- Remove: `toast('Skill removed', 'success')` / `toast('Failed to remove skill', 'error')`

**Collections:**
- Create: `toast('Collection created', 'success')` / `toast('Failed to create collection', 'error')`
- Delete: `toast('Collection deleted', 'success')`
- Install: `toast('{name} installed', 'success')` / `toast('Failed to install {name}', 'error')`
- Install all: `toast('All missing skills installed', 'success')` / individual error toasts

**Discover/RepoCard:**
- Wire error toasts where `learnState`/`downloadState` errors are currently swallowed

### 3.2 Empty States with CTAs

| Location | Content |
|----------|---------|
| Library (no skills) | Icon + "No skills installed yet" + "Browse and save repos from Discover to get started" + **"Go to Discover"** button → `/discover` (uses `useNavigate` — new import for Library.tsx) |
| Library (filter no match) | "No skills match your search." below the stat pills |
| Collections (empty list) | "No collections yet" + "Group your skills into collections" + **"+ New collection"** button |
| Discover (no results) | Existing text + "Try broadening your search or removing filters" |

---

## Layer 4: Accessibility

### 4.1 Semantic Elements

- `Toggle` → `<button role="switch" aria-checked aria-label>` (covered in Layer 1)
- `LibraryListRow`, `CollRow` → add `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space triggers click)
- `NewCollectionModal` → add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title element

### 4.2 Keyboard Navigation

- Library list + Collections list: `onKeyDown` handler on the list container — Arrow Up/Down navigates rows, Enter selects
- Modal focus trap: on mount, focus first input; Tab cycles within modal; Escape closes

### 4.3 ARIA Labels

- All Toggle instances: descriptive `ariaLabel` (e.g., "Toggle {name} active")
- Sort buttons: `aria-pressed` for active sort mode
- Filter dropdown trigger: `aria-expanded` reflecting open/closed state
- Discover verification toggles: `aria-pressed`

---

## Layer 5: Responsive Design

**Target:** Desktop-only, graceful narrow-window handling.
**Breakpoint:** `768px`

### 5.1 Library & Collections (same pattern)

- Below 768px: hide detail column, list takes full width
- Selecting an item: state-driven view swap — list hides, detail shows with a back button
- Back button returns to list view — rendered top-left of the detail panel as a `← Back` text button, styled with `.responsive-back-btn` class
- Managed via a `showDetail` boolean state in the view component

### 5.2 Discover

- Below 768px: grid switches to `repeat(auto-fill, minmax(280px, 1fr))` overriding the column count
- Filter bar: `flex-wrap: wrap` so items flow naturally
- Suggestions dropdown: `max-width: calc(100vw - 32px)`

### 5.3 General

- Modals: `max-height: 90vh`, `max-width: 90vw`, internal scroll
- Root containers: `overflow-x: hidden`
- All via `@media (max-width: 768px)` blocks in `globals.css`

---

## Layer 6: Icon Standardization

**Standardize on `lucide-react`.**

| File | Remove | Add |
|------|--------|-----|
| `Discover.tsx` | `LuFilter, LuCheck` from `react-icons/lu` | `Filter, Check` from `lucide-react` |
| `RepoCard.tsx` | `LuPlus` from `react-icons/lu` | `Plus` from `lucide-react` |
| `RepoListRow.tsx` | `LuStar, LuGitFork, LuClock` from `react-icons/lu` | `Star, GitFork, Clock` from `lucide-react` |
| `LayoutDropdown.tsx` | `LuLayoutGrid, LuChevronDown` from `react-icons/lu` | `LayoutGrid, ChevronDown` from `lucide-react` |

**Leave alone:**
- Inline SVGs in Sidebar.tsx (custom app icons with no Lucide equivalents)
- `react-icons/si` imports (RepoDetail.tsx, FileIcon.tsx, languages.ts) — these are brand/platform icons with no Lucide equivalents

**Cleanup:** `react-icons` stays in `package.json` — still needed for `react-icons/si` brand icons. But all `react-icons/lu` usage will be eliminated.

---

## Layer 7: Tests

### 7.1 New: Library.test.tsx

Test cases:
- Renders skill list from mocked IPC data
- Sort buttons change list ordering
- Search filtering narrows the list
- Toggle calls `window.api.skill.toggle`
- Empty state shows CTA when no skills
- Selecting a row updates detail panel

### 7.2 Updated Tests

- `Collections.test.tsx` — update imports for extracted components
- `Discover.test.tsx` — update imports for extracted sub-components
- Add a small test for `Toggle` at `src/components/Toggle.test.tsx` verifying `role="switch"` and `aria-checked`

### 7.3 Test Approach

- View-level tests cover the extracted presentational components through integration
- Only `Toggle` gets its own component test (has semantic behavior worth verifying)
- Mock `window.api.*` calls as existing tests already do

---

## File Change Summary

**New files (22):**
- `src/contexts/Toast.tsx`
- `src/components/Toggle.tsx`
- `src/components/Toggle.test.tsx`
- `src/components/LangBadge.tsx`
- `src/components/SectionHeader.tsx`
- `src/components/DetailRow.tsx`
- `src/components/LibraryListRow.tsx`
- `src/components/SkillDepthBars.tsx`
- `src/components/ComponentPreview.tsx`
- `src/components/GenericDetail.tsx`
- `src/components/ComponentDetail.tsx`
- `src/components/CollRow.tsx`
- `src/components/CollDetail.tsx`
- `src/components/NewCollectionModal.tsx`
- `src/components/DiscoverModeTabs.tsx`
- `src/components/DiscoverSuggestions.tsx`
- `src/components/DiscoverFilters.tsx`
- `src/components/DiscoverGrid.tsx`
- `src/components/VerificationToggles.tsx`
- `src/lib/discoverQueries.ts`
- `src/utils/dateHelpers.ts`
- `src/views/Library.test.tsx`

**Modified files:**
- `src/views/Library.tsx` (785 → ~150 lines)
- `src/views/Collections.tsx` (557 → ~120 lines)
- `src/views/Discover.tsx` (1263 → ~250 lines)
- `src/views/Collections.test.tsx` (import updates)
- `src/views/Discover.test.tsx` (import updates)
- `src/styles/globals.css` (toast styles, responsive media queries)
- `src/App.tsx` (wrap with `ToastProvider`)
- `src/components/RepoCard.tsx` (icon imports)
- `src/components/RepoListRow.tsx` (icon imports)
- `src/components/LayoutDropdown.tsx` (icon imports)
