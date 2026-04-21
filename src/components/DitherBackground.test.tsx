import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import DitherBackground from './DitherBackground'

// Mock the dither hook — we don't test canvas rendering here
vi.mock('../hooks/useBayerDither', () => ({
  useBayerDither: vi.fn(),
}))

// jsdom does not provide ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe('DitherBackground', () => {
  it('renders a canvas with dither-canvas class', () => {
    const { container } = render(
      <DitherBackground avatarUrl="https://example.com/avatar.png" />,
    )
    const canvas = container.querySelector('canvas.dither-canvas')
    expect(canvas).toBeTruthy()
  })

  it('renders two frosted glass corner overlays', () => {
    const { container } = render(
      <DitherBackground avatarUrl="https://example.com/avatar.png" />,
    )
    const glasses = container.querySelectorAll('.corner-glass')
    expect(glasses).toHaveLength(2)
    expect(container.querySelector('.corner-glass-tl')).toBeTruthy()
    expect(container.querySelector('.corner-glass-br')).toBeTruthy()
  })

  it('still renders canvas when avatarUrl is null', () => {
    const { container } = render(
      <DitherBackground avatarUrl={null} />,
    )
    const canvas = container.querySelector('canvas.dither-canvas')
    expect(canvas).toBeTruthy()
  })
})
