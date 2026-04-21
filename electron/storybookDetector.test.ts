// electron/storybookDetector.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { probeStorybookUrl, buildCandidates } from './storybookDetector'

afterEach(() => { vi.restoreAllMocks() })

describe('buildCandidates', () => {
  it('includes homepage when provided', () => {
    const result = buildCandidates('owner', 'repo', 'https://example.com/storybook', [])
    expect(result[0]).toBe('https://example.com/storybook')
  })

  it('includes GitHub Pages URL', () => {
    const result = buildCandidates('owner', 'repo', null, [])
    expect(result).toContain('https://owner.github.io/repo')
  })

  it('adds root GitHub Pages URL for owner.github.io repos', () => {
    const result = buildCandidates('owner', 'owner.github.io', null, [])
    expect(result).toContain('https://owner.github.io')
  })

  it('appends extra candidates at the end', () => {
    const result = buildCandidates('owner', 'repo', null, ['https://custom.example.com'])
    expect(result[result.length - 1]).toBe('https://custom.example.com')
  })

  it('deduplicates candidates', () => {
    const result = buildCandidates('owner', 'repo', 'https://owner.github.io/repo', [])
    const count = result.filter(u => u === 'https://owner.github.io/repo').length
    expect(count).toBe(1)
  })
})

describe('probeStorybookUrl', () => {
  it('returns base URL on first successful index.json probe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ v: 4, entries: {} })),
    }))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBe('https://example.com/sb')
  })

  it('strips trailing slash from the base URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ v: 4, entries: {} })),
    }))
    const result = await probeStorybookUrl('https://example.com/sb/')
    expect(result).toBe('https://example.com/sb')
  })

  it('tries stories.json when index.json returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('') })   // index.json
      .mockResolvedValueOnce({ ok: true,  text: () => Promise.resolve(JSON.stringify({ v: 3, stories: {} })) }) // stories.json
    )
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBe('https://example.com/sb')
  })

  it('returns null when all probes fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('') }))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBeNull()
  })

  it('returns null when response is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<html>not json</html>'),
    }))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const result = await probeStorybookUrl('https://example.com/sb')
    expect(result).toBeNull()
  })
})
