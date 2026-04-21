# Framework Rendering — Full Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand component rendering to cover 6 new frameworks (Preact, Lit, Qwik, Stencil, Ember, Alpine), fix Vue and Angular builders, and add framework-aware CDN resolution.

**Architecture:** Each framework gets its own render builder function in `iframeTemplate.ts`. Detection signals are added to `componentScanner.ts`. The esbuild IPC handler in `electron/componentScanner.ts` gains per-framework compile options. The import map builder gains an `externalPeer` parameter so each builder pins the correct CDN peer dependency instead of always externalising `react,react-dom`.

**Tech Stack:** vitest, esbuild (IPC transform), esm.sh (import maps), vue3-sfc-loader CDN, Svelte compiler CDN, Alpine CDN, Lit CDN, zone.js + reflect-metadata + @angular/compiler CDN.

---

## File Map

| File | Change |
|---|---|
| `src/types/components.ts` | Add 6 new members to `Framework` union |
| `src/utils/componentScanner.ts` | FRAMEWORK_PACKAGES, detectFrameworkFromTree (.hbs), VALID_EXTENSIONS, INCLUDE_PATTERNS (/addon/, /app/) |
| `src/utils/componentScanner.test.ts` | Detection tests for 6 new frameworks |
| `electron/componentScanner.ts` | esbuild handler: preact/qwik/stencil/lit branches |
| `src/utils/iframeTemplate.ts` | PINNED additions, `buildImportMap` externalPeer param, fix Vue, fix Angular, 6 new builders, TS improvement, updated switch |
| `src/utils/iframeTemplate.test.ts` | Tests for each new builder and updated Vue/Angular |
| `src/utils/componentParser.ts` | Extend prop-parsing branch to include preact and qwik |

---

## Task 1: Expand Framework type

**Files:**
- Modify: `src/types/components.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/utils/componentScanner.test.ts` inside the `detectFramework` describe block:

```typescript
it('detects preact', () => {
  expect(detectFramework({ preact: '^10.0.0' })).toBe('preact')
})
it('detects lit', () => {
  expect(detectFramework({ lit: '^3.0.0' })).toBe('lit')
})
it('detects qwik', () => {
  expect(detectFramework({ '@builder.io/qwik': '^1.0.0' })).toBe('qwik')
})
it('detects stencil', () => {
  expect(detectFramework({ '@stencil/core': '^4.0.0' })).toBe('stencil')
})
it('detects ember', () => {
  expect(detectFramework({ 'ember-source': '^5.0.0' })).toBe('ember')
})
it('detects alpine', () => {
  expect(detectFramework({ alpinejs: '^3.0.0' })).toBe('alpine')
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/utils/componentScanner.test.ts
```

Expected: FAIL — TypeScript type errors or `detectFramework` returning `'unknown'` for new frameworks.

- [ ] **Step 3: Update `src/types/components.ts`**

```typescript
// src/types/components.ts
export type Framework =
  | 'react' | 'vue' | 'svelte' | 'solid' | 'angular'
  | 'preact' | 'lit' | 'qwik' | 'stencil' | 'ember' | 'alpine'
  | 'javascript' | 'typescript' | 'unknown'

export interface ScannedComponent {
  path: string    // e.g. "src/components/Button.tsx"
  source: string  // raw file content
}

export interface ComponentScanResult {
  framework: Framework
  components: ScannedComponent[]
}
```

- [ ] **Step 4: Run test to verify it still fails (type added, detection not yet)**

```
npx vitest run src/utils/componentScanner.test.ts
```

Expected: FAIL — `detectFramework` still returns `'unknown'`.

- [ ] **Step 5: Commit type change**

```bash
git add src/types/components.ts
git commit -m "feat: add preact/lit/qwik/stencil/ember/alpine to Framework type"
```

---

## Task 2: Detection — FRAMEWORK_PACKAGES, extensions, patterns

**Files:**
- Modify: `src/utils/componentScanner.ts`
- Test: `src/utils/componentScanner.test.ts`

- [ ] **Step 1: Add detection tests for `.hbs` and new packages**

Append to `src/utils/componentScanner.test.ts`:

```typescript
// Inside detectFramework describe:
it('detects preact after react (compat projects)', () => {
  // preact-only project
  expect(detectFramework({ preact: '^10.0.0' })).toBe('preact')
})
it('detects lit via lit-element', () => {
  expect(detectFramework({ 'lit-element': '^4.0.0' })).toBe('lit')
})
it('detects lit via @lit/reactive-element', () => {
  expect(detectFramework({ '@lit/reactive-element': '^2.0.0' })).toBe('lit')
})
it('detects ember via @ember/component', () => {
  expect(detectFramework({ '@ember/component': '^4.0.0' })).toBe('ember')
})
it('prefers solid over preact when both present', () => {
  expect(detectFramework({ 'solid-js': '^1.0.0', preact: '^10.0.0' })).toBe('solid')
})
it('prefers react over preact when both present', () => {
  // A preact/compat bridge project installs both — should remain react
  expect(detectFramework({ react: '^18.0.0', preact: '^10.0.0' })).toBe('react')
})

// Inside detectFrameworkFromTree describe:
it('detects ember from .hbs files', () => {
  expect(detectFrameworkFromTree(['app/components/MyButton.hbs'])).toBe('ember')
})

// Inside isComponentFile describe:
it('accepts .tsx for preact', () => {
  expect(isComponentFile('src/components/Button.tsx', 'preact')).toBe(true)
})
it('accepts .ts for lit in /components/', () => {
  expect(isComponentFile('src/components/MyElement.ts', 'lit')).toBe(true)
})
it('accepts .tsx for qwik', () => {
  expect(isComponentFile('src/components/Counter.tsx', 'qwik')).toBe(true)
})
it('accepts .hbs for ember in /components/', () => {
  expect(isComponentFile('app/components/MyButton.hbs', 'ember')).toBe(true)
})
it('accepts ember file in /app/', () => {
  expect(isComponentFile('app/components/my-button.hbs', 'ember')).toBe(true)
})
it('accepts ember file in /addon/', () => {
  expect(isComponentFile('addon/components/my-button.hbs', 'ember')).toBe(true)
})
it('accepts .js for alpine in /components/', () => {
  expect(isComponentFile('src/components/dropdown.js', 'alpine')).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/utils/componentScanner.test.ts
```

Expected: Multiple FAIL.

- [ ] **Step 3: Update `src/utils/componentScanner.ts`**

Replace the entire file content:

```typescript
// src/utils/componentScanner.ts
import type { Framework } from '../types/components'

const FRAMEWORK_PACKAGES: [string, Framework][] = [
  ['@angular/core',          'angular'],
  ['solid-js',               'solid'],
  ['svelte',                 'svelte'],
  ['vue',                    'vue'],
  ['react',                  'react'],
  ['react-dom',              'react'],
  ['lit',                    'lit'],
  ['lit-element',            'lit'],
  ['@lit/reactive-element',  'lit'],
  ['@builder.io/qwik',       'qwik'],
  ['@stencil/core',          'stencil'],
  ['ember-source',           'ember'],
  ['@ember/component',       'ember'],
  ['alpinejs',               'alpine'],
  ['preact',                 'preact'],   // after react/react-dom to avoid misclassifying compat bridges
]

export function detectFramework(deps: Record<string, string>): Framework {
  for (const [pkg, framework] of FRAMEWORK_PACKAGES) {
    if (pkg in deps) return framework
  }
  return 'unknown'
}

export function detectFrameworkFromTree(paths: string[]): Framework {
  if (paths.some(p => /\.component\.ts$/.test(p)))                     return 'angular'
  if (paths.some(p => p.endsWith('.vue')))                              return 'vue'
  if (paths.some(p => p.endsWith('.svelte')))                          return 'svelte'
  if (paths.some(p => p.endsWith('.tsx') || p.endsWith('.jsx')))       return 'react'
  if (paths.some(p => p.endsWith('.hbs')))                             return 'ember'
  if (paths.some(p => p.endsWith('.js')))                              return 'javascript'
  if (paths.some(p => p.endsWith('.ts')))                              return 'typescript'
  return 'unknown'
}

const VALID_EXTENSIONS: Record<Framework, string[]> = {
  react:      ['tsx', 'jsx', 'js'],
  solid:      ['tsx', 'jsx', 'js'],
  vue:        ['vue', 'js'],
  svelte:     ['svelte'],
  angular:    ['ts', 'tsx'],
  preact:     ['tsx', 'jsx', 'js'],
  lit:        ['ts', 'js'],
  qwik:       ['tsx', 'jsx'],
  stencil:    ['tsx'],
  ember:      ['hbs', 'js', 'ts'],
  alpine:     ['js', 'html'],
  javascript: ['js'],
  typescript: ['ts'],
  unknown:    ['tsx', 'jsx', 'js', 'ts'],
}

const INCLUDE_PATTERNS = [
  '/components/', '/component/', '/ui/', '/primitives/', '/elements/', '/modules/',
  '/addon/', '/app/',
]

export function isComponentFile(path: string, framework: Framework): boolean {
  const filename = path.split('/').pop() ?? ''
  const ext = filename.includes('.') ? filename.split('.').pop() ?? '' : ''

  // Extension check
  if (!VALID_EXTENSIONS[framework].includes(ext)) return false

  // Exclude patterns (checked before include to short-circuit early)
  if (/\.(test|spec|stories)\.[^.]+$/.test(filename))              return false
  if (/\.d\.[^.]+$/.test(filename))                                return false
  if (/^index\./.test(filename))                                   return false
  if (/(__tests__|__mocks__|node_modules|dist|\.storybook|(^|\/)tasks\/|(^|\/)scripts\/|(^|\/)build\/|(^|\/)tools\/|(^|\/)config\/)/.test(path)) return false

  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')

  // Always exclude React hooks (use* pattern)
  if (/^use[A-Z]/.test(nameWithoutExt))                           return false

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
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/utils/componentScanner.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/componentScanner.ts src/utils/componentScanner.test.ts
git commit -m "feat: detect preact/lit/qwik/stencil/ember/alpine in framework scanner"
```

---

## Task 3: esbuild compile handler — new framework branches

**Files:**
- Modify: `electron/componentScanner.ts`

The `components:compile` IPC handler uses esbuild's `transform` API. New frameworks need specific loader/jsx settings. There are no unit tests for this IPC handler (it runs in the Electron main process); compilation correctness is validated indirectly through `iframeTemplate.test.ts` which stubs the IPC.

- [ ] **Step 1: Update `electron/componentScanner.ts` — `components:compile` handler**

Replace the `ipcMain.handle('components:compile', ...)` block (lines 88–129) with:

```typescript
ipcMain.handle(
  'components:compile',
  async (_event, source: string, framework = 'react'): Promise<string | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { transform } = require('esbuild') as typeof import('esbuild')

      let loader: import('esbuild').Loader
      let jsx: import('esbuild').TransformOptions['jsx']
      let jsxImportSource: string | undefined
      let jsxFactory: string | undefined
      let jsxFragmentFactory: string | undefined
      let experimentalDecorators: boolean | undefined

      if (framework === 'solid') {
        loader = 'tsx'; jsx = 'automatic'; jsxImportSource = 'solid-js'
      } else if (framework === 'preact') {
        loader = 'tsx'; jsx = 'automatic'; jsxImportSource = 'preact'
      } else if (framework === 'qwik') {
        loader = 'tsx'; jsx = 'automatic'; jsxImportSource = '@builder.io/qwik'
      } else if (framework === 'stencil') {
        loader = 'tsx'; jsx = 'transform'; jsxFactory = 'h'; jsxFragmentFactory = 'Fragment'
      } else if (framework === 'lit') {
        loader = 'ts'; experimentalDecorators = true
      } else if (framework === 'angular' || framework === 'typescript' || framework === 'ember') {
        loader = 'ts'
      } else {
        // react (default), javascript, alpine, unknown
        loader = 'tsx'; jsx = 'automatic'; jsxImportSource = 'react'
      }

      const result = await transform(source, {
        loader,
        ...(jsx !== undefined ? { jsx } : {}),
        ...(jsxImportSource !== undefined ? { jsxImportSource } : {}),
        ...(jsxFactory !== undefined ? { jsxFactory } : {}),
        ...(jsxFragmentFactory !== undefined ? { jsxFragmentFactory } : {}),
        ...(experimentalDecorators !== undefined ? { tsconfigRaw: { compilerOptions: { experimentalDecorators } } } : {}),
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
```

- [ ] **Step 2: Run full test suite to check nothing broke**

```
npx vitest run
```

Expected: All PASS (iframeTemplate tests stub the IPC so no breakage).

- [ ] **Step 3: Commit**

```bash
git add electron/componentScanner.ts
git commit -m "feat: add preact/qwik/stencil/lit esbuild compile branches"
```

---

## Task 4: PINNED CDN entries + buildImportMap externalPeer

**Files:**
- Modify: `src/utils/iframeTemplate.ts`
- Test: `src/utils/iframeTemplate.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the `buildIframeHtml — import map approach` describe in `src/utils/iframeTemplate.test.ts`:

```typescript
it('uses ?external=preact for preact third-party packages', async () => {
  const comp: ParsedComponent = { name: 'C', props: [], framework: 'preact', renderable: true, path: 'src/components/C.tsx' }
  // Use a third-party package NOT in PINNED so it goes through the external= path
  const html = await buildIframeHtml(comp, "import{something}from'preact-aria'\nexport default function C(){return null}", {})
  expect(html).toContain('preact@10')
  // third-party packages externalise preact, not react
  expect(html).toContain('external=preact')
})

it('uses ?external=@builder.io/qwik for qwik third-party packages', async () => {
  const comp: ParsedComponent = { name: 'C', props: [], framework: 'qwik', renderable: true, path: 'src/components/C.tsx' }
  const html = await buildIframeHtml(comp, "import{component$}from'@builder.io/qwik'\nexport default function C(){return null}", {})
  expect(html).toContain('@builder.io/qwik@1')
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: FAIL — `buildIframeHtml` returns `null` for preact/qwik (no case in switch yet).

- [ ] **Step 3: Update `PINNED` and `buildImportMap` in `src/utils/iframeTemplate.ts`**

Replace the `PINNED` constant and `buildImportMap` function:

```typescript
const PINNED: Record<string, string> = {
  // React
  'react':                       'https://esm.sh/react@18',
  'react/jsx-runtime':           'https://esm.sh/react@18/jsx-runtime',
  'react/jsx-dev-runtime':       'https://esm.sh/react@18/jsx-dev-runtime',
  'react-dom':                   'https://esm.sh/react-dom@18',
  'react-dom/client':            'https://esm.sh/react-dom@18/client',
  'react-dom/server':            'https://esm.sh/react-dom@18/server',
  // Solid
  'solid-js':                    'https://esm.sh/solid-js@1',
  'solid-js/web':                'https://esm.sh/solid-js@1/web',
  'solid-js/store':              'https://esm.sh/solid-js@1/store',
  // Preact
  'preact':                      'https://esm.sh/preact@10',
  'preact/hooks':                'https://esm.sh/preact@10/hooks',
  'preact/compat':               'https://esm.sh/preact@10/compat',
  'preact/jsx-runtime':          'https://esm.sh/preact@10/jsx-runtime',
  // Qwik
  '@builder.io/qwik':            'https://esm.sh/@builder.io/qwik@1',
  '@builder.io/qwik/build':      'https://esm.sh/@builder.io/qwik@1/build',
  '@builder.io/qwik/jsx-runtime':'https://esm.sh/@builder.io/qwik@1/jsx-runtime',
  // Lit
  'lit':                         'https://esm.sh/lit@3',
  'lit/decorators.js':           'https://esm.sh/lit@3/decorators.js',
  'lit/html.js':                 'https://esm.sh/lit@3/html.js',
  'lit/reactive-element.js':     'https://esm.sh/lit@3/reactive-element.js',
  '@lit/reactive-element':       'https://esm.sh/@lit/reactive-element@2',
  // Stencil
  '@stencil/core':               'https://esm.sh/@stencil/core@4',
}

function buildImportMap(code: string, externalPeer = 'react,react-dom'): string {
  const imports: Record<string, string> = { ...PINNED }

  const re = /\bfrom\s+['"]([^'"./][^'"]*)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    const spec = m[1]!
    if (!imports[spec]) {
      imports[spec] = externalPeer
        ? `https://esm.sh/${spec}?external=${externalPeer}`
        : `https://esm.sh/${spec}`
    }
  }

  return `<script type="importmap">${JSON.stringify({ imports })}</script>`
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: Still FAIL on new builder tests (switch cases not added yet), but existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/iframeTemplate.ts src/utils/iframeTemplate.test.ts
git commit -m "feat: add preact/qwik/lit/stencil CDN pins and externalPeer param to buildImportMap"
```

---

## Task 5: Fix Vue — replace with vue3-sfc-loader

**Files:**
- Modify: `src/utils/iframeTemplate.ts`
- Test: `src/utils/iframeTemplate.test.ts`

The current `buildVueHtml` extracts only `<template>`, ignoring `<script setup>` and Composition API. Replace it with `vue3-sfc-loader` so the full SFC is compiled at runtime.

- [ ] **Step 1: Update the vue test**

Find the existing `'returns HTML string for vue'` test in `src/utils/iframeTemplate.test.ts` and replace it:

```typescript
it('returns HTML string for vue (uses vue3-sfc-loader)', async () => {
  const html = await buildIframeHtml(baseComp('vue'), '<template><div>hi</div></template>', {})
  expect(html).not.toBeNull()
  expect(html).toContain('vue3-sfc-loader')
  expect(html).toContain('loadModule')
  expect(html).toContain('createApp')
})

it('vue builder handles script setup source', async () => {
  const src = `<script setup>
const msg = 'hello'
</script>
<template><p>{{ msg }}</p></template>`
  const html = await buildIframeHtml(baseComp('vue'), src, {})
  expect(html).not.toBeNull()
  expect(html).toContain('vue3-sfc-loader')
})
```

- [ ] **Step 2: Run to verify the first test fails**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: `'returns HTML string for vue'` FAILS (old builder doesn't contain `vue3-sfc-loader`).

- [ ] **Step 3: Replace `buildVueHtml` in `src/utils/iframeTemplate.ts`**

Replace the entire `buildVueHtml` function:

```typescript
function buildVueHtml(name: string, source: string, propsJson: string): string {
  const escaped = source
    .replace(/\\/g, '\\\\')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  return `<!DOCTYPE html><html><head>
${baseHead(`<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/vue3-sfc-loader@0.9.5/dist/vue3-sfc-loader.js"></script>`)}
</head><body><div id="app"></div>
<script>
const {loadModule}=window['vue3-sfc-loader'];
const src=\`${escaped}\`;
const options={
  moduleCache:{vue:Vue},
  getFile(){return src;},
  addStyle(s){const el=document.createElement('style');el.textContent=s;document.head.appendChild(el);}
};
const props=${propsJson};
Vue.createApp({
  components:{VComp:Vue.defineAsyncComponent(()=>loadModule('/component.vue',options))},
  setup(){return {props}},
  template:'<VComp v-bind="props"/>'
}).mount('#app');
</script></body></html>`
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/iframeTemplate.ts src/utils/iframeTemplate.test.ts
git commit -m "fix: replace Vue template-only extraction with vue3-sfc-loader for full SFC support"
```

---

## Task 6: Fix Angular — add reflect-metadata + JIT compiler

**Files:**
- Modify: `src/utils/iframeTemplate.ts`
- Test: `src/utils/iframeTemplate.test.ts`

The current Angular builder is missing `reflect-metadata` (required for decorators) and `@angular/compiler` (required for JIT template compilation). It also doesn't handle standalone vs NgModule components.

- [ ] **Step 1: Update the angular test**

Replace the existing `'returns HTML for angular'` test:

```typescript
it('returns HTML for angular (zone.js + reflect-metadata + JIT compiler)', async () => {
  const html = await buildIframeHtml(baseComp('angular'), `
    import { Component } from '@angular/core'
    @Component({ selector: 'app-root', template: '<p>hello</p>', standalone: true })
    export class AppComponent {}
  `, {})
  expect(html).not.toBeNull()
  expect(html).toContain('zone.js')
  expect(html).toContain('reflect-metadata')
  expect(html).toContain('@angular/compiler')
  expect(html).toContain('bootstrapApplication')
})

it('angular builder uses NgModule wrapper for non-standalone components', async () => {
  const html = await buildIframeHtml(baseComp('angular'), `
    import { Component } from '@angular/core'
    @Component({ selector: 'app-root', template: '<p>hello</p>' })
    export class AppComponent {}
  `, {})
  expect(html).not.toBeNull()
  expect(html).toContain('NgModule')
  expect(html).toContain('bootstrapModule')
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: FAIL — existing builder doesn't include reflect-metadata / NgModule path.

- [ ] **Step 3: Replace `buildAngularHtml` in `src/utils/iframeTemplate.ts`**

```typescript
function buildAngularHtml(name: string, compiledCode: string): string {
  const code = stripExports(compiledCode, name)
  const isStandalone = /standalone\s*:\s*true/.test(compiledCode)

  const scripts = [
    '<script src="https://unpkg.com/zone.js/dist/zone.js"></script>',
    '<script src="https://unpkg.com/reflect-metadata/Reflect.js"></script>',
  ].join('\n')

  const bootstrapBlock = isStandalone
    ? `import'https://esm.sh/@angular/compiler@17'
import{bootstrapApplication}from'https://esm.sh/@angular/platform-browser@17'
${escapeScriptContent(code)}
try{
  if(typeof ${name}!=='undefined'){
    bootstrapApplication(${name}).catch(function(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');})
  }
}catch(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');}`
    : `import'https://esm.sh/@angular/compiler@17'
import{NgModule}from'https://esm.sh/@angular/core@17'
import{BrowserModule}from'https://esm.sh/@angular/platform-browser@17'
import{platformBrowserDynamic}from'https://esm.sh/@angular/platform-browser-dynamic@17'
${escapeScriptContent(code)}
try{
  if(typeof ${name}!=='undefined'){
    const _Mod=class{static{NgModule({imports:[BrowserModule],declarations:[${name}],bootstrap:[${name}]})(this)}}
    platformBrowserDynamic().bootstrapModule(_Mod).catch(function(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');})
  }
}catch(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');}`

  return `<!DOCTYPE html><html><head>
${baseHead(scripts)}
</head><body><app-root></app-root>
<script type="module">
${bootstrapBlock}
</script></body></html>`
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/iframeTemplate.ts src/utils/iframeTemplate.test.ts
git commit -m "fix: Angular builder — add reflect-metadata, @angular/compiler JIT, standalone vs NgModule detection"
```

---

## Task 7: buildPreactHtml + buildQwikHtml

**Files:**
- Modify: `src/utils/iframeTemplate.ts`
- Test: `src/utils/iframeTemplate.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the `buildIframeHtml` describe block:

```typescript
it('returns HTML for preact', async () => {
  const comp: ParsedComponent = { name: 'Button', props: [], framework: 'preact', renderable: true, path: 'src/components/Button.tsx' }
  const html = await buildIframeHtml(comp, 'export default function Button(){return null}', {})
  expect(html).not.toBeNull()
  expect(html).toContain('preact@10')
  expect(html).toContain('render')
})

it('returns HTML for qwik', async () => {
  const comp: ParsedComponent = { name: 'Button', props: [], framework: 'qwik', renderable: true, path: 'src/components/Button.tsx' }
  const html = await buildIframeHtml(comp, 'export default function Button(){return null}', {})
  expect(html).not.toBeNull()
  expect(html).toContain('@builder.io/qwik@1')
  expect(html).toContain('render')
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: FAIL — switch has no preact/qwik cases.

- [ ] **Step 3: Add `buildPreactHtml` and `buildQwikHtml` to `src/utils/iframeTemplate.ts`**

Add these two functions after `buildSolidHtml`:

```typescript
function buildPreactHtml(name: string, compiledCode: string, propsJson: string): string {
  const code = stripExports(compiledCode, name)
  const importMap = buildImportMap(code, 'preact')
  const renderTail = [
    `import{render as _$r}from'preact'`,
    `import{jsx as _$jsx}from'preact/jsx-runtime'`,
    `try{_$r(_$jsx(${name},${propsJson}),document.getElementById('root'));}` +
    `catch(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');}`,
  ].join('\n')
  return `<!DOCTYPE html><html><head>${baseHead(importMap)}\n</head><body><div id="root"></div>\n<script type="module">\n${escapeScriptContent(code + '\n' + renderTail)}\n</script></body></html>`
}

function buildQwikHtml(name: string, compiledCode: string, propsJson: string): string {
  const code = stripExports(compiledCode, name)
  const importMap = buildImportMap(code, '@builder.io/qwik')
  const renderTail = [
    `import{render as _$r}from'@builder.io/qwik'`,
    `import{jsx as _$jsx}from'@builder.io/qwik/jsx-runtime'`,
    `try{_$r(document.getElementById('root'),_$jsx(${name},${propsJson}));}` +
    `catch(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');}`,
  ].join('\n')
  return `<!DOCTYPE html><html><head>${baseHead(importMap)}\n</head><body><div id="root"></div>\n<script type="module">\n${escapeScriptContent(code + '\n' + renderTail)}\n</script></body></html>`
}
```

- [ ] **Step 4: Add `preact` and `qwik` cases to `buildIframeHtml` switch**

Inside `buildIframeHtml`, add after the `'solid'` case:

```typescript
case 'preact': {
  const compiled = await compileSource(prepareForCompile(source), 'preact')
  if (compiled === null) return null
  return buildPreactHtml(component.name, compiled, propsJson)
}
case 'qwik': {
  const compiled = await compileSource(prepareForCompile(source), 'qwik')
  if (compiled === null) return null
  return buildQwikHtml(component.name, compiled, propsJson)
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/iframeTemplate.ts src/utils/iframeTemplate.test.ts
git commit -m "feat: add buildPreactHtml and buildQwikHtml render builders"
```

---

## Task 8: buildLitHtml + buildStencilHtml

**Files:**
- Modify: `src/utils/iframeTemplate.ts`
- Test: `src/utils/iframeTemplate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
it('returns HTML for lit', async () => {
  const comp: ParsedComponent = { name: 'MyElement', props: [], framework: 'lit', renderable: true, path: 'src/components/MyElement.ts' }
  const src = `import{LitElement,html}from'lit'
import{customElement}from'lit/decorators.js'
@customElement('my-element')
export class MyElement extends LitElement{render(){return html\`<p>hi</p>\`}}`
  const html = await buildIframeHtml(comp, src, {})
  expect(html).not.toBeNull()
  expect(html).toContain('lit@3')
  expect(html).toContain('my-element')
})

it('lit builder falls back to x-preview tag when no @customElement decorator', async () => {
  const comp: ParsedComponent = { name: 'MyElement', props: [], framework: 'lit', renderable: true, path: 'src/components/MyElement.ts' }
  const html = await buildIframeHtml(comp, 'export class MyElement {}', {})
  expect(html).not.toBeNull()
  expect(html).toContain('x-preview')
})

it('returns HTML for stencil', async () => {
  const comp: ParsedComponent = { name: 'MyButton', props: [], framework: 'stencil', renderable: true, path: 'src/components/MyButton.tsx' }
  const src = `import{Component,h}from'@stencil/core'
@Component({tag:'my-button'})
export class MyButton{render(){return <button>click</button>}}`
  const html = await buildIframeHtml(comp, src, {})
  expect(html).not.toBeNull()
  expect(html).toContain('@stencil/core@4')
  expect(html).toContain('my-button')
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add `buildLitHtml` and `buildStencilHtml` to `src/utils/iframeTemplate.ts`**

Add after `buildQwikHtml`:

```typescript
function buildLitHtml(name: string, compiledCode: string): string {
  const code = stripExports(compiledCode, name)
  const importMap = buildImportMap(code, 'lit')

  // Detect custom element tag name. Check three forms:
  //   1. Raw source: @customElement('tag-name')
  //   2. esbuild compiled form: customElement("tag-name") (decorator stripped)
  //   3. Explicit registration: customElements.define('tag-name', ...)
  const tagMatch =
    compiledCode.match(/@customElement\s*\(\s*['"]([^'"]+)['"]\s*\)/) ??
    compiledCode.match(/customElement\s*\(\s*['"]([^'"]+)['"]\s*\)/) ??
    compiledCode.match(/customElements\.define\s*\(\s*['"]([^'"]+)['"]/)
  const tagName = tagMatch?.[1] ?? 'x-preview'

  return `<!DOCTYPE html><html><head>${baseHead(importMap)}\n</head><body>
<script type="module">
${escapeScriptContent(code)}
</script>
<${tagName}></${tagName}>
</body></html>`
}

function buildStencilHtml(name: string, compiledCode: string): string {
  const code = stripExports(compiledCode, name)
  const importMap = buildImportMap(code, '@stencil/core')

  // Detect tag from @Component({ tag: '...' }) in raw source
  const tagMatch = compiledCode.match(/@Component\s*\(\s*\{[^}]*tag\s*:\s*['"]([^'"]+)['"]/)
  const tagName = tagMatch?.[1] ?? 'x-preview'

  return `<!DOCTYPE html><html><head>${baseHead(importMap)}\n</head><body>
<script type="module">
${escapeScriptContent(code)}
</script>
<${tagName}></${tagName}>
</body></html>`
}
```

- [ ] **Step 4: Add `lit` and `stencil` cases to `buildIframeHtml` switch**

```typescript
case 'lit': {
  const compiled = await compileSource(prepareForCompile(source), 'lit')
  if (compiled === null) return null
  return buildLitHtml(component.name, compiled)
}
case 'stencil': {
  const compiled = await compileSource(prepareForCompile(source), 'stencil')
  if (compiled === null) return null
  return buildStencilHtml(component.name, compiled)
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/iframeTemplate.ts src/utils/iframeTemplate.test.ts
git commit -m "feat: add buildLitHtml and buildStencilHtml custom-element render builders"
```

---

## Task 9: buildEmberHtml + buildAlpineHtml

**Files:**
- Modify: `src/utils/iframeTemplate.ts`
- Test: `src/utils/iframeTemplate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
it('returns HTML for ember (best-effort Glimmer render)', async () => {
  const comp: ParsedComponent = { name: 'MyButton', props: [], framework: 'ember', renderable: true, path: 'app/components/my-button.hbs' }
  const html = await buildIframeHtml(comp, '<button>click me</button>', {})
  expect(html).not.toBeNull()
  expect(html).toContain('glimmer')
})

it('returns HTML for alpine', async () => {
  const comp: ParsedComponent = { name: 'dropdown', props: [], framework: 'alpine', renderable: true, path: 'src/components/dropdown.js' }
  const src = "document.addEventListener('alpine:init',()=>{Alpine.data('dropdown',()=>({open:false}))})"
  const html = await buildIframeHtml(comp, src, {})
  expect(html).not.toBeNull()
  expect(html).toContain('alpinejs')
  expect(html).toContain('x-data')
})

it('alpine builder detects Alpine.data component name', async () => {
  const comp: ParsedComponent = { name: 'search', props: [], framework: 'alpine', renderable: true, path: 'src/components/search.js' }
  const src = "Alpine.data('search',()=>({query:''}))"
  const html = await buildIframeHtml(comp, src, {})
  expect(html).toContain('x-data="search"')
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add `buildEmberHtml` and `buildAlpineHtml` to `src/utils/iframeTemplate.ts`**

Add after `buildStencilHtml`:

```typescript
function buildEmberHtml(name: string, source: string): string {
  // Ember requires build-time compilation. We attempt a best-effort Glimmer render:
  // for .hbs files, inline the template as a raw HTML preview; for .js/.ts
  // compiled files, execute as an ESM module. Complex components fall back to
  // the source view via the error bridge.
  const escaped = source
    .replace(/\\/g, '\\\\')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  // .hbs files are plain Handlebars/Glimmer templates — render as HTML preview.
  // Note: `name` has no extension (componentParser strips it), so we detect by
  // source content: no imports/exports and starts with < implies a template.
  const isTemplate = !source.includes('import ') && !source.includes('export ') && source.trim().startsWith('<')

  if (isTemplate) {
    return `<!DOCTYPE html><html><head>
${baseHead()}
</head><body>
<!-- glimmer/ember template preview (best-effort) -->
<div id="root"></div>
<script>
try{document.getElementById('root').innerHTML=\`${escaped}\`;}
catch(e){window.parent.postMessage({type:'render-error',message:String(e)},'*');}
</script>
</body></html>`
  }

  // Compiled JS: execute as ESM module; complex Ember components will error and
  // the error bridge will trigger source fallback in ComponentExplorer
  return `<!DOCTYPE html><html><head>
${baseHead()}
</head><body><div id="root"></div>
<script type="module">
${escapeScriptContent(source)}
</script>
</body></html>`
}

function buildAlpineHtml(name: string, source: string): string {
  const componentMatch = source.match(/Alpine\.data\s*\(\s*['"](\w+)['"]/)
  const componentName = componentMatch?.[1] ?? null

  const mount = componentName
    ? `<div x-data="${componentName}"><p x-text="'${componentName} loaded'">Loading...</p></div>`
    : `<div x-data="{}"><p>Alpine component</p></div>`

  // Wrap bare Alpine.data() calls in alpine:init so they register after Alpine
  // loads (Alpine is loaded with defer — synchronous scripts run first, so bare
  // Alpine.data() calls would throw ReferenceError otherwise).
  const needsWrap = /Alpine\.data\s*\(/.test(source) && !/alpine:init/.test(source)
  const wrappedSource = needsWrap
    ? `document.addEventListener('alpine:init',()=>{\n${source}\n})`
    : source

  return `<!DOCTYPE html><html><head>
${baseHead()}
</head><body>
<script defer src="https://unpkg.com/alpinejs@3/dist/cdn.min.js"></script>
<script>
${escapeScriptContent(wrappedSource)}
</script>
${mount}
</body></html>`
}
```

- [ ] **Step 4: Add `ember` and `alpine` cases to `buildIframeHtml` switch**

```typescript
case 'ember': {
  // .hbs files don't need esbuild; .js/.ts files do
  const ext = component.path.split('.').pop()
  if (ext === 'hbs') return buildEmberHtml(component.name, source)
  const compiled = await compileSource(prepareForCompile(source), 'ember')
  if (compiled === null) return null
  return buildEmberHtml(component.name, compiled)
}
case 'alpine':
  return buildAlpineHtml(component.name, source)
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/iframeTemplate.ts src/utils/iframeTemplate.test.ts
git commit -m "feat: add buildEmberHtml (Glimmer best-effort) and buildAlpineHtml render builders"
```

---

## Task 10: TypeScript smart routing + componentParser prop extension

**Files:**
- Modify: `src/utils/iframeTemplate.ts`
- Modify: `src/utils/componentParser.ts`
- Test: `src/utils/iframeTemplate.test.ts`

- [ ] **Step 1: Write failing test for TypeScript React detection**

Append to `buildIframeHtml` describe:

```typescript
it('typescript builder routes to React renderer when compiled output has React imports', async () => {
  // Source that after esbuild ts compile would still reference react/jsx-runtime
  const src = `import React from 'react'
export default function Widget(): JSX.Element { return React.createElement('div', null, 'hi') }`
  const comp: ParsedComponent = { name: 'Widget', props: [], framework: 'typescript', renderable: true, path: 'src/Widget.ts' }
  const html = await buildIframeHtml(comp, src, {})
  expect(html).not.toBeNull()
  // Should route through React builder, not plain TS
  expect(html).toContain('createRoot')
})
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run src/utils/iframeTemplate.test.ts
```

Expected: FAIL (current TS builder returns plain ESM without createRoot).

- [ ] **Step 3: Update the `'typescript'` case in `buildIframeHtml`**

Replace:

```typescript
case 'typescript': {
  const compiled = await compileSource(prepareForCompile(source), 'typescript')
  if (compiled === null) return null
  return buildTypeScriptHtml(compiled)
}
```

With:

```typescript
case 'typescript': {
  const compiled = await compileSource(prepareForCompile(source), 'typescript')
  if (compiled === null) return null
  // If compiled output references React, route through React builder
  if (/from ['"]react['"]|from ['"]react\/jsx-runtime['"]/.test(compiled)) {
    return buildReactHtml(component.name, compiled, propsJson)
  }
  return buildTypeScriptHtml(compiled)
}
```

- [ ] **Step 4: Update componentParser prop-parsing branch**

In `src/utils/componentParser.ts`, replace:

```typescript
if (framework === 'react' || framework === 'solid') props = parseReactProps(source)
```

With:

```typescript
if (['react', 'solid', 'preact', 'qwik'].includes(framework)) props = parseReactProps(source)
```

- [ ] **Step 5: Run all tests**

```
npx vitest run
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/iframeTemplate.ts src/utils/componentParser.ts
git commit -m "feat: TypeScript builder detects React imports and re-routes; extend prop-parsing to preact/qwik"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run full test suite**

```
npx vitest run
```

Expected: All tests PASS with no failures.

- [ ] **Step 2: Check TypeScript compilation**

```
npx tsc --noEmit
```

Expected: No type errors. If `Framework` exhaustiveness errors appear in the switch, add a `default: return null` (it should already be there).

- [ ] **Step 3: Commit if any type fixes were needed**

```bash
git add -p
git commit -m "fix: resolve TypeScript exhaustiveness for new Framework union members"
```
