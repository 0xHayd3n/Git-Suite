import { describe, it, expect } from 'vitest'
import { getRelatedTags } from './related-tags'

const repo = (topics: string[]) => ({ topics })

describe('getRelatedTags', () => {
  it('returns topics sorted by frequency', () => {
    const results = [
      repo(['cli', 'rust', 'terminal']),
      repo(['cli', 'rust']),
      repo(['cli']),
    ]
    const tags = getRelatedTags(results, [])
    expect(tags[0]).toBe('cli')
    expect(tags[1]).toBe('rust')
  })

  it('excludes current tags from results', () => {
    const results = [repo(['cli', 'rust']), repo(['cli'])]
    const tags = getRelatedTags(results, ['cli'])
    expect(tags).not.toContain('cli')
    expect(tags).toContain('rust')
  })

  it('respects the limit parameter', () => {
    const results = Array.from({ length: 20 }, (_, i) => repo([`topic-${i}`]))
    const tags = getRelatedTags(results, [], 5)
    expect(tags).toHaveLength(5)
  })

  it('returns empty array when results have no topics', () => {
    const results = [{ topics: [] }, { topics: undefined as any }]
    expect(getRelatedTags(results, [])).toEqual([])
  })
})
