# Bucket Mega Menu Design

**Date:** 2026-04-03
**Status:** Approved

## Summary

Replace the six individual hover panels in `BucketTabBar` with a single unified full-width mega menu. The panel spans the full `discover-filter-row` width, shows all 6 buckets in columns simultaneously, and highlights the active column based on which tab is being hovered. Bucket tabs and sub-type items gain icons and bucket-color accents.

## Background

The current `BucketTabBar` opens a separate panel per bucket. Hovering "Dev Tools" shows only Dev Tools sub-types; hovering "AI & ML" closes that and opens AI & ML. The new design shows all six columns at once in a unified panel, so the user can scan the full taxonomy and select across buckets without the flicker of panels swapping.

## Architecture Change

The per-tab panel is removed. The unified panel must span the full width of `discover-filter-row`, but `BucketTabBar` only occupies the left portion of that row. Therefore:

1. `openBucketId` state and `closeTimerRef` are lifted from `BucketTabBar` into `Discover.tsx`
2. `BucketTabBar` becomes a pure tab strip — it receives `openBucketId`, `setOpenBucketId`, and `closeTimerRef` as props
3. A new `BucketMegaMenu` component is rendered as a sibling inside `discover-filter-row`, absolutely positioned to span the full row width
4. `.discover-filter-row` gets `position: relative` so `top: 100%; left: 0; right: 0` on the panel anchors correctly

```
discover-filter-row  (position: relative)
├── BucketTabBar     (tab buttons, hover handlers)
├── <right controls> (shields, Filters, Layout)
└── BucketMegaMenu   (absolute, top: 100%, left: 0, right: 0)
```

## Icon Data

A new file `src/constants/bucketIcons.ts` exports two mappings — one for bucket-level icons, one for sub-type icons. Using lucide-react components (already a project dependency). This keeps `repoTypes.ts` free of React imports.

```ts
// src/constants/bucketIcons.ts
import {
  Wrench, Brain, MonitorCode, BookOpen, Server, Layers,
  GitBranch, FlaskConical, Hammer, Package, ScanLine, AlignLeft, Bug, GitMerge,
  Bot, BarChart3, Database, BrainCircuit, Zap, Cpu, MessageSquare,
  FileCode, Monitor, TerminalSquare, NotebookPen, FileText,
  Code, BookMarked, ArrowLeftRight, Play,
  DatabaseZap, Box, Workflow, Cloud, Activity, Network,
  Terminal, Library, Globe, Plug, Copy, Puzzle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const BUCKET_ICONS: Record<string, LucideIcon> = {
  'dev-tools':       Wrench,
  'ai-ml':           Brain,
  'editors':         MonitorCode,
  'lang-projects':   BookOpen,
  'infrastructure':  Server,
  'utilities':       Layers,
}

export const SUB_TYPE_ICONS: Record<string, LucideIcon> = {
  // Dev Tools
  'algorithm':   GitBranch,
  'testing':     FlaskConical,
  'build-tool':  Hammer,
  'pkg-manager': Package,
  'linter':      ScanLine,
  'formatter':   AlignLeft,
  'debugger':    Bug,
  'vcs-tool':    GitMerge,
  // AI & ML
  'ai-model':     Bot,
  'ml-framework': BarChart3,
  'dataset':      Database,
  'neural-net':   BrainCircuit,
  'ai-agent':     Zap,
  'prompt-lib':   MessageSquare,
  // Editors & IDEs
  'code-editor': FileCode,
  'ide':         Monitor,
  'terminal':    TerminalSquare,
  'notebook':    NotebookPen,
  'text-editor': FileText,
  // Language Projects
  'lang-impl':   Code,
  'style-guide': BookMarked,
  'transpiler':  ArrowLeftRight,
  'runtime':     Play,
  'compiler':    Cpu,
  // Infrastructure
  'database':       DatabaseZap,
  'container':      Box,
  'devops':         Workflow,
  'cloud-platform': Cloud,
  'monitoring':     Activity,
  'networking':     Network,
  // Utilities
  'cli-tool':   Terminal,
  'library':    Library,
  'platform':   Globe,
  'api-client': Plug,
  'boilerplate': Copy,
  'plugin':     Puzzle,
}
```

## Component: `BucketTabBar` (modified)

**File:** `src/components/BucketTabBar.tsx`

**Props change:** `BucketTabBar` no longer owns `openBucketId` state or `closeTimerRef`. It receives them from the parent:

```ts
interface BucketTabBarProps {
  selected: string[]
  onChange: (selected: string[]) => void
  openBucketId: string | null
  setOpenBucketId: (id: string | null) => void
  closeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
}
```

The internal `BucketTab` sub-component is unchanged in structure — it still derives `open = openBucketId === bucket.id` and uses the shared timer. The per-bucket panel (`{open && <div className="btb-panel">...}`) is removed entirely. The tab wrapper `onMouseLeave` still schedules close via the shared timer.

**Tab visual changes:**
- Bucket icon (13px, `BUCKET_ICONS[bucket.id]`) rendered before the label inside the tab button
- Icon color: `bucket.color` when active, `var(--t3)` when inactive (inherits from button color)
- Label + count format unchanged: `"Dev Tools · 2"` when active

Tab button JSX:
```tsx
<button
  className={`btb-tab${isActive ? ' active' : ''}`}
  style={isActive || open ? { borderBottomColor: bucket.color, color: isActive ? 'var(--t1)' : 'var(--t2)' } : undefined}
>
  <BucketIcon size={13} style={{ marginRight: 5, flexShrink: 0, color: isActive ? bucket.color : 'inherit' }} />
  {label}
</button>
```

## Component: `BucketMegaMenu` (new)

**File:** `src/components/BucketMegaMenu.tsx`

**Props:**
```ts
interface BucketMegaMenuProps {
  activeBucketId: string | null
  selected: string[]
  onChange: (selected: string[]) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}
```

Renders when `activeBucketId !== null` (controlled by parent). `onMouseEnter` and `onMouseLeave` are the clear-timer and schedule-close functions from `Discover.tsx`.

**Panel container (`.btb-mega-panel`):**
- `position: absolute; top: 100%; left: 0; right: 0`
- `display: flex` — 6 equal-width columns
- `background: var(--bg2)`
- `border: 1px solid var(--border); border-top: none`
- `z-index: 150`

**Column (`.btb-mega-col`):**
- `flex: 1`
- `border-right: 1px solid var(--border)` (separates columns; last child has no border-right)
- `border-left: 3px solid transparent` — transitions to `bucket.color` when active
- Active column: `border-left-color: bucket.color`

**Column header (`.btb-mega-col-header`):**
- `display: flex; align-items: center; gap: 6px`
- `padding: 8px 10px`
- `font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em`
- `border-bottom: 1px solid var(--border)`
- Color: `bucket.color` when active column, `var(--t3)` when inactive
- Contains: bucket icon (13px) + bucket label

**Sub-type items (`.btb-item`, reuse existing class):**
- Existing `.btb-item` and `.btb-item.active` CSS is unchanged
- Add icon before label: sub-type icon (10px), colored `bucket.color`
- `gap: 6px` on the button (add `display: flex; align-items: center` to `.btb-item` if not already set)

Sub-type button JSX:
```tsx
<button
  key={sub.id}
  className={`btb-item${active ? ' active' : ''}`}
  style={active ? { borderLeftColor: bucket.color, paddingLeft: '8px' } : undefined}
  onClick={() => toggle(sub.id)}
>
  <SubIcon size={10} style={{ color: bucket.color, flexShrink: 0 }} />
  {sub.label}
</button>
```

## `Discover.tsx` changes

1. Import `useRef`, `useState` for the lifted state (already imported)
2. Add state and ref near other filter state:
   ```ts
   const [openBucketId, setOpenBucketId] = useState<string | null>(null)
   const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
   ```
3. Add helpers (usable inline in JSX or as named functions):
   ```ts
   function clearBucketTimer() {
     if (closeTimerRef.current !== null) {
       clearTimeout(closeTimerRef.current)
       closeTimerRef.current = null
     }
   }
   function scheduleBucketClose() {
     clearBucketTimer()
     closeTimerRef.current = setTimeout(() => setOpenBucketId(null), 150)
   }
   ```
4. Import `BucketMegaMenu` from `../components/BucketMegaMenu`
5. Add `position: relative` to `.discover-filter-row` CSS rule
6. Update filter row JSX:
   ```tsx
   <div className="discover-filter-row">
     <BucketTabBar
       selected={selectedTypes}
       onChange={setSelectedTypes}
       openBucketId={openBucketId}
       setOpenBucketId={setOpenBucketId}
       closeTimerRef={closeTimerRef}
     />
     <div style={{ display: 'flex', alignItems: 'center' }}>
       {/* existing right-side controls unchanged */}
     </div>
     {openBucketId !== null && (
       <BucketMegaMenu
         activeBucketId={openBucketId}
         selected={selectedTypes}
         onChange={setSelectedTypes}
         onMouseEnter={clearBucketTimer}
         onMouseLeave={scheduleBucketClose}
       />
     )}
   </div>
   ```

## CSS changes (`globals.css`)

1. Add `position: relative` to `.discover-filter-row`
2. Add `.btb-mega-panel` and `.btb-mega-col` and `.btb-mega-col-header` classes
3. Add `display: flex; align-items: center; gap: 6px` to `.btb-item` (for the icon)
4. Remove `.btb-panel` class (no longer used — per-bucket panels are gone)

`.btb-mega-panel`:
```css
.btb-mega-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  display: flex;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-top: none;
  z-index: 150;
}
```

`.btb-mega-col`:
```css
.btb-mega-col {
  flex: 1;
  border-right: 1px solid var(--border);
  border-left: 3px solid transparent;
  transition: border-left-color 0.12s;
  min-width: 0;
}
.btb-mega-col:last-child { border-right: none; }
```

`.btb-mega-col-header`:
```css
.btb-mega-col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  transition: color 0.12s;
}
```

## Tests (`BucketMegaMenu.test.tsx`)

Cover:
1. Renders all 6 column headers with correct bucket labels
2. Each column header shows the correct bucket icon (by test-id or aria)
3. Active column (`activeBucketId`) has `borderLeftColor` matching bucket color
4. Inactive columns have transparent/no colored left border
5. Clicking a sub-type calls `onChange` with toggled id
6. `onMouseEnter` and `onMouseLeave` are called on panel mouse events
7. Active sub-type item has correct styling

Updated `BucketTabBar.test.tsx`:
- Remove tests 3–7 that tested per-bucket panels (panel is now in BucketMegaMenu)
- Update test 1: verify icon is rendered in each tab button (getByRole query unchanged; icon adds no accessible name)
- Keep test 2 (no panel visible initially — now tests that `.btb-mega-panel` is absent)

Updated `Discover.test.tsx` `BucketTabBar integration` describe block:
- "hovering a bucket tab shows its sub-type panel" → now checks for `.btb-mega-panel` presence
- "clicking a sub-type adds it to the filter" → same assertion, still works

## File Change Summary

| Action | File |
|---|---|
| Create | `src/constants/bucketIcons.ts` |
| Create | `src/components/BucketMegaMenu.tsx` |
| Create | `src/components/BucketMegaMenu.test.tsx` |
| Modify | `src/components/BucketTabBar.tsx` — remove per-panel, add icon, receive state as props |
| Modify | `src/components/BucketTabBar.test.tsx` — remove panel tests, update for prop-controlled API |
| Modify | `src/views/Discover.tsx` — lift state, add BucketMegaMenu |
| Modify | `src/views/Discover.test.tsx` — update hover integration tests |
| Modify | `src/styles/globals.css` — add mega panel classes, update btb-item, add position:relative to filter row, remove .btb-panel |

## Out of Scope

- Keyboard navigation
- Clicking a bucket tab to select all sub-types in that bucket
- Animations on the panel opening (no slide/fade)
- Responsive collapse of the mega menu on narrow windows
