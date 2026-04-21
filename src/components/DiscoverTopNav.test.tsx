import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DiscoverTopNav from './DiscoverTopNav'

const baseProps = {
  selectedSubtypes: [],
  onSelectedSubtypesChange: vi.fn(),
  filters: {},
  selectedLanguages: [],
  activeVerification: new Set<'verified' | 'likely'>(),
  onFilterChange: vi.fn(),
  onSelectedLanguagesChange: vi.fn(),
  onVerificationToggle: vi.fn(),
  activePanel: null as 'buckets' | 'filters' | 'advanced' | null,
  onActivePanelChange: vi.fn(),
  showLanding: false,
  onHomeClick: vi.fn(),
  onBrowseClick: vi.fn(),
}

describe('DiscoverTopNav — rendering', () => {
  it('renders without crashing', () => {
    expect(() => render(<DiscoverTopNav {...baseProps} />)).not.toThrow()
  })

  it('shows Home and Browse buttons', () => {
    render(<DiscoverTopNav {...baseProps} />)
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument()
  })

  it('shows Blocks and Filters buttons', () => {
    render(<DiscoverTopNav {...baseProps} />)
    expect(screen.getByRole('button', { name: /blocks/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument()
  })
})

describe('DiscoverTopNav — active state', () => {
  it('Home button has active class when showLanding is true', () => {
    render(<DiscoverTopNav {...baseProps} showLanding={true} />)
    expect(screen.getByRole('button', { name: /home/i })).toHaveClass('dtn-btn-active')
  })

  it('Browse button has active class when showLanding is false', () => {
    render(<DiscoverTopNav {...baseProps} showLanding={false} />)
    expect(screen.getByRole('button', { name: /browse/i })).toHaveClass('dtn-btn-active')
  })
})

describe('DiscoverTopNav — panel toggle', () => {
  it('calls onActivePanelChange("filters") when Blocks is clicked and panel is closed', () => {
    const onActivePanelChange = vi.fn()
    render(<DiscoverTopNav {...baseProps} onActivePanelChange={onActivePanelChange} />)
    fireEvent.click(screen.getByRole('button', { name: /blocks/i }))
    expect(onActivePanelChange).toHaveBeenCalledWith('filters')
  })

  it('calls onActivePanelChange(null) when Blocks is clicked and filters panel is open', () => {
    const onActivePanelChange = vi.fn()
    render(<DiscoverTopNav {...baseProps} activePanel="filters" onActivePanelChange={onActivePanelChange} />)
    fireEvent.click(screen.getByRole('button', { name: /blocks/i }))
    expect(onActivePanelChange).toHaveBeenCalledWith(null)
  })

  it('calls onActivePanelChange("advanced") when Filters is clicked and panel is closed', () => {
    const onActivePanelChange = vi.fn()
    render(<DiscoverTopNav {...baseProps} onActivePanelChange={onActivePanelChange} />)
    fireEvent.click(screen.getByRole('button', { name: /filters/i }))
    expect(onActivePanelChange).toHaveBeenCalledWith('advanced')
  })

  it('treats activePanel="buckets" as null (no panel rendered)', () => {
    render(<DiscoverTopNav {...baseProps} activePanel="buckets" />)
    expect(screen.queryByText('Language')).not.toBeInTheDocument()
    expect(screen.queryByText('Stars')).not.toBeInTheDocument()
  })
})

describe('DiscoverTopNav — badges', () => {
  it('shows Blocks badge when languages are selected', () => {
    render(<DiscoverTopNav {...baseProps} selectedLanguages={['typescript', 'rust']} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows Blocks badge combining languages and subtypes', () => {
    render(<DiscoverTopNav {...baseProps} selectedLanguages={['python']} selectedSubtypes={['cli-tool']} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows Filters badge when stars filter is active', () => {
    render(<DiscoverTopNav {...baseProps} filters={{ stars: 1000 }} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows no badge when nothing is selected', () => {
    render(<DiscoverTopNav {...baseProps} />)
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
})

describe('DiscoverTopNav — panel content', () => {
  it('shows FilterPanel content when activePanel is "filters"', () => {
    render(<DiscoverTopNav {...baseProps} activePanel="filters" />)
    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('shows AdvancedPanel content when activePanel is "advanced"', () => {
    render(<DiscoverTopNav {...baseProps} activePanel="advanced" />)
    expect(screen.getByText('Stars')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
  })
})
