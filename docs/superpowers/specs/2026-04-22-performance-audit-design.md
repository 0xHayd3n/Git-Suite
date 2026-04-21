# Performance Audit & Remediation — Design Spec

**Date:** 2026-04-22
**Scope:** Application-wide performance remediation across the renderer (React rendering, CSS/paint), the Electron main process (IPC, SQLite, file I/O), and the bundle/startup path. No framework migrations, no schema changes.
**Approach:** Four phases, each a self-contained plan. Quick wins first (high-confidence / low-risk), then the Discover render overhaul, then bundle/startup splits, finally polish.

---

## 1. Audit findings — root causes

Four parallel audits (React rendering, CSS/paint, Electron main, bundle/startup) converged on these as the dominant sources of felt lag:

### 1.1 Context providers recreating values every render
Every consumer re-renders on every state change because provider values are constructed inline (e.g., `<Provider value={{ a, b, setA, setB }}>`). Confirmed in [src/contexts/RepoNav.tsx:86](../../src/contexts/RepoNav.tsx) and [src/contexts/Search.tsx:17](../../src/contexts/Search.tsx); likely the same pattern in [src/contexts/Toast.tsx](../../src/contexts/Toast.tsx).

### 1.2 `Discover.tsx` — mega-component with cascading effect chain
A ~1000-line component holds ~30 state variables, many wired into a single mega-useEffect around line 747 whose dep array includes `viewMode, selectedLanguages, selectedSubtypes, appliedFilters, discoverQuery, activeTags, repos, renderLimit`. Any change cascades to fetch → classify → color-extract → re-render of every card. The `visibleRepos = repos.slice(0, renderLimit)` slice is recomputed every render, not memoized.

### 1.3 No virtualization on any long list
Confirmed at [src/components/DiscoverGrid.tsx:165](../../src/components/DiscoverGrid.tsx), [src/components/LibraryGrid.tsx:24](../../src/components/LibraryGrid.tsx), [src/components/FileTreePanel.tsx:80](../../src/components/FileTreePanel.tsx), [src/components/DirectoryListing.tsx:107](../../src/components/DirectoryListing.tsx). With 100+ repos or a monorepo file tree, every card/node mounts at once. `RepoCard` embeds `DitherBackground`, which multiplies the cost.

### 1.4 `backdrop-filter: blur(20px)` on sticky/scrolling surfaces
Expensive on Windows/Electron. Confirmed at [src/components/DiscoverTopNav.css:27](../../src/components/DiscoverTopNav.css), [src/components/DiscoverSidebar.css:19](../../src/components/DiscoverSidebar.css), [src/components/ArticleLayout.css:28](../../src/components/ArticleLayout.css), [src/components/ArticleLayout.css:124](../../src/components/ArticleLayout.css) (nested blur inside a dither), [src/components/LibrarySidebar.css:158](../../src/components/LibrarySidebar.css). The existing comment in `ArticleLayout.css:19-22` already warns about this pattern.

### 1.5 `DiscoverRow` carousel animates `left` / `width` + triple-layer shadow
[src/components/DiscoverRow.css:71-87](../../src/components/DiscoverRow.css). `transition: left, width` forces layout per frame (non-GPU). Three stacked `box-shadow` layers (border + 16px glow + 32px glow) on absolutely-positioned animating cards forces expensive composites.

### 1.6 `DitherBackground` canvas loops run continuously on multiple instances
[src/hooks/useBayerDither.ts:339](../../src/hooks/useBayerDither.ts) runs a 15fps canvas `ImageData` loop per instance. Multiple instances alive simultaneously (hero + every visible `RepoCard`). Existing IntersectionObserver has a 350ms resume delay. Loop does not pause on tab-hidden.

### 1.7 Oversized IPC payloads
[electron/main.ts:1182](../../electron/main.ts) (`library:getAll`) returns full skill `content` for every saved repo — up to ~50KB × 50 skills = ~2.5MB serialized over IPC just to render a list.

### 1.8 No code splitting
[src/App.tsx:15-23](../../src/App.tsx) statically imports every route. [src/components/CodeViewer.tsx](../../src/components/CodeViewer.tsx) pre-loads all ~30 Shiki languages. [src/components/PdfViewer.tsx](../../src/components/PdfViewer.tsx) pulls `pdfjs-dist` (~150KB gzipped) into the main chunk. [src/components/ReadmeRenderer.tsx](../../src/components/ReadmeRenderer.tsx) with its rehype/remark pipeline is imported statically in RepoDetail.

### 1.9 Unbounded in-process caches
[electron/main.ts:468,714](../../electron/main.ts): `searchReposCache`, `treeCache`, `blobCache` grow without eviction. After a long session, memory pressure causes GC pauses.

### 1.10 SQLite PRAGMAs + indexes missing
[electron/db.ts:5](../../electron/db.ts) enables WAL but leaves `synchronous = FULL`, default 2MB cache, no mmap, no MEMORY temp store. Hot-path columns (`saved_at`, `starred_at`, `type_bucket`, `topic_cache.topic`) have no indexes.

### 1.11 Synchronous file I/O in IPC handlers
[electron/main.ts:1705-1752](../../electron/main.ts) uses `fs.readFileSync`, `fs.readdirSync`, `fs.writeFileSync` inside `ipcMain.handle` bodies — every call blocks the main process event loop.

---

## 2. Goals

**Perceived smoothness**
- Typing in Discover search does not visibly re-render repo cards between keystrokes
- Scrolling repo grids stays at 60fps on mid-range Windows hardware
- Switching to RepoDetail README tab does not re-parse markdown on each visit
- Library opens in well under 1 second

**Measurable**
- `library:getAll` IPC payload < 200KB for 100 skills (from ~5MB)
- Initial renderer bundle (main chunk, before route lazy-load) < 500KB gzipped
- Zero `backdrop-filter: blur(radius > 8px)` on any sticky or animating element
- Zero `fs.*Sync` calls in IPC handler bodies
- SQLite PRAGMAs set to the list in §3.1
- Every context provider value is `useMemo`-wrapped

---

## 3. Architecture decisions

### 3.1 SQLite PRAGMA baseline
Applied once at connection open in [electron/db.ts](../../electron/db.ts):

```
journal_mode = WAL            (already set)
synchronous  = NORMAL         (safe with WAL; much faster than FULL)
cache_size   = -64000         (64 MB)
mmap_size    = 268435456      (256 MB)
temp_store   = MEMORY
```

Plus these indexes:

```sql
CREATE INDEX IF NOT EXISTS repos_saved_at     ON repos(saved_at);
CREATE INDEX IF NOT EXISTS repos_starred_at   ON repos(starred_at);
CREATE INDEX IF NOT EXISTS repos_type_bucket  ON repos(type_bucket);
CREATE INDEX IF NOT EXISTS topic_cache_topic  ON topic_cache(topic);
CREATE INDEX IF NOT EXISTS search_cache_key   ON search_cache(cache_key);
```

### 3.2 LRU cache pattern for main.ts
Replace unbounded `Map` caches with a single reusable `LRUCache<K, V>` class (insert-on-get with max-size eviction). Applied to:

- `treeCache` — cap 100 (immutable by SHA)
- `blobCache` — cap 100 (immutable by SHA)
- `searchReposCache` — cap 20 (user queries)
- `branchCache` — cap 50 (keep existing TTL, add size cap)
- `badgeCache` / `ghimgCache` — cap 100, 1-hour TTL (new, in Phase 4)

Implementation lives in a new `electron/lruCache.ts` module.

### 3.3 Virtualization library: `react-window`
~7KB gzipped, well-maintained, works with variable-height items via `VariableSizeList`. Added to `dependencies`.

Applied to:
- `DiscoverGrid` — `FixedSizeGrid` with estimated card dimensions
- `LibraryGrid` — `FixedSizeGrid` or `FixedSizeList` depending on layout

**Not applied to `FileTreePanel`**: tree structure makes windowing awkward. Instead, make expand-on-demand the default (don't recursively render children of collapsed folders). A later follow-up may virtualize the *visible flat list* of the tree.

### 3.4 Code-splitting strategy

**Route-level** — every view behind `React.lazy`:
```ts
const Discover = lazy(() => import('./views/Discover'))
// ...etc for Library, Starred, Profile, RepoDetail, Onboarding, Settings, Create, LocalProjectDetail
```
Wrap `<Routes>` in `<Suspense fallback={<AppLoadingFallback />}>`.

**Heavy-component-level** — lazy inside their parent:
- `PdfViewer` — only inside `FileContentPanel` when a PDF is actually viewed
- `ReadmeRenderer` — only when README tab is active in `RepoDetail`
- `CodeViewer` — only when code file is viewed
- `AiChatOverlay`, `StorybookExplorer`, `ComponentExplorer` — lazy on mount-trigger

**Vendor chunks** in `electron.vite.config.ts`:
```ts
manualChunks: {
  'react-vendor': ['react', 'react-dom', 'react-router-dom'],
  'markdown':     ['react-markdown', 'remark-gfm', 'remark-emoji', 'rehype-raw', 'rehype-sanitize'],
  'pdfjs':        ['pdfjs-dist'],
  'icons':        ['lucide-react'],
}
```

### 3.5 Shiki: load languages on demand
Change [src/components/CodeViewer.tsx](../../src/components/CodeViewer.tsx) from pre-loading all 30 languages to:
```ts
const highlighter = await createHighlighter({ themes: ['github-dark'], langs: [] })
// then per file:
if (!highlighter.getLoadedLanguages().includes(lang)) {
  await highlighter.loadLanguage(lang)
}
```
Saves ~200-400KB from the initial shiki chunk.

### 3.6 `DitherBackground` visibility policy
Modify [src/hooks/useBayerDither.ts](../../src/hooks/useBayerDither.ts):
- Default to 10fps for non-hero instances (hero stays at 15fps)
- Listen to `document.visibilitychange`; halt the rAF loop when hidden
- When `IntersectionObserver` reports not-visible, halt immediately (no 350ms grace period)
- In `DiscoverRow`, only the active carousel card animates; siblings render a pre-rendered static dither frame

### 3.7 Context value memoization pattern
Every context provider emits a `useMemo`-wrapped value keyed on the actual state deps. Callbacks inside are `useCallback`. Applied to: `RepoNav`, `Search`, `Toast`, `SavedRepos`, `ProfileOverlay`, any others surfaced during audit.

### 3.8 `backdrop-filter` policy
- Allowed: truly-fixed overlays (modals, toasts), max `blur(8px)`, only when the element is not simultaneously animating opacity/transform/max-height
- Forbidden: sticky elements inside scroll containers, any element with an active transition, anything with `blur(radius > 8px)`
- Fallback for disallowed cases: solid semi-transparent background (`rgba(r, g, b, 0.85)`) — this is typically visually close enough

### 3.9 `library:getAll` payload split
Split one handler into two:
- `library:getAll` — returns lean list (id, owner, name, description, language, active, version, generated_at) — no `content`
- `skill:getContent` — returns `{ content }` for a single `(owner, name)` on demand

Renderer updates: wherever the list previously accessed `row.content`, fetch on-demand via the new handler.

### 3.10 Carousel animation: `transform` not `left/width`
[src/components/DiscoverRow.tsx](../../src/components/DiscoverRow.tsx) + [src/components/DiscoverRow.css](../../src/components/DiscoverRow.css):
- Inline styles change from `{ left: Xpx, width: Ypx }` to `{ transform: 'translateX(Xpx) scaleX(Y)' }` (or use a flex-basis approach, decision in plan)
- CSS `transition` narrows to `transform, opacity` only
- `box-shadow` collapses from 3 layers to 1 (`0 0 12px rgba(255,255,255,0.18)`)

---

## 4. Out of scope

- **DB schema changes** — indexes only, no column renames, no table restructure
- **Framework migrations** — no React → Solid, no Electron → Tauri, no Vite → anything
- **Full Shiki replacement** — keep Shiki, just load languages on demand
- **Full `react-icons` removal** — Phase 4 starts the lucide consolidation but does not force-remove `react-icons` from `package.json` in this pass
- **`globals.css` dead-rule deletion** — Phase 4 does a read-only audit; any deletions surface to the user for approval first
- **Web Worker offloading for markdown parsing** — may revisit if post-fix profiling shows it's still a hot path
- **Visual regression tests** — not adding a snapshot harness in this pass; relying on the user's own testing (per memory preference)
- **Any UI re-skinning** — purely mechanical perf work

---

## 5. Phased plan

| Phase | Scope | Est. effort | Plan file |
|-------|-------|-------------|-----------|
| 1 | Six quick wins: PRAGMAs, context memo, blur strip, carousel fix, library payload, startup defer | 1–2 hrs | [2026-04-22-perf-phase-1-quick-wins.md](../plans/2026-04-22-perf-phase-1-quick-wins.md) |
| 2 | Discover effect split + virtualization + LRU caches + async IPC I/O | 2–4 hrs | [2026-04-22-perf-phase-2-discover-rendering.md](../plans/2026-04-22-perf-phase-2-discover-rendering.md) |
| 3 | Route lazy-loading, Shiki on-demand, FileTree lazy children, Vite chunks, fonts, App mount | 3–5 hrs | [2026-04-22-perf-phase-3-bundle-startup.md](../plans/2026-04-22-perf-phase-3-bundle-startup.md) |
| 4 | Icons, protocol caches, color pool, N+1 fixes, translator parallelize, dither visibility, CSS audit | 2–3 hrs | [2026-04-22-perf-phase-4-polish.md](../plans/2026-04-22-perf-phase-4-polish.md) |

**Total:** ~8–14 hours across four sessions (plans include mid-plan checkpoints for clean stops).

## 6. Dependencies between phases

- **Phase 1 → 2.** Phase 2's virtualization benefits from Phase 1's stable context values (fewer re-renders to cascade).
- **Phase 3 is independent.** Route lazy-loading can ship before or after Phase 2.
- **Phase 4 is fully independent.** Any task can interleave with any other phase. Good material for spare cycles.
- **Ordering is a recommendation, not a hard constraint** — each plan is self-contained and references the current HEAD state.

---

## 7. Success criteria (for acceptance)

**Per-phase** (spelled out in each plan's Verification section)

**Overall, after all four phases:**
- All items from §2 (Goals) are met
- No regressions in existing test suite (`npm test`)
- User reports felt-smoothness improvement on the common flows (Discover typing, repo grid scroll, RepoDetail tab switch, Library open, cold start)
- Bundle analyzer shows main chunk < 500KB gzipped
- Memory profiling shows no unbounded growth over a 30-minute session of heavy repo browsing

---

## 8. Risks & mitigations

**Risk: virtualization breaks existing scroll behavior / keyboard nav / URL-hash scrolling.**
Mitigation: Phase 2 plan includes explicit verification steps for each (keyboard arrows across cards, hash-deep-link scrolling, sticky filter interactions).

**Risk: `React.lazy` introduces flash-of-loading on every route.**
Mitigation: lightweight `<AppLoadingFallback />` that matches app shell. Optionally preload likely-next route on hover.

**Risk: Shiki on-demand language loading introduces flicker when first viewing a new language.**
Mitigation: Render raw `<pre>` until highlighter resolves, then swap. Acceptable — flicker is brief and only on first encounter of a language.

**Risk: `backdrop-filter` removal changes look.**
Mitigation: Replacement uses `rgba` solids tuned to match the previous visual. Final visual parity confirmed by user in their own testing.

**Risk: Non-obvious consumer of `library:getAll[].content`.**
Mitigation: Phase 1 plan includes grep step to find every access to `.content` on the list return before changing the handler shape.

---

## 9. Verification strategy

Each plan file ends with a **Verification** section covering:
- Unit / integration tests to run (`npm test`, existing suites)
- Manual checks the user performs (described concretely — "scroll discover with 200 stars loaded")
- Evidence commands (e.g., `wc -c` on payload, `bundle-analyzer` output) to quote in the summary

No new visual regression harness — per user preference, user handles UI testing.
