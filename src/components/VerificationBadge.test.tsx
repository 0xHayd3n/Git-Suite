import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import VerificationBadge from './VerificationBadge'

describe('VerificationBadge', () => {
  it('renders "Official" label for verified tier', () => {
    render(<VerificationBadge tier="verified" signals={['registry_match', 'verified_org']} size="sm" />)
    expect(screen.getByText('Official')).toBeInTheDocument()
  })

  it('renders "Likely Official" label for likely tier', () => {
    render(<VerificationBadge tier="likely" signals={['registry_match']} size="sm" />)
    expect(screen.getByText('Likely Official')).toBeInTheDocument()
  })

  it('renders nothing for null tier (non-resolving)', () => {
    const { container } = render(<VerificationBadge tier={null} signals={[]} size="sm" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders resolving dot when resolving=true and tier=null', () => {
    const { container } = render(<VerificationBadge tier={null} signals={[]} resolving size="sm" />)
    expect(container).not.toBeEmptyDOMElement()
    expect(container.querySelector('[aria-label="Verifying"]')).toBeInTheDocument()
  })

  it('shows tooltip text for verified badge signals', () => {
    render(<VerificationBadge tier="verified" signals={['registry_match', 'verified_org']} size="md" />)
    expect(screen.getByText('Registry match')).toBeInTheDocument()
    expect(screen.getByText('Verified organisation')).toBeInTheDocument()
  })

  it('shows tooltip text for homepage_match signal', () => {
    render(<VerificationBadge tier="likely" signals={['homepage_match']} size="sm" />)
    expect(screen.getByText('Homepage domain match')).toBeInTheDocument()
  })

  it('shows self_named and dependent_tier signal labels', () => {
    render(<VerificationBadge tier="likely" signals={['self_named', 'dependent_tier']} size="sm" />)
    expect(screen.getByText('Self-named repository')).toBeInTheDocument()
    expect(screen.getByText('High dependent count')).toBeInTheDocument()
  })
})
