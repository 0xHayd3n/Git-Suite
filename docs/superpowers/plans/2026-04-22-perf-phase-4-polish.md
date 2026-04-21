# Performance Phase 4 — Polish Implementation Plan

> **For agentic workers:** Use [superpowers:executing-plans](../../) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. User preference: commit directly to `main`, no worktrees. No dev-server / visual verification — user tests UI changes themselves.

**Goal:** Seven independent polish items: badge/ghimg protocol caching, color-extraction pool, `getRelatedRepos` N+1 fix, parallelize translator chunks, componentScanner concurrency, DitherBackground visibility gating, icon library consolidation. Plus one read-only `globals.css` audit that surfaces candidates for deletion to the user without deleting anything automatically.

**Architecture:** All seven tasks are fully independent. Pick any order; skip any. No mid-plan checkpoint — each task is small enough to commit individually.

**Tech Stack:** TypeScript, React, Electron, SQLite

**Spec:** [../specs/2026-04-22-performance-audit-design.md](../specs/2026-04-22-performance-audit-design.md)

**Note re: coordination with Phase 2 (advisory from spec reviewer):** Task 6 of this plan (DitherBackground visibility) modifies [src/hooks/useBayerDither.ts](../../src/hooks/useBayerDither.ts). Phase 2's `DiscoverRow` sibling-freeze work (if included) also touches the same file but for a different concern. If Phase 4 runs before Phase 2, the Phase 2 executor may see Phase 4's visibility additions and should layer on top, not replace. If Phase 2 runs first, Task 6 here simply adds to the existing file — no conflict.

**Prerequisite:** Phase 4 depends on Phase 2's `LRUCache` class (Task 4 of Phase 2). If Phase 2 hasn't shipped yet, Task 1 of this plan will need to either inline a small LRU or be deferred.

---

## Task 1: Badge & GhImg protocol response caching

**Files:**
- Modify: [electron/badgeProtocol.ts](../../electron/badgeProtocol.ts)
- Modify: [electron/ghimgProtocol.ts](../../electron/ghimgProtocol.ts)

**Why:** Each badge/image request hits the network via `net.fetch`. A README with 10 shields.io badges issues 10 separate HTTP requests with no caching beyond browser-level ETags. Worse, these fire on every RepoDetail view.

**Dependency:** Phase 2 Task 4's `electron/lruCache.ts`. If not yet shipped, skip this task or inline a minimal LRU here.

- [ ] **Step 1: Cache in `badgeProtocol.ts`**

In [electron/badgeProtocol.ts](../../electron/badgeProtocol.ts), at the top:

```ts
import { protocol, net } from 'electron'
import { BADGE_DOMAINS } from '../src/utils/badgeParser'
import { LRUCache } from './lruCache'

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const BADGE_CACHE_TTL = 60 * 60 * 1000 // 1 hour
const badgeCache = new LRUCache<string, { buffer: ArrayBuffer; contentType: string; ts: number }>(100)
```

Modify the handler to check cache first:

```ts
export function registerBadgeProtocol(): void {
  protocol.handle('badge', async (request) => {
    const originalUrl = 'https://' + request.url.slice('badge://'.length)

    if (!isAllowedDomain(originalUrl)) {
      return new Response(null, { status: 403 })
    }

    const cached = badgeCache.get(originalUrl)
    if (cached && Date.now() - cached.ts < BADGE_CACHE_TTL) {
      return new Response(cached.buffer, { headers: { 'Content-Type': cached.contentType } })
    }

    try {
      const response = await net.fetch(originalUrl, { signal: AbortSignal.timeout(5000) })

      if (!response.ok) {
        return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
      }

      const buffer = await response.arrayBuffer()

      if (buffer.byteLength > 100 * 1024) {
        return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
      }

      const contentType = response.headers.get('Content-Type') ?? 'image/svg+xml'
      badgeCache.set(originalUrl, { buffer, contentType, ts: Date.now() })
      return new Response(buffer, { headers: { 'Content-Type': contentType } })
    } catch {
      return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
    }
  })
}
```

Note: caching `ArrayBuffer` is intentional — `Response` can be constructed from one repeatedly.

- [ ] **Step 2: Cache in `ghimgProtocol.ts`**

Repeat the pattern in [electron/ghimgProtocol.ts](../../electron/ghimgProtocol.ts). Read the file first to match its existing shape — the structure is nearly identical to badgeProtocol.

- [ ] **Step 3: Run tests**

Run: `npm test`

- [ ] **Step 4: Commit**

```bash
git add electron/badgeProtocol.ts electron/ghimgProtocol.ts
git commit -m "perf(protocols): LRU cache badge + ghimg responses (1hr TTL, 100 entries)

Repeated README views no longer re-fetch the same shields.io / GitHub
image URLs. Cap 100 entries; 1-hour TTL; first miss populates cache."
```

---

## Task 2: Pool color extraction with concurrency 3

**Files:**
- Modify: [electron/main.ts:441-455, 534-547, 607-619](../../electron/main.ts) (3 callsites)
- Modify: [electron/ipc/recommendHandlers.ts:99-110](../../electron/ipc/recommendHandlers.ts)

**Spec reference:** audit finding 1.11 (subset)

**Why:** After syncing 30-100 starred repos, color extraction fires `setImmediate()` per repo, but each HTTP request inside blocks the main thread for 100-500ms. With no pool, 100 repos = 10-60 seconds of sequential work.

- [ ] **Step 1: Extract a shared pooling helper**

Create a helper function at the top of [electron/main.ts](../../electron/main.ts) (or in a new `electron/concurrency.ts` if the file already has too many helpers — judgment call):

```ts
async function poolAll<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx]).catch(() => {})
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
}
```

Place near the other top-level helpers in `main.ts`.

- [ ] **Step 2: Identify the 3-4 color-extraction loops**

Grep: `extractDominantColor` in [electron/main.ts](../../electron/main.ts). Each match is a loop that fires per repo in sequence via `setImmediate`.

- [ ] **Step 3: Replace sequential loops with pooled calls**

Example (pattern to apply in each location):

```ts
// OLD (rough shape)
setImmediate(async () => {
  for (const repo of reposToColor) {
    const row = db.prepare('SELECT banner_color FROM repos WHERE owner = ? AND name = ?')
      .get(repo.owner.login, repo.name)
    if (row?.banner_color) continue
    try {
      const color = await extractDominantColor(repo.owner.avatar_url)
      db.prepare('UPDATE repos SET banner_color = ? WHERE owner = ? AND name = ?')
        .run(JSON.stringify(color), repo.owner.login, repo.name)
    } catch {}
  }
})

// NEW
setImmediate(() => poolAll(reposToColor, 3, async (repo) => {
  const row = db.prepare('SELECT banner_color FROM repos WHERE owner = ? AND name = ?')
    .get(repo.owner.login, repo.name)
  if (row?.banner_color) return
  const color = await extractDominantColor(repo.owner.avatar_url)
  db.prepare('UPDATE repos SET banner_color = ? WHERE owner = ? AND name = ?')
    .run(JSON.stringify(color), repo.owner.login, repo.name)
}))
```

Apply at each location. Match the existing skip-already-extracted logic; don't overfetch.

- [ ] **Step 4: Also update `recommendHandlers.ts`**

Same pattern at [electron/ipc/recommendHandlers.ts:99-110](../../electron/ipc/recommendHandlers.ts). Import the pool helper or redefine locally.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: Pass. The color-extraction happens inside `setImmediate` so tests shouldn't block on it.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts electron/ipc/recommendHandlers.ts
git commit -m "perf(main): pool color extraction with concurrency 3

After repo sync, color extraction previously ran sequentially per-repo via
setImmediate — 100 repos = 10-60s of sequential HTTP requests.
Now pooled at concurrency 3; same total work completes in ~1/3 the time."
```

---

## Task 3: Fix `getRelatedRepos` N+1

**File:** [electron/main.ts:687-712](../../electron/main.ts)

**Spec reference:** audit finding §5

**Why:** Current impl runs 5 separate queries (one per topic), then dedupes and sorts in memory. One query is faster.

- [ ] **Step 1: Replace with single OR'd query**

Replace the handler body with:

```ts
ipcMain.handle('github:getRelatedRepos', async (_event, owner: string, name: string, topicsJson: string) => {
  const db = getDb(app.getPath('userData'))
  const topics: string[] = (() => { try { return JSON.parse(topicsJson) } catch { return [] } })()
  const capped = topics.slice(0, 5)
  if (capped.length === 0) return []

  const escaped = capped.map(t => `%"${t.replace(/[%_]/g, '\\$&')}"%`)
  const placeholders = capped.map(() => `topics LIKE ? ESCAPE '\\'`).join(' OR ')
  const rows = db.prepare(
    `SELECT * FROM repos
     WHERE (${placeholders})
     AND NOT (owner = ? AND name = ?)
     ORDER BY stars DESC
     LIMIT 50`
  ).all(...escaped, owner, name) as Record<string, unknown>[]

  const seen = new Set<string>()
  return rows
    .filter((r) => {
      const key = `${r.owner}/${r.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
})
```

The `ORDER BY stars DESC LIMIT 50` in SQL replaces the JS `.sort().slice()` — much faster when the DB has many matches.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: Pass. If any test mocks `db.prepare` expecting N calls, update to expect 1 call.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "perf(main): collapse getRelatedRepos N+1 into single OR'd query

Was: 5 separate LIKE queries (one per topic), then JS dedupe+sort in-memory.
Now: single query with OR-joined LIKE clauses + SQL ORDER BY stars LIMIT.
Dedupe still in JS (topics overlap across rows)."
```

---

## Task 4: Parallelize translator chunks

**File:** [electron/translator.ts:96-114](../../electron/translator.ts)

**Why:** Translation of a 5-chunk README currently sequentially awaits each chunk — 4-5 API round trips in series. Translating a long README takes 5-10s.

**Caveat:** The current code captures `detectedLang` from the first chunk's response only ("if `detectedLang === 'auto' && data[2]`" on lines 111-113). Preserve that behavior after parallelization by explicitly reading `translations[0]`'s `data[2]`.

- [ ] **Step 1: Replace the sequential loop**

In [electron/translator.ts](../../electron/translator.ts), replace lines 93-113 inside `translate()`:

```ts
// OLD
let detectedLang = sourceLang
const translatedParts: string[] = []

for (const chunk of chunks) {
  const url =
    `${GT_URL}?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=ld` +
    `&q=${encodeURIComponent(chunk)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const data = await res.json()

  const translated = (data[0] as Array<[string, ...unknown[]]>)
    .map(pair => pair[0] ?? '')
    .join('')
  translatedParts.push(translated)

  if (detectedLang === 'auto' && data[2]) {
    detectedLang = data[2] as string
  }
}

// NEW
const responses = await Promise.all(chunks.map(chunk => {
  const url =
    `${GT_URL}?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=ld` +
    `&q=${encodeURIComponent(chunk)}`
  return fetch(url, { signal: AbortSignal.timeout(15000) })
    .then(res => res.ok ? res.json() : null)
    .catch(() => null)
}))

// If any chunk failed, bail — translator contract returns null on failure
if (responses.some(r => r === null)) return null

const translatedParts = responses.map(data => {
  return (data[0] as Array<[string, ...unknown[]]>)
    .map(pair => pair[0] ?? '')
    .join('')
})

let detectedLang = sourceLang
if (detectedLang === 'auto' && responses[0]?.[2]) {
  detectedLang = responses[0][2] as string
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: Pass. No test file exists for translator.ts currently; consider if the change warrants a small test. Skip if no existing test infrastructure.

- [ ] **Step 3: User smoke test**

Prompt: "translator.ts now fetches translation chunks in parallel. Please test: (1) translate a long-language README (e.g., a Chinese or Japanese repo), (2) verify the full README translates correctly and doesn't get jumbled."

- [ ] **Step 4: Commit**

```bash
git add electron/translator.ts
git commit -m "perf(translator): parallelize chunk fetches via Promise.all

5-chunk README: 5x serial fetches → 1 round-trip's worth of wall time.
On partial failure, bail to null (preserving existing contract)."
```

---

## Task 5: Increase `componentScanner` concurrency

**File:** [electron/componentScanner.ts:60-70](../../electron/componentScanner.ts)

**Why:** Current batch pattern is "10 items in parallel, await all, next 10" — serial wall time for N/10 batches. Proper worker-pool pattern lets all 10 "workers" pull items continuously, no idle gaps between batches.

- [ ] **Step 1: Read the current `batchFetch`**

Open [electron/componentScanner.ts](../../electron/componentScanner.ts). Locate the `batchFetch` function around line 60-66. Understand the current API — how it's called and what it returns.

- [ ] **Step 2: Replace with a proper concurrent queue**

```ts
async function batchFetch<T>(
  items: string[],
  concurrency: number,
  fn: (item: string) => Promise<T | null>,
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(items.length).fill(null)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await fn(items[idx]).catch(() => null)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}
```

The `results` array is index-stable (worker writes to `results[idx]` directly), preserving input order — important if callers depend on it.

- [ ] **Step 3: Bump concurrency at callsite**

Find where `batchFetch` is called. The spec suggests concurrency=10. Update:

```ts
// Old: batchFetch(candidates, (path) => ...)   // concurrency was effectively batch-size (10 items, full-await-gap)
// New: batchFetch(candidates, 10, (path) => ...)
```

If the existing API didn't take `concurrency`, it was a positional arg being used — adjust signature. If there are other callers, update all of them.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Pass. Test file: [electron/componentScanner.ts](../../electron/componentScanner.ts)'s imports — check if tests exist (grep for `componentScanner` in `*.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add electron/componentScanner.ts
git commit -m "perf(scanner): proper worker-pool for componentScanner fetches

Was: batchFetch(items, 10, ...) = 10 parallel then full await, per batch.
Now: 10 workers pull from a shared queue until empty — no inter-batch gaps.
For 50 files: ~1.5-2x faster."
```

---

## Task 6: DitherBackground visibility gating

**File:** [src/hooks/useBayerDither.ts](../../src/hooks/useBayerDither.ts)

**Spec reference:** §3.6

**Why:** The dither canvas animation loop runs continuously even when the app tab is hidden (user on another window). Wastes CPU and battery.

**Note:** This task ADDs visibility logic; it does NOT modify the existing IntersectionObserver or FRAME_INTERVAL. Phase 2 (if/when run) may also edit the same hook for DiscoverRow-specific sibling-freeze — layer additively.

- [ ] **Step 1: Read the current hook**

Open [src/hooks/useBayerDither.ts](../../src/hooks/useBayerDither.ts). Locate the rAF / setInterval loop that drives `renderCamera()` (around line 339). Identify:
- Where the loop is started (likely `useEffect` on mount)
- Where it's stopped (cleanup)
- The existing IntersectionObserver logic (if any)

- [ ] **Step 2: Add a `document.visibilityState` check**

Add an effect that pauses the loop when the document becomes hidden and resumes when it becomes visible:

```ts
useEffect(() => {
  function onVisChange() {
    if (document.visibilityState === 'hidden') {
      // pause: whatever mechanism the hook uses (clear rAF, set a paused flag)
      pausedByVisibility.current = true
    } else {
      pausedByVisibility.current = false
      // resume: restart the loop if not already running
      if (!isRunning.current) startLoop()
    }
  }

  document.addEventListener('visibilitychange', onVisChange)
  return () => document.removeEventListener('visibilitychange', onVisChange)
}, [])
```

Integrate `pausedByVisibility.current` into the existing loop guard — e.g., if the loop is a rAF, skip the render call when paused. Ensure the loop exits cleanly when paused (don't spin).

Implementation details depend on the current structure. If the hook uses `setInterval`, `clearInterval` on hide and re-setup on show. If it's `requestAnimationFrame`, cancel the current handle and don't schedule the next one — restart on show.

- [ ] **Step 3: Audit-finding side fix: FRAME_INTERVAL tuning**

Audit §3.6 says "drop to 10fps for non-hero instances". This requires knowing whether the hook is used for hero vs non-hero. If the hook takes an `options` arg or similar, add a `framerate` or `role: 'hero' | 'card'` option that defaults to hero=15fps (66ms) and card=10fps (100ms).

If the hook has no way to distinguish, and every caller uses the same frame rate, skip this sub-step and document in the commit that hero-vs-card differentiation is deferred.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Pass. Test file: [src/hooks/useBayerDither.test.ts](../../src/hooks/useBayerDither.test.ts).

- [ ] **Step 5: User smoke test**

Prompt: "Dither loop now pauses when the app window is hidden/minimized. Please verify: (1) dither still renders normally when app is focused, (2) task-switch away and back — dither should resume smoothly, not freeze or visibly re-initialize, (3) if you can observe CPU usage, it should drop when minimized."

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBayerDither.ts
git commit -m "perf(dither): pause render loop when document is hidden

Dither canvas loop was running continuously even when user was on another
app/window — wasted CPU + battery. Now halts on visibilitychange → hidden,
resumes on visible."
```

---

## Task 7: Icon library consolidation — audit + partial migration

**Files:** surveyed across `src/**/*.tsx`

**Why:** `react-icons` is hard to tree-shake and duplicates functionality from `lucide-react`. Full removal is out of scope — this task audits usage and migrates the easy cases.

**Ground rules:**
- DO NOT remove `react-icons` from `package.json` in this task
- Only migrate icons that have direct lucide-react equivalents
- Where no lucide equivalent exists (platform logos like SiDocker, SiNodedotjs), leave the react-icons import alone — those are candidates for later inline-SVG replacement, not this pass

- [ ] **Step 1: Inventory react-icons usage**

Grep: `import.*from 'react-icons/` in `src/**/*.tsx`. Record each file and the icons it imports.

Expected files (from audit): `src/components/FileIcon.tsx`, `src/components/DiscoverSidebar.tsx`, and possibly a handful of others.

- [ ] **Step 2: Map each icon to its lucide equivalent (where one exists)**

For each imported icon, check if lucide-react has an equivalent:
- `SiJavascript`, `SiTypescript` → no direct lucide equivalent (platform logos) — leave as-is
- `FaJava`, `SiPython` → no direct lucide equivalent — leave as-is
- Generic icons like `FaFolder`, `FaFile` → lucide has `Folder`, `File` — MIGRATE
- `PiCpuFill` → lucide has `Cpu` — MIGRATE (note: filled vs outline may differ; user should approve visual change)

If the audit surfaces icons that DO have lucide equivalents but the visual difference is non-trivial (outline-only vs filled), flag to the user rather than migrating unilaterally.

- [ ] **Step 3: Do the safe migrations**

For each file where all react-icons imports can be replaced with lucide equivalents, replace:

```tsx
// OLD
import { FaFolder, FaFile } from 'react-icons/fa'
// ...
<FaFolder />

// NEW
import { Folder, File } from 'lucide-react'
// ...
<Folder />
```

If some imports in a file can migrate but others can't, ONLY migrate the ones that have clean equivalents; leave the mixed imports (two import statements is fine).

- [ ] **Step 4: Prompt user on the ambiguous ones**

For each file with icons that have lucide equivalents but with meaningful visual differences (filled vs outline, size conventions), surface the list to the user:

"Found N react-icons imports in FILE where lucide has an equivalent but visual style differs. Migrate? List: [...]"

Default is to NOT migrate. Only migrate those the user explicitly okays.

- [ ] **Step 5: Run tests**

Run: `npm test`

- [ ] **Step 6: Commit**

```bash
git add <files touched>
git commit -m "perf(icons): migrate safe react-icons usages to lucide-react

Migrated only where lucide has a direct visual equivalent.
Platform logos (SiDocker, SiNodedotjs, etc.) still use react-icons —
candidates for later inline-SVG replacement.
react-icons remains in package.json for the non-migrated usages."
```

---

## Task 8 (optional, read-only): `globals.css` dead-rule audit

**Files:** read-only

**Why:** [src/styles/globals.css](../../src/styles/globals.css) is 10,610 lines / 242KB. Some rules are likely stale. But deletion is RISKY without visual regression tests — so this task only SURFACES candidates, doesn't delete.

- [ ] **Step 1: Run PurgeCSS in analyze mode (or use `vite-plugin-purgecss` in a one-off config)**

One approach without adding a dep: a quick grep-based heuristic. For each `.some-class { ... }` in globals.css, check if `some-class` appears in any `src/**/*.{tsx,css}` file.

Simpler approach: use an existing tool like `unused-css` (npm) as a one-off CLI invocation:

```bash
npx unused-css src/styles/globals.css 'src/**/*.{tsx,jsx,html}'
```

If the tool isn't installed / available, fall back to a hand-rolled script:

```bash
# Extract class selectors from globals.css, then check each for a match in src/
grep -oE '^\.[a-zA-Z0-9_-]+' src/styles/globals.css | sort -u > /tmp/css-classes.txt
while read class; do
  cname="${class:1}"  # strip leading .
  count=$(grep -r "$cname" src/ --include="*.tsx" --include="*.ts" --include="*.css" -l | wc -l)
  if [ "$count" -le 1 ]; then
    echo "POSSIBLY UNUSED: $class"
  fi
done < /tmp/css-classes.txt > /tmp/maybe-unused.txt
```

This is heuristic — will produce false positives (classes built via string concatenation, classes used in tests, etc.). Treat output as a candidate list, not a delete list.

- [ ] **Step 2: Report candidates to the user**

Present the candidate list to the user and ASK which (if any) to delete. Do not auto-delete.

User's likely answer: "leave it alone for now" or "I'll look through it later" — that's a valid outcome. The task is to surface the info, not to act on it.

- [ ] **Step 3: If user approves specific deletions, do those only**

Each user-approved deletion is its own small edit. Test after each: `npm test` + visual smoke.

- [ ] **Step 4: Commit (only if deletions happened)**

```bash
git add src/styles/globals.css
git commit -m "chore(css): delete confirmed-unused rules from globals.css

Deletions approved by user after manual review of the audit candidate list.
<N> rules removed, no visual regression."
```

If no deletions happen, no commit — just report findings.

---

## Verification — end of Phase 4

- [ ] **All tests pass:** `npm test`
- [ ] **6-8 commits landed** (depending on which tasks ran)
- [ ] **User confirmed no regressions** on the common flows
- [ ] **Measurable wins documented** in completion summary:
  - Task 1: badge cache hit rate (temp log, revert after)
  - Task 2: time for color extraction on a 50-repo sync (temp timing, revert after)
  - Task 4: translator wall time on a long README

## Completion summary to report back

- Commits landed (list short titles)
- Tasks skipped (with reason)
- Task 8's candidate count, and whether user approved any deletions
- Remaining follow-ups (e.g., platform-icon inline-SVG replacement, full react-icons removal) — surface as future work for a separate plan, do not attempt inline
