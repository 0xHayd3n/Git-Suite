# Search History Design

## Overview

Add persistent search history to the Discover view's search bar. When the user focuses the search input with an empty query, a dropdown shows their most recent searches. Typing switches back to the existing topic suggestion behavior.

## Decisions

- **Persistence:** localStorage via existing `useLocalStorage` hook (no backend changes)
- **Storage key:** `"discover-search-history"`
- **Max entries:** 20
- **Display:** 4 visible without scrolling, rest reachable by scrolling
- **Deduplication:** Re-searching an existing query moves it to the front
- **Deletion:** Individual "x" button per entry + "Clear all" at bottom
- **Search mode:** History stores text only, not the search mode that was active

## Data Layer

### `useSearchHistory` hook

**File:** `src/hooks/useSearchHistory.ts`

Built on the existing `useLocalStorage<string[]>` hook. Stores a most-recent-first array of strings.

```ts
interface UseSearchHistory {
  entries: string[]           // most-recent-first, max 20
  add: (query: string) => void
  remove: (query: string) => void
  clear: () => void
}
```

**`add(query)`** — Trims whitespace. Ignores empty strings. If the query already exists, removes the old position first. Prepends to the front. If length exceeds 20, drops the last entry.

**`remove(query)`** — Removes a single entry by value.

**`clear()`** — Resets to an empty array.

## Dropdown Behavior

### Which content shows

| Input focused? | Input empty? | Dropdown shows |
|---|---|---|
| Yes | Yes | Search history (if entries exist) |
| Yes | No | Topic suggestions (existing, unchanged) |
| No | — | Nothing (existing, unchanged) |

### History dropdown layout

1. **"Recent searches" header** — small, muted, uppercase label at top
2. **History entries** — each row has a clock icon (left) and an "x" remove button (right, visible on hover)
3. **"Clear all" button** — at the bottom, only shown when 2+ entries exist, separated by a top border
4. **Scrolling** — container has `max-height` allowing 4 entries visible; older entries scroll

### Interaction

- **Click entry:** Populates search input with that text and triggers a search
- **Click "x":** Removes that entry, does not trigger a search (stops propagation)
- **Click "Clear all":** Removes all entries
- **Keyboard:** Existing ArrowUp/Down/Enter/Escape logic applies — history entries use the same `suggestionIndex` state

### When history is saved

A new entry is added when the user executes a search — pressing Enter or selecting a topic suggestion. Not on every keystroke.

## Styling

New CSS classes in `globals.css`:

**`.discover-history-header`** — "Recent searches" label. `font-size: 11px`, `color: var(--t3)`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.04em`, `padding: 8px 12px 4px`. Matches `.btb-mega-col-header` style.

**`.discover-history-item`** — Each history row. Same base styling as existing suggestion items. Flexbox with `justify-content: space-between`. Clock icon on left.

**`.discover-history-remove`** — "x" button. `opacity: 0` default, `opacity: 1` on parent hover. `color: var(--t3)`, no background, prevents click propagation.

**`.discover-history-clear`** — "Clear all" button. `font-size: 11px`, `color: var(--t3)`, centered, `border-top: 1px solid var(--border)`. Hover brightens to `var(--t2)`.

**Existing dropdown container** — gets `max-height: 280px` and `overflow-y: auto` added.

No changes to existing `.discover-suggestion` or `.discover-search` classes.

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useSearchHistory.ts` | New — hook implementation |
| `src/hooks/useSearchHistory.test.ts` | New — hook unit tests |
| `src/views/Discover.tsx` | Modified — dropdown logic for history vs suggestions |
| `src/styles/globals.css` | Modified — 4 new classes + max-height on dropdown |

## Testing

### Hook unit tests (`useSearchHistory.test.ts`)

- `add()` puts entry at front of list
- `add()` deduplicates — existing entry moves to front
- `add()` trims whitespace, ignores empty strings
- `add()` caps at 20 entries, drops oldest
- `remove()` removes single entry by value
- `clear()` resets to empty array
- Initializes from localStorage on mount
- Persists to localStorage on every mutation

### Integration tests (additions to `Discover.test.tsx`)

- Focusing empty input shows history dropdown with "Recent searches" header
- Focusing empty input with no history shows no dropdown
- Typing hides history, shows topic suggestions
- Clicking history entry populates search and triggers search
- Clicking "x" removes entry without triggering search
- Clicking "Clear all" removes all entries
- Executing a search adds query to history
