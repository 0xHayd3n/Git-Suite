import { describe, it, expect } from 'vitest'
import { extractWebsiteLinks, stripMarkdown } from './websiteParser'

describe('extractWebsiteLinks', () => {
  it('extracts a plain external markdown link', () => {
    const md = 'See [Postman Docs](https://www.postman.com/docs) for details.'
    expect(extractWebsiteLinks(md)).toEqual([
      { url: 'https://www.postman.com/docs', label: 'Postman Docs', host: 'postman.com' },
    ])
  })

  it('strips www. from host', () => {
    const result = extractWebsiteLinks('[Site](https://www.example.com)')
    expect(result[0].host).toBe('example.com')
  })

  it('skips anchor links', () => {
    expect(extractWebsiteLinks('[TOC](#table-of-contents)')).toHaveLength(0)
  })

  it('skips relative paths', () => {
    expect(extractWebsiteLinks('[Contributing](./CONTRIBUTING.md)')).toHaveLength(0)
  })

  it('skips social domain links — x.com', () => {
    expect(extractWebsiteLinks('[Twitter](https://x.com/handle)')).toHaveLength(0)
  })

  it('skips social domain links — twitter.com', () => {
    expect(extractWebsiteLinks('[Twitter](https://twitter.com/handle)')).toHaveLength(0)
  })

  it('skips social domain links — discord.gg', () => {
    expect(extractWebsiteLinks('[Discord](https://discord.gg/abc)')).toHaveLength(0)
  })

  it('skips github.com links', () => {
    expect(extractWebsiteLinks('[Repo](https://github.com/owner/repo)')).toHaveLength(0)
  })

  it('skips badge image URLs', () => {
    // shields.io is a badge URL — looksLikeBadgeUrl returns true for it
    expect(extractWebsiteLinks('[Build](https://img.shields.io/badge/build-passing-green)')).toHaveLength(0)
  })

  it('deduplicates by hostname — same URL twice', () => {
    const md = '[Docs](https://docs.example.com) and [Docs again](https://docs.example.com)'
    expect(extractWebsiteLinks(md)).toHaveLength(1)
  })

  it('deduplicates by hostname — different paths on same host', () => {
    const md = '[Getting Started](https://docs.example.com/start) [API](https://docs.example.com/api)'
    expect(extractWebsiteLinks(md)).toHaveLength(1)
  })

  it('keeps the first label when deduplicating', () => {
    const md = '[First](https://docs.example.com/a) [Second](https://docs.example.com/b)'
    expect(extractWebsiteLinks(md)[0].label).toBe('First')
  })

  it('extracts multiple distinct links', () => {
    const md = '[Alpha](https://alpha.com) [Beta](https://beta.com)'
    expect(extractWebsiteLinks(md)).toHaveLength(2)
  })

  it('skips malformed URLs silently', () => {
    expect(extractWebsiteLinks('[Bad](not-a-url)')).toHaveLength(0)
  })

  it('skips youtube.com links', () => {
    expect(extractWebsiteLinks('[Video](https://youtube.com/watch?v=abc)')).toHaveLength(0)
  })

  it('skips mastodon instance links', () => {
    expect(extractWebsiteLinks('[Chat](https://mastodon.social/@user)')).toHaveLength(0)
  })
})

describe('stripMarkdown', () => {
  it('strips bold asterisks', () => {
    expect(stripMarkdown('**C++**: hello')).toBe('C++: hello')
  })

  it('strips bold underscores', () => {
    expect(stripMarkdown('__bold__ text')).toBe('bold text')
  })

  it('strips italic asterisks', () => {
    expect(stripMarkdown('*italic* text')).toBe('italic text')
  })

  it('strips italic underscores surrounded by non-word characters', () => {
    expect(stripMarkdown('_italic_ text')).toBe('italic text')
  })

  it('does not strip underscores inside identifiers', () => {
    expect(stripMarkdown('some_function_name')).toBe('some_function_name')
  })

  it('strips inline code', () => {
    expect(stripMarkdown('use `npm install` to setup')).toBe('use npm install to setup')
  })

  it('unwraps markdown links to their text', () => {
    expect(stripMarkdown('[Click here](https://example.com)')).toBe('Click here')
  })

  it('removes image syntax entirely', () => {
    expect(stripMarkdown('![badge](https://img.shields.io/badge.svg) text')).toBe('text')
  })

  it('handles the realistic README label pattern', () => {
    expect(stripMarkdown('**C++**: _Introduction to Ray Tracing_')).toBe('C++: Introduction to Ray Tracing')
  })

  it('trims leading and trailing whitespace', () => {
    expect(stripMarkdown('  hello world  ')).toBe('hello world')
  })

  it('returns plain text unchanged', () => {
    expect(stripMarkdown('plain text')).toBe('plain text')
  })
})
