# Skill Generation Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-prompt skill generation pipeline with a repo-type-aware framework that classifies repos, extracts structured data from source code, generates skills using type-specific templates, and validates output.

**Architecture:** A classify → extract → generate → validate pipeline. The classifier determines repo type from metadata/file tree/manifests. Type-specific extractors pull structured data from source files via GitHub API. Type-specific prompt templates adapt the skill file structure. A validator checks generated content against extraction data. Two tiers: Haiku quick install, Sonnet enhancement.

**Tech Stack:** TypeScript, Vitest, Electron IPC, GitHub REST API, Claude Haiku/Sonnet via Claude Code CLI or Anthropic SDK

**Spec:** `docs/superpowers/specs/2026-04-07-skill-generation-framework-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `electron/skill-gen/types.ts` | All shared types: RepoType, ManifestInfo, ExtractionResult, ValidationResult, etc. |
| Create | `electron/skill-gen/classifier.ts` | `classify()` — scored heuristic, no LLM |
| Create | `electron/skill-gen/classifier.test.ts` | Classification tests with real-world manifest/topic combinations |
| Create | `electron/skill-gen/github-files.ts` | `fetchFileTree()`, `fetchRepoFiles()`, `fetchManifest()` — wraps existing `getRepoTree`/`getFileContent` |
| Create | `electron/skill-gen/github-files.test.ts` | Tests for file fetching with mocked GitHub functions |
| Create | `electron/skill-gen/manifest-parser.ts` | Parse package.json, Cargo.toml, pyproject.toml, go.mod into ManifestInfo |
| Create | `electron/skill-gen/manifest-parser.test.ts` | Parser tests with real manifest samples |
| Create | `electron/skill-gen/extractors/index.ts` | Extractor registry, `getExtractor(type)` |
| Create | `electron/skill-gen/extractors/library.ts` | Library extractor: exports from .d.ts / entry points |
| Create | `electron/skill-gen/extractors/library.test.ts` | Tests with sample .d.ts content |
| Create | `electron/skill-gen/extractors/cli-tool.ts` | CLI extractor: subcommands/flags from yargs/clap/commander/click patterns |
| Create | `electron/skill-gen/extractors/cli-tool.test.ts` | Tests with sample CLI framework code |
| Create | `electron/skill-gen/extractors/framework.ts` | Framework extractor: middleware, config, lifecycle |
| Create | `electron/skill-gen/extractors/framework.test.ts` | Tests with sample Express/FastAPI patterns |
| Create | `electron/skill-gen/extractors/component-library.ts` | Migrated from scannedComponents in main.ts |
| Create | `electron/skill-gen/extractors/component-library.test.ts` | Tests with sample component source |
| Create | `electron/skill-gen/extractors/monorepo.ts` | Monorepo extractor: workspace packages |
| Create | `electron/skill-gen/extractors/monorepo.test.ts` | Tests with sample workspace manifests |
| Create | `electron/skill-gen/extractors/infrastructure.ts` | Infra extractor: .tf variables, Helm values |
| Create | `electron/skill-gen/extractors/infrastructure.test.ts` | Tests with sample .tf files |
| Create | `electron/skill-gen/extractors/generic.ts` | Generic extractor: combines library + CLI extraction |
| Create | `electron/skill-gen/templates/index.ts` | Template registry, `getTemplate(type)` |
| Create | `electron/skill-gen/templates/library.ts` | Library prompt template |
| Create | `electron/skill-gen/templates/cli-tool.ts` | CLI tool prompt template |
| Create | `electron/skill-gen/templates/framework.ts` | Framework prompt template |
| Create | `electron/skill-gen/templates/component-library.ts` | Component library prompt template |
| Create | `electron/skill-gen/templates/monorepo.ts` | Monorepo prompt template |
| Create | `electron/skill-gen/templates/infrastructure.ts` | Infrastructure prompt template |
| Create | `electron/skill-gen/templates/generic.ts` | Generic fallback template (mirrors current buildPrompt) |
| Create | `electron/skill-gen/templates/templates.test.ts` | Tests that prompt assembly produces expected structure |
| Create | `electron/skill-gen/validator.ts` | Post-generation validation pipeline |
| Create | `electron/skill-gen/validator.test.ts` | Validation tests with known-good/bad skill content |
| Create | `electron/skill-gen/pipeline.ts` | Orchestrator: classify → extract → generate → validate |
| Create | `electron/skill-gen/pipeline.test.ts` | Integration test with mocked extractors/generation |
| Move | `electron/skill-gen.ts` → `electron/skill-gen/legacy.ts` | Existing code preserved as fallback |
| Modify | `electron/main.ts:982-1127` | Wire pipeline into `skill:generate`, add `skill:enhance` handler |
| Modify | `electron/db.ts:31-39` | Add `tier` column to skills table |
| Modify | `electron/preload.ts:62-104` | Add `skill.enhance` bridge |
| Modify | `src/env.d.ts:77-94` | Add `skill.enhance` type |
| Modify | `src/views/RepoDetail.tsx` | Add "Enhance" button UI |

---

### Task 1: Shared Types

**Files:**
- Create: `electron/skill-gen/types.ts`

- [ ] **Step 1: Create the types file with all shared interfaces**

```typescript
// electron/skill-gen/types.ts

export type RepoType =
  | 'library'
  | 'cli-tool'
  | 'framework'
  | 'component-library'
  | 'monorepo'
  | 'infrastructure'
  | 'generic'

export interface ClassificationResult {
  type: RepoType
  confidence: number       // 0–1
  signals: string[]        // human-readable reasons
}

export interface ManifestInfo {
  ecosystem: 'node' | 'rust' | 'python' | 'go' | 'ruby' | 'java' | 'dotnet' | 'unknown'
  name?: string
  version?: string
  description?: string
  // Node
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  engines?: Record<string, string>
  bin?: Record<string, string> | string
  main?: string
  types?: string
  exports?: Record<string, unknown>
  // Rust
  edition?: string
  features?: Record<string, string[]>
  // Python
  entryPoints?: Record<string, string>
  requiresPython?: string
  // Go
  modulePath?: string
  goVersion?: string
  // Generic
  rawManifest?: string
}

export interface ExportEntry {
  name: string
  kind: 'function' | 'class' | 'type' | 'interface' | 'const' | 'enum'
  signature?: string
  file: string
}

export interface FlagEntry {
  name: string
  short?: string
  type: string
  default?: string
  description?: string
}

export interface CommandEntry {
  name: string
  description?: string
  flags: FlagEntry[]
}

export interface ComponentEntry {
  name: string
  props: { name: string; type: string; required: boolean; defaultValue?: string }[]
}

export interface PluginEntry {
  name: string
  hookPoint: string
  signature?: string
}

export interface PackageEntry {
  name: string
  path: string
  description?: string
  mainExport?: string
}

export interface ResourceEntry {
  type: string
  name: string
  variables?: ConfigEntry[]
}

export interface ConfigEntry {
  key: string
  type: string
  default?: string
  description?: string
}

export interface ExtractionResult {
  repoType: RepoType
  manifest: ManifestInfo
  fileTree: string[]
  exports?: ExportEntry[]
  commands?: CommandEntry[]
  components?: ComponentEntry[]
  plugins?: PluginEntry[]
  packages?: PackageEntry[]
  resources?: ResourceEntry[]
  configSchema?: ConfigEntry[]
}

export interface Extractor {
  getFilesToFetch(fileTree: string[], manifest: ManifestInfo): string[]
  extract(files: Map<string, string>, manifest: ManifestInfo): Partial<ExtractionResult>
}

export interface SectionSpec {
  maxLines: number
  instructions: string
}

export interface SkillTemplate {
  type: RepoType
  frontmatterFields: string[]
  sections: {
    core: SectionSpec
    extended: SectionSpec
    deep: SectionSpec
  }
  rules: string[]
}

export interface ClassifyInput {
  language: string
  topics: string[]
  fileTree: string[]
  manifest: ManifestInfo
  readmeHead: string   // first ~2000 chars of README
}

export interface ValidationIssue {
  check: string
  message: string
  line?: number
  fix?: string
}

export interface ValidationResult {
  passed: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  autoFixes: number
}

export interface ValidateOutput {
  content: string          // auto-fixed content
  result: ValidationResult
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit electron/skill-gen/types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add electron/skill-gen/types.ts
git commit -m "feat(skill-gen): add shared types for repo-type pipeline framework"
```

---

### Task 2: Manifest Parser

**Files:**
- Create: `electron/skill-gen/manifest-parser.ts`
- Create: `electron/skill-gen/manifest-parser.test.ts`
- Reference: `electron/github.ts:301-318` (getFileContent)

This task creates parsers for package.json, Cargo.toml, pyproject.toml, and go.mod that produce a unified `ManifestInfo`.

- [ ] **Step 1: Write failing tests for package.json parsing**

```typescript
// electron/skill-gen/manifest-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseManifest, detectManifestFile } from './manifest-parser'

describe('detectManifestFile', () => {
  it('returns package.json for Node projects', () => {
    const tree = ['src/index.ts', 'package.json', 'tsconfig.json']
    expect(detectManifestFile(tree)).toBe('package.json')
  })

  it('returns Cargo.toml for Rust projects', () => {
    const tree = ['src/main.rs', 'Cargo.toml', 'Cargo.lock']
    expect(detectManifestFile(tree)).toBe('Cargo.toml')
  })

  it('returns pyproject.toml for Python projects', () => {
    const tree = ['src/main.py', 'pyproject.toml']
    expect(detectManifestFile(tree)).toBe('pyproject.toml')
  })

  it('returns setup.py when no pyproject.toml', () => {
    const tree = ['main.py', 'setup.py']
    expect(detectManifestFile(tree)).toBe('setup.py')
  })

  it('returns go.mod for Go projects', () => {
    const tree = ['main.go', 'go.mod', 'go.sum']
    expect(detectManifestFile(tree)).toBe('go.mod')
  })

  it('returns null when no manifest found', () => {
    const tree = ['README.md', 'Makefile', 'src/main.c']
    expect(detectManifestFile(tree)).toBeNull()
  })
})

describe('parseManifest', () => {
  it('parses package.json with bin field', () => {
    const content = JSON.stringify({
      name: 'my-cli',
      version: '2.0.0',
      description: 'A CLI tool',
      bin: { 'my-cli': './dist/index.js' },
      dependencies: { 'commander': '^10.0.0' },
      engines: { node: '>=18' },
    })
    const result = parseManifest('package.json', content)
    expect(result.ecosystem).toBe('node')
    expect(result.name).toBe('my-cli')
    expect(result.version).toBe('2.0.0')
    expect(result.bin).toEqual({ 'my-cli': './dist/index.js' })
    expect(result.engines).toEqual({ node: '>=18' })
  })

  it('parses package.json with types field', () => {
    const content = JSON.stringify({
      name: '@scope/lib',
      version: '1.0.0',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      peerDependencies: { react: '>=17' },
    })
    const result = parseManifest('package.json', content)
    expect(result.types).toBe('./dist/index.d.ts')
    expect(result.main).toBe('./dist/index.js')
    expect(result.peerDependencies).toEqual({ react: '>=17' })
  })

  it('parses Cargo.toml basic fields', () => {
    const content = `[package]
name = "ripgrep"
version = "14.1.0"
edition = "2021"
description = "A fast line-oriented search tool"

[[bin]]
name = "rg"
path = "crates/core/main.rs"

[dependencies]
regex = "1.10"

[features]
default = ["pcre2"]
pcre2 = ["dep:pcre2"]
`
    const result = parseManifest('Cargo.toml', content)
    expect(result.ecosystem).toBe('rust')
    expect(result.name).toBe('ripgrep')
    expect(result.version).toBe('14.1.0')
    expect(result.edition).toBe('2021')
    expect(result.bin).toEqual({ rg: 'crates/core/main.rs' })
  })

  it('parses go.mod', () => {
    const content = `module github.com/charmbracelet/bubbletea

go 1.18

require (
\tgithub.com/charmbracelet/lipgloss v0.9.1
\tgithub.com/muesli/termenv v0.15.2
)
`
    const result = parseManifest('go.mod', content)
    expect(result.ecosystem).toBe('go')
    expect(result.modulePath).toBe('github.com/charmbracelet/bubbletea')
    expect(result.goVersion).toBe('1.18')
    expect(result.name).toBe('bubbletea')
  })

  it('parses pyproject.toml', () => {
    const content = `[project]
name = "fastapi"
version = "0.110.0"
description = "FastAPI framework"
requires-python = ">=3.8"

[project.scripts]
fastapi = "fastapi.cli:main"
`
    const result = parseManifest('pyproject.toml', content)
    expect(result.ecosystem).toBe('python')
    expect(result.name).toBe('fastapi')
    expect(result.version).toBe('0.110.0')
    expect(result.requiresPython).toBe('>=3.8')
    expect(result.entryPoints).toEqual({ fastapi: 'fastapi.cli:main' })
  })

  it('parses setup.py basic fields', () => {
    const content = `from setuptools import setup

setup(
    name="click",
    version="8.1.7",
    entry_points={"console_scripts": ["click=click:cli"]},
)
`
    const result = parseManifest('setup.py', content)
    expect(result.ecosystem).toBe('python')
    expect(result.name).toBe('click')
  })

  it('returns unknown ecosystem for unrecognized files', () => {
    const result = parseManifest('Makefile', 'all: build')
    expect(result.ecosystem).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/manifest-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement manifest parser**

Create `electron/skill-gen/manifest-parser.ts`. The file should export:

- `detectManifestFile(fileTree: string[]): string | null` — returns the manifest filename to fetch, checked in priority order: `package.json` > `Cargo.toml` > `pyproject.toml` > `setup.py` > `go.mod` > `Gemfile` > `pom.xml` > `*.csproj` > `null`
- `parseManifest(filename: string, content: string): ManifestInfo` — delegates to per-ecosystem parsers based on filename

Per-ecosystem parsers:
- `parsePackageJson(content)` — JSON.parse, extract name/version/description/bin/main/types/exports/dependencies/peerDependencies/engines
- `parsCargoToml(content)` — regex-based TOML parsing for [package] fields, [[bin]] sections, [features], [dependencies]. No TOML library needed — field extraction with regex is sufficient for the structured format.
- `parseGoMod(content)` — regex for `module` line → modulePath (name = last segment), `go` line → goVersion
- `parsePyprojectToml(content)` — regex for [project] section fields: name, version, requires-python, [project.scripts] → entryPoints
- `parseSetupPy(content)` — regex for `name=`, `version=`, `entry_points` inside `setup()` call. Best-effort — setup.py is arbitrary Python, so only extract obvious string literals.

All parsers should catch exceptions and return `{ ecosystem: 'unknown' }` on failure. Store `rawManifest = content` on all results.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/manifest-parser.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/manifest-parser.ts electron/skill-gen/manifest-parser.test.ts
git commit -m "feat(skill-gen): add multi-ecosystem manifest parser"
```

---

### Task 3: GitHub File Fetching Utilities

**Files:**
- Create: `electron/skill-gen/github-files.ts`
- Create: `electron/skill-gen/github-files.test.ts`
- Reference: `electron/github.ts:282-298` (getRepoTree), `electron/github.ts:301-318` (getFileContent)

- [ ] **Step 1: Write failing tests**

```typescript
// electron/skill-gen/github-files.test.ts
import { describe, it, expect, vi } from 'vitest'
import { fetchFileTree, fetchRepoFiles, fetchManifest } from './github-files'

// Mock the github module
vi.mock('../github', () => ({
  getRepoTree: vi.fn(),
  getFileContent: vi.fn(),
}))

import { getRepoTree, getFileContent } from '../github'

const mockGetRepoTree = vi.mocked(getRepoTree)
const mockGetFileContent = vi.mocked(getFileContent)

describe('fetchFileTree', () => {
  it('returns file paths from tree', async () => {
    mockGetRepoTree.mockResolvedValue([
      { path: 'src/index.ts', type: 'blob' },
      { path: 'src', type: 'tree' },
      { path: 'package.json', type: 'blob' },
    ])
    const result = await fetchFileTree('tok', 'owner', 'repo', 'main')
    expect(result).toEqual(['src/index.ts', 'package.json'])
  })

  it('returns empty array on truncated tree error', async () => {
    mockGetRepoTree.mockRejectedValue(new Error('Repo tree too large (GitHub truncated the response)'))
    const result = await fetchFileTree('tok', 'owner', 'repo', 'main')
    expect(result).toEqual([])
  })

  it('returns empty array on API error', async () => {
    mockGetRepoTree.mockRejectedValue(new Error('GitHub API error: 403'))
    const result = await fetchFileTree('tok', 'owner', 'repo', 'main')
    expect(result).toEqual([])
  })
})

describe('fetchRepoFiles', () => {
  it('fetches multiple files in parallel', async () => {
    mockGetFileContent.mockImplementation(async (_, __, ___, p) => {
      if (p === 'src/index.ts') return 'export const foo = 1'
      if (p === 'package.json') return '{"name":"test"}'
      return null
    })
    const result = await fetchRepoFiles('tok', 'owner', 'repo', ['src/index.ts', 'package.json'])
    expect(result.get('src/index.ts')).toBe('export const foo = 1')
    expect(result.get('package.json')).toBe('{"name":"test"}')
  })

  it('skips files that return null', async () => {
    mockGetFileContent.mockResolvedValue(null)
    const result = await fetchRepoFiles('tok', 'owner', 'repo', ['missing.ts'])
    expect(result.size).toBe(0)
  })

  it('skips files that throw errors', async () => {
    mockGetFileContent.mockRejectedValue(new Error('403'))
    const result = await fetchRepoFiles('tok', 'owner', 'repo', ['forbidden.ts'])
    expect(result.size).toBe(0)
  })

  it('enforces max 15 file limit', async () => {
    mockGetFileContent.mockResolvedValue('content')
    const paths = Array.from({ length: 20 }, (_, i) => `file${i}.ts`)
    const result = await fetchRepoFiles('tok', 'owner', 'repo', paths)
    expect(mockGetFileContent).toHaveBeenCalledTimes(15)
  })
})

describe('fetchManifest', () => {
  it('detects and fetches package.json', async () => {
    mockGetFileContent.mockResolvedValue('{"name":"test"}')
    const result = await fetchManifest('tok', 'owner', 'repo', ['src/index.ts', 'package.json'])
    expect(result).toEqual({ filename: 'package.json', content: '{"name":"test"}' })
    expect(mockGetFileContent).toHaveBeenCalledWith('tok', 'owner', 'repo', 'package.json')
  })

  it('returns null when no manifest in tree', async () => {
    const result = await fetchManifest('tok', 'owner', 'repo', ['README.md', 'Makefile'])
    expect(result).toBeNull()
    expect(mockGetFileContent).not.toHaveBeenCalled()
  })

  it('returns null when fetch fails', async () => {
    mockGetFileContent.mockResolvedValue(null)
    const result = await fetchManifest('tok', 'owner', 'repo', ['package.json'])
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/github-files.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement github-files.ts**

Create `electron/skill-gen/github-files.ts`. Export:

- `fetchFileTree(token, owner, name, branch): Promise<string[]>` — wraps `getRepoTree()`, catches ALL errors (including truncation), returns only blob paths. Returns `[]` on any failure.
- `fetchRepoFiles(token, owner, name, paths): Promise<Map<string, string>>` — wraps `getFileContent()` with `Promise.allSettled()` for parallel fetching. Caps at 15 files. Skips null/error results. Returns a Map of path → content.
- `fetchManifest(token, owner, name, fileTree): Promise<{ filename: string; content: string } | null>` — uses `detectManifestFile()` from manifest-parser to find the manifest, then fetches it. Returns null if not found.

Import `getRepoTree` and `getFileContent` from `../github`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/github-files.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/github-files.ts electron/skill-gen/github-files.test.ts
git commit -m "feat(skill-gen): add GitHub file fetching utilities with rate limit safety"
```

---

### Task 4: Repo Type Classifier

**Files:**
- Create: `electron/skill-gen/classifier.ts`
- Create: `electron/skill-gen/classifier.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases covering each repo type with realistic signal combinations:

```typescript
// electron/skill-gen/classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classify } from './classifier'
import type { ManifestInfo } from './types'

const emptyManifest: ManifestInfo = { ecosystem: 'unknown' }

describe('classify', () => {
  it('detects library from Node package without bin', () => {
    const manifest: ManifestInfo = {
      ecosystem: 'node',
      name: '@tanstack/query',
      version: '5.0.0',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      peerDependencies: { react: '>=17' },
    }
    const result = classify({
      language: 'TypeScript',
      topics: ['react', 'data-fetching', 'hooks'],
      fileTree: ['src/index.ts', 'src/types.ts', 'package.json'],
      manifest,
      readmeHead: '# TanStack Query\nPowerful asynchronous state management',
    })
    expect(result.type).toBe('library')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('detects cli-tool from bin field', () => {
    const manifest: ManifestInfo = {
      ecosystem: 'node',
      name: 'eslint',
      bin: { eslint: './bin/eslint.js' },
    }
    const result = classify({
      language: 'JavaScript',
      topics: ['linter', 'cli'],
      fileTree: ['bin/eslint.js', 'lib/cli.js', 'package.json'],
      manifest,
      readmeHead: '# ESLint\nFind and fix problems in your JavaScript code',
    })
    expect(result.type).toBe('cli-tool')
  })

  it('detects cli-tool from Rust [[bin]]', () => {
    const manifest: ManifestInfo = {
      ecosystem: 'rust',
      name: 'ripgrep',
      bin: { rg: 'crates/core/main.rs' },
    }
    const result = classify({
      language: 'Rust',
      topics: ['cli', 'search', 'grep'],
      fileTree: ['src/main.rs', 'Cargo.toml'],
      manifest,
      readmeHead: '# ripgrep\nA line-oriented search tool',
    })
    expect(result.type).toBe('cli-tool')
  })

  it('detects framework from topics and patterns', () => {
    const result = classify({
      language: 'Python',
      topics: ['framework', 'web', 'async'],
      fileTree: ['fastapi/__init__.py', 'fastapi/routing.py', 'fastapi/middleware.py', 'pyproject.toml'],
      manifest: { ecosystem: 'python', name: 'fastapi' },
      readmeHead: '# FastAPI\nFastAPI framework, high performance',
    })
    expect(result.type).toBe('framework')
  })

  it('detects component-library from topics', () => {
    const result = classify({
      language: 'TypeScript',
      topics: ['design-system', 'react', 'ui-components'],
      fileTree: ['src/Button.tsx', 'src/Input.tsx', 'package.json'],
      manifest: { ecosystem: 'node', name: '@radix-ui/primitives' },
      readmeHead: '# Radix Primitives\nUnstyled, accessible UI components',
    })
    expect(result.type).toBe('component-library')
  })

  it('detects monorepo from workspaces', () => {
    const manifest: ManifestInfo = {
      ecosystem: 'node',
      name: 'babel',
      rawManifest: JSON.stringify({ workspaces: ['packages/*'] }),
    }
    const result = classify({
      language: 'JavaScript',
      topics: ['compiler'],
      fileTree: ['packages/core/package.json', 'packages/parser/package.json', 'package.json', 'lerna.json'],
      manifest,
      readmeHead: '# Babel\nThe compiler for writing next generation JavaScript',
    })
    expect(result.type).toBe('monorepo')
  })

  it('detects infrastructure from .tf files', () => {
    const result = classify({
      language: 'HCL',
      topics: ['terraform', 'aws'],
      fileTree: ['main.tf', 'variables.tf', 'outputs.tf'],
      manifest: emptyManifest,
      readmeHead: '# AWS VPC Module\nTerraform module for creating VPC',
    })
    expect(result.type).toBe('infrastructure')
  })

  it('falls back to generic with low confidence', () => {
    const result = classify({
      language: 'C',
      topics: [],
      fileTree: ['main.c', 'Makefile'],
      manifest: emptyManifest,
      readmeHead: '# My Project',
    })
    expect(result.type).toBe('generic')
    expect(result.confidence).toBeLessThan(0.4)
  })

  it('handles empty inputs gracefully', () => {
    const result = classify({
      language: '',
      topics: [],
      fileTree: [],
      manifest: emptyManifest,
      readmeHead: '',
    })
    expect(result.type).toBe('generic')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement classifier**

Create `electron/skill-gen/classifier.ts`. Export:

- `classify(input: ClassifyInput): ClassificationResult`

```typescript
interface ClassifyInput {
  language: string
  topics: string[]
  fileTree: string[]
  manifest: ManifestInfo
  readmeHead: string   // first ~2000 chars of README
}
```

Implementation: scored heuristic. For each repo type, define a scoring function that adds points based on signals:

**cli-tool** (check first — most specific signals):
- `manifest.bin` present: +0.4
- `manifest.entryPoints` (Python console_scripts): +0.4
- Topics include "cli"/"command-line"/"terminal": +0.2
- File tree has `bin/` directory: +0.1
- README head matches `/usage:.*--\w/i` (flag-like patterns): +0.1

**component-library**:
- Topics include "components"/"ui-components"/"design-system"/"component-library": +0.3 each (max 0.6)
- Name matches `/ui|components|design.?system/i`: +0.2
- File tree has many `.tsx`/`.vue`/`.svelte` files in flat structure: +0.2

**framework**:
- Topics include "framework": +0.4
- File tree has `middleware`/`plugin` directories or files: +0.2
- README head matches `/scaffold|create.*app|init|getting.?started/i`: +0.1
- Has routing patterns (file tree has `routes/`/`routing`): +0.1

**monorepo**:
- `rawManifest` has `"workspaces"`: +0.4
- File tree has `lerna.json` / `pnpm-workspace.yaml` / `nx.json` / `turbo.json`: +0.3
- File tree has `packages/*/package.json` pattern: +0.3

**infrastructure**:
- File tree has `.tf` files: +0.4
- File tree has `Chart.yaml`: +0.3
- Topics include "terraform"/"kubernetes"/"helm"/"devops"/"docker": +0.2
- Language is "HCL": +0.3

**library** (default for code with exports):
- `manifest.types` or `manifest.main` present: +0.3
- `manifest.peerDependencies` present: +0.2
- Topics include "sdk"/"client"/"wrapper"/"library"/"api": +0.2
- Has entry point files (index.ts/mod.rs/__init__.py): +0.2

Pick highest score. If highest < 0.4, return `generic`. Include matched signals in `signals[]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/classifier.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/classifier.ts electron/skill-gen/classifier.test.ts
git commit -m "feat(skill-gen): add repo type classifier with scored heuristics"
```

---

### Task 5: Library Extractor

**Files:**
- Create: `electron/skill-gen/extractors/library.ts`
- Create: `electron/skill-gen/extractors/library.test.ts`

- [ ] **Step 1: Write failing tests**

Test with realistic `.d.ts` and `index.ts` content:

```typescript
// electron/skill-gen/extractors/library.test.ts
import { describe, it, expect } from 'vitest'
import { libraryExtractor } from './library'
import type { ManifestInfo } from '../types'

const nodeManifest: ManifestInfo = {
  ecosystem: 'node',
  name: 'zod',
  types: './dist/index.d.ts',
  main: './dist/index.js',
}

describe('libraryExtractor.getFilesToFetch', () => {
  it('fetches .d.ts entry point when manifest has types field', () => {
    const tree = ['dist/index.d.ts', 'dist/index.js', 'src/index.ts', 'package.json']
    const result = libraryExtractor.getFilesToFetch(tree, nodeManifest)
    expect(result).toContain('dist/index.d.ts')
  })

  it('fetches src/index.ts when no types field', () => {
    const tree = ['src/index.ts', 'src/utils.ts', 'package.json']
    const result = libraryExtractor.getFilesToFetch(tree, { ecosystem: 'node', name: 'test' })
    expect(result).toContain('src/index.ts')
  })

  it('fetches mod.rs for Rust crates', () => {
    const tree = ['src/lib.rs', 'src/types.rs', 'Cargo.toml']
    const result = libraryExtractor.getFilesToFetch(tree, { ecosystem: 'rust', name: 'serde' })
    expect(result).toContain('src/lib.rs')
  })

  it('fetches __init__.py for Python packages', () => {
    const tree = ['pydantic/__init__.py', 'pydantic/main.py', 'pyproject.toml']
    const manifest: ManifestInfo = { ecosystem: 'python', name: 'pydantic' }
    const result = libraryExtractor.getFilesToFetch(tree, manifest)
    expect(result).toContain('pydantic/__init__.py')
  })

  it('respects 15 file limit', () => {
    const tree = Array.from({ length: 50 }, (_, i) => `src/file${i}.d.ts`)
    const result = libraryExtractor.getFilesToFetch(tree, nodeManifest)
    expect(result.length).toBeLessThanOrEqual(15)
  })
})

describe('libraryExtractor.extract', () => {
  it('extracts exported functions from .d.ts', () => {
    const files = new Map([
      ['dist/index.d.ts', `
export declare function z(): ZodType;
export declare function string(): ZodString;
export declare class ZodString extends ZodType {
  min(length: number): ZodString;
}
export type ZodType = { parse(data: unknown): unknown };
export interface ZodSchema { safeParse(data: unknown): SafeParseResult; }
export declare const object: (shape: Record<string, ZodType>) => ZodObject;
`],
    ])
    const result = libraryExtractor.extract(files, nodeManifest)
    expect(result.exports).toBeDefined()
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('z')
    expect(names).toContain('string')
    expect(names).toContain('ZodString')
    expect(names).toContain('ZodType')
    expect(names).toContain('ZodSchema')
    expect(names).toContain('object')
  })

  it('extracts exports from TypeScript source', () => {
    const files = new Map([
      ['src/index.ts', `
export function createClient(config: Config): Client { }
export class APIClient { }
export const VERSION = '1.0.0'
export enum LogLevel { Debug, Info, Warn, Error }
export { helper } from './helper'
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'node', name: 'test' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('createClient')
    expect(names).toContain('APIClient')
    expect(names).toContain('VERSION')
    expect(names).toContain('LogLevel')
  })

  it('extracts pub functions from Rust', () => {
    const files = new Map([
      ['src/lib.rs', `
pub fn serialize<T: Serialize>(value: &T) -> Result<String> { }
pub struct Serializer { }
pub enum Format { Json, Toml, Yaml }
pub trait Serialize { fn serialize(&self) -> Result<()>; }
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'rust', name: 'serde' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('serialize')
    expect(names).toContain('Serializer')
    expect(names).toContain('Format')
    expect(names).toContain('Serialize')
  })

  it('returns empty exports for empty files', () => {
    const files = new Map<string, string>()
    const result = libraryExtractor.extract(files, nodeManifest)
    expect(result.exports ?? []).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/extractors/library.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement library extractor**

Create `electron/skill-gen/extractors/library.ts`. Export `libraryExtractor: Extractor`.

`getFilesToFetch` logic:
- If Node (`manifest.types`): fetch the types entry point (.d.ts). Also look for `src/index.ts`, `index.ts`.
- If Rust: fetch `src/lib.rs`
- If Python: fetch `{name}/__init__.py` or `src/{name}/__init__.py`
- If Go: fetch files matching `*.go` in root (skip `_test.go`)
- Additionally, look for common patterns: `src/index.*`, `lib/index.*`, `mod.ts`, `mod.rs`
- Cap at 15 files

`extract` logic — regex-based export scanning per ecosystem:
- **TypeScript/JS .d.ts**: Match `export declare function (\w+)`, `export declare class (\w+)`, `export type (\w+)`, `export interface (\w+)`, `export declare const (\w+)`, `export enum (\w+)`
- **TypeScript/JS source**: Match `export function (\w+)`, `export class (\w+)`, `export const (\w+)`, `export type (\w+)`, `export interface (\w+)`, `export enum (\w+)`, `export \{ (\w+) \}`
- **Rust**: Match `pub fn (\w+)`, `pub struct (\w+)`, `pub enum (\w+)`, `pub trait (\w+)`, `pub type (\w+)`
- **Python**: Match `def (\w+)`, `class (\w+)` (at module top level — indent 0), `__all__` list items
- **Go**: Match `func (\p{Lu}\w+)` (capitalized = exported), `type (\p{Lu}\w+)`

For each match, capture `name`, `kind`, and optionally `signature` (the rest of the line after the name, truncated at 100 chars). Set `file` to the source path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/extractors/library.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/extractors/library.ts electron/skill-gen/extractors/library.test.ts
git commit -m "feat(skill-gen): add library extractor for multi-language export scanning"
```

---

### Task 6: CLI Tool Extractor

**Files:**
- Create: `electron/skill-gen/extractors/cli-tool.ts`
- Create: `electron/skill-gen/extractors/cli-tool.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/skill-gen/extractors/cli-tool.test.ts
import { describe, it, expect } from 'vitest'
import { cliToolExtractor } from './cli-tool'
import type { ManifestInfo } from '../types'

describe('cliToolExtractor.getFilesToFetch', () => {
  it('fetches bin entry point from manifest', () => {
    const manifest: ManifestInfo = { ecosystem: 'node', bin: { 'my-cli': './bin/cli.js' } }
    const tree = ['bin/cli.js', 'src/commands/init.ts', 'package.json']
    const result = cliToolExtractor.getFilesToFetch(tree, manifest)
    expect(result).toContain('bin/cli.js')
  })

  it('fetches command files from commands/ directory', () => {
    const tree = ['src/commands/init.ts', 'src/commands/build.ts', 'src/commands/test.ts', 'package.json']
    const result = cliToolExtractor.getFilesToFetch(tree, { ecosystem: 'node', bin: 'cli.js' })
    expect(result).toContain('src/commands/init.ts')
    expect(result).toContain('src/commands/build.ts')
  })

  it('fetches main.rs for Rust CLIs', () => {
    const tree = ['src/main.rs', 'src/cli.rs', 'Cargo.toml']
    const result = cliToolExtractor.getFilesToFetch(tree, { ecosystem: 'rust', name: 'rg' })
    expect(result).toContain('src/main.rs')
    expect(result).toContain('src/cli.rs')
  })
})

describe('cliToolExtractor.extract', () => {
  it('extracts commander.js commands and options', () => {
    const files = new Map([
      ['src/cli.ts', `
import { program } from 'commander'

program
  .name('my-cli')
  .description('A great CLI tool')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize a new project')
  .option('-t, --template <name>', 'Template to use', 'default')
  .option('--no-git', 'Skip git initialization')
  .action(handleInit)

program
  .command('build')
  .description('Build the project')
  .option('-o, --output <dir>', 'Output directory')
  .option('--minify', 'Minify output', false)
  .action(handleBuild)
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'node', name: 'my-cli' })
    expect(result.commands).toBeDefined()
    expect(result.commands!.length).toBeGreaterThanOrEqual(2)
    const init = result.commands!.find(c => c.name === 'init')
    expect(init).toBeDefined()
    expect(init!.description).toBe('Initialize a new project')
    expect(init!.flags.length).toBeGreaterThanOrEqual(2)
    expect(init!.flags.find(f => f.name === '--template')).toBeDefined()
  })

  it('extracts yargs commands', () => {
    const files = new Map([
      ['src/cli.ts', `
yargs
  .command('serve [port]', 'Start the server', (yargs) => {
    return yargs.option('port', { alias: 'p', type: 'number', default: 3000 })
  })
  .command('build', 'Build for production', (yargs) => {
    return yargs.option('outDir', { type: 'string', default: 'dist' })
  })
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'node', name: 'test' })
    expect(result.commands).toBeDefined()
    const serve = result.commands!.find(c => c.name === 'serve')
    expect(serve).toBeDefined()
  })

  it('extracts clap derive commands from Rust', () => {
    const files = new Map([
      ['src/cli.rs', `
#[derive(Parser)]
#[command(name = "rg", about = "Search files for patterns")]
struct Cli {
    /// The pattern to search for
    pattern: String,

    /// Files or directories to search
    path: Vec<PathBuf>,

    /// Case-insensitive search
    #[arg(short = 'i', long)]
    ignore_case: bool,

    /// Show line numbers
    #[arg(short = 'n', long)]
    line_number: bool,

    /// Number of context lines
    #[arg(short = 'C', long, default_value = "0")]
    context: usize,
}
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'rust', name: 'ripgrep' })
    expect(result.commands).toBeDefined()
    const flags = result.commands![0]?.flags ?? []
    expect(flags.find(f => f.name === '--ignore-case')).toBeDefined()
    expect(flags.find(f => f.name === '--line-number')).toBeDefined()
  })

  it('extracts click commands from Python', () => {
    const files = new Map([
      ['cli.py', `
@click.command()
@click.option('--count', default=1, help='Number of greetings')
@click.option('--name', prompt='Your name', help='Who to greet')
def hello(count, name):
    """Greet someone."""
    for _ in range(count):
        click.echo(f"Hello, {name}!")
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'python', name: 'test' })
    expect(result.commands).toBeDefined()
    const hello = result.commands!.find(c => c.name === 'hello')
    expect(hello).toBeDefined()
    expect(hello!.flags.find(f => f.name === '--count')).toBeDefined()
  })

  it('returns empty commands for unrecognized patterns', () => {
    const files = new Map([['main.c', 'int main() { return 0; }']])
    const result = cliToolExtractor.extract(files, { ecosystem: 'unknown' })
    expect(result.commands ?? []).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/extractors/cli-tool.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement CLI tool extractor**

Create `electron/skill-gen/extractors/cli-tool.ts`. Export `cliToolExtractor: Extractor`.

`getFilesToFetch`:
- Bin entry point from manifest
- Files matching `**/commands/**`, `**/cmd/**`, `*cli*`, `*command*`
- For Rust: `src/main.rs`, `src/cli.rs`, `src/args.rs`
- For Python: files with `click`/`argparse`/`typer` in name or common patterns
- Cap at 15

`extract` — detect CLI framework from file content, then parse:
- **commander.js**: Match `.command('name')`, `.description('...')`, `.option('flags', 'desc', default)`
- **yargs**: Match `.command('name', 'desc', ...)`, `.option('name', { ... })`
- **clap (Rust)**: Match `#[arg(short = 'x', long)]` + field name, `#[command(name = "...", about = "...")]`, `/// doc comment` lines before fields
- **click (Python)**: Match `@click.command()`, `@click.option('--name', ...)`, `def function_name` after decorators
- **argparse (Python)**: Match `parser.add_argument('--flag', ...)`, `subparsers.add_parser('name', ...)`
- **cobra (Go)**: Match `&cobra.Command{Use: "name", Short: "desc"}`, `Flags().StringP("name", "n", default, "desc")`

Build `CommandEntry[]` from matched patterns.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/extractors/cli-tool.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/extractors/cli-tool.ts electron/skill-gen/extractors/cli-tool.test.ts
git commit -m "feat(skill-gen): add CLI tool extractor for commander/yargs/clap/click"
```

---

### Task 7: Framework, Component Library, Monorepo, and Infrastructure Extractors

**Files:**
- Create: `electron/skill-gen/extractors/framework.ts` + test
- Create: `electron/skill-gen/extractors/component-library.ts` + test
- Create: `electron/skill-gen/extractors/monorepo.ts` + test
- Create: `electron/skill-gen/extractors/infrastructure.ts` + test
- Create: `electron/skill-gen/extractors/index.ts`

These follow the same pattern as Tasks 5-6. Each extractor implements the `Extractor` interface.

- [ ] **Step 1: Write failing tests for framework extractor**

Test cases: Express middleware registration patterns, FastAPI decorator routes, Django URL patterns. The extractor should find plugin/middleware extension points and config schemas.

- [ ] **Step 2: Implement framework extractor**

`getFilesToFetch`: files matching `**/middleware*`, `**/plugin*`, `**/config*`, `**/routes*`, entry points.
`extract`: regex for `app.use(`, `@app.route`, decorator patterns, config object definitions. Produces `plugins` and `configSchema` fields.

- [ ] **Step 3: Run tests, verify pass**

Run: `npx vitest run electron/skill-gen/extractors/framework.test.ts`

- [ ] **Step 4: Write failing tests for component-library extractor**

Migrate the existing `scannedComponents` logic from `electron/main.ts:1010-1032` into the extractor. Test that it produces `ComponentEntry[]` matching the existing shape.

- [ ] **Step 5: Implement component-library extractor**

Port the `scanComponents` + `parseComponent` call chain into the extractor's `extract()` method. `getFilesToFetch` targets `*.tsx`, `*.vue`, `*.svelte` files in `src/` or `components/`.

- [ ] **Step 6: Run tests, verify pass**

Run: `npx vitest run electron/skill-gen/extractors/component-library.test.ts`

- [ ] **Step 7: Write failing tests for monorepo extractor**

Test with sample workspace manifests: lerna.json, pnpm-workspace.yaml, npm workspaces in package.json. Should produce `PackageEntry[]`.

- [ ] **Step 8: Implement monorepo extractor**

`getFilesToFetch`: workspace package manifests (`packages/*/package.json`, etc.).
`extract`: parse each sub-package manifest for name/description/main export. Produces `packages` field.

- [ ] **Step 9: Run tests, verify pass**

Run: `npx vitest run electron/skill-gen/extractors/monorepo.test.ts`

- [ ] **Step 10: Write failing tests for infrastructure extractor**

Test with sample `.tf` files containing `variable` blocks, Helm `values.yaml`. Should produce `ResourceEntry[]` and `ConfigEntry[]`.

- [ ] **Step 11: Implement infrastructure extractor**

`getFilesToFetch`: `*.tf`, `values.yaml`, `Chart.yaml`, `Dockerfile`.
`extract`: regex for `variable "name" { type = ... default = ... }`, `resource "type" "name"`, Helm value keys. Produces `resources` and `configSchema`.

- [ ] **Step 12: Run tests, verify pass**

Run: `npx vitest run electron/skill-gen/extractors/infrastructure.test.ts`

- [ ] **Step 13: Create generic extractor (combines library + CLI)**

Per the spec, the `generic` extractor runs both library and CLI extraction and merges results:

```typescript
// electron/skill-gen/extractors/generic.ts
import type { Extractor, ManifestInfo, ExtractionResult } from '../types'
import { libraryExtractor } from './library'
import { cliToolExtractor } from './cli-tool'

export const genericExtractor: Extractor = {
  getFilesToFetch(fileTree, manifest) {
    const libFiles = libraryExtractor.getFilesToFetch(fileTree, manifest)
    const cliFiles = cliToolExtractor.getFilesToFetch(fileTree, manifest)
    // Deduplicate, cap at 15
    const unique = [...new Set([...libFiles, ...cliFiles])]
    return unique.slice(0, 15)
  },

  extract(files, manifest) {
    const libResult = libraryExtractor.extract(files, manifest)
    const cliResult = cliToolExtractor.extract(files, manifest)
    // Merge: take whichever fields are non-empty
    return {
      ...libResult,
      ...cliResult,
      exports: libResult.exports ?? cliResult.exports,
      commands: cliResult.commands ?? libResult.commands,
    }
  },
}
```

- [ ] **Step 14: Create extractor registry (index.ts)**

```typescript
// electron/skill-gen/extractors/index.ts
import type { Extractor, RepoType } from '../types'
import { libraryExtractor } from './library'
import { cliToolExtractor } from './cli-tool'
import { frameworkExtractor } from './framework'
import { componentLibraryExtractor } from './component-library'
import { monorepoExtractor } from './monorepo'
import { infrastructureExtractor } from './infrastructure'
import { genericExtractor } from './generic'

const extractors: Record<RepoType, Extractor> = {
  library: libraryExtractor,
  'cli-tool': cliToolExtractor,
  framework: frameworkExtractor,
  'component-library': componentLibraryExtractor,
  monorepo: monorepoExtractor,
  infrastructure: infrastructureExtractor,
  generic: genericExtractor,
}

export function getExtractor(type: RepoType): Extractor {
  return extractors[type]
}
```

- [ ] **Step 15: Commit all extractors**

```bash
git add electron/skill-gen/extractors/
git commit -m "feat(skill-gen): add framework, component-library, monorepo, infrastructure extractors and registry"
```

---

### Task 8: Prompt Templates

**Files:**
- Create: `electron/skill-gen/templates/library.ts`
- Create: `electron/skill-gen/templates/cli-tool.ts`
- Create: `electron/skill-gen/templates/framework.ts`
- Create: `electron/skill-gen/templates/component-library.ts`
- Create: `electron/skill-gen/templates/monorepo.ts`
- Create: `electron/skill-gen/templates/infrastructure.ts`
- Create: `electron/skill-gen/templates/generic.ts`
- Create: `electron/skill-gen/templates/index.ts`
- Create: `electron/skill-gen/templates/templates.test.ts`

- [ ] **Step 1: Write failing tests for template prompt assembly**

```typescript
// electron/skill-gen/templates/templates.test.ts
import { describe, it, expect } from 'vitest'
import { buildPromptFromTemplate } from './index'
import type { ExtractionResult, ManifestInfo } from '../types'

const baseExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'zod', version: '3.22.0' },
  fileTree: ['src/index.ts'],
  exports: [
    { name: 'z', kind: 'function', signature: '(): ZodType', file: 'src/index.ts' },
    { name: 'string', kind: 'function', signature: '(): ZodString', file: 'src/index.ts' },
  ],
}

describe('buildPromptFromTemplate', () => {
  it('includes section markers for library type', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README content here')
    expect(prompt).toContain('## [CORE]')
    expect(prompt).toContain('## [EXTENDED]')
    expect(prompt).toContain('## [DEEP]')
  })

  it('includes extraction data before README', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README content here')
    const extractionPos = prompt.indexOf('EXTRACTED DATA')
    const readmePos = prompt.indexOf('README:')
    expect(extractionPos).toBeLessThan(readmePos)
  })

  it('includes exported function names in extraction section', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README')
    expect(prompt).toContain('z')
    expect(prompt).toContain('string')
  })

  it('uses cli-tool template for CLI repos', () => {
    const cliExtraction: ExtractionResult = {
      repoType: 'cli-tool',
      manifest: { ecosystem: 'node', name: 'eslint', bin: { eslint: './bin/eslint.js' } },
      fileTree: ['bin/eslint.js'],
      commands: [
        { name: 'lint', description: 'Lint files', flags: [{ name: '--fix', type: 'boolean' }] },
      ],
    }
    const prompt = buildPromptFromTemplate('cli-tool', cliExtraction, 'README')
    expect(prompt).toContain('subcommand')
    expect(prompt).toContain('lint')
    expect(prompt).toContain('--fix')
  })

  it('includes universal rules in all templates', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README')
    expect(prompt).toContain('AI coding assistant')
    expect(prompt).toContain('do not invent')
    expect(prompt).toContain('## [CORE]')
  })

  it('truncates README to 12000 chars', () => {
    const longReadme = 'x'.repeat(20000)
    const prompt = buildPromptFromTemplate('library', baseExtraction, longReadme)
    expect(prompt).toContain('x'.repeat(12000))
    expect(prompt).not.toContain('x'.repeat(12001))
  })

  it('handles generic type with same structure as current prompt', () => {
    const prompt = buildPromptFromTemplate('generic', {
      ...baseExtraction,
      repoType: 'generic',
      exports: undefined,
    }, 'README')
    expect(prompt).toContain('## [CORE]')
    expect(prompt).toContain('## [EXTENDED]')
    expect(prompt).toContain('## [DEEP]')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/templates/templates.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement all templates and registry**

Each template file exports a `SkillTemplate` object. The section instructions follow the spec (Section 5).

**`templates/index.ts`** exports:
- `getTemplate(type: RepoType): SkillTemplate`
- `buildPromptFromTemplate(type: RepoType, extraction: ExtractionResult, readme: string): string`

The `buildPromptFromTemplate` function:
1. Gets the template for the type
2. Builds the frontmatter block from `extraction.manifest` using `template.frontmatterFields`
3. Formats extraction data as a structured text block (EXTRACTED DATA section):
   - For `exports`: list each as `- name (kind): signature`
   - For `commands`: list each with flags
   - For `components`: list each with props
   - For `packages`: list each with description
   - For `resources`: list each with variables
4. Assembles the prompt: repo info → section instructions → extracted data → README (truncated 12K) → universal rules → type-specific rules
5. Returns the complete prompt string

**Generic template** (`templates/generic.ts`): mirrors the existing `buildPrompt()` from `electron/skill-gen.ts:29-97` as closely as possible to ensure zero regression for the fallback path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/templates/templates.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/templates/
git commit -m "feat(skill-gen): add type-specific prompt templates with registry"
```

---

### Task 9: Post-Generation Validator

**Files:**
- Create: `electron/skill-gen/validator.ts`
- Create: `electron/skill-gen/validator.test.ts`
- Reference: `electron/skill-gen.ts:198-246` (stripHallucinatedUrls to migrate)

- [ ] **Step 1: Write failing tests**

```typescript
// electron/skill-gen/validator.test.ts
import { describe, it, expect } from 'vitest'
import { validate } from './validator'
import type { ExtractionResult, SkillTemplate } from '../types'

const mockExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'zod', version: '3.22.0' },
  fileTree: [],
  exports: [
    { name: 'z', kind: 'function', file: 'src/index.ts' },
    { name: 'string', kind: 'function', file: 'src/index.ts' },
  ],
}

describe('validate', () => {
  it('passes for well-formed skill with all sections', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: owner/zod\nversion: 3.22.0\n\`\`\`\nz() creates schemas\n## [EXTENDED]\nMore info\n## [DEEP]\nDeep info`
    const result = validate(content, mockExtraction, '# Zod README')
    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('errors on missing CORE section', () => {
    const content = `## [EXTENDED]\nSome info\n## [DEEP]\nDeep info`
    const result = validate(content, mockExtraction, '')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.check === 'structure' && e.message.includes('CORE'))).toBe(true)
  })

  it('errors on missing EXTENDED section', () => {
    const content = `## [CORE]\nInfo\n## [DEEP]\nDeep info`
    const result = validate(content, mockExtraction, '')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.message.includes('EXTENDED'))).toBe(true)
  })

  it('errors on missing DEEP section', () => {
    const content = `## [CORE]\nInfo\n## [EXTENDED]\nMore info`
    const result = validate(content, mockExtraction, '')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.message.includes('DEEP'))).toBe(true)
  })

  it('warns on function names not in extraction', () => {
    const content = `## [CORE]\nUse createSchema() to build\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '')
    expect(result.warnings.some(w => w.check === 'export-verification' && w.message.includes('createSchema'))).toBe(true)
  })

  it('does not warn on function names that are in extraction', () => {
    const content = `## [CORE]\nUse z() to build\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '')
    expect(result.warnings.filter(w => w.check === 'export-verification')).toHaveLength(0)
  })

  it('auto-fixes hallucinated URLs', () => {
    const content = `## [CORE]\nSee https://fake.example.com/docs\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '# Zod README\nhttps://zod.dev')
    expect(result.autoFixes).toBeGreaterThan(0)
  })

  it('auto-fixes version mismatch in frontmatter', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: owner/zod\nversion: 2.0.0\n\`\`\`\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '')
    expect(result.autoFixes).toBeGreaterThan(0)
  })

  it('warns on CLI flags not in extraction for cli-tool type', () => {
    const cliExtraction: ExtractionResult = {
      repoType: 'cli-tool',
      manifest: { ecosystem: 'node', name: 'my-cli' },
      fileTree: [],
      commands: [{ name: 'build', flags: [{ name: '--output', type: 'string' }], description: 'Build' }],
    }
    const content = `## [CORE]\nUse --verbose for debug output\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, cliExtraction, '')
    expect(result.warnings.some(w => w.check === 'command-verification')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/validator.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement validator**

Create `electron/skill-gen/validator.ts`. Export `validate(content, extraction, readme): { content: string; result: ValidationResult }`.

The function returns both the (possibly auto-fixed) content AND the validation result.

Implementation:
1. **Structure check**: regex for `## \[CORE\]`, `## \[EXTENDED\]`, `## \[DEEP\]`. Missing = error.
2. **URL hallucination**: migrate `stripHallucinatedUrls()` from `electron/skill-gen.ts:198-246` (copy the function, it's self-contained). Apply it, count fixes.
3. **Version check**: if extraction has `manifest.version`, check frontmatter block matches. Auto-fix if not.
4. **Export verification** (only when `extraction.exports` exists): scan content for function/class/type names that look like API references (word boundaries, not inside URLs). Compare against known export names. Names not found in extraction = warning.
5. **Command verification** (only when `extraction.commands` exists): scan for `--flag` patterns. Compare against known flags. Unknown flags = warning.
6. **Import path verification** (only when `manifest.name` exists): scan code blocks for import statements. Check package name matches manifest name.

Return `{ content: fixedContent, result: { passed, errors, warnings, autoFixes } }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/validator.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/validator.ts electron/skill-gen/validator.test.ts
git commit -m "feat(skill-gen): add post-generation validator with structure/export/URL checks"
```

---

### Task 10: Move Legacy Code

**Files:**
- Move: `electron/skill-gen.ts` → `electron/skill-gen/legacy.ts`
- Modify: `electron/main.ts` (update import path)
- Modify: `electron/skill-gen.test.ts` → `electron/skill-gen/legacy.test.ts`

- [ ] **Step 1: Move skill-gen.ts to skill-gen/legacy.ts**

```bash
git mv electron/skill-gen.ts electron/skill-gen/legacy.ts
git mv electron/skill-gen.test.ts electron/skill-gen/legacy.test.ts
```

- [ ] **Step 2: Update imports in main.ts**

In `electron/main.ts`, find all imports from `'./skill-gen'` and change to `'./skill-gen/legacy'`. The imported symbols are: `generateSkillViaLocalCLI`, `generateComponentsSkillViaLocalCLI`, `generateSkill`, `generateComponentsSkill`, `SkillGenInput`, `detectClaudeCode`, `checkAuthStatus`, `loginClaude`, `installClaudeCLI`, `triggerClaudeAuth`, `findClaude`, `findNpm`, `invalidateClaudePathCache`.

- [ ] **Step 3: Add `generateWithRawPrompt` export to legacy.ts**

The pipeline needs to bypass the internal `buildPrompt()` call and supply its own prompt. Add a new function that reuses the CLI spawning logic but accepts a raw prompt string:

```typescript
/**
 * Lower-level generation function that accepts a pre-built prompt string.
 * Used by the new pipeline to supply type-specific prompts while reusing
 * the existing CLI spawn / API fallback logic.
 */
export async function generateWithRawPrompt(
  prompt: string,
  readme: string,
  options?: { model?: string; maxTokens?: number; apiKey?: string }
): Promise<string> {
  const model = options?.model ?? 'claude-haiku-4-5'
  const maxTokens = options?.maxTokens ?? 3072

  const nodePath = await findNode()
  if (!nodePath) {
    // Fall back to API if no Node
    if (!options?.apiKey) throw new Error('No Node.js and no API key')
    const client = new Anthropic({ apiKey: options.apiKey })
    const response = await client.messages.create({
      model, max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    return stripHallucinatedUrls(raw, readme)
  }

  const cliPath = findLocalCli()
  if (!cliPath) throw new Error('Claude Code not found in node_modules.')

  return new Promise((resolve, reject) => {
    const proc = spawn(
      nodePath,
      [cliPath, '--print', '--output-format', 'json', '--max-turns', '3', '--model', model],
      { stdio: ['pipe', 'pipe', 'pipe'], env: buildEnv(true) }
    )

    // ... same stdout/stderr/close handling as generateSkillViaLocalCLI
    // but applies stripHallucinatedUrls(result, readme) at the end

    proc.stdin.write(prompt, 'utf8')
    proc.stdin.end()
  })
}
```

The implementation should be extracted from the existing `generateSkillViaLocalCLI` (lines 694-773). Factor out the spawn + parse logic into this new function, then have `generateSkillViaLocalCLI` call it internally: `return generateWithRawPrompt(buildPrompt(input), input.readme)`.

- [ ] **Step 4: Update imports in legacy.test.ts**

Change the import in the test file from `'./skill-gen'` to `'./legacy'`.

- [ ] **Step 5: Verify tests still pass**

Run: `npx vitest run electron/skill-gen/legacy.test.ts`
Expected: All existing tests PASS (no behavior change)

- [ ] **Step 6: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add electron/skill-gen/ electron/main.ts
git commit -m "refactor(skill-gen): move existing code to skill-gen/legacy.ts, add generateWithRawPrompt"
```

---

### Task 11: Pipeline Orchestrator

**Files:**
- Create: `electron/skill-gen/pipeline.ts`
- Create: `electron/skill-gen/pipeline.test.ts`

This is the main entry point that wires everything together.

- [ ] **Step 1: Write failing tests**

```typescript
// electron/skill-gen/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies
vi.mock('./github-files', () => ({
  fetchFileTree: vi.fn(),
  fetchRepoFiles: vi.fn(),
  fetchManifest: vi.fn(),
}))

vi.mock('./classifier', () => ({
  classify: vi.fn(),
}))

vi.mock('./extractors/index', () => ({
  getExtractor: vi.fn(),
}))

vi.mock('./templates/index', () => ({
  buildPromptFromTemplate: vi.fn(),
}))

vi.mock('./validator', () => ({
  validate: vi.fn(),
}))

vi.mock('./legacy', () => ({
  generateWithRawPrompt: vi.fn(),
}))

import { generate, enhance } from './pipeline'
import { fetchFileTree, fetchRepoFiles, fetchManifest } from './github-files'
import { classify } from './classifier'
import { getExtractor } from './extractors/index'
import { buildPromptFromTemplate } from './templates/index'
import { validate } from './validator'
import { generateWithRawPrompt } from './legacy'

const mockFetchFileTree = vi.mocked(fetchFileTree)
const mockFetchRepoFiles = vi.mocked(fetchRepoFiles)
const mockFetchManifest = vi.mocked(fetchManifest)
const mockClassify = vi.mocked(classify)
const mockGetExtractor = vi.mocked(getExtractor)
const mockBuildPrompt = vi.mocked(buildPromptFromTemplate)
const mockValidate = vi.mocked(validate)
const mockGenerate = vi.mocked(generateWithRawPrompt)

describe('generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFetchFileTree.mockResolvedValue(['src/index.ts', 'package.json'])
    mockFetchManifest.mockResolvedValue({ filename: 'package.json', content: '{"name":"test"}' })
    mockClassify.mockReturnValue({ type: 'library', confidence: 0.8, signals: ['has types field'] })
    mockGetExtractor.mockReturnValue({
      getFilesToFetch: () => ['src/index.ts'],
      extract: () => ({ exports: [{ name: 'foo', kind: 'function' as const, file: 'src/index.ts' }] }),
    })
    mockFetchRepoFiles.mockResolvedValue(new Map([['src/index.ts', 'export function foo() {}']]))
    mockBuildPrompt.mockReturnValue('Generated prompt')
    mockGenerate.mockResolvedValue('## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz')
    mockValidate.mockReturnValue({
      content: '## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz',
      result: { passed: true, errors: [], warnings: [], autoFixes: 0 },
    })
  })

  it('runs the full pipeline: classify → extract → generate → validate', async () => {
    const result = await generate({
      token: 'tok',
      owner: 'owner',
      name: 'repo',
      language: 'TypeScript',
      topics: [],
      readme: 'README content',
      version: '1.0.0',
      defaultBranch: 'main',
    })

    expect(mockFetchFileTree).toHaveBeenCalled()
    expect(mockClassify).toHaveBeenCalled()
    expect(mockGetExtractor).toHaveBeenCalledWith('library')
    expect(mockFetchRepoFiles).toHaveBeenCalled()
    expect(mockBuildPrompt).toHaveBeenCalledWith('library', expect.any(Object), 'README content')
    expect(mockGenerate).toHaveBeenCalledWith('Generated prompt', 'README content', { model: 'claude-haiku-4-5', maxTokens: 3072 })
    expect(mockValidate).toHaveBeenCalled()
    expect(result.content).toContain('## [CORE]')
    expect(result.tier).toBe(1)
  })

  it('falls back to generic when no token', async () => {
    const result = await generate({
      token: null,
      owner: 'owner',
      name: 'repo',
      language: 'TypeScript',
      topics: [],
      readme: 'README',
      version: '1.0.0',
      defaultBranch: 'main',
    })

    // Without token, extraction is skipped
    expect(mockFetchFileTree).not.toHaveBeenCalled()
    expect(result.content).toBeDefined()
  })

  it('retries once on structural validation error', async () => {
    mockValidate
      .mockReturnValueOnce({
        content: '## [CORE]\nfoo',
        result: { passed: false, errors: [{ check: 'structure', message: 'Missing EXTENDED' }], warnings: [], autoFixes: 0 },
      })
      .mockReturnValueOnce({
        content: '## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz',
        result: { passed: true, errors: [], warnings: [], autoFixes: 0 },
      })
    mockGenerate
      .mockResolvedValueOnce('## [CORE]\nfoo')
      .mockResolvedValueOnce('## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz')

    const result = await generate({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: '', version: '1.0.0', defaultBranch: 'main',
    })
    expect(mockGenerate).toHaveBeenCalledTimes(2)
    expect(result.content).toContain('## [EXTENDED]')
  })
})

describe('enhance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchFileTree.mockResolvedValue(['src/index.ts', 'package.json'])
    mockFetchManifest.mockResolvedValue({ filename: 'package.json', content: '{"name":"test"}' })
    mockClassify.mockReturnValue({ type: 'library', confidence: 0.8, signals: [] })
    mockGetExtractor.mockReturnValue({
      getFilesToFetch: () => ['src/index.ts'],
      extract: () => ({ exports: [] }),
    })
    mockFetchRepoFiles.mockResolvedValue(new Map())
    mockBuildPrompt.mockReturnValue('Enhance prompt')
    mockGenerate.mockResolvedValue('## [CORE]\nimproved\n## [EXTENDED]\nbetter\n## [DEEP]\ndeep')
    mockValidate.mockReturnValue({
      content: '## [CORE]\nimproved\n## [EXTENDED]\nbetter\n## [DEEP]\ndeep',
      result: { passed: true, errors: [], warnings: [], autoFixes: 0 },
    })
  })

  it('uses Sonnet model with 4096 token budget', async () => {
    const result = await enhance({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: 'README',
      version: '1.0.0', defaultBranch: 'main', existingSkill: '## [CORE]\nold',
    })
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.any(String), 'README',
      { model: 'claude-sonnet-4-6', maxTokens: 4096 }
    )
    expect(result.tier).toBe(2)
  })

  it('includes existing skill in the prompt', async () => {
    await enhance({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: 'README',
      version: '1.0.0', defaultBranch: 'main', existingSkill: '## [CORE]\nold content',
    })
    // buildPromptFromTemplate is called — the pipeline should build an enhance-specific prompt
    // that includes the existing skill content
    expect(mockBuildPrompt).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement pipeline**

Create `electron/skill-gen/pipeline.ts`. Export:

```typescript
interface GenerateInput {
  token: string | null
  owner: string
  name: string
  language: string
  topics: string[]
  readme: string
  version: string
  defaultBranch: string
  apiKey?: string   // fallback for API-key-based generation
}

interface GenerateResult {
  content: string
  tier: 1 | 2
  repoType: RepoType
  validation: ValidationResult
}

export async function generate(input: GenerateInput): Promise<GenerateResult>
export async function enhance(input: GenerateInput & { existingSkill: string }): Promise<GenerateResult>
```

`generate` implementation:
1. If `token` is null: skip extraction, use `generic` type, build prompt with README-only, generate via legacy path
2. If `token` present:
   a. `fetchFileTree(token, owner, name, defaultBranch)`
   b. `fetchManifest(token, owner, name, fileTree)`
   c. Parse manifest with `parseManifest()`
   d. `classify({ language, topics, fileTree, manifest, readmeHead: readme.slice(0, 2000) })`
   e. `getExtractor(classification.type)`
   f. `filesToFetch = extractor.getFilesToFetch(fileTree, manifest)`
   g. `files = fetchRepoFiles(token, owner, name, filesToFetch)`
   h. `extraction = extractor.extract(files, manifest)` — merge with common fields (repoType, manifest, fileTree)
   i. `prompt = buildPromptFromTemplate(classification.type, extraction, readme)`
   j. `rawContent = await generateWithRawPrompt(prompt, readme, { model: 'claude-haiku-4-5', maxTokens: 3072, apiKey })`
   k. `{ content, result } = validate(rawContent, extraction, readme)`
   l. If validation has errors and this is the first attempt: retry once with a corrective prompt appended
   m. Return `{ content, tier: 1, repoType: classification.type, validation: result }`

`enhance` implementation: same extraction steps, but:
- Uses Sonnet: `generateWithRawPrompt(prompt, readme, { model: 'claude-sonnet-4-6', maxTokens: 4096, apiKey })`
- The prompt includes the existing skill content with instructions to improve it
- Returns `tier: 2`

The `generateWithRawPrompt` function was added to `legacy.ts` in Task 10, Step 3. It reuses the existing CLI spawn logic but accepts a pre-built prompt string, model, and maxTokens.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/pipeline.ts electron/skill-gen/pipeline.test.ts
git commit -m "feat(skill-gen): add pipeline orchestrator wiring classify → extract → generate → validate"
```

---

### Task 12: Wire Pipeline into Main Process

**Files:**
- Modify: `electron/main.ts:982-1127` (skill:generate handler)
- Modify: `electron/db.ts:31-39` (add tier column)
- Modify: `electron/preload.ts:62-104` (add skill.enhance)
- Modify: `electron/env.d.ts:77-94` (add enhance type)

- [ ] **Step 1: Add tier column to db.ts**

In `electron/db.ts`, after the skills table creation, add:

```typescript
try {
  db.exec('ALTER TABLE skills ADD COLUMN tier INTEGER DEFAULT 1')
} catch {
  // Column already exists
}
```

- [ ] **Step 2: Update skill:generate handler in main.ts**

Replace **only the master skill generation block** (around lines 1038-1052) to call `pipeline.generate()` instead of `generateSkillViaLocalCLI()` directly. The handler still manages file I/O, DB writes, and all branching logic. **Critical:** preserve the versioned install path (`ref` parameter) and the component sub-skill generation path.

```typescript
import { generate as pipelineGenerate } from './skill-gen/pipeline'

// Inside skill:generate handler — replace ONLY the master skill generation (lines 1038-1052):
if (target === 'all' || target === 'master') {
  if (ref) {
    // Versioned installs use the legacy path (simpler, ref-specific)
    try {
      content = await generateSkillViaLocalCLI(skillInput)
    } catch (cliError) {
      if (!apiKey) throw cliError
      content = await generateSkill(skillInput, apiKey)
    }
  } else {
    // Default install — use the new pipeline
    const pipelineResult = await pipelineGenerate({
      token,
      owner,
      name,
      language,
      topics,
      readme: readmeContent,
      version,
      defaultBranch: repo.default_branch ?? 'main',
      apiKey: apiKey ?? undefined,
    })
    content = pipelineResult.content
  }
}

// KEEP all existing code after this point unchanged:
// - Component sub-skill generation (lines 1055-1071)
// - ## [SKILLS] section appending (line 1096)
// - File writing and DB inserts
// - sub_skills table writes
// - Versioned install branching (lines 1079-1108)
```

Update the DB insert for non-versioned installs to include tier:

```typescript
db.prepare(`
  INSERT INTO skills (repo_id, filename, content, version, generated_at, active, enabled_components, tier)
  VALUES (?, ?, ?, ?, ?, 1, NULL, ?)
  ON CONFLICT(repo_id) DO UPDATE SET
    filename = excluded.filename, content = excluded.content,
    version = excluded.version, generated_at = excluded.generated_at,
    tier = excluded.tier
`).run(repo.id, `${name}.skill.md`, content, version, generated_at, ref ? 1 : (pipelineResult?.tier ?? 1))
```

The component sub-skill generation, `## [SKILLS]` appending, versioned install path, and all sub_skills table writes remain completely untouched.

- [ ] **Step 3: Add skill:enhance IPC handler**

Add a new handler after the existing `skill:generate` handler:

```typescript
ipcMain.handle('skill:enhance', async (_, owner: string, name: string) => {
  const token = getToken() ?? null
  const apiKey = getApiKey()
  const db = getDb(app.getPath('userData'))

  const repo = db.prepare('SELECT id, language, topics, default_branch FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { id: string; language: string | null; topics: string | null; default_branch: string | null } | undefined
  if (!repo) throw new Error(`Repo ${owner}/${name} not found`)

  const existingSkill = db.prepare('SELECT content FROM skills WHERE repo_id = ?').get(repo.id) as { content: string } | undefined
  if (!existingSkill) throw new Error(`No existing skill for ${owner}/${name}`)

  const readme = await getReadme(token, owner, name) ?? ''
  const releases = await getReleases(token, owner, name)
  const version = releases[0]?.tag_name ?? 'unknown'

  const result = await enhance({
    token,
    owner,
    name,
    language: repo.language ?? '',
    topics: JSON.parse(repo.topics ?? '[]'),
    readme,
    version,
    defaultBranch: repo.default_branch ?? 'main',
    apiKey: apiKey ?? undefined,
    existingSkill: existingSkill.content,
  })

  const dir = path.join(app.getPath('userData'), 'skills', owner)
  await fs.mkdir(dir, { recursive: true })
  const generated_at = new Date().toISOString()

  await fs.writeFile(path.join(dir, `${name}.skill.md`), result.content, 'utf8')
  db.prepare(`
    UPDATE skills SET content = ?, version = ?, generated_at = ?, tier = ?
    WHERE repo_id = ?
  `).run(result.content, version, generated_at, 2, repo.id)

  return { content: result.content, version, generated_at, tier: 2 }
})
```

- [ ] **Step 4: Add preload bridge for enhance**

In `electron/preload.ts`, inside the `skill` namespace (around line 62-104), add:

```typescript
enhance: (owner: string, name: string) => ipcRenderer.invoke('skill:enhance', owner, name),
```

- [ ] **Step 5: Add type definition for enhance**

In `src/env.d.ts`, inside the `skill` namespace (around line 77-94), add:

```typescript
enhance(owner: string, name: string): Promise<{ content: string; version: string; generated_at: string; tier: number }>
```

- [ ] **Step 6: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts electron/db.ts electron/preload.ts src/env.d.ts
git commit -m "feat(skill-gen): wire pipeline into main process, add tier column and enhance handler"
```

---

### Task 13: Enhance Button UI

**Files:**
- Modify: `src/views/RepoDetail.tsx`

- [ ] **Step 1: Read RepoDetail.tsx to find the skill panel section**

Identify where the install button and skill panel are rendered. Look for the skill state management (`UNINSTALLED`/`GENERATING`/`INSTALLED`).

- [ ] **Step 2: Add enhance state and button**

Add to the existing skill state:
- Track `tier` (1 or 2) from the skill data
- Add `ENHANCING` state alongside existing `GENERATING`
- After install completes, if `tier === 1`, show "Enhance" button next to the installed indicator

The Enhance button:
- Label: "Enhance" with a sparkle/upgrade icon
- On click: set state to `ENHANCING`, call `window.api.skill.enhance(owner, name)`
- On success: update skill content, set tier to 2, show "Enhanced" badge
- On error: revert to showing "Enhance" button, show error message
- When tier is already 2: show "Enhanced" (non-interactive)

- [ ] **Step 3: Verify the UI renders correctly**

Run the app and check:
- Install a skill → "Enhance" button appears
- Click Enhance → spinner/progress shown
- After completion → "Enhanced" indicator

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat(skill-gen): add Enhance button for tier 2 Sonnet upgrade"
```

---

### Task 14: Integration Testing & Cleanup

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Fix any failing tests**

If any existing tests broke due to the refactor (especially tests that import from the old `skill-gen.ts` path), update their imports to point to `skill-gen/legacy`.

- [ ] **Step 3: Run the full build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

Start the app, install a skill for a known library (e.g., `zod` or `commander`). Verify:
- Classification is logged in the console (check DevTools)
- Skill content reflects the type-specific template
- Enhance button appears and works

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test: fix imports and verify full integration of skill generation framework"
```
