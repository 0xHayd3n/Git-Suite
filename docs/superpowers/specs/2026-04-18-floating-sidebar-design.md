# Floating Glass Sidebar

**Date:** 2026-04-18  
**Status:** Approved

## Overview

Redesign all three sidebar components from fixed full-height boxes into floating glass panels. The icon rail becomes a compact top-left-anchored pill; the filter/nav panel becomes a full-height overlay that toggles on click. Visually consistent with the existing glass token set already used in the app.

## Design Decisions

| Question | Decision |
|---|---|
| Interaction model | Click icon to toggle panel (no hover-reveal) |
| Rail positioning | Left gutter (56px), content reserves space; rail floats on top |
| Rail height | Compact — only as tall as its icons, top-left anchored |
| Panel behavior | Floats over content, full height (inset 10px), no layout shift on open |
| Scope | DiscoverSidebar, LibrarySidebar, NavRail |

## Visual Spec

### Rail

- `position: fixed; left: 10px; top: 12px`
- `width: 40px; height: fit-content`
- `border-radius: 14px`
- `background: var(--glass-bg)` (`rgba(20, 20, 20, 0.85)`) — use the token, not a hardcoded value
- `border: 1px solid var(--glass-border)` (`rgba(255,255,255,0.08)`)
- `box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04) inset`
- `backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px)`
- `padding: 10px 0; gap: 8px`
- Content area left-gutter: `56px` — matches the existing `padding-left: 56px` on `.discover-layout` and `margin-left: 56px` on `.library-root-v2`; no globals.css edit needed

### Panel (DiscoverSidebar + LibrarySidebar)

- `position: fixed; left: 57px; top: 10px; bottom: 10px`
- `width: <existing width>` — verify from current CSS (approximately 300px for Discover, 220px for Library)
- `border-radius: 14px`
- Same glass tokens as rail (`var(--glass-bg)`, `var(--glass-border)`, `backdrop-filter: blur(20px)`)
- `box-shadow: 0 4px 20px rgba(0,0,0,0.6)`
- Open: `opacity: 1; transform: translateX(0); visibility: visible`
- Closed: `opacity: 0; transform: translateX(-8px); visibility: hidden`
- Transition: `opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease`
- Panel overlays content — no layout shift on toggle
- **Internal padding:** current `.discover-panel` has `padding: 0 14px 0 68px` to offset behind the rail. After the structural split the panel is no longer behind the rail, so left padding drops to `14px` (symmetric). Update accordingly.

### NavRail

Rail only (no expandable panel). Same glass pill style as above.

## Implementation Approach

**Approach B — Structural refactor** (chosen over CSS-only or full rewrite).

The current structure wraps both rail and panel in a single `position: fixed; height: 100vh` container. The new model decouples them:

- Rail rendered as its own `position: fixed` element
- Panel rendered as its own `position: fixed` element beside the rail
- Existing toggle state, icon rendering, and panel section logic unchanged
- Content containers in Discover.tsx / RepoDetail.tsx keep their existing left-margin/padding for the gutter

### Click-outside-close behavior

`DiscoverSidebar.tsx` has a click-outside listener using `sidebarRef` attached to the single wrapper element. After the structural split the rail and panel are separate DOM elements with no shared parent, so the existing ref strategy breaks. The implementer must update the click-outside handler to:
- Exclude clicks on the rail element (attach a second ref, e.g. `railRef`)
- Exclude clicks on the panel element (existing `sidebarRef` repurposed as `panelRef`)
- Close the panel on any other document click when the panel is open

## Files to Change

| File | Change |
|---|---|
| `src/components/DiscoverSidebar.tsx` | Split `.discover-sidebar` wrapper into independent rail + panel elements; fix click-outside handler |
| `src/components/DiscoverSidebar.css` | Restyle rail as compact glass pill; restyle panel as fixed overlay; fix panel internal left padding |
| `src/components/LibrarySidebar.tsx` | Same structural split + click-outside fix |
| `src/components/LibrarySidebar.css` | Same CSS treatment |
| `src/components/NavRail.tsx` | Apply glass pill style to rail; no panel changes |
| `src/styles/globals.css` | Only if shared tokens need updating — likely no change needed |
| `src/views/Discover.tsx` | Verify left-gutter spacing still correct (56px) |

## Non-Goals

- No changes to panel content (filter sections, collection lists, etc.)
- No changes to icon set or active indicator styling
- No hover-reveal behavior (click only)
- No animation changes beyond the transition values above
