import { describe, it, expect } from 'vitest'
import { buildPromptFromTemplate } from './index'
import type { ExtractionResult } from '../types'

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
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README content here', 'owner/zod')
    expect(prompt).toContain('## [CORE]')
    expect(prompt).toContain('## [EXTENDED]')
    expect(prompt).toContain('## [DEEP]')
  })

  it('includes extraction data before README', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README content here', 'owner/zod')
    const extractionPos = prompt.indexOf('EXTRACTED DATA')
    const readmePos = prompt.indexOf('README:')
    expect(extractionPos).toBeLessThan(readmePos)
  })

  it('includes exported function names in extraction section', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod')
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
    const prompt = buildPromptFromTemplate('cli-tool', cliExtraction, 'README', 'owner/eslint')
    expect(prompt).toContain('subcommand')
    expect(prompt).toContain('lint')
    expect(prompt).toContain('--fix')
  })

  it('includes universal rules in all templates', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod')
    expect(prompt).toContain('AI coding assistant')
    expect(prompt).toContain('do not invent')
    expect(prompt).toContain('## [CORE]')
  })

  it('truncates README to 12000 chars', () => {
    const longReadme = 'x'.repeat(20000)
    const prompt = buildPromptFromTemplate('library', baseExtraction, longReadme, 'owner/zod')
    expect(prompt).toContain('x'.repeat(12000))
    expect(prompt).not.toContain('x'.repeat(12001))
  })

  it('handles generic type with same structure as current prompt', () => {
    const prompt = buildPromptFromTemplate('generic', {
      ...baseExtraction,
      repoType: 'generic',
      exports: undefined,
    }, 'README', 'owner/zod')
    expect(prompt).toContain('## [CORE]')
    expect(prompt).toContain('## [EXTENDED]')
    expect(prompt).toContain('## [DEEP]')
  })

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

  it('includes topics when passed as parameter', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod', null, ['validation', 'typescript', 'schema'])
    expect(prompt).toContain('Topics: validation, typescript, schema')
  })

  it('shows empty topics when not provided', () => {
    const prompt = buildPromptFromTemplate('library', baseExtraction, 'README', 'owner/zod')
    expect(prompt).toContain('Topics: ')
    expect(prompt).not.toContain('Topics: validation')
  })
})
