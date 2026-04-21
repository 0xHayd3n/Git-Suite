# Component Explorer Design Spec

**Date:** 2026-03-29

## Summary

Replace `StackBlitzExplorer` with a custom `ComponentExplorer` that scans a repo's source files via GitHub API, identifies component files, parses their props, and renders each component live in a sandboxed iframe using in-browser compilation. For components that fail to render (bad imports, unsupported framework, Angular) it silently falls back to syntax-highlighted source code + a prop table. The result is a lightweight, on-the-spot Storybook equivalent — no external service, no cloning.

---

## 1. Architecture

Three layers:

### Main process — `electron/componentScanner.ts`

A new `components:scan` IPC handler. Fetches `package.json` + the full repo file tree from GitHub API, filters component files, fetches their source in parallel, returns structured data to the renderer. No caching — scanned fresh on each mount.

### Renderer utils — `src/utils/`

| File | Responsibility |
|---|---|
| `componentParser.ts` | Given source + framework, extract exported component name + prop types using regex (no full AST) |
| `propsGenerator.ts` | Turn parsed prop type strings into concrete default values |
| `iframeTemplate.ts` | Build a self-contained HTML blob string per framework, with local imports stubbed and CDN runtime injected |

### UI — `src/components/ComponentExplorer.tsx`

Two-pane layout identical to `StorybookExplorer` (reuses all `.sb-*` CSS classes). Sidebar lists discovered components grouped by folder. Preview pane shows either a live iframe render or syntax-highlighted code fallback, plus a collapsible props table. Calls `window.api.components.scan` on mount.

---

## 2. IPC: `components:scan`

**New file:** `electron/componentScanner.ts`

**New GitHub API helpers** (added to `electron/github.ts`):
```ts
getRepoTree(token: string | null, owner: string, name: string, branch: string): Promise<{ path: string; type: string }[]>
getFileContent(token: string | null, owner: string, name: string, path: string): Promise<string | null>
```

`getRepoTree` calls `GET /repos/{owner}/{name}/git/trees/{branch}?recursive=1` and returns the `tree` array items (path + type fields only).

`getFileContent` calls `GET /repos/{owner}/{name}/contents/{path}`, base64-decodes the response, and returns the UTF-8 string. Returns `null` on 404 or non-200.

**Handler:**
```ts
ipcMain.handle('components:scan', async (_event, owner: string, name: string, branch: string) => {
  // 1. Get token (may be null for unauthenticated)
  // 2. Fetch package.json → detect framework
  // 3. Fetch full file tree
  // 4. Filter component files (see Section 3)
  // 5. Fetch source in parallel, batches of 10, max 50 files
  // 6. Return { framework, components: [{ path, source }] }
})
```

**Shared types** — new file `src/types/components.ts` (imported by both renderer utils and `env.d.ts`):
```ts
export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'angular' | 'unknown'

export interface ScannedComponent {
  path: string    // e.g. "src/components/Button.tsx"
  source: string  // raw file content
}

export interface ComponentScanResult {
  framework: Framework
  components: ScannedComponent[]
}
```

The main-process handler returns a plain object matching `ComponentScanResult`. No main-process import of this types file is needed — it is a renderer-side type declaration used for IPC result typing only.

**`preload.ts` addition** (after the `storybook` block):
```ts
components: {
  scan: (owner: string, name: string, branch: string) =>
    ipcRenderer.invoke('components:scan', owner, name, branch),
},
```

**`src/env.d.ts` addition:**
```ts
import type { ComponentScanResult } from './types/components'

// inside Window['api']:
components: {
  scan(owner: string, name: string, branch: string): Promise<ComponentScanResult>
}
```

---

## 3. Framework Detection + Component File Identification

### Framework detection

Checks `package.json` `dependencies` + `devDependencies` in this priority order:

| Package present | Framework |
|---|---|
| `@angular/core` | `'angular'` |
| `solid-js` | `'solid'` |
| `svelte` | `'svelte'` |
| `vue` | `'vue'` |
| `react` or `react-dom` | `'react'` |
| none match | `'unknown'` |

If `package.json` fetch fails, fall back to inspecting extensions of files in the tree:
- Any `.vue` files → `'vue'`
- Any `.svelte` files → `'svelte'`
- `.tsx` / `.jsx` files → `'react'`
- otherwise → `'unknown'`

### Component file identification

A file path passes the filter if it satisfies **all** of the following:

**Extension matches framework:**
- `react` / `solid`: `.tsx`, `.jsx`
- `vue`: `.vue`
- `svelte`: `.svelte`
- `angular` / `unknown`: `.ts`, `.tsx`

**Path includes at least one include pattern:**
- `/components/`, `/component/`, `/ui/`, `/primitives/`, `/elements/`
- Or matches `src/[A-Z]*.tsx` (flat structure: PascalCase file at `src/` root)
- Or is under `packages/*/src/` (monorepo sub-package)

**Path does not match any exclude pattern:**
- `*.test.*`, `*.spec.*`, `*.stories.*`, `*.d.ts`
- `index.*`
- Filename (without extension) is all-lowercase (hooks, utilities)
- Path contains `__tests__`, `__mocks__`, `node_modules`, `dist`, `.storybook`

### Display name + grouping

- **Name**: filename without extension (e.g. `Button.tsx` → `"Button"`)
- **Group**: immediate parent directory name (e.g. `src/components/forms/Input.tsx` → group `"forms"`)
- Groups with only one component do not show a group label in the sidebar

---

## 4. Renderer Utils

### `componentParser.ts`

Exports:
```ts
import type { Framework } from '../types/components'

export interface ParsedProp {
  name: string
  type: string        // raw type string, e.g. "string", "boolean", "'sm' | 'lg'"
  required: boolean
  defaultValue?: string
}

export interface ParsedComponent {
  name: string          // display name (from export or filename)
  props: ParsedProp[]
  framework: Framework
  renderable: boolean   // false for angular/unknown
}

export function parseComponent(path: string, source: string, framework: Framework): ParsedComponent
```

**React/Solid prop extraction** — regex-based:
- Match `interface \w*Props\s*\{([^}]+)\}` or `type \w*Props\s*=\s*\{([^}]+)\}`
- For each line inside: extract `propName?: type` or `propName: type`
- Strip JSDoc comments

**Vue prop extraction:**
- Match `defineProps<\{([^}]+)\}>` for `<script setup>` style
- Match `props:\s*\{([^}]+)\}` for Options API style

**Svelte prop extraction:**
- Match `export let (\w+):\s*([^=;\n]+)(?:\s*=\s*([^;\n]+))?` per line

**Angular / unknown:** Return `props: []`, `renderable: false`

### `propsGenerator.ts`

```ts
export function generateProps(props: ParsedProp[]): Record<string, unknown>
```

Type string → default value mapping:
- `string` → `"Text"`
- `number` → `0`
- `boolean` → `false`
- `string[]` → `[]`
- `number[]` → `[]`
- Union of string literals (`'sm' | 'md' | 'lg'`) → first value (`'sm'`)
- `React.ReactNode` / `ReactNode` / `VNode` / `Snippet` → omit (skip prop)
- Function types (`() => void`, `(...) => ...`) → omit
- Complex / object / unknown → omit

### `iframeTemplate.ts`

```ts
export function buildIframeHtml(
  component: ParsedComponent,
  source: string,
  props: Record<string, unknown>,
): string
```

Returns a full HTML document string suitable for a `blob:` URL.

**Local import stubbing** (applied to all frameworks before injection):
Regex pre-processing pass using capture groups that replaces:
- `import (\w+) from ['"]\.\.?/[^'"]+['"]` → `const $1 = () => null`
- `import \{([^}]+)\} from ['"]\.\.?/[^'"]+['"]` → `const {$1} = {}` (destructured from empty object; names in capture group are used verbatim)
- `import ['"]\.\.?/[^'"]+\.css['"]` → (removed entirely — side-effect CSS imports)
- Third-party npm imports (no leading `./` or `../`) are left untouched — resolved via CDN

**Iframe `sandbox` attribute:**
All rendered iframes use `sandbox="allow-scripts"`. `allow-same-origin` is deliberately omitted — blob URLs share the renderer origin, so granting `same-origin` would give the injected code full DOM access to the parent window. `allow-scripts` alone is sufficient for the compiled code to execute. Note: this means any component code that reads `document.cookie` or calls `localStorage` will silently fail inside the iframe — that is acceptable for a preview context.

**Runtime error detection (postMessage bridge):**
All framework templates include a `window.onerror` handler that posts a message to the parent:
```html
<script>
window.onerror = function(msg, src, line, col, err) {
  window.parent.postMessage({ type: 'render-error', message: msg }, '*');
  return true;
};
window.addEventListener('unhandledrejection', function(e) {
  window.parent.postMessage({ type: 'render-error', message: String(e.reason) }, '*');
});
</script>
```
`ComponentExplorer` listens for `message` events on `window` and switches the component to `'fallback'` immediately when `type === 'render-error'` is received. This provides faster failure detection than the 5-second timeout for runtime JS errors. The timeout remains as a safety net for cases where the iframe loads but hangs silently.

**React template:**
```html
<!DOCTYPE html><html><head>
<meta charset="utf-8">
<script>/* onerror + unhandledrejection postMessage bridge (above) */</script>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#fff;color:#000}</style>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const {useState,useEffect,useRef,useCallback,useMemo,useContext,createContext} = React;
/* STUBBED LOCAL IMPORTS */
/* COMPONENT SOURCE */
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ComponentName, GENERATED_PROPS));
</script></body></html>
```

**Vue 3 template:**
CDN: `https://unpkg.com/vue@3/dist/vue.global.js` (UMD, exposes `window.Vue`).
The `<template>` block is extracted from the `.vue` source and compiled with `Vue.compile(templateString)` to get a render function. The `<script setup>` block is extracted and its `defineProps` call is replaced with a plain `const props = GENERATED_PROPS` assignment. The component definition `{ setup() { return props }, render }` is passed to `Vue.createApp({...}).mount('#app')`.
Options API SFCs (with `export default { ... }`) are handled by extracting the `export default` object and merging `props: GENERATED_PROPS` into it before mounting.

**Svelte template:**
CDN: `https://unpkg.com/svelte@4/compiler.js` (browser build, ~1.5MB, loaded lazily — only for Svelte repos).
The source is compiled via `svelte.compile(source, { generate: 'dom', format: 'esm' })`. The compiled JS is injected into a `<script type="module">` tag (ESM format is required — `format: 'cjs'` produces `require()` calls which are unavailable in a browser script tag). The component class is the default export; it is mounted via `new Component({ target: document.body, props: GENERATED_PROPS })`.

**Solid template:**
CDN: `https://unpkg.com/solid-js/dist/solid.js` + `https://unpkg.com/solid-js/web/dist/web.js` (UMD builds). Babel standalone with the `solid` preset (loaded from `https://unpkg.com/babel-preset-solid`) handles JSX transformation.
**Note:** Solid's CDN/UMD distribution is less standardised than React's. If the UMD build approach fails in practice, the implementer should fall back to treating Solid repos as React (JSX syntax is compatible) with ReactDOM as the runtime — flag this as a known risk.

**Angular / unknown:**
`buildIframeHtml` returns `null` for these — caller uses code view directly.

---

## 5. `ComponentExplorer` UI

**New file:** `src/components/ComponentExplorer.tsx`

**Props:**
```ts
interface Props {
  owner: string
  name: string
  branch: string
}
```

**Internal state:**
```ts
import type { Framework } from '../types/components'
import type { ParsedComponent } from '../utils/componentParser'

type ScanState = 'idle' | 'scanning' | 'done' | 'error'
type RenderState = 'pending' | 'rendering' | 'rendered' | 'fallback'

const [scanState, setScanState]       = useState<ScanState>('idle')
const [framework, setFramework]       = useState<Framework | null>(null)
const [components, setComponents]     = useState<ParsedComponent[]>([])
const [selectedPath, setSelectedPath] = useState<string | null>(null)

// Per-component render state
const [renderStates, setRenderStates] = useState<Record<string, RenderState>>({})

// Blob URLs generated on-demand (not upfront)
const [blobUrls, setBlobUrls]         = useState<Record<string, string>>({})

// Timeout ref for the 5-second render guard — must be cleared on deselect
const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

**Scan lifecycle:**
- On mount: immediately call `window.api.components.scan(owner, name, branch)`
- While in flight: show `.sb-detecting` spinner in sidebar
- On success: set `components`, `framework`, auto-select first component
- On error: show `.sb-empty` error message

**On component select:**
- If `renderable === false` (angular/unknown) → set renderState to `'fallback'` immediately
- Otherwise → generate blob URL from `buildIframeHtml`, set renderState to `'rendering'`

**Iframe events and render lifecycle:**
- `onLoad` on the `<iframe>` element → set renderState to `'rendered'` (fires when HTML document loads, not necessarily when component mounts)
- `message` event on `window` where `event.data.type === 'render-error'` AND `event.source === iframeRef.current?.contentWindow` → set renderState to `'fallback'` immediately (JS runtime errors posted by the iframe's `window.onerror` bridge). The `event.source` guard prevents cross-frame messages from unrelated iframes or devtools from spuriously triggering the fallback.
- 5-second `setTimeout` stored in `renderTimeoutRef` → if renderState is still `'rendering'`, set to `'fallback'` (guard for silent hangs)
- **On component deselect:** clear `renderTimeoutRef.current` before starting the new component's render. This prevents a stale timeout from a previously-selected component from firing a spurious state update.
- Blob URLs are revoked via `URL.revokeObjectURL` when component is deselected or on unmount

**Layout** (reuses `.sb-*` classes):
```tsx
<div className="sb-explorer">
  <div className="sb-list">
    {/* grouped component buttons with status badges */}
    {/* sb-list-group-label for groups with 2+ items */}
    {/* sb-list-item + active class */}
  </div>
  <div className="sb-preview">
    <div className="sb-preview-toolbar">
      {/* ComponentName  ›  filename  [↗ GitHub link] */}
    </div>
    <div className="sb-preview-frame-wrap" style={{ padding: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Loading overlay while rendering */}
      {/* iframe OR code block depending on renderState */}
    </div>
    {/* Collapsible props table below frame */}
  </div>
</div>
```

**Status badge per sidebar item** (small icon after component name):
- `'pending'` → nothing
- `'rendering'` → spinner (reuse `.repo-detail-tab--loading::after` animation)
- `'rendered'` → green dot `●`
- `'fallback'` → `</>` text

**Props table** (below the preview frame, always shown):
A compact `<table>` with columns: Prop | Type | Required | Default. Derived from `ParsedComponent.props`. If `props` is empty, the table is not rendered.

**Code fallback** (when `renderState === 'fallback'`):
A `<pre><code>` block containing the raw component source. Uses the existing syntax highlighting approach from `ReadmeRenderer` (wrap in a fenced code block and pass through the markdown renderer pipeline), or a plain `<pre>` with monospace styling if that's impractical to reuse.

**The `↗` toolbar button** opens:
`https://github.com/{owner}/{name}/blob/{branch}/{path}`
via `window.api.openExternal`.

---

## 6. RepoDetail Integration

**In `src/views/RepoDetail.tsx`:**

Remove `StackBlitzExplorer` import, add `ComponentExplorer`:
```ts
import ComponentExplorer from '../components/ComponentExplorer'
```

Change the Components tab fallback branch (where `storybookState === null`):
```tsx
// Before:
<StackBlitzExplorer
  key={`${owner ?? ''}/${name ?? ''}`}
  owner={owner ?? ''}
  name={name ?? ''}
/>

// After:
<ComponentExplorer
  key={`${owner ?? ''}/${name ?? ''}`}
  owner={owner ?? ''}
  name={name ?? ''}
  branch={repo?.default_branch ?? 'main'}
/>
```

**Delete `src/components/StackBlitzExplorer.tsx`** — fully replaced.

No other changes to `RepoDetail`: `isComponentLibrary`, `visibleTabs`, the tab loading spinner, and the Storybook detection flow are all untouched.

---

## 7. Out of Scope

- Caching scan results
- Showing multiple variants/stories per component (single auto-generated render only)
- Prop controls UI (read-only prop table only, no interactive editing)
- CSS isolation beyond `blob:` URL sandboxing
- Recursive local import resolution (stubs only)
- Angular live rendering
