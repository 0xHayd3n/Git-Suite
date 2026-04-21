# Library Section Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the library section (Library, Collections, Discover views) with toast notifications, component extraction, empty states, accessibility, responsive design, icon standardization, and tests.

**Architecture:** Layer-by-layer approach — shared foundations first (Toast, Toggle, LangBadge), then view decomposition (extract inline components), then UX/a11y/responsive across all views. Each layer builds on the previous.

**Tech Stack:** React 18, TypeScript, Vitest, React Testing Library, lucide-react, CSS (globals.css)

**Spec:** `docs/superpowers/specs/2026-04-08-library-section-improvements-design.md`

---

## Task 1: Toast Notification System

**Files:**
- Create: `src/contexts/Toast.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Toast context and provider**

```tsx
// src/contexts/Toast.tsx
import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
  exiting?: boolean
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    timersRef.current.delete(id)
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 200)
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++
    setToasts(prev => {
      const next = [...prev, { id, message, type }]
      // Max 3 visible — dismiss oldest
      if (next.length > 3) {
        const oldest = next.shift()!
        const oldTimer = timersRef.current.get(oldest.id)
        if (oldTimer) { clearTimeout(oldTimer); timersRef.current.delete(oldest.id) }
      }
      return next
    })
    // Per-toast timer — no duplicate timers on re-render
    const delay = type === 'error' ? 5000 : 3000
    timersRef.current.set(id, setTimeout(() => dismiss(id), delay))
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast--${t.type}${t.exiting ? ' toast--exit' : ''}`}>
              <span className="toast-message">{t.message}</span>
              <button className="toast-dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                ✕
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}
```

- [ ] **Step 2: Add toast CSS to globals.css**

Add at the end of `src/styles/globals.css`:

```css
/* ── Toasts ──────────────────────────────────────────────────────── */
.toast-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-lg);
  font-size: 12px;
  color: var(--t1);
  background: var(--bg3);
  border: 1px solid var(--border2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  animation: toast-in 0.2s ease-out;
  max-width: 320px;
}
.toast--success { border-left: 3px solid #059669; }
.toast--error   { border-left: 3px solid #dc2626; }
.toast--info    { border-left: 3px solid var(--accent); }
.toast--exit    { animation: toast-out 0.2s ease-in forwards; }
.toast-message  { flex: 1; }
.toast-dismiss  {
  background: none; border: none; color: var(--t3);
  cursor: pointer; font-size: 10px; padding: 2px 4px;
}
.toast-dismiss:hover { color: var(--t1); }
@keyframes toast-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes toast-out {
  from { transform: translateX(0);    opacity: 1; }
  to   { transform: translateX(100%); opacity: 0; }
}
```

- [ ] **Step 3: Wrap App with ToastProvider**

In `src/App.tsx`, add `ToastProvider` inside the existing provider stack:

```tsx
import { ToastProvider } from './contexts/Toast'

// In App():
<MemoryRouter ...>
  <ProfileOverlayProvider>
    <SavedReposProvider>
      <SearchProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </SearchProvider>
    </SavedReposProvider>
  </ProfileOverlayProvider>
</MemoryRouter>
```

- [ ] **Step 4: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/Toast.tsx src/styles/globals.css src/App.tsx
git commit -m "feat(library): add toast notification system with auto-dismiss"
```

---

## Task 2: Shared Toggle Component

**Files:**
- Create: `src/components/Toggle.tsx`
- Create: `src/components/Toggle.test.tsx`

- [ ] **Step 1: Write Toggle test**

```tsx
// src/components/Toggle.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import Toggle from './Toggle'

describe('Toggle', () => {
  it('renders with role="switch" and aria-checked', () => {
    render(<Toggle on={true} onChange={() => {}} ariaLabel="Toggle active" />)
    const btn = screen.getByRole('switch')
    expect(btn).toHaveAttribute('aria-checked', 'true')
    expect(btn).toHaveAttribute('aria-label', 'Toggle active')
  })

  it('calls onChange with opposite value on click', async () => {
    const onChange = vi.fn()
    render(<Toggle on={false} onChange={onChange} ariaLabel="Toggle active" />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('applies mini class when mini prop is true', () => {
    render(<Toggle on={false} onChange={() => {}} ariaLabel="Mini toggle" mini />)
    const btn = screen.getByRole('switch')
    expect(btn.className).toContain('lib-toggle-mini')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Toggle.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create Toggle component**

```tsx
// src/components/Toggle.tsx
interface ToggleProps {
  on: boolean
  onChange: (value: boolean) => void
  mini?: boolean
  ariaLabel: string
}

export default function Toggle({ on, onChange, mini = false, ariaLabel }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`lib-toggle${mini ? ' lib-toggle-mini' : ''} ${on ? 'on' : 'off'}`}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
    >
      <div className="lib-toggle-knob" />
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Toggle.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Toggle.tsx src/components/Toggle.test.tsx
git commit -m "feat(library): add shared Toggle component with a11y support"
```

---

## Task 3: Shared LangBadge, SectionHeader, DetailRow Components

**Files:**
- Create: `src/components/LangBadge.tsx`
- Create: `src/components/SectionHeader.tsx`
- Create: `src/components/DetailRow.tsx`
- Create: `src/utils/dateHelpers.ts`

- [ ] **Step 1: Create LangBadge**

First verify `getLangConfig` fallback: check `src/components/BannerSVG.tsx` line 62 — `abbr` uses `language.slice(0, 2)` which matches Collections' `lang.slice(0, 2)` fallback. Good to proceed.

```tsx
// src/components/LangBadge.tsx
import { getLangConfig } from './BannerSVG'

interface LangBadgeProps {
  lang: string | null
  size?: number
}

export default function LangBadge({ lang, size = 24 }: LangBadgeProps) {
  const cfg = getLangConfig(lang ?? '')
  return (
    <div
      className="lang-badge"
      style={{
        width: size, height: size,
        background: cfg.bg, color: cfg.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, fontSize: Math.max(8, size * 0.4),
        fontWeight: 600, flexShrink: 0,
      }}
    >
      {cfg.abbr}
    </div>
  )
}
```

- [ ] **Step 2: Create SectionHeader**

```tsx
// src/components/SectionHeader.tsx
export default function SectionHeader({ label }: { label: string }) {
  return (
    <div className="library-section-header">
      <span className="library-section-label">{label}</span>
      <div className="library-section-line" />
    </div>
  )
}
```

- [ ] **Step 3: Create DetailRow**

```tsx
// src/components/DetailRow.tsx
export default function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="lib-detail-row">
      <span className="lib-detail-key">{k}</span>
      <span className="lib-detail-val">{v}</span>
    </div>
  )
}
```

- [ ] **Step 4: Create dateHelpers utility**

```ts
// src/utils/dateHelpers.ts
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function daysSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function parseSignals(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds (new files are not imported yet — no errors expected)

- [ ] **Step 6: Commit**

```bash
git add src/components/LangBadge.tsx src/components/SectionHeader.tsx src/components/DetailRow.tsx src/utils/dateHelpers.ts
git commit -m "feat(library): add shared LangBadge, SectionHeader, DetailRow, and date helpers"
```

---

## Task 4: Extract Library Sub-Components

**Files:**
- Create: `src/components/SkillDepthBars.tsx`
- Create: `src/components/ComponentPreview.tsx`
- Create: `src/components/LibraryListRow.tsx`
- Create: `src/components/GenericDetail.tsx`
- Create: `src/components/ComponentDetail.tsx`
- Modify: `src/views/Library.tsx`

- [ ] **Step 1: Create SkillDepthBars**

```tsx
// src/components/SkillDepthBars.tsx
import { parseSkillDepths } from '../utils/skillParse'

export default function SkillDepthBars({ content }: { content: string }) {
  const depths = parseSkillDepths(content)
  const total = depths.core + depths.extended + depths.deep || 1
  return (
    <>
      {[
        { label: 'Core',     lines: depths.core,     pct: Math.round((depths.core / total) * 100),                                  color: '#059669' },
        { label: 'Extended', lines: depths.extended, pct: Math.round(((depths.core + depths.extended) / total) * 100),              color: '#6d28d9' },
        { label: 'Deep',     lines: depths.deep,     pct: 100,                                                                      color: '#4c1d95' },
      ].map((d) => (
        <div key={d.label} className="skill-depth-row">
          <span className="skill-depth-label">{d.label}</span>
          <div className="skill-depth-track">
            <div className="skill-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
          </div>
          <span className="skill-depth-meta">~{d.lines} lines</span>
        </div>
      ))}
    </>
  )
}
```

- [ ] **Step 2: Create ComponentPreview**

Copy the `ComponentPreview` function from `src/views/Library.tsx` lines 262-319 into `src/components/ComponentPreview.tsx`. Add `export default` before the function declaration. No other changes needed — the component is self-contained with no imports.

- [ ] **Step 3: Create LibraryListRow**

```tsx
// src/components/LibraryListRow.tsx
import { type LibraryRow } from '../types/repo'
import { getSubTypeConfig } from '../config/repoTypeConfig'
import VerificationBadge from './VerificationBadge'
import Toggle from './Toggle'
import LangBadge from './LangBadge'
import { parseSignals } from '../utils/dateHelpers'

export default function LibraryListRow({
  row, selected, onSelect, onToggle,
}: {
  row: LibraryRow
  selected: boolean
  onSelect: () => void
  onToggle: (active: boolean) => void
}) {
  const typeConfig = getSubTypeConfig(row.type_sub)

  return (
    <div
      className={`library-row${selected ? ' selected' : ''}${row.active === 0 ? ' inactive' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      <LangBadge lang={row.language} />
      <div className="library-row-info">
        <span className="library-row-name">{row.name}</span>
        {row.verification_tier && (
          <VerificationBadge
            tier={row.verification_tier as 'verified' | 'likely'}
            signals={parseSignals(row.verification_signals)}
            size="sm"
          />
        )}
        {typeConfig && (
          <div className="library-row-badges">
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
          </div>
        )}
        {(row.tier ?? 1) >= 2 && (
          <span className="badge-enhanced" style={{ fontSize: 9 }}>Enhanced</span>
        )}
      </div>
      <div className="library-row-right">
        <div
          className="library-active-dot"
          style={{ background: row.active === 1 ? '#059669' : 'var(--t3)' }}
        />
        <Toggle on={row.active === 1} onChange={onToggle} ariaLabel={`Toggle ${row.name} active`} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create GenericDetail**

Copy `GenericDetail` from `src/views/Library.tsx` lines 154-257 into `src/components/GenericDetail.tsx`. Update imports to use the new shared components:
- `import Toggle from './Toggle'` (with `ariaLabel` prop added)
- `import LangBadge from './LangBadge'`
- `import DetailRow from './DetailRow'`
- `import SkillDepthBars from './SkillDepthBars'`
- `import { formatDate, daysSince } from '../utils/dateHelpers'`
- `import { getLangConfig } from './BannerSVG'` (still needed for the detail header lang badge styling)
- Replace the inline lang badge div with `<LangBadge>` in the header
- Add `ariaLabel="Toggle skill active"` to the Toggle usage

- [ ] **Step 5: Create ComponentDetail**

Copy `ComponentDetail` from `src/views/Library.tsx` lines 323-515 into `src/components/ComponentDetail.tsx`. Update imports same as GenericDetail:
- Use shared `Toggle`, `LangBadge`, `DetailRow`, `SkillDepthBars`, `ComponentPreview`
- Use `formatDate`, `daysSince` from `../utils/dateHelpers`
- Add `ariaLabel` to all Toggle instances

- [ ] **Step 6: Rewrite Library.tsx to use extracted components**

Replace `src/views/Library.tsx` with the view that imports and composes the extracted components. Remove all inline component definitions. The view should contain only:
- State declarations
- `useEffect` for data loading
- Event handlers (`handleToggle`, `handleEnhance`, `selectRow`, etc.)
- Layout JSX importing `LibraryListRow`, `GenericDetail`, `ComponentDetail`, `SectionHeader`, `Toggle`
- Wire `useToast()` into `handleEnhance`, `onRegenerate`, and `onRemove` handlers
- Add `useNavigate` import for empty state CTA
- Add empty state with CTA: "No skills installed yet" + "Go to Discover" button
- Add filter-no-match state: "No skills match your search."

- [ ] **Step 7: Verify build and existing behavior**

Run: `npm run build`
Expected: Build succeeds. The Library view should render identically to before.

- [ ] **Step 8: Commit**

```bash
git add src/components/SkillDepthBars.tsx src/components/ComponentPreview.tsx src/components/LibraryListRow.tsx src/components/GenericDetail.tsx src/components/ComponentDetail.tsx src/views/Library.tsx
git commit -m "refactor(library): extract Library sub-components into separate files"
```

---

## Task 5: Extract Collections Sub-Components

**Files:**
- Create: `src/components/CollRow.tsx`
- Create: `src/components/CollDetail.tsx`
- Create: `src/components/NewCollectionModal.tsx`
- Modify: `src/views/Collections.tsx`

- [ ] **Step 1: Create CollRow**

Copy `CollRow` from `src/views/Collections.tsx` lines 52-96 into `src/components/CollRow.tsx`. Changes:
- Import shared `Toggle` from `./Toggle`
- Update Toggle usage: change `onToggle: () => void` to pass `onChange` with adapter `(v) => onToggle()`
- Add `role="button"`, `tabIndex={0}`, `onKeyDown` for a11y
- Add `ariaLabel={`Toggle ${coll.name} active`}` to Toggle

- [ ] **Step 2: Create CollDetail**

Copy `CollDetail` from `src/views/Collections.tsx` lines 217-392 into `src/components/CollDetail.tsx`. Changes:
- Import shared `Toggle`, `LangBadge` (replacing inline `LangBadge`)
- Import `BannerSVG` from `./BannerSVG`
- Import `useProfileOverlay` from `../contexts/ProfileOverlay`
- Add `ariaLabel` to Toggle

- [ ] **Step 3: Create NewCollectionModal**

Copy `NewCollectionModal` from `src/views/Collections.tsx` lines 99-214 into `src/components/NewCollectionModal.tsx`. Changes:
- Import `LangBadge` from `./LangBadge`
- Add `role="dialog"`, `aria-modal="true"` to the modal overlay
- Add `aria-labelledby="new-collection-title"` and `id="new-collection-title"` to the title
- Add focus trap: on mount focus the name input, Tab cycles within modal

- [ ] **Step 4: Rewrite Collections.tsx**

Replace `src/views/Collections.tsx` with the view that imports extracted components. Remove all inline definitions and the duplicated `LANG_ABBR/LANG_BG/LANG_TEXT` constants. Wire `useToast()` into:
- `handleDelete`: `toast('Collection deleted', 'success')`
- `handleInstall`: `toast('{name} installed', 'success')` / `toast('Failed to install {name}', 'error')`
- `handleInstallAll`: `toast('All missing skills installed', 'success')`
- `handleCreate` (in modal's `onCreate` callback): `toast('Collection created', 'success')`

Add empty state when no collections: "No collections yet" + "+ New collection" button.

- [ ] **Step 5: Update Collections.test.tsx**

Since Collections now uses `useToast()`, the test render wrapper must include `ToastProvider`. Update the test:
- Add `import { ToastProvider } from '../contexts/Toast'`
- Wrap the render: `<MemoryRouter><ProfileOverlayProvider><SearchProvider><ToastProvider><Collections /></ToastProvider></SearchProvider></ProfileOverlayProvider></MemoryRouter>`

Run existing tests:

Run: `npx vitest run src/views/Collections.test.tsx`
Expected: PASS

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/CollRow.tsx src/components/CollDetail.tsx src/components/NewCollectionModal.tsx src/views/Collections.tsx src/views/Collections.test.tsx
git commit -m "refactor(library): extract Collections sub-components into separate files"
```

---

## Task 6: Decompose Discover.tsx

**Files:**
- Create: `src/lib/discoverQueries.ts`
- Create: `src/components/DiscoverModeTabs.tsx`
- Create: `src/components/DiscoverSuggestions.tsx`
- Create: `src/components/VerificationToggles.tsx`
- Create: `src/components/DiscoverGrid.tsx`
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Create discoverQueries.ts**

Move from `src/views/Discover.tsx` into `src/lib/discoverQueries.ts`:
- `VIEW_MODES` array (lines 43-48)
- `ViewModeKey` type (line 50)
- `buildViewModeQuery` function (lines 52-74)
- `getViewModeSort` function (lines 76-81)
- `SUB_TYPE_KEYWORD` map (lines 91-181) — the entire ~80-entry object
- `getSubTypeKeyword` function (line 183-185)

Export all of them. These are pure functions with no React dependencies.

- [ ] **Step 2: Create DiscoverModeTabs**

```tsx
// src/components/DiscoverModeTabs.tsx
import { VIEW_MODES, type ViewModeKey } from '../lib/discoverQueries'

export default function DiscoverModeTabs({
  viewMode, onChange,
}: {
  viewMode: ViewModeKey
  onChange: (mode: ViewModeKey) => void
}) {
  return (
    <div className="discover-view-tabs">
      {VIEW_MODES.map(vm => (
        <button
          key={vm.key}
          className={`view-tab${viewMode === vm.key ? ' active' : ''}`}
          onClick={() => onChange(vm.key)}
        >
          {vm.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create VerificationToggles**

```tsx
// src/components/VerificationToggles.tsx
import { ShieldCheck, Shield, Check } from 'lucide-react'

export default function VerificationToggles({
  active, onToggle,
}: {
  active: Set<'verified' | 'likely'>
  onToggle: (tier: 'verified' | 'likely') => void
}) {
  return (
    <>
      <button
        className={`discover-verification-btn${active.has('verified') ? ' active' : ''}`}
        onClick={() => onToggle('verified')}
        title="Official"
        aria-pressed={active.has('verified')}
      >
        <span className="discover-verification-check">{active.has('verified') && <Check size={9} />}</span>
        <ShieldCheck size={12} color="#7c3aed" fill="#7c3aed" />
      </button>
      <button
        className={`discover-verification-btn${active.has('likely') ? ' active' : ''}`}
        onClick={() => onToggle('likely')}
        title="Partial Official"
        aria-pressed={active.has('likely')}
      >
        <span className="discover-verification-check">{active.has('likely') && <Check size={9} />}</span>
        <Shield size={12} color="#16a34a" fill="#16a34a" />
      </button>
    </>
  )
}
```

- [ ] **Step 4: Create DiscoverSuggestions**

Extract the suggestions dropdown JSX (Discover.tsx lines 916-1024) into `src/components/DiscoverSuggestions.tsx`. The component receives these props (search history is passed as a prop since the parent also needs it for keyboard handling):
```ts
{
  anchor: DOMRect | null
  suggestionsRef: React.RefObject<HTMLDivElement>
  showHistory: boolean
  searchHistory: { entries: string[]; remove: (e: string) => void; clear: () => void }
  suggestions: Suggestion[]
  suggestionIndex: number
  onSuggestionIndex: (i: number) => void
  onSelectHistory: (entry: string) => void
  onSelectSubtype: (subTypeId: string) => void
  onSelectTopic: (completed: string) => void
}
```

- [ ] **Step 5: Create DiscoverFilters**

Extract the filter trigger button and FilterDropdown integration (Discover.tsx lines 1064-1093) into `src/components/DiscoverFilters.tsx`. The component receives:
```ts
{
  filterBadgeCount: number
  filterDropdownOpen: boolean
  onToggleDropdown: () => void
  filterDropdownInitialTab: FilterTab
  appliedFilters: SearchFilters
  activeLanguage: string
  onFilterChange: (filters: SearchFilters, language: string) => void
  onClose: (lastTab: FilterTab) => void
}
```

Add `aria-expanded={filterDropdownOpen}` to the filter trigger button. Use `Filter` from `lucide-react` (not `LuFilter`).

- [ ] **Step 6: Create DiscoverGrid**

Extract the grid/list rendering JSX (Discover.tsx lines 1168-1259) into `src/components/DiscoverGrid.tsx`. The component receives:
```ts
{
  loading: boolean
  loadingMore: boolean
  error: string | null
  visibleRepos: RepoRow[]
  discoverQuery: string
  layoutPrefs: LayoutPrefs
  sentinelRef: React.RefObject<HTMLDivElement>
  gridRef: React.RefObject<HTMLDivElement>
  verification: ReturnType<typeof useVerification>
  onNavigate: (path: string) => void
  onTagClick: (tag: string) => void
  onOwnerClick: (owner: string) => void
}
```

Includes skeleton loading, list view, and grid view rendering. The empty state should include the improved message:
```tsx
{!loading && !error && visibleRepos.length === 0 && discoverQuery.trim() && (
  <div className="discover-empty-state">
    <div>No repos found for "{discoverQuery}"</div>
    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
      Try broadening your search or removing filters
    </div>
  </div>
)}
```

- [ ] **Step 7: Rewrite Discover.tsx to compose extracted components**

Update `src/views/Discover.tsx`:
- Import from `../lib/discoverQueries` instead of inline constants
- Import `DiscoverModeTabs`, `VerificationToggles`, `DiscoverSuggestions`, `DiscoverFilters`, `DiscoverGrid`
- Replace inline JSX blocks with composed components
- Replace `LuFilter, LuCheck` from `react-icons/lu` with `Filter, Check` from `lucide-react`
- Keep all state, effects, and data-fetching logic in the parent

- [ ] **Step 8: Update Discover.test.tsx if needed**

Run: `npx vitest run src/views/Discover.test.tsx`
Expected: PASS (tests render `<Discover />` directly, so internal extractions should not affect them)

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/lib/discoverQueries.ts src/components/DiscoverModeTabs.tsx src/components/VerificationToggles.tsx src/components/DiscoverSuggestions.tsx src/components/DiscoverFilters.tsx src/components/DiscoverGrid.tsx src/views/Discover.tsx src/views/Discover.test.tsx
git commit -m "refactor(library): decompose Discover.tsx into sub-components"
```

---

## Task 7: Icon Standardization + RepoCard Toast Wiring

**Files:**
- Modify: `src/components/RepoCard.tsx`
- Modify: `src/components/RepoListRow.tsx`
- Modify: `src/components/LayoutDropdown.tsx`

- [ ] **Step 1: Replace icons and wire toasts in RepoCard.tsx**

```diff
- import { LuPlus } from 'react-icons/lu'
+ import { Plus } from 'lucide-react'
```

Replace all `<LuPlus` with `<Plus` in the file.

Also wire `useToast()` into RepoCard's error handling. Import `useToast` from `../contexts/Toast` and add toast calls where `learnState` and `downloadState` errors are caught but silently swallowed:
- On learn error: `toast('Failed to save repo', 'error')`
- On download error: `toast('Download failed', 'error')`

- [ ] **Step 2: Replace icons in RepoListRow.tsx**

```diff
- import { LuStar, LuGitFork, LuClock } from 'react-icons/lu'
+ import { Star, GitFork, Clock } from 'lucide-react'
```

Replace all `<LuStar` with `<Star`, `<LuGitFork` with `<GitFork`, `<LuClock` with `<Clock`.

- [ ] **Step 3: Replace icons in LayoutDropdown.tsx**

```diff
- import { LuLayoutGrid, LuChevronDown } from 'react-icons/lu'
+ import { LayoutGrid, ChevronDown } from 'lucide-react'
```

Replace all `<LuLayoutGrid` with `<LayoutGrid`, `<LuChevronDown` with `<ChevronDown`.

- [ ] **Step 4: Verify no remaining react-icons/lu imports**

Run: `grep -r "from 'react-icons/lu'" src/`
Expected: No matches in `src/` (only in `docs/` which are old plan files — ignore those)

- [ ] **Step 5: Verify build and tests**

Run: `npm run build && npx vitest run`
Expected: Build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/RepoCard.tsx src/components/RepoListRow.tsx src/components/LayoutDropdown.tsx
git commit -m "refactor: standardize on lucide-react, remove react-icons/lu usage"
```

---

## Task 8: Accessibility Improvements

**Files:**
- Modify: `src/components/LibraryListRow.tsx` (already done in Task 4 — `role="button"`, `tabIndex`, `onKeyDown`)
- Modify: `src/components/CollRow.tsx` (already done in Task 5)
- Modify: `src/components/NewCollectionModal.tsx` (already done in Task 5)
- Modify: `src/views/Library.tsx` — sort buttons + list keyboard nav
- Modify: `src/views/Collections.tsx` — list keyboard nav

- [ ] **Step 1: Add aria-pressed to Library sort buttons**

In `src/views/Library.tsx`, add `aria-pressed={sort === s}` to each sort button:

```tsx
<button
  key={s}
  className={`library-sort-btn${sort === s ? ' active' : ''}`}
  onClick={() => setSort(s)}
  aria-pressed={sort === s}
>
```

- [ ] **Step 2: Add keyboard navigation to Library list**

In `src/views/Library.tsx`, add an `onKeyDown` handler to the `.library-list-scroll` container. Arrow Up/Down should move selection through the sorted list, Enter should select:

```tsx
const allSorted = [...componentRows, ...activeRows, ...inactiveRows]

function handleListKeyDown(e: React.KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const currentIdx = allSorted.findIndex(r => r.id === selected?.id)
    const nextIdx = e.key === 'ArrowDown'
      ? Math.min(currentIdx + 1, allSorted.length - 1)
      : Math.max(currentIdx - 1, 0)
    if (allSorted[nextIdx]) selectRow(allSorted[nextIdx])
  }
}
```

Add `onKeyDown={handleListKeyDown}` to the `.library-list-scroll` div.

- [ ] **Step 3: Add keyboard navigation to Collections list**

Same pattern as Library — Arrow Up/Down navigates collections, Enter selects.

- [ ] **Step 4: Verify all a11y changes build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/Library.tsx src/views/Collections.tsx
git commit -m "feat(library): add keyboard navigation and ARIA attributes"
```

---

## Task 9: Responsive Design

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/views/Library.tsx`
- Modify: `src/views/Collections.tsx`

- [ ] **Step 1: Add responsive state to Library.tsx**

Add a `showDetail` state and back button for narrow windows:

```tsx
const [showDetail, setShowDetail] = useState(false)

// When selecting a row, also set showDetail to true
function handleSelectRow(row: LibraryRow) {
  selectRow(row)
  setShowDetail(true)
}
```

Add a back button in the detail column:
```tsx
<div className="library-detail-col">
  <button className="responsive-back-btn" onClick={() => setShowDetail(false)}>← Back</button>
  {/* ...existing detail content... */}
</div>
```

Add className to list/detail columns for responsive targeting:
- List column: add `className={`library-list-col${showDetail ? ' detail-active' : ''}`}`
- Detail column: add `className={`library-detail-col${showDetail ? ' detail-active' : ''}`}`

- [ ] **Step 2: Same responsive state for Collections.tsx**

Same pattern as Library — `showDetail` state, back button, className modifiers.

- [ ] **Step 3: Add responsive CSS to globals.css**

Add at the end of `src/styles/globals.css`:

```css
/* ── Responsive ──────────────────────────────────────────────────── */
.responsive-back-btn {
  display: none;
  background: none; border: none; color: var(--t2);
  font-size: 12px; cursor: pointer; padding: 8px 12px;
}
.responsive-back-btn:hover { color: var(--t1); }

@media (max-width: 768px) {
  /* Library & Collections: collapse two-column layout */
  .library-body, .collections-body {
    flex-direction: column;
  }
  .library-list-col, .collections-list {
    width: 100%;
    min-width: unset;
  }
  .library-detail-col, .collections-detail {
    display: none;
  }
  .library-list-col.detail-active, .collections-list.detail-active {
    display: none;
  }
  .library-detail-col.detail-active, .collections-detail.detail-active {
    display: flex;
    width: 100%;
  }
  .responsive-back-btn { display: block; }

  /* Discover: auto-fill grid */
  .discover-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;
  }
  .discover-filter-row {
    flex-wrap: wrap;
  }

  /* Modals */
  .coll-modal {
    max-height: 90vh;
    max-width: 90vw;
    overflow-y: auto;
  }

  /* General */
  .library-root, .collections-root, .discover {
    overflow-x: hidden;
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css src/views/Library.tsx src/views/Collections.tsx
git commit -m "feat(library): add responsive design for narrow windows"
```

---

## Task 10: Library Tests

**Files:**
- Create: `src/views/Library.test.tsx`

- [ ] **Step 1: Write Library tests**

```tsx
// src/views/Library.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Library from './Library'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import { SearchProvider } from '../contexts/Search'
import { ToastProvider } from '../contexts/Toast'

const mockRows = [
  {
    id: 'repo-1', owner: 'facebook', name: 'react', language: 'TypeScript',
    content: '# Core\nline1\nline2\n# Extended\nline3\n# Deep\nline4',
    active: 1, saved_at: '2026-01-01', version: 'v18.0.0',
    generated_at: '2026-01-01T00:00:00.000Z', license: 'MIT',
    type: 'skill', type_bucket: 'frameworks', type_sub: 'web-framework',
    verification_tier: null, verification_signals: null,
    enabled_components: null, tier: 1,
  },
  {
    id: 'repo-2', owner: 'pallets', name: 'flask', language: 'Python',
    content: '# Core\nline1\n# Extended\nline2',
    active: 0, saved_at: '2026-01-02', version: 'v3.0.0',
    generated_at: '2026-01-02T00:00:00.000Z', license: 'BSD',
    type: 'skill', type_bucket: 'frameworks', type_sub: 'backend-framework',
    verification_tier: null, verification_signals: null,
    enabled_components: null, tier: 1,
  },
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
    settings: { getApiKey: vi.fn().mockResolvedValue('key') },
  })
})

describe('Library', () => {
  it('renders skill names from mocked data', async () => {
    renderLibrary()
    expect(await screen.findByText('react')).toBeInTheDocument()
    expect(await screen.findByText('flask')).toBeInTheDocument()
  })

  it('renders sort buttons', async () => {
    renderLibrary()
    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText('A–Z')).toBeInTheDocument()
    expect(screen.getByText('Recent')).toBeInTheDocument()
  })

  it('renders stat pills', async () => {
    renderLibrary()
    await screen.findByText('react') // wait for data
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('shows empty state CTA when no skills', async () => {
    ;(window.api.library.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([])
    renderLibrary()
    expect(await screen.findByText(/No skills installed yet/)).toBeInTheDocument()
    expect(screen.getByText('Go to Discover')).toBeInTheDocument()
  })

  it('calls toggle on skill toggle click', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findByText('react')
    const toggles = screen.getAllByRole('switch')
    await user.click(toggles[0])
    expect(window.api.skill.toggle).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/views/Library.test.tsx`
Expected: PASS

- [ ] **Step 3: Run all tests to ensure no regressions**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/Library.test.tsx
git commit -m "test(library): add Library view tests"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors or warnings.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Verify no remaining react-icons/lu imports**

Run: `grep -r "from 'react-icons/lu'" src/`
Expected: No matches.

- [ ] **Step 4: Check line counts of refactored views**

Run: `wc -l src/views/Library.tsx src/views/Collections.tsx src/views/Discover.tsx`
Expected: Library ~150, Collections ~120, Discover ~250 (approximate).

- [ ] **Step 5: Commit any remaining fixes**

If any issues were found, fix and commit.
