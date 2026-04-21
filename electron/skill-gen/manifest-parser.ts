import type { ManifestInfo } from './types'
import { parse as parseToml } from 'smol-toml'

const MANIFEST_PRIORITY = [
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'setup.py',
  'go.mod',
] as const

/**
 * Detect which manifest file is present in a file tree.
 * Priority: package.json > Cargo.toml > pyproject.toml > setup.py > go.mod > null
 */
export function detectManifestFile(fileTree: string[]): string | null {
  for (const manifest of MANIFEST_PRIORITY) {
    if (fileTree.some((f) => f === manifest || f.endsWith(`/${manifest}`))) {
      return manifest
    }
  }
  return null
}

/**
 * Parse a manifest file and return a unified ManifestInfo object.
 */
export function parseManifest(filename: string, content: string): ManifestInfo {
  switch (filename) {
    case 'package.json':
      return parsePackageJson(content)
    case 'Cargo.toml':
      return parseCargoToml(content)
    case 'go.mod':
      return parseGoMod(content)
    case 'pyproject.toml':
      return parsePyprojectToml(content)
    case 'setup.py':
      return parseSetupPy(content)
    default:
      return { ecosystem: 'unknown', rawManifest: content }
  }
}

// ---------------------------------------------------------------------------
// Per-ecosystem parsers
// ---------------------------------------------------------------------------

function parsePackageJson(content: string): ManifestInfo {
  try {
    const pkg = JSON.parse(content)
    return {
      ecosystem: 'node',
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      bin: pkg.bin,
      main: pkg.main,
      types: pkg.types ?? pkg.typings,
      exports: pkg.exports,
      dependencies: pkg.dependencies,
      peerDependencies: pkg.peerDependencies,
      engines: pkg.engines,
      rawManifest: content,
    }
  } catch {
    return { ecosystem: 'unknown', rawManifest: content }
  }
}

function parseCargoToml(content: string): ManifestInfo {
  try {
    const doc = parseToml(content) as Record<string, unknown>
    const pkg = (doc.package ?? {}) as Record<string, unknown>

    const name = typeof pkg.name === 'string' ? pkg.name : undefined
    const version = typeof pkg.version === 'string' ? pkg.version : undefined
    const edition = typeof pkg.edition === 'string' ? pkg.edition : undefined
    const description = typeof pkg.description === 'string'
      ? pkg.description.trim()
      : undefined

    // Parse [[bin]] array of tables
    let bin: Record<string, string> | undefined
    const binEntries = doc.bin
    if (Array.isArray(binEntries)) {
      const entries: Record<string, string> = {}
      for (const entry of binEntries) {
        const e = entry as Record<string, unknown>
        if (typeof e.name === 'string' && typeof e.path === 'string') {
          entries[e.name] = e.path
        }
      }
      if (Object.keys(entries).length > 0) {
        bin = entries
      }
    }

    return {
      ecosystem: 'rust',
      name,
      version,
      edition,
      description,
      bin,
      rawManifest: content,
    }
  } catch (err) {
    console.error('[skill-gen] Failed to parse Cargo.toml:', err)
    return { ecosystem: 'unknown', rawManifest: content }
  }
}

function parseGoMod(content: string): ManifestInfo {
  try {
    const moduleMatch = /^module\s+(\S+)/m.exec(content)
    const goMatch = /^go\s+(\S+)/m.exec(content)

    const modulePath = moduleMatch?.[1]
    const goVersion = goMatch?.[1]

    // Derive package name from last path segment
    const name = modulePath ? modulePath.split('/').pop() : undefined

    return {
      ecosystem: 'go',
      name,
      modulePath,
      goVersion,
      rawManifest: content,
    }
  } catch {
    return { ecosystem: 'unknown', rawManifest: content }
  }
}

function parsePyprojectToml(content: string): ManifestInfo {
  try {
    const doc = parseToml(content) as Record<string, unknown>
    const project = (doc.project ?? {}) as Record<string, unknown>

    const name = typeof project.name === 'string' ? project.name : undefined
    const version = typeof project.version === 'string' ? project.version : undefined
    const description = typeof project.description === 'string'
      ? project.description.trim()
      : undefined
    const requiresPython = typeof project['requires-python'] === 'string'
      ? project['requires-python']
      : undefined

    // Parse [project.scripts]
    let entryPoints: Record<string, string> | undefined
    const scripts = project.scripts
    if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) {
      const entries: Record<string, string> = {}
      for (const [key, val] of Object.entries(scripts as Record<string, unknown>)) {
        if (typeof val === 'string') {
          entries[key] = val
        }
      }
      if (Object.keys(entries).length > 0) {
        entryPoints = entries
      }
    }

    return {
      ecosystem: 'python',
      name,
      version,
      description,
      requiresPython,
      entryPoints,
      rawManifest: content,
    }
  } catch (err) {
    console.error('[skill-gen] Failed to parse pyproject.toml:', err)
    return { ecosystem: 'unknown', rawManifest: content }
  }
}

function parseSetupPy(content: string): ManifestInfo {
  try {
    const getArg = (key: string): string | undefined => {
      const re = new RegExp(`${key}\\s*=\\s*["']([^"']*)["']`)
      return re.exec(content)?.[1]
    }

    const name = getArg('name')
    const version = getArg('version')

    return {
      ecosystem: 'python',
      name,
      version,
      rawManifest: content,
    }
  } catch {
    return { ecosystem: 'unknown', rawManifest: content }
  }
}
