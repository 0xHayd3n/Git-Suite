import type { Extractor, ManifestInfo, ExportEntry, ExtractionResult } from '../types'

const MAX_FILES = 15

function stripLeadingDotSlash(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path
}

function getFilesToFetch(fileTree: string[], manifest: ManifestInfo): string[] {
  const selected = new Set<string>()
  const treeSet = new Set(fileTree)

  const add = (path: string) => {
    if (treeSet.has(path) && selected.size < MAX_FILES) {
      selected.add(path)
    }
  }

  const { ecosystem, name } = manifest

  if (ecosystem === 'node' || ecosystem === 'unknown') {
    // Types entry point (.d.ts)
    if (manifest.types) {
      const typesPath = stripLeadingDotSlash(manifest.types)
      add(typesPath)
    }
    // Common TypeScript source entry points
    add('src/index.ts')
    add('index.ts')
    add('src/index.d.ts')
    add('index.d.ts')
    add('lib/index.ts')
    add('lib/index.d.ts')
  }

  if (ecosystem === 'rust') {
    add('src/lib.rs')
    add('src/mod.rs')
    add('mod.rs')
  }

  if (ecosystem === 'python') {
    if (name) {
      add(`${name}/__init__.py`)
      add(`src/${name}/__init__.py`)
    }
    add('__init__.py')
    add('src/__init__.py')
  }

  if (ecosystem === 'go') {
    // Capitalized exported symbols — fetch .go files in root (skip test files)
    for (const file of fileTree) {
      if (selected.size >= MAX_FILES) break
      if (file.endsWith('.go') && !file.endsWith('_test.go') && !file.includes('/')) {
        selected.add(file)
      }
    }
  }

  // Common fallback patterns for any ecosystem
  const commonPatterns = [
    'src/index.ts', 'src/index.js', 'src/index.tsx',
    'lib/index.ts', 'lib/index.js',
    'mod.ts', 'mod.rs',
    'index.ts', 'index.js',
  ]
  for (const pattern of commonPatterns) {
    if (selected.size >= MAX_FILES) break
    add(pattern)
  }

  // Fill remaining slots with .d.ts files if we have room
  if (ecosystem === 'node' || ecosystem === 'unknown') {
    for (const file of fileTree) {
      if (selected.size >= MAX_FILES) break
      if (file.endsWith('.d.ts')) {
        selected.add(file)
      }
    }
  }

  return Array.from(selected)
}

interface PatternDef {
  regex: RegExp
  kind: ExportEntry['kind']
}

function extractFromDts(content: string, file: string): ExportEntry[] {
  const patterns: PatternDef[] = [
    { regex: /^export declare function (\w+)(.*)/gm, kind: 'function' },
    { regex: /^export declare class (\w+)(.*)/gm, kind: 'class' },
    { regex: /^export type (\w+)(.*)/gm, kind: 'type' },
    { regex: /^export interface (\w+)(.*)/gm, kind: 'interface' },
    { regex: /^export declare const (\w+)(.*)/gm, kind: 'const' },
    { regex: /^export enum (\w+)(.*)/gm, kind: 'enum' },
    { regex: /^export declare enum (\w+)(.*)/gm, kind: 'enum' },
  ]
  return runPatterns(patterns, content, file)
}

function extractFromTypeScript(content: string, file: string): ExportEntry[] {
  const patterns: PatternDef[] = [
    { regex: /^export function (\w+)(.*)/gm, kind: 'function' },
    { regex: /^export async function (\w+)(.*)/gm, kind: 'function' },
    { regex: /^export class (\w+)(.*)/gm, kind: 'class' },
    { regex: /^export const (\w+)(.*)/gm, kind: 'const' },
    { regex: /^export let (\w+)(.*)/gm, kind: 'const' },
    { regex: /^export type (\w+)(.*)/gm, kind: 'type' },
    { regex: /^export interface (\w+)(.*)/gm, kind: 'interface' },
    { regex: /^export enum (\w+)(.*)/gm, kind: 'enum' },
  ]
  const entries = runPatterns(patterns, content, file)

  // Handle multi-name re-exports: export { foo, bar, baz }
  const reExportRegex = /^export \{([^}]+)\}/gm
  const seen = new Set(entries.map(e => e.name))
  let m: RegExpExecArray | null
  reExportRegex.lastIndex = 0
  while ((m = reExportRegex.exec(content)) !== null) {
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean)
    for (const name of names) {
      // Use the public alias name (last part after "as"), not the local name
      const parts = name.split(/\s+as\s+/)
      const publicName = parts[parts.length - 1].trim()
      if (publicName && /^\w+$/.test(publicName) && !seen.has(publicName)) {
        seen.add(publicName)
        entries.push({ name: publicName, kind: 'const', file })
      }
    }
  }

  return entries
}

function extractFromRust(content: string, file: string): ExportEntry[] {
  const patterns: PatternDef[] = [
    { regex: /^pub(?:\s+(?:async|unsafe|const|extern\s*(?:"[^"]*")?))*\s+fn\s+(\w+)(.*)/gm, kind: 'function' },
    { regex: /^pub struct (\w+)(.*)/gm, kind: 'class' },
    { regex: /^pub enum (\w+)(.*)/gm, kind: 'enum' },
    { regex: /^pub trait (\w+)(.*)/gm, kind: 'interface' },
    { regex: /^pub type (\w+)(.*)/gm, kind: 'type' },
  ]
  return runPatterns(patterns, content, file)
}

function extractFromPython(content: string, file: string): ExportEntry[] {
  const entries: ExportEntry[] = []
  const seen = new Set<string>()

  // Check for __all__ list
  const allMatch = content.match(/__all__\s*=\s*\[([^\]]+)\]/)
  if (allMatch) {
    const items = allMatch[1].matchAll(/['"](\w+)['"]/g)
    for (const m of items) {
      const name = m[1]
      if (!seen.has(name)) {
        seen.add(name)
        entries.push({ name, kind: 'const', file })
      }
    }
  }

  // Top-level def and class (no leading whitespace)
  const patterns: PatternDef[] = [
    { regex: /^def (\w+)(.*)/gm, kind: 'function' },
    { regex: /^class (\w+)(.*)/gm, kind: 'class' },
  ]

  for (const { regex, kind } of patterns) {
    let m: RegExpExecArray | null
    regex.lastIndex = 0
    while ((m = regex.exec(content)) !== null) {
      const name = m[1]
      if (name.startsWith('_')) continue
      if (seen.has(name)) continue
      seen.add(name)
      const sig = m[2] ? m[2].slice(0, 100) : undefined
      entries.push({ name, kind, file, ...(sig ? { signature: sig } : {}) })
    }
  }

  return entries
}

function extractFromGo(content: string, file: string): ExportEntry[] {
  const patterns: PatternDef[] = [
    { regex: /^func (\p{Lu}\w+)(.*)/gmu, kind: 'function' },
    { regex: /^type (\p{Lu}\w+)(.*)/gmu, kind: 'type' },
  ]
  return runPatterns(patterns, content, file)
}

function runPatterns(patterns: PatternDef[], content: string, file: string): ExportEntry[] {
  const entries: ExportEntry[] = []
  const seen = new Set<string>()

  for (const { regex, kind } of patterns) {
    let m: RegExpExecArray | null
    regex.lastIndex = 0
    while ((m = regex.exec(content)) !== null) {
      const name = m[1]
      if (seen.has(name)) continue
      seen.add(name)
      const rest = m[2]?.trim()
      const sig = rest ? rest.slice(0, 100) : undefined
      entries.push({ name, kind, file, ...(sig ? { signature: sig } : {}) })
    }
  }

  return entries
}

function extract(files: Map<string, string>, manifest: ManifestInfo): Partial<ExtractionResult> {
  const allExports: ExportEntry[] = []

  for (const [filePath, content] of files) {
    let entries: ExportEntry[] = []

    if (filePath.endsWith('.d.ts')) {
      entries = extractFromDts(content, filePath)
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      entries = extractFromTypeScript(content, filePath)
    } else if (filePath.endsWith('.rs')) {
      entries = extractFromRust(content, filePath)
    } else if (filePath.endsWith('.py')) {
      entries = extractFromPython(content, filePath)
    } else if (filePath.endsWith('.go')) {
      entries = extractFromGo(content, filePath)
    } else if (manifest.ecosystem === 'rust') {
      entries = extractFromRust(content, filePath)
    } else if (manifest.ecosystem === 'python') {
      entries = extractFromPython(content, filePath)
    } else if (manifest.ecosystem === 'go') {
      entries = extractFromGo(content, filePath)
    }

    allExports.push(...entries)
  }

  return { exports: allExports }
}

export const libraryExtractor: Extractor = {
  getFilesToFetch,
  extract,
}
