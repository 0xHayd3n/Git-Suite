import { Boxes } from 'lucide-react'
import { useProfileOverlay } from '../contexts/ProfileOverlay'
import type { LibraryRow } from '../types/repo'

export interface LibraryCardProps {
  row: LibraryRow
  selected: boolean
  hasSubSkill: boolean
  onSelect: () => void
}

export default function LibraryCard({ row, selected, hasSubSkill, onSelect }: LibraryCardProps) {
  const { openProfile } = useProfileOverlay()

  return (
    <div
      className={`library-card${selected ? ' selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      {hasSubSkill && (
        <span className="library-sub-skill-indicator" aria-label="Has interactive detail">
          <Boxes size={12} />
        </span>
      )}

      <div className="library-card-header">
        <div className="library-card-title-block">
          <span className="library-card-name">{row.name}</span>
          <button
            className="owner-name-btn library-card-owner"
            onClick={(e) => { e.stopPropagation(); openProfile(row.owner) }}
          >
            {row.owner}
          </button>
        </div>
      </div>

      {row.description && (
        <p className="library-card-description">{row.description}</p>
      )}
    </div>
  )
}
