import type { Extractor, ManifestInfo, PluginEntry, ConfigEntry, ExtractionResult } from '../types'

const MAX_FILES = 15

function getFilesToFetch(fileTree: string[], _manifest: ManifestInfo): string[] {
  const selected = new Set<string>()

  // Entry points
  const entryPoints = [
    'src/index.ts', 'src/index.js', 'index.ts', 'index.js',
    'app.ts', 'app.js', 'main.py', 'app.py', 'wsgi.py', 'asgi.py',
  ]
  const treeSet = new Set(fileTree)
  for (const ep of entryPoints) {
    if (treeSet.has(ep) && selected.size < MAX_FILES) {
      selected.add(ep)
    }
  }

  const patterns = ['middleware', 'plugin', 'config', 'routes', 'route', 'router']
  for (const file of fileTree) {
    if (selected.size >= MAX_FILES) break
    const lower = file.toLowerCase()
    if (patterns.some(p => lower.includes(p))) {
      selected.add(file)
    }
  }

  return Array.from(selected)
}

// ─── Express / Koa extraction ────────────────────────────────────────────────

function extractExpressPlugins(content: string): PluginEntry[] {
  const plugins: PluginEntry[] = []
  const seen = new Set<string>()

  // app.use(middleware()) or app.use('/path', middleware)
  const useRegex = /app\.use\(\s*(?:['"][^'"]*['"]\s*,\s*)?(\w+)\s*[\(,)]/g
  let m: RegExpExecArray | null
  while ((m = useRegex.exec(content)) !== null) {
    const name = m[1]
    if (name === 'express' || name === 'app' || name === 'router') continue
    if (!seen.has(name)) {
      seen.add(name)
      plugins.push({ name, hookPoint: 'middleware' })
    }
  }

  return plugins
}

function extractExpressRoutes(content: string): PluginEntry[] {
  const plugins: PluginEntry[] = []
  const seen = new Set<string>()

  // router.get/post/put/delete('/path', handler)
  const routeRegex = /(?:router|app)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = routeRegex.exec(content)) !== null) {
    const method = m[1]
    const path = m[2]
    const name = `${method.toUpperCase()} ${path}`
    if (!seen.has(name)) {
      seen.add(name)
      plugins.push({ name, hookPoint: 'route', signature: method.toUpperCase() })
    }
  }

  return plugins
}

// ─── FastAPI / Flask extraction ──────────────────────────────────────────────

function extractFastApiRoutes(content: string): PluginEntry[] {
  const plugins: PluginEntry[] = []
  const seen = new Set<string>()

  // @app.get("/path"), @app.post("/path"), etc.
  const routeRegex = /@app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = routeRegex.exec(content)) !== null) {
    const method = m[1]
    const path = m[2]
    const name = `${method.toUpperCase()} ${path}`
    if (!seen.has(name)) {
      seen.add(name)
      plugins.push({ name, hookPoint: 'route', signature: method.toUpperCase() })
    }
  }

  // @app.route("/path", methods=["GET",...])
  const flaskRegex = /@app\.route\(\s*['"]([^'"]+)['"]/g
  while ((m = flaskRegex.exec(content)) !== null) {
    const path = m[1]
    const name = `route:${path}`
    if (!seen.has(name)) {
      seen.add(name)
      plugins.push({ name, hookPoint: 'route', signature: path })
    }
  }

  return plugins
}

// ─── Django extraction ───────────────────────────────────────────────────────

function extractDjangoRoutes(content: string): PluginEntry[] {
  const plugins: PluginEntry[] = []
  const seen = new Set<string>()

  // path('route/', view_func, name='name')
  const pathRegex = /path\(\s*['"]([^'"]*)['"]\s*,\s*(\w+)/g
  let m: RegExpExecArray | null
  while ((m = pathRegex.exec(content)) !== null) {
    const route = m[1]
    const view = m[2]
    const name = `path:${route}`
    if (!seen.has(name)) {
      seen.add(name)
      plugins.push({ name, hookPoint: 'urlpattern', signature: view })
    }
  }

  return plugins
}

// ─── Config schema extraction ─────────────────────────────────────────────────

function extractConfigSchema(content: string): ConfigEntry[] {
  const configs: ConfigEntry[] = []
  const seen = new Set<string>()

  // Object literal patterns: key: value or key = value in config-like contexts
  const configObjRegex = /(?:config|options|settings)\s*[=:]\s*\{([^}]{1,2000})\}/gs
  let m: RegExpExecArray | null
  while ((m = configObjRegex.exec(content)) !== null) {
    const body = m[1]
    const keyRegex = /(\w+)\s*:\s*([^,\n}]+)/g
    let km: RegExpExecArray | null
    while ((km = keyRegex.exec(body)) !== null) {
      const key = km[1]
      const val = km[2].trim()
      if (!seen.has(key) && key.length > 1) {
        seen.add(key)
        const type = /^['"]/.test(val) ? 'string' : /^\d/.test(val) ? 'number' : /^(true|false)$/.test(val) ? 'boolean' : 'string'
        configs.push({ key, type, default: val.replace(/^['"]|['"]$/g, '').slice(0, 50) })
      }
    }
  }

  return configs
}

function extract(files: Map<string, string>, manifest: ManifestInfo): Partial<ExtractionResult> {
  const allPlugins: PluginEntry[] = []
  const allConfig: ConfigEntry[] = []
  const seenPlugin = new Set<string>()
  const seenConfig = new Set<string>()

  const isNode = manifest.ecosystem === 'node' || manifest.ecosystem === 'unknown'
  const isPython = manifest.ecosystem === 'python'

  for (const [filePath, content] of files) {
    let plugins: PluginEntry[] = []

    if (isNode) {
      const expressPlugins = extractExpressPlugins(content)
      const expressRoutes = extractExpressRoutes(content)
      plugins = [...expressPlugins, ...expressRoutes]

      const cfgs = extractConfigSchema(content)
      for (const c of cfgs) {
        if (!seenConfig.has(c.key)) {
          seenConfig.add(c.key)
          allConfig.push(c)
        }
      }
    }

    if (isPython || filePath.endsWith('.py')) {
      if (content.includes('@app.route') || content.includes('@app.get') || content.includes('@app.post')) {
        plugins = extractFastApiRoutes(content)
      } else if (content.includes('urlpatterns') || content.includes('path(')) {
        plugins = extractDjangoRoutes(content)
      }
    }

    for (const p of plugins) {
      if (!seenPlugin.has(p.name)) {
        seenPlugin.add(p.name)
        allPlugins.push(p)
      }
    }
  }

  const result: Partial<ExtractionResult> = {}
  if (allPlugins.length > 0) result.plugins = allPlugins
  if (allConfig.length > 0) result.configSchema = allConfig
  return result
}

export const frameworkExtractor: Extractor = {
  getFilesToFetch,
  extract,
}
