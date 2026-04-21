import { describe, it, expect } from 'vitest'
import { parseGitHubRepoUrl } from './githubRepoUrl'

describe('parseGitHubRepoUrl', () => {
  // ── Positive cases ──────────────────────────────────────────────────
  it('parses a simple repo URL', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('accepts a trailing slash', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react/'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('lowercases owner and name', () => {
    expect(parseGitHubRepoUrl('https://github.com/Facebook/React'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('ignores query string', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react?tab=readme'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('ignores fragment', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react#readme'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  // ── Negative cases ──────────────────────────────────────────────────
  it('returns null for deeper paths (issues)', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react/issues/123')).toBeNull()
  })

  it('returns null for deeper paths (tree)', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react/tree/main')).toBeNull()
  })

  it('returns null for a user profile (single segment)', () => {
    expect(parseGitHubRepoUrl('https://github.com/torvalds')).toBeNull()
  })

  it('returns null for github.com root', () => {
    expect(parseGitHubRepoUrl('https://github.com')).toBeNull()
  })

  it('returns null for non-GitHub domains', () => {
    expect(parseGitHubRepoUrl('https://example.com/owner/repo')).toBeNull()
  })

  it('returns null for GitHub subdomains (gist)', () => {
    expect(parseGitHubRepoUrl('https://gist.github.com/owner/abc')).toBeNull()
  })

  it('returns null for http:// scheme', () => {
    expect(parseGitHubRepoUrl('http://github.com/facebook/react')).toBeNull()
  })
})
