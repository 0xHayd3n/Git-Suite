// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock electron and electron-store before importing main
vi.mock('electron', () => {
  const mockWindow = {
    on: vi.fn(),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: { openDevTools: vi.fn(), once: vi.fn() },
    isMaximized: vi.fn(() => false),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    minimize: vi.fn(),
    close: vi.fn(),
    restore: vi.fn(),
    isMinimized: vi.fn(() => false),
    focus: vi.fn(),
    getBounds: vi.fn(() => ({ width: 1200, height: 720 })),
  }
  return {
    app: {
      setAsDefaultProtocolClient: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
      on: vi.fn(),
      whenReady: vi.fn(() => ({ then: vi.fn() })),
      getPath: vi.fn(() => '/tmp'),
      quit: vi.fn(),
    },
    BrowserWindow: vi.fn(() => mockWindow),
    ipcMain: {
      on: vi.fn(),
      handle: vi.fn(),
    },
    shell: { openExternal: vi.fn() },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
      registerFileProtocol: vi.fn(),
    },
  }
})

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

vi.mock('./store', () => ({
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  setGitHubUser: vi.fn(),
  clearGitHubUser: vi.fn(),
  getApiKey: vi.fn(),
  setApiKey: vi.fn(),
}))

vi.mock('./github', () => ({
  OAUTH_URL: 'https://mock-oauth-url',
  exchangeCode: vi.fn(),
  getUser: vi.fn(),
  getStarred: vi.fn(),
  getRepo: vi.fn(),
  searchRepos: vi.fn(),
  getReadme: vi.fn(),
  getReleases: vi.fn(),
}))

vi.mock('./skill-gen', () => ({
  generateSkill: vi.fn(),
}))

vi.mock('./db', async () => {
  const actual = await vi.importActual<typeof import('./db')>('./db')
  return actual
})

import Database from 'better-sqlite3'
import { initSchema } from './db'
import { seedCommunityCollections, COMMUNITY_COLLECTIONS, getCollectionAll, getCollectionDetail } from './main'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  initSchema(db)
})

afterEach(() => {
  db.close()
})

describe('seedCommunityCollections', () => {
  it('inserts all community collections', () => {
    seedCommunityCollections(db)
    const rows = db.prepare('SELECT * FROM collections').all() as any[]
    expect(rows).toHaveLength(COMMUNITY_COLLECTIONS.length)
  })

  it('is idempotent — no duplicates on second call', () => {
    seedCommunityCollections(db)
    seedCommunityCollections(db)
    const rows = db.prepare('SELECT * FROM collections').all() as any[]
    expect(rows).toHaveLength(COMMUNITY_COLLECTIONS.length)
  })

  it('creates a stub repo row for each community repo slug', () => {
    seedCommunityCollections(db)
    const coll = COMMUNITY_COLLECTIONS[0]
    for (const slug of coll.repos) {
      const [owner, name] = slug.split('/')
      const row = db.prepare('SELECT * FROM repos WHERE owner = ? AND name = ?').get(owner, name)
      expect(row).not.toBeNull()
    }
  })

  it('links stub repos in collection_repos', () => {
    seedCommunityCollections(db)
    const coll = COMMUNITY_COLLECTIONS[0]
    const links = db.prepare('SELECT * FROM collection_repos WHERE collection_id = ?').all(coll.id) as any[]
    expect(links).toHaveLength(coll.repos.length)
  })
})

describe('getCollectionAll', () => {
  it('returns collections with repo_count and saved_count', () => {
    seedCommunityCollections(db)
    const rows = getCollectionAll(db) as any[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('repo_count')
    expect(rows[0]).toHaveProperty('saved_count')
    expect(rows[0].saved_count).toBe(0)  // no skills in memory db
  })
})

describe('getCollectionDetail', () => {
  it('returns repo rows with saved=0 when no skills installed', () => {
    seedCommunityCollections(db)
    const id = COMMUNITY_COLLECTIONS[0].id
    const repos = getCollectionDetail(db, id) as any[]
    expect(repos).toHaveLength(COMMUNITY_COLLECTIONS[0].repos.length)
    expect(repos[0].saved).toBe(0)
  })
})
