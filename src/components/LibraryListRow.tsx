import type { LibraryRow } from '../types/repo'

export default function LibraryListRow({
  row, selected, onSelect,
}: {
  row: LibraryRow
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={`library-row${selected ? ' selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      <div className="library-row-info">
        <span className="library-row-name">{row.name}</span>
        <span className="library-row-owner">{row.owner}</span>
      </div>
    </div>
  )
}
