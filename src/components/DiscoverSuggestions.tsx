import type { RefObject } from 'react'

// ── Suggestion types ──────────────────────────────────────────────
export type TopicSuggestion   = { kind: 'topic';   label: string }
export type SubtypeSuggestion = { kind: 'subtype'; label: string; subTypeId: string; bucketLabel: string; bucketColor: string }
export type Suggestion        = TopicSuggestion | SubtypeSuggestion

export interface DiscoverSuggestionsProps {
  anchor: DOMRect | null
  above?: boolean
  suggestionsRef: RefObject<HTMLDivElement>
  showHistory: boolean
  searchHistory: { entries: string[]; remove: (e: string) => void; clear: () => void }
  suggestions: Suggestion[]
  suggestionIndex: number
  onSuggestionIndex: (i: number) => void
  onSelectHistory: (entry: string) => void
  onSelectSubtype: (subTypeId: string) => void
  onSelectTopic: (completed: string) => void
}

export default function DiscoverSuggestions({
  anchor,
  above,
  suggestionsRef,
  showHistory,
  searchHistory,
  suggestions,
  suggestionIndex,
  onSuggestionIndex,
  onSelectHistory,
  onSelectSubtype,
  onSelectTopic,
}: DiscoverSuggestionsProps) {
  if (!anchor) return null

  let positionStyle: React.CSSProperties
  if (above) {
    // Position above the floating search bar
    const searchBar = document.querySelector('.dock-search-floating.open')
    const searchRect = searchBar?.getBoundingClientRect()
    if (searchRect) {
      positionStyle = {
        bottom: window.innerHeight - searchRect.top + 6,
        left: searchRect.left,
        width: searchRect.width,
      }
    } else {
      const dockEl = document.querySelector('.floating-dock')
      const dockRect = dockEl?.getBoundingClientRect()
      if (dockRect) {
        positionStyle = {
          bottom: window.innerHeight - dockRect.top + 8,
          left: dockRect.left,
          width: dockRect.width,
        }
      } else {
        positionStyle = {
          bottom: window.innerHeight - anchor.top + 8,
          left: anchor.left,
          width: Math.max(anchor.width, 340),
        }
      }
    }
  } else {
    positionStyle = { top: anchor.bottom + 4, left: anchor.left, width: anchor.width }
  }

  return (
    <div ref={suggestionsRef} style={{
      position: 'fixed',
      ...positionStyle,
      background: 'rgba(20, 20, 20, 0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      zIndex: 1000, overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
    }}>
      {showHistory ? (
        <>
          <div className="discover-history-header">Recent searches</div>
          {searchHistory.entries.map((entry, i) => (
            <div
              key={entry}
              className="discover-history-item"
              style={{
                background: i === suggestionIndex ? 'var(--bg3)' : 'transparent',
                color: i === suggestionIndex ? 'var(--t1)' : undefined,
              }}
              onMouseDown={() => onSelectHistory(entry)}
              onMouseEnter={() => onSuggestionIndex(i)}
              onMouseLeave={() => onSuggestionIndex(-1)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--t3)', fontSize: 12 }}>&#128339;</span>
                {entry}
              </span>
              <button
                className="discover-history-remove"
                onMouseDown={e => {
                  e.stopPropagation()
                  e.preventDefault()
                  searchHistory.remove(entry)
                }}
              >
                &#x2715;
              </button>
            </div>
          ))}
          {searchHistory.entries.length >= 2 && (
            <button
              className="discover-history-clear"
              onMouseDown={e => {
                e.stopPropagation()
                e.preventDefault()
                searchHistory.clear()
              }}
            >
              Clear all
            </button>
          )}
        </>
      ) : (
        suggestions.map((s, i) => (
          <div
            key={s.kind === 'subtype' ? `subtype:${s.subTypeId}` : `topic:${s.label}`}
            onMouseDown={() => {
              if (s.kind === 'subtype') {
                onSelectSubtype(s.subTypeId)
              } else {
                onSelectTopic(s.label)
              }
            }}
            style={{
              padding: '7px 14px', fontSize: 12, cursor: 'pointer',
              background: i === suggestionIndex ? 'var(--bg3)' : 'transparent',
              color: i === suggestionIndex ? 'var(--t1)' : 'var(--t2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={() => onSuggestionIndex(i)}
            onMouseLeave={() => onSuggestionIndex(-1)}
          >
            {s.kind === 'subtype' ? (
              <>
                <span style={{ color: s.bucketColor, fontSize: 10 }}>●</span>
                {s.label}
                <span style={{ color: 'var(--t3)', fontSize: 11, marginLeft: 'auto' }}>· {s.bucketLabel}</span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--t3)', fontSize: 10 }}>⬡</span>
                {s.label}
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
}
