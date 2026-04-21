import LibraryCard from './LibraryCard'
import LibraryListRow from './LibraryListRow'
import ViewportWindow from './ViewportWindow'
import type { LibraryRow } from '../types/repo'
import type { LayoutPrefs } from './LayoutDropdown'

export interface LibraryGridProps {
  rows: LibraryRow[]
  selectedId: string | null
  layoutPrefs: LayoutPrefs
  subSkillIds: Set<string>
  onSelect: (row: LibraryRow) => void
}

export default function LibraryGrid({
  rows, selectedId, layoutPrefs, subSkillIds, onSelect,
}: LibraryGridProps) {
  const isList = layoutPrefs.mode === 'list'

  return (
    <div
      className={isList ? 'library-list' : 'library-grid'}
      style={!isList ? { gridTemplateColumns: `repeat(${layoutPrefs.columns}, minmax(0, 1fr))` } : undefined}
    >
      {rows.map(row => (
        <ViewportWindow
          key={row.id}
          placeholderHeight={isList ? 52 : 220}
        >
          {isList ? (
            <LibraryListRow
              row={row}
              selected={selectedId === row.id}
              onSelect={() => onSelect(row)}
            />
          ) : (
            <LibraryCard
              row={row}
              selected={selectedId === row.id}
              hasSubSkill={subSkillIds.has(row.id)}
              onSelect={() => onSelect(row)}
            />
          )}
        </ViewportWindow>
      ))}
    </div>
  )
}
