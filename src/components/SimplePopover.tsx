import { useEffect, useRef } from 'react'

export interface PopoverOption {
  label: string
  value: string | number | undefined
  icon?: React.ReactNode
}

interface SimplePopoverProps {
  options: PopoverOption[]
  value: string | number | undefined
  onSelect: (value: string | number | undefined) => void
  onClose: () => void
  multiSelect?: boolean
  selectedValues?: Set<string>
  onToggle?: (value: string) => void
}

export default function SimplePopover({
  options,
  value,
  onSelect,
  onClose,
  multiSelect,
  selectedValues,
  onToggle,
}: SimplePopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div className="filter-popover" ref={ref}>
      {options.map(opt => {
        const isActive = multiSelect
          ? selectedValues?.has(String(opt.value))
          : opt.value === value
        return (
          <button
            key={String(opt.value ?? 'any')}
            className={`filter-popover-option${isActive ? ' active' : ''}`}
            onClick={() => {
              if (multiSelect && onToggle) {
                onToggle(String(opt.value))
              } else {
                onSelect(opt.value)
                onClose()
              }
            }}
          >
            {opt.icon && <span className="filter-popover-option-icon">{opt.icon}</span>}
            <span>{opt.label}</span>
            {isActive && <span className="filter-popover-check">✓</span>}
          </button>
        )
      })}
    </div>
  )
}
