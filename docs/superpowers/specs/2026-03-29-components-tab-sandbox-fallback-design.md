# Components Tab — Sandbox Fallback Design Spec

**Date:** 2026-03-29

## Summary

When a repo has no detectable public Storybook instance, the Components tab falls back to an embedded StackBlitz sandbox loaded from the GitHub repo. The tab is only shown for repos identified as component libraries; during Storybook detection it remains visible but greyed out with a loading spinner.

---

## 1. Component Library Detection

**New file:** `src/utils/componentLibraryDetector.ts`

Exports a single pure function:

```ts
isComponentLibraryRepo(topics: string[], description: string | null): boolean
```

The caller is responsible for parsing the raw JSON topics string before calling this function. In `RepoDetail`, use the existing `parseTopics(repo?.topics ?? null)` utility to obtain a `string[]` before passing to `isComponentLibraryRepo`. When `repo` is `null`, pass `[]` and `null` — the function returns `false`.

**Topic matches** (exact tag, case-insensitive):
`react-components`, `vue-components`, `angular-components`, `svelte-components`, `web-components`, `ui-library`, `ui-kit`, `ui-components`, `component-library`, `design-system`, `storybook`, `components`, `react-ui`, `css-framework`

**Description matches** (case-insensitive substring):
`component`, `ui library`, `ui kit`, `design system`, `component library`

Returns `true` if any topic or description keyword matches; `false` otherwise.

Comes with a unit test file `src/utils/componentLibraryDetector.test.ts` covering true/false cases for both topics and description.

---

## 2. Tab Visibility & State

### `isComponentLibrary` derived value

Add `useMemo` to the React import (currently only `useState` and `useEffect` are imported). Derive `isComponentLibrary` in `RepoDetail`:

```ts
const isComponentLibrary = useMemo(
  () => isComponentLibraryRepo(parseTopics(repo?.topics ?? null), repo?.description ?? null),
  [repo?.topics, repo?.description]
)
```

`repo` is already loaded with topics/description before `storybookState` resolves, so `isComponentLibrary` is `true` (for component libraries) during the detecting phase. The `visibleTabs` predicate therefore does not need a special `storybookState === 'detecting'` clause. When `repo` is `null` (reset during navigation), `isComponentLibrary` is `false`, correctly hiding the tab.

### `visibleTabs` predicate

Replace the existing Storybook-specific condition:
```ts
(t.id !== 'components' || storybookState === 'detecting' || typeof storybookState === 'string')
```
with:
```ts
(t.id !== 'components' || isComponentLibrary)
```

### Navigation / orphaned-tab guard

Remove the previous redirect-to-readme effect (`storybookState === null && activeTab === 'components'`).

Replace it with the following defensive safety-net effect. In practice, the `setActiveTab('readme')` call at line 429 (the `[owner, name]` reset effect) fires on every navigation and already resets the active tab before `isComponentLibrary` can flip to `false`, so this effect rarely fires. It is retained as a guard against future code paths that might bypass that reset:

```ts
useEffect(() => {
  if (!isComponentLibrary && activeTab === 'components') setActiveTab('readme')
}, [isComponentLibrary, activeTab])
```

### Tab appearance by `storybookState`

| `storybookState` | Tab button class | Tab body |
|---|---|---|
| `'detecting'` | `repo-detail-tab repo-detail-tab--loading` (+ `active` if selected) | `<div className="sb-detecting"><span>Detecting…</span></div>` |
| `string` (URL) | `repo-detail-tab` (+ `active` if selected) | `StorybookExplorer` |
| `null` | `repo-detail-tab` (+ `active` if selected) | `StackBlitzExplorer` |

### Tab button className expression

In the existing `visibleTabs.map` loop, change:
```ts
className={`repo-detail-tab${activeTab === t.id ? ' active' : ''}`}
```
to:
```ts
className={`repo-detail-tab${activeTab === t.id ? ' active' : ''}${t.id === 'components' && storybookState === 'detecting' ? ' repo-detail-tab--loading' : ''}`}
```

### Full-bleed modifier and height chain

`.repo-detail-tab-body--full-bleed` currently has `padding: 0; overflow: hidden` but is not a flex container. Add `display: flex; flex-direction: column` so all direct children (`.sb-detecting` placeholder, `.sb-explorer` root of both Storybook and StackBlitz explorers) fill the available height via flex stretch.

### README scan interaction

The existing README scan effect (lines 481–501) is intentionally untouched. If it finds a Storybook URL via README candidates after `storybookState` has already resolved to `null` (causing `StackBlitzExplorer` to mount), `setStorybookState(url)` will swap to `StorybookExplorer`. This is intentional and desirable — the Storybook experience is preferred over StackBlitz. The StackBlitz iframe will have started loading at that point and will be unmounted mid-load; this is acceptable behaviour in Electron's webview model (the load is simply abandoned, no side effects).

---

## 3. `StackBlitzExplorer` Component

**New file:** `src/components/StackBlitzExplorer.tsx`

**Props:**
```ts
interface Props {
  owner: string
  name: string
}
```

**Remounting strategy:** The parent (`RepoDetail`) must pass `key={`${owner}/${name}`}` when rendering `StackBlitzExplorer`. This forces a full unmount/remount on repo navigation, which resets `iframeLoaded` to `false` without a post-render race condition. Do not use a `useEffect([owner, name])` to reset `iframeLoaded` — on a prop change, `useEffect` fires after the render, creating a one-frame flash where the new iframe is visible before the overlay appears.

**State:** `const [iframeLoaded, setIframeLoaded] = useState(false)`

**Root element:** `<div className="sb-explorer">` — this gives `display: flex; height: 100%; overflow: hidden`, so `.sb-preview` inside it gets `flex: 1` and fills the space. There is no `.sb-list` sidebar; `.sb-preview` expands to full width.

**Overlay strategy:** Always render the `<iframe>` in the DOM (begins loading immediately). Keep it visually hidden (`visibility: hidden`) until `iframeLoaded` is `true`. Render the `<div className="sb-detecting">` overlay absolutely within `.sb-preview-frame-wrap` while `!iframeLoaded`. Note: `.sb-detecting` uses `height: 100%` in its CSS rule. In this context, `inset: 0` on the absolutely-positioned element determines sizing instead — `height: 100%` is overridden. The `position: relative` on `.sb-preview-frame-wrap` establishes the containing block; `.sb-preview-frame-wrap` has a definite height from `flex: 1` inside `.sb-preview` (a column flex container), so the overlay fills correctly.

**`sandbox` attribute:** Omit entirely. StackBlitz requires a broad permission set that makes a restrictive `sandbox` impractical.

**`sb-preview-frame-wrap` padding:** Override to `padding: 0` via inline style. The default `padding: 20px` creates an unwanted gap around the full-bleed embed. The `position: relative` inline style is also required — it establishes the containing block for the absolute-positioned overlay.

**Toolbar:** Left: `{owner}/{name}` in `var(--t2)` bold. Right: button with content `↗`, `title="Open in StackBlitz"`, calls `window.api.openExternal(`https://stackblitz.com/github/${owner}/${name}`)`.

**Full JSX structure:**
```tsx
<div className="sb-explorer">
  <div className="sb-preview">
    <div className="sb-preview-toolbar">
      <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{owner}/{name}</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => window.api.openExternal(`https://stackblitz.com/github/${owner}/${name}`)}
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
        src={`https://stackblitz.com/github/${owner}/${name}?embed=1&hideNavigation=1&theme=dark`}
        style={{ visibility: iframeLoaded ? 'visible' : 'hidden' }}
        onLoad={() => setIframeLoaded(true)}
        title={`${owner}/${name} — StackBlitz`}
      />
    </div>
  </div>
</div>
```

No IPC calls — entirely client-side.

---

## 4. Changes to Existing Files

### `src/views/RepoDetail.tsx`
- Add `useMemo` to the React import
- Import `isComponentLibraryRepo` from `../utils/componentLibraryDetector`
- Import `StackBlitzExplorer` from `../components/StackBlitzExplorer`
- Add `isComponentLibrary` useMemo (Section 2)
- Update `visibleTabs` filter predicate (Section 2)
- Update tab button `className` expression (Section 2)
- Replace old redirect-to-readme effect with new safety-net effect (Section 2)
- Update Components tab body: render `<StackBlitzExplorer key={`${owner ?? ''}/${name ?? ''}`} owner={owner ?? ''} name={name ?? ''} />` when `storybookState === null`
- Update detecting state in Components tab body: `<div className="sb-detecting"><span>Detecting…</span></div>` (intentionally shorter than the existing "Detecting Storybook…" text — the tab context makes the subject clear)

### `src/styles/globals.css`

**Update `.repo-detail-tab-body--full-bleed`:**
```css
.repo-detail-tab-body--full-bleed {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

**Add after `.repo-detail-tab.active`:**
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

Uses the existing `@keyframes spin`. Do not add a duplicate declaration.

---

## 5. Out of Scope

- No backend/IPC changes — StackBlitz URL is constructed client-side
- No caching of "is component library" result — computed live from already-loaded repo data
- No fallback for non-JS repos beyond what StackBlitz naturally provides (code editor view)
