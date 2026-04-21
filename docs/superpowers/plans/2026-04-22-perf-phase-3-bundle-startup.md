# Performance Phase 3 — Bundle & Startup Implementation Plan

> **For agentic workers:** Use [superpowers:executing-plans](../../) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. User preference: commit directly to `main`, no worktrees. No dev-server / visual verification — user tests UI changes themselves.

**Goal:** Shrink the initial renderer bundle by lazy-loading routes and heavy components, load Shiki languages on demand instead of pre-loading all 30, lazy-expand the file tree for large repos, configure Vite vendor chunks, trim font weights, and stop blocking first paint on the onboarding-check IPC.

**Architecture:** Seven tasks. Task 1 captures the baseline bundle size (evidence for the final claim). Tasks 2-5 are the actual splits. Tasks 6-7 are small startup wins. Two mid-plan checkpoints — after Task 3 and Task 5 — for clean session stops.

**Tech Stack:** TypeScript, React 18, Vite, electron-vite, Shiki, pdfjs-dist

**Spec:** [../specs/2026-04-22-performance-audit-design.md](../specs/2026-04-22-performance-audit-design.md)

**Note re: spec recommendation (advisory from reviewer):** `AiChatOverlay`, `StorybookExplorer`, `ComponentExplorer` are included in lazy-loading scope because they fit the "heavy-component-level" pattern in §3.4 — even though they weren't cited by filename in audit finding 1.8, they follow the same shape (lazy-mounted overlays/explorers). Their inclusion is intentional.

---

## Task 1: Capture baseline bundle size

**Files:** none (read-only + report)

**Why:** §2's success criterion "main chunk < 500KB gzipped" needs a starting number so we can quote a delta. Do this before any other Phase 3 task.

- [ ] **Step 1: Run a production build**

Run: `npm run build`
Expected: produces `out/renderer/**` with minified assets.

If the build succeeds, note any warnings about large chunks that Vite emits — quote them in the final summary.

- [ ] **Step 2: Measure the output**

From the repo root:

```bash
ls -la out/renderer/assets/ | awk '{print $5, $9}' | sort -rn | head -20
```

Expected: a list of bundle files with sizes. Look for entries like `index-*.js` (main chunk) and record:
- Main chunk size (raw, in bytes)
- Main chunk size (gzipped — if the build doesn't emit .gz, run: `gzip -c out/renderer/assets/index-*.js | wc -c`)
- Top 5 other chunks

- [ ] **Step 3: Record the baseline in a scratch note**

This is NOT for commit. Save the baseline to a scratch file or just into your session notes. It'll be quoted in Phase 3's completion summary. Baselines to capture:
- Main chunk raw bytes
- Main chunk gzipped bytes
- Total `out/renderer/` size (sum of all chunks)

No commit for this task. Task 2 begins after.

---

## Task 2: Lazy-load all routes in App.tsx

**Files:**
- Modify: [src/App.tsx](../../src/App.tsx)
- Create: [src/components/AppLoadingFallback.tsx](../../src/components/AppLoadingFallback.tsx) (new, ~20 lines)

**Spec reference:** §3.4

**Why:** All nine route components (Discover, Library, Starred, Profile, RepoDetail, Onboarding, Settings, Create, LocalProjectDetail) are statically imported at the top of App.tsx. Their code + transitive deps ship in the main chunk even for users who never visit them.

- [ ] **Step 1: Create minimal loading fallback**

Create [src/components/AppLoadingFallback.tsx](../../src/components/AppLoadingFallback.tsx):

```tsx
export default function AppLoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      width: '100%',
      opacity: 0.4,
      fontSize: 13,
      color: 'var(--t2)',
    }}>
      Loading…
    </div>
  )
}
```

Kept simple on purpose — a heavier skeleton defeats the point (adding more to the main chunk). If the text-flash is visually objectionable, the user can swap this for a more polished fallback later.

- [ ] **Step 2: Convert routes to `React.lazy`**

In [src/App.tsx](../../src/App.tsx), replace lines 15-23:

```tsx
// OLD
import Discover from './views/Discover'
import Library from './views/Library'
import Starred from './views/Starred'
import Profile from './views/Profile'
import RepoDetail from './views/RepoDetail'
import Onboarding from './views/Onboarding'
import Settings from './views/Settings'
import Create from './views/Create'
import LocalProjectDetail from './views/LocalProjectDetail'

// NEW
import { lazy, Suspense } from 'react'
import AppLoadingFallback from './components/AppLoadingFallback'

const Discover = lazy(() => import('./views/Discover'))
const Library = lazy(() => import('./views/Library'))
const Starred = lazy(() => import('./views/Starred'))
const Profile = lazy(() => import('./views/Profile'))
const RepoDetail = lazy(() => import('./views/RepoDetail'))
const Onboarding = lazy(() => import('./views/Onboarding'))
const Settings = lazy(() => import('./views/Settings'))
const Create = lazy(() => import('./views/Create'))
const LocalProjectDetail = lazy(() => import('./views/LocalProjectDetail'))
```

Update the existing `import { useState, useEffect, useCallback } from 'react'` line to also include `lazy, Suspense` — or add a second import — whichever is cleaner.

- [ ] **Step 3: Wrap `<Routes>` in `<Suspense>`**

In [src/App.tsx:64-77](../../src/App.tsx), wrap the `<Routes>` block:

```tsx
<main className={`main-content${aiOpen ? ' ai-dialogue-tilt' : ''}`}>
  <Suspense fallback={<AppLoadingFallback />}>
    <Routes>
      <Route path="/" element={<Navigate to="/library" replace />} />
      {/* ...rest of routes unchanged... */}
    </Routes>
  </Suspense>
  <ProfileOverlayPortal />
</main>
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Pass. Test files: [src/App.test.tsx](../../src/App.test.tsx) — verify that the routing tests still work. If they fail because of Suspense timing, add `await waitFor(...)` inside the test assertions; test harness already supports this pattern in the codebase.

- [ ] **Step 5: User smoke test**

Prompt: "Routes now lazy-load. Please verify: first launch shows the Library/Discover loading briefly then renders, navigating between routes works, no blank flashes that feel broken."

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/AppLoadingFallback.tsx
git commit -m "perf(bundle): lazy-load all route views via React.lazy

All 9 route components now code-split. Initial main chunk no longer carries
RepoDetail, Create, Onboarding, Settings, etc. — they load on navigation.
Suspense fallback is a lightweight Loading text placeholder."
```

---

## Task 3: Lazy-load heavy components inside their parents

**Files:**
- Modify: [src/views/RepoDetail.tsx](../../src/views/RepoDetail.tsx) (ReadmeRenderer, CodeViewer, StorybookExplorer, ComponentExplorer)
- Modify: [src/components/FileContentPanel.tsx](../../src/components/FileContentPanel.tsx) or wherever PdfViewer is consumed (PdfViewer)
- Modify: [src/App.tsx](../../src/App.tsx) (AiDialogue — currently rendered at App root)

**Spec reference:** §3.4

**Scope note (advisory from reviewer):** AiChatOverlay, StorybookExplorer, ComponentExplorer are included here intentionally. Each is:
- Only rendered conditionally (overlay open, tab active)
- Significantly-sized (each imports non-trivial deps)
- Unused by a large fraction of users

- [ ] **Step 1: Lazy-load ReadmeRenderer in RepoDetail**

Find the import of `ReadmeRenderer` in [src/views/RepoDetail.tsx](../../src/views/RepoDetail.tsx). Replace:

```tsx
// OLD
import ReadmeRenderer from '../components/ReadmeRenderer'

// NEW
import { lazy, Suspense } from 'react'  // if not already imported
const ReadmeRenderer = lazy(() => import('../components/ReadmeRenderer'))
```

At the rendering site, wrap with Suspense. Keep fallback tiny to avoid layout shift:

```tsx
{activeTab === 'readme' && (
  <Suspense fallback={<div className="readme-loading" style={{ minHeight: 200 }} />}>
    <ReadmeRenderer readme={...} cleanedReadme={...} repo={...} />
  </Suspense>
)}
```

Only render `<ReadmeRenderer>` when the readme tab is active — don't render it pre-mounted-but-hidden. This is the actual win.

- [ ] **Step 2: Lazy-load CodeViewer**

Same pattern. Find `import CodeViewer from ...` and convert. Wrap in Suspense where consumed.

- [ ] **Step 3: Lazy-load StorybookExplorer and ComponentExplorer**

Same pattern in their respective consumers.

- [ ] **Step 4: Lazy-load PdfViewer**

[src/components/PdfViewer.tsx](../../src/components/PdfViewer.tsx) at line 2 statically imports `pdfjs-dist` and at lines 7-10 configures the worker URL at module-eval time. These happen whenever PdfViewer.tsx is imported — which is why it must be lazy-imported at the consumer.

Find where PdfViewer is rendered (likely inside `FileContentPanel.tsx` or `FilesTab.tsx`). Change its import to lazy:

```tsx
const PdfViewer = lazy(() => import('./PdfViewer'))

// usage:
{isPdf && (
  <Suspense fallback={<div style={{ minHeight: 300 }}>Loading PDF viewer…</div>}>
    <PdfViewer owner={...} name={...} branch={...} path={...} />
  </Suspense>
)}
```

Now the full `pdfjs-dist` library (700KB uncompressed, ~150KB gzipped) only loads when a PDF is opened.

- [ ] **Step 5: Lazy-load AiDialogue**

[src/App.tsx:14, 82](../../src/App.tsx) imports and renders `AiDialogue`. It's always mounted, controlled by `open`. Convert to lazy + conditional render:

```tsx
// OLD
import AiDialogue from './components/AiDialogue'
// ... <AiDialogue open={aiOpen} onClose={closeAi} />

// NEW
const AiDialogue = lazy(() => import('./components/AiDialogue'))
// ...
{aiOpen && (
  <Suspense fallback={null}>
    <AiDialogue open={aiOpen} onClose={closeAi} />
  </Suspense>
)}
```

`fallback={null}` is correct here — the AI dialogue is user-triggered, a brief empty frame is fine.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: Pass. Tests that render these components (if any) may need `waitFor` wrapping.

- [ ] **Step 7: Commit**

```bash
git add src/views/RepoDetail.tsx src/components/FileContentPanel.tsx src/App.tsx
# plus any other files touched
git commit -m "perf(bundle): lazy-load heavy components inside their parents

ReadmeRenderer, CodeViewer, StorybookExplorer, ComponentExplorer, PdfViewer,
AiDialogue now code-split from their consumers. Initial bundle no longer
carries pdfjs, shiki, rehype pipeline, etc. unless actually invoked."
```

---

## ⏸️ Checkpoint 1 — commit-and-stop-here point

If you stop here, routes and heavy components are lazy-loaded. Next session resumes at Task 4.

---

## Task 4: Shiki — load languages on demand

**File:** [src/components/CodeViewer.tsx](../../src/components/CodeViewer.tsx)

**Spec reference:** §3.5

**Why:** Current implementation (line 11-16) pre-loads all 30 languages on first `getHighlighter()` call. Each language grammar is 5-20KB gzipped → ~200-400KB of grammars in the Shiki chunk. Most users never view Haskell, Elixir, Zig, etc.

- [ ] **Step 1: Change initial `createHighlighter` to empty `langs`**

In [src/components/CodeViewer.tsx:6-21](../../src/components/CodeViewer.tsx):

```ts
// OLD
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark'],
        langs: [
          'javascript', 'typescript', 'jsx', 'tsx', 'json', 'yaml', 'css', 'html',
          'python', 'ruby', 'go', 'rust', 'bash', 'toml', 'xml', 'sql', 'graphql',
          'markdown', 'diff', 'dockerfile', 'c', 'cpp', 'java', 'swift', 'kotlin',
          'php', 'lua', 'zig', 'elixir', 'haskell', 'shell',
        ],
      })
    )
  }
  return highlighterPromise
}

// NEW
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark'],
        langs: [],  // load on demand
      })
    )
  }
  return highlighterPromise
}
```

- [ ] **Step 2: Load language per file view**

At lines 68-92 (the effect that highlights code), add a `loadLanguage` call before `codeToHtml`:

```ts
useEffect(() => {
  let cancelled = false

  if (lang === 'text') {
    setHtml(null)
    return
  }

  getHighlighter().then(async highlighter => {
    if (cancelled) return
    try {
      if (!highlighter.getLoadedLanguages().includes(lang)) {
        await highlighter.loadLanguage(lang as any)
      }
      if (cancelled) return
      const result = highlighter.codeToHtml(content, {
        lang,
        theme: 'github-dark',
      })
      setHtml(result)
    } catch {
      setHtml(null)
    }
  })

  return () => { cancelled = true }
}, [content, lang])
```

Note: Shiki's `loadLanguage` accepts either a string or a dynamic import. Strings are the simpler API — Shiki internally does a dynamic import keyed on the string. Vite's Shiki plugin (if configured) handles the code-splitting; without it, verify the built output actually code-splits by language. (If it doesn't, the worst case is a one-time bundling of all languages — same as before, no regression.)

Before committing, verify the type signature of `loadLanguage` in the installed Shiki version (`@4.0.2`). If `BuiltinLanguage` is a strict union, prefer passing the string literal without `as any` (e.g., `loadLanguage(lang as BuiltinLanguage)`) so a later Shiki bump can catch removed languages.

- [ ] **Step 3: Handle unsupported languages gracefully**

The catch in the effect already falls back to plain text if `codeToHtml` throws. `loadLanguage` may also throw for unsupported IDs — the catch covers that too.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Pass. Test files: [src/components/CodeToolbar.test.tsx](../../src/components/CodeToolbar.test.tsx). CodeViewer itself doesn't appear to have tests — the highlight is async and hard to assert.

- [ ] **Step 5: User smoke test**

Prompt: "Shiki now loads languages on demand. Please browse a few files of different languages (TS, Python, Rust, etc.) and verify: syntax highlighting appears (may flash plain text briefly on first view of each language), no console errors."

- [ ] **Step 6: Commit**

```bash
git add src/components/CodeViewer.tsx
git commit -m "perf(bundle): load Shiki languages on demand instead of pre-loading all 30

Was: createHighlighter({ langs: [... 30 langs ...] }) at first invocation.
Now: createHighlighter({ langs: [] }), loadLanguage(lang) per file.
Users now pay only for languages they actually view."
```

---

## Task 5: FileTreePanel — lazy-expand children

**File:** [src/components/FileTreePanel.tsx](../../src/components/FileTreePanel.tsx)

**Spec reference:** §3.3 (the non-react-window branch)

**Why:** The tree currently recursively renders children of every folder, even collapsed ones. For a monorepo with 2000 files, this mounts thousands of tree nodes at once.

- [ ] **Step 1: Identify the recursive render call**

Around line 80 of [src/components/FileTreePanel.tsx](../../src/components/FileTreePanel.tsx), locate the `filtered.map(...)` and the recursive `<FileTreePanel>` call inside each tree entry. The recursive call should only happen when that entry is expanded.

- [ ] **Step 2: Gate recursion on `expanded`**

Modify the render so children are rendered only when the parent node is in the expanded-set:

```tsx
{entry.type === 'dir' && expandedSet.has(entry.path) && (
  <FileTreePanel
    entries={entry.children}
    /* ...rest of recursive props... */
  />
)}
```

If the existing code already conditions on `expanded` at the CSS level (e.g., `max-height: 0` on collapsed), that's a layout hack — the DOM nodes still exist and still cost render time. The fix is to not render them at all until expanded.

Important: if the collapse animation relies on having the DOM present for a height transition, removing the DOM on collapse will break the animation. Two options:
- Accept instant collapse (simpler, arguably better UX)
- Use a CSS approach: render but keep `expandedOnce` flag that lets you do the first expansion animation properly

Simplest path: instant collapse. Commit to it unless user reports the animation loss.

- [ ] **Step 3: Test with a large repo**

Prompt user: "FileTreePanel now renders children only when their parent is expanded. Please open a large monorepo (e.g., a repo with 500+ files) and: (1) expand a large folder — should be fast, (2) collapse it — should be instant (no animation on collapse now), (3) re-expand — should work."

- [ ] **Step 4: Run tests**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add src/components/FileTreePanel.tsx
git commit -m "perf(files): lazy-expand FileTreePanel children

Was recursively rendering children of every folder at mount — thousands of
tree nodes in a monorepo. Now only renders when parent is expanded.
Collapse is now instant (no transition); re-expand works as before."
```

---

## ⏸️ Checkpoint 2 — commit-and-stop-here point

Tasks 6-7 are small; either stop here or continue.

---

## Task 6: Vite `manualChunks` for vendor splits

**File:** [electron.vite.config.ts](../../electron.vite.config.ts)

**Spec reference:** §3.4

**Why:** With lazy routes + lazy components, the remaining cost is vendor code that's imported by multiple modules and currently ends up inlined per chunk. `manualChunks` forces libs that rarely change into their own cacheable files.

- [ ] **Step 1: Add `manualChunks` to renderer build**

In [electron.vite.config.ts](../../electron.vite.config.ts), extend the renderer section's `rollupOptions`:

```ts
renderer: {
  root: 'src',
  build: {
    rollupOptions: {
      input: resolve('src/index.html'),
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'markdown':     ['react-markdown', 'remark-gfm', 'remark-emoji', 'rehype-raw', 'rehype-sanitize'],
          'pdfjs':        ['pdfjs-dist'],
          'icons':        ['lucide-react'],
          // Note: react-icons is intentionally not chunked — we want to migrate off it in Phase 4
        },
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [react()]
  }
}
```

- [ ] **Step 2: Run a build**

Run: `npm run build`
Expected: output now contains `react-vendor-*.js`, `markdown-*.js`, `pdfjs-*.js`, `icons-*.js` chunks separate from the main bundle.

- [ ] **Step 3: Verify main chunk is smaller**

Compare main chunk size against Task 1's baseline. Quote the delta.

- [ ] **Step 4: User smoke test**

Prompt: "Vendor chunks split. Please verify the app launches and all pages load — especially markdown rendering (README tab) and PDF viewing, since those are now in separate chunks."

- [ ] **Step 5: Commit**

```bash
git add electron.vite.config.ts
git commit -m "perf(bundle): add manualChunks for react/markdown/pdfjs/icons vendor splits

Forces stable libs into their own cacheable chunks.
react-vendor, markdown, pdfjs, icons each split out.
react-icons intentionally NOT split (migrating off it in Phase 4)."
```

---

## Task 7: Font audit + `font-display: swap` + App.tsx optimistic render

Two small independent changes, one commit.

**Files:**
- Modify: [src/main.tsx:3-8](../../src/main.tsx)
- Modify: [src/App.tsx:35, 44-55](../../src/App.tsx)
- Possibly: [src/styles/globals.css](../../src/styles/globals.css) (if fonts are re-declared there)

### 7a. Font weight audit

- [ ] **Step 1: Find actual font-weight usage**

Run Grep: pattern `font-weight:\s*(400|500|600|700)` in `src/**/*.{css,tsx}`.

Expected output: a count of each weight. Keep the imports of weights that are actually used; drop the rest.

The currently imported weights (main.tsx:3-8):
- Inter: 400, 500, 600
- JetBrains Mono: 400, 500, 700

If grep shows any are completely unused, remove them.

- [ ] **Step 2: Add `font-display: swap`**

`@fontsource/*` CSS files don't emit `font-display: swap` by default in older versions — but can via the versioned import path. Check if an import like `@fontsource/inter/400.css` can be swapped for `@fontsource-variable/inter` (variable font, single file, always `font-display: swap`).

Alternative, if @fontsource doesn't expose swap directly: override via a small CSS rule in globals.css:

```css
@font-face {
  font-family: 'Inter';
  font-display: swap;
}
@font-face {
  font-family: 'JetBrains Mono';
  font-display: swap;
}
```

These rules won't "create" fonts — they augment the existing `@font-face` from @fontsource. If the browser already parsed a `font-display: auto`, CSS cascade may not override it. In that case, prefer the variable-font path.

Simplest approach: try the variable-font import first; fall back to CSS override if the variable font isn't available for your installed `@fontsource/*` version.

- [ ] **Step 3: Run tests**

Run: `npm test`

### 7b. App.tsx optimistic first render

**Why:** Currently [src/App.tsx:43-55](../../src/App.tsx) blocks on `window.api.settings.get('onboarding_complete')` IPC before rendering anything (`if (isChecking) return null` at line 57). Optimistically render assuming onboarding is complete; navigate to onboarding only if the check says otherwise.

- [ ] **Step 4: Remove the `isChecking` gate**

Replace the effect at lines 43-55 and the gate at 57:

```tsx
// OLD
const [isChecking, setIsChecking] = useState(true)

useEffect(() => {
  window.api.settings.get('onboarding_complete').then((val) => {
    if (val !== '1') {
      navigate('/onboarding')
    } else {
      window.api.github.getStarred().catch(() => {})
    }
    setIsChecking(false)
  }).catch(() => {
    navigate('/onboarding')
    setIsChecking(false)
  })
}, [navigate])

if (isChecking) return null

// NEW
useEffect(() => {
  window.api.settings.get('onboarding_complete').then((val) => {
    if (val !== '1') {
      navigate('/onboarding')
    } else {
      window.api.github.getStarred().catch(() => {})
    }
  }).catch(() => {
    navigate('/onboarding')
  })
}, [navigate])
```

Three things to remove together (TypeScript compile will catch if any are missed):
1. The `const [isChecking, setIsChecking] = useState(true)` declaration on line 35
2. Both `setIsChecking(false)` calls inside the effect body
3. The `if (isChecking) return null` gate on line 57

The app now renders Discover/Library immediately. If onboarding is incomplete, `navigate('/onboarding')` replaces the current location after the IPC resolves — brief flash of Library → Onboarding. Acceptable: the only users who experience this are first-time launchers, and the flash is < 50ms on typical hardware.

If the flash is noticeable to the user in testing, revert to the gated version — cost of losing ~50ms of first-paint is modest compared to breaking first-run UX.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: Pass. [src/App.test.tsx](../../src/App.test.tsx) may have assertions around the isChecking state — update as needed.

- [ ] **Step 6: User smoke test**

Prompt: "App now renders optimistically without waiting for onboarding IPC. Please verify: (1) already-onboarded users see the app immediately with no blank frame; (2) fresh install / reset onboarding still redirects to onboarding correctly (this may flash Library/Discover briefly before redirecting — acceptable if brief)."

- [ ] **Step 7: Single commit for 7a + 7b**

```bash
git add src/main.tsx src/App.tsx src/styles/globals.css
git commit -m "perf(startup): font-display swap + optimistic first render

- @fontsource imports augmented with font-display: swap (avoids FOIT).
- App.tsx no longer blocks first paint on onboarding IPC round-trip.
  App renders immediately; redirects to onboarding afterwards if needed."
```

---

## Verification — end of Phase 3

- [ ] **All tests pass:** `npm test`
- [ ] **Production build succeeds:** `npm run build`
- [ ] **Main chunk size comparison:** record before (Task 1) vs after, target < 500KB gzipped
- [ ] **Sizes of the new chunks** logged in the completion summary
- [ ] **User smoke-tested**: each of the split paths (route nav, PDF open, README render, code highlighting of a few languages, large monorepo file tree)

## Completion summary to report back

- Commits landed (list short titles)
- Baseline vs final main chunk size (gzipped)
- Tasks skipped or modified (with reason)
- Any unexpected chunks Vite emitted
- Specific language that failed Shiki loadLanguage (if any) — so Phase 4 can add it to a static fallback list
