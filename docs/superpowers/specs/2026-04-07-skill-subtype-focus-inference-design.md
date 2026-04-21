# Skill Subtype Focus Inference

**Date:** 2026-04-07
**Status:** Draft

## Problem

The skill generation pipeline classifies repos into 7 top-level types (library, cli-tool, framework, component-library, monorepo, infrastructure, generic). Each type has one template with static prompt instructions. This works for the broad category but misses subtype nuance — a React hooks library, an ORM, and an HTTP client are all "library" but need very different skill file emphasis. The generic instructions produce skill files that are technically correct but miss what matters most for the specific repo.

## Solution

Add an LLM-inferred "focus brief" step between extraction and prompt building. A cheap Haiku call analyzes the extracted data and README, then produces 3-5 bullet points of repo-specific guidance. These get injected into the main generation prompt so the primary LLM tailors its output to the repo's actual subtype.

## Architecture

### New file: `electron/skill-gen/focus-inference.ts`

Single exported function:

```typescript
export async function inferFocusInstructions(
  repoType: RepoType,
  extraction: ExtractionResult,
  readmeHead: string,
  options: { apiKey?: string }
): Promise<string | null>
```

**Returns:** A string of 3-5 bullet points, or `null` on failure.

**Implementation:**
- If `repoType === 'generic'` and `extraction.exports` is empty/undefined, returns `null` immediately (no signal to work with)
- Internally extracts only what it needs: `extraction.manifest.ecosystem` and up to 20 entries from `extraction.exports`
- Builds a short prompt (~600-800 tokens) from the repo type, ecosystem, top 20 export names/kinds, and the `readmeHead`
- Calls Haiku via `generateWithRawPrompt(focusPrompt, '', { model: 'claude-haiku-4-5', maxTokens: 200, apiKey })` — passes empty string as the `readme` parameter since focus output doesn't need URL hallucination stripping
- Wraps the call in a 10-second `Promise.race` timeout to uphold the "never blocks" contract
- Returns the raw text response trimmed
- Catches all errors (including timeout, missing API key, no CLI fallback) and returns `null`

### Focus inference prompt

```
You are analyzing a GitHub repository to guide skill file generation.

Repo type: {repoType}
Ecosystem: {ecosystem}
Exports: {top 20 export names + kinds, comma-separated}
README (first 2000 chars): {readmeHead}

Based on this data, produce 3-5 bullet points describing what the skill file
should emphasize for this SPECIFIC repo. Focus on:
- What kind of {repoType} this actually is (e.g., "React hooks library for form validation")
- Which APIs or patterns matter most for someone using this in code
- Any domain-specific concepts the skill should explain
- What makes this different from a generic {repoType}

Be concise. Each bullet should be one sentence. Output only the bullet points, nothing else.
```

### Pipeline changes: `electron/skill-gen/pipeline.ts`

**`generate` function:**

Insert new Step 4.5 between extraction (Step 4) and prompt building (Step 5):

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

Pass `focusInstructions` to `buildPromptFromTemplate`.

**`enhance` function:**

Same step insertion — call `inferFocusInstructions` before line 149's `buildPromptFromTemplate` call and pass the result as the new fifth argument. The focus instructions flow through `buildPromptFromTemplate` which injects them into `basePrompt`. The enhance-specific suffix (existing skill + improvement instructions) is then appended after, so focus context is available to the main generation call.

```typescript
// Step 4.5: Infer focus instructions (same as generate)
let focusInstructions: string | null = null
try {
  focusInstructions = await inferFocusInstructions(
    repoType, extraction, readme.slice(0, 2000), { apiKey }
  )
} catch (err) {
  console.error(`[skill-gen] Focus inference failed for enhance, continuing without:`, err)
}

const basePrompt = buildPromptFromTemplate(repoType, extraction, readme, repoFullName, focusInstructions)
```

### Template changes: `electron/skill-gen/templates/index.ts`

**`buildPromptFromTemplate` signature:**

```typescript
export function buildPromptFromTemplate(
  type: RepoType,
  extraction: ExtractionResult,
  readme: string,
  repoFullName: string,
  focusInstructions?: string | null,
): string
```

**Injection point:** If `focusInstructions` is truthy, insert this block after the extracted data section and before the section instructions:

```
--- REPO-SPECIFIC FOCUS ---
{focusInstructions}
--- END FOCUS ---

Use the above to tailor your output. Emphasize the patterns and concepts
described above over generic content.
```

### No changes to

- `types.ts` — no new types needed
- `classifier.ts` — classification is unchanged
- `extractors/*` — extraction logic stays the same
- `validator.ts` — validation stays the same
- Database schema — no storage changes
- UI — no user-facing changes
- MCP server — no tool changes

## Fallback behavior

If the focus inference call fails for any reason (API error, timeout, missing API key, malformed response), the pipeline continues exactly as it does today. The focus instructions are purely additive — their absence means the skill file gets the current generic treatment, not a broken one.

## Cost analysis

- **Input tokens:** ~600-800 (repo type + ecosystem + 20 export names + 2000 char README)
- **Output tokens:** ~100-150 (3-5 bullet points)
- **Model:** claude-haiku-4-5
- **Estimated cost per call:** <$0.001
- **Latency:** ~1-2 seconds added to generation

This runs once per generate/enhance call. Negligible compared to the main generation call.

## Testing strategy

- Unit test `inferFocusInstructions` with mocked API responses
- Unit test `buildPromptFromTemplate` with and without focus instructions to verify injection
- Integration test the full pipeline to confirm focus instructions appear in the prompt
- Manually compare skill file output for 3-4 diverse repos (React hooks lib, ORM, HTTP client, crypto lib) with and without focus inference to verify quality improvement
