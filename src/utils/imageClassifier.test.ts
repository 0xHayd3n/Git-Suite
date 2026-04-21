import { describe, it, expect } from 'vitest'
import { classifyImage } from './imageClassifier'

describe('classifyImage', () => {
  const base = { src: 'https://example.com/image.png', isLinked: false, nearestHeadingText: '' }

  // ── Signal: linked image ──────────────────────────────────────────
  it('classifies a linked image as content (isLinked alone is not a logo signal)', () => {
    expect(classifyImage({ ...base, isLinked: true })).toBe('content')
  })

  it('classifies an unlinked image with no context as content', () => {
    expect(classifyImage(base)).toBe('content')
  })

  // ── Signal: sponsor heading context ──────────────────────────────
  it('classifies as logo when nearest heading contains "sponsors"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Our Sponsors' })).toBe('logo')
  })
  it('classifies as logo when nearest heading contains "backers"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Backers' })).toBe('logo')
  })
  it('classifies as logo when nearest heading contains "built with"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Built With' })).toBe('logo')
  })
  it('classifies as logo when nearest heading contains "thanks to"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Thanks to' })).toBe('logo')
  })
  it('does NOT classify as logo for unrelated heading', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Installation' })).toBe('content')
  })
  it('does NOT classify as logo when heading contains "contributors"', () => {
    expect(classifyImage({ ...base, nearestHeadingText: 'Contributing' })).toBe('content')
  })

  // ── Signal: badge domain ──────────────────────────────────────────
  it('classifies a shields.io image as logo', () => {
    expect(classifyImage({ ...base, src: 'https://img.shields.io/npm/v/foo' })).toBe('logo')
  })
  it('classifies a badgen.net image as logo', () => {
    expect(classifyImage({ ...base, src: 'https://badgen.net/badge/version/1.0.0/green' })).toBe('logo')
  })

  // ── Signal: declared dimensions ──────────────────────────────────
  it('classifies as logo when declared width/height gives >2.5 ratio and height <120', () => {
    expect(classifyImage({ ...base, declaredWidth: 400, declaredHeight: 80 })).toBe('logo')
  })
  it('does NOT classify as logo when height is too tall', () => {
    expect(classifyImage({ ...base, declaredWidth: 400, declaredHeight: 150 })).toBe('content')
  })
  it('does NOT classify as logo when ratio is square-ish', () => {
    expect(classifyImage({ ...base, declaredWidth: 200, declaredHeight: 150 })).toBe('content')
  })
  it('ignores dimensions when only one is provided', () => {
    expect(classifyImage({ ...base, declaredWidth: 400 })).toBe('content')
  })
  it('does NOT classify as logo when declaredHeight is 0', () => {
    expect(classifyImage({ ...base, declaredWidth: 400, declaredHeight: 0 })).toBe('content')
  })
})
