import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
  exiting?: boolean
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    timersRef.current.delete(id)
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 200)
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++
    setToasts(prev => {
      const next = [...prev, { id, message, type }]
      // Max 3 visible — dismiss oldest
      if (next.length > 3) {
        const oldest = next.shift()!
        const oldTimer = timersRef.current.get(oldest.id)
        if (oldTimer) { clearTimeout(oldTimer); timersRef.current.delete(oldest.id) }
      }
      return next
    })
    // Per-toast timer — no duplicate timers on re-render
    const delay = type === 'error' ? 5000 : 3000
    timersRef.current.set(id, setTimeout(() => dismiss(id), delay))
  }, [dismiss])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast--${t.type}${t.exiting ? ' toast--exit' : ''}`}>
              <span className="toast-message">{t.message}</span>
              <button className="toast-dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                ✕
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}
