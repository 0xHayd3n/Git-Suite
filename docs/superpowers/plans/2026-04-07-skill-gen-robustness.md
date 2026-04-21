# Skill Generation Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the skill generation pipeline more robust by replacing regex TOML parsing with a real parser, auto-fixing hallucinated API references instead of just warning, and adding in-memory extraction caching.

**Architecture:** Three independent improvements to the `electron/skill-gen/` module. The TOML parser swap is isolated to `manifest-parser.ts`. Hallucination auto-fix extends the existing validator. The extraction cache is a new module integrated into `pipeline.ts`, which also gets a `getOrExtract()` helper to DRY up duplicated extraction logic between `generate()` and `enhance()`.

**Tech Stack:** TypeScript, `smol-toml` (TOML parser), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-04-07-skill-gen-robustness-design.md`

---

### Task 1: Install `smol-toml` and Replace `parseCargoToml()`

**Files:**
- Modify: `package.json` (add `smol-toml` dependency)
- Modify: `electron/skill-gen/manifest-parser.ts:70-118` (replace `parseCargoToml`)
- Modify: `electron/skill-gen/manifest-parser.test.ts` (add TOML-specific tests)

- [ ] **Step 1: Install smol-toml**

Run: `npm install smol-toml`

- [ ] **Step 2: Write failing tests for complex Cargo.toml parsing**

Add these tests to `electron/skill-gen/manifest-parser.test.ts` inside the existing `describe('parseManifest', ...)` block:

```typescript
it('parses Cargo.toml with escaped strings and comments', () => {
  const content = `[package]
name = "my-crate"
version = "1.0.0"
description = "A crate with \\"quotes\\" inside"
# This is a comment
edition = "2021"
`
  const result = parseManifest('Cargo.toml', content)
  expect(result.ecosystem).toBe('rust')
  expect(result.name).toBe('my-crate')
  expect(result.description).toBe('A crate with "quotes" inside')
})

it('parses Cargo.toml with multiple [[bin]] entries', () => {
  const content = `[package]
name = "multi-bin"
version = "2.0.0"

[[bin]]
name = "server"
path = "src/bin/server.rs"

[[bin]]
name = "client"
path = "src/bin/client.rs"
`
  const result = parseManifest('Cargo.toml', content)
  expect(result.ecosystem).toBe('rust')
  expect(result.bin).toEqual({
    server: 'src/bin/server.rs',
    client: 'src/bin/client.rs',
  })
})

it('parses Cargo.toml with multiline description', () => {
  const content = `[package]
name = "multi"
version = "0.1.0"
description = """
A multiline
description here
"""
`
  const result = parseManifest('Cargo.toml', content)
  expect(result.ecosystem).toBe('rust')
  expect(result.description).toContain('multiline')
})

it('parses Cargo.toml with inline tables', () => {
  const content = `[package]
name = "inline-test"
version = "1.0.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
`
  const result = parseManifest('Cargo.toml', content)
  expect(result.ecosystem).toBe('rust')
  expect(result.name).toBe('inline-test')
})

it('returns unknown ecosystem for malformed Cargo.toml', () => {
  const content = `this is not valid toml [[[`
  const result = parseManifest('Cargo.toml', content)
  expect(result.ecosystem).toBe('unknown')
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/manifest-parser.test.ts`
Expected: Multiple FAIL (escaped strings, multiple [[bin]], multiline)

- [ ] **Step 4: Implement `parseCargoToml` with smol-toml**

Add `import { parse as parseToml } from 'smol-toml'` at the top of `electron/skill-gen/manifest-parser.ts` (after the existing type import). Then replace the `parseCargoToml` function:

```typescript
function parseCargoToml(content: string): ManifestInfo {
  try {
    const doc = parseToml(content) as Record<string, unknown>
    const pkg = (doc.package ?? {}) as Record<string, unknown>

    const name = typeof pkg.name === 'string' ? pkg.name : undefined
    const version = typeof pkg.version === 'string' ? pkg.version : undefined
    const edition = typeof pkg.edition === 'string' ? pkg.edition : undefined
    const description = typeof pkg.description === 'string'
      ? pkg.description.trim()
      : undefined

    // Parse [[bin]] array of tables
    let bin: Record<string, string> | undefined
    const binEntries = doc.bin
    if (Array.isArray(binEntries)) {
      const entries: Record<string, string> = {}
      for (const entry of binEntries) {
        const e = entry as Record<string, unknown>
        if (typeof e.name === 'string' && typeof e.path === 'string') {
          entries[e.name] = e.path
        }
      }
      if (Object.keys(entries).length > 0) {
        bin = entries
      }
    }

    return {
      ecosystem: 'rust',
      name,
      version,
      edition,
      description,
      bin,
      rawManifest: content,
    }
  } catch (err) {
    console.error('[skill-gen] Failed to parse Cargo.toml:', err)
    return { ecosystem: 'unknown', rawManifest: content }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/manifest-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron/skill-gen/manifest-parser.ts electron/skill-gen/manifest-parser.test.ts
git commit -m "feat(skill-gen): replace regex Cargo.toml parsing with smol-toml"
```

---

### Task 2: Replace `parsePyprojectToml()` with `smol-toml`

**Files:**
- Modify: `electron/skill-gen/manifest-parser.ts:143-188` (replace `parsePyprojectToml`)
- Modify: `electron/skill-gen/manifest-parser.test.ts` (add pyproject-specific tests)

- [ ] **Step 1: Write failing tests for complex pyproject.toml parsing**

Add to the existing `describe('parseManifest', ...)` block:

```typescript
it('parses pyproject.toml with escaped strings', () => {
  const content = `[project]
name = "my-pkg"
version = "1.0.0"
description = "A package with \\"quotes\\""
requires-python = ">=3.9"
`
  const result = parseManifest('pyproject.toml', content)
  expect(result.ecosystem).toBe('python')
  expect(result.name).toBe('my-pkg')
  expect(result.description).toBe('A package with "quotes"')
})

it('parses pyproject.toml with multiple scripts', () => {
  const content = `[project]
name = "multi-cli"
version = "2.0.0"

[project.scripts]
serve = "multi_cli.serve:main"
migrate = "multi_cli.db:migrate"
seed = "multi_cli.db:seed"
`
  const result = parseManifest('pyproject.toml', content)
  expect(result.entryPoints).toEqual({
    serve: 'multi_cli.serve:main',
    migrate: 'multi_cli.db:migrate',
    seed: 'multi_cli.db:seed',
  })
})

it('parses pyproject.toml with build-system and other sections', () => {
  const content = `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "with-build"
version = "0.5.0"
description = "Has build system section before project"

[tool.ruff]
line-length = 120
`
  const result = parseManifest('pyproject.toml', content)
  expect(result.ecosystem).toBe('python')
  expect(result.name).toBe('with-build')
  expect(result.version).toBe('0.5.0')
})

it('returns unknown ecosystem for malformed pyproject.toml', () => {
  const content = `not valid toml at all [[[`
  const result = parseManifest('pyproject.toml', content)
  expect(result.ecosystem).toBe('unknown')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/manifest-parser.test.ts`
Expected: FAIL on escaped strings and build-system ordering tests

- [ ] **Step 3: Implement `parsePyprojectToml` with smol-toml**

Replace the `parsePyprojectToml` function in `electron/skill-gen/manifest-parser.ts`:

```typescript
function parsePyprojectToml(content: string): ManifestInfo {
  try {
    const doc = parseToml(content) as Record<string, unknown>
    const project = (doc.project ?? {}) as Record<string, unknown>

    const name = typeof project.name === 'string' ? project.name : undefined
    const version = typeof project.version === 'string' ? project.version : undefined
    const description = typeof project.description === 'string'
      ? project.description.trim()
      : undefined
    const requiresPython = typeof project['requires-python'] === 'string'
      ? project['requires-python']
      : undefined

    // Parse [project.scripts]
    let entryPoints: Record<string, string> | undefined
    const scripts = project.scripts
    if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) {
      const entries: Record<string, string> = {}
      for (const [key, val] of Object.entries(scripts as Record<string, unknown>)) {
        if (typeof val === 'string') {
          entries[key] = val
        }
      }
      if (Object.keys(entries).length > 0) {
        entryPoints = entries
      }
    }

    return {
      ecosystem: 'python',
      name,
      version,
      description,
      requiresPython,
      entryPoints,
      rawManifest: content,
    }
  } catch (err) {
    console.error('[skill-gen] Failed to parse pyproject.toml:', err)
    return { ecosystem: 'unknown', rawManifest: content }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/manifest-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/manifest-parser.ts electron/skill-gen/manifest-parser.test.ts
git commit -m "feat(skill-gen): replace regex pyproject.toml parsing with smol-toml"
```

---

### Task 3: Promote Export Verification to Auto-Fix

**Files:**
- Modify: `electron/skill-gen/validator.ts:115-133` (check 4 — export verification)
- Modify: `electron/skill-gen/validator.test.ts` (add stripping tests)

- [ ] **Step 1: Write failing tests for export auto-fix stripping**

Add to `electron/skill-gen/validator.test.ts`. First, create a new extraction fixture with 5+ exports (the minimum threshold for auto-stripping):

```typescript
const richExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'zod', version: '3.22.0' },
  fileTree: [],
  exports: [
    { name: 'z', kind: 'function', file: 'src/index.ts' },
    { name: 'string', kind: 'function', file: 'src/index.ts' },
    { name: 'number', kind: 'function', file: 'src/index.ts' },
    { name: 'object', kind: 'function', file: 'src/index.ts' },
    { name: 'array', kind: 'function', file: 'src/index.ts' },
    { name: 'union', kind: 'function', file: 'src/index.ts' },
  ],
}

describe('export auto-fix stripping', () => {
  it('strips bullet containing hallucinated function name', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\n- Use z() for schemas\n- Use fakeFunc() for validation\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richExtraction, '')
    expect(result.content).not.toContain('fakeFunc')
    expect(result.content).toContain('z()')
    expect(result.result.autoFixes).toBeGreaterThan(0)
  })

  it('strips prose line containing hallucinated function name', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\nThe fakeFunc() method creates schemas.\nUse z() for validation.\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richExtraction, '')
    expect(result.content).not.toContain('fakeFunc')
    expect(result.content).toContain('z()')
  })

  it('does NOT strip when exports count is below threshold (< 5)', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\n- Use fakeFunc() here\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '')
    // mockExtraction has only 2 exports — below threshold
    expect(result.content).toContain('fakeFunc')
    expect(result.result.warnings.some(w => w.check === 'export-verification')).toBe(true)
  })

  it('does NOT strip references inside code blocks', () => {
    const content = "## [CORE]\n```\nfakeFunc()\n```\n## [EXTENDED]\nMore\n## [DEEP]\nDeep"
    const result = validate(content, richExtraction, '')
    expect(result.content).toContain('fakeFunc')
  })

  it('collapses excess newlines after stripping', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\n\nLine before\n\nUse fakeFunc() here\n\nLine after\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richExtraction, '')
    expect(result.content).not.toMatch(/\n{3,}/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/validator.test.ts`
Expected: FAIL — currently these functions only warn, don't strip

- [ ] **Step 3: Implement export auto-fix stripping**

In `electron/skill-gen/validator.ts`, replace check 4 (export verification, lines 115-133). Add a helper function `stripLinesWithReferences` above `validate()`:

```typescript
function stripLinesWithReferences(
  content: string,
  invalidNames: Set<string>,
  pattern: (name: string) => RegExp
): { fixed: string; removedCount: number } {
  const lines = content.split('\n')
  let inCodeFence = false
  let removedCount = 0
  const result: string[] = []

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence
      result.push(line)
      continue
    }
    if (inCodeFence) {
      result.push(line)
      continue
    }

    let shouldRemove = false
    for (const name of invalidNames) {
      if (pattern(name).test(line)) {
        shouldRemove = true
        break
      }
    }

    if (shouldRemove) {
      removedCount++
    } else {
      result.push(line)
    }
  }

  return { fixed: result.join('\n').replace(/\n{3,}/g, '\n\n'), removedCount }
}
```

Then replace check 4 inside `validate()`:

```typescript
// 4. Export verification — auto-strip when authoritative (5+ exports)
if (extraction.exports && extraction.exports.length >= 5) {
  const knownExportNames = new Set(extraction.exports.map(e => e.name))
  const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
  const funcCallRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g
  const invalidNames = new Set<string>()
  for (const m of textOutsideCode.matchAll(funcCallRe)) {
    if (!knownExportNames.has(m[1])) {
      invalidNames.add(m[1])
      warnings.push({
        check: 'export-verification',
        message: `Function '${m[1]}()' referenced but not found in extraction exports — auto-stripped`,
      })
    }
  }
  if (invalidNames.size > 0) {
    const { fixed, removedCount } = stripLinesWithReferences(
      fixedContent, invalidNames, (name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\)`)
    )
    fixedContent = fixed
    autoFixes += removedCount
  }
} else if (extraction.exports && extraction.exports.length > 0) {
  // Below threshold — warn only (existing behavior)
  const knownExportNames = new Set(extraction.exports.map(e => e.name))
  const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
  const funcCallRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g
  for (const m of textOutsideCode.matchAll(funcCallRe)) {
    if (!knownExportNames.has(m[1])) {
      warnings.push({
        check: 'export-verification',
        message: `Function '${m[1]}()' referenced but not found in extraction exports`,
      })
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/validator.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/validator.ts electron/skill-gen/validator.test.ts
git commit -m "feat(skill-gen): auto-strip hallucinated export references in validator"
```

---

### Task 4: Promote Command Verification to Auto-Fix

**Files:**
- Modify: `electron/skill-gen/validator.ts:135-159` (check 5 — command verification)
- Modify: `electron/skill-gen/validator.test.ts` (add command stripping tests)

- [ ] **Step 1: Write failing tests for command flag auto-fix stripping**

Add to `electron/skill-gen/validator.test.ts`:

```typescript
const richCliExtraction: ExtractionResult = {
  repoType: 'cli-tool',
  manifest: { ecosystem: 'node', name: 'my-cli' },
  fileTree: [],
  commands: [
    { name: 'build', description: 'Build', flags: [
      { name: '--output', type: 'string' },
      { name: '--minify', type: 'boolean' },
      { name: '--target', type: 'string' },
      { name: '--watch', type: 'boolean' },
      { name: '--config', type: 'string' },
    ]},
  ],
}

describe('command auto-fix stripping', () => {
  it('strips bullet containing hallucinated flag', () => {
    const content = `## [CORE]\n- Use --output to set path\n- Use --verbose for debug output\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richCliExtraction, '')
    expect(result.content).not.toContain('--verbose')
    expect(result.content).toContain('--output')
    expect(result.result.autoFixes).toBeGreaterThan(0)
  })

  it('does NOT strip when commands have fewer than 5 flags total', () => {
    const sparseCliExtraction: ExtractionResult = {
      repoType: 'cli-tool',
      manifest: { ecosystem: 'node', name: 'my-cli' },
      fileTree: [],
      commands: [
        { name: 'run', description: 'Run', flags: [
          { name: '--help', type: 'boolean' },
        ]},
      ],
    }
    const content = `## [CORE]\n- Use --verbose flag\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, sparseCliExtraction, '')
    expect(result.content).toContain('--verbose')
    expect(result.result.warnings.some(w => w.check === 'command-verification')).toBe(true)
  })

  it('does NOT strip flags inside code blocks', () => {
    const content = "## [CORE]\n```bash\nmy-cli --verbose\n```\n## [EXTENDED]\nMore\n## [DEEP]\nDeep"
    const result = validate(content, richCliExtraction, '')
    expect(result.content).toContain('--verbose')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/validator.test.ts`
Expected: FAIL — command check currently only warns

- [ ] **Step 3: Implement command flag auto-fix stripping**

Replace check 5 inside `validate()` in `electron/skill-gen/validator.ts`. The threshold for commands is 5+ total flags across all commands:

```typescript
// 5. Command flag verification — auto-strip when authoritative (5+ known flags)
if (extraction.commands && extraction.commands.length > 0) {
  const knownFlags = new Set<string>()
  for (const cmd of extraction.commands) {
    for (const flag of cmd.flags) {
      knownFlags.add(flag.name)
      if (flag.short) knownFlags.add(flag.short)
    }
  }

  if (knownFlags.size >= 5) {
    const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
    const flagRe = /--[a-zA-Z][a-zA-Z0-9-]*/g
    const invalidFlags = new Set<string>()
    for (const m of textOutsideCode.matchAll(flagRe)) {
      if (!knownFlags.has(m[0])) {
        invalidFlags.add(m[0])
        warnings.push({
          check: 'command-verification',
          message: `Flag '${m[0]}' referenced but not found in extraction commands — auto-stripped`,
        })
      }
    }
    if (invalidFlags.size > 0) {
      const { fixed, removedCount } = stripLinesWithReferences(
        fixedContent, invalidFlags, (flag) => new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      )
      fixedContent = fixed
      autoFixes += removedCount
    }
  } else {
    // Below threshold — warn only
    const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
    const flagRe = /--[a-zA-Z][a-zA-Z0-9-]*/g
    for (const m of textOutsideCode.matchAll(flagRe)) {
      if (!knownFlags.has(m[0])) {
        warnings.push({
          check: 'command-verification',
          message: `Flag '${m[0]}' referenced but not found in extraction commands`,
        })
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/validator.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/validator.ts electron/skill-gen/validator.test.ts
git commit -m "feat(skill-gen): auto-strip hallucinated command flags in validator"
```

---

### Task 5: Create Extraction Cache Module

**Files:**
- Create: `electron/skill-gen/extraction-cache.ts`
- Create: `electron/skill-gen/extraction-cache.test.ts`

- [ ] **Step 1: Write failing tests for the extraction cache**

Create `electron/skill-gen/extraction-cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { extractionCache } from './extraction-cache'
import type { ExtractionResult } from './types'

const mockExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'test' },
  fileTree: ['src/index.ts'],
}

describe('extractionCache', () => {
  beforeEach(() => {
    extractionCache.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for cache miss', () => {
    expect(extractionCache.get('owner/repo@main')).toBeNull()
  })

  it('stores and retrieves a cache entry', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    const result = extractionCache.get('owner/repo@main')
    expect(result).not.toBeNull()
    expect(result!.extraction.manifest.name).toBe('test')
    expect(result!.repoType).toBe('library')
  })

  it('returns null after TTL expires', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    vi.advanceTimersByTime(11 * 60 * 1000) // 11 minutes
    expect(extractionCache.get('owner/repo@main')).toBeNull()
  })

  it('returns entry before TTL expires', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    vi.advanceTimersByTime(9 * 60 * 1000) // 9 minutes
    expect(extractionCache.get('owner/repo@main')).not.toBeNull()
  })

  it('evicts oldest entry when capacity reached', () => {
    for (let i = 0; i < 50; i++) {
      extractionCache.set(`owner/repo-${i}@main`, { extraction: mockExtraction, repoType: 'library' })
    }
    // Add one more — should evict repo-0
    extractionCache.set('owner/repo-new@main', { extraction: mockExtraction, repoType: 'library' })
    expect(extractionCache.get('owner/repo-0@main')).toBeNull()
    expect(extractionCache.get('owner/repo-new@main')).not.toBeNull()
  })

  it('clear() removes all entries', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    extractionCache.clear()
    expect(extractionCache.get('owner/repo@main')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/extraction-cache.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the extraction cache**

Create `electron/skill-gen/extraction-cache.ts`:

```typescript
import type { ExtractionResult, RepoType } from './types'

export interface CacheValue {
  extraction: ExtractionResult
  repoType: RepoType
}

interface CacheEntry extends CacheValue {
  timestamp: number
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ENTRIES = 50

const cache = new Map<string, CacheEntry>()

export const extractionCache = {
  get(key: string): CacheValue | null {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > TTL_MS) {
      cache.delete(key)
      return null
    }
    return { extraction: entry.extraction, repoType: entry.repoType }
  },

  set(key: string, value: CacheValue): void {
    // FIFO eviction when at capacity
    if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
      const oldest = cache.keys().next().value!
      cache.delete(oldest)
    }
    cache.set(key, { ...value, timestamp: Date.now() })
  },

  clear(): void {
    cache.clear()
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/extraction-cache.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/extraction-cache.ts electron/skill-gen/extraction-cache.test.ts
git commit -m "feat(skill-gen): add in-memory FIFO extraction cache"
```

---

### Task 6: Integrate Cache into Pipeline with `getOrExtract()`

**Files:**
- Modify: `electron/skill-gen/pipeline.ts` (add `getOrExtract`, refactor `generate`/`enhance`)
- Modify: `electron/skill-gen/pipeline.test.ts` (add cache integration tests)

- [ ] **Step 1: Write failing tests for cache integration**

Add to `electron/skill-gen/pipeline.test.ts`. First add the cache mock at the top with the other mocks:

```typescript
vi.mock('./extraction-cache', () => ({
  extractionCache: {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  },
}))
```

Add the import:

```typescript
import { extractionCache } from './extraction-cache'
const mockCache = vi.mocked(extractionCache)
```

Add `mockCache.get.mockReturnValue(null)` to both `beforeEach` blocks — specifically inside the `describe('generate', ...)` beforeEach (after `vi.clearAllMocks()`) and inside the `describe('enhance', ...)` beforeEach (after `vi.clearAllMocks()`).

Also remove the dead `detectManifestFile: vi.fn()` line from the existing `vi.mock('./manifest-parser', ...)` block since `pipeline.ts` no longer imports it.

Then add these tests inside the existing `describe('generate', ...)`:

```typescript
it('uses cached extraction when available', async () => {
  mockCache.get.mockReturnValue({
    extraction: {
      repoType: 'library',
      manifest: { ecosystem: 'node', name: 'cached' },
      fileTree: ['cached.ts'],
      exports: [{ name: 'cached', kind: 'function' as const, file: 'cached.ts' }],
    },
    repoType: 'library',
  })

  await generate({
    token: 'tok', owner: 'owner', name: 'repo',
    language: 'TypeScript', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main',
  })

  // Should NOT call extraction steps
  expect(mockFetchFileTree).not.toHaveBeenCalled()
  expect(mockFetchManifest).not.toHaveBeenCalled()
  expect(mockClassify).not.toHaveBeenCalled()
  // Should still call downstream steps
  expect(mockBuildPrompt).toHaveBeenCalled()
})

it('caches extraction result on cache miss', async () => {
  mockCache.get.mockReturnValue(null)

  await generate({
    token: 'tok', owner: 'owner', name: 'repo',
    language: 'TypeScript', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main',
  })

  expect(mockCache.set).toHaveBeenCalledWith(
    'owner/repo@main',
    expect.objectContaining({ repoType: 'library' })
  )
})

it('skips cache when token is null', async () => {
  await generate({
    token: null, owner: 'owner', name: 'repo',
    language: 'TypeScript', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main',
  })

  expect(mockCache.get).not.toHaveBeenCalled()
  expect(mockCache.set).not.toHaveBeenCalled()
})
```

Also add this test inside `describe('enhance', ...)` to verify enhance uses the cache too:

```typescript
it('uses cached extraction in enhance', async () => {
  mockCache.get.mockReturnValue({
    extraction: {
      repoType: 'library',
      manifest: { ecosystem: 'node', name: 'cached' },
      fileTree: ['cached.ts'],
    },
    repoType: 'library',
  })

  await enhance({
    token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main', existingSkill: '## [CORE]\nold',
  })

  expect(mockFetchFileTree).not.toHaveBeenCalled()
  expect(mockBuildPrompt).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: FAIL — no cache integration exists yet

- [ ] **Step 3: Implement `getOrExtract` and refactor pipeline**

Replace the contents of `electron/skill-gen/pipeline.ts`:

```typescript
import type { RepoType, ExtractionResult, ValidationResult, ManifestInfo } from './types'
import { fetchFileTree, fetchRepoFiles, fetchManifest } from './github-files'
import { parseManifest } from './manifest-parser'
import { classify } from './classifier'
import { getExtractor } from './extractors/index'
import { buildPromptFromTemplate } from './templates/index'
import { validate } from './validator'
import { generateWithRawPrompt } from './legacy'
import { inferFocusInstructions } from './focus-inference'
import { extractionCache } from './extraction-cache'

export interface GenerateInput {
  token: string | null
  owner: string
  name: string
  language: string
  topics: string[]
  readme: string
  version: string
  defaultBranch: string
  apiKey?: string
  typeBucket?: string
  typeSub?: string
}

export interface GenerateResult {
  content: string
  tier: 1 | 2
  repoType: RepoType
  validation: ValidationResult
}

interface ExtractionOutput {
  repoType: RepoType
  extraction: ExtractionResult
}

async function getOrExtract(input: GenerateInput): Promise<ExtractionOutput> {
  const { token, owner, name, language, topics, readme, defaultBranch } = input
  const defaultResult: ExtractionOutput = {
    repoType: 'generic',
    extraction: {
      repoType: 'generic',
      manifest: { ecosystem: 'unknown' },
      fileTree: [],
    },
  }

  if (!token) return defaultResult

  const cacheKey = `${owner}/${name}@${defaultBranch}`
  const cached = extractionCache.get(cacheKey)
  if (cached) {
    return { repoType: cached.repoType, extraction: cached.extraction }
  }

  try {
    const fileTree = await fetchFileTree(token, owner, name, defaultBranch)
    const manifestResult = await fetchManifest(token, owner, name, fileTree)
    let manifest: ManifestInfo = { ecosystem: 'unknown' }
    if (manifestResult) {
      manifest = parseManifest(manifestResult.filename, manifestResult.content)
    }
    const classification = classify({ language, topics, fileTree, manifest, readmeHead: readme.slice(0, 2000) })
    const repoType = classification.type
    const extractor = getExtractor(repoType)
    const filesToFetch = extractor.getFilesToFetch(fileTree, manifest)
    const files = await fetchRepoFiles(token, owner, name, filesToFetch)
    const extractedData = extractor.extract(files, manifest)

    const extraction: ExtractionResult = { repoType, manifest, fileTree, ...extractedData }
    extractionCache.set(cacheKey, { extraction, repoType })
    return { repoType, extraction }
  } catch (err) {
    console.error(`[skill-gen] Pipeline extraction failed, falling back to generic:`, err)
    return defaultResult
  }
}

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const { owner, name, readme, apiKey, typeBucket, typeSub } = input
  const repoFullName = `${owner}/${name}`

  const { repoType, extraction } = await getOrExtract(input)

  // Infer focus instructions
  let focusInstructions: string | null = null
  try {
    focusInstructions = await inferFocusInstructions(
      repoType, extraction, readme.slice(0, 2000), { apiKey, typeBucket, typeSub }
    )
  } catch (err) {
    console.error(`[skill-gen] Focus inference failed, continuing without:`, err)
  }

  // Build prompt
  const prompt = buildPromptFromTemplate(repoType, extraction, readme, repoFullName, focusInstructions)

  // Generate
  let rawContent = await generateWithRawPrompt(prompt, readme, {
    model: 'claude-haiku-4-5',
    maxTokens: 3072,
    apiKey,
  })

  // Validate
  let { content, result: validationResult } = validate(rawContent, extraction, readme)

  // Retry once if structural errors
  if (!validationResult.passed && validationResult.errors.some(e => e.check === 'structure')) {
    const retryPrompt = prompt + '\n\nIMPORTANT: Your previous output was missing required sections. You MUST include all three sections: ## [CORE], ## [EXTENDED], and ## [DEEP]. Start immediately with ## [CORE].'
    rawContent = await generateWithRawPrompt(retryPrompt, readme, {
      model: 'claude-haiku-4-5',
      maxTokens: 3072,
      apiKey,
    })
    const retryValidation = validate(rawContent, extraction, readme)
    content = retryValidation.content
    validationResult = retryValidation.result
  }

  return { content, tier: 1, repoType, validation: validationResult }
}

export async function enhance(
  input: GenerateInput & { existingSkill: string }
): Promise<GenerateResult> {
  const { owner, name, readme, apiKey, existingSkill, typeBucket, typeSub } = input
  const repoFullName = `${owner}/${name}`

  const { repoType, extraction } = await getOrExtract(input)

  // Infer focus instructions
  let focusInstructions: string | null = null
  try {
    focusInstructions = await inferFocusInstructions(
      repoType, extraction, readme.slice(0, 2000), { apiKey, typeBucket, typeSub }
    )
  } catch (err) {
    console.error(`[skill-gen] Focus inference failed for enhance, continuing without:`, err)
  }

  // Build enhance prompt
  const basePrompt = buildPromptFromTemplate(repoType, extraction, readme, repoFullName, focusInstructions)
  const enhancePrompt = `${basePrompt}

--- EXISTING SKILL (Tier 1) ---
${existingSkill}
--- END EXISTING SKILL ---

You are enhancing an existing skill file. The above is the current Tier 1 version.
Improve it by:
- Adding more detailed code examples
- Covering more API surface from the extracted data
- Expanding edge cases and advanced patterns
- Making the content more precise and actionable for AI code generation
Keep the same three-section structure (## [CORE], ## [EXTENDED], ## [DEEP]).
Start immediately with ## [CORE].`

  const rawContent = await generateWithRawPrompt(enhancePrompt, readme, {
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
    apiKey,
  })

  const { content, result: validationResult } = validate(rawContent, extraction, readme)

  return { content, tier: 2, repoType, validation: validationResult }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full skill-gen test suite**

Run: `npx vitest run electron/skill-gen/`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add electron/skill-gen/pipeline.ts electron/skill-gen/pipeline.test.ts
git commit -m "feat(skill-gen): integrate extraction cache and DRY up pipeline with getOrExtract"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS — no regressions outside skill-gen

- [ ] **Step 2: Commit any remaining changes**

If any fixups were needed, commit them individually with descriptive messages.
