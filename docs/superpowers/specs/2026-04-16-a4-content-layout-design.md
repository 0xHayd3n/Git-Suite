# A4 Content Layout with Standalone TOC Panel

## Summary

Restructure the repo detail view so the main content panel has a fixed A4 width (~794px), and the README table-of-contents ("On This Page") becomes its own standalone glass panel to the left of the content. Inspired by the Twitter/X Articles layout: left nav | centered content column | right sidebar.

## Current State

The repo detail view is a two-panel flex layout:

```
[ Article Panel (flex: 1)                    ]  [ Sidebar (220px) ]
  ┌──────────────────────────────────────────┐  ┌────────────────┐
  │ Byline / Title / Tabs                    │  │ Stats          │
  │──────────────────────────────────────────│  │ Repository     │
  │ ┌─1fr──┐ ┌──620px──┐ ┌─1fr──┐           │  │ Topics         │
  │ │ TOC  │ │ README  │ │      │           │  │ Related        │
  │ │(grid)│ │ content │ │      │           │  │                │
  │ └──────┘ └─────────┘ └──────┘           │  └────────────────┘
  └──────────────────────────────────────────┘
```

- Article panel: `flex: 1`, grows to fill available width
- README body: 3-column CSS grid (`1fr 620px 1fr`), TOC in left `1fr` margin
- TOC: sticky-positioned, 200px wide, inside the grid's left column
- Sidebar: fixed 220px

### Key files

| File | What | Lines |
|------|------|-------|
| `src/views/RepoDetail.tsx` | Layout shell, sidebar content | 993–1044 (layout), 1445–1744 (sidebar) |
| `src/components/ReadmeRenderer.tsx` | TocNav component, rm-body-row grid | 726–857 (TocNav), 1647–1659 (grid) |
| `src/components/ArticleLayout.tsx` | Generic article wrapper | 15–37 |
| `src/styles/globals.css` | All layout CSS | 2344–2385 (panels), 3155–3251 (grid/toc) |

## Target State

```
[ TOC (200px) ]  [ Content Panel (794px)  ]  [ Sidebar (220px) ]
┌──────────────┐  ┌───────────────────────┐  ┌────────────────┐
│ On this page │  │ Byline / Title / Tabs │  │ Stats          │
│              │  │───────────────────────│  │ Repository     │
│ Installation │  │                       │  │ Topics         │
│ Docs         │  │   README content      │  │ Related        │
│ Examples     │  │   (full panel width   │  │                │
│ Contributing │  │    with padding)      │  │                │
│              │  │                       │  │                │
└──────────────┘  └───────────────────────┘  └────────────────┘
                        centered group
```

Three-panel flex layout on README tab. TOC collapses on other tabs:

```
                 [ Content Panel (794px)  ]  [ Sidebar (220px) ]
                 ┌───────────────────────┐  ┌────────────────┐
                 │ Byline / Title / Tabs │  │ Stats          │
                 │───────────────────────│  │ Repository     │
                 │                       │  │ Topics         │
                 │   Files / Releases /  │  │ Related        │
                 │   other tab content   │  │                │
                 │                       │  │                │
                 └───────────────────────┘  └────────────────┘
                        centered group
```

## Design Decisions

### Content panel width: 794px

A4 paper at 96 DPI is 793.7px wide. We round to 794px. This replaces the current `flex: 1` article panel with a fixed-width panel, matching the Twitter/X Articles feel.

### TOC as standalone glass panel

The TOC moves out of the README grid and into its own panel with the same glass-morphism styling as the content and sidebar panels (semi-transparent dark background, 24px blur, 12px border-radius, 1px border).

- Width: 200px (same as current TOC)
- Independently scrollable
- Sticky behavior moves from CSS sticky to the panel itself scrolling internally
- Only rendered on the README tab

### Header stays in content panel

Byline, repo title, and tab row remain inside the content panel. The TOC panel sits beside the content panel at the same vertical level, not above or below the header.

### TOC collapse on non-README tabs

When switching away from the README tab, the TOC panel is not rendered. The content panel stays at 794px fixed width — it does not expand to fill the vacated space. The two remaining panels (content + sidebar) stay centered.

### README body layout change

The current 3-column grid (`1fr 620px 1fr`) inside `.rm-body-row` is replaced. Since the content panel is now 794px fixed and the TOC is external, the README content fills the panel width with horizontal padding (~24px each side), giving ~746px of content width — wider than the current 620px and closer to comfortable A4 reading width.

### Right sidebar unchanged

The sidebar panel stays at 220px with all existing sections (Stats, Repository, Topics, Related Repos, etc.) unchanged.

### Centering strategy

The outer `.repo-detail-layout` container uses `justify-content: center` to center the panel group horizontally. The total width at maximum is: 200 + 20 + 794 + 20 + 220 = 1254px (panels + gaps). This fits comfortably in most windows.

## Component Changes

### RepoDetail.tsx

1. **Add TOC panel to layout**: Insert a new `div.repo-detail-toc-panel` before the article panel, conditionally rendered when `activeTab === 'readme'` and TOC data is available (non-empty heading list).
2. **Hoist TOC data via callback**: ReadmeRenderer gets an `onTocReady(headings: TocItem[])` callback prop. RepoDetail stores the heading list in state and renders TocNav in the external panel. See timing notes below.
3. **Pass scroll container ref to TocNav**: RepoDetail creates a ref pointing to `.article-layout-body` (the scrollable README container) and passes it to TocNav as `scrollContainerRef`. A second ref for the headings container (`.readme-body` inside ReadmeRenderer) is passed as `headingsContainerRef`. See "Scroll spy adjustment" for details.
4. **Change article panel CSS**: From `flex: 1` to `width: 794px; flex-shrink: 0`.

### ReadmeRenderer.tsx — Exports and extraction

The following must be extracted from ReadmeRenderer and made available to RepoDetail:

- **`TocItem` interface** (currently line 721): Export it so RepoDetail can type the heading state.
- **`TocNav` component** (currently lines 726–857): Export as a named export. It is currently `memo`-wrapped with no `export` keyword.
- **`scrollTargetIntoView` helper** (currently line 42): Used by TocNav's click handler. Export it alongside TocNav.

Other changes:

1. **Add `onTocReady` callback prop**: Called from the existing heading-extraction `useEffect` (currently inside TocNav, lines 739–804). When TocNav is extracted, ReadmeRenderer needs its own `useEffect` that queries `containerRef.current.querySelectorAll('h2[id], h3[id]')` after markdown renders, builds the `TocItem[]` list, and calls `onTocReady`. Memoize with shallow comparison of heading IDs to avoid infinite re-render loops (see timing note below).
2. **Remove TocNav from rm-body-row**: TocNav no longer renders inside the README grid.
3. **Remove 3-column grid**: `.rm-body-row` becomes a simple block container. `.rm-content` no longer needs `grid-column: 2`.
4. **Note on `containerRef`**: This ref is created internally at line 1008 as `useRef(null)` — it is NOT a prop. It will continue to be used internally for heading extraction. RepoDetail does not need access to it; instead, the `onTocReady` callback passes the data out.

### `onTocReady` timing

`onTocReady` is called from a `useEffect` that runs after ReactMarkdown renders and the DOM is populated with headings. This triggers a state update in RepoDetail, which re-renders the parent. To avoid an infinite loop:

- The heading extraction effect should compare the new heading list against the previous one (by ID array) using a `useRef` cache. Only call `onTocReady` when the list actually changes.
- RepoDetail should memoize the `onTocReady` callback with `useCallback` so it doesn't cause unnecessary effect re-runs in ReadmeRenderer.

### globals.css

1. **`.repo-detail-layout`**: Add `justify-content: center`.
2. **`.repo-detail-article-panel`**: Change from `flex: 1` to `width: 794px; flex-shrink: 0`.
3. **New `.repo-detail-toc-panel`**: Glass-morphism panel matching sidebar styling, 200px wide, `flex-shrink: 0`, internal scroll with hidden scrollbar, `align-self: stretch` to match content panel height.
4. **`.rm-body-row`**: Remove `display: grid` and `grid-template-columns`. Become a simple block.
5. **`.rm-content`**: Remove `grid-column: 2`. The existing `padding: 20px 22px` from `.article-layout-body` (in `ArticleLayout.css` line 87) provides the horizontal padding. Set `.rm-content` padding to `24px 0 32px` (vertical only) to avoid double-padding.
6. **`.rm-toc`**: Remove grid positioning (`grid-column`, `justify-self`, `position: sticky`, `top`, `max-height`). The TOC panel itself handles scroll; the nav fills the panel with simple padding.
7. **Remove** the `1fr 620px 1fr` grid entirely.
8. **Responsive breakpoint**: Add `@media (max-width: 1300px) { .repo-detail-toc-panel { display: none; } }` to hide the TOC panel on narrow viewports where the three-panel layout would be too cramped.

### Scroll spy adjustment

TocNav's scroll spy currently does two things from a single `containerRef`:
- Walks the DOM upward from `containerRef.current.parentElement` to find the scroll container
- Queries `h2[id], h3[id]` from `containerRef.current` to find headings

Once TocNav moves to the external TOC panel, it lives in a different DOM subtree from the content. The automatic ancestor walk would find the TOC panel's own scroll container, not the article body.

**Solution**: TocNav accepts two refs:
- `scrollContainerRef: RefObject<HTMLElement>` — points to `.article-layout-body` (the scrollable area in the content panel). RepoDetail creates this ref and attaches it to the article body element.
- `headingsContainerRef: RefObject<HTMLElement>` — points to `.readme-body` inside ReadmeRenderer. ReadmeRenderer exposes this via a `ref` prop or `forwardRef`, or RepoDetail queries for it after mount.

The scroll spy effect uses `scrollContainerRef.current` for scroll event listening and `headingsContainerRef.current.querySelectorAll('h2[id], h3[id]')` for heading positions. This replaces the current DOM-walking approach.

### Tab-switch content shift

When the TOC panel appears/disappears on tab switch, the content panel shifts horizontally by ~110px (half of the 200px + 20px gap). This is acceptable — the shift is expected since the user is switching tabs and the layout is clearly changing. No animation needed; the instant appearance/disappearance is consistent with how the tab content already swaps instantly.

### TTS unaffected

The `useTtsReader` hook finds its scroll parent via `containerRef.current?.closest('.article-layout-body')`. Since the `.readme-body` div (and its `containerRef`) remain inside the article panel, TTS playback and heading-based navigation continue to work without changes.

## Edge Cases

- **Short READMEs with < 2 headings**: TocNav already returns null in this case. The TOC panel should also not render — RepoDetail checks `tocHeadings.length >= 2` before rendering the panel. No empty glass panel.
- **Narrow windows (< 1300px)**: The TOC panel is hidden via media query. Layout falls back to two-panel (content + sidebar), identical to non-README tabs.
- **Very long TOC lists**: The TOC panel scrolls independently. No layout impact.
- **Minimum viewport for two-panel mode**: 794 + 20 + 220 + 32 = 1066px. Comfortable on any modern display.
