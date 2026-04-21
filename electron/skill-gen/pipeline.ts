import type { RepoType, SkillFlavour, RouteResult, ExtractionResult, ValidationResult, ManifestInfo } from './types'
import { fetchFileTree, fetchRepoFiles, fetchManifest } from './github-files'
import { parseManifest } from './manifest-parser'
import { classify } from './classifier'
import { getExtractor } from './extractors/index'
import { buildPromptFromTemplate, buildComponentsPrompt } from './templates/index'
import { validate, validateSkill, validateComponents } from './validator'
import { generateWithRawPrompt } from './legacy'
import { inferFocusInstructions } from './focus-inference'
import { extractionCache } from './extraction-cache'
import { buildLibraryPrompt, buildDomainPrompt, buildSystemPrompt, buildPracticePrompt } from './prompts'

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

// ── Flavour-specific generators ───────────────────────────────────────────────

async function generateLibrary(input: GenerateInput, extraction: ExtractionOutput): Promise<{ content: string; validation: ValidationResult }> {
  const prompt = buildLibraryPrompt(input, extraction.extraction)
  const raw = await generateWithRawPrompt(prompt, input.readme, { model: 'claude-sonnet-4-6', maxTokens: 4096, apiKey: input.apiKey })
  const { content, result } = validateSkill(raw, input.readme, extraction.extraction, 'library')
  return { content, validation: result }
}

async function generateDomain(input: GenerateInput, extraction: ExtractionOutput): Promise<{ content: string; validation: ValidationResult }> {
  const prompt = buildDomainPrompt(input, extraction.extraction)
  const raw = await generateWithRawPrompt(prompt, input.readme, { model: 'claude-haiku-4-5', maxTokens: 2048, apiKey: input.apiKey })
  const { content, result } = validateSkill(raw, input.readme, extraction.extraction, 'domain')
  return { content, validation: result }
}

async function generateSystem(input: GenerateInput, extraction: ExtractionOutput): Promise<{ content: string; validation: ValidationResult }> {
  const prompt = buildSystemPrompt(input, extraction.extraction)
  const raw = await generateWithRawPrompt(prompt, input.readme, { model: 'claude-sonnet-4-6', maxTokens: 3072, apiKey: input.apiKey })
  const { content, result } = validateSkill(raw, input.readme, extraction.extraction, 'codebase')
  return { content, validation: result }
}

async function generatePractice(input: GenerateInput, extraction: ExtractionOutput): Promise<{ content: string; validation: ValidationResult }> {
  const prompt = buildPracticePrompt(input, extraction.extraction)
  const raw = await generateWithRawPrompt(prompt, input.readme, { model: 'claude-sonnet-4-6', maxTokens: 2048, apiKey: input.apiKey })
  const { content, result } = validateSkill(raw, input.readme, extraction.extraction, 'codebase')
  return { content, validation: result }
}

export async function route(flavour: SkillFlavour, input: GenerateInput): Promise<RouteResult> {
  const extraction = await getOrExtract(input)

  switch (flavour) {
    case 'library': {
      const r = await generateLibrary(input, extraction)
      return { flavour: 'library', ...r }
    }
    case 'domain': {
      const r = await generateDomain(input, extraction)
      return { flavour: 'domain', ...r }
    }
    case 'codebase': {
      const [system, practice] = await Promise.all([
        generateSystem(input, extraction),
        generatePractice(input, extraction),
      ])
      return { flavour: 'codebase', system: system.content, practice: practice.content, systemValidation: system.validation, practiceValidation: practice.validation }
    }
  }
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
