import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface ProfileState {
  isOpen: boolean
  stack: string[]
  currentUsername: string
}

interface ProfileOverlayContextValue {
  profileState: ProfileState
  openProfile:  (username: string) => void
  pushProfile:  (username: string) => void
  popProfile:   () => void
  closeProfile: () => void
  setStackAt:   (index: number, username: string) => void
}

const ProfileOverlayContext = createContext<ProfileOverlayContextValue | null>(null)

const CLOSED: ProfileState = { isOpen: false, stack: [], currentUsername: '' }

export function ProfileOverlayProvider({ children }: { children: ReactNode }) {
  const [profileState, setProfileState] = useState<ProfileState>(CLOSED)

  const openProfile = useCallback((username: string) => {
    setProfileState({ isOpen: true, stack: [username], currentUsername: username })
  }, [])

  const pushProfile = useCallback((username: string) => {
    setProfileState(prev => {
      const stack = [...prev.stack, username]
      return { isOpen: true, stack, currentUsername: username }
    })
  }, [])

  const popProfile = useCallback(() => {
    setProfileState(prev => {
      const stack = prev.stack.slice(0, -1)
      if (stack.length === 0) return CLOSED
      return { isOpen: true, stack, currentUsername: stack[stack.length - 1] }
    })
  }, [])

  const closeProfile = useCallback(() => setProfileState(CLOSED), [])

  const setStackAt = useCallback((index: number, username: string) => {
    setProfileState(prev => {
      const stack = prev.stack.slice(0, index + 1)
      return { isOpen: true, stack, currentUsername: username }
    })
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeProfile() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeProfile])

  return (
    <ProfileOverlayContext.Provider value={{ profileState, openProfile, pushProfile, popProfile, closeProfile, setStackAt }}>
      {children}
    </ProfileOverlayContext.Provider>
  )
}

export function useProfileOverlay() {
  const ctx = useContext(ProfileOverlayContext)
  if (!ctx) throw new Error('useProfileOverlay must be used inside ProfileOverlayProvider')
  return ctx
}
