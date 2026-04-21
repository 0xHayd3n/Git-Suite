# Framework Rendering — Full Coverage Design

**Date:** 2026-03-30
**Status:** Approved

## Goal

Expand the component explorer's framework detection and in-browser rendering to cover every major JavaScript UI framework. Every framework attempts a real render using its canonical runtime/CDN conventions; the existing postMessage error bridge falls back to source-code view on failure.

## Approach

Best-effort rendering: compile + mount using each framework's own runtime, catch errors via the error bridge, show source on failure. No framework produces a blank tab.

---

## 1. Framework Type

`src/types/components.ts` — add 6 new members to the `Framework` union:

```
'preact' | 'lit' | 'qwik' | 'stencil' | 'ember' | 'alpine'
```

Full type after change:
```
'react' | 'vue' | 'svelte' | 'solid' | 'angular' |
'preact' | 'lit' | 'qwik' | 'stencil' | 'ember' | 'alpine' |
'javascript' | 'typescript' | 'unknown'
```

---

## 2. Detection (`src/utils/componentScanner.ts`)

### 2a. Package.json signals (`FRAMEWORK_PACKAGES`)

New entries added in this order (priority highest → lowest). `preact` is placed **after** `react` to avoid misclassifying `preact/compat` bridge projects that install both:

| Package | Framework |
|---|---|
| `lit` | lit |
| `lit-element` | lit |
| `@lit/reactive-element` | lit |
| `@builder.io/qwik` | qwik |
| `@stencil/core` | stencil |
| `ember-source` | ember |
| `@ember/component` | ember |
| `alpinejs` | alpine |
| `preact` | preact ← after react/react-dom |

### 2b. Tree fallback (`detectFrameworkFromTree`)

One new pattern, checked before the `.js` → `javascript` fallback:

- `.hbs` files → `ember`

Preact, Qwik, Stencil, Lit, Alpine are **not** detectable from file extensions alone (they share `.tsx`/`.ts`/`.js` with React/TypeScript). Package.json detection is the only reliable signal for them.

### 2c. Valid extensions (`VALID_EXTENSIONS`)

| Framework | Extensions |
|---|---|
| preact | tsx, jsx, js |
| lit | ts, js |
| qwik | tsx, jsx |
| stencil | tsx |
| ember | hbs, js, ts |
| alpine | js, html |

### 2d. Include patterns

Add `/addon/` and `/app/` to `INCLUDE_PATTERNS` — Ember's conventional component directories (`app/components/`, `addon/components/`).

---

## 3. Rendering (`src/utils/iframeTemplate.ts`)

### 3a. esbuild compile handler (`electron/componentScanner.ts`)

The `components:compile` IPC handler already accepts a `framework` parameter. New branches:

| Framework | loader | jsx option | Notes |
|---|---|---|---|
| preact | tsx | automatic | jsxImportSource: 'preact' |
| qwik | tsx | automatic | jsxImportSource: '@builder.io/qwik' |
| stencil | tsx | transform | jsxFactory: 'h', jsxFragmentFactory: 'Fragment' (classic mode; `'transform'` is the correct esbuild value) |
| lit | ts | — | experimentalDecorators: true (required for @customElement, @property) |
| ember | ts | — | — |
| alpine | (no compile step) | — | raw JS passed directly |

### 3b. CDN pins (`PINNED`)

New entries (framework-specific packages get `?external=` set to their own peer, not `react,react-dom`):

```
preact                    → https://esm.sh/preact@10
preact/hooks              → https://esm.sh/preact@10/hooks
preact/compat             → https://esm.sh/preact@10/compat
preact/jsx-runtime        → https://esm.sh/preact@10/jsx-runtime
@builder.io/qwik          → https://esm.sh/@builder.io/qwik@1
@builder.io/qwik/build    → https://esm.sh/@builder.io/qwik@1/build
lit                       → https://esm.sh/lit@3
lit/decorators.js         → https://esm.sh/lit@3/decorators.js
lit/html.js               → https://esm.sh/lit@3/html.js
lit/reactive-element.js   → https://esm.sh/lit@3/reactive-element.js
@lit/reactive-element     → https://esm.sh/@lit/reactive-element@2
@stencil/core             → https://esm.sh/@stencil/core@4
```

### 3c. `buildImportMap` — framework-aware `?external=`

The existing `buildImportMap` hardcodes `?external=react,react-dom` for all unknown packages. This is wrong for Preact/Qwik/Stencil which have no React peer. `buildImportMap` gains an optional `externalPeer` parameter (default `'react,react-dom'`) so each builder can pass the correct value:

- React, Solid, TypeScript → `external=react,react-dom`
- Preact → `external=preact`
- Qwik → `external=@builder.io/qwik`
- Stencil, Lit → `external=lit` / `external=@stencil/core`
- Others → omit or pass empty string

### 3d. Render builders — one function per new framework

**`buildPreactHtml(name, compiledCode, propsJson)`**
- Same esbuild + import map structure as `buildReactHtml`
- esbuild automatic JSX emits calls to `preact/jsx-runtime`; the render tail only needs `render` from `preact` (no `h` import — the compiled code already uses the jsx-runtime)
- Render tail: `import{render as _$r}from'preact'` → `_$r(componentVnode, root)` where componentVnode is the already-compiled default export called with props
- Import map uses preact pins with `external=preact`

**`buildQwikHtml(name, compiledCode, propsJson)`**
- Qwik 1.x exposes `render(element, jsx)` from `@builder.io/qwik` for browser mounting
- Same import map structure; `external=@builder.io/qwik`
- Render tail: `import{render as _$r}from'@builder.io/qwik'` → `_$r(root, jsx(Name, props))`
- Note: Qwik's `$` suffix lazy functions require the Qwik runtime to be present; simple components work, complex ones with `useSignal$`/`useStore$` may fail and fall back

**`buildLitHtml(name, compiledCode)`**
- Detect tag name: regex scan for `@customElement('tag-name')` or `customElements.define('tag-name'`; default to `'x-preview'`
- esbuild compiles with `experimentalDecorators: true`; decorators become class-field calls that rely on `lit` runtime being present
- Import map includes all lit pins with `external=lit`
- After the module script runs, the custom element is registered; mount by inserting `<tag-name></tag-name>` in body
- Props are serialised as attributes: `element.setAttribute(key, JSON.stringify(value))`

**`buildStencilHtml(name, compiledCode)`**
- **Caveat:** The Stencil compiler performs multi-stage transforms including `customElements.define()` emission. esbuild's `transform` API only strips types and converts JSX; it does not replicate Stencil's component registration output. This builder is genuinely best-effort — simple components may partially work if `@stencil/core` runtime is present; complex components with lifecycle hooks will likely fail and show source.
- Detect tag name from `@Component({ tag: '...' })` in raw source
- Compile with esbuild (tsx, transform mode, jsxFactory: h)
- Load `@stencil/core` via import map; insert `<tag-name></tag-name>` after module executes

**`buildEmberHtml(name, source)`**
- `Ember.HTMLBars.compile()` is **not** available in CDN Ember builds (removed at Octane/3.x). Runtime template compilation is build-time only in modern Ember.
- Realistic best-effort: use `@glimmer/component` (the modern primitive underneath Ember) with `@glimmer/runtime` loaded from esm.sh. `.hbs` template strings are passed as template literals using Glimmer's `setComponentTemplate` + `createTemplate` API.
- For `.js`/`.ts` files: esbuild-compile first (ts loader), then load into a minimal Glimmer owner context
- This builder receives **raw source** for `.hbs` files and **compiled JS** for `.js`/`.ts` files — the `buildIframeHtml` switch is responsible for calling `compileSource` before invoking `buildEmberHtml` for non-hbs paths
- Ember is the most complex case; expect frequent fallback to source view for real-world components

**`buildAlpineHtml(name, source)`**
- `name` parameter included for consistency with the `buildIframeHtml` switch interface
- No compile step; raw source injected as-is
- Load Alpine 3 CDN with `defer` so it initialises after DOM is ready
- Detect `Alpine.data('componentName', ...)` pattern → mount `<div x-data="componentName">` with generic demo child elements
- If no `Alpine.data` detected: wrap in `<script>` and mount a plain `<div x-data="{}">` sandbox

### 3e. Vue fix — replace with `vue3-sfc-loader`

Current `buildVueHtml` extracts only `<template>`, ignoring `<script setup>` and Options API. Replace with:
- Load Vue 3 global build + `vue3-sfc-loader` from CDN
- `loadModule('/component.vue', { getFile: () => rawSource, addStyle: injectStyleTag, moduleCache: { vue: Vue } })`
- Mount: `createApp(defineAsyncComponent(() => loadModule(...))).mount('#app')`
- Props passed via the app's `setup()` returning the props object

### 3f. Angular fix — full JIT stack

Current implementation is missing `reflect-metadata` and `@angular/compiler`. Fix:
- Keep existing `zone.js` script tag
- Add `<script src="https://unpkg.com/reflect-metadata/Reflect.js">` before any Angular imports
- First ESM import: `import 'https://esm.sh/@angular/compiler@17'` — this registers the JIT compiler globally
- Detect standalone vs NgModule: check source for `standalone: true` in `@Component` decorator
  - Standalone → `bootstrapApplication(ClassName)`
  - NgModule → wrap in minimal `@NgModule({ declarations: [Comp], bootstrap: [Comp] })` → `platformBrowserDynamic().bootstrapModule(WrapperModule)`

### 3g. TypeScript improvement

After esbuild compile (ts loader), scan compiled output for React signals:
- Bare `react` imports or `jsx-runtime` references in compiled output → route through `buildReactHtml`
- Otherwise: execute in plain ESM module context (utilities, data libraries produce no visual output but don't error)

### 3h. `buildIframeHtml` switch

Full switch after changes:
```
react     → compileTsx → buildReactHtml
preact    → compileTsx → buildPreactHtml
solid     → compileTsx → buildSolidHtml
qwik      → compileTsx → buildQwikHtml
vue       → buildVueHtml (sfc-loader, no pre-compile)
svelte    → buildSvelteHtml (compiler at runtime)
angular   → compileTs  → buildAngularHtml
lit       → compileTsWithDecorators → buildLitHtml
stencil   → compileTsx → buildStencilHtml
ember     → compileTs (for .js/.ts) | raw (for .hbs) → buildEmberHtml
alpine    → buildAlpineHtml (no compile)
typescript→ compileTs → detect React → buildReactHtml | buildTypeScriptHtml
javascript→ buildJavaScriptHtml (jQuery sandbox)
unknown   → buildJavaScriptHtml
```

---

## 4. `src/utils/componentParser.ts`

Already sets `renderable = true` unconditionally. No logic change needed. However, the `parseReactProps` branch should be extended to also cover `preact` and `qwik` (both use the same `interface *Props` / `type *Props` TypeScript pattern as React):

```typescript
if (['react', 'solid', 'preact', 'qwik'].includes(framework)) props = parseReactProps(source)
```

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/types/components.ts` | Add 6 framework types |
| `src/utils/componentScanner.ts` | FRAMEWORK_PACKAGES, detectFrameworkFromTree, VALID_EXTENSIONS, INCLUDE_PATTERNS |
| `electron/componentScanner.ts` | esbuild compile handler: new jsxImportSource/loader branches; `experimentalDecorators` for Lit |
| `src/utils/iframeTemplate.ts` | PINNED additions, buildImportMap `externalPeer` param, 6 new builders, fix Vue + Angular, update switch |
| `src/utils/componentParser.ts` | Extend prop-parsing branch to include preact and qwik |
| `src/utils/iframeTemplate.test.ts` | Tests for each new builder |
| `src/utils/componentScanner.test.ts` | Detection tests for new frameworks |

---

## 6. Rendering Support Table

| Framework | CDN / runtime | Compile | Mount | Support level |
|---|---|---|---|---|
| React | esm.sh react@18 | esbuild tsx (jsx=react) | createRoot().render() | ✅ Full |
| Preact | esm.sh preact@10 | esbuild tsx (jsx=preact) | render(vnode, root) | ✅ Full |
| Solid | esm.sh solid-js@1 | esbuild tsx (jsx=solid-js) | render(() => createComponent(C, props), root) | ✅ Full |
| Qwik | esm.sh @builder.io/qwik@1 | esbuild tsx (jsx=qwik) | render(root, jsx(C, props)) | ✅ Best-effort |
| Vue | vue3-sfc-loader CDN | sfc-loader (inline) | createApp(AsyncComp).mount() | ✅ Full (fixed) |
| Svelte | svelte@4 compiler CDN | compiler at runtime | new Component({ target, props }) | ✅ Full |
| Lit | esm.sh lit@3 | esbuild ts + experimentalDecorators | `<tag-name>` custom element | ✅ Best-effort |
| Stencil | esm.sh @stencil/core@4 | esbuild tsx (transform, h factory) | `<tag-name>` custom element | ⚠️ Best-effort (no Stencil compiler) |
| Angular | zone.js + reflect-metadata + @angular/compiler | esbuild ts | bootstrapApplication / bootstrapModule | ✅ Best-effort (fixed) |
| Ember | @glimmer/component + @glimmer/runtime CDN | esbuild ts (for .js/.ts) | Glimmer owner + setComponentTemplate | ⚠️ Best-effort |
| Alpine | alpinejs@3 CDN (defer) | none | `<div x-data="name">` | ✅ Best-effort |
| TypeScript | esm.sh import map | esbuild ts | React render if React imports detected; else raw ESM | ⚠️ Best-effort |
| JavaScript | jQuery CDN | none | `$('#demo').pluginName()` if detected | ⚠️ Best-effort |
| Unknown | jQuery CDN | none | same as JavaScript | ⚠️ Best-effort |
