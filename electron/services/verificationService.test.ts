// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../db'
import { computeScore, checkNpm, checkPypi, checkCrates, buildQueue, fetchRegistryMatch } from './verificationService'

describe('Phase 15 migration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  it('adds verification_score column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_score')
  })

  it('adds verification_tier column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_tier')
  })

  it('adds verification_signals column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_signals')
  })

  it('adds verification_checked_at column', () => {
    const cols = (db.prepare("PRAGMA table_info(repos)").all() as any[]).map(c => c.name)
    expect(cols).toContain('verification_checked_at')
  })
})

describe('computeScore', () => {
  const base = {
    owner: 'facebook',
    name:  'react',
    homepage: 'https://react.dev',
    owner_is_verified: 1,
    watchers: 5000,
  }

  it('returns verified tier for full signal set', () => {
    const result = computeScore({ ...base, registryMatch: true })
    expect(result.tier).toBe('verified')
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.signals).toContain('registry_match')
    expect(result.signals).toContain('verified_org')
    expect(result.signals).toContain('dependent_tier')
  })

  it('returns likely tier for mid-range score', () => {
    const result = computeScore({
      owner: 'some-org', name: 'some-repo',
      homepage: null,
      owner_is_verified: 0,
      watchers: 200,
      registryMatch: true,
    })
    // 40 (registry) + 10 (dependent: 200 >= 100) = 50
    expect(result.tier).toBe('likely')
    expect(result.score).toBe(50)
  })

  it('returns null tier for low score', () => {
    const result = computeScore({
      owner: 'nobody', name: 'my-repo',
      homepage: null, owner_is_verified: 0, watchers: 0,
      registryMatch: false,
    })
    expect(result.tier).toBeNull()
    expect(result.score).toBe(0)
  })

  it('awards self_named signal when owner === name', () => {
    const result = computeScore({
      owner: 'django', name: 'django',
      homepage: null, owner_is_verified: 0, watchers: 50,
      registryMatch: false,
    })
    expect(result.signals).toContain('self_named')
    // 10 (self_named) + 5 (watchers 50 >= 10) = 15
    expect(result.score).toBe(15)
  })

  it('awards homepage_match when domain contains owner handle', () => {
    const result = computeScore({
      owner: 'vuejs', name: 'vue',
      homepage: 'https://vuejs.org',
      owner_is_verified: 0,
      watchers: 5,  // < 10, so no dependent_tier signal
      registryMatch: false,
    })
    expect(result.signals).toContain('homepage_match')
    // 20 (homepage) only — watchers 5 < 10
    expect(result.score).toBe(20)
  })
})

describe('checkNpm', () => {
  it('returns true when maintainer matches owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        maintainers: [{ name: 'fb' }, { name: 'facebook' }],
        repository: { url: '' },
      }),
    }))
    const result = await checkNpm('react', 'facebook')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })

  it('returns true when repository url contains owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        maintainers: [],
        repository: { url: 'git+https://github.com/facebook/react.git' },
      }),
    }))
    const result = await checkNpm('react', 'facebook')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })

  it('returns false on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await checkNpm('nonexistent-pkg', 'nobody')
    expect(result).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('checkPypi', () => {
  it('returns true when author contains owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ info: { author: 'Django Software Foundation (django)', home_page: '' } }),
    }))
    const result = await checkPypi('django', 'django')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('checkCrates', () => {
  it('returns true when crate.repository contains owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ crate: { repository: 'https://github.com/rust-lang/rust' } }),
    }))
    const result = await checkCrates('rust', 'rust-lang')
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('buildQueue', () => {
  it('high priority items come before normal before low', () => {
    const q = buildQueue()
    q.push({ repoId: 'c/c', owner: 'c', name: 'c', language: null, priority: 'low' })
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'high' })
    q.push({ repoId: 'b/b', owner: 'b', name: 'b', language: null, priority: 'normal' })
    expect(q.shift()!.priority).toBe('high')
    expect(q.shift()!.priority).toBe('normal')
    expect(q.shift()!.priority).toBe('low')
  })

  it('returns undefined when empty', () => {
    const q = buildQueue()
    expect(q.shift()).toBeUndefined()
  })

  it('deduplicates by repoId (keeps highest priority)', () => {
    const q = buildQueue()
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'low' })
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'high' })
    expect(q.size()).toBe(1)
    expect(q.shift()!.priority).toBe('high')
  })
})

describe('fetchRegistryMatch', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('routes JavaScript to npm', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ maintainers: [{ name: 'owner' }], repository: {} }),
    })
    vi.stubGlobal('fetch', mockFetch)
    const result = await fetchRegistryMatch('pkg', 'owner', 'JavaScript')
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('npmjs.org'))
  })

  it('routes TypeScript to npm', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ maintainers: [{ name: 'owner' }], repository: {} }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchRegistryMatch('pkg', 'owner', 'TypeScript')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('npmjs.org'))
  })

  it('routes Python to pypi', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ info: { author: 'owner', home_page: '' } }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchRegistryMatch('pkg', 'owner', 'Python')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('pypi.org'))
  })

  it('routes Rust to crates.io', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ crate: { repository: 'https://github.com/owner/pkg' } }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchRegistryMatch('pkg', 'owner', 'Rust')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('crates.io'),
      expect.any(Object)
    )
  })

  it('returns false for unsupported languages', async () => {
    const result = await fetchRegistryMatch('pkg', 'owner', 'Haskell')
    expect(result).toBe(false)
  })

  it('returns false for null language', async () => {
    const result = await fetchRegistryMatch('pkg', 'owner', null)
    expect(result).toBe(false)
  })
})

describe('buildQueue edge cases', () => {
  it('does not downgrade priority of existing item', () => {
    const q = buildQueue()
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'high' })
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'low' })
    expect(q.size()).toBe(1)
    expect(q.shift()!.priority).toBe('high')
  })

  it('reports correct size after multiple operations', () => {
    const q = buildQueue()
    q.push({ repoId: 'a/a', owner: 'a', name: 'a', language: null, priority: 'normal' })
    q.push({ repoId: 'b/b', owner: 'b', name: 'b', language: null, priority: 'normal' })
    q.shift()
    expect(q.size()).toBe(1)
  })
})
