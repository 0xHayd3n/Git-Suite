# Discover Sidebar Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal FilterBar, SmartBar, and DiscoverLanding with a VS Code-style icon rail + expandable side panel for Discover view controls.

**Architecture:** New `DiscoverSidebar` component with a persistent 48px icon rail (Buckets, Filters) and a 240px expandable content panel. `Discover.tsx` owns all state; sidebar is a controlled component. All/Recommended toggle moves to a grid header bar. Dead code (Sidebar, SortDropdown) cleaned up.

**Tech Stack:** React, TypeScript, CSS transitions, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-04-14-discover-sidebar-panel-design.md`

---

## File Structure

### New Files

- `src/components/DiscoverSidebar.tsx` — Icon rail + expandable panel. Contains BucketsPanel and FiltersPanel as internal sub-components. Controlled component receiving filters/buckets state + callbacks as props.
- `src/components/DiscoverSidebar.css` — Styles for the rail, panel, transitions, badges, and panel content sections.
- `src/components/GridHeader.tsx` — Thin bar above the grid with result count, layout controls, and All/Recommended toggle.

### Deleted Files

- `src/components/Sidebar.tsx` — Dead code (not rendered anywhere)
- `src/components/Sidebar.test.tsx` — Test for dead code
- `src/components/FilterBar.tsx` — Replaced by DiscoverSidebar FiltersPanel
- `src/components/SmartBar.tsx` — Replaced by DiscoverSidebar BucketsPanel + GridHeader toggle
- `src/components/SmartBar.test.tsx` — Test for SmartBar
- `src/components/DiscoverLanding.tsx` — Landing page eliminated
- `src/components/DiscoverLanding.test.tsx` — Test for landing page
- `src/components/SortDropdown.tsx` — Dead code
- `src/components/LanguagePopover.tsx` — Language selection moves inline into FiltersPanel

### Modified Files

- `src/views/Discover.tsx` — Remove SmartBar/FilterBar/DiscoverLanding imports and renders. Add `selectedSubtypes` state. Render DiscoverSidebar + GridHeader. Update viewMode to `'all' | 'recommended'` with `'all'` as default.
- `src/lib/discoverQueries.ts` — Update `VIEW_MODES` and `ViewModeKey` to `'all' | 'recommended'`.
- `src/lib/discoverStateStore.ts` — Update `DiscoverSnapshot` interface to include `selectedSubtypes` and new viewMode type.
- `src/components/Dock.tsx` — Remove `isDiscoverLanding` conditional logic (lines 105, 169, 202).
- `src/components/LayoutPopover.tsx` — No code changes, but now rendered from GridHeader instead of FilterBar.

---

## Task 1: Update ViewModeKey and DiscoverSnapshot types

**Files:**
- Modify: `src/lib/discoverQueries.ts:3-8`
- Modify: `src/lib/discoverStateStore.ts:16-30`

- [ ] **Step 1: Update VIEW_MODES and ViewModeKey**

In `src/lib/discoverQueries.ts`, change:

```ts
export const VIEW_MODES = [
  { key: 'all',         label: 'All',         accent: '#60a5fa' },
  { key: 'recommended', label: 'Recommended', accent: '#8b5cf6' },
] as const

export type ViewModeKey = (typeof VIEW_MODES)[number]['key']
```

Update `buildViewModeQuery` to handle `'all'` instead of `'browse'`:
- `'all'` case: same logic as old `'browse'` (returns `'stars:>100 language:{lang}'`)
- `'recommended'` case: unchanged

- [ ] **Step 2: Update DiscoverSnapshot interface**

In `src/lib/discoverStateStore.ts`, add `selectedSubtypes` field and keep `viewMode` as `ViewModeKey`:

```ts
export interface DiscoverSnapshot {
  query: string
  repos: RepoRow[]
  viewMode: ViewModeKey
  activeLanguage: string
  appliedFilters: SearchFilters
  selectedSubtypes: string[]
  activePanel: 'buckets' | 'filters' | null
  mode: 'raw' | 'natural'
  detectedTags: string[]
  activeTags: string[]
  relatedTags: string[]
  scrollTop: number
  page: number
  hasMore: boolean
  searchPath: 'trending' | 'raw' | 'tagged'
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/discoverQueries.ts src/lib/discoverStateStore.ts
git commit -m "refactor: update ViewModeKey to 'all' | 'recommended' and add selectedSubtypes to snapshot"
```

---

## Task 2: Create DiscoverSidebar component

**Files:**
- Create: `src/components/DiscoverSidebar.tsx`
- Create: `src/components/DiscoverSidebar.css`

- [ ] **Step 1: Define the props interface and SearchFilters type**

Define `SearchFilters` locally in this file (do NOT import from FilterBar — it will be deleted later):

```tsx
export type ActivityFilter = 'week' | 'month' | 'halfyear'
export type StarsFilter = 100 | 1000 | 10000

export interface SearchFilters {
  activity?: ActivityFilter
  stars?: StarsFilter
  license?: string
}

export interface DiscoverSidebarProps {
  // Buckets
  selectedSubtypes: string[]
  onSelectedSubtypesChange: (subtypes: string[]) => void

  // Filters
  filters: SearchFilters
  activeLanguage: string
  activeVerification: Set<'verified' | 'likely'>
  onFilterChange: (filters: SearchFilters) => void
  onLanguageChange: (lang: string) => void
  onVerificationToggle: (tier: 'verified' | 'likely') => void

  // Panel state (for snapshot save/restore)
  activePanel: 'buckets' | 'filters' | null
  onActivePanelChange: (panel: 'buckets' | 'filters' | null) => void
}
```

- [ ] **Step 2: Build the icon rail**

The rail is a 48px column with two icon buttons (Buckets and Filters). `activePanel` is now a controlled prop (for snapshot restore), not local state:

```tsx
const togglePanel = (panel: 'buckets' | 'filters') => {
  onActivePanelChange(activePanel === panel ? null : panel)
}
```

Render two icon buttons using lucide-react icons:
- Buckets: `LayoutGrid` icon
- Filters: `SlidersHorizontal` icon

Each button gets:
- Active state: `className="rail-icon active"` when `activePanel === panel`
- Badge dot: visible when panel is collapsed but has active selections
  - Buckets badge: `selectedSubtypes.length > 0`
  - Filters badge: `activeLanguage || filters.stars || filters.activity || filters.license || activeVerification.size > 0`

- [ ] **Step 3: Build the BucketsPanel sub-component**

Internal function component rendered when `activePanel === 'buckets'`.

```tsx
function BucketsPanel({ selectedSubtypes, onSelectedSubtypesChange }: {
  selectedSubtypes: string[]
  onSelectedSubtypesChange: (subtypes: string[]) => void
}) {
```

- Import `REPO_BUCKETS` from `../constants/repoTypes`
- Iterate over `REPO_BUCKETS`, rendering each bucket as a group:
  - Uppercase section label (bucket.label)
  - List of `bucket.subTypes`, each row showing:
    - Colored dot (`bucket.color`)
    - Subtype label
    - Click handler that toggles the subtype ID in `selectedSubtypes`
    - Highlighted background when selected
- Bottom summary (when `selectedSubtypes.length > 0`):
  - "N selected" count
  - Chips with × to remove individual subtypes
  - "Clear all" link calling `onSelectedSubtypesChange([])`

- [ ] **Step 4: Build the FiltersPanel sub-component**

Internal function component rendered when `activePanel === 'filters'`.

```tsx
function FiltersPanel({ filters, activeLanguage, activeVerification, onFilterChange, onLanguageChange, onVerificationToggle }: { ... }) {
```

**Language section:**
- Search input with local state `langSearch`
- Import popular languages from `../lib/languages` (use `LANG_MAP` keys)
- Show chip buttons for top languages (TypeScript, Python, Rust, Go, Java, JavaScript, C++, C#, Ruby, Swift)
- Filter chips by `langSearch`
- Single-select: clicking active language deselects, clicking inactive selects

**Stars section:**
- Radio-style list: Any (undefined), 100, 1000, 10000
- Labels: "Any", "100+", "1,000+", "10,000+"
- Click calls `onFilterChange({ ...filters, stars: value })`

**Activity section:**
- Radio-style list: Any (undefined), 'week', 'month', 'halfyear'
- Labels: "Any", "Last 7 days", "Last 30 days", "Last 6 months"

**License section:**
- Radio-style list: Any (undefined), 'mit', 'apache-2.0', 'gpl-3.0'
- Labels: "Any", "MIT", "Apache 2.0", "GPL 3.0"

**Verification section:**
- Checkbox-style: 'verified', 'likely'
- Labels: "Official", "Likely Official"
- Click calls `onVerificationToggle(tier)`

**Bottom summary:**
- Count active filters + "Clear all" that resets all filters

- [ ] **Step 5: Write the CSS**

`DiscoverSidebar.css` key rules:

```css
.discover-sidebar { display: flex; height: 100%; }
.sidebar-rail { width: 48px; min-width: 48px; display: flex; flex-direction: column; align-items: center; padding-top: 12px; gap: 8px; }
.rail-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.5; position: relative; }
.rail-icon.active { opacity: 1; background: var(--surface-hover); border: 1px solid var(--border-accent); }
.rail-icon .badge { position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; }
.sidebar-panel { width: 240px; overflow-y: auto; padding: 12px; transition: width 0.2s ease, opacity 0.15s ease 0.05s; }
.sidebar-panel.collapsed { width: 0; padding: 0; opacity: 0; overflow: hidden; }
```

Plus styles for bucket groups, subtype rows, filter sections, radio items, chips, and the bottom summary.

- [ ] **Step 6: Commit**

```bash
git add src/components/DiscoverSidebar.tsx src/components/DiscoverSidebar.css
git commit -m "feat: create DiscoverSidebar with icon rail, BucketsPanel, and FiltersPanel"
```

---

## Task 3: Create GridHeader component

**Files:**
- Create: `src/components/GridHeader.tsx`

- [ ] **Step 1: Define the component**

```tsx
import type { ViewModeKey } from '../lib/discoverQueries'
import type { LayoutPrefs } from './LayoutDropdown'

interface GridHeaderProps {
  repoCount: number
  viewMode: ViewModeKey
  onViewModeChange: (mode: ViewModeKey) => void
  layoutPrefs: LayoutPrefs
  onLayoutChange: (prefs: LayoutPrefs) => void
}
```

- [ ] **Step 2: Build the header layout**

Left side: `"{repoCount} repos"` text.

Center-right: Grid/list toggle buttons + settings cog (opens LayoutPopover). Port the layout toggle JSX from `FilterBar.tsx:214-245` — same icons (LayoutGrid, List, Settings from lucide-react), same click handlers.

Right side: All/Recommended pill toggle:

```tsx
<div className="view-mode-toggle">
  {VIEW_MODES.map(m => (
    <button
      key={m.key}
      className={viewMode === m.key ? 'active' : ''}
      onClick={() => onViewModeChange(m.key)}
    >
      {m.label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/GridHeader.tsx
git commit -m "feat: create GridHeader with All/Recommended toggle and layout controls"
```

---

## Task 4: Wire DiscoverSidebar and GridHeader into Discover.tsx

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Add selectedSubtypes state**

After line 89 (`activeBucket` state), add:

```tsx
const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>(
  () => restoredSnapshot.current?.selectedSubtypes ?? []
)
```

- [ ] **Step 2: Update viewMode logic**

Change lines 70-73 from:

```tsx
const viewMode: ViewModeKey | null = (() => {
  const v = searchParams.get('view')
  return (v === 'recommended' || v === 'browse') ? v : null
})()
```

To:

```tsx
const viewMode: ViewModeKey = (() => {
  const v = searchParams.get('view')
  return v === 'recommended' ? 'recommended' : 'all'
})()
```

Update `setViewMode` (lines 200-206) to handle the new type — `'all'` either removes the `view` param or sets `view=all`.

- [ ] **Step 3: Add activePanel state and remove DiscoverLanding branch**

Add `activePanel` state for sidebar panel restore:

```tsx
const [activePanel, setActivePanel] = useState<'buckets' | 'filters' | null>(
  () => restoredSnapshot.current?.activePanel ?? null
)
```

Delete the `if (viewMode === null)` block (lines 835-842) that returns `<DiscoverLanding ... />`. The component now always renders the grid layout.

- [ ] **Step 4: Replace SmartBar and FilterBar with DiscoverSidebar + GridHeader**

Remove imports:
- Line 13: `import SmartBar from '../components/SmartBar'`
- Line 12: `import FilterBar, { type SearchFilters } from '../components/FilterBar'`
- Line 28: `import DiscoverLanding from '../components/DiscoverLanding'`

Add imports:
```tsx
import DiscoverSidebar, { type SearchFilters } from '../components/DiscoverSidebar'
import GridHeader from '../components/GridHeader'
```

Also rename `selectedTypes` (line 88) to `selectedSubtypes` throughout the file — update all references including any search/fetch effects (around lines ~321, ~610) that use `selectedTypes` with `getSubTypeKeyword()`.

`DiscoverSuggestions` (rendered at ~line 852) stays — it provides search autocomplete in the main view. Its `onSelectSubtype` callback should be rewired to call `setSelectedSubtypes` instead of the old `setSelectedTypes`. Review its props and update any that reference the old state names.

Replace the SmartBar render (lines 874-881) and FilterBar render (lines 883-892) with:

```tsx
<div className="discover-layout">
  <DiscoverSidebar
    selectedSubtypes={selectedSubtypes}
    onSelectedSubtypesChange={setSelectedSubtypes}
    filters={appliedFilters}
    activeLanguage={activeLanguage}
    activeVerification={activeVerification}
    onFilterChange={handleFilterChange}
    onLanguageChange={handleLanguageChange}
    onVerificationToggle={handleVerificationToggle}
    activePanel={activePanel}
    onActivePanelChange={setActivePanel}
  />
  <div className="discover-main">
    <GridHeader
      repoCount={repos.length}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      layoutPrefs={layoutPrefs}
      onLayoutChange={handleLayoutChange}
    />
    {/* existing .discover-content scroll container with DiscoverGrid */}
  </div>
</div>
```

- [ ] **Step 5: Update snapshot save/restore**

In the `saveDiscoverSnapshot` call (lines 662-668), add `selectedSubtypes` and `activePanel`:

```tsx
saveDiscoverSnapshot({
  query: discoverQuery, repos, viewMode, activeLanguage, appliedFilters,
  selectedSubtypes, activePanel,
  mode, detectedTags, activeTags, relatedTags,
  scrollTop: scrollRef.current?.scrollTop ?? 0,
  page, hasMore, searchPath,
})
```

- [ ] **Step 6: Verify selectedSubtypes search integration**

The rename from `selectedTypes` → `selectedSubtypes` in Step 4 already covers the search/fetch effects that use `getSubTypeKeyword()` to build queries. Verify the existing effects at ~lines 321 and 610 compile and reference the renamed `selectedSubtypes` state. No new logic needed — just confirm the rename didn't break the dependency chain.

- [ ] **Step 7: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: wire DiscoverSidebar and GridHeader into Discover view"
```

---

## Task 5: Update Dock.tsx — remove DiscoverLanding conditionals

**Files:**
- Modify: `src/components/Dock.tsx:105,169,202`

- [ ] **Step 1: Remove isDiscoverLanding logic**

Delete line 105:
```tsx
const isDiscoverLanding = location.pathname === '/discover' && !searchParams.get('view')
```

Remove the `!isDiscoverLanding &&` wrappers at lines 169 and 202 — the wrapped elements should now always render.

- [ ] **Step 2: Commit**

```bash
git add src/components/Dock.tsx
git commit -m "refactor: remove DiscoverLanding conditionals from Dock"
```

---

## Task 6: Delete removed components

**Files:**
- Delete: `src/components/Sidebar.tsx`
- Delete: `src/components/Sidebar.test.tsx`
- Delete: `src/components/FilterBar.tsx`
- Delete: `src/components/SmartBar.tsx`
- Delete: `src/components/SmartBar.test.tsx`
- Delete: `src/components/DiscoverLanding.tsx`
- Delete: `src/components/DiscoverLanding.test.tsx`
- Delete: `src/components/SortDropdown.tsx`
- Delete: `src/components/LanguagePopover.tsx`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -rn "import.*from.*'/Sidebar'" src/
grep -rn "import.*from.*'/FilterBar'" src/
grep -rn "import.*from.*'/SmartBar'" src/
grep -rn "import.*from.*'/DiscoverLanding'" src/
grep -rn "import.*from.*'/SortDropdown'" src/
grep -rn "import.*from.*'/LanguagePopover'" src/
```

All should return empty (aside from the files being deleted themselves). If any imports remain, fix them first.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git rm src/components/FilterBar.tsx
git rm src/components/SmartBar.tsx src/components/SmartBar.test.tsx
git rm src/components/DiscoverLanding.tsx src/components/DiscoverLanding.test.tsx
git rm src/components/SortDropdown.tsx
git rm src/components/LanguagePopover.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete replaced components (Sidebar, FilterBar, SmartBar, DiscoverLanding, SortDropdown, LanguagePopover)"
```

---

## Task 7: Build verification and CSS polish

**Files:**
- Modify: `src/components/DiscoverSidebar.css`
- Modify: `src/styles/globals.css` (if needed for layout)

- [ ] **Step 1: Verify the app builds**

```bash
npm run build
```

Fix any TypeScript errors — likely missing type imports or stale references to deleted components.

- [ ] **Step 2: Polish CSS transitions and spacing**

Ensure:
- Panel width transition is smooth (0.2s ease)
- Content opacity fades in after panel expands
- Rail border and panel border match the app theme
- Bottom summary in both panels is sticky at panel bottom
- Panel scrolls independently from the main grid

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: finalize discover sidebar panel — build fix and CSS polish"
```
