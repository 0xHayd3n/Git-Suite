# Websites Tab UI Improvements

**Date:** 2026-03-29
**Status:** Approved

## Problem

The Websites tab cards have three issues:

1. Label text renders raw markdown syntax (e.g. `**C++**: _Introduction to Ray Tracing_`) instead of clean plain text.
2. Cards have no visual identity — no favicon — making it hard to distinguish sites at a glance.
3. The URL row is redundant with the hostname shown at the top, adding noise without value.

## Design

### Card Structure

Each website card becomes a two-row layout:

**Row 1 — Identity row:**
- 16×16 favicon loaded from `https://www.google.com/s2/favicons?domain={host}&sz=32`
- On image load error, use a React state flag (`faviconError`) to swap the `<img>` for a sibling globe `<svg>` element. The SVG sibling is always rendered but hidden (`display:none`) until `faviconError` becomes true, at which point the `<img>` is hidden and the SVG shown. This preserves `.website-card-favicon` sizing (16×16, `border-radius: 3px`) on both paths.
- Hostname rendered as an `<a>` tag that calls `e.stopPropagation()` then `window.api.openExternal(w.url)`. `stopPropagation` prevents the card's own `onClick` from also firing (which would call `openExternal` a second time).
- The entire card div retains its existing `onClick` handler for users who click the card body outside the `<a>`.

**Row 2 — Label row:**
- Label text stripped of markdown before display (see `stripMarkdown` below)
- 2-line clamp retained

**Removed:** the URL row (`.website-card-url` div and its CSS rule).

### `stripMarkdown` Utility

A small pure function added to `src/utils/websiteParser.ts` and exported from there. It is placed in `websiteParser.ts` because it operates on the same README label strings that the parser produces, keeping related string-processing logic together.

```
**C++**: _Introduction to Ray Tracing_  →  C++: Introduction to Ray Tracing
```

Transformations applied in order:
1. `![alt](url)` → `` (remove images)
2. `[text](url)` → `text` (unwrap links)
3. `**text**` / `__text__` → `text` (unwrap bold)
4. `*text*` → `text` (unwrap asterisk italic); `_text_` → `text` only when the underscores are surrounded by non-word characters (i.e. the regex uses `(?<!\w)_(.+?)_(?!\w)`) — this avoids corrupting identifiers like `some_function_name`. Note: step 3 will have already consumed `__bold__` before this step runs, so the `_text_` pattern cannot destructively re-match inside a formerly-double-underscored token.
5. `` `text` `` → `text` (unwrap inline code)
6. Trim whitespace

### Favicon Source

Google Favicon Service: `https://www.google.com/s2/favicons?domain={host}&sz=32`

- Near-100% domain coverage
- Returns a 32×32 image (displayed at 16×16 for crispness on high-DPI)
- No caching logic needed — browser cache handles repeat loads
- On `onError`, set `faviconError` state to `true`; see Card Structure above for the full render pattern (state-flag + sibling SVG)

### CSS Changes

**`.website-card-host`** — full updated rule (replaces existing):
```css
.website-card-host {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;  /* retained from original */
  /* removed: font-size, font-weight, color, white-space, overflow, text-overflow
     — these move to .website-card-host-link */
}
```

**New `.website-card-favicon`**:
```css
width: 16px;
height: 16px;
border-radius: 3px;
flex-shrink: 0;
```

**New `.website-card-host-link`** (the `<a>` tag):
```css
font-size: 13px;
font-weight: 600;
color: var(--t1);
text-decoration: none;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```
```css
.website-card-host-link:hover {
  text-decoration: underline;
}
```

**`.website-card-url`** — rule removed entirely.

## Files Touched

| File | Change |
|------|--------|
| `src/utils/websiteParser.ts` | Add `stripMarkdown` export |
| `src/views/RepoDetail.tsx` | Update website card JSX (favicon img, host as `<a>`, remove URL row, use `stripMarkdown`) |
| `src/styles/globals.css` | Update `.website-card-host`, add `.website-card-favicon` and `.website-card-host-link`, remove `.website-card-url` |

## Out of Scope

- Caching favicons locally
- Fetching page titles or descriptions from the live site
- Grouping or filtering cards by domain category
