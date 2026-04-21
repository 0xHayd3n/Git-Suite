# Type Filter Dropdown Design

**Date:** 2026-04-01
**Status:** Approved

## Summary

Replace the horizontal type filter chip row on the Discover page with a "Type" dropdown trigger that sits inline with the sort tabs (Most Popular / Most Forked / Rising). The dropdown preserves multi-select behavior and matches the visual language of the existing tab row.

## Background

The Discover page currently renders type filter chips (Awesome List, Learning, Framework, Tool, Application, Other) as a separate row below the sort tabs, styled as rounded pill buttons. This feels visually disconnected from the sort tabs and scales poorly as more types are added. The Languages button on the right side already uses a dropdown pattern; unifying the type filter as a dropdown cleans up the layout and reduces visual noise.

## Design

### Layout

The `.discover-view-row` div has three zones: Zone A (`.discover-view-tabs` — the sort tabs), Zone B (`.discover-type-tabs` — the type chips, being removed), and Zone C (`.discover-zone-c` — the filter icon and Languages button).

- Remove Zone B (`.discover-type-tabs`) entirely from `Discover.tsx`.
- Render `<TypeDropdown>` as a direct child of `.discover-view-row`, positioned after Zone A (`.discover-view-tabs`) and before Zone C (`.discover-zone-c`).
- The TypeDropdown trigger button uses the existing `.view-tab` class (same font, bottom-border underline on active state) so it blends visually with the sort tabs.
- When one or more types are selected, a count badge (reusing `.filter-badge` styling) appears on the button and the active underline is shown.
- When no types are selected (`activeTypes.size === 0`), the button shows no badge and no underline — this means "show all" (existing behavior preserved).
- A small `▾` chevron icon sits to the right of the label.

### Dropdown Panel

- `typeDropdownOpen` boolean state is owned **internally** by `TypeDropdown` (not in `Discover.tsx`).
- Clicking the trigger button toggles the panel open/closed.
- The panel is absolutely positioned, dropping directly below the button, left-aligned to the button.
- The panel contains a vertical list of all 6 type options from `REPO_TYPE_CONFIG`: Awesome List, Learning, Framework, Tool, Application, Other.
- Each row renders: type icon on the left (if not null — the "Other" type has `icon: null` and renders no icon, just the label), label text, and a checkmark on the right when that type is in `activeTypes`.
- Clicking a row calls `onToggle(type)` — live filtering, no apply step.
- The panel closes on: (a) click outside via a `useEffect` document click handler, (b) pressing Escape via a `useEffect` keydown handler. No backdrop overlay.
- No apply/clear footer.

### Empty State

When `activeTypes.size === 0`, all repos are shown (existing behavior in `Discover.tsx` line ~618: `activeTypes.size === 0` is treated as "no filter"). The dropdown trigger shows no badge in this state. There is no "clear" button needed.

### Component Structure

Extract a `TypeDropdown` component to keep `Discover.tsx` clean.

**File:** `src/components/TypeDropdown.tsx`

**Props:**
```typescript
interface TypeDropdownProps {
  activeTypes: Set<RepoType>
  onToggle: (type: RepoType) => void
}
```

**Imports:**
- `RepoType` from `src/lib/classifyRepoType.ts`
- `REPO_TYPE_CONFIG` from `src/config/repoTypeConfig.ts`

The component owns `typeDropdownOpen` internally. It reads `REPO_TYPE_CONFIG` for labels, icons, and accent colors.

### Changes to `Discover.tsx`

| Change | Detail |
|--------|--------|
| Extract inline toggle logic | Pull the `setActiveTypes` callback from the `.discover-type-tabs` render block into a named `handleTypeToggle` function |
| Remove `.discover-type-tabs` render block | Entire Zone B section removed |
| Add `<TypeDropdown>` | Rendered as sibling after `.discover-view-tabs` div, inside `.discover-view-row`, passing `activeTypes` and `handleTypeToggle` |

No changes to the `activeTypes` state type, filtering logic, or grid display.

### CSS

New classes in `globals.css`:

| Class | Purpose |
|-------|---------|
| `.type-dropdown-panel` | Absolute positioned card; white bg, border, shadow, `z-index` above grid |
| `.type-dropdown-item` | Row in the panel; flex, icon + label + checkmark, hover state |

The `.view-tab` class is reused as-is on the trigger button. The `.filter-badge` class is reused as-is for the count badge. The existing `.discover-type-tabs` and `.type-tab` CSS classes become dead code and can be removed.

## Out of Scope

- The Languages dropdown is not changed.
- The FilterDropdown (advanced filters) is not changed.
- No changes to repo type classification logic (`classifyRepoType.ts`, `repoTypeConfig.ts`).
