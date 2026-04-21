import type { CollectionRow } from '../types/repo'
import Toggle from './Toggle'

interface CollRowProps {
  coll: CollectionRow
  selected: boolean
  onClick: () => void
  onToggle: () => void
}

export default function CollRow({ coll, selected, onClick, onToggle }: CollRowProps) {
  const missing = coll.repo_count - coll.saved_count
  const metaText = missing > 0
    ? `${coll.repo_count} skills · ${missing} missing`
    : `${coll.repo_count} skills · all saved`

  const emojis = ['📦', '🔧', '⚡', '🚀', '🌐', '🎨', '🔬', '🛡️', '🌿', '🎯']
  const hash = coll.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const emoji = emojis[hash % emojis.length]
  const badgeBg = coll.color_start ? `${coll.color_start}22` : 'rgba(100,100,100,0.15)'

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={`coll-row${selected ? ' selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="coll-strip"
        style={{
          background: `linear-gradient(to right, ${coll.color_start ?? 'var(--bg3)'}, ${coll.color_end ?? 'var(--bg4)'})`,
        }}
      />
      <div className="coll-row-inner">
        <div className="coll-row-top">
          <div className="coll-emoji-badge" style={{ background: badgeBg }}>{emoji}</div>
          <span className="coll-row-name">{coll.name}</span>
          <Toggle on={coll.active === 1} onChange={() => onToggle()} ariaLabel={`Toggle ${coll.name} active`} />
        </div>
        <div className={`coll-row-meta${missing > 0 ? ' has-missing' : ''}`}>{metaText}</div>
        {coll.owner !== 'user' && (
          <div className="coll-row-tags">
            <span className="coll-tag">{coll.owner}</span>
          </div>
        )}
      </div>
    </div>
  )
}
