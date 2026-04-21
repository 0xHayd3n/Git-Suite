# Repo Detail UI Refinements Design

**Date:** 2026-04-16
**Status:** Draft

## Summary

Four coordinated refinements to the expanded repo view (`RepoDetail`):

1. **Nav bar trim-down** — remove the Home, Refresh, and Forward buttons from `NavBar`; keep only the Back button. Restyle the breadcrumb as a flat band (no pill), using `ChevronRight` separators.
2. **Action row restyle** — rename the download trigger to "Clone", give it a `GitBranch` icon, and place it as a secondary button next to Learn. Restyle the Star button as icon + star count (no pill), recoloring both to gold (`#e3b341`) when the repo is starred.
3. **Inline clone options panel** — replace the portal-based `DownloadDropdown` with an inline `CloneOptionsPanel` that expands between the action row and tabs. Flush with the page background (no border, no fill, no radius). Open/close is driven only by the Clone button toggle.
4. **Sidebar simplification** — remove all dividers from the right panel; rely on spacing for section separation. Remove the now-redundant Stars count from the STATS block (since the action-row Star button carries the number).

All changes are confined to `src/components/NavBar.tsx`, `src/views/RepoDetail.tsx`, a new `src/components/CloneOptionsPanel.tsx` (replacing `src/components/DownloadDropdown.tsx`), and `src/styles/globals.css`.

## Current State

### Nav bar (`src/components/NavBar.tsx:160–212`)

Top bar contains four leading icon buttons — Back (`ChevronLeft`), Forward (`ChevronRight`), Refresh (`navigate(0)`), Home (navigate to `/discover`) — followed by a centered breadcrumb rendered inside a pill container (`.app-navbar-url-segment` in `globals.css`). Breadcrumb segments are separated by `/` text characters.

### Action row (`RepoDetail.tsx:1812–1899`)

`RepoArticleActionRow` currently renders: **Learn** (primary, class `.article-action-btn--primary`), **Star** (class `.article-action-btn` + `.article-action-btn--starred` when active, with a background pill treatment in the active state), and a **download options** chevron trigger that opens `DownloadDropdown` as a portal-positioned popup.

The Star button today does not show a count — the star count lives only in the sidebar STATS row at line 1478.

### Download dropdown (`src/components/DownloadDropdown.tsx`)

Portal-rendered popup with fixed positioning anchored to its trigger. Contains:

- HTTPS / SSH / GitHub CLI clone URL tabs with a read-only URL display and copy button
- "Open with GitHub Desktop" action
- Downloads: ZIP, PDF, EPUB, DOCX, Bookmarks (each with icon, label, and async `itemStates` for download progress)
- "Download folder" expandable subsection at the bottom

Internal state: `open`, `itemStates`, `cloneTab`. Styled via `.dl-dropdown__*` classes in `globals.css:4937–5089`.

### Right sidebar panel (`RepoDetail.tsx:1468–1782`)

Six sections, each preceded by `<SidebarLabel>` and separated by `<SidebarDivider />`:

1. **STATS** (line 1475–1507) — Stars, Forks, Issues, Version
2. **Skills Folder** (line 1511–1629) — interactive depth bars + buttons
3. **Repository** (line 1634–1668) — License, Size, Watchers, Default Branch, "View on GitHub"
4. **Packages / Quality / Community / Badges** (line 1671–1711) — badge pills extracted from README
5. **Topics** (line 1714–1731) — clickable topic tags
6. **Related repos** (line 1736–1779) — three cards

Dividers use the `SidebarDivider()` component at `RepoDetail.tsx:411–413` — a 1 px border in `var(--border)`.

## Proposed State

### Change 1: Nav bar

**File:** `src/components/NavBar.tsx`

- Remove the JSX and handlers for **Home**, **Refresh**, and **Forward** buttons (lines 160–194 region). Remove the `Home` and `RotateCw` (or equivalent) lucide imports used only for these buttons. Keep `ChevronRight` — it's reused for the new breadcrumb separators below.
- Keep the Back button (`ChevronLeft`) at the far left of the bar, unchanged.
- Layout of the bar becomes: `[Back]  ———— spacer ————  [breadcrumb]  ———— spacer ————`, with the breadcrumb centered in the remaining space (matching current visual centering).

**Breadcrumb restyle (`NavBar.tsx:196–212` + `globals.css`)**

- The pill container (`.app-navbar-url-segment`) is replaced by a flat band:
  - `border-radius: 0` (no rounded pill)
  - `border: none`
  - `background: rgba(255, 255, 255, 0.03)` (or equivalent token — a faint region marker, not a defined chip)
  - Inner padding unchanged
- `/` text separators are replaced with `<ChevronRight size={12} />` icons in `var(--t3)` color, with a small horizontal gap on either side.
- Segment text + leading icons (Git Suite logo, repo avatar) keep their existing rendering. Hover state on clickable segments is preserved.

### Change 2: Action row restyle

**File:** `src/views/RepoDetail.tsx` (`RepoArticleActionRow`, lines 1812–1899)

Action row becomes, left to right: **Learn · Clone · Star**.

**Learn button** — unchanged. Same states, same styling, same handlers.

**Clone button (new)** — replaces the current download chevron trigger.

- Class: `.article-action-btn` (same base as Star — the non-primary variant)
- Content: `<GitBranch size={14} />` icon + text "Clone"
- Click handler toggles a new `cloneOpen` boolean in the parent `RepoDetail` component's UI state.
- `aria-expanded={cloneOpen}` so assistive tech reflects the panel state.
- When `cloneOpen === true`, the button gets a subtle visual "active" cue (text color lifted to `--t1`) so it's clear which state the panel is in. No background fill change.

**Star button (restyled)**

- Class: `.article-action-btn` (same base). The `.article-action-btn--starred` modifier class and its current background pill treatment are **deleted** from `globals.css`.
- Content: `<Star size={14} />` icon + `formatCount(repo.stargazers_count)` text (e.g., `455.8k`).
- Click handler unchanged — still calls existing `handleStar()` which invokes `window.api.github.starRepo` / `unstarRepo`.
- When `starred === true`:
  - `<Star>` icon renders with `fill="#e3b341"` and `stroke="#e3b341"`
  - Count text color: `#e3b341`
  - Button background remains transparent
- When `starred === false`:
  - Outline `<Star>` icon (default stroke color `--t2`)
  - Count text color: `--t2`

The star count source is `repo.stargazers_count` (same field the sidebar reads today). With Change 4 removing it from the sidebar, this becomes its sole display.

### Change 3: Inline clone options panel

**New file:** `src/components/CloneOptionsPanel.tsx`

A new focused inline component that absorbs the content logic of `DownloadDropdown` without its portal/positioning wrapper.

**Interface**

```ts
export type CloneOptionsPanelProps = {
  repo: RepoSummary  // same repo type the dropdown receives today
  open: boolean
}
```

When `open === false`, the component returns `null` — no empty slot, no animation placeholder, no layout space reserved.

When `open === true`, it renders a `<section className="clone-panel">` containing the four content blocks (below).

**Placement**

In `RepoDetail.tsx`, render `<CloneOptionsPanel open={cloneOpen} repo={repo} />` as a direct sibling between the action row and the tabs row inside the `ArticleLayout` top panel. This requires extending `ArticleLayout` if no slot exists for post-action-row content — see "ArticleLayout integration" below.

**Visual style (`.clone-panel` in `globals.css`)**

- No `background-color` (inherits page)
- No `border`
- No `border-radius`
- No `box-shadow`
- Vertical padding: `var(--space-4)` top and bottom
- Horizontal padding: matches the article body's horizontal padding so content aligns with the title and action row above it
- Internal block gap: `var(--space-3)` between the four content blocks

**Content, top to bottom**

1. **Clone URL row** — tab strip with three text tabs (HTTPS / SSH / GitHub CLI). Active tab uses a text color + underline treatment (no pill/chip). Below the tabs: a read-only `<input>` containing the URL for the active tab, and a copy button that triggers the existing copy-to-clipboard flow. No card, no border around the input — just text-styled input with a subtle bottom border.
2. **"Open with GitHub Desktop"** — a single action row (icon + label) that invokes the existing `x-github-client://openRepo/...` handler.
3. **Downloads block** — a simple list of clickable items: ZIP, PDF, EPUB, DOCX, Bookmarks. Each item is an icon + label row; no dividers between items, just `gap: var(--space-2)`. Uses the existing `itemStates` map and download handlers from `DownloadDropdown`.
4. **Download folder** — the existing expandable subsection at the bottom, kept functionally but re-skinned to match the flat style (indent-based nesting, no inner boxes).

**Open/close behavior**

- State: `const [cloneOpen, setCloneOpen] = useState(false)` in `RepoDetail`.
- Toggle: Clone button click calls `setCloneOpen(v => !v)`.
- Closing is **only** via the Clone button toggle — no outside-click handler, no Escape key handler, no internal close button.
- State persists across tab switches within the same repo page (it's part of the repo's UI state). If the user navigates to a different repo, the new `RepoDetail` instance starts with `cloneOpen = false` as the default.

**ArticleLayout integration**

`ArticleLayout` currently sequences: `navBar → byline → dither → title → description → action row → tabs → body`. A new optional slot `actionRowExtras?: React.ReactNode` is inserted between `actionRow` and `tabs`:

```ts
export type ArticleLayoutProps = {
  // ...existing props
  actionRow: React.ReactNode
  actionRowExtras?: React.ReactNode  // NEW — rendered between action row and tabs
  tabs: React.ReactNode
  // ...
}
```

`RepoDetail` passes `<CloneOptionsPanel open={cloneOpen} repo={repo} />` as `actionRowExtras`.

**Cleanup**

- `src/components/DownloadDropdown.tsx` — deleted after confirming no other caller uses it. The exploration found only `RepoDetail` as a call site; during implementation, a `grep` for `DownloadDropdown` confirms this before deletion.
- `.dl-dropdown__*` CSS in `globals.css:4937–5089` — deleted alongside the component.

### Change 4: Sidebar simplification

**File:** `src/views/RepoDetail.tsx` (lines 1468–1782)

- Remove every `<SidebarDivider />` call inside the sidebar panel. (The `SidebarDivider` component itself at lines 411–413 stays defined in case other callers exist — confirmed during implementation via grep; deleted only if orphaned.)
- Wrap the sidebar sections in a container with `gap: var(--space-6)` (or whatever vertical-rhythm token the design system uses for major section separation) so visual separation comes from space rather than lines.
- Remove the Stars line at `RepoDetail.tsx:1478` (the star icon + formatted count inside STATS). The STATS section becomes: Forks, Issues, Version.
- All `<SidebarLabel>` uppercase headers (STATS, REPOSITORY, COMMUNITY, TOPICS, etc.) are kept.
- Skills Folder, Topics, and Related repos sections are untouched.

## File-level change summary

| File | Change |
|---|---|
| `src/components/NavBar.tsx` | Remove Home/Refresh/Forward buttons + handlers; swap `/` breadcrumb separators for `<ChevronRight>` icons |
| `src/components/ArticleLayout.tsx` | Add optional `actionRowExtras` prop rendered between action row and tabs |
| `src/views/RepoDetail.tsx` | Replace download trigger with Clone button; restyle Star button (icon + count + gold active); add `cloneOpen` state; pass `<CloneOptionsPanel>` to `actionRowExtras`; remove sidebar dividers; remove Stars row from STATS |
| `src/components/CloneOptionsPanel.tsx` | **New** — inline clone/download options panel |
| `src/components/DownloadDropdown.tsx` | **Deleted** (after confirming orphaned) |
| `src/styles/globals.css` | Restyle `.app-navbar-url-segment` as flat band; remove `.article-action-btn--starred` pill treatment; add Star gold-state styles; add `.clone-panel` styles; remove `.dl-dropdown__*` styles; add sidebar section gap |

## Out of scope

- **Animations** on clone panel open/close — the panel simply appears/disappears. No height-transition animation in this spec.
- **Keyboard shortcuts** (e.g., `c` to open clone panel) — not requested.
- **Mobile/narrow-viewport adaptations** of the inline clone panel — the current dropdown's mobile behavior (if any) is preserved as-is by not shrinking below the current breakpoint; narrow-viewport redesign is a separate effort.
- **Persistence** of `cloneOpen` across navigation — intentionally reset per `RepoDetail` mount.
- **Outside-click or Escape to close** — explicitly excluded per design decision Q3.

## Open questions

None — all design decisions resolved during brainstorming.
