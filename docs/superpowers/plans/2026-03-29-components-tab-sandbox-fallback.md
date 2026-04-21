# Components Tab — Sandbox Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a StackBlitz sandbox fallback in the Components tab for repos identified as component libraries that have no detectable public Storybook instance.

**Architecture:** A new `isComponentLibraryRepo` utility detects component libraries from topics/description. A new `StackBlitzExplorer` component embeds StackBlitz as a full-bleed iframe. `RepoDetail` uses `isComponentLibrary` to control tab visibility and renders the right explorer based on `storybookState`.

**Tech Stack:** React 18, TypeScript, Vitest, existing `.sb-*` CSS classes, StackBlitz public embed URL

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/utils/componentLibraryDetector.ts` | Create | Pure function: topic + description → boolean |
| `src/utils/componentLibraryDetector.test.ts` | Create | Unit tests for the detector |
| `src/components/StackBlitzExplorer.tsx` | Create | Full-bleed StackBlitz iframe with loading overlay |
| `src/views/RepoDetail.tsx` | Modify | `isComponentLibrary` memo, tab visibility, tab body |
| `src/styles/globals.css` | Modify | Full-bleed flex fix + loading tab CSS |

---

## Task 1: `isComponentLibraryRepo` utility

**Files:**
- Create: `src/utils/componentLibraryDetector.ts`
- Create: `src/utils/componentLibraryDetector.test.ts`

### Step 1: Write the failing tests

- [ ] Create `src/utils/componentLibraryDetector.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest'
import { isComponentLibraryRepo } from './componentLibraryDetector'

describe('isComponentLibraryRepo — topic matches', () => {
  it('returns true for react-components topic', () => {
    expect(isComponentLibraryRepo(['react-components'], null)).toBe(true)
  })
  it('returns true for ui-library topic', () => {
    expect(isComponentLibraryRepo(['ui-library'], null)).toBe(true)
  })
  it('returns true for design-system topic', () => {
    expect(isComponentLibraryRepo(['design-system'], null)).toBe(true)
  })
  it('returns true for component-library topic', () => {
    expect(isComponentLibraryRepo(['component-library'], null)).toBe(true)
  })
  it('returns true for ui-kit topic', () => {
    expect(isComponentLibraryRepo(['ui-kit'], null)).toBe(true)
  })
  it('returns true for storybook topic', () => {
    expect(isComponentLibraryRepo(['storybook'], null)).toBe(true)
  })
  it('is case-insensitive for topics', () => {
    expect(isComponentLibraryRepo(['UI-Library'], null)).toBe(true)
  })
  it('returns false for unrelated topics', () => {
    expect(isComponentLibraryRepo(['cli', 'node', 'typescript'], null)).toBe(false)
  })
  it('returns false for empty topics and null description', () => {
    expect(isComponentLibraryRepo([], null)).toBe(false)
  })
})

describe('isComponentLibraryRepo — description matches', () => {
  it('returns true when description contains "component"', () => {
    expect(isComponentLibraryRepo([], 'A React component library')).toBe(true)
  })
  it('returns true when description contains "design system"', () => {
    expect(isComponentLibraryRepo([], 'Our design system for web apps')).toBe(true)
  })
  it('returns true when description contains "ui library" (case-insensitive)', () => {
    expect(isComponentLibraryRepo([], 'UI Library for Vue 3')).toBe(true)
  })
  it('returns true when description contains "ui kit"', () => {
    expect(isComponentLibraryRepo([], 'A minimal UI kit')).toBe(true)
  })
  it('returns false when description has no keywords', () => {
    expect(isComponentLibraryRepo([], 'Fast async job queue for Node.js')).toBe(false)
  })
  it('returns false for null description with no topics', () => {
    expect(isComponentLibraryRepo([], null)).toBe(false)
  })
})

describe('isComponentLibraryRepo — combined', () => {
  it('returns true when topics match even if description does not', () => {
    expect(isComponentLibraryRepo(['react-ui'], 'Fast async job queue')).toBe(true)
  })
  it('returns true when description matches even if topics do not', () => {
    expect(isComponentLibraryRepo(['cli'], 'A component library for React')).toBe(true)
  })
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:
```bash
npx vitest run src/utils/componentLibraryDetector.test.ts
```
Expected: FAIL — `isComponentLibraryRepo` not found

### Step 3: Implement `isComponentLibraryRepo`

- [ ] Create `src/utils/componentLibraryDetector.ts`:

```ts
const TOPIC_KEYWORDS = new Set([
  'react-components', 'vue-components', 'angular-components',
  'svelte-components', 'web-components', 'ui-library', 'ui-kit',
  'ui-components', 'component-library', 'design-system', 'storybook',
  'components', 'react-ui', 'css-framework',
])

const DESCRIPTION_KEYWORDS = [
  'component', 'ui library', 'ui kit', 'design system', 'component library',
]

export function isComponentLibraryRepo(
  topics: string[],
  description: string | null,
): boolean {
  if (topics.some(t => TOPIC_KEYWORDS.has(t.toLowerCase()))) return true
  if (!description) return false
  const lower = description.toLowerCase()
  return DESCRIPTION_KEYWORDS.some(kw => lower.includes(kw))
}
```

### Step 4: Run tests to verify they pass

- [ ] Run:
```bash
npx vitest run src/utils/componentLibraryDetector.test.ts
```
Expected: all 17 tests PASS

### Step 5: Commit

- [ ] Run:
```bash
git add src/utils/componentLibraryDetector.ts src/utils/componentLibraryDetector.test.ts
git commit -m "feat: add isComponentLibraryRepo utility with tests"
```

---

## Task 2: `StackBlitzExplorer` component

**Files:**
- Create: `src/components/StackBlitzExplorer.tsx`

No unit tests are needed here — the component is a pure iframe wrapper with no logic beyond loading state. It will be visually verified when wired in Task 3.

### Step 1: Create the component

- [ ] Create `src/components/StackBlitzExplorer.tsx`:

```tsx
import { useState } from 'react'

interface Props {
  owner: string
  name: string
}

export default function StackBlitzExplorer({ owner, name }: Props) {
  const [iframeLoaded, setIframeLoaded] = useState(false)

  const embedUrl = `https://stackblitz.com/github/${owner}/${name}?embed=1&hideNavigation=1&theme=dark`
  const openUrl  = `https://stackblitz.com/github/${owner}/${name}`

  return (
    <div className="sb-explorer">
      <div className="sb-preview">
        <div className="sb-preview-toolbar">
          <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{owner}/{name}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => window.api.openExternal(openUrl)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--t3)', fontFamily: 'Inter, sans-serif', fontSize: 11,
              padding: '2px 6px',
            }}
            title="Open in StackBlitz"
          >↗</button>
        </div>
        <div className="sb-preview-frame-wrap" style={{ padding: 0, position: 'relative' }}>
          {!iframeLoaded && (
            <div className="sb-detecting" style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
              <span>Loading sandbox…</span>
            </div>
          )}
          <iframe
            className="sb-preview-frame"
            src={embedUrl}
            style={{ visibility: iframeLoaded ? 'visible' : 'hidden' }}
            onLoad={() => setIframeLoaded(true)}
            title={`${owner}/${name} — StackBlitz`}
          />
        </div>
      </div>
    </div>
  )
}
```

### Step 2: Verify TypeScript compiles

- [ ] Run:
```bash
npx tsc --noEmit
```
Expected: no errors for `StackBlitzExplorer.tsx` (ignore any pre-existing errors in other files)

### Step 3: Commit

- [ ] Run:
```bash
git add src/components/StackBlitzExplorer.tsx
git commit -m "feat: add StackBlitzExplorer component"
```

---

## Task 3: Wire up `RepoDetail` + CSS

**Files:**
- Modify: `src/views/RepoDetail.tsx`
- Modify: `src/styles/globals.css`

### Step 1: Update globals.css

- [ ] Open `src/styles/globals.css`. Find the `.repo-detail-tab-body--full-bleed` rule (around line 1652):
```css
.repo-detail-tab-body--full-bleed {
  padding: 0;
  overflow: hidden;
}
```
Replace it with:
```css
.repo-detail-tab-body--full-bleed {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

- [ ] Find the `.repo-detail-tab.active` rule (around line 1634):
```css
.repo-detail-tab.active {
  color: var(--accent-text);
  border-bottom-color: var(--accent);
}
```
Add the following two new rules **immediately after** it:
```css
.repo-detail-tab--loading {
  opacity: 0.45;
  cursor: default;
  pointer-events: none;
}
.repo-detail-tab--loading::after {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin-left: 5px;
  vertical-align: middle;
}
```
Note: `@keyframes spin` is already defined further down in globals.css — do NOT add a duplicate.

### Step 2: Update imports in `RepoDetail.tsx`

- [ ] Open `src/views/RepoDetail.tsx`. Change line 1:
```ts
import { useState, useEffect } from 'react'
```
to:
```ts
import { useState, useEffect, useMemo } from 'react'
```

- [ ] Add these two imports immediately after the `StorybookExplorer` import at line 35:
```ts
import StackBlitzExplorer from '../components/StackBlitzExplorer'
import { isComponentLibraryRepo } from '../utils/componentLibraryDetector'
```

### Step 3: Add the `isComponentLibrary` memo

- [ ] In `RepoDetail`, find the Storybook state declarations (around line 388–391):
```ts
// Storybook / Components tab state
// 'detecting' while IPC call is in-flight; string = confirmed URL; null = not found
const [storybookState, setStorybookState] = useState<'detecting' | string | null>('detecting')
const [storybookReadmeScanned, setStorybookReadmeScanned] = useState(false)
```
Add the `isComponentLibrary` memo **immediately after** those two lines:
```ts
const isComponentLibrary = useMemo(
  () => isComponentLibraryRepo(parseTopics(repo?.topics ?? null), repo?.description ?? null),
  [repo?.topics, repo?.description]
)
```

### Step 4: Update the `visibleTabs` predicate

- [ ] Find the `visibleTabs` filter (around line 681–689). Change the components tab condition from:
```ts
(t.id !== 'components' || storybookState === 'detecting' || typeof storybookState === 'string')
```
to:
```ts
(t.id !== 'components' || isComponentLibrary)
```

### Step 5: Update the tab button className

- [ ] Find the `visibleTabs.map` loop (around line 803). Change:
```ts
className={`repo-detail-tab${activeTab === t.id ? ' active' : ''}`}
```
to:
```ts
className={`repo-detail-tab${activeTab === t.id ? ' active' : ''}${t.id === 'components' && storybookState === 'detecting' ? ' repo-detail-tab--loading' : ''}`}
```

### Step 6: Replace the redirect effect

- [ ] Find the existing redirect-to-readme effect (around line 503–508):
```ts
// If detection completed with no Storybook and user is on the components tab, fall back to readme
useEffect(() => {
  if (storybookState === null && activeTab === 'components') {
    setActiveTab('readme')
  }
}, [storybookState, activeTab])
```
Replace it entirely with:
```ts
// Safety net: if this repo isn't a component library and the user is somehow on
// the components tab (e.g. navigated from a component-library repo), redirect to readme.
useEffect(() => {
  if (!isComponentLibrary && activeTab === 'components') setActiveTab('readme')
}, [isComponentLibrary, activeTab])
```

### Step 7: Update the Components tab body

- [ ] Find the Components tab body render (around line 1104–1117):
```tsx
{activeTab === 'components' && (
  storybookState === 'detecting' ? (
    <div className="sb-detecting">
      <span>Detecting Storybook…</span>
    </div>
  ) : typeof storybookState === 'string' ? (
    <StorybookExplorer
      storybookUrl={storybookState}
      repoName={name ?? ''}
    />
  ) : (
    <div className="sb-empty">No component preview available.</div>
  )
)}
```
Replace it with:
```tsx
{activeTab === 'components' && isComponentLibrary && (
  storybookState === 'detecting' ? (
    <div className="sb-detecting">
      <span>Detecting…</span>
    </div>
  ) : typeof storybookState === 'string' ? (
    <StorybookExplorer
      storybookUrl={storybookState}
      repoName={name ?? ''}
    />
  ) : (
    <StackBlitzExplorer
      key={`${owner ?? ''}/${name ?? ''}`}
      owner={owner ?? ''}
      name={name ?? ''}
    />
  )
)}
```

### Step 8: Verify TypeScript compiles clean

- [ ] Run:
```bash
npx tsc --noEmit
```
Expected: no new errors introduced by this task

### Step 9: Run the utils test suite

- [ ] Run:
```bash
npx vitest run src/utils/
```
Expected: all tests PASS (including the new `componentLibraryDetector` tests)

### Step 10: Commit

- [ ] Run:
```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat: wire StackBlitz sandbox fallback into Components tab"
```
