# Smart Search System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Discover's raw GitHub search with a two-mode intelligent search system that detects natural language queries, extracts tags via Claude Haiku, runs parallel GitHub queries, and re-ranks results by relevance.

**Architecture:** Mode detection runs client-side (pure function). Electron main process handles all external calls (GitHub search, Anthropic Haiku, SQLite caching). Five new IPC channels: `search:raw`, `search:tagged`, `search:extractTags`, `search:getRelatedTags`, `search:getTopics`. Discover.tsx orchestrates the UI using these channels.

**Tech Stack:** TypeScript, Electron IPC, better-sqlite3, @anthropic-ai/sdk (already installed), Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/services/search-mode.ts` | **Create** | Pure mode detection function |
| `electron/github.ts` | **Modify** | Add `fetchGitHubTopics()` |
| `electron/tag-extractor.ts` | **Create** | Claude Haiku tag extraction |
| `electron/smart-search.ts` | **Create** | Multi-query search + re-ranking |
| `electron/related-tags.ts` | **Create** | Related tag derivation |
| `electron/db.ts` | **Modify** | Add `topic_cache` + `search_cache` migrations |
| `electron/main.ts` | **Modify** | Add 5 IPC handlers + `initTopicCache()` |
| `electron/preload.ts` | **Modify** | Expose `search` namespace |
| `src/env.d.ts` | **Modify** | Add `window.api.search` types |
| `src/views/Discover.tsx` | **Modify** | Rebuild search section (keep grid/cards) |
| `src/views/Discover.test.tsx` | **Modify** | Add search mode + tag tests |

---

### Task 1: DB schema migrations

**Files:**
- Modify: `electron/db.ts`
- Test: `electron/db.test.ts`

- [ ] **Step 1: Write failing tests**

Create `electron/db.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'

function makeMemDb() {
  const db = new Database(':memory:')
  return db
}

describe('initSchema', () => {
  let db: InstanceType<typeof Database>
  afterEach(() => db?.close())

  it('creates topic_cache table', () => {
    db = makeMemDb()
    initSchema(db)
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='topic_cache'"
    ).get()
    expect(row).toBeTruthy()
  })

  it('creates search_cache table', () => {
    db = makeMemDb()
    initSchema(db)
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='search_cache'"
    ).get()
    expect(row).toBeTruthy()
  })

  it('is idempotent — calling initSchema twice does not throw', () => {
    db = makeMemDb()
    expect(() => { initSchema(db); initSchema(db) }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run electron/db.test.ts
```
Expected: FAIL (topic_cache and search_cache tables don't exist yet)

- [ ] **Step 3: Add `topic_cache` and `search_cache` tables to `initSchema`**

In `electron/db.ts`, add inside the `db.exec(...)` block after the `settings` table:

```sql
CREATE TABLE IF NOT EXISTS topic_cache (
  topic      TEXT PRIMARY KEY,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS search_cache (
  cache_key  TEXT PRIMARY KEY,
  results    TEXT,
  fetched_at TEXT
);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run electron/db.test.ts
```
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add electron/db.ts
git commit -m "feat(db): add topic_cache and search_cache tables"
```

---

### Task 2: Mode detection service

**Files:**
- Create: `src/services/search-mode.ts`
- Test: `src/services/search-mode.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/services/search-mode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectSearchMode } from './search-mode'

describe('detectSearchMode', () => {
  it('returns raw for a single word', () => {
    expect(detectSearchMode('fastapi')).toBe('raw')
  })

  it('returns raw for a two-word technical term', () => {
    expect(detectSearchMode('ascii art')).toBe('raw')
  })

  it('returns natural for a phrase with a verb', () => {
    expect(detectSearchMode('something to render markdown')).toBe('natural')
  })

  it('returns natural for 3+ words even without a verb', () => {
    expect(detectSearchMode('ascii art terminal')).toBe('natural')
  })

  it('returns natural for a full sentence', () => {
    expect(detectSearchMode('I need a fast HTTP client for Python')).toBe('natural')
  })

  it('returns natural when query contains "looking"', () => {
    expect(detectSearchMode('looking for csv parser')).toBe('natural')
  })

  it('returns raw for empty string', () => {
    expect(detectSearchMode('')).toBe('raw')
  })

  it('returns raw for whitespace only', () => {
    expect(detectSearchMode('   ')).toBe('raw')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/services/search-mode.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Create `src/services/search-mode.ts`**

```typescript
const VERBS = [
  'need', 'want', 'find', 'get', 'make', 'build', 'create', 'use',
  'render', 'parse', 'convert', 'generate', 'read', 'write', 'handle',
  'manage', 'display', 'show', 'run', 'execute', 'process', 'fetch',
  'store', 'send', 'receive', 'connect', 'work', 'help', 'looking',
]

export type SearchMode = 'raw' | 'natural'

export function detectSearchMode(query: string): SearchMode {
  const trimmed = query.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)

  if (words.length <= 2) return 'raw'

  const lower = trimmed.toLowerCase()
  if (VERBS.some(v => lower.includes(v))) return 'natural'

  if (words.length >= 3) return 'natural'

  return 'raw'
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/services/search-mode.test.ts
```
Expected: 8 passing

- [ ] **Step 5: Commit**

```bash
git add src/services/search-mode.ts src/services/search-mode.test.ts
git commit -m "feat(search): add mode detection service"
```

---

### Task 3: GitHub topics fetch + GitHubRepo interface fix

**Files:**
- Modify: `electron/github.ts`

The `api()` helper doesn't exist in github.ts — the file uses `fetch` directly. Add `fetchGitHubTopics` using the same fetch pattern as the existing functions.

Also fix a pre-existing gap: `GitHubRepo` is missing `full_name` and `pushed_at`, both of which are returned by GitHub's API and required by `smart-search.ts` in Task 5. Add them now so TypeScript catches any misuse early.

- [ ] **Step 1: Add `full_name` and `pushed_at` to the `GitHubRepo` interface**

In `electron/github.ts`, update the `GitHubRepo` interface:

```typescript
export interface GitHubRepo {
  id: number
  full_name: string          // add this
  name: string
  owner: { login: string }
  description: string | null
  language: string | null
  topics: string[]
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  size: number
  license: { spdx_id: string } | null
  homepage: string | null
  updated_at: string
  pushed_at: string          // add this
  default_branch: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Add `fetchGitHubTopics` to `electron/github.ts`**

Append to the end of `electron/github.ts`:

```typescript
export async function fetchGitHubTopics(token: string): Promise<string[]> {
  const topics: string[] = []
  let page = 1

  while (true) {
    const res = await fetch(
      `${BASE}/search/topics?q=is:featured&per_page=100&page=${page}`,
      {
        headers: {
          ...githubHeaders(token),
          Accept: 'application/vnd.github.mercy-preview+json',
        },
      }
    )
    if (!res.ok) break
    const data = (await res.json()) as { items?: { name: string }[] }
    if (!data.items?.length) break
    topics.push(...data.items.map((t) => t.name))
    if (data.items.length < 100) break
    page++
  }

  return topics
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add electron/github.ts
git commit -m "feat(github): add fetchGitHubTopics"
```

---

### Task 4: Tag extractor

**Files:**
- Create: `electron/tag-extractor.ts`
- Test: `electron/tag-extractor.test.ts`

Note: `@anthropic-ai/sdk` is already installed (`^0.80.0`). The correct model ID is `claude-haiku-4-5-20251001`.

- [ ] **Step 1: Write failing tests**

Create `electron/tag-extractor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock the SDK before importing the module under test
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '["http", "python", "async"]' }],
      }),
    },
  })),
}))

import { extractTags } from './tag-extractor'

describe('extractTags', () => {
  it('returns parsed JSON tags from Haiku response', async () => {
    const tags = await extractTags('fast HTTP client for Python', [], 'sk-test')
    expect(tags).toEqual(['http', 'python', 'async'])
  })

  it('falls back to word split when response is invalid JSON', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>
    Anthropic.mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not valid json' }],
        }),
      },
    }))
    const tags = await extractTags('parse csv files fast', [], 'sk-test')
    expect(tags).toContain('parse')
    expect(tags).toContain('csv')
    expect(tags).toContain('files')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run electron/tag-extractor.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Create `electron/tag-extractor.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

export async function extractTags(
  query: string,
  knownTopics: string[],
  apiKey: string
): Promise<string[]> {
  const client = new Anthropic({ apiKey })
  const topicSample = knownTopics.slice(0, 300).join(', ')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are a GitHub repository search assistant. Extract search tags from the user's query.

Known GitHub topics (use these when they match): ${topicSample}

User query: "${query}"

Return ONLY a JSON array of 3-6 lowercase tags. Prefer exact matches from the known topics list. Include the programming language if mentioned. Add inferred synonyms if useful.

Examples:
"fast async HTTP client for Python" → ["http", "python", "async", "http-client", "requests"]
"render markdown in terminal" → ["markdown", "terminal", "cli", "renderer", "ansi"]
"small library to parse CSV files" → ["csv", "parser", "lightweight", "data"]

Return only the JSON array, nothing else.`,
    }],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    return JSON.parse(text.trim())
  } catch {
    return query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 5)
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run electron/tag-extractor.test.ts
```
Expected: 2 passing

- [ ] **Step 5: Commit**

```bash
git add electron/tag-extractor.ts electron/tag-extractor.test.ts
git commit -m "feat(search): add Haiku tag extractor"
```

---

### Task 5: Smart search (multi-query + ranking)

**Files:**
- Create: `electron/smart-search.ts`
- Test: `electron/smart-search.test.ts`

- [ ] **Step 1: Write failing tests**

Create `electron/smart-search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { rankResults } from './smart-search'

const makeRepo = (overrides: Partial<{
  full_name: string
  topics: string[]
  stargazers_count: number
  pushed_at: string
  size: number
}>) => ({
  id: 1,
  full_name: overrides.full_name ?? 'owner/repo',
  owner: { login: 'owner' },
  name: 'repo',
  description: '',
  language: null,
  topics: overrides.topics ?? [],
  stargazers_count: overrides.stargazers_count ?? 1000,
  forks_count: 0,
  open_issues_count: 0,
  pushed_at: overrides.pushed_at ?? new Date(Date.now() - 90 * 86400000).toISOString(),
  size: overrides.size ?? 1000,
  default_branch: 'main',
})

describe('rankResults', () => {
  it('ranks a repo with more matching tags higher', () => {
    const tags = ['markdown', 'terminal', 'cli']
    const highMatch = makeRepo({ full_name: 'a/a', topics: ['markdown', 'terminal', 'cli'] })
    const lowMatch  = makeRepo({ full_name: 'b/b', topics: ['markdown'] })
    const ranked = rankResults([lowMatch, highMatch], tags)
    expect(ranked[0].full_name).toBe('a/a')
  })

  it('gives recency boost to repos pushed within 7 days', () => {
    const tags: string[] = []
    const recent = makeRepo({
      full_name: 'a/a',
      stargazers_count: 100,
      pushed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    })
    const old = makeRepo({
      full_name: 'b/b',
      stargazers_count: 100,
      pushed_at: new Date(Date.now() - 365 * 86400000).toISOString(),
    })
    const ranked = rankResults([old, recent], tags)
    expect(ranked[0].full_name).toBe('a/a')
  })

  it('penalises very large repos', () => {
    const tags = ['cli']
    const big   = makeRepo({ full_name: 'a/a', topics: ['cli'], size: 600000 })
    const small = makeRepo({ full_name: 'b/b', topics: ['cli'], size: 500 })
    const ranked = rankResults([big, small], tags)
    expect(ranked[0].full_name).toBe('b/b')
  })

  it('attaches a score property to each result', () => {
    const ranked = rankResults([makeRepo({})], [])
    expect(ranked[0]).toHaveProperty('score')
    expect(typeof ranked[0].score).toBe('number')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run electron/smart-search.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `electron/smart-search.ts`**

```typescript
import { searchRepos as githubSearch } from './github'

export interface SearchResult {
  id: number
  full_name: string
  owner: { login: string }
  name: string
  description: string | null
  language: string | null
  topics: string[]
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  pushed_at: string
  size: number
  default_branch: string
  score?: number
}

// Raw search — single query, fast
export async function rawSearch(
  token: string | null,
  query: string,
  language?: string
): Promise<SearchResult[]> {
  let q = query
  if (language) q += ` language:${language}`
  return githubSearch(token, q, 30) as Promise<SearchResult[]>
}

// Natural language search — multi-query with tags
export async function tagSearch(
  token: string | null,
  tags: string[],
  originalQuery: string,
  language?: string
): Promise<SearchResult[]> {
  const langSuffix = language ? ` language:${language}` : ''

  const topicQuery = tags.slice(0, 3).map(t => `topic:${t}`).join(' ')
  const keywordQuery = tags.slice(0, 4).join(' ')

  const queries = [
    topicQuery   ? topicQuery + langSuffix   : null,
    keywordQuery ? keywordQuery + langSuffix : null,
    originalQuery + langSuffix,
  ].filter(Boolean) as string[]

  const results = await Promise.allSettled(
    queries.map(q => githubSearch(token, q, 20) as Promise<SearchResult[]>)
  )

  const seen = new Set<string>()
  const merged: SearchResult[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const repo of result.value) {
        if (!seen.has(repo.full_name)) {
          seen.add(repo.full_name)
          merged.push(repo)
        }
      }
    }
  }

  return rankResults(merged, tags)
}

// Exported for testing
export function rankResults(repos: SearchResult[], tags: string[]): SearchResult[] {
  const now = Date.now()

  return repos
    .map(repo => {
      let score = 0

      const repoTopics = repo.topics ?? []
      const tagMatchCount = tags.filter(tag =>
        repoTopics.some(t => t.includes(tag) || tag.includes(t))
      ).length
      score += tagMatchCount * 30

      const pushedDaysAgo = (now - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24)
      if (pushedDaysAgo < 7)   score += 20
      else if (pushedDaysAgo < 30)  score += 10
      else if (pushedDaysAgo < 180) score += 5

      score += Math.log10(Math.max(repo.stargazers_count, 1)) * 8

      if (tagMatchCount >= 3 && repo.stargazers_count < 5000) score += 15
      if (tagMatchCount >= 4 && repo.stargazers_count < 1000) score += 20

      if (repo.size > 500000) score -= 10

      return { ...repo, score }
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run electron/smart-search.test.ts
```
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add electron/smart-search.ts electron/smart-search.test.ts
git commit -m "feat(search): add smart-search with multi-query and re-ranking"
```

---

### Task 6: Related tags

**Files:**
- Create: `electron/related-tags.ts`
- Test: `electron/related-tags.test.ts`

- [ ] **Step 1: Write failing tests**

Create `electron/related-tags.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getRelatedTags } from './related-tags'

const repo = (topics: string[]) => ({ topics })

describe('getRelatedTags', () => {
  it('returns topics sorted by frequency', () => {
    const results = [
      repo(['cli', 'rust', 'terminal']),
      repo(['cli', 'rust']),
      repo(['cli']),
    ]
    const tags = getRelatedTags(results, [])
    expect(tags[0]).toBe('cli')
    expect(tags[1]).toBe('rust')
  })

  it('excludes current tags from results', () => {
    const results = [repo(['cli', 'rust']), repo(['cli'])]
    const tags = getRelatedTags(results, ['cli'])
    expect(tags).not.toContain('cli')
    expect(tags).toContain('rust')
  })

  it('respects the limit parameter', () => {
    const results = Array.from({ length: 20 }, (_, i) => repo([`topic-${i}`]))
    const tags = getRelatedTags(results, [], 5)
    expect(tags).toHaveLength(5)
  })

  it('returns empty array when results have no topics', () => {
    const results = [{ topics: [] }, { topics: undefined as any }]
    expect(getRelatedTags(results, [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run electron/related-tags.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `electron/related-tags.ts`**

```typescript
export function getRelatedTags(
  results: Array<{ topics?: string[] }>,
  currentTags: string[],
  limit = 8
): string[] {
  const freq = new Map<string, number>()

  for (const repo of results) {
    for (const topic of (repo.topics ?? [])) {
      if (!currentTags.includes(topic)) {
        freq.set(topic, (freq.get(topic) ?? 0) + 1)
      }
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run electron/related-tags.test.ts
```
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add electron/related-tags.ts electron/related-tags.test.ts
git commit -m "feat(search): add related tags derivation"
```

---

### Task 7: IPC handlers + topic cache init

**Files:**
- Modify: `electron/main.ts`

Add after the existing `github:searchRepos` handler (around line 383).

- [ ] **Step 1: Add imports to top of `electron/main.ts`**

Find the existing import line:
```typescript
import { OAUTH_URL, exchangeCode, getUser, getStarred, getRepo, searchRepos, getReadme, getReleases, starRepo, unstarRepo } from './github'
```

Replace with:
```typescript
import { OAUTH_URL, exchangeCode, getUser, getStarred, getRepo, searchRepos, getReadme, getReleases, starRepo, unstarRepo, fetchGitHubTopics } from './github'
import { extractTags } from './tag-extractor'
import { rawSearch, tagSearch } from './smart-search'
import { getRelatedTags } from './related-tags'
```

- [ ] **Step 2: Add `initTopicCache` helper function**

Add this function after the `seedCommunityCollections` section (before `getCollectionColors`):

```typescript
async function initTopicCache(token: string): Promise<void> {
  const db = getDb(app.getPath('userData'))
  const count = db.prepare('SELECT COUNT(*) as n FROM topic_cache').get() as { n: number }
  const lastFetch = db.prepare(
    'SELECT fetched_at FROM topic_cache ORDER BY fetched_at DESC LIMIT 1'
  ).get() as { fetched_at: string } | undefined

  const isStale = !lastFetch ||
    (Date.now() - new Date(lastFetch.fetched_at).getTime()) > 7 * 24 * 60 * 60 * 1000

  if (count.n === 0 || isStale) {
    try {
      const topics = await fetchGitHubTopics(token)
      const now = new Date().toISOString()
      const insert = db.prepare('INSERT OR REPLACE INTO topic_cache (topic, fetched_at) VALUES (?, ?)')
      const insertMany = db.transaction((ts: string[]) => {
        for (const topic of ts) insert.run(topic, now)
      })
      insertMany(topics)
    } catch {
      // Non-critical — silently ignore
    }
  }
}
```

- [ ] **Step 3: Call `initTopicCache` after successful GitHub exchange (new users)**

In the `github:exchange` handler, after `setToken(token)`, add the non-blocking call:

```typescript
ipcMain.handle('github:exchange', async (_event, code: string) => {
  const token = await exchangeCode(code)
  setToken(token)
  initTopicCache(token).catch(() => {}) // Non-blocking
})
```

- [ ] **Step 3b: Call `initTopicCache` on app ready (already-authenticated users)**

Find the `app.whenReady().then(...)` block in `electron/main.ts` and add the cache init after `seedCommunityCollections`:

```typescript
app.whenReady().then(() => {
  const db = getDb(app.getPath('userData'))
  seedCommunityCollections(db)
  startMCPServer()
  createWindow()
  const existingToken = getToken()
  if (existingToken) initTopicCache(existingToken).catch(() => {}) // Non-blocking
})
```

This ensures the topic cache is populated for users who are already connected and reopen the app — `extractTags` will have real GitHub topics to map against.

- [ ] **Step 4: Add the 5 IPC search handlers**

Append before the `app.whenReady()` call (or just after the starred IPC handlers):

```typescript
// ── Search IPC ──────────────────────────────────────────────────

ipcMain.handle('search:getTopics', async () => {
  const db = getDb(app.getPath('userData'))
  const rows = db.prepare('SELECT topic FROM topic_cache').all() as { topic: string }[]
  return rows.map(r => r.topic)
})

ipcMain.handle('search:extractTags', async (_, query: string) => {
  const apiKey = getApiKey()
  if (!apiKey) return []
  const db = getDb(app.getPath('userData'))
  const rows = db.prepare('SELECT topic FROM topic_cache').all() as { topic: string }[]
  const topics = rows.map(r => r.topic)
  return extractTags(query, topics, apiKey)
})

ipcMain.handle('search:raw', async (_, query: string, language?: string) => {
  const token = getToken() ?? null
  const db = getDb(app.getPath('userData'))
  const cacheKey = `raw:${query}:${language ?? 'all'}`
  const TTL = 30 * 60 * 1000

  const cached = db.prepare(
    'SELECT results, fetched_at FROM search_cache WHERE cache_key = ?'
  ).get(cacheKey) as { results: string; fetched_at: string } | undefined

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL) {
    return JSON.parse(cached.results)
  }

  const results = await rawSearch(token, query, language)

  db.prepare(
    'INSERT OR REPLACE INTO search_cache (cache_key, results, fetched_at) VALUES (?, ?, ?)'
  ).run(cacheKey, JSON.stringify(results), new Date().toISOString())

  return results
})

ipcMain.handle('search:tagged', async (_, tags: string[], originalQuery: string, language?: string) => {
  const token = getToken() ?? null
  const db = getDb(app.getPath('userData'))
  const cacheKey = `tagged:${[...tags].sort().join(',')}:${language ?? 'all'}`
  const TTL = 60 * 60 * 1000

  const cached = db.prepare(
    'SELECT results, fetched_at FROM search_cache WHERE cache_key = ?'
  ).get(cacheKey) as { results: string; fetched_at: string } | undefined

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL) {
    return JSON.parse(cached.results)
  }

  const results = await tagSearch(token, tags, originalQuery, language)

  db.prepare(
    'INSERT OR REPLACE INTO search_cache (cache_key, results, fetched_at) VALUES (?, ?, ?)'
  ).run(cacheKey, JSON.stringify(results), new Date().toISOString())

  return results
})

ipcMain.handle('search:getRelatedTags', async (_, results: any[], currentTags: string[]) => {
  return getRelatedTags(results, currentTags)
})
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat(search): add IPC handlers and topic cache init"
```

---

### Task 8: Preload + type declarations

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add `search` namespace to `electron/preload.ts`**

Add before the closing `})` of `contextBridge.exposeInMainWorld('api', {`:

```typescript
  search: {
    raw:            (query: string, language?: string) =>
      ipcRenderer.invoke('search:raw', query, language),
    tagged:         (tags: string[], originalQuery: string, language?: string) =>
      ipcRenderer.invoke('search:tagged', tags, originalQuery, language),
    extractTags:    (query: string) =>
      ipcRenderer.invoke('search:extractTags', query),
    getRelatedTags: (results: any[], currentTags: string[]) =>
      ipcRenderer.invoke('search:getRelatedTags', results, currentTags),
    getTopics:      () =>
      ipcRenderer.invoke('search:getTopics'),
  },
```

- [ ] **Step 2: Add `search` to `src/env.d.ts`**

Inside the `Window.api` interface, add after the `mcp` block:

```typescript
      search: {
        raw(query: string, language?: string): Promise<RepoRow[]>
        tagged(tags: string[], originalQuery: string, language?: string): Promise<RepoRow[]>
        extractTags(query: string): Promise<string[]>
        getRelatedTags(results: RepoRow[], currentTags: string[]): Promise<string[]>
        getTopics(): Promise<string[]>
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/env.d.ts
git commit -m "feat(search): expose search IPC via preload"
```

---

### Task 9: Discover view — rebuild search section

**Files:**
- Modify: `src/views/Discover.tsx`
- Modify: `src/views/Discover.test.tsx`

The `RepoCard` component and the language chip filter row are **unchanged**. Only the state, search handler, and the section between the topbar and results grid changes.

- [ ] **Step 1: Update imports and state in `Discover.tsx`**

Replace the import line and `Discover` function signature through to the first `useEffect`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BannerSVG, { getLangConfig } from '../components/BannerSVG'
import { useSavedRepos } from '../contexts/SavedRepos'
import { parseTopics, formatStars, type RepoRow } from '../types/repo'
import { detectSearchMode } from '../services/search-mode'
```

- [ ] **Step 2: Replace the `Discover` function state and handlers**

> ⚠️ **Preserve everything above the function:** `CHIPS`, `CHIP_QUALIFIERS`, `buildQuery`, `StarIcon`, and `RepoCard` must remain untouched. Only the `export default function Discover()` block (from its opening brace to the closing brace) is replaced. `useSavedRepos` stays in scope via `RepoCard` — do not remove it from imports.

Replace the body of `export default function Discover()` with the following (the function itself, not the module above it):

```typescript
export default function Discover() {
  const [repos, setRepos] = useState<RepoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeChip, setActiveChip] = useState('All')
  const [sort, setSort] = useState<'stars' | 'updated'>('stars')
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'raw' | 'natural'>('raw')
  const [detectedTags, setDetectedTags] = useState<string[]>([])
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [relatedTags, setRelatedTags] = useState<string[]>([])
  const [analysing, setAnalysing] = useState(false)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeLanguage = activeChip !== 'All' ? CHIPS_LANG[activeChip] ?? null : null

  // Sync language filter from URL params
  useEffect(() => {
    const lang = searchParams.get('lang')
    if (lang && (CHIPS as readonly string[]).includes(lang)) {
      setActiveChip(lang)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const loadTrending = useCallback(async () => {
    setLoading(true)
    setError(null)
    setRepos([])
    setRelatedTags([])
    try {
      const q = buildQuery(activeChip, '')
      const data = await window.api.github.searchRepos(q)
      setRepos(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [activeChip])

  // Load trending on mount and when chip changes with no query
  useEffect(() => {
    if (!query.trim()) loadTrending()
  }, [activeChip]) // eslint-disable-line react-hooks/exhaustive-deps

  const runTagSearch = useCallback(async (tags: string[]) => {
    setLoading(true)
    const langFilter = activeChip !== 'All' ? (CHIPS_LANG[activeChip] ?? undefined) : undefined
    try {
      const res = await window.api.search.tagged(tags, query, langFilter)
      setRepos(res)
      const related = await window.api.search.getRelatedTags(res, tags)
      setRelatedTags(related)
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [activeChip, query])

  const handleSearch = async () => {
    if (!query.trim()) {
      loadTrending()
      return
    }

    const searchMode = detectSearchMode(query)
    setMode(searchMode)
    setLoading(true)
    setError(null)

    const langFilter = activeChip !== 'All' ? (CHIPS_LANG[activeChip] ?? undefined) : undefined

    if (searchMode === 'raw') {
      try {
        const res = await window.api.search.raw(query, langFilter)
        setRepos(res)
        setDetectedTags([])
        setActiveTags([])
        const related = await window.api.search.getRelatedTags(res, [])
        setRelatedTags(related)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Search failed')
      } finally {
        setLoading(false)
      }
    } else {
      setAnalysing(true)
      try {
        const tags = await window.api.search.extractTags(query)
        const usedTags = tags.length > 0 ? tags : query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 5)
        setDetectedTags(usedTags)
        setActiveTags(usedTags)
        setAnalysing(false)
        await runTagSearch(usedTags)
      } catch (e: unknown) {
        setAnalysing(false)
        // Fall back to raw search
        try {
          const res = await window.api.search.raw(query, langFilter)
          setRepos(res)
        } catch {
          setError('Search failed')
        } finally {
          setLoading(false)
        }
      }
    }
  }

  function addTag(tag: string) {
    if (activeTags.includes(tag)) return
    const next = [...activeTags, tag]
    setActiveTags(next)
    setDetectedTags(prev => prev.includes(tag) ? prev : [...prev, tag])
    runTagSearch(next)
  }

  function getSectionLabel(): string {
    if (!query.trim()) return 'Trending this week'
    if (mode === 'raw') return `Results for "${query}"`
    if (activeTags.length > 0) return `Results for: ${activeTags.join(', ')}`
    return 'Results'
  }

  const filtered = [...repos].sort((a, b) =>
    sort === 'stars'
      ? (b.stars ?? 0) - (a.stars ?? 0)
      : new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
  )

  return (
    <div className="discover">
      <div className="discover-topbar">
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            className="discover-search"
            placeholder="Search repos, or describe what you need…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
          />
          {analysing && (
            <div style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: 'var(--t3)',
            }}>
              Analysing…
            </div>
          )}
        </div>
        <button
          className={`discover-sort-btn${sort === 'stars' ? ' active' : ''}`}
          onClick={() => setSort('stars')}
        >
          ★ Stars
        </button>
        <button
          className={`discover-sort-btn${sort === 'updated' ? ' active' : ''}`}
          onClick={() => setSort('updated')}
        >
          Updated
        </button>
      </div>

      {/* Detected tag pills (natural language mode only) */}
      {detectedTags.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>Detected:</span>
          {activeTags.map(tag => (
            <button
              key={tag}
              onClick={() => {
                const next = activeTags.filter(t => t !== tag)
                setActiveTags(next)
                if (next.length === 0) {
                  loadTrending()
                } else {
                  runTagSearch(next)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                borderRadius: 20,
                padding: '3px 8px 3px 10px',
                fontSize: 11,
                color: 'var(--accent-text)',
                cursor: 'pointer',
              }}
            >
              {tag}
              <span style={{ opacity: 0.5, fontSize: 10 }}>×</span>
            </button>
          ))}
        </div>
      )}

      <div className="discover-chips">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            className={`discover-chip${activeChip === chip ? ' active' : ''}`}
            onClick={() => setActiveChip(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="discover-content">
        <div className="discover-section-header">
          <span>{getSectionLabel()}</span>
          <div className="discover-section-line" />
        </div>

        {/* Related tags row */}
        {relatedTags.length > 0 && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 20px 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>Related:</span>
            {relatedTags.map(tag => (
              <button
                key={tag}
                onClick={() => addTag(tag)}
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border2)',
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontSize: 11,
                  color: 'var(--t2)',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg4)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg3)')}
              >
                + {tag}
              </button>
            ))}
          </div>
        )}

        {error && <div className="discover-status">Failed to load — {error}</div>}

        {/* Skeleton loading cards */}
        {loading && (
          <div className="discover-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                height: 280,
                animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && repos.length === 0 && query.trim() && (
          <div style={{
            gridColumn: '1 / -1',
            padding: '48px 0',
            textAlign: 'center',
            color: 'var(--t3)',
            fontSize: 13,
          }}>
            <div style={{ marginBottom: 8 }}>No repos found for "{query}"</div>
            <div style={{ fontSize: 11 }}>
              Try different keywords, or describe what you need and we'll find matches
            </div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="discover-grid">
            {filtered.map((repo) => (
              <RepoCard
                key={`${repo.owner}/${repo.name}`}
                repo={repo}
                onNavigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add `CHIPS_LANG` map (language qualifier by chip name)**

After the existing `CHIP_QUALIFIERS` constant, add:

```typescript
// Maps chip name to a raw language string for search:raw / search:tagged
const CHIPS_LANG: Record<string, string> = {
  'Python':     'python',
  'TypeScript': 'typescript',
  'Rust':       'rust',
  'Go':         'go',
}
```

- [ ] **Step 4: Add shimmer keyframes to `src/styles/globals.css`**

Add at the end of globals.css:

```css
@keyframes shimmer {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
```

- [ ] **Step 5: Update `Discover.test.tsx` to add `window.api.search` mock**

In `makeDiscoverApi`, add a `search` key:

```typescript
search: {
  raw:            vi.fn().mockResolvedValue([]),
  tagged:         vi.fn().mockResolvedValue([]),
  extractTags:    vi.fn().mockResolvedValue([]),
  getRelatedTags: vi.fn().mockResolvedValue([]),
  getTopics:      vi.fn().mockResolvedValue([]),
},
```

- [ ] **Step 6: Run full test suite**

```bash
npm test -- --run
```
Expected: All tests pass (153+).

- [ ] **Step 7: Commit**

```bash
git add src/views/Discover.tsx src/views/Discover.test.tsx src/styles/globals.css src/services/search-mode.ts
git commit -m "feat(discover): smart search — mode detection, tag pills, related tags, skeleton loading"
```

---

## Verification Checklist

After all tasks complete, verify manually in the running app:

- [ ] **Raw mode:** Type "fastapi" → instant results, no "Analysing…", top result is tiangolo/fastapi
- [ ] **Raw mode:** Type "electron" → returns electron-related repos, related tags appear
- [ ] **Natural language:** Type "something to render markdown in the terminal" → "Analysing…" flickers, detected tag pills show (markdown, terminal, cli or similar), results are relevant
- [ ] **Natural language:** Type "I need a fast HTTP client for Python" → tags include http, python, results are Python HTTP libs
- [ ] **Tag removal:** Click × on a detected tag → results update
- [ ] **Related tag click:** Click a related tag pill → tag added, results narrow
- [ ] **No API key:** Natural language without Anthropic key → falls back to raw silently
- [ ] **Skeleton:** Loading state shows shimmer card grid, not plain text spinner
