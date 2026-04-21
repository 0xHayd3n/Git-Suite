# Skill Hover Drawer — Design Spec

**Date:** 2026-03-31
**Status:** Approved

---

## Overview

Replace the always-visible inline `↺` regen buttons on each skill box header with a hover-reveal action drawer that slides out below the box. Add a minimal "↺ all" regenerate-all control on the same line as the "Skills Folder" section title.

---

## Scope

Two files change:

- `src/views/RepoDetail.tsx` — state, JSX, event handlers
- `src/styles/globals.css` — drawer animation, updated box/header styles

No IPC, no backend, no new state for loading beyond what already exists (`regeneratingTarget`).

---

## Section 1: State & Visibility Logic

### New state

```typescript
const [hoveredBox, setHoveredBox] = useState<'master' | 'components' | null>(null)
```

Added alongside the existing `regeneratingTarget` state (line ~408 of `RepoDetail.tsx`).

### Drawer visibility predicate

A drawer is visible for target `t` when:

```typescript
hoveredBox === t || regeneratingTarget === t
```

- `hoveredBox === t` — mouse is over the box
- `regeneratingTarget === t` — generation is in progress (drawer stays pinned even if mouse leaves)

### Box hover handlers

Each skill box wrapper gets:

```tsx
onMouseEnter={() => setHoveredBox('master')}  // or 'components'
onMouseLeave={() => setHoveredBox(null)}
```

### Removed

The `btn-regen-inline` buttons are removed from both box headers (`sidebar-skill-panel-header` and `sidebar-sub-skill-header`). The headers become display-only.

---

## Section 2: Hover Drawer Structure & Animation

### DOM structure

Each skill box is followed immediately by a sibling drawer div:

```tsx
<div className="sidebar-skill-panel" onMouseEnter={...} onMouseLeave={...}>
  {/* existing header + body */}
</div>
<div className={`skill-hover-drawer${masterDrawerVisible ? ' skill-hover-drawer--visible' : ''}`}>
  <button className="btn-drawer-regen" onClick={() => handleRegenerateTarget('master')} disabled={regeneratingTarget !== null}>
    {regeneratingTarget === 'master'
      ? <><span className="spin-ring" style={{ width: 8, height: 8 }} /> Regenerating…</>
      : '↺ Regenerate'}
  </button>
</div>
```

Same pattern for the `.sidebar-sub-skill-box` / components drawer.

### CSS animation

```css
.skill-hover-drawer {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 150ms ease, opacity 150ms ease;
  border: 1px solid var(--border2);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg2);
}
.skill-hover-drawer--visible {
  max-height: 36px;
  opacity: 1;
}

/* Square off the box's bottom corners when drawer is open, so there's no gap between the box border and the drawer */
.skill-hover-group:has(.skill-hover-drawer--visible) .sidebar-skill-panel,
.skill-hover-group:has(.skill-hover-drawer--visible) .sidebar-sub-skill-box {
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}
```

- `border-top: none` visually attaches the drawer to the box above it
- `border-radius` only on bottom corners, matching the box above
- 150ms transition feels snappy without being jarring

### Drawer button

```css
.btn-drawer-regen {
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--t2);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  padding: 8px 11px;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 5px;
}
.btn-drawer-regen:hover:not(:disabled) { color: var(--t1); background: var(--bg3); }
.btn-drawer-regen:disabled { opacity: 0.5; cursor: default; }
```

### Hover zone

The `onMouseEnter`/`onMouseLeave` handlers are placed on the **outermost wrapper** of each skill card (the `.sidebar-skill-panel` div and the `.sidebar-sub-skill-box` div). The drawer itself does **not** get its own hover handlers — mouse movement from the box into the drawer would cause a `onMouseLeave` on the box.

**Fix:** wrap both the box and its drawer together in a hover-group div:

```tsx
<div
  className="skill-hover-group"
  onMouseEnter={() => setHoveredBox('master')}
  onMouseLeave={() => setHoveredBox(null)}
>
  <div className="sidebar-skill-panel">…</div>
  <div className={`skill-hover-drawer${…}`}>…</div>
</div>
```

This ensures moving the mouse from the box into the drawer does not fire `onMouseLeave`.

```css
.skill-hover-group { position: relative; }
```

---

## Section 3: "Regenerate All" in the Section Header

### `SidebarLabel` component update

`SidebarLabel` gains an optional `action` prop:

```typescript
function SidebarLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      fontSize: 10,
      fontWeight: 600,
      color: 'var(--t3)',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      {children}
      {action}
    </div>
  )
}
```

Existing `SidebarLabel` usages that pass no `action` are unaffected — the `action` slot renders nothing when undefined.

### "Skills Folder" usage

```tsx
<SidebarLabel action={
  <button
    className="btn-regen-all"
    onClick={handleRegenerateAll}
    disabled={regeneratingTarget !== null}
    title="Regenerate all skill files"
    aria-label="Regenerate all skill files"
  >
    {regeneratingTarget !== null
      ? <span className="spin-ring" style={{ width: 7, height: 7 }} />
      : '↺ all'}
  </button>
}>
  Skills Folder
</SidebarLabel>
```

### `handleRegenerateAll`

Runs master and components sequentially (master first, then components if a components row exists):

```typescript
const handleRegenerateAll = async () => {
  setInstallError(null)
  await handleRegenerateTarget('master')
  if (componentsSkillRow) {
    await handleRegenerateTarget('components')
  }
}
```

Because `handleRegenerateTarget` already manages `regeneratingTarget` internally (set at start, cleared in `finally`), calling them sequentially works correctly — `regeneratingTarget` will be `'master'` during the first call and `'components'` during the second.

### Button style

```css
.btn-regen-all {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--t3);
  font-family: 'Inter', sans-serif;
  font-size: 9px;
  font-weight: 500;
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  line-height: 1;
  opacity: 0.5;
  text-transform: none;
  letter-spacing: 0;
  display: flex;
  align-items: center;
  gap: 3px;
}
.btn-regen-all:hover:not(:disabled) { opacity: 1; color: var(--t2); }
.btn-regen-all:disabled { opacity: 0.3; cursor: default; }
```

The `text-transform: none` and `letter-spacing: 0` overrides prevent the parent `SidebarLabel` uppercase/tracking styles from bleeding into the button text.

---

## Removed

- `btn-regen-inline` CSS class and its hover/disabled variants — no longer used anywhere
- The `btn-regen-inline` buttons from both box headers

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Mouse moves from box into drawer | No flicker — both are inside the `.skill-hover-group` hover zone |
| Regen completes while mouse is still over box | Drawer stays visible (hover still active), spinner clears |
| Regen completes while mouse has left box | Drawer closes (`regeneratingTarget` cleared, `hoveredBox` null) |
| `componentsSkillRow` is null when Regenerate All runs | Only master is regenerated |
| Both `hoveredBox` and `regeneratingTarget` are set | No conflict — drawer stays visible, both conditions satisfied |

---

## Files Changed

| File | Changes |
|------|---------|
| `src/views/RepoDetail.tsx` | Add `hoveredBox` state; update `SidebarLabel`; add `handleRegenerateAll`; wrap boxes in `.skill-hover-group`; add `.skill-hover-drawer` siblings; remove `btn-regen-inline` from headers |
| `src/styles/globals.css` | Add `.skill-hover-group`, `.skill-hover-drawer`, `.skill-hover-drawer--visible`, `.btn-drawer-regen`, `.btn-regen-all`; remove `.btn-regen-inline` block |
