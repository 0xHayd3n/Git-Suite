# Type Filter Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal type filter chip row on the Discover page with a "Type ▾" dropdown trigger that sits inline with the sort tabs and preserves multi-select behavior.

**Architecture:** Extract a self-contained `TypeDropdown` component that owns its open/closed state internally, accepts `activeTypes` and `onToggle` from `Discover.tsx`, and renders a `.view-tab`-styled trigger + absolutely-positioned panel. `Discover.tsx` removes Zone B, extracts the inline toggle callback to a named function, and renders `<TypeDropdown>` between Zone A and Zone C.

**Tech Stack:** React 18, TypeScript, Vitest + React Testing Library, plain CSS in `globals.css`

**Spec:** `docs/superpowers/specs/2026-04-01-type-dropdown-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/TypeDropdown.tsx` | New self-contained dropdown component |
| Create | `src/components/TypeDropdown.test.tsx` | Unit tests for TypeDropdown |
| Modify | `src/views/Discover.tsx` | Extract toggle fn, remove Zone B, add `<TypeDropdown>` |
| Modify | `src/styles/globals.css` | Add `.type-dropdown-panel`/`.type-dropdown-item`, remove `.discover-type-tabs`/`.type-tab` |

---

## Task 1: Create TypeDropdown component (TDD)

**Files:**
- Create: `src/components/TypeDropdown.tsx`
- Create: `src/components/TypeDropdown.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/TypeDropdown.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TypeDropdown from './TypeDropdown'
import type { RepoType } from '../lib/classifyRepoType'

function renderDropdown(activeTypes: Set<RepoType> = new Set(), onToggle = vi.fn()) {
  return render(<TypeDropdown activeTypes={activeTypes} onToggle={onToggle} />)
}

describe('TypeDropdown', () => {
  it('renders a trigger button with label "Type"', () => {
    renderDropdown()
    expect(screen.getByRole('button', { name: /type/i })).toBeInTheDocument()
  })

  it('does not show panel by default', () => {
    renderDropdown()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens the panel when trigger is clicked', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('renders all 6 type options in the panel', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByText('Awesome List')).toBeInTheDocument()
    expect(screen.getByText('Learning')).toBeInTheDocument()
    expect(screen.getByText('Framework')).toBeInTheDocument()
    expect(screen.getByText('Tool')).toBeInTheDocument()
    expect(screen.getByText('Application')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('calls onToggle with the correct type when a row is clicked', () => {
    const onToggle = vi.fn()
    renderDropdown(new Set(), onToggle)
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    fireEvent.click(screen.getByText('Learning'))
    expect(onToggle).toHaveBeenCalledWith('learning')
  })

  it('shows a checkmark next to active types', () => {
    renderDropdown(new Set<RepoType>(['learning']))
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    const learningRow = screen.getByText('Learning').closest('[data-type]')!
    expect(learningRow).toHaveAttribute('data-active', 'true')
  })

  it('shows a count badge when types are selected', () => {
    renderDropdown(new Set<RepoType>(['learning', 'tool']))
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows no badge when no types are selected', () => {
    renderDropdown(new Set())
    // badge should not be present; the trigger text is just "Type"
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('closes the panel when Escape is pressed', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes the panel when clicking outside the component', () => {
    const { container } = renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    // Fire mousedown on the document body (outside the component)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:/Coding/Git-Suite" && npm test -- --reporter=verbose src/components/TypeDropdown.test.tsx 2>&1 | head -40
```

Expected: FAIL — `Cannot find module './TypeDropdown'`

- [ ] **Step 3: Create the TypeDropdown component**

Create `src/components/TypeDropdown.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react'
import { LuChevronDown, LuCheck } from 'react-icons/lu'
import { type RepoType } from '../lib/classifyRepoType'
import { REPO_TYPE_CONFIG } from '../config/repoTypeConfig'

interface TypeDropdownProps {
  activeTypes: Set<RepoType>
  onToggle: (type: RepoType) => void
}

const TYPES = Object.keys(REPO_TYPE_CONFIG) as RepoType[]

export default function TypeDropdown({ activeTypes, onToggle }: TypeDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const count = activeTypes.size

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className={`view-tab${count > 0 ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={count > 0 ? `Type (${count} selected)` : 'Type'}
      >
        Type
        {count > 0 && <span className="filter-badge">{count}</span>}
        <LuChevronDown size={10} style={{ marginLeft: 3 }} />
      </button>

      {open && (
        // Note: uses document mousedown (not a backdrop onClick) intentionally —
        // spec requires no backdrop overlay. This differs from FilterDropdown which uses a backdrop div.
        <ul className="type-dropdown-panel" role="listbox" aria-multiselectable="true">
          {TYPES.map(type => {
            const cfg = REPO_TYPE_CONFIG[type]
            const isActive = activeTypes.has(type)
            return (
              <li
                key={type}
                className={`type-dropdown-item${isActive ? ' active' : ''}`}
                data-type={type}
                data-active={isActive}
                onClick={() => onToggle(type)}
                role="option"
                aria-selected={isActive}
              >
                <span className="type-dropdown-item-left">
                  {cfg.icon && <cfg.icon size={12} color={cfg.accentColor} />}
                  {cfg.label}
                </span>
                {isActive && <LuCheck size={12} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:/Coding/Git-Suite" && npm test -- --reporter=verbose src/components/TypeDropdown.test.tsx 2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/components/TypeDropdown.tsx src/components/TypeDropdown.test.tsx && git commit -m "feat: add TypeDropdown component with tests"
```

---

## Task 2: Add CSS for TypeDropdown

**Files:**
- Modify: `src/styles/globals.css` (after line 5665 — end of `.type-tab.active` block)

- [ ] **Step 1: Add the new CSS classes**

In `globals.css`, replace the Zone B block (lines 5639–5665):

```css
/* Zone B: type filter tabs */
.discover-type-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.type-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: none;
  color: var(--t2);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.type-tab:hover { background: var(--bg3); color: var(--t1); }
.type-tab.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
```

…with the new TypeDropdown panel CSS:

```css
/* TypeDropdown panel */
.type-dropdown-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  padding: 4px 0;
  margin: 0;
  list-style: none;
  min-width: 150px;
}

.type-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--t2);
  cursor: pointer;
  user-select: none;
  transition: background 0.1s, color 0.1s;
}
.type-dropdown-item:hover { background: var(--bg3); color: var(--t1); }
.type-dropdown-item.active { color: var(--t1); }
.type-dropdown-item-left {
  display: flex;
  align-items: center;
  gap: 7px;
}
```

- [ ] **Step 2: Verify app still compiles**

```bash
cd "D:/Coding/Git-Suite" && npm run build 2>&1 | tail -10
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/styles/globals.css && git commit -m "style: replace type-tab chips CSS with TypeDropdown panel CSS"
```

---

## Task 3: Wire TypeDropdown into Discover.tsx

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Write the failing integration test**

Add to `src/views/Discover.test.tsx` (append after the last `describe` block):

```tsx
describe('TypeDropdown integration in Discover', () => {
  beforeEach(() => {
    makeDiscoverApi()
  })

  it('renders a "Type" button in the view row', () => {
    renderDiscover()
    expect(screen.getByRole('button', { name: /type/i })).toBeInTheDocument()
  })

  it('does not render the old type chip row', () => {
    renderDiscover()
    // The old zone had a button with text "Awesome List" directly in the row
    // It should not exist unless the panel is open
    expect(screen.queryByText('Awesome List')).not.toBeInTheDocument()
  })

  it('opens the type dropdown and shows all options', () => {
    renderDiscover()
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByText('Awesome List')).toBeInTheDocument()
    expect(screen.getByText('Learning')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "D:/Coding/Git-Suite" && npm test -- --reporter=verbose src/views/Discover.test.tsx 2>&1 | tail -20
```

Expected: FAIL — "Type" button not found / "Awesome List" found when it should not be.

- [ ] **Step 3: Update Discover.tsx**

Make three changes:

**3a. Add import** — add `TypeDropdown` import at the top with other component imports:

```tsx
import TypeDropdown from '../components/TypeDropdown'
```

**3b. Extract the toggle callback** — add a named function after the `repoTypes` state declaration (around line 106):

```tsx
const handleTypeToggle = (type: RepoType) => {
  setActiveTypes(prev => {
    const next = new Set(prev)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    return next
  })
}
```

**3c. Replace Zone B with TypeDropdown** — in the JSX, replace the entire Zone B block:

Old (lines 493–516):
```tsx
{/* Zone B: Type filter tabs */}
<div className="discover-type-tabs">
  {(Object.keys(REPO_TYPE_CONFIG) as RepoType[]).map(type => {
    const cfg = REPO_TYPE_CONFIG[type]
    const isActive = activeTypes.has(type)
    return (
      <button
        key={type}
        className={`type-tab${isActive ? ' active' : ''}`}
        onClick={() => {
          setActiveTypes(prev => {
            const next = new Set(prev)
            if (next.has(type)) next.delete(type)
            else next.add(type)
            return next
          })
        }}
      >
        {cfg.icon && <cfg.icon size={10} />}
        {cfg.label}
      </button>
    )
  })}
</div>
```

New:
```tsx
{/* Zone B: Type filter dropdown */}
<TypeDropdown activeTypes={activeTypes} onToggle={handleTypeToggle} />
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd "D:/Coding/Git-Suite" && npm test 2>&1 | tail -20
```

Expected: All tests PASS (including the new Discover integration tests)

- [ ] **Step 5: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/views/Discover.tsx src/views/Discover.test.tsx && git commit -m "feat: replace type chip row with TypeDropdown in Discover"
```

---

## Task 4: Clean up — remove unused import from Discover.tsx

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Remove the now-unused REPO_TYPE_CONFIG import**

`REPO_TYPE_CONFIG` was only used in Zone B, which was removed in Task 3. Remove this import line from `Discover.tsx`:

```tsx
import { REPO_TYPE_CONFIG } from '../config/repoTypeConfig'
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd "D:/Coding/Git-Suite" && npm run build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 3: Run full test suite one final time**

```bash
cd "D:/Coding/Git-Suite" && npm test 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 4: Final commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/views/Discover.tsx && git commit -m "chore: remove unused REPO_TYPE_CONFIG import from Discover"
```
