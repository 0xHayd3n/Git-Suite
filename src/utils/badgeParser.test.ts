import { describe, it, expect } from 'vitest'
import { looksLikeBadgeUrl, getSocialPlatform, extractBadges, BADGE_DOMAINS } from './badgeParser'

describe('looksLikeBadgeUrl', () => {
  it('returns true for shields.io URLs', () => {
    expect(looksLikeBadgeUrl('https://img.shields.io/npm/v/react')).toBe(true)
  })
  it('returns false for PNG screenshots', () => {
    expect(looksLikeBadgeUrl('https://raw.githubusercontent.com/owner/repo/main/docs/screenshot.png')).toBe(false)
  })
  it('returns false for SVG logos not from badge services', () => {
    expect(looksLikeBadgeUrl('https://example.com/logo.svg')).toBe(false)
  })
  it('returns true for GitHub Actions badge SVGs', () => {
    expect(looksLikeBadgeUrl('https://github.com/owner/repo/actions/workflows/ci.yml/badge.svg')).toBe(true)
  })
})

describe('getSocialPlatform', () => {
  // True positives — must still work
  it('returns twitter for x.com', () => {
    expect(getSocialPlatform('https://x.com/handle')).toBe('twitter')
  })
  it('returns twitter for twitter.com', () => {
    expect(getSocialPlatform('https://twitter.com/handle')).toBe('twitter')
  })
  it('returns twitter for www.x.com', () => {
    expect(getSocialPlatform('https://www.x.com/handle')).toBe('twitter')
  })
  it('returns discord for discord.gg', () => {
    expect(getSocialPlatform('https://discord.gg/invite/abc')).toBe('discord')
  })
  it('returns discord for discord.com', () => {
    expect(getSocialPlatform('https://discord.com/invite/abc')).toBe('discord')
  })
  it('returns sponsor for github.com/sponsors', () => {
    expect(getSocialPlatform('https://github.com/sponsors/user')).toBe('sponsor')
  })

  // False positives that must be fixed
  it('returns null for linux.com (contains x.com substring)', () => {
    expect(getSocialPlatform('https://linux.com')).toBeNull()
  })
  it('returns null for proxmox.com (hostname ends in x.com)', () => {
    expect(getSocialPlatform('https://proxmox.com')).toBeNull()
  })
  it('returns null for sphinx.com (ends in x.com)', () => {
    expect(getSocialPlatform('https://sphinx.com')).toBeNull()
  })
  it('returns null for a generic github.com repo URL', () => {
    expect(getSocialPlatform('https://github.com/owner/repo')).toBeNull()
  })
  it('returns null for null input', () => {
    expect(getSocialPlatform(null)).toBeNull()
  })
})

describe('BADGE_DOMAINS export', () => {
  it('is exported as an array of domain strings', () => {
    expect(Array.isArray(BADGE_DOMAINS)).toBe(true)
    expect(BADGE_DOMAINS.length).toBeGreaterThan(0)
    expect(BADGE_DOMAINS).toContain('shields.io')
    expect(BADGE_DOMAINS).toContain('badgen.net')
    expect(BADGE_DOMAINS).toContain('codecov.io')
  })
})

describe('extractBadges — HTML anchor prose links', () => {
  it('captures an HTML anchor twitter link in the preamble', () => {
    const readme = `<p>Follow me on <a href="https://twitter.com/sindresorhus">Twitter</a>.</p>\n\n## Contents\n- Item`
    const { badges } = extractBadges(readme)
    const social = badges.filter(b => b.category === 'social')
    expect(social).toHaveLength(1)
    expect(social[0].linkUrl).toBe('https://twitter.com/sindresorhus')
    expect(social[0].alt).toBe('Twitter')
  })

  it('does not capture HTML anchor social links that appear after the first ## heading', () => {
    const readme = `## Body\n\n<a href="https://twitter.com/handle">Twitter</a>`
    const { badges } = extractBadges(readme)
    const social = badges.filter(b => b.category === 'social')
    expect(social).toHaveLength(0)
  })

  it('captures both markdown and HTML anchor social links from the preamble', () => {
    const readme = `[Discord](https://discord.gg/abc)\n<a href="https://twitter.com/x">Twitter</a>\n\n## Docs`
    const { badges } = extractBadges(readme)
    const social = badges.filter(b => b.category === 'social')
    expect(social).toHaveLength(2)
  })
})
