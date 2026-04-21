import type { Extractor, ManifestInfo, ResourceEntry, ConfigEntry, ExtractionResult } from '../types'

const MAX_FILES = 15

function getFilesToFetch(fileTree: string[], _manifest: ManifestInfo): string[] {
  const selected = new Set<string>()

  const exactFiles = ['values.yaml', 'values.yml']
  const treeSet = new Set(fileTree)
  for (const f of exactFiles) {
    if (treeSet.has(f) && selected.size < MAX_FILES) {
      selected.add(f)
    }
  }

  for (const file of fileTree) {
    if (selected.size >= MAX_FILES) break
    if (file.endsWith('.tf') || file.endsWith('.tfvars')) {
      selected.add(file)
    }
  }

  // Also capture nested values.yaml / values.yml in helm charts
  for (const file of fileTree) {
    if (selected.size >= MAX_FILES) break
    const lower = file.toLowerCase()
    if (lower.endsWith('/values.yaml') || lower.endsWith('/values.yml')) {
      selected.add(file)
    }
  }

  return Array.from(selected)
}

// ─── Terraform extraction ─────────────────────────────────────────────────────

function extractTerraformVariables(content: string): ConfigEntry[] {
  const configs: ConfigEntry[] = []

  // variable "name" { type = ... default = ... description = ... }
  const varRegex = /variable\s+"(\w+)"\s*\{([^}]{0,1000})\}/gs
  let m: RegExpExecArray | null
  while ((m = varRegex.exec(content)) !== null) {
    const key = m[1]
    const body = m[2]

    const typeMatch = body.match(/type\s*=\s*(\w+)/)
    const defaultMatch = body.match(/default\s*=\s*"([^"]*)"/) ?? body.match(/default\s*=\s*([^\n]+)/)
    const descMatch = body.match(/description\s*=\s*"([^"]*)"/)

    const entry: ConfigEntry = {
      key,
      type: typeMatch?.[1] ?? 'string',
    }
    if (defaultMatch) entry.default = defaultMatch[1].trim().replace(/^["']|["']$/g, '')
    if (descMatch) entry.description = descMatch[1]

    configs.push(entry)
  }

  return configs
}

function extractTerraformResources(content: string): ResourceEntry[] {
  const resources: ResourceEntry[] = []

  // resource "type" "name" { ... }
  const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g
  let m: RegExpExecArray | null
  while ((m = resourceRegex.exec(content)) !== null) {
    const type = m[1]
    const name = m[2]
    resources.push({ type, name })
  }

  return resources
}

// ─── Helm values.yaml extraction ──────────────────────────────────────────────

function extractHelmValues(content: string): ConfigEntry[] {
  const configs: ConfigEntry[] = []

  // Parse top-level YAML keys with their values (simple key: value pairs)
  const keyValueRegex = /^(\w[\w.]*)\s*:\s*(.+)$/gm
  let m: RegExpExecArray | null
  const seen = new Set<string>()

  while ((m = keyValueRegex.exec(content)) !== null) {
    const key = m[1]
    const rawValue = m[2].trim()

    // Skip YAML comments and complex nested structures
    if (rawValue.startsWith('#') || rawValue === '|' || rawValue === '>') continue
    if (seen.has(key)) continue
    seen.add(key)

    const type = /^\d+(\.\d+)?$/.test(rawValue)
      ? 'number'
      : /^(true|false)$/.test(rawValue)
        ? 'boolean'
        : 'string'

    configs.push({
      key,
      type,
      default: rawValue.replace(/^["']|["']$/g, '').slice(0, 100),
    })
  }

  return configs
}

function extract(files: Map<string, string>, _manifest: ManifestInfo): Partial<ExtractionResult> {
  const allResources: ResourceEntry[] = []
  const allConfig: ConfigEntry[] = []
  const seenResource = new Set<string>()
  const seenConfig = new Set<string>()

  for (const [filePath, content] of files) {
    if (filePath.endsWith('.tf') || filePath.endsWith('.tfvars')) {
      const variables = extractTerraformVariables(content)
      for (const v of variables) {
        if (!seenConfig.has(v.key)) {
          seenConfig.add(v.key)
          allConfig.push(v)
        }
      }

      const resources = extractTerraformResources(content)
      for (const r of resources) {
        const key = `${r.type}.${r.name}`
        if (!seenResource.has(key)) {
          seenResource.add(key)
          allResources.push(r)
        }
      }
    } else if (filePath.endsWith('values.yaml') || filePath.endsWith('values.yml')) {
      const helmVars = extractHelmValues(content)
      for (const v of helmVars) {
        if (!seenConfig.has(v.key)) {
          seenConfig.add(v.key)
          allConfig.push(v)
        }
      }
    }
  }

  const result: Partial<ExtractionResult> = {}
  if (allResources.length > 0) result.resources = allResources
  if (allConfig.length > 0) result.configSchema = allConfig
  return result
}

export const infrastructureExtractor: Extractor = {
  getFilesToFetch,
  extract,
}
