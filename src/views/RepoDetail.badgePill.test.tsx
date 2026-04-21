import { describe, it, expect } from 'vitest'
import { valueAccent } from './RepoDetail'

describe('valueAccent', () => {
  it('returns green for passing/success keywords', () => {
    expect(valueAccent('passing')).toBe('green')
    expect(valueAccent('success')).toBe('green')
    expect(valueAccent('enabled')).toBe('green')
  })

  it('returns red for failing/error keywords', () => {
    expect(valueAccent('failing')).toBe('red')
    expect(valueAccent('error')).toBe('red')
  })

  it('returns blue for version strings (v-prefixed or digit-leading)', () => {
    expect(valueAccent('v2.1.0')).toBe('blue')
    expect(valueAccent('v0.9.0-beta')).toBe('blue')
    expect(valueAccent('1.0.3')).toBe('blue')
    expect(valueAccent('3.14')).toBe('blue')
  })

  it('returns gray as default fallback', () => {
    expect(valueAccent('MIT')).toBe('gray')
    expect(valueAccent('unknown value')).toBe('gray')
    expect(valueAccent('unknown')).toBe('gray')  // intentionally neutral, not red
    expect(valueAccent('')).toBe('gray')
  })
})
