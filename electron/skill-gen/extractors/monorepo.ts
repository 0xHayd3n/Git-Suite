import type { Extractor, ManifestInfo, PackageEntry, ExtractionResult } from '../types'

const MAX_FILES = 15

function getFilesToFetch(fileTree: string[], _manifest: ManifestInfo): string[] {
  const selected = new Set<string>()

  // Workspace config files
  const workspaceConfigs = ['lerna.json', 'pnpm-workspace.yaml', 'pnpm-workspace.yml', 'nx.json']
  const treeSet = new Set(fileTree)
  for (const cfg of workspaceConfigs) {
    if (treeSet.has(cfg) && selected.size < MAX_FILES) {
      selected.add(cfg)
    }
  }

  // Sub-package manifest files
  for (const file of fileTree) {
    if (selected.size >= MAX_FILES) break
    if (file.endsWith('/package.json') || file.endsWith('\\package.json')) {
      const lower = file.toLowerCase()
      if (
        lower.startsWith('packages/') ||
        lower.startsWith('apps/') ||
        lower.startsWith('libs/') ||
        lower.startsWith('services/') ||
        lower.includes('/packages/') ||
        lower.includes('/apps/')
      ) {
        selected.add(file)
      }
    }
  }

  return Array.from(selected)
}

function extract(files: Map<string, string>, _manifest: ManifestInfo): Partial<ExtractionResult> {
  const packages: PackageEntry[] = []

  for (const [filePath, content] of files) {
    if (!filePath.endsWith('package.json')) continue

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(content)
    } catch {
      continue
    }

    const name = typeof parsed.name === 'string' ? parsed.name : undefined
    if (!name) continue

    // Determine the path (directory of the package.json)
    const pkgPath = filePath.replace(/[/\\]?package\.json$/, '') || '.'

    const entry: PackageEntry = { name, path: pkgPath }

    if (typeof parsed.description === 'string' && parsed.description) {
      entry.description = parsed.description
    }

    // Main export: prefer "main" field, fall back to "module", "exports" root
    if (typeof parsed.main === 'string') {
      entry.mainExport = parsed.main
    } else if (typeof parsed.module === 'string') {
      entry.mainExport = parsed.module
    } else if (parsed.exports && typeof parsed.exports === 'object') {
      const exportsObj = parsed.exports as Record<string, unknown>
      const rootExport = exportsObj['.']
      if (typeof rootExport === 'string') {
        entry.mainExport = rootExport
      }
    }

    packages.push(entry)
  }

  if (packages.length === 0) return {}
  return { packages }
}

export const monorepoExtractor: Extractor = {
  getFilesToFetch,
  extract,
}
