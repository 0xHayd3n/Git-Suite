import { X, ChevronLeft } from 'lucide-react'
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
  activeFilters?: ActiveFilters
  onRemoveLanguage?: (lang: string) => void
  onRemoveSubtype?: (id: string) => void
  onRemoveTag?: (tag: string) => void
  hideViewMode?: boolean
  title?: string
  onBack?: () => void
  onTitleClick?: () => void
}

export default function GridHeader({
  viewMode,
  onViewModeChange,
  activeFilters,
  onRemoveLanguage,
  onRemoveSubtype,
  onRemoveTag,
  hideViewMode = false,
  title,
  onBack,
  onTitleClick,
}: GridHeaderProps) {
  const hasFilters = !!(activeFilters?.languages?.length || activeFilters?.subtypes?.length || activeFilters?.tags?.length)

  return (
    <div className="grid-header-wrapper">
      {onBack && title && (
        <div className="grid-header-page-title">
          <button className="grid-header-back-btn" onClick={onBack}>
            <ChevronLeft size={20} />
          </button>
          <span>{title}</span>
        </div>
      )}
      {hasFilters && (
        <div className={`active-filters-bar${onBack ? ' active-filters-bar--indented' : ''}`}>
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
      {title && !onBack && (
        onTitleClick ? (
          <button className="discover-row-title-btn" onClick={onTitleClick}>
            <span>{title}</span>
            <span className="discover-row-title-chevron" aria-hidden="true">›</span>
          </button>
        ) : (
          <div className="grid-header-title">{title}</div>
        )
      )}
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

    </div>
    </div>
  )
}
