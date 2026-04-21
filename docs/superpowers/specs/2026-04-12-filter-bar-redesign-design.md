# Filter Bar Redesign

## Problem

The current filter system in the Discover view hides all filters behind a small icon button that opens a 7-tab dropdown panel. Users must click the icon, navigate tabs, configure options, and click "Apply" — too much friction for something used frequently. The Topics filter is unused.

## Design

Replace the tabbed filter dropdown with a persistent horizontal chip bar. Each filter category gets its own chip that opens a small popover on click. All filter changes apply instantly — no staging or Apply button.

### Filter Bar Layout

A single row containing:

```
[ Language ▾ ] [ Stars ▾ ] [ Activity ▾ ] [ License ▾ ] [ Verified ▾ ]     [ ⊞ | ☰ ]
```

- **Left side**: 5 filter chips in a row
- **Right side**: Layout toggle (grid/list icons)
- Sort modes are NOT in this bar — they stay in the existing SortDropdown in the toolbar
- Topics filter is removed entirely

### Chip States

**Inactive chip**: Gray background (`rgba(255,255,255,0.05)`), subtle border (`rgba(255,255,255,0.10)`), muted text (`var(--t3)`), chevron indicator.

**Active chip**: Transforms to show the selected value with a ✕ dismiss button. Uses accent color for most filters. Language chips use the language's own color (e.g. TypeScript blue `#3178c6`, Python blue `#3776ab`, Rust orange `#dea584`). Font-weight 500.

**Active filter bar example** (TypeScript + >1K stars + Official selected):
```
[ TS TypeScript ✕ ] [ ★ >1K ✕ ] [ 🛡 Official ✕ ] [ Activity ▾ ] [ License ▾ ]  Clear all  [ ⊞ | ☰ ]
```

"Clear all" text button appears when 1+ filters are active.

### Popovers

Each chip opens a popover anchored below it. Clicking outside closes the popover. All popovers use the same glass-style container: `rgba(18,18,24,0.95)` background, `rgba(255,255,255,0.12)` border, 10-12px border-radius, box-shadow.

#### Stars Popover
Simple list of radio options:
- Any
- 100+
- 1,000+
- 10,000+

Selected option shows accent color + checkmark. Click selects and closes popover.

#### Activity Popover
Simple list of radio options:
- Any time
- Last 7 days
- Last 30 days
- Last 6 months

Same selection behavior as Stars.

#### License Popover
Simple list of radio options:
- Any
- MIT
- Apache 2.0
- GPL 3.0

Same selection behavior as Stars.

#### Verified Popover
Two toggle options (multi-select):
- 🛡 Official (purple shield)
- 🛡 Likely Official (green shield)

Popover stays open for multi-select. Same behavior as current verification toggles.

#### Language Popover
The most complex popover. Three sections vertically:

**1. Category tabs (top)**
Horizontal tab bar with 8 categories, each with an icon:
- 🌐 Web: javascript, typescript, html, css, vue, svelte, coffeescript
- ⚙️ Systems: c, c++, c#, rust, go, zig, fortran, assembly
- ☕ JVM: java, kotlin, scala, clojure, groovy
- 📜 Script: python, ruby, php, perl, shell, powershell, lua
- λ Func: haskell, elixir, erlang, ocaml, elm
- 📱 Mobile: swift, dart
- 📊 Data: r, julia
- Other: nix, solidity

These categories match the existing groupings in `FilterDropdown.tsx`.

Active tab: accent underline + accent text + font-weight 600. Clicking a tab shows that category's languages below.

**2. Language buttons (middle)**
Flex-wrap grid of language buttons for the active category. Each button shows:
- The language's devicon (from `react-icons/si`, same icons already in the codebase via `src/lib/languages.ts`)
- Language name
- Border-radius 8px, padding 6px 12px

Unselected: subtle background + border, default text color.
Selected: uses the language's own color for background tint, border, and text. E.g. TypeScript selected → `rgba(49,120,198,0.2)` bg, `rgba(49,120,198,0.4)` border, `#3178c6` text.

Single-select — clicking a language selects it (and deselects any previous selection). Clicking the already-selected language deselects it. Popover stays open so the user can browse categories before closing.

**3. Selected summary (bottom)**
Bar at the bottom separated by a top border. Shows "Selected:" label followed by a pill chip for the active language using its language color with a ✕ dismiss button. If no language is selected, the summary bar is hidden.

### Layout Popover

Triggered by clicking the grid/list toggle icons on the right side of the filter bar. Contains:

- **Mode toggle**: Grid | List segmented control
- **Grid mode**: Column count selector (5-10)
- **List mode**: Density (Compact/Comfortable) + field visibility checkboxes (Description, Tags, Stats, Type badge, Verification badge)

All changes apply instantly. Preferences persist to localStorage (same key: `discover-layout-prefs`).

### Interaction Behaviors

- **Click inactive chip** → opens its popover below the chip
- **Select an option** → filter applies instantly, popover closes (except Language and Verified which support multi-select)
- **Click ✕ on active chip** → clears that filter, chip returns to inactive state
- **Click active chip label** (not ✕) → reopens popover to change the selection
- **Click outside popover** → closes it
- **ESC key** → closes any open popover
- **"Clear all" button** → resets all filters, all chips return to inactive
- **Only one popover open at a time** — opening a new one closes the previous

### What Gets Removed

- `DiscoverFilters.tsx` — the icon button wrapper (replaced by inline chips)
- `FilterDropdown.tsx` — the 7-tab panel (replaced by individual popovers)
- Topics filter and all related state/types
- The staging pattern (staged state, Apply button, Clear All in footer)
- Filter badge count display (no longer needed — active filters are visually obvious)
- `LayoutDropdown.tsx` — replaced by `LayoutPopover.tsx` (keep type exports like `LayoutPrefs`, `LayoutMode`, `ListDensity`, `ListFields` and move them to a shared types file or into `LayoutPopover.tsx`)

### What Gets Added

- `FilterBar.tsx` — the new horizontal chip bar component
- `FilterChip.tsx` — individual chip with inactive/active states and popover trigger
- `LanguagePopover.tsx` — the categorized language picker with tabs, devicons, colors, and summary
- `SimplePopover.tsx` — reusable popover for Stars, Activity, License, Verified (simple list of options)
- `LayoutPopover.tsx` — layout settings popover (extracted from the layout tab currently in `FilterDropdown.tsx`; replaces `LayoutDropdown.tsx` type exports if needed)

### State Management

Filter state stays in `Discover.tsx` as it is now, with these changes:
- Remove `filterDropdownOpen`, `filterDropdownInitialTab` state
- Remove `topics` from `SearchFilters` type
- Add `openPopover: FilterCategory | null` state to track which popover is open
- Remove staging pattern — filter changes call `setAppliedFilters` directly
- Language state: keep as single `activeLanguage: string` — the GitHub search API only supports one `language:` qualifier per query. The Language popover allows selecting only one language at a time (clicking a new language deselects the previous). The multi-select UI in the popover summary shows only the single active language. This matches current behavior.
- Verification state remains as `activeVerification: Set<'verified' | 'likely'>` (client-side filtering, unchanged)

### CSS

New styles in `globals.css` replacing the current `.fdd-*` and `.discover-filter-icon-btn` classes. Use the existing design tokens (`--bg`, `--bg2`, `--t1`, `--t2`, `--t3`, `--accent`, `--accent-soft`, `--accent-border`, `--accent-text`, `--radius-sm`).
