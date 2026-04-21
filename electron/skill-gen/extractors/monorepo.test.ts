import { describe, it, expect } from 'vitest'
import { monorepoExtractor } from './monorepo'

describe('monorepoExtractor.getFilesToFetch', () => {
  it('fetches package.json files from packages/', () => {
    const tree = ['packages/core/package.json', 'packages/cli/package.json', 'packages/core/src/index.ts']
    const result = monorepoExtractor.getFilesToFetch(tree, { ecosystem: 'node' })
    expect(result).toContain('packages/core/package.json')
    expect(result).toContain('packages/cli/package.json')
  })
})

describe('monorepoExtractor.extract', () => {
  it('extracts package entries from sub-package manifests', () => {
    const files = new Map([
      ['packages/core/package.json', JSON.stringify({ name: '@mylib/core', description: 'Core utilities', main: './dist/index.js' })],
      ['packages/cli/package.json', JSON.stringify({ name: '@mylib/cli', description: 'CLI tool', bin: { 'mylib': './bin/cli.js' } })],
    ])
    const result = monorepoExtractor.extract(files, { ecosystem: 'node' })
    expect(result.packages).toBeDefined()
    expect(result.packages!.length).toBe(2)
    expect(result.packages!.find(p => p.name === '@mylib/core')).toBeDefined()
    expect(result.packages!.find(p => p.name === '@mylib/cli')).toBeDefined()
  })

  it('returns empty for no package.json files', () => {
    const files = new Map([['README.md', '# Hello']])
    const result = monorepoExtractor.extract(files, { ecosystem: 'node' })
    expect(result.packages ?? []).toEqual([])
  })
})
