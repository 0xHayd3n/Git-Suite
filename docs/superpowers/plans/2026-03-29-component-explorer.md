# Component Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `StackBlitzExplorer` with a custom `ComponentExplorer` that scans a GitHub repo's file tree, parses component props, and renders each component live in a sandboxed iframe using in-browser compilation, with per-component fallback to syntax-highlighted source code.

**Architecture:** A new `components:scan` IPC handler in `electron/componentScanner.ts` fetches `package.json` + file tree + component sources from GitHub API. Pure utility functions in `src/utils/` parse components and build sandboxed iframe HTML per framework (React/Vue/Svelte/Solid). `ComponentExplorer.tsx` calls the IPC handler on mount and renders a two-pane sidebar + preview layout reusing all existing `.sb-*` CSS classes.

**Tech Stack:** React 18, TypeScript, Vitest, Electron IPC, GitHub REST API, Babel standalone (React), Vue compiler browser build (Vue), Svelte browser compiler (Svelte), existing `.sb-*` CSS classes

**Spec:** `docs/superpowers/specs/2026-03-29-component-explorer-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/components.ts` | Create | Shared types: `Framework`, `ScannedComponent`, `ComponentScanResult` |
| `electron/github.ts` | Modify | Add `getRepoTree` and `getFileContent` helpers |
| `src/utils/componentScanner.ts` | Create | Pure functions: `detectFramework`, `detectFrameworkFromTree`, `isComponentFile` |
| `src/utils/componentScanner.test.ts` | Create | Unit tests for scanner pure functions |
| `electron/componentScanner.ts` | Create | `scanComponents` async function + `registerComponentsIPC` |
| `electron/main.ts` | Modify | Call `registerComponentsIPC()` |
| `electron/preload.ts` | Modify | Add `window.api.components.scan` bridge |
| `src/env.d.ts` | Modify | Add `components.scan` to `Window['api']` type |
| `src/utils/componentParser.ts` | Create | `parseComponent`: extract component name + props from source |
| `src/utils/componentParser.test.ts` | Create | Unit tests for prop parsing per framework |
| `src/utils/propsGenerator.ts` | Create | `generateProps`: turn parsed prop types into default values |
| `src/utils/propsGenerator.test.ts` | Create | Unit tests for default value generation |
| `src/utils/iframeTemplate.ts` | Create | `buildIframeHtml` + `stubLocalImports`: build sandboxed iframe HTML per framework |
| `src/utils/iframeTemplate.test.ts` | Create | Unit tests for import stubbing and HTML structure |
| `src/components/ComponentExplorer.tsx` | Create | Two-pane UI: sidebar list + iframe/code-fallback preview + props table |
| `src/views/RepoDetail.tsx` | Modify | Swap `StackBlitzExplorer` → `ComponentExplorer` |
| `src/components/StackBlitzExplorer.tsx` | Delete | Fully replaced by `ComponentExplorer` |

---

## Task 1: Shared types + GitHub API helpers

**Files:**
- Create: `src/types/components.ts`
- Modify: `electron/github.ts`

### Step 1: Create the shared types file

- [ ] Create `src/types/components.ts`:

```ts
// src/types/components.ts
export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'angular' | 'unknown'

export interface ScannedComponent {
  path: string    // e.g. "src/components/Button.tsx"
  source: string  // raw file content
}

export interface ComponentScanResult {
  framework: Framework
  components: ScannedComponent[]
}
```

### Step 2: Add `getRepoTree` and `getFileContent` to `electron/github.ts`

- [ ] Open `electron/github.ts`. After the last exported function (around line 230+), add:

```ts
export async function getRepoTree(
  token: string | null,
  owner: string,
  name: string,
  branch: string,
): Promise<{ path: string; type: string }[]> {
  const res = await fetch(
    `${BASE}/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
    { headers: githubHeaders(token) },
  )
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = (await res.json()) as { tree: { path: string; type: string }[] }
  return data.tree
}

export async function getFileContent(
  token: string | null,
  owner: string,
  name: string,
  path: string,
): Promise<string | null> {
  // Do NOT encodeURIComponent(path) — that encodes '/' as '%2F' which causes a 404.
  // Path segments (owner, name) are already safe; path is a tree path like src/components/Button.tsx.
  const res = await fetch(
    `${BASE}/repos/${owner}/${name}/contents/${path}`,
    { headers: githubHeaders(token) },
  )
  if (res.status === 404) return null
  if (!res.ok) return null
  const data = (await res.json()) as { content?: string; encoding?: string }
  if (!data.content || data.encoding !== 'base64') return null
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
}
```

### Step 3: Verify TypeScript compiles

- [ ] Run:
```bash
npx tsc --noEmit
```
Expected: no new errors from these two files.

### Step 4: Commit

- [ ] Run:
```bash
git add src/types/components.ts electron/github.ts
git commit -m "feat: add shared component types and GitHub tree/content API helpers"
```

---

## Task 2: Component scanner pure functions + tests

**Files:**
- Create: `src/utils/componentScanner.ts`
- Create: `src/utils/componentScanner.test.ts`

### Step 1: Write the failing tests

- [ ] Create `src/utils/componentScanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { detectFramework, detectFrameworkFromTree, isComponentFile } from './componentScanner'

describe('detectFramework', () => {
  it('detects react', () => {
    expect(detectFramework({ react: '^18.0.0' })).toBe('react')
  })
  it('detects react via react-dom', () => {
    expect(detectFramework({ 'react-dom': '^18.0.0' })).toBe('react')
  })
  it('detects vue', () => {
    expect(detectFramework({ vue: '^3.0.0' })).toBe('vue')
  })
  it('detects svelte', () => {
    expect(detectFramework({ svelte: '^4.0.0' })).toBe('svelte')
  })
  it('detects solid before react', () => {
    expect(detectFramework({ 'solid-js': '^1.0.0', react: '^18.0.0' })).toBe('solid')
  })
  it('detects angular first when multiple present', () => {
    expect(detectFramework({ '@angular/core': '^17.0.0', react: '^18.0.0' })).toBe('angular')
  })
  it('returns unknown when nothing matches', () => {
    expect(detectFramework({ lodash: '^4.0.0' })).toBe('unknown')
  })
  it('returns unknown for empty deps', () => {
    expect(detectFramework({})).toBe('unknown')
  })
})

describe('detectFrameworkFromTree', () => {
  it('detects vue from .vue files', () => {
    expect(detectFrameworkFromTree(['src/Button.vue', 'src/Input.vue'])).toBe('vue')
  })
  it('detects svelte from .svelte files', () => {
    expect(detectFrameworkFromTree(['src/App.svelte'])).toBe('svelte')
  })
  it('detects react from .tsx files', () => {
    expect(detectFrameworkFromTree(['src/Button.tsx'])).toBe('react')
  })
  it('detects react from .jsx files', () => {
    expect(detectFrameworkFromTree(['src/Button.jsx'])).toBe('react')
  })
  it('returns unknown for no matching files', () => {
    expect(detectFrameworkFromTree(['README.md', 'src/index.ts'])).toBe('unknown')
  })
})

describe('isComponentFile', () => {
  it('accepts a .tsx file in /components/', () => {
    expect(isComponentFile('src/components/Button.tsx', 'react')).toBe(true)
  })
  it('accepts a .vue file in /components/', () => {
    expect(isComponentFile('src/components/Input.vue', 'vue')).toBe(true)
  })
  it('accepts a .svelte file in /ui/', () => {
    expect(isComponentFile('src/ui/Badge.svelte', 'svelte')).toBe(true)
  })
  it('accepts a PascalCase .tsx at src/ root', () => {
    expect(isComponentFile('src/Button.tsx', 'react')).toBe(true)
  })
  it('accepts a file in packages/*/src/', () => {
    expect(isComponentFile('packages/core/src/components/Modal.tsx', 'react')).toBe(true)
  })
  it('rejects a test file', () => {
    expect(isComponentFile('src/components/Button.test.tsx', 'react')).toBe(false)
  })
  it('rejects a stories file', () => {
    expect(isComponentFile('src/components/Button.stories.tsx', 'react')).toBe(false)
  })
  it('rejects index files', () => {
    expect(isComponentFile('src/components/index.ts', 'react')).toBe(false)
  })
  it('rejects all-lowercase filenames (hooks/utils)', () => {
    expect(isComponentFile('src/components/useButton.ts', 'react')).toBe(false)
  })
  it('rejects files in dist/', () => {
    expect(isComponentFile('dist/components/Button.tsx', 'react')).toBe(false)
  })
  it('rejects files with wrong extension for framework', () => {
    expect(isComponentFile('src/components/Button.vue', 'react')).toBe(false)
  })
  it('rejects .d.ts files', () => {
    expect(isComponentFile('src/components/Button.d.ts', 'react')).toBe(false)
  })
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:
```bash
npx vitest run src/utils/componentScanner.test.ts
```
Expected: FAIL — module not found.

### Step 3: Implement the pure functions

- [ ] Create `src/utils/componentScanner.ts`:

```ts
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
  if (paths.some(p => p.endsWith('.vue')))               return 'vue'
  if (paths.some(p => p.endsWith('.svelte')))            return 'svelte'
  if (paths.some(p => p.endsWith('.tsx') || p.endsWith('.jsx'))) return 'react'
  return 'unknown'
}

const VALID_EXTENSIONS: Record<Framework, string[]> = {
  react:   ['tsx', 'jsx'],
  solid:   ['tsx', 'jsx'],
  vue:     ['vue'],
  svelte:  ['svelte'],
  angular: ['ts', 'tsx'],
  unknown: ['ts', 'tsx'],
}

const INCLUDE_PATTERNS = [
  '/components/', '/component/', '/ui/', '/primitives/', '/elements/',
]

export function isComponentFile(path: string, framework: Framework): boolean {
  const filename = path.split('/').pop() ?? ''
  const ext = filename.includes('.') ? filename.split('.').pop() ?? '' : ''

  // Extension check
  if (!VALID_EXTENSIONS[framework].includes(ext)) return false

  // Exclude patterns (checked before include to short-circuit early)
  if (/\.(test|spec|stories|d)\.[^.]+$/.test(filename))            return false
  if (/^index\./.test(filename))                                     return false
  if (/(__tests__|__mocks__|node_modules|dist|\.storybook)/.test(path)) return false

  // Name must start with uppercase (component) not lowercase (hook/util)
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
  if (nameWithoutExt === nameWithoutExt.toLowerCase())              return false

  // Include patterns
  const inIncludeDir = INCLUDE_PATTERNS.some(p => path.includes(p))
  const isFlatSrcRoot = /^src\/[A-Z][^/]+\.(tsx|jsx|vue|svelte)$/.test(path)
  const isMonorepoSrc = /^packages\/[^/]+\/src\//.test(path)

  return inIncludeDir || isFlatSrcRoot || isMonorepoSrc
}
```

### Step 4: Run tests to verify they pass

- [ ] Run:
```bash
npx vitest run src/utils/componentScanner.test.ts
```
Expected: all tests PASS.

### Step 5: Commit

- [ ] Run:
```bash
git add src/utils/componentScanner.ts src/utils/componentScanner.test.ts
git commit -m "feat: add component scanner pure functions with tests"
```

---

## Task 3: IPC handler + wiring

**Files:**
- Create: `electron/componentScanner.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

### Step 1: Create `electron/componentScanner.ts`

- [ ] Create `electron/componentScanner.ts`:

```ts
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

  // 4. Filter to component files, cap at 50
  const candidates = filePaths
    .filter(p => isComponentFile(p, framework))
    .slice(0, 50)

  // 5. Fetch source in batches of 10
  const sources = await batchFetch(candidates, 10, path =>
    getFileContent(token, owner, name, path).catch(() => null),
  )

  const components: ScannedComponent[] = candidates
    .map((path, i) => ({ path, source: sources[i] ?? '' }))
    .filter(c => c.source.length > 0)

  return { framework, components }
}

export function registerComponentsIPC(): void {
  ipcMain.handle(
    'components:scan',
    (_event, owner: string, name: string, branch: string) =>
      scanComponents(owner, name, branch),
  )
}
```

### Step 2: Register the IPC handler in `electron/main.ts`

- [ ] Open `electron/main.ts`. Find the import block at the top. After the last import (the `translator` import), add:
```ts
import { registerComponentsIPC } from './componentScanner'
```

- [ ] Find where other IPC registrations happen near the bottom of the file. Look for the pattern where `ipcMain.handle('storybook:detect', ...)` is defined (around line 1057). Add this call somewhere before `app.on('ready', ...)` or in the same area as the other handlers — whichever pattern the file uses. Because `registerComponentsIPC` is a function call, add it at the module level:
```ts
registerComponentsIPC()
```

> **Note:** `electron/main.ts` registers most handlers inline rather than via functions. Scan the file to find the best placement — add `registerComponentsIPC()` just after the storybook IPC handlers block (around line 1084+).

### Step 3: Add the preload bridge

- [ ] Open `electron/preload.ts`. Find the `storybook` block at the end (around line 156):
```ts
  storybook: {
    detect:   (owner: string, name: string, extraCandidates?: string[]) =>
      ipcRenderer.invoke('storybook:detect', owner, name, extraCandidates),
    getIndex: (storybookUrl: string) =>
      ipcRenderer.invoke('storybook:getIndex', storybookUrl),
  },
})
```
Replace it with:
```ts
  storybook: {
    detect:   (owner: string, name: string, extraCandidates?: string[]) =>
      ipcRenderer.invoke('storybook:detect', owner, name, extraCandidates),
    getIndex: (storybookUrl: string) =>
      ipcRenderer.invoke('storybook:getIndex', storybookUrl),
  },

  components: {
    scan: (owner: string, name: string, branch: string) =>
      ipcRenderer.invoke('components:scan', owner, name, branch),
  },
})
```

### Step 4: Update `src/env.d.ts`

- [ ] Open `src/env.d.ts`. The first line already has an import:
```ts
import type { RepoRow, ReleaseRow, SkillRow, LibraryRow, CollectionRow, CollectionRepoRow, StarredRepoRow } from './types/repo'
```
Add the new import on line 2:
```ts
import type { ComponentScanResult } from './types/components'
```

- [ ] Find the `storybook` block in the `Window['api']` interface (around line 126):
```ts
      storybook: {
        detect:   (owner: string, name: string, extraCandidates?: string[]) => Promise<string | null>
        getIndex: (storybookUrl: string) => Promise<unknown>
      }
    }
  }
}
```
Replace it with:
```ts
      storybook: {
        detect:   (owner: string, name: string, extraCandidates?: string[]) => Promise<string | null>
        getIndex: (storybookUrl: string) => Promise<unknown>
      }
      components: {
        scan(owner: string, name: string, branch: string): Promise<ComponentScanResult>
      }
    }
  }
}
```

### Step 5: Verify TypeScript compiles

- [ ] Run:
```bash
npx tsc --noEmit
```
Expected: no new errors.

### Step 6: Commit

- [ ] Run:
```bash
git add electron/componentScanner.ts electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: add components:scan IPC handler and preload bridge"
```

---

## Task 4: `componentParser.ts` with tests

**Files:**
- Create: `src/utils/componentParser.ts`
- Create: `src/utils/componentParser.test.ts`

### Step 1: Write the failing tests

- [ ] Create `src/utils/componentParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseComponent } from './componentParser'

describe('parseComponent — React', () => {
  const source = `
    interface ButtonProps {
      label: string
      disabled?: boolean
      count: number
      onClick?: () => void
      children?: React.ReactNode
    }
    export default function Button({ label }: ButtonProps) {
      return <button>{label}</button>
    }
  `

  it('extracts the component name from the file path', () => {
    const result = parseComponent('src/components/Button.tsx', source, 'react')
    expect(result.name).toBe('Button')
  })

  it('marks react as renderable', () => {
    const result = parseComponent('src/components/Button.tsx', source, 'react')
    expect(result.renderable).toBe(true)
  })

  it('extracts required string prop', () => {
    const result = parseComponent('src/components/Button.tsx', source, 'react')
    const label = result.props.find(p => p.name === 'label')
    expect(label).toBeDefined()
    expect(label?.type).toBe('string')
    expect(label?.required).toBe(true)
  })

  it('extracts optional boolean prop', () => {
    const result = parseComponent('src/components/Button.tsx', source, 'react')
    const disabled = result.props.find(p => p.name === 'disabled')
    expect(disabled?.required).toBe(false)
  })

  it('extracts number prop', () => {
    const result = parseComponent('src/components/Button.tsx', source, 'react')
    const count = result.props.find(p => p.name === 'count')
    expect(count?.type).toBe('number')
  })

  it('includes function and node props in list (generation omits them)', () => {
    const result = parseComponent('src/components/Button.tsx', source, 'react')
    expect(result.props.some(p => p.name === 'onClick')).toBe(true)
    expect(result.props.some(p => p.name === 'children')).toBe(true)
  })

  it('handles type alias Props form', () => {
    const src = `type CardProps = { title: string; body?: string }`
    const result = parseComponent('Card.tsx', src, 'react')
    expect(result.props.some(p => p.name === 'title')).toBe(true)
  })
})

describe('parseComponent — Vue', () => {
  const source = `
    <template><div>{{ label }}</div></template>
    <script setup>
    defineProps<{ label: string; size?: 'sm' | 'lg' }>()
    </script>
  `

  it('extracts Vue props from defineProps<{...}>', () => {
    const result = parseComponent('src/components/Badge.vue', source, 'vue')
    expect(result.props.some(p => p.name === 'label')).toBe(true)
  })

  it('marks vue as renderable', () => {
    const result = parseComponent('src/components/Badge.vue', source, 'vue')
    expect(result.renderable).toBe(true)
  })
})

describe('parseComponent — Svelte', () => {
  const source = `
    <script>
    export let label = 'default';
    export let count: number;
    export let active: boolean = false;
    </script>
    <div>{label}</div>
  `

  it('extracts Svelte exported props', () => {
    const result = parseComponent('src/Badge.svelte', source, 'svelte')
    expect(result.props.some(p => p.name === 'label')).toBe(true)
    expect(result.props.some(p => p.name === 'count')).toBe(true)
  })

  it('marks svelte as renderable', () => {
    const result = parseComponent('src/Badge.svelte', source, 'svelte')
    expect(result.renderable).toBe(true)
  })

  it('captures default values', () => {
    const result = parseComponent('src/Badge.svelte', source, 'svelte')
    const active = result.props.find(p => p.name === 'active')
    expect(active?.defaultValue).toBe('false')
  })
})

describe('parseComponent — Angular / unknown', () => {
  it('marks angular as not renderable', () => {
    const result = parseComponent('button.component.ts', '', 'angular')
    expect(result.renderable).toBe(false)
  })

  it('marks unknown as not renderable', () => {
    const result = parseComponent('Widget.tsx', '', 'unknown')
    expect(result.renderable).toBe(false)
  })

  it('returns empty props for angular', () => {
    const result = parseComponent('button.component.ts', '', 'angular')
    expect(result.props).toEqual([])
  })
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:
```bash
npx vitest run src/utils/componentParser.test.ts
```
Expected: FAIL — module not found.

### Step 3: Implement `componentParser.ts`

- [ ] Create `src/utils/componentParser.ts`:

```ts
// src/utils/componentParser.ts
import type { Framework } from '../types/components'

export interface ParsedProp {
  name: string
  type: string
  required: boolean
  defaultValue?: string
}

export interface ParsedComponent {
  name: string
  props: ParsedProp[]
  framework: Framework
  renderable: boolean
}

export function parseComponent(
  path: string,
  source: string,
  framework: Framework,
): ParsedComponent {
  const filename = path.split('/').pop() ?? path
  const name = filename.replace(/\.[^.]+$/, '')
  const renderable = framework !== 'angular' && framework !== 'unknown'

  let props: ParsedProp[] = []
  try {
    if (framework === 'react' || framework === 'solid') props = parseReactProps(source)
    else if (framework === 'vue')                        props = parseVueProps(source)
    else if (framework === 'svelte')                     props = parseSvelteProps(source)
  } catch { /* leave props empty on parse error */ }

  return { name, props, framework, renderable }
}

function parsePropBlock(block: string): ParsedProp[] {
  const props: ParsedProp[] = []
  // Strip JSDoc and line comments
  const clean = block
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  for (const line of clean.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Match: propName?: type  or  propName: type  (with optional trailing semicolon/comma)
    const m = trimmed.match(/^(\w+)(\?)?:\s*(.+?)[,;]?\s*$/)
    if (!m) continue
    props.push({
      name:     m[1],
      type:     m[3].trim(),
      required: !m[2],
    })
  }
  return props
}

function parseReactProps(source: string): ParsedProp[] {
  // interface *Props { ... }
  const iface = source.match(/interface\s+\w*Props\s*\{([^}]+)\}/s)
  if (iface) return parsePropBlock(iface[1])

  // type *Props = { ... }
  const alias = source.match(/type\s+\w*Props\s*=\s*\{([^}]+)\}/s)
  if (alias) return parsePropBlock(alias[1])

  return []
}

function parseVueProps(source: string): ParsedProp[] {
  // <script setup> with defineProps<{ ... }>
  const setup = source.match(/defineProps<\{([^}]+)\}>/s)
  if (setup) return parsePropBlock(setup[1])

  // Options API props object (basic support)
  const options = source.match(/props\s*:\s*\{([^}]+)\}/s)
  if (options) return parsePropBlock(options[1])

  return []
}

function parseSvelteProps(source: string): ParsedProp[] {
  const props: ParsedProp[] = []
  // export let propName: Type = default
  // export let propName = default  (no type annotation)
  // export let propName: Type
  const regex = /export\s+let\s+(\w+)(?::\s*([^=;\n]+?))?(?:\s*=\s*([^;\n]+))?\s*[;\n]/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(source)) !== null) {
    props.push({
      name:         m[1],
      type:         (m[2] ?? 'unknown').trim(),
      required:     m[3] === undefined,
      defaultValue: m[3]?.trim(),
    })
  }
  return props
}
```

### Step 4: Run tests to verify they pass

- [ ] Run:
```bash
npx vitest run src/utils/componentParser.test.ts
```
Expected: all tests PASS.

### Step 5: Commit

- [ ] Run:
```bash
git add src/utils/componentParser.ts src/utils/componentParser.test.ts
git commit -m "feat: add componentParser utility with tests"
```

---

## Task 5: `propsGenerator.ts` with tests

**Files:**
- Create: `src/utils/propsGenerator.ts`
- Create: `src/utils/propsGenerator.test.ts`

### Step 1: Write the failing tests

- [ ] Create `src/utils/propsGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateProps } from './propsGenerator'
import type { ParsedProp } from './componentParser'

function prop(name: string, type: string, required = true): ParsedProp {
  return { name, type, required }
}

describe('generateProps', () => {
  it('generates "Text" for string props', () => {
    expect(generateProps([prop('label', 'string')])).toEqual({ label: 'Text' })
  })

  it('generates 0 for number props', () => {
    expect(generateProps([prop('count', 'number')])).toEqual({ count: 0 })
  })

  it('generates false for boolean props', () => {
    expect(generateProps([prop('disabled', 'boolean')])).toEqual({ disabled: false })
  })

  it('generates [] for string array', () => {
    expect(generateProps([prop('items', 'string[]')])).toEqual({ items: [] })
  })

  it('generates [] for number array', () => {
    expect(generateProps([prop('ids', 'number[]')])).toEqual({ ids: [] })
  })

  it('picks the first value from a string union', () => {
    expect(generateProps([prop('size', "'sm' | 'md' | 'lg'")])).toEqual({ size: 'sm' })
  })

  it('omits React.ReactNode props', () => {
    expect(generateProps([prop('children', 'React.ReactNode')])).toEqual({})
  })

  it('omits ReactNode props', () => {
    expect(generateProps([prop('children', 'ReactNode')])).toEqual({})
  })

  it('omits VNode props', () => {
    expect(generateProps([prop('slot', 'VNode')])).toEqual({})
  })

  it('omits function props starting with (', () => {
    expect(generateProps([prop('onClick', '() => void')])).toEqual({})
  })

  it('omits function props with arrow type', () => {
    expect(generateProps([prop('onChange', '(val: string) => void')])).toEqual({})
  })

  it('omits complex/object props', () => {
    expect(generateProps([prop('style', 'CSSProperties')])).toEqual({})
  })

  it('handles multiple props together', () => {
    const result = generateProps([
      prop('label', 'string'),
      prop('disabled', 'boolean'),
      prop('onClick', '() => void'),
      prop('children', 'ReactNode'),
    ])
    expect(result).toEqual({ label: 'Text', disabled: false })
  })

  it('returns empty object for empty props array', () => {
    expect(generateProps([])).toEqual({})
  })
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:
```bash
npx vitest run src/utils/propsGenerator.test.ts
```
Expected: FAIL — module not found.

### Step 3: Implement `propsGenerator.ts`

- [ ] Create `src/utils/propsGenerator.ts`:

```ts
// src/utils/propsGenerator.ts
import type { ParsedProp } from './componentParser'

const OMIT = Symbol('omit')

function inferValue(type: string): unknown {
  const t = type.trim()

  if (t === 'string')   return 'Text'
  if (t === 'number')   return 0
  if (t === 'boolean')  return false
  if (t === 'string[]') return []
  if (t === 'number[]') return []

  // Render/node types → omit
  if (/React\.ReactNode|ReactNode|VNode|Snippet|ReactElement|JSX\.Element/.test(t)) return OMIT

  // Function types → omit
  if (t.startsWith('(') || /=>\s*\S/.test(t)) return OMIT

  // Union of string literals: 'sm' | 'md' | 'lg'
  const unionMatch = t.match(/^'([^']+)'/)
  if (unionMatch) return unionMatch[1]

  // Unknown / complex → omit
  return OMIT
}

export function generateProps(props: ParsedProp[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const prop of props) {
    const value = inferValue(prop.type)
    if (value !== OMIT) result[prop.name] = value
  }
  return result
}
```

### Step 4: Run tests to verify they pass

- [ ] Run:
```bash
npx vitest run src/utils/propsGenerator.test.ts
```
Expected: all tests PASS.

### Step 5: Commit

- [ ] Run:
```bash
git add src/utils/propsGenerator.ts src/utils/propsGenerator.test.ts
git commit -m "feat: add propsGenerator utility with tests"
```

---

## Task 6: `iframeTemplate.ts` with tests

**Files:**
- Create: `src/utils/iframeTemplate.ts`
- Create: `src/utils/iframeTemplate.test.ts`

### Step 1: Write the failing tests

- [ ] Create `src/utils/iframeTemplate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { stubLocalImports, buildIframeHtml } from './iframeTemplate'
import type { ParsedComponent } from './componentParser'

describe('stubLocalImports', () => {
  it('stubs default imports', () => {
    const result = stubLocalImports("import Foo from './foo'")
    expect(result).toBe('const Foo = () => null')
  })

  it('stubs named imports', () => {
    const result = stubLocalImports("import { Bar, Baz } from '../bar'")
    expect(result).toContain('const { Bar, Baz } = {}')
  })

  it('removes CSS side-effect imports', () => {
    const result = stubLocalImports("import './styles.css'")
    expect(result.trim()).toBe('')
  })

  it('leaves third-party imports untouched', () => {
    const result = stubLocalImports("import React from 'react'")
    expect(result).toBe("import React from 'react'")
  })

  it('leaves relative imports that are not local alone if not matching', () => {
    // third-party paths don't start with ./ or ../
    const result = stubLocalImports("import clsx from 'clsx'")
    expect(result).toBe("import clsx from 'clsx'")
  })

  it('stubs multiple imports', () => {
    const source = [
      "import Button from './Button'",
      "import { cn } from '../utils/cn'",
      "import './styles.css'",
      "import React from 'react'",
    ].join('\n')
    const result = stubLocalImports(source)
    expect(result).toContain('const Button = () => null')
    expect(result).toContain('const { cn } = {}')
    expect(result).not.toContain("import './styles.css'")
    expect(result).toContain("import React from 'react'")
  })
})

describe('buildIframeHtml', () => {
  const baseComp = (framework: ParsedComponent['framework'], renderable = true): ParsedComponent => ({
    name: 'Button',
    props: [],
    framework,
    renderable,
  })

  it('returns null for angular', () => {
    expect(buildIframeHtml(baseComp('angular', false), '', {})).toBeNull()
  })

  it('returns null for unknown', () => {
    expect(buildIframeHtml(baseComp('unknown', false), '', {})).toBeNull()
  })

  it('returns HTML string for react', () => {
    const html = buildIframeHtml(baseComp('react'), 'export default function Button() {}', {})
    expect(html).not.toBeNull()
    expect(html).toContain('react@18')
    expect(html).toContain('@babel/standalone')
    expect(html).toContain('Button')
    expect(html).toContain('createRoot')
  })

  it('returns HTML string for vue', () => {
    const html = buildIframeHtml(baseComp('vue'), '<template><div/></template>', {})
    expect(html).not.toBeNull()
    expect(html).toContain('vue@3')
    expect(html).toContain('createApp')
  })

  it('returns HTML string for svelte', () => {
    const html = buildIframeHtml(baseComp('svelte'), '<div>hi</div>', {})
    expect(html).not.toBeNull()
    expect(html).toContain('svelte@4')
    expect(html).toContain('svelte.compile')
  })

  it('includes the onerror postMessage bridge', () => {
    const html = buildIframeHtml(baseComp('react'), '', {})
    expect(html).toContain('render-error')
    expect(html).toContain('postMessage')
  })

  it('injects generated props as JSON', () => {
    const html = buildIframeHtml(baseComp('react'), '', { label: 'Text', disabled: false })
    expect(html).toContain('"label":"Text"')
  })
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:
```bash
npx vitest run src/utils/iframeTemplate.test.ts
```
Expected: FAIL — module not found.

### Step 3: Implement `iframeTemplate.ts`

- [ ] Create `src/utils/iframeTemplate.ts`:

```ts
// src/utils/iframeTemplate.ts
import type { ParsedComponent } from './componentParser'

export function stubLocalImports(source: string): string {
  // Default imports: import Foo from './...' → const Foo = () => null
  let result = source.replace(
    /import\s+(\w+)\s+from\s+['"]\.\.?\/[^'"]+['"]/g,
    'const $1 = () => null',
  )
  // Named imports: import { Foo, Bar } from './...' → const { Foo, Bar } = {}
  result = result.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]\.\.?\/[^'"]+['"]/g,
    'const {$1} = {}',
  )
  // Side-effect CSS imports: import './foo.css'
  result = result.replace(
    /import\s+['"]\.\.?\/[^'"]+\.css['"]/g,
    '',
  )
  return result
}

const ERROR_BRIDGE = `<script>
window.onerror=function(m){window.parent.postMessage({type:'render-error',message:String(m)},'*');return true;};
window.addEventListener('unhandledrejection',function(e){window.parent.postMessage({type:'render-error',message:String(e.reason)},'*');});
</script>`

export function buildIframeHtml(
  component: ParsedComponent,
  source: string,
  props: Record<string, unknown>,
): string | null {
  if (!component.renderable) return null

  const stubbed = stubLocalImports(source)
  const propsJson = JSON.stringify(props)

  switch (component.framework) {
    case 'react':
    case 'solid':
      return buildReactHtml(component.name, stubbed, propsJson, component.framework)
    case 'vue':
      return buildVueHtml(component.name, stubbed, propsJson)
    case 'svelte':
      return buildSvelteHtml(stubbed, propsJson)
    default:
      return null
  }
}

function baseHead(extraScripts = ''): string {
  return `<meta charset="utf-8">${ERROR_BRIDGE}${extraScripts}
<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#fff;color:#000}</style>`
}

function buildReactHtml(name: string, source: string, propsJson: string, framework: 'react' | 'solid'): string {
  const solidScripts = framework === 'solid' ? `
<script src="https://unpkg.com/solid-js/dist/solid.js"></script>
<script src="https://unpkg.com/solid-js/web/dist/web.js"></script>` : ''

  return `<!DOCTYPE html><html><head>
${baseHead(`
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>${solidScripts}`)}
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const {useState,useEffect,useRef,useCallback,useMemo,useContext,createContext}=React;
${source}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${name},${propsJson}));
</script></body></html>`
}

function buildVueHtml(name: string, source: string, propsJson: string): string {
  const templateMatch = source.match(/<template>([\s\S]+?)<\/template>/)
  const template = (templateMatch?.[1] ?? '<div>Component</div>').replace(/`/g, '\\`')

  return `<!DOCTYPE html><html><head>
${baseHead('<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>')}
</head><body><div id="app"></div>
<script>
const {createApp,ref,computed,reactive,watch,onMounted}=Vue;
const _props=${propsJson};
const _render=Vue.compile(\`${template}\`);
createApp({setup(){return _props},render:_render}).mount('#app');
</script></body></html>`
}

function buildSvelteHtml(source: string, propsJson: string): string {
  const escaped = source.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')

  return `<!DOCTYPE html><html><head>
${baseHead('<script src="https://unpkg.com/svelte@4/compiler.js"></script>')}
</head><body>
<script type="module">
const src=\`${escaped}\`;
let compiled;
try{compiled=svelte.compile(src,{generate:'dom',format:'esm'});}
catch(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');throw e;}
const blob=new Blob([compiled.js.code],{type:'application/javascript'});
const url=URL.createObjectURL(blob);
import(url).then(mod=>{
  new mod.default({target:document.body,props:${propsJson}});
}).catch(e=>{window.parent.postMessage({type:'render-error',message:String(e)},'*');});
</script></body></html>`
}
```

### Step 4: Run tests to verify they pass

- [ ] Run:
```bash
npx vitest run src/utils/iframeTemplate.test.ts
```
Expected: all tests PASS.

### Step 5: Commit

- [ ] Run:
```bash
git add src/utils/iframeTemplate.ts src/utils/iframeTemplate.test.ts
git commit -m "feat: add iframeTemplate utility with import stubbing and per-framework HTML builders"
```

---

## Task 7: `ComponentExplorer.tsx`

**Files:**
- Create: `src/components/ComponentExplorer.tsx`

No unit tests — component is visual and interacts with IPC. Verified manually after wiring into RepoDetail in Task 8.

### Step 1: Create the component

- [ ] Create `src/components/ComponentExplorer.tsx`:

```tsx
// src/components/ComponentExplorer.tsx
import { useState, useEffect, useRef } from 'react'
import type { Framework, ComponentScanResult } from '../types/components'
import { parseComponent, type ParsedComponent } from '../utils/componentParser'
import { generateProps } from '../utils/propsGenerator'
import { buildIframeHtml } from '../utils/iframeTemplate'

interface Props {
  owner: string
  name:  string
  branch: string
}

type ScanState   = 'scanning' | 'done' | 'error'
type RenderState = 'pending' | 'rendering' | 'rendered' | 'fallback'

export default function ComponentExplorer({ owner, name, branch }: Props) {
  const [scanState,    setScanState]    = useState<ScanState>('scanning')
  const [framework,    setFramework]    = useState<Framework | null>(null)
  const [components,   setComponents]   = useState<ParsedComponent[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [renderStates, setRenderStates] = useState<Record<string, RenderState>>({})
  const [blobUrls,     setBlobUrls]     = useState<Record<string, string>>({})
  const [propsOpen,    setPropsOpen]    = useState(true)

  const iframeRef        = useRef<HTMLIFrameElement | null>(null)
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sourceMapRef     = useRef<Record<string, string>>({})
  const createdUrls      = useRef<string[]>([])

  // Scan on mount
  useEffect(() => {
    window.api.components.scan(owner, name, branch)
      .then((result: ComponentScanResult) => {
        const parsed = result.components.map(c =>
          parseComponent(c.path, c.source, result.framework),
        )
        sourceMapRef.current = Object.fromEntries(
          result.components.map(c => [c.path, c.source]),
        )
        setFramework(result.framework)
        setComponents(parsed)
        setScanState('done')
        if (parsed.length > 0) {
          doSelect(parsed[0], result.components[0]?.source ?? '')
        }
      })
      .catch(() => setScanState('error'))
  }, [owner, name, branch])

  // postMessage error bridge listener
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return
      if (e.data?.type === 'render-error') {
        setRenderStates(prev => {
          const current = selectedPath ? prev[selectedPath] : null
          if (!selectedPath || current !== 'rendering') return prev
          return { ...prev, [selectedPath]: 'fallback' }
        })
        if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [selectedPath])

  // Cleanup blob URLs and timeout on unmount
  useEffect(() => () => {
    createdUrls.current.forEach(u => URL.revokeObjectURL(u))
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
  }, [])

  function doSelect(comp: ParsedComponent, source: string) {
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
    setSelectedPath(comp.path)

    if (!comp.renderable) {
      setRenderStates(prev => ({ ...prev, [comp.path]: 'fallback' }))
      return
    }

    // Use cached blob URL if already generated
    if (blobUrls[comp.path]) {
      if (renderStates[comp.path] === 'rendered') return
      setRenderStates(prev => ({ ...prev, [comp.path]: 'rendering' }))
      startTimeout(comp.path)
      return
    }

    const html = buildIframeHtml(comp, source, generateProps(comp.props))
    if (!html) {
      setRenderStates(prev => ({ ...prev, [comp.path]: 'fallback' }))
      return
    }

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    createdUrls.current.push(url)
    setBlobUrls(prev => ({ ...prev, [comp.path]: url }))
    setRenderStates(prev => ({ ...prev, [comp.path]: 'rendering' }))
    startTimeout(comp.path)
  }

  function startTimeout(path: string) {
    renderTimeoutRef.current = setTimeout(() => {
      setRenderStates(prev => {
        if (prev[path] !== 'rendering') return prev
        return { ...prev, [path]: 'fallback' }
      })
    }, 5000)
  }

  function handleIframeLoad() {
    if (!selectedPath) return
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
    setRenderStates(prev => {
      if (prev[selectedPath] !== 'rendering') return prev
      return { ...prev, [selectedPath]: 'rendered' }
    })
  }

  // Group by parent folder
  const grouped = new Map<string, ParsedComponent[]>()
  for (const comp of components) {
    const parts = comp.path.split('/')
    const group = parts.length > 1 ? (parts[parts.length - 2] ?? '') : ''
    grouped.set(group, [...(grouped.get(group) ?? []), comp])
  }

  const selectedComp  = components.find(c => c.path === selectedPath) ?? null
  const renderState   = selectedPath ? (renderStates[selectedPath] ?? 'pending') : 'pending'
  const blobUrl       = selectedPath ? (blobUrls[selectedPath] ?? null) : null
  const selectedSource = selectedPath ? (sourceMapRef.current[selectedPath] ?? '') : ''

  if (scanState === 'scanning') {
    return (
      <div className="sb-explorer">
        <div className="sb-detecting"><span>Scanning components…</span></div>
      </div>
    )
  }

  if (scanState === 'error' || components.length === 0) {
    return (
      <div className="sb-explorer">
        <div className="sb-empty">No components found.</div>
      </div>
    )
  }

  return (
    <div className="sb-explorer">
      {/* Sidebar */}
      <div className="sb-list">
        {[...grouped.entries()].map(([group, items]) => (
          <div key={group || '__root__'}>
            {items.length > 1 && group && (
              <div className="sb-list-group-label">{group}</div>
            )}
            {items.map(comp => {
              const rs = renderStates[comp.path] ?? 'pending'
              return (
                <button
                  key={comp.path}
                  className={`sb-list-item${selectedPath === comp.path ? ' active' : ''}`}
                  onClick={() => doSelect(comp, sourceMapRef.current[comp.path] ?? '')}
                >
                  {comp.name}
                  {rs === 'rendering' && (
                    <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }}>◌</span>
                  )}
                  {rs === 'rendered' && (
                    <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--accent)' }}>●</span>
                  )}
                  {rs === 'fallback' && (
                    <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.4 }}>{`</>`}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Preview pane */}
      <div className="sb-preview">
        <div className="sb-preview-toolbar">
          {selectedComp && (
            <>
              <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{selectedComp.name}</span>
              <span style={{ color: 'var(--border)' }}>›</span>
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>
                {selectedComp.path.split('/').pop()}
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() =>
                  window.api.openExternal(
                    `https://github.com/${owner}/${name}/blob/${branch}/${selectedPath}`,
                  )
                }
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--t3)', fontFamily: 'Inter, sans-serif',
                  fontSize: 11, padding: '2px 6px',
                }}
                title="Open on GitHub"
              >↗</button>
            </>
          )}
        </div>

        <div
          className="sb-preview-frame-wrap"
          style={{ padding: 0, position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {renderState === 'rendering' && (
            <div className="sb-detecting" style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
              <span>Rendering…</span>
            </div>
          )}

          {renderState === 'fallback' ? (
            <pre style={{
              flex: 1, margin: 0, padding: '16px', overflow: 'auto', fontSize: 11,
              fontFamily: 'monospace', background: 'var(--surface)',
              color: 'var(--t1)', borderTop: '1px solid var(--border)',
            }}>
              <code>{selectedSource}</code>
            </pre>
          ) : blobUrl ? (
            <iframe
              ref={iframeRef}
              className="sb-preview-frame"
              src={blobUrl}
              sandbox="allow-scripts"
              style={{
                visibility: renderState === 'rendered' ? 'visible' : 'hidden',
                flex: 1, border: 'none', width: '100%',
              }}
              onLoad={handleIframeLoad}
              title={`${selectedComp?.name ?? ''} preview`}
            />
          ) : (
            <div className="sb-empty">Select a component.</div>
          )}
        </div>

        {/* Props table */}
        {selectedComp && selectedComp.props.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              onClick={() => setPropsOpen(p => !p)}
              style={{
                width: '100%', padding: '6px 12px', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--t3)', fontFamily: 'Inter, sans-serif',
              }}
            >
              {propsOpen ? '▾' : '▸'} Props ({selectedComp.props.length})
            </button>
            {propsOpen && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    {['Prop', 'Type', 'Req'].map(h => (
                      <th key={h} style={{
                        padding: '4px 8px', textAlign: 'left',
                        color: 'var(--t3)', fontWeight: 500,
                        borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedComp.props.map(p => (
                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px', color: 'var(--t1)' }}>{p.name}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--t3)' }}>{p.type}</td>
                      <td style={{ padding: '4px 8px', color: p.required ? 'var(--accent)' : 'var(--t3)' }}>
                        {p.required ? '✓' : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

### Step 2: Verify TypeScript compiles

- [ ] Run:
```bash
npx tsc --noEmit
```
Expected: no errors from `ComponentExplorer.tsx`.

### Step 3: Commit

- [ ] Run:
```bash
git add src/components/ComponentExplorer.tsx
git commit -m "feat: add ComponentExplorer component"
```

---

## Task 8: Wire into RepoDetail + delete StackBlitzExplorer

**Files:**
- Modify: `src/views/RepoDetail.tsx`
- Delete: `src/components/StackBlitzExplorer.tsx`

### Step 1: Update the import in `RepoDetail.tsx`

- [ ] Open `src/views/RepoDetail.tsx`. Find the import of `StackBlitzExplorer` (near the top of the file). Replace:
```ts
import StackBlitzExplorer from '../components/StackBlitzExplorer'
```
with:
```ts
import ComponentExplorer from '../components/ComponentExplorer'
```

### Step 2: Update the Components tab body

- [ ] In `RepoDetail.tsx`, find the `StackBlitzExplorer` usage in the Components tab body (around line 1127):
```tsx
                  ) : (
                    <StackBlitzExplorer
                      key={`${owner ?? ''}/${name ?? ''}`}
                      owner={owner ?? ''}
                      name={name ?? ''}
                    />
                  )
```
Replace it with:
```tsx
                  ) : (
                    <ComponentExplorer
                      key={`${owner ?? ''}/${name ?? ''}`}
                      owner={owner ?? ''}
                      name={name ?? ''}
                      branch={repo?.default_branch ?? 'main'}
                    />
                  )
```

### Step 3: Delete `StackBlitzExplorer.tsx`

- [ ] Run:
```bash
rm src/components/StackBlitzExplorer.tsx
```

### Step 4: Verify TypeScript compiles clean

- [ ] Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

### Step 5: Run the full utils test suite

- [ ] Run:
```bash
npx vitest run src/utils/
```
Expected: all tests PASS (componentScanner, componentParser, propsGenerator, iframeTemplate, plus all pre-existing tests).

### Step 6: Commit

- [ ] Run:
```bash
git add src/views/RepoDetail.tsx
git rm src/components/StackBlitzExplorer.tsx
git commit -m "feat: wire ComponentExplorer into RepoDetail, remove StackBlitzExplorer"
```
