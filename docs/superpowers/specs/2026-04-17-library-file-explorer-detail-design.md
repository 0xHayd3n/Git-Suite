# Library File Explorer Detail

**Date:** 2026-04-17

## Goal

Replace the Library detail panel's current skill/component/MCP content with a file explorer view. When a repo is selected in the Library, the panel shows a compact header + GitHub file tree instead of the existing tabbed detail views.

## User-confirmed behaviour

- The file explorer IS the expanded view — no toggle, always shown on selection
- File tree shows real GitHub repo files (via existing `FilesTab` component)
- Animation: smooth single-motion morph (~280ms) — header and body arrive together on each selection
- After: compact one-row titlebar (icon, name, author, actions) + full `FilesTab` body

---

## Architecture

### New component: `src/components/LibraryFilesDetail.tsx`

```ts
interface Props {
  row: LibraryRow
  onToggleActive: (v: boolean) => void
  onInstalled: (result: { content: string; version: string | null; generated_at: string | null }) => void
  onEnhance: () => void
  regenerating: boolean
}
```

Two-zone layout, fills the full height of `LibraryDetailPanel`:

1. **Compact titlebar** (~40px tall, `flex-shrink: 0`)
   - Language icon scaled to 20×20px
   - Repo name (bold, 13px) + "by {owner}" (muted, 11px)
   - Stars + version (muted, 11px)
   - Action buttons (right-aligned): active toggle if installed, Install button if not, view-repo icon link
   - **View-repo URL:** `row` has no `html_url` field — derive it as `` `https://github.com/${row.owner}/${row.name}` ``
2. **Body** — `<FilesTab owner={row.owner} name={row.name} branch={row.default_branch ?? 'main'} />` with `flex: 1; min-height: 0; overflow: hidden`

**`FilesTab` context isolation:** `FilesTab` calls `useRepoNav()` and writes to a shared `RepoNavContext`. Wrap the `FilesTab` render in a local `<RepoNavProvider>` so its nav side-effects are isolated from the global context (which `RepoDetail` / `NavBar` depend on).

**Animation:** Add a CSS `@keyframes panel-slide-in` on the root element of `LibraryFilesDetail`:
```css
@keyframes panel-slide-in {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
.library-files-detail {
  animation: panel-slide-in 280ms ease-out forwards;
}
```
In `Library.tsx`, render `<LibraryFilesDetail key={selected.id} .../>` so React remounts the component on each new selection, re-triggering the animation. This avoids touching `.library-detail-panel` base CSS (which is hardcoded `open` and always visible).

**`default_branch` fallback:** `row.default_branch ?? 'main'` is the correct prop. `FilesTab` already has its own `main → master` retry internally, so no additional fallback is needed in `LibraryFilesDetail`. If the repo is private or deleted, `FilesTab`'s own error state handles it.

---

### Modified: `src/views/Library.tsx`

**State to remove** (only used by the old detail components):
- `activeTab`, `setActiveTab`
- `componentSearch`, `setComponentSearch`
- `collections`, `setCollections`
- `toolSearch`, `setToolSearch`
- `mcpActiveTab`, `setMcpActiveTab`
- `versionedInstalls`, `setVersionedInstalls`
- `mcpScanResult`, `setMcpScanResult`

**State to keep** (still used for card indicators and `componentsOnly` filter):
- `componentsSubSkill`, `mcpToolsSubSkill` — populated by `getSubSkill` IPC in `selectRow`
- `subSkillIds` + its `useEffect` — populates card badge indicators and powers the `componentsOnly` filter in `DiscoverSidebar`
- `panelOpen` — controls the toggle-off behaviour in `selectRow` (clicking a selected row closes the panel)

**IPC calls to remove from `selectRow`:**
- `window.api.library.getCollections(row.id).then(setCollections)`
- `window.api.skill.getVersionedInstalls(...).then(setVersionedInstalls)`

**IPC calls to keep in `selectRow`:**
- `window.api.skill.getSubSkill(row.owner, row.name, 'components').then(setComponentsSubSkill)` — needed for `subSkillIds` badge
- `window.api.skill.getSubSkill(row.owner, row.name, 'mcp-tools').then(setMcpToolsSubSkill)` — needed for `subSkillIds` badge

**`selectRow` resets to remove:**
- `setActiveTab('components')`
- `setComponentSearch('')`
- `setCollections([])`
- `setToolSearch('')`
- `setMcpActiveTab('tools')`
- `setVersionedInstalls([])`
- `setMcpScanResult(null)`

**Detail rendering — replace the entire conditional block** (lines ~298–476) with:
```tsx
{selected ? (
  <LibraryFilesDetail
    key={selected.id}
    row={selected}
    onToggleActive={(v) => handleToggle(selected, v)}
    onInstalled={(result) => {
      const updated = { ...selected, installed: 1, active: 1, ...result }
      setRows(prev => prev.map(r => r.id === selected.id ? updated : r))
      setSelected(updated)
      toast('Skill installed', 'success')
    }}
    onEnhance={() => handleEnhance(selected)}
    regenerating={regenerating}
  />
) : (
  <div className="library-detail-empty">Select a skill to view details</div>
)}
```

The empty-panel placeholder (`library-detail-empty`) is preserved so the always-visible panel column doesn't appear blank when nothing is selected.

---

### Modified: `src/styles/globals.css`

Add the `@keyframes panel-slide-in` and `.library-files-detail` rule described above. No changes to `.library-detail-panel` base CSS.

---

## Files touched

| File | Change |
|---|---|
| `src/components/LibraryFilesDetail.tsx` | **New** — compact header + isolated FilesTab |
| `src/views/Library.tsx` | Remove dead state/IPC; replace detail rendering block |
| `src/styles/globals.css` | Add `panel-slide-in` keyframe + `.library-files-detail` rule |

Estimated ~130 lines changed/added across 3 files.

## Not changed

- `GenericDetail`, `ComponentDetail`, `MCPToolsDetail`, `NotInstalledDetail` — not deleted, may be used elsewhere
- `FilesTab` internals — no changes
- Left panel (grid/list), resize handle, sidebar filters — no changes
- `componentsOnly` filter and `subSkillIds` card badges — preserved
