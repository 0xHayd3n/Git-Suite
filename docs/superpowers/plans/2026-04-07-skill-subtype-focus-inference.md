# Skill Subtype Focus Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an LLM-inferred focus brief step to the skill generation pipeline so that skill files are tailored to each repo's specific subtype, not just its broad category.

**Architecture:** A new `focus-inference.ts` module calls Haiku with extraction data + README to produce 3-5 bullet points of repo-specific guidance. These are injected into the main generation prompt via `buildPromptFromTemplate`. The pipeline falls back gracefully if inference fails.

**Tech Stack:** TypeScript, Vitest, Anthropic SDK (via existing `generateWithRawPrompt`)

**Spec:** `docs/superpowers/specs/2026-04-07-skill-subtype-focus-inference-design.md`

---

### Task 1: Create `focus-inference.ts` with tests

**Files:**
- Create: `electron/skill-gen/focus-inference.ts`
- Create: `electron/skill-gen/focus-inference.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// electron/skill-gen/focus-inference.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./legacy', () => ({
  generateWithRawPrompt: vi.fn(),
}))

import { inferFocusInstructions } from './focus-inference'
import { generateWithRawPrompt } from './legacy'
import type { ExtractionResult } from './types'

const mockGenerate = vi.mocked(generateWithRawPrompt)

const libraryExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'zod' },
  fileTree: ['src/index.ts'],
  exports: [
    { name: 'z', kind: 'function', file: 'src/index.ts' },
    { name: 'ZodString', kind: 'class', file: 'src/index.ts' },
    { name: 'ZodNumber', kind: 'class', file: 'src/index.ts' },
  ],
}

const genericNoExports: ExtractionResult = {
  repoType: 'generic',
  manifest: { ecosystem: 'unknown' },
  fileTree: [],
}

describe('inferFocusInstructions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns bullet points from Haiku for a library with exports', async () => {
    mockGenerate.mockResolvedValue('- Schema validation library\n- Focus on z.object() and z.string()\n- Show parse vs safeParse patterns')
    const result = await inferFocusInstructions('library', libraryExtraction, 'Zod is a TypeScript-first schema validation library', { apiKey: 'test-key' })
    expect(result).toContain('Schema validation')
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.stringContaining('Repo type: library'),
      '',
      expect.objectContaining({ model: 'claude-haiku-4-5', maxTokens: 200 })
    )
  })

  it('returns null for generic type with no exports', async () => {
    const result = await inferFocusInstructions('generic', genericNoExports, 'Some readme', { apiKey: 'test-key' })
    expect(result).toBeNull()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('returns null when generateWithRawPrompt throws', async () => {
    mockGenerate.mockRejectedValue(new Error('API error'))
    const result = await inferFocusInstructions('library', libraryExtraction, 'readme', { apiKey: 'test-key' })
    expect(result).toBeNull()
  })

  it('includes export names in the prompt', async () => {
    mockGenerate.mockResolvedValue('- bullet point')
    await inferFocusInstructions('library', libraryExtraction, 'readme', { apiKey: 'test-key' })
    const prompt = mockGenerate.mock.calls[0][0]
    expect(prompt).toContain('z (function)')
    expect(prompt).toContain('ZodString (class)')
  })

  it('caps exports at 20 in the prompt', async () => {
    const manyExports: ExtractionResult = {
      ...libraryExtraction,
      exports: Array.from({ length: 30 }, (_, i) => ({
        name: `fn${i}`, kind: 'function' as const, file: 'src/index.ts',
      })),
    }
    mockGenerate.mockResolvedValue('- bullet point')
    await inferFocusInstructions('library', manyExports, 'readme', { apiKey: 'test-key' })
    const prompt = mockGenerate.mock.calls[0][0]
    expect(prompt).toContain('fn0')
    expect(prompt).toContain('fn19')
    expect(prompt).not.toContain('fn20')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/focus-inference.test.ts`
Expected: FAIL — `focus-inference.ts` does not exist

- [ ] **Step 3: Write minimal implementation**

```typescript
// electron/skill-gen/focus-inference.ts
import type { RepoType, ExtractionResult } from './types'
import { generateWithRawPrompt } from './legacy'

const TIMEOUT_MS = 10_000

function buildFocusPrompt(
  repoType: RepoType,
  extraction: ExtractionResult,
  readmeHead: string,
): string {
  const ecosystem = extraction.manifest.ecosystem
  const exports = (extraction.exports ?? [])
    .slice(0, 20)
    .map(e => `${e.name} (${e.kind})`)
    .join(', ')

  return `You are analyzing a GitHub repository to guide skill file generation.

Repo type: ${repoType}
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

export async function inferFocusInstructions(
  repoType: RepoType,
  extraction: ExtractionResult,
  readmeHead: string,
  options: { apiKey?: string },
): Promise<string | null> {
  // Skip when there's no useful signal
  if (repoType === 'generic' && (!extraction.exports || extraction.exports.length === 0)) {
    return null
  }

  try {
    const prompt = buildFocusPrompt(repoType, extraction, readmeHead)
    const result = await Promise.race([
      generateWithRawPrompt(prompt, '', {
        model: 'claude-haiku-4-5',
        maxTokens: 200,
        apiKey: options.apiKey,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Focus inference timed out')), TIMEOUT_MS)
      ),
    ])
    return result.trim() || null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/focus-inference.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/focus-inference.ts electron/skill-gen/focus-inference.test.ts
git commit -m "feat(skill-gen): add focus-inference module for subtype-aware prompting"
```

---

### Task 2: Update `buildPromptFromTemplate` to accept and inject focus instructions

**Files:**
- Modify: `electron/skill-gen/templates/index.ts:99-166` (add parameter, inject block)
- Modify: `electron/skill-gen/templates/templates.test.ts` (add test cases)

- [ ] **Step 1: Write the failing tests**

Add to `electron/skill-gen/templates/templates.test.ts`:

```typescript
it('injects focus instructions when provided', () => {
  const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod', '- Schema validation library\n- Emphasize parse patterns')
  expect(prompt).toContain('--- REPO-SPECIFIC FOCUS ---')
  expect(prompt).toContain('Schema validation library')
  expect(prompt).toContain('Emphasize parse patterns')
  expect(prompt).toContain('--- END FOCUS ---')
})

it('omits focus section when focusInstructions is null', () => {
  const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod', null)
  expect(prompt).not.toContain('REPO-SPECIFIC FOCUS')
})

it('omits focus section when focusInstructions is undefined', () => {
  const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod')
  expect(prompt).not.toContain('REPO-SPECIFIC FOCUS')
})

it('places focus instructions after extracted data and before section markers', () => {
  const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod', '- Focus bullet')
  const extractedEnd = prompt.indexOf('--- END EXTRACTED DATA ---')
  const focusStart = prompt.indexOf('--- REPO-SPECIFIC FOCUS ---')
  const coreStart = prompt.indexOf('## [CORE]')
  expect(extractedEnd).toBeLessThan(focusStart)
  expect(focusStart).toBeLessThan(coreStart)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/templates/templates.test.ts`
Expected: FAIL — `buildPromptFromTemplate` does not accept 5th parameter / no focus injection

- [ ] **Step 3: Update `buildPromptFromTemplate`**

In `electron/skill-gen/templates/index.ts`, update the function signature and add the injection block:

Add `focusInstructions?: string | null` as the 5th parameter to `buildPromptFromTemplate`.

After the `--- END EXTRACTED DATA ---` line in the returned template string (after `README:\n${readmeTruncated}`) and before the `## [CORE]` section instructions, inject:

```typescript
const focusSection = focusInstructions
  ? `\n--- REPO-SPECIFIC FOCUS ---\n${focusInstructions}\n--- END FOCUS ---\n\nUse the above to tailor your output. Emphasize the patterns and concepts described above over generic content.\n`
  : ''
```

Insert `${focusSection}` in the template string between the README block and `Produce a skill.md file`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/templates/templates.test.ts`
Expected: All tests PASS (existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen/templates/index.ts electron/skill-gen/templates/templates.test.ts
git commit -m "feat(skill-gen): inject focus instructions into generation prompt"
```

---

### Task 3: Wire focus inference into the pipeline

**Files:**
- Modify: `electron/skill-gen/pipeline.ts:1-179` (add import, insert Step 4.5 in both `generate` and `enhance`)
- Modify: `electron/skill-gen/pipeline.test.ts` (add mock, update assertions, add new test cases)

- [ ] **Step 1: Write the failing tests**

Add to `electron/skill-gen/pipeline.test.ts`:

At the top, add the mock:

```typescript
vi.mock('./focus-inference', () => ({
  inferFocusInstructions: vi.fn(),
}))
```

Add import:

```typescript
import { inferFocusInstructions } from './focus-inference'
const mockInferFocus = vi.mocked(inferFocusInstructions)
```

In the `generate` `beforeEach`, add:

```typescript
mockInferFocus.mockResolvedValue('- Test focus bullet')
```

In the `enhance` `beforeEach`, add:

```typescript
mockInferFocus.mockResolvedValue(null)
```

This ensures existing `enhance` tests remain stable since `buildPromptFromTemplate` will now receive 5 arguments.

Add new tests in the `generate` describe:

```typescript
it('calls inferFocusInstructions and passes result to buildPromptFromTemplate', async () => {
  mockInferFocus.mockResolvedValue('- React hooks library\n- Emphasize useEffect patterns')

  await generate({
    token: 'tok', owner: 'owner', name: 'repo',
    language: 'TypeScript', topics: [], readme: 'README content',
    version: '1.0.0', defaultBranch: 'main',
  })

  expect(mockInferFocus).toHaveBeenCalledWith(
    'library',
    expect.objectContaining({ repoType: 'library' }),
    expect.any(String),
    expect.objectContaining({})
  )
  expect(mockBuildPrompt).toHaveBeenCalledWith(
    'library',
    expect.anything(),
    'README content',
    'owner/repo',
    '- React hooks library\n- Emphasize useEffect patterns'
  )
})

it('continues without focus instructions when inference fails', async () => {
  mockInferFocus.mockRejectedValue(new Error('timeout'))

  const result = await generate({
    token: 'tok', owner: 'owner', name: 'repo',
    language: 'TypeScript', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main',
  })

  expect(mockBuildPrompt).toHaveBeenCalledWith(
    'library', expect.anything(), 'README', 'owner/repo', null
  )
  expect(result.content).toBeDefined()
})
```

Add same pattern in `enhance` describe:

```typescript
it('passes focus instructions to buildPromptFromTemplate in enhance', async () => {
  mockInferFocus.mockResolvedValue('- ORM library focus')

  await enhance({
    token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: 'README',
    version: '1.0.0', defaultBranch: 'main', existingSkill: '## [CORE]\nold',
  })

  expect(mockInferFocus).toHaveBeenCalled()
  expect(mockBuildPrompt).toHaveBeenCalledWith(
    'library', expect.anything(), 'README', 'o/r', '- ORM library focus'
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: FAIL — `inferFocusInstructions` not called, `buildPromptFromTemplate` called with 4 args not 5

- [ ] **Step 3: Wire up the pipeline**

In `electron/skill-gen/pipeline.ts`:

Add import at top:
```typescript
import { inferFocusInstructions } from './focus-inference'
```

In `generate`, after the extraction try/catch block (after line 78) and before `const prompt = buildPromptFromTemplate(...)` (line 81), insert:

```typescript
// Step 4.5: Infer focus instructions
let focusInstructions: string | null = null
try {
  focusInstructions = await inferFocusInstructions(
    repoType, extraction, readme.slice(0, 2000), { apiKey }
  )
} catch (err) {
  console.error(`[skill-gen] Focus inference failed, continuing without:`, err)
}
```

Update line 81 to pass focus instructions:
```typescript
const prompt = buildPromptFromTemplate(repoType, extraction, readme, repoFullName, focusInstructions)
```

In `enhance`, add the same block before `const basePrompt = buildPromptFromTemplate(...)` (line 149), and update that line:
```typescript
const basePrompt = buildPromptFromTemplate(repoType, extraction, readme, repoFullName, focusInstructions)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen/pipeline.test.ts`
Expected: All tests PASS (existing + 3 new)

- [ ] **Step 5: Run full skill-gen test suite**

Run: `npx vitest run electron/skill-gen/`
Expected: All tests PASS across all files

- [ ] **Step 6: Commit**

```bash
git add electron/skill-gen/pipeline.ts electron/skill-gen/pipeline.test.ts
git commit -m "feat(skill-gen): wire focus inference into generate and enhance pipeline"
```
