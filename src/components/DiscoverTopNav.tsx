import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, Grid3X3, List } from 'lucide-react'
import { FilterPanel, AdvancedPanel, type DiscoverSidebarProps } from './DiscoverSidebar'
import type { ListDensity } from './LayoutDropdown'
import logoSrc from '../assets/logo.png'
import './DiscoverTopNav.css'

function BlocksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
    compact = false,
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

  const setColumns = (columns: number) => {
    if (layoutPrefs && onLayoutChange) onLayoutChange({ ...layoutPrefs, columns })
  }

  const setDensity = (density: ListDensity) => {
    if (layoutPrefs && onLayoutChange) onLayoutChange({ ...layoutPrefs, density })
  }

  const toggleField = (field: 'description' | 'tags' | 'stats' | 'type' | 'verification') => {
    if (!layoutPrefs || !onLayoutChange) return
    onLayoutChange({ ...layoutPrefs, fields: { ...layoutPrefs.fields, [field]: !layoutPrefs.fields[field] } })
  }

  return (
    <div ref={wrapperRef} className={`discover-top-nav${compact ? ' discover-top-nav--compact' : ''}`}>
      {/* Branding */}
      {!compact && (
        <div className="dtn-brand">
          <img src={logoSrc} alt="" className="dtn-brand-logo" />
          <span className="dtn-brand-name">Git Suite</span>
        </div>
      )}

      {/* Search bar */}
      <div className="dtn-search-bar" title="Search repositories">
        <svg className="dtn-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          className="dtn-search-input"
          placeholder="Search repos…"
          value={query}
          onChange={e => onQueryChange?.(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch?.()}
        />
      </div>

      {/* Filter + View row */}
      <div className="dtn-filter-row">
        <button
          type="button"
          className={`dtn-filter-btn${resolvedPanel === 'filters' ? ' dtn-filter-btn-active' : ''}`}
          onClick={() => toggle('filters')}
          aria-label="Browse categories"
          title="Browse categories"
          aria-expanded={resolvedPanel === 'filters'}
          aria-controls="dtn-filters-panel"
        >
          <BlocksIcon />
          {filterCount > 0 && resolvedPanel !== 'filters' && (
            <span className="dtn-badge">{filterCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`dtn-filter-btn${resolvedPanel === 'advanced' ? ' dtn-filter-btn-active' : ''}`}
          onClick={() => toggle('advanced')}
          aria-label="Advanced filters"
          title="Advanced filters"
          aria-expanded={resolvedPanel === 'advanced'}
          aria-controls="dtn-advanced-panel"
        >
          <SlidersHorizontal size={16} />
          {advancedCount > 0 && resolvedPanel !== 'advanced' && (
            <span className="dtn-badge">{advancedCount}</span>
          )}
        </button>

        {layoutPrefs && onLayoutChange && (
          <span className="dtn-settings-anchor">
            <button
              type="button"
              className={`dtn-filter-btn${layoutOpen ? ' dtn-filter-btn-active' : ''}`}
              onMouseDown={(e) => { e.stopPropagation(); setLayoutOpen(o => !o); if (resolvedPanel) onActivePanelChange(null) }}
              title={layoutPrefs.mode === 'grid' ? 'Grid view' : 'List view'}
            >
              {layoutPrefs.mode === 'list' ? <List size={16} /> : <Grid3X3 size={16} />}
            </button>
            {layoutOpen && (
              <div className="dtn-panel dtn-layout-combined-panel">
                <div className="dtn-layout-mode-row">
                  <button
                    className={`dtn-layout-mode-btn${layoutPrefs.mode === 'grid' ? ' active' : ''}`}
                    onClick={() => handleModeSwitch('grid')}
                  >
                    <Grid3X3 size={13} />
                    <span>Grid</span>
                  </button>
                  <button
                    className={`dtn-layout-mode-btn${layoutPrefs.mode === 'list' ? ' active' : ''}`}
                    onClick={() => handleModeSwitch('list')}
                  >
                    <List size={13} />
                    <span>List</span>
                  </button>
                </div>
                {layoutPrefs.mode === 'grid' ? (
                  <>
                    <div className="layout-popover-label">Columns</div>
                    <div className="layout-popover-row">
                      {[4, 5, 6, 7, 8].map(n => (
                        <button
                          key={n}
                          className={`layout-column-btn${layoutPrefs.columns === n ? ' active' : ''}`}
                          onClick={() => setColumns(n)}
                        >{n}</button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="layout-popover-label">Density</div>
                    <div className="layout-popover-row">
                      <button
                        className={`layout-segment-btn${layoutPrefs.density === 'compact' ? ' active' : ''}`}
                        onClick={() => setDensity('compact')}
                      >Compact</button>
                      <button
                        className={`layout-segment-btn${layoutPrefs.density === 'comfortable' ? ' active' : ''}`}
                        onClick={() => setDensity('comfortable')}
                      >Comfortable</button>
                    </div>
                    <div className="layout-popover-label">Show</div>
                    {(['description', 'tags', 'stats', 'type', 'verification'] as const).map(field => (
                      <label key={field} className="layout-field-row">
                        <input
                          type="checkbox"
                          checked={layoutPrefs.fields[field]}
                          onChange={() => toggleField(field)}
                        />
                        {field.charAt(0).toUpperCase() + field.slice(1)}
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </span>
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
