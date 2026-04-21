import type { ClassifyInput, ClassificationResult, RepoType } from './types'

interface TypeScore {
  score: number
  signals: string[]
}

function scoreCliTool(input: ClassifyInput): TypeScore {
  const { manifest, topics, fileTree, readmeHead } = input
  let score = 0
  const signals: string[] = []

  if (manifest.bin !== undefined && manifest.bin !== null) {
    const hasEntries =
      typeof manifest.bin === 'string'
        ? manifest.bin.length > 0
        : Object.keys(manifest.bin).length > 0
    if (hasEntries) {
      score += 0.4
      signals.push('manifest.bin present')
    }
  }

  if (manifest.entryPoints && Object.keys(manifest.entryPoints).length > 0) {
    score += 0.4
    signals.push('manifest.entryPoints (console_scripts) present')
  }

  const cliTopics = ['cli', 'command-line', 'terminal']
  const matchedCliTopics = topics.filter(t => cliTopics.includes(t))
  if (matchedCliTopics.length > 0) {
    score += 0.2
    signals.push(`topics include cli keywords: ${matchedCliTopics.join(', ')}`)
  }

  if (fileTree.some(f => f === 'bin/' || f.startsWith('bin/'))) {
    score += 0.1
    signals.push('file tree has bin/ directory')
  }

  if (/--\w+/.test(readmeHead)) {
    score += 0.1
    signals.push('README head contains flag-like patterns (--flag)')
  }

  return { score, signals }
}

function scoreComponentLibrary(input: ClassifyInput): TypeScore {
  const { manifest, topics, fileTree } = input
  let score = 0
  const signals: string[] = []

  const componentTopics = ['components', 'ui-components', 'design-system', 'component-library']
  const matchedTopics = topics.filter(t => componentTopics.includes(t))
  if (matchedTopics.length > 0) {
    const topicScore = Math.min(matchedTopics.length * 0.3, 0.6)
    score += topicScore
    signals.push(`topics include component keywords: ${matchedTopics.join(', ')}`)
  }

  if (manifest.name && /ui|components|design.?system/i.test(manifest.name)) {
    score += 0.2
    signals.push('name matches ui/components/design-system pattern')
  }

  const uiExtensions = ['.tsx', '.vue', '.svelte']
  const uiFiles = fileTree.filter(f => uiExtensions.some(ext => f.endsWith(ext)))
  if (uiFiles.length >= 2) {
    score += 0.2
    signals.push(`file tree has ${uiFiles.length} UI component files (.tsx/.vue/.svelte)`)
  }

  return { score, signals }
}

function scoreFramework(input: ClassifyInput): TypeScore {
  const { topics, fileTree, readmeHead } = input
  let score = 0
  const signals: string[] = []

  if (topics.includes('framework')) {
    score += 0.4
    signals.push('topics include "framework"')
  }

  const hasMiddleware = fileTree.some(f => /middleware/.test(f))
  const hasPlugin = fileTree.some(f => /plugin/.test(f))
  if (hasMiddleware || hasPlugin) {
    score += 0.2
    const matched = [hasMiddleware && 'middleware', hasPlugin && 'plugin'].filter(Boolean)
    signals.push(`file tree has ${matched.join('/')} directories/files`)
  }

  if (/scaffold|create.*app|init|getting.?started/i.test(readmeHead)) {
    score += 0.1
    signals.push('README head matches scaffold/create-app/init pattern')
  }

  const hasRouting = fileTree.some(f => /routes?[/\\]|routing/.test(f))
  if (hasRouting) {
    score += 0.1
    signals.push('file tree has routing patterns (routes/routing)')
  }

  return { score, signals }
}

function scoreMonorepo(input: ClassifyInput): TypeScore {
  const { manifest, fileTree } = input
  let score = 0
  const signals: string[] = []

  if (manifest.rawManifest) {
    try {
      const parsed = JSON.parse(manifest.rawManifest)
      if (parsed.workspaces) {
        score += 0.4
        signals.push('rawManifest has "workspaces" field')
      }
    } catch {
      // ignore parse errors
    }
  }

  const monoFiles = ['lerna.json', 'pnpm-workspace.yaml', 'nx.json', 'turbo.json']
  const matchedMono = fileTree.filter(f => monoFiles.includes(f))
  if (matchedMono.length > 0) {
    score += 0.3
    signals.push(`file tree has monorepo config: ${matchedMono.join(', ')}`)
  }

  const packageJsonPattern = /^packages\/[^/]+\/package\.json$/
  const hasPackagesPattern = fileTree.some(f => packageJsonPattern.test(f))
  if (hasPackagesPattern) {
    score += 0.3
    signals.push('file tree has packages/*/package.json pattern')
  }

  return { score, signals }
}

function scoreInfrastructure(input: ClassifyInput): TypeScore {
  const { topics, fileTree, language } = input
  let score = 0
  const signals: string[] = []

  const hasTfFiles = fileTree.some(f => f.endsWith('.tf'))
  if (hasTfFiles) {
    score += 0.4
    signals.push('file tree has .tf files')
  }

  const hasChartYaml = fileTree.some(f => f === 'Chart.yaml' || f.endsWith('/Chart.yaml'))
  if (hasChartYaml) {
    score += 0.3
    signals.push('file tree has Chart.yaml (Helm)')
  }

  const infraTopics = ['terraform', 'kubernetes', 'helm', 'devops', 'docker']
  const matchedTopics = topics.filter(t => infraTopics.includes(t))
  if (matchedTopics.length > 0) {
    score += 0.2
    signals.push(`topics include infra keywords: ${matchedTopics.join(', ')}`)
  }

  if (language === 'HCL') {
    score += 0.3
    signals.push('language is HCL')
  }

  return { score, signals }
}

function scoreLibrary(input: ClassifyInput): TypeScore {
  const { manifest, topics, fileTree } = input
  let score = 0
  const signals: string[] = []

  if (manifest.types || manifest.main) {
    score += 0.3
    const matched = [manifest.types && 'types', manifest.main && 'main'].filter(Boolean)
    signals.push(`manifest has ${matched.join('/')} field`)
  }

  if (manifest.peerDependencies && Object.keys(manifest.peerDependencies).length > 0) {
    score += 0.2
    signals.push('manifest has peerDependencies')
  }

  const libTopics = ['sdk', 'client', 'wrapper', 'library', 'api']
  const matchedTopics = topics.filter(t => libTopics.includes(t))
  if (matchedTopics.length > 0) {
    score += 0.2
    signals.push(`topics include library keywords: ${matchedTopics.join(', ')}`)
  }

  const entryPointFiles = ['index.ts', 'index.js', 'mod.rs', '__init__.py', 'index.tsx']
  const hasEntryPoint = fileTree.some(f => {
    const basename = f.split('/').pop() ?? ''
    return entryPointFiles.includes(basename)
  })
  if (hasEntryPoint) {
    score += 0.2
    signals.push('file tree has entry point file (index.ts/mod.rs/__init__.py)')
  }

  return { score, signals }
}

export function classify(input: ClassifyInput): ClassificationResult {
  const scores: Record<string, TypeScore> = {
    'cli-tool': scoreCliTool(input),
    'component-library': scoreComponentLibrary(input),
    framework: scoreFramework(input),
    monorepo: scoreMonorepo(input),
    infrastructure: scoreInfrastructure(input),
    library: scoreLibrary(input),
  }

  let bestType: RepoType = 'generic'
  let bestScore = 0
  let bestSignals: string[] = []

  // cli-tool is checked first (most specific) — use order-aware resolution
  const order: RepoType[] = ['cli-tool', 'component-library', 'framework', 'monorepo', 'infrastructure', 'library']

  for (const type of order) {
    const { score, signals } = scores[type]
    if (score > bestScore) {
      bestScore = score
      bestType = type
      bestSignals = signals
    }
  }

  if (bestScore < 0.4) {
    return { type: 'generic', confidence: bestScore, signals: bestSignals }
  }

  return { type: bestType, confidence: Math.min(bestScore, 1), signals: bestSignals }
}
