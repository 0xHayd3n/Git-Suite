# Discover UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Discover pages to consolidate controls into a smart bar, replace hover-dependent cards with always-visible hybrid cards, add per-section accent theming, and support adaptive card scaling at 5-10 columns.

**Architecture:** New `SmartBar` component replaces `BucketNav` and inline view mode pills. `RepoCard` restructured into dithered-top + info-bottom zones. `DiscoverGrid` emits `data-cols` for CSS-driven adaptive scaling. View mode accent colors flow from `discoverQueries.ts` through `SmartBar` → `DiscoverGrid` → `RepoCard`.

**Tech Stack:** React 18, TypeScript, CSS custom properties, existing `useBayerDither` hook, `better-sqlite3`

**Spec:** `docs/superpowers/specs/2026-04-12-discover-ux-redesign-design.md`

---

### Task 1: Add `created_at` to GitHub API Pipeline

**Why:** Rising view needs repo creation date for "X days old" badges. `RepoRow` type has `created_at` but the `repos` DB table does not have the column, and `GitHubRepo` interface doesn't include it. We need the migration, the interface update, and the upsert wiring.

**Files:**
- Modify: `electron/db.ts:~131` — add `ALTER TABLE repos ADD COLUMN created_at TEXT` migration
- Modify: `electron/github.ts:21-39` — add `created_at` to `GitHubRepo` interface
- Modify: `electron/main.ts:1564-1602` — add `created_at` to `upsertAndReturnRepoRows` INSERT and ON CONFLICT UPDATE

- [ ] **Step 1: Add `created_at` column migration to `electron/db.ts`**

In `electron/db.ts`, add after the existing ALTER TABLE block (~line 131):

```typescript
try { db.exec(`ALTER TABLE repos ADD COLUMN created_at TEXT`) } catch {}
```

This follows the existing migration pattern used for all other repo columns.

- [ ] **Step 2: Add `created_at` to `GitHubRepo` interface**

In `electron/github.ts`, add `created_at` field to the interface:

```typescript
// In GitHubRepo interface, after pushed_at (line 37):
  created_at: string
```

- [ ] **Step 3: Update `upsertAndReturnRepoRows` to persist `created_at`**

In `electron/main.ts:1564-1602`, add `created_at` to the INSERT column list and ON CONFLICT UPDATE:

```typescript
// Add created_at to INSERT column list (after default_branch):
//   ..., default_branch, type_bucket, type_sub, created_at)
// Add corresponding value placeholder
// Add to ON CONFLICT: created_at = excluded.created_at
// Add repo.created_at to upsert.run() arguments
```

The INSERT line becomes:
```sql
INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                   homepage, updated_at, pushed_at, saved_at, type, banner_svg,
                   discovered_at, discover_query, watchers, size, open_issues, default_branch,
                   type_bucket, type_sub, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  ...existing fields...,
  created_at     = excluded.created_at
```

And add `repo.created_at ?? null` to the `upsert.run()` call.

- [ ] **Step 4: Check other upsert sites for consistency**

Search `electron/main.ts` for other `INSERT INTO repos` statements (there are several: ~lines 396, 499, 581, 659, 843). Each that receives a GitHub API response should also include `created_at` in its column list and values. Add `repo.created_at ?? null` to each. Note: line ~106 is a collections INSERT, not repos — skip it.

- [ ] **Step 5: Verify the change compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add electron/db.ts electron/github.ts electron/main.ts
git commit -m "feat: populate created_at from GitHub API for Rising view badges"
```

---

### Task 2: Add View Mode Accent Colors to `discoverQueries.ts`

**Why:** Each view mode needs a distinct accent color for card borders and smart bar tab highlights.

**Files:**
- Modify: `src/lib/discoverQueries.ts:3-10` — add accent colors to `VIEW_MODES`

- [ ] **Step 1: Add accent hex to VIEW_MODES entries**

In `src/lib/discoverQueries.ts`, update the `VIEW_MODES` array:

```typescript
export const VIEW_MODES = [
  { key: 'recommended', label: 'Recommended', accent: '#8b5cf6' },
  { key: 'popular',     label: 'Most Popular', accent: '#60a5fa' },
  { key: 'forked',      label: 'Most Forked',  accent: '#14b8a6' },
  { key: 'rising',      label: 'Rising',        accent: '#f59e0b' },
] as const
```

- [ ] **Step 2: Add helper to get accent by view mode key**

```typescript
export function getViewModeAccent(key: ViewModeKey): string {
  return VIEW_MODES.find(vm => vm.key === key)?.accent ?? '#8b5cf6'
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/discoverQueries.ts
git commit -m "feat: add per-view-mode accent colors to VIEW_MODES"
```

---

### Task 3: Create `SmartBar` Component

**Why:** Replaces 4-5 rows of controls (search bar, view mode pills, BucketNav, filter/layout buttons) with a single unified bar.

**Files:**
- Create: `src/components/SmartBar.tsx`
- Create: `src/components/SmartBar.test.tsx`
- Reference: `src/constants/repoTypes.ts` (REPO_BUCKETS), `src/lib/discoverQueries.ts` (VIEW_MODES), `src/components/ViewModeIcons.tsx`

- [ ] **Step 1: Write SmartBar test**

Create `src/components/SmartBar.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import SmartBar from './SmartBar'

const noop = () => {}

function renderBar(overrides = {}) {
  const props = {
    query: '',
    onQueryChange: noop,
    activeBucket: null as string | null,
    onBucketChange: noop as (id: string | null) => void,
    selectedSubTypes: [] as string[],
    onSubTypeChange: noop as (ids: string[]) => void,
    viewMode: 'popular' as const,
    onViewModeChange: noop as (key: any) => void,
    onFilterClick: noop,
    onLayoutClick: noop,
    ...overrides,
  }
  return render(<SmartBar {...props} />)
}

test('renders all bucket pills', () => {
  renderBar()
  expect(screen.getByText('All')).toBeTruthy()
  expect(screen.getByText('Dev Tools')).toBeTruthy()
  expect(screen.getByText('Frameworks')).toBeTruthy()
  expect(screen.getByText('AI & ML')).toBeTruthy()
})

test('renders view mode tabs', () => {
  renderBar()
  expect(screen.getByText('Recommended')).toBeTruthy()
  expect(screen.getByText('Most Popular')).toBeTruthy()
  expect(screen.getByText('Most Forked')).toBeTruthy()
  expect(screen.getByText('Rising')).toBeTruthy()
})

test('clicking bucket calls onBucketChange', () => {
  const onBucketChange = vi.fn()
  renderBar({ onBucketChange })
  fireEvent.click(screen.getByText('Dev Tools'))
  expect(onBucketChange).toHaveBeenCalledWith('dev-tools')
})

test('clicking All clears bucket', () => {
  const onBucketChange = vi.fn()
  renderBar({ activeBucket: 'dev-tools', onBucketChange })
  fireEvent.click(screen.getByText('All'))
  expect(onBucketChange).toHaveBeenCalledWith(null)
})

test('clicking view mode calls onViewModeChange', () => {
  const onViewModeChange = vi.fn()
  renderBar({ onViewModeChange })
  fireEvent.click(screen.getByText('Rising'))
  expect(onViewModeChange).toHaveBeenCalledWith('rising')
})

test('active view mode tab has active class', () => {
  renderBar({ viewMode: 'rising' })
  const btn = screen.getByText('Rising').closest('button')
  expect(btn?.className).toContain('active')
})

test('search input reflects query prop', () => {
  renderBar({ query: 'hello' })
  const input = screen.getByPlaceholderText(/search/i)
  expect((input as HTMLInputElement).value).toBe('hello')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SmartBar.test.tsx`
Expected: FAIL — `SmartBar` module not found

- [ ] **Step 3: Implement SmartBar component**

Create `src/components/SmartBar.tsx`:

```typescript
import { REPO_BUCKETS } from '../constants/repoTypes'
import { VIEW_MODES, type ViewModeKey } from '../lib/discoverQueries'
import { VIEW_MODE_ICONS } from './ViewModeIcons'
import { getBucketColor } from '../config/repoTypeConfig'

interface SmartBarProps {
  query: string
  onQueryChange: (q: string) => void
  activeBucket: string | null
  onBucketChange: (bucketId: string | null) => void
  selectedSubTypes: string[]
  onSubTypeChange: (ids: string[]) => void
  viewMode: ViewModeKey
  onViewModeChange: (key: ViewModeKey) => void
  onFilterClick: () => void
  onLayoutClick: () => void
}

export default function SmartBar({
  query, onQueryChange,
  activeBucket, onBucketChange,
  selectedSubTypes, onSubTypeChange,
  viewMode, onViewModeChange,
  onFilterClick, onLayoutClick,
}: SmartBarProps) {
  const vm = VIEW_MODES.find(v => v.key === viewMode)

  return (
    <div className="smart-bar">
      {/* Search */}
      <div className="smart-bar-search">
        <svg className="smart-bar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="smart-bar-search-input"
          type="text"
          placeholder="Search repositories..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>

      <div className="smart-bar-divider" />

      {/* Bucket segmented control */}
      <div className="smart-bar-buckets">
        <button
          className={`smart-bar-bucket-pill${activeBucket === null ? ' active' : ''}`}
          onClick={() => onBucketChange(null)}
        >
          All
        </button>
        {REPO_BUCKETS.map(b => {
          const isActive = activeBucket === b.id
          const color = getBucketColor(b.id)
          return (
            <button
              key={b.id}
              className={`smart-bar-bucket-pill${isActive ? ' active' : ''}`}
              style={isActive ? {
                color,
                backgroundColor: `${color}1f`, // ~0.12 opacity
              } : undefined}
              onClick={() => onBucketChange(isActive ? null : b.id)}
            >
              {b.label}
            </button>
          )
        })}
      </div>

      <div className="smart-bar-divider" />

      {/* View mode tabs */}
      <div className="smart-bar-views">
        {VIEW_MODES.map(v => {
          const Icon = VIEW_MODE_ICONS[v.key]
          const isActive = viewMode === v.key
          return (
            <button
              key={v.key}
              className={`smart-bar-view-tab${isActive ? ' active' : ''}`}
              style={isActive ? {
                color: v.accent,
                backgroundColor: `${v.accent}1f`,
              } : undefined}
              onClick={() => onViewModeChange(v.key)}
            >
              <Icon size={12} />
              {v.label}
            </button>
          )
        })}
      </div>

      <div className="smart-bar-divider" />

      {/* Filter + Layout buttons */}
      <div className="smart-bar-actions">
        <button className="smart-bar-action-btn" onClick={onFilterClick} title="Filters">⚙</button>
        <button className="smart-bar-action-btn" onClick={onLayoutClick} title="Layout">⊞</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SmartBar.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SmartBar.tsx src/components/SmartBar.test.tsx
git commit -m "feat: add SmartBar component for unified Discover controls"
```

---

### Task 4: Add SmartBar and Subtype Chip CSS

**Why:** SmartBar needs glass-morphism styling consistent with existing design tokens. Subtype chips need their own styles.

**Files:**
- Modify: `src/styles/globals.css` — add `.smart-bar-*` and `.subtype-chips-*` classes

- [ ] **Step 1: Add SmartBar CSS to globals.css**

Append after the existing `.discover-filter-row` block (~line 7976):

```css
/* ── Smart Bar ──────────────────────────────────────────────────── */
.smart-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.smart-bar-search {
  width: 200px;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  padding: 5px 9px;
  gap: 5px;
  flex-shrink: 0;
}

.smart-bar-search-icon {
  color: var(--t3);
  flex-shrink: 0;
}

.smart-bar-search-input {
  background: none;
  border: none;
  outline: none;
  color: var(--t1);
  font-size: 11.5px;
  width: 100%;
}

.smart-bar-search-input::placeholder {
  color: var(--t3);
}

.smart-bar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.smart-bar-buckets {
  display: flex;
  gap: 1px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  padding: 2px;
  overflow-x: auto;
  flex-shrink: 1;
  min-width: 0;
}

.smart-bar-buckets::-webkit-scrollbar {
  display: none;
}

.smart-bar-bucket-pill {
  padding: 4px 8px;
  font-size: 10px;
  color: var(--t3);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  border: none;
  background: none;
  font-weight: 500;
  transition: color 0.15s, background-color 0.15s;
}

.smart-bar-bucket-pill:hover {
  color: var(--t2);
  background: rgba(255, 255, 255, 0.04);
}

.smart-bar-bucket-pill.active {
  font-weight: 600;
}

.smart-bar-views {
  display: flex;
  gap: 1px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  padding: 2px;
  flex-shrink: 0;
}

.smart-bar-view-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 10px;
  color: var(--t3);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  border: none;
  background: none;
  font-weight: 500;
  transition: color 0.15s, background-color 0.15s;
}

.smart-bar-view-tab:hover {
  color: var(--t2);
  background: rgba(255, 255, 255, 0.04);
}

.smart-bar-view-tab.active {
  font-weight: 600;
}

.smart-bar-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.smart-bar-action-btn {
  padding: 4px 7px;
  font-size: 10px;
  color: var(--t3);
  background: rgba(255, 255, 255, 0.04);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.smart-bar-action-btn:hover {
  color: var(--t2);
  background: rgba(255, 255, 255, 0.08);
}

/* ── Subtype Chips Row ──────────────────────────────────────────── */
.subtype-chips-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  overflow: hidden;
  transition: max-height 0.2s ease, opacity 0.2s ease, padding 0.2s ease;
  max-height: 40px;
  opacity: 1;
}

.subtype-chips-row.collapsed {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.subtype-chips-row::-webkit-scrollbar {
  display: none;
}

.subtype-chips-label {
  font-size: 9px;
  color: var(--t3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: 4px;
  white-space: nowrap;
}

.subtype-chip {
  font-size: 10px;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--t2);
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  border: none;
  transition: color 0.15s, background-color 0.15s;
}

.subtype-chip:hover {
  background: rgba(255, 255, 255, 0.08);
}

.subtype-chip.active {
  font-weight: 600;
}
```

- [ ] **Step 2: Verify the app still compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add SmartBar and subtype chip CSS styles"
```

---

### Task 5: Integrate SmartBar into Discover.tsx

**Why:** Replace the stacked controls (search bar, view mode pills, BucketNav, filter row) with SmartBar + conditional subtype chips.

**Files:**
- Modify: `src/views/Discover.tsx` — replace control sections (~lines 850-911) with SmartBar + SubtypeChips, add `activeBucket` state

- [ ] **Step 1: Add `activeBucket` state**

In `src/views/Discover.tsx`, add near other state declarations (~line 105):

```typescript
const [activeBucket, setActiveBucket] = useState<string | null>(null)
```

- [ ] **Step 2: Add bucket change handler**

When `activeBucket` changes, clear `selectedTypes`. When setting a new bucket, clear previous selection:

```typescript
function handleBucketChange(bucketId: string | null) {
  setActiveBucket(bucketId)
  setSelectedTypes([])
}
```

- [ ] **Step 3: Replace control sections with SmartBar**

Remove the existing search bar section (~lines 850-868), view mode pills (~lines 870-885), and filter row with BucketNav (~lines 887-911). Replace with:

```tsx
import SmartBar from '../components/SmartBar'
import { REPO_BUCKETS } from '../constants/repoTypes'

// ... in JSX, replace the 3 control sections with:

<SmartBar
  query={contextQuery}
  onQueryChange={setContextQuery}
  activeBucket={activeBucket}
  onBucketChange={handleBucketChange}
  selectedSubTypes={selectedTypes}
  onSubTypeChange={setSelectedTypes}
  viewMode={viewMode ?? 'recommended'}
  onViewModeChange={setViewMode}
  onFilterClick={() => setShowFilters(f => !f)}
  onLayoutClick={() => setShowLayout(l => !l)}
/>

{/* Subtype chips — only when a bucket is selected */}
{activeBucket && (() => {
  const bucket = REPO_BUCKETS.find(b => b.id === activeBucket)
  if (!bucket) return null
  const color = getBucketColor(activeBucket)
  return (
    <div className={`subtype-chips-row${activeBucket ? '' : ' collapsed'}`}>
      <span className="subtype-chips-label">{bucket.label} ›</span>
      <button
        className={`subtype-chip${selectedTypes.length === 0 ? ' active' : ''}`}
        style={selectedTypes.length === 0 ? { backgroundColor: `${color}1f`, color } : undefined}
        onClick={() => setSelectedTypes([])}
      >
        All
      </button>
      {bucket.subTypes.map(sub => {
        const isActive = selectedTypes.includes(sub.id)
        return (
          <button
            key={sub.id}
            className={`subtype-chip${isActive ? ' active' : ''}`}
            style={isActive ? { backgroundColor: `${color}1f`, color } : undefined}
            onClick={() => {
              setSelectedTypes(prev =>
                isActive ? prev.filter(id => id !== sub.id) : [...prev, sub.id]
              )
            }}
          >
            {sub.label}
          </button>
        )
      })}
    </div>
  )
})()}
```

- [ ] **Step 4: Remove BucketNav import**

Remove the `BucketNav` import from `Discover.tsx`. The `BucketNav.tsx` file itself can remain for now (it will be unused).

- [ ] **Step 5: Wire up filter/layout dropdown positioning**

The `DiscoverFilters` and `LayoutDropdown` components currently render in the filter row. Move them to render as siblings below the SmartBar, using existing absolute/fixed positioning (they already use `position: fixed` / click-away backdrop). No SmartBar internal changes needed — the SmartBar buttons just toggle state that controls whether these dropdowns render.

- [ ] **Step 6: Update DiscoverSuggestions anchor positioning**

`DiscoverSuggestions` currently positions itself relative to the search input via `getBoundingClientRect()`. Since the search input is now inside SmartBar, pass the SmartBar search input ref to `DiscoverSuggestions` via `setInputRef` (which already exists via `useSearch()` hook). Verify the suggestions dropdown still appears below the search input.

- [ ] **Step 7: Verify compile and existing tests still pass**

Run: `npx tsc --noEmit && npx vitest run src/components/ src/views/ --reporter=verbose`
Expected: Compile success, tests pass

- [ ] **Step 8: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: integrate SmartBar into Discover, replace stacked controls"
```

---

### Task 6: Redesign RepoCard — Hybrid Two-Zone Layout

**Why:** Cards currently hide info behind hover. New layout: dithered header top, always-visible info panel bottom.

**Files:**
- Modify: `src/components/RepoCard.tsx:147-342` — restructure into two-zone layout
- Modify: `src/styles/globals.css` — update `.repo-card` styles

- [ ] **Step 1: Add `viewMode` prop to RepoCard**

In `src/components/RepoCard.tsx`, add to the `RepoCardProps` interface (~line 147):

```typescript
viewMode?: 'recommended' | 'popular' | 'forked' | 'rising'
```

- [ ] **Step 2: Add accent color logic**

Import and use `getViewModeAccent`:

```typescript
import { getViewModeAccent } from '../lib/discoverQueries'

// Inside the component:
const accentColor = viewMode ? getViewModeAccent(viewMode) : '#8b5cf6'
```

- [ ] **Step 3: Restructure the card JSX into two zones**

Replace the current card body (dithered background fills entire card, hover overlay) with the two-zone layout below. **Important:** preserve all existing props usage — `onOwnerClick`, `verificationTier`, `verificationSignals`, `activeTags`, `focused`, `onTagClick`. The code below is a structural guide; integrate the verification badges and owner click handlers from the existing code:

```tsx
<div
  className={`repo-card${focused ? ' focused' : ''}`}
  style={{ borderColor: `${accentColor}1f` }}
  onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
  tabIndex={0}
  ref={cardRef}
>
  {/* Zone 1: Dithered header */}
  <div className="repo-card-dither">
    <DitherBackground
      avatarUrl={repo.avatar_url}
      fallbackGradient={gradient}
    />
    {/* Bottom-right badge */}
    <div className="repo-card-badge-br">
      {viewMode === 'forked'
        ? `⑂ ${formatStars(repo.forks)}`
        : `⭐ ${formatStars(repo.stars)}`}
    </div>
    {/* Top-left badge — Rising only */}
    {viewMode === 'rising' && repo.created_at && (
      <div className="repo-card-badge-tl">
        🔥 {formatAge(repo.created_at)}
      </div>
    )}
  </div>

  {/* Zone 2: Info panel */}
  <div className="repo-card-info">
    <div className="repo-card-author">
      <img src={repo.avatar_url} alt="" className="repo-card-avatar" />
      <span className="repo-card-owner">{repo.owner}</span>
    </div>
    <div className="repo-card-name">{repo.name}</div>
    <div className="repo-card-desc">{parsedDescription}</div>
    <div className="repo-card-tags">
      {visibleTags.map(tag => (
        <span key={tag} className="repo-card-tag" onClick={e => { e.stopPropagation(); onTagClick(tag) }}>
          {tag}
        </span>
      ))}
    </div>
    <div className="repo-card-stats">
      {viewMode === 'forked'
        ? <span>⭐ {formatStars(repo.stars)}</span>
        : <span>⑂ {formatStars(repo.forks)}</span>}
      <span>● {repo.open_issues ?? 0}</span>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add `formatAge` helper**

```typescript
function formatAge(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days < 0) return 'new'
  if (days === 0) return 'today'
  if (days === 1) return '1 day old'
  if (days < 7) return `${days} days old`
  if (days < 30) return `${Math.floor(days / 7)} weeks old`
  return `${Math.floor(days / 30)} months old`
}
```

- [ ] **Step 5: Update `.repo-card` CSS in globals.css**

Replace the existing `.repo-card` block (~lines 1372-1387) with:

```css
.repo-card {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  animation: card-in 0.18s ease forwards;
  transition: transform 0.2s, border-color 0.2s;
}

.repo-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.15);
}

.repo-card.focused {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.repo-card-dither {
  position: relative;
  height: 65px;
  overflow: hidden;
}

.repo-card-badge-br {
  position: absolute;
  bottom: 5px;
  right: 6px;
  background: rgba(0, 0, 0, 0.5);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.7);
}

.repo-card-badge-tl {
  position: absolute;
  top: 5px;
  left: 6px;
  background: rgba(245, 158, 11, 0.2);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 8px;
  color: #f59e0b;
  font-weight: 600;
}

.repo-card-info {
  padding: 9px 9px 8px;
}

.repo-card-author {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.repo-card-avatar {
  width: 15px;
  height: 15px;
  border-radius: 50%;
}

.repo-card-owner {
  font-size: 9.5px;
  color: var(--t3);
}

.repo-card-name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 3px;
}

.repo-card-desc {
  font-size: 10px;
  color: var(--t3);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.repo-card-tags {
  display: flex;
  gap: 3px;
  margin-top: 5px;
  flex-wrap: wrap;
}

.repo-card-tag {
  font-size: 8px;
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--t3);
  border-radius: 3px;
  cursor: pointer;
}

.repo-card-tag:first-child {
  background: rgba(var(--bucket-color-rgb, 255, 255, 255), 0.1);
  color: var(--bucket-color, var(--t3));
}

.repo-card-stats {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid var(--border);
  font-size: 9px;
  color: var(--t3);
}
```

- [ ] **Step 6: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/RepoCard.tsx src/styles/globals.css
git commit -m "feat: redesign RepoCard into hybrid two-zone layout"
```

---

### Task 7: Update DiscoverGrid — `data-cols`, `viewMode`, Featured Cards

**Why:** Grid needs to pass `viewMode` to cards, emit `data-cols` for adaptive CSS, and handle featured card spanning in Recommended view.

**Files:**
- Modify: `src/components/DiscoverGrid.tsx:8-22` (props), `131-157` (grid rendering)

- [ ] **Step 1: Add `viewMode` to DiscoverGridProps**

```typescript
// Add to DiscoverGridProps interface:
viewMode?: 'recommended' | 'popular' | 'forked' | 'rising'
```

- [ ] **Step 2: Add `data-cols` attribute and `align-items: start` to grid container**

In the grid mode rendering (~line 131), update the grid div:

```tsx
<div
  className="discover-grid"
  ref={gridRef}
  data-cols={layoutPrefs.columns}
  style={{
    gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))`,
    alignItems: 'start',
  }}
>
```

- [ ] **Step 3: Pass `viewMode` to each RepoCard**

In the RepoCard mapping (~line 133):

```tsx
<RepoCard
  key={...}
  repo={repo}
  viewMode={viewMode}
  // ...existing props
/>
```

- [ ] **Step 4: Handle featured card spanning for Recommended**

For Recommended view, first 3 cards get `grid-column: span 2`:

```tsx
{visibleRepos.map((repo, i) => {
  // Featured: first 3 at 6+ cols, first 2 at 5 cols (to fit within grid)
  const featuredCount = (layoutPrefs.columns >= 6) ? 3 : 2
  const isFeatured = viewMode === 'recommended' && i < featuredCount
  return (
    <div
      key={repo.id ?? `${repo.owner}/${repo.name}`}
      style={isFeatured ? { gridColumn: 'span 2' } : undefined}
      className={isFeatured ? 'repo-card-featured' : undefined}
    >
      <RepoCard
        repo={repo}
        viewMode={viewMode}
        // ...existing props
      />
    </div>
  )
})}
```

- [ ] **Step 5: Update skeleton loading**

Replace the fixed-height skeleton with two-zone approximation:

```tsx
{Array.from({ length: layoutPrefs.columns * 2 }).map((_, i) => (
  <div key={i} className="repo-card-skeleton">
    <div className="repo-card-skeleton-dither shimmer" />
    <div className="repo-card-skeleton-info">
      <div className="shimmer" style={{ width: '60%', height: 10, borderRadius: 4 }} />
      <div className="shimmer" style={{ width: '80%', height: 8, borderRadius: 4, marginTop: 6 }} />
      <div className="shimmer" style={{ width: '40%', height: 8, borderRadius: 4, marginTop: 6 }} />
    </div>
  </div>
))}
```

- [ ] **Step 6: Add skeleton CSS**

In `globals.css`, add:

```css
.repo-card-skeleton {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

.repo-card-skeleton-dither {
  height: 65px;
  background: var(--bg3);
}

.repo-card-skeleton-info {
  padding: 10px;
}

.repo-card-featured > .repo-card {
  /* Featured cards always use full density */
}
```

- [ ] **Step 7: Pass `viewMode` from Discover.tsx to DiscoverGrid**

In `Discover.tsx`, add `viewMode` to the DiscoverGrid props:

```tsx
<DiscoverGrid
  viewMode={viewMode ?? 'recommended'}
  // ...existing props
/>
```

- [ ] **Step 8: Verify compile and tests**

Run: `npx tsc --noEmit && npx vitest run src/components/ --reporter=verbose`
Expected: Compile success, tests pass

- [ ] **Step 9: Commit**

```bash
git add src/components/DiscoverGrid.tsx src/views/Discover.tsx src/styles/globals.css
git commit -m "feat: add data-cols, viewMode, and featured card spanning to DiscoverGrid"
```

---

### Task 8: Adaptive Card Scaling CSS

**Why:** Cards need to progressively drop info at higher column counts (7-8 compact, 9-10 minimal).

**Files:**
- Modify: `src/styles/globals.css` — add `data-cols` responsive rules

- [ ] **Step 1: Add compact rules (7-8 columns)**

```css
/* 7-8 columns: compact cards */
.discover-grid[data-cols="7"] .repo-card-dither,
.discover-grid[data-cols="8"] .repo-card-dither {
  height: 55px;
}

.discover-grid[data-cols="7"] .repo-card-desc,
.discover-grid[data-cols="8"] .repo-card-desc {
  -webkit-line-clamp: 1;
}

.discover-grid[data-cols="7"] .repo-card-tag:nth-child(n+3),
.discover-grid[data-cols="8"] .repo-card-tag:nth-child(n+3) {
  display: none;
}

.discover-grid[data-cols="7"] .repo-card-stats span:nth-child(n+3),
.discover-grid[data-cols="8"] .repo-card-stats span:nth-child(n+3) {
  display: none;
}
```

- [ ] **Step 2: Add minimal rules (9-10 columns)**

```css
/* 9-10 columns: minimal cards */
.discover-grid[data-cols="9"] .repo-card-dither,
.discover-grid[data-cols="10"] .repo-card-dither {
  height: 45px;
}

.discover-grid[data-cols="9"] .repo-card-desc,
.discover-grid[data-cols="10"] .repo-card-desc {
  display: none;
}

.discover-grid[data-cols="9"] .repo-card-tag:nth-child(n+2),
.discover-grid[data-cols="10"] .repo-card-tag:nth-child(n+2) {
  display: none;
}

.discover-grid[data-cols="9"] .repo-card-owner,
.discover-grid[data-cols="10"] .repo-card-owner {
  display: none;
}

.discover-grid[data-cols="9"] .repo-card-stats span:nth-child(n+2),
.discover-grid[data-cols="10"] .repo-card-stats span:nth-child(n+2) {
  display: none;
}
```

- [ ] **Step 3: Ensure featured cards override adaptive scaling**

```css
/* Featured cards always use full density */
.repo-card-featured .repo-card-desc {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
}

.repo-card-featured .repo-card-dither {
  height: 65px !important;
}

.repo-card-featured .repo-card-tag,
.repo-card-featured .repo-card-owner,
.repo-card-featured .repo-card-stats span {
  display: inline !important;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add adaptive card scaling CSS for 7-10 column grid"
```

---

### Task 9: Clean Up — Remove Old Control Styles and BucketNav

**Why:** Old `.discover-view-modes`, `.bnav-*`, and `.discover-search-bar` styles are now unused. BucketNav import is gone.

**Files:**
- Modify: `src/styles/globals.css` — remove `.discover-view-modes` (~7921-7965), `.bnav-*` (~8678-8780), and `.discover-search-bar` (~7886-7901) blocks
- Optional: delete `src/components/BucketNav.tsx` if no longer imported anywhere

- [ ] **Step 1: Verify BucketNav is unused**

Search for any remaining imports of BucketNav:

```bash
grep -r "BucketNav" src/ --include="*.tsx" --include="*.ts"
```

If no results, it's safe to remove.

- [ ] **Step 2: Remove old CSS blocks**

In `globals.css`, remove:
- `.discover-view-modes` and `.discover-view-mode-btn` blocks (~lines 7921-7965)
- `.discover-search-bar` block (~lines 7886-7901)
- `.bnav-wrap`, `.bnav-pills`, `.bnav-pill`, `.bnav-subtypes`, `.bnav-subpill` blocks (~lines 8678-8780)
- `.discover-filter-row` block (~lines 7968-7976) — replaced by smart bar layout

- [ ] **Step 3: Delete BucketNav if unused**

```bash
rm src/components/BucketNav.tsx
```

- [ ] **Step 4: Verify compile and all tests pass**

Run: `npx tsc --noEmit && npx vitest run --reporter=verbose`
Expected: All pass, no errors

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css src/components/BucketNav.tsx
git commit -m "chore: remove old BucketNav, view mode pills, and unused CSS"
```

---

### Task 10: Integration Smoke Test

**Why:** Verify the full flow works end-to-end — smart bar, cards, adaptive scaling, section accents.

**Files:**
- No file changes — manual verification

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass

- [ ] **Step 3: Commit any final fixes**

If any issues found during verification, fix and commit.
