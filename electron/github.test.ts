// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getUser, getStarred, exchangeCode, getRepo, searchRepos, getReadme, getReleases } from './github'

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
    const repos = [{ starred_at: '2024-01-15T10:00:00Z', repo: { id: 1, name: 'repo1', owner: { login: 'alice' } } }]
    mockFetch.mockResolvedValue(makeResponse(repos))
    const result = await getStarred('tok')
    expect(result).toHaveLength(1)
    expect(result[0].repo.name).toBe('repo1')
    expect(result[0].starred_at).toBe('2024-01-15T10:00:00Z')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/user/starred'),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github.star+json' })
      })
    )
  })

  it('follows Link header to fetch multiple pages', async () => {
    const page1 = [{ starred_at: '2024-01-14T00:00:00Z', repo: { id: 1, name: 'r1', owner: { login: 'a' } } }]
    const page2 = [{ starred_at: '2024-01-13T00:00:00Z', repo: { id: 2, name: 'r2', owner: { login: 'a' } } }]
    mockFetch
      .mockResolvedValueOnce(makeResponse(page1, { Link: '<https://api.github.com/user/starred?page=2>; rel="next"' }))
      .mockResolvedValueOnce(makeResponse(page2))
    const result = await getStarred('tok')
    expect(result).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('stops after 10 pages', async () => {
    const pageData = [{ starred_at: '2024-01-01T00:00:00Z', repo: { id: 1, name: 'r', owner: { login: 'a' } } }]
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

  it('throws on non-ok HTTP response from token endpoint', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, {}, false))
    await expect(exchangeCode('code')).rejects.toThrow('OAuth exchange failed: 401')
  })
})

describe('getRepo', () => {
  beforeEach(() => mockFetch.mockReset())

  it('fetches /repos/{owner}/{name} and returns data', async () => {
    const repo = { id: 1, name: 'foo', owner: { login: 'alice' } }
    mockFetch.mockResolvedValue(makeResponse(repo))
    const result = await getRepo('tok', 'alice', 'foo')
    expect(result.name).toBe('foo')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/alice/foo',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    )
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, {}, false))
    await expect(getRepo('tok', 'alice', 'foo')).rejects.toThrow('GitHub API error: 401')
  })
})

describe('searchRepos', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns items from search API', async () => {
    const items = [{ id: 1, name: 'repo1', owner: { login: 'alice' }, stargazers_count: 500 }]
    mockFetch.mockResolvedValue(makeResponse({ items }))
    const result = await searchRepos(null, 'stars:>1000')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('repo1')
  })

  it('omits Authorization when token is null', async () => {
    mockFetch.mockResolvedValue(makeResponse({ items: [] }))
    await searchRepos(null, 'stars:>1000')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBeUndefined()
  })

  it('includes Authorization when token is provided', async () => {
    mockFetch.mockResolvedValue(makeResponse({ items: [] }))
    await searchRepos('tok', 'stars:>1000')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer tok')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, {}, false))
    await expect(searchRepos(null, 'q')).rejects.toThrow('GitHub API error: 401')
  })
})

describe('getReadme', () => {
  beforeEach(() => mockFetch.mockReset())

  it('base64-decodes content and returns markdown string', async () => {
    const content = Buffer.from('# Hello').toString('base64')
    mockFetch.mockResolvedValue(makeResponse({ content, encoding: 'base64' }))
    const result = await getReadme(null, 'alice', 'repo')
    expect(result).toBe('# Hello')
  })

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) })
    const result = await getReadme(null, 'alice', 'repo')
    expect(result).toBeNull()
  })

  it('throws on other non-ok responses', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, {}, false))
    await expect(getReadme(null, 'alice', 'repo')).rejects.toThrow('GitHub API error: 401')
  })
})

describe('getReleases', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns releases array', async () => {
    const releases = [{ tag_name: 'v1.0', name: 'Release 1', published_at: '2024-01-01', body: null }]
    mockFetch.mockResolvedValue(makeResponse(releases))
    const result = await getReleases(null, 'alice', 'repo')
    expect(result).toHaveLength(1)
    expect(result[0].tag_name).toBe('v1.0')
  })

  it('omits Authorization when token is null', async () => {
    mockFetch.mockResolvedValue(makeResponse([]))
    await getReleases(null, 'alice', 'repo')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBeUndefined()
  })
})

describe('getReadme with ref parameter', () => {
  beforeEach(() => mockFetch.mockReset())

  it('appends ?ref= query param when ref is provided', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({ content: Buffer.from('# hello').toString('base64'), encoding: 'base64' })
    )
    await getReadme(null, 'owner', 'repo', 'v7.3.9')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('?ref=v7.3.9'),
      expect.anything()
    )
  })

  it('omits ?ref= when ref is not provided', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({ content: Buffer.from('# hello').toString('base64'), encoding: 'base64' })
    )
    await getReadme(null, 'owner', 'repo')
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).not.toContain('?ref=')
  })

  it('returns null on 404 regardless of ref', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    const result = await getReadme(null, 'owner', 'repo', 'v1.0.0')
    expect(result).toBeNull()
  })
})
