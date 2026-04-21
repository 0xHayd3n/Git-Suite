# Skill Generation Framework — Repo-Type Pipeline

**Date:** 2026-04-07
**Status:** Draft
**Scope:** Repo type classification, source code extraction, type-specific prompt templates, tiered generation, post-generation validation

---

## 1. Overview

The current skill generation pipeline sends a GitHub repo's README (truncated to 12K chars) + basic metadata to Claude Haiku in a single prompt. This produces acceptable skills for repos with excellent READMEs but fails for repos with sparse documentation, CLI tools, frameworks, monorepos, and infrastructure projects.

This design replaces the single-prompt approach with a **repo-type pipeline framework**: classify the repo → extract structured data from source code → generate using a type-specific prompt template → validate the output against extraction data.

### Goals

- Produce high-quality skills for any repo type without manual intervention
- Detect repo type automatically and adapt the generation strategy
- Ground generated content in actual source code, not just README prose
- Catch hallucinations structurally via post-generation validation
- Support tiered generation: fast Haiku install, optional Sonnet enhancement

### Non-Goals

- Crawling external documentation sites (stick to repo-contained data)
- Full AST parsing (regex-based extraction is sufficient)
- User-facing template editing (may come later, not in this scope)

### Relationship to Existing Classification System

The app already has a UI-facing classification system in `src/lib/classifyRepoType.ts` that assigns repos to **display buckets** (`ai-ml`, `learning`, `frontend`, etc.) with sub-types for the Discover view. That system answers "where does this repo appear in the UI?" — it is a browsing taxonomy.

The new skill-gen classifier answers a different question: "what generation strategy produces the best skill file for this repo?" These are orthogonal dimensions. A repo classified as `ai-ml / ai-agent` in the UI might be a `library` or `framework` for skill generation purposes.

The two classifiers are **independent systems with different purposes**:
- The UI classifier (`classifyRepoType`) is NOT an input to the skill-gen classifier
- The skill-gen classifier does NOT write to the `type`/`type_bucket`/`type_sub` columns in the `repos` table
- Both can coexist without conflict — they classify along different axes

---

## 2. Architecture

Six units of work with clear boundaries:

| Unit | Location | Responsibility |
|------|----------|----------------|
| Classifier | `electron/skill-gen/classifier.ts` | Determine repo type from metadata + file tree + manifest |
| Extractors | `electron/skill-gen/extractors/*.ts` | Pull structured data from source files per repo type |
| Templates | `electron/skill-gen/templates/*.ts` | Define prompt structure and section content per repo type |
| Validator | `electron/skill-gen/validator.ts` | Verify generated content against extraction data |
| Pipeline | `electron/skill-gen/pipeline.ts` | Orchestrate: classify → extract → generate → validate |
| Types | `electron/skill-gen/types.ts` | Shared type definitions |

### Pipeline Flow

```
skill:generate(owner, name)
  → fetch file tree via GitHub Trees API
  → fetch manifest file (package.json / Cargo.toml / etc.)
  → classifier.classify(metadata, fileTree, manifest)
  → extractor = extractors[type]
  → filesToFetch = extractor.getFilesToFetch(fileTree, manifest)
  → files = fetchRepoFiles(token, owner, name, filesToFetch)
  → extraction = extractor.extract(files, manifest)
  → prompt = templates[type].buildPrompt(extraction, readme)
  → content = generateViaLocalCLI(prompt)  // or API fallback
  → validated = validator.validate(content, extraction, template)
  → apply auto-fixes, flag unverified content
  → write to disk + DB (tier: 1)

skill:enhance(owner, name)
  → read existing skill from DB
  → re-run full extraction (always fresh — no caching)
  → buildEnhancePrompt(existingSkill, extraction, template)
  → generateViaLocalCLI(prompt, model: 'sonnet')
  → validator.validate(...)
  → overwrite disk + DB (tier: 2)
```

Note: Enhancement always re-runs extraction to pick up any repo changes since the Tier 1 install. There is no extraction caching — the cost is a few GitHub API calls, which is negligible compared to the LLM generation time.

---

## 3. Repo Type Classification

### Input

- `language` — from GitHub metadata (already in `repos` table)
- `topics` — GitHub topics array
- File tree — fetched via GitHub Trees API (shallow, single request)
- Manifest content — `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, etc.
- README first 2K chars — for signal keywords only

### Repo Types

| Type | Key Signals |
|------|------------|
| `library` | Has exports, no `bin` field, topics include "sdk"/"client"/"wrapper"/"library" |
| `cli-tool` | `bin` in package.json, `[[bin]]` in Cargo.toml, `console_scripts` in setup.py, topic "cli" |
| `framework` | Topics include "framework", has plugin/middleware patterns, scaffold/init commands in README |
| `component-library` | Existing `isComponents` detection + topics "components"/"ui"/"design-system" |
| `monorepo` | `packages/` or `crates/` directory, `workspaces` field in manifest, `lerna.json`, `pnpm-workspace.yaml` |
| `infrastructure` | `.tf` files, `Chart.yaml`, `Dockerfile`, topics include "devops"/"terraform"/"kubernetes"/"docker" |
| `generic` | Fallback — does not match any clear type |

### Implementation

Deterministic scored heuristic. Each signal adds weight to a type. Highest score wins.

```typescript
interface ClassificationResult {
  type: RepoType
  confidence: number       // 0–1
  signals: string[]        // human-readable reasons for the classification
}
```

If confidence < 0.4, falls back to `generic`. No LLM needed — this is pure pattern matching.

---

## 4. Source Code Extractors

Each repo type has a dedicated extractor that knows where useful information lives.

### Common Extraction (All Types)

- Manifest metadata: name, version, dependencies, peer deps, engines/requires
- File tree: depth-limited, filtered to relevant extensions
- LICENSE type (SPDX identifier, not full text)

### Type-Specific Extractors

| Type | Extracts | Method |
|------|----------|--------|
| `library` | Exported functions, classes, types with signatures | Parse `.d.ts` files, or entry points (`index.ts`, `mod.rs`, `__init__.py`). Regex-based export matching. |
| `cli-tool` | Subcommands, flags, options with descriptions | Detect CLI framework (`yargs`, `clap`, `cobra`, `click`, `argparse`) and parse its patterns. Also extract from `--help` output in README. |
| `framework` | Middleware/plugin API, config schema, lifecycle hooks, project structure | Scan for plugin registration, config types, decorators, routing patterns |
| `component-library` | Component names, props, variants | Existing `scannedComponents` path, extended for Vue/Svelte/Web Components |
| `monorepo` | Package list with per-package name + description + main export | Read workspace manifest, scan each sub-package's manifest |
| `infrastructure` | Resource types, variables with types/defaults, outputs, module interfaces | Parse `.tf` variable blocks, Helm `values.yaml` schema, Dockerfile stages |
| `generic` | Best-effort: entry point exports + CLI patterns | Combines library + cli-tool extraction, uses whatever matches. If both return empty results, extraction is empty and generation falls through to README-only — no misleading placeholder content is injected. |

### Extractor Interface

Each extractor has two phases: **target selection** (which files to fetch) and **extraction** (parse the fetched files).

```typescript
interface Extractor {
  /** Given the file tree, return paths to fetch from GitHub. Max 15 files. */
  getFilesToFetch(fileTree: string[], manifest: ManifestInfo): string[]

  /** Parse fetched file contents into structured extraction data. */
  extract(files: Map<string, string>, manifest: ManifestInfo): Partial<ExtractionResult>
}
```

The pipeline calls `getFilesToFetch()` after classification, fetches those files via `fetchRepoFiles()`, then passes the results to `extract()`. This cleanly separates "what to fetch" from "how to parse."

### Extraction Result Shape

```typescript
interface ExtractionResult {
  repoType: RepoType
  manifest: ManifestInfo
  fileTree: string[]
  exports?: ExportEntry[]         // { name, kind, signature?, file }
  commands?: CommandEntry[]       // { name, flags: FlagEntry[], description? }
  components?: ComponentEntry[]   // existing shape from scannedComponents
  plugins?: PluginEntry[]         // { name, hookPoint, signature? }
  packages?: PackageEntry[]       // { name, description, mainExport? }
  resources?: ResourceEntry[]     // { type, name, variables? }
  configSchema?: ConfigEntry[]    // { key, type, default?, description? }
}

interface ExportEntry {
  name: string
  kind: 'function' | 'class' | 'type' | 'interface' | 'const' | 'enum'
  signature?: string    // e.g., "(options: CreateOpts) => Promise<Client>"
  file: string          // which file it was found in
}

interface CommandEntry {
  name: string
  description?: string
  flags: FlagEntry[]
}

interface FlagEntry {
  name: string          // e.g., "--output"
  short?: string        // e.g., "-o"
  type: string          // "string" | "boolean" | "number"
  default?: string
  description?: string
}

/**
 * Multi-ecosystem manifest info. All fields optional — parsers fill what they can.
 * Unified shape avoids per-ecosystem discriminated unions; consumers check for
 * the fields they need. A Go module with no version field simply has version=undefined.
 */
interface ManifestInfo {
  ecosystem: 'node' | 'rust' | 'python' | 'go' | 'ruby' | 'java' | 'dotnet' | 'unknown'
  name?: string              // package/crate/module name
  version?: string           // may be absent (Go uses git tags)
  description?: string
  // Node-specific
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  engines?: Record<string, string>
  bin?: Record<string, string> | string
  main?: string
  types?: string
  exports?: Record<string, unknown>
  // Rust-specific
  edition?: string           // e.g., "2021"
  features?: Record<string, string[]>
  // Python-specific
  entryPoints?: Record<string, string>  // console_scripts, gui_scripts
  requiresPython?: string    // e.g., ">=3.8"
  // Go-specific
  modulePath?: string        // e.g., "github.com/owner/repo"
  goVersion?: string         // minimum go version from go.mod
  // Generic
  rawManifest?: string       // original file content for extractors that need it
}

interface PackageEntry {
  name: string
  path: string
  description?: string
  mainExport?: string
}

interface PluginEntry {
  name: string
  hookPoint: string
  signature?: string
}

interface ResourceEntry {
  type: string
  name: string
  variables?: ConfigEntry[]
}

interface ConfigEntry {
  key: string
  type: string
  default?: string
  description?: string
}
```

### GitHub API File Fetching

Extraction requires fetching specific files from the repo. A new utility function:

```typescript
async function fetchRepoFiles(
  token: string | null,
  owner: string,
  name: string,
  paths: string[]
): Promise<Map<string, string>>
```

Wraps the existing `getFileContent()` function from `electron/github.ts` (not a new implementation). Fetches files in parallel (Promise.all) with individual error handling — if one file fails, the rest still return.

File fetch budget: max 15 files per extraction. Rate limit considerations:
- Authenticated users: 5,000 requests/hour — 15 files per generation is negligible
- Unauthenticated: extraction is skipped entirely (Section 11)
- Burst protection: if a user generates 10+ skills rapidly, each generation's file fetches run in parallel but generations themselves are sequential (one at a time via the existing IPC handler). This naturally throttles to ~15 requests per generation cycle.
- 403/429 responses: treated as file-not-found — extractor works with whatever files succeeded. No retry logic for rate limits (the user can re-generate later).

---

## 5. Type-Specific Prompt Templates

Each repo type defines a template that controls the prompt structure. The CORE/EXTENDED/DEEP depth model is preserved (it works well for progressive loading by MCP consumers), but the content within each section adapts.

### Template Interface

```typescript
interface SkillTemplate {
  type: RepoType
  frontmatterFields: string[]
  sections: {
    core: SectionSpec
    extended: SectionSpec
    deep: SectionSpec
  }
  rules: string[]              // type-specific generation rules
}

interface SectionSpec {
  maxLines: number
  instructions: string         // what to include in this section
}
```

### Section Content by Type

**`library`** (closest to today's output):
- CORE: Install, import paths + gotchas, top 3 API patterns with code, critical gotchas
- EXTENDED: Secondary API, config options, integration tips, common errors, "When NOT to use"
- DEEP: Edge cases, performance, migration, internals

**`cli-tool`**:
- CORE frontmatter adds `binary: <name>`. CORE body: install + basic invocation, top 3 subcommands with flags and examples, piping/stdin patterns, output format options
- EXTENDED: Full subcommand reference, global flags, config file format, shell completion setup, "When NOT to use"
- DEEP: Advanced piping/scripting, performance tuning, known quirks, integration with other tools

**`framework`**:
- CORE: Quickstart scaffold command, project structure convention, routing/config basics, "hello world" equivalent
- EXTENDED: Middleware/plugin authoring, DB/ORM patterns, deployment, testing conventions, "When NOT to use"
- DEEP: Internals, custom generators, advanced config, production tuning, scaling patterns

**`component-library`** (existing components path, now formalized):
- CORE: Install, import pattern, theme/provider setup, top 5 most-used components with examples
- EXTENDED: Full component reference (props, variants), theming/customization, accessibility notes, "When NOT to use"
- DEEP: Advanced composition, SSR considerations, bundle size optimization, custom theme creation

**`monorepo`**:
- CORE: Overview + package table (name, purpose, install), shared config, cross-package import patterns
- EXTENDED: Per-package key APIs (abbreviated), workspace commands, versioning strategy, "When NOT to use"
- DEEP: Cross-package dependency management, release workflows, contributing patterns, monorepo tooling config

**`infrastructure`**:
- CORE: Provider/module install, basic resource declaration, required variables with types, "hello world" deployment
- EXTENDED: All resource types, variable reference with defaults, output reference, state management, "When NOT to use"
- DEEP: Advanced patterns (modules, workspaces, remote state), CI/CD integration, drift detection, import existing resources

**`generic`** (fallback — today's prompt, largely unchanged):
- CORE: Install, top 3 usage patterns, gotchas (80 lines)
- EXTENDED: Secondary API, config, integration, errors, "When NOT to use" (120 lines)
- DEEP: Edge cases, performance, migration, internals (200 lines)

### Template Registry

```typescript
const templates: Record<RepoType, SkillTemplate> = {
  library: libraryTemplate,
  'cli-tool': cliToolTemplate,
  framework: frameworkTemplate,
  'component-library': componentLibraryTemplate,
  monorepo: monorepoTemplate,
  infrastructure: infrastructureTemplate,
  generic: genericTemplate,
}
```

### Prompt Assembly

A single `buildPromptFromTemplate()` function replaces today's `buildPrompt()`:

1. Fill frontmatter fields from extraction data
2. Inject section instructions from template
3. Append extracted data (exports, commands, etc.) as structured context — **before** the README
4. Append README (truncated to 12K chars)
5. Append universal rules (no hallucination, AI-reader-optimized, etc.)
6. Append type-specific rules from template

Extracted data goes before README because it's higher-signal and should be prioritized by the model.

---

## 6. Tiered Generation

### Tier 1: Quick Install (Haiku)

- **Trigger:** User clicks "Install" — same UX as today
- **Model:** claude-haiku-4-5
- **Token budget:** 3072 (increased from 2048 — richer type-specific prompts with extraction data need more output room, especially for framework and monorepo types)
- **Expected time:** 3–10 seconds
- **Input:** Classification + extraction + type-specific template + README
- **Output:** A skill file that's better than today's due to richer input and adapted structure

### Tier 2: Enhance (Sonnet)

- **Trigger:** New "Enhance" button on already-installed skills
- **Model:** claude-sonnet-4-6
- **Token budget:** 4096
- **Expected time:** 15–30 seconds
- **Input:** Existing Tier 1 skill + full extraction data + template
- **Prompt strategy:** "Here is an existing skill file and the source-level extraction data. Improve it: fill gaps in API coverage, fix inaccuracies, add depth to code examples. Preserve the section structure."
- **Output:** A refined, more thorough skill file that overwrites the Tier 1 version

### Database Change

Add `tier` column to `skills` table. The existing codebase uses `CREATE TABLE IF NOT EXISTS` at startup (not formal migrations), so this ALTER must be idempotent:

```typescript
// In db.ts, after table creation
try {
  db.exec('ALTER TABLE skills ADD COLUMN tier INTEGER DEFAULT 1')
} catch {
  // Column already exists — safe to ignore
}
```

The `DEFAULT 1` ensures existing installed skills are automatically Tier 1.

### UX Changes

- Install button: unchanged behavior, produces Tier 1
- Skill panel (RepoDetail sidebar): shows "Enhance" button when `tier === 1`
- Enhance button: shows progress spinner, disabled during generation
- After enhancement: button changes to "Enhanced" (non-interactive, like "Installed")
- Skill metadata in the panel shows tier indicator (e.g., subtle badge)

### IPC Handlers

```typescript
// New handler
ipcMain.handle('skill:enhance', async (_, owner: string, name: string) => {
  // reads existing skill, re-runs extraction, generates with Sonnet, validates, overwrites
})
```

Preload bridge and `window.api` type additions follow existing patterns.

---

## 7. Post-Generation Validation

Deterministic validation — no LLM needed. Runs after both Tier 1 and Tier 2 generation.

### Validation Checks

| Check | What it does | Severity |
|-------|-------------|----------|
| Structure compliance | All required section markers exist, frontmatter block present, line counts within limits | `error` |
| Export verification | Function/class/type names in skill are checked against extraction data | `warning` |
| Command verification | Subcommands and flags in skill are checked against extracted CLI definitions | `warning` |
| Import path verification | Import statements in code examples checked against manifest name + known entry points | `warning` |
| URL hallucination | Existing `stripHallucinatedUrls()` — unchanged | `auto-fix` |
| Version consistency | Version in frontmatter matches input version | `auto-fix` |

### Result Shape

```typescript
interface ValidationResult {
  passed: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  autoFixes: number
}

interface ValidationIssue {
  check: string
  message: string
  line?: number
  fix?: string
}
```

### Failure Handling

- **`auto-fix`**: Silently corrected (URL stripping, version fix)
- **`warning`**: Warnings are logged and counted but content is **not stripped**. Aggressive stripping (removing function names from code examples) would produce broken, non-compiling snippets that are worse than potentially-hallucinated but plausible content. Instead, the validation result is stored alongside the skill so that future enhancement (Tier 2) can specifically target unverified claims. The warning count is surfaced in the skill panel as a quality indicator (e.g., "3 unverified references").
- **`error`** (missing sections): One retry with a tighter prompt ("Your output was missing ## [EXTENDED]. Generate all three sections."). If second attempt also fails, return what we have — partial skill is better than no skill.

---

## 8. Migration from Current System

### Incremental Approach

The existing `electron/skill-gen.ts` is not deleted. It moves to `electron/skill-gen/legacy.ts` and continues to work as the `generic` type's generation path. The new pipeline wraps it:

1. `pipeline.ts` calls the classifier
2. If type is `generic` (or classifier confidence is very low), it falls through to the existing `buildPrompt()` + `generateSkillViaLocalCLI()` path
3. For recognized types, it uses the new extractor → template → validator path

This means:
- Zero regression risk — existing behavior is preserved as the fallback
- New types can be added incrementally (ship `library` and `cli-tool` first, add others over time)
- The `generic` template can gradually be improved without touching the new type-specific paths

### Existing Code Reuse

- `stripHallucinatedUrls()` → moves to `validator.ts`, called as part of the validation pipeline
- `buildEnv()`, `findNode()`, `findLocalCli()`, CLI spawning logic → stays in `legacy.ts`, exported for `pipeline.ts` to use
- `generateSkill()` (API key fallback) → stays available as fallback for both tiers
- Component scanning (`scannedComponents`) → migrated into the `component-library` extractor. The existing `isComponents` inline detection in `main.ts` and the `type='components'` DB value in `repos` table are left untouched — they serve the UI display, not skill generation. The new classifier detects `component-library` independently using its own signals.

---

## 9. Files Changed / Created

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `electron/skill-gen/types.ts` | RepoType, ExtractionResult, ValidationResult, all shared interfaces |
| Create | `electron/skill-gen/classifier.ts` | `classify()` function |
| Create | `electron/skill-gen/extractors/index.ts` | Extractor registry, `extractForType()`, common extraction |
| Create | `electron/skill-gen/extractors/library.ts` | Library export extraction |
| Create | `electron/skill-gen/extractors/cli-tool.ts` | CLI command/flag extraction |
| Create | `electron/skill-gen/extractors/framework.ts` | Framework pattern extraction |
| Create | `electron/skill-gen/extractors/component-library.ts` | Migrated component scanning |
| Create | `electron/skill-gen/extractors/monorepo.ts` | Workspace package extraction |
| Create | `electron/skill-gen/extractors/infrastructure.ts` | Terraform/Helm/Docker extraction |
| Create | `electron/skill-gen/templates/index.ts` | Template registry |
| Create | `electron/skill-gen/templates/library.ts` | Library template |
| Create | `electron/skill-gen/templates/cli-tool.ts` | CLI tool template |
| Create | `electron/skill-gen/templates/framework.ts` | Framework template |
| Create | `electron/skill-gen/templates/component-library.ts` | Component library template |
| Create | `electron/skill-gen/templates/monorepo.ts` | Monorepo template |
| Create | `electron/skill-gen/templates/infrastructure.ts` | Infrastructure template |
| Create | `electron/skill-gen/templates/generic.ts` | Generic fallback template |
| Create | `electron/skill-gen/validator.ts` | Validation pipeline |
| Create | `electron/skill-gen/pipeline.ts` | Orchestrator |
| Create | `electron/skill-gen/github-files.ts` | `fetchRepoFiles()` + `fetchFileTree()` utilities |
| Move | `electron/skill-gen.ts` → `electron/skill-gen/legacy.ts` | Existing generation code, preserved as fallback |
| Modify | `electron/main.ts` | `skill:generate` calls `pipeline.generate()`, new `skill:enhance` handler |
| Modify | `electron/db.ts` | Add `tier` column to `skills` table |
| Modify | `electron/preload.ts` | Add `skill.enhance` bridge |
| Modify | `src/env.d.ts` | Add `skill.enhance` type |
| Modify | `src/views/RepoDetail.tsx` | Add "Enhance" button |

---

## 10. Testing Strategy

### Unit Tests

Each new module gets its own test file:

- `classifier.test.ts` — test classification with various manifest/file tree/topic combinations
- `extractors/*.test.ts` — test each extractor with sample file contents (no network)
- `templates/*.test.ts` — test prompt assembly produces expected structure
- `validator.test.ts` — test each validation check with known-good and known-bad skill content
- `pipeline.test.ts` — integration test with mocked extractors and generation

### Extractor Tests

Extractors are pure functions (string in → structured data out), making them trivially testable. Each test file includes real-world samples from popular repos:

- Library: sample `.d.ts` from a real npm package
- CLI: sample `yargs`/`commander` setup
- Framework: sample Express/FastAPI middleware registration
- Infrastructure: sample `.tf` file with variables

### Validation Tests

- Structure compliance: skill missing `## [EXTENDED]` → error
- Export verification: skill mentions `createServer()` but extraction has no such export → warning
- URL hallucination: existing test coverage carries forward

---

## 11. Error Handling

| Error | Behaviour |
|-------|-----------|
| Classification fails | Falls back to `generic` type |
| File tree fetch fails | Proceeds with empty tree; classifier uses only metadata/README signals. Note: the existing `getRepoTree()` throws on truncated trees (repos with 100K+ files — common in monorepos). The pipeline must catch this specifically and proceed with empty tree. |
| File tree truncated | Same as above — treat as empty tree. The classifier can still work from metadata/topics alone. |
| No manifest file found | `ManifestInfo` is populated with `ecosystem: 'unknown'` and all other fields undefined. Extractors that depend on manifest data (e.g., `bin` field for cli-tool) will find nothing but won't crash. Classification still works from file tree + topics. |
| File content fetch fails | Extractor works with whatever files were successfully fetched |
| GitHub 403/429 rate limit | Treated as file-not-found for the affected files. No retry. |
| Extraction finds nothing | Generates with README-only (same as today's behavior) |
| Generation fails (Tier 1) | Same as today: revert to UNINSTALLED, show error |
| Generation fails (Tier 2) | Keep existing Tier 1 skill, show "Enhancement failed — try again" |
| Validation structural error | One retry with corrective prompt; if still fails, return partial skill |
| No GitHub token | Extraction skipped entirely; falls back to README-only generation |
