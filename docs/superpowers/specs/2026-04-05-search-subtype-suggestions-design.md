# Search Bar Subtype Suggestions — Design Spec

**Date:** 2026-04-05
**Status:** Approved

---

## Overview

Extend the search bar's autocomplete suggestion dropdown to surface repo subtypes (e.g. "UI Library", "Build Tool") alongside existing GitHub topic suggestions. When a user types a term that matches a subtype label, that category appears in the dropdown as a distinct, visually identifiable suggestion. Selecting it applies the type filter directly — the same as clicking the subtype in BucketNav — and clears the text input.

---

## Goals

- Let users discover and apply category filters via the search bar without needing to find BucketNav
- Keep the existing topic suggestion behaviour unchanged
- Minimal code footprint: no new files, no new state variables beyond the type change to `suggestions`

---

## Data Shape

`suggestions` state changes from `string[]` to a discriminated union. Define this type locally in `Discover.tsx`:

```ts
type TopicSuggestion   = { kind: 'topic';   label: string }
type SubtypeSuggestion = { kind: 'subtype'; label: string; subTypeId: string; bucketLabel: string; bucketColor: string }
type Suggestion        = TopicSuggestion | SubtypeSuggestion
```

`suggestionIndex` (number) and `showSuggestions` (boolean) are unchanged — they operate on array index and are kind-agnostic.

> **TypeScript migration note:** After this type change, two existing expressions will become compile errors and must be fixed in the same PR:
> - `key={s}` in the render `.map()` — objects cannot be React keys; replaced below.
> - `words[words.length - 1] = suggestions[suggestionIndex]` in the Enter handler — `Suggestion` is not assignable to `string`; replaced below.

> **Invariant:** When `showHistory` is true, `query` is empty (`query.trim() === ''`). The new `useEffect` early-exits when `!q`, so `suggestions` will always be `[]` when `showHistory` is true. The subtype/topic branches in the Enter handler are therefore unreachable while history is showing. The branch reordering in the Enter handler (history first) is not purely cosmetic — it is also a defensive correctness improvement: any `Suggestion` object is truthy, so the old first branch (`if (suggestions[suggestionIndex])`) would silently misbehave on object suggestions if this invariant ever broke.

---

## Matching Logic

Replace the existing suggestions `useEffect` body with the following structure. The dependency array (`[query, allTopics]`) is unchanged.

```ts
const q = query.trim().toLowerCase()
const words = q.split(/\s+/)
const lastWord = words[words.length - 1]

// Early exit for empty query — same semantics as today; ensures suggestions === []
// when showHistory is true. Also adds setSuggestionIndex(-1) which was missing
// from the old early-exit (behaviour fix: prevents a stale highlight on re-open).
if (!q) {
  setSuggestions([])
  setShowSuggestions(false)
  setSuggestionIndex(-1)
  return
}

// 1. Subtype pass — runs regardless of whether allTopics has loaded.
//    CHANGED BEHAVIOUR from today: the old guard suppressed all suggestions until
//    allTopics loaded. Now subtypes appear immediately on the first keystroke.
const subtypeMatches: SubtypeSuggestion[] = []
for (const bucket of REPO_BUCKETS) {
  for (const sub of bucket.subTypes) {
    if (sub.label.toLowerCase().includes(lastWord)) {
      subtypeMatches.push({
        kind: 'subtype',
        label: sub.label,
        subTypeId: sub.id,
        bucketLabel: bucket.label,
        bucketColor: bucket.color,  // raw hex string e.g. '#06b6d4', NOT a CSS var
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

// 3. Merge — subtypes first, topics after, cap at 8
const merged: Suggestion[] = [...subtypeMatches, ...topicMatches].slice(0, 8)
setSuggestions(merged)
setShowSuggestions(merged.length > 0)
setSuggestionIndex(-1)
```

> **Subtype matching note:** Subtypes use `includes` (substring match). Exact matches (last word === subtype label lowercased) are included — intentional, since category names are multi-word and a full label match should still surface the category. Topics continue to exclude exact matches (`t !== lastWord`) as before.

> **Cap note:** Subtype matches fill from the front of the 8-item cap, so many subtype matches may crowd out topic matches. This is intentional — category hits are higher-value suggestions.

---

## Render

Replace the existing `suggestions.map(...)` block in full. The `onFocus` handler (`suggestions.length > 0`) is untouched — it checks array length only and works correctly with `Suggestion[]`.

All state setters (`setSelectedTypes`, `setQuery`, `setShowSuggestions`, `setSuggestionIndex`) are already in component state — no new imports or wiring required.

`s.bucketColor` is a raw hex value (e.g. `'#06b6d4'`) from `bucket.color` in `repoTypes.ts`. Use it directly in `color:` style props — do not wrap in `var(...)`.

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
      color: i === suggestionIndex ? 'var(--t1)' : 'var(--t2)',  // unchanged
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

---

## Interaction

### Mouse click — subtype suggestion
Handled inline above. `setSelectedTypes([s.subTypeId])` replaces any active type filters with this single subtype — intentional, a category selection from the search bar is a direct navigation gesture.

> **Edge case:** If the selected subtype is already active, `setSelectedTypes([s.subTypeId])` still fires. Visible state is unchanged but the query clears and the dropdown closes. No special handling required.

### Mouse click — topic suggestion
Unchanged: complete last word, update query, close dropdown, call `handleSearch(undefined, completed)`.

### Keyboard `Enter` — three-branch handler

The current Enter handler has topic-completion first, history second. This implementation reorders them: history first, then subtype, then topic. Safe due to the invariant (see Data Shape section), and also defensive against future invariant drift.

```ts
} else if (e.key === 'Enter') {
  if (showHistory && suggestionIndex >= 0 && searchHistory.entries[suggestionIndex]) {
    // Branch 1 — history entry (moved to top for safety)
    const entry = searchHistory.entries[suggestionIndex]
    setQuery(entry)
    setShowSuggestions(false)
    setSuggestionIndex(-1)
    handleSearch(undefined, entry)

  } else if (suggestionIndex >= 0 && suggestions[suggestionIndex]?.kind === 'subtype') {
    // Branch 2 — apply type filter (new)
    const s = suggestions[suggestionIndex] as SubtypeSuggestion
    setSelectedTypes([s.subTypeId])
    setQuery('')
    setShowSuggestions(false)
    setSuggestionIndex(-1)
    // No handleSearch call

  } else if (suggestionIndex >= 0 && suggestions[suggestionIndex]?.kind === 'topic') {
    // Branch 3 — topic text-completion (unchanged logic)
    const words = query.trimEnd().split(/\s+/)
    words[words.length - 1] = (suggestions[suggestionIndex] as TopicSuggestion).label
    const completed = words.join(' ')
    setQuery(completed + ' ')
    setShowSuggestions(false)
    setSuggestionIndex(-1)
    handleSearch(undefined, completed)
  }
}
```

Arrow key navigation and Escape are unchanged.

---

## Files Changed

| File | Change |
|------|--------|
| `src/views/Discover.tsx` | Add `import { REPO_BUCKETS } from '../constants/repoTypes'`; define `TopicSuggestion`, `SubtypeSuggestion`, `Suggestion` union types; replace suggestions `useEffect` body (restructure guard + add `setSuggestionIndex(-1)` to early-exit, add subtype pass, split topic guard); rewrite `suggestions.map()` block (stable keys fixing TS error, kind-branch, preserve color styles); replace `Enter` handler with three explicit branches fixing TS type error in old string assignment |

No new state. `onFocus`, arrow key handler, and Escape handler are untouched.

---

## Out of Scope

- Matching against bucket names (e.g. typing "framework" to surface all Frameworks subtypes)
- Matching against `SUB_TYPE_KEYWORD` aliases (e.g. "react" → UI Library)
- Multi-select subtype suggestions
- Showing subtype suggestions when the query is empty
