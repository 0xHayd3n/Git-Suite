import type { McpTool, McpScanResult } from '../src/types/mcp'

const STATIC_TS_RX = /server\.(?:registerTool|tool)\s*\(\s*(['"])([\w.-]+)\1(?:\s*,\s*(\{[^}]*\}))?/g
const DESC_RX      = /description\s*:\s*(['"])(.*?)\1/

export function parseStaticTS(source: string): McpTool[] {
  const tools: McpTool[] = []
  let match: RegExpExecArray | null
  STATIC_TS_RX.lastIndex = 0
  while ((match = STATIC_TS_RX.exec(source)) !== null) {
    const name = match[2]
    const objBody = match[3] ?? ''
    const descMatch = objBody ? DESC_RX.exec(objBody) : null
    tools.push({
      name,
      description: descMatch?.[2] ?? null,
      category:    null,
      paramSchema: null,
      source:      'static',
    })
  }
  return tools
}

// Two-pass parse: find each `@mcp.tool(...)\ndef name(...):`, then peek at the
// following line for an optional docstring (triple- or single-quoted).
const PY_DECL_RX = /@mcp\.tool\s*\([^)]*\)\s*\n\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\([^)]*\)(?:\s*->\s*[^:]+)?\s*:/g
const PY_DOCSTRING_RX = /^[ \t]*(?:("{3}|'{3})([\s\S]*?)\1|(['"])([^\r\n]*?)\3)/

export function parseStaticPy(source: string): McpTool[] {
  const tools: McpTool[] = []
  let match: RegExpExecArray | null
  PY_DECL_RX.lastIndex = 0
  while ((match = PY_DECL_RX.exec(source)) !== null) {
    const name = match[1]
    // Peek at the body directly after the `def ... :` header
    const after = source.slice(PY_DECL_RX.lastIndex).replace(/^\s*\n/, '')
    const doc = PY_DOCSTRING_RX.exec(after)
    const raw = doc ? (doc[2] ?? doc[4]) : null
    const description = raw ? raw.trim().split(/\r?\n/)[0].trim() : null
    tools.push({ name, description, category: null, paramSchema: null, source: 'static' })
  }
  return tools
}

export function parseManifest(source: string): McpTool[] {
  try {
    const data = JSON.parse(source) as { tools?: Array<{ name?: string; description?: string; category?: string }> }
    if (!Array.isArray(data.tools)) return []
    return data.tools
      .filter(t => typeof t.name === 'string' && t.name.length > 0)
      .map(t => ({
        name:        t.name!,
        description: typeof t.description === 'string' ? t.description : null,
        category:    typeof t.category    === 'string' ? t.category    : null,
        paramSchema: null,
        source:      'manifest' as const,
      }))
  } catch {
    return []
  }
}

const README_TOOLS_HEADING_RX = /^##\s+(?:Available\s+)?Tools\s*$/im

export function parseReadme(source: string): McpTool[] {
  const match = README_TOOLS_HEADING_RX.exec(source)
  if (!match) return []
  const start = match.index + match[0].length
  const rest = source.slice(start)
  const nextHeading = /\n##\s+/.exec(rest)
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest

  const tools: McpTool[] = []
  // Bullet forms: `- \`name\` — description`, `- \`name\`: description`, `- \`name\``
  const bulletRx = /^\s*[-*]\s+`([\w.-]+)`\s*(?:[\u2014\u2013\-:]\s*(.+))?$/gm
  let m: RegExpExecArray | null
  while ((m = bulletRx.exec(section)) !== null) {
    const desc = (m[2] ?? '').trim()
    tools.push({
      name: m[1],
      description: desc.length > 0 ? desc : null,
      category: null,
      paramSchema: null,
      source: 'readme-approx',
    })
  }
  return tools
}

export interface ScanSources {
  staticSources: string[]
  manifestSource: string | null
  readmeSource:   string | null
}

export function scanFromSources(src: ScanSources): McpScanResult {
  const detectedAt = new Date().toISOString()

  const staticTools = src.staticSources.flatMap(s => [...parseStaticTS(s), ...parseStaticPy(s)])
  if (staticTools.length > 0) {
    return { tools: staticTools, source: 'static', detectedAt }
  }

  if (src.manifestSource) {
    const manifestTools = parseManifest(src.manifestSource)
    if (manifestTools.length > 0) {
      return { tools: manifestTools, source: 'manifest', detectedAt }
    }
  }

  if (src.readmeSource) {
    const readmeTools = parseReadme(src.readmeSource)
    if (readmeTools.length > 0) {
      return { tools: readmeTools, source: 'readme-approx', detectedAt }
    }
  }

  return { tools: [], source: 'static', detectedAt }
}
