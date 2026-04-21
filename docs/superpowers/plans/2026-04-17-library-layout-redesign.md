# Library Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Library view's legacy two-column master/detail layout with a Discover-style sidebar + grid + slide-in right detail panel. Group skills by `type_bucket` when no filter is applied, flatten under any filter. Preserve Active/Inactive as a top-bar segmented control.

**Architecture:** Extend `DiscoverSidebar` with a `mode: 'discover' | 'library'` prop that (a) hides Stars/Activity/License sections in the Advanced panel, (b) adds a Skill Status section to the Advanced panel, and (c) accepts optional per-label `itemCounts` annotations. Build two new components, `LibraryGrid` (sectioned vs flat renderer) and `LibraryCard` (grid-mode card with inline active toggle and sub-skill indicator), plus a thin slide-in panel wrapper in `Library.tsx`. The existing `ComponentDetail` / `GenericDetail` variants render unchanged inside the new panel chrome (their "← Back" button is moved out to the panel chrome). `LibraryListRow` is kept for list-mode rendering. Phase 2 (MCP tools picker) lives in a separate plan and depends on this one.

**Tech Stack:** React 18, TypeScript, Vite, react-router-dom, Vitest + @testing-library/react, lucide-react. CSS in `globals.css` + `DiscoverSidebar.css`.

**Spec:** [2026-04-17-library-discover-style-redesign-design.md](../specs/2026-04-17-library-discover-style-redesign-design.md) — sections 1–4, 6, 7, 8 cover this plan. Section 5 (MCP tools picker) is covered by a separate plan.

**Branch policy:** Per user's CLAUDE.md override, all tasks commit directly to `main`. Do **not** create worktrees; subagent-driven-development's worktree prerequisite is overridden here.

## Design deviations from spec

Two places where this plan diverges from the literal reading of spec §1.1:

1. **Sidebar panel taxonomy.** Spec §1.1 lists five "panels shown in mode='library'": Home, Buckets, Languages, Verification, Skill Status. `DiscoverSidebar`'s actual rail has only two filter buttons today (`filters` = tabbed Languages+Types, `advanced` = Stars/Activity/License/Verification). Rather than carve out new rail icons for each spec-level panel, this plan collapses the library-mode taxonomy onto the existing two panels: Languages + Types live in `filters` (unchanged), and Verification + Skill Status live in `advanced` (library-mode adds Skill Status, hides Stars/Activity/License). Home and Buckets are not new panels — Home is the rail icon (already exists), Buckets is a view of the same Types list inside `filters`. This keeps the rail icon count at 2 instead of expanding to 4.
2. **`GridHeader` reuse.** `GridHeader` renders an All/Recommended pill that has no meaning in Library. Task 7.5 adds a `hideViewMode` prop so library mode gets chips + layout toggle without the vestigial pill.

If either deviation is unacceptable, raise before executing — flipping to separate rail panels or a new chips-only component are both larger but straightforward changes.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/components/DiscoverSidebar.tsx` | Add `mode` prop (default `'discover'`); add `itemCounts` optional prop; conditionally hide Stars/Activity/License in `AdvancedPanel`; add Skill Status section in `AdvancedPanel` when `mode='library'`; annotate bucket + language labels with counts when `itemCounts` is supplied |
| Modify | `src/components/GridHeader.tsx` | Add `hideViewMode?: boolean` prop; when true, suppress the All/Recommended pill. Library mode passes `hideViewMode` to get just chips + layout toggle |
| Modify | `src/components/DiscoverSidebar.css` | New rules for `.skill-status-section`, `.skill-status-row`, count annotations |
| Create | `src/components/LibraryCard.tsx` | Grid-mode card — derived from `RepoCard` visuals, adds Active dot, hover-revealed inline toggle, sub-skill indicator, Enhanced pill |
| Create | `src/components/LibraryCard.test.tsx` | Unit tests: active dot color, hover toggle invokes callback, sub-skill indicator presence, Enhanced pill gating |
| Create | `src/components/LibraryGrid.tsx` | Renders either sectioned-by-bucket or flat grid depending on filter state; delegates row/card rendering to `LibraryCard` (grid) or `LibraryListRow` (list) |
| Create | `src/components/LibraryGrid.test.tsx` | Unit tests: sectioned when no filters; flat when any filter; bucket ordering; empty-bucket omission; active-segment filtering |
| Create | `src/components/LibraryDetailPanel.tsx` | Slide-in panel chrome wrapper — close button (✕), Escape key handler, slide-in CSS class. Renders its children inside a side-pushed column |
| Modify | `src/views/Library.tsx` | Full rewrite: state for filters/sort/active-segment/layout/selection; data derivation (filtered, sorted, itemCounts); compose `DiscoverSidebar` + top bar + `LibraryGrid` + `LibraryDetailPanel`; variant dispatch (Components → `ComponentDetail`; else → `GenericDetail`). Phase 1 does NOT include MCP dispatch — that lands in Plan 2. |
| Modify | `src/views/Library.test.tsx` | Rewrite to match new structure: sidebar presence, segmented control, card list, slide-in panel open/close, variant dispatch |
| Modify | `src/components/ComponentDetail.tsx` | Remove any Library-specific chrome — `ComponentDetail` already has none; this is a no-op unless any internal "back" affordance exists (spot-check only) |
| Modify | `src/components/GenericDetail.tsx` | Same spot-check as above |
| Modify | `src/styles/globals.css` | New rules for `.library-root` v2, `.library-topbar` v2, `.library-segmented`, `.library-grid`, `.library-bucket-section`, `.library-bucket-section-header`, `.library-card`, `.library-active-dot`, `.library-inline-toggle`, `.library-sub-skill-indicator`, `.library-detail-panel`, `.library-detail-close-btn` |

Note: Per the spec, `LibraryListRow` is retained as the list-mode rendering; merging it into `LibraryCard` is deferred (YAGNI).

---

## Task 1: Extend `DiscoverSidebar` with `mode` prop

**Files:**
- Modify: `src/components/DiscoverSidebar.tsx`
- Modify: `src/components/DiscoverSidebar.test.tsx` *(create if missing — see Step 1)*

Add a `mode: 'discover' | 'library'` prop (default `'discover'`) that is stored on the component props but does not yet change any rendering. This task only widens the interface so subsequent tasks can branch on it without breaking Discover.

- [ ] **Step 1: Write the failing test for `mode` prop**

Check if `src/components/DiscoverSidebar.test.tsx` already exists. If not, create it:

```typescript
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DiscoverSidebar from './DiscoverSidebar'

const baseProps = {
  selectedSubtypes: [],
  onSelectedSubtypesChange: () => {},
  filters: {},
  selectedLanguages: [],
  activeVerification: new Set<'verified' | 'likely'>(),
  onFilterChange: () => {},
  onSelectedLanguagesChange: () => {},
  onVerificationToggle: () => {},
  activePanel: null as 'buckets' | 'filters' | 'advanced' | null,
  onActivePanelChange: () => {},
  showLanding: false,
  onHomeClick: () => {},
  onBrowseClick: () => {},
}

describe('DiscoverSidebar', () => {
  it('accepts a mode prop without crashing', () => {
    expect(() => render(<DiscoverSidebar {...baseProps} mode="library" />)).not.toThrow()
  })

  it('defaults to discover mode when mode is omitted', () => {
    expect(() => render(<DiscoverSidebar {...baseProps} />)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: FAIL — TypeScript error: `Property 'mode' does not exist on type 'IntrinsicAttributes & DiscoverSidebarProps'`.

- [ ] **Step 3: Add `mode` to `DiscoverSidebarProps`**

Edit `src/components/DiscoverSidebar.tsx`. In the `DiscoverSidebarProps` interface (currently ending around line 84), add:

```typescript
  // Navigation
  showLanding: boolean
  onHomeClick: () => void
  onBrowseClick: () => void

  // Library mode extensions
  mode?: 'discover' | 'library'
}
```

Then in the `export default function DiscoverSidebar({ ... })` destructure, add `mode = 'discover'` at the end:

```typescript
export default function DiscoverSidebar({
  selectedSubtypes,
  onSelectedSubtypesChange,
  filters,
  selectedLanguages,
  activeVerification,
  onFilterChange,
  onSelectedLanguagesChange,
  onVerificationToggle,
  activePanel,
  onActivePanelChange,
  showLanding,
  onHomeClick,
  onBrowseClick,
  mode = 'discover',
}: DiscoverSidebarProps) {
```

No other behavior changes in this task.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverSidebar.tsx src/components/DiscoverSidebar.test.tsx
git commit -m "feat(library): DiscoverSidebar accepts optional mode prop"
```

---

## Task 2: Conditionally hide Stars / Activity / License in `AdvancedPanel` when `mode='library'`

**Files:**
- Modify: `src/components/DiscoverSidebar.tsx` (propagate `mode` into `AdvancedPanel`; gate the three discovery-only sections)
- Modify: `src/components/DiscoverSidebar.test.tsx`

Installed-skill filtering should not offer stars / activity / license filters — those are discovery-time concerns. When `mode='library'`, `AdvancedPanel` renders only Verification (today) + Skill Status (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `src/components/DiscoverSidebar.test.tsx`:

```typescript
import { screen } from '@testing-library/react'

// ... existing imports / baseProps

describe('DiscoverSidebar — library mode', () => {
  it('hides Stars, Activity, License in library mode advanced panel', () => {
    render(<DiscoverSidebar {...baseProps} mode="library" activePanel="advanced" />)
    expect(screen.queryByText('Stars')).not.toBeInTheDocument()
    expect(screen.queryByText('Activity')).not.toBeInTheDocument()
    expect(screen.queryByText('License')).not.toBeInTheDocument()
    expect(screen.getByText('Verification')).toBeInTheDocument()
  })

  it('shows Stars, Activity, License in discover mode advanced panel', () => {
    render(<DiscoverSidebar {...baseProps} activePanel="advanced" />)
    expect(screen.getByText('Stars')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('License')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: FAIL on the first test — Stars/Activity/License all present in library mode.

- [ ] **Step 3: Plumb `mode` into `AdvancedPanel`**

In `src/components/DiscoverSidebar.tsx`:

1. Extend `AdvancedPanel`'s props Pick to include `mode`:

```typescript
function AdvancedPanel({
  filters,
  activeVerification,
  onFilterChange,
  onVerificationToggle,
  mode,
}: Pick<DiscoverSidebarProps, 'filters' | 'activeVerification' | 'onFilterChange' | 'onVerificationToggle'> & { mode: 'discover' | 'library' }) {
```

2. Gate the Stars, Activity, License `<div className="filter-section">` blocks behind `mode === 'discover'`:

```tsx
{mode === 'discover' && (
  <>
    {/* Stars */}
    <div className="filter-section">
      {/* ... existing content ... */}
    </div>
    {/* Activity */}
    <div className="filter-section">
      {/* ... existing content ... */}
    </div>
    {/* License */}
    <div className="filter-section">
      {/* ... existing content ... */}
    </div>
  </>
)}
```

3. Update the render site for `AdvancedPanel` (inside `DiscoverSidebar` return, around line 782):

```tsx
{activePanel === 'advanced' && (
  <AdvancedPanel
    filters={filters}
    activeVerification={activeVerification}
    onFilterChange={onFilterChange}
    onVerificationToggle={onVerificationToggle}
    mode={mode}
  />
)}
```

4. Update `activeCount` in `AdvancedPanel` to stop counting Stars/Activity/License when hidden:

```typescript
const activeCount =
  (mode === 'discover' && filters.stars    ? 1 : 0) +
  (mode === 'discover' && filters.activity ? 1 : 0) +
  (mode === 'discover' && filters.license  ? 1 : 0) +
  activeVerification.size
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverSidebar.tsx src/components/DiscoverSidebar.test.tsx
git commit -m "feat(library): hide discovery-only filters in library-mode sidebar"
```

---

## Task 3: Skill Status section in `AdvancedPanel` (library mode)

**Files:**
- Modify: `src/components/DiscoverSidebar.tsx`
- Modify: `src/components/DiscoverSidebar.css`
- Modify: `src/components/DiscoverSidebar.test.tsx`

Add a Skill Status section to `AdvancedPanel` visible only when `mode='library'`. Two checkboxes: "Enhanced (Tier 2)" and "Components available". State is passed in via new optional callbacks.

- [ ] **Step 1: Write the failing test**

Add to `src/components/DiscoverSidebar.test.tsx`:

```typescript
import userEvent from '@testing-library/user-event'

describe('DiscoverSidebar — Skill Status panel', () => {
  it('renders Skill Status section in library mode', () => {
    render(
      <DiscoverSidebar
        {...baseProps}
        mode="library"
        activePanel="advanced"
        skillStatus={{ enhancedOnly: false, componentsOnly: false }}
        onSkillStatusChange={() => {}}
      />
    )
    expect(screen.getByText('Skill Status')).toBeInTheDocument()
    expect(screen.getByText(/Enhanced.*Tier 2/)).toBeInTheDocument()
    expect(screen.getByText(/Components available/)).toBeInTheDocument()
  })

  it('omits Skill Status section in discover mode', () => {
    render(<DiscoverSidebar {...baseProps} activePanel="advanced" />)
    expect(screen.queryByText('Skill Status')).not.toBeInTheDocument()
  })

  it('invokes onSkillStatusChange when Enhanced toggled', async () => {
    const user = userEvent.setup()
    const onSkillStatusChange = vi.fn()
    render(
      <DiscoverSidebar
        {...baseProps}
        mode="library"
        activePanel="advanced"
        skillStatus={{ enhancedOnly: false, componentsOnly: false }}
        onSkillStatusChange={onSkillStatusChange}
      />
    )
    await user.click(screen.getByText(/Enhanced.*Tier 2/))
    expect(onSkillStatusChange).toHaveBeenCalledWith({ enhancedOnly: true, componentsOnly: false })
  })
})
```

Also add `import { vi } from 'vitest'` at the top if not already present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: FAIL — `skillStatus` prop unknown; section not found.

- [ ] **Step 3: Add types + props**

In `src/components/DiscoverSidebar.tsx`, add above `DiscoverSidebarProps`:

```typescript
export interface SkillStatusFilter {
  enhancedOnly: boolean
  componentsOnly: boolean
}
```

Extend `DiscoverSidebarProps`:

```typescript
  mode?: 'discover' | 'library'
  skillStatus?: SkillStatusFilter
  onSkillStatusChange?: (next: SkillStatusFilter) => void
}
```

In the default export's destructure:

```typescript
  mode = 'discover',
  skillStatus,
  onSkillStatusChange,
}: DiscoverSidebarProps) {
```

Pass to `AdvancedPanel`:

```tsx
<AdvancedPanel
  filters={filters}
  activeVerification={activeVerification}
  onFilterChange={onFilterChange}
  onVerificationToggle={onVerificationToggle}
  mode={mode}
  skillStatus={skillStatus}
  onSkillStatusChange={onSkillStatusChange}
/>
```

Extend `AdvancedPanel`'s prop type:

```typescript
function AdvancedPanel({
  filters,
  activeVerification,
  onFilterChange,
  onVerificationToggle,
  mode,
  skillStatus,
  onSkillStatusChange,
}: Pick<DiscoverSidebarProps, 'filters' | 'activeVerification' | 'onFilterChange' | 'onVerificationToggle'> & {
  mode: 'discover' | 'library'
  skillStatus?: SkillStatusFilter
  onSkillStatusChange?: (next: SkillStatusFilter) => void
}) {
```

- [ ] **Step 4: Render the Skill Status section**

Inside `AdvancedPanel`'s return, directly after the Verification `<div className="filter-section">` block (around line 652), add:

```tsx
{mode === 'library' && skillStatus && onSkillStatusChange && (
  <div className="filter-section skill-status-section">
    <div className="filter-section-label">Skill Status</div>
    <div className="radio-list">
      <button
        className={`radio-item checkbox${skillStatus.enhancedOnly ? ' active' : ''}`}
        onClick={() => onSkillStatusChange({ ...skillStatus, enhancedOnly: !skillStatus.enhancedOnly })}
      >
        <span className={`check-box${skillStatus.enhancedOnly ? ' active' : ''}`}>
          {skillStatus.enhancedOnly && <span style={{ fontSize: 10 }}>&#10003;</span>}
        </span>
        Enhanced (Tier 2)
      </button>
      <button
        className={`radio-item checkbox${skillStatus.componentsOnly ? ' active' : ''}`}
        onClick={() => onSkillStatusChange({ ...skillStatus, componentsOnly: !skillStatus.componentsOnly })}
      >
        <span className={`check-box${skillStatus.componentsOnly ? ' active' : ''}`}>
          {skillStatus.componentsOnly && <span style={{ fontSize: 10 }}>&#10003;</span>}
        </span>
        Components available
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Update `activeCount` to include Skill Status**

In `AdvancedPanel`:

```typescript
const activeCount =
  (mode === 'discover' && filters.stars    ? 1 : 0) +
  (mode === 'discover' && filters.activity ? 1 : 0) +
  (mode === 'discover' && filters.license  ? 1 : 0) +
  activeVerification.size +
  (skillStatus?.enhancedOnly ? 1 : 0) +
  (skillStatus?.componentsOnly ? 1 : 0)
```

- [ ] **Step 6: Add minimal CSS**

Append to `src/components/DiscoverSidebar.css`:

```css
/* Library-mode Skill Status section — reuses .filter-section / .radio-item patterns */
.skill-status-section {
  /* No overrides today; selector exists to allow future differentiation. */
}
```

(The checkbox pattern already ships with `.radio-item.checkbox` + `.check-box`. No new styling required for MVP.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: PASS (all three new tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/DiscoverSidebar.tsx src/components/DiscoverSidebar.css src/components/DiscoverSidebar.test.tsx
git commit -m "feat(library): Skill Status filters in library-mode sidebar"
```

---

## Task 4: `itemCounts` annotations on buckets + languages

**Files:**
- Modify: `src/components/DiscoverSidebar.tsx`
- Modify: `src/components/DiscoverSidebar.test.tsx`

When a caller supplies `itemCounts`, append `(n)` to bucket and language labels. Buckets and languages with zero items are suppressed entirely (spec §1.1).

- [ ] **Step 1: Write the failing test**

Add to `src/components/DiscoverSidebar.test.tsx`:

```typescript
describe('DiscoverSidebar — itemCounts', () => {
  it('annotates bucket labels with counts and omits empty buckets', () => {
    const itemCounts = {
      byBucket:   new Map([['frameworks', 3], ['dev-tools', 1]]),
      byLanguage: new Map<string, number>(),
    }
    render(
      <DiscoverSidebar
        {...baseProps}
        mode="library"
        activePanel="filters"
        itemCounts={itemCounts}
      />
    )
    // Switch to Type tab inside the filter panel
    fireEvent.click(screen.getByRole('button', { name: /Type/ }))
    expect(screen.getByText(/Frameworks \(3\)/)).toBeInTheDocument()
    expect(screen.getByText(/Dev Tools \(1\)/)).toBeInTheDocument()
    // ai-ml was not in the map — its bucket-group header should be absent
    expect(screen.queryByText(/AI & ML/)).not.toBeInTheDocument()
  })
})
```

Add `import { fireEvent } from '@testing-library/react'` if missing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: FAIL — `itemCounts` prop is unknown; bucket headers have no count.

- [ ] **Step 3: Add `itemCounts` prop**

Add to `DiscoverSidebarProps`:

```typescript
  itemCounts?: {
    byBucket:   Map<string, number>
    byLanguage: Map<string, number>
  }
```

Destructure in the default export:

```typescript
  itemCounts,
}: DiscoverSidebarProps) {
```

Forward `itemCounts` into `FilterPanel`:

```typescript
function FilterPanel({
  selectedLanguages,
  onSelectedLanguagesChange,
  selectedSubtypes,
  onSelectedSubtypesChange,
  itemCounts,
}: Pick<DiscoverSidebarProps, 'selectedLanguages' | 'onSelectedLanguagesChange' | 'selectedSubtypes' | 'onSelectedSubtypesChange'> & {
  itemCounts?: DiscoverSidebarProps['itemCounts']
}) {
```

At the render site (around line 774):

```tsx
{activePanel === 'filters' && (
  <FilterPanel
    selectedLanguages={selectedLanguages}
    onSelectedLanguagesChange={onSelectedLanguagesChange}
    selectedSubtypes={selectedSubtypes}
    onSelectedSubtypesChange={onSelectedSubtypesChange}
    itemCounts={itemCounts}
  />
)}
```

- [ ] **Step 4: Annotate + suppress bucket groups**

In `FilterPanel`, locate the `REPO_BUCKETS.filter(...).map(bucket => ...)` rendering block (around line 468). Modify the filter + render:

```tsx
{REPO_BUCKETS
  .filter(bucket => !activeCategory || (activeCategory !== '_fav' && activeCategory === bucket.id))
  .filter(bucket => !itemCounts || (itemCounts.byBucket.get(bucket.id) ?? 0) > 0)
  .map(bucket => {
    const filtered = bucket.subTypes.filter(st =>
      !search || st.label.toLowerCase().includes(search.toLowerCase())
    )
    if (!filtered.length) return null
    const BIcon = BUCKET_NAV_ICONS[bucket.id]
    const count = itemCounts?.byBucket.get(bucket.id)
    return (
      <div key={bucket.id} className="bucket-group">
        <div className="bucket-label">
          {BIcon && <BIcon size={11} />} {bucket.label}
          {count != null && ` (${count})`}
        </div>
        {/* ... existing subtype rendering unchanged ... */}
      </div>
    )
  })}
```

- [ ] **Step 5: Annotate + suppress languages**

Locate the Language tab's per-language rendering. Languages are rendered from `LANGUAGES` / category grouping. Find the `.map(lang => { ... })` loop for language buttons (search for `toggleLanguage(key)` — it's around line 360–420). Apply the same filter + annotation pattern against `itemCounts.byLanguage`. Exact lines depend on current code; use the same predicate form:

```tsx
.filter(lang => !itemCounts || (itemCounts.byLanguage.get(lang.key) ?? 0) > 0)
```

And for the label rendering, include `{count != null && ` (${count})`}` after the language display name.

*(Implementer: re-read the language-list block before editing; the test only asserts bucket behavior end-to-end, so language annotation is a parallel change with no test of its own in this task.)*

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/components/DiscoverSidebar.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/DiscoverSidebar.tsx src/components/DiscoverSidebar.test.tsx
git commit -m "feat(library): per-label itemCounts annotations in sidebar"
```

---

## Task 5: `LibraryCard` component

**Files:**
- Create: `src/components/LibraryCard.tsx`
- Create: `src/components/LibraryCard.test.tsx`

Grid-mode card: banner + name + owner + description + Active dot (top-right) + hover-revealed inline Active toggle + Enhanced pill (if tier ≥ 2) + sub-skill indicator (if `hasSubSkill`).

The card reuses existing visuals from `RepoCard` at the level of banner/language/verification; rather than actually composing `RepoCard`, we build a focused component since the Active-dot + inline-toggle behavior is library-specific and dropping into `RepoCard` would leak library concerns. This is deliberate (YAGNI on RepoCard extension).

- [ ] **Step 1: Write the failing test**

Create `src/components/LibraryCard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import LibraryCard from './LibraryCard'
import type { LibraryRow } from '../types/repo'

const mockRow: LibraryRow = {
  id: 'r1', owner: 'facebook', name: 'react', language: 'TypeScript',
  description: 'A JS library', content: '# Core\nline',
  topics: '[]', stars: null, forks: null, license: 'MIT',
  homepage: null, updated_at: null, pushed_at: null, saved_at: '2026-01-01',
  type: 'skill', banner_svg: null, discovered_at: null, discover_query: null,
  watchers: null, size: null, open_issues: null, starred_at: null,
  default_branch: null, avatar_url: null, og_image_url: null, banner_color: null,
  translated_description: null, translated_description_lang: null,
  translated_readme: null, translated_readme_lang: null, detected_language: null,
  verification_score: null, verification_tier: null, verification_signals: null, verification_checked_at: null,
  type_bucket: 'frameworks', type_sub: 'web-framework',
  active: 1, version: 'v18.0.0', generated_at: '2026-01-01T00:00:00.000Z',
  filename: 'react.skill.md', enabled_components: null, tier: 1,
}

function renderCard(props: Partial<React.ComponentProps<typeof LibraryCard>> = {}) {
  const defaults = {
    row: mockRow,
    selected: false,
    hasSubSkill: false,
    onSelect: () => {},
    onToggleActive: () => {},
  }
  return render(
    <MemoryRouter>
      <ProfileOverlayProvider>
        <LibraryCard {...defaults} {...props} />
      </ProfileOverlayProvider>
    </MemoryRouter>
  )
}

describe('LibraryCard', () => {
  it('renders name and owner', () => {
    renderCard()
    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('facebook')).toBeInTheDocument()
  })

  it('shows green active dot when active=1', () => {
    const { container } = renderCard()
    const dot = container.querySelector('.library-active-dot')
    expect(dot).toHaveAttribute('data-active', 'true')
  })

  it('shows grey active dot when active=0', () => {
    const { container } = renderCard({ row: { ...mockRow, active: 0 } })
    expect(container.querySelector('.library-active-dot')).toHaveAttribute('data-active', 'false')
  })

  it('renders Enhanced pill when tier >= 2', () => {
    renderCard({ row: { ...mockRow, tier: 2 } })
    expect(screen.getByText('Enhanced')).toBeInTheDocument()
  })

  it('omits Enhanced pill when tier < 2', () => {
    renderCard()
    expect(screen.queryByText('Enhanced')).not.toBeInTheDocument()
  })

  it('renders sub-skill indicator when hasSubSkill=true', () => {
    const { container } = renderCard({ hasSubSkill: true })
    expect(container.querySelector('.library-sub-skill-indicator')).toBeInTheDocument()
  })

  it('invokes onSelect on click', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderCard({ onSelect })
    await user.click(screen.getByText('react'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('inline toggle invokes onToggleActive without bubbling to onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onToggleActive = vi.fn()
    renderCard({ onSelect, onToggleActive })
    const toggle = screen.getByRole('switch')
    await user.click(toggle)
    expect(onToggleActive).toHaveBeenCalledWith(false)  // row.active=1 → flip to false
    expect(onSelect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/LibraryCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LibraryCard`**

Create `src/components/LibraryCard.tsx`:

```tsx
import { Boxes } from 'lucide-react'
import Toggle from './Toggle'
import LangBadge from './LangBadge'
import VerificationBadge from './VerificationBadge'
import { parseSignals } from '../utils/dateHelpers'
import { getSubTypeConfig } from '../config/repoTypeConfig'
import { useProfileOverlay } from '../contexts/ProfileOverlay'
import type { LibraryRow } from '../types/repo'

export interface LibraryCardProps {
  row: LibraryRow
  selected: boolean
  hasSubSkill: boolean
  onSelect: () => void
  onToggleActive: (active: boolean) => void
}

export default function LibraryCard({ row, selected, hasSubSkill, onSelect, onToggleActive }: LibraryCardProps) {
  const typeConfig = getSubTypeConfig(row.type_sub)
  const { openProfile } = useProfileOverlay()
  const isActive = row.active === 1

  return (
    <div
      className={`library-card${selected ? ' selected' : ''}${isActive ? '' : ' inactive'}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      {/* Active dot (top-right) */}
      <span
        className="library-active-dot"
        data-active={isActive}
        aria-label={isActive ? 'Active' : 'Inactive'}
      />

      {/* Sub-skill indicator (bottom-right corner) */}
      {hasSubSkill && (
        <span className="library-sub-skill-indicator" aria-label="Has interactive detail">
          <Boxes size={12} />
        </span>
      )}

      {/* Header: language + name + owner */}
      <div className="library-card-header">
        <LangBadge lang={row.language} />
        <div className="library-card-title-block">
          <span className="library-card-name">{row.name}</span>
          <button
            className="owner-name-btn library-card-owner"
            onClick={(e) => { e.stopPropagation(); openProfile(row.owner) }}
          >
            {row.owner}
          </button>
        </div>
      </div>

      {/* Description */}
      {row.description && (
        <p className="library-card-description">{row.description}</p>
      )}

      {/* Badges row */}
      <div className="library-card-badges">
        {typeConfig && (
          <span
            className="library-type-badge"
            style={{
              background: `${typeConfig.accentColor}12`,
              color: typeConfig.accentColor,
              borderColor: `${typeConfig.accentColor}30`,
            }}
          >
            {typeConfig.label}
          </span>
        )}
        {row.verification_tier && (
          <VerificationBadge
            tier={row.verification_tier as 'verified' | 'likely'}
            signals={parseSignals(row.verification_signals)}
            size="sm"
          />
        )}
        {(row.tier ?? 1) >= 2 && (
          <span className="badge-enhanced">Enhanced</span>
        )}
      </div>

      {/* Hover-revealed inline toggle (bottom-left) */}
      <div className="library-inline-toggle" onClick={(e) => e.stopPropagation()}>
        <Toggle on={isActive} onChange={onToggleActive} ariaLabel={`Toggle ${row.name} active`} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/LibraryCard.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Minimal CSS for new classes**

Append to `src/styles/globals.css` (full styling tweaked later in Task 10 — this step gives the tests their DOM shape):

```css
.library-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card, var(--panel));
  cursor: pointer;
  transition: border-color 120ms;
}
.library-card.selected { border-color: var(--accent); }
.library-card.inactive { opacity: 0.65; }
.library-card-header { display: flex; gap: 8px; align-items: center; }
.library-card-title-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.library-card-name { font-size: 12px; font-weight: 600; color: var(--t1); }
.library-card-owner { font-size: 10px; color: var(--t2); }
.library-card-description {
  font-size: 11px;
  color: var(--t2);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.library-card-badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
/* Scoped to .library-card so LibraryListRow's .library-active-dot (which is
   positioned inline with different layout) is not disturbed. */
.library-card .library-active-dot {
  position: absolute; top: 8px; right: 8px;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--t3);
}
.library-card .library-active-dot[data-active="true"] { background: #059669; }
.library-sub-skill-indicator {
  position: absolute; bottom: 8px; right: 8px;
  display: inline-flex; align-items: center;
  color: var(--t2);
}
.library-inline-toggle {
  position: absolute; bottom: 8px; left: 8px;
  opacity: 0; transition: opacity 120ms;
}
.library-card:hover .library-inline-toggle,
.library-card:focus-within .library-inline-toggle { opacity: 1; }
```

- [ ] **Step 6: Commit**

```bash
git add src/components/LibraryCard.tsx src/components/LibraryCard.test.tsx src/styles/globals.css
git commit -m "feat(library): LibraryCard component with active dot and hover toggle"
```

---

## Task 6: `LibraryGrid` component — sectioned + flat modes

**Files:**
- Create: `src/components/LibraryGrid.tsx`
- Create: `src/components/LibraryGrid.test.tsx`

Switches between sectioned-by-bucket rendering (no filters) and flat rendering (any filter). Applies sort within each section / flat list. Empty sections are omitted.

- [ ] **Step 1: Write the failing test**

Create `src/components/LibraryGrid.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import LibraryGrid from './LibraryGrid'
import type { LibraryRow } from '../types/repo'
import { DEFAULT_LAYOUT_PREFS } from './LayoutDropdown'

const baseRow: LibraryRow = {
  id: '', owner: '', name: '', language: 'TypeScript', description: null, content: '',
  topics: '[]', stars: null, forks: null, license: null, homepage: null,
  updated_at: null, pushed_at: null, saved_at: null, type: 'skill',
  banner_svg: null, discovered_at: null, discover_query: null, watchers: null, size: null,
  open_issues: null, starred_at: null, default_branch: null, avatar_url: null,
  og_image_url: null, banner_color: null, translated_description: null,
  translated_description_lang: null, translated_readme: null, translated_readme_lang: null,
  detected_language: null, verification_score: null, verification_tier: null,
  verification_signals: null, verification_checked_at: null,
  type_bucket: null, type_sub: null,
  active: 1, version: null, generated_at: null, filename: '', enabled_components: null, tier: 1,
}

const rows: LibraryRow[] = [
  { ...baseRow, id: '1', owner: 'a', name: 'alpha', type_bucket: 'frameworks' },
  { ...baseRow, id: '2', owner: 'b', name: 'beta',  type_bucket: 'frameworks' },
  { ...baseRow, id: '3', owner: 'c', name: 'gamma', type_bucket: 'dev-tools' },
]

function renderGrid(props: Partial<React.ComponentProps<typeof LibraryGrid>> = {}) {
  const defaults = {
    rows,
    selectedId: null,
    filtersApplied: false,
    layoutPrefs: DEFAULT_LAYOUT_PREFS,
    subSkillIds: new Set<string>(),
    onSelect: () => {},
    onToggleActive: () => {},
  }
  return render(
    <MemoryRouter>
      <ProfileOverlayProvider>
        <LibraryGrid {...defaults} {...props} />
      </ProfileOverlayProvider>
    </MemoryRouter>
  )
}

describe('LibraryGrid', () => {
  it('renders bucket section headers in sectioned mode', () => {
    renderGrid()
    // REPO_BUCKETS ordering: dev-tools before frameworks
    const headers = screen.getAllByRole('heading', { level: 3 })
    expect(headers.map(h => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Dev Tools/), expect.stringMatching(/Frameworks/)])
    )
  })

  it('renders no section headers in flat mode', () => {
    renderGrid({ filtersApplied: true })
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('omits empty bucket sections', () => {
    renderGrid({ rows: [rows[0]] })  // only frameworks
    expect(screen.queryByText(/Dev Tools/)).not.toBeInTheDocument()
    expect(screen.getByText(/Frameworks/)).toBeInTheDocument()
  })

  it('renders all rows regardless of mode', () => {
    renderGrid({ filtersApplied: true })
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByText('gamma')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/LibraryGrid.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LibraryGrid`**

Create `src/components/LibraryGrid.tsx`:

```tsx
import { REPO_BUCKETS } from '../constants/repoTypes'
import LibraryCard from './LibraryCard'
import LibraryListRow from './LibraryListRow'
import type { LibraryRow } from '../types/repo'
import type { LayoutPrefs } from './LayoutDropdown'

export interface LibraryGridProps {
  rows: LibraryRow[]
  selectedId: string | null
  filtersApplied: boolean
  layoutPrefs: LayoutPrefs
  subSkillIds: Set<string>
  onSelect: (row: LibraryRow) => void
  onToggleActive: (row: LibraryRow, next: boolean) => void
}

export default function LibraryGrid({
  rows, selectedId, filtersApplied, layoutPrefs, subSkillIds, onSelect, onToggleActive,
}: LibraryGridProps) {
  const isList = layoutPrefs.mode === 'list'

  const renderRow = (row: LibraryRow) => (
    isList
      ? (
        <LibraryListRow
          key={row.id}
          row={row}
          selected={selectedId === row.id}
          onSelect={() => onSelect(row)}
          onToggle={(v) => onToggleActive(row, v)}
        />
      )
      : (
        <LibraryCard
          key={row.id}
          row={row}
          selected={selectedId === row.id}
          hasSubSkill={subSkillIds.has(row.id)}
          onSelect={() => onSelect(row)}
          onToggleActive={(v) => onToggleActive(row, v)}
        />
      )
  )

  // Flat mode
  if (filtersApplied) {
    return (
      <div className={isList ? 'library-list' : 'library-grid'}
           style={!isList ? { gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))` } : undefined}>
        {rows.map(renderRow)}
      </div>
    )
  }

  // Sectioned mode — iterate REPO_BUCKETS for stable ordering
  return (
    <div className="library-bucket-sections">
      {REPO_BUCKETS.map(bucket => {
        const bucketRows = rows.filter(r => r.type_bucket === bucket.id)
        if (bucketRows.length === 0) return null
        return (
          <section key={bucket.id} className="library-bucket-section">
            <header className="library-bucket-section-header" style={{ borderLeftColor: bucket.color }}>
              <h3>{bucket.label}</h3>
              <span className="library-bucket-count">{bucketRows.length}</span>
            </header>
            <div className={isList ? 'library-list' : 'library-grid'}
                 style={!isList ? { gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))` } : undefined}>
              {bucketRows.map(renderRow)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/LibraryGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add minimal CSS**

Append to `src/styles/globals.css`:

```css
.library-grid {
  display: grid;
  gap: 12px;
  padding: 12px;
}
.library-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}
.library-bucket-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px 0;
}
.library-bucket-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-left: 2px solid var(--border);
  margin-left: 12px;
}
.library-bucket-section-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--t1);
}
.library-bucket-count {
  font-size: 10px;
  color: var(--t3);
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-subtle, var(--panel));
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/LibraryGrid.tsx src/components/LibraryGrid.test.tsx src/styles/globals.css
git commit -m "feat(library): LibraryGrid with sectioned and flat modes"
```

---

## Task 7: `LibraryDetailPanel` slide-in chrome

**Files:**
- Create: `src/components/LibraryDetailPanel.tsx`
- Modify: `src/styles/globals.css`

Slide-in panel wrapper with ✕ close button + Escape-to-close. Pushes grid (does not overlay) at ≥1200px; takes full width below.

Note on interaction contract:
- Clicking ✕ → calls `onClose()`.
- Pressing Escape while panel is open → calls `onClose()`. Implemented here.
- Clicking the same card toggles closed → implemented at the `Library.tsx` level (not here), by comparing the clicked id to the currently-selected id.

- [ ] **Step 1: Write the failing test**

Create `src/components/LibraryDetailPanel.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import LibraryDetailPanel from './LibraryDetailPanel'

describe('LibraryDetailPanel', () => {
  it('renders children when open', () => {
    render(
      <LibraryDetailPanel open={true} onClose={() => {}}>
        <div>child content</div>
      </LibraryDetailPanel>
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('close button invokes onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <LibraryDetailPanel open={true} onClose={onClose}>
        <div>x</div>
      </LibraryDetailPanel>
    )
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape key invokes onClose when open', () => {
    const onClose = vi.fn()
    render(
      <LibraryDetailPanel open={true} onClose={onClose}>
        <div>x</div>
      </LibraryDetailPanel>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape key does NOT invoke onClose when closed', () => {
    const onClose = vi.fn()
    render(
      <LibraryDetailPanel open={false} onClose={onClose}>
        <div>x</div>
      </LibraryDetailPanel>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/LibraryDetailPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LibraryDetailPanel`**

Create `src/components/LibraryDetailPanel.tsx`:

```tsx
import { useEffect } from 'react'
import { X } from 'lucide-react'

export interface LibraryDetailPanelProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export default function LibraryDetailPanel({ open, onClose, children }: LibraryDetailPanelProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside className={`library-detail-panel${open ? ' open' : ''}`} aria-hidden={!open}>
      <button
        className="library-detail-close-btn"
        onClick={onClose}
        aria-label="Close detail"
      >
        <X size={16} />
      </button>
      {children}
    </aside>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/LibraryDetailPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add panel CSS**

Append to `src/styles/globals.css`:

```css
.library-detail-panel {
  position: relative;
  width: 0;
  overflow: hidden;
  background: var(--panel);
  border-left: 1px solid var(--border);
  transition: width 180ms ease;
  display: flex;
  flex-direction: column;
}
.library-detail-panel.open { width: 420px; }
.library-detail-close-btn {
  position: absolute;
  top: 8px; right: 8px;
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border);
  background: var(--bg-subtle, var(--panel));
  border-radius: 4px;
  cursor: pointer;
  z-index: 2;
}
.library-detail-close-btn:hover { background: var(--hover); }
@media (max-width: 1200px) {
  .library-detail-panel.open { width: 100%; }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/LibraryDetailPanel.tsx src/components/LibraryDetailPanel.test.tsx src/styles/globals.css
git commit -m "feat(library): slide-in detail panel chrome"
```

---

## Task 7.5: `GridHeader` gains `hideViewMode` prop

**Files:**
- Modify: `src/components/GridHeader.tsx`

Library mode reuses `GridHeader` for chips + layout toggle, but must not render the All/Recommended pill (no meaning when the dataset is the already-installed library).

- [ ] **Step 1: Add the prop**

In `src/components/GridHeader.tsx`, extend `GridHeaderProps`:

```typescript
interface GridHeaderProps {
  viewMode: ViewModeKey
  onViewModeChange: (mode: ViewModeKey) => void
  layoutPrefs: LayoutPrefs
  onLayoutChange: (prefs: LayoutPrefs) => void
  activeFilters?: ActiveFilters
  onRemoveLanguage?: (lang: string) => void
  onRemoveSubtype?: (id: string) => void
  onRemoveTag?: (tag: string) => void
  hideViewMode?: boolean
}
```

Destructure at the render site: `hideViewMode = false`. Wrap the `.view-mode-toggle` block (lines 81–91) in a conditional:

```tsx
{!hideViewMode && (
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
)}
```

- [ ] **Step 2: Verify Discover still passes the existing tests**

Run: `npm test`
Expected: PASS — Discover omits `hideViewMode`, prop defaults to false, behavior unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/GridHeader.tsx
git commit -m "feat(library): GridHeader hideViewMode prop for library reuse"
```

---

## Task 8: Rewrite `Library.tsx` — compose new layout

**Files:**
- Modify: `src/views/Library.tsx` (full rewrite)
- Modify: `src/components/ComponentDetail.tsx` (spot-check for internal back button; remove if present)
- Modify: `src/components/GenericDetail.tsx` (spot-check for internal back button; remove if present)

This is the largest task. Replace the entire body of `Library.tsx` with the new composition. State layout:

- `rows: LibraryRow[]` — installed skills.
- `activeSegment: 'all' | 'active' | 'inactive'` — top-bar segmented control; default `'active'`.
- `sort: 'az' | 'recent' | 'bucket'` — top-bar sort.
- `layoutPrefs: LayoutPrefs` — loaded from localStorage under a *new* key `library-layout-prefs` (separate from Discover's).
- `selectedSubtypes / selectedLanguages / activeVerification` — sidebar filters.
- `activePanel` — sidebar panel state.
- `skillStatus: SkillStatusFilter` — Skill Status panel state.
- `selectedId: string | null` — currently-open card.
- `panelOpen: boolean` — slide-in panel open state.
- `subSkillIds: Set<string>` — repo ids that have at least one sub-skill (used for card indicator).
- Per-row detail data (`collections`, `componentsSubSkill`, `versionedInstalls`, `regenerating`) — unchanged from current `Library.tsx`.

Variant dispatch priority (Phase 1):
1. `ComponentDetail` — if `componentsSubSkill` is present.
2. `GenericDetail` — otherwise.

(Phase 2 plan will insert `MCPToolsDetail` ahead of `GenericDetail`.)

- [ ] **Step 1: Spot-check existing detail components for internal back button**

Re-read `src/components/ComponentDetail.tsx` and `src/components/GenericDetail.tsx`. Neither component currently renders a "← Back" button inside itself — the `responsive-back-btn` button is in `Library.tsx`. So there is nothing to remove from ComponentDetail/GenericDetail. Record in the commit message that this was verified.

- [ ] **Step 2: Write the failing test for the new Library structure**

Rewrite `src/views/Library.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Library from './Library'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import { SearchProvider } from '../contexts/Search'
import { ToastProvider } from '../contexts/Toast'

const mockRows = [
  { id: 'repo-1', owner: 'facebook', name: 'react', language: 'TypeScript',
    description: 'A JS library', content: '# Core\nline', topics: '[]',
    stars: null, forks: null, license: 'MIT', homepage: null, updated_at: null,
    pushed_at: null, saved_at: '2026-01-01', type: 'skill', banner_svg: null,
    discovered_at: null, discover_query: null, watchers: null, size: null,
    open_issues: null, starred_at: null, default_branch: null, avatar_url: null,
    og_image_url: null, banner_color: null, translated_description: null,
    translated_description_lang: null, translated_readme: null,
    translated_readme_lang: null, detected_language: null,
    verification_score: null, verification_tier: null, verification_signals: null,
    verification_checked_at: null, type_bucket: 'frameworks', type_sub: 'web-framework',
    active: 1, version: 'v18.0.0', generated_at: '2026-01-01T00:00:00.000Z',
    filename: 'react.skill.md', enabled_components: null, tier: 1 },
  { id: 'repo-2', owner: 'pallets', name: 'flask', language: 'Python',
    description: 'WSGI framework', content: '# Core\nline', topics: '[]',
    stars: null, forks: null, license: 'BSD', homepage: null, updated_at: null,
    pushed_at: null, saved_at: '2026-01-02', type: 'skill', banner_svg: null,
    discovered_at: null, discover_query: null, watchers: null, size: null,
    open_issues: null, starred_at: null, default_branch: null, avatar_url: null,
    og_image_url: null, banner_color: null, translated_description: null,
    translated_description_lang: null, translated_readme: null,
    translated_readme_lang: null, detected_language: null,
    verification_score: null, verification_tier: null, verification_signals: null,
    verification_checked_at: null, type_bucket: 'frameworks', type_sub: 'backend-framework',
    active: 0, version: 'v3.0.0', generated_at: '2026-01-02T00:00:00.000Z',
    filename: 'flask.skill.md', enabled_components: null, tier: 1 },
]

function renderLibrary() {
  return render(
    <MemoryRouter>
      <ProfileOverlayProvider>
        <SearchProvider>
          <ToastProvider>
            <Library />
          </ToastProvider>
        </SearchProvider>
      </ProfileOverlayProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('api', {
    library: {
      getAll: vi.fn().mockResolvedValue(mockRows),
      getCollections: vi.fn().mockResolvedValue([]),
    },
    skill: {
      toggle: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({ content: '', version: 'v1', generated_at: '' }),
      enhance: vi.fn().mockResolvedValue({ content: '', version: 'v1', generated_at: '', tier: 2 }),
      delete: vi.fn().mockResolvedValue(undefined),
      getSubSkill: vi.fn().mockResolvedValue(null),
      getVersionedInstalls: vi.fn().mockResolvedValue([]),
      setEnabledComponents: vi.fn().mockResolvedValue(undefined),
      detectClaudeCode: vi.fn().mockResolvedValue(false),
    },
    settings: { getApiKey: vi.fn().mockResolvedValue('key'), get: vi.fn().mockResolvedValue(null), set: vi.fn() },
  })
})

describe('Library — new layout', () => {
  it('renders sidebar rail', async () => {
    renderLibrary()
    await screen.findAllByText('react')
    // DiscoverSidebar renders a .sidebar-rail element
    expect(document.querySelector('.sidebar-rail')).toBeInTheDocument()
  })

  it('renders Active segmented control with Active selected by default', async () => {
    renderLibrary()
    await screen.findAllByText('react')
    const activeBtn = screen.getByRole('button', { name: /^Active$/ })
    expect(activeBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('Active default hides inactive skills', async () => {
    renderLibrary()
    // react is active=1, flask is active=0; only react should render as a card
    await screen.findByText('react')
    expect(screen.queryByText('flask')).not.toBeInTheDocument()
  })

  it('All segment shows all skills', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    await user.click(screen.getByRole('button', { name: /^All$/ }))
    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('flask')).toBeInTheDocument()
  })

  it('Inactive segment shows only inactive skills', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    await user.click(screen.getByRole('button', { name: /^Inactive$/ }))
    expect(screen.queryByText('react')).not.toBeInTheDocument()
    expect(screen.getByText('flask')).toBeInTheDocument()
  })

  it('renders bucket section header in sectioned mode', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    await user.click(screen.getByRole('button', { name: /^All$/ }))
    expect(screen.getByRole('heading', { name: /Frameworks/ })).toBeInTheDocument()
  })

  it('opens detail panel on card click and closes on same-card click', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    const card = screen.getByText('react').closest('.library-card')!
    await user.click(card)
    const panel = document.querySelector('.library-detail-panel.open')
    expect(panel).toBeInTheDocument()
    await user.click(card)
    expect(document.querySelector('.library-detail-panel.open')).not.toBeInTheDocument()
  })

  it('Escape closes open panel', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    await user.click(screen.getByText('react').closest('.library-card')!)
    expect(document.querySelector('.library-detail-panel.open')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.library-detail-panel.open')).not.toBeInTheDocument()
  })

  it('falls back to GenericDetail when no components sub-skill', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    await user.click(screen.getByText('react').closest('.library-card')!)
    // GenericDetail renders a "Regenerate" button (distinct from ComponentDetail's "Rebuild skill")
    expect(await screen.findByText(/Regenerate/)).toBeInTheDocument()
  })

  it('empty state CTA when no skills', async () => {
    ;(window.api.library.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([])
    renderLibrary()
    expect(await screen.findByText(/No skills installed yet/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/views/Library.test.tsx`
Expected: FAIL broadly — Library still uses old layout.

- [ ] **Step 4: Implement the new `Library.tsx`**

Replace `src/views/Library.tsx` with:

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { type LibraryRow, type SubSkillRow } from '../types/repo'
import { parseComponents } from '../utils/skillParse'
import { useSearch } from '../contexts/Search'
import { useToast } from '../contexts/Toast'
import DiscoverSidebar, { type SearchFilters, type SkillStatusFilter } from '../components/DiscoverSidebar'
import LibraryGrid from '../components/LibraryGrid'
import LibraryDetailPanel from '../components/LibraryDetailPanel'
import GridHeader from '../components/GridHeader'
import GenericDetail from '../components/GenericDetail'
import ComponentDetail from '../components/ComponentDetail'
import {
  DEFAULT_LAYOUT_PREFS,
  type LayoutPrefs,
} from '../components/LayoutDropdown'

const LIBRARY_LAYOUT_KEY = 'library-layout-prefs'

function loadLayoutPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(LIBRARY_LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT_PREFS
    return { ...DEFAULT_LAYOUT_PREFS, ...(JSON.parse(raw) as Partial<LayoutPrefs>) }
  } catch {
    return DEFAULT_LAYOUT_PREFS
  }
}

type ActiveSegment = 'all' | 'active' | 'inactive'

export default function Library() {
  const { query: filter } = useSearch()
  const { toast } = useToast()
  const navigate = useNavigate()

  // Data
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [subSkillIds, setSubSkillIds] = useState<Set<string>>(new Set())

  // Top bar / sidebar state
  const [activeSegment, setActiveSegment] = useState<ActiveSegment>('active')
  const [sort, setSort] = useState<'az' | 'recent' | 'bucket'>('recent')
  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPrefs>(loadLayoutPrefs)
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([])
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [activeVerification, setActiveVerification] = useState<Set<'verified' | 'likely'>>(new Set())
  const [appliedFilters] = useState<SearchFilters>({})  // Library mode ignores activity/stars/license
  const [activePanel, setActivePanel] = useState<'buckets' | 'filters' | 'advanced' | null>(null)
  const [skillStatus, setSkillStatus] = useState<SkillStatusFilter>({ enhancedOnly: false, componentsOnly: false })

  // Detail selection
  const [selected, setSelected] = useState<LibraryRow | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'components' | 'skill' | 'details'>('components')
  const [componentSearch, setComponentSearch] = useState('')
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([])
  const [componentsSubSkill, setComponentsSubSkill] = useState<SubSkillRow | null>(null)
  const [versionedInstalls, setVersionedInstalls] = useState<string[]>([])
  const [regenerating, setRegenerating] = useState(false)

  // Persist layout prefs
  useEffect(() => {
    try { localStorage.setItem(LIBRARY_LAYOUT_KEY, JSON.stringify(layoutPrefs)) } catch {}
  }, [layoutPrefs])

  // Load library
  useEffect(() => {
    window.api.library.getAll().then((data) => {
      setRows(data)
    }).catch(() => {
      toast('Failed to load library', 'error')
    })
  }, [toast])

  // Load sub-skill indicator set — lazy, one batched call per-row would be excessive;
  // instead, we use the already-known Components presence derived from row content as a heuristic.
  // Plan 2 will extend this to query sub_skills for both 'components' and 'mcp-tools'.
  useEffect(() => {
    const ids = new Set<string>()
    for (const row of rows) {
      if (row.type_bucket === 'frameworks' && row.type_sub === 'ui-library') {
        // Plan 2 replaces this with a direct sub_skills lookup per row.
        ids.add(row.id)
      }
    }
    setSubSkillIds(ids)
  }, [rows])

  // Variant dispatch — Phase 1 only has Components + Generic
  const selectRow = useCallback((row: LibraryRow) => {
    // Click-same-card-to-close
    if (selected?.id === row.id && panelOpen) {
      setPanelOpen(false)
      setSelected(null)
      return
    }
    setSelected(row)
    setPanelOpen(true)
    setActiveTab('components')
    setComponentSearch('')
    setCollections([])
    setComponentsSubSkill(null)
    setVersionedInstalls([])
    window.api.library.getCollections(row.id).then(setCollections)
    window.api.skill.getSubSkill(row.owner, row.name, 'components').then(setComponentsSubSkill).catch(() => null)
    window.api.skill.getVersionedInstalls(row.owner, row.name).then(setVersionedInstalls).catch(() => [])
  }, [selected, panelOpen])

  function handleToggle(row: LibraryRow, newActive: boolean) {
    const active = newActive ? 1 : 0
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, active } : r))
    setSelected(prev => prev?.id === row.id ? { ...prev, active } : prev)
    window.api.skill.toggle(row.owner, row.name, active)
  }

  async function handleEnhance(row: LibraryRow) {
    setRegenerating(true)
    try {
      const result = await window.api.skill.enhance(row.owner, row.name)
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, content: result.content, version: result.version, generated_at: result.generated_at, tier: result.tier }
        : r))
      setSelected(prev => prev?.id === row.id
        ? { ...prev, content: result.content, version: result.version, generated_at: result.generated_at, tier: result.tier }
        : prev)
      toast('Skill enhanced to Tier 2', 'success')
    } catch {
      toast('Enhancement failed', 'error')
    } finally {
      setRegenerating(false)
    }
  }

  // Derivations
  const searchFiltered = useMemo(() => {
    const q = filter.toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.name.toLowerCase().includes(q)
      || r.owner.toLowerCase().includes(q)
      || (r.description ?? '').toLowerCase().includes(q)
      || (r.language ?? '').toLowerCase().includes(q)
    )
  }, [rows, filter])

  const filtered = useMemo(() => {
    return searchFiltered.filter(r => {
      if (activeSegment === 'active'   && r.active !== 1) return false
      if (activeSegment === 'inactive' && r.active !== 0) return false
      if (selectedSubtypes.length  > 0 && (!r.type_sub || !selectedSubtypes.includes(r.type_sub))) return false
      if (selectedLanguages.length > 0 && (!r.language || !selectedLanguages.includes(r.language))) return false
      if (activeVerification.size  > 0) {
        if (!r.verification_tier || !activeVerification.has(r.verification_tier as 'verified' | 'likely')) return false
      }
      if (skillStatus.enhancedOnly   && (r.tier ?? 1) < 2) return false
      if (skillStatus.componentsOnly && !subSkillIds.has(r.id)) return false
      return true
    })
  }, [searchFiltered, activeSegment, selectedSubtypes, selectedLanguages, activeVerification, skillStatus, subSkillIds])

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'recent') list.sort((a, b) => (b.generated_at ?? '').localeCompare(a.generated_at ?? ''))
    // 'bucket' is a no-op in sectioned mode; fall through to current order otherwise
    return list
  }, [filtered, sort])

  const filtersApplied = selectedSubtypes.length > 0
    || selectedLanguages.length > 0
    || activeVerification.size > 0
    || skillStatus.enhancedOnly
    || skillStatus.componentsOnly

  const itemCounts = useMemo(() => {
    const byBucket = new Map<string, number>()
    const byLanguage = new Map<string, number>()
    for (const r of searchFiltered) {
      if (r.type_bucket) byBucket.set(r.type_bucket, (byBucket.get(r.type_bucket) ?? 0) + 1)
      if (r.language)    byLanguage.set(r.language, (byLanguage.get(r.language) ?? 0) + 1)
    }
    return { byBucket, byLanguage }
  }, [searchFiltered])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setSelected(null)
  }, [])

  return (
    <div className="library-root-v2">
      <DiscoverSidebar
        mode="library"
        selectedSubtypes={selectedSubtypes}
        onSelectedSubtypesChange={setSelectedSubtypes}
        filters={appliedFilters}
        selectedLanguages={selectedLanguages}
        activeVerification={activeVerification}
        onFilterChange={() => { /* no-op in library mode */ }}
        onSelectedLanguagesChange={setSelectedLanguages}
        onVerificationToggle={(tier) => setActiveVerification(prev => {
          const next = new Set(prev)
          next.has(tier) ? next.delete(tier) : next.add(tier)
          return next
        })}
        activePanel={activePanel}
        onActivePanelChange={setActivePanel}
        showLanding={false}
        onHomeClick={() => {
          setSelectedSubtypes([])
          setSelectedLanguages([])
          setActiveVerification(new Set())
          setSkillStatus({ enhancedOnly: false, componentsOnly: false })
        }}
        onBrowseClick={() => setActivePanel('filters')}
        itemCounts={itemCounts}
        skillStatus={skillStatus}
        onSkillStatusChange={setSkillStatus}
      />

      <main className="library-main">
        {/* Top bar */}
        <div className="library-topbar-v2">
          <div className="library-segmented" role="radiogroup" aria-label="Filter by active state">
            {(['all', 'active', 'inactive'] as const).map(seg => (
              <button
                key={seg}
                className={`library-segment${activeSegment === seg ? ' active' : ''}`}
                onClick={() => setActiveSegment(seg)}
                aria-pressed={activeSegment === seg}
              >
                {seg === 'all' ? 'All' : seg === 'active' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>

          <select
            className="library-sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Sort order"
          >
            <option value="recent">Recent</option>
            <option value="az">A&ndash;Z</option>
            <option value="bucket" disabled={!filtersApplied}>Bucket</option>
          </select>

          <GridHeader
            viewMode="all"
            onViewModeChange={() => {}}
            layoutPrefs={layoutPrefs}
            onLayoutChange={setLayoutPrefs}
            activeFilters={{ languages: selectedLanguages, subtypes: selectedSubtypes }}
            onRemoveLanguage={(lang) => setSelectedLanguages(prev => prev.filter(l => l !== lang))}
            onRemoveSubtype={(id)   => setSelectedSubtypes(prev => prev.filter(s => s !== id))}
            hideViewMode
          />
        </div>

        {/* Body: grid + slide-in panel */}
        <div className="library-body-v2">
          <div className="library-grid-scroll">
            {rows.length === 0 ? (
              <div className="library-empty">
                <p>No skills installed yet</p>
                <button className="lib-btn-regen" onClick={() => navigate('/discover')}>
                  Go to Discover
                </button>
              </div>
            ) : sorted.length === 0 ? (
              <p className="library-no-results">No skills match your filters.</p>
            ) : (
              <LibraryGrid
                rows={sorted}
                selectedId={selected?.id ?? null}
                filtersApplied={filtersApplied}
                layoutPrefs={layoutPrefs}
                subSkillIds={subSkillIds}
                onSelect={selectRow}
                onToggleActive={handleToggle}
              />
            )}
          </div>

          <LibraryDetailPanel open={panelOpen} onClose={closePanel}>
            {selected && (
              componentsSubSkill ? (
                <ComponentDetail
                  row={selected}
                  collections={collections}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  componentSearch={componentSearch}
                  onComponentSearchChange={setComponentSearch}
                  onToggleComponent={(name) => {
                    const allComponents = parseComponents(selected.content)
                    const enabledNames: string[] | null = selected.enabled_components
                      ? (() => { try { return JSON.parse(selected.enabled_components) as string[] } catch { return null } })()
                      : null
                    const currentSet = enabledNames ? new Set(enabledNames) : new Set(allComponents.map(c => c.name))
                    if (currentSet.has(name)) currentSet.delete(name); else currentSet.add(name)
                    const newEnabled = Array.from(currentSet)
                    setRows(prev => prev.map(r => r.id === selected.id ? { ...r, enabled_components: JSON.stringify(newEnabled) } : r))
                    setSelected(prev => prev ? { ...prev, enabled_components: JSON.stringify(newEnabled) } : prev)
                    window.api.skill.setEnabledComponents(selected.owner, selected.name, newEnabled)
                  }}
                  onSelectAll={() => {
                    const allComponents = parseComponents(selected.content)
                    const newEnabled = allComponents.map(c => c.name)
                    const newJson = JSON.stringify(newEnabled)
                    setRows(prev => prev.map(r => r.id === selected.id ? { ...r, enabled_components: newJson } : r))
                    setSelected(prev => prev ? { ...prev, enabled_components: newJson } : prev)
                    window.api.skill.setEnabledComponents(selected.owner, selected.name, newEnabled)
                  }}
                  onRebuild={async () => {
                    const allComponents = parseComponents(selected.content)
                    const enabledNames: string[] | null = selected.enabled_components
                      ? (() => { try { return JSON.parse(selected.enabled_components) as string[] } catch { return null } })()
                      : null
                    const enabledList = enabledNames ?? allComponents.map(c => c.name)
                    setRegenerating(true)
                    try {
                      const result = await window.api.skill.generate(selected.owner, selected.name, { enabledComponents: enabledList })
                      setRows(prev => prev.map(r => r.id === selected.id
                        ? { ...r, content: result.content, generated_at: result.generated_at }
                        : r))
                      setSelected(prev => prev ? { ...prev, content: result.content, generated_at: result.generated_at } : prev)
                      toast('Skill rebuilt', 'success')
                    } catch {
                      toast('Failed to rebuild skill', 'error')
                    } finally {
                      setRegenerating(false)
                    }
                  }}
                  onToggleActive={(v) => handleToggle(selected, v)}
                  onEnhance={() => handleEnhance(selected)}
                  regenerating={regenerating}
                  componentsSubSkill={componentsSubSkill}
                  versionedInstalls={versionedInstalls}
                />
              ) : (
                <GenericDetail
                  row={selected}
                  collections={collections}
                  onToggle={(v) => handleToggle(selected, v)}
                  onRegenerate={async () => {
                    setRegenerating(true)
                    try {
                      const result = await window.api.skill.generate(selected.owner, selected.name)
                      setRows(prev => prev.map(r => r.id === selected.id
                        ? { ...r, content: result.content, version: result.version, generated_at: result.generated_at }
                        : r))
                      setSelected(prev => prev ? { ...prev, content: result.content, version: result.version, generated_at: result.generated_at } : prev)
                      toast('Skill regenerated', 'success')
                    } catch {
                      toast('Failed to regenerate skill', 'error')
                    } finally {
                      setRegenerating(false)
                    }
                  }}
                  onEnhance={() => handleEnhance(selected)}
                  onRemove={async () => {
                    if (!window.confirm(`Remove skill for ${selected.owner}/${selected.name}? This cannot be undone.`)) return
                    try {
                      await window.api.skill.delete(selected.owner, selected.name)
                      setRows(prev => prev.filter(r => r.id !== selected.id))
                      closePanel()
                      toast('Skill removed', 'success')
                    } catch {
                      toast('Failed to remove skill', 'error')
                    }
                  }}
                  regenerating={regenerating}
                  componentsSubSkill={componentsSubSkill}
                  versionedInstalls={versionedInstalls}
                />
              )
            )}
          </LibraryDetailPanel>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Add root layout CSS**

Append to `src/styles/globals.css`:

```css
.library-root-v2 {
  display: flex;
  height: 100%;
  min-height: 0;
}
.library-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.library-topbar-v2 {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.library-segmented {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.library-segment {
  padding: 4px 10px;
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--t2);
  cursor: pointer;
}
.library-segment.active {
  background: var(--accent);
  color: var(--accent-fg, #fff);
}
.library-sort-select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  font-size: 11px;
}
.library-body-v2 {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
}
.library-grid-scroll {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}
.library-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 40px; text-align: center; color: var(--t2);
}
.library-no-results {
  padding: 20px; font-size: 11px; color: var(--t3); text-align: center;
}
```

- [ ] **Step 6: Run the rewritten test to verify it passes**

Run: `npm test -- src/views/Library.test.tsx`
Expected: PASS (all ten tests).

- [ ] **Step 7: Commit**

```bash
git add src/views/Library.tsx src/views/Library.test.tsx src/styles/globals.css
git commit -m "feat(library): compose DiscoverSidebar + LibraryGrid + slide-in detail panel"
```

---

## Task 9: Full test suite + manual smoke

**Files:** (none — validation only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests, including any integration tests covering `Discover.tsx` (since `mode` defaults to `'discover'` the existing Discover behavior must stay unchanged).

If anything touching Discover regresses: re-read the diff to Task 2's `AdvancedPanel` gating — common cause is forgetting to wrap the Stars/Activity/License block in `mode === 'discover' && (...)` rather than splitting it across three separate conditionals. Fix and re-run.

Note: `DiscoverSidebar` had no dedicated test file before Plan 1 started; Task 1 creates it. The confidence check here is the full suite staying green, not a specific DiscoverSidebar-old-behavior assertion.

- [ ] **Step 2: Manual smoke checklist (the user runs this — don't launch a dev server)**

Record this checklist in the commit message for the completion commit so the user can run through it:

- Library loads with Active segment selected; inactive skills hidden.
- Switching to All shows both active + inactive.
- Clicking a bucket label in the sidebar filters; grid switches to flat mode.
- Clicking ✕ on a chip clears that filter; grid may return to sectioned mode.
- Clicking a card opens the detail panel on the right; grid is pushed (not overlaid).
- Clicking the same card closes the panel.
- Clicking ✕ closes the panel.
- Pressing Escape closes the panel.
- Toggling a card's hover toggle activates/deactivates without opening the panel.
- Enhanced pill shows on tier-2 skills.
- Skill Status → "Enhanced (Tier 2)" filters the grid.
- Empty state CTA shows when no skills installed.

- [ ] **Step 3: Commit completion marker**

```bash
git commit --allow-empty -m "chore(library): Plan 1 layout redesign complete"
```

*(Only if there's nothing already uncommitted from Task 8; otherwise this step is skipped.)*

---

## Notes for the implementer

- **Spec §1 mentioned a separate "Skill Status" panel rail icon.** We elected to put Skill Status inside the existing Advanced panel (library-mode version) instead of adding a rail icon. This keeps the sidebar interface narrow and avoids a fourth rail button — the spec's "panels shown" list was not prescriptive about rail iconography. If the reviewer objects, splitting it back out is a minor follow-up.
- **Advisory note 1 from the spec reviewer** (Enhanced label mismatch) is addressed by using `"Enhanced (Tier 2)"` consistently in both the sidebar label and the per-card pill.
- **Advisory note 2** (bucket sections may appear empty after Active filter) is addressed by the `bucketRows.length === 0 → return null` branch in `LibraryGrid`: the Active segment shrinks the row set before `LibraryGrid` runs, so empty buckets silently drop out.
- **`subSkillIds` heuristic in Task 8 Step 4** is a placeholder — it flags any `frameworks / ui-library` row as having a sub-skill. This is a Phase-1 crutch: accurate sub-skill presence requires a batched IPC query (`sub_skills` by repo id), which Plan 2 adds.
- **List-mode CSS is minimal.** If `LibraryListRow` renders poorly inside `.library-list`, add spot fixes to `globals.css` at the end of Task 6 rather than creating a new stylesheet.
- **Known a11y trade-off in `LibraryCard`:** the card uses `role="button"` with a nested `role="switch"` Toggle. This nests interactive elements (axe will flag it), but the alternative — dropping the card-level button role — loses keyboard Enter-to-open behavior. Accepted for Phase 1; revisit if an a11y audit flags it.
