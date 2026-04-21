# Search Bar Subtype Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface repo subtypes (e.g. "UI Library", "Build Tool") as visually distinct suggestions in the search bar autocomplete dropdown, with selection applying the type filter and clearing the query.

**Architecture:** All changes are confined to `src/views/Discover.tsx`. The `suggestions` state type is widened from `string[]` to a `Suggestion` discriminated union. The suggestions `useEffect` is updated to run a subtype match pass (from `REPO_BUCKETS`) before the existing topic pass. The render block and keyboard `Enter` handler are updated to branch on `Suggestion.kind`.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react

---

## File Map

| File | Role |
|------|------|
| `src/views/Discover.tsx` | Only file changed — types, useEffect, render, Enter handler |
| `src/views/Discover.test.tsx` | Integration tests added to existing test file |
| `src/constants/repoTypes.ts` | Read-only reference — provides `REPO_BUCKETS` |

---

## Task 1: Add types and import

**Files:**
- Modify: `src/views/Discover.tsx` (top of file, imports + type block)

- [ ] **Step 1: Add the `REPO_BUCKETS` import**

  In `src/views/Discover.tsx`, find the existing imports at the top. Add:

  ```ts
  import { REPO_BUCKETS } from '../constants/repoTypes'
  ```

  Place it alongside the other local imports (after React, before component imports — follow existing ordering).

- [ ] **Step 2: Define the `Suggestion` union type**

  Directly above the `// ── View mode data ─────` comment block (around line 33), add:

  ```ts
  // ── Suggestion types ──────────────────────────────────────────────
  type TopicSuggestion   = { kind: 'topic';   label: string }
  type SubtypeSuggestion = { kind: 'subtype'; label: string; subTypeId: string; bucketLabel: string; bucketColor: string }
  type Suggestion        = TopicSuggestion | SubtypeSuggestion
  ```

- [ ] **Step 3: Update the `suggestions` state declaration**

  Find this line (currently around line 239):
  ```ts
  const [suggestions, setSuggestions] = useState<string[]>([])
  ```
  Change to:
  ```ts
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  ```

- [ ] **Step 4: Verify TypeScript compiles with the new types**

  Run: `npx tsc --noEmit`

  Expected: compile errors in two places — `key={s}` in the render map and `words[words.length - 1] = suggestions[suggestionIndex]` in the Enter handler. These are expected and will be fixed in Tasks 3 and 4. All other errors would be unexpected — investigate before continuing.

- [ ] **Step 5: Commit**

  ```bash
  git add src/views/Discover.tsx
  git commit -m "feat: add Suggestion union type for search bar subtype suggestions"
  ```

---

## Task 2: Update the suggestions `useEffect` (matching logic)

**Files:**
- Modify: `src/views/Discover.tsx` (~line 339, the `// Autocomplete suggestions` useEffect)
- Test: `src/views/Discover.test.tsx`

- [ ] **Step 1: Write failing tests**

  In `src/views/Discover.test.tsx`, add a new `describe` block after the existing ones:

  ```ts
  describe('Discover search suggestions', () => {
    function makeApiWithTopics(topics: string[]) {
      makeDiscoverApi({})
      // Override just the getTopics mock
      Object.defineProperty(window, 'api', {
        value: {
          ...(window as any).api,
          search: {
            ...(window as any).api.search,
            getTopics: vi.fn().mockResolvedValue(topics),
          },
        },
        writable: true, configurable: true,
      })
    }

    it('shows a subtype suggestion when the query matches a subtype label', async () => {
      makeApiWithTopics([])
      renderDiscover()
      const input = screen.getByPlaceholderText(/search repos/i)
      fireEvent.change(input, { target: { value: 'ui' } })
      await waitFor(() => expect(screen.getByText('UI Library')).toBeInTheDocument())
    })

    it('shows the bucket label badge alongside the subtype suggestion', async () => {
      makeApiWithTopics([])
      renderDiscover()
      const input = screen.getByPlaceholderText(/search repos/i)
      fireEvent.change(input, { target: { value: 'ui' } })
      await waitFor(() => expect(screen.getByText('· Frameworks')).toBeInTheDocument())
    })

    it('shows subtype suggestions even before allTopics has loaded', async () => {
      // getTopics returns empty — subtype pass should still run
      makeApiWithTopics([])
      renderDiscover()
      const input = screen.getByPlaceholderText(/search repos/i)
      fireEvent.change(input, { target: { value: 'build' } })
      await waitFor(() => expect(screen.getByText('Build Tool')).toBeInTheDocument())
    })

    it('still shows topic suggestions after subtypes when topics are loaded', async () => {
      makeApiWithTopics(['ui-components', 'ui-kit'])
      renderDiscover()
      const input = screen.getByPlaceholderText(/search repos/i)
      fireEvent.change(input, { target: { value: 'ui' } })
      await waitFor(() => {
        expect(screen.getByText('UI Library')).toBeInTheDocument()
        expect(screen.getByText('ui-components')).toBeInTheDocument()
      })
    })

    it('shows no suggestions for an empty query', async () => {
      makeApiWithTopics(['react', 'vue'])
      renderDiscover()
      const input = screen.getByPlaceholderText(/search repos/i)
      fireEvent.change(input, { target: { value: '' } })
      await waitFor(() => {
        expect(screen.queryByText('react')).not.toBeInTheDocument()
      })
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npx vitest run src/views/Discover.test.tsx`

  Expected: The new tests should FAIL (subtypes not yet surfaced). Existing tests should still pass. If existing tests fail, stop and investigate.

- [ ] **Step 3: Replace the suggestions `useEffect` body**

  In `src/views/Discover.tsx`, find the `// Autocomplete suggestions` useEffect (currently lines 338–351):

  ```ts
  // Autocomplete suggestions
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q || allTopics.length === 0) { setSuggestions([]); setShowSuggestions(false); return }
    const words = q.split(/\s+/)
    const lastWord = words[words.length - 1]
    if (!lastWord || lastWord.length < 1) { setSuggestions([]); setShowSuggestions(false); return }
    const prefix   = allTopics.filter(t => t.startsWith(lastWord) && t !== lastWord)
    const midMatch = allTopics.filter(t => !t.startsWith(lastWord) && t.includes(lastWord))
    const merged   = [...prefix, ...midMatch].slice(0, 8)
    setSuggestions(merged)
    setShowSuggestions(merged.length > 0)
    setSuggestionIndex(-1)
  }, [query, allTopics])
  ```

  Replace the entire block with:

  ```ts
  // Autocomplete suggestions
  useEffect(() => {
    const q = query.trim().toLowerCase()
    const words = q.split(/\s+/)
    const lastWord = words[words.length - 1]

    // Early exit for empty query — also ensures suggestions === [] when showHistory is true.
    // Adds setSuggestionIndex(-1) fix: prevents a stale highlight on dropdown re-open.
    if (!q) {
      setSuggestions([])
      setShowSuggestions(false)
      setSuggestionIndex(-1)
      return
    }

    // 1. Subtype pass — runs regardless of whether allTopics has loaded.
    //    Subtypes appear immediately on the first keystroke (unlike the old behaviour
    //    which suppressed all suggestions until allTopics loaded).
    const subtypeMatches: SubtypeSuggestion[] = []
    for (const bucket of REPO_BUCKETS) {
      for (const sub of bucket.subTypes) {
        if (sub.label.toLowerCase().includes(lastWord)) {
          subtypeMatches.push({
            kind: 'subtype',
            label: sub.label,
            subTypeId: sub.id,
            bucketLabel: bucket.label,
            bucketColor: bucket.color,  // raw hex string e.g. '#06b6d4' — NOT a CSS var
          })
        }
      }
    }

    // 2. Topic pass — only if topics are loaded (unchanged logic)
    const topicMatches: TopicSuggestion[] = []
    if (allTopics.length > 0) {
      const prefix   = allTopics.filter(t => t.startsWith(lastWord) && t !== lastWord)
      const midMatch = allTopics.filter(t => !t.startsWith(lastWord) && t.includes(lastWord))
      ;[...prefix, ...midMatch].forEach(t => topicMatches.push({ kind: 'topic', label: t }))
    }

    // 3. Merge — subtypes first (higher value), topics after, cap at 8
    const merged: Suggestion[] = [...subtypeMatches, ...topicMatches].slice(0, 8)
    setSuggestions(merged)
    setShowSuggestions(merged.length > 0)
    setSuggestionIndex(-1)
  }, [query, allTopics])
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `npx vitest run src/views/Discover.test.tsx`

  Expected: All tests pass, including the new ones. Zero failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/views/Discover.tsx src/views/Discover.test.tsx
  git commit -m "feat: add subtype matching to search suggestions useEffect"
  ```

---

## Task 3: Update the suggestions render block

**Files:**
- Modify: `src/views/Discover.tsx` (~line 894, the `suggestions.map(...)` block)
- Test: `src/views/Discover.test.tsx`

- [ ] **Step 1: Write failing tests**

  Add to the `describe('Discover search suggestions', ...)` block:

  ```ts
  it('renders a colored dot for subtype suggestions (not the hex icon)', async () => {
    makeApiWithTopics([])
    renderDiscover()
    const input = screen.getByPlaceholderText(/search repos/i)
    fireEvent.change(input, { target: { value: 'ui' } })
    await waitFor(() => screen.getByText('UI Library'))
    // Subtype items use ● not ⬡
    const subtypeRow = screen.getByText('UI Library').closest('div')!
    expect(subtypeRow.textContent).toContain('●')
    expect(subtypeRow.textContent).not.toContain('⬡')
  })

  it('renders a hex icon for topic suggestions', async () => {
    makeApiWithTopics(['ui-components'])
    renderDiscover()
    const input = screen.getByPlaceholderText(/search repos/i)
    fireEvent.change(input, { target: { value: 'ui' } })
    await waitFor(() => screen.getByText('ui-components'))
    const topicRow = screen.getByText('ui-components').closest('div')!
    expect(topicRow.textContent).toContain('⬡')
  })

  it('clicking a subtype suggestion clears the query', async () => {
    makeApiWithTopics([])
    renderDiscover()
    const input = screen.getByPlaceholderText(/search repos/i)
    fireEvent.change(input, { target: { value: 'ui' } })
    await waitFor(() => screen.getByText('UI Library'))
    fireEvent.mouseDown(screen.getByText('UI Library').closest('div[style]')!)
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''))
  })

  it('clicking a subtype suggestion triggers a search API call via the type filter', async () => {
    makeApiWithTopics([])
    renderDiscover()
    const searchSpy = (window as any).api.github.searchRepos as ReturnType<typeof vi.fn>
    searchSpy.mockClear()
    const input = screen.getByPlaceholderText(/search repos/i)
    fireEvent.change(input, { target: { value: 'ui' } })
    await waitFor(() => screen.getByText('UI Library'))
    fireEvent.mouseDown(screen.getByText('UI Library').closest('div[style]')!)
    // The selectedTypes useEffect fires a search when selectedTypes changes
    await waitFor(() => expect(searchSpy).toHaveBeenCalled())
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npx vitest run src/views/Discover.test.tsx`

  Expected: The new render tests FAIL. Existing tests pass.

- [ ] **Step 3: Replace the `suggestions.map(...)` render block**

  In `src/views/Discover.tsx`, find the topic suggestion render block (currently lines 894–918):

  ```tsx
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
  ```

  Replace with:

  ```tsx
  suggestions.map((s, i) => (
    <div
      key={s.kind === 'subtype' ? `subtype:${s.subTypeId}` : `topic:${s.label}`}
      onMouseDown={() => {
        if (s.kind === 'subtype') {
          // Apply type filter — replaces any existing selectedTypes (intentional)
          setSelectedTypes([s.subTypeId])
          setQuery('')
          setShowSuggestions(false)
          setSuggestionIndex(-1)
          // No handleSearch call — the selectedTypes useEffect triggers the fetch
        } else {
          // Unchanged topic behaviour
          const words = query.trimEnd().split(/\s+/)
          words[words.length - 1] = s.label
          const completed = words.join(' ')
          setQuery(completed + ' ')
          setShowSuggestions(false)
          setSuggestionIndex(-1)
          inputRef.current?.focus()
          handleSearch(undefined, completed)
        }
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
      {s.kind === 'subtype' ? (
        <>
          <span style={{ color: s.bucketColor, fontSize: 10 }}>●</span>
          {s.label}
          <span style={{ color: 'var(--t3)', fontSize: 11, marginLeft: 'auto' }}>· {s.bucketLabel}</span>
        </>
      ) : (
        <>
          <span style={{ color: 'var(--t3)', fontSize: 10 }}>⬡</span>
          {s.label}
        </>
      )}
    </div>
  ))
  ```

- [ ] **Step 4: Verify TypeScript compiles — the `key={s}` error should now be gone**

  Run: `npx tsc --noEmit`

  Expected: The `key={s}` compile error is resolved. The remaining error should only be in the Enter handler (`words[words.length - 1] = suggestions[suggestionIndex]`). That is fixed in Task 4.

- [ ] **Step 5: Run all tests**

  Run: `npx vitest run src/views/Discover.test.tsx`

  Expected: All tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/views/Discover.tsx src/views/Discover.test.tsx
  git commit -m "feat: render subtype suggestions with bucket badge in search dropdown"
  ```

---

## Task 4: Update the keyboard `Enter` handler

**Files:**
- Modify: `src/views/Discover.tsx` (~line 808, inside `onKeyDown`)
- Test: `src/views/Discover.test.tsx`

- [ ] **Step 1: Write failing tests**

  Add to the `describe('Discover search suggestions', ...)` block:

  ```ts
  it('pressing Enter on a highlighted subtype suggestion clears the query', async () => {
    makeApiWithTopics([])
    renderDiscover()
    const input = screen.getByPlaceholderText(/search repos/i)
    fireEvent.change(input, { target: { value: 'ui' } })
    await waitFor(() => screen.getByText('UI Library'))
    // Arrow down to highlight the first suggestion (UI Library)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Query should be cleared after selecting a subtype via keyboard
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''))
  })

  it('pressing Enter on a highlighted subtype suggestion triggers a search API call', async () => {
    makeApiWithTopics([])
    renderDiscover()
    const searchSpy = (window as any).api.github.searchRepos as ReturnType<typeof vi.fn>
    searchSpy.mockClear()
    const input = screen.getByPlaceholderText(/search repos/i)
    fireEvent.change(input, { target: { value: 'ui' } })
    await waitFor(() => screen.getByText('UI Library'))
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // The selectedTypes useEffect fires a search (via loadTrending → searchRepos)
    await waitFor(() => expect(searchSpy).toHaveBeenCalled())
  })

  it('pressing Enter on a highlighted topic suggestion completes the text in the input', async () => {
    // Use a topic that won't match any subtype label so it's the first (and only) suggestion
    makeApiWithTopics(['storybook-addon'])
    renderDiscover()
    const input = screen.getByPlaceholderText(/search repos/i)
    fireEvent.change(input, { target: { value: 'storybook' } })
    await waitFor(() => screen.getByText('storybook-addon'))
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Input should be completed with the full topic label
    await waitFor(() =>
      expect((input as HTMLInputElement).value.trim()).toBe('storybook-addon')
    )
  })

- [ ] **Step 2: Run tests to verify the subtype Enter test fails**

  Run: `npx vitest run src/views/Discover.test.tsx`

  Expected: The new Enter tests FAIL. All existing tests still pass.

- [ ] **Step 3: Replace the `Enter` branch in the `onKeyDown` handler**

  In `src/views/Discover.tsx`, find the Enter key block inside `onKeyDown` (currently lines 808–823):

  ```ts
  } else if (e.key === 'Enter') {
    if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
      const words = query.trimEnd().split(/\s+/)
      words[words.length - 1] = suggestions[suggestionIndex]
      const completed = words.join(' ')
      setQuery(completed + ' ')
      setShowSuggestions(false); setSuggestionIndex(-1)
      handleSearch(undefined, completed)
    } else if (showHistory && suggestionIndex >= 0 && searchHistory.entries[suggestionIndex]) {
      const historyQuery = searchHistory.entries[suggestionIndex]
      setQuery(historyQuery)
      setShowSuggestions(false); setSuggestionIndex(-1)
      handleSearch(undefined, historyQuery)
    } else {
      setShowSuggestions(false); handleSearch()
    }
  }
  ```

  Replace with:

  ```ts
  } else if (e.key === 'Enter') {
    if (showHistory && suggestionIndex >= 0 && searchHistory.entries[suggestionIndex]) {
      // Branch 1 — history entry (moved to top: showHistory is true only when query is
      // empty, at which point suggestions is always [], so this reordering is safe)
      const entry = searchHistory.entries[suggestionIndex]
      setQuery(entry)
      setShowSuggestions(false)
      setSuggestionIndex(-1)
      handleSearch(undefined, entry)

    } else if (suggestionIndex >= 0 && suggestions[suggestionIndex]?.kind === 'subtype') {
      // Branch 2 — subtype filter (new)
      const s = suggestions[suggestionIndex] as SubtypeSuggestion
      setSelectedTypes([s.subTypeId])
      setQuery('')
      setShowSuggestions(false)
      setSuggestionIndex(-1)
      // No handleSearch — selectedTypes useEffect triggers the fetch

    } else if (suggestionIndex >= 0 && suggestions[suggestionIndex]?.kind === 'topic') {
      // Branch 3 — topic text-completion (unchanged logic)
      const words = query.trimEnd().split(/\s+/)
      words[words.length - 1] = (suggestions[suggestionIndex] as TopicSuggestion).label
      const completed = words.join(' ')
      setQuery(completed + ' ')
      setShowSuggestions(false)
      setSuggestionIndex(-1)
      handleSearch(undefined, completed)

    } else {
      setShowSuggestions(false)
      handleSearch()
    }
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles clean**

  Run: `npx tsc --noEmit`

  Expected: **Zero errors**. The `words[words.length - 1] = suggestions[suggestionIndex]` TS error is now resolved.

- [ ] **Step 5: Run all tests**

  Run: `npx vitest run src/views/Discover.test.tsx`

  Expected: All tests pass including new Enter handler tests.

- [ ] **Step 6: Run full test suite**

  Run: `npx vitest run`

  Expected: All tests pass across the entire project.

- [ ] **Step 7: Commit**

  ```bash
  git add src/views/Discover.tsx src/views/Discover.test.tsx
  git commit -m "feat: add subtype Enter handler branch in search bar keyboard nav"
  ```

---

## Done

The feature is complete when:
- Typing a partial subtype label (e.g. `"ui"`, `"build"`, `"agent"`) shows matching subtypes at the top of the dropdown with a colored `●` and `· BucketName` badge
- Clicking or pressing Enter on a subtype suggestion sets the BucketNav type filter and clears the search input
- Existing topic suggestions still appear below subtype matches
- History selection, topic completion, and Escape/arrow nav are all unchanged
- `npx tsc --noEmit` reports zero errors
- `npx vitest run` passes
