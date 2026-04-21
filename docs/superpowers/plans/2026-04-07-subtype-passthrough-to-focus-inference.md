# Subtype Passthrough to Focus Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread the UI's `type_bucket`/`type_sub` classification from the database through the skill generation pipeline into focus inference, so Haiku gets direct subtype info instead of guessing.

**Architecture:** Add optional `typeBucket`/`typeSub` fields to `GenerateInput`, query them from the `repos` table in both IPC handlers, forward them through the pipeline to `inferFocusInstructions`, and inject them into the focus prompt as a `Category:` line. Update the early-return guard to attempt inference when subtypes are present even for generic repos with no exports.

**Tech Stack:** TypeScript, Vitest, SQLite (better-sqlite3)

**Spec:** `docs/superpowers/specs/2026-04-07-subtype-passthrough-to-focus-inference-design.md`

---

### Task 1: Update `focus-inference.ts` to accept and use subtypes

**Files:**
- Modify: `electron/skill-gen/focus-inference.ts`
- Modify: `electron/skill-gen/focus-inference.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `electron/skill-gen/focus-inference.test.ts`, after the existing `describe` block's last test (after line 79):

```typescript
it('includes Category line when typeBucket and typeSub are provided', async () => {
  mockGenerate.mockResolvedValue('- bullet point')
  await inferFocusInstructions('library', libraryExtraction, 'readme', {
    apiKey: 'test-key',
    typeBucket: 'ai-ml',
    typeSub: 'orm',
  })
  const prompt = mockGenerate.mock.calls[0][0]
  expect(prompt).toContain('Category: ai-ml / orm')
})

it('includes Category line with only typeBucket when typeSub is absent', async () => {
  mockGenerate.mockResolvedValue('- bullet point')
  await inferFocusInstructions('library', libraryExtraction, 'readme', {
    apiKey: 'test-key',
    typeBucket: 'frameworks',
  })
  const prompt = mockGenerate.mock.calls[0][0]
  expect(prompt).toContain('Category: frameworks')
  expect(prompt).not.toContain('Category: frameworks /')
})

it('omits Category line when neither typeBucket nor typeSub provided', async () => {
  mockGenerate.mockResolvedValue('- bullet point')
  await inferFocusInstructions('library', libraryExtraction, 'readme', {
    apiKey: 'test-key',
  })
  const prompt = mockGenerate.mock.calls[0][0]
  expect(prompt).not.toContain('Category:')
})

it('omits Category line when only typeSub is provided without typeBucket', async () => {
  mockGenerate.mockResolvedValue('- bullet point')
  await inferFocusInstructions('library', libraryExtraction, 'readme', {
    apiKey: 'test-key',
    typeSub: 'orm',
  })
  const prompt = mockGenerate.mock.calls[0][0]
  expect(prompt).not.toContain('Category:')
})

it('attempts inference for generic repo with no exports when typeSub is present', async () => {
  mockGenerate.mockResolvedValue('- bullet point')
  const result = await inferFocusInstructions('generic', genericNoExports, 'readme', {
    apiKey: 'test-key',
    typeSub: 'docker-compose',
  })
  expect(result).toBe('- bullet point')
  expect(mockGenerate).toHaveBeenCalled()
})

it('attempts inference for generic repo with no exports when typeBucket is present', async () => {
  mockGenerate.mockResolvedValue('- bullet point')
  const result = await inferFocusInstructions('generic', genericNoExports, 'readme', {
    apiKey: 'test-key',
    typeBucket: 'infrastructure',
  })
  expect(result).toBe('- bullet point')
  expect(mockGenerate).toHaveBeenCalled()
})

it('still returns null for generic repo with no exports and no subtypes', async () => {
  const result = await inferFocusInstructions('generic', genericNoExports, 'readme', {
    apiKey: 'test-key',
  })
  expect(result).toBeNull()
  expect(mockGenerate).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/focus-inference.test.ts`
Expected: FAIL — `inferFocusInstructions` options type doesn't accept `typeBucket`/`typeSub`, no `Category:` line in prompt, guard still blocks generic+no-exports+subtype

- [ ] **Step 3: Update `inferFocusInstructions` and `buildFocusPrompt`**

In `electron/skill-gen/focus-inference.ts`:

Update `buildFocusPrompt` signature to accept subtypes (line 6):

```typescript
function buildFocusPrompt(
  repoType: RepoType,
  extraction: ExtractionResult,
  readmeHead: string,
  typeBucket?: string,
  typeSub?: string,
): string {
  const ecosystem = extraction.manifest.ecosystem
  const exports = (extraction.exports ?? [])
    .slice(0, 20)
    .map(e => `${e.name} (${e.kind})`)
    .join(', ')

  const categoryLine = typeBucket && typeSub
    ? `\nCategory: ${typeBucket} / ${typeSub}`
    : typeBucket
      ? `\nCategory: ${typeBucket}`
      : ''

  return `You are analyzing a GitHub repository to guide skill file generation.

Repo type: ${repoType}${categoryLine}
Ecosystem: ${ecosystem}
Exports: ${exports || 'none extracted'}
README (first 2000 chars): ${readmeHead}

Based on this data, produce 3-5 bullet points describing what the skill file should emphasize for this SPECIFIC repo. Focus on:
- What kind of ${repoType} this actually is (e.g., "React hooks library for form validation")
- Which APIs or patterns matter most for someone using this in code
- Any domain-specific concepts the skill should explain
- What makes this different from a generic ${repoType}

Be concise. Each bullet should be one sentence. Output only the bullet points, nothing else.`
}
```

Update `inferFocusInstructions` options type (line 33) and early-return guard (line 40), and update the `buildFocusPrompt` call (line 46):

```typescript
export async function inferFocusInstructions(
  repoType: RepoType,
  extraction: ExtractionResult,
  readmeHead: string,
  options: { apiKey?: string; typeBucket?: string; typeSub?: string },
): Promise<string | null> {
  // Skip when there's no useful signal
  if (
    repoType === 'generic' &&
    (!extraction.exports || extraction.exports.length === 0) &&
    !options.typeSub &&
    !options.typeBucket
  ) {
    return null
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const prompt = buildFocusPrompt(repoType, extraction, readmeHead, options.typeBucket, options.typeSub)
    const result = await Promise.race([
      generateWithRawPrompt(prompt, '', {
        model: 'claude-haiku-4-5',
        maxTokens: 200,
        apiKey: options.apiKey,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Focus inference timed out')), TIMEOUT_MS)
      }),
    ])
    return result.trim() || null
  } catch {
    return null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/focus-inference.test.ts`
Expected: All 12 tests PASS (5 existing + 7 new)

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/focus-inference.ts electron/skill-gen/focus-inference.test.ts
git commit -m "feat(skill-gen): accept typeBucket/typeSub in focus inference"
```

---

### Task 2: Update `GenerateInput` and pipeline forwarding

**Files:**
- Modify: `electron/skill-gen/pipeline.ts:11-21,31,81-89,128,159-167`
- Modify: `electron/skill-gen/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `electron/skill-gen/pipeline.test.ts`.

In the `generate` describe block, after the existing focus inference tests (after line 180):

```typescript
it('forwards typeBucket and typeSub to inferFocusInstructions', async () => {
  await generate({
    token: 'tok', owner: 'owner', name: 'repo',
    language: 'TypeScript', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main',
    typeBucket: 'ai-ml', typeSub: 'orm',
  })

  expect(mockInferFocus).toHaveBeenCalledWith(
    'library',
    expect.anything(),
    expect.any(String),
    expect.objectContaining({ typeBucket: 'ai-ml', typeSub: 'orm' })
  )
})

it('works without typeBucket/typeSub (backward compatible)', async () => {
  await generate({
    token: 'tok', owner: 'owner', name: 'repo',
    language: 'TypeScript', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main',
  })

  expect(mockInferFocus).toHaveBeenCalledWith(
    'library',
    expect.anything(),
    expect.any(String),
    expect.objectContaining({})
  )
})
```

In the `enhance` describe block, after the test titled `'passes focus instructions to buildPromptFromTemplate in enhance'`:

```typescript
it('forwards typeBucket and typeSub to inferFocusInstructions in enhance', async () => {
  await enhance({
    token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main', existingSkill: '## [CORE]\nold',
    typeBucket: 'frameworks', typeSub: 'web-framework',
  })

  expect(mockInferFocus).toHaveBeenCalledWith(
    'library',
    expect.anything(),
    expect.any(String),
    expect.objectContaining({ typeBucket: 'frameworks', typeSub: 'web-framework' })
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: FAIL — `GenerateInput` doesn't accept `typeBucket`/`typeSub`, pipeline doesn't forward them

- [ ] **Step 3: Update `GenerateInput` and pipeline functions**

In `electron/skill-gen/pipeline.ts`:

Add fields to `GenerateInput` (after line 20, before closing `}`):

```typescript
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
```

Update destructure in `generate` (line 31):

```typescript
const { token, owner, name, language, topics, readme, version, defaultBranch, apiKey, typeBucket, typeSub } = input
```

Update `inferFocusInstructions` call in `generate` (line 84):

```typescript
focusInstructions = await inferFocusInstructions(
  repoType, extraction, readme.slice(0, 2000), { apiKey, typeBucket, typeSub }
)
```

Update destructure in `enhance` (line 128):

```typescript
const { token, owner, name, language, topics, readme, version, defaultBranch, apiKey, existingSkill, typeBucket, typeSub } = input
```

Update `inferFocusInstructions` call in `enhance` (line 162):

```typescript
focusInstructions = await inferFocusInstructions(
  repoType, extraction, readme.slice(0, 2000), { apiKey, typeBucket, typeSub }
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: All tests PASS (existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/pipeline.ts electron/skill-gen/pipeline.test.ts
git commit -m "feat(skill-gen): add typeBucket/typeSub to GenerateInput and forward to focus inference"
```

---

### Task 3: Update IPC handlers in `main.ts` to query and pass subtypes

**Files:**
- Modify: `electron/main.ts:1002-1003,1066-1076,1162-1163,1173-1184`

No new tests needed — IPC handler changes are pure wiring exercised through the pipeline tests that already cover subtype forwarding.

- [ ] **Step 1: Update the `skill:generate` handler**

In `electron/main.ts`, update the DB query at line 1002:

```typescript
const repo = db.prepare('SELECT id, language, topics, default_branch, type_bucket, type_sub FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
  { id: string; language: string | null; topics: string | null; default_branch: string | null; type_bucket: string | null; type_sub: string | null } | undefined
```

Update the `pipelineGenerate` call at line 1066:

```typescript
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
  typeBucket: repo.type_bucket ?? undefined,
  typeSub: repo.type_sub ?? undefined,
})
```

- [ ] **Step 2: Update the `skill:enhance` handler**

In `electron/main.ts`, update the DB query at line 1162:

```typescript
const repo = db.prepare('SELECT id, language, topics, default_branch, type_bucket, type_sub FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
  { id: string; language: string | null; topics: string | null; default_branch: string | null; type_bucket: string | null; type_sub: string | null } | undefined
```

Update the `pipelineEnhance` call at line 1173:

```typescript
const result = await pipelineEnhance({
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
  typeBucket: repo.type_bucket ?? undefined,
  typeSub: repo.type_sub ?? undefined,
})
```

- [ ] **Step 3: Run full skill-gen test suite**

Run: `npx vitest run electron/skill-gen/`
Expected: All tests PASS across all files — the main.ts changes are wiring-only and don't break any unit tests.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(skill-gen): query type_bucket/type_sub from DB and pass to pipeline"
```
