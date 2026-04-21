import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { getLangConfig } from './BannerSVG'
import BannerSVG from './BannerSVG'

describe('getLangConfig', () => {
  it('returns an object with bg, primary, secondary, abbr fields', () => {
    const cfg = getLangConfig('TypeScript')
    expect(cfg).toHaveProperty('bg')
    expect(cfg).toHaveProperty('primary')
    expect(cfg).toHaveProperty('secondary')
    expect(cfg).toHaveProperty('abbr')
  })

  it('returns deterministic result for same language', () => {
    expect(getLangConfig('Python')).toEqual(getLangConfig('Python'))
  })

  it('uses first two chars as abbr', () => {
    expect(getLangConfig('Rust').abbr).toBe('Ru')
  })

  it('uses em-dash for empty language', () => {
    expect(getLangConfig('').abbr).toBe('—')
  })
})

const ALL_BUCKETS = ['dev-tools', 'frameworks', 'ai-ml', 'learning', 'editors', 'lang-projects', 'infrastructure', 'utilities', null]

describe('BannerSVG', () => {
  it.each(ALL_BUCKETS)('renders without error for typeBucket=%s', (typeBucket) => {
    expect(() =>
      render(
        <BannerSVG
          owner="testowner"
          name="testrepo"
          typeBucket={typeBucket}
          size="card"
        />
      )
    ).not.toThrow()
  })

  it.each(ALL_BUCKETS)('renders an SVG for typeBucket=%s', (typeBucket) => {
    const { container } = render(
      <BannerSVG
        owner="testowner"
        name="testrepo"
        typeBucket={typeBucket}
        size="card"
      />
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders detail size', () => {
    const { container } = render(
      <BannerSVG owner="a" name="b" typeBucket={null} size="detail" />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 175')
  })

  it('renders card size', () => {
    const { container } = render(
      <BannerSVG owner="a" name="b" typeBucket={null} size="card" />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 260 72')
  })

it('renders light background fills (no near-black bg)', () => {
    const { container } = render(
      <BannerSVG owner="a" name="b" typeBucket={null} size="card" />
    )
    const rects = container.querySelectorAll('rect')
    const bgRect = rects[0]
    const fill = bgRect?.getAttribute('fill') ?? ''
    expect(fill).not.toMatch(/^#0[0-9a-f]{5}$/i)
  })

  it('does not render avatar image elements', () => {
    const { container } = render(
      <BannerSVG owner="a" name="b" typeBucket={null} size="card" />
    )
    expect(container.querySelectorAll('image')).toHaveLength(0)
  })

  it('does not render monospace label text elements', () => {
    const { container } = render(
      <BannerSVG owner="a" name="b" typeBucket={null} size="card" />
    )
    expect(container.querySelectorAll('text')).toHaveLength(0)
  })
})
