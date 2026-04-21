import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, Grid3X3, List, Settings } from 'lucide-react'
import { FilterPanel, AdvancedPanel, type DiscoverSidebarProps } from './DiscoverSidebar'
import LayoutPopover from './LayoutPopover'
import logoSrc from '../assets/logo.png'
import './DiscoverTopNav.css'

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
    mode = 'discover', skillStatus, onSkillStatusChange, itemCounts,
    query = '', onQueryChange, onSearch, inputRef,
    layoutPrefs, onLayoutChange,
  } = props

  const wrapperRef = useRef<HTMLDivElement>(null)
  const [layoutOpen, setLayoutOpen] = useState(false)

  const resolvedPanel = activePanel === 'buckets' ? null : activePanel

  const filterCount = selectedLanguages.length + selectedSubtypes.length
  const advancedCount =
    (filters.stars    ? 1 : 0) +
    (filters.activity ? 1 : 0) +
    (filters.license  ? 1 : 0) +
    activeVerification.size

  const toggle = (panel: 'filters' | 'advanced') => {
    onActivePanelChange(resolvedPanel === panel ? null : panel)
    setLayoutOpen(false)
  }

  const onActivePanelChangeRef = useRef(onActivePanelChange)
  useEffect(() => { onActivePanelChangeRef.current = onActivePanelChange })

  useEffect(() => {
    if (!resolvedPanel && !layoutOpen) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onActivePanelChangeRef.current(null)
        setLayoutOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [resolvedPanel, layoutOpen])

  const handleModeSwitch = (m: 'grid' | 'list') => {
    if (layoutPrefs && onLayoutChange) onLayoutChange({ ...layoutPrefs, mode: m })
  }

  return (
    <div ref={wrapperRef} className="discover-top-nav">
      {/* Search bar with logo */}
      <div className="dtn-search-bar">
        <img src={logoSrc} alt="Git Suite" className="dtn-search-logo" />
        <input
          ref={inputRef}
          className="dtn-search-input"
          placeholder="Search repos…"
          value={query}
          onChange={e => onQueryChange?.(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch?.()}
        />
      </div>

      {/* Blocks + Filters + Layout row */}
      <div className="dtn-filter-row">
        <button
          type="button"
          className={`dtn-filter-btn${resolvedPanel === 'filters' ? ' dtn-filter-btn-active' : ''}`}
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
          className={`dtn-filter-btn${resolvedPanel === 'advanced' ? ' dtn-filter-btn-active' : ''}`}
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

        {layoutPrefs && onLayoutChange && (
          <>
            <span className="dtn-filter-sep" aria-hidden="true" />
            <div className="dtn-view-group">
              <button
                type="button"
                className={`dtn-view-btn${layoutPrefs.mode === 'grid' ? ' active' : ''}`}
                onClick={() => handleModeSwitch('grid')}
                title="Grid view"
              >
                <Grid3X3 size={13} />
              </button>
              <span className="dtn-view-sep" aria-hidden="true" />
              <button
                type="button"
                className={`dtn-view-btn${layoutPrefs.mode === 'list' ? ' active' : ''}`}
                onClick={() => handleModeSwitch('list')}
                title="List view"
              >
                <List size={13} />
              </button>
              <span className="dtn-view-sep" aria-hidden="true" />
              <span className="dtn-settings-anchor">
                <button
                  type="button"
                  className={`dtn-view-btn${layoutOpen ? ' active' : ''}`}
                  onMouseDown={(e) => { e.stopPropagation(); setLayoutOpen(o => !o) }}
                  title="Layout settings"
                >
                  <Settings size={13} />
                </button>
                {layoutOpen && onLayoutChange && (
                  <LayoutPopover
                    prefs={layoutPrefs}
                    onChange={onLayoutChange}
                    onClose={() => setLayoutOpen(false)}
                  />
                )}
              </span>
            </div>
          </>
        )}

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
    </div>
  )
}
