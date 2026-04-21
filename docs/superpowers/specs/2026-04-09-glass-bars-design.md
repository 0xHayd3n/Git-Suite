# Glass Bars Design Spec

**Date:** 2026-04-09
**Status:** Draft

## Summary

Apply a consistent glassmorphism (frosted glass) visual treatment to four navigation/toolbar bars and their dropdown panels. The glass effect uses medium-intensity blur with a semi-transparent background, matching the existing `.repo-detail-glass` pattern in the codebase.

## Motivation

The bucket filter bars, breadcrumb bar, and view mode bar currently use either solid opaque backgrounds or no explicit background. Converting them to glass creates a more modern, cohesive look that aligns with the glass treatment already used on repo detail cards.

## Design Decisions

- **Intensity:** Medium — `blur(16px)`, 45% background opacity
- **Scope:** Visual style only. No layout, positioning, or scroll behavior changes.
- **Accent edges:** None. Clean translucent border only.
- **Dropdowns:** Same glass treatment as their parent bars.
- **Approach:** Shared `.glass` CSS utility class — define once, apply to all target selectors via CSS overrides. Zero JSX changes.

## The `.glass` Utility Class

Defined once near the design tokens in `globals.css`:

```css
.glass {
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-color: rgba(255, 255, 255, 0.10);
}
```

## Target Components

### Dropdown panels (glass effect fully visible — overlaps content)

| Component | CSS Selector | Current Background | Change |
|-----------|-------------|-------------------|--------|
| BucketNav dropdown panel | `.bnav-panel` | `var(--bg2)` | Replace bg with glass properties |
| BucketTabBar mega-menu | `.btb-mega-panel` | `var(--bg2)` | Replace bg with glass properties |
| ViewModeBar sort dropdown | `.view-mode-bar__sort-dropdown` | `var(--bg2)` | Replace bg with glass properties |

These are `position: absolute` panels that overlay page content — `backdrop-filter` will blur whatever is behind them, making the glass effect clearly visible.

### Inline bars (glass as translucent background tint)

| Component | CSS Selector | Current Background | Change |
|-----------|-------------|-------------------|--------|
| BreadcrumbBar | `.breadcrumb-bar` | None (transparent) | Add glass properties |
| ViewModeBar | `.view-mode-bar` | None (transparent) | Add glass properties |
| Filter row | `.discover-filter-row` | None (transparent) | Add glass properties |

These bars are inline in the document flow, not fixed/sticky. They don't have content scrolling behind them, so `backdrop-filter` won't produce a visible blur in normal usage. The glass treatment here serves as a **consistent translucent background tint** — the `rgba(26,26,30,0.45)` background gives them a unified, slightly transparent surface rather than a solid or invisible one. This keeps the visual language consistent across all bars even though the blur itself is subtle on inline elements.

## What Does NOT Change

- Layout, positioning, z-index values
- Typography, spacing, padding
- Active/hover states on tabs and menu items
- The existing `.repo-detail-glass` class (different blur intensity, different context)
- No JSX/component file changes required

## Implementation Strategy

1. Define the `.glass` class in `globals.css` near the design tokens
2. For each target selector, replace `background: var(--bg2)` (or add if implicit) with the glass properties by extending the existing CSS rule
3. Verify cross-browser support (`-webkit-backdrop-filter` for Safari/older Chromium)

## Risk

- `backdrop-filter` is well-supported in Electron (Chromium-based), so no compatibility concerns for this desktop app.
- Since bars are not sticky/fixed, the glass effect will only be visible when dropdown panels overlap content or when the bar's container has content behind it. The visual improvement is most noticeable on dropdown panels.
