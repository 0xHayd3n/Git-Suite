// src/utils/componentScanner.ts
import type { Framework } from '../types/components'

const FRAMEWORK_PACKAGES: [string, Framework][] = [
  ['@angular/core', 'angular'],
  ['solid-js',      'solid'],
  ['svelte',        'svelte'],
  ['vue',           'vue'],
  ['react',         'react'],
  ['react-dom',     'react'],
]

export function detectFramework(deps: Record<string, string>): Framework {
  for (const [pkg, framework] of FRAMEWORK_PACKAGES) {
    if (pkg in deps) return framework
  }
  return 'unknown'
}

export function detectFrameworkFromTree(paths: string[]): Framework {
  if (paths.some(p => /\.component\.ts$/.test(p)))      return 'angular'
  if (paths.some(p => p.endsWith('.vue')))               return 'vue'
  if (paths.some(p => p.endsWith('.svelte')))            return 'svelte'
  if (paths.some(p => p.endsWith('.tsx') || p.endsWith('.jsx'))) return 'react'
  if (paths.some(p => p.endsWith('.js')))                        return 'javascript'
  if (paths.some(p => p.endsWith('.ts')))                        return 'typescript'
  return 'unknown'
}

const VALID_EXTENSIONS: Record<Framework, string[]> = {
  react:      ['tsx', 'jsx', 'js'],
  solid:      ['tsx', 'jsx', 'js'],
  vue:        ['vue', 'js'],
  svelte:     ['svelte'],
  angular:    ['ts', 'tsx'],
  javascript: ['js'],
  typescript: ['ts'],
  unknown:    ['tsx', 'jsx', 'js', 'ts'],
}

const INCLUDE_PATTERNS = [
  '/components/', '/component/', '/ui/', '/primitives/', '/elements/', '/modules/',
]

export function isComponentFile(path: string, framework: Framework): boolean {
  const filename = path.split('/').pop() ?? ''
  const ext = filename.includes('.') ? filename.split('.').pop() ?? '' : ''

  // Extension check
  if (!VALID_EXTENSIONS[framework].includes(ext)) return false

  // Exclude patterns (checked before include to short-circuit early)
  if (/\.(test|spec|stories)\.[^.]+$/.test(filename))              return false
  if (/\.d\.[^.]+$/.test(filename))                                return false
  if (/^index\./.test(filename))                                     return false
  if (/(__tests__|__mocks__|node_modules|dist|\.storybook|(^|\/)tasks\/|(^|\/)scripts\/|(^|\/)build\/|(^|\/)tools\/|(^|\/)config\/)/.test(path)) return false

  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')

  // Always exclude React hooks (use* pattern)
  if (/^use[A-Z]/.test(nameWithoutExt))                             return false

  // Include patterns
  const inIncludeDir = INCLUDE_PATTERNS.some(p => path.includes(p))
  const isFlatSrcRoot = /^src\/[A-Z][^/]+\.(tsx|jsx|js|vue|svelte)$/.test(path)
  const isMonorepoSrc = /^packages\/[^/]+\/src\//.test(path) && INCLUDE_PATTERNS.some(p => path.includes(p))

  if (!inIncludeDir && !isFlatSrcRoot && !isMonorepoSrc) return false

  // Outside a known component directory, require PascalCase to avoid picking up
  // utility modules. Inside /components/, /ui/, etc. trust the directory.
  if (!inIncludeDir && !isMonorepoSrc && nameWithoutExt === nameWithoutExt.toLowerCase()) return false

  return true
}
