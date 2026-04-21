# Phase 2: GitHub Integration & Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub OAuth connection, starred repos sync, a three-screen first-launch onboarding flow, and GitHub connection status in the sidebar.

**Architecture:** Main process handles all GitHub API calls and token storage (electron-store). Renderer orchestrates the flow via IPC. SQLite stores repo metadata; electron-store holds the OAuth token. A first-launch gate in App.tsx checks `onboarding_complete` before rendering the main UI.

**Tech Stack:** Electron 31, React 18, TypeScript, electron-store 8, better-sqlite3, React Router 6, Vitest, @testing-library/react

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/db.ts` | Modify | Add unique index on repos(owner, name) |
| `electron/store.ts` | Create | electron-store singleton — token + display cache |
| `electron/store.test.ts` | Create | Unit tests for store functions |
| `electron/github.ts` | Create | GitHub API service (getUser, getStarred, getRepo, exchangeCode) |
| `electron/github.test.ts` | Create | Unit tests for API functions |
| `electron/main.ts` | Modify | Protocol registration, deep link, 7 IPC handlers |
| `electron/preload.ts` | Modify | Expose window.api.github + window.api.settings |
| `src/env.d.ts` | Modify | TypeScript types for new API surface |
| `src/App.tsx` | Modify | Inner AppContent component with onboarding gate |
| `src/App.test.tsx` | Create | Onboarding gate behaviour tests |
| `src/styles/globals.css` | Modify | Onboarding layout, progress dots, permission rows, stat cards |
| `src/views/Onboarding.tsx` | Replace | Three-screen onboarding flow |
| `src/views/Onboarding.test.tsx` | Create | Tests for all three screens |
| `src/components/Sidebar.tsx` | Modify | GitHub connection status footer |
| `src/components/Sidebar.test.tsx` | Modify | Add tests for connection status |

---

## Task 1: DB Migration — Unique Index on repos(owner, name)

**Files:**
- Modify: `electron/db.ts`
- Modify: `electron/db.test.ts`

- [ ] **Step 1.1: Write failing test**

Add to `electron/db.test.ts` inside the existing `describe('initSchema', ...)` block:

```ts
it('repos_owner_name unique index exists', () => {
  const idx = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='repos_owner_name'")
    .get()
  expect(idx).toBeDefined()
})

it('repos_owner_name index enforces uniqueness', () => {
  db.prepare("INSERT INTO repos (id, owner, name) VALUES ('1', 'alice', 'foo')").run()
  expect(() =>
    db.prepare("INSERT INTO repos (id, owner, name) VALUES ('2', 'alice', 'foo')").run()
  ).toThrow()
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd D:/Coding/Git-Suite && npx vitest run electron/db.test.ts
```

Expected: 2 new tests fail (`repos_owner_name unique index exists`, `enforces uniqueness`).

- [ ] **Step 1.3: Add unique index to db.ts**

In `electron/db.ts`, add one line inside `db.exec(...)`, after the `settings` table CREATE statement and before the closing backtick:

```sql
    CREATE UNIQUE INDEX IF NOT EXISTS repos_owner_name ON repos (owner, name);
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npx vitest run electron/db.test.ts
```

Expected: all tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add electron/db.ts electron/db.test.ts
git commit -m "feat: add unique index repos(owner, name) for upsert support"
```

---

## Task 2: electron/store.ts — Token Store

**Files:**
- Create: `electron/store.ts`
- Create: `electron/store.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `electron/store.test.ts`:

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockSet = vi.fn()
const mockDelete = vi.fn()

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
  })),
}))

import { getToken, setToken, clearToken, getGitHubUser, setGitHubUser, clearGitHubUser } from './store'

describe('token', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
    mockDelete.mockReset()
  })

  it('getToken reads github.token', () => {
    mockGet.mockReturnValue('tok123')
    expect(getToken()).toBe('tok123')
    expect(mockGet).toHaveBeenCalledWith('github.token')
  })

  it('getToken returns undefined when not set', () => {
    mockGet.mockReturnValue(undefined)
    expect(getToken()).toBeUndefined()
  })

  it('setToken writes github.token', () => {
    setToken('mytoken')
    expect(mockSet).toHaveBeenCalledWith('github.token', 'mytoken')
  })

  it('clearToken deletes github.token', () => {
    clearToken()
    expect(mockDelete).toHaveBeenCalledWith('github.token')
  })
})

describe('gitHubUser', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
    mockDelete.mockReset()
  })

  it('getGitHubUser returns undefined when username not set', () => {
    mockGet.mockReturnValue(undefined)
    expect(getGitHubUser()).toBeUndefined()
  })

  it('getGitHubUser returns username and avatarUrl', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'github.username') return 'alice'
      if (key === 'github.avatarUrl') return 'https://example.com/avatar.png'
    })
    expect(getGitHubUser()).toEqual({ username: 'alice', avatarUrl: 'https://example.com/avatar.png' })
  })

  it('setGitHubUser writes both keys', () => {
    setGitHubUser('alice', 'https://example.com/avatar.png')
    expect(mockSet).toHaveBeenCalledWith('github.username', 'alice')
    expect(mockSet).toHaveBeenCalledWith('github.avatarUrl', 'https://example.com/avatar.png')
  })

  it('clearGitHubUser deletes both keys', () => {
    clearGitHubUser()
    expect(mockDelete).toHaveBeenCalledWith('github.username')
    expect(mockDelete).toHaveBeenCalledWith('github.avatarUrl')
  })
})
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
npx vitest run electron/store.test.ts
```

Expected: all tests fail (module not found).

- [ ] **Step 2.3: Create electron/store.ts**

```ts
import Store from 'electron-store'

interface GitHubStoreSchema {
  'github.token'?: string
  'github.username'?: string
  'github.avatarUrl'?: string
}

const githubStore = new Store<GitHubStoreSchema>()

export function getToken(): string | undefined {
  return githubStore.get('github.token')
}

export function setToken(token: string): void {
  githubStore.set('github.token', token)
}

export function clearToken(): void {
  githubStore.delete('github.token')
}

export function getGitHubUser(): { username: string; avatarUrl: string } | undefined {
  const username = githubStore.get('github.username')
  const avatarUrl = githubStore.get('github.avatarUrl')
  if (!username) return undefined
  return { username, avatarUrl: avatarUrl ?? '' }
}

export function setGitHubUser(username: string, avatarUrl: string): void {
  githubStore.set('github.username', username)
  githubStore.set('github.avatarUrl', avatarUrl)
}

export function clearGitHubUser(): void {
  githubStore.delete('github.username')
  githubStore.delete('github.avatarUrl')
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
npx vitest run electron/store.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add electron/store.ts electron/store.test.ts
git commit -m "feat: electron-store token singleton (store.ts)"
```

---

## Task 3: electron/github.ts — GitHub API Service

**Files:**
- Create: `electron/github.ts`
- Create: `electron/github.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `electron/github.test.ts`:

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getUser, getStarred, exchangeCode } from './github'

function makeResponse(body: unknown, headers: Record<string, string> = {}, ok = true) {
  return {
    ok,
    status: ok ? 200 : 401,
    json: () => Promise.resolve(body),
    headers: { get: (k: string) => headers[k] ?? null },
  }
}

describe('getUser', () => {
  beforeEach(() => mockFetch.mockReset())

  it('fetches /user and returns data', async () => {
    mockFetch.mockResolvedValue(makeResponse({ login: 'alice', avatar_url: 'https://example.com/a.png', public_repos: 42 }))
    const user = await getUser('tok')
    expect(user.login).toBe('alice')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    )
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, {}, false))
    await expect(getUser('tok')).rejects.toThrow('GitHub API error: 401')
  })
})

describe('getStarred', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns repos from a single page', async () => {
    const repos = [{ id: 1, name: 'repo1', owner: { login: 'alice' } }]
    mockFetch.mockResolvedValue(makeResponse(repos))
    const result = await getStarred('tok')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('repo1')
  })

  it('follows Link header to fetch multiple pages', async () => {
    const page1 = [{ id: 1, name: 'r1', owner: { login: 'a' } }]
    const page2 = [{ id: 2, name: 'r2', owner: { login: 'a' } }]
    mockFetch
      .mockResolvedValueOnce(makeResponse(page1, { Link: '<https://api.github.com/user/starred?page=2>; rel="next"' }))
      .mockResolvedValueOnce(makeResponse(page2))
    const result = await getStarred('tok')
    expect(result).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('stops after 10 pages', async () => {
    const pageData = [{ id: 1, name: 'r', owner: { login: 'a' } }]
    // All pages return a next link
    mockFetch.mockResolvedValue(
      makeResponse(pageData, { Link: '<https://api.github.com/user/starred?page=2>; rel="next"' })
    )
    const result = await getStarred('tok')
    expect(mockFetch).toHaveBeenCalledTimes(10)
    expect(result).toHaveLength(10)
  })
})

describe('exchangeCode', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns access_token on success', async () => {
    mockFetch.mockResolvedValue(makeResponse({ access_token: 'gho_abc123' }))
    const token = await exchangeCode('code123')
    expect(token).toBe('gho_abc123')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws when access_token is missing', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'bad_verification_code', error_description: 'The code passed is incorrect' }))
    await expect(exchangeCode('bad')).rejects.toThrow('The code passed is incorrect')
  })

  it('throws with fallback message when error_description missing', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'unknown' }))
    await expect(exchangeCode('bad')).rejects.toThrow('OAuth exchange failed')
  })
})
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
npx vitest run electron/github.test.ts
```

Expected: all tests fail (module not found).

- [ ] **Step 3.3: Create electron/github.ts**

```ts
export const CLIENT_ID = 'YOUR_CLIENT_ID_HERE'
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE'
const BASE = 'https://api.github.com'

export const OAUTH_URL =
  `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=read:user&redirect_uri=gitsuite://oauth/callback`

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  }
}

export interface GitHubUser {
  login: string
  avatar_url: string
  public_repos: number
}

export interface GitHubRepo {
  id: number
  name: string
  owner: { login: string }
  description: string | null
  language: string | null
  topics: string[]
  stargazers_count: number
  forks_count: number
  license: { spdx_id: string } | null
  homepage: string | null
  updated_at: string
}

export async function getUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${BASE}/user`, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json() as Promise<GitHubUser>
}

export async function getStarred(token: string): Promise<GitHubRepo[]> {
  const results: GitHubRepo[] = []
  let url: string | null = `${BASE}/user/starred?per_page=100`
  let page = 0

  while (url && page < 10) {
    const res = await fetch(url, { headers: githubHeaders(token) })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
    const data = (await res.json()) as GitHubRepo[]
    results.push(...data)
    page++
    const link = res.headers.get('Link') ?? ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }

  return results
}

export async function getRepo(token: string, owner: string, name: string): Promise<GitHubRepo> {
  const res = await fetch(`${BASE}/repos/${owner}/${name}`, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json() as Promise<GitHubRepo>
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  })
  const data = (await res.json()) as { access_token?: string; error_description?: string }
  if (!data.access_token) {
    throw new Error(data.error_description ?? 'OAuth exchange failed')
  }
  return data.access_token
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

```bash
npx vitest run electron/github.test.ts
```

Expected: all tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add electron/github.ts electron/github.test.ts
git commit -m "feat: GitHub API service (github.ts) — getUser, getStarred, exchangeCode"
```

---

## Task 4: electron/main.ts — Protocol Registration & IPC Handlers

**Files:**
- Modify: `electron/main.ts`

No unit tests — IPC handlers require the full Electron environment. Verified manually at runtime.

- [ ] **Step 4.1: Replace electron/main.ts with the updated version**

Replace the entire file:

```ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { getDb, closeDb } from './db'
import { getToken, setToken, clearToken, setGitHubUser, clearGitHubUser } from './store'
import { OAUTH_URL, exchangeCode, getUser, getStarred } from './github'

// ── Window bounds store (separate from GitHub token store) ──────
interface WindowStoreSchema {
  windowBounds: { x?: number; y?: number; width: number; height: number }
}
const windowStore = new Store<WindowStoreSchema>()
let mainWindow: BrowserWindow | null = null

// ── Deep link handler ───────────────────────────────────────────
function handleDeepLink(url: string): void {
  try {
    const code = new URL(url).searchParams.get('code')
    if (code) mainWindow?.webContents.send('oauth:callback', code)
  } catch {
    // malformed URL — ignore
  }
}

// ── Protocol + single-instance (must be module scope) ──────────
app.setAsDefaultProtocolClient('gitsuite')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith('gitsuite://'))
    if (url) handleDeepLink(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// macOS deep link
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// ── Window ──────────────────────────────────────────────────────
function createWindow(): void {
  const saved = windowStore.get('windowBounds', { width: 1200, height: 720 })

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
      nodeIntegration: false,
    },
  })

  mainWindow.on('close', () => {
    if (mainWindow) windowStore.set('windowBounds', mainWindow.getBounds())
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ── Window control IPC ──────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ── GitHub IPC ──────────────────────────────────────────────────
ipcMain.handle('github:connect', async () => {
  try {
    await shell.openExternal(OAUTH_URL)
  } catch {
    throw new Error('Failed to open browser')
  }
})

ipcMain.handle('github:exchange', async (_event, code: string) => {
  const token = await exchangeCode(code)
  setToken(token)
})

ipcMain.handle('github:getUser', async () => {
  const token = getToken()
  if (!token) throw new Error('Not connected')
  const user = await getUser(token)
  setGitHubUser(user.login, user.avatar_url)
  const db = getDb(app.getPath('userData'))
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('github_username', user.login)
  return { login: user.login, avatarUrl: user.avatar_url, publicRepos: user.public_repos }
})

ipcMain.handle('github:getStarred', async () => {
  const token = getToken()
  if (!token) return // no token (user skipped onboarding)

  const db = getDb(app.getPath('userData'))
  const lastRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('last_starred_sync') as
    | { value: string }
    | undefined

  if (lastRow && Date.now() - Number(lastRow.value) < 3_600_000) return // cache fresh

  const repos = await getStarred(token)

  const upsert = db.prepare(`
    INSERT INTO repos (id, owner, name, description, language, topics, stars, forks,
                       license, homepage, updated_at, saved_at, type, banner_svg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(owner, name) DO UPDATE SET
      description = excluded.description,
      language    = excluded.language,
      topics      = excluded.topics,
      stars       = excluded.stars,
      forks       = excluded.forks,
      updated_at  = excluded.updated_at
  `)
  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  db.transaction(() => {
    for (const repo of repos) {
      upsert.run(
        String(repo.id),
        repo.owner.login,
        repo.name,
        repo.description,
        repo.language,
        JSON.stringify(repo.topics ?? []),
        repo.stargazers_count,
        repo.forks_count,
        repo.license?.spdx_id ?? null,
        repo.homepage,
        repo.updated_at,
      )
    }
    setSetting.run('last_starred_sync', String(Date.now()))
    setSetting.run('starred_repo_count', String(repos.length))
  })()
})

ipcMain.handle('github:disconnect', async () => {
  clearToken()
  clearGitHubUser()
  const db = getDb(app.getPath('userData'))
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('github_username', '')
})

// ── Settings IPC ────────────────────────────────────────────────
ipcMain.handle('settings:get', async (_event, key: string) => {
  const db = getDb(app.getPath('userData'))
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
})

ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
  const db = getDb(app.getPath('userData'))
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
})

// ── App lifecycle ───────────────────────────────────────────────
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

app.on('before-quit', () => {
  closeDb()
})
```

- [ ] **Step 4.2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: protocol registration, deep link handler, GitHub + settings IPC"
```

---

## Task 5: Renderer Bridge — preload.ts + env.d.ts

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 5.1: Replace electron/preload.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron'

// Map from user-provided callback → wrapper function, so removeListener works correctly
const callbackWrappers = new Map<Function, (...args: unknown[]) => void>()

contextBridge.exposeInMainWorld('api', {
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  github: {
    connect:    () => ipcRenderer.invoke('github:connect'),
    exchange:   (code: string) => ipcRenderer.invoke('github:exchange', code),
    getUser:    () => ipcRenderer.invoke('github:getUser'),
    getStarred: () => ipcRenderer.invoke('github:getStarred'),
    disconnect: () => ipcRenderer.invoke('github:disconnect'),
    onCallback: (cb: (code: string) => void) => {
      const wrapper = (_: unknown, code: string) => cb(code)
      callbackWrappers.set(cb, wrapper)
      ipcRenderer.on('oauth:callback', wrapper)
    },
    offCallback: (cb: (code: string) => void) => {
      const wrapper = callbackWrappers.get(cb)
      if (wrapper) {
        ipcRenderer.removeListener('oauth:callback', wrapper)
        callbackWrappers.delete(cb)
      }
    },
  },

  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },
})
```

- [ ] **Step 5.2: Replace src/env.d.ts**

Note: `getUser` returns the user object (not `void`) so the renderer can read the username
directly from the IPC result without a second round-trip. This intentionally deviates from the
spec's `Promise<void>` annotation.

```ts
export {}

declare global {
  interface Window {
    api: {
      windowControls: {
        minimize: () => void
        maximize: () => void
        close:    () => void
      }
      github: {
        connect:     () => Promise<void>
        exchange:    (code: string) => Promise<void>
        // Returns user data so renderer can read login without a second IPC call
        getUser:     () => Promise<{ login: string; avatarUrl: string; publicRepos: number }>
        getStarred:  () => Promise<void>
        disconnect:  () => Promise<void>
        onCallback:  (cb: (code: string) => void) => void
        offCallback: (cb: (code: string) => void) => void
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
      }
    }
  }
}
```

- [ ] **Step 5.3: Commit**

```bash
git add electron/preload.ts src/env.d.ts
git commit -m "feat: expose github + settings IPC bridge via preload"
```

---

## Task 6: src/App.tsx — Onboarding Gate

**Files:**
- Modify: `src/App.tsx`
- Create: `src/App.test.tsx`

- [ ] **Step 6.1: Write failing tests**

Create `src/App.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import App from './App'

function makeApi(overrides: Partial<typeof window.api> = {}) {
  return {
    windowControls: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
    github: {
      connect: vi.fn(), exchange: vi.fn(),
      getUser: vi.fn(), getStarred: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(), onCallback: vi.fn(), offCallback: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'api', { value: makeApi(), writable: true, configurable: true })
})

describe('App onboarding gate', () => {
  it('renders nothing while checking settings', () => {
    // settings.get never resolves → stays in checking state
    window.api.settings.get = vi.fn().mockReturnValue(new Promise(() => {}))
    const { container } = render(<App />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows onboarding when onboarding_complete is not set', async () => {
    window.api.settings.get = vi.fn().mockResolvedValue(null)
    render(<App />)
    // Sidebar is always rendered; Onboarding view appears in main
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-screen-0')).toBeInTheDocument()
    })
  })

  it('shows main app when onboarding_complete is "1"', async () => {
    window.api.settings.get = vi.fn().mockResolvedValue('1')
    render(<App />)
    await waitFor(() => {
      expect(screen.queryByTestId('onboarding-screen-0')).not.toBeInTheDocument()
    })
  })

  it('fires background starred sync when onboarding complete', async () => {
    window.api.settings.get = vi.fn().mockResolvedValue('1')
    render(<App />)
    await waitFor(() => {
      expect(window.api.github.getStarred).toHaveBeenCalled()
    })
  })

  it('does not fire sync when onboarding not complete', async () => {
    window.api.settings.get = vi.fn().mockResolvedValue(null)
    render(<App />)
    await waitFor(() => screen.getByTestId('onboarding-screen-0'))
    expect(window.api.github.getStarred).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6.2: Run tests to confirm they fail**

```bash
npx vitest run src/App.test.tsx
```

Expected: tests fail (App doesn't gate yet, `onboarding-screen-0` doesn't exist yet).

- [ ] **Step 6.3: Update src/App.tsx**

Replace with the gated version. The key change is extracting an inner `AppContent` that uses `useNavigate`, so the hook is inside the Router:

```tsx
import { useState, useEffect } from 'react'
import { MemoryRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import Discover from './views/Discover'
import Library from './views/Library'
import Collections from './views/Collections'
import Starred from './views/Starred'
import RepoDetail from './views/RepoDetail'
import Onboarding from './views/Onboarding'

function AppContent() {
  const navigate = useNavigate()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    window.api.settings.get('onboarding_complete').then((val) => {
      if (val !== '1') {
        navigate('/onboarding')
      } else {
        window.api.github.getStarred().catch(() => {})
      }
      setIsChecking(false)
    })
  }, [navigate])

  if (isChecking) return null

  return (
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
  )
}

export default function App() {
  return (
    <MemoryRouter
      initialEntries={['/discover']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppContent />
    </MemoryRouter>
  )
}
```

- [ ] **Step 6.4: Run tests — some will still fail because `onboarding-screen-0` doesn't exist yet**

```bash
npx vitest run src/App.test.tsx
```

Expected passing now: "renders nothing while checking", "shows main app when complete", "fires background sync when complete".
Expected still failing until Task 8: "shows onboarding when not complete" (depends on `onboarding-screen-0`), "does not fire sync when not complete" (uses `waitFor(() => screen.getByTestId('onboarding-screen-0'))`).
All 5 tests will be green after Task 8 is complete.

- [ ] **Step 6.5: Commit what passes so far**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: onboarding gate in AppContent — checks onboarding_complete on mount"
```

---

## Task 7: src/styles/globals.css — Onboarding Styles

**Files:**
- Modify: `src/styles/globals.css`

No unit tests for CSS. Visual correctness verified by inspection.

- [ ] **Step 7.1: Append onboarding styles to globals.css**

Add the following to the end of `src/styles/globals.css`:

```css
/* ── Onboarding ─────────────────────────────────────────────── */

.onboarding-root {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* Screen 0 — Welcome */
.onboarding-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.onboarding-welcome-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 14px;
  padding: 0 24px;
}

.onboarding-pill {
  display: inline-block;
  padding: 3px 10px;
  font-size: 10px;
  font-weight: 500;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 5px;
  letter-spacing: 0.02em;
}

.onboarding-headline {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--t1);
  max-width: 340px;
}

.onboarding-headline-accent {
  color: var(--accent);
}

.onboarding-sub {
  font-size: 11px;
  color: var(--t2);
  line-height: 1.7;
  max-width: 320px;
}

.onboarding-btn-primary {
  margin-top: 8px;
  padding: 8px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.onboarding-btn-primary:hover {
  opacity: 0.9;
}

.onboarding-btn-skip {
  background: none;
  border: none;
  color: var(--t3);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}

.onboarding-btn-skip:hover {
  color: var(--t2);
}

/* Progress dots */
.onboarding-dots {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  align-items: center;
}

.onboarding-dot {
  height: 3px;
  border-radius: 3px;
  background: var(--t3);
  width: 5px;
  transition: all 0.25s;
}

.onboarding-dot.active {
  width: 16px;
  background: #a78bfa;
}

/* Screens 1 & 2 — centred card layout */
.onboarding-card-layout {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
}

.onboarding-step-label {
  font-size: 9px;
  color: var(--t3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.onboarding-card-heading {
  font-size: 15px;
  font-weight: 600;
  color: var(--t1);
  margin: 0 0 8px;
}

.onboarding-card-body {
  font-size: 11px;
  color: var(--t2);
  line-height: 1.6;
  max-width: 340px;
  text-align: center;
  margin-bottom: 16px;
}

/* Permission card */
.permission-card {
  width: 100%;
  max-width: 340px;
  border: 1px solid var(--border);
  background: var(--bg3);
  border-radius: 8px;
  overflow: hidden;
}

.permission-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
}

.permission-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--t1);
  flex: 1;
}

.permission-card-sub {
  font-size: 10px;
  color: var(--t2);
  padding: 0 14px 10px;
}

.permission-card-sub.connected {
  color: var(--status-ok);
}

.permission-divider {
  height: 1px;
  background: var(--border);
  margin: 0;
}

.permission-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 11px;
  color: var(--t2);
}

.permission-badge {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: #a78bfa;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.permission-badge.muted {
  border-color: var(--border);
  background: transparent;
  color: var(--t3);
}

/* Connect button states */
.connect-btn {
  padding: 5px 12px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: #a78bfa;
  font-family: inherit;
  transition: opacity 0.15s;
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.connect-btn.connected {
  border-color: rgba(52, 211, 153, 0.3);
  background: rgba(52, 211, 153, 0.1);
  color: var(--status-ok);
}

/* Navigation buttons */
.onboarding-nav {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 340px;
  margin-top: 16px;
}

.onboarding-btn-back {
  background: none;
  border: none;
  color: var(--t2);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}

.onboarding-btn-continue {
  padding: 7px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
}

.onboarding-btn-continue:disabled {
  opacity: 0.3;
  cursor: default;
}

/* Screen 2 — Done */
.onboarding-check-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(52, 211, 153, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.onboarding-stat-row {
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: 340px;
  margin-bottom: 12px;
}

.onboarding-stat-card {
  flex: 1;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  text-align: center;
}

.onboarding-stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--t1);
  display: block;
}

.onboarding-stat-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--t3);
  display: block;
  margin-top: 2px;
}

.onboarding-tip-box {
  width: 100%;
  max-width: 340px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.onboarding-tip-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #a78bfa;
  margin-bottom: 6px;
  display: block;
}

.onboarding-tip-text {
  font-size: 10px;
  color: var(--t2);
  line-height: 1.6;
  margin: 0;
}

.onboarding-btn-open {
  width: 100%;
  max-width: 340px;
  padding: 10px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.onboarding-btn-open:hover {
  opacity: 0.9;
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: onboarding CSS — layout, progress dots, permission card, stat cards"
```

---

## Task 8: src/views/Onboarding.tsx — Three-Screen Flow

**Files:**
- Replace: `src/views/Onboarding.tsx`
- Create: `src/views/Onboarding.test.tsx`

- [ ] **Step 8.1: Write failing tests**

Create `src/views/Onboarding.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Onboarding from './Onboarding'

let navigatedTo = ''

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => (path: string) => { navigatedTo = path },
  }
})

function makeApi(overrides = {}) {
  return {
    windowControls: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
    github: {
      connect: vi.fn().mockResolvedValue(undefined),
      exchange: vi.fn().mockResolvedValue(undefined),
      getUser: vi.fn().mockResolvedValue({ login: 'alice', avatarUrl: '', publicRepos: 5 }),
      getStarred: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      onCallback: vi.fn(),
      offCallback: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue('5'),
      set: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }
}

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  navigatedTo = ''
  Object.defineProperty(window, 'api', { value: makeApi(), writable: true, configurable: true })
})

// ── Screen 0 ────────────────────────────────────────────────────
describe('Screen 0 — Welcome', () => {
  it('shows screen 0 by default', () => {
    renderOnboarding()
    expect(screen.getByTestId('onboarding-screen-0')).toBeInTheDocument()
  })

  it('renders headline and sub text', () => {
    renderOnboarding()
    expect(screen.getByText(/Turn any GitHub repo into an/i)).toBeInTheDocument()
    expect(screen.getByText(/AI skill/i)).toBeInTheDocument()
  })

  it('Connect GitHub → advances to screen 1', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →'))
    expect(screen.getByTestId('onboarding-screen-1')).toBeInTheDocument()
  })

  it('Skip sets onboarding_complete and navigates to /discover', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith('onboarding_complete', '1')
      expect(navigatedTo).toBe('/discover')
    })
  })

  it('does not show progress dots on screen 0', () => {
    renderOnboarding()
    expect(screen.queryByTestId('progress-dots')).not.toBeInTheDocument()
  })
})

// ── Screen 1 ────────────────────────────────────────────────────
describe('Screen 1 — Connect GitHub', () => {
  beforeEach(() => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →'))
  })

  it('shows screen 1', () => {
    expect(screen.getByTestId('onboarding-screen-1')).toBeInTheDocument()
  })

  it('shows progress dots', () => {
    expect(screen.getByTestId('progress-dots')).toBeInTheDocument()
  })

  it('shows Step 1 of 2 label', () => {
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument()
  })

  it('Continue is disabled before connecting', () => {
    expect(screen.getByText('Continue →')).toBeDisabled()
  })

  it('Back returns to screen 0', () => {
    fireEvent.click(screen.getByText('← Back'))
    expect(screen.getByTestId('onboarding-screen-0')).toBeInTheDocument()
  })

  it('Connect calls github.connect and registers callback', async () => {
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => {
      expect(window.api.github.connect).toHaveBeenCalled()
      expect(window.api.github.onCallback).toHaveBeenCalled()
    })
  })

  it('after successful OAuth, Continue becomes enabled and shows connected state', async () => {
    // Simulate the onCallback being called with a code
    window.api.github.onCallback = vi.fn().mockImplementation((cb: (code: string) => void) => {
      setTimeout(() => cb('test-code'), 0)
    })
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => {
      expect(window.api.github.exchange).toHaveBeenCalledWith('test-code')
      expect(window.api.github.getUser).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText('Continue →')).not.toBeDisabled()
    })
  })

  it('Continue advances to screen 2 when connected', async () => {
    window.api.github.onCallback = vi.fn().mockImplementation((cb: (code: string) => void) => {
      setTimeout(() => cb('code'), 0)
    })
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => screen.getByText('Continue →').closest('button')?.disabled === false)
    fireEvent.click(screen.getByText('Continue →'))
    expect(screen.getByTestId('onboarding-screen-2')).toBeInTheDocument()
  })

  it('calls offCallback on unmount', () => {
    const { unmount } = renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →')) // go to screen 1
    unmount()
    expect(window.api.github.offCallback).toHaveBeenCalled()
  })
})

// ── Screen 2 ────────────────────────────────────────────────────
describe('Screen 2 — Done', () => {
  async function goToScreen2() {
    renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →'))
    window.api.github.onCallback = vi.fn().mockImplementation((cb: (code: string) => void) => {
      setTimeout(() => cb('code'), 0)
    })
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => expect(window.api.github.exchange).toHaveBeenCalled())
    await waitFor(() => {
      const btn = screen.getByText('Continue →')
      if ((btn as HTMLButtonElement).disabled) throw new Error('still disabled')
    })
    fireEvent.click(screen.getByText('Continue →'))
  }

  it('shows screen 2', async () => {
    await goToScreen2()
    expect(screen.getByTestId('onboarding-screen-2')).toBeInTheDocument()
  })

  it('shows HOW IT WORKS tip box', async () => {
    await goToScreen2()
    expect(screen.getByText('HOW IT WORKS')).toBeInTheDocument()
  })

  it('Open Git Suite sets onboarding_complete and navigates to /discover', async () => {
    await goToScreen2()
    fireEvent.click(screen.getByText('Open Git Suite →'))
    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith('onboarding_complete', '1')
      expect(navigatedTo).toBe('/discover')
    })
  })

  it('Open Git Suite fires getStarred in background', async () => {
    await goToScreen2()
    fireEvent.click(screen.getByText('Open Git Suite →'))
    await waitFor(() => {
      expect(window.api.github.getStarred).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 8.2: Run tests to confirm they fail**

```bash
npx vitest run src/views/Onboarding.test.tsx
```

Expected: all tests fail.

- [ ] **Step 8.3: Implement src/views/Onboarding.tsx**

Replace the placeholder with:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Background SVG for Screen 0 ─────────────────────────────────
function BackgroundSVG() {
  return (
    <svg
      className="onboarding-bg"
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="bg-grad" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#180d30" />
          <stop offset="100%" stopColor="#0a0a0e" />
        </radialGradient>
      </defs>
      <rect width="800" height="500" fill="url(#bg-grad)" />
      {/* Connecting lines */}
      <g stroke="#7c3aed" strokeWidth="1" opacity="0.15">
        <line x1="160" y1="120" x2="320" y2="200" />
        <line x1="320" y1="200" x2="480" y2="140" />
        <line x1="480" y1="140" x2="640" y2="220" />
        <line x1="320" y1="200" x2="400" y2="320" />
        <line x1="400" y1="320" x2="540" y2="360" />
        <line x1="160" y1="120" x2="240" y2="300" />
        <line x1="640" y1="220" x2="680" y2="340" />
      </g>
      {/* Nodes */}
      <g fill="#7c3aed">
        <circle cx="160" cy="120" r="4" opacity="0.4" />
        <circle cx="320" cy="200" r="5" opacity="0.45" />
        <circle cx="480" cy="140" r="4" opacity="0.35" />
        <circle cx="640" cy="220" r="4" opacity="0.4" />
        <circle cx="400" cy="320" r="5" opacity="0.45" />
        <circle cx="540" cy="360" r="3" opacity="0.3" />
        <circle cx="240" cy="300" r="4" opacity="0.35" />
        <circle cx="680" cy="340" r="3" opacity="0.3" />
      </g>
      {/* Faint repo names */}
      <g fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#a78bfa">
        <text x="60" y="440" opacity="0.35">vercel/next.js</text>
        <text x="220" y="440" opacity="0.45">microsoft/vscode</text>
        <text x="440" y="440" opacity="0.4">facebook/react</text>
        <text x="620" y="440" opacity="0.35">rust-lang/rust</text>
        <text x="80" y="460" opacity="0.4">torvalds/linux</text>
        <text x="280" y="460" opacity="0.35">openai/openai-python</text>
        <text x="530" y="460" opacity="0.45">golang/go</text>
      </g>
    </svg>
  )
}

// ── Progress dots ────────────────────────────────────────────────
function ProgressDots({ active }: { active: 0 | 1 }) {
  return (
    <div className="onboarding-dots" data-testid="progress-dots">
      <span className={`onboarding-dot${active === 0 ? ' active' : ''}`} />
      <span className={`onboarding-dot${active === 1 ? ' active' : ''}`} />
    </div>
  )
}

// ── Screen 0 — Welcome ───────────────────────────────────────────
function WelcomeScreen({ onConnect, onSkip }: { onConnect: () => void; onSkip: () => void }) {
  return (
    <div className="onboarding-root" data-testid="onboarding-screen-0">
      <BackgroundSVG />
      <div className="onboarding-welcome-content">
        <span className="onboarding-pill">Git Suite</span>
        <h1 className="onboarding-headline">
          Turn any GitHub repo into an{' '}
          <span className="onboarding-headline-accent">AI skill.</span>
        </h1>
        <p className="onboarding-sub">
          Browse repos, install skills locally, and your AI agent understands your entire
          stack — without you having to explain it every time.
        </p>
        <button className="onboarding-btn-primary" onClick={onConnect}>
          Connect GitHub →
        </button>
        <button className="onboarding-btn-skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  )
}

// ── Screen 1 — Connect GitHub ────────────────────────────────────
type ConnectState = 'idle' | 'connecting' | 'connected'

function ConnectScreen({
  onBack,
  onContinue,
}: {
  onBack: () => void
  onContinue: () => void
}) {
  const [connectState, setConnectState] = useState<ConnectState>('idle')
  const [connectedUser, setConnectedUser] = useState<string | null>(null)

  const handleCode = useCallback(async (code: string) => {
    try {
      await window.api.github.exchange(code)
      const user = await window.api.github.getUser()
      await window.api.settings.set('github_username', user.login)
      setConnectedUser(user.login)
      setConnectState('connected')
    } catch {
      setConnectState('idle')
    }
  }, [])

  useEffect(() => {
    return () => {
      window.api.github.offCallback(handleCode)
    }
  }, [handleCode])

  async function handleConnect() {
    setConnectState('connecting')
    try {
      await window.api.github.connect()
      window.api.github.onCallback(handleCode)
    } catch {
      setConnectState('idle')
    }
  }

  const btnLabel =
    connectState === 'idle' ? 'Connect'
    : connectState === 'connecting' ? 'Connecting...'
    : '✓ Connected'

  return (
    <div className="onboarding-root" data-testid="onboarding-screen-1">
      <ProgressDots active={0} />
      <div className="onboarding-card-layout">
        <p className="onboarding-step-label">Step 1 of 2</p>
        <h2 className="onboarding-card-heading">Connect GitHub</h2>
        <p className="onboarding-card-body">
          Git Suite uses GitHub to let you browse repos and sync the ones you already know.
          It never writes to GitHub or accesses private repos.
        </p>

        <div className="permission-card">
          <div className="permission-card-header">
            {/* GitHub icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--t2)' }}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
                1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
                1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
                1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="permission-card-title">GitHub</span>
            <button
              className={`connect-btn${connectState === 'connected' ? ' connected' : ''}`}
              onClick={handleConnect}
              disabled={connectState === 'connecting' || connectState === 'connected'}
            >
              {btnLabel}
            </button>
          </div>
          <p className={`permission-card-sub${connectState === 'connected' ? ' connected' : ''}`}>
            {connectState === 'connected' && connectedUser
              ? `@${connectedUser}`
              : 'Not connected'}
          </p>
          <div className="permission-divider" />
          <div className="permission-row">
            <span className="permission-badge">★</span>
            Read starred repositories
          </div>
          <div className="permission-row">
            <span className="permission-badge">◎</span>
            Read public profile
          </div>
          <div className="permission-row">
            <span className="permission-badge muted">✕</span>
            <span style={{ color: 'var(--t3)' }}>No write access, ever</span>
          </div>
        </div>

        <div className="onboarding-nav">
          <button className="onboarding-btn-back" onClick={onBack}>← Back</button>
          <button
            className="onboarding-btn-continue"
            onClick={onContinue}
            disabled={connectState !== 'connected'}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Screen 2 — Done ──────────────────────────────────────────────
function DoneScreen() {
  const navigate = useNavigate()
  const [repoCount, setRepoCount] = useState('0')

  useEffect(() => {
    window.api.settings.get('starred_repo_count').then((val) => {
      if (val) setRepoCount(val)
    })
  }, [])

  async function handleOpen() {
    await window.api.settings.set('onboarding_complete', '1')
    window.api.github.getStarred().catch(() => {})
    navigate('/discover')
  }

  return (
    <div className="onboarding-root" data-testid="onboarding-screen-2">
      <ProgressDots active={1} />
      <div className="onboarding-card-layout">
        <div className="onboarding-check-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 10l4.5 4.5L16 6"
              stroke="#34d399"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="onboarding-card-heading">Ready to go</h2>
        <p className="onboarding-card-body">
          GitHub is connected. Browse Discover to find repos, or head to Starred to install
          skills from ones you already know.
        </p>

        <div className="onboarding-stat-row">
          <div className="onboarding-stat-card">
            <span className="onboarding-stat-value">{repoCount}</span>
            <span className="onboarding-stat-label">Repos synced</span>
          </div>
          <div className="onboarding-stat-card">
            <span className="onboarding-stat-value">0</span>
            <span className="onboarding-stat-label">Skills installed</span>
          </div>
          <div className="onboarding-stat-card">
            <span className="onboarding-stat-value">Ready</span>
            <span className="onboarding-stat-label">Status</span>
          </div>
        </div>

        <div className="onboarding-tip-box">
          <span className="onboarding-tip-label">HOW IT WORKS</span>
          <p className="onboarding-tip-text">
            Find any repo → hit + Install → Git Suite generates a skill file and injects it
            into Claude automatically. Your AI now knows that repo.
          </p>
        </div>

        <button className="onboarding-btn-open" onClick={handleOpen}>
          Open Git Suite →
        </button>
      </div>
    </div>
  )
}

// ── Root component ───────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState<0 | 1 | 2>(0)

  async function handleSkip() {
    await window.api.settings.set('onboarding_complete', '1')
    navigate('/discover')
  }

  if (step === 0)
    return <WelcomeScreen onConnect={() => setStep(1)} onSkip={handleSkip} />
  if (step === 1)
    return <ConnectScreen onBack={() => setStep(0)} onContinue={() => setStep(2)} />
  return <DoneScreen />
}
```

- [ ] **Step 8.4: Run all tests**

```bash
npx vitest run src/views/Onboarding.test.tsx
```

Expected: all tests pass.

- [ ] **Step 8.5: Re-run App.test.tsx — should now be fully green**

```bash
npx vitest run src/App.test.tsx
```

Expected: all 5 tests pass (the "shows onboarding" test now works because `onboarding-screen-0` exists).

- [ ] **Step 8.6: Commit**

```bash
git add src/views/Onboarding.tsx src/views/Onboarding.test.tsx
git commit -m "feat: three-screen onboarding flow (Welcome, Connect, Done)"
```

---

## Task 9: src/components/Sidebar.tsx — GitHub Connection Status

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx`

- [ ] **Step 9.1: Add failing tests to Sidebar.test.tsx**

Add `window.api` setup and new test cases to the existing `Sidebar.test.tsx`.

**Important:** Place the new `beforeEach(() => setupApi(null))` call inside the existing top-level `describe('Sidebar', ...)` block — not in a nested describe. This ensures every existing test also gets the mock, preventing `TypeError: Cannot read properties of undefined (reading 'settings')` once Sidebar.tsx starts calling `window.api.settings.get`.

Add at the top of the file, before the existing `describe` block:

```tsx
import { vi, beforeEach } from 'vitest'

function setupApi(username: string | null) {
  Object.defineProperty(window, 'api', {
    value: {
      windowControls: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
      github: {
        connect: vi.fn(), exchange: vi.fn(), getUser: vi.fn(),
        getStarred: vi.fn(), disconnect: vi.fn(), onCallback: vi.fn(), offCallback: vi.fn(),
      },
      settings: {
        get: vi.fn().mockResolvedValue(username),
        set: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  })
}
```

Add a new `beforeEach` inside the existing `describe('Sidebar', ...)` that calls `setupApi(null)`, and add these new test cases at the end of the existing describe block:

```tsx
  it('shows "GitHub — not connected" when no username', async () => {
    setupApi(null)
    renderWithRouter()
    await waitFor(() => {
      expect(screen.getByText(/GitHub — not connected/)).toBeInTheDocument()
    })
  })

  it('shows username when connected', async () => {
    setupApi('0xHayd3n')
    renderWithRouter()
    await waitFor(() => {
      expect(screen.getByText(/0xHayd3n — connected/)).toBeInTheDocument()
    })
  })
```

Also add `import { waitFor } from '@testing-library/react'` to the imports.

The existing test `it('shows Claude Desktop status text', ...)` will need updating — replace `expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument()` with `expect(screen.getByText(/GitHub/)).toBeInTheDocument()` since we're replacing that text.

- [ ] **Step 9.2: Run tests to confirm the new ones fail**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: the two new tests fail; the existing "Claude Desktop" test also fails (because we haven't changed the component yet, so it still shows "Claude Desktop").

- [ ] **Step 9.3: Update Sidebar.tsx**

Replace the `sidebar-status` section (last `<div>` before `</aside>`). Add `useState`, `useEffect` imports. Add state for `githubUsername`:

At the top of the component function, add:

```tsx
import { useState, useEffect } from 'react'
```

Inside `Sidebar()`, before the return, add:

```tsx
const [githubUsername, setGithubUsername] = useState<string | null>(null)

useEffect(() => {
  window.api.settings.get('github_username').then((val) => {
    setGithubUsername(val && val.length > 0 ? val : null)
  })
}, [])
```

Replace the `<div className="sidebar-status">` block with:

```tsx
<div className="sidebar-status">
  <span className={`status-dot${githubUsername ? ' active' : ' inactive'}`} />
  <span className="status-text">
    {githubUsername ? `${githubUsername} — connected` : 'GitHub — not connected'}
  </span>
</div>
```

- [ ] **Step 9.4: Run tests**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 9.5: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat: GitHub connection status in sidebar footer"
```

---

## Task 10: Full Test Run & Final Commit

- [ ] **Step 10.1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Verify counts include:
- `electron/db.test.ts` — all existing + 2 new index tests
- `electron/store.test.ts` — 8 tests
- `electron/github.test.ts` — 7 tests
- `src/App.test.tsx` — 5 tests
- `src/views/Onboarding.test.tsx` — all tests
- `src/components/Sidebar.test.tsx` — all tests
- `src/components/Titlebar.test.tsx` — unchanged, still passes

- [ ] **Step 10.2: If any tests fail, fix before proceeding**

Do not proceed with step 10.3 until `vitest run` exits with no failures.

- [ ] **Step 10.3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 2 complete — GitHub OAuth, onboarding, starred sync, sidebar status"
```

---

## Before Running the App

Before running in dev, fill in your actual GitHub OAuth App credentials in `electron/github.ts`:

```ts
export const CLIENT_ID = 'YOUR_ACTUAL_CLIENT_ID'
const CLIENT_SECRET = 'YOUR_ACTUAL_CLIENT_SECRET'
```

Create a GitHub OAuth App at https://github.com/settings/developers:
- Homepage URL: `http://localhost`
- Authorization callback URL: `gitsuite://oauth/callback`

Then run:

```bash
npm run dev
```
