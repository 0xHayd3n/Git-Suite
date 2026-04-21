# Bucket Mega Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six individual hover panels in `BucketTabBar` with a single full-width unified mega menu that shows all 6 bucket columns simultaneously, with icons on bucket tabs and sub-type items.

**Architecture:** State (`openBucketId`, `closeTimerRef`) lifts from `BucketTabBar` into `Discover.tsx`. `BucketTabBar` becomes a prop-controlled tab strip. A new `BucketMegaMenu` component renders as an absolute-positioned sibling inside the filter row, spanning its full width. `BucketMegaMenu` owns all toggle/onChange logic; `BucketTabBar` only controls which bucket is active.

**Tech Stack:** React, TypeScript, lucide-react (already installed), vitest + @testing-library/react, CSS custom properties.

---

## Background: what you need to know

**Project:** Electron + React desktop app. Tests run with `npm test` (not `npx vitest run`) — this rebuilds the native `better-sqlite3` binary. For running a single test file quickly without rebuilding native deps: `npx vitest run src/components/BucketMegaMenu.test.tsx --reporter=verbose` works.

**Pre-existing failures:** `src/views/Discover.test.tsx` and `src/components/LayoutDropdown.test.tsx` both fail with `IntersectionObserver is not defined`. These are unrelated to this feature and expected throughout.

**REPO_BUCKETS** — from `src/constants/repoTypes.ts`. 6 buckets, each `{ id, label, color, subTypes[] }`. Sub-type IDs: algorithm, testing, build-tool, pkg-manager, linter, formatter, debugger, vcs-tool, ai-model, ml-framework, dataset, neural-net, ai-agent, prompt-lib, code-editor, ide, terminal, notebook, text-editor, lang-impl, style-guide, transpiler, runtime, compiler, database, container, devops, cloud-platform, monitoring, networking, cli-tool, library, platform, api-client, boilerplate, plugin.

**Current BucketTabBar:** Owns `openBucketId` + `closeTimerRef` internally. Each `BucketTab` renders a per-bucket panel. After this feature: no internal state, no panels.

**Note on `onChange` in BucketTabBar:** The spec includes `onChange` in the new `BucketTabBarProps`, but after the refactor the toggle logic moves entirely to `BucketMegaMenu`. The refactored `BucketTabBar` does NOT need `onChange` — it only controls which bucket is open. `onChange` goes directly from `Discover.tsx` to `BucketMegaMenu`. This is a minor spec correction; follow the plan, not the spec interface.

**CSS design tokens:** `var(--bg2)` (panel bg), `var(--border)` (border color), `var(--t1/t2/t3)` (text light→dark), `var(--accent-soft)` (active item bg).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/constants/bucketIcons.ts` | Lucide icon mappings for buckets + sub-types |
| Create | `src/components/BucketMegaMenu.tsx` | Unified full-width panel with 6 columns |
| Create | `src/components/BucketMegaMenu.test.tsx` | Tests for BucketMegaMenu |
| Modify | `src/components/BucketTabBar.tsx` | Remove panel + internal state; add icon to tab; accept state as props |
| Modify | `src/components/BucketTabBar.test.tsx` | Update for prop-controlled API; remove panel tests |
| Modify | `src/views/Discover.tsx` | Lift state; import BucketMegaMenu; pass new props |
| Modify | `src/views/Discover.test.tsx` | Update BucketTabBar integration tests |
| Modify | `src/styles/globals.css` | Add mega panel classes; update `.btb-item`; add `position:relative` to filter row; remove `.btb-panel` |

---

## Task 1: Create `src/constants/bucketIcons.ts`

**Files:**
- Create: `src/constants/bucketIcons.ts`

- [ ] **Step 1: Create the file**

Create `src/constants/bucketIcons.ts` with this exact content:

```ts
import {
  Wrench, Brain, MonitorCode, BookOpen, Server, Layers,
  GitBranch, FlaskConical, Hammer, Package, ScanLine, AlignLeft, Bug, GitMerge,
  Bot, BarChart3, Database, BrainCircuit, Zap, Cpu, MessageSquare,
  FileCode, Monitor, TerminalSquare, NotebookPen, FileText,
  Code, BookMarked, ArrowLeftRight, Play,
  DatabaseZap, Box, Workflow, Cloud, Activity, Network,
  Terminal, Library, Globe, Plug, Copy, Puzzle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const BUCKET_ICONS: Record<string, LucideIcon> = {
  'dev-tools':      Wrench,
  'ai-ml':          Brain,
  'editors':        MonitorCode,
  'lang-projects':  BookOpen,
  'infrastructure': Server,
  'utilities':      Layers,
}

export const SUB_TYPE_ICONS: Record<string, LucideIcon> = {
  // Dev Tools
  'algorithm':    GitBranch,
  'testing':      FlaskConical,
  'build-tool':   Hammer,
  'pkg-manager':  Package,
  'linter':       ScanLine,
  'formatter':    AlignLeft,
  'debugger':     Bug,
  'vcs-tool':     GitMerge,
  // AI & ML
  'ai-model':     Bot,
  'ml-framework': BarChart3,
  'dataset':      Database,
  'neural-net':   BrainCircuit,
  'ai-agent':     Zap,
  'prompt-lib':   MessageSquare,
  // Editors & IDEs
  'code-editor':  FileCode,
  'ide':          Monitor,
  'terminal':     TerminalSquare,
  'notebook':     NotebookPen,
  'text-editor':  FileText,
  // Language Projects
  'lang-impl':    Code,
  'style-guide':  BookMarked,
  'transpiler':   ArrowLeftRight,
  'runtime':      Play,
  'compiler':     Cpu,
  // Infrastructure
  'database':       DatabaseZap,
  'container':      Box,
  'devops':         Workflow,
  'cloud-platform': Cloud,
  'monitoring':     Activity,
  'networking':     Network,
  // Utilities
  'cli-tool':    Terminal,
  'library':     Library,
  'platform':    Globe,
  'api-client':  Plug,
  'boilerplate': Copy,
  'plugin':      Puzzle,
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd D:/Coding/Git-Suite && npx tsc --noEmit 2>&1 | grep "bucketIcons" | head -5
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/constants/bucketIcons.ts
git commit -m "feat: add bucket and sub-type icon mappings"
```

---

## Task 2: Write failing `BucketMegaMenu` tests

**Files:**
- Create: `src/components/BucketMegaMenu.test.tsx`

- [ ] **Step 1: Create the test file**

Create `src/components/BucketMegaMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BucketMegaMenu from './BucketMegaMenu'
import { REPO_BUCKETS } from '../constants/repoTypes'

function renderMenu(
  activeBucketId: string | null = 'dev-tools',
  selected: string[] = [],
  onChange = vi.fn(),
  onMouseEnter = vi.fn(),
  onMouseLeave = vi.fn(),
) {
  return render(
    <BucketMegaMenu
      activeBucketId={activeBucketId}
      selected={selected}
      onChange={onChange}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  )
}

describe('BucketMegaMenu', () => {
  it('renders all 6 column headers with correct bucket labels', () => {
    renderMenu()
    for (const bucket of REPO_BUCKETS) {
      // Headers use text nodes alongside icons — use getAllByText to handle duplicates
      expect(screen.getAllByText(bucket.label).length).toBeGreaterThan(0)
    }
  })

  it('renders a .btb-mega-panel container', () => {
    renderMenu()
    expect(document.querySelector('.btb-mega-panel')).toBeInTheDocument()
  })

  it('renders 6 .btb-mega-col elements', () => {
    renderMenu()
    expect(document.querySelectorAll('.btb-mega-col')).toHaveLength(6)
  })

  it('active column has inline borderLeftColor set', () => {
    renderMenu('ai-ml')
    const cols = Array.from(document.querySelectorAll('.btb-mega-col'))
    const aiMlCol = cols.find(col => col.textContent?.includes('AI & ML')) as HTMLElement
    expect(aiMlCol.style.borderLeftColor).not.toBe('')
  })

  it('inactive columns have no inline borderLeftColor', () => {
    renderMenu('dev-tools')
    const cols = Array.from(document.querySelectorAll('.btb-mega-col'))
    const aiMlCol = cols.find(col => col.textContent?.includes('AI & ML')) as HTMLElement
    expect(aiMlCol.style.borderLeftColor).toBe('')
  })

  it('clicking a sub-type calls onChange with id added', () => {
    const onChange = vi.fn()
    renderMenu('dev-tools', [], onChange)
    fireEvent.click(screen.getByRole('button', { name: /Algorithm/ }))
    expect(onChange).toHaveBeenCalledWith(['algorithm'])
  })

  it('clicking an active sub-type calls onChange with id removed', () => {
    const onChange = vi.fn()
    renderMenu('dev-tools', ['algorithm'], onChange)
    fireEvent.click(screen.getByRole('button', { name: /Algorithm/ }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('onMouseEnter and onMouseLeave fire on the panel element', () => {
    const onMouseEnter = vi.fn()
    const onMouseLeave = vi.fn()
    renderMenu('dev-tools', [], vi.fn(), onMouseEnter, onMouseLeave)
    const panel = document.querySelector('.btb-mega-panel')!
    fireEvent.mouseEnter(panel)
    expect(onMouseEnter).toHaveBeenCalledTimes(1)
    fireEvent.mouseLeave(panel)
    expect(onMouseLeave).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL (component doesn't exist yet)**

```bash
npx vitest run src/components/BucketMegaMenu.test.tsx --reporter=verbose 2>&1 | tail -10
```

Expected: `Cannot find module './BucketMegaMenu'` error or similar.

---

## Task 3: Implement `BucketMegaMenu.tsx`

**Files:**
- Create: `src/components/BucketMegaMenu.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/BucketMegaMenu.tsx`:

```tsx
import { REPO_BUCKETS } from '../constants/repoTypes'
import { BUCKET_ICONS, SUB_TYPE_ICONS } from '../constants/bucketIcons'

interface BucketMegaMenuProps {
  activeBucketId: string | null
  selected: string[]
  onChange: (selected: string[]) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export default function BucketMegaMenu({
  activeBucketId,
  selected,
  onChange,
  onMouseEnter,
  onMouseLeave,
}: BucketMegaMenuProps) {
  function toggle(subTypeId: string) {
    if (selected.includes(subTypeId)) {
      onChange(selected.filter(id => id !== subTypeId))
    } else {
      onChange([...selected, subTypeId])
    }
  }

  return (
    <div className="btb-mega-panel" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {REPO_BUCKETS.map(bucket => {
        const isActive = activeBucketId === bucket.id
        const BucketIcon = BUCKET_ICONS[bucket.id]
        return (
          <div
            key={bucket.id}
            className="btb-mega-col"
            style={isActive ? { borderLeftColor: bucket.color } : undefined}
          >
            <div
              className="btb-mega-col-header"
              style={{ color: isActive ? bucket.color : 'var(--t3)' }}
            >
              {BucketIcon && <BucketIcon size={13} />}
              {bucket.label}
            </div>
            {bucket.subTypes.map(sub => {
              const active = selected.includes(sub.id)
              const SubIcon = SUB_TYPE_ICONS[sub.id]
              return (
                <button
                  key={sub.id}
                  className={`btb-item${active ? ' active' : ''}`}
                  style={active ? { borderLeftColor: bucket.color, paddingLeft: '8px' } : undefined}
                  onClick={() => toggle(sub.id)}
                >
                  {SubIcon && <SubIcon size={10} style={{ color: bucket.color, flexShrink: 0 }} />}
                  {sub.label}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Run tests — expect all 8 to pass**

```bash
npx vitest run src/components/BucketMegaMenu.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: 8/8 PASS. If any fail, read the error and fix the component before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/components/BucketMegaMenu.tsx src/components/BucketMegaMenu.test.tsx
git commit -m "feat: add BucketMegaMenu unified full-width panel component"
```

---

## Task 4: Refactor `BucketTabBar.tsx` and update its tests

**Files:**
- Modify: `src/components/BucketTabBar.tsx`
- Modify: `src/components/BucketTabBar.test.tsx`

The panel and toggle logic leave `BucketTabBar` entirely. State lifts to the parent. Icons are added to tab buttons.

- [ ] **Step 1: Replace `BucketTabBar.tsx` entirely**

Overwrite `src/components/BucketTabBar.tsx` with:

```tsx
import { REPO_BUCKETS, type RepoBucket } from '../constants/repoTypes'
import { BUCKET_ICONS } from '../constants/bucketIcons'

interface BucketTabBarProps {
  selected: string[]
  openBucketId: string | null
  setOpenBucketId: (id: string | null) => void
  closeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
}

interface BucketTabProps {
  bucket: RepoBucket
  selected: string[]
  openBucketId: string | null
  setOpenBucketId: (id: string | null) => void
  closeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
}

function BucketTab({ bucket, selected, openBucketId, setOpenBucketId, closeTimerRef }: BucketTabProps) {
  const open = openBucketId === bucket.id
  const activeSubTypes = bucket.subTypes.filter(s => selected.includes(s.id))
  const isActive = activeSubTypes.length > 0

  function clearTimer() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function scheduleClose() {
    clearTimer()
    closeTimerRef.current = setTimeout(() => setOpenBucketId(null), 150)
  }

  const label = isActive ? `${bucket.label} · ${activeSubTypes.length}` : bucket.label
  const BucketIcon = BUCKET_ICONS[bucket.id]

  return (
    <div
      style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}
      onMouseEnter={() => { clearTimer(); setOpenBucketId(bucket.id) }}
      onMouseLeave={scheduleClose}
    >
      <button
        className={`btb-tab${isActive ? ' active' : ''}`}
        style={isActive || open ? { borderBottomColor: bucket.color, color: isActive ? 'var(--t1)' : 'var(--t2)' } : undefined}
      >
        {BucketIcon && <BucketIcon size={13} style={{ marginRight: 5, flexShrink: 0, color: isActive ? bucket.color : 'inherit' }} />}
        {label}
      </button>
    </div>
  )
}

export default function BucketTabBar({ selected, openBucketId, setOpenBucketId, closeTimerRef }: BucketTabBarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {REPO_BUCKETS.map(bucket => (
        <BucketTab
          key={bucket.id}
          bucket={bucket}
          selected={selected}
          openBucketId={openBucketId}
          setOpenBucketId={setOpenBucketId}
          closeTimerRef={closeTimerRef}
        />
      ))}
    </div>
  )
}
```

Key changes from the original:
- Removed `import { useState, useRef }` (no longer needed)
- Removed `onChange` everywhere (toggle moved to BucketMegaMenu)
- Removed the `{open && <div className="btb-panel">...</div>}` block from BucketTab
- Added `BUCKET_ICONS` import and icon rendering in the tab button
- `BucketTabBar` no longer declares `useState`/`useRef` — receives all as props

- [ ] **Step 2: Replace `BucketTabBar.test.tsx` entirely**

Overwrite `src/components/BucketTabBar.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import BucketTabBar from './BucketTabBar'
import { REPO_BUCKETS } from '../constants/repoTypes'

function renderBar(
  selected: string[] = [],
  openBucketId: string | null = null,
  setOpenBucketId = vi.fn(),
) {
  const closeTimerRef = { current: null } as React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  return render(
    <BucketTabBar
      selected={selected}
      openBucketId={openBucketId}
      setOpenBucketId={setOpenBucketId}
      closeTimerRef={closeTimerRef}
    />
  )
}

describe('BucketTabBar', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders 6 bucket tab buttons with correct labels', () => {
    renderBar()
    for (const bucket of REPO_BUCKETS) {
      expect(screen.getByRole('button', { name: new RegExp(bucket.label) })).toBeInTheDocument()
    }
    expect(REPO_BUCKETS).toHaveLength(6)
  })

  it('each tab button contains an SVG icon', () => {
    renderBar()
    const buttons = screen.getAllByRole('button')
    for (const btn of buttons) {
      expect(btn.querySelector('svg')).not.toBeNull()
    }
  })

  it('mouseenter on a tab wrapper calls setOpenBucketId with the bucket id', () => {
    const setOpenBucketId = vi.fn()
    renderBar([], null, setOpenBucketId)
    const wrapper = screen.getByRole('button', { name: /Dev Tools/ }).parentElement!
    fireEvent.mouseEnter(wrapper)
    expect(setOpenBucketId).toHaveBeenCalledWith('dev-tools')
  })

  it('mouseleave then 150ms — calls setOpenBucketId(null)', () => {
    const setOpenBucketId = vi.fn()
    renderBar([], 'dev-tools', setOpenBucketId)
    const wrapper = screen.getByRole('button', { name: /Dev Tools/ }).parentElement!
    fireEvent.mouseLeave(wrapper)
    act(() => vi.advanceTimersByTime(150))
    expect(setOpenBucketId).toHaveBeenCalledWith(null)
  })

  it('active tab label shows count when sub-types are selected', () => {
    renderBar(['algorithm', 'testing'], 'dev-tools')
    expect(screen.getByRole('button', { name: /Dev Tools · 2/ })).toBeInTheDocument()
  })

  it('mouseenter Tab B while Tab A is open — calls setOpenBucketId with B id', () => {
    const setOpenBucketId = vi.fn()
    renderBar([], 'dev-tools', setOpenBucketId)
    const aiMlWrapper = screen.getByRole('button', { name: /AI & ML/ }).parentElement!
    fireEvent.mouseEnter(aiMlWrapper)
    expect(setOpenBucketId).toHaveBeenCalledWith('ai-ml')
  })
})
```

- [ ] **Step 3: Run BucketTabBar tests**

```bash
npx vitest run src/components/BucketTabBar.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: 6/6 PASS. If any fail, fix `BucketTabBar.tsx` before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/components/BucketTabBar.tsx src/components/BucketTabBar.test.tsx
git commit -m "refactor: lift state from BucketTabBar and add bucket icons to tabs"
```

---

## Task 5: Update `globals.css`

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add `position: relative` to `.discover-filter-row`**

Find `.discover-filter-row` in `src/styles/globals.css` (around line 6351). The rule currently looks like:

```css
.discover-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
```

Add `position: relative;` as the first property inside the rule:

```css
.discover-filter-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
```

- [ ] **Step 2: Update `.btb-item` to use flex layout**

Find `.btb-item` in `src/styles/globals.css` (around line 6968). Change `display: block` to `display: flex` and add `align-items: center; gap: 6px`:

Before:
```css
.btb-item {
  display: block;
  width: 100%;
  ...
}
```

After:
```css
.btb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  ...
}
```

- [ ] **Step 3: Remove `.btb-panel` rule**

Find and delete the entire `.btb-panel` block (the panel is replaced by `.btb-mega-panel`). It looks like:

```css
.btb-panel {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 150;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-top: none;
  border-left: 2px solid;
  padding: 4px 0;
  min-width: 140px;
}
```

Delete that entire block.

- [ ] **Step 4: Append `.btb-mega-panel`, `.btb-mega-col`, `.btb-mega-col-header` at the end of the file**

At the very end of `src/styles/globals.css`, after the existing `.btb-item.active` block, append:

```css

/* ── BucketMegaMenu ──────────────────────────────────────────────── */
.btb-mega-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  display: flex;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-top: none;
  z-index: 150;
}

.btb-mega-col {
  flex: 1;
  border-right: 1px solid var(--border);
  border-left: 3px solid transparent;
  transition: border-left-color 0.12s;
  min-width: 0;
}
.btb-mega-col:last-child { border-right: none; }

.btb-mega-col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  transition: color 0.12s;
}
```

- [ ] **Step 5: Verify no `.btb-panel` remains and new classes exist**

```bash
grep -n "btb-panel\|btb-mega" src/styles/globals.css
```

Expected: only `btb-mega-panel`, `btb-mega-col`, `btb-mega-col-header` lines — no `btb-panel` lines.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add mega menu CSS classes and update filter row positioning"
```

---

## Task 6: Wire `Discover.tsx` and update `Discover.test.tsx`

**Files:**
- Modify: `src/views/Discover.tsx`
- Modify: `src/views/Discover.test.tsx`

- [ ] **Step 1: Read Discover.tsx lines 1–20 and 130–150 and 660–715**

You need to understand the current imports, state declarations, and filter row JSX before editing.

- [ ] **Step 2: Add BucketMegaMenu import to `Discover.tsx`**

On line 13, `BucketTabBar` is already imported. Add `BucketMegaMenu` import on line 14:

```ts
import BucketMegaMenu from '../components/BucketMegaMenu'
```

- [ ] **Step 3: Add lifted state and helpers after `selectedTypes` declaration**

Find line 136: `const [selectedTypes, setSelectedTypes] = useState<string[]>([])`

Immediately after that line, add:

```ts
const [openBucketId, setOpenBucketId] = useState<string | null>(null)
const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function clearBucketTimer() {
  if (closeTimerRef.current !== null) {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }
}
function scheduleBucketClose() {
  clearBucketTimer()
  closeTimerRef.current = setTimeout(() => setOpenBucketId(null), 150)
}
```

(`useRef` is already imported on line 1.)

- [ ] **Step 4: Update the filter row JSX**

Find the filter row (around line 664). The current code is:

```tsx
{/* Filter row — left: bucket tabs, right: filters */}
<div className="discover-filter-row">
  <BucketTabBar selected={selectedTypes} onChange={setSelectedTypes} />
  <div style={{ display: 'flex', alignItems: 'center' }}>
    ...existing right-side controls...
  </div>
</div>
```

Replace the `<BucketTabBar ... />` line only, and add `BucketMegaMenu` before the closing `</div>` of the filter row. The result:

```tsx
{/* Filter row — left: bucket tabs, right: filters */}
<div className="discover-filter-row">
  <BucketTabBar
    selected={selectedTypes}
    openBucketId={openBucketId}
    setOpenBucketId={setOpenBucketId}
    closeTimerRef={closeTimerRef}
  />
  <div style={{ display: 'flex', alignItems: 'center' }}>
    ...existing right-side controls unchanged...
  </div>
  {openBucketId !== null && (
    <BucketMegaMenu
      activeBucketId={openBucketId}
      selected={selectedTypes}
      onChange={setSelectedTypes}
      onMouseEnter={clearBucketTimer}
      onMouseLeave={scheduleBucketClose}
    />
  )}
</div>
```

**Do not change anything inside the right-side `<div>` (verification buttons, Filters dropdown, LayoutDropdown).**

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "Discover.tsx\|BucketTabBar\|BucketMegaMenu" | head -10
```

Expected: no output (no errors).

- [ ] **Step 6: Update `Discover.test.tsx` — BucketTabBar integration describe block**

Find the `BucketTabBar integration in Discover` describe block (currently around line 142). Replace it entirely with:

```tsx
describe('BucketTabBar integration in Discover', () => {
  beforeEach(() => {
    makeDiscoverApi()
  })

  it('renders all 6 bucket tab labels in the filter row', () => {
    renderDiscover()
    expect(screen.getByRole('button', { name: /Dev Tools/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI & ML/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Utilities/ })).toBeInTheDocument()
  })

  it('does not render the mega menu panel before hovering', () => {
    renderDiscover()
    expect(document.querySelector('.btb-mega-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Algorithm/ })).not.toBeInTheDocument()
  })

  it('hovering a bucket tab shows the mega menu with all 6 columns', () => {
    renderDiscover()
    const devToolsWrapper = screen.getByRole('button', { name: /Dev Tools/ }).parentElement!
    fireEvent.mouseEnter(devToolsWrapper)
    expect(document.querySelector('.btb-mega-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Algorithm/ })).toBeInTheDocument()
  })

  it('clicking a sub-type updates the tab label to show count', () => {
    renderDiscover()
    const devToolsWrapper = screen.getByRole('button', { name: /Dev Tools/ }).parentElement!
    fireEvent.mouseEnter(devToolsWrapper)
    fireEvent.click(screen.getByRole('button', { name: /Algorithm/ }))
    expect(screen.getByRole('button', { name: /Dev Tools · 1/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run the full test suite**

```bash
npm test 2>&1 | grep -E "(FAIL|PASS|Tests |Test Files)" | tail -10
```

Expected: `BucketMegaMenu.test.tsx` and `BucketTabBar.test.tsx` PASS. The 2 pre-existing failures (`Discover.test.tsx`, `LayoutDropdown.test.tsx`) remain. No new failures.

- [ ] **Step 8: Commit**

```bash
git add src/views/Discover.tsx src/views/Discover.test.tsx
git commit -m "feat: wire BucketMegaMenu into Discover filter row"
```

---

## Done

After Task 6, the mega menu is live. Run the full suite one final time:

```bash
npm test 2>&1 | grep -E "(Tests |Test Files)" | tail -3
```

Expected: 2 failing test files (pre-existing IntersectionObserver), all BucketMegaMenu and BucketTabBar tests passing.
