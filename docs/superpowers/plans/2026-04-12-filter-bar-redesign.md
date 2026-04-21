# Filter Bar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden tabbed filter dropdown with a persistent horizontal chip bar that provides instant-apply filter popovers.

**Architecture:** New `FilterBar` component renders below the SmartBar with 5 filter chips (Language, Stars, Activity, License, Verified) and a layout toggle. Each chip opens a small popover on click. The SmartBar loses its filter icon button. Old `FilterDropdown.tsx` and `DiscoverFilters.tsx` are deleted.

**Tech Stack:** React, TypeScript, CSS (globals.css), lucide-react icons, react-icons/si (devicons)

**Spec:** `docs/superpowers/specs/2026-04-12-filter-bar-redesign-design.md`

---

### Task 1: Consolidate types — LayoutDropdown and SearchFilters

**Files:**
- Modify: `src/components/LayoutDropdown.tsx` (keep as types-only, no changes needed — it already only exports types)
- Modify: `src/env.d.ts` (remove `topics` from SearchFilters)
- Modify: `src/lib/discoverStateStore.ts` (remove `topics` from SearchFilters)

The `LayoutDropdown.tsx` file already only contains type exports and `DEFAULT_LAYOUT_PREFS`/`LAYOUT_STORAGE_KEY` constants — 6 other files import from it. Keep it as-is; the new `LayoutPopover.tsx` will import types from it too.

For `SearchFilters`, there are 4 duplicate definitions (in `env.d.ts`, `discoverStateStore.ts`, `FilterDropdown.tsx`, `Discover.tsx`). Remove `topics` from each. The canonical export will be from `FilterBar.tsx` (Task 5), but the copies in `env.d.ts` and `discoverStateStore.ts` need `topics` removed now so they don't conflict.

- [ ] **Step 1: Remove `topics` from SearchFilters in env.d.ts**

In `src/env.d.ts` line 16, remove `topics?: string[]` from the `SearchFilters` interface.

- [ ] **Step 2: Remove `topics` from SearchFilters in discoverStateStore.ts**

In `src/lib/discoverStateStore.ts` line 14, remove `topics?: string[]` from the `SearchFilters` interface.

- [ ] **Step 3: Commit**

```bash
git add src/env.d.ts src/lib/discoverStateStore.ts
git commit -m "refactor: remove topics from SearchFilters across codebase"
```

---

### Task 2: Create SimplePopover component

**Files:**
- Create: `src/components/SimplePopover.tsx`

A reusable popover component for single-select filter options (Stars, Activity, License) and multi-select (Verified).

- [ ] **Step 1: Create SimplePopover component**

```tsx
import { useEffect, useRef } from 'react'

export interface PopoverOption {
  label: string
  value: string | number | undefined
  icon?: React.ReactNode
}

interface SimplePopoverProps {
  options: PopoverOption[]
  value: string | number | undefined
  onSelect: (value: string | number | undefined) => void
  onClose: () => void
  multiSelect?: boolean
  selectedValues?: Set<string>
  onToggle?: (value: string) => void
}

export default function SimplePopover({
  options,
  value,
  onSelect,
  onClose,
  multiSelect,
  selectedValues,
  onToggle,
}: SimplePopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div className="filter-popover" ref={ref}>
      {options.map(opt => {
        const isActive = multiSelect
          ? selectedValues?.has(String(opt.value))
          : opt.value === value
        return (
          <button
            key={String(opt.value ?? 'any')}
            className={`filter-popover-option${isActive ? ' active' : ''}`}
            onClick={() => {
              if (multiSelect && onToggle) {
                onToggle(String(opt.value))
              } else {
                onSelect(opt.value)
                onClose()
              }
            }}
          >
            {opt.icon && <span className="filter-popover-option-icon">{opt.icon}</span>}
            <span>{opt.label}</span>
            {isActive && <span className="filter-popover-check">✓</span>}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SimplePopover.tsx
git commit -m "feat: add SimplePopover component for filter chip popovers"
```

---

### Task 3: Create LanguagePopover component

**Files:**
- Create: `src/components/LanguagePopover.tsx`
- Read: `src/lib/languages.ts` (for LangDef, LANGUAGES, getLangColor)

The categorized language picker with tabs, devicons, language-colored highlights, and selected summary.

- [ ] **Step 1: Create LanguagePopover component**

```tsx
import { useState, useEffect, useRef } from 'react'
import { LANG_MAP } from '../lib/languages'

const LANG_CATEGORIES: { id: string; label: string; icon: string; keys: string[] }[] = [
  { id: 'web', label: 'Web', icon: '🌐', keys: ['javascript','typescript','html','css','vue','svelte','coffeescript'] },
  { id: 'systems', label: 'Systems', icon: '⚙️', keys: ['c','c++','c#','rust','go','zig','fortran','assembly'] },
  { id: 'jvm', label: 'JVM', icon: '☕', keys: ['java','kotlin','scala','clojure','groovy'] },
  { id: 'scripting', label: 'Script', icon: '📜', keys: ['python','ruby','php','perl','shell','powershell','lua'] },
  { id: 'functional', label: 'Func', icon: 'λ', keys: ['haskell','elixir','erlang','ocaml','elm'] },
  { id: 'mobile', label: 'Mobile', icon: '📱', keys: ['swift','dart'] },
  { id: 'data', label: 'Data', icon: '📊', keys: ['r','julia'] },
  { id: 'other', label: 'Other', icon: '…', keys: ['nix','solidity'] },
]

interface LanguagePopoverProps {
  activeLanguage: string
  onSelect: (lang: string) => void
  onClose: () => void
}

export default function LanguagePopover({ activeLanguage, onSelect, onClose }: LanguagePopoverProps) {
  const [activeCategory, setActiveCategory] = useState('web')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const category = LANG_CATEGORIES.find(c => c.id === activeCategory)!
  const activeLangLower = activeLanguage.toLowerCase()
  const activeLangDef = activeLangLower ? LANG_MAP.get(activeLangLower) : undefined

  return (
    <div className="lang-popover" ref={ref}>
      {/* Category tabs */}
      <div className="lang-popover-tabs">
        {LANG_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`lang-popover-tab${activeCategory === cat.id ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            <span className="lang-popover-tab-icon">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Language buttons */}
      <div className="lang-popover-items">
        {category.keys.map(key => {
          const lang = LANG_MAP.get(key)
          if (!lang) return null
          const isActive = activeLangLower === key
          const Icon = lang.icon
          const color = lang.color
          return (
            <button
              key={key}
              className={`lang-popover-item${isActive ? ' active' : ''}`}
              style={isActive ? {
                background: `${color}33`,
                borderColor: `${color}66`,
                color,
              } : undefined}
              onClick={() => onSelect(isActive ? '' : lang.key)}
            >
              {Icon && <Icon size={14} color={isActive ? color : undefined} />}
              {lang.name}
            </button>
          )
        })}
      </div>

      {/* Selected summary */}
      {activeLangDef && (
        <div className="lang-popover-summary">
          <span className="lang-popover-summary-label">Selected:</span>
          <span
            className="lang-popover-summary-chip"
            style={{
              background: `${activeLangDef.color}33`,
              borderColor: `${activeLangDef.color}55`,
              color: activeLangDef.color,
            }}
          >
            {activeLangDef.icon && <activeLangDef.icon size={10} />}
            {activeLangDef.name}
            <span
              className="lang-popover-summary-chip-x"
              onClick={() => onSelect('')}
            >✕</span>
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LanguagePopover.tsx
git commit -m "feat: add LanguagePopover with category tabs, devicons, and language colors"
```

---

### Task 4: Create LayoutPopover component

**Files:**
- Create: `src/components/LayoutPopover.tsx`
- Read: `src/components/LayoutDropdown.tsx` (for type exports — keep this file, it's imported by 6 other files)

Extract layout controls from the old FilterDropdown layout tab into a standalone popover. Import types from `LayoutDropdown.tsx` which remains as a types/constants file.

- [ ] **Step 1: Create LayoutPopover component**

```tsx
import { useEffect, useRef } from 'react'
import type { LayoutPrefs, LayoutMode, ListDensity } from './LayoutDropdown'

interface LayoutPopoverProps {
  prefs: LayoutPrefs
  onChange: (prefs: LayoutPrefs) => void
  onClose: () => void
}

export default function LayoutPopover({ prefs, onChange, onClose }: LayoutPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const setMode = (mode: LayoutMode) => onChange({ ...prefs, mode })
  const setColumns = (columns: number) => onChange({ ...prefs, columns })
  const setDensity = (density: ListDensity) => onChange({ ...prefs, density })
  const toggleField = (field: keyof typeof prefs.fields) =>
    onChange({ ...prefs, fields: { ...prefs.fields, [field]: !prefs.fields[field] } })

  return (
    <div className="layout-popover" ref={ref}>
      {/* Mode toggle */}
      <div className="layout-popover-row">
        <button
          className={`layout-segment-btn${prefs.mode === 'grid' ? ' active' : ''}`}
          onClick={() => setMode('grid')}
        >Grid</button>
        <button
          className={`layout-segment-btn${prefs.mode === 'list' ? ' active' : ''}`}
          onClick={() => setMode('list')}
        >List</button>
      </div>

      {prefs.mode === 'grid' ? (
        <>
          <div className="layout-popover-label">Columns</div>
          <div className="layout-popover-row">
            {[5, 6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                className={`layout-column-btn${prefs.columns === n ? ' active' : ''}`}
                onClick={() => setColumns(n)}
              >{n}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="layout-popover-label">Density</div>
          <div className="layout-popover-row">
            <button
              className={`layout-segment-btn${prefs.density === 'compact' ? ' active' : ''}`}
              onClick={() => setDensity('compact')}
            >Compact</button>
            <button
              className={`layout-segment-btn${prefs.density === 'comfortable' ? ' active' : ''}`}
              onClick={() => setDensity('comfortable')}
            >Comfortable</button>
          </div>
          <div className="layout-popover-label">Show</div>
          {(['description', 'tags', 'stats', 'type', 'verification'] as const).map(field => (
            <label key={field} className="layout-field-row">
              <input
                type="checkbox"
                checked={prefs.fields[field]}
                onChange={() => toggleField(field)}
              />
              {field.charAt(0).toUpperCase() + field.slice(1)}
            </label>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LayoutPopover.tsx
git commit -m "feat: add LayoutPopover extracted from FilterDropdown layout tab"
```

---

### Task 5: Create FilterChip component

**Files:**
- Create: `src/components/FilterChip.tsx`

Individual chip with inactive/active states that triggers its popover.

- [ ] **Step 1: Create FilterChip component**

```tsx
import { ChevronDown, X } from 'lucide-react'

interface FilterChipProps {
  label: string
  active: boolean
  activeLabel?: string
  activeIcon?: React.ReactNode
  activeColor?: string  // For language-colored chips
  onClick: () => void
  onClear: () => void
}

export default function FilterChip({
  label,
  active,
  activeLabel,
  activeIcon,
  activeColor,
  onClick,
  onClear,
}: FilterChipProps) {
  if (active) {
    const style = activeColor
      ? { background: `${activeColor}33`, borderColor: `${activeColor}66`, color: activeColor }
      : undefined
    return (
      <span className="filter-chip active" style={style}>
        {activeIcon && <span className="filter-chip-icon">{activeIcon}</span>}
        <span className="filter-chip-label" onClick={onClick}>{activeLabel ?? label}</span>
        <span className="filter-chip-x" onClick={e => { e.stopPropagation(); onClear() }}>
          <X size={10} />
        </span>
      </span>
    )
  }

  return (
    <button className="filter-chip" onClick={onClick}>
      {label} <ChevronDown size={10} className="filter-chip-chevron" />
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FilterChip.tsx
git commit -m "feat: add FilterChip component with active/inactive states"
```

---

### Task 6: Create FilterBar component

**Files:**
- Create: `src/components/FilterBar.tsx`
- Read: `src/components/SimplePopover.tsx`
- Read: `src/components/LanguagePopover.tsx`
- Read: `src/components/LayoutPopover.tsx`
- Read: `src/components/FilterChip.tsx`

The main horizontal filter bar that orchestrates all chips and popovers.

- [ ] **Step 1: Create FilterBar component**

```tsx
import { useState, useCallback } from 'react'
import { ShieldCheck, Shield, Grid3X3, List } from 'lucide-react'
import FilterChip from './FilterChip'
import SimplePopover, { type PopoverOption } from './SimplePopover'
import LanguagePopover from './LanguagePopover'
import LayoutPopover from './LayoutPopover'
import type { LayoutPrefs } from './LayoutDropdown'
import { LANG_MAP } from '../lib/languages'

type ActivityFilter = 'week' | 'month' | 'halfyear'
type StarsFilter = 100 | 1000 | 10000

export interface SearchFilters {
  activity?: ActivityFilter
  stars?: StarsFilter
  license?: string
}

type PopoverName = 'language' | 'stars' | 'activity' | 'license' | 'verified' | 'layout' | null

interface FilterBarProps {
  filters: SearchFilters
  activeLanguage: string
  activeVerification: Set<'verified' | 'likely'>
  layoutPrefs: LayoutPrefs
  onFilterChange: (filters: SearchFilters) => void
  onLanguageChange: (lang: string) => void
  onVerificationToggle: (tier: 'verified' | 'likely') => void
  onLayoutChange: (prefs: LayoutPrefs) => void
}

const STARS_OPTIONS: PopoverOption[] = [
  { label: 'Any', value: undefined },
  { label: '100+', value: 100 },
  { label: '1,000+', value: 1000 },
  { label: '10,000+', value: 10000 },
]

const ACTIVITY_OPTIONS: PopoverOption[] = [
  { label: 'Any time', value: undefined },
  { label: 'Last 7 days', value: 'week' },
  { label: 'Last 30 days', value: 'month' },
  { label: 'Last 6 months', value: 'halfyear' },
]

const LICENSE_OPTIONS: PopoverOption[] = [
  { label: 'Any', value: undefined },
  { label: 'MIT', value: 'mit' },
  { label: 'Apache 2.0', value: 'apache-2.0' },
  { label: 'GPL 3.0', value: 'gpl-3.0' },
]

const VERIFIED_OPTIONS: PopoverOption[] = [
  { label: 'Official', value: 'verified', icon: <ShieldCheck size={14} color="#7c3aed" /> },
  { label: 'Likely Official', value: 'likely', icon: <Shield size={14} color="#16a34a" /> },
]

const ACTIVITY_LABELS: Record<string, string> = { week: '7 days', month: '30 days', halfyear: '6 months' }
const STARS_LABELS: Record<number, string> = { 100: '100+', 1000: '1K+', 10000: '10K+' }
const LICENSE_LABELS: Record<string, string> = { mit: 'MIT', 'apache-2.0': 'Apache 2.0', 'gpl-3.0': 'GPL 3.0' }

export default function FilterBar({
  filters,
  activeLanguage,
  activeVerification,
  layoutPrefs,
  onFilterChange,
  onLanguageChange,
  onVerificationToggle,
  onLayoutChange,
}: FilterBarProps) {
  const [openPopover, setOpenPopover] = useState<PopoverName>(null)

  const toggle = useCallback((name: PopoverName) => {
    setOpenPopover(prev => prev === name ? null : name)
  }, [])

  const closePopover = useCallback(() => setOpenPopover(null), [])

  const langDef = activeLanguage ? LANG_MAP.get(activeLanguage.toLowerCase()) : undefined
  const hasAnyFilter = !!filters.activity || !!filters.stars || !!filters.license || !!activeLanguage || activeVerification.size > 0

  const clearAll = () => {
    onFilterChange({})
    onLanguageChange('')
    // Clear verification
    activeVerification.forEach(tier => onVerificationToggle(tier))
  }

  const verificationLabel = () => {
    const parts: string[] = []
    if (activeVerification.has('verified')) parts.push('Official')
    if (activeVerification.has('likely')) parts.push('Likely')
    return parts.join(' + ')
  }

  return (
    <div className="filter-bar">
      <div className="filter-bar-chips">
        {/* Language chip */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="Language"
            active={!!activeLanguage}
            activeLabel={langDef?.name ?? activeLanguage}
            activeIcon={langDef?.icon ? <langDef.icon size={12} /> : undefined}
            activeColor={langDef?.color}
            onClick={() => toggle('language')}
            onClear={() => onLanguageChange('')}
          />
          {openPopover === 'language' && (
            <LanguagePopover
              activeLanguage={activeLanguage}
              onSelect={lang => { onLanguageChange(lang); if (!lang) closePopover() }}
              onClose={closePopover}
            />
          )}
        </div>

        {/* Stars chip */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="Stars"
            active={!!filters.stars}
            activeLabel={filters.stars ? `★ ${STARS_LABELS[filters.stars]}` : undefined}
            onClick={() => toggle('stars')}
            onClear={() => onFilterChange({ ...filters, stars: undefined })}
          />
          {openPopover === 'stars' && (
            <SimplePopover
              options={STARS_OPTIONS}
              value={filters.stars}
              onSelect={v => onFilterChange({ ...filters, stars: v as StarsFilter | undefined })}
              onClose={closePopover}
            />
          )}
        </div>

        {/* Activity chip */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="Activity"
            active={!!filters.activity}
            activeLabel={filters.activity ? ACTIVITY_LABELS[filters.activity] : undefined}
            onClick={() => toggle('activity')}
            onClear={() => onFilterChange({ ...filters, activity: undefined })}
          />
          {openPopover === 'activity' && (
            <SimplePopover
              options={ACTIVITY_OPTIONS}
              value={filters.activity}
              onSelect={v => onFilterChange({ ...filters, activity: v as ActivityFilter | undefined })}
              onClose={closePopover}
            />
          )}
        </div>

        {/* License chip */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="License"
            active={!!filters.license}
            activeLabel={filters.license ? LICENSE_LABELS[filters.license] : undefined}
            onClick={() => toggle('license')}
            onClear={() => onFilterChange({ ...filters, license: undefined })}
          />
          {openPopover === 'license' && (
            <SimplePopover
              options={LICENSE_OPTIONS}
              value={filters.license}
              onSelect={v => onFilterChange({ ...filters, license: v as string | undefined })}
              onClose={closePopover}
            />
          )}
        </div>

        {/* Verified chip */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="Verified"
            active={activeVerification.size > 0}
            activeLabel={verificationLabel()}
            onClick={() => toggle('verified')}
            onClear={() => activeVerification.forEach(tier => onVerificationToggle(tier))}
          />
          {openPopover === 'verified' && (
            <SimplePopover
              options={VERIFIED_OPTIONS}
              value={undefined}
              onSelect={() => {}}
              onClose={closePopover}
              multiSelect
              selectedValues={activeVerification as Set<string>}
              onToggle={v => onVerificationToggle(v as 'verified' | 'likely')}
            />
          )}
        </div>

        {/* Clear all */}
        {hasAnyFilter && (
          <button className="filter-bar-clear" onClick={clearAll}>Clear all</button>
        )}
      </div>

      {/* Layout toggle */}
      <div className="filter-chip-wrapper">
        <div className="filter-bar-layout-toggle">
          <button
            className={`filter-bar-layout-btn${layoutPrefs.mode === 'grid' ? ' active' : ''}`}
            onClick={() => toggle('layout')}
            title="Grid view"
          >
            <Grid3X3 size={14} />
          </button>
          <button
            className={`filter-bar-layout-btn${layoutPrefs.mode === 'list' ? ' active' : ''}`}
            onClick={() => toggle('layout')}
            title="List view"
          >
            <List size={14} />
          </button>
        </div>
        {openPopover === 'layout' && (
          <LayoutPopover
            prefs={layoutPrefs}
            onChange={onLayoutChange}
            onClose={closePopover}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FilterBar.tsx
git commit -m "feat: add FilterBar orchestrating filter chips and popovers"
```

---

### Task 7: Add CSS for filter bar and popovers

**Files:**
- Modify: `src/styles/globals.css`

Add new styles and remove old `.fdd-*`, `.discover-filter-icon-btn`, and `.filter-badge` styles.

- [ ] **Step 1: Remove old filter CSS**

Delete the following CSS rule blocks from `globals.css`:
- `.fdd-backdrop` through `.fdd-apply-btn:hover` (the entire FilterDropdown section, ~lines 7209-7407)
- `.discover-filter-icon-btn` through `.filter-badge` (~lines 8024-8067)

- [ ] **Step 2: Add new filter bar CSS**

Add the following at the end of the file (or in the same region where the old styles were):

```css
/* ── Filter Bar ─────────────────────────────────────── */

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.filter-bar-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  flex-wrap: wrap;
}

.filter-chip-wrapper {
  position: relative;
}

/* ── Filter Chip ────────────────────────────────────── */

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 16px;
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: var(--t3);
}

.filter-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--t2);
}

.filter-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent-text);
  font-weight: 500;
}

.filter-chip-icon {
  display: flex;
  align-items: center;
}

.filter-chip-label {
  cursor: pointer;
}

.filter-chip-x {
  display: flex;
  align-items: center;
  opacity: 0.5;
  cursor: pointer;
  margin-left: 2px;
}
.filter-chip-x:hover { opacity: 1; }

.filter-chip-chevron {
  opacity: 0.6;
}

.filter-bar-clear {
  padding: 5px 8px;
  font-size: 11px;
  color: var(--t3);
  cursor: pointer;
  background: none;
  border: none;
  font-family: 'Inter', sans-serif;
}
.filter-bar-clear:hover { color: var(--t2); }

/* ── Layout Toggle ──────────────────────────────────── */

.filter-bar-layout-toggle {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 2px;
}

.filter-bar-layout-btn {
  padding: 4px 8px;
  border-radius: 4px;
  background: none;
  border: none;
  color: var(--t3);
  cursor: pointer;
  display: flex;
  align-items: center;
}
.filter-bar-layout-btn:hover { color: var(--t2); }
.filter-bar-layout-btn.active {
  color: var(--accent-text);
  background: rgba(109, 40, 217, 0.15);
}

/* ── Simple Popover ─────────────────────────────────── */

.filter-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  min-width: 160px;
  background: rgba(18, 18, 24, 0.95);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.filter-popover-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--t2);
  cursor: pointer;
  background: none;
  border: none;
  text-align: left;
  font-family: 'Inter', sans-serif;
}
.filter-popover-option:hover { background: rgba(255, 255, 255, 0.06); }
.filter-popover-option.active {
  color: var(--accent-text);
  background: rgba(109, 40, 217, 0.15);
  font-weight: 500;
}

.filter-popover-option-icon {
  display: flex;
  align-items: center;
}

.filter-popover-check {
  margin-left: auto;
  font-size: 10px;
}

/* ── Language Popover ───────────────────────────────── */

.lang-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  width: 380px;
  background: rgba(18, 18, 24, 0.97);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.lang-popover-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px 4px 0 4px;
  gap: 1px;
  overflow-x: auto;
}

.lang-popover-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  font-size: 10px;
  color: var(--t3);
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  cursor: pointer;
  white-space: nowrap;
  font-family: 'Inter', sans-serif;
}
.lang-popover-tab:hover { color: var(--t2); }
.lang-popover-tab.active {
  color: var(--accent-text);
  border-bottom-color: var(--accent-text);
  font-weight: 600;
}

.lang-popover-tab-icon {
  font-size: 13px;
}

.lang-popover-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px;
}

.lang-popover-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 11px;
  color: var(--t2);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.10);
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: background 0.1s, color 0.1s;
}
.lang-popover-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--t1);
}
.lang-popover-item.active {
  font-weight: 500;
}

/* ── Language Popover Summary ───────────────────────── */

.lang-popover-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-wrap: wrap;
}

.lang-popover-summary-label {
  font-size: 10px;
  color: var(--t3);
  margin-right: 2px;
}

.lang-popover-summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 10px;
  border: 1px solid;
}

.lang-popover-summary-chip-x {
  opacity: 0.5;
  cursor: pointer;
  margin-left: 1px;
}
.lang-popover-summary-chip-x:hover { opacity: 1; }

/* ── Layout Popover ─────────────────────────────────── */

.layout-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 200;
  width: 220px;
  background: rgba(18, 18, 24, 0.95);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.layout-popover-row {
  display: flex;
  gap: 2px;
  margin-bottom: 10px;
}

.layout-popover-label {
  font-size: 10px;
  color: var(--t3);
  margin-bottom: 6px;
}

/* Reuse existing layout control styles (already in globals.css) */
/* .layout-segment-btn, .layout-segment-btn.active — mode toggle buttons */
/* .layout-column-btn, .layout-column-btn.active — column count buttons */
/* .layout-field-row — field visibility checkbox rows */
/* These styles are already defined in globals.css (~lines 7409-7502) and should NOT be deleted in Step 1. */
/* Only delete the .fdd-* and .discover-filter-icon-btn/.filter-badge rules. */
/* Keep .layout-segment-btn, .layout-column-btn, .layout-field-row, .layout-section-label intact. */
```

**Important:** In Step 1, when removing old filter CSS, keep the `.layout-*` styles (`.layout-segment-btn`, `.layout-column-btn`, `.layout-field-row`, `.layout-section-label`) — they are reused by the new `LayoutPopover`.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add filter bar CSS, remove old FilterDropdown styles"
```

---

### Task 8: Wire FilterBar into Discover.tsx and remove old filter system

**Files:**
- Modify: `src/views/Discover.tsx`
- Modify: `src/components/SmartBar.tsx`

Remove the old filter integration and add the new FilterBar.

- [ ] **Step 1: Update SmartBar — remove filter button props**

In `src/components/SmartBar.tsx`:

Remove from `SmartBarProps` interface:
- `onFilterClick: () => void`
- `filterBadgeCount: number`

Remove from destructured props:
- `onFilterClick`
- `filterBadgeCount`

Remove the filter button JSX (the `<button className="smart-bar-search-filter">` block, lines 43-52).

Updated SmartBar should look like:
```tsx
import { Search } from 'lucide-react'
import { REPO_BUCKETS } from '../constants/repoTypes'
import { getBucketColor } from '../config/repoTypeConfig'
import SortDropdown from './SortDropdown'
import type { ViewModeKey } from '../lib/discoverQueries'

interface SmartBarProps {
  query: string
  onQueryChange: (q: string) => void
  activeBucket: string | null
  onBucketChange: (bucketId: string | null) => void
  inputRef?: React.Ref<HTMLInputElement>
  sortValue: ViewModeKey
  onSortChange: (key: ViewModeKey) => void
}

export default function SmartBar({
  query,
  onQueryChange,
  activeBucket,
  onBucketChange,
  inputRef,
  sortValue,
  onSortChange,
}: SmartBarProps) {
  return (
    <div className="smart-bar">
      <div className="smart-bar-search">
        <Search className="smart-bar-search-icon" size={14} />
        <input
          className="smart-bar-search-input"
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search repositories…"
          ref={inputRef}
        />
      </div>

      <div className="smart-bar-divider" />

      <div className="smart-bar-buckets">
        <button
          className={`smart-bar-bucket-pill${activeBucket === null ? ' active' : ''}`}
          onClick={() => onBucketChange(null)}
        >
          All
        </button>
        {REPO_BUCKETS.map(bucket => {
          const isActive = activeBucket === bucket.id
          const color = getBucketColor(bucket.id)
          return (
            <button
              key={bucket.id}
              className={`smart-bar-bucket-pill${isActive ? ' active' : ''}`}
              onClick={() => onBucketChange(isActive ? null : bucket.id)}
              style={isActive && color ? { color, backgroundColor: `${color}1f` } : undefined}
            >
              {bucket.label}
            </button>
          )
        })}
      </div>

      <SortDropdown value={sortValue} onChange={onSortChange} />
    </div>
  )
}
```

- [ ] **Step 2: Update Discover.tsx — remove old filter state, add FilterBar**

In `src/views/Discover.tsx`:

**Update imports** — remove FilterDropdown and DiscoverFilters imports, add FilterBar:
```tsx
// Remove these:
// import FilterDropdown, { type FilterTab } from '../components/FilterDropdown'
// Add this:
import FilterBar, { type SearchFilters } from '../components/FilterBar'
```

**Remove state variables** (around lines 101-103):
- `filterDropdownOpen`
- `filterDropdownInitialTab`

**Remove `topics` references** from `buildTrendingQuery` — delete the line:
```tsx
if (filters.topics?.length) filterParts.push(...filters.topics)
```

**Remove the `filterBadgeCount` calculation** (around lines 679-682).

**Update `handleFilterChange`** to take separate filter and language args:
```tsx
function handleFilterChange(newFilters: SearchFilters) {
  setAppliedFilters(newFilters)
  handleSearch(newFilters, undefined, activeLanguage)
}

function handleLanguageChange(lang: string) {
  setActiveLanguage(lang)
  handleSearch(appliedFilters, undefined, lang)
}
```

**Remove filter props from SmartBar** usage — remove `onFilterClick` and `filterBadgeCount`:
```tsx
<SmartBar
  query={contextQuery}
  onQueryChange={setContextQuery}
  activeBucket={activeBucket}
  onBucketChange={handleBucketChange}
  inputRef={discoverInputRef}
  sortValue={viewMode ?? 'recommended'}
  onSortChange={setViewMode}
/>
```

**Replace the FilterDropdown conditional block** (lines 870-891) with FilterBar:
```tsx
<FilterBar
  filters={appliedFilters}
  activeLanguage={activeLanguage}
  activeVerification={activeVerification}
  layoutPrefs={layoutPrefs}
  onFilterChange={handleFilterChange}
  onLanguageChange={handleLanguageChange}
  onVerificationToggle={handleVerificationToggle}
  onLayoutChange={handleLayoutChange}
/>
```

**Remove the `SearchFilters` type** defined locally in Discover.tsx (around lines 33-39) — it's now exported from `FilterBar.tsx`. Also remove the local `ActivityFilter`, `StarsFilter`, and `FilterTab` types if they were only used for the old dropdown.

- [ ] **Step 3: Remove SmartBar filter button CSS**

In `src/styles/globals.css`, remove the `.smart-bar-search-filter` and `.filter-badge` styles if still present.

- [ ] **Step 4: Commit**

```bash
git add src/views/Discover.tsx src/components/SmartBar.tsx src/styles/globals.css
git commit -m "feat: wire FilterBar into Discover, remove old filter system from SmartBar"
```

---

### Task 9: Delete old filter components

**Files:**
- Delete: `src/components/DiscoverFilters.tsx`
- Delete: `src/components/FilterDropdown.tsx`

- [ ] **Step 1: Verify no remaining imports**

Run:
```bash
grep -r "DiscoverFilters\|FilterDropdown" src/ --include="*.tsx" --include="*.ts"
```
Expected: No results (or only the new FilterBar imports)

- [ ] **Step 2: Delete old files**

```bash
rm src/components/DiscoverFilters.tsx src/components/FilterDropdown.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -u src/components/DiscoverFilters.tsx src/components/FilterDropdown.tsx
git commit -m "chore: delete DiscoverFilters and FilterDropdown (replaced by FilterBar)"
```

---

### Task 10: Update SmartBar and Discover tests

**Files:**
- Modify: `src/components/SmartBar.test.tsx`
- Modify: `src/views/Discover.test.tsx`

Update tests to remove filter button references and fix imports.

- [ ] **Step 1: Update SmartBar tests**

Remove any test cases that reference `onFilterClick`, `filterBadgeCount`, or the filter button element. Update the SmartBar render calls to remove these props.

- [ ] **Step 2: Update Discover tests**

In `src/views/Discover.test.tsx`:
- Verify import of `DEFAULT_LAYOUT_PREFS` from `../components/LayoutDropdown` still works (it should — we kept `LayoutDropdown.tsx`)
- Remove any test references to `FilterDropdown`, `DiscoverFilters`, `filterDropdownOpen`, `filterBadgeCount`, or `topics` filter
- Update any test that checks filter behavior to use the new FilterBar pattern

- [ ] **Step 3: Run tests**

Run:
```bash
npm test -- --run
```
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/SmartBar.test.tsx src/views/Discover.test.tsx
git commit -m "test: update SmartBar and Discover tests for filter bar redesign"
```

---

### Task 11: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compiler**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run:
```bash
npm test -- --run
```
Expected: All tests pass

- [ ] **Step 3: Run dev build**

Run:
```bash
npm run build
```
Expected: Builds successfully

- [ ] **Step 4: Fix any issues found, commit fixes**

If any errors occur, fix them and commit:
```bash
git add -A
git commit -m "fix: resolve build/test issues from filter bar redesign"
```
