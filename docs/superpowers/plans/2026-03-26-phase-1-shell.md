# Git Suite Phase 1 — Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bare structural shell of Git Suite — frameless Electron window, custom titlebar, sidebar navigation, React Router routing, CSS design system, SQLite schema initialisation, and window bounds persistence.

**Architecture:** electron-vite with React 18 + TypeScript. Main process owns: BrowserWindow config, window bounds persistence via electron-store, IPC handlers (minimize/maximize/close), and SQLite schema initialisation via better-sqlite3. Renderer owns all React components and communicates with main exclusively through the contextBridge API. Strict context isolation enforced — no nodeIntegration.

**Tech Stack:** Electron 31, electron-vite 2, React 18, TypeScript 5, react-router-dom 6 (MemoryRouter), better-sqlite3, electron-store, @fontsource/jetbrains-mono (weights 400/500/700), Vitest, @testing-library/react

---

## File Map

| File | Role |
|------|------|
| `package.json` | Project manifest, all scripts and dependencies |
| `tsconfig.json` | Unified TypeScript config for main + renderer |
| `electron.vite.config.ts` | electron-vite bundler config |
| `vitest.config.ts` | Vitest test runner config (jsdom default, node per-file override) |
| `src/index.html` | Renderer entry HTML — root div + script |
| `electron/main.ts` | BrowserWindow creation, window bounds via electron-store, IPC handlers, DB init |
| `electron/preload.ts` | contextBridge — exposes `window.api.windowControls` |
| `electron/db.ts` | `initSchema(db)` (exported for tests) + `getDb(userData)` singleton |
| `electron/db.test.ts` | Schema tests — all tables exist, WAL mode, idempotent (Node env) |
| `src/env.d.ts` | `window.api` global type declaration |
| `src/main.tsx` | React entry — mounts App, imports fonts + globals.css |
| `src/App.tsx` | MemoryRouter + layout shell (Titlebar + Sidebar + route outlet) |
| `src/styles/globals.css` | All CSS: design tokens, reset, body, all component styles |
| `src/components/Titlebar.tsx` | Traffic-light dots + wordmark, `-webkit-app-region` |
| `src/components/Sidebar.tsx` | Nav items with SVG icons, language sub-list, status bar with pulse dot |
| `src/components/Titlebar.test.tsx` | Render test: dots present, each dot calls correct IPC handler |
| `src/components/Sidebar.test.tsx` | Render test: nav items present, active state applied to current route |
| `src/test/setup.ts` | Imports `@testing-library/jest-dom` matchers |
| `src/views/Discover.tsx` | Placeholder view |
| `src/views/Library.tsx` | Placeholder view |
| `src/views/Collections.tsx` | Placeholder view |
| `src/views/Starred.tsx` | Placeholder view |
| `src/views/RepoDetail.tsx` | Placeholder view |
| `src/views/Onboarding.tsx` | Placeholder view |

---

### Task 1: Project configuration files

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "git-suite",
  "version": "0.1.0",
  "description": "Git Suite — GitHub repo skill manager",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  },
  "dependencies": {
    "@fontsource/jetbrains-mono": "^5.1.0",
    "better-sqlite3": "^9.4.3",
    "electron-store": "^10.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^14.3.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/better-sqlite3": "^7.6.11",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^31.0.1",
    "electron-vite": "^2.3.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.5",
    "vite": "^5.2.11",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "electron/**/*"],
  "exclude": ["node_modules", "out", "dist"]
}
```

- [ ] **Step 3: Create `electron.vite.config.ts`**

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: resolve('src/index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts']
  },
  resolve: {
    alias: {
      // resolve() with a relative path resolves from process.cwd() (project root)
      // Avoids __dirname which is unavailable in ESM contexts
      '@renderer': resolve('src')
    }
  }
})
```

- [ ] **Step 5: Create `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json electron.vite.config.ts vitest.config.ts src/test/setup.ts
git commit -m "chore: project config — electron-vite, TypeScript, Vitest"
```

---

### Task 2: Install dependencies

**Files:** `package-lock.json` (generated), `node_modules/` (generated)

- [ ] **Step 1: Run npm install**

```bash
npm install
```

The `postinstall` script runs `electron-rebuild -f -w better-sqlite3` automatically. This compiles better-sqlite3's native bindings against the installed Electron version.

**Windows prerequisite:** If rebuild fails with node-gyp errors, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, plus Python 3.x. Then re-run `npm install`.

- [ ] **Step 2: Verify native binding compiled**

```bash
ls node_modules/better-sqlite3/build/Release/
```

Expected: `better_sqlite3.node` present. If missing, the app will throw `Cannot find module` at runtime.

- [ ] **Step 3: Commit lock file**

```bash
git add package-lock.json
git commit -m "chore: lock dependencies"
```

---

### Task 3: CSS design system

**Files:**
- Create: `src/styles/globals.css`

No automated test for CSS tokens — visual verification in Task 12.

- [ ] **Step 1: Create `src/styles/globals.css`**

```css
/* ── Design tokens ── */
:root {
  --bg: #0a0a0e;
  --bg2: #0f0f14;
  --bg3: #141419;
  --bg4: #1a1a22;
  --border: rgba(255, 255, 255, 0.06);
  --border2: rgba(255, 255, 255, 0.10);
  --accent: #7c3aed;
  --accent-soft: rgba(124, 58, 237, 0.10);
  --accent-border: rgba(124, 58, 237, 0.25);
  --t1: #e8e8f0;
  --t2: #6b6b80;
  --t3: #34344a;
}

/* ── Reset ── */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#root {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg);
  color: var(--t1);
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

button {
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
}

/* ── Animations ── */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Layout ── */
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg);
}

/* ── Titlebar ── */
.titlebar {
  height: 38px;
  min-height: 38px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  position: relative;
  z-index: 100;
}

.titlebar-dots {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 14px;
  -webkit-app-region: no-drag;
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  cursor: pointer;
  transition: filter 0.1s;
}

.dot:hover {
  filter: brightness(1.2);
}

.dot-close   { background: #ff5f57; }
.dot-minimize { background: #febc2e; }
.dot-maximize { background: #28c840; }

.titlebar-wordmark {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--t3);
  letter-spacing: 0.12em;
  pointer-events: none;
}

/* ── Sidebar ── */
.sidebar {
  width: 180px;
  min-width: 180px;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-nav {
  flex: 1;
  padding-top: 8px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 18px;
  font-size: 11px;
  color: var(--t2);
  cursor: pointer;
  border-right: 2px solid transparent;
  transition: color 0.1s;
  text-decoration: none;
  width: 100%;
  text-align: left;
}

.nav-item:hover {
  color: var(--t1);
}

.nav-item.active {
  color: var(--t1);
  background: var(--accent-soft);
  border-right-color: var(--accent);
}

.nav-item .nav-icon {
  opacity: 0.45;
  flex-shrink: 0;
}

.nav-item.active .nav-icon {
  opacity: 1;
}

.nav-section-label {
  font-size: 9px;
  color: var(--t3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 0 16px;
  margin-top: 14px;
  margin-bottom: 4px;
  display: block;
}

.nav-lang-item {
  display: flex;
  align-items: center;
  padding: 5px 18px 5px 40px;
  font-size: 11px;
  color: var(--t2);
  cursor: pointer;
  border-right: 2px solid transparent;
  transition: color 0.1s;
  text-decoration: none;
  width: 100%;
  text-align: left;
}

.nav-lang-item:hover {
  color: var(--t1);
}

.nav-lang-item.active {
  color: var(--t1);
  background: var(--accent-soft);
  border-right-color: var(--accent);
}

.sidebar-status {
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 7px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active {
  background: #34d399;
  animation: blink 2s infinite;
}

.status-dot.inactive {
  background: var(--t3);
}

.status-text {
  font-size: 10px;
  color: var(--t2);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: CSS design system — tokens, reset, all component styles"
```

---

### Task 4: SQLite database module (TDD)

**Files:**
- Create: `electron/db.test.ts`
- Create: `electron/db.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/db.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'

describe('initSchema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  const tables = ['repos', 'skills', 'collections', 'collection_repos', 'settings']

  it.each(tables)('creates %s table', (table) => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table)
    expect(row).toBeDefined()
  })

  it('enables WAL mode', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(row.journal_mode).toBe('wal')
  })

  it('repos table has required columns', () => {
    const cols = db.prepare('PRAGMA table_info(repos)').all() as { name: string }[]
    const names = cols.map((c) => c.name)
    expect(names).toContain('id')
    expect(names).toContain('owner')
    expect(names).toContain('name')
    expect(names).toContain('stars')
    expect(names).toContain('homepage')
    expect(names).toContain('banner_svg')
  })

  it('skills table has content and enabled_components columns', () => {
    const cols = db.prepare('PRAGMA table_info(skills)').all() as { name: string }[]
    const names = cols.map((c) => c.name)
    expect(names).toContain('repo_id')
    expect(names).toContain('content')
    expect(names).toContain('enabled_components')
  })

  it('collection_repos has composite primary key', () => {
    const cols = db
      .prepare('PRAGMA table_info(collection_repos)')
      .all() as { name: string; pk: number }[]
    const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name)
    expect(pkCols).toContain('collection_id')
    expect(pkCols).toContain('repo_id')
  })

  it('is idempotent — running twice does not throw', () => {
    expect(() => initSchema(db)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run electron/db.test.ts
```

Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 3: Implement `electron/db.ts`**

```typescript
import Database from 'better-sqlite3'
import path from 'path'

export function initSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id          TEXT PRIMARY KEY,
      owner       TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT,
      language    TEXT,
      topics      TEXT,
      stars       INTEGER,
      forks       INTEGER,
      license     TEXT,
      homepage    TEXT,
      updated_at  TEXT,
      saved_at    TEXT,
      type        TEXT,
      banner_svg  TEXT
    );

    CREATE TABLE IF NOT EXISTS skills (
      repo_id            TEXT PRIMARY KEY REFERENCES repos(id),
      filename           TEXT NOT NULL,
      content            TEXT NOT NULL,
      version            TEXT,
      generated_at       TEXT,
      active             INTEGER DEFAULT 1,
      enabled_components TEXT
    );

    CREATE TABLE IF NOT EXISTS collections (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      owner       TEXT DEFAULT 'user',
      active      INTEGER DEFAULT 1,
      created_at  TEXT,
      color_start TEXT,
      color_end   TEXT
    );

    CREATE TABLE IF NOT EXISTS collection_repos (
      collection_id TEXT REFERENCES collections(id),
      repo_id       TEXT REFERENCES repos(id),
      PRIMARY KEY (collection_id, repo_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)
}

let _db: Database.Database | null = null

export function getDb(userData: string): Database.Database {
  if (!_db) {
    _db = new Database(path.join(userData, 'gitsuite.db'))
    initSchema(_db)
  }
  return _db
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run electron/db.test.ts
```

Expected: 8 tests pass — 5 table existence tests, WAL mode, column checks, idempotency.

- [ ] **Step 5: Commit**

```bash
git add electron/db.ts electron/db.test.ts
git commit -m "feat: SQLite database module with full schema (TDD)"
```

---

### Task 5: Electron main process

**Files:**
- Create: `electron/main.ts`

- [ ] **Step 1: Create `electron/main.ts`**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { getDb } from './db'

interface StoreSchema {
  windowBounds: { x?: number; y?: number; width: number; height: number }
}

const store = new Store<StoreSchema>()
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const saved = store.get('windowBounds', { width: 1200, height: 720 })

  mainWindow = new BrowserWindow({
    ...saved,
    minWidth: 1000,
    minHeight: 660,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('close', () => {
    if (mainWindow) store.set('windowBounds', mainWindow.getBounds())
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// IPC handlers registered once — safe for single-window app
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

app.whenReady().then(() => {
  getDb(app.getPath('userData'))
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

**Note:** `ELECTRON_RENDERER_URL` is set automatically by electron-vite in dev mode. No manual configuration needed.

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: Electron main process — BrowserWindow, IPC, window bounds, DB init"
```

---

### Task 6: Preload and type declarations

**Files:**
- Create: `electron/preload.ts`
- Create: `src/env.d.ts`

- [ ] **Step 1: Create `electron/preload.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close')
  }
})
```

- [ ] **Step 2: Create `src/env.d.ts`**

This declares the shape of `window.api` for TypeScript in the renderer. Without this, every call to `window.api` will be a TS error.

```typescript
export {}

declare global {
  interface Window {
    api: {
      windowControls: {
        minimize: () => void
        maximize: () => void
        close:    () => void
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts src/env.d.ts
git commit -m "feat: preload contextBridge and renderer type declarations"
```

---

### Task 7: HTML entry and React entry

**Files:**
- Create: `src/index.html`
- Create: `src/main.tsx`

- [ ] **Step 1: Create `src/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Git Suite</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/main.tsx`**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './styles/globals.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Commit**

```bash
git add src/index.html src/main.tsx
git commit -m "feat: HTML entry and React root"
```

---

### Task 8: Titlebar component (TDD)

**Files:**
- Create: `src/components/Titlebar.test.tsx`
- Create: `src/components/Titlebar.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/Titlebar.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import Titlebar from './Titlebar'

const mockControls = {
  minimize: vi.fn(),
  maximize: vi.fn(),
  close: vi.fn()
}

Object.defineProperty(window, 'api', {
  value: { windowControls: mockControls },
  writable: true
})

describe('Titlebar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Git Suite wordmark', () => {
    render(<Titlebar />)
    expect(screen.getByText('Git Suite')).toBeInTheDocument()
  })

  it('renders three control dots', () => {
    render(<Titlebar />)
    expect(screen.getByTestId('dot-close')).toBeInTheDocument()
    expect(screen.getByTestId('dot-minimize')).toBeInTheDocument()
    expect(screen.getByTestId('dot-maximize')).toBeInTheDocument()
  })

  it('close dot calls windowControls.close', () => {
    render(<Titlebar />)
    fireEvent.click(screen.getByTestId('dot-close'))
    expect(mockControls.close).toHaveBeenCalledOnce()
  })

  it('minimize dot calls windowControls.minimize', () => {
    render(<Titlebar />)
    fireEvent.click(screen.getByTestId('dot-minimize'))
    expect(mockControls.minimize).toHaveBeenCalledOnce()
  })

  it('maximize dot calls windowControls.maximize', () => {
    render(<Titlebar />)
    fireEvent.click(screen.getByTestId('dot-maximize'))
    expect(mockControls.maximize).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/components/Titlebar.test.tsx
```

Expected: FAIL — `Cannot find module './Titlebar'`

- [ ] **Step 3: Implement `src/components/Titlebar.tsx`**

```typescript
export default function Titlebar() {
  const { minimize, maximize, close } = window.api.windowControls

  return (
    <header className="titlebar">
      <div className="titlebar-dots">
        <button
          data-testid="dot-close"
          className="dot dot-close"
          onClick={close}
          aria-label="Close"
        />
        <button
          data-testid="dot-minimize"
          className="dot dot-minimize"
          onClick={minimize}
          aria-label="Minimize"
        />
        <button
          data-testid="dot-maximize"
          className="dot dot-maximize"
          onClick={maximize}
          aria-label="Maximize"
        />
      </div>
      <span className="titlebar-wordmark">Git Suite</span>
    </header>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/Titlebar.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Titlebar.tsx src/components/Titlebar.test.tsx
git commit -m "feat: Titlebar component with traffic-light controls (TDD)"
```

---

### Task 9: Sidebar component (TDD)

**Files:**
- Create: `src/components/Sidebar.test.tsx`
- Create: `src/components/Sidebar.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/Sidebar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import Sidebar from './Sidebar'

function renderWithRouter(initialRoute = '/discover') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="*" element={<Sidebar />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  it('renders all top-level nav items', () => {
    renderWithRouter()
    expect(screen.getByText('Discover')).toBeInTheDocument()
    expect(screen.getByText('My Library')).toBeInTheDocument()
    expect(screen.getByText('Collections')).toBeInTheDocument()
    expect(screen.getByText('Starred')).toBeInTheDocument()
  })

  it('renders Browse nav item', () => {
    renderWithRouter()
    expect(screen.getByText('Browse')).toBeInTheDocument()
  })

  it('renders all language sub-items', () => {
    renderWithRouter()
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('JavaScript')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('Rust')).toBeInTheDocument()
    expect(screen.getByText('Go')).toBeInTheDocument()
    expect(screen.getByText('C / C++')).toBeInTheDocument()
  })

  it('applies active class to Discover item when on /discover', () => {
    renderWithRouter('/discover')
    const item = screen.getByText('Discover').closest('[data-nav]')
    expect(item).toHaveClass('active')
  })

  it('does not apply active class to Library when on /discover', () => {
    renderWithRouter('/discover')
    const item = screen.getByText('My Library').closest('[data-nav]')
    expect(item).not.toHaveClass('active')
  })

  it('applies active class to Library when on /library', () => {
    renderWithRouter('/library')
    const item = screen.getByText('My Library').closest('[data-nav]')
    expect(item).toHaveClass('active')
  })

  it('shows Claude Desktop status text', () => {
    renderWithRouter()
    expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument()
  })

  it('renders LANGUAGES section label', () => {
    renderWithRouter()
    expect(screen.getByText('Languages')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: FAIL — `Cannot find module './Sidebar'`

- [ ] **Step 3: Implement `src/components/Sidebar.tsx`**

```typescript
import { useLocation, useNavigate } from 'react-router-dom'

// ── Inline SVG icons ────────────────────────────────────────────
function BrowseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 1.5C5.3 3.5 5.3 10.5 7 12.5M7 1.5C8.7 3.5 8.7 10.5 7 12.5M1.5 7h11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function DiscoverIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8.8" y1="8.8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <path d="M2.5 2h9v9.5L7 9 2.5 11.5V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function CollectionsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function StarredIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="nav-icon">
      <path d="M7 1.5l1.5 3.1 3.4.5-2.5 2.4.6 3.4L7 9.2l-3 1.7.6-3.4L2.1 5l3.4-.5L7 1.5z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

// ── Nav items config ─────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Browse',      path: '/discover', icon: <BrowseIcon /> },
  { label: 'Discover',    path: '/discover', icon: <DiscoverIcon /> },
  { label: 'My Library',  path: '/library',  icon: <LibraryIcon /> },
  { label: 'Collections', path: '/collections', icon: <CollectionsIcon /> },
  { label: 'Starred',     path: '/starred',  icon: <StarredIcon /> }
]

const LANGUAGES = ['Python', 'JavaScript', 'TypeScript', 'Rust', 'Go', 'C / C++']

// ── Component ────────────────────────────────────────────────────
export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ label, path, icon }) => (
          <button
            key={label}
            data-nav
            className={`nav-item${location.pathname === path && label !== 'Browse' ? ' active' : ''}`}
            onClick={() => navigate(path)}
          >
            {icon}
            {label}
          </button>
        ))}

        <span className="nav-section-label">Languages</span>

        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            className="nav-lang-item"
            onClick={() => navigate('/discover')}
          >
            {lang}
          </button>
        ))}
      </nav>

      <div className="sidebar-status">
        <span className="status-dot inactive" />
        <span className="status-text">Claude Desktop — inactive</span>
      </div>
    </aside>
  )
}
```

**Note on Browse active state:** Browse and Discover both route to `/discover`. Browse is intentionally never marked active — only Discover gets the active highlight on `/discover`. This matches the spec: Browse is a navigation shortcut, not a destination.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat: Sidebar component with nav, language list, status bar (TDD)"
```

---

### Task 10: Placeholder views

**Files:**
- Create: `src/views/Discover.tsx`
- Create: `src/views/Library.tsx`
- Create: `src/views/Collections.tsx`
- Create: `src/views/Starred.tsx`
- Create: `src/views/RepoDetail.tsx`
- Create: `src/views/Onboarding.tsx`

- [ ] **Step 1: Create all placeholder views**

Each view follows the same pattern. Create each file:

`src/views/Discover.tsx`:
```typescript
export default function Discover() {
  return (
    <div style={{ padding: 32, color: 'var(--t2)', fontSize: 12 }}>
      Discover — coming in Phase 3
    </div>
  )
}
```

`src/views/Library.tsx`:
```typescript
export default function Library() {
  return (
    <div style={{ padding: 32, color: 'var(--t2)', fontSize: 12 }}>
      My Library — coming in Phase 5
    </div>
  )
}
```

`src/views/Collections.tsx`:
```typescript
export default function Collections() {
  return (
    <div style={{ padding: 32, color: 'var(--t2)', fontSize: 12 }}>
      Collections — coming in Phase 6
    </div>
  )
}
```

`src/views/Starred.tsx`:
```typescript
export default function Starred() {
  return (
    <div style={{ padding: 32, color: 'var(--t2)', fontSize: 12 }}>
      Starred — coming in Phase 2
    </div>
  )
}
```

`src/views/RepoDetail.tsx`:
```typescript
export default function RepoDetail() {
  return (
    <div style={{ padding: 32, color: 'var(--t2)', fontSize: 12 }}>
      Repo Detail — coming in Phase 3
    </div>
  )
}
```

`src/views/Onboarding.tsx`:
```typescript
export default function Onboarding() {
  return (
    <div style={{ padding: 32, color: 'var(--t2)', fontSize: 12 }}>
      Onboarding — coming in Phase 2
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/
git commit -m "feat: placeholder views for all routes"
```

---

### Task 11: App shell and routing

**Files:**
- Create: `src/App.tsx`

- [ ] **Step 1: Create `src/App.tsx`**

```typescript
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import Discover from './views/Discover'
import Library from './views/Library'
import Collections from './views/Collections'
import Starred from './views/Starred'
import RepoDetail from './views/RepoDetail'
import Onboarding from './views/Onboarding'

export default function App() {
  return (
    <MemoryRouter initialEntries={['/discover']}>
      <div className="app-shell">
        <Titlebar />
        <div className="app-body">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/discover" replace />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/library" element={<Library />} />
              <Route path="/collections" element={<Collections />} />
              <Route path="/starred" element={<Starred />} />
              <Route path="/repo/:owner/:name" element={<RepoDetail />} />
              <Route path="/onboarding" element={<Onboarding />} />
            </Routes>
          </main>
        </div>
      </div>
    </MemoryRouter>
  )
}
```

- [ ] **Step 2: Run all tests to confirm nothing broken**

```bash
npx vitest run
```

Expected: all tests pass (db schema tests + Titlebar tests + Sidebar tests).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: App shell with MemoryRouter, layout, all routes wired"
```

---

### Task 12: Smoke test — run the app

No code changes. Verify everything renders correctly.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: Electron window opens at 1200×720.

- [ ] **Step 2: Visual checklist**

Verify each item in the running app:

- [ ] Window is frameless — no native titlebar
- [ ] Window minimum size enforced — try resizing below 1000×660
- [ ] Three traffic-light dots visible, left-aligned at 14px padding
- [ ] Red dot closes the window
- [ ] Yellow dot minimizes
- [ ] Green dot maximizes / restores
- [ ] "Git Suite" wordmark centred in titlebar, 11px, muted colour
- [ ] Sidebar 180px wide, darker background than main area
- [ ] Browse, Discover, My Library, Collections, Starred nav items visible
- [ ] LANGUAGES section label visible, uppercase, muted
- [ ] Python, JavaScript, TypeScript, Rust, Go, C / C++ sub-items visible
- [ ] Claude Desktop status bar at bottom of sidebar
- [ ] Clicking Discover → active highlight (accent background + right border)
- [ ] Clicking My Library → active transfers to My Library
- [ ] JetBrains Mono rendering throughout — no fallback system font
- [ ] No hardcoded colours visible (inspect element to confirm all colours are CSS vars)

- [ ] **Step 3: Verify window bounds persist**

Close and reopen the app. Window should restore to the last position/size.

- [ ] **Step 4: Verify database created**

```bash
# On Windows — check if the DB file was created
ls "$APPDATA/git-suite/gitsuite.db" 2>/dev/null || echo "Check %APPDATA%\git-suite\gitsuite.db"
```

Expected: `gitsuite.db` file exists in the app's userData directory.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 shell complete — frameless window, sidebar, routing, SQLite"
```
