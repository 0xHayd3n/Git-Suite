# Websites Tab UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve website cards in the Websites tab by stripping raw markdown from labels, adding favicons via Google's favicon service, and replacing the redundant URL row with a hyperlinked hostname.

**Architecture:** Three isolated changes applied in order: (1) add `stripMarkdown` to `websiteParser.ts` with tests, (2) update the JSX in `RepoDetail.tsx` to use the new utility and render favicons + hyperlinked hostnames, (3) update CSS in `globals.css` to support the new card layout.

**Tech Stack:** TypeScript, React, Vitest (test runner: `npm test`), CSS custom properties

---

## File Map

| File | What changes |
|------|-------------|
| `src/utils/websiteParser.ts` | Add and export `stripMarkdown` function at the bottom |
| `src/utils/websiteParser.test.ts` | Add `describe('stripMarkdown', ...)` block |
| `src/views/RepoDetail.tsx` | Update website card JSX (~lines 1009–1018) |
| `src/styles/globals.css` | Update `.website-card-host`, add `.website-card-favicon` + `.website-card-host-link`, remove `.website-card-url` |

---

## Task 1: Add `stripMarkdown` utility with tests

**Files:**
- Modify: `src/utils/websiteParser.ts` (append after line 123)
- Modify: `src/utils/websiteParser.test.ts` (append new describe block)

- [ ] **Step 1: Write the failing tests**

Open `src/utils/websiteParser.test.ts`. Update the existing import on line 2 to also import `stripMarkdown`:

```typescript
import { extractWebsiteLinks, stripMarkdown } from './websiteParser'
```

Then append this describe block at the end of the file:

```typescript
describe('stripMarkdown', () => {
  it('strips bold asterisks', () => {
    expect(stripMarkdown('**C++**: hello')).toBe('C++: hello')
  })

  it('strips bold underscores', () => {
    expect(stripMarkdown('__bold__ text')).toBe('bold text')
  })

  it('strips italic asterisks', () => {
    expect(stripMarkdown('*italic* text')).toBe('italic text')
  })

  it('strips italic underscores surrounded by non-word characters', () => {
    expect(stripMarkdown('_italic_ text')).toBe('italic text')
  })

  it('does not strip underscores inside identifiers', () => {
    expect(stripMarkdown('some_function_name')).toBe('some_function_name')
  })

  it('strips inline code', () => {
    expect(stripMarkdown('use `npm install` to setup')).toBe('use npm install to setup')
  })

  it('unwraps markdown links to their text', () => {
    expect(stripMarkdown('[Click here](https://example.com)')).toBe('Click here')
  })

  it('removes image syntax entirely', () => {
    expect(stripMarkdown('![badge](https://img.shields.io/badge.svg) text')).toBe('text')
  })

  it('handles the realistic README label pattern', () => {
    expect(stripMarkdown('**C++**: _Introduction to Ray Tracing_')).toBe('C++: Introduction to Ray Tracing')
  })

  it('trims leading and trailing whitespace', () => {
    expect(stripMarkdown('  hello world  ')).toBe('hello world')
  })

  it('returns plain text unchanged', () => {
    expect(stripMarkdown('plain text')).toBe('plain text')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "stripMarkdown"
```

Expected: all `stripMarkdown` tests fail with `stripMarkdown is not a function` or similar.

- [ ] **Step 3: Implement `stripMarkdown` in `websiteParser.ts`**

Append the following at the end of `src/utils/websiteParser.ts` (after line 123):

```typescript
/**
 * Strips common markdown formatting from a label string, returning plain text.
 * Designed for README link labels which often contain bold/italic syntax.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // remove images: ![alt](url)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // unwrap links: [text](url) → text
    .replace(/\*\*(.+?)\*\*/g, '$1')                // remove bold: **text**
    .replace(/__(.+?)__/g, '$1')                    // remove bold: __text__
    .replace(/\*(.+?)\*/g, '$1')                    // remove italic: *text*
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')         // remove italic: _text_ (not inside words)
    .replace(/`([^`]+)`/g, '$1')                    // remove inline code: `text`
    .trim()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 2 "stripMarkdown"
```

Expected: all 11 `stripMarkdown` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/websiteParser.ts src/utils/websiteParser.test.ts
git commit -m "feat: add stripMarkdown utility to websiteParser"
```

---

## Task 2: Update website card JSX in RepoDetail

**Files:**
- Modify: `src/views/RepoDetail.tsx` (lines ~1009–1018)

The current card JSX looks like this (lines 1009–1018):

```tsx
<div
  key={i}
  className="website-card"
  onClick={() => window.api.openExternal(w.url)}
>
  <div className="website-card-host">{w.host}</div>
  <div className="website-card-label">{w.label}</div>
  <div className="website-card-url">{w.url.replace(/^https?:\/\/(www\.)?/, '')}</div>
</div>
```

- [ ] **Step 1: Update the import for `stripMarkdown`**

Find the existing import of `extractWebsiteLinks` near the top of `src/views/RepoDetail.tsx` (line 34):

```typescript
import { extractWebsiteLinks, type WebsiteLink } from '../utils/websiteParser'
```

Change it to:

```typescript
import { extractWebsiteLinks, stripMarkdown, type WebsiteLink } from '../utils/websiteParser'
```

- [ ] **Step 2: Replace the card JSX**

Find this block (around lines 1009–1019 in `src/views/RepoDetail.tsx`):

```tsx
{websiteLinks.map((w, i) => (
  <div
    key={i}
    className="website-card"
    onClick={() => window.api.openExternal(w.url)}
  >
    <div className="website-card-host">{w.host}</div>
    <div className="website-card-label">{w.label}</div>
    <div className="website-card-url">{w.url.replace(/^https?:\/\/(www\.)?/, '')}</div>
  </div>
))}
```

Replace it with:

```tsx
{websiteLinks.map((w, i) => {
  const [faviconError, setFaviconError] = useState(false)
  return (
    <div
      key={i}
      className="website-card"
      onClick={() => window.api.openExternal(w.url)}
    >
      <div className="website-card-host">
        <img
          className="website-card-favicon"
          src={`https://www.google.com/s2/favicons?domain=${w.host}&sz=32`}
          alt=""
          style={faviconError ? { display: 'none' } : undefined}
          onError={() => setFaviconError(true)}
        />
        <svg
          className="website-card-favicon"
          style={faviconError ? undefined : { display: 'none' }}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 1C8 1 5.5 4 5.5 8C5.5 12 8 15 8 15" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 1C8 1 10.5 4 10.5 8C10.5 12 8 15 8 15" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M1.5 8H14.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M2 5H14" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5"/>
          <path d="M2 11H14" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5"/>
        </svg>
        <a
          className="website-card-host-link"
          onClick={(e) => { e.stopPropagation(); window.api.openExternal(w.url) }}
          href="#"
        >
          {w.host}
        </a>
      </div>
      <div className="website-card-label">{stripMarkdown(w.label)}</div>
    </div>
  )
})}
```

> **Important:** `useState` inside a `.map()` callback is invalid — hooks cannot be called conditionally or inside loops. The card needs to be extracted into its own component. See the corrected approach below.

**Corrected approach — extract a `WebsiteCard` component:**

Add this component just before `export default function RepoDetail()` (around line 300), grouped with the other card helper components like `CommandBlockCard`. Do not place it among the icon utilities near the top of the file.

```tsx
function WebsiteCard({ w, onOpen }: { w: WebsiteLink; onOpen: (url: string) => void }) {
  const [faviconError, setFaviconError] = useState(false)
  return (
    <div
      className="website-card"
      onClick={() => onOpen(w.url)}
    >
      <div className="website-card-host">
        <img
          className="website-card-favicon"
          src={`https://www.google.com/s2/favicons?domain=${w.host}&sz=32`}
          alt=""
          style={faviconError ? { display: 'none' } : undefined}
          onError={() => setFaviconError(true)}
        />
        <svg
          className="website-card-favicon"
          style={faviconError ? undefined : { display: 'none' }}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 1C8 1 5.5 4 5.5 8C5.5 12 8 15 8 15" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 1C8 1 10.5 4 10.5 8C10.5 12 8 15 8 15" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M1.5 8H14.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M2 5H14" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5"/>
          <path d="M2 11H14" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5"/>
        </svg>
        <a
          className="website-card-host-link"
          href="#"
          onClick={(e) => { e.stopPropagation(); onOpen(w.url) }}
        >
          {w.host}
        </a>
      </div>
      <div className="website-card-label">{stripMarkdown(w.label)}</div>
    </div>
  )
}
```

Then replace the card map in the JSX:

```tsx
<div className="website-grid">
  {websiteLinks.map((w, i) => (
    <WebsiteCard key={i} w={w} onOpen={(url) => window.api.openExternal(url)} />
  ))}
</div>
```

- [ ] **Step 3: Build to check for TypeScript errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes with no TypeScript errors. If there are type errors, fix them before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: update website cards with favicons and hyperlinked hostnames"
```

---

## Task 3: Update CSS for new card layout

**Files:**
- Modify: `src/styles/globals.css` (lines ~4689–4736)

Current rules in this range:
- `.website-grid` (line 4689)
- `.website-card` (line 4695)
- `.website-card:hover` (line 4704)
- `.website-card-host` (line 4710) — to be updated
- `.website-card-label` (line 4720) — unchanged
- `.website-card-url` (line 4730) — to be removed

- [ ] **Step 1: Replace `.website-card-host` rule**

Find this block in `src/styles/globals.css` (lines 4710–4718):

```css
.website-card-host {
  font-size: 13px;
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

Replace with:

```css
.website-card-host {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
```

- [ ] **Step 2: Add `.website-card-favicon` and `.website-card-host-link` rules**

Immediately after the updated `.website-card-host` block, add:

```css
.website-card-favicon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
  color: var(--t3);
}

.website-card-host-link {
  font-size: 13px;
  font-weight: 600;
  color: var(--t1);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0; /* required for text-overflow to work inside a flex container */
}
.website-card-host-link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: Remove `.website-card-url` rule**

Find and delete this entire block (lines ~4730–4736):

```css
.website-card-url {
  font-size: 11px;
  color: var(--t3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 4: Build to verify no CSS issues**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: update website card CSS for favicon and host link layout"
```

---

## Task 4: Manual smoke test

- [ ] **Step 1: Run the app in dev mode**

```bash
npm run dev
```

- [ ] **Step 2: Open any repo with a Websites tab**

Navigate to a repo that has a Websites tab with entries (e.g. `build-your-own-x`). Verify:

1. Each card shows a 16×16 favicon in the top-left of the identity row
2. The hostname next to the favicon is bold and underlines on hover
3. Clicking the hostname opens the URL (not the card background area — test both)
4. The label text is clean plain text (no `**`, `_`, backticks)
5. There is no third row showing a raw URL
6. For a domain with no favicon (test with an obscure domain), the globe SVG fallback appears in place of the broken image

- [ ] **Step 3: Run the full test suite one final time**

```bash
npm test
```

Expected: all tests pass.
