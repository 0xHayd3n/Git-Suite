# Repo Detail Layout Redesign

**Date:** 2026-03-27
**Status:** Approved
**File:** `src/views/RepoDetail.tsx`, `src/styles/globals.css`

---

## Overview

Restructure the RepoDetail view to eliminate the sidebar entirely. Content currently in the sidebar is redistributed into tabs (related repos, skill depths) or an expandable stats bar row (repo metadata). The result is a single-column layout with a wider main content area.

---

## Changes

### 1. Related Repos → New Tab

- Extend the `Tab` union type to include `'related'`: `'readme' | 'skill' | 'releases' | 'collections' | 'related'`
- Add `{ id: 'related', label: 'Related' }` to `ALL_TABS` after `collections`
- Tab is hidden when `related.length === 0`. There is no loading state for `related` — it starts as `[]` and populates asynchronously. The tab will appear once repos arrive. This flicker trade-off is acceptable; do not add a separate loading state.
- Content renders as a CSS grid using class `related-repos-grid`: `display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;`
- Each card uses the existing `.related-repo-card`, `.related-repo-name`, `.related-repo-desc`, `.related-repo-stars` classes — **these are kept, not deleted**. Font sizes (11px name, 9px desc) are intentional and work in the wider grid context.

### 2. Skill Depths → Skill File Tab Header

- The Skill file tab renders two sections when a skill is installed:
  1. **Header section** (`.skill-tab-header`) — contains:
     - A label row (`.skill-tab-header-meta`) with filename `{name}.skill.md` and version/install status
     - Core / Extended / Deep depth bars with line counts, using existing depth-row styles (renamed — see CSS section)
     - "Models read as far as context allows." note
  2. **File content** — `SkillFileContent` rendered below the header section
- When `skillRow` is null: show the existing placeholder message only, no header section
- When `skillRow` is set but `parseSkillDepths` returns all zeros (malformed file): still render the header section with zero-width bars — do not hide it

### 3. Repo Metadata → Expandable Stats Bar Row

- Add `showDetails` boolean state (default `false`)
- Reset `showDetails` to `false` in the `useEffect([owner, name])` reset block alongside the other state resets
- After the "Updated `<date>`" segment in the stats bar, add a chevron toggle button (`.repo-detail-stats-expand`) — `›` when collapsed, `∨` when expanded
- Clicking it toggles `showDetails`
- When `showDetails` is true, render a detail row (`.repo-detail-stats-details`) inside the same stats bar container, below the main stat row, separated by a subtle `border-top: 1px solid var(--border)`
- Detail row shows: License · Language · Size · Watchers · Collections (comma-separated collection names, or `—`)

### 4. Layout & Sidebar Removal

- Keep the `repo-detail-body` div but change its CSS from a flex row to a single column: remove `flex-direction: row`, remove `gap`. `repo-detail-main` takes full width (`flex: 1`, no fixed width constraint).
- Delete the entire `repo-detail-sidebar` div and all its child markup from JSX
- **CSS classes to delete** (sidebar-specific only): `.repo-detail-sidebar`, `.skill-panel`, `.skill-panel-header`, `.skill-panel-filename`, `.skill-panel-status`, `.skill-panel-body`, `.skill-depth-row`, `.skill-depth-label`, `.skill-depth-track`, `.skill-depth-fill`, `.skill-panel-note`, `.repo-meta-section`, `.repo-meta-label`, `.repo-meta-row`, `.repo-meta-key`, `.repo-meta-val`, `.related-repos-section`
- **CSS classes to keep**: `.related-repo-card`, `.related-repo-name`, `.related-repo-desc`, `.related-repo-stars` — these move to the Related tab

---

## Component Structure (after)

```
RepoDetail
  breadcrumb
  banner
  install error
  stats bar (.repo-detail-stats-bar)
    stat row (stars · forks · issues · version · updated · [chevron toggle])
    [detail row — license · language · size · watchers · collections]  ← toggled via showDetails
  repo-detail-body  (single column — flex: 1, no row direction)
    repo-detail-main
      tabs: README | Skill file | Releases | Collections | Related
      tab body
        readme → ReadmeRenderer
        skill  → skill-tab-header (depths + meta) + SkillFileContent  (or placeholder if no skill)
        releases → release list
        collections → pill list
        related → related-repos-grid (cards)  (tab hidden when related.length === 0)
```

---

## State Changes

| New/changed state | Type | Purpose |
|---|---|---|
| `showDetails` | `boolean` | Toggle expanded metadata row in stats bar |
| `Tab` union | type | Add `'related'` |

`showDetails` must be reset to `false` in the `useEffect([owner, name])` reset block.

---

## CSS Changes

**Add:**
- `.related-repos-grid` — `display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; padding: 4px 0;`
- `.skill-tab-header` — `background: var(--bg3); border: 1px solid var(--border); border-radius: 7px; padding: 12px; margin-bottom: 12px;`
- `.skill-tab-header-meta` — `display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 10px; color: var(--t2);`
- `.skill-tab-depth-row` — same rules as old `.skill-depth-row` (reuse pattern, new name in skill-tab context)
- `.skill-tab-depth-label` — same as old `.skill-depth-label`
- `.skill-tab-depth-track` — same as old `.skill-depth-track`
- `.skill-tab-depth-fill` — same as old `.skill-depth-fill`
- `.skill-tab-note` — same as old `.skill-panel-note`
- `.repo-detail-stats-expand` — small inline button; `background: none; border: none; color: var(--t3); cursor: pointer; font-size: 10px; padding: 0 4px;`
- `.repo-detail-stats-details` — `border-top: 1px solid var(--border); padding: 6px 16px; display: flex; gap: 12px; flex-wrap: wrap; font-size: 10px; color: var(--t2);`

**Update:**
- `.repo-detail-body` — remove sidebar-specific flex rules; keep as a simple block or single-column flex

**Remove:** all sidebar-specific classes listed in Section 4

---

## Testing

Update `src/views/RepoDetail.test.tsx` to cover:
- **Related tab**: tab is absent when `related = []`; tab appears and cards render when related repos are provided
- **`showDetails` toggle**: detail row hidden by default; chevron click reveals detail row; navigating to a new repo resets it to hidden
- **Skill tab header**: depth section renders inside skill tab when skill is installed; only placeholder shown when not installed

---

## Out of Scope

- No changes to `ReadmeRenderer`, `BannerSVG`, or any other component
- No changes to data fetching logic
- No changes to the Collections or Releases tab content
