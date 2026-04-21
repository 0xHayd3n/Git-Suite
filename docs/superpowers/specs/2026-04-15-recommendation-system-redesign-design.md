# Recommendation System Redesign Design

**Date:** 2026-04-15
**Status:** Draft

## Summary

Replace the current topic-frequency recommendation algorithm with a multi-signal recommendation engine that:

1. Builds a weighted user profile from starred/saved repos (topic affinity with recency decay + local IDF, type-bucket distribution, sub-type distribution, language weights, star-scale preference)
2. Fetches a wider candidate pool using GitHub's default best-match ranking (not `sort=stars`)
3. Scores each candidate with a weighted combination of five signals
4. Identifies "anchor" repos — the 1–3 starred repos most responsible for each recommendation
5. Displays each recommendation with a clickable "because you starred …" line showing its anchors
6. Invalidates the cache when the user's star/save set changes, not just on TTL

The goal: recommendations that are demonstrably connected to what the user has starred, and that explain themselves.

## Current State

**Location:** The entire algorithm is inlined in `electron/main.ts` lines 738–920 as the `github:getRecommended` IPC handler.

**Algorithm:**
1. Read `topics` from all repos where `saved_at IS NOT NULL OR starred_at IS NOT NULL`
2. Count topic frequency across those repos, excluding a hardcoded `BLOCKED_TOPICS` deny-list (~40 generic topics)
3. Take top 3 topics by raw frequency
4. For each of those 3 topics, call `searchRepos(token, 'topic:X stars:>50', 34, 'stars', 'desc')`
5. Round-robin interleave the three result lists, dedupe, filter out repos the user already has
6. Cache: 5-min in-memory L1, 24-hour SQLite L2, keyed only by time

**Why it fails:**
- GitHub's `sort=stars` always returns the biggest repos in a topic, regardless of user taste
- Raw topic frequency is noisy — the blocklist is a stale manual workaround
- Only one signal (topics) used; type_bucket / type_sub / language / recency are ignored
- No explanation of why a repo was recommended — the output is indistinguishable from popular-in-topic
- Cache is time-based only, so newly starred repos take up to 5 minutes to affect recs

**Key files affected:**
- `electron/main.ts` — inline handler to be extracted
- `electron/services/` — new module location (follows existing convention: `ttsService.ts`, `aiChatService.ts`)
- `electron/ipc/` — new handler location (follows existing convention: `ttsHandlers.ts`, `aiChatHandlers.ts`)
- `src/views/Discover.tsx` — consumes the IPC response; will receive richer data (anchors)
- `src/components/DiscoverGrid.tsx` (and its card renderer) — renders anchor caption on Recommended tab
- `src/lib/classifyRepoType.ts` — reused on-the-fly to classify GitHub search candidates

## Proposed State

### Architecture

New module layout:

```
electron/
  services/
    recommendationEngine.ts      (pure: profile, scoring, anchors)
    recommendationFetcher.ts     (GitHub query planning + batch fetch)
  ipc/
    recommendHandlers.ts         (thin orchestrator; replaces inline handler in main.ts)

src/
  types/
    recommendation.ts            (shared types: UserProfile, ScoredCandidate, Anchor,
                                  RecommendationItem) — renderer-safe
```

**Boundaries:**
- `recommendationEngine.ts` is pure — no DB, no IPC, no network. All logic functions take plain data and return plain data. Fully unit-testable without mocks.
- `recommendationFetcher.ts` encapsulates all GitHub API calls (query planning, batch fetch with dedupe). Mockable in tests.
- `recommendHandlers.ts` orchestrates: load user repos from DB → build profile → plan queries → fetch candidates → classify candidates → score → find anchors → cache → return.
- The existing `github:getRecommended` IPC name and request shape are preserved. Only the response shape is extended (each item now carries `anchors` and `scoreBreakdown` fields; existing fields unchanged).

### User Profile

```ts
interface UserProfile {
  topicAffinity: Map<string, number>       // normalized, sum = 1
  bucketDistribution: Map<string, number>  // normalized, sum = 1
  subTypeDistribution: Map<string, number> // normalized, sum = 1
  languageWeights: Map<string, number>     // normalized, sum = 1
  starScale: { median: number; p25: number; p75: number }
  anchorPool: RepoRow[]                    // top ~20 starred/saved repos used by anchor finder
  repoCount: number                        // total starred + saved count
}
```

**Topic affinity** is the primary signal. Each starred/saved repo contributes its topics, weighted by two factors stacked on top of raw frequency:

1. **Recency decay** (90-day half-life):
   `weight = 0.5 ^ (age_days / 90)`
   A repo starred yesterday contributes ~1.0; a year ago contributes ~0.06.

2. **Local inverse document frequency**:
   `idf(topic) = log(N_repos_in_db / (1 + doc_frequency(topic)))`
   Computed across all repos in the local `repos` table (not just user's).
   Generic topics like `javascript` get crushed; rare topics like `mcp-server` get amplified.
   Fallback: if the `repos` table has fewer than 100 rows, IDF is skipped and raw counts are used.

After aggregation, the map is normalized so its values sum to 1.0.

**This replaces the hardcoded `BLOCKED_TOPICS` deny-list.** IDF automatically handles generic topics; no manual list needed.

**Bucket / sub-type / language distributions** are simpler: count occurrences across user's repos, normalize to sum 1.

**Star-scale** is the user's star-count comfort zone, computed from the median, 25th, and 75th percentiles of their starred/saved repos' star counts. Used by the star-scale scoring term.

**Anchor pool** is the top ~20 starred/saved repos ranked by: recency (primary) and signal richness (has topics, has bucket, has language). Used by the anchor finder for per-candidate attribution.

### Candidate Fetch

Changes from the current fetcher:

| Parameter | Current | New |
|-----------|---------|-----|
| Topics used | Top 3 | Top 5 |
| Sort | `stars` desc | GitHub default (best-match) |
| Star threshold | `stars:>50` | `stars:>10` |
| Per-topic results | 34 | 25 |
| Total fetched | ~100 | ~125 (pre-dedupe), ~80–100 (post-dedupe) |
| API calls per refresh | 3 | 5 |

**Best-match sort is the single biggest win.** GitHub's default ranking is relevance-based, not raw popularity. Removing `sort=stars` stops the 50k+ giants from dominating.

**API cost:** 5 calls per uncached refresh. With existing 5-min L1 / 24-hr L2 cache, real-world load is ~5–10 calls/day per user. Authenticated limit is 5000/hr, so usage remains under 1% of budget.

### Scoring Function

Each candidate is first classified on the fly via `classifyRepoType` (to derive `type_bucket` and `type_sub` from its topics + description — GitHub search does not return our local classifications).

Score is a weighted sum of five signals, each normalized to `[0, 1]`:

```
score = 0.35 · topicScore      (primary: specific niche matches)
      + 0.30 · subTypeScore    (sharper than bucket, strong signal)
      + 0.15 · bucketScore     (broader category match)
      + 0.10 · languageScore   (primary language match)
      + 0.10 · starScaleScore  (comfort-zone penalty)
```

**Rationale for weights:** Topics and sub-types carry the lion's share because topics capture specific niches (e.g. `mcp-server`, `claude-plugin`) that sub-types (~80 categories) cannot, while sub-types provide reliable coarse-grained matching where topics are missing or noisy. Bucket and language are supporting signals. Star-scale is a soft penalty, not a dominant term — it stops giants from dominating without overwhelming the content signals.

**topicScore:**
```
topicScore = min(1.0, sum over candidate.topics of profile.topicAffinity[t])
```
Since `topicAffinity` is already IDF-weighted and normalized, this naturally favors candidates that share rare, user-relevant topics. Generic topics contribute near zero because their IDF is low.

**bucketScore:**
```
bucketScore = profile.bucketDistribution[candidate.type_bucket] or 0
```

**subTypeScore:**
```
subTypeScore = profile.subTypeDistribution[candidate.type_sub] or 0
```

**languageScore:**
```
languageScore = profile.languageWeights[candidate.language] or 0
```

**starScaleScore:**
```
diff = |log10(candidate.stars + 1) - log10(profile.starScale.median + 1)|
starScaleScore = max(0, 1 - diff / 2)
```
A candidate within ~100× of the user's median stars scores high. Way outside (e.g. 50k stars when user's median is 500) gets crushed toward 0.

**Weights are tunable constants in one place** (`recommendationEngine.ts`), exported for visibility. No dynamic tuning in v1.

### Ranking

Candidates are sorted by `score` descending. **No diversity cap** — the user's choice: pure score decides ordering. If multiple recommendations share an anchor, that reflects strong signal rather than a UI bug.

Already-starred and already-saved repos are filtered out before scoring (no point scoring repos the user already has).

### Anchor Identification

For each ranked candidate, iterate `profile.anchorPool` and compute a pairwise similarity with each anchor:

```
similarity(anchor, candidate) =
    sum over shared topics t of topicAffinity[t]   // IDF-weighted overlap
  + 0.3 if anchor.type_bucket == candidate.type_bucket
  + 0.4 if anchor.type_sub == candidate.type_sub
  + 0.1 if anchor.language == candidate.language
```

Keep anchors with similarity ≥ 0.2, sorted descending. Take the top 1–3.

Record the **reasons** that contributed (shared topics, matching bucket, etc.) in a string list for each anchor. Reasons are emitted as structured tokens (`topic:ai-agent`, `bucket:ai-ml`, `sub:ai-coding`, `language:Python`) so the UI can render them as chips or a single caption.

### Output Shape

```ts
interface Anchor {
  owner: string
  name: string
  reasons: string[]        // e.g. ["topic:ai-agent", "bucket:ai-ml"]
  similarity: number       // 0-1
}

interface RecommendationItem {
  repo: RepoRow            // existing shape from src/types/repo.ts (unchanged)
  score: number            // 0-1 composite
  scoreBreakdown: {
    topic: number
    bucket: number
    subType: number
    language: number
    scale: number
  }
  anchors: Anchor[]        // top 1-3, ordered by similarity desc
  primaryAnchor: Anchor | null  // convenience: anchors[0] or null
}
```

The IPC response becomes `RecommendationItem[]` instead of `GitHubRepo[]`. Existing callers in `Discover.tsx` need minor update: they currently map over the response expecting repo fields directly; they now destructure `item.repo`.

**Implementation note:** During Task 11 implementation, `item.repo` was changed from `GitHubRepo` to `RepoRow` to match the existing renderer contract. The handler re-reads upserted candidates from the local DB after ranking to produce the returned RepoRow. This keeps engine internals unchanged (still operates on `GitHubRepo[]`) and lets the renderer consume the response without a separate mapping layer.

### Caching & Invalidation

**Current:** Time-based only (5-min L1 + 24-hour L2). Cache key does not reflect user state, so newly starred repos don't invalidate cached recs.

**New:** Cache key includes a **profile hash**:

```
profileHash = sha256(
  sort(starredIds).join(',') + '|' + sort(savedIds).join(',')
)
cacheKey = `recommended:${profileHash}`
```

`starredIds` and `savedIds` are the GitHub repo IDs (`repos.id` column in the local DB, stored as strings). Using GitHub IDs rather than `owner/name` slugs means renamed/transferred repos don't break the hash.

When the user stars/unstars/saves/unsaves a repo, the hash changes, the cache misses, and fresh recs compute on next load. TTLs remain (5-min L1 / 24-hr L2) as a secondary safety net for repeat loads with the same profile.

L2 schema: the existing cache table can store the hash as part of the key string; no migration needed unless the table currently keys on something else (to confirm during implementation).

### UI Changes

**Scope:** One additive change to the Discover grid card renderer — a caption line showing anchors. No layout or structural changes.

On the **Recommended** tab, each card gets one new line between the description and the metadata row:

> *Because you starred [autogen](...) + [gpt-engineer](...)*

Rules:
- Up to 2 anchor names, separated by " + "
- Each name is a clickable link rendered via the existing `RepoNav` context, navigating to that starred/saved repo's detail page. Anchors are always drawn from `anchorPool`, which contains only repos in the local DB, so the link target is guaranteed to resolve — no null-check fallback needed.
- Styling: italic, muted color (reuse existing `var(--t3)` or equivalent), smaller than body text
- If a card has no anchors (cold-start, sparse profile, or no anchor cleared the threshold): the line is not rendered — no empty space, no placeholder
- Only shown on the Recommended tab (`viewMode === 'recommended'`); hidden on All

The `scoreBreakdown` field is returned to the renderer but not displayed in v1. It's reserved for a future "why this?" tooltip (out of scope here).

### Edge Cases

| Case | Behavior |
|------|----------|
| User has 0–2 starred/saved repos | Cold-start: skip personalization, return popular fallback via `searchRepos(token, 'stars:>50000', 100, 'stars', 'desc')` (equivalent to current fallback path). `anchors: []` for all items. |
| User has 3–10 stars (sparse profile) | Normal path; profile is thinner but still meaningful. IDF falls back to uniform if DB has <100 repos. |
| All stars in one niche | Normal path; recs concentrate there. No special handling. |
| GitHub API failure during refresh | Propagate the error as today. (Stale-cache fallback deferred — see plan Task 9 Option B.) |
| Candidate has no topics (rare) | `topicScore = 0`; other signals still apply. Low but non-zero score possible via language/bucket. |
| Candidate unclassifiable by `classifyRepoType` | `type_bucket` and `type_sub` default to null. Corresponding scores = 0. |
| Anchor pool empty (cold-start) | All items return with `anchors: []`; UI hides caption line. |
| User's starred repos have sparse classifications | `bucketDistribution` and `subTypeDistribution` may be empty maps. Scoring still works — those signals simply contribute 0. |

### Testing

**Unit tests** (`recommendationEngine.test.ts`) — pure functions, no mocks:

- `buildUserProfile`:
  - Empty input returns cold-start profile
  - Sparse input (3 repos) returns valid profile with thin distributions
  - Recency decay math: 90-day-old repo contributes ~0.5 of today's weight
  - IDF fallback when DB has <100 repos
  - Distribution normalization: all distributions sum to 1.0
- `scoreCandidate`:
  - Fixture profile (AI/dev-tools leaning) + fixture candidates
  - Assert ranked order matches expected intent
  - Each score component independently verifiable with focused fixtures
  - Edge: candidate with no topics scores correctly via other signals
- `findAnchors`:
  - Candidate with strong multi-signal match to one anchor: returns that anchor first
  - Candidate with partial match to 3 anchors: returns 3 in similarity order
  - Candidate below threshold: returns empty array
  - Reasons list contains correct signal tokens

**Integration tests** (`recommendHandlers.test.ts`) — `recommendationFetcher` mocked:

- Cache key changes when profile changes (star a repo → cache miss → fresh recs)
- Cold-start path: 0 stars → popular fallback, empty anchors
- API failure: propagates error (Option B chosen; see plan Task 9)

**Fixtures**:
- `fixtures/ai-dev-profile.json` — a realistic AI/dev-tools-leaning starred set (~20 repos)
- `fixtures/candidates.json` — ~30 diverse candidate repos with topics, classifications, languages
- Snapshot test for the full ranked output; weight changes will show as snapshot diffs

**No UI tests** — the card change is a mechanical addition of a caption; verified visually.

## Migration Notes

- The existing `github:getRecommended` IPC name is preserved. The response shape changes from `GitHubRepo[]` to `RecommendationItem[]`, which requires updating call sites in `Discover.tsx` (destructure `item.repo` rather than using items directly).
- The inline implementation in `electron/main.ts` (lines 738–920) is **removed**. Any references elsewhere in `main.ts` to local constants from that block (e.g. `BLOCKED_TOPICS`, `RECOMMENDED_TTL`, `RECOMMENDED_DB_TTL`) need to be re-homed in the new module or inlined there. No external consumers are expected.
- No database schema changes. The L2 cache table is reused; only the key strings change.
- `classifyRepoType` is imported and called server-side during scoring. Confirm its input signature (likely `{ topics, description }`) and ensure it works without a full `RepoRow`.
- The 5-min L1 and 24-hr L2 TTLs are preserved as secondary safety nets alongside the new profile-hash keying.

## Non-Goals

- Feedback loop (tracking impressions, saves, dismissals to adjust weights over time). Out of scope for v1; revisit once the core engine has been in use long enough to measure.
- Learning-to-rank or ML models. The scoring weights are hand-tuned constants; v1 aims for transparency and debuggability, not learned models.
- Cross-user / collaborative filtering. No infrastructure for it, and privacy model is single-user local.
- "Why this?" tooltip showing `scoreBreakdown`. Data is returned so the tooltip can be added later, but the UI is not part of v1.
- Recommendations from repos already in the local DB (beyond fresh GitHub fetches). Could be added later as a "you already viewed these" augmentation.
