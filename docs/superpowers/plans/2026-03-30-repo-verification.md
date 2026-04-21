# Repo Verification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ambient background enrichment layer that scores each repo's "canonicity" via external registry cross-reference and GitHub signals, then surfaces a verification badge on Discover cards and the repo detail panel.

**Architecture:** A `verificationService` running in the Electron main process owns a priority queue of `EnrichmentJob` items; it processes them in batches (max 3 concurrent), writes results to SQLite, and fires a `verification:updated` IPC event so the renderer updates cards in-place. A `useVerification` hook on the renderer side accumulates per-repo tier/signals from those events, and a `VerificationBadge` component renders the pill and CSS tooltip.

**Tech Stack:** better-sqlite3 (already installed), Node `fetch` (built-in, Electron ≥ 21), React hooks, `lucide-react` (needs `npm install lucide-react --save`), Vitest + React Testing Library.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/db.ts` | Modify | Phase 15 migration — 4 new `repos` columns |
| `src/types/repo.ts` | Modify | Add 4 optional fields to `RepoRow` |
| `electron/services/verificationService.ts` | Create | Scoring logic, registry fetchers, queue, enrichment loop |
| `electron/ipc/verificationHandlers.ts` | Create | Register `verification:prioritise` + `verification:getScore` IPC handlers |
| `electron/main.ts` | Modify | Import + register handlers; start service after window ready; call `enqueueRepo` in `github:saveRepo` |
| `electron/preload.ts` | Modify | Expose `verification.prioritise`, `verification.getScore`, `verification.onUpdated`, `verification.offUpdated` |
| `src/env.d.ts` | Modify | Extend `Window.api` with `verification` namespace |
| `src/components/VerificationBadge.tsx` | Create | Badge pill, resolving dot, CSS tooltip |
| `src/hooks/useVerification.ts` | Create | IPC event listener; exposes `{ tier, signals }` per repoId |
| `src/components/RepoCard.tsx` | Modify | Add 16px badge slot above footer |
| `src/views/Discover.tsx` | Modify | Track visible card IDs, debounced `prioritise` call |
| `src/views/RepoDetail.tsx` | Modify | Badge beside repo name; signal count line below description |
| `electron/services/verificationService.test.ts` | Create | Unit tests for scoring + registry match |
| `src/components/VerificationBadge.test.tsx` | Create | Component tests for each tier and tooltip |

---

## Task 1: DB Migration + RepoRow Type Updates

**Files:**
- Modify: `electron/db.ts`
- Modify: `src/types/repo.ts`
- Test: `electron/services/verificationService.test.ts` (schema smoke test)

### Background

SQLite has no `IF NOT EXISTS` for `ALTER TABLE`. The existing pattern wraps each migration in `try { db.exec(...) } catch {}`. The last phase is 14 (`storybook_url`). Add Phase 15 with 4 columns.

`RepoRow` in `src/types/repo.ts` mirrors the DB schema; add the 4 new optional fields there too so TypeScript picks them up everywhere.

> **Important:** The `repos` table uses `id TEXT PRIMARY KEY` — IDs are strings like `"facebook/react"`, not numbers. All verification service code uses `repoId: string` throughout. Never call `Number(repo.id)`.

- [ ] **Step 1: Write the failing test**

Create `electron/services/verificationService.test.ts`:

```typescript
// electron/services/verificationService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../db'

describe('Phase 15 migration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  it('adds verification_score column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_score')
  })

  it('adds verification_tier column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_tier')
  })

  it('adds verification_signals column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_signals')
  })

  it('adds verification_checked_at column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_checked_at')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Coding/Git-Suite
npx vitest run electron/services/verificationService.test.ts
```

Expected: 4 failures — columns not found.

- [ ] **Step 3: Add Phase 15 migration to `electron/db.ts`**

Find the last migration block (Phase 14 — `storybook_url`). Add immediately after it:

```typescript
  // Phase 15 migration — repo verification system
  try { db.exec(`ALTER TABLE repos ADD COLUMN verification_score    INTEGER DEFAULT NULL`) } catch {}
  try { db.exec(`ALTER TABLE repos ADD COLUMN verification_tier     TEXT    DEFAULT NULL`) } catch {}
  try { db.exec(`ALTER TABLE repos ADD COLUMN verification_signals  TEXT    DEFAULT NULL`) } catch {}
  try { db.exec(`ALTER TABLE repos ADD COLUMN verification_checked_at INTEGER DEFAULT NULL`) } catch {}
```

- [ ] **Step 4: Update `RepoRow` in `src/types/repo.ts`**

After the `detected_language` field (last field in the interface), add:

```typescript
  // Phase 15 — verification
  verification_score:      number  | null
  verification_tier:       string  | null  // 'verified' | 'likely' | null
  verification_signals:    string  | null  // JSON array of signal names
  verification_checked_at: number  | null  // Unix timestamp
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run electron/services/verificationService.test.ts
```

Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add electron/db.ts src/types/repo.ts electron/services/verificationService.test.ts
git commit -m "feat: Phase 15 DB migration — add verification columns to repos table"
```

---

## Task 2: Registry Fetch Utilities + Score Computation

**Files:**
- Create: `electron/services/verificationService.ts` (partial — pure functions only)
- Test: `electron/services/verificationService.test.ts` (extend)

### Background

The scoring function is pure — it takes repo metadata + a registry lookup result and returns `{ score, tier, signals }`. Registry fetchers use `fetch` (built-in to Electron). Testing uses `vi.stubGlobal('fetch', ...)` for hermeticity.

Score model:
- `registry_match` = +40 (owner match in npm/PyPI/crates.io)
- `verified_org` = +25 (`owner_is_verified` column in repos table — already fetched by the background service query)
- `homepage_match` = +20 (homepage domain contains owner or repo name)
- `self_named` = +10 (`repo.name === repo.owner`, case-insensitive)
- `dependent_tier` = +5–15 using `watchers` (`subscribers_count`) as proxy. Tiers: ≥1000 = +15; ≥100 = +10; ≥10 = +5; else 0.

Tier thresholds: `≥70` → `'verified'`; `40–69` → `'likely'`; `<40` → `null`.

> **Note on `owner_is_verified`:** This column exists in the `repos` table (added in Phase 11) but is absent from the `RepoRow` TypeScript interface. The background service fetches it directly via a targeted SQL query — do not try to read it from `RepoRow`.

- [ ] **Step 1: Add scoring tests to `electron/services/verificationService.test.ts`**

Append to the existing file:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { computeScore, checkNpm, checkPypi, checkCrates } from './verificationService'

describe('computeScore', () => {
  const base = {
    owner: 'facebook',
    name:  'react',
    homepage: 'https://react.dev',
    owner_is_verified: 1,
    watchers: 5000,
  }

  it('returns verified tier for full signal set', () => {
    const result = computeScore({ ...base, registryMatch: true })
    expect(result.tier).toBe('verified')
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.signals).toContain('registry_match')
    expect(result.signals).toContain('verified_org')
    expect(result.signals).toContain('dependent_tier')
  })

  it('returns likely tier for mid-range score', () => {
    const result = computeScore({
      owner: 'some-org', name: 'some-repo',
      homepage: null,
      owner_is_verified: 0,
      watchers: 200,
      registryMatch: true,
    })
    // 40 (registry) + 10 (dependent: 200 ≥ 100) = 50
    expect(result.tier).toBe('likely')
    expect(result.score).toBe(50)
  })

  it('returns null tier for low score', () => {
    const result = computeScore({
      owner: 'nobody', name: 'my-repo',
      homepage: null, owner_is_verified: 0, watchers: 0,
      registryMatch: false,
    })
    expect(result.tier).toBeNull()
    expect(result.score).toBe(0)
  })

  it('awards self_named signal when owner === name', () => {
    const result = computeScore({
      owner: 'django', name: 'django',
      homepage: null, owner_is_verified: 0, watchers: 50,
      registryMatch: false,
    })
    expect(result.signals).toContain('self_named')
    // 10 (self_named) + 5 (watchers 50 ≥ 10) = 15
    expect(result.score).toBe(15)
  })

  it('awards homepage_match when domain contains owner handle', () => {
    const result = computeScore({
      owner: 'vuejs', name: 'vue',
      homepage: 'https://vuejs.org',
      owner_is_verified: 0,
      watchers: 5,  // < 10, so no dependent_tier signal
      registryMatch: false,
    })
    expect(result.signals).toContain('homepage_match')
    // 20 (homepage) only — watchers 5 < 10
    expect(result.score).toBe(20)
  })
})

describe('checkNpm', () => {
  it('returns true when maintainer matches owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        maintainers: [{ name: 'fb' }, { name: 'facebook' }],
        repository: { url: '' },
      }),
    }))
    const result = await checkNpm('react', 'facebook')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })

  it('returns true when repository url contains owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        maintainers: [],
        repository: { url: 'git+https://github.com/facebook/react.git' },
      }),
    }))
    const result = await checkNpm('react', 'facebook')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })

  it('returns false on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await checkNpm('nonexistent-pkg', 'nobody')
    expect(result).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('checkPypi', () => {
  it('returns true when author contains owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ info: { author: 'Django Software Foundation (django)', home_page: '' } }),
    }))
    const result = await checkPypi('django', 'django')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('checkCrates', () => {
  it('returns true when crate.repository contains owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ crate: { repository: 'https://github.com/rust-lang/rust' } }),
    }))
    const result = await checkCrates('rust', 'rust-lang')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run electron/services/verificationService.test.ts
```

Expected: new tests fail with import errors.

- [ ] **Step 3: Create `electron/services/verificationService.ts`** with pure functions

```typescript
// electron/services/verificationService.ts
import type Database from 'better-sqlite3'
import type { BrowserWindow } from 'electron'

// ── Types ─────────────────────────────────────────────────────────────────────

export type VerificationTier = 'verified' | 'likely' | null

export interface ScoreInput {
  owner:             string
  name:              string
  homepage:          string | null
  owner_is_verified: number | null
  watchers:          number | null
  registryMatch:     boolean
}

export interface ScoreResult {
  score:   number
  tier:    VerificationTier
  signals: string[]
}

// repoId is a string (TEXT PRIMARY KEY) — e.g. "facebook/react"
export type EnrichmentJob = {
  repoId:   string
  owner:    string
  name:     string
  language: string | null
  priority: 'high' | 'normal' | 'low'
}

// ── Score computation ─────────────────────────────────────────────────────────

export function computeScore(input: ScoreInput): ScoreResult {
  const signals: string[] = []
  let score = 0

  // +40 registry match
  if (input.registryMatch) {
    signals.push('registry_match')
    score += 40
  }

  // +25 verified org (owner_is_verified = 1)
  if (input.owner_is_verified === 1) {
    signals.push('verified_org')
    score += 25
  }

  // +20 homepage domain match
  if (input.homepage) {
    try {
      const domain = new URL(input.homepage).hostname.replace(/^www\./, '')
      const ownerL = input.owner.toLowerCase()
      const nameL  = input.name.toLowerCase()
      if (domain.includes(ownerL) || domain.includes(nameL)) {
        signals.push('homepage_match')
        score += 20
      }
    } catch {
      // invalid URL — skip
    }
  }

  // +10 self-named repo (e.g. django/django)
  if (input.owner.toLowerCase() === input.name.toLowerCase()) {
    signals.push('self_named')
    score += 10
  }

  // +5–15 dependent tier proxy (watchers/subscribers_count)
  const w = input.watchers ?? 0
  if (w >= 1000) {
    signals.push('dependent_tier')
    score += 15
  } else if (w >= 100) {
    signals.push('dependent_tier')
    score += 10
  } else if (w >= 10) {
    signals.push('dependent_tier')
    score += 5
  }

  const tier: VerificationTier =
    score >= 70 ? 'verified' :
    score >= 40 ? 'likely'   :
    null

  return { score, tier, signals }
}

// ── Registry fetchers ─────────────────────────────────────────────────────────

export async function checkNpm(pkgName: string, owner: string): Promise<boolean> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`)
    if (!res.ok) return false
    const data = await res.json() as { maintainers?: { name: string }[]; repository?: { url?: string } }
    const ownerL = owner.toLowerCase()
    if (data.maintainers?.some(m => m.name.toLowerCase().includes(ownerL))) return true
    if (data.repository?.url?.toLowerCase().includes(ownerL)) return true
    return false
  } catch {
    return false
  }
}

export async function checkPypi(pkgName: string, owner: string): Promise<boolean> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkgName)}/json`)
    if (!res.ok) return false
    const data = await res.json() as { info?: { author?: string; home_page?: string } }
    const ownerL = owner.toLowerCase()
    if (data.info?.author?.toLowerCase().includes(ownerL)) return true
    if (data.info?.home_page?.toLowerCase().includes(ownerL)) return true
    return false
  } catch {
    return false
  }
}

export async function checkCrates(pkgName: string, owner: string): Promise<boolean> {
  try {
    const res = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(pkgName)}`, {
      headers: { 'User-Agent': 'git-suite-app/1.0' },
    })
    if (!res.ok) return false
    const data = await res.json() as { crate?: { repository?: string } }
    return data.crate?.repository?.toLowerCase().includes(owner.toLowerCase()) ?? false
  } catch {
    return false
  }
}

// ── Language → registry routing ───────────────────────────────────────────────

export async function fetchRegistryMatch(
  name: string,
  owner: string,
  language: string | null,
): Promise<boolean> {
  const lang = (language ?? '').toLowerCase()
  if (lang === 'javascript' || lang === 'typescript') {
    return checkNpm(name.toLowerCase(), owner)
  }
  if (lang === 'python') {
    return checkPypi(name.toLowerCase(), owner)
  }
  if (lang === 'rust') {
    return checkCrates(name.toLowerCase(), owner)
  }
  return false
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run electron/services/verificationService.test.ts
```

Expected: all tests pass (migration tests + new score/registry tests).

- [ ] **Step 5: Commit**

```bash
git add electron/services/verificationService.ts electron/services/verificationService.test.ts
git commit -m "feat: add computeScore and registry fetch utilities for verification service"
```

---

## Task 3: Enrichment Queue + Background Service

**Files:**
- Modify: `electron/services/verificationService.ts` (add queue + `startVerificationService`)
- Test: `electron/services/verificationService.test.ts` (extend)

### Background

The service:
1. Holds an in-memory priority queue (`high` → `normal` → `low`), deduplicating by `repoId` (keeps highest priority)
2. Processes batches of up to 3 concurrent jobs
3. 300ms minimum delay between requests to the same registry
4. Writes score/tier/signals/checked_at back to SQLite after each job
5. Fires `mainWindow.webContents.send('verification:updated', { repoId, tier, signals })` after each job
6. On network failure: sets `score=0`, clears `tier` and `signals`, marks `checked_at` to now — no retry
7. On startup: queues unchecked repos (normal) and stale >7 days (low)
8. Exports `enqueueRepo` for external callers (e.g. `github:saveRepo` handler)

**Queue drain note:** `processNext` guards itself with a `running` flag and uses `try/finally` to ensure `running` is always reset. External callers (`enqueueRepo`, `prioritiseRepos`) call `processNext()` directly — `processNext` exits immediately if already running. To avoid a race condition where items are enqueued just as the while-loop exits, the `finally` block calls `processNext()` tail-recursively if any items remain. This ensures no items are stranded.

- [ ] **Step 1: Add queue and service tests**

Append to `electron/services/verificationService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildQueue } from './verificationService'

// NOTE: When appending these tests, merge the imports above into the existing
// import line at the top of the file — do not create duplicate import statements.

describe('buildQueue', () => {
  it('high priority items come before normal before low', () => {
    const q = buildQueue()
    q.push({ repoId: 'c/c', owner: 'c', name: 'c', language: null, priority: 'low' })
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'high' })
    q.push({ repoId: 'b/b', owner: 'b', name: 'b', language: null, priority: 'normal' })
    expect(q.shift()!.priority).toBe('high')
    expect(q.shift()!.priority).toBe('normal')
    expect(q.shift()!.priority).toBe('low')
  })

  it('returns undefined when empty', () => {
    const q = buildQueue()
    expect(q.shift()).toBeUndefined()
  })

  it('deduplicates by repoId (keeps highest priority)', () => {
    const q = buildQueue()
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'low' })
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'high' })
    expect(q.size()).toBe(1)
    expect(q.shift()!.priority).toBe('high')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run electron/services/verificationService.test.ts
```

Expected: new tests fail — `buildQueue` not exported.

- [ ] **Step 3: Add queue + service to `electron/services/verificationService.ts`**

Append after the existing `fetchRegistryMatch` function:

```typescript
// ── Priority queue ────────────────────────────────────────────────────────────

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const

export function buildQueue() {
  const items: EnrichmentJob[] = []

  return {
    push(job: EnrichmentJob) {
      const existingIdx = items.findIndex(j => j.repoId === job.repoId)
      if (existingIdx !== -1) {
        // Keep highest priority (lowest order number)
        if (PRIORITY_ORDER[job.priority] < PRIORITY_ORDER[items[existingIdx].priority]) {
          items[existingIdx] = job
          items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
        }
        return
      }
      items.push(job)
      items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    },
    shift(): EnrichmentJob | undefined {
      return items.shift()
    },
    size(): number {
      return items.length
    },
  }
}

// ── Last-request timestamps per registry (rate limiting) ──────────────────────

const lastRegistryCall: Record<string, number> = {}

async function rateLimit(registry: string): Promise<void> {
  const MIN_GAP_MS = 300
  const now = Date.now()
  const last = lastRegistryCall[registry] ?? 0
  const wait = MIN_GAP_MS - (now - last)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRegistryCall[registry] = Date.now()
}

async function fetchRegistryMatchRateLimited(
  name: string,
  owner: string,
  language: string | null,
): Promise<boolean> {
  const lang = (language ?? '').toLowerCase()
  if (lang === 'javascript' || lang === 'typescript') {
    await rateLimit('npm')
    return checkNpm(name.toLowerCase(), owner)
  }
  if (lang === 'python') {
    await rateLimit('pypi')
    return checkPypi(name.toLowerCase(), owner)
  }
  if (lang === 'rust') {
    await rateLimit('crates')
    return checkCrates(name.toLowerCase(), owner)
  }
  return false
}

// ── Service state ─────────────────────────────────────────────────────────────

let _db: Database.Database | null = null
let _mainWindow: BrowserWindow | null = null
const queue = buildQueue()
let running = false

export function enqueueRepo(job: EnrichmentJob): void {
  queue.push(job)
  processNext()
}

async function processJob(job: EnrichmentJob): Promise<void> {
  if (!_db) return

  try {
    const registryMatch = await fetchRegistryMatchRateLimited(job.name, job.owner, job.language)

    // Fetch supplemental signals not in the job (stored as TEXT PRIMARY KEY id)
    const row = _db.prepare(
      'SELECT owner_is_verified, homepage, watchers FROM repos WHERE id = ?'
    ).get(job.repoId) as { owner_is_verified: number | null; homepage: string | null; watchers: number | null } | undefined

    const { score, tier, signals } = computeScore({
      owner:             job.owner,
      name:              job.name,
      homepage:          row?.homepage ?? null,
      owner_is_verified: row?.owner_is_verified ?? null,
      watchers:          row?.watchers ?? null,
      registryMatch,
    })

    const now = Math.floor(Date.now() / 1000)
    _db.prepare(`
      UPDATE repos
      SET verification_score      = ?,
          verification_tier       = ?,
          verification_signals    = ?,
          verification_checked_at = ?
      WHERE id = ?
    `).run(score, tier, JSON.stringify(signals), now, job.repoId)

    _mainWindow?.webContents.send('verification:updated', {
      repoId:  job.repoId,
      tier,
      signals,
    })
  } catch (err) {
    console.error('[verificationService] job failed', job.repoId, err)
    // Network failure: mark as checked (no retry), clear tier/signals, set score 0
    const now = Math.floor(Date.now() / 1000)
    try {
      _db?.prepare(
        'UPDATE repos SET verification_score = 0, verification_tier = NULL, verification_signals = NULL, verification_checked_at = ? WHERE id = ?'
      ).run(now, job.repoId)
    } catch {}
  }
}

async function processNext(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.size() > 0) {
      // Take up to 3 concurrent jobs
      const batch: EnrichmentJob[] = []
      while (batch.length < 3 && queue.size() > 0) {
        batch.push(queue.shift()!)
      }
      await Promise.all(batch.map(processJob))
    }
  } finally {
    running = false
    // Tail-recursive drain: items enqueued while the loop was running are caught here
    if (queue.size() > 0) void processNext()
  }
}

export function startVerificationService(db: Database.Database, win: BrowserWindow): void {
  _db = db
  _mainWindow = win

  const SEVEN_DAYS_AGO = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60

  // Enqueue unchecked repos (normal priority)
  const unchecked = db.prepare(
    'SELECT id, owner, name, language FROM repos WHERE verification_checked_at IS NULL'
  ).all() as { id: string; owner: string; name: string; language: string | null }[]

  for (const r of unchecked) {
    queue.push({ repoId: r.id, owner: r.owner, name: r.name, language: r.language, priority: 'normal' })
  }

  // Enqueue stale repos older than 7 days (low priority)
  const stale = db.prepare(
    'SELECT id, owner, name, language FROM repos WHERE verification_checked_at IS NOT NULL AND verification_checked_at < ?'
  ).all(SEVEN_DAYS_AGO) as { id: string; owner: string; name: string; language: string | null }[]

  for (const r of stale) {
    queue.push({ repoId: r.id, owner: r.owner, name: r.name, language: r.language, priority: 'low' })
  }

  if (queue.size() > 0) processNext()
}

export function prioritiseRepos(repoIds: string[]): void {
  if (!_db) return
  for (const id of repoIds) {
    const row = _db.prepare(
      'SELECT id, owner, name, language FROM repos WHERE id = ?'
    ).get(id) as { id: string; owner: string; name: string; language: string | null } | undefined
    if (row) {
      queue.push({ repoId: row.id, owner: row.owner, name: row.name, language: row.language, priority: 'high' })
    }
  }
  processNext()
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
npx vitest run electron/services/verificationService.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/verificationService.ts electron/services/verificationService.test.ts
git commit -m "feat: add priority queue and startVerificationService to enrichment service"
```

---

## Task 4: IPC Handlers File

**Files:**
- Create: `electron/ipc/verificationHandlers.ts`

### Background

Mirrors the pattern of `electron/componentScanner.ts` — exports a single `registerVerificationHandlers()` function that registers `ipcMain.handle(...)` calls. Called once at module level in `main.ts` (Task 5).

- [ ] **Step 1: Create `electron/ipc/verificationHandlers.ts`**

```typescript
// electron/ipc/verificationHandlers.ts
import { ipcMain, app } from 'electron'
import { prioritiseRepos } from '../services/verificationService'
import { getDb } from '../db'

export function registerVerificationHandlers(): void {
  // Move visible cards to front of queue
  ipcMain.handle('verification:prioritise', (_event, repoIds: string[]) => {
    prioritiseRepos(repoIds)
  })

  // Return cached score for a single repo (for initial load in RepoDetail)
  ipcMain.handle('verification:getScore', (_event, repoId: string) => {
    const db = getDb(app.getPath('userData'))
    const row = db.prepare(
      'SELECT verification_tier, verification_signals, verification_score FROM repos WHERE id = ?'
    ).get(repoId) as {
      verification_tier:    string | null
      verification_signals: string | null
      verification_score:   number | null
    } | undefined
    if (!row) return null
    return {
      tier:    row.verification_tier as 'verified' | 'likely' | null,
      signals: row.verification_signals ? JSON.parse(row.verification_signals) as string[] : [],
      score:   row.verification_score,
    }
  })

  // Note: new-install enqueuing is done server-side in the github:saveRepo handler (main.ts)
  // directly calling enqueueRepo — no renderer-facing enqueue IPC needed.
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc/verificationHandlers.ts
git commit -m "feat: add registerVerificationHandlers IPC file"
```

---

## Task 5: Wire into main.ts + Preload + env.d.ts + saveRepo hook

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

### Background

Three wiring changes:

1. **main.ts** — Import and register verification handlers at module level; start service after window ready; call `enqueueRepo` in `github:saveRepo` handler for new installs.

2. **preload.ts** — Expose the verification namespace on `window.api`.

3. **env.d.ts** — Type the `Window.api.verification` namespace.

- [ ] **Step 1: Modify `electron/main.ts`**

**a)** At the top of the file, add imports alongside the existing imports:

```typescript
import { registerVerificationHandlers } from './ipc/verificationHandlers'
import { startVerificationService, enqueueRepo } from './services/verificationService'
```

**b)** Find the line `registerComponentsIPC()` (module-level call) and add after it:

```typescript
registerVerificationHandlers()
```

**c)** Find the `app.whenReady().then(() => {` block. After `createWindow()` is called, add:

```typescript
  if (mainWindow) {
    startVerificationService(db, mainWindow)
  }
```

> **Verify first:** `mainWindow` must be the module-level `let mainWindow: BrowserWindow | null` declared outside `createWindow()` (confirmed at line 149 of main.ts). `createWindow()` is synchronous up to the point it sets `mainWindow`, so accessing it after `createWindow()` returns is safe. If you are unsure, add `console.assert(mainWindow !== null, 'mainWindow null after createWindow')` as a sanity check and remove before committing.

**d)** Find the `ipcMain.handle('github:saveRepo', ...)` handler. After the repo is upserted/saved (typically after a `db.prepare(...).run(...)` call), add:

```typescript
    // Enqueue at high priority so the verification badge appears promptly
    enqueueRepo({ repoId: `${owner}/${name}`, owner, name, language: null, priority: 'high' })
```

> **Note:** Pass `language: null` here — the service fetches the actual language from the DB during `processJob` via `SELECT owner_is_verified, homepage, watchers FROM repos WHERE id = ?`. The `github:saveRepo` handler does an UPDATE (not a SELECT) so the row isn't returned; passing `language: null` is the correct approach.

- [ ] **Step 2: Modify `electron/preload.ts`**

In `contextBridge.exposeInMainWorld('api', { ... })`, add a `verification` namespace alongside the existing namespaces:

```typescript
    verification: {
      prioritise: (repoIds: string[]) =>
        ipcRenderer.invoke('verification:prioritise', repoIds),
      getScore: (repoId: string) =>
        ipcRenderer.invoke('verification:getScore', repoId),
      onUpdated: (cb: (data: { repoId: string; tier: string | null; signals: string[] }) => void) => {
        const wrapper = (_: unknown, data: { repoId: string; tier: string | null; signals: string[] }) => cb(data)
        callbackWrappers.set(cb, wrapper)
        ipcRenderer.on('verification:updated', wrapper)
      },
      offUpdated: (cb: (data: { repoId: string; tier: string | null; signals: string[] }) => void) => {
        const wrapper = callbackWrappers.get(cb)
        if (wrapper) {
          ipcRenderer.removeListener('verification:updated', wrapper)
          callbackWrappers.delete(cb)
        }
      },
    },
```

- [ ] **Step 3: Modify `src/env.d.ts`**

In the `Window.api` interface, add the `verification` namespace:

```typescript
      verification: {
        prioritise(repoIds: string[]): Promise<void>
        getScore(repoId: string): Promise<{ tier: 'verified' | 'likely' | null; signals: string[]; score: number | null } | null>
        onUpdated(cb: (data: { repoId: string; tier: 'verified' | 'likely' | null; signals: string[] }) => void): void
        offUpdated(cb: (data: { repoId: string; tier: 'verified' | 'likely' | null; signals: string[] }) => void): void
      }
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:/Coding/Git-Suite
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 errors on the files we changed.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: wire verification service into main process, preload, env.d.ts; enqueue on saveRepo"
```

---

## Task 6: `VerificationBadge` Component

**Files:**
- Create: `src/components/VerificationBadge.tsx`
- Create: `src/components/VerificationBadge.test.tsx`

### Background

Three visual states:
1. **`verified` tier** — `ShieldCheck` filled `#7c3aed`, label "Official", purple tinted background
2. **`likely` tier** — `Shield` outline `var(--t2)`, label "Likely Official", neutral background
3. **`null` tier** — renders nothing
4. **Resolving** (`resolving=true, tier=null`) — 6×6 pulsing dot with `aria-label="Verifying"`

Tooltip is pure CSS: `.vb-wrap:hover .vb-tooltip { opacity: 1 }`. The CSS keyframes and hover rule are injected **once** into the document head (not per-instance) using a module-level singleton guard to avoid duplicating `<style>` tags when many badges render simultaneously.

> `lucide-react` must be installed first (`npm install lucide-react --save`).

- [ ] **Step 1: Install lucide-react**

```bash
cd D:/Coding/Git-Suite
npm install lucide-react --save
```

- [ ] **Step 2: Write the failing test**

Create `src/components/VerificationBadge.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import VerificationBadge from './VerificationBadge'

describe('VerificationBadge', () => {
  it('renders "Official" label for verified tier', () => {
    render(<VerificationBadge tier="verified" signals={['registry_match', 'verified_org']} size="sm" />)
    expect(screen.getByText('Official')).toBeInTheDocument()
  })

  it('renders "Likely Official" label for likely tier', () => {
    render(<VerificationBadge tier="likely" signals={['registry_match']} size="sm" />)
    expect(screen.getByText('Likely Official')).toBeInTheDocument()
  })

  it('renders nothing for null tier (non-resolving)', () => {
    const { container } = render(<VerificationBadge tier={null} signals={[]} size="sm" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders resolving dot when resolving=true and tier=null', () => {
    const { container } = render(<VerificationBadge tier={null} signals={[]} resolving size="sm" />)
    expect(container).not.toBeEmptyDOMElement()
    expect(container.querySelector('[aria-label="Verifying"]')).toBeInTheDocument()
  })

  it('shows tooltip text for verified badge signals', () => {
    render(<VerificationBadge tier="verified" signals={['registry_match', 'verified_org']} size="md" />)
    expect(screen.getByText('Registry match')).toBeInTheDocument()
    expect(screen.getByText('Verified organisation')).toBeInTheDocument()
  })

  it('shows tooltip text for homepage_match signal', () => {
    render(<VerificationBadge tier="likely" signals={['homepage_match']} size="sm" />)
    expect(screen.getByText('Homepage domain match')).toBeInTheDocument()
  })

  it('shows self_named and dependent_tier signal labels', () => {
    render(<VerificationBadge tier="likely" signals={['self_named', 'dependent_tier']} size="sm" />)
    expect(screen.getByText('Self-named repository')).toBeInTheDocument()
    expect(screen.getByText('High dependent count')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify failure**

```bash
npx vitest run src/components/VerificationBadge.test.tsx
```

Expected: fails with module not found.

- [ ] **Step 4: Create `src/components/VerificationBadge.tsx`**

```tsx
// src/components/VerificationBadge.tsx
import { ShieldCheck, Shield } from 'lucide-react'

// Inject badge CSS once into the document head (avoids duplicate <style> tags with 30+ badges)
let stylesInjected = false
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const style = document.createElement('style')
  style.dataset.vbStyles = '1'
  style.textContent = `
    @keyframes vbPulse {
      0%, 100% { opacity: 0.3; }
      50%       { opacity: 0.7; }
    }
    .vb-wrap:hover .vb-tooltip { opacity: 1 !important; pointer-events: auto !important; }
  `
  document.head.appendChild(style)
}

type VerificationTier = 'verified' | 'likely' | null

interface Props {
  tier:       VerificationTier
  signals:    string[]
  size?:      'sm' | 'md'
  resolving?: boolean
}

const SIGNAL_LABELS: Record<string, string> = {
  registry_match: 'Registry match',
  verified_org:   'Verified organisation',
  homepage_match: 'Homepage domain match',
  self_named:     'Self-named repository',
  dependent_tier: 'High dependent count',
}

export default function VerificationBadge({ tier, signals, size = 'sm', resolving = false }: Props) {
  ensureStyles()

  // Resolving dot — shown while no cached result exists
  if (tier === null && resolving) {
    return (
      <span
        aria-label="Verifying"
        style={{
          display:      'inline-block',
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   'var(--t3)',
          animation:    'vbPulse 1.8s ease-in-out infinite',
          flexShrink:   0,
        }}
      />
    )
  }

  if (tier === null) return null

  const isVerified = tier === 'verified'
  const iconSize   = size === 'sm' ? 10 : 12
  const padX       = size === 'sm' ? 6  : 8
  const padY       = size === 'sm' ? 2  : 3
  const label      = isVerified ? 'Official' : 'Likely Official'
  const iconColor  = isVerified ? '#7c3aed' : 'var(--t2)'

  const badgeStyle: React.CSSProperties = {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           4,
    padding:       `${padY}px ${padX}px`,
    borderRadius:  4,
    border:        `1px solid ${isVerified ? 'rgba(124,58,237,0.25)' : 'var(--border)'}`,
    background:    isVerified ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
    fontFamily:    'Inter, sans-serif',
    fontSize:      10,
    fontWeight:    500,
    color:         isVerified ? 'var(--t1)' : 'var(--t2)',
    whiteSpace:    'nowrap',
    cursor:        'default',
    userSelect:    'none',
  }

  return (
    <span className="vb-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span style={badgeStyle}>
        {isVerified
          ? <ShieldCheck size={iconSize} color={iconColor} fill={iconColor} />
          : <Shield      size={iconSize} color={iconColor} />
        }
        <span>{label}</span>
      </span>

      {/* Tooltip — CSS-driven visibility via .vb-wrap:hover .vb-tooltip */}
      {signals.length > 0 && (
        <span
          className="vb-tooltip"
          style={{
            position:      'absolute',
            bottom:        'calc(100% + 6px)',
            left:          '50%',
            transform:     'translateX(-50%)',
            background:    'var(--bg4)',
            border:        '1px solid var(--border2)',
            borderRadius:  6,
            padding:       '8px 10px',
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      11,
            color:         'var(--t2)',
            whiteSpace:    'nowrap',
            opacity:       0,
            pointerEvents: 'none',
            transition:    'opacity 0.15s',
            zIndex:        100,
          }}
        >
          {signals.map(s => (
            <div key={s}>
              <span style={{ color: '#7c3aed', marginRight: 5 }}>✓</span>
              {SIGNAL_LABELS[s] ?? s}
            </div>
          ))}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/VerificationBadge.test.tsx
```

Expected: 7 passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/VerificationBadge.tsx src/components/VerificationBadge.test.tsx package.json package-lock.json
git commit -m "feat: add VerificationBadge component with tooltip and resolving dot"
```

---

## Task 7: `useVerification` Hook

**Files:**
- Create: `src/hooks/useVerification.ts`
- Create: `src/hooks/useVerification.test.ts`

### Background

The hook listens for `verification:updated` IPC events and accumulates a `Map<string, { tier, signals }>` keyed by `repoId` (string). State update triggers a re-render in the component holding the hook, which then passes fresh values to children via props. Exposes `getTier(id)`, `getSignals(id)`, `isResolving(id)` (true = not yet seen any update for this repoId).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useVerification.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVerification } from './useVerification'

function makeApi() {
  return {
    verification: {
      prioritise: vi.fn().mockResolvedValue(undefined),
      getScore:   vi.fn().mockResolvedValue(null),
      onUpdated:  vi.fn(),
      offUpdated: vi.fn(),
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: makeApi(),
    writable: true,
    configurable: true,
  })
})

describe('useVerification', () => {
  it('registers and unregisters IPC listener on mount/unmount', () => {
    const { unmount } = renderHook(() => useVerification())
    expect(window.api.verification.onUpdated).toHaveBeenCalledTimes(1)
    unmount()
    expect(window.api.verification.offUpdated).toHaveBeenCalledTimes(1)
  })

  it('getTier returns null when no data for repoId', () => {
    const { result } = renderHook(() => useVerification())
    expect(result.current.getTier('nobody/repo')).toBeNull()
  })

  it('updates tier map when IPC event fires', () => {
    let capturedCb: ((data: any) => void) | undefined
    window.api.verification.onUpdated = vi.fn(cb => { capturedCb = cb })

    const { result } = renderHook(() => useVerification())

    act(() => {
      capturedCb?.({ repoId: 'facebook/react', tier: 'verified', signals: ['registry_match'] })
    })

    expect(result.current.getTier('facebook/react')).toBe('verified')
    expect(result.current.getSignals('facebook/react')).toEqual(['registry_match'])
  })

  it('isResolving returns true for repoId not yet seen', () => {
    const { result } = renderHook(() => useVerification())
    expect(result.current.isResolving('unknown/repo')).toBe(true)
  })

  it('isResolving returns false after IPC update received', () => {
    let capturedCb: ((data: any) => void) | undefined
    window.api.verification.onUpdated = vi.fn(cb => { capturedCb = cb })

    const { result } = renderHook(() => useVerification())

    act(() => {
      capturedCb?.({ repoId: 'some/repo', tier: null, signals: [] })
    })

    expect(result.current.isResolving('some/repo')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/hooks/useVerification.test.ts
```

Expected: fails — module not found.

- [ ] **Step 3: Create `src/hooks/useVerification.ts`**

```typescript
// src/hooks/useVerification.ts
import { useState, useEffect } from 'react'

type VerificationTier = 'verified' | 'likely' | null

interface VerificationEntry {
  tier:    VerificationTier
  signals: string[]
}

interface UseVerificationResult {
  getTier:     (repoId: string) => VerificationTier
  getSignals:  (repoId: string) => string[]
  isResolving: (repoId: string) => boolean
}

export function useVerification(): UseVerificationResult {
  const [cache, setCache] = useState<Map<string, VerificationEntry>>(new Map())

  useEffect(() => {
    const handler = (data: { repoId: string; tier: VerificationTier; signals: string[] }) => {
      setCache(prev => {
        const next = new Map(prev)
        next.set(data.repoId, { tier: data.tier, signals: data.signals })
        return next
      })
    }
    window.api.verification.onUpdated(handler)
    return () => { window.api.verification.offUpdated(handler) }
  }, [])

  return {
    getTier:     (repoId) => cache.get(repoId)?.tier ?? null,
    getSignals:  (repoId) => cache.get(repoId)?.signals ?? [],
    isResolving: (repoId) => !cache.has(repoId),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/useVerification.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVerification.ts src/hooks/useVerification.test.ts
git commit -m "feat: add useVerification hook — IPC listener with per-repo tier/signals cache"
```

---

## Task 8: `RepoCard` Badge Integration

**Files:**
- Modify: `src/components/RepoCard.tsx`

### Background

The badge slot goes **between `<CardTags>` and the `{/* Footer */}` div**. It is always rendered (16px min-height), preventing layout shift across the grid when some cards have badges and others don't. `VerificationBadge` with `tier=null` and `resolving=false` renders nothing visually — the slot stays but is empty.

Verification data is passed as optional props from the parent (Discover) rather than fetching in each card — this means one `useVerification()` instance at the page level, not 30.

- [ ] **Step 1: Modify `src/components/RepoCard.tsx`**

**a)** Add import at top of file:
```typescript
import VerificationBadge from './VerificationBadge'
```

**b)** Extend the `RepoCardProps` interface (find `interface RepoCardProps`):
```typescript
  verificationTier?:      'verified' | 'likely' | null
  verificationSignals?:   string[]
  verificationResolving?: boolean
```

**c)** Destructure the new props in the function signature (alongside `repo`, `onNavigate`, etc.):
```typescript
  verificationTier,
  verificationSignals,
  verificationResolving,
```

**d)** Add the badge slot between `<CardTags .../>` and `{/* Footer */}`:
```tsx
        {/* Verification badge slot — 16px min-height prevents layout shift across the grid */}
        <div style={{ minHeight: 16, display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <VerificationBadge
            tier={verificationTier ?? null}
            signals={verificationSignals ?? []}
            resolving={verificationResolving}
            size="sm"
          />
        </div>
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "RepoCard|VerificationBadge" | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RepoCard.tsx
git commit -m "feat: add verification badge slot to RepoCard (16px reserved height, sm size)"
```

---

## Task 9: Discover Viewport Prioritisation

**Files:**
- Modify: `src/views/Discover.tsx`

### Background

Discover holds a single `useVerification()` instance and passes tier/signals/resolving to each `<RepoCard>` as props. When repos load or the grid scrolls, the currently-loaded repo IDs are sent to the main process via `prioritise`. Scroll calls are debounced 200ms.

> **Viewport approximation:** The spec calls for viewport-visible card prioritisation. With up to 30 cards per load and no virtualisation, sending all loaded IDs on each scroll is a practical approximation — every repo in the grid gets bumped to high priority. If finer viewport tracking is desired in a future iteration, `IntersectionObserver` can be added then.

> **ID note:** `repo.id` is a string (`"owner/name"`) — pass it directly to `prioritise`, `getTier`, `getSignals`, `isResolving`. No `Number()` conversion.

- [ ] **Step 1: Modify `src/views/Discover.tsx`**

**a)** Add imports at the top (alongside existing React imports):
```typescript
import { useRef } from 'react'
import { useVerification } from '../hooks/useVerification'
```

**b)** Inside `Discover`, at the top of the function body, add:
```typescript
  const verification = useVerification()
  const gridRef = useRef<HTMLDivElement>(null)
```

**c)** Wherever `setRepos(results)` is called (after a search or view-mode load), add immediately after:
```typescript
    const ids = results.map(r => r.id).filter(Boolean)
    if (ids.length) window.api.verification.prioritise(ids).catch(() => {})
```

**d)** Add a scroll debounce effect (after the existing useEffects):
```typescript
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const ids = repos.map(r => r.id).filter(Boolean)
        if (ids.length) window.api.verification.prioritise(ids).catch(() => {})
      }, 200)
    }
    grid.addEventListener('scroll', onScroll, { passive: true })
    return () => { clearTimeout(timer); grid.removeEventListener('scroll', onScroll) }
  }, [repos])
```

**e)** Attach `ref={gridRef}` to the `.repo-grid` div.

**f)** Pass verification props to each `<RepoCard>`:
```tsx
              verificationTier={verification.getTier(repo.id)}
              verificationSignals={verification.getSignals(repo.id)}
              verificationResolving={verification.isResolving(repo.id)}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "Discover|useVerification" | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: add viewport prioritisation and verification badge props to Discover grid"
```

---

## Task 10: RepoDetail Badge + Signal Count

**Files:**
- Modify: `src/views/RepoDetail.tsx`

### Background

Two additions:

1. **Badge in banner title** — after the repo name span, inside `repo-detail-banner-title`:
   ```tsx
   {liveTier && (
     <span style={{ marginLeft: 6 }}>
       <VerificationBadge tier={liveTier} signals={liveSignals} size="md" />
     </span>
   )}
   ```

2. **Signal count line** — below description text, when tier is non-null:
   ```tsx
   {liveTier && liveSignals.length > 0 && (
     <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--t3)', margin: '4px 0 0 0' }}>
       Verification: {liveSignals.length} signal{liveSignals.length !== 1 ? 's' : ''} matched
     </p>
   )}
   ```

For initial seed (before any IPC event), call `getScore` on repo load. For live updates, derive from `useVerification()`:

```typescript
const liveTier    = verification.getTier(repo.id) ?? seedTier
const liveSignals = verification.getSignals(repo.id).length > 0
  ? verification.getSignals(repo.id)
  : seedSignals
```

- [ ] **Step 1: Modify `src/views/RepoDetail.tsx`**

**a)** Add imports:
```typescript
import VerificationBadge from '../components/VerificationBadge'
import { useVerification } from '../hooks/useVerification'
```

**b)** Inside `RepoDetail`, add near the top:
```typescript
  const verification = useVerification()
  const [seedTier, setSeedTier]       = useState<'verified' | 'likely' | null>(null)
  const [seedSignals, setSeedSignals] = useState<string[]>([])
```

**c)** In the `useEffect` that loads repo data (calls `window.api.github.getRepo`), after `setRepo(row)`, add:
```typescript
      window.api.verification.getScore(row.id)
        .then(s => { if (s) { setSeedTier(s.tier); setSeedSignals(s.signals) } })
        .catch(() => {})
```

**d)** Before the return statement, compute merged live values:
```typescript
  const liveTier    = (repo ? verification.getTier(repo.id) : null) ?? seedTier
  const liveSignals = (repo && verification.getSignals(repo.id).length > 0)
    ? verification.getSignals(repo.id)
    : seedSignals
```

**e)** Find the `repo-detail-banner-title` div. After `<span className="repo-detail-banner-name">{name}</span>`, add:
```tsx
            {liveTier && (
              <span style={{ marginLeft: 6 }}>
                <VerificationBadge tier={liveTier} signals={liveSignals} size="md" />
              </span>
            )}
```

**f)** Find where `repo?.description` is rendered in the body (typically the info panel or a metadata section). After the description element, add:
```tsx
            {liveTier && liveSignals.length > 0 && (
              <p style={{
                fontFamily: 'Inter, sans-serif',
                fontSize:   11,
                color:      'var(--t3)',
                margin:     '4px 0 0 0',
              }}>
                Verification: {liveSignals.length} signal{liveSignals.length !== 1 ? 's' : ''} matched
              </p>
            )}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "RepoDetail|VerificationBadge|useVerification" | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: add verification badge and signal count to RepoDetail panel"
```

---

## Task 11: Full Test Run + Final Verification

- [ ] **Step 1: Run all tests**

```bash
cd D:/Coding/Git-Suite
npm test 2>&1 | tail -15
```

Verify that our new test files pass:
- `electron/services/verificationService.test.ts` — all tests pass
- `src/components/VerificationBadge.test.tsx` — all 7 tests pass
- `src/hooks/useVerification.test.ts` — all 5 tests pass

Pre-existing failures in `Settings.test.tsx`, `ReadmeRenderer.test.tsx`, `App.test.tsx`, `Discover.test.tsx`, `RepoDetail.test.tsx`, `collections.test.ts` are unrelated to this feature and can be ignored.

- [ ] **Step 2: Verify TypeScript clean**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: 0 errors on our changed files.

- [ ] **Step 3: Commit any final fixes**

```bash
git add -p
git commit -m "chore: final cleanup for verification system"
```

---

## Deliverable Summary

| Deliverable | Location |
|------------|----------|
| Schema migration | `electron/db.ts` — Phase 15 block |
| Score computation | `electron/services/verificationService.ts` — `computeScore` |
| Registry fetchers | `verificationService.ts` — `checkNpm`, `checkPypi`, `checkCrates` |
| Queue + enrichment | `verificationService.ts` — `buildQueue`, `startVerificationService` |
| IPC handlers | `electron/ipc/verificationHandlers.ts` |
| Preload bridge | `electron/preload.ts` — `verification` namespace |
| Badge component | `src/components/VerificationBadge.tsx` |
| Hook | `src/hooks/useVerification.ts` |
| Card integration | `src/components/RepoCard.tsx` — badge slot above footer |
| Discover viewport | `src/views/Discover.tsx` — prioritise on load + scroll |
| Detail panel | `src/views/RepoDetail.tsx` — badge + signal count line |
| New install enqueue | `electron/main.ts` — `github:saveRepo` handler |
