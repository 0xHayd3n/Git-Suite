# Recommendation System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline topic-frequency recommendation algorithm in `electron/main.ts` with a multi-signal recommendation engine that produces personalized, explainable recommendations ("because you starred X + Y").

**Architecture:** Extract the recommendation logic from `main.ts` into three focused modules: a pure-logic `recommendationEngine.ts` (profile, scoring, anchors), a `recommendationFetcher.ts` for GitHub queries, and an IPC handler `recommendHandlers.ts` that orchestrates them. Renderer receives an extended response shape (`RecommendationItem[]` with `anchors` and `scoreBreakdown`), and the Discover grid card renders a clickable "because you starred …" caption on the Recommended tab.

**Tech Stack:** TypeScript, Electron (main), React (renderer), better-sqlite3, Vitest for tests. GitHub Search API via existing `searchRepos()` helper.

**Reference spec:** [`docs/superpowers/specs/2026-04-15-recommendation-system-redesign-design.md`](../specs/2026-04-15-recommendation-system-redesign-design.md)

---

## File Structure

**New files:**
- `src/types/recommendation.ts` — shared types (renderer-safe)
- `electron/services/recommendationEngine.ts` — pure logic: profile building, scoring, anchor finding
- `electron/services/recommendationEngine.test.ts` — unit tests for the engine
- `electron/services/recommendationFetcher.ts` — GitHub query planning + batch fetch
- `electron/services/recommendationFetcher.test.ts` — tests with mocked `searchRepos`
- `electron/ipc/recommendHandlers.ts` — IPC orchestrator + `registerRecommendHandlers()`
- `electron/ipc/recommendHandlers.test.ts` — integration tests with mocked fetcher + mocked DB

**Modified files:**
- `electron/main.ts` — remove inline `github:getRecommended` handler, call `registerRecommendHandlers()`
- `src/views/Discover.tsx` — update response consumer to destructure `item.repo` from `RecommendationItem[]`
- `src/components/DiscoverGrid.tsx` (or its card subcomponent) — render anchor caption on Recommended tab
- `src/styles/globals.css` — style for the anchor caption

**Untouched (reused as-is):**
- `src/lib/classifyRepoType.ts` — call `classifyRepoBucket({ name, description, topics })` with `topics` as a JSON string
- `electron/github.ts` — `searchRepos(token, query, perPage, sort, order, page)`; pass `sort=''` for GitHub's best-match default
- `electron/db.ts` — no schema changes; the `settings` table already supports arbitrary keys

---

## Conventions

- **Test framework:** Vitest. Run all tests with `npm test`. Run a single file with `npm test -- path/to/file.test.ts`. Tests in `electron/` need `// @vitest-environment node` at the top.
- **IPC handler pattern:** handler file exports `register*Handlers()` function; `main.ts` imports and calls it once. Match `electron/ipc/ttsHandlers.ts` shape exactly.
- **No `classifyRepoType` — use `classifyRepoBucket`**: the latter accepts a plain `{ name, description, topics }` object where `topics` is a JSON string. It returns `{ bucket, subType } | null`.
- **Recency clock:** `buildUserProfile` takes an optional `now?: number` parameter (ms) for deterministic testing. Default: `Date.now()`.
- **Commits:** after each task completes and tests pass, commit with `feat:` / `refactor:` / `test:` prefix as appropriate.

---

## Task 1: Shared types

**Files:**
- Create: `src/types/recommendation.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/recommendation.ts
import type { GitHubRepo } from './github'  // or wherever GitHubRepo lives
import type { RepoRow } from './repo'

export interface TopicStats {
  /** How many repos in the local DB have each topic. */
  docFrequency: Map<string, number>
  /** Total repos considered. Used for IDF denominator and fallback threshold. */
  totalRepos: number
  /** Precomputed IDF = log(totalRepos / (1 + docFrequency[topic])). */
  idf: Map<string, number>
}

export interface UserProfile {
  /** IDF-weighted, recency-decayed, normalized. Sum of values = 1.0. */
  topicAffinity: Map<string, number>
  /** Normalized, sum = 1.0. */
  bucketDistribution: Map<string, number>
  subTypeDistribution: Map<string, number>
  languageWeights: Map<string, number>
  /** Star-count percentiles across the user's starred/saved repos. */
  starScale: { median: number; p25: number; p75: number }
  /** Top ~20 starred/saved repos for anchor finding. */
  anchorPool: RepoRow[]
  /** Total number of starred + saved repos used to build this profile. */
  repoCount: number
}

export interface ScoreBreakdown {
  topic: number
  bucket: number
  subType: number
  language: number
  scale: number
}

export interface Anchor {
  owner: string
  name: string
  /** Structured tokens, e.g. "topic:ai-agent", "bucket:ai-ml", "sub:ai-coding", "language:Python". */
  reasons: string[]
  similarity: number
}

export interface RecommendationItem {
  repo: GitHubRepo
  /** Composite weighted score in [0, 1]. */
  score: number
  scoreBreakdown: ScoreBreakdown
  /** Top 1-3 anchors ordered by similarity desc; empty if none cleared threshold. */
  anchors: Anchor[]
  /** Convenience: anchors[0] or null. */
  primaryAnchor: Anchor | null
}

/** Response envelope from the IPC handler. */
export interface RecommendationResponse {
  items: RecommendationItem[]
  /** True when the handler fell back to stale cache due to an API failure. */
  stale: boolean
  /** True when the user has <3 starred/saved repos. */
  coldStart: boolean
}
```

- [ ] **Step 2: Verify imports resolve**

Run: `npx tsc --noEmit`
Expected: no errors. If `GitHubRepo` lives at a different path, adjust the import. If the project doesn't have a `src/types/repo.ts`, check `src/types/` for the correct filename and adjust.

- [ ] **Step 3: Commit**

```bash
git add src/types/recommendation.ts
git commit -m "feat(recommend): add shared recommendation types"
```

---

## Task 2: Engine — `computeTopicStats`

A helper that scans all repos in the DB and computes per-topic document frequency and IDF. Used by the orchestrator to feed `buildUserProfile` and `findAnchors`.

**Files:**
- Create: `electron/services/recommendationEngine.ts`
- Create: `electron/services/recommendationEngine.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// electron/services/recommendationEngine.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeTopicStats } from './recommendationEngine'

function repo(topics: string[]): { topics: string } {
  return { topics: JSON.stringify(topics) }
}

describe('computeTopicStats', () => {
  it('returns zeros for empty input', () => {
    const stats = computeTopicStats([])
    expect(stats.totalRepos).toBe(0)
    expect(stats.docFrequency.size).toBe(0)
    expect(stats.idf.size).toBe(0)
  })

  it('counts doc frequency per topic', () => {
    const stats = computeTopicStats([
      repo(['rust', 'cli']),
      repo(['rust', 'web']),
      repo(['python']),
    ])
    expect(stats.totalRepos).toBe(3)
    expect(stats.docFrequency.get('rust')).toBe(2)
    expect(stats.docFrequency.get('cli')).toBe(1)
    expect(stats.docFrequency.get('python')).toBe(1)
  })

  it('computes IDF with log(N / (1 + df))', () => {
    const stats = computeTopicStats([
      repo(['rust']),
      repo(['rust']),
      repo(['rust']),
      repo(['python']),
    ])
    // rust: log(4 / (1+3)) = log(1) = 0
    // python: log(4 / (1+1)) = log(2) ≈ 0.693
    expect(stats.idf.get('rust')).toBeCloseTo(0, 5)
    expect(stats.idf.get('python')).toBeCloseTo(Math.log(2), 5)
  })

  it('ignores repos with malformed topics JSON', () => {
    const stats = computeTopicStats([
      { topics: 'not json' },
      { topics: JSON.stringify(['rust']) },
    ])
    expect(stats.totalRepos).toBe(2)
    expect(stats.docFrequency.get('rust')).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: FAIL with "computeTopicStats is not defined" or import error.

- [ ] **Step 3: Implement `computeTopicStats`**

```typescript
// electron/services/recommendationEngine.ts

export interface TopicStats {
  docFrequency: Map<string, number>
  totalRepos: number
  idf: Map<string, number>
}

interface RepoLike {
  topics: string  // JSON string
}

function safeParseTopics(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

export function computeTopicStats(repos: RepoLike[]): TopicStats {
  const docFrequency = new Map<string, number>()
  for (const r of repos) {
    const topics = new Set(safeParseTopics(r.topics))
    for (const topic of topics) {
      docFrequency.set(topic, (docFrequency.get(topic) ?? 0) + 1)
    }
  }
  const totalRepos = repos.length
  const idf = new Map<string, number>()
  for (const [topic, df] of docFrequency) {
    idf.set(topic, Math.log(totalRepos / (1 + df)))
  }
  return { docFrequency, totalRepos, idf }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/recommendationEngine.ts electron/services/recommendationEngine.test.ts
git commit -m "feat(recommend): add computeTopicStats with IDF"
```

---

## Task 3: Engine — `buildUserProfile`

Builds the full `UserProfile` from the user's starred/saved `RepoRow[]` and precomputed `TopicStats`.

**Files:**
- Modify: `electron/services/recommendationEngine.ts`
- Modify: `electron/services/recommendationEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the test file:

```typescript
import { buildUserProfile } from './recommendationEngine'
import type { RepoRow } from '../../src/types/repo'  // adjust path as needed

function makeRepo(overrides: Partial<RepoRow>): RepoRow {
  return {
    id: 'x', owner: 'o', name: 'n',
    description: null, language: null, license: null, homepage: null,
    topics: '[]', stars: 100, forks: null, watchers: null, size: null,
    open_issues: null, created_at: null, pushed_at: null, updated_at: null,
    type_bucket: null, type_sub: null, verification_tier: null,
    saved_at: null, starred_at: null,
    ...overrides,
  } as RepoRow
}

const NOW = Date.UTC(2026, 3, 15)  // April 15, 2026
const DAY = 24 * 60 * 60 * 1000

describe('buildUserProfile', () => {
  const emptyStats = { docFrequency: new Map(), totalRepos: 0, idf: new Map() }

  it('returns cold-start profile for empty input', () => {
    const profile = buildUserProfile({ userRepos: [], topicStats: emptyStats, now: NOW })
    expect(profile.repoCount).toBe(0)
    expect(profile.topicAffinity.size).toBe(0)
    expect(profile.anchorPool).toEqual([])
    expect(profile.starScale).toEqual({ median: 0, p25: 0, p75: 0 })
  })

  it('topic affinity uses IDF weighting and normalizes to sum=1', () => {
    // User starred 2 repos. 'rust' has low IDF (common), 'mcp-server' has high IDF (rare).
    const stats = {
      totalRepos: 100,
      docFrequency: new Map([['rust', 50], ['mcp-server', 2]]),
      idf: new Map([
        ['rust', Math.log(100 / 51)],       // ≈ 0.673
        ['mcp-server', Math.log(100 / 3)],  // ≈ 3.506
      ]),
    }
    const userRepos = [
      makeRepo({ topics: JSON.stringify(['rust', 'mcp-server']), starred_at: new Date(NOW).toISOString() }),
      makeRepo({ topics: JSON.stringify(['rust']), starred_at: new Date(NOW).toISOString() }),
    ]
    const profile = buildUserProfile({ userRepos, topicStats: stats, now: NOW })
    const sum = [...profile.topicAffinity.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
    // mcp-server should outweigh rust despite appearing less
    expect(profile.topicAffinity.get('mcp-server')!).toBeGreaterThan(profile.topicAffinity.get('rust')!)
  })

  it('recency decay: a 90-day-old star contributes ~0.5 of a fresh one', () => {
    // Use two distinct topics so normalization preserves their relative ratio.
    // 'fresh-topic' only appears in a fresh star; 'old-topic' only in a 90-day-old star.
    // Same IDF for both. After recency decay: fresh contributes 1.0, old contributes 0.5.
    // After normalization: fresh/old ratio should be ~2:1.
    const stats = {
      totalRepos: 10,
      docFrequency: new Map([['fresh-topic', 2], ['old-topic', 2]]),
      idf: new Map([['fresh-topic', 1], ['old-topic', 1]]),
    }
    const userRepos = [
      makeRepo({ id: '1', topics: JSON.stringify(['fresh-topic']), starred_at: new Date(NOW).toISOString() }),
      makeRepo({ id: '2', topics: JSON.stringify(['old-topic']), starred_at: new Date(NOW - 90 * DAY).toISOString() }),
    ]
    const profile = buildUserProfile({ userRepos, topicStats: stats, now: NOW })
    const fresh = profile.topicAffinity.get('fresh-topic')!
    const old = profile.topicAffinity.get('old-topic')!
    // Decay math: 0.5^(90/90) = 0.5, so ratio should be 2:1 after normalization
    expect(fresh / old).toBeCloseTo(2.0, 2)
  })

  it('bucket/subType/language distributions normalize to sum=1', () => {
    const userRepos = [
      makeRepo({ id: '1', type_bucket: 'ai-ml', type_sub: 'ai-coding', language: 'TypeScript' }),
      makeRepo({ id: '2', type_bucket: 'ai-ml', type_sub: 'ai-coding', language: 'TypeScript' }),
      makeRepo({ id: '3', type_bucket: 'dev-tools', type_sub: 'build-tool', language: 'Rust' }),
    ]
    const profile = buildUserProfile({ userRepos, topicStats: emptyStats, now: NOW })
    expect(profile.bucketDistribution.get('ai-ml')).toBeCloseTo(2 / 3, 5)
    expect(profile.bucketDistribution.get('dev-tools')).toBeCloseTo(1 / 3, 5)
    expect(profile.subTypeDistribution.get('ai-coding')).toBeCloseTo(2 / 3, 5)
    expect(profile.languageWeights.get('TypeScript')).toBeCloseTo(2 / 3, 5)
  })

  it('starScale returns median/p25/p75 percentiles', () => {
    const userRepos = [100, 500, 1000, 2000, 5000].map((stars, i) =>
      makeRepo({ id: String(i), stars })
    )
    const profile = buildUserProfile({ userRepos, topicStats: emptyStats, now: NOW })
    expect(profile.starScale.median).toBe(1000)
    expect(profile.starScale.p25).toBe(500)
    expect(profile.starScale.p75).toBe(2000)
  })

  it('anchorPool contains up to 20 most-recent signal-rich repos', () => {
    const userRepos = Array.from({ length: 30 }, (_, i) =>
      makeRepo({
        id: String(i),
        topics: JSON.stringify(['rust']),
        type_bucket: 'dev-tools',
        starred_at: new Date(NOW - i * DAY).toISOString(),
      })
    )
    const profile = buildUserProfile({ userRepos, topicStats: emptyStats, now: NOW })
    expect(profile.anchorPool.length).toBe(20)
    // Most recent first
    expect(profile.anchorPool[0].id).toBe('0')
  })

  it('anchorPool prioritizes signal-rich repos when recency is tied', () => {
    const richRepo = makeRepo({
      id: 'rich',
      topics: JSON.stringify(['rust', 'cli']),
      type_bucket: 'dev-tools',
      language: 'Rust',
      starred_at: new Date(NOW).toISOString(),
    })
    const poorRepo = makeRepo({
      id: 'poor',
      topics: '[]',
      type_bucket: null,
      language: null,
      starred_at: new Date(NOW).toISOString(),
    })
    const profile = buildUserProfile({ userRepos: [poorRepo, richRepo], topicStats: emptyStats, now: NOW })
    expect(profile.anchorPool[0].id).toBe('rich')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: FAIL with "buildUserProfile is not defined".

- [ ] **Step 3: Implement `buildUserProfile`**

Add to `electron/services/recommendationEngine.ts`:

```typescript
import type { RepoRow } from '../../src/types/repo'

export interface UserProfile {
  topicAffinity: Map<string, number>
  bucketDistribution: Map<string, number>
  subTypeDistribution: Map<string, number>
  languageWeights: Map<string, number>
  starScale: { median: number; p25: number; p75: number }
  anchorPool: RepoRow[]
  repoCount: number
}

const RECENCY_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000
const IDF_FALLBACK_THRESHOLD = 100
const ANCHOR_POOL_SIZE = 20

function recencyWeight(starredAt: string | null, now: number): number {
  if (!starredAt) return 1.0  // saved-only repos contribute full weight
  const ageMs = now - new Date(starredAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs < 0) return 1.0
  return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS)
}

function normalizeMap(m: Map<string, number>): Map<string, number> {
  const total = [...m.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return m
  const out = new Map<string, number>()
  for (const [k, v] of m) out.set(k, v / total)
  return out
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.floor((sortedAsc.length - 1) * p)
  return sortedAsc[idx]
}

function signalRichness(r: RepoRow): number {
  let score = 0
  const topics = safeParseTopics(r.topics)
  if (topics.length > 0) score += 1
  if (r.type_bucket) score += 1
  if (r.type_sub) score += 1
  if (r.language) score += 0.5
  return score
}

export function buildUserProfile(params: {
  userRepos: RepoRow[]
  topicStats: TopicStats
  now?: number
}): UserProfile {
  const { userRepos, topicStats } = params
  const now = params.now ?? Date.now()
  const useIdf = topicStats.totalRepos >= IDF_FALLBACK_THRESHOLD

  // Topic affinity
  const rawTopicAffinity = new Map<string, number>()
  for (const r of userRepos) {
    const w = recencyWeight(r.starred_at, now)
    const topics = safeParseTopics(r.topics)
    for (const t of topics) {
      const idfWeight = useIdf ? (topicStats.idf.get(t) ?? 0) : 1
      // Skip topics with idf <= 0 (appear in >= half of all repos) when IDF is active
      if (useIdf && idfWeight <= 0) continue
      rawTopicAffinity.set(t, (rawTopicAffinity.get(t) ?? 0) + w * idfWeight)
    }
  }
  const topicAffinity = normalizeMap(rawTopicAffinity)

  // Bucket / subType / language distributions
  const bucketRaw = new Map<string, number>()
  const subRaw = new Map<string, number>()
  const langRaw = new Map<string, number>()
  for (const r of userRepos) {
    if (r.type_bucket) bucketRaw.set(r.type_bucket, (bucketRaw.get(r.type_bucket) ?? 0) + 1)
    if (r.type_sub) subRaw.set(r.type_sub, (subRaw.get(r.type_sub) ?? 0) + 1)
    if (r.language) langRaw.set(r.language, (langRaw.get(r.language) ?? 0) + 1)
  }

  // Star scale
  const starCounts = userRepos.map((r) => r.stars ?? 0).sort((a, b) => a - b)
  const starScale = {
    median: percentile(starCounts, 0.5),
    p25: percentile(starCounts, 0.25),
    p75: percentile(starCounts, 0.75),
  }

  // Anchor pool: sort by recency desc, break ties by signal richness desc; take top 20
  const anchorPool = [...userRepos]
    .sort((a, b) => {
      const ta = a.starred_at ? new Date(a.starred_at).getTime() : 0
      const tb = b.starred_at ? new Date(b.starred_at).getTime() : 0
      if (tb !== ta) return tb - ta
      return signalRichness(b) - signalRichness(a)
    })
    .slice(0, ANCHOR_POOL_SIZE)

  return {
    topicAffinity,
    bucketDistribution: normalizeMap(bucketRaw),
    subTypeDistribution: normalizeMap(subRaw),
    languageWeights: normalizeMap(langRaw),
    starScale,
    anchorPool,
    repoCount: userRepos.length,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/recommendationEngine.ts electron/services/recommendationEngine.test.ts
git commit -m "feat(recommend): add buildUserProfile with recency + IDF weighting"
```

---

## Task 4: Engine — `scoreCandidate`

Computes the 5-signal weighted score and a breakdown for one candidate repo.

**Files:**
- Modify: `electron/services/recommendationEngine.ts`
- Modify: `electron/services/recommendationEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { scoreCandidate } from './recommendationEngine'

function emptyProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    topicAffinity: new Map(),
    bucketDistribution: new Map(),
    subTypeDistribution: new Map(),
    languageWeights: new Map(),
    starScale: { median: 1000, p25: 500, p75: 2000 },
    anchorPool: [],
    repoCount: 0,
    ...overrides,
  }
}

interface CandidateInput {
  topics: string[]
  type_bucket?: string | null
  type_sub?: string | null
  language?: string | null
  stars?: number
}

function cand(input: CandidateInput) {
  return {
    topics: input.topics,
    type_bucket: input.type_bucket ?? null,
    type_sub: input.type_sub ?? null,
    language: input.language ?? null,
    stars: input.stars ?? 1000,
  }
}

describe('scoreCandidate', () => {
  it('topicScore sums matching topicAffinity values, clamped to 1', () => {
    const profile = emptyProfile({
      topicAffinity: new Map([['rust', 0.3], ['cli', 0.2]]),
    })
    const result = scoreCandidate(cand({ topics: ['rust', 'cli', 'other'] }), profile)
    expect(result.breakdown.topic).toBeCloseTo(0.5, 5)
  })

  it('topicScore clamps at 1.0', () => {
    const profile = emptyProfile({
      topicAffinity: new Map([['a', 0.6], ['b', 0.6]]),
    })
    const result = scoreCandidate(cand({ topics: ['a', 'b'] }), profile)
    expect(result.breakdown.topic).toBeCloseTo(1.0, 5)
  })

  it('bucketScore looks up bucketDistribution', () => {
    const profile = emptyProfile({
      bucketDistribution: new Map([['ai-ml', 0.4]]),
    })
    const result = scoreCandidate(cand({ topics: [], type_bucket: 'ai-ml' }), profile)
    expect(result.breakdown.bucket).toBeCloseTo(0.4, 5)
  })

  it('bucketScore is 0 when bucket missing from profile', () => {
    const profile = emptyProfile({ bucketDistribution: new Map([['ai-ml', 0.4]]) })
    const result = scoreCandidate(cand({ topics: [], type_bucket: 'other' }), profile)
    expect(result.breakdown.bucket).toBe(0)
  })

  it('subTypeScore and languageScore follow the same pattern', () => {
    const profile = emptyProfile({
      subTypeDistribution: new Map([['ai-coding', 0.5]]),
      languageWeights: new Map([['TypeScript', 0.3]]),
    })
    const result = scoreCandidate(
      cand({ topics: [], type_sub: 'ai-coding', language: 'TypeScript' }),
      profile
    )
    expect(result.breakdown.subType).toBeCloseTo(0.5, 5)
    expect(result.breakdown.language).toBeCloseTo(0.3, 5)
  })

  it('starScaleScore peaks at user median, decays with log-distance', () => {
    const profile = emptyProfile({ starScale: { median: 1000, p25: 500, p75: 2000 } })
    const matching = scoreCandidate(cand({ topics: [], stars: 1000 }), profile)
    const distant = scoreCandidate(cand({ topics: [], stars: 1_000_000 }), profile)
    expect(matching.breakdown.scale).toBeCloseTo(1.0, 3)
    expect(distant.breakdown.scale).toBeLessThan(0.1)
  })

  it('composite score matches weighted sum of components', () => {
    const profile = emptyProfile({
      topicAffinity: new Map([['rust', 1.0]]),
      bucketDistribution: new Map([['dev-tools', 1.0]]),
      subTypeDistribution: new Map([['build-tool', 1.0]]),
      languageWeights: new Map([['Rust', 1.0]]),
      starScale: { median: 1000, p25: 500, p75: 2000 },
    })
    const result = scoreCandidate(
      cand({ topics: ['rust'], type_bucket: 'dev-tools', type_sub: 'build-tool', language: 'Rust', stars: 1000 }),
      profile
    )
    // All components should be ~1.0, so composite = 0.35+0.30+0.15+0.10+0.10 = 1.0
    expect(result.score).toBeCloseTo(1.0, 2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: FAIL with "scoreCandidate is not defined".

- [ ] **Step 3: Implement `scoreCandidate`**

Add to `recommendationEngine.ts`:

```typescript
export interface ScoreBreakdown {
  topic: number
  bucket: number
  subType: number
  language: number
  scale: number
}

interface ScoringCandidate {
  topics: string[]
  type_bucket: string | null
  type_sub: string | null
  language: string | null
  stars: number
}

const WEIGHTS = {
  topic: 0.35,
  subType: 0.30,
  bucket: 0.15,
  language: 0.10,
  scale: 0.10,
} as const

export function scoreCandidate(
  candidate: ScoringCandidate,
  profile: UserProfile,
): { score: number; breakdown: ScoreBreakdown } {
  // topicScore
  let topicRaw = 0
  for (const t of candidate.topics) {
    topicRaw += profile.topicAffinity.get(t) ?? 0
  }
  const topic = Math.min(1.0, topicRaw)

  // bucketScore / subTypeScore / languageScore
  const bucket = candidate.type_bucket
    ? (profile.bucketDistribution.get(candidate.type_bucket) ?? 0)
    : 0
  const subType = candidate.type_sub
    ? (profile.subTypeDistribution.get(candidate.type_sub) ?? 0)
    : 0
  const language = candidate.language
    ? (profile.languageWeights.get(candidate.language) ?? 0)
    : 0

  // starScaleScore
  const medianLog = Math.log10(profile.starScale.median + 1)
  const candidateLog = Math.log10(candidate.stars + 1)
  const scale = Math.max(0, 1 - Math.abs(candidateLog - medianLog) / 2)

  const score =
    WEIGHTS.topic * topic +
    WEIGHTS.subType * subType +
    WEIGHTS.bucket * bucket +
    WEIGHTS.language * language +
    WEIGHTS.scale * scale

  return {
    score,
    breakdown: { topic, bucket, subType, language, scale },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/recommendationEngine.ts electron/services/recommendationEngine.test.ts
git commit -m "feat(recommend): add scoreCandidate with 5-signal weighted scoring"
```

---

## Task 5: Engine — `findAnchors`

Identifies which 1–3 of the user's anchor-pool repos "pulled in" a given candidate.

**Files:**
- Modify: `electron/services/recommendationEngine.ts`
- Modify: `electron/services/recommendationEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { findAnchors } from './recommendationEngine'

describe('findAnchors', () => {
  const stats = {
    totalRepos: 100,
    docFrequency: new Map([['ai-agent', 5], ['common', 60]]),
    idf: new Map([
      ['ai-agent', Math.log(100 / 6)],  // ≈ 2.81
      ['common', Math.log(100 / 61)],   // ≈ 0.49
    ]),
  }

  it('returns empty when anchor pool is empty', () => {
    const anchors = findAnchors(
      cand({ topics: ['ai-agent'] }),
      emptyProfile(),
      stats
    )
    expect(anchors).toEqual([])
  })

  it('picks anchor with shared rare topics', () => {
    const anchor = makeRepo({
      id: 'a1', owner: 'microsoft', name: 'autogen',
      topics: JSON.stringify(['ai-agent', 'llm']),
    })
    const profile = emptyProfile({ anchorPool: [anchor] })
    const anchors = findAnchors(
      cand({ topics: ['ai-agent', 'other'] }),
      profile,
      stats
    )
    expect(anchors.length).toBe(1)
    expect(anchors[0].name).toBe('autogen')
    expect(anchors[0].reasons).toContain('topic:ai-agent')
  })

  it('adds bucket/subType/language bumps to reasons when matched', () => {
    const anchor = makeRepo({
      id: 'a1', owner: 'o', name: 'a',
      topics: JSON.stringify(['ai-agent']),
      type_bucket: 'ai-ml',
      type_sub: 'ai-coding',
      language: 'Python',
    })
    const profile = emptyProfile({ anchorPool: [anchor] })
    const anchors = findAnchors(
      cand({
        topics: ['ai-agent'],
        type_bucket: 'ai-ml',
        type_sub: 'ai-coding',
        language: 'Python',
      }),
      profile,
      stats
    )
    expect(anchors[0].reasons).toEqual(
      expect.arrayContaining(['topic:ai-agent', 'bucket:ai-ml', 'sub:ai-coding', 'language:Python'])
    )
  })

  it('filters anchors below similarity threshold', () => {
    const weakAnchor = makeRepo({
      id: 'weak',
      topics: JSON.stringify(['common']),  // low IDF, no other matches
    })
    const profile = emptyProfile({ anchorPool: [weakAnchor] })
    const anchors = findAnchors(
      cand({ topics: ['common'], language: 'Go' }),
      profile,
      stats
    )
    expect(anchors).toEqual([])  // below 0.2 threshold
  })

  it('returns at most 3 anchors sorted by similarity desc', () => {
    const strongAnchor = makeRepo({
      id: 'strong', owner: 'o', name: 'strong',
      topics: JSON.stringify(['ai-agent']),
      type_bucket: 'ai-ml',
      type_sub: 'ai-coding',
      language: 'Python',
    })
    const mediumAnchor = makeRepo({
      id: 'medium', owner: 'o', name: 'medium',
      topics: JSON.stringify(['ai-agent']),
      type_bucket: 'ai-ml',
    })
    const okAnchor = makeRepo({
      id: 'ok', owner: 'o', name: 'ok',
      topics: JSON.stringify(['ai-agent']),
    })
    const extraAnchor = makeRepo({
      id: 'extra', owner: 'o', name: 'extra',
      topics: JSON.stringify(['ai-agent']),
    })
    const profile = emptyProfile({
      anchorPool: [okAnchor, extraAnchor, mediumAnchor, strongAnchor],
    })
    const anchors = findAnchors(
      cand({ topics: ['ai-agent'], type_bucket: 'ai-ml', type_sub: 'ai-coding', language: 'Python' }),
      profile,
      stats
    )
    expect(anchors.length).toBe(3)
    expect(anchors[0].name).toBe('strong')
    expect(anchors[1].name).toBe('medium')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: FAIL with "findAnchors is not defined".

- [ ] **Step 3: Implement `findAnchors`**

Add to `recommendationEngine.ts`:

```typescript
export interface Anchor {
  owner: string
  name: string
  reasons: string[]
  similarity: number
}

const ANCHOR_THRESHOLD = 0.2
const MAX_ANCHORS = 3

export function findAnchors(
  candidate: ScoringCandidate,
  profile: UserProfile,
  topicStats: TopicStats,
): Anchor[] {
  const candidateTopics = new Set(candidate.topics)
  const results: Anchor[] = []

  for (const anchor of profile.anchorPool) {
    const anchorTopics = new Set(safeParseTopics(anchor.topics))
    const reasons: string[] = []
    let similarity = 0

    for (const t of anchorTopics) {
      if (candidateTopics.has(t)) {
        similarity += topicStats.idf.get(t) ?? 1
        reasons.push(`topic:${t}`)
      }
    }
    if (anchor.type_bucket && anchor.type_bucket === candidate.type_bucket) {
      similarity += 0.3
      reasons.push(`bucket:${anchor.type_bucket}`)
    }
    if (anchor.type_sub && anchor.type_sub === candidate.type_sub) {
      similarity += 0.4
      reasons.push(`sub:${anchor.type_sub}`)
    }
    if (anchor.language && anchor.language === candidate.language) {
      similarity += 0.1
      reasons.push(`language:${anchor.language}`)
    }

    if (similarity >= ANCHOR_THRESHOLD) {
      results.push({
        owner: anchor.owner,
        name: anchor.name,
        reasons,
        similarity,
      })
    }
  }

  results.sort((a, b) => b.similarity - a.similarity)
  return results.slice(0, MAX_ANCHORS)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/recommendationEngine.ts electron/services/recommendationEngine.test.ts
git commit -m "feat(recommend): add findAnchors with IDF-weighted similarity"
```

---

## Task 6: Engine — `rankCandidates` orchestrator

Takes raw candidates + profile + stats, classifies them, scores, finds anchors, sorts, and returns `RecommendationItem[]`.

**Files:**
- Modify: `electron/services/recommendationEngine.ts`
- Modify: `electron/services/recommendationEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { rankCandidates } from './recommendationEngine'
import type { GitHubRepo } from '../../src/types/github'  // adjust path

function ghRepo(overrides: Partial<GitHubRepo>): GitHubRepo {
  return {
    id: 1, node_id: 'n', owner: { login: 'o' }, name: 'n',
    full_name: 'o/n', description: null, language: null, license: null,
    homepage: null, topics: [], stargazers_count: 100,
    forks_count: 0, watchers_count: 0, size: 0, open_issues_count: 0,
    created_at: '2020-01-01T00:00:00Z',
    pushed_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...overrides,
  } as unknown as GitHubRepo
}

describe('rankCandidates', () => {
  const emptyStats = { totalRepos: 0, docFrequency: new Map(), idf: new Map() }

  it('returns empty array for empty candidates', () => {
    const items = rankCandidates([], emptyProfile(), emptyStats)
    expect(items).toEqual([])
  })

  it('sorts items by score descending', () => {
    const profile = emptyProfile({
      topicAffinity: new Map([['rust', 1.0]]),
    })
    const candidates = [
      ghRepo({ id: 1, name: 'match', topics: ['rust'] }),
      ghRepo({ id: 2, name: 'no-match', topics: ['python'] }),
    ]
    const items = rankCandidates(candidates, profile, emptyStats)
    expect(items[0].repo.name).toBe('match')
    expect(items[0].score).toBeGreaterThan(items[1].score)
  })

  it('attaches anchors and primaryAnchor', () => {
    const anchor = makeRepo({
      id: 'a', owner: 'microsoft', name: 'autogen',
      topics: JSON.stringify(['ai-agent']),
    })
    const stats = {
      totalRepos: 100,
      docFrequency: new Map([['ai-agent', 5]]),
      idf: new Map([['ai-agent', Math.log(100 / 6)]]),
    }
    const profile = emptyProfile({
      topicAffinity: new Map([['ai-agent', 1.0]]),
      anchorPool: [anchor],
    })
    const candidates = [ghRepo({ id: 1, topics: ['ai-agent'] })]
    const items = rankCandidates(candidates, profile, stats)
    expect(items[0].primaryAnchor?.name).toBe('autogen')
  })

  it('classifies candidates on the fly', () => {
    // A candidate whose topics should classify to ai-ml / ai-coding
    const profile = emptyProfile({
      bucketDistribution: new Map([['ai-ml', 1.0]]),
    })
    const candidates = [
      ghRepo({ id: 1, name: 'copilot', topics: ['ai-coding', 'llm'] }),
    ]
    const items = rankCandidates(candidates, profile, emptyStats)
    // If classification worked, bucket score > 0
    expect(items[0].scoreBreakdown.bucket).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: FAIL with "rankCandidates is not defined".

- [ ] **Step 3: Implement `rankCandidates`**

Add to `recommendationEngine.ts`:

```typescript
import { classifyRepoBucket } from '../../src/lib/classifyRepoType'
import type { GitHubRepo } from '../../src/types/github'

export interface RecommendationItem {
  repo: GitHubRepo
  score: number
  scoreBreakdown: ScoreBreakdown
  anchors: Anchor[]
  primaryAnchor: Anchor | null
}

function toScoringCandidate(repo: GitHubRepo): ScoringCandidate {
  const topics = Array.isArray(repo.topics) ? repo.topics : []
  const classification = classifyRepoBucket({
    name: repo.name,
    description: repo.description ?? null,
    topics: JSON.stringify(topics),
  })
  return {
    topics,
    type_bucket: classification?.bucket ?? null,
    type_sub: classification?.subType ?? null,
    language: repo.language ?? null,
    stars: repo.stargazers_count ?? 0,
  }
}

export function rankCandidates(
  candidates: GitHubRepo[],
  profile: UserProfile,
  topicStats: TopicStats,
): RecommendationItem[] {
  const items: RecommendationItem[] = candidates.map((repo) => {
    const sc = toScoringCandidate(repo)
    const { score, breakdown } = scoreCandidate(sc, profile)
    const anchors = findAnchors(sc, profile, topicStats)
    return {
      repo,
      score,
      scoreBreakdown: breakdown,
      anchors,
      primaryAnchor: anchors[0] ?? null,
    }
  })
  items.sort((a, b) => b.score - a.score)
  return items
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/services/recommendationEngine.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/recommendationEngine.ts electron/services/recommendationEngine.test.ts
git commit -m "feat(recommend): add rankCandidates orchestrator"
```

---

## Task 7: Fetcher — `planQueries` + `fetchCandidates`

Plans GitHub queries from the profile's top topics and fetches via `searchRepos` with dedupe.

**Files:**
- Create: `electron/services/recommendationFetcher.ts`
- Create: `electron/services/recommendationFetcher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/services/recommendationFetcher.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../github', () => ({
  searchRepos: vi.fn(),
}))
import { searchRepos } from '../github'
import { planQueries, fetchCandidates } from './recommendationFetcher'

const mockSearch = searchRepos as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockSearch.mockReset()
})

describe('planQueries', () => {
  it('returns top 5 topics by affinity value', () => {
    const profile = emptyProfile({
      topicAffinity: new Map([
        ['a', 0.30], ['b', 0.25], ['c', 0.20], ['d', 0.10],
        ['e', 0.08], ['f', 0.05], ['g', 0.02],
      ]),
    })
    const queries = planQueries(profile)
    expect(queries.length).toBe(5)
    expect(queries.map((q) => q.topic)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('returns cold-start query when topicAffinity is empty', () => {
    const queries = planQueries(emptyProfile())
    expect(queries.length).toBe(1)
    expect(queries[0].coldStart).toBe(true)
  })
})

describe('fetchCandidates', () => {
  it('calls searchRepos once per query with best-match sort', async () => {
    mockSearch.mockResolvedValue([
      ghRepo({ id: 1, name: 'r1' }),
    ])
    const queries = [
      { topic: 'rust', coldStart: false },
      { topic: 'cli', coldStart: false },
    ]
    await fetchCandidates('token', queries)
    expect(mockSearch).toHaveBeenCalledTimes(2)
    // Verify sort is empty/best-match and query format
    const call1 = mockSearch.mock.calls[0]
    expect(call1[1]).toBe('topic:rust stars:>10')
    expect(call1[3]).toBe('')  // sort: best-match
  })

  it('dedupes across topics by repo id', async () => {
    mockSearch
      .mockResolvedValueOnce([ghRepo({ id: 1 }), ghRepo({ id: 2 })])
      .mockResolvedValueOnce([ghRepo({ id: 2 }), ghRepo({ id: 3 })])
    const result = await fetchCandidates('token', [
      { topic: 'rust', coldStart: false },
      { topic: 'cli', coldStart: false },
    ])
    expect(result.map((r) => r.id).sort()).toEqual([1, 2, 3])
  })

  it('executes cold-start query when coldStart flag is set', async () => {
    mockSearch.mockResolvedValue([ghRepo({ id: 1 })])
    await fetchCandidates('token', [{ topic: '', coldStart: true }])
    const call = mockSearch.mock.calls[0]
    expect(call[1]).toBe('stars:>50000')
    expect(call[3]).toBe('stars')  // cold-start uses popularity sort
  })

  it('skips failed queries and returns partial results', async () => {
    mockSearch
      .mockResolvedValueOnce([ghRepo({ id: 1 })])
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce([ghRepo({ id: 3 })])
    const result = await fetchCandidates('token', [
      { topic: 'a', coldStart: false },
      { topic: 'b', coldStart: false },
      { topic: 'c', coldStart: false },
    ])
    expect(result.map((r) => r.id).sort()).toEqual([1, 3])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- electron/services/recommendationFetcher.test.ts`
Expected: FAIL with "planQueries / fetchCandidates is not defined".

- [ ] **Step 3: Implement fetcher**

```typescript
// electron/services/recommendationFetcher.ts
import { searchRepos } from '../github'
import type { GitHubRepo } from '../../src/types/github'
import type { UserProfile } from './recommendationEngine'

export interface QueryPlan {
  topic: string
  coldStart: boolean
}

const TOP_TOPICS_COUNT = 5
const PER_TOPIC_RESULTS = 25
const STAR_THRESHOLD = 10
const COLD_START_THRESHOLD = 50000
const COLD_START_RESULTS = 100

export function planQueries(profile: UserProfile): QueryPlan[] {
  const entries = [...profile.topicAffinity.entries()].sort((a, b) => b[1] - a[1])
  if (entries.length === 0) {
    return [{ topic: '', coldStart: true }]
  }
  return entries.slice(0, TOP_TOPICS_COUNT).map(([topic]) => ({ topic, coldStart: false }))
}

export async function fetchCandidates(
  token: string | null,
  queries: QueryPlan[],
): Promise<GitHubRepo[]> {
  const seen = new Set<number>()
  const merged: GitHubRepo[] = []

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      if (q.coldStart) {
        return searchRepos(token, `stars:>${COLD_START_THRESHOLD}`, COLD_START_RESULTS, 'stars', 'desc', 1)
      }
      // Empty sort = GitHub default best-match ranking
      return searchRepos(token, `topic:${q.topic} stars:>${STAR_THRESHOLD}`, PER_TOPIC_RESULTS, '', 'desc', 1)
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const repo of r.value) {
        if (!seen.has(repo.id)) {
          seen.add(repo.id)
          merged.push(repo)
        }
      }
    }
  }
  return merged
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/services/recommendationFetcher.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/services/recommendationFetcher.ts electron/services/recommendationFetcher.test.ts
git commit -m "feat(recommend): add fetcher with best-match queries and dedupe"
```

---

## Task 8: Handler — `computeProfileHash` + cache helpers

Pure helpers for the cache key: a sha256 of the user's starred+saved GitHub IDs.

**Files:**
- Create: `electron/ipc/recommendHandlers.ts`
- Create: `electron/ipc/recommendHandlers.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/ipc/recommendHandlers.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeProfileHash } from './recommendHandlers'

describe('computeProfileHash', () => {
  it('returns stable hash for same inputs regardless of order', () => {
    const a = computeProfileHash(['1', '2', '3'], ['10', '20'])
    const b = computeProfileHash(['3', '1', '2'], ['20', '10'])
    expect(a).toBe(b)
  })

  it('differs when starred set changes', () => {
    const a = computeProfileHash(['1', '2'], [])
    const b = computeProfileHash(['1', '2', '3'], [])
    expect(a).not.toBe(b)
  })

  it('differs when saved set changes', () => {
    const a = computeProfileHash(['1'], ['10'])
    const b = computeProfileHash(['1'], ['10', '20'])
    expect(a).not.toBe(b)
  })

  it('handles empty sets deterministically', () => {
    const hash = computeProfileHash([], [])
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- electron/ipc/recommendHandlers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `computeProfileHash`**

```typescript
// electron/ipc/recommendHandlers.ts
import { createHash } from 'node:crypto'

export function computeProfileHash(starredIds: string[], savedIds: string[]): string {
  const s = [...starredIds].sort().join(',')
  const v = [...savedIds].sort().join(',')
  return createHash('sha256').update(`${s}|${v}`).digest('hex')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/ipc/recommendHandlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/recommendHandlers.ts electron/ipc/recommendHandlers.test.ts
git commit -m "feat(recommend): add computeProfileHash helper"
```

---

## Task 9: Handler — full orchestration + `registerRecommendHandlers`

Wires everything together: load user repos, build profile, plan queries, fetch, rank, cache, return.

**Files:**
- Modify: `electron/ipc/recommendHandlers.ts`
- Modify: `electron/ipc/recommendHandlers.test.ts`

- [ ] **Step 1: Check current cache implementation in main.ts**

Read `electron/main.ts` lines ~730–896 to confirm the exact DB query patterns and settings-table keys the current handler uses. The plan assumes:
- `settings` table with columns `(key TEXT PRIMARY KEY, value TEXT)`
- `repos` table with `discover_query TEXT` column used for tagging cached recommended repos
- Access to the authenticated token (check how current handler obtains it)

If any of these assumptions differ from the current code, adjust the steps below accordingly. Do not invent schema changes.

- [ ] **Step 2: Write failing integration test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the fetcher module
vi.mock('../services/recommendationFetcher', () => ({
  planQueries: vi.fn(),
  fetchCandidates: vi.fn(),
}))

// Mock DB access — match whatever pattern the current handler uses.
// Example structure; adjust to match the project's actual DB access pattern:
const mockDb = {
  prepare: vi.fn(),
}
vi.mock('../db', () => ({ getDb: () => mockDb }))

import { getRecommendedHandler } from './recommendHandlers'
import { fetchCandidates, planQueries } from '../services/recommendationFetcher'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getRecommendedHandler', () => {
  it('returns coldStart response when user has <3 starred/saved repos', async () => {
    // Mock DB to return 0 user repos
    // Mock fetcher to return popular fallback
    // ...
    // Assert response.coldStart === true and items have empty anchors
  })

  it('calls fetcher once on fresh profile hash and caches the result', async () => {
    // Call handler twice with same profile hash, assert fetcher called only once
  })

  it('returns stale cache with stale:true when fetch fails', async () => {
    // Populate stale cache, make fetcher throw, assert stale:true in response
  })

  it('invalidates cache when profile hash changes', async () => {
    // Call once, then change the mocked user repo set, call again
    // Assert fetcher called twice
  })
})
```

Because the integration tests depend on exact DB access patterns, treat Step 2 as a sketch. Fill in the mock structure based on what you find in Step 1 before running.

- [ ] **Step 3: Implement the handler**

Add to `electron/ipc/recommendHandlers.ts`:

```typescript
import { ipcMain } from 'electron'
import { getDb } from '../db'  // match project's actual DB access
import { getGitHubToken } from '../...'  // match how main.ts gets the token
import {
  buildUserProfile,
  computeTopicStats,
  rankCandidates,
} from '../services/recommendationEngine'
import { planQueries, fetchCandidates } from '../services/recommendationFetcher'
import type { RecommendationResponse } from '../../src/types/recommendation'

const L1_TTL_MS = 5 * 60 * 1000
const L2_TTL_MS = 24 * 60 * 60 * 1000
const COLD_START_MIN_REPOS = 3

interface L1Entry {
  timestamp: number
  response: RecommendationResponse
}

const l1Cache = new Map<string, L1Entry>()

export async function getRecommendedHandler(): Promise<RecommendationResponse> {
  const db = getDb()
  const token = getGitHubToken()

  // 1. Load user repos (starred OR saved)
  const userRepos = db.prepare(
    `SELECT * FROM repos WHERE starred_at IS NOT NULL OR saved_at IS NOT NULL`
  ).all() as RepoRow[]

  const starredIds = userRepos.filter((r) => r.starred_at).map((r) => r.id)
  const savedIds = userRepos.filter((r) => r.saved_at).map((r) => r.id)
  const profileHash = computeProfileHash(starredIds, savedIds)

  // 2. Check L1 cache
  const l1 = l1Cache.get(profileHash)
  if (l1 && Date.now() - l1.timestamp < L1_TTL_MS) {
    return l1.response
  }

  // 3. Cold start path
  if (userRepos.length < COLD_START_MIN_REPOS) {
    const candidates = await fetchCandidates(token, [{ topic: '', coldStart: true }])
    const response: RecommendationResponse = {
      items: candidates.map((repo) => ({
        repo,
        score: 0,
        scoreBreakdown: { topic: 0, bucket: 0, subType: 0, language: 0, scale: 0 },
        anchors: [],
        primaryAnchor: null,
      })),
      stale: false,
      coldStart: true,
    }
    l1Cache.set(profileHash, { timestamp: Date.now(), response })
    return response
  }

  // 4. Build profile + fetch candidates
  const allRepos = db.prepare(`SELECT topics FROM repos`).all() as { topics: string }[]
  const topicStats = computeTopicStats(allRepos)
  const profile = buildUserProfile({ userRepos, topicStats })
  const queries = planQueries(profile)

  let candidates
  try {
    candidates = await fetchCandidates(token, queries)
  } catch (err) {
    // Try L2 stale cache
    const staleTs = db.prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(`recommended_cache_ts:${profileHash}`) as { value: string } | undefined
    if (staleTs) {
      const staleRepos = db.prepare(
        `SELECT * FROM repos WHERE discover_query = ?`
      ).all(`recommended:${profileHash}`) as RepoRow[]
      const staleResponse = buildStaleResponse(staleRepos, profile, topicStats)
      return { ...staleResponse, stale: true }
    }
    throw err
  }

  // 5. Filter out repos the user already has
  const existingIds = new Set(userRepos.map((r) => String(r.id)))
  candidates = candidates.filter((c) => !existingIds.has(String(c.id)))

  // 6. Rank
  const items = rankCandidates(candidates, profile, topicStats)
  const response: RecommendationResponse = { items, stale: false, coldStart: false }

  // 7. Cache (L1 + L2 timestamp)
  l1Cache.set(profileHash, { timestamp: Date.now(), response })
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run(`recommended_cache_ts:${profileHash}`, String(Date.now()))
  // Upsert candidates into repos table with discover_query tag so they survive restart
  // (match existing upsert pattern from the old handler)

  return response
}

function buildStaleResponse(
  repos: RepoRow[],
  profile: UserProfile,
  topicStats: TopicStats
): RecommendationResponse {
  // Convert RepoRow back to GitHubRepo-like shape as needed, then rank
  // (If stale path is complex, consider skipping this subfeature in v1
  // and just propagating the error — document the choice.)
  // ... implementation depends on existing RepoRow→GitHubRepo mapping helpers
  return { items: [], stale: true, coldStart: false }
}

export function registerRecommendHandlers(): void {
  ipcMain.handle('github:getRecommended', async () => {
    return getRecommendedHandler()
  })
}
```

**Notes for the implementer:**
- Match the existing token-access and DB-access patterns from `electron/main.ts`'s current handler. The snippets above are structural guides, not literal copy-paste code.
- **L2 stale-cache path — pick one of two options, do not ship the middle:**
  - **Option A (preferred):** implement `buildStaleResponse` properly by reconstructing `GitHubRepo`-shaped data from `RepoRow` (look for an existing `rowToRepo` / `toGitHubRepo` helper in the codebase; if one exists, reuse it).
  - **Option B (acceptable):** remove the stale-cache path entirely — when the fetch fails and there is no L1 cache, propagate the error. Delete `buildStaleResponse` and the surrounding try/catch branch.
  - **Do NOT ship the placeholder** (`return { items: [], stale: true, coldStart: false }`) — returning zero items with `stale:true` is a silent UX regression that looks like "recommendations just disappeared."
  - Whichever option is chosen, note it in the commit message and update the spec's "Edge Cases" table if it deviates from the documented behavior.
- Confirm how the current handler tags cached repos with `discover_query`. The proposed tag is `recommended:${profileHash}` so different profiles don't overwrite each other.
- **Verify `searchRepos` page-size behavior for cold-start:** the fetcher passes `perPage=100` in the cold-start path. GitHub's per-page max is 100, so this should work, but confirm the current code handles it (there may already be pagination helpers).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- electron/ipc/recommendHandlers.test.ts`
Expected: all tests pass. If integration tests need real DB fixtures, use a temporary sqlite file per test.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/recommendHandlers.ts electron/ipc/recommendHandlers.test.ts
git commit -m "feat(recommend): add IPC orchestrator with profile-hash caching"
```

---

## Task 10: Remove inline handler from `main.ts` + wire up new handler

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Locate the inline handler**

Open `electron/main.ts` and find the block containing `ipcMain.handle('github:getRecommended', ...)` (around lines 738–920 per the spec; confirm current line range since edits may have shifted numbers).

- [ ] **Step 2: Remove the inline handler**

Delete the entire `ipcMain.handle('github:getRecommended', ...)` block, including any top-level constants that were used only by it (`RECOMMENDED_TTL`, `RECOMMENDED_DB_TTL`, `BLOCKED_TOPICS`, in-memory cache variables). If any of these constants are also used elsewhere in `main.ts`, leave them alone — but they shouldn't be.

- [ ] **Step 3: Register the new handler**

Near the other `register*Handlers()` calls (search for `registerTtsHandlers` in `main.ts`), add:

```typescript
import { registerRecommendHandlers } from './ipc/recommendHandlers'

// ... later, in the init section where registerTtsHandlers() is called:
registerRecommendHandlers()
```

- [ ] **Step 4: Type-check and test**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests (engine, fetcher, handler) still pass.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "refactor(recommend): remove inline handler, use registerRecommendHandlers"
```

---

## Task 11: Update `Discover.tsx` consumer for new response shape

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Find the current consumer**

Search `src/views/Discover.tsx` for the call to `window.api.github.getRecommended` (or the equivalent IPC bridge). Note how the response is currently consumed (likely iterated as `GitHubRepo[]` and mapped to card props).

- [ ] **Step 2: Update the consumer**

The response shape changed from `GitHubRepo[]` to `RecommendationResponse`. The exact state variable names below are illustrative — use whatever names the current code has (likely `setRecommendedRepos` rather than `setRecommendedItems`). Rename or keep the existing names; the important change is the shape:

```typescript
// Before
const repos = await window.api.github.getRecommended()  // GitHubRepo[]
setRecommendedRepos(repos)

// After (names may differ — match what's already there)
const response = await window.api.github.getRecommended()  // RecommendationResponse
setRecommendedItems(response.items)              // RecommendationItem[]
setRecommendedColdStart(response.coldStart)
setRecommendedStale(response.stale)
```

Where the renderer consumes repo fields, destructure `item.repo` (e.g., `item.repo.name`, `item.repo.stargazers_count`) and pass `item.anchors` / `item.primaryAnchor` to the card.

- [ ] **Step 3: Update the preload/API bridge type signature**

If the project has a preload/types file declaring `window.api.github.getRecommended`, update its return type from `Promise<GitHubRepo[]>` to `Promise<RecommendationResponse>`. Import the type from `src/types/recommendation.ts`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/Discover.tsx src/preload.ts  # adjust paths as needed
git commit -m "refactor(discover): consume RecommendationItem[] from new IPC shape"
```

---

## Task 12: Render anchor caption on Recommended cards

**Files:**
- Modify: `src/components/DiscoverGrid.tsx` (or the card subcomponent it uses)
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Locate the card renderer**

Open `src/components/DiscoverGrid.tsx`. Find where each card renders the title/description/metadata. Identify the appropriate insertion point (between description and metadata row, per the spec).

- [ ] **Step 2: Add anchor caption**

The card component needs access to the `anchors` array. Update the card's props interface to include `anchors?: Anchor[]` and `viewMode?: ViewModeKey`. Then render:

```tsx
{viewMode === 'recommended' && anchors && anchors.length > 0 && (
  <div className="recommended-anchor-caption">
    Because you starred{' '}
    {anchors.slice(0, 2).map((a, i) => (
      <React.Fragment key={`${a.owner}/${a.name}`}>
        {i > 0 && ' + '}
        <a
          href="#"
          className="recommended-anchor-link"
          onClick={(e) => {
            e.preventDefault()
            navigate(`/repo/${a.owner}/${a.name}`)  // or the project's routing equivalent
          }}
        >
          {a.name}
        </a>
      </React.Fragment>
    ))}
  </div>
)}
```

If the card is currently rendered from mapped `repos` in `DiscoverGrid.tsx`, update the mapping to pass `anchors` from the parent `RecommendationItem`.

- [ ] **Step 3: Add styling**

Append to `src/styles/globals.css`:

```css
.recommended-anchor-caption {
  font-size: 0.78rem;
  color: var(--t3);
  font-style: italic;
  margin: 4px 0;
}
.recommended-anchor-link {
  color: var(--t2);
  text-decoration: none;
  font-style: normal;
}
.recommended-anchor-link:hover {
  text-decoration: underline;
}
```

(Adjust CSS variables and selector names to match the project's existing conventions — search `globals.css` for `--t3`, `--t2` etc. to confirm.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverGrid.tsx src/styles/globals.css
git commit -m "feat(discover): add \"because you starred\" caption on Recommended cards"
```

---

## Task 13: Full run-through verification

**Files:** none modified

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all tests pass. No new failures elsewhere in the suite.

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Launch app and open Discover tab**

Manually:
1. `npm run dev` (or the project's dev command)
2. Navigate to Discover → Recommended tab
3. Verify:
   - Cards render as before (no regressions)
   - On the Recommended tab, each card with qualifying anchors shows an italic caption like *"Because you starred autogen + claude-mem"*
   - Anchor names are clickable and navigate to the corresponding repo detail page
   - The All tab shows no anchor caption (unchanged behavior)
   - Cold-start users (clear star history if possible) still get recommendations without errors

- [ ] **Step 4: Star a new repo and re-open Discover**

Star any repo. Go back to Discover → Recommended. Expect:
- Recommendations recompute (cache invalidates via new profile hash)
- The newly starred repo does not appear as a recommendation (filtered out)
- Its topics now influence rankings

- [ ] **Step 5: Final commit if any doc touch-ups**

If the spec or plan needs minor updates based on what you learned, commit those. Otherwise, nothing to commit for this task.

---

## Definition of Done

- All 13 tasks complete, each with its commit
- `npm test` green
- `npx tsc --noEmit` green
- Manual verification in Task 13 confirms anchor captions render correctly on Recommended tab only, and cache invalidates when stars change
- `electron/main.ts` no longer contains the inline `github:getRecommended` handler
- No schema migrations introduced

## Out of Scope (deferred per spec Non-Goals)

- Feedback loop (impression / save / dismiss tracking)
- Learning-to-rank or ML weight tuning
- "Why this?" tooltip showing `scoreBreakdown`
- Cross-user / collaborative filtering
- Recommendations from local DB candidates (beyond fresh GitHub fetches)
