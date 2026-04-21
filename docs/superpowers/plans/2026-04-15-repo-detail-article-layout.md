# Repo Detail Article Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the expanded repo view (`RepoDetail`) main panel into a Twitter-article-style layout by introducing a new slot-based `ArticleLayout` component, demoting the hero Learn button to an equal-weight action row, and relocating banner stats to a new sidebar Stats block.

**Architecture:** New pure presentational `ArticleLayout` component with 5 named slots (`byline`, `title`, `tabs`, `body`, `actionRow`). `RepoDetail.tsx` composes slot content and passes it in, replacing the current banner-overlay + `repo-detail-main` structure. Existing glass-morphism card, color palette, and all tab-body components are preserved unchanged. Sidebar gains a new Stats block at the top; existing Skills/Metadata/Badges/Topics/Related blocks are untouched.

**Tech Stack:** React 18, TypeScript, Electron-Vite, CSS (no preprocessor — styles live in `src/styles/globals.css`).

**Spec:** [docs/superpowers/specs/2026-04-15-repo-detail-article-layout-design.md](../specs/2026-04-15-repo-detail-article-layout-design.md)

---

## Testing Strategy

This is a visual layout refactor. Per the spec and user preference, there are **no new unit tests** (ArticleLayout is a pure slot component — nothing to test beyond child rendering). No existing tests reference the changed classes (`repo-detail-banner-*`, `btn-learn-icon`, `btn-star-repo`, `repo-detail-glass`, `repo-detail-body`) — verified via grep before planning.

**Verification per task:** run `npm run build` (does TypeScript type-check AND builds the Electron renderer). A clean build = compile-level correctness. Visual correctness is verified by the user manually; do NOT launch `npm run dev` or take screenshots.

**Commit after every task.** Each task produces a self-contained, working state — if a later task breaks something, we can bisect.

---

## File Structure

**Created:**
- `src/components/ArticleLayout.tsx` — pure slot component, ~40 lines
- `src/components/ArticleLayout.css` — article-specific layout styles

**Modified:**
- `src/views/RepoDetail.tsx` — split outer glass card into two panels (rename wrapper `repo-detail-glass` → `repo-detail-layout`, remove `repo-detail-body` wrapper, add `repo-detail-article-panel` / `repo-detail-sidebar-panel` glass wrappers); remove banner overlay (lines ~922-989); replace `repo-detail-main` with `<ArticleLayout>`; add `RepoArticleActionRow` inline helper; remove Learn/Star/Download from sidebar; prepend sidebar Stats block
- `src/styles/globals.css` — rename `.repo-detail-glass` → `.repo-detail-layout` and strip its visual styling; add `.repo-detail-article-panel` and `.repo-detail-sidebar-panel` glass classes; remove `.repo-detail-body` rule; remove `border-left` from `.repo-detail-sidebar`; remove banner stats strip styles; remove old `.btn-learn-icon` and `.btn-star-repo` hero sizing (color logic preserved as `--primary` modifier); add sidebar Stats styles; tune `.repo-detail-tabs` spacing

**Unchanged:**
- All tab-body components (`ReadmeRenderer`, `FilesTab`, `DownloadDropdown`, `SkillDepthBars`, `FilesToolbar`)
- Data fetching, hooks, state management
- Sidebar structure below the new Stats block

---

## Task 1: Scaffold ArticleLayout component

**Files:**
- Create: `src/components/ArticleLayout.tsx`
- Create: `src/components/ArticleLayout.css`

Create the pure slot component in isolation. Not yet used by `RepoDetail` — this task just establishes the component contract and CSS skeleton.

- [ ] **Step 1: Create `ArticleLayout.css`**

```css
/* src/components/ArticleLayout.css */

.article-layout {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.article-layout-byline {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px 8px;
  font-family: 'Inter', sans-serif;
}

.article-layout-byline-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.article-layout-byline-avatar-fallback {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.article-layout-byline-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--t1);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.article-layout-byline-name:hover {
  text-decoration: underline;
}

.article-layout-byline-meta {
  font-size: 12px;
  color: var(--t3);
}

.article-layout-byline-meta-sep {
  margin: 0 6px;
  color: var(--t3);
}

.article-layout-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 14px;
  font-family: 'Inter', sans-serif;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--t1);
}

.article-layout-divider {
  height: 1px;
  background: var(--bg3);
  border: 0;
  margin: 0;
  flex-shrink: 0;
}

.article-layout-tabs-slot {
  flex-shrink: 0;
}

.article-layout-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.article-layout-body--full-bleed {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.article-layout-actions {
  flex-shrink: 0;
  padding: 10px 20px;
}
```

- [ ] **Step 2: Create `ArticleLayout.tsx`**

```tsx
// src/components/ArticleLayout.tsx
import React from 'react'
import './ArticleLayout.css'

export type ArticleLayoutProps = {
  byline: React.ReactNode
  title: React.ReactNode
  tabs: React.ReactNode
  body: React.ReactNode
  actionRow: React.ReactNode
  /** When true, body renders without internal padding (for Files / Components tabs) */
  fullBleedBody?: boolean
}

export function ArticleLayout({
  byline,
  title,
  tabs,
  body,
  actionRow,
  fullBleedBody = false,
}: ArticleLayoutProps) {
  return (
    <div className="article-layout">
      <div className="article-layout-byline">{byline}</div>
      <div className="article-layout-title">{title}</div>
      <hr className="article-layout-divider" />
      <div className="article-layout-tabs-slot">{tabs}</div>
      <hr className="article-layout-divider" />
      <div className={`article-layout-body${fullBleedBody ? ' article-layout-body--full-bleed' : ''}`}>
        {body}
      </div>
      <hr className="article-layout-divider" />
      <div className="article-layout-actions">{actionRow}</div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean build, no TypeScript errors. ArticleLayout is exported but not yet imported anywhere, so tree-shaking may warn — that's fine.

- [ ] **Step 4: Commit**

```bash
git add src/components/ArticleLayout.tsx src/components/ArticleLayout.css
git commit -m "feat(repo-detail): scaffold ArticleLayout slot component"
```

---

## Task 2: Split glass card into two panels

**Files:**
- Modify: `src/views/RepoDetail.tsx`
- Modify: `src/styles/globals.css`

This task is purely structural. It splits the single outer `.repo-detail-glass` card into two independent glass panels with a 20px gap between them, *before* any ArticleLayout integration. After this task, the UI looks visually separated (two glass cards with a gap) but the content is otherwise unchanged — banner still shows, Learn/Star/Download still sit in the sidebar, all tab rendering still works. ArticleLayout is scaffolded (from Task 1) but not yet wired in — that happens in Task 3.

Keep this task small and focused: rename the wrapper, drop the body wrapper, add two panel wrappers with glass styling. No other refactoring.

- [ ] **Step 1: Update globals.css**

In `src/styles/globals.css`:

**Replace** the existing `.repo-detail-glass` rule (at ~line 2356) with a new `.repo-detail-layout` rule that is stripped of visual styling and becomes a flex row:

```css
.repo-detail-layout {
  position: relative;
  z-index: 2;
  margin: 0 16px 16px;
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
}
```

(Delete the old `.repo-detail-glass` declaration entirely — the visual styling moves to the two new panel classes below.)

**Remove** the `.repo-detail-body` rule (at ~line 2549) entirely — its flex-row role is now absorbed by `.repo-detail-layout`.

**Add** two new panel classes. Both reuse the glass values that used to live on `.repo-detail-glass`:

```css
.repo-detail-article-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(13, 17, 23, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.repo-detail-sidebar-panel {
  width: 220px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(13, 17, 23, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
```

**Modify** `.repo-detail-sidebar` (at ~line 4686): **remove** the line `border-left: 1px solid var(--border);`. Leave the rest of that rule (width, padding, overflow-y, flex layout) unchanged — the inner sidebar keeps its existing internals; the gap between the two panels is now the visual separator.

- [ ] **Step 2: Update RepoDetail.tsx JSX**

In `src/views/RepoDetail.tsx`:

**Rename** the outer wrapper's className at line ~991:

```tsx
// BEFORE
<div className="repo-detail-glass">

// AFTER
<div className="repo-detail-layout">
```

**Remove** the `<div className="repo-detail-body">` wrapper at line ~992 (and its matching closing `</div>`). Its children (`.repo-detail-main` and `.repo-detail-sidebar`) become direct children of `.repo-detail-layout`.

**Wrap** `<div className="repo-detail-main">...</div>` (at lines ~994 to ~1436) in a new `<div className="repo-detail-article-panel">` — opening tag before `.repo-detail-main`, closing tag after `.repo-detail-main`'s closing tag.

**Wrap** `<div className="repo-detail-sidebar">...</div>` (starting at ~line 1442) in a new `<div className="repo-detail-sidebar-panel">` — opening tag before `.repo-detail-sidebar`, closing tag after its closing tag.

Resulting structure (inside `.repo-detail-stage`):

```tsx
<div className="repo-detail-layout">
  <div className="repo-detail-article-panel">
    <div className="repo-detail-main">
      {/* existing main content unchanged */}
    </div>
  </div>
  <div className="repo-detail-sidebar-panel">
    <div className="repo-detail-sidebar">
      {/* existing sidebar content unchanged */}
    </div>
  </div>
</div>
```

The banner (`.repo-detail-banner-overlay` at ~line 922) remains OUTSIDE the layout container — it is not inside `.repo-detail-layout`. Leave it exactly where it is today; Task 3 removes it.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean build, no TypeScript errors. The app runs visually as two separate glass panels with a 20px gap between them. Banner still sits above. Sidebar still has Learn/Star/Download buttons. All tabs still work.

**If the sidebar content appears cut off at the bottom or doesn't scroll:** confirm that `.repo-detail-sidebar` retained `overflow-y: auto` and that `.repo-detail-sidebar-panel` has `display: flex; flex-direction: column;` so the inner sidebar can stretch.

**If the two panels aren't aligned or the gap looks wrong:** verify `.repo-detail-layout` has `display: flex; gap: 20px;` and that no old `.repo-detail-glass` or `.repo-detail-body` references remain.

Run: `grep -n "repo-detail-glass\|repo-detail-body" src/views/RepoDetail.tsx src/styles/globals.css`
Expected: zero matches (both fully replaced).

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "refactor(repo-detail): split glass card into article + sidebar panels

Separates the single outer glass card into two independent glass panels
with a 20px gap. Renames .repo-detail-glass -> .repo-detail-layout
(transparent flex container), removes the redundant .repo-detail-body
wrapper, adds .repo-detail-article-panel and .repo-detail-sidebar-panel
carrying the glass-morphism styling, and drops the sidebar border-left
(the gap replaces it as the visual separator)."
```

---

## Task 3: Migrate RepoDetail main region to ArticleLayout

**Files:**
- Modify: `src/views/RepoDetail.tsx`
  - Delete: banner overlay at lines ~922-989 (`repo-detail-banner-overlay` block)
  - Modify: lines ~991-1436 (`repo-detail-layout` > `repo-detail-article-panel` > `repo-detail-main` → `<ArticleLayout>`)
- Modify: `src/styles/globals.css`
  - Remove: `.repo-detail-banner-overlay`, `.repo-detail-banner-identity`, `.repo-detail-banner-title`, `.repo-detail-banner-name`, `.repo-detail-banner-owner`, and any related banner-only styles

This task swaps the banner+main structure for `<ArticleLayout>`. The action row slot receives a TEMPORARY placeholder — the real action buttons stay in the sidebar until Task 4. Sidebar remains fully functional during this task. The structural split from Task 2 is already in place, so `<ArticleLayout>` renders inside `.repo-detail-article-panel`.

- [ ] **Step 1: Read current RepoDetail structure to understand surrounding JSX**

Review lines 915-995 (render start through start of main column) and lines 1435-1445 (end of main column / sidebar start). This confirms where ArticleLayout's opening and closing tags go.

Run: `grep -n "repo-detail-main\|repo-detail-layout\|repo-detail-article-panel\|repo-detail-banner-overlay" src/views/RepoDetail.tsx`
Expected (post-Task-2): banner overlay at ~922, `repo-detail-layout` at ~991, `repo-detail-article-panel` just inside it, `repo-detail-main` inside the article panel at ~994, `repo-detail-sidebar-panel` starts after main closes.

- [ ] **Step 2: Import ArticleLayout at top of RepoDetail.tsx**

Add near other component imports:

```tsx
import { ArticleLayout } from '../components/ArticleLayout'
```

- [ ] **Step 3: Build byline JSX as a local const before the return statement**

Inside the RepoDetail component, after the existing `liveTier` / `liveSignals` computations (around line 914) and before the return:

```tsx
// ── Article slot content ─────────────────────────────────────────
const bylineNode = (
  <>
    {repo?.avatar_url ? (
      <img
        src={repo.avatar_url}
        alt={owner ?? 'owner'}
        className="article-layout-byline-avatar"
      />
    ) : (
      <div
        className="article-layout-byline-avatar-fallback"
        style={{ background: `${cfg.primary}33`, color: cfg.primary }}
      >
        {cfg.abbr}
      </div>
    )}
    <button
      className="article-layout-byline-name owner-name-btn"
      onClick={(e) => { e.stopPropagation(); openProfile(owner ?? '') }}
    >
      {owner}
    </button>
    {repo && (
      <span className="article-layout-byline-meta">
        <span className="article-layout-byline-meta-sep">·</span>
        Updated {formatDate(repo.pushed_at ?? repo.updated_at)}
      </span>
    )}
  </>
)

const titleNode = (
  <>
    <span>{name}</span>
    <VerificationBadge tier={liveTier} signals={liveSignals} size="md" variant="icon" />
  </>
)
```

**Notes:**
- Reuses the existing `cfg` (language config), `owner`, `name`, `repo`, `openProfile`, `formatDate`, `liveTier`, `liveSignals` — all already in scope
- The fallback avatar (when no `avatar_url`) reuses the same `cfg.primary` color scheme as the current banner language badge
- The owner button keeps the existing `owner-name-btn` class so hover/focus styles still apply

- [ ] **Step 4: Build tabsNode and bodyNode by extracting existing JSX**

Still before the return, add:

```tsx
const tabsNode = (
  <div className="repo-detail-tabs">
    {visibleTabs.map(t => (
      <button
        key={t.id}
        className={`repo-detail-tab${activeTab === t.id ? ' active' : ''}${t.id === 'components' && storybookState === 'detecting' && activeTab !== 'components' ? ' repo-detail-tab--loading' : ''}`}
        onClick={() => setActiveTab(t.id)}
      >
        {t.id === 'videos'   ? `Videos (${videoLinks.length})`
         : t.id === 'posts'    ? `Posts (${socialPosts.length})`
         : t.id === 'commands' ? `Commands (${commands.length})`
         : t.label}
      </button>
    ))}
  </div>
)

const isFullBleedTab = activeTab === 'components' || activeTab === 'files'
```

`bodyNode` is NOT pre-extracted — it's large (~400 lines of conditional tab rendering) and inlining it into the JSX below keeps diffs smaller. Leave the existing conditional tab rendering in place; we'll pass it directly to ArticleLayout's `body` slot.

- [ ] **Step 5: Replace the banner overlay and main column JSX with ArticleLayout**

**DELETE** the entire banner overlay block (the `<div className="repo-detail-banner-overlay">` at line ~922 through its closing `</div>` at line ~989). The Learn error banner at lines 978-988 sits OUTSIDE the overlay block — keep it exactly where it is (it lives between the overlay and the glass panel and is unrelated).

**REPLACE** the existing `<div className="repo-detail-main">...</div>` (lines ~994-1436) with the block below. **Preserve current error behavior:** when `repoError` is true, the current code hides BOTH tabs AND body and shows the error message. We match that by gating the whole ArticleLayout on `!repoError`:

```tsx
{repoError ? (
  <div style={{ padding: 20, fontSize: 11, color: 'var(--t2)', flex: 1 }}>
    Could not load repo — check your connection.
  </div>
) : (
  <ArticleLayout
    byline={bylineNode}
    title={titleNode}
    tabs={tabsNode}
    body={
      <>
        {/* Paste the existing conditional tab rendering EXACTLY as it is today in
            the current source at lines ~1017-1435. The spec requires no change to
            tab body rendering. For readability this plan step does not reproduce
            those ~400 lines — use the existing source as the literal copy-source.
            Do NOT wrap this content in an additional `<div className="repo-detail-tab-body">`
            wrapper — the ArticleLayout's `article-layout-body` already owns the
            scroll container and padding. See Step 5b below for a CSS consolidation. */}
        {activeTab === 'readme' && ( /* paste existing block */ )}
        {/* ...paste every other `activeTab === '...'` block unchanged... */}
      </>
    }
    actionRow={null}
    fullBleedBody={isFullBleedTab}
  />
)}
```

**IMPORTANT:** `actionRow={null}` is a temporary placeholder. Task 4 will wire in the real buttons. During this task, Learn/Star/Download continue to exist in the sidebar (unchanged) so the UI remains functional.

- [ ] **Step 5b: Consolidate tab-body scroll/padding into article-layout-body**

The old `.repo-detail-tab-body` provided padding and scroll behavior. The new `.article-layout-body` now owns the scroll container (`overflow-y: auto`, `flex: 1`). To avoid nested scroll containers, we fold the padding from `.repo-detail-tab-body` into `.article-layout-body`.

In `src/styles/globals.css`, find `.repo-detail-tab-body` and copy its **padding** rules (NOT its overflow rules) into `.article-layout-body` in `src/components/ArticleLayout.css`. Similarly, copy any `.repo-detail-tab-body--full-bleed` padding overrides into `.article-layout-body--full-bleed`.

After consolidation, `.repo-detail-tab-body` and `.repo-detail-tab-body--full-bleed` CSS rules become orphaned (nothing renders with those classes anymore). Delete them.

Run: `grep -n "repo-detail-tab-body" src/styles/globals.css src/views/RepoDetail.tsx src/components/`
Expected after consolidation: zero references outside of potential comments.

- [ ] **Step 6: Remove dead banner CSS from globals.css**

Find and delete these class rules in `src/styles/globals.css`:
- `.repo-detail-banner-overlay`
- `.repo-detail-banner-identity`
- `.repo-detail-banner-title`
- `.repo-detail-banner-name`
- `.repo-detail-banner-owner`
- Any `.repo-detail-lang-badge-lg` rule if it was only used by the banner (grep first to confirm — if it's reused elsewhere, leave it)

Run: `grep -n "repo-detail-banner\|repo-detail-lang-badge-lg" src/styles/globals.css src/views/RepoDetail.tsx src/components/`

If `repo-detail-lang-badge-lg` is still referenced anywhere after Task 3's TSX changes (e.g., if some other component uses it), keep the CSS; remove only truly orphaned classes.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: clean build. TypeScript should be satisfied with the new structure. If the build fails on unused imports (e.g., `VerificationBadge` if it was only used in the banner and is now in `titleNode`), that's expected to still work because `titleNode` uses it — just confirm nothing is genuinely orphaned.

- [ ] **Step 8: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "refactor(repo-detail): replace banner+main with ArticleLayout slots

Removes the banner overlay and repo-detail-main structure; distributes avatar/owner/updated-date into the byline slot and repo name + VerificationBadge into the title slot. Tabs and tab body pass through unchanged. Action row slot is a temporary null placeholder — real action buttons will move in Task 4. Sidebar remains fully functional."
```

---

## Task 4: Build action row and migrate Learn/Star/Download out of sidebar

**Files:**
- Modify: `src/views/RepoDetail.tsx`
  - Add: `RepoArticleActionRow` inline helper component (~50 lines)
  - Modify: sidebar block at lines ~1444-1501 (remove the Learn/Star/DownloadDropdown cluster)
  - Modify: `actionRow` prop on `<ArticleLayout>` — pass `<RepoArticleActionRow>` instead of `null`
- Modify: `src/styles/globals.css`
  - Add: `.article-action-btn`, `.article-action-btn--primary`, `.article-action-row` classes
  - Remove (or demote): `.btn-learn-icon` hero sizing and `.btn-star-repo` sidebar-specific sizing

Migrates the three action buttons out of the sidebar and into the article's action row slot. They become equal-weight; Learn keeps its purple accent by color only (via `--primary` modifier).

- [ ] **Step 1: Read current Learn button to preserve all state variants**

Review `RepoDetail.tsx` lines 1444-1501 to catalog every state the Learn button renders (UNLEARNED / LEARNING / ENHANCING / LEARNED), the spinner, and the hover-swap icons (`btn-learn-icon__default`, `btn-learn-icon__hover`, `btn-learn-icon__label`). The new button must preserve all of this behavior — only its size/padding change.

- [ ] **Step 2: Add `.article-action-btn` styles to globals.css**

Add these rules (place them near the existing button styles — search for `.btn-view-github` or similar for a good neighborhood):

```css
/* Article action row — equal-weight icon+label buttons at the bottom of the article */
.article-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Left-aligned by default per spec */
}

.article-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--t2);
  background: var(--bg3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  white-space: nowrap;
}

.article-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: var(--t1);
  border-color: rgba(255, 255, 255, 0.14);
}

.article-action-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* Primary variant — purple accent for Learn */
.article-action-btn--primary {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}

.article-action-btn--primary:hover:not(:disabled) {
  background: var(--accent-hover, #7c3aed);
  color: #fff;
  border-color: transparent;
}

.article-action-btn--primary.generating {
  opacity: 0.85;
}

.article-action-btn--primary.learned {
  background: transparent;
  color: var(--accent-text, #a78bfa);
  border-color: var(--accent-text, #a78bfa);
}

.article-action-btn--primary.learned:hover:not(:disabled) {
  background: rgba(167, 139, 250, 0.12);
  color: var(--accent-text, #a78bfa);
}

/* Star button filled state */
.article-action-btn--starred {
  color: #f6c948;
}
```

**Note on CSS variables:** `--accent-hover` and `--accent-text` may not exist. If grep shows they're not defined, replace with hardcoded fallbacks already in the rule (`#7c3aed`, `#a78bfa`) — those are already the CSS fallback values.

Run: `grep -n "\-\-accent-hover\|\-\-accent-text" src/styles/globals.css`
If only `--accent-text` exists: leave `--accent-hover` as `#7c3aed` hardcoded without the `var()` wrapper.
If neither exists: use hex values directly.

- [ ] **Step 3: Remove old Learn/Star sidebar-specific styles**

**Decision up front:** we drop the icon hover-swap entirely. The new button communicates "click to unlearn" via the `title` attribute; no need for the X-on-hover affordance.

Find and delete in `src/styles/globals.css` (delete ALL of these — the hover-swap sub-elements are no longer used):
- `.btn-learn-icon`
- `.btn-learn-icon.generating`
- `.btn-learn-icon.learned`
- `.btn-learn-icon__default`
- `.btn-learn-icon__hover`
- `.btn-learn-icon__label`
- `.btn-star-repo`
- `.btn-star-repo.starred`
- Any `:hover` or `[disabled]` variants of the above

**Before deleting**, grep for each class to confirm they're not used anywhere outside RepoDetail:

Run: `grep -rn "btn-learn-icon\|btn-star-repo" src/`

Expected: only matches should be in `src/views/RepoDetail.tsx` (which Task 4 Step 6 is about to clean up) and in `src/styles/globals.css` itself. If ANY other file references these classes, STOP and surface to the user — something else depends on them.

- [ ] **Step 4: Add `RepoArticleActionRow` inline helper inside RepoDetail.tsx**

Place this component definition inside `RepoDetail.tsx`, at the bottom of the file below the main `RepoDetail` function but above any default export (if present). Alternatively, define it as a `const` inside the main component — either works; a sibling function component is cleaner for reading.

```tsx
// ── Article action row ────────────────────────────────────────────
type RepoArticleActionRowProps = {
  learnState: 'UNLEARNED' | 'LEARNING' | 'ENHANCING' | 'LEARNED'
  starred: boolean
  starWorking: boolean
  onLearn: () => void
  onUnlearn: () => void
  onStar: () => void
  owner: string
  name: string
  typeBucket: string
  typeSub: string | null
  defaultBranch: string
}

function RepoArticleActionRow({
  learnState, starred, starWorking,
  onLearn, onUnlearn, onStar,
  owner, name, typeBucket, typeSub, defaultBranch,
}: RepoArticleActionRowProps) {
  const learnBusy = learnState === 'LEARNING' || learnState === 'ENHANCING'
  const learnLabel =
    learnState === 'LEARNING'  ? 'Learning…'  :
    learnState === 'ENHANCING' ? 'Enhancing…' :
    learnState === 'LEARNED'   ? 'Learned'    :
                                 'Learn'

  return (
    <div className="article-action-row">
      <button
        className={`article-action-btn article-action-btn--primary${learnBusy ? ' generating' : ''}${learnState === 'LEARNED' ? ' learned' : ''}`}
        onClick={learnState === 'LEARNED' ? onUnlearn : onLearn}
        disabled={learnBusy}
        title={
          learnState === 'UNLEARNED' ? 'Learn this repo'
          : learnState === 'LEARNING'  ? 'Learning…'
          : learnState === 'ENHANCING' ? 'Enhancing…'
          : 'Learned — click to unlearn'
        }
      >
        {learnBusy ? (
          <span className="spin-ring" style={{ width: 12, height: 12 }} />
        ) : learnState === 'LEARNED' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 12 9 17 20 6" />
          </svg>
        ) : (
          <Brain size={14} />
        )}
        <span>{learnLabel}</span>
      </button>

      <button
        className={`article-action-btn${starred ? ' article-action-btn--starred' : ''}`}
        onClick={onStar}
        disabled={starWorking}
        title={starred ? 'Unstar on GitHub' : 'Star on GitHub'}
      >
        <svg viewBox="0 0 16 16" width={14} height={14} fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5l1.85 3.75 4.15.6-3 2.93.7 4.1L8 10.77l-3.7 1.96.7-4.1-3-2.93 4.15-.6z" />
        </svg>
        <span>{starred ? 'Starred' : 'Star'}</span>
      </button>

      <DownloadDropdown
        owner={owner}
        name={name}
        typeBucket={typeBucket}
        typeSub={typeSub}
        defaultBranch={defaultBranch}
      />
    </div>
  )
}
```

**DownloadDropdown integration (required):** add an optional `triggerClassName?: string` prop to `DownloadDropdown` and apply it to the dropdown's trigger button (in addition to any existing classes the component sets). Pass `triggerClassName="article-action-btn"` when rendering it inside `RepoArticleActionRow`.

This is a small, contained change (adding one optional prop with a default-falsy value). It does NOT break existing callers — they pass nothing, the default is empty, nothing changes for them.

Run: `grep -n "className" src/components/DownloadDropdown.tsx | head -20`
Locate the trigger button element (usually the always-visible button that toggles the dropdown menu). Add `triggerClassName` to the component's Props type and interpolate it into the trigger button's `className`.

**Only if** the trigger is structurally incompatible with a plain button class (e.g., wrapped in a complex layout that assumes specific CSS), stop and surface the blocker to the user rather than scope-creeping DownloadDropdown's internals. Do NOT silently accept visual inconsistency — either the prop-based integration works cleanly or we explicitly decide to defer.

- [ ] **Step 5: Replace `actionRow={null}` with the new component**

In the JSX from Task 3, change:

```tsx
actionRow={null}
```

to:

```tsx
actionRow={
  <RepoArticleActionRow
    learnState={learnState}
    starred={starred}
    starWorking={starWorking}
    onLearn={handleLearn}
    onUnlearn={handleUnlearn}
    onStar={handleStar}
    owner={owner ?? ''}
    name={name ?? ''}
    typeBucket={typeBucket ?? ''}
    typeSub={repo?.type_sub ?? null}
    defaultBranch={repo?.default_branch ?? 'main'}
  />
}
```

All referenced variables/handlers (`learnState`, `starred`, `starWorking`, `handleLearn`, `handleUnlearn`, `handleStar`, `owner`, `name`, `typeBucket`, `repo`) are already in scope from the existing sidebar usage.

- [ ] **Step 6: Remove the Learn/Star/Download cluster from the sidebar**

In `RepoDetail.tsx`, delete the block at lines ~1444-1501:

```tsx
{/* 1. Learn + Star + Download */}
<div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
  <button className={`btn-learn-icon...`}>...</button>
  <button className={`btn-star-repo...`}>...</button>
  <DownloadDropdown ... />
</div>
```

The sidebar's first child becomes the Skills Folder panel (which still has its own `<SidebarDivider />` before it — remove that divider too since it no longer has a preceding sibling, OR leave it if it's the visual separator between "sidebar edge" and "skills panel").

Check the exact rendering — the current sidebar structure is:
```
<SidebarDivider />  ← may be before skills panel
Skills Folder heading
Skills panel
<SidebarDivider />
Repository metadata heading
...
```

After removing the action buttons, whatever `<SidebarDivider />` was originally between the button cluster and the skills panel is now leading. Decide: keep (harmless — just a top border) or drop. **Recommendation:** drop it to avoid a stray top line.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: clean build. Watch for unused imports — if `Brain` was only used in the old sidebar Learn button and is now used in the new action row, the import stays. If a helper component (e.g., a specific SVG component) is now orphaned, remove it.

- [ ] **Step 8: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "refactor(repo-detail): move Learn/Star/Download to article action row

Demotes the hero Learn button to equal-weight with Star and Download in a compact action row at the bottom of the article. Learn keeps its purple accent via the .article-action-btn--primary modifier (color only, not size). The old .btn-learn-icon / .btn-star-repo sidebar-specific classes are removed. Sidebar loses its top action cluster; Skills Folder panel is now the first sidebar section."
```

---

## Task 5: Add sidebar Stats block

**Files:**
- Modify: `src/views/RepoDetail.tsx`
  - Add: new Stats block JSX inside `.repo-detail-sidebar`, prepended above the Skills Folder panel
- Modify: `src/styles/globals.css`
  - Add: Stats-block-specific styles if the existing metadata row style isn't reusable

Prepends a new "Stats" section to the top of the sidebar, showing Stars, Forks, Issues, and Version — the four items that used to live in the banner stats strip.

- [ ] **Step 1: Locate sidebar insertion point**

Open `RepoDetail.tsx` and find the `<div className="repo-detail-sidebar">` opening (was line ~1442, may have shifted slightly after Task 4's deletions — it's now nested inside `<div className="repo-detail-sidebar-panel">`). The first child is now the Skills Folder panel (or its leading divider).

- [ ] **Step 2: Insert Stats block JSX**

Immediately after the `<div className="repo-detail-sidebar">` opening tag, before any existing child, add:

```tsx
{/* 1. Stats — migrated from banner strip */}
{repo && (
  <>
    <SidebarLabel>Stats</SidebarLabel>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {([
        { key: 'Stars',   val: formatCount(repo.stars),       icon: 'star' as const },
        { key: 'Forks',   val: formatCount(repo.forks),       icon: 'fork' as const },
        { key: 'Issues',  val: formatCount(repo.open_issues), icon: 'issue' as const },
        ...(version !== '—' ? [{ key: 'Version', val: version, icon: 'tag' as const }] : []),
      ]).map(({ key, val, icon }) => (
        <div key={key} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11,
        }}>
          <span style={{ fontFamily: 'Inter, sans-serif', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {icon === 'star' && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
              </svg>
            )}
            {icon === 'fork'  && <span style={{ fontSize: 12 }}>⑂</span>}
            {icon === 'issue' && <span style={{ fontSize: 12 }}>◎</span>}
            {icon === 'tag'   && <span style={{ fontSize: 12 }}>🏷</span>}
            {key}
          </span>
          <span style={{
            fontFamily: icon === 'tag' ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
            color: 'var(--t2)', fontWeight: 500,
          }}>
            {val}
          </span>
        </div>
      ))}
    </div>
    <SidebarDivider />
  </>
)}
```

**Style matching rationale:** this block uses the exact same inline-style recipe as the existing "Repository metadata" block at `RepoDetail.tsx:1628-1658` (labeled `{/* 3. Repository metadata */}` in current source). Same `fontSize: 11`, same `color: var(--t3)` for labels, same `color: var(--t2)` for values, same `flex` rows. This ensures visual consistency without requiring new CSS rules.

**Data field note:** uses `repo.stars`, `repo.forks`, `repo.open_issues` (NOT `stargazers_count`, `forks_count`, `open_issues_count`). These field names were verified against the repo type in the spec review. `version` is a local variable already computed elsewhere in RepoDetail (same source as the current banner `v1.3`).

**Reused helpers:** `SidebarLabel` and `SidebarDivider` are existing components defined in `RepoDetail.tsx` at lines ~386 and ~406. `formatCount` is also defined in-file.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean build. If `version` is not in scope inside the render function (check where it's computed), move the variable reference accordingly or guard with `typeof version !== 'undefined'`.

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat(repo-detail): add sidebar Stats block with Stars/Forks/Issues/Version

New section prepended to the sidebar, replacing the banner stats strip. Reuses the existing SidebarLabel/SidebarDivider helpers and matches the Repository metadata block's row style. License is intentionally NOT duplicated (already in Repository block); updated date is NOT duplicated (now in article byline)."
```

---

## Task 6: Final cleanup and verification

**Files:**
- Modify: `src/styles/globals.css` (possibly) — remove any still-orphaned banner/button rules
- Modify: `src/views/RepoDetail.tsx` (possibly) — remove dead imports

Final pass to catch anything left behind. No functional changes expected — this task either deletes dead code or is a no-op commit.

- [ ] **Step 1: Scan for orphaned CSS classes**

Run each of these and confirm no matches:

```bash
grep -rn "repo-detail-banner" src/
grep -rn "btn-learn-icon" src/
grep -rn "btn-star-repo" src/
grep -rn "repo-detail-lang-badge-lg" src/
```

If any of these still appear ONLY in `src/styles/globals.css` (i.e., the CSS rule exists but nothing uses it), delete the CSS rule. If they appear in a `.tsx` file that was NOT supposed to be touched, investigate — some other component may have legitimately used these classes and needs its own migration (unlikely but possible).

- [ ] **Step 2: Scan for unused imports in RepoDetail.tsx**

Run: `npm run build`

TypeScript / Vite will warn about unused imports. Common candidates after this refactor:
- Icons used only by the old banner or old Learn button
- `VerificationBadge` — should still be used (in `titleNode`)
- Any formatting helper only used by the deleted stats strip

Remove genuinely unused imports.

- [ ] **Step 3: Final build verification**

Run: `npm run build`
Expected: clean build, no warnings about unused exports, no TypeScript errors.

- [ ] **Step 4: Run the existing test suite**

Run: `npm test`
Expected: all existing tests pass. No new tests were added (per spec and TDD-inapplicable for layout refactors).

If tests fail that we didn't expect to touch, investigate — a layout refactor shouldn't break logic tests, so failures point at either unrelated changes or an accidental regression in our changes.

- [ ] **Step 5: Commit (if anything was cleaned up)**

```bash
git add -A
git commit -m "chore(repo-detail): remove orphaned banner/button classes post-refactor"
```

If nothing was left to clean up, skip this commit — Task 6 becomes a pure verification task with no commit.

- [ ] **Step 6: User handoff**

Hand off to the user with a summary:
- "Refactor complete. Expanded repo view now uses the new ArticleLayout. Sidebar has a new Stats block at the top. Please open a repo in the app and verify: (1) byline shows avatar + owner + 'Updated ...'; (2) title is the repo name with VerificationBadge; (3) tabs work as before; (4) action row at bottom has Learn / Star / Download with Learn in purple; (5) sidebar starts with Stats, then Skills Folder, then Repository metadata."

---

## Task Summary

| # | Task | Size | Dependencies |
|---|------|------|--------------|
| 1 | Scaffold ArticleLayout component | Small | None |
| 2 | Split glass card into two panels | Small | None (pure CSS + minor JSX restructure) |
| 3 | Migrate RepoDetail to use ArticleLayout | Large | Tasks 1, 2 |
| 4 | Build action row, migrate buttons | Medium | Task 3 |
| 5 | Add sidebar Stats block | Small | Task 3 (for sidebar edits to merge cleanly) |
| 6 | Cleanup + verification | Small | Tasks 1-5 |

Each task commits independently. If any task reveals an unexpected dependency or the spec needs revision, stop and surface to the user — do NOT barrel through.
