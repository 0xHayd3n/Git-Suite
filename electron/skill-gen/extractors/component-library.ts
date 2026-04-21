import type { Extractor, ManifestInfo, ComponentEntry, ExtractionResult } from '../types'

const MAX_FILES = 15

function getFilesToFetch(fileTree: string[], _manifest: ManifestInfo): string[] {
  const selected = new Set<string>()

  for (const file of fileTree) {
    if (selected.size >= MAX_FILES) break
    const lower = file.toLowerCase()
    const isComponentFile = file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.vue') || file.endsWith('.svelte')
    const isInComponentDir = lower.includes('src/') || lower.includes('components/')
    if (isComponentFile && isInComponentDir) {
      selected.add(file)
    }
  }

  // Also pick up top-level .tsx/.jsx/.vue/.svelte files
  for (const file of fileTree) {
    if (selected.size >= MAX_FILES) break
    if (file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.vue') || file.endsWith('.svelte')) {
      selected.add(file)
    }
  }

  return Array.from(selected)
}

// ─── React prop extraction ────────────────────────────────────────────────────

interface PropDef {
  name: string
  type: string
  required: boolean
  defaultValue?: string
}

function parsePropsFromInterface(interfaceBody: string): PropDef[] {
  const props: PropDef[] = []
  // Match: propName?: type or propName: type
  const propRegex = /^\s*(\w+)(\??):\s*([^\n;]+)/gm
  let m: RegExpExecArray | null
  while ((m = propRegex.exec(interfaceBody)) !== null) {
    const name = m[1]
    const optional = m[2] === '?'
    const type = m[3].trim().replace(/;$/, '')
    // Skip index signatures
    if (name === '[') continue
    props.push({ name, type, required: !optional })
  }
  return props
}

function extractReactComponents(content: string, filePath: string): ComponentEntry[] {
  const components: ComponentEntry[] = []

  // Find interface/type definitions for props
  const interfaceMap = new Map<string, PropDef[]>()

  // Match: interface XxxProps { ... }
  const interfaceRegex = /interface\s+(\w+Props)\s*\{([^}]{1,3000})\}/gs
  let m: RegExpExecArray | null
  while ((m = interfaceRegex.exec(content)) !== null) {
    const name = m[1]
    const body = m[2]
    interfaceMap.set(name, parsePropsFromInterface(body))
  }

  // Match: type XxxProps = { ... }
  const typeRegex = /type\s+(\w+Props)\s*=\s*\{([^}]{1,3000})\}/gs
  while ((m = typeRegex.exec(content)) !== null) {
    const name = m[1]
    const body = m[2]
    interfaceMap.set(name, parsePropsFromInterface(body))
  }

  // Match exported function components: export function Xxx(...) or export const Xxx = ...
  const funcRegex = /^export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w*)/gm
  const seen = new Set<string>()

  while ((m = funcRegex.exec(content)) !== null) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)

    // Try to find matching props interface
    const propsKey = `${name}Props`
    const props = interfaceMap.get(propsKey) ?? []

    // If no interface found, try to parse inline props from the function signature
    if (props.length === 0) {
      // Look for the function block after the match to find props
      const rest = content.slice(m.index)
      const sigMatch = rest.match(/^export\s+(?:default\s+)?(?:function|const)\s+\w+\s*=?\s*(?:<[^>]*>)?\s*\(\s*\{([^}]*)\}/)
      if (sigMatch) {
        const paramBody = sigMatch[1]
        const paramRegex = /(\w+)(?:\s*=\s*([^,}]+))?/g
        let pm: RegExpExecArray | null
        while ((pm = paramRegex.exec(paramBody)) !== null) {
          const pname = pm[1]
          const defVal = pm[2]?.trim()
          if (pname === 'children' || /^\w+$/.test(pname)) {
            props.push({
              name: pname,
              type: 'unknown',
              required: !defVal,
              ...(defVal ? { defaultValue: defVal } : {}),
            })
          }
        }
      }
    }

    components.push({ name, props })
  }

  return components
}

// ─── Vue SFC extraction ───────────────────────────────────────────────────────

function extractVueComponents(content: string, filePath: string): ComponentEntry[] {
  const components: ComponentEntry[] = []

  // Get component name from filename
  const fileName = filePath.split('/').pop() ?? filePath
  const name = fileName.replace(/\.(vue|tsx|svelte)$/, '')
  if (!name || !/^[A-Z]/.test(name)) return []

  const props: PropDef[] = []

  // defineProps<{ prop: type }>() style
  const definePropsTyped = content.match(/defineProps<\{([^}]{1,2000})\}>/)
  if (definePropsTyped) {
    const parsed = parsePropsFromInterface(definePropsTyped[1])
    props.push(...parsed)
  }

  // defineProps({ prop: { type: ..., required: ..., default: ... } }) style
  const definePropsObj = content.match(/defineProps\(\{([^}]{1,2000})\}/)
  if (definePropsObj && !definePropsTyped) {
    const body = definePropsObj[1]
    const propRegex = /(\w+)\s*:\s*\{([^}]+)\}/g
    let m: RegExpExecArray | null
    while ((m = propRegex.exec(body)) !== null) {
      const pname = m[1]
      const opts = m[2]
      const typeMatch = opts.match(/type\s*:\s*(\w+)/)
      const requiredMatch = opts.match(/required\s*:\s*(true|false)/)
      const defaultMatch = opts.match(/default\s*:\s*([^,}]+)/)
      props.push({
        name: pname,
        type: typeMatch?.[1] ?? 'unknown',
        required: requiredMatch?.[1] === 'true',
        ...(defaultMatch ? { defaultValue: defaultMatch[1].trim() } : {}),
      })
    }
  }

  // Options API: props: { ... } or props: ['a', 'b']
  const optionsPropsObj = content.match(/props\s*:\s*\{([^}]{1,2000})\}/)
  if (optionsPropsObj && props.length === 0) {
    const body = optionsPropsObj[1]
    const propRegex = /(\w+)\s*:\s*\{([^}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = propRegex.exec(body)) !== null) {
      const pname = m[1]
      const opts = m[2]
      const typeMatch = opts.match(/type\s*:\s*(\w+)/)
      const requiredMatch = opts.match(/required\s*:\s*(true|false)/)
      props.push({
        name: pname,
        type: typeMatch?.[1] ?? 'unknown',
        required: requiredMatch?.[1] === 'true',
      })
    }
  }

  if (props.length > 0 || content.includes('defineProps') || content.includes('<script')) {
    components.push({ name, props })
  }

  return components
}

function extract(files: Map<string, string>, _manifest: ManifestInfo): Partial<ExtractionResult> {
  const allComponents: ComponentEntry[] = []
  const seen = new Set<string>()

  for (const [filePath, content] of files) {
    let components: ComponentEntry[] = []

    if (filePath.endsWith('.vue')) {
      components = extractVueComponents(content, filePath)
    } else if (filePath.endsWith('.svelte')) {
      components = extractVueComponents(content, filePath) // svelte uses similar prop patterns
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      components = extractReactComponents(content, filePath)
    }

    for (const c of components) {
      if (!seen.has(c.name)) {
        seen.add(c.name)
        allComponents.push(c)
      }
    }
  }

  if (allComponents.length === 0) return {}
  return { components: allComponents }
}

export const componentLibraryExtractor: Extractor = {
  getFilesToFetch,
  extract,
}
