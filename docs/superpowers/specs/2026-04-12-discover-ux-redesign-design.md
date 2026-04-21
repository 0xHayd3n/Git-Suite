# Discover UX Redesign — Design Spec

## Problem

The Discover pages (Recommended, Most Popular, Most Forked, Rising) have three UX issues:

1. **Control bar clutter** — Search, view mode pills, bucket pills, expanded subtypes, and filter/layout buttons stack into 4-5 rows of controls, pushing content down.
2. **Card info density** — Cards use a 3:4 aspect ratio filled with dithered background. Useful info (name, stars, description) only appears on hover.
3. **Section sameness** — All four view modes look identical. No visual distinction between "curated picks" and "trending right now."

## Solution

Combine C's smart bar (unified single-row controls) with B's hybrid cards (dithered top + always-visible info bottom), plus per-section accent theming and adaptive card scaling for 5-10 columns.

---

## 1. Control Bar Consolidation

### Current: 4-5 rows
Search → View mode pills → Bucket pills → Expanded subtypes → Filter/Layout buttons

### New: 1-2 rows

**Row 1 — Smart Bar:**
A single horizontal bar containing, left to right:
- **Search input** — existing glass style (`rgba(255,255,255,0.05)` bg, `rgba(255,255,255,0.08)` border)
- Vertical divider (`1px`, `rgba(255,255,255,0.08)`)
- **Bucket segmented control** — all 8 bucket names as small pills in a `rgba(255,255,255,0.03)` container. Active bucket highlights with its color from `getBucketColor()` and a `rgba(color, 0.12)` tinted background. "All" pill resets selection.
- Vertical divider
- **View mode tabs** (Recommended, Popular, Forked, Rising) — same segmented style. Active tab uses its section accent color (see Section 3).
- **Filter and Layout** icon buttons at the end

**Row 2 — Subtype Chips (conditional):**
- Only renders when a bucket is selected
- Single horizontally-scrollable row of subtype chips from `REPO_BUCKETS[bucket].subTypes`
- Uses existing pill/chip styling with bucket color tint
- Disappears entirely when "All" is active → single-row control surface
- Animate appearance/disappearance with a slide-down/slide-up transition (preserve the existing height animation pattern from `BucketNav`)

### Overflow handling
The smart bar packs search + 9 bucket pills + 4 view mode tabs + 2 icon buttons into one row. On narrow windows the bucket segmented control should scroll horizontally within its container (overflow-x: auto, no wrapping). Bucket labels can be abbreviated at narrow widths (e.g., "Language Projects" → "Lang", "Editors & IDEs" → "Editors").

### Selection model
The current `BucketNav` supports multi-subtype selection via `selected: string[]` (array of subtype IDs). The new smart bar changes this to a **two-level model**: first select a bucket (single selection), then toggle subtypes within that bucket (multi-select via chips in row 2). Clicking a different bucket switches context. Clicking "All" clears both bucket and subtype selections. The `selectedTypes` state in `Discover.tsx` remains `string[]` of subtype IDs — the smart bar just constrains the UX to one bucket at a time.

### New component
Create a new `SmartBar.tsx` component that encapsulates the search input, bucket segmented control, view mode tabs, and filter/layout buttons. Props:
- `query`, `onQueryChange` — search input
- `activeBucket`, `onBucketChange` — single bucket ID or null
- `selectedSubTypes`, `onSubTypeChange` — string[] of subtype IDs within active bucket
- `viewMode`, `onViewModeChange` — active view mode key
- Filter/layout button click handlers

### Components affected
- `BucketNav.tsx` — replaced by `SmartBar.tsx` bucket segmented control
- `Discover.tsx` — inline view mode rendering (lines ~871-884, using `VIEW_MODES` from `discoverQueries.ts`) moves into `SmartBar.tsx`; top control area restructured to render `SmartBar` + conditional subtype chips
- `DiscoverFilters.tsx` / `FilterDropdown.tsx` — unchanged, just repositioned as buttons within `SmartBar`

---

## 2. Hybrid Card Redesign

### Current
3:4 aspect ratio, full dithered background, info only on hover overlay.

### New
Card splits into two zones. No hover required to see info.

**Top zone — Dithered header (~35-40% of card height):**
- Uses existing `useBayerDither` hook and `DitherBackground` component
- Same halftone effect from avatar URL or `getBucketGradient()` fallback
- Star count badge pinned bottom-right: `rgba(0,0,0,0.5)` bg, small pill
- Rising view: recency badge pinned top-left (e.g., "3 days old") with amber tint

**Bottom zone — Info panel (~60-65%):**
- Solid background using existing dark surface color (`--bg2`)
- Author row: avatar (15-16px, rounded) + owner name
- Repo name: bold, ~12-13px
- Description: 2-line clamp, `--t3` text color
- Tags: up to 2-3 small pills. Primary language tag tinted with bucket color, others use `rgba(255,255,255,0.05)`
- Stats footer: thin top border (`--border`), forks + issues in small muted text

**Hover behavior:**
- Existing `translateY(-2px)` lift
- Slight border brightness increase
- No content reveal — all info always visible

**Aspect ratio:**
- Drops strict 3:4 in favor of natural content height
- CSS grid `align-items: start` for row alignment

**Skeleton loading:**
- Skeleton cards should approximate the two-zone layout: a darker rectangle for the dither zone, then shimmer lines for name/description/tags below
- Replace the current fixed `height: 280` skeleton with the new proportioned layout

### Components affected
- `RepoCard.tsx` — restructured into two-zone layout; receives new `viewMode` prop to control badge positions and accent color
- `DiscoverGrid.tsx` — passes `viewMode` to each `RepoCard`; emits `data-cols` attribute; handles featured card spanning for Recommended view; sets `align-items: start` on grid
- `DitherBackground.tsx` — used as-is, just sized to top zone
- `globals.css` — `.repo-card` styles updated, skeleton styles updated

---

## 3. Section Identity — Per-View-Mode Theming

### Accent colors
Each view mode gets a distinct accent applied to card borders and the active smart bar tab:

| View Mode | Color | Hex | Rationale |
|-----------|-------|-----|-----------|
| Recommended | Violet | `#8b5cf6` | Existing `--accent`, editorial/curated feel |
| Most Popular | Blue | `#60a5fa` | Stable, established |
| Most Forked | Teal | `#14b8a6` | Community/collaboration |
| Rising | Amber | `#f59e0b` | Energy, newness |

### How accent applies
- Card borders: `1px solid rgba(accentColor, 0.12)` — replaces the default `var(--border)` on cards entirely (not layered)
- Active view mode tab: background `rgba(accentColor, 0.12)`, text `accentColor`
- Active bucket pill: uses `getBucketColor()` independently (not the section accent)
- The accent color comes from the current view mode, not the individual card's bucket

### Badge positions per view mode

| View Mode | Bottom-right badge | Top-left badge |
|-----------|-------------------|----------------|
| Recommended | ⭐ stars | — |
| Most Popular | ⭐ stars | — |
| Most Forked | ⑂ forks | — |
| Rising | ⭐ stars | 🔥 "X days old" (amber) |

### Layout variation per section

**Recommended:**
- First 3 repos render as "featured" cards spanning 2 columns each (using `grid-column: span 2`) — wider but same height as normal cards. At 5 columns: 2 featured (4 cols) + 1 normal (1 col). At 6 columns: 3 featured fill the row perfectly. At 7-10 columns: 3 featured cards (6 cols) + remaining columns in the featured row left empty (CSS grid handles this naturally).
- Featured cards always use the full 5-6 column card density (2-line description, all tags) regardless of column count
- Remaining repos flow in the normal grid below
- Gives an editorial, curated feel distinct from other views

**Most Popular:**
- Standard grid layout, star count prominent in badge position
- This is the baseline layout

**Most Forked:**
- Fork count moves to the badge position (bottom-right of dithered zone) instead of stars
- Stars move to the stats footer

**Rising:**
- Recency badge (top-left of dithered zone): "X days old" with amber tint
- Recency stat in stats footer alongside stars/forks (created date or relative age)
- **Prerequisite:** `created_at` exists in `RepoRow` type and DB schema but is never populated — `GitHubRepo` interface in `electron/github.ts` does not include it. Implementation must add `created_at` to the `GitHubRepo` interface and map it through to DB storage. The GitHub API already returns this field.

---

## 4. Adaptive Card Scaling (5-10 Columns)

Same component, CSS-driven via a `data-cols` attribute on the grid container.

### 5-6 columns (full)
- Full hybrid card: dithered top, all info visible
- Author row, name, 2-line description, 2-3 tags, stats footer (stars, forks, issues)

### 7-8 columns (compact)
- Description: 1-line clamp (down from 2)
- Tags: max 2 shown
- Stats footer: stars and forks only (issues dropped)
- Dithered zone slightly shorter

### 9-10 columns (minimal)
- Description: hidden entirely
- Tags: primary language pill only
- Stats footer: stars only
- Author row: avatar only (no text)
- Card is: dither + name + language + stars

### Implementation
- Grid container renders `data-cols={columns}` attribute alongside the existing inline `gridTemplateColumns` style (which sets the actual column count). `data-cols` is a CSS selector hook only — it does not set column count.
- CSS selectors: `.discover-grid[data-cols="7"] .repo-card`, etc.
- Could also use container queries if preferred, but `data-cols` is simpler and matches the explicit column preference

---

## 5. Existing Styles Preserved

The following existing design tokens and components must be used (not replaced):

- **Glass morphism**: `rgba(18,18,24,0.85)`, `backdrop-filter: blur(24px)`, `border: 1px solid rgba(255,255,255,0.12)` — for dropdowns, filter panel, suggestions
- **Dithered backgrounds**: `useBayerDither` hook + `DitherBackground` component — for card top zone
- **Theme tokens**: `--bg`, `--bg2`, `--bg3`, `--t1`, `--t2`, `--t3`, `--border`, `--border2`, `--accent`, `--shadow-sm`, `--shadow-md`
- **Bucket colors**: `getBucketColor()`, `getBucketGradient()`, `getSubTypeConfig()` from config
- **Animations**: existing `card-in` keyframes (opacity + translateY), hover `translateY(-2px)` lift
- **Card shimmer**: existing skeleton loading with shimmer animation

---

## 6. Components Not Changing

- `FilterDropdown.tsx` — internal UI unchanged, just repositioned in smart bar
- `LayoutDropdown.tsx` — unchanged (already supports 5-10 columns)
- `DiscoverSuggestions.tsx` — unchanged, anchors below search input
- `RepoListRow.tsx` — list view unchanged
- `DiscoverGrid.tsx` list mode — list rendering unchanged (grid mode updated per Section 2)
- Keyboard navigation (`useKeyboardNav`) — unchanged
- State persistence (`discoverStateStore`) — unchanged
- Data fetching / search modes — unchanged
