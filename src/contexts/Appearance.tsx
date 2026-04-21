import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type BackgroundMode = 'none' | 'dither'

interface AppearanceContextValue {
  background: BackgroundMode
  setBackground: (value: BackgroundMode) => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [background, setBackgroundState] = useState<BackgroundMode>('none')

  useEffect(() => {
    window.api.settings.get('background').then((val: string | null) => {
      if (val === 'dither' || val === 'none') setBackgroundState(val)
    }).catch(() => {})
  }, [])

  const setBackground = (value: BackgroundMode) => {
    setBackgroundState(value)
    window.api.settings.set('background', value).catch(() => {})
  }

  return (
    <AppearanceContext.Provider value={{ background, setBackground }}>
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext)
  if (!ctx) throw new Error('useAppearance must be used inside AppearanceProvider')
  return ctx
}
