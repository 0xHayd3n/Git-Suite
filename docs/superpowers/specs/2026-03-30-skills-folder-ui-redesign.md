# Skills Folder UI Redesign

## Overview

Three focused UI improvements to the skill file panel:

1. **Rename** "Skill file" → "Skills Folder" everywhere in the UI
2. **Box-style** the sub-skill entry in the sidebar to match the master skill box
3. **Per-file regenerate buttons** — replace the single global "Regenerate skill" button with individual ↻ buttons on each skill file box

---

## Change 1: Rename "Skill file" → "Skills Folder"

Two text changes in `src/views/RepoDetail.tsx`:

- Line 314: `{ id: 'skill', label: 'Skill file' }` → `{ id: 'skill', label: 'Skills Folder' }`
- Line 1272: `<SidebarLabel>Skill file</SidebarLabel>` → `<SidebarLabel>Skills Folder</SidebarLabel>`

No logic changes. No CSS changes.

---

## Change 2: Sub-skill box styling

### Current state

The components sub-skill entry in the sidebar (lines 1302–1314 of `RepoDetail.tsx`) is a plain text row using `.sidebar-sub-skill-row` — a colored dot, filename in monospace, file size, and timestamp, with a left-border indent. It is **not** visually a box.

### New state

Wrap the sub-skill content in a box that matches the master skill panel style. Specifically:

- Add a new CSS class `.sidebar-sub-skill-box` with border, background, border-radius, and padding matching the existing master skill panel container
- Keep all existing content (dot, filename, size, timestamp) — just place it inside the box
- The indentation/nesting is preserved — the box sits indented under the master box, visually communicating the parent–child relationship

### CSS additions (`src/styles/globals.css`)

```css
.sidebar-sub-skill-box {
  border: 1px solid var(--border2);
  background: var(--bg2);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  margin-top: 4px;
}
```

The existing `.sidebar-sub-skill-rows` left-border indent is kept so the box appears visually nested under the master skill.

---

## Change 3: Per-file regenerate buttons

### Removal

Remove the existing single "Regenerate skill" button (lines 1316–1325 of `RepoDetail.tsx`) and its handler `handleRegenerate` (lines 691–707).

### New state

Each skill file box in the sidebar gains a small inline ↻ icon button positioned in the top-right corner of the box (or inline after the filename). Clicking it regenerates only that file.

### Loading state

Add a new state variable alongside `installState`:

```typescript
const [regeneratingTarget, setRegeneratingTarget] = useState<'master' | 'components' | null>(null)
```

When `regeneratingTarget` is `'master'`, the master box shows a spinner and its button is disabled. When it is `'components'`, only the components box shows a spinner. The other box remains fully interactive.

### New handler

Replace `handleRegenerate` with:

```typescript
const handleRegenerateTarget = async (target: 'master' | 'components') => {
  setRegeneratingTarget(target)
  setInstallError(null)
  try {
    await window.api.skill.generate(owner ?? '', name ?? '', { target })
    if (target === 'master') {
      const freshRow = await window.api.skill.get(owner ?? '', name ?? '')
      setSkillRow(freshRow)
    }
    if (target === 'components') {
      const freshComp = await window.api.skill.getSubSkill(owner ?? '', name ?? '', 'components').catch(() => null)
      setComponentsSkillRow(freshComp)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    setInstallError(msg.includes('Claude Code not found') || msg.includes('No API key') ? 'no-key' : 'failed')
  } finally {
    setRegeneratingTarget(null)
  }
}
```

Notes:
- `setInstallState` is no longer set to `'GENERATING'` for per-file regen — `regeneratingTarget` replaces that role. `installState` remains `'INSTALLED'` throughout.
- Error messages map to `'no-key' | 'failed'` using the same pattern as the existing install handler (line 687/705 of `RepoDetail.tsx`).
- `setSelectedSkillFile` is **not** reset on completion — the user stays on whichever file they were viewing. This is intentional: a targeted regen should not disrupt the user's current view.

### Button placement

Each skill file box gets a small ↻ button. Example for the master box:

```tsx
<button
  className="btn-regen-inline"
  onClick={() => handleRegenerateTarget('master')}
  disabled={regeneratingTarget !== null}
  title="Regenerate master skill"
>
  {regeneratingTarget === 'master' ? <span className="spin-ring" style={{ width: 8, height: 8 }} /> : '↺'}
</button>
```

Similarly for the components sub-skill box with `target='components'`.

### CSS additions

```css
.btn-regen-inline {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--t3);
  font-size: 12px;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  line-height: 1;
  opacity: 0.6;
}
.btn-regen-inline:hover { opacity: 1; color: var(--t1); }
.btn-regen-inline:disabled { opacity: 0.3; cursor: default; }
```

---

## Change 4: IPC — `target` option

### `electron/main.ts` (line 714)

Extend the handler signature:

```typescript
ipcMain.handle('skill:generate', async (_, owner: string, name: string, options?: {
  enabledComponents?: string[]
  target?: 'master' | 'components' | 'all'
}) => {
```

Default `target` to `'all'` when not provided.

**Branching logic:**

```typescript
const target = options?.target ?? 'all'

// Master skill generation — skipped when target === 'components'
if (target === 'all' || target === 'master') {
  // existing master skill generation code
}

// Components sub-skill generation — skipped when target === 'master'
if (isComponents && (target === 'all' || target === 'components')) {
  // component scan + components skill generation code
}
```

The component scanner is only invoked when `target` includes components generation.

### `electron/preload.ts` (line 58)

```typescript
generate: (owner: string, name: string, options?: {
  enabledComponents?: string[]
  target?: 'master' | 'components' | 'all'
}) => ipcRenderer.invoke('skill:generate', owner, name, options),
```

---

## Files touched

| File | Change |
|------|--------|
| `src/views/RepoDetail.tsx` | Rename label × 2, replace regen button/handler, add `regeneratingTarget` state, add regen buttons to each skill box |
| `src/styles/globals.css` | Add `.sidebar-sub-skill-box` and `.btn-regen-inline` styles, remove `.btn-regenerate` |
| `electron/main.ts` | Extend `options` type with `target`, add branching logic |
| `electron/preload.ts` | Extend `generate` type signature |

No DB schema changes. No new IPC channels.
