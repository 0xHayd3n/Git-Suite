import { describe, it, expect } from 'vitest'
import { parseOgImage, isGenericGitHubOg } from './ogImageService'

describe('parseOgImage', () => {
  it('extracts og:image from standard meta tag', () => {
    const html = '<html><head><meta property="og:image" content="https://repository-images.githubusercontent.com/12345/abc" /></head></html>'
    expect(parseOgImage(html)).toBe('https://repository-images.githubusercontent.com/12345/abc')
  })

  it('extracts og:image when content comes before property', () => {
    const html = '<head><meta content="https://example.com/img.png" property="og:image" /></head>'
    expect(parseOgImage(html)).toBe('https://example.com/img.png')
  })

  it('returns null when no og:image is present', () => {
    const html = '<html><head><title>Test</title></head></html>'
    expect(parseOgImage(html)).toBeNull()
  })
})

describe('isGenericGitHubOg', () => {
  it('detects generic GitHub OG image', () => {
    expect(isGenericGitHubOg('https://opengraph.githubassets.com/abc123def456/facebook/react')).toBe(true)
  })

  it('recognizes custom repository image', () => {
    expect(isGenericGitHubOg('https://repository-images.githubusercontent.com/12345/abc-def')).toBe(false)
  })

  it('recognizes non-GitHub OG images as custom', () => {
    expect(isGenericGitHubOg('https://example.com/banner.png')).toBe(false)
  })

  it('handles empty string', () => {
    expect(isGenericGitHubOg('')).toBe(true)
  })
})
