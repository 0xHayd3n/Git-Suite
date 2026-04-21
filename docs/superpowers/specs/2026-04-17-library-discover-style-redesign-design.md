# Library — Discover-Style Redesign

## Problem

The Library view (`src/views/Library.tsx`) has drifted from the richer categorization and interactivity the rest of the app now supports:

- **Grouping is legacy.** Skills are sectioned into `Component libs / Active / Inactive`, driven by the legacy `row.type === 'components'` flag. The real `type_bucket` / `type_sub` system — 8 buckets, 75+ sub-types, already used by Discover and already present on every `LibraryRow` — is ignored for organization.
- **Interactivity is asymmetric.** Only UI-library skills get a rich interactive detail (`ComponentDetail`, with its component picker and skill rebuild). Every other skill type falls back to `GenericDetail`, which is metadata + Regenerate/Enhance/Remove. MCP servers, which expose discrete tools the user may or may not want in their skill, get no affordance for tool selection.
- **Visual vocabulary is inconsistent.** Discover has a rich sidebar + grid + filter-chip pattern. Library reimplements a narrower set of the same concerns (sort buttons, stat pills, master/detail) with no shared components.

This redesign aligns Library with the Discover visual pattern and introduces a second interactive detail variant — an MCP tools picker — using the existing `sub_skills` infrastructure.

## Goals & Non-goals

**Goals**
- Replace the two-column master/detail layout with a sidebar + grid + slide-in detail layout modeled on Discover.
- Group skills by `type_bucket` when no filter is applied; flatten when any filter is applied.
- Preserve the Active/Inactive distinction as a first-class top-bar control (not a sidebar filter).
- Introduce `MCPToolsDetail` — a new interactive detail variant for MCP-server skills, mirroring the existing `ComponentDetail` pattern.
- Reuse `DiscoverSidebar`, `LayoutDropdown`, `GridHeader` filter chips, and `RepoCard` visuals wherever possible. Avoid duplication.

**Non-goals**
- Changing Discover in any way beyond extending `DiscoverSidebar` with a `mode` prop.
- Building interactive detail variants for other buckets (Infrastructure, Learning, Dev Tools, …). Those are future variants of the same pattern; this spec ships the MCP one only.
- Changing the skill generation pipeline beyond adding an `enabledTools` branch to the prompt template.
- Replacing `ComponentDetail` or `GenericDetail` behavior. They remain as-is inside the new slide-in panel chrome.

## Settled decisions

The design space was explored through directed questions. Recorded here so implementers and reviewers don't have to relitigate them:

| Decision | Value | Reason |
|---|---|---|
| Primary goal scope | Both grouping redesign + interactivity expansion, coordinated | User requested one coherent redesign. |
| Layout model | Discover-style sidebar + grid; slide-in right detail panel | "Like Discover" + detail panel must stay to host interactivity. |
| Detail panel location | Side-panel on the right, slide-in, pushes grid (does not overlay) | Keeps the whole context visible. |
| Detail panel close | Explicit close button (✕) + Escape; clicking same card toggles closed | Click-again-to-close matches current master/detail behavior. |
| Active/Inactive signal | Top-bar segmented control: All / Active / Inactive | More prominent than a sidebar filter; Active is a first-class concept. |
| Active default | "Active" (hide inactive by default) | Matches today's bias toward showing enabled skills. |
| Grid rendering | Sectioned by bucket when no filter is active; flat when any filter is active | Preserves inventory overview; degrades to Discover's flat grid under filtering. |
| Interactive variant(s) to ship | Keep `ComponentDetail`; add `MCPToolsDetail` | `ComponentDetail` already works. MCP picker directly addresses installed MCP servers. |
| Low-confidence MCP scan (README-only) | Show picker with warning banner | User can still act; informed it may be stale or incomplete. |

## Architecture

```
┌──────────────┬──────────────────────────────────┬─────────────────┐
│  Sidebar     │  Top bar                         │  Detail panel   │
│  (filters)   │  [All|Active|Inactive] sort ▼    │  (slide-in,     │
│              │  layout ▼  | filter chips        │   right)        │
│  Discover-   │  ──────────────────────────────  │                 │
│  Sidebar     │                                  │  Header         │
│  mode=       │  LibraryGrid                     │  Tabs           │
│  'library'   │  ─ sectioned by bucket           │  Body:          │
│              │     (no filters applied), or     │   Component-    │
│  • Home      │  ─ flat                          │   Detail |      │
│  • Buckets   │     (any filter applied)         │   MCPTools-     │
│  • Languages │                                  │   Detail |      │
│  • Verif.    │  Cards/rows: LibraryCard         │   GenericDetail │
│  • Skill     │                                  │                 │
│    Status    │                                  │                 │
└──────────────┴──────────────────────────────────┴─────────────────┘
```

Sidebar, grid, and detail are all visible simultaneously when a card is selected. On narrow viewports (≤1200px), the detail panel pushes the grid into a reduced width rather than overlaying; below a further breakpoint it takes the whole content area (existing responsive pattern on `ComponentDetail`/`GenericDetail`).

## 1. Sidebar

Reuse `DiscoverSidebar` with a new `mode: 'discover' | 'library'` prop that gates panel visibility and enables per-label count annotations.

### 1.1 Panels shown in `mode='library'`
- **Home** — resets all filters (same behavior as Discover).
- **Buckets** — same as Discover, restricted to buckets with ≥1 installed skill. Label renders `"Frameworks (3)"` — count of matching skills.
- **Languages** — same as Discover, restricted to languages present in the library. Same count annotation pattern.
- **Verification** — unchanged from Discover.
- **Skill Status** *(new)* — two multi-select checkboxes:
  - "Enhanced (Tier 2)" → filters to `tier >= 2`.
  - "Components available" → filters to rows that have a `components` sub-skill.

### 1.2 Panels hidden in `mode='library'`
- Filters panel (activity / stars / license) — discovery-time concerns; not meaningful for installed skills.
- Advanced panel — not relevant.

### 1.3 Interface changes to `DiscoverSidebar`
- New prop `mode: 'discover' | 'library'` (default `'discover'`).
- New prop `itemCounts?: { byBucket: Map<string, number>; byLanguage: Map<string, number> }` — when provided, labels show `(n)` annotations.
- New props for Skill Status panel state and callbacks (only used in `mode='library'`).
- Existing Discover usage unchanged (new props are all optional).

## 2. Top bar

A strip above the grid with four controls:

```
[ All | Active | Inactive ]    sort: Active ▼    layout: ▦ ▼    │ chips: (filters)
```

- **Active segmented control** — three-way: All / Active / Inactive. Default on first load: **Active** (hides inactive skills). Selection persists in the component's state across the session; no localStorage.
- **Sort dropdown** — options: `A–Z`, `Recent`, `Bucket`. "Active" is removed as a sort (superseded by the segmented control). "Bucket" is disabled when the grid is in sectioned mode (no-op).
- **Layout dropdown** — reuse Discover's `LayoutDropdown`. Grid vs list, column count, density, field visibility.
- **Filter chips** — reuse the `GridHeader` chips pattern: one chip per active bucket/sub-type/language/verification filter, dismissible.

## 3. Grid

A new component `LibraryGrid` handles both rendering modes in one component. Mode is derived from filter state.

### 3.1 Sectioned mode
Active when zero sidebar filters are applied (Skill Status panel, Buckets panel, Languages panel, Verification panel all empty). The Active segmented control does not affect mode — it filters the item set before rendering.

- Grid is divided into bucket sections in `REPO_BUCKETS` order: Dev Tools → Frameworks → AI & ML → Learning → Editors → Language Projects → Infrastructure → Utilities.
- Each section renders a header: bucket label, 2px left-border in the bucket accent color, count badge of skills in that section.
- Sections with zero skills after filtering are omitted entirely.
- Skills within a section render in a grid per `LayoutDropdown` prefs.
- Sort applies within each section.

### 3.2 Flat mode
Active when any sidebar filter is applied.

- No section headers. All matching skills in one grid.
- Behaves exactly like Discover's grid.
- Sort applies across all skills.

### 3.3 `LibraryCard` component
New component for grid-mode rendering. List mode delegates to `LibraryListRow` (kept as-is) or an inlined list representation — implementation choice deferred to the plan.

Visuals derived from `RepoCard` with library-specific additions:
- Language badge (reuse).
- Name + owner (reuse; owner opens profile overlay).
- Description + banner color (reuse).
- **Active dot** — small colored indicator at the top-right, green when active, grey when inactive.
- **Inline Active toggle** — revealed on hover, one-click activate/deactivate without opening the detail panel.
- **Tier badge** — "Enhanced" pill when `tier >= 2`.
- **Type badge** — sub-type label/color via `getSubTypeConfig`.
- **Sub-skill indicator** — small icon in a corner when the skill has a `components` or `mcp-tools` sub-skill. Signals clickable-for-interactive-detail.
- **Verification badge** — reuse `VerificationBadge`.

## 4. Detail panel

A right-side slide-in panel. Width ~420px on wide screens; pushes the grid (does not overlay). On narrow viewports it takes the full content area (existing responsive pattern).

### 4.1 Chrome
- Slide-in animation on open/close (CSS transform).
- Close button (✕) in the top-right corner.
- Escape key closes the panel and deselects the current card.
- Clicking the currently-selected card closes the panel.
- Clicking a different card switches selection without closing.

### 4.2 Variant dispatch
`Library.tsx` selects the detail component in this priority:

1. `ComponentDetail` — if a `components` sub-skill exists for the row. (Existing logic, unchanged.)
2. `MCPToolsDetail` — if an `mcp-tools` sub-skill exists for the row. (New.)
3. `GenericDetail` — fallback. (Unchanged.)

Sub-skill presence is fetched on row selection via the existing `skill:getSubSkill(owner, name, skillType)` IPC handler, which is already polymorphic over `skill_type`.

### 4.3 Removed behaviors
- The existing "← Back" button inside `ComponentDetail`/`GenericDetail` is removed. Close is handled by the panel's ✕ button and Escape key at the `Library.tsx` level.

## 5. MCP tools picker (new interactive variant)

### 5.1 Scanner

New IPC handler `mcp:scanTools(owner, name)` → `McpScanResult`. Detection chain, tried in order; first success returns:

1. **Static source parse.** Walk the repo's source tree for MCP SDK registrations:
   - TypeScript/JS: `server.registerTool(...)`, `server.tool(name, ...)`, similar SDK patterns.
   - Python: `@mcp.tool()` decorators, `Tool(name=...)` constructors.
   - Extract `name`, `description` (from docstring / leading comment / JSDoc), `paramSchema` when inferable.
   - `source: 'static'`.
2. **Manifest file.** If `tools.json`, `mcp.json`, or `.mcp/tools.json` exists at the repo root, parse it for tool definitions.
   - `source: 'manifest'`.
3. **README extraction.** Parse `README.md` for a `## Tools` / `## Available tools` heading, extract bullet-list entries.
   - `source: 'readme-approx'`.
4. **No match.** Return `{ tools: [], source: 'static', detectedAt: <now> }` (not an error).

Results are cached in `sub_skills` with `skill_type = 'mcp-tools'`. Re-scan is triggered by an explicit "Rescan" action in the detail panel (same pattern as components).

### 5.2 Types

New file `src/types/mcp.ts`:

```ts
export interface McpTool {
  name: string
  description: string | null
  category: string | null
  paramSchema: unknown | null
  source: 'static' | 'manifest' | 'readme-approx'
}

export interface McpScanResult {
  tools: McpTool[]
  source: 'static' | 'manifest' | 'readme-approx'
  detectedAt: string
}
```

### 5.3 Storage

Schema migration adds one column:

```sql
ALTER TABLE skills ADD COLUMN enabled_tools TEXT;
```

Semantics: `null` means all tools enabled (symmetric to `enabled_components`). JSON `string[]` of tool names when explicitly set.

`library:getAll` SELECT adds `s.enabled_tools` to the projection.

`LibraryRow` in `src/types/repo.ts` gains `enabled_tools: string | null`.

### 5.4 IPC

New handlers:
- `mcp:scanTools(owner, name)` → `McpScanResult` — runs scanner; upserts into `sub_skills`.
- `skill:setEnabledTools(owner, name, toolNames: string[])` → `void` — mirrors `skill:setEnabledComponents`.

Extended handler:
- `skill:generate(owner, name, { enabledComponents?, enabledTools? })` — accepts the new optional `enabledTools` param. Passed into the prompt template. Backwards compatible.

### 5.5 UI — `MCPToolsDetail`

Mirrors `ComponentDetail` so users who know the components picker need zero relearning.

**Header:** same as `ComponentDetail` (language badge, name, owner, Enhanced pill, view-repo button, Active toggle).

**Type pill** below the title: `"MCP server"`.

**Tabs:**
- **Tools** (default)
- **Skill file**
- **Details**

**Tools tab:**
- Toolbar: search input, `"(enabled / total) enabled"` counter, "Select all" button.
- **Warning banner** rendered above the toolbar when the scan's `source === 'readme-approx'`:
  - Yellow background, text: "Tools extracted from README — may be incomplete or out of date."
  - Dismissible within session only (not persisted).
- Tool cards grouped by `category`. Tools with no category render in a single ungrouped list.
- Each card: tool name, one-line description, per-card toggle.
- Footer: "Skill file reflects enabled tools" note + "Enhance" button (if `tier < 2`) + "Rebuild skill" button.

**Skill file tab:** identical to `ComponentDetail`'s — `SkillDepthBars` + generation metadata.

**Details tab:** identical to `ComponentDetail`'s, with the addition of an "MCP tools" row in the sub-skills section showing: scan source (`static` / `manifest` / `readme-approx`) and detection date.

### 5.6 Rebuild pipeline
"Rebuild skill" calls `skill:generate(owner, name, { enabledTools: [...] })`. The prompt template gets a new branch for MCP-tools skills that emits a skill scoped to only the selected tools. Parallel to the existing `enabledComponents` branch — prompt-template work, not a new pipeline.

## 6. File-level impact

### New files
- `src/components/LibraryGrid.tsx` — sectioned / flat grid renderer.
- `src/components/LibraryCard.tsx` — card with Active dot, hover toggle, sub-skill indicator.
- `src/components/MCPToolsDetail.tsx` — new interactive detail variant.
- `src/types/mcp.ts` — `McpTool`, `McpScanResult`.
- `electron/mcp-scanner.ts` — three-tier scanner.
- `electron/mcp-scanner.test.ts` — scanner unit tests.
- `src/components/LibraryGrid.test.tsx`, `src/components/LibraryCard.test.tsx`, `src/components/MCPToolsDetail.test.tsx`.

### Modified files
- `src/views/Library.tsx` — rewrite around the new layout. Orchestrates state (rows, selected, filters, sort, active segmented control, sub-skill metadata); delegates rendering to `DiscoverSidebar` + `LibraryGrid` + one of the three detail variants.
- `src/views/Library.test.tsx` — rewritten for the new structure.
- `src/components/DiscoverSidebar.tsx` — add `mode` prop; conditional panel visibility; optional per-label counts; Skill Status panel.
- `src/components/DiscoverSidebar.css` — additions for Skill Status panel.
- `src/types/repo.ts` — `enabled_tools: string | null` on `LibraryRow`.
- `electron/main.ts` — new IPC handlers `mcp:scanTools`, `skill:setEnabledTools`; extend `skill:generate` param; update `library:getAll` SELECT; schema migration for `enabled_tools`.
- `electron/skill-generator.ts` (or equivalent) — new prompt-template branch for MCP tools subset.
- `src/styles/globals.css` — CSS for `library-grid`, `library-card`, bucket section headers, slide-in panel animation, close button.

### Files likely removed or folded
- `src/components/LibraryListRow.tsx` — folded into `LibraryCard`'s list-mode rendering, or kept as a thin wrapper. Decision deferred to the implementation plan.

### Files untouched
- `ComponentDetail.tsx`, `GenericDetail.tsx` — same props, same rendering; just live inside the new slide-in panel chrome.
- `repoTypeConfig.ts`, `VerificationBadge.tsx`, `SkillDepthBars.tsx`, `Toggle.tsx`, `LangBadge.tsx`.
- All of `Discover.tsx`.

## 7. Testing

### Component tests
- `LibraryGrid.test.tsx` — sectioned vs flat switching based on filter presence; bucket section ordering; empty-bucket omission; sort application within sections.
- `LibraryCard.test.tsx` — Active dot color, hover toggle invokes callback, sub-skill indicator presence for `components` and `mcp-tools`.
- `MCPToolsDetail.test.tsx` — tab switching; tool search filter; per-card toggle updates state; warning banner renders iff `source === 'readme-approx'`; Rebuild button invokes `skill:generate` with `enabledTools`; Select All toggles all on.
- `DiscoverSidebar.test.tsx` — extend: `mode='library'` hides Filters panel and shows Skill Status panel; bucket / language counts render from `itemCounts`; `mode='discover'` behaves unchanged.

### Scanner tests (`electron/mcp-scanner.test.ts`)
- Static parse: TypeScript fixture with three `registerTool` calls → three tools with names + descriptions; `source: 'static'`.
- Manifest parse: fixture containing `tools.json` with a tool array → parsed directly; `source: 'manifest'`.
- README extraction: fixture README with `## Tools` section and bullet list → tools extracted; `source: 'readme-approx'`.
- No match: empty repo → `tools: []`, `source: 'static'`, no error.

### Integration tests (`src/views/Library.test.tsx`)
- Sidebar filter application switches grid from sectioned to flat.
- Active segmented control filters grid items.
- Clicking a card opens the detail panel; clicking the same card again closes it.
- Clicking a different card while panel is open switches selection without closing.
- Escape key closes the panel.
- Dispatch: row with `components` sub-skill → `ComponentDetail`; row with `mcp-tools` sub-skill → `MCPToolsDetail`; row with neither → `GenericDetail`.

### Migration test
- `enabled_tools` column added without data loss. Existing rows have `enabled_tools = null`.

### Not tested
- Visual styling — user tests UI changes themselves.
- Actual MCP server execution — scanning is static, never runs the server.

## 8. Phasing guidance

The design is one coordinated redesign, but ships cleanly in two phases if desired:

1. **Layout phase** — sidebar integration, top bar, `LibraryGrid`, `LibraryCard`, slide-in detail panel chrome. All three existing detail variants (including `ComponentDetail`) work inside the new chrome. No MCP tools picker yet; MCP skills use `GenericDetail` in this phase.
2. **MCP tools phase** — scanner, `enabled_tools` column, `MCPToolsDetail`, prompt-template branch, new IPC handlers.

Each phase is independently shippable; neither is blocked on the other after Phase 1 lands. Final phasing call lives in the implementation plan, not here.

## 9. Risks & open questions

- **Static MCP parser coverage** — the space of MCP SDK registration patterns is broad across languages. The parser will work best on TS/JS and Python, degrade gracefully to manifest and README paths, and return `tools: []` cleanly for unsupported languages rather than failing. The warning banner surfaces the uncertainty to the user.
- **Prompt template for MCP tools subset** — the exact prompt wording for generating a skill scoped to a chosen subset of tools is not specified here. The implementation plan should block on reviewing the existing components-subset prompt and designing a parallel MCP-tools prompt.
- **Card vs row decision for list mode** — `LibraryCard` is the grid-mode representation. List-mode representation (the existing `LibraryListRow` or an inlined variant) is an implementation choice, not a design choice.
