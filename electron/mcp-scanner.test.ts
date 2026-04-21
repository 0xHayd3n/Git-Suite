import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseStaticTS, parseStaticPy } from './mcp-scanner'
import { parseManifest, parseReadme, scanFromSources } from './mcp-scanner'

const fixturePath = (name: string) => join(__dirname, 'fixtures/mcp-scanner', name)

describe('mcp-scanner — static TS', () => {
  it('extracts three tools with names and descriptions', () => {
    const source = readFileSync(fixturePath('static-ts/server.ts'), 'utf8')
    const tools = parseStaticTS(source)
    expect(tools).toHaveLength(3)
    expect(tools[0]).toMatchObject({ name: 'search_docs', description: 'Search documentation by keyword.', source: 'static' })
    expect(tools[1]).toMatchObject({ name: 'list_files', description: 'List files in a directory.', source: 'static' })
    expect(tools[2]).toMatchObject({ name: 'get_pr',      description: 'Fetch a pull request by number.', source: 'static' })
  })

  it('handles the shorter server.tool alias in JS', () => {
    const source = readFileSync(fixturePath('static-js/server.js'), 'utf8')
    const tools = parseStaticTS(source)
    expect(tools.map(t => t.name)).toEqual(['ping', 'noop'])
    expect(tools[0].description).toBe('Health check.')
    expect(tools[1].description).toBeNull()
  })

  it('returns empty array on no matches', () => {
    expect(parseStaticTS('const foo = 1;')).toEqual([])
  })
})

describe('mcp-scanner — static Python', () => {
  it('extracts decorated tools with docstrings', () => {
    const source = readFileSync(fixturePath('static-py/server.py'), 'utf8')
    const tools = parseStaticPy(source)
    expect(tools).toHaveLength(3)
    expect(tools[0]).toMatchObject({ name: 'list_users', description: 'List all users.', source: 'static' })
    expect(tools[1]).toMatchObject({ name: 'get_user',   description: 'Fetch a user by id.', source: 'static' })
    expect(tools[2]).toMatchObject({ name: 'no_docstring', description: null, source: 'static' })
  })
})

describe('mcp-scanner — manifest', () => {
  it('parses manifest with name/description/category', () => {
    const source = readFileSync(fixturePath('manifest/tools.json'), 'utf8')
    const tools = parseManifest(source)
    expect(tools).toHaveLength(3)
    expect(tools[0]).toMatchObject({ name: 'fetch_issue', description: 'Fetch a GitHub issue.', category: 'github', source: 'manifest' })
    expect(tools[2]).toMatchObject({ name: 'ping', description: null, category: null, source: 'manifest' })
  })

  it('returns [] on malformed json', () => {
    expect(parseManifest('not json')).toEqual([])
  })
})

describe('mcp-scanner — README', () => {
  it('extracts tools from a ## Tools section', () => {
    const source = readFileSync(fixturePath('readme/README.md'), 'utf8')
    const tools = parseReadme(source)
    expect(tools.map(t => t.name)).toEqual(['list_files', 'read_file', 'search_code'])
    expect(tools[0].description).toBe('list files in a directory')
    expect(tools[1].description).toBe('read the contents of a file')
    expect(tools[2].description).toBe('grep-like search across the repo')
    expect(tools[0].source).toBe('readme-approx')
  })

  it('returns [] when no heading matches', () => {
    expect(parseReadme('# Intro\n\nNo tools section here.')).toEqual([])
  })
})

describe('mcp-scanner — chain orchestrator', () => {
  it('returns static when static parse yields tools', () => {
    const result = scanFromSources({
      staticSources: [readFileSync(fixturePath('static-ts/server.ts'), 'utf8')],
      manifestSource: readFileSync(fixturePath('manifest/tools.json'), 'utf8'),
      readmeSource:   readFileSync(fixturePath('readme/README.md'), 'utf8'),
    })
    expect(result.source).toBe('static')
    expect(result.tools.length).toBe(3)
  })

  it('falls back to manifest when static empty', () => {
    const result = scanFromSources({
      staticSources: ['const foo = 1;'],
      manifestSource: readFileSync(fixturePath('manifest/tools.json'), 'utf8'),
      readmeSource:   null,
    })
    expect(result.source).toBe('manifest')
    expect(result.tools.length).toBe(3)
  })

  it('falls back to readme when static and manifest empty', () => {
    const result = scanFromSources({
      staticSources: [],
      manifestSource: null,
      readmeSource:   readFileSync(fixturePath('readme/README.md'), 'utf8'),
    })
    expect(result.source).toBe('readme-approx')
    expect(result.tools.length).toBe(3)
  })

  it('returns empty tools with static source when everything fails', () => {
    const result = scanFromSources({ staticSources: [], manifestSource: null, readmeSource: null })
    expect(result.tools).toEqual([])
    expect(result.source).toBe('static')
  })
})
