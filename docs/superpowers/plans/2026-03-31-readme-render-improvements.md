# README Render Improvements — GitHub Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve README rendering in Git-Suite to match GitHub's visual fidelity — content width, heading hierarchy, badge image proxying, body typography, and sidebar pill polish.

**Architecture:** CSS-first for layout/typography; `ReadmeRenderer.tsx` gets a `.rm-content` wrapper and badge-aware preprocessing; a new `electron/badgeProtocol.ts` module registers a `badge://` Electron 31 `protocol.handle()` handler that proxies badge SVGs via an allowlisted domain set; `badgeParser.ts` exports `BADGE_DOMAINS` as the single source of truth shared by the URL rewriter and the protocol allowlist.

**Tech Stack:** React, react-markdown (remark/rehype pipeline), Electron 31 (`protocol.handle()`, `net.fetch()`), TypeScript, Vitest + @testing-library/react

---

## File Map

| File | Change |
|------|--------|
| `src/styles/globals.css` | Update `.rm-h1`–`.rm-h4`, `.readme-body`, `.rm-code-inline`, `.rm-pre`, `.rm-img-content`, `.rm-th`, `.rm-td`; add `.rm-content`, `.rm-img-badge`, `.rm-badge-row`, `.sbp-value--blue`, `.sbp-value--gray`; update `.sbp-label`, `.sidebar-badge-pill`, `.sidebar-badge-row` |
| `src/components/ReadmeRenderer.tsx` | Add `.rm-content` wrapper; add badge URL rewriting preprocessing; extend `rehypeImageClassifier` for badge row detection; update `img` component handler for badge images |
| `src/components/ReadmeRenderer.test.tsx` | Add tests for `.rm-content` wrapper, badge image class, badge URL rewriting, badge row paragraph |
| `src/utils/badgeParser.ts` | Export `BADGE_DOMAINS` |
| `src/utils/badgeParser.test.ts` | Add test that `BADGE_DOMAINS` is exported |
| `src/views/RepoDetail.tsx` | Export `valueAccent`; extend return type to include `'blue'` and `'gray'`; update `BadgePill` to always apply accent class |
| `src/views/RepoDetail.badgePill.test.tsx` | New — unit tests for `valueAccent` |
| `electron/badgeProtocol.ts` | New — `badge://` protocol handler with domain allowlist, 5s timeout, 100KB size limit |
| `electron/main.ts` | Add `protocol` to import; call `registerSchemesAsPrivileged` at module scope; call `registerBadgeProtocol()` in `whenReady` |

---

### Task 1: Content Width Wrapper (Phase 1)

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx` (line 241–349)
- Modify: `src/styles/globals.css` (after line ~1854)
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/components/ReadmeRenderer.test.tsx`, add a new describe block:

```tsx
describe('content width wrapper', () => {
  it('wraps markdown output in rm-content div', () => {
    const { container } = renderMd('# Hello')
    const wrapper = container.querySelector('.rm-content')
    expect(wrapper).toBeTruthy()
    expect(wrapper?.querySelector('h1')).toBeTruthy()
  })

  it('does not wrap lightbox or status bar in rm-content', () => {
    const { container } = renderMd('# Hello')
    const wrapper = container.querySelector('.rm-content')
    expect(wrapper?.querySelector('.rm-status-bar')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | grep -E "PASS|FAIL|rm-content"
```
Expected: FAIL — `.rm-content` not found

- [ ] **Step 3: Add `.rm-content` CSS rule**

In `src/styles/globals.css`, find the `.readme-body` rule (~line 1847) and add directly after its closing brace:

```css
.rm-content {
  max-width: 620px;
  margin: 0 auto;
  padding: 24px 0 32px;
}
```

- [ ] **Step 4: Wrap content in `ReadmeRenderer.tsx`**

In `ReadmeRenderer.tsx` the return statement (~line 241). Wrap `<ReactMarkdown>` and the expand button in `<div className="rm-content">`. The lightbox and status bar stay outside:

```tsx
return (
  <div className="readme-body" ref={containerRef}>
    <div className="rm-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkEmoji, { accessible: false }]]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeImageClassifier]}
        components={{ /* ... unchanged ... */ }}
      >
        {displayContent}
      </ReactMarkdown>

      {fixedContent.length > MAX_CHARS && !expanded && (
        <button
          className="rm-expand-btn"
          onClick={() => setExpanded(true)}
        >
          Show full README
        </button>
      )}
    </div>

    {lightbox && (
      <div className="rm-lightbox" onClick={() => setLightbox(null)}>
        {/* ... unchanged ... */}
      </div>
    )}

    <div className="rm-status-bar" ref={statusBarRef} style={{ display: 'none' }} />
  </div>
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | grep -E "PASS|FAIL|rm-content"
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/styles/globals.css src/components/ReadmeRenderer.test.tsx
git commit -m "feat: add .rm-content width-constraint wrapper (max-width 620px, centred)"
```

---

### Task 2: Heading Hierarchy (Phase 2)

**Files:**
- Modify: `src/styles/globals.css` (lines ~1855–1890)

CSS-only. Validate visually; run existing tests to confirm no regression.

- [ ] **Step 1: Replace `.rm-h1` rule**

Current (lines ~1855–1864):
```css
.rm-h1 {
  font-family: 'Inter', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--t1);
  margin: 0 0 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  line-height: 1.25;
}
```

Replace with:
```css
.rm-h1 {
  font-family: 'Inter', sans-serif;
  font-size: 2rem;
  font-weight: 600;
  color: var(--t1);
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  line-height: 1.25;
}
```

- [ ] **Step 2: Replace `.rm-h2` rule**

Current (lines ~1865–1874):
```css
.rm-h2 {
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--t1);
  margin: 28px 0 12px;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
  line-height: 1.3;
}
```

Replace with:
```css
.rm-h2 {
  font-family: 'Inter', sans-serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--t1);
  margin: 24px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  line-height: 1.3;
}
```

- [ ] **Step 3: Replace `.rm-h3` rule**

Current (lines ~1875–1881):
```css
.rm-h3 {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--t2);
  margin: 20px 0 8px;
}
```

Replace with:
```css
.rm-h3 {
  font-family: 'Inter', sans-serif;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--t1);
  margin: 24px 0 16px;
}
```

- [ ] **Step 4: Replace `.rm-h4` rule**

Current (lines ~1882–1890):
```css
.rm-h4 {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: var(--t3);
  margin: 14px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

Replace with:
```css
.rm-h4 {
  font-family: 'Inter', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  color: var(--t2);
  margin: 24px 0 16px;
}
```

- [ ] **Step 5: Run existing tests — confirm no regression**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: update heading scale to match GitHub (h1 2rem/600, h2 1.5rem/border-bottom, h3 1.25rem)"
```

---

### Task 3: Body Typography & Code Blocks (Phase 4)

**Files:**
- Modify: `src/styles/globals.css`

CSS-only. Run existing tests to confirm no regression.

- [ ] **Step 1: Update `.readme-body` font size and line-height**

Find (~line 1847):
```css
.readme-body {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: var(--t2);
  line-height: 1.7;
  user-select: text;
  cursor: text;
}
```

Change `font-size: 13px` → `font-size: 14px` and `line-height: 1.7` → `line-height: 1.6`.

- [ ] **Step 2: Replace `.rm-code-inline`**

Current (~line 1894–1902):
```css
.rm-code-inline {
  background: var(--bg4);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  color: var(--accent-text);
}
```

Replace with:
```css
.rm-code-inline {
  background: var(--bg3);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 85%;
  color: var(--accent-text);
}
```

- [ ] **Step 3: Replace `.rm-pre`**

Current (~line 1940–1947):
```css
.rm-pre {
  background: var(--bg4);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 14px 16px;
  margin: 14px 0;
  overflow-x: auto;
}
```

Replace with:
```css
.rm-pre {
  background: var(--bg3);
  border-radius: 8px;
  padding: 16px;
  margin: 14px 0;
  overflow-x: auto;
}
```

- [ ] **Step 4: Replace `.rm-img-content`**

Current (~line 1977–1988):
```css
.rm-img-content {
  display: block;
  max-width: min(90%, 640px);
  height: auto;
  max-height: 480px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid var(--border);
  margin: 14px 0;
  cursor: zoom-in;
  transition: opacity 0.15s;
}
```

Replace with:
```css
.rm-img-content {
  display: block;
  max-width: 100%;
  height: auto;
  object-fit: contain;
  margin: 16px auto;
  cursor: zoom-in;
  transition: opacity 0.15s;
}
```

- [ ] **Step 5: Replace `.rm-th` and `.rm-td`**

Current (~line 2071):
```css
.rm-th { padding: 6px 10px; text-align: left; background: var(--bg4); border: 1px solid var(--border); color: var(--t1); font-weight: 500; }
.rm-td { padding: 6px 10px; border: 1px solid var(--border); color: var(--t2); vertical-align: top; }
```

Replace with:
```css
.rm-th { padding: 6px 13px; text-align: left; border-bottom: 2px solid var(--border); color: var(--t1); font-weight: 600; }
.rm-td { padding: 6px 13px; border-bottom: 1px solid var(--border); color: var(--t2); vertical-align: top; }
```

- [ ] **Step 6: Run existing tests**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: align body typography and code block styles with GitHub (14px, inline code bg3, pre borderless)"
```

---

### Task 4: Sidebar Badge Pills (Phase 5)

**Files:**
- Modify: `src/views/RepoDetail.tsx`
- Create: `src/views/RepoDetail.badgePill.test.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Write failing tests for `valueAccent`**

Create `src/views/RepoDetail.badgePill.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { valueAccent } from './RepoDetail'

describe('valueAccent', () => {
  it('returns green for passing/success keywords', () => {
    expect(valueAccent('passing')).toBe('green')
    expect(valueAccent('success')).toBe('green')
    expect(valueAccent('enabled')).toBe('green')
  })

  it('returns red for failing/error keywords', () => {
    expect(valueAccent('failing')).toBe('red')
    expect(valueAccent('error')).toBe('red')
  })

  it('returns blue for version strings (v-prefixed or digit-leading)', () => {
    expect(valueAccent('v2.1.0')).toBe('blue')
    expect(valueAccent('v0.9.0-beta')).toBe('blue')
    expect(valueAccent('1.0.3')).toBe('blue')
    expect(valueAccent('3.14')).toBe('blue')
  })

  it('returns gray as default fallback', () => {
    expect(valueAccent('MIT')).toBe('gray')
    expect(valueAccent('unknown value')).toBe('gray')
    expect(valueAccent('')).toBe('gray')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/views/RepoDetail.badgePill.test.tsx --reporter=verbose 2>&1 | tail -10
```
Expected: FAIL — `valueAccent` is not exported; blue/gray branches don't exist

- [ ] **Step 3: Update `valueAccent` in `RepoDetail.tsx`**

Find `function valueAccent` (~line 127). Change `function` to `export function` and extend the body:

```typescript
export function valueAccent(value: string): 'green' | 'red' | 'blue' | 'gray' {
  const v = value.toLowerCase()
  if (/\b(passing|passed|enabled|active|success|yes|valid|up|stable|secured)\b/.test(v)) return 'green'
  if (/\b(failing|failure|failed|error|no|invalid|down|critical|unknown)\b/.test(v))     return 'red'
  if (/^v?\d/.test(v.trim())) return 'blue'
  return 'gray'
}
```

- [ ] **Step 4: Update `BadgePill` to always apply the accent class**

In `BadgePill` (~line 134), change:
```tsx
const accent = valueAccent(display)
```

And update the `<span>` to always apply the class (since `valueAccent` now always returns a value, never `null`):
```tsx
<span className={`sbp-value sbp-value--${accent}`}>
  {display}
</span>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/views/RepoDetail.badgePill.test.tsx --reporter=verbose 2>&1 | tail -10
```
Expected: all PASS

- [ ] **Step 6: Update `.sbp-label` CSS**

Find `.sbp-label` (~line 2668 in `globals.css`):
```css
.sbp-label {
  background: var(--bg4);
  color: var(--t3);
  padding: 0 6px;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border);
  font-weight: 400;
}
```

Replace with:
```css
.sbp-label {
  background: var(--bg3);
  color: var(--t3);
  padding: 0 6px;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border);
  font-weight: 400;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 7: Update `.sidebar-badge-pill` sizing**

Find `.sidebar-badge-pill` (~line 2649). Change `border-radius: 4px` → `border-radius: 3px` and `font-size: 10px` → `font-size: 11px`.

Find `.sidebar-badge-row` (~line 2641). Change `gap: 5px` → `gap: 4px`.

- [ ] **Step 8: Add `.sbp-value--blue` and `.sbp-value--gray` rules**

After `.sbp-value--red` (~line 2690), add:
```css
.sbp-value--blue {
  background: rgba(59, 130, 246, 0.10);
  color: #3b82f6;
}
.sbp-value--gray {
  background: var(--bg4);
  color: var(--t3);
}
```

- [ ] **Step 9: Run full src/ tests**

```bash
npx vitest run src/ --reporter=verbose 2>&1 | tail -10
```
Expected: all pass

- [ ] **Step 10: Commit**

```bash
git add src/views/RepoDetail.tsx src/views/RepoDetail.badgePill.test.tsx src/styles/globals.css
git commit -m "feat: extend badge pill with blue (version) and gray accent colors; add label ellipsis"
```

---

### Task 5: Export BADGE_DOMAINS (Phase 3 prerequisite)

**Files:**
- Modify: `src/utils/badgeParser.ts` (line 50)
- Modify: `src/utils/badgeParser.test.ts`

- [ ] **Step 1: Write failing test**

In `src/utils/badgeParser.test.ts`, add at the top-level (outside existing describe blocks), also ensure `BADGE_DOMAINS` is in the import:

```typescript
import { extractBadges, looksLikeBadgeUrl, BADGE_DOMAINS } from './badgeParser'

describe('BADGE_DOMAINS export', () => {
  it('is exported as an array of domain strings', () => {
    expect(Array.isArray(BADGE_DOMAINS)).toBe(true)
    expect(BADGE_DOMAINS.length).toBeGreaterThan(0)
    expect(BADGE_DOMAINS).toContain('shields.io')
    expect(BADGE_DOMAINS).toContain('badgen.net')
    expect(BADGE_DOMAINS).toContain('codecov.io')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/badgeParser.test.ts -t "BADGE_DOMAINS export" --reporter=verbose 2>&1 | tail -5
```
Expected: FAIL — `BADGE_DOMAINS` is not exported

- [ ] **Step 3: Export `BADGE_DOMAINS` in `badgeParser.ts`**

At line 50, change:
```typescript
const BADGE_DOMAINS = [
```
to:
```typescript
export const BADGE_DOMAINS = [
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/badgeParser.test.ts -t "BADGE_DOMAINS export" --reporter=verbose 2>&1 | tail -5
```
Expected: PASS

- [ ] **Step 5: Run all badgeParser tests (confirm no regression)**

```bash
npx vitest run src/utils/badgeParser.test.ts --reporter=verbose 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/badgeParser.ts src/utils/badgeParser.test.ts
git commit -m "feat: export BADGE_DOMAINS from badgeParser for protocol handler and URL rewriting"
```

---

### Task 6: Badge Protocol Handler (Phase 3d)

**Files:**
- Create: `electron/badgeProtocol.ts`
- Modify: `electron/main.ts`

No unit test possible (requires live Electron context). TypeScript build confirms correctness; manual smoke test: run the app and observe badge images load in README view.

- [ ] **Step 1: Create `electron/badgeProtocol.ts`**

```typescript
import { protocol, net } from 'electron'
import { BADGE_DOMAINS } from '../src/utils/badgeParser'

// Fallback: 1×1 transparent PNG returned when badge fetch fails
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

function isAllowedDomain(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return BADGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

export function registerBadgeProtocol(): void {
  protocol.handle('badge', async (request) => {
    // badge://img.shields.io/npm/v/foo → https://img.shields.io/npm/v/foo
    const originalUrl = 'https://' + request.url.slice('badge://'.length)

    if (!isAllowedDomain(originalUrl)) {
      return new Response(null, { status: 403 })
    }

    try {
      const response = await net.fetch(originalUrl, {
        signal: AbortSignal.timeout(5000),
      })

      const buffer = await response.arrayBuffer()

      if (buffer.byteLength > 100 * 1024) {
        return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
      }

      const contentType = response.headers.get('Content-Type') ?? 'image/svg+xml'
      return new Response(buffer, { headers: { 'Content-Type': contentType } })
    } catch {
      return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
    }
  })
}
```

- [ ] **Step 2: Register the scheme as privileged in `electron/main.ts`**

Add `protocol` to the existing electron import at line 1:
```typescript
import { app, BrowserWindow, ipcMain, shell, protocol } from 'electron'
```

Add `registerSchemesAsPrivileged` call at module scope, near the existing `app.setAsDefaultProtocolClient` block (~line 202). This MUST run before `app.ready`:

```typescript
// Register badge:// as a privileged scheme for image loading (must precede app.ready)
protocol.registerSchemesAsPrivileged([
  { scheme: 'badge', privileges: { standard: true, supportFetchAPI: true, corsEnabled: true } },
])
```

- [ ] **Step 3: Import and call `registerBadgeProtocol()` in `app.whenReady`**

Add import near the top of `electron/main.ts` (with other local imports):
```typescript
import { registerBadgeProtocol } from './badgeProtocol'
```

In `app.whenReady().then(...)` (~line 1371), add `registerBadgeProtocol()` as the first call:
```typescript
app.whenReady().then(() => {
  registerBadgeProtocol()
  const db = getDb(app.getPath('userData'))
  seedCommunityCollections(db)
  startMCPServer()
  createWindow()
  const existingToken = getToken()
  if (existingToken) initTopicCache(existingToken).catch(() => {})
})
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add electron/badgeProtocol.ts electron/main.ts
git commit -m "feat: register badge:// Electron protocol handler (domain allowlist, 5s timeout, 100KB limit)"
```

---

### Task 7: Badge CSS Classes (Phase 3a)

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add `.rm-img-badge` and `.rm-badge-row` rules**

In `globals.css`, find the `.rm-img-content:hover` rule (~line 1989) and add after it:

```css
/* ── Badge image: inline, fixed height ── */
.rm-img-badge {
  display: inline;
  height: 20px;
  width: auto;
  vertical-align: middle;
  margin: 2px;
}

/* ── Badge row paragraph: flex wrap ── */
.rm-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 16px;
  align-items: center;
}
```

- [ ] **Step 2: Run existing tests**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx --reporter=verbose 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add .rm-img-badge and .rm-badge-row CSS classes"
```

---

### Task 8: Badge URL Rewriting & Image Handler (Phase 3b, 3e)

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/components/ReadmeRenderer.test.tsx`, add:

```tsx
describe('badge image rendering', () => {
  it('renders shields.io badge images with rm-img-badge class', () => {
    const { container } = renderMd('![build](https://img.shields.io/npm/v/foo)')
    const img = container.querySelector('img')
    expect(img?.className).toBe('rm-img-badge')
  })

  it('does not apply rm-img-badge to non-badge images', () => {
    const { container } = renderMd('![screenshot](https://example.com/screenshot.png)')
    const img = container.querySelector('img')
    expect(img?.className).not.toBe('rm-img-badge')
  })

  it('rewrites shields.io img src to badge:// scheme', () => {
    const { container } = renderMd('![build](https://img.shields.io/npm/v/foo)')
    const img = container.querySelector('img')
    // getAttribute returns the raw prop value before JSDOM URL normalisation
    expect(img?.getAttribute('src')).toMatch(/^badge:\/\//)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx -t "badge image rendering" --reporter=verbose 2>&1 | tail -10
```
Expected: FAIL — badge images get logo/content class; src not rewritten

- [ ] **Step 3: Add imports and badge URL rewriting in `ReadmeRenderer.tsx`**

At the top of `ReadmeRenderer.tsx`, update the badgeParser import:
```typescript
import { looksLikeBadgeUrl, BADGE_DOMAINS } from '../utils/badgeParser'
```

After the existing `fixedContent` block (~line 224), add a second rewriting step. Replace the single `fixedContent` variable with two steps:

```typescript
// Step 1: fix relative image paths → absolute GitHub raw URLs (existing)
const fixedContent = content
  .replace(
    /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g,
    (_, alt, src) =>
      `![${alt}](https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${src.replace(/^\.\//, '')})`
  )
  .replace(
    /src="(?!https?:\/\/)([^"]+)"/g,
    (_, src) =>
      `src="https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${src.replace(/^\.\//, '')}"`
  )

// Step 2: rewrite badge image URLs https:// → badge:// (runs after relative-path fix)
const rewrittenContent = fixedContent
  .replace(
    /!\[([^\]]*)\]\((https:\/\/[^)]+)\)/g,
    (match, alt, url) => {
      try {
        const { hostname } = new URL(url)
        if (BADGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
          return `![${alt}](${url.replace(/^https:\/\//, 'badge://')})`
        }
      } catch { /* ignore malformed URLs */ }
      return match
    }
  )
  .replace(
    /<img([^>]*)\ssrc="(https:\/\/[^"]+)"([^>]*)>/gi,
    (match, before, url, after) => {
      try {
        const { hostname } = new URL(url)
        if (BADGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
          return `<img${before} src="${url.replace(/^https:\/\//, 'badge://')}"${after}>`
        }
      } catch { /* ignore malformed URLs */ }
      return match
    }
  )
```

Update `displayContent` to use `rewrittenContent`:
```typescript
const displayContent =
  !expanded && rewrittenContent.length > MAX_CHARS
    ? rewrittenContent.slice(0, MAX_CHARS) + '\n\n...'
    : rewrittenContent
```

Update the expand button check to use `rewrittenContent`:
```typescript
{rewrittenContent.length > MAX_CHARS && !expanded && (
```

- [ ] **Step 4: Update the `img` component handler to detect badge images**

In the `img` component handler (~line 284 in the `components` object), add a badge check before `classifyImage`:

```tsx
img: ({ src, alt, node }: any) => {
  // Badge images: render inline at fixed height, skip content classification
  const normalised = src?.replace(/^badge:\/\//, 'https://') ?? ''
  if (looksLikeBadgeUrl(normalised)) {
    return (
      <img src={src} alt={alt ?? ''} className="rm-img-badge"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
    )
  }

  // Existing classification logic follows unchanged
  const isLinked = node?.properties?.dataLinked === true
  const headingCtx = (node?.properties?.dataHeadingCtx as string) ?? ''
  // ... rest unchanged
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx -t "badge image rendering" --reporter=verbose 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 6: Run full src/ test suite**

```bash
npx vitest run src/ --reporter=verbose 2>&1 | tail -10
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: rewrite badge URLs to badge:// scheme; render badge imgs with rm-img-badge class"
```

---

### Task 9: Rehype Plugin Badge Row Detection (Phase 3c)

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/components/ReadmeRenderer.test.tsx`, add:

```tsx
describe('badge row paragraph detection', () => {
  it('applies rm-badge-row class to a paragraph of only badge images', () => {
    const md =
      '[![build](https://img.shields.io/npm/v/foo)](https://npmjs.com) ' +
      '[![ci](https://img.shields.io/github/actions/workflow/status/foo/bar/ci.yml)](https://github.com)'
    const { container } = renderMd(md)
    const p = container.querySelector('p')
    expect(p?.className).toBe('rm-badge-row')
  })

  it('does not apply rm-badge-row when paragraph has mixed text and badge', () => {
    const { container } = renderMd('Some text ![build](https://img.shields.io/npm/v/foo)')
    const p = container.querySelector('p')
    expect(p?.className).not.toBe('rm-badge-row')
  })

  it('uses rm-logo-row (not rm-badge-row) for linked non-badge images', () => {
    const { container } = renderMd('[![logo](https://example.com/logo.png)](https://example.com)')
    const p = container.querySelector('p')
    expect(p?.className).toBe('rm-logo-row')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx -t "badge row paragraph detection" --reporter=verbose 2>&1 | tail -10
```
Expected: FAIL

- [ ] **Step 3: Replace the paragraph detection block in `rehypeImageClassifier`**

In `ReadmeRenderer.tsx`, the paragraph detection block currently starts at ~line 60. Replace the entire `if (node.tagName === 'p')` block with:

```typescript
if (node.tagName === 'p') {
  const significant = node.children.filter(
    c => !(c.type === 'text' && (c as Text).value.trim() === '')
  )
  if (significant.length === 0) return

  // Collect all img srcs (direct imgs or imgs inside <a>)
  const imgSrcs: string[] = []
  for (const c of significant) {
    if (c.type !== 'element') { imgSrcs.push('__non_img__'); continue }
    const el = c as Element
    if (el.tagName === 'img') {
      imgSrcs.push(String(el.properties?.src ?? ''))
    } else if (
      el.tagName === 'a' &&
      el.children.length === 1 &&
      el.children[0].type === 'element' &&
      (el.children[0] as Element).tagName === 'img'
    ) {
      imgSrcs.push(String((el.children[0] as Element).properties?.src ?? ''))
    } else {
      imgSrcs.push('__non_img__')
    }
  }

  if (imgSrcs.some(s => s === '__non_img__')) return

  // Badge row: all images are badge URLs (takes precedence over logo row)
  const allBadges = imgSrcs.every(s =>
    looksLikeBadgeUrl(s.replace(/^badge:\/\//, 'https://'))
  )
  if (allBadges) {
    node.properties = node.properties ?? {}
    node.properties.dataBadgeRow = true
    return
  }

  // Logo row: all images are linked (wrapped in <a>)
  const allLinkedImgs = significant.every(c => {
    if (c.type !== 'element') return false
    const el = c as Element
    return (
      el.tagName === 'a' &&
      el.children.length === 1 &&
      el.children[0].type === 'element' &&
      (el.children[0] as Element).tagName === 'img'
    )
  })
  if (allLinkedImgs) {
    node.properties = node.properties ?? {}
    node.properties.dataLogoRow = true
  }
}
```

- [ ] **Step 4: Update the `p` component handler to handle `dataBadgeRow`**

Find the `p` handler (~line 252 in the `components` object):
```tsx
p: ({ children, node }: any) => {
  const isLogoRow = node?.properties?.dataLogoRow === true
  return <p className={isLogoRow ? 'rm-logo-row' : 'rm-p'}>{children}</p>
},
```

Replace with:
```tsx
p: ({ children, node }: any) => {
  if (node?.properties?.dataBadgeRow === true) {
    return <p className="rm-badge-row">{children}</p>
  }
  if (node?.properties?.dataLogoRow === true) {
    return <p className="rm-logo-row">{children}</p>
  }
  return <p className="rm-p">{children}</p>
},
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/ReadmeRenderer.test.tsx -t "badge row paragraph detection" --reporter=verbose 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 6: Run full src/ test suite**

```bash
npx vitest run src/ --reporter=verbose 2>&1 | tail -10
```
Expected: all pass (pre-existing `electron/` failures unrelated to our changes — `ERR_DLOPEN_FAILED` native SQLite)

- [ ] **Step 7: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: detect all-badge paragraphs in rehype plugin; render with rm-badge-row class"
```

---

## Notes

- **Pre-existing test failures:** `electron/upsert.test.ts`, `electron/collections.test.ts`, `electron/mcp-server.test.ts` fail with `ERR_DLOPEN_FAILED` (native better-sqlite3 build issue, unrelated to this work). Ignore them.
- **No CSP changes needed:** `src/index.html` has no CSP meta tag and `electron/main.ts` sets no `Content-Security-Policy` header. The `badge://` protocol works without CSP updates.
- **Task order matters for Phase 3:** Task 5 (export `BADGE_DOMAINS`) must complete before Tasks 6, 8, and 9 which import it.
- **Tasks 1–4 are independent** of Tasks 5–9 and can be done in any order relative to each other.
