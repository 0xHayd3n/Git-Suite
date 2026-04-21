# Phase 5: My Library — Design Document

**Date:** 2026-03-27
**Route:** `/library`
**Status:** Approved

---

## Overview

My Library is a full management interface for installed skills. It presents all repos that have a skill installed (repos INNER JOIN skills) in a two-column split layout: a grouped list on the left and a type-aware detail panel on the right. Repos with `type = 'components'` get a component browser; all others get a generic skill file panel.

---

## 1. Database

### No schema migration required

All required columns already exist:
- `skills.active INTEGER` — 0 or 1, whether skill is active
- `skills.enabled_components TEXT` — JSON `string[] | null`; null means all enabled
- `repos.type TEXT` — set to `'components'` at install time for component libraries

### Component manifest storage

No separate `component_manifest` column. Component names and categories are parsed directly from the skill file markdown at render time using `skillParse.ts`. The skill generation prompt for component repos instructs Haiku to use `#### Category` and `### ComponentName` headings, producing a reliably parseable structure.

---

## 2. Backend Changes

### `electron/db.ts`
No changes required.

### `electron/main.ts` — component detection

The `isComponents` boolean is computed in `main.ts` after the repo row is fetched from DB (not in `skill-gen.ts`, which has no DB access). The DB write is also in `main.ts`:

```ts
// Inside skill:generate handler, after fetching repo row:
const topics = parseTopics(repo.topics)
const isComponents =
  topics.some(t => ['components', 'ui-components', 'design-system', 'component-library'].includes(t)) ||
  /ui|components|design.?system/i.test(repo.name)

if (isComponents) {
  db.prepare("UPDATE repos SET type='components' WHERE id=?").run(repo.id)
}
```

`isComponents` is passed as a flag into `generateSkill()` in `skill-gen.ts`.

### `electron/skill-gen.ts`

Accepts an extended input that includes `isComponents?: boolean` and `enabledComponents?: string[]`. When `isComponents` is true and `enabledComponents` is provided, appends the component prompt override:

```
This is a component library. Generate documentation ONLY for these enabled components: {list}.
For each component, include:
- Import statement
- Props interface (key props only)
- 1–2 usage examples
Organise by category using #### headings (Form & Input, Overlay & Feedback, Navigation & Layout).
Use ### ComponentName for each component heading.
```

When `isComponents` is true but `enabledComponents` is not provided (first-time install), Haiku generates all components it discovers, using the same `####`/`###` heading structure.

### `electron/main.ts` — `skill:generate` changes

**Extended signature:**
```ts
ipcMain.handle('skill:generate', async (_, owner: string, name: string, options?: { enabledComponents?: string[] })
```

**Extended return type** (updated from `{ content, version }` to):
```ts
{ content: string, version: string, generated_at: string }
```
`generated_at` is `new Date().toISOString()` set at the point of DB insert/update.

### New IPC handlers (`electron/main.ts`)

| Channel | Args | Returns | Notes |
|---|---|---|---|
| `library:getAll` | — | `LibraryRow[]` | INNER JOIN repos + skills, ORDER BY generated_at DESC |
| `skill:toggle` | `owner, name, active: 0\|1` | void | `UPDATE skills SET active=? WHERE repo_id=(SELECT id FROM repos WHERE owner=? AND name=?)` |
| `skill:setEnabledComponents` | `owner, name, enabled: string[]` | void | `UPDATE skills SET enabled_components=JSON` |
| `library:getCollections` | `repoId: string` | `string[]` | See SQL below |

**`library:getCollections` SQL:**
```sql
SELECT c.name FROM collections c
JOIN collection_repos cr ON cr.collection_id = c.id
WHERE cr.repo_id = ?
```

### `electron/preload.ts`

Updated `skill.generate` entry (passes `options`):
```ts
generate: (owner: string, name: string, options?: { enabledComponents?: string[] }) =>
  ipcRenderer.invoke('skill:generate', owner, name, options),
```

New entries:
```ts
skill: {
  // existing: get, delete (generate updated above)
  toggle: (owner: string, name: string, active: number) =>
    ipcRenderer.invoke('skill:toggle', owner, name, active),
  setEnabledComponents: (owner: string, name: string, enabled: string[]) =>
    ipcRenderer.invoke('skill:setEnabledComponents', owner, name, enabled),
},
library: {
  getAll: () => ipcRenderer.invoke('library:getAll'),
  getCollections: (repoId: string) => ipcRenderer.invoke('library:getCollections', repoId),
},
```

---

## 3. New TypeScript Type

```ts
// src/types/repo.ts
interface LibraryRow extends RepoRow {
  active: number
  version: string          // non-nullable: INNER JOIN guarantees skill row exists
  generated_at: string     // non-nullable: same reason
  filename: string
  content: string
  enabled_components: string | null  // JSON string[] | null
}
```

`version`, `generated_at`, `filename`, and `content` are non-nullable because `library:getAll` uses an INNER JOIN — a row only appears if both `repos` and `skills` entries exist.

---

## 4. `skillParse.ts` — New Export

```ts
interface ComponentEntry { name: string; category: string }

export function parseComponents(content: string): ComponentEntry[] {
  // Scan lines for #### headings (set current category)
  // and ### headings (emit { name, category: currentCategory })
  // Returns ordered array preserving document order
}
```

When `enabled_components` is null (all enabled), the full component list is derived from `parseComponents(selected.content)`.

---

## 5. `src/env.d.ts` — Updated API Type Declarations

```ts
interface Window {
  api: {
    // ... existing
    skill: {
      generate: (owner: string, name: string, options?: { enabledComponents?: string[] }) => Promise<{ content: string; version: string; generated_at: string }>
      get: (owner: string, name: string) => Promise<SkillRow | null>
      delete: (owner: string, name: string) => Promise<void>
      toggle: (owner: string, name: string, active: number) => Promise<void>
      setEnabledComponents: (owner: string, name: string, enabled: string[]) => Promise<void>
    }
    library: {
      getAll: () => Promise<LibraryRow[]>
      getCollections: (repoId: string) => Promise<string[]>
    }
  }
}
```

---

## 6. Library View (`src/views/Library.tsx`)

Single file. All sub-components (`GenericDetail`, `ComponentDetail`) are local — not split into separate files, consistent with Discover.tsx and RepoDetail.tsx patterns.

### Layout

```
┌── Topbar (bg2, border-bottom, padding 10px 20px) ──────────────────────┐
│  [filter input]   [Active] [A–Z] [Recent]                              │
└──────────────────────┬─────────────────────────────────────────────────┘
│  List (220px)        │  Detail panel (flex: 1)                         │
│  ─────────────────── │  ───────────────────────────────────────────────│
│  [stat pills row]    │  <GenericDetail> or <ComponentDetail>           │
│  [section header]    │  based on selected.type === 'components'        │
│  [repo row]          │                                                 │
│  [repo row]          │                                                 │
└──────────────────────┴─────────────────────────────────────────────────┘
```

### State

```ts
const [rows, setRows] = useState<LibraryRow[]>([])
const [filter, setFilter] = useState('')
const [sort, setSort] = useState<'active' | 'az' | 'recent'>('active')
const [selected, setSelected] = useState<LibraryRow | null>(null)
const [activeTab, setActiveTab] = useState<'components' | 'skill' | 'details'>('components')
const [componentSearch, setComponentSearch] = useState('')
const [collections, setCollections] = useState<string[]>([])
const [regenerating, setRegenerating] = useState(false)
```

**Tab reset rule:** When `selected` changes, reset `activeTab` to `'components'` if the new selection is a component repo, or `'skill'` if it is not. This ensures the detail panel always opens on a valid tab.

### On mount

`library:getAll` → populate `rows` → auto-select first row (triggering tab reset and collections load).

### Filtering & sorting

Applied client-side on `rows`:
- Filter: `row.name.toLowerCase().includes(filter.toLowerCase())`
- Sort `'active'`: active=1 first, then within each group by generated_at DESC
- Sort `'az'`: alphabetical by name
- Sort `'recent'`: generated_at DESC

### List grouping

```
if any rows have type='components' → "Component libs" section (those rows)
remaining rows → "Active" section (active=1) and "Inactive" section (active=0)
```
Section headers use existing Discover section header style (9px uppercase + horizontal rule).

### Stat pills

Three pills at top of list column (before sections):
- **Skills** — `rows.length`
- **Active** — `rows.filter(r => r.active === 1).length`
- **Updates** — always `0` for now (deferred: would require comparing stored skill version against latest GitHub release, which needs an additional per-row API call not in scope for Phase 5)

### Row anatomy

```
[lang badge 26×26] [name + type badge]   [active dot]   [toggle]
```

- Padding `8px 9px`, border-radius `6px`, border `1px solid transparent`
- Hover: `background var(--bg3)`
- Selected: `background var(--bg3)`, `border-color var(--border2)`
- Inactive rows: `opacity 0.45`
- Click row (not toggle) → set `selected`, reset `activeTab` per tab reset rule, load collections via `library:getCollections(row.id)`
- Click toggle → optimistic flip of `active`, call `skill:toggle`

**Type badge colours:**
| Type | bg | color | border |
|---|---|---|---|
| components | rgba(139,92,246,0.12) | #a78bfa | rgba(139,92,246,0.2) |
| framework | rgba(251,191,36,0.1) | #fbbf24 | rgba(251,191,36,0.18) |
| cli | rgba(34,197,94,0.1) | #4ade80 | rgba(34,197,94,0.18) |
| data | rgba(59,130,246,0.1) | #60a5fa | rgba(59,130,246,0.18) |
| lib | rgba(156,163,175,0.1) | #9ca3af | rgba(156,163,175,0.18) |

**Toggle:** 24×13px. On: `background rgba(124,58,237,0.45)`, `border var(--accent)`. Off: `background var(--bg4)`, `border var(--border2)`. Knob: 8×8px white circle.

---

## 7. Generic Detail Panel

Used when `selected.type !== 'components'`.

### Header (padding 16px 18px 14px, border-bottom)

- Language badge 32×32px
- Repo title 14px bold + owner 9px var(--t3)
- Far right: "Active" label (10px var(--t2)) + toggle

### Body (scrollable, padding 16px 18px, gap 14px)

**Skill file section:**
- Panel: bg var(--bg3), border, border-radius 7px
- Header row: `{name}.skill.md` left | `✓ current` right (9px #34d399)
- Note: "update available" indicator is deferred to a future phase — always shows `✓ current` in Phase 5
- Body: three depth bars (Core / Extended / Deep) — same as RepoDetail sidebar
- Note: `Generated from v{version} · {N} days ago` (9px var(--t3))

**Details section** (key-value rows):
- Saved (date)
- Repo version
- Skill size (KB — `(content.length / 1024).toFixed(1) + ' KB'`)
- Language
- License
- In collections (comma-separated names from `library:getCollections`, or "—")

**Action buttons:**
- `↺ Regenerate` — accent-soft bg, accent-border border, #a78bfa color. Calls `skill:generate(owner, name)`. Shows loading state. On success: updates `content`, `generated_at`, `version` in local row state.
- `Remove` — transparent bg, `rgba(239,68,68,0.2)` border, `rgba(239,68,68,0.5)` color. Hover: `rgba(239,68,68,0.07)` bg, `#f87171` color. Calls `skill:delete`, removes row from state, selects next row or clears selection.

---

## 8. Component Library Detail Panel

Used when `selected.type === 'components'`.

### Header

Same title/owner layout as generic. Below it:
- Purple "component library" type pill
- Count line: `{enabled} of {total} enabled · skill file {N} lines` (9px var(--t3))

### Tab bar: Components | Skill file | Details

Same tab style as RepoDetail. Default tab is `'components'` (set by tab reset rule on row selection).

### Components tab

**Toolbar:** search input (flex 1) | `{enabled} / {total}` text | "Select all" link (#a78bfa)

**Component grid:** 2-column, gap 6px, grouped under category labels parsed from `#### ` headings.

The full component list is derived from `parseComponents(selected.content)`. When `enabled_components` is null, all components are considered enabled. When it is a JSON string, parse it as `string[]` to get the enabled set.

Each component card:
- bg var(--bg3), border, border-radius 6px, padding 9px 10px
- Active: border-color var(--accent-border), bg var(--accent-soft)
- Inactive: opacity 0.38
- Layout: name (10px, flex 1) | preview | mini toggle (22×12px)

**Self-referential previews** (inline HTML per component name):

| Name | Preview HTML |
|---|---|
| Button | `<button style="background:#e8e8f0;color:#0a0a0e;font-family:inherit;font-size:8px;padding:3px 8px;border-radius:3px;border:none;">Button</button>` |
| Input | `<div style="background:var(--bg4);border:1px solid var(--border2);border-radius:3px;padding:3px 6px;font-size:8px;color:var(--t3);width:60px;">Input</div>` |
| Select | Same as Input + `display:flex;justify-content:space-between` + `▾` |
| Badge | Purple pill: `rgba(124,58,237,0.15)` bg, `#a78bfa` color |
| Switch | 24×13px toggle in on-state |
| Checkbox | 11×11px checked box |
| Slider | 60px track with filled portion and thumb |
| Tooltip | Small bordered box with "Tooltip" text |
| Dialog | Small bordered box with slight elevation |
| Progress | 60px bar at ~65% fill |
| Tabs | Two tiny tab labels, first active |
| Avatar | 18px circle with initials |
| Card | Small bordered rectangle |
| Separator | Horizontal 60px line |
| (unknown) | Component name in small text |

Clicking a card: toggles enabled state → optimistic update → `skill:setEnabledComponents(owner, name, newList)`.

**Enabled list logic:**
- If `enabled_components` is null → all components enabled. "All names" = `parseComponents(selected.content).map(c => c.name)`. Toggle off: set list to all names minus this one.
- If explicit list → add/remove name from list. Empty list is valid (all disabled).

### Footer bar

`Skill file reflects enabled components` (9px var(--t3)) | `↺ Rebuild skill` button (accent style)

Rebuild: calls `skill:generate(owner, name, { enabledComponents: enabledList })` where `enabledList` is the current enabled names array (expanded from null if necessary). On success: updates `content` and `generated_at` in local row state.

### Skill file tab (components)

Same as generic skill file section — depth bars + metadata. Shows line counts for the currently generated content.

### Details tab

Same as generic details section (Saved, Repo version, Skill size, Language, License, In collections).

---

## 9. Data Flow Summary

| Action | Optimistic? | IPC call | State update |
|---|---|---|---|
| Mount | — | `library:getAll` | `setRows`, auto-select first row |
| Select row | — | `library:getCollections(row.id)` | `setSelected`, `setCollections`, `setActiveTab` (tab reset) |
| Toggle active (list or detail) | Yes | `skill:toggle` | flip `active` in rows |
| Toggle component | Yes | `skill:setEnabledComponents` | update `enabled_components` in rows and selected |
| Regenerate | No (loading state) | `skill:generate(owner, name)` | update `content`, `generated_at`, `version` in row |
| Rebuild skill (components) | No (loading state) | `skill:generate(owner, name, { enabledComponents })` | update `content`, `generated_at` in row |
| Remove | No | `skill:delete` | remove row, select next or clear |

---

## 10. Files Changed

| File | Changes |
|---|---|
| `electron/main.ts` | Add `library:getAll`, `skill:toggle`, `skill:setEnabledComponents`, `library:getCollections` handlers; extend `skill:generate` with `options?` param, component detection + `type` DB write, and `generated_at` in return value |
| `electron/skill-gen.ts` | Extend input type with `isComponents?: boolean` and `enabledComponents?: string[]`; conditionally append component prompt |
| `electron/preload.ts` | Update `skill.generate` to pass `options`; add `skill.toggle`, `skill.setEnabledComponents`, `library.getAll`, `library.getCollections` |
| `src/env.d.ts` | Update `skill.generate` return type; add declarations for `skill.toggle`, `skill.setEnabledComponents`, `library.getAll`, `library.getCollections` |
| `src/types/repo.ts` | Add `LibraryRow` interface |
| `src/utils/skillParse.ts` | Add `parseComponents()` export and `ComponentEntry` interface |
| `src/views/Library.tsx` | Full implementation (replaces placeholder) |
| `src/styles/globals.css` | Library-specific styles |
