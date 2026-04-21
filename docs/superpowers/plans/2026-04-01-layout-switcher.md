# Layout Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Layout dropdown to the Discover filter row that lets users toggle between Grid (1–5 columns) and List (compact/comfortable, toggleable fields) view modes, persisted to localStorage.

**Architecture:** Four new/modified units: (1) `LayoutDropdown` — self-contained dropdown owning its open state, exporting shared types and constants; (2) `RepoListRow` — horizontal list-view row renderer; (3) CSS additions for both; (4) `Discover.tsx` wiring — reads localStorage on mount, passes prefs down, switches render branch between RepoCard grid and RepoListRow list.

**Tech Stack:** React 18, TypeScript, Vitest + React Testing Library, plain CSS in `globals.css`, `localStorage` for persistence.

**Spec:** `docs/superpowers/specs/2026-04-01-layout-switcher-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/LayoutDropdown.tsx` | Dropdown UI + exported types/constants |
| Create | `src/components/LayoutDropdown.test.tsx` | Unit tests for LayoutDropdown |
| Create | `src/components/RepoListRow.tsx` | List-view row renderer |
| Create | `src/components/RepoListRow.test.tsx` | Unit tests for RepoListRow |
| Modify | `src/styles/globals.css` | Layout dropdown + list row CSS |
| Modify | `src/views/Discover.tsx` | Wire layoutPrefs state, render switching, LayoutDropdown |

---

## Task 1: LayoutDropdown types, constants, and component (TDD)

**Files:**
- Create: `src/components/LayoutDropdown.tsx`
- Create: `src/components/LayoutDropdown.test.tsx`

### Step 1: Write the failing tests

Create `src/components/LayoutDropdown.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LayoutDropdown, { DEFAULT_LAYOUT_PREFS } from './LayoutDropdown'
import type { LayoutPrefs } from './LayoutDropdown'

function renderDropdown(prefs: LayoutPrefs = DEFAULT_LAYOUT_PREFS, onChange = vi.fn()) {
  return render(<LayoutDropdown prefs={prefs} onChange={onChange} />)
}

describe('LayoutDropdown', () => {
  it('renders a trigger button labelled "Layout: Grid" in default grid mode', () => {
    renderDropdown()
    expect(screen.getByRole('button', { name: /layout options/i })).toBeInTheDocument()
    expect(screen.getByText(/layout: grid/i)).toBeInTheDocument()
  })

  it('renders "Layout: List" label when mode is list', () => {
    renderDropdown({ ...DEFAULT_LAYOUT_PREFS, mode: 'list' })
    expect(screen.getByText(/layout: list/i)).toBeInTheDocument()
  })

  it('panel is hidden by default', () => {
    renderDropdown()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the panel when trigger is clicked', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows grid controls (column buttons) when mode is grid', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    expect(screen.getByText('Columns')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
  })

  it('shows list controls (density + field toggles) when mode is list', () => {
    renderDropdown({ ...DEFAULT_LAYOUT_PREFS, mode: 'list' })
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    expect(screen.getByText('Compact')).toBeInTheDocument()
    expect(screen.getByText('Comfortable')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
    expect(screen.getByText('Type badge')).toBeInTheDocument()
    expect(screen.getByText('Verification badge')).toBeInTheDocument()
  })

  it('clicking a column button calls onChange with updated columns', () => {
    const onChange = vi.fn()
    renderDropdown(DEFAULT_LAYOUT_PREFS, onChange)
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ columns: 4 }))
  })

  it('clicking List mode button calls onChange with mode: list', () => {
    const onChange = vi.fn()
    renderDropdown(DEFAULT_LAYOUT_PREFS, onChange)
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'list' }))
  })

  it('toggling a field calls onChange with updated fields', () => {
    const onChange = vi.fn()
    renderDropdown({ ...DEFAULT_LAYOUT_PREFS, mode: 'list' }, onChange)
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tags' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.objectContaining({ tags: false }) })
    )
  })

  it('closes the panel on Escape', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the panel on click outside', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run --reporter=verbose src/components/LayoutDropdown.test.tsx 2>&1 | head -20
```

Expected: FAIL — `Cannot find module './LayoutDropdown'`

- [ ] **Step 3: Create LayoutDropdown component**

Create `src/components/LayoutDropdown.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react'
import { LuLayoutGrid, LuChevronDown } from 'react-icons/lu'

// ── Types & constants (exported for use in Discover.tsx and RepoListRow.tsx) ──

export type LayoutMode = 'grid' | 'list'
export type ListDensity = 'compact' | 'comfortable'

export interface ListFields {
  description: boolean
  tags: boolean
  stats: boolean
  type: boolean
  verification: boolean
}

export interface LayoutPrefs {
  mode: LayoutMode
  columns: number
  density: ListDensity
  fields: ListFields
}

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  mode: 'grid',
  columns: 3,
  density: 'comfortable',
  fields: { description: true, tags: true, stats: true, type: true, verification: true },
}

export const LAYOUT_STORAGE_KEY = 'discover-layout-prefs'

// ── Component ──────────────────────────────────────────────────────

interface LayoutDropdownProps {
  prefs: LayoutPrefs
  onChange: (prefs: LayoutPrefs) => void
}

const COLUMNS = [1, 2, 3, 4, 5]

const FIELD_LABELS: { key: keyof ListFields; label: string }[] = [
  { key: 'description', label: 'Description' },
  { key: 'tags',        label: 'Tags' },
  { key: 'stats',       label: 'Stats' },
  { key: 'type',        label: 'Type badge' },
  { key: 'verification', label: 'Verification badge' },
]

export default function LayoutDropdown({ prefs, onChange }: LayoutDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function set(patch: Partial<LayoutPrefs>) {
    onChange({ ...prefs, ...patch })
  }

  function toggleField(key: keyof ListFields) {
    onChange({ ...prefs, fields: { ...prefs.fields, [key]: !prefs.fields[key] } })
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className="discover-filter-icon-btn"
        aria-label="Layout options"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
      >
        <LuLayoutGrid size={11} />
        Layout: {prefs.mode === 'grid' ? 'Grid' : 'List'}
        <LuChevronDown size={10} style={{ marginLeft: 3 }} />
      </button>

      {open && (
        <div className="layout-dropdown-panel" role="dialog" aria-label="Layout options">
          {/* Mode toggle */}
          <div className="layout-segment-row">
            {(['list', 'grid'] as LayoutMode[]).map(m => (
              <button
                key={m}
                className={`layout-segment-btn${prefs.mode === m ? ' active' : ''}`}
                onClick={() => set({ mode: m })}
              >
                {m === 'list' ? 'List' : 'Grid'}
              </button>
            ))}
          </div>

          <div className="layout-dropdown-divider" />

          {/* Mode controls */}
          {prefs.mode === 'grid' ? (
            <div className="layout-section">
              <div className="layout-section-label">Columns</div>
              <div className="layout-columns-row">
                {COLUMNS.map(n => (
                  <button
                    key={n}
                    className={`layout-column-btn${prefs.columns === n ? ' active' : ''}`}
                    onClick={() => set({ columns: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="layout-section">
              <div className="layout-density-row">
                {(['compact', 'comfortable'] as ListDensity[]).map(d => (
                  <button
                    key={d}
                    className={`layout-segment-btn${prefs.density === d ? ' active' : ''}`}
                    onClick={() => set({ density: d })}
                  >
                    {d === 'compact' ? 'Compact' : 'Comfortable'}
                  </button>
                ))}
              </div>
              <div className="layout-dropdown-divider" style={{ margin: '8px 0' }} />
              {FIELD_LABELS.map(({ key, label }) => (
                <label key={key} className="layout-field-row">
                  <input
                    type="checkbox"
                    role="checkbox"
                    aria-label={label}
                    checked={prefs.fields[key]}
                    onChange={() => toggleField(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run --reporter=verbose src/components/LayoutDropdown.test.tsx 2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/components/LayoutDropdown.tsx src/components/LayoutDropdown.test.tsx && git commit -m "feat: add LayoutDropdown component with types and tests"
```

---

## Task 2: RepoListRow component (TDD)

**Files:**
- Create: `src/components/RepoListRow.tsx`
- Create: `src/components/RepoListRow.test.tsx`

### Step 1: Write the failing tests

Create `src/components/RepoListRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RepoListRow from './RepoListRow'
import type { RepoRow } from '../types/repo'
import { DEFAULT_LAYOUT_PREFS } from './LayoutDropdown'
import type { ListDensity, ListFields } from './LayoutDropdown'

const baseRepo: RepoRow = {
  id: 'abc123',
  owner: 'vercel',
  name: 'next.js',
  description: 'The React framework for production',
  language: 'TypeScript',
  stars: 120000,
  forks: 25000,
  open_issues: 500,
  watchers: 120000,
  size: 50000,
  license: 'MIT',
  topics: '[]',
  updated_at: '2024-01-01',
  saved_at: null,
  starred_at: null,
  banner_color: null,
  discovered_at: null,
  verification_score: null,
  verification_tier: null,
  verification_signals: null,
  verification_checked_at: null,
}

function renderRow(
  overrides: Partial<RepoRow> = {},
  density: ListDensity = 'comfortable',
  fields: ListFields = DEFAULT_LAYOUT_PREFS.fields,
  verificationTier: 'verified' | 'likely' | null = null,
) {
  return render(
    <MemoryRouter>
      <RepoListRow
        repo={{ ...baseRepo, ...overrides }}
        onNavigate={vi.fn()}
        onTagClick={vi.fn()}
        density={density}
        fields={fields}
        verificationTier={verificationTier}
      />
    </MemoryRouter>
  )
}

describe('RepoListRow', () => {
  it('always renders repo name and owner', () => {
    renderRow()
    expect(screen.getByText('next.js')).toBeInTheDocument()
    expect(screen.getByText(/vercel/i)).toBeInTheDocument()
  })

  it('renders description when fields.description is true', () => {
    renderRow({}, 'comfortable', { ...DEFAULT_LAYOUT_PREFS.fields, description: true })
    expect(screen.getByText('The React framework for production')).toBeInTheDocument()
  })

  it('hides description when fields.description is false', () => {
    renderRow({}, 'comfortable', { ...DEFAULT_LAYOUT_PREFS.fields, description: false })
    expect(screen.queryByText('The React framework for production')).not.toBeInTheDocument()
  })

  it('applies compact density class', () => {
    const { container } = renderRow({}, 'compact')
    expect(container.firstChild).toHaveClass('repo-list-row--compact')
  })

  it('applies comfortable density class', () => {
    const { container } = renderRow({}, 'comfortable')
    expect(container.firstChild).toHaveClass('repo-list-row--comfortable')
  })

  it('renders stars stat when fields.stats is true', () => {
    renderRow({}, 'comfortable', { ...DEFAULT_LAYOUT_PREFS.fields, stats: true })
    expect(screen.getByText(/120/)).toBeInTheDocument()
  })

  it('hides stats when fields.stats is false', () => {
    renderRow({ stars: 99999 }, 'comfortable', { ...DEFAULT_LAYOUT_PREFS.fields, stats: false })
    expect(screen.queryByText(/99\.9k/)).not.toBeInTheDocument()
  })

  it('renders no verification badge when verificationTier is null', () => {
    renderRow({}, 'comfortable', DEFAULT_LAYOUT_PREFS.fields, null)
    expect(screen.queryByText(/official/i)).not.toBeInTheDocument()
  })

  it('renders "Official" when verificationTier is "verified" and fields.verification is true', () => {
    renderRow({}, 'comfortable', { ...DEFAULT_LAYOUT_PREFS.fields, verification: true }, 'verified')
    expect(screen.getByText('Official')).toBeInTheDocument()
  })

  it('renders "Likely Official" when verificationTier is "likely"', () => {
    renderRow({}, 'comfortable', { ...DEFAULT_LAYOUT_PREFS.fields, verification: true }, 'likely')
    expect(screen.getByText('Likely Official')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run --reporter=verbose src/components/RepoListRow.test.tsx 2>&1 | head -20
```

Expected: FAIL — `Cannot find module './RepoListRow'`

- [ ] **Step 3: Create RepoListRow component**

Create `src/components/RepoListRow.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useSavedRepos } from '../contexts/SavedRepos'
import { parseTopics, type RepoRow } from '../types/repo'
import { REPO_TYPE_CONFIG } from '../config/repoTypeConfig'
import type { RepoType } from '../lib/classifyRepoType'
import type { ListDensity, ListFields } from './LayoutDropdown'
import { formatCount } from './RepoCard'
import { LuStar, LuGitFork, LuClock } from 'react-icons/lu'

type InstallState = 'UNINSTALLED' | 'GENERATING' | 'INSTALLED'

interface RepoListRowProps {
  repo: RepoRow
  onNavigate: (path: string) => void
  onTagClick: (tag: string) => void
  onOwnerClick?: (owner: string) => void
  repoType?: RepoType
  verificationTier?: 'verified' | 'likely' | null
  verificationSignals?: string[]
  verificationResolving?: boolean
  density: ListDensity
  fields: ListFields
}

function formatRecency(updatedAt: string | null): string {
  if (!updatedAt) return ''
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000)
  if (days < 1)   return 'today'
  if (days < 7)   return `${days}d ago`
  if (days < 30)  return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function RepoListRow({
  repo, onNavigate, onTagClick, onOwnerClick,
  repoType, verificationTier,
  density, fields,
}: RepoListRowProps) {
  const { saveRepo } = useSavedRepos()
  const topics = parseTopics(repo.topics).slice(0, 3)
  const typeConfig = repoType ? REPO_TYPE_CONFIG[repoType] : null

  const [installState, setInstallState] = useState<InstallState>('UNINSTALLED')
  const [isStarred, setIsStarred] = useState(repo.starred_at != null)

  useEffect(() => {
    window.api.skill.get(repo.owner, repo.name)
      .then(row => { if (row) setInstallState('INSTALLED') })
      .catch(() => {})
  }, [repo.owner, repo.name])

  const handleStar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const nowStarred = !isStarred
    setIsStarred(nowStarred)
    try {
      await (nowStarred
        ? window.api.github.starRepo(repo.owner, repo.name)
        : window.api.github.unstarRepo(repo.owner, repo.name))
    } catch {
      setIsStarred(!nowStarred) // revert on error
    }
  }

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setInstallState('GENERATING')
    try {
      await saveRepo(repo.owner, repo.name)
      await window.api.skill.generate(repo.owner, repo.name)
      setInstallState('INSTALLED')
    } catch {
      setInstallState('UNINSTALLED')
    }
  }

  return (
    <div
      className={`repo-list-row repo-list-row--${density}`}
      onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
      style={{ cursor: 'pointer' }}
    >
      {/* Left: avatar + identity */}
      <div className="repo-list-row-identity">
        <img
          src={`https://github.com/${repo.owner}.png?size=24`}
          alt={repo.owner}
          width={24} height={24}
          style={{ borderRadius: '50%', flexShrink: 0 }}
          onClick={e => { e.stopPropagation(); onOwnerClick?.(repo.owner) }}
        />
        <div className="repo-list-row-body">
          <div className="repo-list-row-title">
            <span className="repo-list-row-name">{repo.name}</span>
            <span className="repo-list-row-owner">{repo.owner}</span>
            {fields.type && typeConfig && repoType !== 'other' && (
              <span className="repo-list-row-type" style={{ color: typeConfig.accentColor }}>
                {typeConfig.icon && <typeConfig.icon size={10} />}
                {typeConfig.label}
              </span>
            )}
            {fields.verification && verificationTier === 'verified' && (
              <span className="repo-list-row-badge repo-list-row-badge--verified">Official</span>
            )}
            {fields.verification && verificationTier === 'likely' && (
              <span className="repo-list-row-badge repo-list-row-badge--likely">Likely Official</span>
            )}
          </div>
          {fields.description && repo.description && (
            <div className="repo-list-row-description">{repo.description}</div>
          )}
          {fields.tags && topics.length > 0 && (
            <div className="repo-list-row-tags">
              {topics.map(tag => (
                <button
                  key={tag}
                  className="repo-list-row-tag"
                  onClick={e => { e.stopPropagation(); onTagClick(tag) }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: stats + action buttons (always shown) */}
      <div className="repo-list-row-actions" onClick={e => e.stopPropagation()}>
        {fields.stats && (
          <div className="repo-list-row-stats">
            <span><LuStar size={11} /> {formatCount(repo.stars)}</span>
            <span><LuGitFork size={11} /> {formatCount(repo.forks)}</span>
            <span><LuClock size={11} /> {formatRecency(repo.updated_at)}</span>
          </div>
        )}
        <div className="repo-list-row-btns">
          <button
            className={`btn-card-star${isStarred ? ' starred' : ''}`}
            onClick={handleStar}
            title={isStarred ? 'Unstar on GitHub' : 'Star on GitHub'}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
            </svg>
          </button>
          <button
            className={`install-btn${installState === 'GENERATING' ? ' generating' : installState === 'INSTALLED' ? ' installed' : ''}`}
            onClick={handleInstall}
            disabled={installState === 'GENERATING' || installState === 'INSTALLED'}
          >
            {installState === 'UNINSTALLED' && '+ Install'}
            {installState === 'GENERATING'  && '⟳ Generating...'}
            {installState === 'INSTALLED'   && '✓ Installed'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run --reporter=verbose src/components/RepoListRow.test.tsx 2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/components/RepoListRow.tsx src/components/RepoListRow.test.tsx && git commit -m "feat: add RepoListRow component with tests"
```

---

## Task 3: CSS for layout dropdown and list row

**Files:**
- Modify: `src/styles/globals.css` (append after `.type-dropdown-item-left` block, around line 5672)

- [ ] **Step 1: Add CSS**

Append the following after the `.type-dropdown-item-left` block in `globals.css`:

```css
/* ── Layout dropdown ─────────────────────────────────────────────── */
.layout-dropdown-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  width: 260px;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  padding: 10px;
}

.layout-dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: 8px -10px;
}

.layout-segment-row,
.layout-density-row {
  display: flex;
  gap: 4px;
}

.layout-segment-btn {
  flex: 1;
  padding: 5px 0;
  font-size: 12px;
  font-family: 'Inter', sans-serif;
  border: 1px solid var(--border2);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--t2);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.layout-segment-btn:hover { background: var(--bg3); color: var(--t1); }
.layout-segment-btn.active {
  background: var(--accent-soft);
  color: var(--accent-text);
  border-color: var(--accent-border);
  font-weight: 600;
}

.layout-section { margin-top: 8px; }

.layout-section-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--t3);
  margin-bottom: 6px;
}

.layout-columns-row {
  display: flex;
  gap: 4px;
}

.layout-column-btn {
  flex: 1;
  padding: 5px 0;
  font-size: 12px;
  font-family: 'Inter', sans-serif;
  border: 1px solid var(--border2);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--t2);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.layout-column-btn:hover { background: var(--bg3); color: var(--t1); }
.layout-column-btn.active {
  background: var(--accent-soft);
  color: var(--accent-text);
  border-color: var(--accent-border);
  font-weight: 600;
}

.layout-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  color: var(--t2);
  cursor: pointer;
  user-select: none;
}
.layout-field-row:hover { color: var(--t1); }
.layout-field-row input[type="checkbox"] { cursor: pointer; accent-color: var(--accent); }

/* ── List row ────────────────────────────────────────────────────── */
.repo-list-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  transition: background 0.1s;
}
.repo-list-row:hover { background: var(--bg3); }
.repo-list-row:last-child { border-bottom: none; }

.repo-list-row--compact  { padding: 8px 20px; }
.repo-list-row--comfortable { padding: 14px 20px; }

.repo-list-row-identity {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.repo-list-row-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.repo-list-row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.repo-list-row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--t1);
}

.repo-list-row-owner {
  font-size: 12px;
  color: var(--t3);
}

.repo-list-row-type {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
}

.repo-list-row-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
}
.repo-list-row-badge--verified {
  background: rgba(139,92,246,0.12);
  color: #7c3aed;
}
.repo-list-row-badge--likely {
  background: var(--bg3);
  color: var(--t2);
}

.repo-list-row-description {
  font-size: 12px;
  color: var(--t2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 600px;
}
.repo-list-row--compact .repo-list-row-description { font-size: 11px; }

.repo-list-row-tags {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}

.repo-list-row-tag {
  font-size: 10px;
  padding: 2px 7px;
  border: 1px solid var(--border2);
  border-radius: 10px;
  background: none;
  color: var(--t3);
  cursor: pointer;
  transition: color 0.1s, border-color 0.1s;
}
.repo-list-row-tag:hover { color: var(--t1); border-color: var(--accent-border); }

.repo-list-row-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.repo-list-row-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--t3);
  align-items: center;
  white-space: nowrap;
}
.repo-list-row-stats span {
  display: flex;
  align-items: center;
  gap: 3px;
}

.repo-list-row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--t3);
}

.repo-list-row-btns {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
```

- [ ] **Step 2: Verify build succeeds**

```bash
cd "D:/Coding/Git-Suite" && npm run build 2>&1 | tail -5
```

Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/styles/globals.css && git commit -m "style: add layout dropdown and list row CSS"
```

---

## Task 4: Wire layout into Discover.tsx

**Files:**
- Modify: `src/views/Discover.tsx`
- Modify: `src/views/Discover.test.tsx`

### Step 1: Write the failing integration tests

Append after the last `describe` block in `src/views/Discover.test.tsx`:

```tsx
describe('Layout switcher integration in Discover', () => {
  beforeEach(() => {
    makeDiscoverApi()
    localStorage.clear()
  })

  it('renders a Layout button in the filter row', () => {
    renderDiscover()
    expect(screen.getByRole('button', { name: /layout options/i })).toBeInTheDocument()
  })

  it('defaults to grid mode (no list rows visible)', async () => {
    renderDiscover()
    await waitFor(() => screen.getByText('next.js'))
    // In grid mode, RepoCard renders — check for card-specific structure
    // (list rows have class repo-list-row; grid has discover-grid)
    expect(document.querySelector('.discover-grid')).toBeInTheDocument()
    expect(document.querySelector('.repo-list-row')).not.toBeInTheDocument()
  })

  it('switches to list mode when List is selected in the dropdown', async () => {
    renderDiscover()
    await waitFor(() => screen.getByText('next.js'))
    fireEvent.click(screen.getByRole('button', { name: /layout options/i }))
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(document.querySelector('.repo-list-row')).toBeInTheDocument()
    expect(document.querySelector('.discover-grid')).not.toBeInTheDocument()
  })

  it('reads saved layout prefs from localStorage on mount', () => {
    localStorage.setItem('discover-layout-prefs', JSON.stringify({ ...DEFAULT_LAYOUT_PREFS, mode: 'list' }))
    renderDiscover()
    expect(screen.getByText(/layout: list/i)).toBeInTheDocument()
  })

  it('falls back to DEFAULT_LAYOUT_PREFS when localStorage value is malformed', () => {
    localStorage.setItem('discover-layout-prefs', 'not-valid-json{{{')
    renderDiscover()
    expect(screen.getByText(/layout: grid/i)).toBeInTheDocument()
  })
})
```

Also add this import at the top of the test file (alongside existing imports):
```tsx
import { DEFAULT_LAYOUT_PREFS } from '../components/LayoutDropdown'
```

> Note: `fireEvent` and `waitFor` must already be imported in `Discover.test.tsx`. Before writing these tests, verify the file already has `import { render, screen, fireEvent, waitFor } from '@testing-library/react'`. If `fireEvent` or `waitFor` are missing from that import, add them now.

- [ ] **Step 2: Run to verify tests fail**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run --reporter=verbose src/views/Discover.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `Unable to find an accessible element with the role "button" and name /layout options/i`

- [ ] **Step 3: Update Discover.tsx**

**3a. Add imports** at the top with other component imports:

```tsx
import LayoutDropdown, {
  DEFAULT_LAYOUT_PREFS, LAYOUT_STORAGE_KEY,
  type LayoutPrefs,
} from '../components/LayoutDropdown'
import RepoListRow from '../components/RepoListRow'
```

> Note: `LuLayoutGrid` is used internally by `LayoutDropdown` — do NOT import it in `Discover.tsx`.

**3b. Add `loadLayoutPrefs` helper** — add this function before the `Discover` component declaration (outside the component, at module level):

```tsx
function loadLayoutPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT_PREFS
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>
    const columns = Math.min(5, Math.max(1, parsed.columns ?? DEFAULT_LAYOUT_PREFS.columns))
    return {
      mode:    parsed.mode === 'list' ? 'list' : 'grid',
      columns,
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      fields: {
        description:  parsed.fields?.description  ?? true,
        tags:         parsed.fields?.tags         ?? true,
        stats:        parsed.fields?.stats        ?? true,
        type:         parsed.fields?.type         ?? true,
        verification: parsed.fields?.verification ?? true,
      },
    }
  } catch {
    return DEFAULT_LAYOUT_PREFS
  }
}
```

**3c. Add `layoutPrefs` state and `handleLayoutChange`** — add after the `activeVerification` state and `handleVerificationToggle` (around line 125):

```tsx
const [layoutPrefs, setLayoutPrefs] = useState<LayoutPrefs>(loadLayoutPrefs)

const handleLayoutChange = (prefs: LayoutPrefs) => {
  setLayoutPrefs(prefs)
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(prefs))
}
```

**3d. Add `<LayoutDropdown>` to the filter row** — in the JSX, the filter row currently ends with:
```tsx
        </div>
      </div>
```
(the closing tags for the Filters `position:relative` div and the `.discover-filter-row`).

Add `<LayoutDropdown>` as a sibling **after** the Filters `<div style={{ position: 'relative' }}>` block but **inside** `.discover-filter-row`:

```tsx
        {/* Layout dropdown */}
        <LayoutDropdown prefs={layoutPrefs} onChange={handleLayoutChange} />
```

**3e. Update the skeleton** — replace the current skeleton block (lines ~587–597):

```tsx
        {/* Skeleton loading */}
        {loading && (
          layoutPrefs.mode === 'list' ? (
            <div>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="repo-list-row repo-list-row--comfortable" style={{
                  height: 52, background: 'var(--bg3)',
                  animation: 'shimmer 1.5s infinite',
                }} />
              ))}
            </div>
          ) : (
            <div className="discover-grid" style={{ gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: layoutPrefs.columns * 3 }).map((_, i) => (
                <div key={i} style={{
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', height: 280,
                  animation: 'shimmer 1.5s infinite',
                }} />
              ))}
            </div>
          )
        )}
```

**3f. Update the grid render block** — replace the current repo grid (lines ~613–633):

```tsx
        {!loading && !error && repos.length > 0 && (
          layoutPrefs.mode === 'list' ? (
            <div className="discover-list">
              {repos
                .filter(r => (activeTypes.size === 0 || activeTypes.has(repoTypes.get(r.id) ?? 'other')) &&
                (activeVerification.size === 0 || activeVerification.has(verification.getTier(r.id) as 'verified' | 'likely')))
                .map(repo => (
                  <RepoListRow
                    key={`${repo.owner}/${repo.name}`}
                    repo={repo}
                    onNavigate={navigateToRepo}
                    onTagClick={addTag}
                    onOwnerClick={openProfile}
                    repoType={repoTypes.get(repo.id)}
                    verificationTier={verification.getTier(repo.id)}
                    verificationSignals={verification.getSignals(repo.id)}
                    verificationResolving={verification.isResolving(repo.id)}
                    density={layoutPrefs.density}
                    fields={layoutPrefs.fields}
                  />
                ))
              }
            </div>
          ) : (
            <div ref={gridRef} className="discover-grid" style={{ gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))` }}>
              {repos
                .filter(r => (activeTypes.size === 0 || activeTypes.has(repoTypes.get(r.id) ?? 'other')) &&
                (activeVerification.size === 0 || activeVerification.has(verification.getTier(r.id) as 'verified' | 'likely')))
                .map(repo => (
                  <RepoCard
                    key={`${repo.owner}/${repo.name}`}
                    repo={repo}
                    onNavigate={navigateToRepo}
                    onTagClick={addTag}
                    onOwnerClick={openProfile}
                    repoType={repoTypes.get(repo.id)}
                    verificationTier={verification.getTier(repo.id)}
                    verificationSignals={verification.getSignals(repo.id)}
                    verificationResolving={verification.isResolving(repo.id)}
                  />
                ))
              }
            </div>
          )
        )}
```

- [ ] **Step 4: Run all tests**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run 2>&1 | tail -10
```

Expected: All new tests PASS. Pre-existing 27 electron failures are unchanged.

- [ ] **Step 5: Verify build**

```bash
cd "D:/Coding/Git-Suite" && npm run build 2>&1 | tail -5
```

Expected: `✓ built in X.XXs`

- [ ] **Step 6: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/views/Discover.tsx src/views/Discover.test.tsx && git commit -m "feat: wire layout switcher into Discover with localStorage persistence"
```

---

## Task 5: Add `.discover-list` CSS and clean up

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add `.discover-list` container class**

Find the `.discover-grid` rule (around line 865) and add `.discover-list` immediately after it:

```css
.discover-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin: 0 10px;
}
```

- [ ] **Step 2: Verify build and run full test suite**

```bash
cd "D:/Coding/Git-Suite" && npm run build 2>&1 | tail -5 && npx vitest run 2>&1 | tail -8
```

Expected: build passes, all tests pass.

- [ ] **Step 3: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/styles/globals.css && git commit -m "style: add discover-list container CSS"
```
