# Skill File Display Design

**Date:** 2026-03-30
**Status:** Approved
**Scope:** RepoDetail sidebar + expanded Skill file tab

---

## Problem

When a repo is installed, multiple skill files are generated (e.g. `material-ui.skill.md` and `material-ui.components.skill.md`). Currently only the master skill file appears in the sidebar panel, and in the expanded Skill file tab the components sub-skill is appended below the master content with no clear file separation. Users cannot see at a glance what files exist, and navigating between them is not possible.

---

## Design

### 1. Sidebar — Nested Sub-Skill Entries

The existing master skill panel card (`.sidebar-skill-panel` — filename + active badge + Core/Extended/Deep depth bars + version/date) is unchanged. The Regenerate button behaviour is also unchanged and out of scope for this change.

Sub-skill rows are rendered as standalone elements **between the master skill panel card and the Regenerate button**, visually connected to the master card by a subtle vertical left border (tree-style indent). Each row shows:

- Filename (e.g. `material-ui.components.skill.md`) in monospace
- A coloured dot indicating the sub-skill type
- File size and relative date on a second line (e.g. `2.0 KB · today`). If `generated_at` is null, the date segment is omitted, rendering only the file size.

If no sub-skills exist for the installed repo, no extra rows render — the Regenerate button sits directly below the master panel card as before.

**Colour assignments:**
- Master skill: green (`#059669`) — matches existing depth bar Core colour
- Components sub-skill: indigo (`#6366f1`) — distinct from the depth bar purples (`#7c3aed`, `#4c1d95`) to avoid semantic confusion in the sidebar
- Future sub-skill types: additional colours TBD

---

### 2. Expanded Skill File Tab — File Icon Picker

The current layout (master content rendered, components appended below with a `sub-skill-section` divider) is replaced entirely.

**Top of the tab:** A horizontal row of file cards. Each card contains:
- A document icon glyph coloured to match the skill type (green for master, indigo for components)
- The full filename beneath the icon

The active card has a highlighted border in its type colour. Cards are always rendered left-to-right: master first, then sub-skills in generation order.

The master file card is selected by default when the tab opens.

**Below the picker:** For the selected file:
1. A metadata row — size · version · date. Version is omitted when null or empty string, matching the existing defensive guard (`version ? ...`) used in the sidebar meta line.
2. The full file content rendered using the existing `SkillFileContent` component

Cards render left-to-right: master first, then sub-skills ordered alphabetically by `skill_type`. With a single sub-skill type this is trivially stable; ordering can be revisited if a second type is added.

If only one file exists (e.g. components skill not yet generated), the picker still renders with a single card for consistency.

---

## Data

No new data fetching is required. `skillRow` (master) and `componentsSkillRow` (components sub-skill) are already fetched and available in `RepoDetail.tsx` state. Note that `SubSkillRow.version` is typed `string | null` — the metadata row must handle null gracefully by omitting it.

---

## Files Affected

- `src/views/RepoDetail.tsx` — sidebar nested entries + file picker UI
- `src/styles/globals.css` — new CSS classes for nested sidebar rows and file picker cards; existing `.sub-skill-section*` classes removed as the divider pattern they support is replaced by the file picker
