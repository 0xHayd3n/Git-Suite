import { useState } from 'react'
import { Grid3X3, List, Settings, X } from 'lucide-react'
import LayoutPopover from './LayoutPopover'
import type { LayoutPrefs } from './LayoutDropdown'
import { VIEW_MODES } from '../lib/discoverQueries'
import type { ViewModeKey } from '../lib/discoverQueries'
import { getSubTypeConfig } from '../config/repoTypeConfig'
import LanguageIcon from './LanguageIcon'
import { getLangColor } from '../lib/languages'

export interface ActiveFilters {
  languages?: string[]
  subtypes?: string[]
  tags?: string[]
}

interface GridHeaderProps {
  viewMode: ViewModeKey
  onViewModeChange: (mode: ViewModeKey) => void
  layoutPrefs: LayoutPrefs
  onLayoutChange: (prefs: LayoutPrefs) => void
  activeFilters?: ActiveFilters
  onRemoveLanguage?: (lang: string) => void
  onRemoveSubtype?: (id: string) => void
  onRemoveTag?: (tag: string) => void
  hideViewMode?: boolean
}

export default function GridHeader({
  viewMode,
  onViewModeChange,
  layoutPrefs,
  onLayoutChange,
  activeFilters,
  onRemoveLanguage,
  onRemoveSubtype,
  onRemoveTag,
  hideViewMode = false,
}: GridHeaderProps) {
  const [layoutOpen, setLayoutOpen] = useState(false)

  const handleModeSwitch = (mode: 'grid' | 'list') => {
    onLayoutChange({ ...layoutPrefs, mode })
  }

  const hasFilters = !!(activeFilters?.languages?.length || activeFilters?.subtypes?.length || activeFilters?.tags?.length)

  return (
    <div className="grid-header-wrapper">
      {hasFilters && (
        <div className="active-filters-bar">
          {activeFilters!.languages?.map(lang => (
            <button key={lang} className="active-filter-chip" onClick={() => onRemoveLanguage?.(lang)} style={{ '--chip-color': getLangColor(lang) } as React.CSSProperties}>
              <span className="active-filter-chip-icon" style={{ backgroundColor: getLangColor(lang) }}>
                <LanguageIcon lang={lang} size={14} boxed />
              </span>
              <span className="active-filter-chip-label">{lang}</span>
              <X size={10} className="active-filter-chip-x" />
            </button>
          ))}
          {activeFilters!.subtypes?.map(id => {
            const cfg = getSubTypeConfig(id)
            return cfg ? (
              <button key={id} className="active-filter-chip" onClick={() => onRemoveSubtype?.(id)} style={{ '--chip-color': cfg.accentColor } as React.CSSProperties}>
                <span className="active-filter-chip-icon" style={{ backgroundColor: cfg.accentColor }}>
                  {cfg.icon && <cfg.icon size={14} fill="#fff" stroke="#fff" strokeWidth={0.75} />}
                </span>
                <span className="active-filter-chip-label">{cfg.label}</span>
                <X size={10} className="active-filter-chip-x" />
              </button>
            ) : null
          })}
          {activeFilters!.tags?.map(tag => (
            <button key={tag} className="active-filter-chip" onClick={() => onRemoveTag?.(tag)}>
              <span className="active-filter-chip-label">{tag}</span>
              <X size={10} className="active-filter-chip-x" />
            </button>
          ))}
        </div>
      )}
      <div className="grid-header">
      {/* Left: All/Recommended pill toggle */}
      {!hideViewMode && (
        <div className="view-mode-toggle">
          {VIEW_MODES.map(m => (
            <button
              key={m.key}
              className={viewMode === m.key ? 'active' : ''}
              onClick={() => onViewModeChange(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Right: Layout toggle + cog */}
      <div className="filter-chip-wrapper" style={{ marginLeft: 'auto' }}>
        <div className="filter-bar-layout-toggle">
          <button
            className={`filter-bar-layout-btn${layoutPrefs.mode === 'grid' ? ' active' : ''}`}
            onClick={() => handleModeSwitch('grid')}
            title="Grid view"
          >
            <Grid3X3 size={14} />
          </button>
          <button
            className={`filter-bar-layout-btn${layoutPrefs.mode === 'list' ? ' active' : ''}`}
            onClick={() => handleModeSwitch('list')}
            title="List view"
          >
            <List size={14} />
          </button>
          <button
            className="filter-bar-layout-btn filter-bar-layout-cog"
            onClick={() => setLayoutOpen(o => !o)}
            title="Layout settings"
          >
            <Settings size={14} />
          </button>
        </div>
        {layoutOpen && (
          <LayoutPopover
            prefs={layoutPrefs}
            onChange={onLayoutChange}
            onClose={() => setLayoutOpen(false)}
          />
        )}
      </div>
    </div>
    </div>
  )
}
