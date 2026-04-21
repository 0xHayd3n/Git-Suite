import type { GenerateInput } from './pipeline'
import type { ExtractionResult, ManifestInfo } from './types'

// ── Slot formatters ───────────────────────────────────────────────────────────

function metadata(input: GenerateInput, extraction: ExtractionResult): string {
  const parts = [`Repo: ${input.owner}/${input.name}`]
  if (input.language) parts.push(`Language: ${input.language}`)
  parts.push(`Ecosystem: ${extraction.manifest.ecosystem}`)
  const ver = extraction.manifest.version ?? input.version
  if (ver && ver !== 'unknown') parts.push(`Version: ${ver}`)
  if (input.topics?.length) parts.push(`Topics: ${input.topics.join(', ')}`)
  return parts.join('\n')
}

function formatExports(extraction: ExtractionResult): string {
  if (!extraction.exports?.length) return '(not available)'
  return extraction.exports.map(e => {
    const sig = e.signature ? `: ${e.signature}` : ''
    return `- ${e.name} (${e.kind})${sig}`
  }).join('\n')
}

function formatTree(fileTree: string[], limit = 60): string {
  if (!fileTree.length) return '(not available)'
  const lines = fileTree.slice(0, limit)
  const more = fileTree.length > limit ? `\n... and ${fileTree.length - limit} more` : ''
  return lines.join('\n') + more
}

function formatEntryPoints(manifest: ManifestInfo): string {
  const parts: string[] = []
  if (manifest.main) parts.push(`main: ${manifest.main}`)
  if (manifest.types) parts.push(`types: ${manifest.types}`)
  if (manifest.modulePath) parts.push(`module: ${manifest.modulePath}`)
  if (manifest.bin) {
    const b = typeof manifest.bin === 'string' ? manifest.bin : JSON.stringify(manifest.bin)
    parts.push(`bin: ${b}`)
  }
  if (manifest.exports) {
    try {
      const s = JSON.stringify(manifest.exports, null, 2)
      if (s.length < 800) parts.push(`exports:\n${s}`)
    } catch { /* skip */ }
  }
  if (manifest.entryPoints) {
    for (const [k, v] of Object.entries(manifest.entryPoints)) parts.push(`${k}: ${v}`)
  }
  return parts.length ? parts.join('\n') : '(not available)'
}

function formatDependencies(manifest: ManifestInfo): string {
  const deps = { ...manifest.dependencies, ...manifest.peerDependencies }
  if (!Object.keys(deps).length) return '(not available)'
  return Object.entries(deps)
    .slice(0, 30)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

function formatPackageScripts(manifest: ManifestInfo): string {
  if (manifest.ecosystem !== 'node' || !manifest.rawManifest) return '(not available)'
  try {
    const pkg = JSON.parse(manifest.rawManifest) as Record<string, unknown>
    const scripts = pkg.scripts as Record<string, string> | undefined
    if (!scripts || !Object.keys(scripts).length) return '(not available)'
    return Object.entries(scripts).map(([k, v]) => `  "${k}": "${v}"`).join('\n')
  } catch {
    return '(not available)'
  }
}

// ── Library prompt ────────────────────────────────────────────────────────────

export function buildLibraryPrompt(input: GenerateInput, extraction: ExtractionResult): string {
  const exports = formatExports(extraction)
  const deps = formatDependencies(extraction.manifest)
  const readme = input.readme.slice(0, 10000)

  return `You are generating a library skill for a GitHub repository. This file will load into an AI coding assistant's context whenever a developer works with this library. Its only job is to change what the AI does when this library is in play.

PHILOSOPHY

Skills are behavioural, not descriptive. Include only content that changes how the AI writes code with this library. Everything else belongs in the repo, not the skill.

A library skill is two-tier by design. The inline tier (this file) carries high-signal behavioural knowledge: the 20% of the API used 80% of the time, idioms, and pitfalls. The reference tier is the repo itself — the AI fetches from it when it needs specifics. The ## Reference section is the bridge between tiers: pointers, not content.

A good library skill passes this test: a developer who has never seen this library can write correct idiomatic code from just the SKILL.md for the most common tasks, and knows when to look something up.

CONSTRAINTS

- Target 800 to 1500 words total.
- Cover the 20% of the API used 80% of the time. Skip the rest.
- One canonical example per pattern. Do not show variants.
- Terse prose. Do not write filler like "this powerful library" or "enables developers to".
- The skill must stand alone. The reader will not have the repo in front of them.
- Use sentence case in headings. Use code formatting for function, class, and module names.
- If inputs are thin, write shorter output rather than padding. A 400-word skill that is dense beats a 1200-word skill that hedges.

STRUCTURE

Produce exactly this structure:

<!-- generated:start -->

## What it is
One paragraph: what category of tool, what it does, what its core abstraction is.

## Mental model
The key concepts and vocabulary the library imposes. What are the primary nouns and verbs? How does the library want you to think?

## How to use it
The 3 to 7 most common tasks, each as a short idiomatic snippet with one or two sentences of context. The most common tasks only — not exhaustive.

## Idioms
The canonical way versus common wrong ways. What patterns are idiomatic? What mistakes do newcomers make? What is the grain of the library?

## Gotchas
Version quirks, known pitfalls, things people get wrong.

## Reference
Pointers into the repo for when the AI needs specifics: key directories, important files, where to look for what. This is the bridge to the repo as reference tier — not content, just where to look.

<!-- generated:end -->

<!-- user:start -->

## Notes
(Leave this section empty. The user will fill it with project-specific usage patterns, wrappers, or conventions.)

<!-- user:end -->

DO NOT INCLUDE

- Full API reference tables.
- Installation instructions beyond a one-line install command.
- Changelog or release note content as its own section.
- Contributor guidelines.
- Marketing language or comparisons to competitors unless philosophically central.
- Commentary about what you are doing. Output only the skill file.

INPUTS

Repo metadata:
${metadata(input, extraction)}

README:
${readme}

Package exports and entry points:
${exports}

Key dependencies:
${deps}

Examples: (not available — infer from README)

Source excerpts: (not available — infer from README and exports)`
}

// ── Domain prompt ─────────────────────────────────────────────────────────────

export function buildDomainPrompt(input: GenerateInput, extraction: ExtractionResult): string {
  const related = input.topics?.length
    ? `Topics: ${input.topics.join(', ')}`
    : '(not available)'
  const readme = input.readme.slice(0, 12000)

  return `You are generating a domain skill for a GitHub repository. The user has found this repo in the Discover section of Git Suite and wants to understand it well enough to have a conversation about it. The skill is ephemeral — active for this exploration session.

PHILOSOPHY

This is an exploration surface, not a comprehensiveness ladder. Do not structure as "core, extended, deep" with progressively more detail. Structure around the questions a curious user would ask about this repo. The skill makes the AI conversant about the repo, not expert in its API.

The repo itself is the reference tier — one click away in Git Suite. Point to it rather than extract from it. API tables, config fields, and exhaustive command lists do not belong here. They belong in the repo.

CONSTRAINTS

- Target 1500 words maximum. Dense with conceptual content, light on API surface.
- Sections are oriented around questions a curious user would ask, not subject catalogues. Follow the structure given below rather than inventing headers — it already achieves this.
- No API tables. No configuration reference. No exhaustive command lists.
- Sentence case in headings. Code formatting only for genuinely introduced terms.
- If inputs are thin, prefer a shorter, denser skill over a padded one. Omit sections that would be speculative.

STRUCTURE

Produce exactly this structure:

<!-- generated:start -->

## What it is
One paragraph. What category of thing is this, what does it do, what is its core abstraction?

## Vocabulary
The terms this repo introduces. For each, a one-sentence gloss. These are the words the user will use when talking about the repo.

## What makes it distinctive
The stance, the opinion, the unique idea. What does this repo believe that others do not? What is it doing differently from adjacent tools? Two to four points.

## Where it sits
Adjacent tools and concepts. What category of problem does this belong to? What is it like, and what is it notably unlike?

## Questions it lets you ask
Three to six interesting questions a user could explore with this repo as a jumping-off point. Each is a conceptual entry point into deeper conversation, not a FAQ item.

## Look deeper
Pointers into the repo for when the conversation goes specific. File paths, README section names, key source directories. Not content — just where to look.

<!-- generated:end -->

<!-- user:start -->

## Notes
(Leave this section empty. If you want to capture why this repo is interesting to you — a use case, a thread to pull on, a question it raised — write it here.)

<!-- user:end -->

DO NOT INCLUDE

- API reference, function signatures, configuration fields.
- Exhaustive feature lists.
- Installation instructions beyond a one-line command if genuinely relevant to the concept.
- Marketing language, pricing, team pages.
- Tutorials or how-tos.
- Commentary about what you are doing. Output only the skill file.

INPUTS

Repo metadata:
${metadata(input, extraction)}

README:
${readme}

Related repos and topics:
${related}

Key conceptual sections of docs: (not available — infer from README)`
}

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(input: GenerateInput, extraction: ExtractionResult): string {
  const tree = formatTree(extraction.fileTree)
  const entryPoints = formatEntryPoints(extraction.manifest)
  const readme = input.readme.slice(0, 8000)
  const configFiles = extraction.manifest.rawManifest
    ? `package manifest:\n${extraction.manifest.rawManifest.slice(0, 2000)}`
    : '(not available)'

  return `You are generating the System skill for a software project. This file describes how the project runs — its architecture, data flow, and structural shape. It pairs with a Practice skill that covers how work happens in the project. Both are always active when the AI is operating in the project directory.

PHILOSOPHY

Describe the system as it is, with enough clarity that the AI can reason about where new code should live and why existing code is structured the way it is. This is not a complete code tour. It is the load-bearing structural knowledge.

CONSTRAINTS

- Target 500 to 1200 words in the generated layer.
- Focus on architecture and boundaries, not implementation detail.
- Anchor claims to file paths. Name actual modules and directories.
- Where the codebase is inconsistent, note the canonical pattern and flag exceptions.
- Sentence case in headings. Code formatting for file paths, directory names, function names, type names.

STRUCTURE

Produce exactly this structure:

<!-- generated:start -->

## Stack
Languages, frameworks, runtimes, key dependencies. One to three lines.

## Architecture
The shape of the system. How is it organised at the top level? What are the main components and how do they relate? A paragraph or two, plus an ASCII diagram if the structure is non-obvious.

## Module map
Directory to responsibility mapping. Which folders hold what. Where business logic lives versus glue code. Use a compact list format.

## Data flow
How data moves through the system. Entry points, where state lives, key transformations. For apps, cover the request or event lifecycle. For libraries or CLIs, cover the input-to-output path.

## Key types and interfaces
The handful of types, schemas, or interfaces that the rest of the system is organised around. Not an exhaustive type index — the load-bearing abstractions.

## Deployment
How the project runs. Local dev setup in one or two sentences. Production deployment model. Build pipeline if relevant.

## Load-bearing files
Files that are disproportionately important — config files, root routers, core type definitions, entry points. Three to ten paths with one-line explanations.

<!-- generated:end -->

<!-- user:start -->

## Notes
(Leave this section empty. The user will fill it with local architectural knowledge the pipeline cannot infer — historical decisions, known trouble spots, planned migrations.)

<!-- user:end -->

DO NOT INCLUDE

- Conventions, code style, testing practices, PR norms. These belong in the Practice skill.
- Function-level documentation.
- Installation instructions or contributor setup detail.
- Marketing language.
- Commentary about what you are doing. Output only the skill file.

INPUTS

Repo metadata:
${metadata(input, extraction)}

README:
${readme}

Directory structure:
${tree}

Config files:
${configFiles}

Entry points:
${entryPoints}

Source excerpts: (not available — infer from file tree and README)`
}

// ── Practice prompt ───────────────────────────────────────────────────────────

export function buildPracticePrompt(input: GenerateInput, extraction: ExtractionResult): string {
  const scripts = formatPackageScripts(extraction.manifest)
  const readme = input.readme.slice(0, 8000)

  return `You are generating the Practice skill for a software project. This file describes how work happens in the project — conventions, tooling, testing, team norms. It pairs with a System skill that covers the project's architecture. Both are always active when the AI operates in the project directory.

PHILOSOPHY

Capture the procedural knowledge a new contributor would need to contribute competently. Much of this is only partially observable in the code — a pattern that holds 90% of the time is effectively a rule. State it as a rule.

The user layer is where aspirational and tribal knowledge lives. The generated layer is what you can observe. Leave the user layer empty with clear affordances for the user to fill.

CONSTRAINTS

- Target 400 to 1000 words in the generated layer.
- Name specific tools, commands, and conventions.
- Where multiple patterns exist in the codebase, flag the canonical one and note the exception.
- Use "we" voice. This is how this team works.
- Sentence case in headings. Code formatting for commands, tool names, filenames.

STRUCTURE

Produce exactly this structure:

<!-- generated:start -->

## Tooling
Linter, formatter, test runner, build tool, package manager. Include the actual commands used to invoke each.

## Conventions
Naming patterns, file organisation, import patterns, language idioms specific to this project. Where the code is inconsistent, name the canonical pattern.

## Testing
Which testing library is used, where tests live, what patterns tests follow, what tends to get tested versus what does not.

## Workflows
How to add a feature, how to run locally, how to debug, the handful of commands contributors run most often.

## Quality gates
What CI checks, what is required before merge, any pre-commit or pre-push hooks.

<!-- generated:end -->

<!-- user:start -->

## Aspirational rules
(Leave this section empty. The user will fill it with rules like "we're moving off X, don't write new X code" that cannot be inferred from observing the code.)

## Tribal knowledge
(Leave this section empty. The user will fill it with things like "don't touch /legacy/billing without asking Dave" or "the Sentry integration is flaky on Tuesdays".)

<!-- user:end -->

DO NOT INCLUDE

- Architecture, data flow, or module responsibilities. These belong in the System skill.
- Exhaustive command reference. Link to package.json scripts or equivalent.
- Marketing language.
- Commentary about what you are doing. Output only the skill file.

INPUTS

Repo metadata:
${metadata(input, extraction)}

README and CONTRIBUTING files:
${readme}

Package scripts:
${scripts}

Test files: (not available — infer from README and file tree)

Linter and formatter config: (not available — infer from README and dependencies)

Recent PR discussions: (not available)`
}
