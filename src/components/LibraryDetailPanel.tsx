import { useEffect } from 'react'
import { X } from 'lucide-react'

export interface LibraryDetailPanelProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export default function LibraryDetailPanel({ open, onClose, children }: LibraryDetailPanelProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside className={`library-detail-panel${open ? ' open' : ''}`} aria-hidden={!open}>
      <button
        className="library-detail-close-btn"
        onClick={onClose}
        aria-label="Close detail"
      >
        <X size={16} />
      </button>
      {children}
    </aside>
  )
}
