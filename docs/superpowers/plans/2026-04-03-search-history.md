# Search History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent search history to the Discover search bar, showing recent queries when the input is focused and empty.

**Architecture:** A `useSearchHistory` hook wraps `useLocalStorage<string[]>` to manage a capped, deduplicated list of recent searches. The Discover view conditionally renders either the history dropdown or the existing topic suggestions dropdown based on whether the input is empty. Four new CSS classes style the history UI.

**Tech Stack:** React, TypeScript, Vitest, localStorage

**Spec:** `docs/superpowers/specs/2026-04-03-search-history-design.md`

---

### Task 1: `useSearchHistory` Hook — Tests

**Files:**
- Create: `src/hooks/useSearchHistory.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchHistory } from './useSearchHistory'

const STORAGE_KEY = 'discover-search-history'

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with empty entries when no localStorage data', () => {
    const { result } = renderHook(() => useSearchHistory())
    expect(result.current.entries).toEqual([])
  })

  it('initializes from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['react', 'vue']))
    const { result } = renderHook(() => useSearchHistory())
    expect(result.current.entries).toEqual(['react', 'vue'])
  })

  it('add() puts entry at front of list', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    expect(result.current.entries).toEqual(['vue', 'react'])
  })

  it('add() deduplicates — existing entry moves to front', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.add('react'))
    expect(result.current.entries).toEqual(['react', 'vue'])
  })

  it('add() trims whitespace', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('  react  '))
    expect(result.current.entries).toEqual(['react'])
  })

  it('add() ignores empty strings', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add(''))
    act(() => result.current.add('   '))
    expect(result.current.entries).toEqual([])
  })

  it('add() caps at 20 entries, drops oldest', () => {
    const { result } = renderHook(() => useSearchHistory())
    for (let i = 0; i < 25; i++) {
      act(() => result.current.add(`query-${i}`))
    }
    expect(result.current.entries).toHaveLength(20)
    expect(result.current.entries[0]).toBe('query-24')
    expect(result.current.entries[19]).toBe('query-5')
  })

  it('remove() removes single entry by value', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.remove('react'))
    expect(result.current.entries).toEqual(['vue'])
  })

  it('clear() resets to empty array', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.clear())
    expect(result.current.entries).toEqual([])
  })

  it('persists to localStorage on add', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['react'])
  })

  it('persists to localStorage on remove', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.remove('react'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['vue'])
  })

  it('persists to localStorage on clear', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.clear())
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/useSearchHistory.test.ts`
Expected: FAIL — `useSearchHistory` module not found

- [ ] **Step 3: Commit the tests**

```bash
git add src/hooks/useSearchHistory.test.ts
git commit -m "test: add useSearchHistory hook tests (red)"
```

---

### Task 2: `useSearchHistory` Hook — Implementation

**Files:**
- Create: `src/hooks/useSearchHistory.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'discover-search-history'
const MAX_ENTRIES = 20

export function useSearchHistory() {
  const [entries, setEntries] = useLocalStorage<string[]>(STORAGE_KEY, [])

  const add = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setEntries(prev => {
      const without = prev.filter(e => e !== trimmed)
      return [trimmed, ...without].slice(0, MAX_ENTRIES)
    })
  }, [setEntries])

  const remove = useCallback((query: string) => {
    setEntries(prev => prev.filter(e => e !== query))
  }, [setEntries])

  const clear = useCallback(() => {
    setEntries([])
  }, [setEntries])

  return useMemo(() => ({ entries, add, remove, clear }), [entries, add, remove, clear])
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/useSearchHistory.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSearchHistory.ts
git commit -m "feat: add useSearchHistory hook with localStorage persistence"
```

---

### Task 3: Search History CSS

**Files:**
- Modify: `src/styles/globals.css` (after the `.discover-search:focus` block, around line 766)

- [ ] **Step 1: Add the history CSS classes**

Find the end of the `.discover-search:focus` rule block (around line 766) and add after it:

```css
/* ── Search History Dropdown ─────────────────────────────────────── */
.discover-history-header {
  font-size: 11px;
  color: var(--t3);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 12px 4px;
}

.discover-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-size: 12px;
  color: var(--t2);
  cursor: pointer;
  justify-content: space-between;
  transition: background 0.1s;
}
.discover-history-item:hover {
  background: var(--bg3);
  color: var(--t1);
}

.discover-history-remove {
  opacity: 0;
  border: none;
  background: none;
  color: var(--t3);
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  flex-shrink: 0;
  transition: opacity 0.1s, color 0.1s;
}
.discover-history-item:hover .discover-history-remove {
  opacity: 1;
}
.discover-history-remove:hover {
  color: var(--t1);
}

.discover-history-clear {
  font-size: 11px;
  color: var(--t3);
  text-align: center;
  padding: 6px 12px;
  border: none;
  border-top: 1px solid var(--border);
  background: none;
  cursor: pointer;
  width: 100%;
  transition: color 0.1s;
}
.discover-history-clear:hover {
  color: var(--t2);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add search history dropdown CSS classes"
```

---

### Task 4: Wire History Into Discover — Implementation

**Files:**
- Modify: `src/views/Discover.tsx`

This is the largest task. It touches three areas of `Discover.tsx`: imports/state, the `handleSearch` function, and the search input render block.

- [ ] **Step 1: Add the import**

At the top of `src/views/Discover.tsx`, add with the other hook imports:

```ts
import { useSearchHistory } from '../hooks/useSearchHistory'
```

- [ ] **Step 2: Add the hook call**

Inside the `Discover` component function body, near the other state declarations (around line 138, near the `selectedTypes` state), add:

```ts
const searchHistory = useSearchHistory()
```

- [ ] **Step 3: Add a `showHistory` derived boolean**

Below the `searchHistory` hook call, add:

```ts
const showHistory = showSuggestions && query.trim() === '' && searchHistory.entries.length > 0
```

Note: We reuse the existing `showSuggestions` boolean to track "dropdown is open" state. The `showHistory` value decides *which content* to render inside that dropdown.

- [ ] **Step 4: Update `onFocus` handler to show history when input is empty**

In the `<input>` element's `onFocus` handler (around line 592), replace:

```ts
onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
```

with:

```ts
onFocus={() => {
  if (query.trim() === '' && searchHistory.entries.length > 0) {
    setShowSuggestions(true)
    setSuggestionIndex(-1)
  } else if (suggestions.length > 0) {
    setShowSuggestions(true)
  }
}}
```

- [ ] **Step 5: Update keyboard handler to work with history entries**

In the `onKeyDown` handler, the ArrowDown max index needs to account for history entries when history is showing. Replace the ArrowDown line:

```ts
if (e.key === 'ArrowDown') {
  e.preventDefault(); setSuggestionIndex(i => Math.min(i + 1, suggestions.length - 1))
}
```

with:

```ts
if (e.key === 'ArrowDown') {
  e.preventDefault()
  const max = (query.trim() === '' && searchHistory.entries.length > 0)
    ? searchHistory.entries.length - 1
    : suggestions.length - 1
  setSuggestionIndex(i => Math.min(i + 1, max))
}
```

Similarly, update the ArrowUp line:

```ts
} else if (e.key === 'ArrowUp') {
  e.preventDefault(); setSuggestionIndex(i => Math.max(i - 1, -1))
}
```

No change needed — the ArrowUp logic already bottoms out at `-1` regardless of list length, so it works correctly for both history and suggestions.

And update the Enter key block. After the existing `} else {` branch (the plain Enter-with-no-suggestion path, around line 587), replace:

```ts
} else {
  setShowSuggestions(false); handleSearch()
}
```

with:

```ts
} else if (query.trim() === '' && suggestionIndex >= 0 && searchHistory.entries[suggestionIndex]) {
  const historyQuery = searchHistory.entries[suggestionIndex]
  setQuery(historyQuery)
  setShowSuggestions(false); setSuggestionIndex(-1)
  handleSearch(undefined, historyQuery)
} else {
  setShowSuggestions(false); handleSearch()
}
```

- [ ] **Step 6: Add `searchHistory.add()` calls in `handleSearch`**

In the `handleSearch` function (around line 380), right after the early return for empty queries, add:

```ts
searchHistory.add(q)
```

This goes right after line 384 (`if (!q.trim()) { loadTrending(filters); return }`), so it fires for every non-empty search execution. The line should be:

```ts
const handleSearch = async (overrideFilters?: SearchFilters, overrideQuery?: string, overrideLanguage?: string) => {
    const filters = overrideFilters ?? appliedFilters
    const q = overrideQuery ?? query
    const langFilter = (overrideLanguage !== undefined ? overrideLanguage : activeLanguage) || undefined
    if (!q.trim()) { loadTrending(filters); return }
    searchHistory.add(q)
    // ... rest of handleSearch unchanged
```

Note: Verify `handleSearch` is declared as a plain `async` function (not wrapped in `useCallback`) so `searchHistory` is available via closure without dependency array changes.

- [ ] **Step 7: Render the history dropdown**

In the render section, the existing suggestion dropdown is conditionally rendered at around line 594:

```tsx
{showSuggestions && suggestions.length > 0 && (
  <div ref={suggestionsRef} style={{...}}>
    {suggestions.map((s, i) => (...))}
  </div>
)}
```

Replace this entire block with:

```tsx
{showSuggestions && (showHistory || suggestions.length > 0) && (
  <div ref={suggestionsRef} style={{
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
    background: 'var(--bg2)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    zIndex: 100, overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
  }}>
    {showHistory ? (
      <>
        <div className="discover-history-header">Recent searches</div>
        {searchHistory.entries.map((entry, i) => (
          <div
            key={entry}
            className="discover-history-item"
            style={{
              background: i === suggestionIndex ? 'var(--bg3)' : 'transparent',
              color: i === suggestionIndex ? 'var(--t1)' : undefined,
            }}
            onMouseDown={() => {
              setQuery(entry)
              setShowSuggestions(false)
              setSuggestionIndex(-1)
              handleSearch(undefined, entry)
            }}
            onMouseEnter={() => setSuggestionIndex(i)}
            onMouseLeave={() => setSuggestionIndex(-1)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--t3)', fontSize: 12 }}>&#128339;</span>
              {entry}
            </span>
            <button
              className="discover-history-remove"
              onMouseDown={e => {
                e.stopPropagation()
                e.preventDefault()
                searchHistory.remove(entry)
              }}
            >
              &#x2715;
            </button>
          </div>
        ))}
        {searchHistory.entries.length >= 2 && (
          <button
            className="discover-history-clear"
            onMouseDown={e => {
              e.stopPropagation()
              e.preventDefault()
              searchHistory.clear()
              setShowSuggestions(false)
            }}
          >
            Clear all
          </button>
        )}
      </>
    ) : (
      suggestions.map((s, i) => (
        <div
          key={s}
          onMouseDown={() => {
            const words = query.trimEnd().split(/\s+/)
            words[words.length - 1] = s
            const completed = words.join(' ')
            setQuery(completed + ' ')
            setShowSuggestions(false); setSuggestionIndex(-1)
            inputRef.current?.focus()
            handleSearch(undefined, completed)
          }}
          style={{
            padding: '7px 14px', fontSize: 12, cursor: 'pointer',
            background: i === suggestionIndex ? 'var(--bg3)' : 'transparent',
            color: i === suggestionIndex ? 'var(--t1)' : 'var(--t2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={() => setSuggestionIndex(i)}
          onMouseLeave={() => setSuggestionIndex(-1)}
        >
          <span style={{ color: 'var(--t3)', fontSize: 10 }}>⬡</span>
          {s}
        </div>
      ))
    )}
  </div>
)}
```

Key changes from the original:
- The outer condition is now `showSuggestions && (showHistory || suggestions.length > 0)` (either history or suggestions)
- Added `maxHeight: 280, overflowY: 'auto'` to the container style
- Inside the container: `showHistory ? <history UI> : <existing suggestions UI>`
- The existing suggestions rendering is identical to before — just moved into the else branch
- History entries use `onMouseDown` (not `onClick`) to fire before `onBlur`, matching the existing suggestion pattern
- The "x" button uses `e.stopPropagation()` and `e.preventDefault()` to avoid triggering the parent's mousedown or input blur

- [ ] **Step 8: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: wire search history into Discover search bar"
```

---

### Task 5: Integration Tests

**Files:**
- Modify: `src/views/Discover.test.tsx`

- [ ] **Step 1: Add integration tests**

Add a new `describe` block at the end of `Discover.test.tsx`:

```ts
describe('Search history', () => {
  beforeEach(() => {
    localStorage.clear()
    makeDiscoverApi()
  })

  it('shows history dropdown with header when focusing empty input with history', async () => {
    localStorage.setItem('discover-search-history', JSON.stringify(['react', 'vue']))
    renderDiscover()
    const input = screen.getByPlaceholderText(/Search repos/)
    fireEvent.focus(input)
    expect(screen.getByText('Recent searches')).toBeInTheDocument()
    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('vue')).toBeInTheDocument()
  })

  it('shows no dropdown when focusing empty input with no history', async () => {
    renderDiscover()
    const input = screen.getByPlaceholderText(/Search repos/)
    fireEvent.focus(input)
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument()
  })

  it('hides history and shows topic suggestions when typing', async () => {
    localStorage.setItem('discover-search-history', JSON.stringify(['react']))
    makeDiscoverApi({ })
    // Override getTopics to return something matchable
    ;(window.api.search.getTopics as ReturnType<typeof vi.fn>).mockResolvedValue(['typescript', 'testing'])
    renderDiscover()
    const input = screen.getByPlaceholderText(/Search repos/)
    fireEvent.focus(input)
    expect(screen.getByText('Recent searches')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'test' } })
    await waitFor(() => {
      expect(screen.queryByText('Recent searches')).not.toBeInTheDocument()
    })
  })

  it('clicking a history entry populates search input', async () => {
    localStorage.setItem('discover-search-history', JSON.stringify(['react frameworks']))
    renderDiscover()
    const input = screen.getByPlaceholderText(/Search repos/) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByText('react frameworks'))
    await waitFor(() => {
      expect(input.value).toBe('react frameworks')
    })
  })

  it('clicking "x" removes entry without triggering search', async () => {
    localStorage.setItem('discover-search-history', JSON.stringify(['react', 'vue']))
    renderDiscover()
    const input = screen.getByPlaceholderText(/Search repos/)
    fireEvent.focus(input)
    // Hover over 'react' entry to reveal the x button, then click it
    const reactEntry = screen.getByText('react').closest('.discover-history-item')!
    fireEvent.mouseEnter(reactEntry)
    const removeBtn = reactEntry.querySelector('.discover-history-remove')!
    fireEvent.mouseDown(removeBtn)
    // 'react' should be gone, 'vue' should remain
    expect(screen.queryByText('react')).not.toBeInTheDocument()
    expect(screen.getByText('vue')).toBeInTheDocument()
    // searchRepos should NOT have been called (no search triggered)
    expect(window.api.github.searchRepos).not.toHaveBeenCalled()
  })

  it('clicking "Clear all" removes all entries', async () => {
    localStorage.setItem('discover-search-history', JSON.stringify(['react', 'vue']))
    renderDiscover()
    const input = screen.getByPlaceholderText(/Search repos/)
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByText('Clear all'))
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('discover-search-history')!)).toEqual([])
  })

  it('executing a search adds query to history', async () => {
    renderDiscover()
    const input = screen.getByPlaceholderText(/Search repos/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'react frameworks' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      const history = JSON.parse(localStorage.getItem('discover-search-history')!)
      expect(history).toContain('react frameworks')
    })
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run src/hooks/useSearchHistory.test.ts src/views/Discover.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/Discover.test.tsx
git commit -m "test: add search history integration tests for Discover"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS, no regressions

- [ ] **Step 2: Verify localStorage key**

Open the app, search for something, check DevTools → Application → Local Storage for the `discover-search-history` key containing the query.

- [ ] **Step 3: Verify the full interaction flow**

1. Search for "react" — should execute normally
2. Search for "vue" — should execute normally
3. Clear the search input, focus it — should show "Recent searches" header with "vue" and "react"
4. Click "vue" entry — should populate input and search
5. Hover an entry — "x" button should appear
6. Click "x" on an entry — should remove it without searching
7. With 2+ entries, click "Clear all" — should clear everything
8. Start typing — history should disappear, topic suggestions should appear

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address search history issues found during verification"
```
