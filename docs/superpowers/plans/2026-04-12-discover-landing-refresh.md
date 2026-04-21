# Discover Landing Page Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Discover landing page with golden-ratio positioning, scaled-up search bar with icon, icons on view-mode pills, and a fade-cycling animated placeholder.

**Architecture:** All changes are contained in `DiscoverLanding.tsx` and `globals.css`. A new `useRotatingPlaceholder` hook manages the fade-cycling logic. The component gains a search icon SVG and imports `VIEW_MODE_ICONS`. No new dependencies.

**Tech Stack:** React, TypeScript, CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-12-discover-landing-refresh-design.md`

---

### Task 1: Golden Ratio Layout

**Files:**
- Modify: `src/styles/globals.css:8969-8978`

- [ ] **Step 1: Write the CSS change**

Replace the `.discover-landing` rule (lines 8969-8978):

```css
/* BEFORE: */
.discover-landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  padding: 0 20px;
}
```

With:

```css
/* AFTER: Remove justify-content: center, add flex spacers */
.discover-landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  padding: 0 20px;
}

.discover-landing::before {
  content: '';
  flex: 0.62;
}

.discover-landing::after {
  content: '';
  flex: 1;
}
```

**Important:** `justify-content: center` must be removed — it overrides the flex spacer technique.

- [ ] **Step 2: Verify visually**

Run: `npx vite dev` and navigate to Discover. The logo+search+pills cluster should sit in the upper third (~38% from top), not dead center.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: shift discover landing hero to golden ratio position"
```

---

### Task 2: Scale Up Search Bar with Icon

**Files:**
- Modify: `src/components/DiscoverLanding.tsx:36-44`
- Modify: `src/styles/globals.css:9002-9026`
- Modify: `src/components/DiscoverLanding.test.tsx`

- [ ] **Step 1: Update the test to expect the new structure**

In `src/components/DiscoverLanding.test.tsx`, the test at line 20 currently looks for `screen.getByPlaceholderText('Search repositories...')`. The placeholder attribute will remain on the input but the placeholder text won't be user-visible (the rotating overlay replaces it visually). For now, just verify the test still passes — no test changes needed for this task since the `placeholder` attribute stays on the `<input>`.

- [ ] **Step 2: Wrap the input in a search container and add the icon**

In `src/components/DiscoverLanding.tsx`, replace the `<input>` block (lines 36-44):

```tsx
<input
  ref={ref as RefObject<HTMLInputElement>}
  type="text"
  className="discover-landing-search"
  placeholder="Search repositories..."
  value={query}
  onChange={e => onQueryChange(e.target.value)}
  onKeyDown={handleKeyDown}
/>
```

With:

```tsx
<div className="discover-landing-search-wrap">
  <svg width="16" height="16" viewBox="0 0 13 13" fill="none" className="discover-landing-search-icon">
    <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
    <line x1="8.6" y1="8.6" x2="11.5" y2="11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
  <input
    ref={ref as RefObject<HTMLInputElement>}
    type="text"
    className="discover-landing-search"
    placeholder="Search repositories..."
    value={query}
    onChange={e => onQueryChange(e.target.value)}
    onKeyDown={handleKeyDown}
  />
</div>
```

- [ ] **Step 3: Update the CSS for the search bar**

In `src/styles/globals.css`, add the wrapper rule and update the search input rule.

Add before `.discover-landing-search`:

```css
.discover-landing-search-wrap {
  position: relative;
  width: 100%;
  max-width: 560px;
  margin-bottom: 28px;
}

.discover-landing-search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.40);
  pointer-events: none;
}
```

Update `.discover-landing-search` (line 9002):

```css
.discover-landing-search {
  width: 100%;
  background: rgba(255, 255, 255, 0.10);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 16px;
  padding: 16px 22px 16px 44px;
  font-size: 15px;
  color: #ffffff;
  outline: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
```

Remove `max-width` and `margin-bottom` from `.discover-landing-search` (now on the wrapper).

- [ ] **Step 4: Run the existing tests**

Run: `npx vitest run src/components/DiscoverLanding.test.tsx`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverLanding.tsx src/styles/globals.css
git commit -m "style: scale up discover search bar with icon"
```

---

### Task 3: Add Icons to View Mode Pills

**Files:**
- Modify: `src/components/DiscoverLanding.tsx:2,46-53`
- Modify: `src/styles/globals.css:9035-9046`

- [ ] **Step 1: Import VIEW_MODE_ICONS**

In `src/components/DiscoverLanding.tsx`, add this import at the top:

```tsx
import { VIEW_MODE_ICONS } from './ViewModeIcons'
```

- [ ] **Step 2: Render icons inside each pill**

Replace the pills mapping (lines 47-53):

```tsx
{VIEW_MODES.map(vm => (
  <button
    key={vm.key}
    className="discover-landing-pill"
    onClick={() => onSelectMode(vm.key)}
  >
    {vm.label}
  </button>
))}
```

With:

```tsx
{VIEW_MODES.map(vm => {
  const Icon = VIEW_MODE_ICONS[vm.key]
  return (
    <button
      key={vm.key}
      className="discover-landing-pill"
      onClick={() => onSelectMode(vm.key)}
    >
      <Icon size={14} />
      {vm.label}
    </button>
  )
})}
```

- [ ] **Step 3: Update pill CSS for flex layout**

In `src/styles/globals.css`, update `.discover-landing-pill` (line 9035) — add these properties:

```css
display: flex;
align-items: center;
gap: 6px;
```

- [ ] **Step 4: Run the existing tests**

Run: `npx vitest run src/components/DiscoverLanding.test.tsx`
Expected: All 5 tests pass. The pill text ("Recommended", etc.) is still in the DOM, just now preceded by an SVG.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverLanding.tsx src/styles/globals.css
git commit -m "feat: add icons to discover landing view mode pills"
```

---

### Task 4: Fade-Cycling Rotating Placeholder

**Files:**
- Create: `src/hooks/useRotatingPlaceholder.ts`
- Modify: `src/components/DiscoverLanding.tsx`
- Modify: `src/styles/globals.css`
- Create: `src/hooks/useRotatingPlaceholder.test.ts`

- [ ] **Step 1: Write the test for useRotatingPlaceholder**

Create `src/hooks/useRotatingPlaceholder.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRotatingPlaceholder } from './useRotatingPlaceholder'

describe('useRotatingPlaceholder', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns the first suggestion initially', () => {
    const { result } = renderHook(() => useRotatingPlaceholder(false, false))
    expect(result.current.text).toBeTruthy()
    expect(result.current.visible).toBe(true)
  })

  it('cycles to next suggestion after interval', () => {
    const { result } = renderHook(() => useRotatingPlaceholder(false, false))
    const first = result.current.text
    act(() => { vi.advanceTimersByTime(3500) })
    // During fade-out, visible should be false
    expect(result.current.visible).toBe(false)
    act(() => { vi.advanceTimersByTime(400) })
    // After fade completes, text changes and visible is true
    expect(result.current.visible).toBe(true)
    expect(result.current.text).not.toBe(first)
  })

  it('stops cycling when focused', () => {
    const { result, rerender } = renderHook(
      ({ focused }) => useRotatingPlaceholder(focused, false),
      { initialProps: { focused: false } }
    )
    const initial = result.current.text
    rerender({ focused: true })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(result.current.text).toBe(initial)
  })

  it('stops cycling when input has value', () => {
    const { result, rerender } = renderHook(
      ({ hasValue }) => useRotatingPlaceholder(false, hasValue),
      { initialProps: { hasValue: false } }
    )
    const initial = result.current.text
    rerender({ hasValue: true })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(result.current.text).toBe(initial)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useRotatingPlaceholder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement useRotatingPlaceholder**

Create `src/hooks/useRotatingPlaceholder.ts`:

```ts
import { useState, useEffect, useRef } from 'react'

const SUGGESTIONS = [
  'React frameworks',
  'machine learning tools',
  'CLI utilities',
  'Find a fast build tool',
  'neovim plugins',
  'state management',
  'computer vision projects',
  'kubernetes tools',
  'Show me rising AI projects',
  'static site generators',
  'database clients',
  'awesome lists',
]

const CYCLE_MS = 3500
const FADE_MS = 400

export function useRotatingPlaceholder(focused: boolean, hasValue: boolean) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (focused || hasValue) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      return
    }

    timerRef.current = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(prev => (prev + 1) % SUGGESTIONS.length)
        setVisible(true)
      }, FADE_MS)
    }, CYCLE_MS)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [focused, hasValue])

  return { text: SUGGESTIONS[index], visible }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useRotatingPlaceholder.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRotatingPlaceholder.ts src/hooks/useRotatingPlaceholder.test.ts
git commit -m "feat: add useRotatingPlaceholder hook with tests"
```

---

### Task 5: Wire Up Rotating Placeholder in DiscoverLanding

**Files:**
- Modify: `src/components/DiscoverLanding.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/components/DiscoverLanding.test.tsx`

- [ ] **Step 1: Update the test to account for the rotating placeholder overlay**

In `src/components/DiscoverLanding.test.tsx`, add a new test:

```tsx
it('shows rotating placeholder text when input is empty', () => {
  render(<DiscoverLanding query="" onQueryChange={onQueryChange} onSearch={onSearch} onSelectMode={onSelectMode} />)
  const overlay = document.querySelector('.discover-landing-placeholder')
  expect(overlay).toBeInTheDocument()
  expect(overlay?.textContent).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DiscoverLanding.test.tsx`
Expected: FAIL — `.discover-landing-placeholder` not found.

- [ ] **Step 3: Add rotating placeholder to DiscoverLanding**

In `src/components/DiscoverLanding.tsx`:

Add imports:

```tsx
import { useRotatingPlaceholder } from '../hooks/useRotatingPlaceholder'
```

Add state for focus tracking inside the component (after the `ref` line):

```tsx
const [focused, setFocused] = useState(false)
const placeholder = useRotatingPlaceholder(focused, query.length > 0)
```

Update the React import at line 1 from:

```tsx
import { useEffect, useRef, type RefObject } from 'react'
```

To:

```tsx
import { useState, useRef, type RefObject } from 'react'
```

(`useEffect` is no longer needed after removing auto-focus; `useState` is needed for focus tracking.)

Remove the auto-focus `useEffect` (lines 18-20):

```tsx
// DELETE THIS:
useEffect(() => {
  (ref as RefObject<HTMLInputElement>).current?.focus()
}, [])  // eslint-disable-line react-hooks/exhaustive-deps
```

Add `onFocus` and `onBlur` handlers to the `<input>`:

```tsx
<input
  ref={ref as RefObject<HTMLInputElement>}
  type="text"
  className="discover-landing-search"
  placeholder="Search repositories..."
  value={query}
  onChange={e => onQueryChange(e.target.value)}
  onKeyDown={handleKeyDown}
  onFocus={() => setFocused(true)}
  onBlur={() => setFocused(false)}
/>
```

Add the placeholder overlay span inside `.discover-landing-search-wrap`, after the `<input>`:

```tsx
{!query && !focused && (
  <span
    className="discover-landing-placeholder"
    style={{ opacity: placeholder.visible ? 1 : 0 }}
  >
    {placeholder.text}
  </span>
)}
```

- [ ] **Step 4: Add CSS for the placeholder overlay**

In `src/styles/globals.css`, add after the `.discover-landing-search::placeholder` rule:

```css
.discover-landing-placeholder {
  position: absolute;
  left: 44px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.40);
  font-size: 15px;
  pointer-events: none;
  transition: opacity 0.4s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 66px);
}
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run src/components/DiscoverLanding.test.tsx src/hooks/useRotatingPlaceholder.test.ts`
Expected: All 6 tests pass (5 existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add src/components/DiscoverLanding.tsx src/components/DiscoverLanding.test.tsx src/styles/globals.css
git commit -m "feat: wire up fade-cycling placeholder in discover landing"
```

---

### Task 6: Final Integration Test

- [ ] **Step 1: Run all project tests**

Run: `npx vitest run`
Expected: All tests pass with no regressions.

- [ ] **Step 2: Commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: address test regressions from landing refresh"
```

(Skip if no changes needed.)
