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
  buildComponentsPrompt: vi.fn(),
}))

vi.mock('./validator', () => ({
  validate: vi.fn(),
  validateComponents: vi.fn(),
}))

vi.mock('./legacy', () => ({
  generateWithRawPrompt: vi.fn(),
}))

vi.mock('./manifest-parser', () => ({
  parseManifest: vi.fn(),
}))

vi.mock('./focus-inference', () => ({
  inferFocusInstructions: vi.fn(),
}))

vi.mock('./extraction-cache', () => ({
  extractionCache: {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  },
}))

import { generate, generateComponents } from './pipeline'
import { fetchFileTree, fetchRepoFiles, fetchManifest } from './github-files'
import { classify } from './classifier'
import { getExtractor } from './extractors/index'
import { buildPromptFromTemplate, buildComponentsPrompt } from './templates/index'
import { validate, validateComponents } from './validator'
import { generateWithRawPrompt } from './legacy'
import { parseManifest } from './manifest-parser'
import { inferFocusInstructions } from './focus-inference'
const mockInferFocus = vi.mocked(inferFocusInstructions)
import { extractionCache } from './extraction-cache'
const mockCache = vi.mocked(extractionCache)

const mockFetchFileTree = vi.mocked(fetchFileTree)
const mockFetchRepoFiles = vi.mocked(fetchRepoFiles)
const mockFetchManifest = vi.mocked(fetchManifest)
const mockClassify = vi.mocked(classify)
const mockGetExtractor = vi.mocked(getExtractor)
const mockBuildPrompt = vi.mocked(buildPromptFromTemplate)
const mockBuildComponentsPrompt = vi.mocked(buildComponentsPrompt)
const mockValidate = vi.mocked(validate)
const mockValidateComponents = vi.mocked(validateComponents)
const mockGenerate = vi.mocked(generateWithRawPrompt)
const mockParseManifest = vi.mocked(parseManifest)

describe('generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCache.get.mockReturnValue(null)

    mockFetchFileTree.mockResolvedValue(['src/index.ts', 'package.json'])
    mockFetchManifest.mockResolvedValue({ filename: 'package.json', content: '{"name":"test"}' })
    mockParseManifest.mockReturnValue({ ecosystem: 'node', name: 'test' })
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
    mockInferFocus.mockResolvedValue('- Test focus bullet')
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
    expect(mockBuildPrompt).toHaveBeenCalled()
    expect(mockGenerate).toHaveBeenCalledWith('Generated prompt', 'README content', expect.objectContaining({ model: 'claude-haiku-4-5', maxTokens: 3072 }))
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

    // Without token, file tree fetch is skipped
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
      '- React hooks library\n- Emphasize useEffect patterns',
      []
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
      'library', expect.anything(), 'README', 'owner/repo', null, []
    )
    expect(result.content).toBeDefined()
  })

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

  it('sets focusInferenceFailed when inference returns null for non-generic repo', async () => {
    mockInferFocus.mockResolvedValue(null)
    const result = await generate({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [], readme: 'README',
      version: '1.0.0', defaultBranch: 'main',
    })
    expect(result.focusInferenceFailed).toBe(true)
  })

  it('does not set focusInferenceFailed for generic repos', async () => {
    mockClassify.mockReturnValue({ type: 'generic', confidence: 0.3, signals: [] })
    mockInferFocus.mockResolvedValue(null)
    const result = await generate({
      token: null, owner: 'o', name: 'r', language: '', topics: [], readme: '',
      version: '1.0.0', defaultBranch: 'main',
    })
    expect(result.focusInferenceFailed).toBeFalsy()
  })
})


describe('generateComponents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCache.get.mockReturnValue(null)
    mockFetchFileTree.mockResolvedValue(['src/index.ts', 'package.json'])
    mockFetchManifest.mockResolvedValue({ filename: 'package.json', content: '{"name":"test"}' })
    mockParseManifest.mockReturnValue({ ecosystem: 'node', name: 'test' })
    mockClassify.mockReturnValue({ type: 'component-library', confidence: 0.8, signals: [] })
    mockGetExtractor.mockReturnValue({
      getFilesToFetch: () => ['src/index.ts'],
      extract: () => ({ components: [] }),
    })
    mockFetchRepoFiles.mockResolvedValue(new Map())
    mockBuildComponentsPrompt.mockReturnValue('Components prompt')
    mockGenerate.mockResolvedValue('### Button\nA button component')
    mockValidateComponents.mockReturnValue({
      content: '### Button\nA button component',
      result: { passed: true, errors: [], warnings: [], autoFixes: 0 },
    })
    mockInferFocus.mockResolvedValue(null)
  })

  it('generates component sub-skill using pipeline', async () => {
    const result = await generateComponents({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [],
      readme: 'README', version: '1.0.0', defaultBranch: 'main',
      scannedComponents: [{ name: 'Button', props: [{ name: 'variant', type: 'string', required: false }] }],
    })
    expect(result.content).toContain('Button')
    expect(mockGenerate).toHaveBeenCalledWith(expect.any(String), 'README', expect.objectContaining({ maxTokens: 4096 }))
  })

  it('uses cached extraction for components', async () => {
    mockCache.get.mockReturnValue({
      extraction: { repoType: 'component-library', manifest: { ecosystem: 'node' }, fileTree: [] },
      repoType: 'component-library',
    })
    await generateComponents({
      token: 'tok', owner: 'o', name: 'r', language: 'TS', topics: [],
      readme: 'README', version: '1.0.0', defaultBranch: 'main',
    })
    expect(mockFetchFileTree).not.toHaveBeenCalled()
  })
})
