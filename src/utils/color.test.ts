import { describe, it, expect } from 'vitest'
import { deriveBannerPalette } from './color'

describe('deriveBannerPalette', () => {
  it('produces light background (97% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette.bg).toMatch(/97%/)
  })

  it('produces pastel gradientCenter (88% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette.gradientCenter).toMatch(/88%/)
  })

  it('produces muted primary (72% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette.primary).toMatch(/72%/)
  })

  it('produces soft secondary (80% lightness)', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette.secondary).toMatch(/80%/)
  })

  it('does not return textFaint property', () => {
    const palette = deriveBannerPalette({ h: 200, s: 0.6, l: 0.5 })
    expect(palette).not.toHaveProperty('textFaint')
  })
})
