import { ChevronDown, X } from 'lucide-react'

interface FilterChipProps {
  label: string
  active: boolean
  activeLabel?: string
  activeIcon?: React.ReactNode
  activeColor?: string  // For language-colored chips
  onClick: () => void
  onClear: () => void
}

export default function FilterChip({
  label,
  active,
  activeLabel,
  activeIcon,
  activeColor,
  onClick,
  onClear,
}: FilterChipProps) {
  if (active) {
    const style = activeColor
      ? { background: `${activeColor}33`, borderColor: `${activeColor}66`, color: activeColor }
      : undefined
    return (
      <span className="filter-chip active" style={style}>
        {activeIcon && <span className="filter-chip-icon">{activeIcon}</span>}
        <span className="filter-chip-label" onClick={onClick}>{activeLabel ?? label}</span>
        <span className="filter-chip-x" onClick={e => { e.stopPropagation(); onClear() }}>
          <X size={10} />
        </span>
      </span>
    )
  }

  return (
    <button className="filter-chip" onClick={onClick}>
      {label} <ChevronDown size={10} className="filter-chip-chevron" />
    </button>
  )
}
