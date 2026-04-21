# Repo Detail Article Layout Design

**Date:** 2026-04-15
**Status:** Draft

## Summary

Refactor the main panel of the expanded repo view (`RepoDetail`) to adopt a Twitter-article-inspired layout. The panel becomes a single cohesive "article" card that groups the repo identity (avatar + owner + date), the repo name as an article headline, the tab strip, the tab body, and a compact action row — in that order, top to bottom. The existing banner stats strip is removed; stars / forks / issues / version move to a new "Stats" block prepended to the right sidebar. The hero "Learn" button is demoted to equal visual weight alongside Star and Download in a Twitter-like action row at the bottom of the article. Existing glass-morphism styling, color palette, typography, and all tab-body components are preserved.

Additionally, the single outer glass card that today contains both the main content and the sidebar is split into **two independent glass panels** side-by-side with a 20px gap: the article panel (`flex: 1`) and the sidebar panel (220px fixed). Each carries its own glass-morphism background, border, and shadow. The former `.repo-detail-glass` wrapper is gutted of its visual styling and becomes a transparent layout container (renamed `.repo-detail-layout`).

## Current State

**File:** `src/views/RepoDetail.tsx` (~1791 lines)

**Layout:** flex column inside a single glass-morphism card (`repo-detail-glass` — one card wrapping both the main content and the sidebar, with just an internal `border-left` separating them; Change 9 below restructures this into two independent glass panels), containing:
- **Banner** (lines ~922-976): `repo-detail-banner-overlay` + `repo-detail-banner-identity`
  - Avatar (40x40 rounded-8)
  - Title: `repo-detail-banner-name` (20px bold Inter)
  - Owner button: `repo-detail-banner-owner` (11px JetBrains Mono)
  - Inline stats strip: `★ stars · ⑂ forks · ◎ issues · version · updated-date`
- **Tab strip** (lines ~1001-1014): `repo-detail-tabs` — flex row with active-state bottom border
  - Tabs: README, Files, Skill Folder, Releases, Collections, Related, Videos, Posts, Commands, Components
- **Main content** (lines ~1016-1436): `repo-detail-main` flex column, scrollable
  - `repo-detail-tab-body` with optional `--full-bleed` variant
- **Sidebar** (lines ~1442-1784): `repo-detail-sidebar` (220px fixed width)
  - Action buttons: Learn (hero, purple), Star, Download
  - Skills Folder panel
  - Repository metadata block (Language, Category, License, Size, Watchers, Default branch)
  - View on GitHub link
  - Badge sections (Packages, Quality, Community, Badges)
  - Topics
  - Related repos

**Key files:**
- `src/views/RepoDetail.tsx` — primary component
- `src/styles/globals.css` — where all `repo-detail-*`, `btn-learn-icon`, `btn-star-repo` styles live today (there is no co-located `RepoDetail.css` file)
- `src/components/ReadmeRenderer.tsx` — unchanged
- `src/components/FilesTab.tsx` — unchanged
- `src/components/DownloadDropdown.tsx` — unchanged (still the click target for Download in the new action row)

## Proposed State

```
┌─ repo-detail-layout (transparent flex container) ────────────────┐
│                                                                  │
│ ┌─ article panel (glass) ────────────┐  ┌─ sidebar panel (glass)┐│
│ │  ●  lucidrains · Updated Nov 5     │  │ Stats                 ││
│ │                                    │  │   ★ 1.4k              ││
│ │  Vision Transformer — Pytorch      │  │   ⑂ 68                ││
│ │  ───────────────────────────────   │  │   ◎ 10                ││
│ │   README  Files  Skill Folder  …   │  │   v1.3                ││
│ │  ───────────────────────────────   │  ├───────────────────────┤│
│ │                                    │  │ Skills Folder         ││
│ │   (body — README markdown, Files   │  ├───────────────────────┤│
│ │    tree, etc.; scrolls internally) │  │ Metadata              ││
│ │                                    │  ├───────────────────────┤│
│ │  ───────────────────────────────   │  │ Badges                ││
│ │   🎓 Learn   ☆ Star   ⬇ Download   │  │ Topics                ││
│ └────────────────────────────────────┘  │ Related               ││
│           ←── 20px gap ──→               └───────────────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Both glass panels sit on the existing chiaroscuro background (unchanged). The outer container (formerly `.repo-detail-glass`, now `.repo-detail-layout`) provides only flex layout, outer margin, and gap — no background, border, or shadow.

### Change 1: New `ArticleLayout` component

**File:** `src/components/ArticleLayout.tsx` (new)

Pure presentational slot-based wrapper. Props:

```ts
type ArticleLayoutProps = {
  byline: React.ReactNode;     // avatar + owner row + updated date
  title: React.ReactNode;      // article headline (repo name)
  tabs: React.ReactNode;       // the existing tab strip
  body: React.ReactNode;       // the current tab-body rendering
  actionRow: React.ReactNode;  // Learn + Star + Download row
};
```

Renders a single card with vertical stacking: `byline → title → divider → tabs → divider → body (flex: 1, scrolls) → divider → actionRow`.

No state, no logic, no data fetching. `RepoDetail` owns everything and distributes rendered output into the slots.

### Change 2: Byline composition

**Single horizontal row at the top of the article:**
- Avatar: ~32px round (shrink from current 40px square, more Twitter-like)
- Owner display name: bold, `var(--t1)`, ~14px, clickable (same handler as current `repo-detail-banner-owner`)
- Bullet separator: `·`, `var(--t3)`
- Updated date: e.g. "Updated Nov 5, 2026", `var(--t3)`, ~12px — sourced from `repo.pushed_at ?? repo.updated_at` (same field the current banner uses; the label "Updated" maps to the push timestamp)

No `⋯` menu (no existing functionality to surface). No inline stats.

### Change 3: Title treatment

**The repo name becomes the article headline:**
- Font size: bump from 20px → ~26-28px (final value tuned during implementation)
- Font family: Inter, bold, tight line-height
- Left-aligned, full article width
- The inline stats strip (stars · forks · issues · version · updated-date) that currently sits adjacent to the title is **deleted** from this location
- **`VerificationBadge`** (currently rendered inline next to the repo name at `RepoDetail.tsx:942`) stays adjacent to the title — rendered as a small icon to the right of the headline (same `size="md" variant="icon"` props as today). It does NOT move to the byline.

### Change 4: Tabs inside the article

The existing tab strip markup relocates into the `ArticleLayout`'s `tabs` slot. Behavior unchanged (same `visibleTabs` filtering, same active-state logic, same click handlers).

**Visual tuning:**
- Horizontal divider lines (`1px solid var(--bg3)`) directly above and below the tab strip, hugging it
- Slight spacing tighten if needed to fit the article aesthetic
- Active tab indicator (accent color text + bottom border) unchanged

### Change 5: Body area

The current `repo-detail-tab-body` rendering moves into the `ArticleLayout`'s `body` slot. All tab-body components (`ReadmeRenderer`, `FilesTab`, Releases, Collections, Related, etc.) are untouched.

**Preserved:**
- `--full-bleed` variant for Files / Components tabs
- Internal scroll behavior (`flex: 1`, `overflow-y: auto`)
- All data loading, empty states, error states per tab

### Change 6: Action row at the bottom

**New inline helper:** `<RepoArticleActionRow>` defined inside `RepoDetail.tsx` (~30 lines, single-use, no separate file needed). Rendered into the `actionRow` slot.

**Layout:** horizontal divider above, then three buttons side-by-side, evenly spaced. **Default to left-aligned** (tighter cluster that reads as a toolbar); switch to centered only if left-aligned looks off with the surrounding content padding.

**Per-button treatment:**
- All three use the same height, padding, font size, and spacing
- Each button is icon + label, horizontal inline (e.g., `🎓 Learn`)
- **Learn** keeps its purple accent color (so it reads as "primary" by hue, not by size) — uses existing Learn handler and LEARNING/ENHANCING spinner states
- **Star** uses neutral button treatment; filled icon when starred, outline when not — uses existing toggle handler
- **Download** uses neutral button treatment; clicking opens the existing `DownloadDropdown` menu (unchanged component, new trigger surface)
- No counts displayed next to any button (star count lives in the sidebar now)

**Class restructuring for Learn:** the existing `btn-learn-icon` class bundles both color AND hero sizing. In the new action row, Learn is equal-weight with Star/Download. Restructure by introducing a shared base class `article-action-btn` (common height/padding/typography shared by all three buttons) plus an `article-action-btn--primary` modifier that applies only the purple accent color to Learn. The old `btn-learn-icon` class and its sidebar-hero treatment are removed. Similarly, `btn-star-repo`'s sidebar-specific sizing is replaced by `article-action-btn` (filled/outline star icon logic preserved via a separate modifier if needed).

### Change 7: Sidebar — prepend Stats block

**New section** at the top of `repo-detail-sidebar`, above the Skills Folder panel:

```
Stats
  ★  Stars    1.4k
  ⑂  Forks    68
  ◎  Issues   10
  🏷  Version  v1.3
```

**Implementation:** small "Stats" heading (matching existing sidebar block heading style), then four rows of `icon + label + value`. Uses the same typography and spacing as the existing metadata block so it looks like a natural addition.

**Items:**
- Stars count → from `repo.stars`
- Forks count → from `repo.forks`
- Issues count → from `repo.open_issues`
- Version → from existing release/version data (same `version` variable the current banner strip reads at `RepoDetail.tsx:970`)

**Not moved (intentional):**
- **License** — already in the existing metadata block; do not duplicate
- **Updated date** — now in the article byline; do not duplicate
- **Watchers** — already in the existing metadata block, stays there (reorganizing would exceed the "minimal sidebar change" scope)

### Change 8: Remove banner

The `repo-detail-banner-overlay` / `repo-detail-banner-identity` block and its inline stats strip are removed from `RepoDetail.tsx`. All of its information is redistributed: avatar + owner + date → byline slot; title → title slot; stars/forks/issues/version → sidebar Stats block; license → already in sidebar metadata (no action needed); updated-date → byline.

### Change 9: Split glass card into two panels

**Container restructure.** The single outer `.repo-detail-glass` card — which today wraps both the main content and the sidebar, separated by an internal `border-left` on the sidebar — is split into two independent glass panels. The former outer element is gutted of its visual styling (background, border, border-radius, shadow) and becomes a pure flex-layout container. It is renamed `.repo-detail-layout` to signal the role change (it no longer *is* the glass card — it *contains* the two glass cards).

**New panel classes:**

- `.repo-detail-article-panel` — `flex: 1`, wraps the `<ArticleLayout>` content. Carries glass-morphism styling:
  ```css
  background: rgba(13, 17, 23, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  overflow: hidden;                /* clip ArticleLayout's internal scroll regions */
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  ```

- `.repo-detail-sidebar-panel` — `width: 220px`, `flex-shrink: 0`, wraps the existing sidebar content. Same glass-morphism values as `.repo-detail-article-panel`. Retains the current sidebar internals (Stats block, Skills Folder, Metadata, Badges, Topics, Related) — this class is a new *wrapper*, not a replacement for `.repo-detail-sidebar`; the existing sidebar markup continues to use `.repo-detail-sidebar` for its internal padding and scroll.

**Gutted `.repo-detail-layout`** (formerly `.repo-detail-glass`):
```css
.repo-detail-layout {
  position: relative;
  z-index: 2;
  margin: 0 16px 16px;
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
  /* NO background, border, border-radius, or box-shadow — those moved to the panel classes */
}
```

**Sidebar border removal.** The existing `border-left: 1px solid var(--border)` on `.repo-detail-sidebar` is removed — the 20px gap between the two panels replaces it as the visual separator. The rest of `.repo-detail-sidebar` (padding, overflow, flex-direction) is preserved.

**Shadow intensity.** Both panels use the same shadow value as today's single card (`0 4px 24px rgba(0, 0, 0, 0.3)`) on first pass. Two panels with identical shadows will cast slightly more total shadow into the background than the single-card setup; if this reads as too heavy once visually inspected, soften to `0 2px 16px rgba(0, 0, 0, 0.25)` per panel (tuning, not a re-architecture).

**Composition with the article layout.** The article panel directly contains the `<ArticleLayout>` — no intermediate wrapper. The sidebar panel directly contains the existing `.repo-detail-sidebar` element. The two-panel split and the article-layout redesign compose cleanly because `ArticleLayout` already owns its own internal flex column and scrolling.

**Preserved:**
- The chiaroscuro background behind the whole repo detail view (sits on `z-index: 1`; panels sit above via the container's `z-index: 2`)
- All interior padding/scrolling within the sidebar
- Sidebar fixed width (220px)
- `<ArticleLayout>`'s own internal structure and full-bleed body behavior

## CSS Changes

**New file:** `src/components/ArticleLayout.css`

**New classes:**
- `.article-layout` — flex column container, inherits glass-morphism background or sits inside existing glass card
- `.article-layout-byline` — horizontal row, gap, padding top
- `.article-layout-byline-avatar` — 32px round
- `.article-layout-byline-name` — bold 14px `var(--t1)`, clickable
- `.article-layout-byline-meta` — `var(--t3)` for separator + date
- `.article-layout-title` — 26-28px bold Inter, tight line-height, padding
- `.article-layout-divider` — `1px solid var(--bg3)`, horizontal rule
- `.article-layout-tabs-slot` — container for passed-in tabs (minimal styling — consumer owns tab CSS)
- `.article-layout-body` — `flex: 1`, `overflow-y: auto`; supports `--full-bleed` variant
- `.article-layout-actions` — horizontal row, padding, space distribution
- `.article-action-btn` — shared button styles (base treatment for all three)
- `.article-action-btn--primary` — Learn variant (purple accent)

**Modified classes** (in `src/styles/globals.css` — this is where all `repo-detail-*` and button styles live today; do NOT create a new `RepoDetail.css`):
- Remove banner styles: `.repo-detail-banner-overlay`, `.repo-detail-banner-identity`, `.repo-detail-banner-name`, `.repo-detail-banner-owner`, and the inline stats strip
- Remove the sidebar Learn button hero treatment: replace the old `.btn-learn-icon` (hero sizing + purple color) with `.article-action-btn` (shared sizing) + `.article-action-btn--primary` (purple accent)
- Replace `.btn-star-repo`'s sidebar-specific sizing with `.article-action-btn`; preserve filled/outline icon state logic
- Add sidebar Stats block styles: `.sidebar-stats`, `.sidebar-stats-row`, `.sidebar-stats-label`, `.sidebar-stats-value`
- Tune `.repo-detail-tabs` spacing slightly to fit inside the article card
- **Rename `.repo-detail-glass` → `.repo-detail-layout`** and strip its visual styling (remove `background`, `backdrop-filter`, `-webkit-backdrop-filter`, `border`, `border-radius`, `box-shadow`); keep only `position`, `z-index`, `margin`, `flex`, `min-height`; add `display: flex`, `gap: 20px`
- **Add `.repo-detail-article-panel`** and **`.repo-detail-sidebar-panel`** — both carry the glass-morphism styling that used to live on `.repo-detail-glass` (rgba background, blur, white border, 12px radius, shadow). `.repo-detail-article-panel` is `flex: 1` with `overflow: hidden` + internal flex column; `.repo-detail-sidebar-panel` is `width: 220px`, `flex-shrink: 0`
- **Remove `border-left: 1px solid var(--border)`** from `.repo-detail-sidebar` (the gap between panels replaces it)
- Remove `.repo-detail-body` (currently a flex-row wrapper at `globals.css:2549` around `.repo-detail-main` + `.repo-detail-sidebar`). Its role is absorbed by `.repo-detail-layout` (which is now itself the flex row containing the two panels). Also remove the corresponding `<div className="repo-detail-body">` element from `RepoDetail.tsx` (currently at line ~992)

## Component Changes

### New: `ArticleLayout.tsx`
- Pure presentational slot component
- Props: `byline`, `title`, `tabs`, `body`, `actionRow`
- No state, no side effects
- Renders the card structure described above

### Modified: `RepoDetail.tsx`
- **Remove** banner JSX (lines ~922-976) and its inline stats strip
- **Remove** the sidebar Learn button's hero sizing/treatment; button is moved to the new action row and restyled as equal-weight
- **Remove** sidebar Star button and Download dropdown from their current location; move to the action row
- **Add** `<RepoArticleActionRow>` inline helper (~30 lines) wrapping Learn + Star + Download buttons
- **Add** `<ArticleLayout>` usage — distribute existing content into slots:
  - `byline` = new byline JSX (avatar + owner + date)
  - `title` = repo name heading
  - `tabs` = existing tab strip JSX (unchanged)
  - `body` = existing tab-body rendering (unchanged)
  - `actionRow` = `<RepoArticleActionRow>`
- **Rename** outer container element's className from `repo-detail-glass` to `repo-detail-layout`
- **Remove** the `<div className="repo-detail-body">` wrapper element (currently at line ~992) — its flex-row role is absorbed by `.repo-detail-layout`
- **Wrap** the `<ArticleLayout>` in a new `<div className="repo-detail-article-panel">` element (direct child of `.repo-detail-layout`)
- **Wrap** the existing `<div className="repo-detail-sidebar">` in a new `<div className="repo-detail-sidebar-panel">` element (sibling of the article panel, direct child of `.repo-detail-layout`)
- **Add** sidebar Stats block JSX at the top of the sidebar, above the Skills Folder panel
- Data fetching, state management, handlers — **unchanged**

### Unchanged
- `ReadmeRenderer.tsx`, `FilesTab.tsx`, `DownloadDropdown.tsx`, `SkillDepthBars.tsx`, `FilesToolbar.tsx`
- All data fetching paths (`window.api.*`)
- All custom hooks (`useRepoNav`, `useLocalStorage`, `useResizable`)
- Sidebar structure below the new Stats block (Skills Folder, Metadata, Badges, Topics, Related)

## State Management

No changes. `RepoDetail` continues to own all state (selected tab, skills panel hover, sidebar scroll, learning state, etc.). `ArticleLayout` is stateless.

## Data Flow

Unchanged. The same `repo` object that previously populated the banner strip now populates:
- The byline (owner name, avatar, updated date)
- The title (repo name)
- The sidebar Stats block (stars, forks, issues, version)

The same click handlers wire the new action row buttons (Learn handler, Star toggle, Download dropdown trigger).

## Error / Loading States

Unchanged. `RepoDetail` continues to handle loading and error states at its existing boundaries. `ArticleLayout` has no failure modes of its own — it's a pure slot component.

## Testing

- **No new unit tests** — `ArticleLayout` is a pure slot component (nothing to test beyond child rendering); all tab-body components are untouched
- **Existing tests** should continue to pass. Any tests asserting specific DOM structure that changes (e.g., references to `repo-detail-banner-*` classes) will need updated assertions — update the assertion, not the new code
- **Manual verification** by the user per their stated preference; no automated visual tests, no dev server screenshots during implementation
- **Type-check + build must pass** before handoff

## Rollout

Straight merge. No feature flag — this is a contained visual refactor. Any regressions are immediately visible on first open of an expanded repo.

## Files Touched

**New:**
- `src/components/ArticleLayout.tsx`
- `src/components/ArticleLayout.css`

**Modified:**
- `src/views/RepoDetail.tsx` — restructure banner/main region, add `<RepoArticleActionRow>` inline helper, prepend sidebar Stats block, rename outer wrapper `repo-detail-glass` → `repo-detail-layout`, remove the redundant `repo-detail-body` wrapper, wrap main and sidebar in new `repo-detail-article-panel` / `repo-detail-sidebar-panel` glass cards
- `src/styles/globals.css` — remove banner stats strip styles, add sidebar Stats section styles, tune tab strip spacing, restructure Learn/Star button classes (replace hero `.btn-learn-icon` with shared `.article-action-btn` + `--primary` modifier), rename `.repo-detail-glass` → `.repo-detail-layout` and strip its visual styling, add `.repo-detail-article-panel` and `.repo-detail-sidebar-panel` glass classes, remove the now-redundant `.repo-detail-body` class, remove `border-left` from `.repo-detail-sidebar`

**Unchanged:**
- All tab-body components (`ReadmeRenderer`, `FilesTab`, `DownloadDropdown`, `SkillDepthBars`, `FilesToolbar`)
- Data fetching, hooks, state management
- Sidebar structure below the new Stats block

## Out of Scope

- Reorganizing the existing sidebar metadata / badges / topics / related blocks (deferred; "minimal sidebar change" was chosen)
- Changing the typography family or color palette (glass-morphism aesthetic preserved)
- Adjusting non-README tab internals (Files tree, Skill Folder, etc.)
- Mobile / narrow-width responsive tuning (existing behavior preserved; no new breakpoints)
- Adding a `⋯` byline menu (no existing functionality to surface there)
