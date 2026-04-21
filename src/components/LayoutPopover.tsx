import { useEffect, useRef } from 'react'
import type { LayoutPrefs, ListDensity } from './LayoutDropdown'

interface LayoutPopoverProps {
  prefs: LayoutPrefs
  onChange: (prefs: LayoutPrefs) => void
  onClose: () => void
}

export default function LayoutPopover({ prefs, onChange, onClose }: LayoutPopoverProps) {
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

  const setColumns = (columns: number) => onChange({ ...prefs, columns })
  const setDensity = (density: ListDensity) => onChange({ ...prefs, density })
  const toggleField = (field: keyof typeof prefs.fields) =>
    onChange({ ...prefs, fields: { ...prefs.fields, [field]: !prefs.fields[field] } })

  return (
    <div className="layout-popover" ref={ref}>
      {prefs.mode === 'grid' ? (
        <>
          <div className="layout-popover-label">Columns</div>
          <div className="layout-popover-row">
            {[4, 5, 6, 7, 8].map(n => (
              <button
                key={n}
                className={`layout-column-btn${prefs.columns === n ? ' active' : ''}`}
                onClick={() => setColumns(n)}
              >{n}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="layout-popover-label">Density</div>
          <div className="layout-popover-row">
            <button
              className={`layout-segment-btn${prefs.density === 'compact' ? ' active' : ''}`}
              onClick={() => setDensity('compact')}
            >Compact</button>
            <button
              className={`layout-segment-btn${prefs.density === 'comfortable' ? ' active' : ''}`}
              onClick={() => setDensity('comfortable')}
            >Comfortable</button>
          </div>
          <div className="layout-popover-label">Show</div>
          {(['description', 'tags', 'stats', 'type', 'verification'] as const).map(field => (
            <label key={field} className="layout-field-row">
              <input
                type="checkbox"
                checked={prefs.fields[field]}
                onChange={() => toggleField(field)}
              />
              {field.charAt(0).toUpperCase() + field.slice(1)}
            </label>
          ))}
        </>
      )}
    </div>
  )
}
