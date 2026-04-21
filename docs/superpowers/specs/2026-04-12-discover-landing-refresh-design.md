# Discover Landing Page Refresh — Design Spec

## Goal

Improve the visual design and polish of the Discover landing page while keeping the same content (logo, search bar, 4 view-mode pills). The landing is a **launchpad** — get users into search or a view mode fast, with just enough atmosphere to feel premium.

## Changes

### 1. Golden Ratio Layout

Move the hero cluster (logo + search + pills) from dead-center to the **upper third** of the viewport (~38% from top).

- **Current:** `.discover-landing` uses `justify-content: center` to vertically center the cluster.
- **New:** Use weighted flex spacers — a top spacer with `flex: 0.62` and a bottom spacer with `flex: 1` — so the cluster sits at approximately the golden ratio point. This scales naturally with viewport height.
- **Files:** `src/styles/globals.css` (`.discover-landing` rule)

### 2. Search Bar Scale-Up with Icon

Make the search bar wider and more substantial to anchor the upper-third position.

- **Max-width:** 480px → **560px**
- **Padding:** 14px 20px → **16px 22px**, with **padding-left ~44px** for the icon
- **Font size:** `var(--text-base)` → **15px**
- **Border radius:** 14px → **16px**
- **Search icon:** Add a magnifying glass SVG positioned inside the input wrapper, left-aligned. Use the same SVG already used in the results view search bar (`src/views/Discover.tsx:856-858`).
- **Files:** `src/components/DiscoverLanding.tsx`, `src/styles/globals.css`

### 3. View Mode Pills with Icons

Add icons to the 4 view-mode pills, reusing the existing `VIEW_MODE_ICONS` map.

- Import `VIEW_MODE_ICONS` from `src/components/ViewModeIcons.tsx`
- Render `<Icon size={14} />` before each pill's label text
- Add `display: flex; align-items: center; gap: 6px` to `.discover-landing-pill`
- **Files:** `src/components/DiscoverLanding.tsx`, `src/styles/globals.css`

### 4. Fade-Cycling Placeholder Suggestions

Replace the static "Search repositories..." placeholder with animated rotating suggestions that hint at search capabilities.

#### Suggestion list (~12 items, mixed):
1. "React frameworks"
2. "machine learning tools"
3. "CLI utilities"
4. "Find a fast build tool"
5. "neovim plugins"
6. "state management"
7. "computer vision projects"
8. "kubernetes tools"
9. "Show me rising AI projects"
10. "static site generators"
11. "database clients"
12. "awesome lists"

#### Animation:
- **Cycle interval:** 3.5 seconds per suggestion
- **Transition:** ~400ms fade-out (opacity 1→0), swap text, ~400ms fade-in (opacity 0→1)
- **Implementation:** A positioned `<span>` overlay inside the search wrapper (not the native `placeholder` attribute). Uses opacity CSS transitions for smooth fading.

#### Behavior:
- **Empty + unfocused:** Cycling placeholder is visible, animating
- **Focused:** Stop cycling, clear the overlay (user sees empty input ready to type)
- **Has value:** Overlay hidden (standard input behavior)

#### Implementation approach:
- New `useRotatingPlaceholder` hook or inline state in `DiscoverLanding.tsx`
- `useState` for current suggestion index, `useEffect` with `setInterval` for cycling
- `useState` for opacity, toggled in sequence: fade out → update index → fade in
- Overlay span absolutely positioned inside a relative wrapper, with `pointer-events: none`
- **Files:** `src/components/DiscoverLanding.tsx`, `src/styles/globals.css`

### 5. Remove Auto-Focus on Mount

The landing currently auto-focuses the search input on mount. This must be removed so the rotating placeholder animation is visible when users land on the page. Users click or press a key to focus the input.

- **Files:** `src/components/DiscoverLanding.tsx` (remove the `useEffect` that calls `ref.current?.focus()`)

## What does NOT change

- Overall page structure (landing vs results view split)
- The blurred painting background (app-shell level)
- Search functionality, autocomplete/suggestions dropdown
- View mode behavior (clicking a pill navigates to results)
- The logo and wordmark (just repositioned with the cluster)

## Files affected

| File | Changes |
|------|---------|
| `src/components/DiscoverLanding.tsx` | Search icon, pill icons, rotating placeholder logic, layout wrapper |
| `src/styles/globals.css` | `.discover-landing` positioning, `.discover-landing-search` sizing, `.discover-landing-pill` flex, placeholder fade animation |
