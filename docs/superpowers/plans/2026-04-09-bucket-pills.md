# Bucket Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign BucketNav from hover-triggered tabs with overlay dropdown into click-triggered glass pills with inline push-down subtype rows.

**Architecture:** Rewrite BucketNav component (pills + click accordion), replace all old CSS with new pill styles, delete vestigial BucketTabBar and BucketMegaMenu components, gut `.discover-filter-row` container styling.

**Tech Stack:** React (TypeScript), vanilla CSS, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-04-09-bucket-pills-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/styles/globals.css` | Modify | Remove old bnav/btb CSS (~230 lines), add new pill CSS, gut `.discover-filter-row` |
| `src/components/BucketNav.tsx` | Rewrite | Glass pills + click accordion + inline subtype row |
| `src/components/BucketNav.test.tsx` | Rewrite | Test click-to-expand, accordion, selection, pill classes |
| `src/components/BucketTabBar.tsx` | Delete | Vestigial — no non-test consumer |
| `src/components/BucketTabBar.test.tsx` | Delete | |
| `src/components/BucketMegaMenu.tsx` | Delete | Replaced by inline subtype pills |
| `src/components/BucketMegaMenu.test.tsx` | Delete | |

---

### Task 1: Delete vestigial components and old CSS

**Files:**
- Delete: `src/components/BucketTabBar.tsx`
- Delete: `src/components/BucketTabBar.test.tsx`
- Delete: `src/components/BucketMegaMenu.tsx`
- Delete: `src/components/BucketMegaMenu.test.tsx`
- Modify: `src/styles/globals.css:8005-8233` (remove old btb + bnav styles)

- [ ] **Step 1: Delete BucketTabBar and BucketMegaMenu files**

```bash
rm src/components/BucketTabBar.tsx src/components/BucketTabBar.test.tsx
rm src/components/BucketMegaMenu.tsx src/components/BucketMegaMenu.test.tsx
```

- [ ] **Step 2: Remove old btb CSS (lines 8005-8093)**

In `src/styles/globals.css`, delete the entire block from `.btb-tab {` through `.btb-items-grid { ... }` (the section ending just before the `/* ── BucketNav ──` comment). This includes:
- `.btb-tab`, `.btb-tab.active`
- `.btb-item`, `.btb-item:hover`, `.btb-item.active`
- `.btb-mega-panel`, `.btb-mega-col`, `.btb-mega-col:last-child`
- `.btb-mega-col-header`, `.btb-items-grid`

- [ ] **Step 3: Remove old bnav CSS (lines 8095-8233)**

In `src/styles/globals.css`, delete the entire block from the `/* ── BucketNav ──` comment through `.bnav-col-more:hover { ... }`. This includes:
- `.bnav-tabs`, `.bnav-tab`, `.bnav-tab:hover`, `.bnav-tab.active`
- `.bnav-tab--all`, `.bnav-tab--all.open`, `.bnav-tab--all.has-selection`
- `.bnav-tab-count`, `.bnav-tab-divider`
- `.bnav-panel`, `.bnav-panel--all`, `.bnav-panel--bucket`
- `.bnav-col`, `.bnav-col:last-child`, `.bnav-item`, `.bnav-item:hover`, `.bnav-item.active`
- `.bnav-col-more`, `.bnav-col-more:hover`

- [ ] **Step 4: Gut `.discover-filter-row` styling (line ~7296)**

In the `.discover-filter-row` rule, remove `background`, `backdrop-filter`, `-webkit-backdrop-filter`, and `border-bottom`. Keep the layout properties. The result should be:

```css
.discover-filter-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Verify no import errors**

Run: `npx vitest run --reporter=verbose 2>&1 | head -30`

Expected: BucketNav tests will fail (component references removed classes). BucketTabBar and BucketMegaMenu tests should be gone. No import errors from Discover.tsx (it doesn't import the deleted components).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove old bucket tab/mega-menu components and CSS"
```

---

### Task 2: Add new pill CSS

**Files:**
- Modify: `src/styles/globals.css` (add new styles where old bnav block was removed)

- [ ] **Step 1: Add pill styles to globals.css**

Insert the following CSS at the location where the old bnav styles were (after the context menu section, or wherever the deletion left a gap):

```css
/* ── Bucket pills ── */
.bnav-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bnav-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--t2);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.bnav-pill:hover {
  background: rgba(255, 255, 255, 0.10);
  color: var(--t1);
}

.bnav-pill.active {
  background: rgba(109, 40, 217, 0.18);
  border-color: rgba(109, 40, 217, 0.35);
  color: var(--accent-text);
  font-weight: 600;
}

.bnav-pill.expanded {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
  color: var(--t1);
}

.bnav-pill.active.expanded {
  background: rgba(109, 40, 217, 0.25);
  border-color: rgba(109, 40, 217, 0.45);
  color: var(--accent-text);
}

/* ── Subtype pills row ── */
.bnav-subtypes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 20px 12px;
}

.bnav-subpill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--t2);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.bnav-subpill:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--t1);
}

.bnav-subpill.active {
  background: rgba(109, 40, 217, 0.15);
  border-color: rgba(109, 40, 217, 0.30);
  color: var(--accent-text);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add glass pill CSS for bucket navigation"
```

---

### Task 3: Write BucketNav tests

**Files:**
- Rewrite: `src/components/BucketNav.test.tsx`

- [ ] **Step 1: Write the new test file**

Replace the entire contents of `src/components/BucketNav.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BucketNav from './BucketNav'
import { REPO_BUCKETS } from '../constants/repoTypes'

function renderNav(selected: string[] = [], onChange = vi.fn()) {
  return { ...render(<BucketNav selected={selected} onChange={onChange} />), onChange }
}

describe('BucketNav — pill row', () => {
  it('renders an "All" pill as the first button', () => {
    renderNav()
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveTextContent('All')
  })

  it('renders a pill for every bucket', () => {
    renderNav()
    for (const bucket of REPO_BUCKETS) {
      expect(screen.getByRole('button', { name: new RegExp(bucket.label) })).toBeInTheDocument()
    }
  })

  it('bucket pill has .active class when it has selected subtypes', () => {
    renderNav(['book'])
    const learningBucket = REPO_BUCKETS.find(b => b.subTypes.some(s => s.id === 'book'))!
    const pill = screen.getByRole('button', { name: new RegExp(learningBucket.label) })
    expect(pill).toHaveClass('active')
  })

  it('bucket pill without selections does not have .active class', () => {
    renderNav(['book'])
    const frameworksPill = screen.getByRole('button', { name: /^Frameworks/ })
    expect(frameworksPill).not.toHaveClass('active')
  })
})

describe('BucketNav — click accordion', () => {
  it('no subtypes visible on initial render', () => {
    renderNav()
    expect(document.querySelector('.bnav-subtypes')).toBeNull()
  })

  it('clicking a bucket pill expands its subtypes', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: /Dev Tools/ }))
    expect(document.querySelector('.bnav-subtypes')).toBeInTheDocument()
    const devToolsBucket = REPO_BUCKETS.find(b => b.label === 'Dev Tools')!
    for (const sub of devToolsBucket.subTypes) {
      expect(screen.getByRole('button', { name: new RegExp(sub.label) })).toBeInTheDocument()
    }
  })

  it('expanded bucket pill has .expanded class', () => {
    renderNav()
    const pill = screen.getByRole('button', { name: /Dev Tools/ })
    fireEvent.click(pill)
    expect(pill).toHaveClass('expanded')
  })

  it('clicking the same bucket pill again collapses subtypes', () => {
    renderNav()
    const pill = screen.getByRole('button', { name: /Dev Tools/ })
    fireEvent.click(pill)
    expect(document.querySelector('.bnav-subtypes')).toBeInTheDocument()
    fireEvent.click(pill)
    expect(document.querySelector('.bnav-subtypes')).toBeNull()
  })

  it('clicking a different bucket collapses the previous and expands the new (accordion)', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: /Dev Tools/ }))
    const devToolsBucket = REPO_BUCKETS.find(b => b.label === 'Dev Tools')!
    expect(screen.getByRole('button', { name: new RegExp(devToolsBucket.subTypes[0].label) })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Learning/ }))
    const learningBucket = REPO_BUCKETS.find(b => b.label === 'Learning')!
    expect(screen.getByRole('button', { name: new RegExp(learningBucket.subTypes[0].label) })).toBeInTheDocument()
    // Old bucket's subtypes gone (unless they happen to share a label with Learning)
    expect(document.querySelectorAll('.bnav-subtypes')).toHaveLength(1)
  })

  it('clicking "All" collapses any open bucket', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: /Dev Tools/ }))
    expect(document.querySelector('.bnav-subtypes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^All$/ }))
    expect(document.querySelector('.bnav-subtypes')).toBeNull()
  })
})

describe('BucketNav — subtype selection', () => {
  it('clicking a subtype pill calls onChange with that sub-type added', () => {
    const { onChange } = renderNav()
    fireEvent.click(screen.getByRole('button', { name: /Learning/ }))
    fireEvent.click(screen.getByRole('button', { name: /Book/ }))
    expect(onChange).toHaveBeenCalledWith(['book'])
  })

  it('clicking an active subtype pill removes it from selection', () => {
    const { onChange } = renderNav(['book'])
    fireEvent.click(screen.getByRole('button', { name: /Learning/ }))
    fireEvent.click(screen.getByRole('button', { name: /Book/ }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('active subtype pill has .active class', () => {
    renderNav(['book'])
    fireEvent.click(screen.getByRole('button', { name: /Learning/ }))
    const bookPill = screen.getByRole('button', { name: /Book/ })
    expect(bookPill).toHaveClass('active')
  })

  it('can select across different buckets', () => {
    const { onChange } = renderNav(['book'])
    fireEvent.click(screen.getByRole('button', { name: /Dev Tools/ }))
    fireEvent.click(screen.getByRole('button', { name: /Algorithm/ }))
    expect(onChange).toHaveBeenCalledWith(['book', 'algorithm'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/BucketNav.test.tsx --reporter=verbose 2>&1 | tail -30`

Expected: All tests FAIL because BucketNav still has the old hover/tab structure (or was broken by CSS removal). This confirms the tests are testing the new behavior.

- [ ] **Step 3: Commit**

```bash
git add src/components/BucketNav.test.tsx
git commit -m "test: add BucketNav pill/accordion tests (red)"
```

---

### Task 4: Rewrite BucketNav component

**Files:**
- Rewrite: `src/components/BucketNav.tsx`

- [ ] **Step 1: Replace BucketNav with pill implementation**

Replace the entire contents of `src/components/BucketNav.tsx` with:

```tsx
import { useState } from 'react'
import { REPO_BUCKETS } from '../constants/repoTypes'
import { BUCKET_ICONS, SUB_TYPE_ICONS } from '../constants/bucketIcons'

interface BucketNavProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function BucketNav({ selected, onChange }: BucketNavProps) {
  const [expandedBucketId, setExpandedBucketId] = useState<string | null>(null)

  function toggle(subTypeId: string) {
    if (selected.includes(subTypeId)) {
      onChange(selected.filter(id => id !== subTypeId))
    } else {
      onChange([...selected, subTypeId])
    }
  }

  function handleBucketClick(bucketId: string) {
    setExpandedBucketId(prev => prev === bucketId ? null : bucketId)
  }

  const expandedBucket = expandedBucketId
    ? REPO_BUCKETS.find(b => b.id === expandedBucketId) ?? null
    : null

  return (
    <>
      <div className="bnav-pills">
        <button
          className="bnav-pill"
          onClick={() => setExpandedBucketId(null)}
        >
          All
        </button>

        {REPO_BUCKETS.map(bucket => {
          const activeInBucket = bucket.subTypes.filter(s => selected.includes(s.id))
          const isActive = activeInBucket.length > 0
          const isExpanded = expandedBucketId === bucket.id
          const BucketIcon = BUCKET_ICONS[bucket.id]

          return (
            <button
              key={bucket.id}
              className={`bnav-pill${isActive ? ' active' : ''}${isExpanded ? ' expanded' : ''}`}
              onClick={() => handleBucketClick(bucket.id)}
            >
              {BucketIcon && <BucketIcon size={13} style={{ flexShrink: 0 }} />}
              {bucket.label}
              {isActive && (
                <span style={{ fontSize: 10, opacity: 0.7 }}>{activeInBucket.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {expandedBucket && (
        <div className="bnav-subtypes">
          {expandedBucket.subTypes.map(sub => {
            const active = selected.includes(sub.id)
            const SubIcon = SUB_TYPE_ICONS[sub.id]
            return (
              <button
                key={sub.id}
                className={`bnav-subpill${active ? ' active' : ''}`}
                onClick={() => toggle(sub.id)}
              >
                {SubIcon && <SubIcon size={10} style={{ flexShrink: 0 }} />}
                {sub.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/components/BucketNav.test.tsx --reporter=verbose 2>&1 | tail -30`

Expected: All tests PASS.

- [ ] **Step 3: Run the full test suite to check for regressions**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -40`

Expected: All tests pass. The Discover integration tests may need attention — check if any reference old BucketNav classes like `.bnav-panel`.

- [ ] **Step 4: Commit**

```bash
git add src/components/BucketNav.tsx
git commit -m "feat: rewrite BucketNav as glass pills with click accordion"
```

---

### Task 5: Fix Discover integration tests (if needed)

**Files:**
- Modify: `src/views/Discover.test.tsx` (only if tests reference old BucketNav selectors)

- [ ] **Step 1: Check for failing Discover tests**

Run: `npx vitest run src/views/Discover.test.tsx --reporter=verbose 2>&1 | tail -40`

If all pass, skip to Step 3.

- [ ] **Step 2: Fix any references to old selectors**

Search for `.bnav-panel`, `.bnav-tab`, `mouseEnter`, `mouseLeave` in `src/views/Discover.test.tsx`. Update any tests that rely on old hover behavior or old class names to use the new click + pill pattern:
- Replace `fireEvent.mouseEnter` with `fireEvent.click`
- Replace `.bnav-panel` with `.bnav-subtypes`
- Replace `.bnav-item` with `.bnav-subpill`
- Replace `.bnav-tab` with `.bnav-pill`

- [ ] **Step 3: Verify all tests pass**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -40`

Expected: All tests pass.

- [ ] **Step 4: Commit (if changes were made)**

```bash
git add src/views/Discover.test.tsx
git commit -m "test: update Discover tests for new BucketNav pill structure"
```

---

### Task 6: Visual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or the project's equivalent start command)

- [ ] **Step 2: Verify in-app behavior**

Open the app and check:
1. Bucket pills render as rounded glass pills on the page background
2. No container bar visible — pills float directly on `--bg`
3. Clicking a bucket pill expands subtype pills below, pushing cards down
4. Clicking the same bucket collapses subtypes
5. Clicking a different bucket switches (accordion)
6. Clicking "All" collapses any open bucket
7. Subtype pills toggle selection on click
8. Active bucket pills show accent (violet) styling
9. Active subtype pills show accent styling
10. Selected count badge appears on active bucket pills
11. VerificationToggles, DiscoverFilters, and LayoutDropdown still appear and function

- [ ] **Step 3: Commit any visual tweaks if needed**

```bash
git add -A
git commit -m "fix: visual adjustments after bucket pills integration"
```
