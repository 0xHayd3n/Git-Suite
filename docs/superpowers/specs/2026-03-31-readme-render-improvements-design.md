# README Render Improvements — GitHub Fidelity

**Date:** 2026-03-31
**Status:** Approved

## Overview

Improve the README rendering in Git-Suite to more closely match GitHub's visual presentation. Five phases covering layout, typography, badge rendering, and sidebar polish.

## Phase 1: Content Width & Layout

**Goal:** Constrain the markdown content area to a readable width without affecting the sidebar or header.

**Changes:**
- Add a wrapper `<div className="rm-content">` inside `.readme-body` around the `<ReactMarkdown>` output and the expand button
- CSS: `.rm-content { max-width: 620px; margin: 0 auto; padding: 24px 0 32px; }`
- Status bar, lightbox, and outer `.readme-body` remain full-width

**Note:** Wide tables and long code blocks will trigger horizontal scrolling more frequently at 620px. This is intentional and matches GitHub's behavior — both already have `overflow-x: auto`.

**Files:** `ReadmeRenderer.tsx`, `globals.css`

## Phase 2: Heading Hierarchy & HR After H1

**Goal:** Match GitHub's heading scale and visual weight. Font-family remains `'Inter', sans-serif` throughout.

**Changes to `.rm-h1`:**
- `font-size: 2rem`, `font-weight: 600`
- `padding-bottom: 8px`, `margin: 0 0 16px`
- Keep existing `border-bottom: 1px solid var(--border)` (serves as the post-H1 divider)

**Changes to `.rm-h2`:**
- `font-size: 1.5rem`, `font-weight: 600`
- Replace left accent border with `border-bottom: 1px solid var(--border)`, `padding-bottom: 8px`
- Remove `padding-left: 10px`, remove `border-left`
- `margin: 24px 0 16px`

**Changes to `.rm-h3`:**
- `font-size: 1.25rem`, `font-weight: 600`
- `color: var(--t1)` (promoted from t2)
- `margin: 24px 0 16px`

**Changes to `.rm-h4`:**
- Remove `text-transform: uppercase` and `letter-spacing`
- `margin: 24px 0 16px`

**Files:** `globals.css`

## Phase 3: Badge Image Rendering

**Goal:** Render badge images as standard inline `<img>` tags in the README body, proxied through a custom Electron protocol to bypass external image blocking.

### 3a: Badge CSS classes

- New `.rm-img-badge`: `height: 20px; vertical-align: middle; margin: 2px; display: inline;`
- New `.rm-badge-row`: `display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; align-items: center;`

### 3b: Image component handler update

In the `img` component handler in `ReadmeRenderer.tsx`:
- Import `looksLikeBadgeUrl` from `badgeParser.ts` (where it is defined and exported)
- If `src` matches a badge URL, render with class `rm-img-badge` instead of running through `classifyImage`
- No click-to-zoom, no onLoad reclassification for badge images

### 3c: Rehype plugin — badge row detection

Extend `rehypeImageClassifier` to detect paragraphs where all images are badge URLs:
- Check each `<img>` src against `looksLikeBadgeUrl`
- If all images in a paragraph are badges, set `dataBadgeRow = true`
- In the `p` component handler, use `.rm-badge-row` class when `dataBadgeRow` is true
- **Precedence:** `dataBadgeRow` takes priority over `dataLogoRow`. A paragraph cannot be both. If all images are badge URLs, it's a badge row. If all images are linked (but not all badges), it's a logo row. Mixed paragraphs get neither tag.

### 3d: Electron protocol handler

Register a `badge://` custom protocol in the main process (`electron/main.ts`). Extract the handler logic into a dedicated helper module `electron/badgeProtocol.ts` to keep `main.ts` clean.

**Setup requirements:**
- Call `protocol.registerSchemesAsPrivileged()` **before** `app.ready` with `{ scheme: 'badge', privileges: { supportFetchAPI: true, corsEnabled: true } }`
- Register the handler in `app.whenReady()` using `protocol.handle('badge', ...)`

**Handler behavior:**
- Extract the original HTTPS URL from the request (strip `badge://` → `https://`)
- **Security: domain allowlist** — only proxy requests to known badge service domains (shields.io, badgen.net, codecov.io, GitHub actions, etc.). Reject requests to non-allowlisted domains with a 403.
- **Response size limit:** Reject responses larger than 100KB (badge SVGs are typically 1-5KB)
- **Timeout:** 5-second fetch timeout to avoid hanging
- **Error handling:** On fetch failure, return a 1x1 transparent PNG so the `<img>` renders as invisible rather than broken. The existing `onError` handler on badge images will hide them via `display: none`.
- Returns the response with correct `Content-Type` from the upstream response headers

**Files:** `electron/main.ts`, `electron/badgeProtocol.ts` (new)

### 3e: Badge URL rewriting

In `ReadmeRenderer.tsx`, add a content preprocessing step that rewrites badge image URLs:
- Use a dedicated domain-based check (not `looksLikeBadgeUrl` which has heuristic false positives). Export `BADGE_DOMAINS` from `badgeParser.ts` and use it to match URLs by domain only.
- Rewrite `https://img.shields.io/...` → `badge://img.shields.io/...`
- Apply to both markdown image syntax `![...](url)` and HTML `<img src="url">` attributes
- **Ordering:** Run badge URL rewriting AFTER the existing relative-path resolution step
- **Code block safety:** Only rewrite URLs in image contexts (markdown `![]()` and `<img src="">` patterns), not bare URLs in text or code blocks

### 3f: CSP update

Add `badge:` to `img-src` in any Content Security Policy meta tag or Electron session config.

**Files:** `ReadmeRenderer.tsx`, `badgeParser.ts` (export `BADGE_DOMAINS`), `globals.css`, `electron/main.ts`, `electron/badgeProtocol.ts` (new), CSP config

## Phase 4: Body Typography & Code Blocks

**Goal:** Align body text, code, tables, and images with GitHub's sizing and spacing.

**Body text (`.readme-body`):**
- `font-size: 14px`, `line-height: 1.6`
- Note: child elements with absolute px sizes (`.rm-li` at 13px, `.rm-table` at 10px, `.rm-pre code` at 10px) remain at their current values. Only the base container changes.

**Inline code (`.rm-code-inline`):**
- `font-size: 85%`, `background: var(--bg3)`, `padding: 2px 6px`, `border-radius: 4px`
- Remove `border: 1px solid var(--border)`

**Fenced code blocks (`.rm-pre`):**
- `background: var(--bg3)`, `padding: 16px`, `border-radius: 8px`
- Remove `border: 1px solid var(--border)`

**Content images (`.rm-img-content`):**
- `max-width: 100%; height: auto; display: block; margin: 16px auto`
- Remove `max-height: 480px`, `border: 1px solid`, `border-radius: 6px`

**Tables:**
- `.rm-th`: `border-bottom: 2px solid var(--border)`, `padding: 6px 13px`, remove `background`, remove all-sides border
- `.rm-td`: `border-bottom: 1px solid var(--border)`, `padding: 6px 13px`, remove all-sides border

**Files:** `globals.css`

## Phase 5: Sidebar Badge Pills

**Goal:** Polish the existing `BadgePill` component with ellipsis, version coloring, and tighter sizing.

### 5a: Label half (`.sbp-label`)

- Add `max-width: 120px`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`
- Change background from `var(--bg4)` to `var(--bg3)`

### 5b: Value coloring — extend `valueAccent()` in `RepoDetail.tsx`

Current return type: `'green' | 'red' | null`

New return type: `'green' | 'red' | 'blue' | 'gray'`

- **Blue:** Version strings matching `/^v?\d/` (e.g. `v2.1.0`, `1.0.3`)
- **Gray:** Default fallback (replaces `null`)
- Update `BadgePill` component to always apply an accent class (no more conditional — gray is the default)
- New CSS: `.sbp-value--blue { background: rgba(59, 130, 246, 0.10); color: #3b82f6; }`
- New CSS: `.sbp-value--gray { background: var(--bg4); color: var(--t3); }`

### 5c: Pill sizing

- `.sidebar-badge-pill`: `border-radius: 3px`, `font-size: 11px`
- `.sidebar-badge-row`: `gap: 4px`

**Files:** `RepoDetail.tsx` (TypeScript changes to `valueAccent` + `BadgePill`), `globals.css`

## Architecture Notes

- **One new file:** `electron/badgeProtocol.ts` for the protocol handler logic
- **No Express dependency** — uses Electron's native `protocol.handle()`
- Badge URL rewriting happens in the renderer preprocessing step, after existing relative-path resolution
- `looksLikeBadgeUrl` from `badgeParser.ts` is the source of truth for badge detection in the rehype plugin and component handler
- `BADGE_DOMAINS` from `badgeParser.ts` (to be exported) drives URL rewriting and the protocol handler's domain allowlist
- The protocol handler domain allowlist and `BADGE_DOMAINS` should stay in sync — both reference the same list
