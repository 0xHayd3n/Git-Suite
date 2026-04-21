import { describe, it, expect } from 'vitest'
import { genericExtractor } from './generic'

describe('genericExtractor.getFilesToFetch', () => {
  it('combines library and CLI files, deduplicates, caps at 15', () => {
    const tree = ['src/index.ts', 'src/cli.ts', 'bin/cli.js', 'package.json']
    const manifest = { ecosystem: 'node' as const, name: 'test', bin: { test: './bin/cli.js' } }
    const result = genericExtractor.getFilesToFetch(tree, manifest)
    expect(result).toContain('src/index.ts')
    expect(result).toContain('bin/cli.js')
    expect(result.length).toBeLessThanOrEqual(15)
    // No duplicates
    expect(new Set(result).size).toBe(result.length)
  })
})

describe('genericExtractor.extract', () => {
  it('merges library exports and CLI commands', () => {
    const files = new Map([
      ['src/index.ts', 'export function parse(input: string): Result { }'],
      ['src/cli.ts', `
import { program } from 'commander'
program.command('run').description('Run the parser').option('--verbose', 'Verbose output')
`],
    ])
    const result = genericExtractor.extract(files, { ecosystem: 'node', name: 'test' })
    // Should have library exports
    expect(result.exports).toBeDefined()
    expect(result.exports!.find(e => e.name === 'parse')).toBeDefined()
    // Should have CLI commands
    expect(result.commands).toBeDefined()
  })

  it('returns empty for empty files', () => {
    const files = new Map<string, string>()
    const result = genericExtractor.extract(files, { ecosystem: 'node' })
    expect(result.exports ?? []).toEqual([])
    expect(result.commands ?? []).toEqual([])
  })
})
