import { describe, it, expect } from 'vitest'
import { validate } from './validator'
import type { ExtractionResult } from './types'

const mockExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'zod', version: '3.22.0' },
  fileTree: [],
  exports: [
    { name: 'z', kind: 'function', file: 'src/index.ts' },
    { name: 'string', kind: 'function', file: 'src/index.ts' },
  ],
}

const richExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'zod', version: '3.22.0' },
  fileTree: [],
  exports: [
    { name: 'z', kind: 'function', file: 'src/index.ts' },
    { name: 'string', kind: 'function', file: 'src/index.ts' },
    { name: 'number', kind: 'function', file: 'src/index.ts' },
    { name: 'object', kind: 'function', file: 'src/index.ts' },
    { name: 'array', kind: 'function', file: 'src/index.ts' },
    { name: 'union', kind: 'function', file: 'src/index.ts' },
  ],
}

describe('validate', () => {
  it('passes for well-formed skill with all sections', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: owner/zod\nversion: 3.22.0\n\`\`\`\nz() creates schemas\n## [EXTENDED]\nMore info\n## [DEEP]\nDeep info`
    const result = validate(content, mockExtraction, '# Zod README')
    expect(result.result.passed).toBe(true)
    expect(result.result.errors).toHaveLength(0)
  })

  it('errors on missing CORE section', () => {
    const content = `## [EXTENDED]\nSome info\n## [DEEP]\nDeep info`
    const result = validate(content, mockExtraction, '')
    expect(result.result.passed).toBe(false)
    expect(result.result.errors.some(e => e.check === 'structure' && e.message.includes('CORE'))).toBe(true)
  })

  it('errors on missing EXTENDED section', () => {
    const content = `## [CORE]\nInfo\n## [DEEP]\nDeep info`
    const result = validate(content, mockExtraction, '')
    expect(result.result.passed).toBe(false)
    expect(result.result.errors.some(e => e.message.includes('EXTENDED'))).toBe(true)
  })

  it('errors on missing DEEP section', () => {
    const content = `## [CORE]\nInfo\n## [EXTENDED]\nMore info`
    const result = validate(content, mockExtraction, '')
    expect(result.result.passed).toBe(false)
    expect(result.result.errors.some(e => e.message.includes('DEEP'))).toBe(true)
  })

  it('warns on function names not in extraction', () => {
    const content = `## [CORE]\nUse createSchema() to build\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '')
    expect(result.result.warnings.some(w => w.check === 'export-verification' && w.message.includes('createSchema'))).toBe(true)
  })

  it('does not warn on function names that are in extraction', () => {
    const content = `## [CORE]\nUse z() to build\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '')
    expect(result.result.warnings.filter(w => w.check === 'export-verification')).toHaveLength(0)
  })

  it('auto-fixes hallucinated URLs', () => {
    const content = `## [CORE]\nSee https://fake.example.com/docs\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '# Zod README\nhttps://zod.dev')
    expect(result.result.autoFixes).toBeGreaterThan(0)
  })

  it('auto-fixes version mismatch in frontmatter', () => {
    const content = "## [CORE]\n```\nrepo: owner/zod\nversion: 2.0.0\n```\n## [EXTENDED]\nMore\n## [DEEP]\nDeep"
    const result = validate(content, mockExtraction, '')
    expect(result.result.autoFixes).toBeGreaterThan(0)
  })

  it('warns on CLI flags not in extraction for cli-tool type', () => {
    const cliExtraction: ExtractionResult = {
      repoType: 'cli-tool',
      manifest: { ecosystem: 'node', name: 'my-cli' },
      fileTree: [],
      commands: [{ name: 'build', flags: [{ name: '--output', type: 'string' }], description: 'Build' }],
    }
    const content = `## [CORE]\nUse --verbose for debug output\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, cliExtraction, '')
    expect(result.result.warnings.some(w => w.check === 'command-verification')).toBe(true)
  })
})

describe('export auto-fix stripping', () => {
  it('strips bullet containing hallucinated function name', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\n- Use z() for schemas\n- Use fakeFunc() for validation\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richExtraction, '')
    expect(result.content).not.toContain('fakeFunc')
    expect(result.content).toContain('z()')
    expect(result.result.autoFixes).toBeGreaterThan(0)
  })

  it('strips prose line containing hallucinated function name', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\nThe fakeFunc() method creates schemas.\nUse z() for validation.\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richExtraction, '')
    expect(result.content).not.toContain('fakeFunc')
    expect(result.content).toContain('z()')
  })

  it('does NOT strip when exports count is below threshold (< 5)', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\n- Use fakeFunc() here\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, mockExtraction, '')
    // mockExtraction has only 2 exports — below threshold
    expect(result.content).toContain('fakeFunc')
    expect(result.result.warnings.some(w => w.check === 'export-verification')).toBe(true)
  })

  it('does NOT strip references inside code blocks', () => {
    const content = "## [CORE]\n```\nfakeFunc()\n```\n## [EXTENDED]\nMore\n## [DEEP]\nDeep"
    const result = validate(content, richExtraction, '')
    expect(result.content).toContain('fakeFunc')
  })

  it('collapses excess newlines after stripping', () => {
    const content = `## [CORE]\n\`\`\`\nrepo: o/r\nversion: 3.22.0\n\`\`\`\n\nLine before\n\nUse fakeFunc() here\n\nLine after\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richExtraction, '')
    expect(result.content).not.toMatch(/\n{3,}/)
  })
})

const richCliExtraction: ExtractionResult = {
  repoType: 'cli-tool',
  manifest: { ecosystem: 'node', name: 'my-cli' },
  fileTree: [],
  commands: [
    { name: 'build', description: 'Build', flags: [
      { name: '--output', type: 'string' },
      { name: '--minify', type: 'boolean' },
      { name: '--target', type: 'string' },
      { name: '--watch', type: 'boolean' },
      { name: '--config', type: 'string' },
    ]},
  ],
}

describe('command auto-fix stripping', () => {
  it('strips bullet containing hallucinated flag', () => {
    const content = `## [CORE]\n- Use --output to set path\n- Use --verbose for debug output\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, richCliExtraction, '')
    expect(result.content).not.toContain('--verbose')
    expect(result.content).toContain('--output')
    expect(result.result.autoFixes).toBeGreaterThan(0)
  })

  it('does NOT strip when commands have fewer than 5 flags total', () => {
    const sparseCliExtraction: ExtractionResult = {
      repoType: 'cli-tool',
      manifest: { ecosystem: 'node', name: 'my-cli' },
      fileTree: [],
      commands: [
        { name: 'run', description: 'Run', flags: [
          { name: '--help', type: 'boolean' },
        ]},
      ],
    }
    const content = `## [CORE]\n- Use --verbose flag\n## [EXTENDED]\nMore\n## [DEEP]\nDeep`
    const result = validate(content, sparseCliExtraction, '')
    expect(result.content).toContain('--verbose')
    expect(result.result.warnings.some(w => w.check === 'command-verification')).toBe(true)
  })

  it('does NOT strip flags inside code blocks', () => {
    const content = "## [CORE]\n```bash\nmy-cli --verbose\n```\n## [EXTENDED]\nMore\n## [DEEP]\nDeep"
    const result = validate(content, richCliExtraction, '')
    expect(result.content).toContain('--verbose')
  })
})
