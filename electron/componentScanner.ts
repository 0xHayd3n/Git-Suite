// electron/componentScanner.ts
import { ipcMain } from 'electron'
import { getToken } from './store'
import { getRepoTree, getFileContent } from './github'
import { detectFramework, detectFrameworkFromTree, isComponentFile } from '../src/utils/componentScanner'
import type { ComponentScanResult, Framework, ScannedComponent } from '../src/types/components'

async function batchFetch<T>(
  items: string[],
  batchSize: number,
  fn: (item: string) => Promise<T | null>,
): Promise<(T | null)[]> {
  const results: (T | null)[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

export async function scanComponents(
  owner: string,
  name: string,
  branch: string,
): Promise<ComponentScanResult> {
  // Validate inputs — values come from renderer via IPC and are interpolated into URLs
  const safe = /^[\w.\-]+$/
  if (!safe.test(owner) || !safe.test(name) || !safe.test(branch)) {
    return { framework: 'unknown', components: [] }
  }

  try {
    const token = getToken() ?? null   // getToken() returns string | undefined; helpers need string | null

    // 1. Detect framework from package.json
    let framework: Framework = 'unknown'
    const pkgSource = await getFileContent(token, owner, name, 'package.json').catch(() => null)
    if (pkgSource) {
      try {
        const pkg = JSON.parse(pkgSource) as {
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
        framework = detectFramework(deps)
      } catch { /* malformed package.json — leave as unknown */ }
    }

    // 2. Fetch the full file tree
    const tree = await getRepoTree(token, owner, name, branch).catch(() => [] as { path: string; type: string }[])
    const filePaths = tree.filter(n => n.type === 'blob').map(n => n.path)

    // 3. Fallback: detect framework from file extensions
    if (framework === 'unknown') {
      framework = detectFrameworkFromTree(filePaths)
    }

    // 4. Filter to component files
    const candidates = filePaths
      .filter(p => isComponentFile(p, framework))

    // 5. Fetch source in batches of 10
    const sources = await batchFetch(candidates, 10, path =>
      getFileContent(token, owner, name, path).catch(() => null),
    )

    const components: ScannedComponent[] = candidates
      .map((path, i) => ({ path, source: sources[i] ?? '' }))
      .filter(c => c.source.length > 0)

    return { framework, components }
  } catch {
    return { framework: 'unknown', components: [] }
  }
}

export function registerComponentsIPC(): void {
  ipcMain.handle(
    'components:scan',
    (_event, owner: string, name: string, branch: string) =>
      scanComponents(owner, name, branch),
  )

  ipcMain.handle(
    'components:compile',
    async (_event, source: string, framework = 'react'): Promise<string | null> => {
      try {
        // Use require() — the main process output is CJS, and esbuild ships a
        // native binary that must not be bundled.  Dynamic import() can silently
        // fail in Rollup/CJS contexts; require() is always reliable here.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { transform } = require('esbuild') as typeof import('esbuild')

        let loader: import('esbuild').Loader
        let jsx: import('esbuild').TransformOptions['jsx']
        let jsxImportSource: string | undefined

        if (framework === 'solid') {
          loader = 'tsx'
          jsx = 'automatic'
          jsxImportSource = 'solid-js'
        } else if (framework === 'angular' || framework === 'typescript') {
          loader = 'ts'
          jsx = undefined
          jsxImportSource = undefined
        } else {
          // react (default) and anything else
          loader = 'tsx'
          jsx = 'automatic'
          jsxImportSource = 'react'
        }

        const result = await transform(source, {
          loader,
          ...(jsx !== undefined ? { jsx } : {}),
          ...(jsxImportSource !== undefined ? { jsxImportSource } : {}),
          target:    'es2020',
          format:    'esm',
          sourcemap: false,
        })
        return result.code
      } catch (err) {
        console.error('[components:compile] esbuild transform failed:', err)
        return null
      }
    },
  )
}
