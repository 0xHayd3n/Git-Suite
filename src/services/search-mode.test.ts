import { describe, it, expect } from 'vitest'
import { detectSearchMode } from './search-mode'

describe('detectSearchMode', () => {
  it('returns raw for a single word', () => {
    expect(detectSearchMode('fastapi')).toBe('raw')
  })

  it('returns raw for a two-word technical term', () => {
    expect(detectSearchMode('ascii art')).toBe('raw')
  })

  it('returns natural for a phrase with a verb', () => {
    expect(detectSearchMode('something to render markdown')).toBe('natural')
  })

  it('returns natural for 3+ words even without a verb', () => {
    expect(detectSearchMode('ascii art terminal')).toBe('natural')
  })

  it('returns natural for a full sentence', () => {
    expect(detectSearchMode('I need a fast HTTP client for Python')).toBe('natural')
  })

  it('returns natural when query contains "looking"', () => {
    expect(detectSearchMode('looking for csv parser')).toBe('natural')
  })

  it('returns raw for empty string', () => {
    expect(detectSearchMode('')).toBe('raw')
  })

  it('returns raw for whitespace only', () => {
    expect(detectSearchMode('   ')).toBe('raw')
  })
})
