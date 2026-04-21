import './LibrarySidebar.css'
import type { LibraryRow, StarredRepoRow, RepoRow } from '../types/repo'

type ActiveSegment = 'all' | 'active' | 'inactive'

interface SidebarEntry {
  row: RepoRow
  isInstalled: boolean
}

interface Props {
  installedRows: LibraryRow[]
  starredRows: StarredRepoRow[]
  selectedId: string | null
  activeSegment: ActiveSegment
  onSegmentChange: (s: ActiveSegment) => void
  onSelect: (row: RepoRow, isInstalled: boolean) => void
}

export default function LibrarySidebar({
  installedRows, starredRows, selectedId, activeSegment, onSegmentChange, onSelect,
}: Props) {
  const entries: SidebarEntry[] = (() => {
    const map = new Map<string, SidebarEntry>()
    for (const row of installedRows) {
      map.set(row.id, { row, isInstalled: true })
    }
    for (const row of starredRows) {
      if (!map.has(row.id)) {
        map.set(row.id, { row, isInstalled: false })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.row.name.localeCompare(b.row.name))
  })()

  const visible = entries.filter(({ row, isInstalled }) => {
    if (!isInstalled) return activeSegment === 'all'
    const r = row as LibraryRow
    if (activeSegment === 'active') return r.active === 1
    if (activeSegment === 'inactive') return r.active === 0
    return true
  })

  return (
    <aside className="library-sidebar">
      <div className="library-sidebar-filter">
        {(['all', 'active', 'inactive'] as const).map(seg => (
          <button
            key={seg}
            className={`library-sidebar-seg${activeSegment === seg ? ' active' : ''}`}
            onClick={() => onSegmentChange(seg)}
          >
            {seg === 'all' ? 'All' : seg === 'active' ? 'Active' : 'Inactive'}
          </button>
        ))}
      </div>

      <div className="library-sidebar-list">
        {visible.length === 0 && (
          <div className="library-sidebar-empty">No repos</div>
        )}
        {visible.map(({ row, isInstalled }) => (
          <button
            key={row.id}
            className={`library-sidebar-item${selectedId === row.id ? ' selected' : ''}${isInstalled ? ' installed' : ' uninstalled'}`}
            onClick={() => onSelect(row, isInstalled)}
            title={`${row.owner}/${row.name}`}
          >
            <span className="library-sidebar-avatar">
              {row.avatar_url
                ? <img src={row.avatar_url} alt="" />
                : <span className="library-sidebar-avatar-fallback">{(row.name?.[0] ?? '?').toUpperCase()}</span>
              }
            </span>
            <span className="library-sidebar-name">{row.name}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
