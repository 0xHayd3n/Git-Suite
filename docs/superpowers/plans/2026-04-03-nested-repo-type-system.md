# Nested Repo Type System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 6-type repo classifier with a two-tier nested taxonomy (6 buckets × sub-types), persist bucket/sub-type to SQLite at upsert time, and add a 6-column multi-select TypeFilterDropdown to the Discover filter row.

**Architecture:** Classification runs in the Electron main process at each GitHub upsert, writing `type_bucket` and `type_sub` to SQLite. The Discover filter reads these fields directly from `RepoRow`. Cards continue using a backward-compatible `classifyRepoType()` shim that maps bucket → legacy type for accent colors — zero changes to card components.

**Tech Stack:** Electron + better-sqlite3, React + TypeScript, Vite (electron-vite), Vitest + Testing Library

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/constants/repoTypes.ts` | Taxonomy data: buckets, sub-types, flat list |
| Modify | `src/types/repo.ts` | Add `type_bucket`, `type_sub` to `RepoRow` |
| Modify | `electron/db.ts` | Phase 16 migration: add two columns |
| Rewrite | `src/lib/classifyRepoType.ts` | New `classifyRepoBucket` + backward-compat shim |
| Modify | `src/lib/classifyRepoType.test.ts` | Delete 5 old tests, update factory, add bucket tests |
| Modify | `electron/main.ts` | Import classifier, update 4 upsert sites |
| Create | `src/components/TypeFilterDropdown.tsx` | 6-column multi-select filter dropdown |
| Create | `src/components/TypeFilterDropdown.test.tsx` | Component tests |
| Modify | `src/styles/globals.css` | New `.tfd-*` CSS classes |
| Modify | `src/views/Discover.tsx` | Swap state + component, update filter predicate |
| Delete | `src/components/TypeDropdown.tsx` | Replaced by TypeFilterDropdown |
| Delete | `src/components/TypeDropdown.test.tsx` | No longer has a subject |

---

## Task 1: Taxonomy Constants

**Files:**
- Create: `src/constants/repoTypes.ts`

- [ ] **Step 1: Create `src/constants/repoTypes.ts`**

```ts
export type RepoSubType = { id: string; label: string; bucket: string }
export type RepoBucket  = { id: string; label: string; color: string; subTypes: RepoSubType[] }

export const REPO_BUCKETS: RepoBucket[] = [
  {
    id: 'dev-tools', label: 'Dev Tools', color: '#3b82f6',
    subTypes: [
      { id: 'algorithm',  label: 'Algorithm',    bucket: 'dev-tools' },
      { id: 'testing',    label: 'Testing',       bucket: 'dev-tools' },
      { id: 'build-tool', label: 'Build Tool',    bucket: 'dev-tools' },
      { id: 'pkg-manager',label: 'Pkg Manager',   bucket: 'dev-tools' },
      { id: 'linter',     label: 'Linter',        bucket: 'dev-tools' },
      { id: 'formatter',  label: 'Formatter',     bucket: 'dev-tools' },
      { id: 'debugger',   label: 'Debugger',      bucket: 'dev-tools' },
      { id: 'vcs-tool',   label: 'VCS Tool',      bucket: 'dev-tools' },
    ],
  },
  {
    id: 'ai-ml', label: 'AI & ML', color: '#8b5cf6',
    subTypes: [
      { id: 'ai-model',    label: 'AI Model',      bucket: 'ai-ml' },
      { id: 'ml-framework',label: 'ML Framework',  bucket: 'ai-ml' },
      { id: 'dataset',     label: 'Dataset',       bucket: 'ai-ml' },
      { id: 'neural-net',  label: 'Neural Net',    bucket: 'ai-ml' },
      { id: 'ai-agent',    label: 'AI Agent',      bucket: 'ai-ml' },
      { id: 'prompt-lib',  label: 'Prompt Lib',    bucket: 'ai-ml' },
    ],
  },
  {
    id: 'editors', label: 'Editors & IDEs', color: '#14b8a6',
    subTypes: [
      { id: 'code-editor', label: 'Code Editor',   bucket: 'editors' },
      { id: 'ide',         label: 'IDE',            bucket: 'editors' },
      { id: 'terminal',    label: 'Terminal',       bucket: 'editors' },
      { id: 'notebook',    label: 'Notebook',       bucket: 'editors' },
      { id: 'text-editor', label: 'Text Editor',    bucket: 'editors' },
    ],
  },
  {
    id: 'lang-projects', label: 'Language Projects', color: '#f59e0b',
    subTypes: [
      { id: 'lang-impl',   label: 'Language Impl',  bucket: 'lang-projects' },
      { id: 'style-guide', label: 'Style Guide',    bucket: 'lang-projects' },
      { id: 'transpiler',  label: 'Transpiler',     bucket: 'lang-projects' },
      { id: 'runtime',     label: 'Runtime',        bucket: 'lang-projects' },
      { id: 'compiler',    label: 'Compiler',       bucket: 'lang-projects' },
    ],
  },
  {
    id: 'infrastructure', label: 'Infrastructure', color: '#ef4444',
    subTypes: [
      { id: 'database',      label: 'Database',       bucket: 'infrastructure' },
      { id: 'container',     label: 'Container',      bucket: 'infrastructure' },
      { id: 'devops',        label: 'DevOps',         bucket: 'infrastructure' },
      { id: 'cloud-platform',label: 'Cloud Platform', bucket: 'infrastructure' },
      { id: 'monitoring',    label: 'Monitoring',     bucket: 'infrastructure' },
      { id: 'networking',    label: 'Networking',     bucket: 'infrastructure' },
    ],
  },
  {
    id: 'utilities', label: 'Utilities', color: '#6b7280',
    subTypes: [
      { id: 'cli-tool',   label: 'CLI Tool',    bucket: 'utilities' },
      { id: 'library',    label: 'Library',     bucket: 'utilities' },
      { id: 'platform',   label: 'Platform',    bucket: 'utilities' },
      { id: 'api-client', label: 'API Client',  bucket: 'utilities' },
      { id: 'boilerplate',label: 'Boilerplate', bucket: 'utilities' },
      { id: 'plugin',     label: 'Plugin',      bucket: 'utilities' },
    ],
  },
]

export const REPO_SUB_TYPES: RepoSubType[] =
  REPO_BUCKETS.flatMap(b => b.subTypes)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/constants/repoTypes.ts
git commit -m "feat: add nested repo type taxonomy constants"
```

---

## Task 2: SQLite Migration + RepoRow Types

**Files:**
- Modify: `electron/db.ts`
- Modify: `src/types/repo.ts`

- [ ] **Step 1: Add Phase 16 migration to `electron/db.ts`**

After the last Phase 15 migration block (around line 132), add:

```ts
  // Phase 16 migration — nested repo type system
  try { db.exec(`ALTER TABLE repos ADD COLUMN type_bucket TEXT`) } catch {}
  try { db.exec(`ALTER TABLE repos ADD COLUMN type_sub    TEXT`) } catch {}
```

- [ ] **Step 2: Add fields to `RepoRow` in `src/types/repo.ts`**

After `verified_checked_at` (the last field), add:

```ts
  // Phase 16 — nested repo type system
  type_bucket: string | null  // e.g. "dev-tools"
  type_sub:    string | null  // e.g. "algorithm"
```

- [ ] **Step 3: Run tests to verify nothing broke**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass. If TypeScript errors appear about `makeRepo` missing the new fields, that's expected — it will be fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add electron/db.ts src/types/repo.ts
git commit -m "feat: add type_bucket and type_sub columns to SQLite schema"
```

---

## Task 3: Classifier Rewrite + Tests

**Files:**
- Rewrite: `src/lib/classifyRepoType.ts`
- Modify: `src/lib/classifyRepoType.test.ts`

### Step 1 — Update the test file first (TDD)

- [ ] **Step 1a: Update `makeRepo` factory — add new fields**

In `src/lib/classifyRepoType.test.ts`, add the two new nullable fields to the `makeRepo` return object (after `verification_checked_at: null`):

```ts
    type_bucket: null,
    type_sub:    null,
```

- [ ] **Step 1b: Delete the 5 tests that will no longer pass**

Remove these `it(...)` blocks from the `describe('classifyRepoType', ...)` suite — they test scoring logic that no longer exists after the rewrite:

1. `'classifies awesome-list by topic'`
2. `'classifies awesome-list by name prefix'`
3. `'classifies awesome-list by description'`
4. `'classifies learning by topic'`
5. `'classifies learning by description'`

Also remove: `'description matching is case-insensitive'` (tests `curated list` → `awesome-list`) and `'awesome-list beats learning when both have signals'` — 7 total removals.

- [ ] **Step 1c: Add `classifyRepoBucket` import to the test file**

```ts
import { classifyRepoType, classifyRepoBucket } from './classifyRepoType'
```

- [ ] **Step 1d: Add `classifyRepoBucket` test suite**

Append after the existing `describe('classifyRepoType', ...)` block:

```ts
describe('classifyRepoBucket', () => {
  // AI & ML — topics
  it('classifies llm topic as ai-ml/ai-model', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["llm"]' }))).toEqual({ bucket: 'ai-ml', subType: 'ai-model' })
  })
  it('classifies ai-agent topic as ai-ml/ai-agent', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["ai-agent"]' }))).toEqual({ bucket: 'ai-ml', subType: 'ai-agent' })
  })
  it('classifies prompt topic as ai-ml/prompt-lib', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["prompt-engineering"]' }))).toEqual({ bucket: 'ai-ml', subType: 'prompt-lib' })
  })

  // Dev Tools — topics
  it('classifies algorithm topic as dev-tools/algorithm', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["algorithm"]' }))).toEqual({ bucket: 'dev-tools', subType: 'algorithm' })
  })
  it('classifies jest topic as dev-tools/testing', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["jest"]' }))).toEqual({ bucket: 'dev-tools', subType: 'testing' })
  })
  it('classifies docker topic as infrastructure/container', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["docker"]' }))).toEqual({ bucket: 'infrastructure', subType: 'container' })
  })
  it('classifies cli topic as utilities/cli-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["cli"]' }))).toEqual({ bucket: 'utilities', subType: 'cli-tool' })
  })

  // Name signals
  it('classifies neovim name as editors/code-editor', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'neovim-config' }))).toEqual({ bucket: 'editors', subType: 'code-editor' })
  })
  it('classifies eslint name as dev-tools/linter', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'eslint-plugin-react' }))).toEqual({ bucket: 'dev-tools', subType: 'linter' })
  })
  it('classifies postgres name as infrastructure/database', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'postgres-client' }))).toEqual({ bucket: 'infrastructure', subType: 'database' })
  })
  it('classifies boilerplate name as utilities/boilerplate', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'react-boilerplate' }))).toEqual({ bucket: 'utilities', subType: 'boilerplate' })
  })

  // Priority
  it('topics take precedence over name', () => {
    // docker topic beats postgres name
    const repo = makeRepo({ topics: '["docker"]', name: 'postgres-client' })
    expect(classifyRepoBucket(repo)).toEqual({ bucket: 'infrastructure', subType: 'container' })
  })

  // Null / edge cases
  it('returns null for repos with no matching signals', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'random-project' }))).toBeNull()
  })
  it('handles malformed topics JSON gracefully', () => {
    expect(classifyRepoBucket(makeRepo({ topics: 'not-json', name: 'random-project' }))).toBeNull()
  })
  it('handles null description without throwing', () => {
    expect(classifyRepoBucket(makeRepo({ description: null, topics: '["cli"]' }))).toEqual({ bucket: 'utilities', subType: 'cli-tool' })
  })
})

describe('classifyRepoType shim', () => {
  it('maps dev-tools bucket to tool', () => {
    expect(classifyRepoType(makeRepo({ topics: '["algorithm"]' }))).toBe('tool')
  })
  it('maps ai-ml bucket to framework', () => {
    expect(classifyRepoType(makeRepo({ topics: '["llm"]' }))).toBe('framework')
  })
  it('maps editors bucket to application', () => {
    expect(classifyRepoType(makeRepo({ topics: '["vscode"]' }))).toBe('application')
  })
  it('maps infrastructure bucket to tool', () => {
    expect(classifyRepoType(makeRepo({ topics: '["docker"]' }))).toBe('tool')
  })
  it('maps utilities bucket to tool', () => {
    expect(classifyRepoType(makeRepo({ topics: '["cli"]' }))).toBe('tool')
  })
  it('returns other for null classification', () => {
    expect(classifyRepoType(makeRepo({ name: 'random-project' }))).toBe('other')
  })
  it('handles malformed topics gracefully', () => {
    expect(classifyRepoType(makeRepo({ topics: 'not-json', name: 'random-project' }))).toBe('other')
  })
})
```

- [ ] **Step 1e: Run tests — verify they fail (classifyRepoBucket not yet defined)**

```bash
npx vitest run src/lib/classifyRepoType.test.ts 2>&1 | tail -20
```

Expected: FAIL — `classifyRepoBucket is not a function` / import error.

### Step 2 — Rewrite the classifier

- [ ] **Step 2a: Replace `src/lib/classifyRepoType.ts` entirely**

```ts
import type { RepoRow } from '../types/repo'

// ── New core classifier ───────────────────────────────────────────

export function classifyRepoBucket(
  repo: { name: string; description: string | null; topics: string }
): { bucket: string; subType: string } | null {
  let topics: string[] = []
  try { topics = JSON.parse(repo.topics) as string[] } catch {}

  const name = repo.name.toLowerCase()
  const desc = (repo.description ?? '').toLowerCase()

  const hasTopic = (...kw: string[]) => topics.some(t => kw.includes(t))
  const nameHas  = (...kw: string[]) => kw.some(k => name.includes(k))
  const descHas  = (...kw: string[]) => kw.some(k => desc.includes(k))

  // ── Topics (highest priority) ────────────────────────────────────

  // AI & ML
  if (hasTopic('machine-learning', 'deep-learning', 'neural-network', 'llm', 'gpt', 'transformer'))
    return { bucket: 'ai-ml', subType: 'ai-model' }
  if (hasTopic('ml-framework', 'pytorch', 'tensorflow', 'scikit-learn', 'keras'))
    return { bucket: 'ai-ml', subType: 'ml-framework' }
  if (hasTopic('ai-agent', 'agent', 'langchain'))
    return { bucket: 'ai-ml', subType: 'ai-agent' }
  if (hasTopic('prompt', 'prompt-engineering'))
    return { bucket: 'ai-ml', subType: 'prompt-lib' }
  if (hasTopic('dataset'))
    return { bucket: 'ai-ml', subType: 'dataset' }

  // Dev Tools
  if (hasTopic('algorithm', 'data-structures'))
    return { bucket: 'dev-tools', subType: 'algorithm' }
  if (hasTopic('testing', 'jest', 'pytest', 'mocha', 'test-framework', 'vitest'))
    return { bucket: 'dev-tools', subType: 'testing' }
  if (hasTopic('linter', 'eslint', 'prettier', 'rubocop'))
    return { bucket: 'dev-tools', subType: 'linter' }
  if (hasTopic('formatter', 'autopep8'))
    return { bucket: 'dev-tools', subType: 'formatter' }
  if (hasTopic('build-tool', 'webpack', 'vite', 'rollup', 'cmake', 'gradle'))
    return { bucket: 'dev-tools', subType: 'build-tool' }
  if (hasTopic('pkg-manager', 'package-manager'))
    return { bucket: 'dev-tools', subType: 'pkg-manager' }
  if (hasTopic('debugger'))
    return { bucket: 'dev-tools', subType: 'debugger' }
  if (hasTopic('git', 'vcs', 'svn', 'mercurial', 'version-control'))
    return { bucket: 'dev-tools', subType: 'vcs-tool' }

  // Editors
  if (hasTopic('vscode', 'neovim', 'vim', 'emacs', 'zed', 'helix', 'code-editor'))
    return { bucket: 'editors', subType: 'code-editor' }
  if (hasTopic('ide', 'intellij', 'eclipse', 'xcode', 'android-studio'))
    return { bucket: 'editors', subType: 'ide' }
  if (hasTopic('terminal', 'terminal-emulator'))
    return { bucket: 'editors', subType: 'terminal' }
  if (hasTopic('notebook', 'jupyter'))
    return { bucket: 'editors', subType: 'notebook' }

  // Infrastructure
  if (hasTopic('docker', 'container', 'containers'))
    return { bucket: 'infrastructure', subType: 'container' }
  if (hasTopic('kubernetes', 'helm', 'terraform', 'devops', 'ansible', 'ci-cd'))
    return { bucket: 'infrastructure', subType: 'devops' }
  if (hasTopic('database', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'postgresql'))
    return { bucket: 'infrastructure', subType: 'database' }
  if (hasTopic('monitoring', 'observability', 'prometheus', 'grafana', 'datadog'))
    return { bucket: 'infrastructure', subType: 'monitoring' }
  if (hasTopic('networking', 'proxy', 'load-balancer'))
    return { bucket: 'infrastructure', subType: 'networking' }

  // Utilities
  if (hasTopic('cli', 'command-line', 'command-line-tool'))
    return { bucket: 'utilities', subType: 'cli-tool' }
  if (hasTopic('plugin', 'extension'))
    return { bucket: 'utilities', subType: 'plugin' }
  if (hasTopic('boilerplate', 'starter', 'template'))
    return { bucket: 'utilities', subType: 'boilerplate' }
  if (hasTopic('library', 'lib'))
    return { bucket: 'utilities', subType: 'library' }
  if (hasTopic('api-client', 'sdk'))
    return { bucket: 'utilities', subType: 'api-client' }

  // ── Name signals ─────────────────────────────────────────────────

  // Editors — name
  if (nameHas('vscode', 'neovim', 'nvim', 'emacs', 'zed', 'helix'))
    return { bucket: 'editors', subType: 'code-editor' }
  if (nameHas('intellij', 'eclipse', 'xcode', 'android-studio'))
    return { bucket: 'editors', subType: 'ide' }
  if (nameHas('iterm', 'alacritty', 'wezterm', 'kitty'))
    return { bucket: 'editors', subType: 'terminal' }
  if (nameHas('jupyter'))
    return { bucket: 'editors', subType: 'notebook' }

  // Dev Tools — name
  if (nameHas('eslint', 'prettier', 'rubocop', 'pylint', 'flake8'))
    return { bucket: 'dev-tools', subType: 'linter' }
  if (nameHas('webpack', 'rollup', 'cmake', 'gradle', 'esbuild', 'parcel'))
    return { bucket: 'dev-tools', subType: 'build-tool' }
  if (nameHas('homebrew', 'cargo', 'pnpm'))
    return { bucket: 'dev-tools', subType: 'pkg-manager' }
  if (nameHas('debugger', 'gdb', 'lldb'))
    return { bucket: 'dev-tools', subType: 'debugger' }
  if (nameHas('svn', 'mercurial'))
    return { bucket: 'dev-tools', subType: 'vcs-tool' }

  // Infrastructure — name
  if (nameHas('kubernetes', 'helm', 'terraform', 'ansible'))
    return { bucket: 'infrastructure', subType: 'devops' }
  if (nameHas('postgres', 'postgresql', 'mysql', 'mongodb', 'redis'))
    return { bucket: 'infrastructure', subType: 'database' }
  if (nameHas('prometheus', 'grafana', 'datadog'))
    return { bucket: 'infrastructure', subType: 'monitoring' }
  if (nameHas('nginx', 'caddy', 'haproxy'))
    return { bucket: 'infrastructure', subType: 'networking' }

  // Utilities — name
  if (nameHas('boilerplate', 'starter', 'template'))
    return { bucket: 'utilities', subType: 'boilerplate' }

  // ── Description signals ──────────────────────────────────────────

  if (descHas('machine learning', 'deep learning', 'neural network', 'large language model'))
    return { bucket: 'ai-ml', subType: 'ai-model' }
  if (descHas('docker', 'containerized', 'container'))
    return { bucket: 'infrastructure', subType: 'container' }
  if (descHas('database', 'sql database', 'nosql'))
    return { bucket: 'infrastructure', subType: 'database' }
  if (descHas('command-line tool', 'cli tool', 'command line interface'))
    return { bucket: 'utilities', subType: 'cli-tool' }

  return null
}

// ── Backward-compatible shim ─────────────────────────────────────
// All existing callers (RepoCard, RepoListRow, BannerSVG, RepoDetail,
// REPO_TYPE_CONFIG) continue to work with zero changes.

export type RepoType =
  | 'awesome-list'
  | 'learning'
  | 'framework'
  | 'tool'
  | 'application'
  | 'other'

const BUCKET_TO_LEGACY: Record<string, RepoType> = {
  'dev-tools':      'tool',
  'ai-ml':          'framework',
  'editors':        'application',
  'lang-projects':  'framework',
  'infrastructure': 'tool',
  'utilities':      'tool',
}

export function classifyRepoType(repo: RepoRow): RepoType {
  const result = classifyRepoBucket(repo)
  return result ? (BUCKET_TO_LEGACY[result.bucket] ?? 'other') : 'other'
}
```

- [ ] **Step 2b: Run the classifier tests**

```bash
npx vitest run src/lib/classifyRepoType.test.ts 2>&1 | tail -30
```

Expected: all tests PASS. Fix any failures before continuing.

- [ ] **Step 2c: Run the full test suite to check for regressions**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 2d: Commit**

```bash
git add src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: rewrite classifyRepoType with nested bucket/subType classifier"
```

---

## Task 4: Electron Upsert Integration

**Files:**
- Modify: `electron/main.ts`

This task adds `classifyRepoBucket` to 4 upsert sites. The pattern is the same for all 4: classify the repo before the upsert, add `type_bucket`/`type_sub` to the INSERT column list and ON CONFLICT clause, pass `cls?.bucket ?? null` and `cls?.subType ?? null` to `.run()`.

- [ ] **Step 1: Add the import**

At the top of `electron/main.ts`, after the existing imports, add:

```ts
import { classifyRepoBucket } from '../src/lib/classifyRepoType'
```

- [ ] **Step 2: Update `github:getStarred` upsert (around line 332)**

Replace the `db.prepare(...)` SQL string and loop:

```ts
  const upsert = db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks,
                       license, homepage, updated_at, pushed_at, starred_at, saved_at, type, banner_svg,
                       default_branch, avatar_url, type_bucket, type_sub)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)
    ON CONFLICT(owner, name) DO UPDATE SET
      description    = excluded.description,
      language       = excluded.language,
      topics         = excluded.topics,
      stars          = excluded.stars,
      forks          = excluded.forks,
      updated_at     = excluded.updated_at,
      pushed_at      = excluded.pushed_at,
      starred_at     = excluded.starred_at,
      default_branch = excluded.default_branch,
      avatar_url     = COALESCE(excluded.avatar_url, repos.avatar_url),
      saved_at       = repos.saved_at,
      type           = repos.type,
      banner_svg     = repos.banner_svg,
      banner_color   = repos.banner_color,
      type_bucket    = excluded.type_bucket,
      type_sub       = excluded.type_sub
  `)
```

In the loop, add classification before the `upsert.run()` call:

```ts
    for (const item of starredItems) {
      const repo = item.repo
      const cls = classifyRepoBucket({
        name: repo.name,
        description: repo.description ?? null,
        topics: JSON.stringify(repo.topics ?? []),
      })
      upsert.run(
        String(repo.id),
        repo.owner.login,
        repo.name,
        repo.description,
        repo.language,
        JSON.stringify(repo.topics ?? []),
        repo.stargazers_count,
        repo.forks_count,
        repo.license?.spdx_id ?? null,
        repo.homepage,
        repo.updated_at,
        repo.pushed_at,
        item.starred_at,
        repo.default_branch ?? 'main',
        repo.owner.avatar_url ?? null,
        cls?.bucket ?? null,
        cls?.subType ?? null,
      )
    }
```

- [ ] **Step 3: Update `github:searchRepos` upsert (around line 414)**

```ts
  const upsert = db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                       homepage, updated_at, pushed_at, saved_at, type, banner_svg,
                       discovered_at, discover_query, watchers, size, open_issues, default_branch, avatar_url,
                       type_bucket, type_sub)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, name) DO UPDATE SET
      description    = excluded.description,
      language       = excluded.language,
      topics         = excluded.topics,
      stars          = excluded.stars,
      forks          = excluded.forks,
      updated_at     = excluded.updated_at,
      pushed_at      = excluded.pushed_at,
      discovered_at  = excluded.discovered_at,
      discover_query = excluded.discover_query,
      watchers       = excluded.watchers,
      size           = excluded.size,
      open_issues    = excluded.open_issues,
      default_branch = excluded.default_branch,
      avatar_url     = COALESCE(excluded.avatar_url, repos.avatar_url),
      saved_at       = repos.saved_at,
      banner_color   = repos.banner_color,
      type_bucket    = excluded.type_bucket,
      type_sub       = excluded.type_sub
  `)
```

In the loop:

```ts
    for (const repo of items) {
      const cls = classifyRepoBucket({
        name: repo.name,
        description: repo.description ?? null,
        topics: JSON.stringify(repo.topics ?? []),
      })
      upsert.run(
        String(repo.id), repo.owner.login, repo.name, repo.description, repo.language,
        JSON.stringify(repo.topics ?? []), repo.stargazers_count, repo.forks_count,
        repo.license?.spdx_id ?? null, repo.homepage, repo.updated_at, repo.pushed_at,
        now, query, repo.watchers_count, repo.size, repo.open_issues_count,
        repo.default_branch ?? 'main', repo.owner.avatar_url ?? null,
        cls?.bucket ?? null, cls?.subType ?? null,
      )
    }
```

- [ ] **Step 4: Update `github:getRepo` upsert (around line 477)**

Add `type_bucket, type_sub` to the INSERT columns and ON CONFLICT, and compute classification:

```ts
  const cls = classifyRepoBucket({
    name,
    description: repo.description ?? null,
    topics: JSON.stringify(repo.topics ?? []),
  })

  db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                       homepage, updated_at, pushed_at, saved_at, type, banner_svg,
                       discovered_at, discover_query, watchers, size, open_issues, default_branch, avatar_url,
                       type_bucket, type_sub)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, name) DO UPDATE SET
      description    = excluded.description,
      language       = excluded.language,
      topics         = excluded.topics,
      stars          = excluded.stars,
      forks          = excluded.forks,
      updated_at     = excluded.updated_at,
      pushed_at      = excluded.pushed_at,
      watchers       = excluded.watchers,
      size           = excluded.size,
      open_issues    = excluded.open_issues,
      default_branch = excluded.default_branch,
      avatar_url     = COALESCE(excluded.avatar_url, repos.avatar_url),
      saved_at       = repos.saved_at,
      discovered_at  = repos.discovered_at,
      discover_query = repos.discover_query,
      banner_color   = repos.banner_color,
      type_bucket    = excluded.type_bucket,
      type_sub       = excluded.type_sub
  `).run(
    String(repo.id), owner, name, repo.description, repo.language,
    JSON.stringify(repo.topics ?? []), repo.stargazers_count, repo.forks_count,
    repo.license?.spdx_id ?? null, repo.homepage, repo.updated_at, repo.pushed_at,
    repo.watchers_count, repo.size, repo.open_issues_count,
    repo.default_branch ?? 'main', repo.owner.avatar_url ?? null,
    cls?.bucket ?? null, cls?.subType ?? null,
  )
```

- [ ] **Step 5: Update `upsertAndReturnRepoRows` helper (around line 1154)**

```ts
  const upsert = db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks, license,
                       homepage, updated_at, pushed_at, saved_at, type, banner_svg,
                       discovered_at, discover_query, watchers, size, open_issues, default_branch,
                       type_bucket, type_sub)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, name) DO UPDATE SET
      description    = excluded.description,
      language       = excluded.language,
      topics         = excluded.topics,
      stars          = excluded.stars,
      forks          = excluded.forks,
      updated_at     = excluded.updated_at,
      pushed_at      = excluded.pushed_at,
      discovered_at  = excluded.discovered_at,
      discover_query = excluded.discover_query,
      watchers       = excluded.watchers,
      size           = excluded.size,
      open_issues    = excluded.open_issues,
      default_branch = excluded.default_branch,
      saved_at       = repos.saved_at,
      type_bucket    = excluded.type_bucket,
      type_sub       = excluded.type_sub
  `)
```

In the loop:

```ts
    for (const repo of results) {
      const cls = classifyRepoBucket({
        name: repo.name,
        description: repo.description ?? null,
        topics: JSON.stringify(repo.topics ?? []),
      })
      upsert.run(
        String(repo.id), repo.owner.login, repo.name, repo.description, repo.language,
        JSON.stringify(repo.topics ?? []), repo.stargazers_count, repo.forks_count,
        repo.license?.spdx_id ?? null, repo.homepage, repo.updated_at, repo.pushed_at,
        now, query, repo.watchers_count ?? null, repo.size, repo.open_issues_count ?? null,
        repo.default_branch ?? 'main',
        cls?.bucket ?? null, cls?.subType ?? null,
      )
    }
```

- [ ] **Step 6: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS. The upsert tests in `electron/upsert.test.ts` use `initSchema` which will now include the Phase 16 columns — verify they still pass.

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
git commit -m "feat: classify and persist type_bucket/type_sub at GitHub upsert time"
```

---

## Task 5: TypeFilterDropdown Component + CSS

**Files:**
- Create: `src/components/TypeFilterDropdown.test.tsx`
- Create: `src/components/TypeFilterDropdown.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Write failing tests in `src/components/TypeFilterDropdown.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TypeFilterDropdown from './TypeFilterDropdown'

describe('TypeFilterDropdown', () => {
  it('renders a trigger button labeled "Type"', () => {
    render(<TypeFilterDropdown selected={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /type/i })).toBeInTheDocument()
  })

  it('does not show panel by default', () => {
    render(<TypeFilterDropdown selected={[]} onChange={() => {}} />)
    expect(screen.queryByText('Dev Tools')).not.toBeInTheDocument()
  })

  it('opens panel when trigger is clicked', () => {
    render(<TypeFilterDropdown selected={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByText('Dev Tools')).toBeInTheDocument()
    expect(screen.getByText('AI & ML')).toBeInTheDocument()
    expect(screen.getByText('Utilities')).toBeInTheDocument()
  })

  it('shows all 6 bucket headers when open', () => {
    render(<TypeFilterDropdown selected={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    const headers = ['Dev Tools', 'AI & ML', 'Editors & IDEs', 'Language Projects', 'Infrastructure', 'Utilities']
    for (const h of headers) {
      expect(screen.getByText(h)).toBeInTheDocument()
    }
  })

  it('calls onChange with sub-type id when item is clicked', () => {
    const onChange = vi.fn()
    render(<TypeFilterDropdown selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    fireEvent.click(screen.getByText('Algorithm'))
    expect(onChange).toHaveBeenCalledWith(['algorithm'])
  })

  it('removes sub-type from selection when active item is clicked', () => {
    const onChange = vi.fn()
    render(<TypeFilterDropdown selected={['algorithm']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    fireEvent.click(screen.getByText('Algorithm'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('shows count badge when selections exist', () => {
    render(<TypeFilterDropdown selected={['algorithm', 'testing']} onChange={() => {}} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows no count badge when nothing selected', () => {
    render(<TypeFilterDropdown selected={[]} onChange={() => {}} />)
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('closes panel when Escape is pressed', () => {
    render(<TypeFilterDropdown selected={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByText('Dev Tools')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Dev Tools')).not.toBeInTheDocument()
  })

  it('closes panel when clicking outside', () => {
    render(<TypeFilterDropdown selected={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /type/i }))
    expect(screen.getByText('Dev Tools')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Dev Tools')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/components/TypeFilterDropdown.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/TypeFilterDropdown.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react'
import { LuChevronDown } from 'react-icons/lu'
import { REPO_BUCKETS } from '../constants/repoTypes'

interface TypeFilterDropdownProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function TypeFilterDropdown({ selected, onChange }: TypeFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggle(subTypeId: string) {
    if (selected.includes(subTypeId)) {
      onChange(selected.filter(id => id !== subTypeId))
    } else {
      onChange([...selected, subTypeId])
    }
  }

  const count = selected.length

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className={`discover-filter-icon-btn${count > 0 ? ' has-filters' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Type{count > 0 && ` · ${count}`}
        {count > 0 && <span className="filter-badge">{count}</span>}
        <LuChevronDown size={10} style={{ marginLeft: 3 }} />
      </button>

      {open && (
        <div className="tfd-panel">
          <div className="tfd-grid">
            {REPO_BUCKETS.map(bucket => (
              <div key={bucket.id} className="tfd-col">
                <div className="tfd-col-header" style={{ color: bucket.color }}>
                  {bucket.label}
                </div>
                {bucket.subTypes.map(sub => {
                  const isActive = selected.includes(sub.id)
                  return (
                    <button
                      key={sub.id}
                      className={`tfd-item${isActive ? ' active' : ''}`}
                      onClick={() => toggle(sub.id)}
                    >
                      {sub.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add CSS to `src/styles/globals.css`**

Append at the end of the file:

```css
/* ── TypeFilterDropdown ───────────────────────────────────────── */
.tfd-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: var(--radius);
  padding: 8px;
  min-width: 660px;
}

.tfd-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0 8px;
}

.tfd-col {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tfd-col-header {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 6px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tfd-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 3px 6px;
  font-size: 11px;
  font-family: inherit;
  color: var(--t2);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tfd-item:hover {
  background: var(--bg3);
  color: var(--t1);
}

.tfd-item.active {
  background: var(--bg3);
  color: var(--t1);
  font-weight: 600;
}
```

- [ ] **Step 5: Run component tests**

```bash
npx vitest run src/components/TypeFilterDropdown.test.tsx 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Run full suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/TypeFilterDropdown.tsx src/components/TypeFilterDropdown.test.tsx src/styles/globals.css
git commit -m "feat: add TypeFilterDropdown with 6-column bucket/sub-type multi-select"
```

---

## Task 6: Wire TypeFilterDropdown into Discover

**Files:**
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Update imports**

Replace:
```ts
import TypeDropdown from '../components/TypeDropdown'
```
With:
```ts
import TypeFilterDropdown from '../components/TypeFilterDropdown'
```

- [ ] **Step 2: Replace `activeTypes` state with `selectedTypes`**

Remove (around line 136-147):
```ts
  const [activeTypes, setActiveTypes] = useState<Set<RepoType>>(new Set())
  ...
  const handleTypeToggle = (type: RepoType) => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }
```

Add in their place:
```ts
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
```

- [ ] **Step 3: Update the `visibleRepos` useMemo**

Replace the existing predicate (around line 528-534):
```ts
  const visibleRepos = useMemo(
    () => repos.filter(r =>
      (activeTypes.size === 0 || activeTypes.has(repoTypes.get(r.id) ?? 'other')) &&
      (activeVerification.size === 0 || activeVerification.has(verification.getTier(r.id) as 'verified' | 'likely'))
    ),
    [repos, activeTypes, repoTypes, activeVerification, verification]
  )
```

With:
```ts
  const visibleRepos = useMemo(
    () => repos.filter(r =>
      (selectedTypes.length === 0 || (r.type_sub != null && selectedTypes.includes(r.type_sub))) &&
      (activeVerification.size === 0 || activeVerification.has(verification.getTier(r.id) as 'verified' | 'likely'))
    ),
    [repos, selectedTypes, activeVerification, verification]
  )
```

- [ ] **Step 4: Remove TypeDropdown from `discover-view-tabs`**

In the render, find and remove:
```tsx
          <TypeDropdown activeTypes={activeTypes} onToggle={handleTypeToggle} />
```

- [ ] **Step 5: Add TypeFilterDropdown to `discover-filter-row`**

In the `discover-filter-row` div, add `<TypeFilterDropdown>` before the Filters button. The filter row currently starts with the two verification buttons. Add after them:

```tsx
        <TypeFilterDropdown
          selected={selectedTypes}
          onChange={setSelectedTypes}
        />
```

So the row reads: `[shield-verified] [shield-likely] [TypeFilterDropdown] [Filters button] [LayoutDropdown]`

- [ ] **Step 6: Remove unused `RepoType` import if no longer needed**

Check if `RepoType` is still used in `Discover.tsx` (it's used by `repoTypes: Map<string, RepoType>` and the `classifyRepoType` calls). If yes, keep the import. If the import was only `{ classifyRepoType, type RepoType }`, verify both are still referenced.

The `repoTypes` Map and all `classifyRepoType` calls for card color lookup **remain unchanged** — do not remove them.

- [ ] **Step 7: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat: wire TypeFilterDropdown into Discover view, replace activeTypes with selectedTypes"
```

---

## Task 7: Delete Legacy TypeDropdown

**Files:**
- Delete: `src/components/TypeDropdown.tsx`
- Delete: `src/components/TypeDropdown.test.tsx`

- [ ] **Step 1: Delete both files**

```bash
rm src/components/TypeDropdown.tsx src/components/TypeDropdown.test.tsx
```

- [ ] **Step 2: Run the full test suite to confirm nothing imports them**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS. If any import errors appear, find the stale import and remove it.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete legacy TypeDropdown replaced by TypeFilterDropdown"
```

---

## Done

All 7 tasks complete. The nested type system is fully implemented:

- Taxonomy constants in `src/constants/repoTypes.ts`
- `type_bucket` + `type_sub` in SQLite (Phase 16 migration)
- New `classifyRepoBucket` classifier with backward-compatible `classifyRepoType` shim
- Classification persisted at all 4 major upsert sites in `electron/main.ts`
- `TypeFilterDropdown` — 6-column multi-select in the Discover filter row
- `TypeDropdown` removed
