import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface FilesToolbarProps {
  // Search
  searchValue: string
  onSearchChange: (value: string) => void
}

export default function FilesToolbar({
  searchValue, onSearchChange,
}: FilesToolbarProps) {
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Expose focus method for keyboard shortcut
  useEffect(() => {
    const el = searchInputRef.current
    if (searchExpanded && el) {
      el.focus()
    }
  }, [searchExpanded])

  // Allow parent to focus search via ref on the input
  useEffect(() => {
    function handleFocusSearch() {
      setSearchExpanded(true)
    }
    window.addEventListener('files-toolbar:focus-search', handleFocusSearch as EventListener)
    return () => window.removeEventListener('files-toolbar:focus-search', handleFocusSearch as EventListener)
  }, [])

  const handleSearchBlur = () => {
    if (!searchValue) {
      setSearchExpanded(false)
    }
  }

  return (
    <div className="files-toolbar">
      <div className="files-toolbar__spacer" />

      {/* Search */}
      {searchExpanded ? (
        <div className="files-toolbar__search files-toolbar__search--expanded">
          <Search size={12} className="files-toolbar__search-icon" />
          <input
            ref={searchInputRef}
            className="files-toolbar__search-input"
            type="text"
            placeholder="Search files..."
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            onBlur={handleSearchBlur}
          />
          {searchValue && (
            <button
              className="files-toolbar__search-clear"
              title="Clear search"
              onMouseDown={e => { e.preventDefault(); onSearchChange('') }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ) : (
        <button
          className="files-toolbar__search-btn"
          title="Search files (Ctrl+Shift+F)"
          onClick={() => setSearchExpanded(true)}
        >
          <Search size={14} />
        </button>
      )}
    </div>
  )
}
