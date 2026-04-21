import { useState, useRef, useEffect } from 'react'
import { List, AlignJustify, LayoutGrid, Grid2x2, ArrowUpDown, ChevronDown, Search, X } from 'lucide-react'

export type ViewMode = 'details' | 'list' | 'small-icons' | 'large-icons'
export type SortField = 'name' | 'type' | 'size'
export type SortDirection = 'asc' | 'desc'

interface ViewModeBarProps {
  itemCount: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  sortField: SortField
  sortDirection: SortDirection
  onSortFieldChange: (field: SortField) => void
  onSortDirectionChange: (dir: SortDirection) => void
  searchValue?: string
  onSearchChange?: (value: string) => void
}

const VIEW_MODES: { mode: ViewMode; icon: typeof List; label: string }[] = [
  { mode: 'details', icon: List, label: 'Details' },
  { mode: 'list', icon: AlignJustify, label: 'List' },
  { mode: 'small-icons', icon: LayoutGrid, label: 'Small Icons' },
  { mode: 'large-icons', icon: Grid2x2, label: 'Large Icons' },
]

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'type', label: 'Type' },
  { field: 'size', label: 'Size' },
]

export default function ViewModeBar({
  itemCount, viewMode, onViewModeChange,
  sortField, sortDirection, onSortFieldChange, onSortDirectionChange,
  searchValue, onSearchChange,
}: ViewModeBarProps) {
  const [sortOpen, setSortOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sortOpen])

  // Listen for Ctrl+Shift+F keyboard shortcut — focus search
  useEffect(() => {
    if (!onSearchChange) return
    function handleFocusSearch() { searchInputRef.current?.focus() }
    window.addEventListener('files-toolbar:focus-search', handleFocusSearch as EventListener)
    return () => window.removeEventListener('files-toolbar:focus-search', handleFocusSearch as EventListener)
  }, [onSearchChange])

  return (
    <div className="view-mode-bar">
      {/* Search — left side */}
      {onSearchChange && (
        <div className="view-mode-bar__search view-mode-bar__search--expanded">
          <Search size={12} className="view-mode-bar__search-icon" />
          <input
            ref={searchInputRef}
            className="view-mode-bar__search-input"
            type="text"
            placeholder="Search files..."
            value={searchValue ?? ''}
            onChange={e => onSearchChange(e.target.value)}
          />
          {searchValue && (
            <button
              className="view-mode-bar__search-clear"
              onMouseDown={e => { e.preventDefault(); onSearchChange('') }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}

      <div className="view-mode-bar__controls">
        {/* Sort dropdown */}
        <div className="view-mode-bar__sort" ref={dropdownRef}>
          <button
            className={`view-mode-bar__sort-btn${sortOpen ? ' view-mode-bar__sort-btn--open' : ''}`}
            title="Sort by"
            onClick={() => setSortOpen(o => !o)}
          >
            <ArrowUpDown size={12} />
            <span className="view-mode-bar__sort-label">Sort</span>
            <ChevronDown size={10} />
          </button>
          {sortOpen && (
            <div className="view-mode-bar__sort-dropdown">
              {SORT_OPTIONS.map(({ field, label }) => (
                <button
                  key={field}
                  className={`view-mode-bar__sort-option${sortField === field ? ' view-mode-bar__sort-option--active' : ''}`}
                  onClick={() => {
                    onSortFieldChange(field)
                    setSortOpen(false)
                  }}
                >
                  {label}
                  {sortField === field && (
                    <span className="view-mode-bar__sort-check">✓</span>
                  )}
                </button>
              ))}
              <div className="view-mode-bar__sort-divider" />
              <button
                className={`view-mode-bar__sort-option${sortDirection === 'asc' ? ' view-mode-bar__sort-option--active' : ''}`}
                onClick={() => {
                  onSortDirectionChange('asc')
                  setSortOpen(false)
                }}
              >
                Ascending
                {sortDirection === 'asc' && (
                  <span className="view-mode-bar__sort-check">✓</span>
                )}
              </button>
              <button
                className={`view-mode-bar__sort-option${sortDirection === 'desc' ? ' view-mode-bar__sort-option--active' : ''}`}
                onClick={() => {
                  onSortDirectionChange('desc')
                  setSortOpen(false)
                }}
              >
                Descending
                {sortDirection === 'desc' && (
                  <span className="view-mode-bar__sort-check">✓</span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* View mode buttons */}
        <div className="view-mode-bar__buttons">
          {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              className={`view-mode-bar__btn${viewMode === mode ? ' view-mode-bar__btn--active' : ''}`}
              title={label}
              onClick={() => onViewModeChange(mode)}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
