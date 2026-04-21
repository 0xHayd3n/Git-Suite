import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import Toggle from './Toggle'

describe('Toggle', () => {
  it('renders with role="switch" and aria-checked', () => {
    render(<Toggle on={true} onChange={() => {}} ariaLabel="Toggle active" />)
    const btn = screen.getByRole('switch')
    expect(btn).toHaveAttribute('aria-checked', 'true')
    expect(btn).toHaveAttribute('aria-label', 'Toggle active')
  })

  it('calls onChange with opposite value on click', async () => {
    const onChange = vi.fn()
    render(<Toggle on={false} onChange={onChange} ariaLabel="Toggle active" />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('applies mini class when mini prop is true', () => {
    render(<Toggle on={false} onChange={() => {}} ariaLabel="Mini toggle" mini />)
    const btn = screen.getByRole('switch')
    expect(btn.className).toContain('lib-toggle-mini')
  })
})
