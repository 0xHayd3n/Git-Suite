import { describe, it, expect } from 'vitest'
import { rgbToHsl, hslToRgb, BAYER8, coverUV } from './useBayerDither'

describe('rgbToHsl', () => {
  it('converts pure red', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0)
    expect(h).toBeCloseTo(0, 1)
    expect(s).toBeCloseTo(1, 1)
    expect(l).toBeCloseTo(0.5, 1)
  })

  it('converts pure white', () => {
    const [h, s, l] = rgbToHsl(255, 255, 255)
    expect(s).toBe(0)
    expect(l).toBeCloseTo(1, 1)
  })

  it('converts pure black', () => {
    const [h, s, l] = rgbToHsl(0, 0, 0)
    expect(s).toBe(0)
    expect(l).toBe(0)
  })

  it('converts mid-blue', () => {
    const [h, s, l] = rgbToHsl(0, 128, 255)
    expect(h).toBeGreaterThan(0.5)
    expect(h).toBeLessThan(0.7)
    expect(s).toBeCloseTo(1, 1)
  })
})

describe('hslToRgb', () => {
  it('round-trips pure red', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('converts gray (zero saturation)', () => {
    const [r, g, b] = hslToRgb(0.5, 0, 0.5)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })
})

describe('BAYER8', () => {
  it('is an 8x8 matrix', () => {
    expect(BAYER8).toHaveLength(8)
    BAYER8.forEach(row => expect(row).toHaveLength(8))
  })

  it('contains values 0-63', () => {
    const flat = BAYER8.flat()
    expect(Math.min(...flat)).toBe(0)
    expect(Math.max(...flat)).toBe(63)
    expect(new Set(flat).size).toBe(64)
  })
})

describe('coverUV', () => {
  it('returns u,v unchanged when aspects match (square into square)', () => {
    const result = coverUV(0.25, 0.75, 100, 100, 100, 100)
    expect(result.u).toBeCloseTo(0.25)
    expect(result.v).toBeCloseTo(0.75)
  })

  it('compresses v range when output is wider than source', () => {
    // 400x100 output (aspect 4) from 100x100 source (aspect 1)
    // v should be compressed toward 0.5
    const result = coverUV(0.5, 0.0, 100, 100, 400, 100)
    expect(result.u).toBeCloseTo(0.5)
    expect(result.v).toBeCloseTo(0.5 + (0.0 - 0.5) * (1 / 4))
    // = 0.5 + (-0.5) * 0.25 = 0.375
    expect(result.v).toBeCloseTo(0.375)
  })

  it('compresses u range when output is taller than source', () => {
    // 100x400 output (aspect 0.25) from 100x100 source (aspect 1)
    // u should be compressed toward 0.5
    const result = coverUV(0.0, 0.5, 100, 100, 100, 400)
    expect(result.u).toBeCloseTo(0.5 + (0.0 - 0.5) * (1 / 4))
    expect(result.u).toBeCloseTo(0.375)
    expect(result.v).toBeCloseTo(0.5)
  })

  it('center point stays centered regardless of aspect', () => {
    const result = coverUV(0.5, 0.5, 200, 200, 600, 100)
    expect(result.u).toBeCloseTo(0.5)
    expect(result.v).toBeCloseTo(0.5)
  })
})
