# Bucket Pills Design Spec

**Date:** 2026-04-09
**Status:** Draft

## Summary

Redesign BucketNav and BucketTabBar from hover-triggered tab rows with overlay dropdown panels into click-triggered glass pills with inline push-down subtype rows. Remove all container backgrounds so pills float directly on the page background.

## Motivation

The current tab + overlay design feels like a traditional menu. Glass pills on the page background create a more modern, lightweight feel. Push-down layout (instead of overlay) is more predictable — content moves rather than being obscured.

## Design Decisions

- **Interaction:** Click-triggered, not hover. No timers needed.
- **Accordion:** Only one bucket expanded at a time. Clicking a different bucket collapses the previous one.
- **"All" pill:** Collapses any open bucket (resets to no expansion). Does NOT show a mega-grid of all subtypes.
- **Layout:** Normal document flow. Subtype row pushes content down, no `position: absolute` overlays.
- **Container:** `.discover-filter-row` loses its background, border, and glass effect — becomes a transparent flex wrapper. Pills sit directly on `--bg`.
- **Selection model:** Unchanged. `selected: string[]` and `onChange` callback remain the same.
- **Per-bucket colors:** Dropped. The current design uses `bucket.color` for per-bucket tab underlines, icon tints, and count badge borders. The new design uses a single accent color (violet) for all active states. This simplifies the visual language — bucket identity comes from the label and icon, not color.
- **"All" pill state:** The "All" pill has no special active/highlighted state. It is a neutral pill that serves as a collapse action. When no bucket is expanded, all pills appear in their default state.

## Component Changes

### BucketNav (`src/components/BucketNav.tsx`)

**State changes:**
- Remove: `activeBucketId` hover state, `hoveredColId`, `timerRef`, `clearTimer()`, `scheduleClose()`
- Add: `expandedBucketId: string | null` — which bucket's subtypes are visible

**Behavior:**
- Click bucket pill → if already expanded, collapse (`null`). Otherwise, set as expanded (accordion).
- Click "All" pill → set `expandedBucketId` to `null`
- Subtype pills: click to toggle selection (existing `toggle()` logic, unchanged)

**Render structure:**
```
<div className="bnav-pills">
  <button className="bnav-pill">"All"</button>
  {REPO_BUCKETS.map(bucket =>
    <button className="bnav-pill [active] [expanded]">bucket.label</button>
  )}
</div>
{expandedBucketId && (
  <div className="bnav-subtypes">
    {bucket.subTypes.map(sub =>
      <button className="bnav-subpill [active]">sub.label</button>
    )}
  </div>
)}
```

**Removed elements:**
- `.bnav-tabs` tab row structure
- `.bnav-tab`, `.bnav-tab--all`, `.bnav-tab-divider`, `.bnav-tab-count` elements
- `.bnav-panel`, `.bnav-panel--all`, `.bnav-panel--bucket` overlay panels
- `.bnav-col`, `.bnav-item`, `.bnav-col-more` panel internals
- All `onMouseEnter`/`onMouseLeave` handlers and timer logic

### BucketTabBar (`src/components/BucketTabBar.tsx`)

BucketTabBar currently has no non-test consumer — it is not rendered anywhere in the app. It exists as a simplified variant that was created alongside BucketMegaMenu but never integrated. Since BucketNav now covers the pill design, BucketTabBar is vestigial. **Delete it** along with its test file, same as BucketMegaMenu.

If a simplified pill bar is needed in the future, BucketNav can be reused or a lightweight variant extracted at that time.

### BucketMegaMenu (`src/components/BucketMegaMenu.tsx`)

**Remove entirely.** The columnar overlay panel is replaced by inline subtype pills. Delete the component file and its test file.

### Discover view (`src/views/Discover.tsx`)

- BucketNav usage stays the same (props unchanged)
- `.discover-filter-row`: remains as a flex container but loses visual styling

## CSS Changes

### Remove (from `globals.css`)

All old BucketNav/BucketTabBar styles:
- `.bnav-tabs`, `.bnav-tab`, `.bnav-tab:hover`, `.bnav-tab.active`
- `.bnav-tab--all`, `.bnav-tab--all.open`, `.bnav-tab--all.has-selection`
- `.bnav-tab-count`, `.bnav-tab-divider`
- `.bnav-panel`, `.bnav-panel--all`, `.bnav-panel--bucket`
- `.bnav-col`, `.bnav-col:last-child`, `.bnav-item`, `.bnav-item:hover`, `.bnav-item.active`
- `.bnav-col-more`, `.bnav-col-more:hover`
- `.btb-tab`, `.btb-tab.active`, `.btb-mega-panel`, `.btb-mega-col`, `.btb-mega-col-header`
- `.btb-item`, `.btb-item:hover`, `.btb-item.active`

### Modify

`.discover-filter-row`:
- Remove: `background`, `backdrop-filter`, `-webkit-backdrop-filter`, `border-bottom`
- Keep: `position: relative`, `display: flex`, `align-items: center`, `justify-content: space-between`, `padding`, `flex-shrink: 0`

### Add

```css
/* ── Bucket pills ── */
.bnav-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bnav-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--t2);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.bnav-pill:hover {
  background: rgba(255, 255, 255, 0.10);
  color: var(--t1);
}

/* Bucket has active subtype selections */
.bnav-pill.active {
  background: rgba(109, 40, 217, 0.18);
  border-color: rgba(109, 40, 217, 0.35);
  color: var(--accent-text);
  font-weight: 600;
}

/* Bucket is currently expanded (subtypes visible) */
.bnav-pill.expanded {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
  color: var(--t1);
}

/* When both active AND expanded */
.bnav-pill.active.expanded {
  background: rgba(109, 40, 217, 0.25);
  border-color: rgba(109, 40, 217, 0.45);
  color: var(--accent-text);
}

/* ── Subtype pills row ── */
.bnav-subtypes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 20px 12px;
}

.bnav-subpill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--t2);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.bnav-subpill:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--t1);
}

.bnav-subpill.active {
  background: rgba(109, 40, 217, 0.15);
  border-color: rgba(109, 40, 217, 0.30);
  color: var(--accent-text);
}
```

## What Does NOT Change

- BucketNav props interface (`selected: string[]`, `onChange`)
- Subtype selection/toggle logic
- `VerificationToggles`, `DiscoverFilters`, `LayoutDropdown` controls
- The "Filtered:" pill row below the filter bar
- `REPO_BUCKETS` constants, `BUCKET_ICONS`, `SUB_TYPE_ICONS`

## Files Affected

| File | Action |
|------|--------|
| `src/components/BucketNav.tsx` | Rewrite — pills + click accordion |
| `src/components/BucketNav.test.tsx` | Rewrite — test click behavior instead of hover |
| `src/components/BucketTabBar.tsx` | Delete — vestigial, no non-test consumer |
| `src/components/BucketTabBar.test.tsx` | Delete |
| `src/components/BucketMegaMenu.tsx` | Delete |
| `src/components/BucketMegaMenu.test.tsx` | Delete |
| `src/styles/globals.css` | Remove old bnav/btb styles, add pill styles, gut `.discover-filter-row` |
| `src/views/Discover.tsx` | Minor — adjust BucketNav wrapper if needed |
