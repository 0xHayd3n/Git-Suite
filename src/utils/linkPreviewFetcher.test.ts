import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock window.api before importing the module under test
const mockFetch = vi.fn()
Object.defineProperty(globalThis, 'window', {
  value: { api: { linkPreview: { fetch: mockFetch } } },
  writable: true,
})

// Import AFTER mock is set up so module-level code sees the mock
const { fetchLinkPreview, getCachedPreview } = await import('./linkPreviewFetcher')

const emptyResult = { title: '', description: '', imageUrl: '', faviconUrl: '', domain: '' }

beforeEach(() => {
  mockFetch.mockResolvedValue(emptyResult)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('getCachedPreview', () => {
  it('returns undefined for an uncached URL', () => {
    expect(getCachedPreview('https://never-fetched.com')).toBeUndefined()
  })
})

describe('fetchLinkPreview', () => {
  it('calls window.api.linkPreview.fetch and returns result', async () => {
    const result = await fetchLinkPreview('https://example.com/a')
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/a')
    expect(result).toEqual(emptyResult)
  })

  it('caches result — second call does NOT invoke IPC', async () => {
    await fetchLinkPreview('https://example.com/cached')
    mockFetch.mockClear()
    const result = await fetchLinkPreview('https://example.com/cached')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResult)
  })

  it('getCachedPreview returns result after fetch', async () => {
    await fetchLinkPreview('https://example.com/sync')
    expect(getCachedPreview('https://example.com/sync')).toEqual(emptyResult)
  })

  it('in-flight deduplication: concurrent calls produce one IPC call', async () => {
    const [r1, r2] = await Promise.all([
      fetchLinkPreview('https://example.com/dedup'),
      fetchLinkPreview('https://example.com/dedup'),
    ])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
  })

  it('on IPC error, returns empty-string result without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'))
    const result = await fetchLinkPreview('https://example.com/error')
    expect(result).toEqual(emptyResult)
  })
})
