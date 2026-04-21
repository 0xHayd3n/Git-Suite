import type { RepoType, ExtractionResult, ValidationResult, ManifestInfo } from './types'
import { fetchFileTree, fetchRepoFiles, fetchManifest } from './github-files'
import { parseManifest } from './manifest-parser'
import { classify } from './classifier'
import { getExtractor } from './extractors/index'
import { buildPromptFromTemplate, buildComponentsPrompt } from './templates/index'
import { validate, validateComponents } from './validator'
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
  focusInferenceFailed?: boolean
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
  const { owner, name, readme, apiKey, topics, typeBucket, typeSub } = input
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

  const focusInferenceFailed = focusInstructions === null && repoType !== 'generic'

  // Build prompt
  const prompt = buildPromptFromTemplate(repoType, extraction, readme, repoFullName, focusInstructions, topics)

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

  return { content, tier: 1, repoType, validation: validationResult, focusInferenceFailed }
}

export async function enhance(
  input: GenerateInput & { existingSkill: string }
): Promise<GenerateResult> {
  const { owner, name, readme, apiKey, topics, existingSkill, typeBucket, typeSub } = input
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

  const focusInferenceFailed = focusInstructions === null && repoType !== 'generic'

  // Build enhance prompt
  const basePrompt = buildPromptFromTemplate(repoType, extraction, readme, repoFullName, focusInstructions, topics)
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

  let rawContent = await generateWithRawPrompt(enhancePrompt, readme, {
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
    apiKey,
  })

  let { content, result: validationResult } = validate(rawContent, extraction, readme)

  // Retry once if structural errors
  if (!validationResult.passed && validationResult.errors.some(e => e.check === 'structure')) {
    const retryPrompt = enhancePrompt + '\n\nIMPORTANT: Your previous output was missing required sections. You MUST include all three sections: ## [CORE], ## [EXTENDED], and ## [DEEP]. Start immediately with ## [CORE].'
    rawContent = await generateWithRawPrompt(retryPrompt, readme, {
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      apiKey,
    })
    const retryValidation = validate(rawContent, extraction, readme)
    content = retryValidation.content
    validationResult = retryValidation.result
  }

  return { content, tier: 2, repoType, validation: validationResult, focusInferenceFailed }
}

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
  } catch (err) {
    console.error(`[skill-gen] Focus inference failed for components, continuing without:`, err)
  }

  const prompt = buildComponentsPrompt(extraction, readme, repoFullName, focusInstructions, scannedComponents)

  const rawContent = await generateWithRawPrompt(prompt, readme, {
    model: 'claude-haiku-4-5',
    maxTokens: 4096,
    apiKey,
  })

  const { content, result: validationResult } = validateComponents(rawContent, readme)

  return { content, validation: validationResult }
}
