# Subtype Passthrough to Focus Inference

**Date:** 2026-04-07
**Status:** Draft

## Problem

The skill generation pipeline has its own 7-type classifier (`library`, `cli-tool`, `framework`, etc.) that is completely separate from the UI's rich 89-subtype classification system (`type_bucket`/`type_sub` stored in the `repos` table). The recently added focus inference step calls Haiku to infer what kind of repo this is — but Haiku has to guess from exports and README, even though the UI already classified the repo precisely (e.g., `ai-ml/orm`, `frameworks/web-framework`).

## Solution

Thread the UI's `type_bucket` and `type_sub` from the database through `GenerateInput` → `pipeline.generate/enhance` → `inferFocusInstructions`, so the focus inference prompt includes the known subtype instead of making Haiku infer it.

## Changes

### 1. `GenerateInput` — add optional fields

File: `electron/skill-gen/pipeline.ts`

```typescript
export interface GenerateInput {
  // ... existing fields
  typeBucket?: string   // UI classification bucket, e.g. "frameworks"
  typeSub?: string      // UI classification subtype, e.g. "web-framework"
}
```

Both optional — the pipeline must work without them (e.g., versioned installs, repos not yet classified).

### 2. `skill:generate` handler — query and pass subtypes

File: `electron/main.ts`

Update the DB query at line 1002 to include `type_bucket` and `type_sub`:

```typescript
const repo = db.prepare(
  'SELECT id, language, topics, default_branch, type_bucket, type_sub FROM repos WHERE owner = ? AND name = ?'
).get(owner, name) as {
  id: string; language: string | null; topics: string | null;
  default_branch: string | null; type_bucket: string | null; type_sub: string | null;
} | undefined
```

Update the `pipelineGenerate` call at line 1066 to pass them:

```typescript
const pipelineResult = await pipelineGenerate({
  token, owner, name, language, topics,
  readme: readmeContent, version,
  defaultBranch: repo.default_branch ?? 'main',
  apiKey: apiKey ?? undefined,
  typeBucket: repo.type_bucket ?? undefined,
  typeSub: repo.type_sub ?? undefined,
})
```

### 2b. `skill:enhance` handler — same changes

File: `electron/main.ts`

Update the DB query at line 1162:

```typescript
const repo = db.prepare(
  'SELECT id, language, topics, default_branch, type_bucket, type_sub FROM repos WHERE owner = ? AND name = ?'
).get(owner, name) as {
  id: string; language: string | null; topics: string | null;
  default_branch: string | null; type_bucket: string | null; type_sub: string | null;
} | undefined
```

Update the `pipelineEnhance` call at line 1173:

```typescript
const result = await pipelineEnhance({
  token, owner, name,
  language: repo.language ?? '',
  topics: JSON.parse(repo.topics ?? '[]'),
  readme, version,
  defaultBranch: repo.default_branch ?? 'main',
  apiKey: apiKey ?? undefined,
  existingSkill: existingSkill.content,
  typeBucket: repo.type_bucket ?? undefined,
  typeSub: repo.type_sub ?? undefined,
})
```

Note: The `enhance` function's input type is `GenerateInput & { existingSkill: string }`, so `typeBucket`/`typeSub` are inherited automatically from the `GenerateInput` changes in Section 1.

### 3. Pipeline — forward to focus inference

File: `electron/skill-gen/pipeline.ts`

In `generate`, destructure and forward:

```typescript
const { token, owner, name, language, topics, readme, version, defaultBranch, apiKey, typeBucket, typeSub } = input

// In the inferFocusInstructions call:
focusInstructions = await inferFocusInstructions(
  repoType, extraction, readme.slice(0, 2000), { apiKey, typeBucket, typeSub }
)
```

In `enhance`, same destructure and forward:

```typescript
const { token, owner, name, language, topics, readme, version, defaultBranch, apiKey, existingSkill, typeBucket, typeSub } = input

// In the inferFocusInstructions call:
focusInstructions = await inferFocusInstructions(
  repoType, extraction, readme.slice(0, 2000), { apiKey, typeBucket, typeSub }
)
```

### 4. Focus inference — use subtypes in prompt

File: `electron/skill-gen/focus-inference.ts`

Update the options type:

```typescript
export async function inferFocusInstructions(
  repoType: RepoType,
  extraction: ExtractionResult,
  readmeHead: string,
  options: { apiKey?: string; typeBucket?: string; typeSub?: string },
): Promise<string | null>
```

Update `buildFocusPrompt` to accept and include subtypes, and update its call site in `inferFocusInstructions` to `buildFocusPrompt(repoType, extraction, readmeHead, options.typeBucket, options.typeSub)`:

```typescript
function buildFocusPrompt(
  repoType: RepoType,
  extraction: ExtractionResult,
  readmeHead: string,
  typeBucket?: string,
  typeSub?: string,
): string {
  // ...existing code...
  const categoryLine = typeBucket && typeSub
    ? `\nCategory: ${typeBucket} / ${typeSub}`
    : typeBucket
      ? `\nCategory: ${typeBucket}`
      : ''

  return `You are analyzing a GitHub repository to guide skill file generation.

Repo type: ${repoType}${categoryLine}
Ecosystem: ${ecosystem}
...rest of prompt unchanged...`
}
```

When present, Haiku gets a direct signal like `Category: ai-ml / neural-net` instead of having to infer it.

### 5. Early-return guard update

The current guard skips inference when `repoType === 'generic'` and exports are empty. With subtypes available, we should still attempt inference even for generic repos if we have a subtype — the subtype gives Haiku enough signal:

```typescript
if (
  repoType === 'generic' &&
  (!extraction.exports || extraction.exports.length === 0) &&
  !options.typeSub &&
  !options.typeBucket
) {
  return null
}
```

## Not affected

- **Versioned-install path** — when `ref` is set in `skill:generate`, the handler calls `generateSkillViaLocalCLI`/`generateSkill` instead of the pipeline. The `typeBucket`/`typeSub` will be fetched from the DB but unused in this path. This is harmless.

## No changes to

- Pipeline's 7-type classifier — still drives template/extractor selection
- `buildPromptFromTemplate` — focus instructions are injected the same way
- Templates or extractors — no structural changes
- Database schema — `type_bucket`/`type_sub` columns already exist
- UI — no user-facing changes
- MCP server — no tool changes

## Testing strategy

**Test files:**
- `electron/skill-gen/focus-inference.test.ts` — add tests for subtype in prompt and guard update
- `electron/skill-gen/pipeline.test.ts` — add tests for forwarding subtypes

**Test cases:**
- Unit test `inferFocusInstructions` with `typeBucket`/`typeSub` present — verify they appear in the prompt as `Category: bucket / sub`
- Unit test `inferFocusInstructions` with only `typeBucket` — verify prompt shows `Category: bucket`
- Unit test the early-return guard: generic + no exports + typeSub present should still call Haiku
- Unit test the early-return guard: generic + no exports + typeBucket present should still call Haiku
- Unit test pipeline `generate` passes `typeBucket`/`typeSub` through to `inferFocusInstructions`
- Unit test pipeline `enhance` passes `typeBucket`/`typeSub` through to `inferFocusInstructions`
- Integration: existing tests pass unchanged (all new fields are optional)
