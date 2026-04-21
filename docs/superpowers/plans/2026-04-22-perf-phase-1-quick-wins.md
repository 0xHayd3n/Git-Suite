# Performance Phase 1 — Quick Wins Implementation Plan

> **For agentic workers:** Use [superpowers:executing-plans](../../) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. User preference: commit directly to `main`, no worktrees. No dev-server / visual verification — user tests UI changes themselves.

**Goal:** Land six independent high-leverage performance fixes in a single session: SQLite PRAGMAs + indexes, context value memoization, `backdrop-filter: blur(20px)` stripped from sticky surfaces, `DiscoverRow` carousel switched to GPU-accelerated animation, `library:getAll` payload split, startup work deferred off the critical path.

**Architecture:** Each task is independent and self-contained — any can be skipped without breaking others. Each task ends with its own commit. Expected runtime: 1–2 hours. No mid-plan checkpoint needed.

**Tech Stack:** TypeScript, React 18, Electron, better-sqlite3, CSS

**Spec:** [../specs/2026-04-22-performance-audit-design.md](../specs/2026-04-22-performance-audit-design.md)

---

## Task 1: SQLite PRAGMAs + hot-path indexes

**Files:**
- Modify: [electron/db.ts:4-6](../../electron/db.ts)
- Modify: [electron/db.ts:105](../../electron/db.ts) (indexes section)

**Spec reference:** §3.1

- [ ] **Step 1: Add performance PRAGMAs**

Open [electron/db.ts](../../electron/db.ts). At the top of `initSchema()`, after `foreign_keys = ON` (line 6), add the four performance PRAGMAs:

```ts
export function initSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -64000')        // 64 MB
  db.pragma('mmap_size = 268435456')       // 256 MB
  db.pragma('temp_store = MEMORY')

  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
    ...
```

- [ ] **Step 2: Add hot-path indexes**

Inside the single `db.exec` block that creates tables, append five `CREATE INDEX IF NOT EXISTS` statements to the existing index section (currently only `repos_owner_name` at the bottom of the `db.exec` block, line 105):

```sql
    CREATE UNIQUE INDEX IF NOT EXISTS repos_owner_name ON repos (owner, name);
    CREATE INDEX IF NOT EXISTS repos_saved_at         ON repos(saved_at);
    CREATE INDEX IF NOT EXISTS repos_starred_at       ON repos(starred_at);
  `)
```

Notes:
- `search_cache.cache_key` and `topic_cache.topic` are both already PRIMARY KEY (see lines 75, 80) — SQLite auto-indexes PKs. No extra `CREATE INDEX` needed for those; omit them from the plan's spec callout.
- `repos.type_bucket` is added by an `ALTER TABLE` migration further down (line 149). `CREATE INDEX IF NOT EXISTS` on a column that hasn't been added yet in the same `initSchema()` run would fail — so create that index AFTER the migrations.

Refactored structure: keep the two pre-existing-column indexes (`saved_at`, `starred_at`) in the main `db.exec` block. Add a second `db.exec` call AFTER all `ALTER TABLE` migrations to create the `type_bucket` index. Example:

```ts
  // ... all ALTER TABLE migrations ...

  // Phase 20 – AI chat history
  db.exec(`CREATE TABLE IF NOT EXISTS ai_chats ( ... )`)

  // Post-migration indexes (reference columns added via ALTER TABLE)
  db.exec(`
    CREATE INDEX IF NOT EXISTS repos_type_bucket ON repos(type_bucket);
  `)
}
```

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: All existing tests pass. The PRAGMA changes are backward-compatible; indexes are idempotent.

- [ ] **Step 4: Verify PRAGMAs applied**

The most reliable verification is a temporary diagnostic. Add to the end of `initSchema` temporarily, run the app once, then revert:

```ts
console.log('pragmas', {
  journal: db.pragma('journal_mode', { simple: true }),
  sync:    db.pragma('synchronous', { simple: true }),
  cache:   db.pragma('cache_size', { simple: true }),
  mmap:    db.pragma('mmap_size', { simple: true }),
  temp:    db.pragma('temp_store', { simple: true }),
})
```

Expected output (from the Electron main process console):
```
pragmas { journal: 'wal', sync: 1, cache: -64000, mmap: 268435456, temp: 2 }
```

`sync: 1` = NORMAL. `temp: 2` = MEMORY. Revert the console.log after confirming.

- [ ] **Step 5: Commit**

```bash
git add electron/db.ts
git commit -m "perf(db): add SQLite performance PRAGMAs and hot-path indexes

synchronous=NORMAL, 64MB cache, 256MB mmap, MEMORY temp_store.
Indexes on saved_at, starred_at, type_bucket, topic_cache.topic, search_cache.cache_key."
```

---

## Task 2: Memoize context provider values

**Files:**
- Modify: [src/contexts/RepoNav.tsx:86](../../src/contexts/RepoNav.tsx)
- Modify: [src/contexts/Search.tsx:17](../../src/contexts/Search.tsx)
- Modify: [src/contexts/Toast.tsx:55](../../src/contexts/Toast.tsx) (verify only — already close to correct)

**Spec reference:** §3.7

**Why:** Every consumer of these contexts currently re-renders on every state change because the provider value object is constructed inline. Wrapping in `useMemo` stops that cascade.

- [ ] **Step 1: Memoize `RepoNavProvider` value**

In [src/contexts/RepoNav.tsx](../../src/contexts/RepoNav.tsx), import `useMemo` and wrap the provider value. Replace lines 85-89:

```tsx
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

// ... inside RepoNavProvider, after the useCallback definitions ...

const value = useMemo(
  () => ({ state, setActiveTab, setFilePath, setIsDirectory, setOnTabClick, setOnFilePathClick, setFileNav }),
  [state, setActiveTab, setFilePath, setIsDirectory, setOnTabClick, setOnFilePathClick, setFileNav],
)

return (
  <RepoNavContext.Provider value={value}>
    {children}
  </RepoNavContext.Provider>
)
```

All six `setX` callbacks are already `useCallback`s with `[]` deps (stable), so the memo only breaks when `state` actually changes — which is the correct behavior.

- [ ] **Step 2: Memoize `SearchProvider` value**

In [src/contexts/Search.tsx](../../src/contexts/Search.tsx), the provider currently has no `useCallback` on `setInputRef` — the `useState` setter is already stable, but `setQuery` is also stable (useState setters are reference-stable). So the only instability is the object literal.

Replace lines 12-21:

```tsx
import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'

// ... interface unchanged ...

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [inputRef, setInputRef] = useState<React.RefObject<HTMLInputElement> | null>(null)

  const value = useMemo(
    () => ({ query, setQuery, inputRef, setInputRef }),
    [query, inputRef],
  )

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  )
}
```

(`setQuery`/`setInputRef` are stable useState setters — omit them from deps.)

- [ ] **Step 3: Verify `ToastProvider` value**

Open [src/contexts/Toast.tsx](../../src/contexts/Toast.tsx). The provider emits `{ toast }` where `toast` is already a `useCallback`. However it's still constructed inline as `{ toast }` on line 55 — technically a new object on each render because JSX re-evaluates.

Add a `useMemo`:

```tsx
import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'

// ... inside ToastProvider, after `toast` useCallback ...

const value = useMemo(() => ({ toast }), [toast])

return (
  <ToastContext.Provider value={value}>
    {/* ... */}
  </ToastContext.Provider>
)
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All existing tests pass. Test files that exist for these contexts: [src/contexts/Search.test.tsx](../../src/contexts/Search.test.tsx). Add no new tests — memoization is an implementation detail.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/RepoNav.tsx src/contexts/Search.tsx src/contexts/Toast.tsx
git commit -m "perf(contexts): memoize provider values to prevent consumer re-render cascades"
```

---

## Task 3: Strip `backdrop-filter: blur(20px)` from sticky/scrolling surfaces

**Files (confirmed via grep, all lines reference `backdrop-filter: blur(20px)` and its `-webkit-` twin):**
- Modify: [src/components/DiscoverTopNav.css:27-28, 77-78, 149-150, 210-211](../../src/components/DiscoverTopNav.css)
- Modify: [src/components/DiscoverSidebar.css:19-20, 121-122](../../src/components/DiscoverSidebar.css)
- Modify: [src/components/ArticleLayout.css:28-29, 124-125](../../src/components/ArticleLayout.css)
- Modify: [src/components/LibrarySidebar.css:158-159](../../src/components/LibrarySidebar.css)

**Spec reference:** §3.8

**Policy:** Replace `backdrop-filter: blur(20px)` with a solid semi-transparent background (`rgba(...)`). Visual parity comes from increasing background opacity to roughly `0.85`.

**Not touched in this task:** globals.css has 21 additional `blur(20px)` occurrences. Those are evaluated individually — many are on modal overlays (acceptable) or static elements (acceptable). Task 3 only covers the files above, which audit §1.4 specifically flagged.

- [ ] **Step 1: Note the current background colors (for parity)**

Before editing, read each file and note the `background:` property that accompanies each `backdrop-filter: blur(20px)`. They'll typically look like `background: rgba(13, 17, 23, 0.62)` or similar. The new value should raise the alpha to compensate for lost blur.

For each of the listed occurrences:
- If the existing background alpha is < 0.7, bump it to 0.85
- If it's already ≥ 0.7, bump by +0.1
- Leave the color channels (r, g, b) unchanged

- [ ] **Step 2: Edit [src/components/DiscoverTopNav.css](../../src/components/DiscoverTopNav.css)**

At each of lines 27-28, 77-78, 149-150, 210-211: remove both `backdrop-filter: blur(20px);` and `-webkit-backdrop-filter: blur(20px);`. Bump the adjacent `background:` alpha per Step 1.

- [ ] **Step 3: Edit [src/components/DiscoverSidebar.css](../../src/components/DiscoverSidebar.css)**

Same treatment at lines 19-20 and 121-122.

- [ ] **Step 4: Edit [src/components/ArticleLayout.css](../../src/components/ArticleLayout.css)**

Lines 28-29: strip the blur on `.article-layout-sticky-top`. Bump bg alpha.

Lines 124-125: strip the blur on `.article-layout-dither .corner-glass` (nested blur inside dither — the worst offender). Bump bg alpha.

Note the existing comment at lines 19-22 in this file already warns about the issue — can remove the warning comment too since the problem is being fixed.

- [ ] **Step 5: Edit [src/components/LibrarySidebar.css](../../src/components/LibrarySidebar.css)**

Lines 158-159: strip the blur. Bump bg alpha.

- [ ] **Step 6: Run tests + evidence check**

Run: `npm test`
Expected: Pass. No test coverage for CSS values exists.

Evidence command — verify no residual blur(20px) in the five files:
```bash
grep -c "backdrop-filter: blur(20px)" src/components/DiscoverTopNav.css src/components/DiscoverSidebar.css src/components/ArticleLayout.css src/components/LibrarySidebar.css
```
Expected: each file reports `0`.

- [ ] **Step 7: User visually confirms parity**

The executor must prompt the user: "CSS blur stripped from 5 files. Please verify the look is still acceptable (discover top nav, discover sidebar, article layout sticky top, library sidebar)."

Do not proceed to commit until user confirms. If user reports a visual regression on a specific file, try bumping alpha further (+0.1) or reverting only that file — the other four are independent.

- [ ] **Step 8: Commit**

```bash
git add src/components/DiscoverTopNav.css src/components/DiscoverSidebar.css src/components/ArticleLayout.css src/components/LibrarySidebar.css
git commit -m "perf(css): strip backdrop-filter blur from sticky surfaces

blur(20px) on sticky/scrolling elements is very expensive on Windows/Electron.
Replaced with solid semi-transparent backgrounds with bumped alpha for visual parity.
Covers: DiscoverTopNav, DiscoverSidebar, ArticleLayout (incl. nested blur), LibrarySidebar."
```

---

## Task 4: Fix `DiscoverRow` carousel — `transform` not `left`, single-layer shadow

**Files:**
- Modify: [src/components/DiscoverRow.tsx:56-78](../../src/components/DiscoverRow.tsx) (inline styles)
- Modify: [src/components/DiscoverRow.css:71-75, 85-87](../../src/components/DiscoverRow.css) (transition + shadow)

**Spec reference:** §3.10

**Decision (resolving spec's deferred choice):** Animate **`transform: translateX` for horizontal position, keep `width` animating but via CSS custom property (no layout change)** is not viable — width transitions still force layout. Better:
- **Keep `width` in inline styles, but remove it from the CSS `transition` list.** Width will jump instantly between slots while `transform` animates smoothly. Because the carousel cards only shift by a card-width-per-tick (when `activeIndex` moves), a subtle instant width change during the shift is visually acceptable — the viewer's eye tracks the translating card. Alternative: `flex-basis` on a flex container, but that's a larger rewrite of both the TSX layout and CSS and is out of Phase 1's "quick win" scope.
- **Simplify box-shadow on `--p0` from 3 layers to 1.**

Implementation:

- [ ] **Step 1: Change inline style in `DiscoverRowCardItem`**

In [src/components/DiscoverRow.tsx](../../src/components/DiscoverRow.tsx) at line 78, change the inline style object from:

```tsx
style={{ width: cardWidth, left: cardLeft, opacity: targetOpacity, '--target-opacity': targetOpacity } as React.CSSProperties}
```

to:

```tsx
style={{ width: cardWidth, transform: `translateX(${cardLeft})`, opacity: targetOpacity, '--target-opacity': targetOpacity } as React.CSSProperties}
```

Note: `cardLeft` is already a `calc(...)` string (line 61-63), which `translateX` accepts directly. No JS logic change needed.

- [ ] **Step 2: Update CSS base rule**

In [src/components/DiscoverRow.css](../../src/components/DiscoverRow.css) at line 57, the `.discover-row-card` rule:

- Currently uses `position: absolute; top: 0; height: 100%;` + `left` via inline style
- Change to: `position: absolute; top: 0; left: 0; height: 100%;` (anchor at 0, translate via transform)

At lines 71-75, replace the transition block:

```css
  /* OLD */
  transition: left 0.5s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.45s ease,
              width 0.5s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s,
              background 0.2s;

  /* NEW */
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.45s ease,
              border-color 0.25s,
              background 0.2s;
  will-change: transform, opacity;
```

Removed `width` from the transition list (width snaps instantly). Removed `left` (no longer set by inline style). Added `will-change` so the browser allocates a compositor layer up front.

- [ ] **Step 3: Simplify box-shadow on `.discover-row-card--p0`**

At lines 85-87, replace:

```css
/* OLD */
.discover-row-card--p0 {
  border-color: rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15), 0 0 16px rgba(255, 255, 255, 0.12), 0 0 32px rgba(255, 255, 255, 0.06);
}

/* NEW */
.discover-row-card--p0 {
  border-color: rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.18);
}
```

- [ ] **Step 4: Verify `carousel-enter` keyframe is still compatible**

Lines 52-55 define `@keyframes carousel-enter` with `transform: translateX(30px)` → `transform: translateX(0)`. Because the card now has a base `transform: translateX(...)` that isn't `0`, the keyframe will briefly override the slot transform during the 0.4s animation.

**Fix:** remove the `carousel-enter` animation entirely (lines 52-55, 76, and the `animation: none` override at line 81). The `transition` on `transform` + `opacity` already produces a smooth appearance when new cards mount (they start from the previous position and slide into the new one). The keyframe animation is redundant.

Replace `animation: carousel-enter 0.4s ease-out both;` (line 76) with nothing (delete the line). Delete lines 52-55 (keyframes) and line 81 (`animation: none;` inside `--prev`).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: Pass. No carousel-specific tests exist.

- [ ] **Step 6: User visually confirms the carousel still looks right**

Prompt user: "DiscoverRow carousel now animates via `transform`. Please verify: carousel transitions look smooth, active card glow looks right, no visual stutter when advancing."

- [ ] **Step 7: Commit**

```bash
git add src/components/DiscoverRow.tsx src/components/DiscoverRow.css
git commit -m "perf(discover-row): GPU-accelerate carousel, simplify shadow

- Animate position via transform: translateX instead of left (was forcing layout).
- Drop width from transition list (snaps instantly; visually covered by transform).
- Collapse 3-layer active-card shadow to 1 layer.
- Remove redundant carousel-enter keyframe (transition now handles mount).
- Add will-change on transform/opacity."
```

---

## Task 5: `library:getAll` payload split — drop `content` from list, add on-demand handler

**Files:**
- Modify: [electron/main.ts:1182-1191](../../electron/main.ts)
- Modify: [electron/preload.ts](../../electron/preload.ts) (expose new `skill:getContent`)
- Modify: [src/env.d.ts](../../src/env.d.ts) (add type for new handler + remove `content` from library row type)
- Modify: [src/components/ComponentDetail.tsx:37,45,47,175](../../src/components/ComponentDetail.tsx) (fetch content on mount)
- Modify: other consumers found via grep

**Spec reference:** §3.9

**Why:** The current handler returns `content` for every skill — up to ~50KB × 50 skills = ~2.5MB serialized over IPC just to show the library list.

- [ ] **Step 1: Find all consumers of `library:getAll[].content`**

Use the Grep tool: pattern `\.content\b` scoped to `src/**/*.{ts,tsx}`. Filter the matches to those operating on results from `library.getAll()` (many `.content` accesses in the codebase are unrelated — e.g., skill subskills, AI messages).

Expected consumers based on reconnaissance:
- [src/components/ComponentDetail.tsx](../../src/components/ComponentDetail.tsx) — uses `row.content` extensively
- Possibly [src/views/Library.tsx](../../src/views/Library.tsx) — check carefully

Copy the grep result list somewhere visible; each callsite needs to be migrated in Step 5.

- [ ] **Step 2: Modify `library:getAll` to drop `content` and other heavy columns**

In [electron/main.ts:1182-1191](../../electron/main.ts), change the SELECT to exclude `s.content` and `s.filename` (filename is only needed for display in detail views, not list views):

```ts
ipcMain.handle('library:getAll', async () => {
  const db = getDb(app.getPath('userData'))
  return db.prepare(`
    SELECT r.*, s.active, s.version, s.generated_at, s.tier,
           s.enabled_components, s.enabled_tools
    FROM repos r
    INNER JOIN skills s ON r.id = s.repo_id
    ORDER BY s.generated_at DESC
  `).all()
})
```

Dropped: `s.filename`, `s.content` — both refetched on-demand per skill. Kept: `s.tier` (small int, used by Library badges). If grep in Step 1 showed `.filename` is accessed in list views (not detail views), keep it in the SELECT too.

- [ ] **Step 3: Add new `skill:getContent` handler**

Immediately after the `library:getAll` handler in [electron/main.ts](../../electron/main.ts) (~line 1191), add:

```ts
ipcMain.handle('skill:getContent', async (_, owner: string, name: string) => {
  const db = getDb(app.getPath('userData'))
  return db.prepare(`
    SELECT s.filename, s.content
    FROM skills s
    JOIN repos r ON s.repo_id = r.id
    WHERE r.owner = ? AND r.name = ?
  `).get(owner, name) as { filename: string; content: string } | undefined
})
```

- [ ] **Step 4: Expose `skill:getContent` in preload**

In [electron/preload.ts](../../electron/preload.ts), find the section that exposes `skill:*` handlers (likely under `skill: { ... }` or similar). Add:

```ts
getContent: (owner: string, name: string) => ipcRenderer.invoke('skill:getContent', owner, name),
```

Also update [src/env.d.ts](../../src/env.d.ts) — find the `skill` interface under `Window.api` and add the method signature:

```ts
skill: {
  // ... existing methods ...
  getContent: (owner: string, name: string) => Promise<{ filename: string; content: string } | undefined>
}
```

- [ ] **Step 5: Update the library row type in env.d.ts**

Find the type that describes what `library.getAll()` returns. Remove `content` (and `filename` if also removed in Step 2) from the type. This will cause a TypeScript compile error at every callsite listed in Step 1 — exactly what we want.

- [ ] **Step 6: Migrate consumers to fetch content on-demand**

For each callsite from Step 1: refactor the component to fetch content via `window.api.skill.getContent(owner, name)` in a `useEffect` keyed on `(owner, name)`. Example for `ComponentDetail.tsx`:

```tsx
const [skillContent, setSkillContent] = useState<string | null>(null)

useEffect(() => {
  let cancelled = false
  window.api.skill.getContent(row.owner, row.name).then(result => {
    if (!cancelled && result) setSkillContent(result.content)
  })
  return () => { cancelled = true }
}, [row.owner, row.name])

// Render gates:
if (!skillContent) return <ComponentDetailSkeleton />
const allComponents = parseComponents(skillContent)
// ... etc
```

Use a simple skeleton — don't block mount on the fetch. If the callsite is inside a list cell (not a detail view), the component shouldn't need `content` at all — those lines should be deleted.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: Pass. Test files: [src/views/Library.test.tsx](../../src/views/Library.test.tsx). May need updates if it asserts on `content` from `library.getAll()` mock returns. Update mocks to return the lean shape.

- [ ] **Step 8: Verify payload shrinkage**

Temporary diagnostic: in the renderer, log `JSON.stringify((await window.api.library.getAll())).length` before and after. Target: > 80% reduction for a user with many skills. Revert the log.

- [ ] **Step 9: Commit**

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts src/components/ComponentDetail.tsx src/views/Library.test.tsx
# plus any other files touched in Step 6
git commit -m "perf(library): split getAll payload, add skill:getContent handler

library:getAll no longer returns skill content (was ~50KB/skill).
New skill:getContent handler for on-demand fetch in detail views.
Reduces IPC payload for a 50-skill library from ~2.5MB to ~200KB."
```

---

## Task 6: Defer startup migration + MCP server off the critical path

**Files:**
- Modify: [electron/main.ts:2065-2082](../../electron/main.ts)

**Spec reference:** (audit finding 1.11 related; addresses main-process startup latency)

**Why:** The type-bucket backfill migration and MCP server startup both run synchronously inside `app.whenReady()` before `createWindow()`. For a user with 500+ unclassified repos, the backfill can block window creation by 1–5 seconds. MCP spawn adds another 100–500ms.

- [ ] **Step 1: Move backfill into `setImmediate`**

In [electron/main.ts](../../electron/main.ts), find the `app.whenReady().then(() => { ... })` block starting around line 2050. Locate the backfill block (lines 2065-2080):

```ts
  // Backfill type_bucket/type_sub for repos classified before Phase 16
  const unclassified = db.prepare(
    'SELECT id, name, description, topics FROM repos WHERE type_bucket IS NULL'
  ).all() as { ... }[]
  if (unclassified.length > 0) {
    // ... transaction backfill ...
    backfill()
  }
```

Wrap the entire block (from `const unclassified = ...` through `backfill()`) in `setImmediate(() => { ... })`:

```ts
  setImmediate(() => {
    const unclassified = db.prepare(
      'SELECT id, name, description, topics FROM repos WHERE type_bucket IS NULL'
    ).all() as { id: number; name: string; description: string | null; topics: string }[]
    if (unclassified.length > 0) {
      const updateType = db.prepare(
        'UPDATE repos SET type_bucket = ?, type_sub = ? WHERE id = ?'
      )
      const backfill = db.transaction(() => {
        for (const row of unclassified) {
          const classified = classifyRepoBucket({ name: row.name, description: row.description, topics: row.topics ?? '[]' })
          updateType.run(classified?.bucket ?? null, classified?.subType ?? null, row.id)
        }
      })
      backfill()
    }
  })
```

- [ ] **Step 2: Defer `startMCPServer()`**

At line 2082:

```ts
  // OLD
  startMCPServer()

  // NEW
  setImmediate(() => startMCPServer())
```

This preserves order (window still created first; MCP starts after the current tick unwinds, i.e., right after the window has been handed to the OS).

- [ ] **Step 3: Verify the color_extractor_version migration is NOT deferred**

The block at lines 2059-2063 (`UPDATE repos SET banner_color = NULL` when version mismatch) IS safe to leave synchronous — it only runs once per version bump and is trivial (a single UPDATE statement with no loop). Do not wrap this in `setImmediate`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Pass. [electron/main.test.ts](../../electron/main.test.ts) exists — verify it still passes with the deferred startup.

- [ ] **Step 5: Manual smoke check**

The executor should prompt user: "App startup order: MCP now starts after window opens. Please verify the app still launches normally and MCP-dependent features (skill scanning, recommendations) still work."

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "perf(startup): defer type-bucket backfill and MCP server via setImmediate

Both previously ran synchronously in app.whenReady() before createWindow().
For a user with 500+ unclassified repos, backfill blocked window creation 1-5s.
Now non-blocking; main window appears immediately, backfill runs on idle."
```

---

## Verification — end of Phase 1

- [ ] **All tests pass:** `npm test`
- [ ] **Six commits land on main** (each task = 1 commit)
- [ ] **No regressions reported** by user on the common flows (Discover browsing, Library list load, RepoDetail navigation)
- [ ] **Measurable checks completed:**
  - PRAGMAs confirmed via temporary diagnostic (Task 1 Step 4)
  - `library:getAll` payload reduction confirmed (Task 5 Step 8)

## Completion summary to report back

At the end of Phase 1, report back with:
- Number of commits landed
- `library:getAll` payload size before / after (from Task 5 Step 8)
- Any tasks skipped or modified
- Any new issues surfaced during implementation that should feed into Phase 2 or Phase 4
