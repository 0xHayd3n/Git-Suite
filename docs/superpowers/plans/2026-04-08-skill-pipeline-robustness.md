# Skill Pipeline Robustness Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the skill creation pipeline with persistent extraction caching, better error surfacing, expanded test coverage, and sub-skill pipeline integration.

**Architecture:** Four independent improvements to the existing pipeline. Each task produces self-contained, testable changes. The extraction cache gets disk persistence with JSON serialization. Pipeline errors/warnings propagate to the IPC return value so the frontend can surface them. Missing test coverage is added for MCP server edge cases, verification service internals, and the new features. Component sub-skills route through the template-based pipeline instead of legacy-only generation.

**Tech Stack:** TypeScript, Vitest, Electron IPC, better-sqlite3, Node fs

---

### Task 1: Persistent Extraction Cache

**Files:**
- Modify: `electron/skill-gen/extraction-cache.ts`
- Modify: `electron/skill-gen/extraction-cache.test.ts`

The in-memory extraction cache (10-min TTL, 50 entries, FIFO eviction) is lost on every app restart, forcing redundant GitHub API calls. Add disk persistence so cache entries survive restarts.

- [ ] **Step 1: Write failing tests for disk persistence**

Add tests to `electron/skill-gen/extraction-cache.test.ts`:

```typescript
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('disk persistence', () => {
  let cacheDir: string

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'))
    extractionCache.init(cacheDir)
    extractionCache.clear()
  })

  afterEach(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true })
  })

  it('persists entries to disk on set', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    const files = fs.readdirSync(cacheDir)
    expect(files.length).toBe(1)
  })

  it('restores entries from disk on re-init after restart', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    // Simulate app restart: create a fresh cache and init from same dir
    extractionCache.clear()
    // Manually re-create file to simulate persistence across process boundary
    const filename = Buffer.from('owner/repo@main').toString('base64url') + '.json'
    const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, filename), 'utf8'))
    // clear() removes disk too, so re-write for this test
    fs.writeFileSync(path.join(cacheDir, filename), JSON.stringify(entry))
    extractionCache.init(cacheDir)
    const result = extractionCache.get('owner/repo@main')
    expect(result).not.toBeNull()
    expect(result!.repoType).toBe('library')
  })

  it('evicts expired entries from disk on init', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    vi.advanceTimersByTime(11 * 60 * 1000)
    extractionCache.init(cacheDir)
    expect(extractionCache.get('owner/repo@main')).toBeNull()
    expect(fs.readdirSync(cacheDir).length).toBe(0)
  })

  it('removes disk file on FIFO eviction', () => {
    for (let i = 0; i < 50; i++) {
      extractionCache.set(`owner/repo-${i}@main`, { extraction: mockExtraction, repoType: 'library' })
    }
    extractionCache.set('owner/repo-new@main', { extraction: mockExtraction, repoType: 'library' })
    // repo-0 was evicted — its file should be gone
    const files = fs.readdirSync(cacheDir)
    expect(files.length).toBe(50)
  })

  it('works without init (graceful degradation)', () => {
    // Without calling init, behaves as pure in-memory cache
    const freshCache = require('./extraction-cache').extractionCache
    freshCache.set('a/b@main', { extraction: mockExtraction, repoType: 'library' })
    expect(freshCache.get('a/b@main')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/extraction-cache.test.ts`
Expected: FAIL — `init` method does not exist, disk persistence not implemented

- [ ] **Step 3: Implement disk-persistent extraction cache**

Modify `electron/skill-gen/extraction-cache.ts`:
- Add `init(cacheDir: string)` method that sets the disk directory and loads existing entries
- Key → filename mapping: URL-safe base64 of the cache key + `.json`
- On `set()`: write `{ ...value, timestamp }` to `{cacheDir}/{filename}.json`
- On `get()`: check in-memory first (existing behavior). If miss but `cacheDir` is set, try disk
- On FIFO eviction: delete the disk file too
- On `init()`: read all `.json` files, parse, discard expired, load into memory map
- On `clear()`: clear both in-memory and disk (preserves existing test contract at line 55-58)
- If `cacheDir` is not set (no `init()` called), behave exactly as before (pure in-memory)
- Disk I/O errors should log to `console.error` rather than silently swallowing

```typescript
import * as fs from 'fs'
import * as path from 'path'

let cacheDir: string | null = null

function keyToFilename(key: string): string {
  return Buffer.from(key).toString('base64url') + '.json'
}

function writeToDisk(key: string, entry: CacheEntry): void {
  if (!cacheDir) return
  try {
    fs.writeFileSync(
      path.join(cacheDir, keyToFilename(key)),
      JSON.stringify(entry),
    )
  } catch (err) {
    console.error('[extraction-cache] disk write failed:', err)
  }
}

function removeFromDisk(key: string): void {
  if (!cacheDir) return
  try { fs.unlinkSync(path.join(cacheDir, keyToFilename(key))) } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[extraction-cache] disk remove failed:', err)
    }
  }
}
```

Update `set()` to call `writeToDisk()` after inserting. Update FIFO eviction to call `removeFromDisk()` on the evicted key.

Add `init()`:
```typescript
init(dir: string): void {
  cacheDir = dir
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  // Load existing entries from disk
  let files: string[]
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch { return }
  const now = Date.now()
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const entry: CacheEntry = JSON.parse(raw)
      const key = Buffer.from(file.replace('.json', ''), 'base64url').toString()
      if (now - entry.timestamp > TTL_MS) {
        removeFromDisk(key)
        continue
      }
      if (cache.size < MAX_ENTRIES) {
        cache.set(key, entry)
      }
    } catch {
      // Corrupt file — skip
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/extraction-cache.test.ts`
Expected: PASS

- [ ] **Step 5: Wire cache init in Electron main process**

Modify `electron/main.ts` — find where the app initializes and add:

```typescript
import { extractionCache } from './skill-gen/extraction-cache'
// After app.getPath('userData') is available:
extractionCache.init(path.join(app.getPath('userData'), 'extraction-cache'))
```

This should go near the top of the app startup, before any skill generation can run.

- [ ] **Step 6: Commit**

```bash
git add electron/skill-gen/extraction-cache.ts electron/skill-gen/extraction-cache.test.ts electron/main.ts
git commit -m "feat(skill-gen): persist extraction cache to disk across restarts"
```

---

### Task 2: Surface Pipeline Warnings to Frontend

**Files:**
- Modify: `electron/main.ts:1067-1082,1157` (pipeline generate call site + return value)
- Modify: `src/env.d.ts` (IPC return type)
- Modify: `electron/skill-gen/pipeline.ts:80-94` (add warning for focus inference fallback)

Currently the pipeline `validation` result (warnings, autoFixes, errors) is computed but discarded in `main.ts`. Focus inference failure is silently swallowed. Fix both.

- [ ] **Step 1: Add a `focusInferenceFailed` flag to GenerateResult**

In `electron/skill-gen/pipeline.ts`, add `focusInferenceFailed?: boolean` to `GenerateResult`. In both `generate()` and `enhance()`, set it after the focus inference try/catch:

```typescript
// In generate() AND enhance(), after the focus inference try/catch:
const focusInferenceFailed = focusInstructions === null && repoType !== 'generic'
```

Include it in the return for both functions:
```typescript
// generate():
return { content, tier: 1, repoType, validation: validationResult, focusInferenceFailed }
// enhance():
return { content, tier: 2, repoType, validation: validationResult, focusInferenceFailed }
```

- [ ] **Step 2: Update the IPC return type to include warnings**

In `electron/main.ts`, change the return from the `skill:generate` handler to include pipeline diagnostics:

```typescript
// After const pipelineResult = await pipelineGenerate(...)
const warnings: string[] = []
if (pipelineResult.validation.warnings.length > 0) {
  warnings.push(...pipelineResult.validation.warnings.map(w => w.message))
}
if (pipelineResult.validation.autoFixes > 0) {
  warnings.push(`Auto-fixed ${pipelineResult.validation.autoFixes} issue(s) (hallucinated URLs, invalid references)`)
}
if (pipelineResult.focusInferenceFailed) {
  warnings.push('Focus inference timed out — skill may be less repo-specific than usual')
}
```

Then include `warnings` in the return value:
```typescript
return { content: content ?? null, version, generated_at, warnings }
```

Update `src/env.d.ts` — the `generate` return type should include `warnings?: string[]`.

- [ ] **Step 3: Update pipeline tests for focusInferenceFailed**

In `electron/skill-gen/pipeline.test.ts`, add a test:

```typescript
it('sets focusInferenceFailed when inference returns null for non-generic repo', async () => {
  mockInferFocus.mockResolvedValue(null)
  const result = await generate({
    token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main',
  })
  expect(result.focusInferenceFailed).toBe(true)
})

it('does not set focusInferenceFailed for generic repos', async () => {
  mockClassify.mockReturnValue({ type: 'generic', confidence: 0.3, signals: [] })
  mockInferFocus.mockResolvedValue(null)
  const result = await generate({
    token: null, owner: 'o', name: 'r', language: '', topics: [], readme: '',
    version: '1.0.0', defaultBranch: 'main',
  })
  expect(result.focusInferenceFailed).toBeFalsy()
})
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/pipeline.ts electron/skill-gen/pipeline.test.ts electron/main.ts src/env.d.ts
git commit -m "feat(skill-gen): surface pipeline warnings and focus inference status to frontend"
```

---

### Task 3: Expand Test Coverage

**Files:**
- Modify: `electron/mcp-server.test.ts` (add handleGetComponentsSkill tests)
- Modify: `electron/services/verificationService.test.ts` (add fetchRegistryMatch, rateLimit, prioritiseRepos tests)

Existing tests cover the core logic well but miss some handlers and service internals.

- [ ] **Step 1: Add handleGetComponentsSkill tests**

In `electron/mcp-server.test.ts`, add:

```typescript
import { handleGetComponentsSkill } from './mcp-server'

describe('handleGetComponentsSkill', () => {
  it('returns not-found when no components sub-skill exists', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'shadcn-ui', 'ui')
    const result = handleGetComponentsSkill(db, tmpDir, 'shadcn-ui', 'ui')
    expect(result.content[0].text).toContain('No components skill file found')
    db.close()
  })

  it('returns file content when components sub-skill exists', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'shadcn-ui', 'ui')
    db.prepare(
      `INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active)
       VALUES (?, 'components', 'ui.components.skill.md', 'comp content', '1.0.0', '2026-01-01', 1)`
    ).run(repoId)
    const skillDir = path.join(tmpDir, 'skills', 'shadcn-ui')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'ui.components.skill.md'), '## Components\nButton, Card', 'utf8')
    const result = handleGetComponentsSkill(db, tmpDir, 'shadcn-ui', 'ui')
    expect(result.content[0].text).toContain('Button, Card')
    db.close()
  })

  it('returns not-found when sub-skill is inactive', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'shadcn-ui', 'ui')
    db.prepare(
      `INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active)
       VALUES (?, 'components', 'ui.components.skill.md', 'comp content', '1.0.0', '2026-01-01', 0)`
    ).run(repoId)
    const result = handleGetComponentsSkill(db, tmpDir, 'shadcn-ui', 'ui')
    expect(result.content[0].text).toContain('No components skill file found')
    db.close()
  })

  it('returns missing-on-disk when DB row exists but file is absent', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'shadcn-ui', 'ui')
    db.prepare(
      `INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active)
       VALUES (?, 'components', 'ui.components.skill.md', 'comp content', '1.0.0', '2026-01-01', 1)`
    ).run(repoId)
    // Don't create the file on disk
    const result = handleGetComponentsSkill(db, tmpDir, 'shadcn-ui', 'ui')
    expect(result.content[0].text).toContain('missing on disk')
    db.close()
  })
})
```

- [ ] **Step 2: Run MCP server tests**

Run: `npx vitest run electron/mcp-server.test.ts`
Expected: PASS

- [ ] **Step 3: Add fetchRegistryMatch and queue tests**

In `electron/services/verificationService.test.ts`, add:

```typescript
import { fetchRegistryMatch } from './verificationService'

describe('fetchRegistryMatch', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('routes JavaScript to npm', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ maintainers: [{ name: 'owner' }], repository: {} }),
    })
    vi.stubGlobal('fetch', mockFetch)
    const result = await fetchRegistryMatch('pkg', 'owner', 'JavaScript')
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('npmjs.org'))
  })

  it('routes TypeScript to npm', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ maintainers: [{ name: 'owner' }], repository: {} }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchRegistryMatch('pkg', 'owner', 'TypeScript')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('npmjs.org'))
  })

  it('routes Python to pypi', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ info: { author: 'owner', home_page: '' } }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchRegistryMatch('pkg', 'owner', 'Python')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('pypi.org'))
  })

  it('routes Rust to crates.io', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ crate: { repository: 'https://github.com/owner/pkg' } }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchRegistryMatch('pkg', 'owner', 'Rust')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('crates.io'),
      expect.any(Object)
    )
  })

  it('returns false for unsupported languages', async () => {
    const result = await fetchRegistryMatch('pkg', 'owner', 'Haskell')
    expect(result).toBe(false)
  })

  it('returns false for null language', async () => {
    const result = await fetchRegistryMatch('pkg', 'owner', null)
    expect(result).toBe(false)
  })
})

describe('buildQueue edge cases', () => {
  it('does not downgrade priority of existing item', () => {
    const q = buildQueue()
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'high' })
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'low' })
    expect(q.size()).toBe(1)
    expect(q.shift()!.priority).toBe('high')
  })

  it('reports correct size after multiple operations', () => {
    const q = buildQueue()
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'normal' })
    q.push({ repoId: 'b/b', owner: 'b', name: 'b', language: null, priority: 'normal' })
    q.shift()
    expect(q.size()).toBe(1)
  })
})
```

- [ ] **Step 4: Run verification service tests**

Run: `npx vitest run electron/services/verificationService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/mcp-server.test.ts electron/services/verificationService.test.ts
git commit -m "test: expand coverage for MCP server and verification service"
```

---

### Task 4: Route Component Sub-Skills Through Pipeline

**Files:**
- Modify: `electron/skill-gen/pipeline.ts` (add `generateComponents` function)
- Modify: `electron/skill-gen/pipeline.test.ts` (tests)
- Modify: `electron/skill-gen/templates/index.ts` (add component sub-skill prompt builder)
- Modify: `electron/main.ts:1085-1101` (swap legacy components call for pipeline)

Component sub-skills currently bypass the template pipeline entirely and go through `legacy.ts` directly. This means they miss focus inference, validation, URL stripping, and the enhance tier system. Route them through the pipeline.

- [ ] **Step 1: Add buildComponentsPrompt to templates**

In `electron/skill-gen/templates/index.ts`, add a `buildComponentsPrompt` function:

```typescript
export function buildComponentsPrompt(
  extraction: ExtractionResult,
  readme: string,
  repoFullName: string,
  focusInstructions: string | null,
  scannedComponents?: Array<{ name: string; props: Array<{ name: string; type: string; required: boolean; defaultValue?: string }> }>,
): string {
  // Build a component-focused prompt using extraction.components + scannedComponents
  // Structure: list each component with props, variants, import path, and usage example
  // Apply same rules as main templates: dense, no filler, code examples over prose
  // Use focusInstructions if available
}
```

The prompt should instruct the model to output a flat markdown file with `### ComponentName` sections, each containing props table, import path, and minimal usage example. No CORE/EXTENDED/DEEP structure for component sub-skills.

- [ ] **Step 2: Add generateComponents to pipeline.ts**

```typescript
export async function generateComponents(
  input: GenerateInput & {
    scannedComponents?: Array<{ name: string; props: Array<{ name: string; type: string; required: boolean; defaultValue?: string }> }>
  }
): Promise<{ content: string; validation: ValidationResult }> {
  const { owner, name, readme, apiKey, topics, typeBucket, typeSub, scannedComponents } = input
  const repoFullName = `${owner}/${name}`

  const { repoType, extraction } = await getOrExtract(input)

  let focusInstructions: string | null = null
  try {
    focusInstructions = await inferFocusInstructions(
      repoType, extraction, readme.slice(0, 2000), { apiKey, typeBucket, typeSub }
    )
  } catch {}

  const prompt = buildComponentsPrompt(extraction, readme, repoFullName, focusInstructions, scannedComponents)

  let rawContent = await generateWithRawPrompt(prompt, readme, {
    model: 'claude-haiku-4-5',
    maxTokens: 4096,
    apiKey,
  })

  // URL stripping only (no structure validation — components don't use CORE/EXTENDED/DEEP)
  const { content, result: validationResult } = validateComponents(rawContent, readme)

  return { content, validation: validationResult }
}
```

- [ ] **Step 3: Add validateComponents function to validator.ts**

A lightweight validation for component sub-skills — only URL hallucination stripping, no structure check. Must be exported and explicitly typed as `ValidateOutput`:

```typescript
export function validateComponents(content: string, readme: string): ValidateOutput {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  let autoFixes = 0
  let fixedContent = content

  // URL hallucination check only
  const { fixed, removedCount } = stripHallucinatedUrls(fixedContent, readme)
  if (removedCount > 0) {
    fixedContent = fixed
    autoFixes += removedCount
  }

  return { content: fixedContent, result: { passed: true, errors, warnings, autoFixes } }
}
```

- [ ] **Step 4: Write tests for generateComponents**

In `electron/skill-gen/pipeline.test.ts`:

**Important:** The validator mock at the top of the file must also include `validateComponents`:
```typescript
vi.mock('./validator', () => ({
  validate: vi.fn(),
  validateComponents: vi.fn(),
}))
```
And add the typed mock:
```typescript
import { validateComponents } from './validator'
const mockValidateComponents = vi.mocked(validateComponents)
```

Then add the test describe block:

```typescript
import { generateComponents } from './pipeline'

describe('generateComponents', () => {
  beforeEach(() => {
    // Same mock setup as generate tests, plus:
    mockValidateComponents.mockReturnValue({
      content: '### Button\nA button component',
      result: { passed: true, errors: [], warnings: [], autoFixes: 0 },
    })
  })

  it('generates component sub-skill using pipeline', async () => {
    mockGenerate.mockResolvedValue('### Button\nA button component\n### Card\nA card component')
    mockValidateComponents.mockReturnValue({
      content: '### Button\nA button component\n### Card\nA card component',
      result: { passed: true, errors: [], warnings: [], autoFixes: 0 },
    })

    const result = await generateComponents({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [],
      readme: 'README', version: '1.0.0', defaultBranch: 'main',
      scannedComponents: [{ name: 'Button', props: [{ name: 'variant', type: 'string', required: false }] }],
    })

    expect(result.content).toContain('Button')
    expect(mockGenerate).toHaveBeenCalledWith(expect.any(String), 'README', expect.objectContaining({ maxTokens: 4096 }))
  })

  it('uses cached extraction for components', async () => {
    mockCache.get.mockReturnValue({
      extraction: { repoType: 'component-library', manifest: { ecosystem: 'node' }, fileTree: [] },
      repoType: 'component-library',
    })

    await generateComponents({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [],
      readme: 'README', version: '1.0.0', defaultBranch: 'main',
    })

    expect(mockFetchFileTree).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: PASS

- [ ] **Step 6: Update main.ts to use pipeline for components**

In `electron/main.ts`, replace the legacy components generation block (lines ~1085-1101):

```typescript
// Replace:
//   componentsContent = await generateComponentsSkillViaLocalCLI(skillInput)
// With:
import { generateComponents as pipelineGenerateComponents } from './skill-gen/pipeline'

// In the components section:
if (isComponents && (target === 'all' || target === 'components')) {
  try {
    const compResult = await pipelineGenerateComponents({
      token,
      owner,
      name,
      language,
      topics,
      readme: readmeContent,
      version,
      defaultBranch: repo.default_branch ?? 'main',
      apiKey: apiKey ?? undefined,
      typeBucket: repo.type_bucket ?? undefined,
      typeSub: repo.type_sub ?? undefined,
      scannedComponents: skillInput.scannedComponents,
    })
    componentsContent = compResult.content
  } catch (compError) {
    console.error('[skill-gen] Components pipeline error, trying legacy:', compError)
    // Fallback to legacy for backwards compat
    try {
      componentsContent = await generateComponentsSkillViaLocalCLI(skillInput)
    } catch {
      if (apiKey) {
        try { componentsContent = await generateComponentsSkill(skillInput, apiKey) } catch {}
      }
    }
  }
}
```

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add electron/skill-gen/pipeline.ts electron/skill-gen/pipeline.test.ts electron/skill-gen/templates/index.ts electron/skill-gen/validator.ts electron/main.ts
git commit -m "feat(skill-gen): route component sub-skills through template pipeline"
```
