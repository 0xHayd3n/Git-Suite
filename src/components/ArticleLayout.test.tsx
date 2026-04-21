import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { ArticleLayout } from './ArticleLayout'

// jsdom does not provide ResizeObserver; ArticleLayout measures its top panel
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const baseProps = {
  byline: <div>byline</div>,
  title: <span>title</span>,
  tabs: <div>tabs</div>,
  body: <div>body</div>,
  actionRow: <div>actions</div>,
}

describe('ArticleLayout', () => {
  it('renders without description or title-extras when props omitted', () => {
    const { container } = render(<ArticleLayout {...baseProps} />)
    expect(container.querySelector('.article-layout-description')).toBeNull()
    expect(container.querySelector('.article-layout-title-extras')).toBeNull()
  })

  it('renders description when description prop provided', () => {
    const { container, getByText } = render(
      <ArticleLayout {...baseProps} description={<span>A repo description.</span>} />,
    )
    const desc = container.querySelector('.article-layout-description')
    expect(desc).toBeTruthy()
    expect(getByText('A repo description.')).toBeTruthy()
  })

  it('renders titleExtras inside the title row when provided', () => {
    const { container, getByText } = render(
      <ArticleLayout {...baseProps} titleExtras={<span>extras</span>} />,
    )
    const extras = container.querySelector('.article-layout-title-extras')
    expect(extras).toBeTruthy()
    expect(getByText('extras')).toBeTruthy()
    // title-extras is a sibling of article-layout-title inside article-layout-title-row
    const row = container.querySelector('.article-layout-title-row')
    expect(row?.querySelector('.article-layout-title')).toBeTruthy()
    expect(row?.querySelector('.article-layout-title-extras')).toBeTruthy()
  })

  it('renders actionRowExtras inside the top panel when provided', () => {
    const { container, getByText } = render(
      <ArticleLayout {...baseProps} actionRowExtras={<span>extras-content</span>} />,
    )
    const slot = container.querySelector('.article-layout-action-row-extras')
    expect(slot).toBeTruthy()
    expect(getByText('extras-content')).toBeTruthy()
    const topPanel = container.querySelector('.article-layout-top-panel')
    expect(topPanel?.querySelector('.article-layout-action-row-extras')).toBeTruthy()
  })

  it('renders no actionRowExtras container when prop is omitted', () => {
    const { container } = render(<ArticleLayout {...baseProps} />)
    expect(container.querySelector('.article-layout-action-row-extras')).toBeNull()
  })
})
