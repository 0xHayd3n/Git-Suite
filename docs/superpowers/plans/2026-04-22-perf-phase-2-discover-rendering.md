# Performance Phase 2 — Discover Rendering & Main-Process Hygiene Implementation Plan

> **For agentic workers:** Use [superpowers:executing-plans](../../) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. User preference: commit directly to `main`, no worktrees. No dev-server / visual verification — user tests UI changes themselves.

**Goal:** Attack the primary re-render bottleneck (the Discover view's mega-effect + unstable callbacks that defeat `React.memo` on `RepoCard`), add IntersectionObserver-based viewport windowing to the repo grids, bound the unbounded caches in the Electron main process, and switch synchronous file I/O in IPC handlers to async.

**Architecture:** Five tasks. Tasks 1-2 are renderer work (the felt-lag fix). Task 3 adds windowing. Tasks 4-5 are main-process hygiene. Mid-plan checkpoint after Task 2 — if you stop there, the work still ships cleanly (the biggest renderer wins are done) and the remaining tasks can go in a later session.

**Tech Stack:** TypeScript, React 18, Electron, better-sqlite3

**Spec:** [../specs/2026-04-22-performance-audit-design.md](../specs/2026-04-22-performance-audit-design.md)

**Prerequisite:** Phase 1 should be complete (stable context values make Phase 2 verification cleaner). Not a hard gate — tasks will still work without it.

---

## Task 1: Split the Discover mega-effect

**File:** [src/views/Discover.tsx](../../src/views/Discover.tsx)

**Spec reference:** §1.2

**Why:** A single `useEffect` (and its companion `loadMore` useCallback, line 747) lists ~15 state variables in its dep array. Any change to any one triggers the whole effect chain. Splitting into logical, narrowly-scoped effects reduces cascade frequency dramatically.

**Context:** This task is surgical — do not refactor behavior, only split by concern. If the executor uncovers actual bugs while reading, flag to the user rather than fixing inline.

- [ ] **Step 1: Read the whole Discover.tsx top-to-bottom**

This component is ~1000 lines and carries ~30 state vars. Before touching anything, read it end-to-end and map each useEffect to its concern. Expected concerns (name them in your head):
1. Initial fetch of repos on mount / mode change
2. Search-query-triggered fetch
3. Tag-triggered fetch
4. Filter-triggered fetch
5. Scroll-restore effect
6. Color extraction kickoff
7. Suggestion dropdown positioning
8. Keyboard listeners

Write a short text note (not a code comment) listing each effect's current dep array and its concern. This is your working map for Steps 2-5.

- [ ] **Step 2: Identify `loadMore`'s unstable deps**

Around line 747, `loadMore` has `useCallback` deps: `[renderLimit, allVisible.length, loadingMore, loading, hasMore, page, searchPath, viewMode, selectedLanguages, appliedFilters, discoverQuery, activeTags, repos, selectedSubtypes, extractMissingColors]`.

Many of these don't need to be in the callback body — they're captured for the fetch URL construction. The fix pattern: move ephemeral "current state snapshot" access into a `liveSnapshotRef` (the component already uses `liveSnapshotRef` elsewhere — see line 753). Replace deps with the ref read inside the body.

Target dep array after refactor: `[extractMissingColors]` only (everything else read via ref). The function becomes truly stable.

Keep a separate effect (with `useEffect` + narrow deps) responsible for *triggering* `loadMore()` when the scroll sentinel fires.

- [ ] **Step 3: Memoize `visibleRepos` and similar computed arrays**

Find every `.filter(...)`, `.map(...)`, `.slice(...)` chain that computes on every render. The most important one is the `repos.slice(0, renderLimit)` pattern (or similar — find the actual pattern; naming may differ).

Wrap in `useMemo`:

```tsx
const visibleRepos = useMemo(
  () => repos.slice(0, renderLimit),
  [repos, renderLimit],
)
```

Look for similar patterns: a sorted/filtered view of repos, a tag list derived from repos, etc. Memoize each.

- [ ] **Step 4: Stabilize callbacks passed to `DiscoverGrid`**

From grep: line 1022-1029 passes `navigateToRepo`, `addTag`, `openProfile`, `handleStar`, `handleLanguageClick`, `handleSelectSubtype` to `DiscoverGrid`. `RepoCard` is `memo()`-wrapped (line 138 of RepoCard.tsx), so the memo is only effective if these callbacks are reference-stable.

For each of the six: locate its definition in Discover.tsx. If it's currently defined as a plain function or arrow function expression (captures scope by value every render), wrap in `useCallback` with narrow deps (prefer `liveSnapshotRef` reads to widen deps).

`navigateToRepo` and `addTag` are already `useCallback` (lines 752, 761). Verify and fix the other four.

- [ ] **Step 5: Split the mega-useEffect (if there is one separate from loadMore)**

If Discover contains a large useEffect beyond `loadMore` that does multiple unrelated things, split it by concern. Each resulting effect has ≤ 3 deps. If an effect needs to coordinate (e.g., "refetch when query OR tags change"), that's fine — one effect, two deps. Do not merge unrelated concerns just to reduce file size.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: Pass. Key test files: any `Discover.test.tsx` (check if exists).

- [ ] **Step 7: User tests interactively**

Prompt: "Discover effect chain refactored. Please verify: typing in search works, tags add/remove work, filter changes work, infinite scroll still loads more, scroll position restores when you navigate back."

Only proceed to commit after user confirms.

- [ ] **Step 8: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "perf(discover): split mega-effect chain, memoize visible repos, stabilize callbacks

loadMore now has stable deps (reads via liveSnapshotRef).
visibleRepos memoized (was recomputed every render).
All callbacks passed to DiscoverGrid/RepoCard are useCallback-wrapped,
letting RepoCard's React.memo actually cache renders between keystrokes."
```

---

## Task 2: Stabilize callbacks in other hot paths + add missing memoizations

**Files:**
- Modify: [src/components/DirectoryListing.tsx:49-70, 106-113](../../src/components/DirectoryListing.tsx) — memoize sort + filter
- Modify: [src/components/DiscoverSuggestions.tsx:40-73](../../src/components/DiscoverSuggestions.tsx) — cache DOM query
- Modify: [src/components/RepoCard.tsx:79-81](../../src/components/RepoCard.tsx) — memoize emoji parse
- Modify: [src/components/ReadmeRenderer.tsx](../../src/components/ReadmeRenderer.tsx) — wrap in `React.memo`
- Modify: [src/components/CodeViewer.tsx:56-92](../../src/components/CodeViewer.tsx) — memoize line split
- Modify: [src/hooks/useVerification.ts:58-63](../../src/hooks/useVerification.ts) — stabilize returned object

**Spec reference:** §3.7 generalized; audit findings 7, 9, 11, 18, 19

- [ ] **Step 1: `DirectoryListing` — memoize sorted/filtered arrays**

In [src/components/DirectoryListing.tsx](../../src/components/DirectoryListing.tsx), around line 107 there's a `sortEntries(entries, sortField, sortDirection)` call followed by a filter on `filterText`. Both run every render.

Wrap with `useMemo`:

```tsx
const sorted = useMemo(
  () => sortEntries(entries, sortField, sortDirection),
  [entries, sortField, sortDirection],
)
const filtered = useMemo(
  () => filterText ? sorted.filter(e => e.name.toLowerCase().includes(filterText.toLowerCase())) : sorted,
  [sorted, filterText],
)
```

Adjust names to match the actual code.

- [ ] **Step 2: `DiscoverSuggestions` — cache the DOM query**

In [src/components/DiscoverSuggestions.tsx](../../src/components/DiscoverSuggestions.tsx), lines 40-73 call `document.querySelector('.dock-search-floating.open')` on every render. Move to a `useRef` that's populated in a `useEffect` (or passed as a prop from the parent which already has access to the anchor element).

Simplest fix: accept a ref from the parent. If that's too invasive, read once in a `useLayoutEffect` and store in a ref:

```tsx
const anchorRef = useRef<Element | null>(null)
useLayoutEffect(() => {
  anchorRef.current = document.querySelector('.dock-search-floating.open')
})
// Read anchorRef.current where previously querySelector was called
```

Verify the dropdown still positions correctly after the change.

- [ ] **Step 3: `RepoCard` — memoize `parseEmoji`**

In [src/components/RepoCard.tsx:79-81](../../src/components/RepoCard.tsx), the `parseEmoji` helper is called on `repo.description` on every render. Since `repo.description` rarely changes, memoize:

```tsx
const parsedDescription = useMemo(
  () => parseEmoji(repo.description ?? ''),
  [repo.description],
)
```

Replace inline calls to `parseEmoji(repo.description)` with the memoized value.

- [ ] **Step 4: `ReadmeRenderer` — wrap in `React.memo`**

In [src/components/ReadmeRenderer.tsx](../../src/components/ReadmeRenderer.tsx), at the bottom / default export, wrap the component in `memo`:

```tsx
import { memo } from 'react'
// ... existing component ...

export default memo(ReadmeRenderer)
```

With a custom comparator if needed:

```tsx
export default memo(ReadmeRenderer, (prev, next) =>
  prev.readme === next.readme && prev.cleanedReadme === next.cleanedReadme && prev.repo === next.repo
)
```

If the component has non-stable function/object props, this memo won't help. Check the callsites in RepoDetail.tsx and LocalProjectDetail.tsx — fix any inline-object props first.

- [ ] **Step 5: `CodeViewer` — memoize `lines`**

In [src/components/CodeViewer.tsx:56-92](../../src/components/CodeViewer.tsx), the content is split into lines and the line count computed every render. Memoize:

```tsx
const lines = useMemo(() => content.split('\n'), [content])
const lineCount = lines.length
```

Then the `lines.map(...)` on line 97 runs only when `content` changes.

- [ ] **Step 6: `useVerification` — stabilize returned object**

In [src/hooks/useVerification.ts:58-63](../../src/hooks/useVerification.ts), the hook returns an object. If the object's identity changes when only internal `cache` state updates, all consumers re-render.

Wrap the returned API in `useMemo`:

```ts
return useMemo(() => ({
  getTier,
  getSignals,
  isResolving,
  seedFromDb,
}), [getTier, getSignals, isResolving, seedFromDb])
```

Ensure each of the four is `useCallback`-stable. If any currently closes over `cache` directly, refactor to read via `cacheRef.current` instead, so the callback identity doesn't change when cache updates.

This is the subtle one: consumers are `RepoCard`s which call `verification.getTier(repo.id)` on every render. If `verification` changes identity when cache updates (which happens as verification resolves in the background), every `RepoCard` re-renders. Fix this by making `getTier/getSignals/isResolving` read via `cacheRef.current`.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: Pass. Relevant test files: [src/hooks/useVerification.test.ts](../../src/hooks/useVerification.test.ts), [src/components/VerificationBadge.test.tsx](../../src/components/VerificationBadge.test.tsx).

- [ ] **Step 8: Commit**

```bash
git add src/components/DirectoryListing.tsx src/components/DiscoverSuggestions.tsx src/components/RepoCard.tsx src/components/ReadmeRenderer.tsx src/components/CodeViewer.tsx src/hooks/useVerification.ts
git commit -m "perf(render): memoize hot recomputations across list/detail components

- DirectoryListing: memoize sort + filter (was recomputing for 1000+ files per keystroke)
- DiscoverSuggestions: cache anchor element lookup (was querySelector every render)
- RepoCard: memoize emoji parsing per repo.description
- ReadmeRenderer: wrap in React.memo keyed on readme content
- CodeViewer: memoize line split
- useVerification: stabilize returned API via cacheRef (was retriggering every card render as verification resolved in background)"
```

---

## ⏸️ Checkpoint — commit-and-stop-here point

If the session budget is tight, this is a clean stop. The biggest renderer wins are landed. Tasks 3-5 below address a different class of issue (virtualization + main-process hygiene) and can go in a later session.

To resume: read this file from Task 3. No state carried forward from Tasks 1-2 is needed.

---

## Task 3: Viewport windowing for DiscoverGrid and LibraryGrid

**Files:**
- Create: [src/components/ViewportWindow.tsx](../../src/components/ViewportWindow.tsx) (new, ~60 lines)
- Modify: [src/components/DiscoverGrid.tsx](../../src/components/DiscoverGrid.tsx)
- Modify: [src/components/LibraryGrid.tsx](../../src/components/LibraryGrid.tsx)

**Spec reference:** §3.3

**Decision (resolving spec's deferred choice):** The existing grids use CSS `grid-template-columns: repeat(N, minmax(0, 1fr))` (responsive 1fr layout). `react-window`'s `FixedSizeGrid` conflicts with this responsive layout. Instead, implement a lightweight IntersectionObserver-based "viewport window" wrapper that:
- Preserves the existing CSS grid / list layouts
- Renders a lightweight placeholder (`<div style={{ height, minHeight }} />`) for children whose DOM position is > N pixels outside the viewport
- Swaps back to the real child when the placeholder enters the buffer zone

This gets 80% of the benefit (unmount heavy children like `DitherBackground`, avoid reconciliation of 100s of off-screen cards) without changing the layout model.

If after implementation profiling shows `react-window` would still help, that's a Phase 4+ follow-up.

- [ ] **Step 1: Create `ViewportWindow` component**

Create [src/components/ViewportWindow.tsx](../../src/components/ViewportWindow.tsx):

```tsx
import { useRef, useState, useEffect, type ReactNode } from 'react'

interface ViewportWindowProps {
  /** Minimum height of the placeholder when not rendered (approx card height). */
  placeholderHeight: number
  /** Pixels of margin around viewport before mounting/unmounting. */
  rootMargin?: string
  /** Children to render when visible. */
  children: ReactNode
  /** Optional className for the wrapper (for grid-item styling). */
  className?: string
}

/**
 * Lightweight viewport windowing: mounts `children` only when the wrapper is within
 * (or near) the viewport. When off-screen, renders a sized placeholder so the scroll
 * container's total height stays stable.
 */
export default function ViewportWindow({
  placeholderHeight,
  rootMargin = '500px',
  children,
  className,
}: ViewportWindowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className} style={{ minHeight: placeholderHeight }}>
      {visible ? children : null}
    </div>
  )
}
```

- [ ] **Step 2: Wrap children in `DiscoverGrid`**

In [src/components/DiscoverGrid.tsx:165-184](../../src/components/DiscoverGrid.tsx), wrap each `<RepoCard>` in a `<ViewportWindow>`:

```tsx
{visibleRepos.map((repo, i) => (
  <ViewportWindow
    key={repo.id ?? `${repo.owner}/${repo.name}`}
    placeholderHeight={280}  // approx card height — tune to actual
  >
    <RepoCard
      repo={repo}
      viewMode={viewMode}
      onNavigate={onNavigate}
      /* ...rest of props... */
    />
  </ViewportWindow>
))}
```

And for the list mode at lines 122-141, wrap `<RepoListRow>`:

```tsx
{visibleRepos.map((repo, i) => (
  <ViewportWindow
    key={`${repo.owner}/${repo.name}`}
    placeholderHeight={52}
  >
    <RepoListRow /* ...props... */ />
  </ViewportWindow>
))}
```

Important: do NOT wrap the skeleton rows (lines 142-147 and 185-194). They should always render.

- [ ] **Step 3: Wrap children in `LibraryGrid`**

[src/components/LibraryGrid.tsx:24-41](../../src/components/LibraryGrid.tsx) — wrap `LibraryCard` / `LibraryListRow` the same way:

```tsx
{rows.map(row => (
  <ViewportWindow
    key={row.id}
    placeholderHeight={isList ? 52 : 220}
  >
    {isList ? (
      <LibraryListRow /* props */ />
    ) : (
      <LibraryCard /* props */ />
    )}
  </ViewportWindow>
))}
```

- [ ] **Step 4: Verify grid CSS still works**

The wrapper `<div>` added by `ViewportWindow` inserts an extra DOM layer between the grid container and the card. If the grid children have CSS like `.discover-grid > .repo-card` (direct child selector), those rules will break.

Check: grep for `> .repo-card`, `> .repo-list-row`, `> .library-card`, `> .library-list-row` in CSS files. If any direct-child selectors exist, either:
- Change selector from `>` to descendant (whitespace): safest
- OR: apply the className to the `ViewportWindow` wrapper via `className` prop

The `className` prop on ViewportWindow lets you pass through grid-item styling if needed.

- [ ] **Step 5: Test keyboard navigation**

Discover supports keyboard navigation (focus moves between cards). The `focused` prop on `RepoCard` drives this. When a card is scrolled far off-screen and its parent `ViewportWindow` is placeholder-only, arrow-down should still work — because the focus logic lives in Discover.tsx, not in the rendered card.

But: when focus moves to an unmounted card, there's nothing to scroll to. The wrapper still exists in the DOM (it has `minHeight`), so scroll-into-view should still work. Verify this manually:

Prompt user: "Please tab/arrow through Discover with 100+ repos loaded. Confirm focus moves correctly and scrolls off-screen cards into view."

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: Pass. No new tests required for ViewportWindow — its behavior is visual.

- [ ] **Step 7: User confirms**

Prompt: "Discover + Library grids now mount cards only near viewport. Please verify: scrolling is smooth, cards appear correctly as you scroll, no 'blank card' gaps visible during fast scroll, keyboard nav works."

- [ ] **Step 8: Commit**

```bash
git add src/components/ViewportWindow.tsx src/components/DiscoverGrid.tsx src/components/LibraryGrid.tsx
git commit -m "perf(grids): viewport-window repo cards via IntersectionObserver

New ViewportWindow wrapper renders a sized placeholder when off-screen,
mounting the real card (with its DitherBackground canvas loop) only within
500px of viewport. Preserves the responsive CSS grid layout."
```

---

## Task 4: LRU-bound the main-process caches

**Files:**
- Create: [electron/lruCache.ts](../../electron/lruCache.ts) (new, ~30 lines)
- Modify: [electron/main.ts:468](../../electron/main.ts) (searchReposCache)
- Modify: [electron/main.ts:714-717](../../electron/main.ts) (treeCache, blobCache, branchCache)

**Spec reference:** §3.2

**Why:** Three `Map`s grow without eviction. Over a long session visiting many repos, they balloon → GC pressure → main-process stalls.

- [ ] **Step 1: Create `LRUCache`**

Create [electron/lruCache.ts](../../electron/lruCache.ts):

```ts
/**
 * Tiny LRU cache. Insert-on-get keeps recently-used entries at the tail;
 * when size exceeds max, the oldest (head) entry is evicted.
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>()
  constructor(private max: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    // Move to tail (most recently used)
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K
      this.map.delete(oldest)
    }
  }

  delete(key: K): boolean { return this.map.delete(key) }
  clear(): void { this.map.clear() }
  get size(): number { return this.map.size }
}
```

- [ ] **Step 2: Write tests for `LRUCache`**

Create [electron/lruCache.test.ts](../../electron/lruCache.test.ts):

```ts
import { describe, it, expect } from 'vitest'
import { LRUCache } from './lruCache'

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    expect(c.get('a')).toBe(1)
  })

  it('evicts oldest when capacity exceeded', () => {
    const c = new LRUCache<string, number>(2)
    c.set('a', 1); c.set('b', 2); c.set('c', 3)
    expect(c.get('a')).toBeUndefined()
    expect(c.get('b')).toBe(2)
    expect(c.get('c')).toBe(3)
  })

  it('treats get() as a use (promotes to most-recent)', () => {
    const c = new LRUCache<string, number>(2)
    c.set('a', 1); c.set('b', 2)
    c.get('a')           // promote 'a'
    c.set('c', 3)        // should evict 'b', not 'a'
    expect(c.get('a')).toBe(1)
    expect(c.get('b')).toBeUndefined()
  })
})
```

Run: `npm test electron/lruCache.test.ts`
Expected: all three pass.

- [ ] **Step 3: Migrate `searchReposCache`**

In [electron/main.ts:468](../../electron/main.ts):

```ts
// OLD
const searchReposCache = new Map<string, { rows: unknown[]; ts: number }>()

// NEW
import { LRUCache } from './lruCache'
const searchReposCache = new LRUCache<string, { rows: unknown[]; ts: number }>(20)
```

Usage site at lines 475 (`.get`) and wherever `.set` is called — the `LRUCache` API mirrors `Map` for these two methods, so callsites are unchanged. Grep for `searchReposCache.` to verify all usages are covered by `get`/`set`/`delete`/`clear`.

- [ ] **Step 4: Migrate `treeCache` and `blobCache`**

In [electron/main.ts:714-717](../../electron/main.ts):

```ts
// OLD
const treeCache = new Map<string, import('./github').TreeEntry[]>()
const blobCache = new Map<string, import('./github').BlobResult>()
const branchCache = new Map<string, { rootTreeSha: string; timestamp: number }>()

// NEW
const treeCache = new LRUCache<string, import('./github').TreeEntry[]>(100)
const blobCache = new LRUCache<string, import('./github').BlobResult>(100)
const branchCache = new LRUCache<string, { rootTreeSha: string; timestamp: number }>(50)
```

Note: `blobCache` may store large values (file contents). 100 entries could be hundreds of MB if files are large. If a quick grep of usage shows blobCache holds file contents >100KB each, drop to 50.

Grep for each cache name to verify API compatibility (`.get`, `.set`, `.delete`, `.clear`, `.has` — if `.has` is used, add it to `LRUCache`).

- [ ] **Step 5: Add `.has()` to `LRUCache` if needed**

If grep shows any callsite uses `cache.has(key)`, add to `LRUCache`:

```ts
has(key: K): boolean { return this.map.has(key) }
```

Without promoting (has() doesn't count as a "use" in typical LRU semantics).

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All pass including new lruCache tests and existing main.test.ts.

- [ ] **Step 7: Commit**

```bash
git add electron/lruCache.ts electron/lruCache.test.ts electron/main.ts
git commit -m "perf(main): LRU-bound unbounded caches to prevent session-long growth

Adds LRUCache<K,V> utility (with tests).
treeCache/blobCache: cap 100; branchCache: cap 50; searchReposCache: cap 20.
Previously all four could grow to hundreds of MB over a long session."
```

---

## Task 5: Convert synchronous `fs.*Sync` in IPC handlers to `fs.promises`

**Files:**
- Modify: [electron/main.ts:1700-1753](../../electron/main.ts) (four `projects:*` handlers)
- Optionally: [electron/mcp-server.ts](../../electron/mcp-server.ts) — only if grep confirms `fs.*Sync` in hot paths

**Spec reference:** audit finding 1.11

**Why:** Synchronous file I/O inside `ipcMain.handle` blocks the entire main-process event loop — including IPC from other handlers, window events, timers, protocol handlers. Converting to `fs.promises` lets the loop service other work while the disk call is in flight.

- [ ] **Step 1: Convert `projects:readFile` (line 1700-1709)**

```ts
// OLD
ipcMain.handle('projects:readFile', async (_event, folderPath: string, filename: string) => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const fullPath = path.join(folderPath, filename)
  try {
    return fs.readFileSync(fullPath, 'utf8')
  } catch {
    return null
  }
})

// NEW
import { promises as fsp } from 'fs'  // at top of file, if not already

ipcMain.handle('projects:readFile', async (_event, folderPath: string, filename: string) => {
  const path = require('path') as typeof import('path')
  const fullPath = path.join(folderPath, filename)
  try {
    return await fsp.readFile(fullPath, 'utf8')
  } catch {
    return null
  }
})
```

If `main.ts` doesn't yet import `fs.promises`, add the import at the top. Use `fsp` (or any unused name) to avoid shadowing.

- [ ] **Step 2: Convert `projects:listDir` (line 1711-1737)**

```ts
ipcMain.handle('projects:listDir', async (_event, folderPath: string, subPath: string) => {
  const path = require('path') as typeof import('path')
  const targetDir = subPath ? path.join(folderPath, subPath) : folderPath
  try {
    const names = await fsp.readdir(targetDir)
    const entries = await Promise.all(names
      .filter(n => !n.startsWith('.') || n === '.env')
      .map(async name => {
        const full = path.join(targetDir, name)
        try {
          const stat = await fsp.stat(full)
          return {
            name,
            path: subPath ? `${subPath}/${name}` : name,
            type: stat.isDirectory() ? 'dir' as const : 'file' as const,
            size: stat.isFile() ? stat.size : null,
          }
        } catch {
          return null
        }
      }))
    const filtered = entries.filter((e): e is NonNullable<typeof e> => e !== null)
    filtered.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return filtered
  } catch {
    return []
  }
})
```

The inner `.map(async ...)` + `Promise.all` parallelizes the stat calls — a nice side benefit.

- [ ] **Step 3: Convert `projects:renameFolder` (line 1739-1746)**

```ts
ipcMain.handle('projects:renameFolder', async (_event, folderPath: string, newName: string) => {
  const path = require('path') as typeof import('path')
  const parent = path.dirname(folderPath)
  const dest = path.join(parent, newName)
  await fsp.rename(folderPath, dest)
  return dest
})
```

- [ ] **Step 4: Convert `projects:writeFile` (line 1748-1753)**

```ts
ipcMain.handle('projects:writeFile', async (_event, folderPath: string, filename: string, content: string) => {
  const path = require('path') as typeof import('path')
  const fullPath = path.join(folderPath, filename)
  await fsp.writeFile(fullPath, content, 'utf8')
})
```

- [ ] **Step 5: Audit `mcp-server.ts` for sync fs**

Grep: `fs\.(readFileSync|writeFileSync|statSync|readdirSync|renameSync)` in [electron/mcp-server.ts](../../electron/mcp-server.ts).

If matches are in non-hot paths (e.g., one-time init), leave them. If any are inside a hot tool-handler path, convert the same way. Note that MCP tool handlers are also `async`-capable so this is purely additive.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All pass. Key test files: [electron/main.test.ts](../../electron/main.test.ts), any `projects:*` tests.

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
# plus electron/mcp-server.ts if touched in Step 5
git commit -m "perf(main): convert synchronous fs calls in IPC handlers to fs.promises

projects:readFile/listDir/renameFolder/writeFile no longer block the event loop.
listDir now parallelizes stat calls via Promise.all."
```

---

## Verification — end of Phase 2

- [ ] **All tests pass:** `npm test`
- [ ] **Five commits landed on main** (or fewer if stopped at checkpoint)
- [ ] **User-reported smoothness improvements:**
  - Typing in Discover search no longer lags between keystrokes
  - Scrolling a 100+ repo grid stays smooth
  - Library opens quickly
  - Main-process file ops (project import, file read) don't freeze the UI

## Completion summary to report back

At the end of Phase 2:
- Commits landed (list short titles)
- Tasks skipped (with reason)
- Any follow-up items for Phase 4 or a new plan
- Any `.has()` additions made to `LRUCache` (whether Step 5 of Task 4 fired)
