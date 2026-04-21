# Floating Glass Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all three sidebars (DiscoverSidebar, LibrarySidebar, NavRail) from fixed full-height boxes into compact top-left glass pills with floating overlay panels.

**Architecture:** The outer `.discover-sidebar` / `.nav-rail-standalone` wrappers are removed. Rail and panel become independently `position: fixed` elements. The `.sidebar-rail` class gains its own fixed positioning and glass pill styling. The panel gains overlay positioning and opacity/transform collapse instead of translateX.

**Tech Stack:** React, CSS (no new dependencies)

---

## File Map

| File | What changes |
|---|---|
| `src/components/DiscoverSidebar.css` | Restyle `.sidebar-rail` as glass pill; remove `.nav-rail-standalone` and `.discover-sidebar` blocks; restyle `.discover-panel` as fixed overlay |
| `src/components/DiscoverSidebar.tsx` | Remove outer wrapper div, split into Fragment; add `railRef`; update click-outside handler |
| `src/components/NavRail.tsx` | Remove `.nav-rail-standalone` wrapper div; render `.sidebar-rail` directly |
| `src/components/LibrarySidebar.css` | Restyle `.library-sidebar` as fixed glass panel; update `.library-panel` collapse to use opacity/transform |

---

### Task 1: Restyle `.sidebar-rail` as a compact glass pill

**Files:**
- Modify: `src/components/DiscoverSidebar.css:14-40`

The `.sidebar-rail` class is shared by both DiscoverSidebar and NavRail. Making it self-contained with `position: fixed` and glass pill styling handles both at once. The `.nav-rail-standalone` and `.discover-sidebar` wrapper blocks become dead code (removed in later tasks).

- [ ] **Step 1: Replace the `.sidebar-rail` CSS block (lines 25–40)**

Current block (lines 25–40):
```css
.sidebar-rail {
  width: 56px;
  min-width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  gap: 0;
  border-right: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  -webkit-app-region: drag;
  position: relative;
  z-index: 1;
}
```

Replace with:
```css
.sidebar-rail {
  position: fixed;
  left: 10px;
  top: 12px;
  width: 40px;
  height: fit-content;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  gap: 8px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.04) inset;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  -webkit-app-region: drag;
}
```

- [ ] **Step 2: Scale down `.rail-icon` to fit the narrower rail**

Find the `.rail-icon` block in `DiscoverSidebar.css` (around line 49). Change only the `width` and `height` properties to `32px` and set `border-radius: 6px`. Leave all other properties (`background`, `display`, `align-items`, `justify-content`, `cursor`, `color`, `border`, `transition`, `-webkit-app-region`, etc.) exactly as they are.

- [ ] **Step 3: Commit**

```bash
git add src/components/DiscoverSidebar.css
git commit -m "style(sidebar): restyle .sidebar-rail as compact fixed glass pill"
```

---

### Task 2: Remove `.nav-rail-standalone` wrapper from NavRail.tsx

**Files:**
- Modify: `src/components/NavRail.tsx`
- Modify: `src/components/DiscoverSidebar.css:14-21` (remove dead block)

The `.nav-rail-standalone` wrapper was a `position: fixed; height: 100vh` shell. Now that `.sidebar-rail` is self-positioning, the wrapper is dead weight.

- [ ] **Step 1: Update NavRail.tsx — render `.sidebar-rail` directly**

Current (`NavRail.tsx:25-53`):
```tsx
export default function NavRail({ activePanel, onPanelToggle }: NavRailProps) {
  return (
    <div className="nav-rail-standalone">
      <div className="sidebar-rail">
        ...
      </div>
    </div>
  )
}
```

Replace with:
```tsx
export default function NavRail({ activePanel, onPanelToggle }: NavRailProps) {
  return (
    <div className="sidebar-rail">
      <img src={logoSrc} alt="Git Suite" className="rail-logo" />
      <button
        type="button"
        className={`nav-rail-btn${activePanel === 'repos' ? ' active' : ''}`}
        onClick={() => onPanelToggle('repos')}
        aria-label="Repositories"
        title="Repositories"
      >
        <ReposIcon />
        <span className="nav-rail-btn-label">Repos</span>
      </button>
      <button
        type="button"
        className={`nav-rail-btn${activePanel === 'collections' ? ' active' : ''}`}
        onClick={() => onPanelToggle('collections')}
        aria-label="Collections"
        title="Collections"
      >
        <CollectionsIcon />
        <span className="nav-rail-btn-label">Colls</span>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Remove `.nav-rail-standalone` CSS block**

Delete lines 12–21 from `DiscoverSidebar.css`:
```css
/* ── Standalone nav rail (Library page) ─────────────── */

.nav-rail-standalone {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  z-index: 200;
  display: flex;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NavRail.tsx src/components/DiscoverSidebar.css
git commit -m "refactor(navrail): remove nav-rail-standalone wrapper, rail self-positions"
```

---

### Task 3: Restructure DiscoverSidebar.tsx — remove wrapper, fix click-outside

**Files:**
- Modify: `src/components/DiscoverSidebar.tsx:778-877`

Currently the rail and panel share a single `<div ref={sidebarRef} className="discover-sidebar">` wrapper. Click-outside works by checking if the click is outside that single element. After the split, they're siblings with no common parent, so the handler needs two refs.

- [ ] **Step 1: Add `railRef`, replace single `sidebarRef` with two-ref handler**

Current (lines 778–788):
```tsx
const sidebarRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!activePanel) return
  const handleClickOutside = (e: MouseEvent) => {
    if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
      onActivePanelChange(null)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [activePanel, onActivePanelChange])
```

Replace with:
```tsx
const railRef = useRef<HTMLDivElement>(null)
const panelRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!activePanel) return
  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node
    if (!railRef.current?.contains(target) && !panelRef.current?.contains(target)) {
      onActivePanelChange(null)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [activePanel, onActivePanelChange])
```

- [ ] **Step 2: Update the JSX return — remove wrapper, use Fragment**

Current return (line 790–876):
```tsx
return (
  <div ref={sidebarRef} className="discover-sidebar">
    {/* Icon rail */}
    <div className="sidebar-rail">
      ...
    </div>

    {/* Panel */}
    <div className={`discover-panel${activePanel ? '' : ' collapsed'}`}>
      ...
    </div>

    {/* Cursor-following rail tooltip */}
    {railTip && createPortal(...)}
  </div>
)
```

Replace with:
```tsx
return (
  <>
    {/* Icon rail */}
    <div ref={railRef} className="sidebar-rail">
      ...
    </div>

    {/* Panel */}
    <div ref={panelRef} className={`discover-panel${activePanel ? '' : ' collapsed'}`}>
      ...
    </div>

    {/* Cursor-following rail tooltip */}
    {railTip && createPortal(...)}
  </>
)
```

Keep all inner content of the rail and panel unchanged. Only the outer wrapper and refs change.

- [ ] **Step 3: Verify `<>` (Fragment) is importable**

Check the top of DiscoverSidebar.tsx — if it already imports `React` or uses JSX transform, `<>` works without any import change. If you see `import React from 'react'`, it's fine. If the file uses `React.Fragment` anywhere, use that form instead.

- [ ] **Step 4: Commit**

```bash
git add src/components/DiscoverSidebar.tsx
git commit -m "refactor(discover-sidebar): split wrapper into rail+panel fragments, fix click-outside refs"
```

---

### Task 4: Restyle `.discover-panel` as a fixed glass overlay

**Files:**
- Modify: `src/components/DiscoverSidebar.css:3-10` (remove `.discover-sidebar`)
- Modify: `src/components/DiscoverSidebar.css:122-141` (restyle `.discover-panel`)

The panel changes from `position: absolute` (within the now-removed wrapper) to `position: fixed` with glass styling and opacity/transform collapse.

- [ ] **Step 1: Delete the `.discover-sidebar` block (lines 3–10)**

Remove:
```css
.discover-sidebar {
  display: flex;
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  z-index: 200;
}
```

- [ ] **Step 2: Replace `.discover-panel` and `.discover-panel.collapsed` blocks**

Current (lines 122–141):
```css
.discover-panel {
  position: absolute;
  left: 0;
  top: 0;
  width: 300px;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 14px 0 68px;
  border-right: 1px solid var(--border);
  background: var(--bg);
  transform: translateX(0);
  transition: transform 0.2s ease;
  z-index: -1;
}

.discover-panel.collapsed {
  transform: translateX(-100%);
  pointer-events: none;
}
```

Replace with:
```css
.discover-panel {
  position: fixed;
  left: 57px;
  top: 10px;
  bottom: 10px;
  width: 300px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 14px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  opacity: 1;
  transform: translateX(0);
  visibility: visible;
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
  z-index: 199;
}

.discover-panel.collapsed {
  opacity: 0;
  transform: translateX(-8px);
  visibility: hidden;
  pointer-events: none;
}
```

- [ ] **Step 3: Update `.discover-panel-content` padding if needed**

Check `src/components/DiscoverSidebar.css` around line 143 — `.discover-panel-content` has `min-width: 216px`. With the new symmetric `padding: 0 14px`, usable width is `300 - 28 = 272px`, so `min-width: 216px` is still fine. No change needed unless content overflows visually.

- [ ] **Step 4: Commit**

```bash
git add src/components/DiscoverSidebar.css
git commit -m "style(discover-sidebar): restyle panel as fixed glass overlay with opacity transition"
```

---

### Task 5: Restyle LibrarySidebar as a fixed glass overlay

**Files:**
- Modify: `src/components/LibrarySidebar.css:1-11` (`.library-sidebar`)
- Modify: `src/components/LibrarySidebar.css:149-159` (`.library-panel` + `.library-panel.collapsed`)

LibrarySidebar is currently an in-flow element inside `.library-root-v2`. After this change it becomes a `position: fixed` overlay, consistent with DiscoverSidebar's panel.

- [ ] **Step 1: Update `.library-sidebar` to be a fixed glass panel**

Current (lines 1–11):
```css
.library-sidebar {
  width: 220px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border-right: 1px solid var(--glass-border);
}
```

Replace with:
```css
.library-sidebar {
  position: fixed;
  left: 57px;
  top: 10px;
  bottom: 10px;
  width: 220px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 199;
}
```

- [ ] **Step 2: Update `.library-panel` and `.library-panel.collapsed` collapse strategy**

Current (lines 149–159):
```css
.library-panel {
  width: 220px;
  height: 100%;
  transition: width 0.15s ease;
  overflow: hidden;
  flex-shrink: 0;
}

.library-panel.collapsed {
  width: 0;
}
```

Replace with:
```css
.library-panel {
  opacity: 1;
  transform: translateX(0);
  visibility: visible;
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
}

.library-panel.collapsed {
  opacity: 0;
  transform: translateX(-8px);
  visibility: hidden;
  pointer-events: none;
}
```

Note: `.library-panel` is a wrapper div in the Library view (search for `library-panel` in `src/views/` to find it) that wraps `<LibrarySidebar>`. Since `.library-sidebar` is now `position: fixed`, removing `width: 220px` from `.library-panel` causes no layout shift — the panel overlays content regardless. `LibrarySidebar.tsx` itself has no click-outside handler and no structural refactor is needed; it is purely a content component.

- [ ] **Step 3: Commit**

```bash
git add src/components/LibrarySidebar.css
git commit -m "style(library-sidebar): restyle as fixed glass overlay, update collapse to opacity transition"
```

---

### Task 6: Smoke-test and fix layout issues

**Files:**
- Verify: `src/styles/globals.css:1393-1399` (`.discover-layout`)
- Verify: `src/styles/globals.css:10218-10223` (`.library-root-v2`)

- [ ] **Step 1: Verify `.discover-layout` gutter is sufficient**

Open `src/styles/globals.css` line 1393. Confirm `.discover-layout { padding-left: 56px }`. Math check: rail starts at `left: 10px`, is `40px` wide — right edge at `50px`. Content starts at `56px`. That leaves 6px clear of the rail pill. No edit needed.

- [ ] **Step 2: Verify `.library-root-v2` gutter is sufficient**

Open `src/styles/globals.css` line 10218. Confirm `.library-root-v2 { margin-left: 56px }`. Same math — rail right edge at 50px, content starts at 56px. No edit needed.

- [ ] **Step 3: Hand off to user for visual verification**

Ask the user to run the app and verify:
- **Discover view** — rail is a compact top-left glass pill; clicking Filters/Advanced opens the full-height floating glass panel; clicking outside closes it; clicking the rail icon again closes it
- **Library view** — NavRail shows as compact glass pill at top-left; LibrarySidebar panel floats at `left: 57px`; collapse/expand animation uses opacity fade+slide
- **Any other view** — no regression (no sidebar visible, no layout shift)

- [ ] **Step 4: Fix any issues reported, commit**

```bash
git add -p   # stage only changed files
git commit -m "fix(sidebar): address visual issues found in review"
```

If nothing needed fixing, skip this step.
