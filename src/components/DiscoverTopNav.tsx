import { useRef, useEffect } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { FilterPanel, AdvancedPanel, type DiscoverSidebarProps } from './DiscoverSidebar'
import logoSrc from '../assets/logo.png'
import './DiscoverTopNav.css'

function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  )
}

function BrowseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  )
}

function BlocksIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" />
    </svg>
  )
}

export default function DiscoverTopNav(props: DiscoverSidebarProps) {
  const {
    selectedSubtypes, onSelectedSubtypesChange,
    filters, selectedLanguages, activeVerification,
    onFilterChange, onSelectedLanguagesChange, onVerificationToggle,
    activePanel, onActivePanelChange,
    showLanding, onHomeClick, onBrowseClick,
    mode = 'discover', skillStatus, onSkillStatusChange, itemCounts,
  } = props

  const pillRef = useRef<HTMLDivElement>(null)

  // Normalize 'buckets' → null (top nav never produces 'buckets')
  const resolvedPanel = activePanel === 'buckets' ? null : activePanel

  const filterCount = selectedLanguages.length + selectedSubtypes.length
  const advancedCount =
    (filters.stars    ? 1 : 0) +
    (filters.activity ? 1 : 0) +
    (filters.license  ? 1 : 0) +
    activeVerification.size

  const toggle = (panel: 'filters' | 'advanced') => {
    onActivePanelChange(resolvedPanel === panel ? null : panel)
  }

  const onActivePanelChangeRef = useRef(onActivePanelChange)
  useEffect(() => { onActivePanelChangeRef.current = onActivePanelChange })

  // Single pill ref covers both pill and panels (panels are absolute children of pill)
  useEffect(() => {
    if (!resolvedPanel) return
    const handler = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        onActivePanelChangeRef.current(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [resolvedPanel])

  return (
    <>
    <div className="dtn-titlebar-shield" aria-hidden="true" />
    <div ref={pillRef} className="discover-top-nav">
      <button
        type="button"
        className={`dtn-btn${showLanding ? ' dtn-btn-active' : ''}`}
        onClick={onHomeClick}
        aria-label="Home"
      >
        <HomeIcon />
        <span>Home</span>
      </button>

      <button
        type="button"
        className={`dtn-btn${!showLanding ? ' dtn-btn-active' : ''}`}
        onClick={onBrowseClick}
        aria-label="Browse"
      >
        <BrowseIcon />
        <span>Browse</span>
      </button>

      <span className="dtn-sep" aria-hidden="true" />

      <img src={logoSrc} alt="Git Suite" className="dtn-logo" />

      <span className="dtn-sep" aria-hidden="true" />

      <button
        type="button"
        className={`dtn-btn${resolvedPanel === 'filters' ? ' dtn-btn-active' : ''}`}
        onClick={() => toggle('filters')}
        aria-label="Blocks"
        aria-expanded={resolvedPanel === 'filters'}
        aria-controls="dtn-filters-panel"
      >
        <BlocksIcon />
        <span>Blocks</span>
        {filterCount > 0 && resolvedPanel !== 'filters' && (
          <span className="dtn-badge">{filterCount}</span>
        )}
      </button>

      <button
        type="button"
        className={`dtn-btn${resolvedPanel === 'advanced' ? ' dtn-btn-active' : ''}`}
        onClick={() => toggle('advanced')}
        aria-label="Filters"
        aria-expanded={resolvedPanel === 'advanced'}
        aria-controls="dtn-advanced-panel"
      >
        <SlidersHorizontal size={13} />
        <span>Filters</span>
        {advancedCount > 0 && resolvedPanel !== 'advanced' && (
          <span className="dtn-badge">{advancedCount}</span>
        )}
      </button>

      {resolvedPanel === 'filters' && (
        <div id="dtn-filters-panel" className="dtn-panel">
          <FilterPanel
            selectedLanguages={selectedLanguages}
            onSelectedLanguagesChange={onSelectedLanguagesChange}
            selectedSubtypes={selectedSubtypes}
            onSelectedSubtypesChange={onSelectedSubtypesChange}
            itemCounts={itemCounts}
          />
        </div>
      )}

      {resolvedPanel === 'advanced' && (
        <div id="dtn-advanced-panel" className="dtn-panel">
          <AdvancedPanel
            filters={filters}
            activeVerification={activeVerification}
            onFilterChange={onFilterChange}
            onVerificationToggle={onVerificationToggle}
            mode={mode}
            skillStatus={skillStatus}
            onSkillStatusChange={onSkillStatusChange}
          />
        </div>
      )}
    </div>
    </>
  )
}
