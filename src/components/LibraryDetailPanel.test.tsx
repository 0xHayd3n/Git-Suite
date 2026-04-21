import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import LibraryDetailPanel from './LibraryDetailPanel'

describe('LibraryDetailPanel', () => {
  it('renders children when open', () => {
    render(
      <LibraryDetailPanel open={true} onClose={() => {}}>
        <div>child content</div>
      </LibraryDetailPanel>
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('close button invokes onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <LibraryDetailPanel open={true} onClose={onClose}>
        <div>x</div>
      </LibraryDetailPanel>
    )
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape key invokes onClose when open', () => {
    const onClose = vi.fn()
    render(
      <LibraryDetailPanel open={true} onClose={onClose}>
        <div>x</div>
      </LibraryDetailPanel>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape key does NOT invoke onClose when closed', () => {
    const onClose = vi.fn()
    render(
      <LibraryDetailPanel open={false} onClose={onClose}>
        <div>x</div>
      </LibraryDetailPanel>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
