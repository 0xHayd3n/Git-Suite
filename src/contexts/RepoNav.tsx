import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface RepoNavState {
  /** Currently active tab in RepoDetail (null when not on a repo page) */
  activeTab: string | null
  /** Current file path within FilesTab (empty string = root, null = not in files) */
  filePath: string | null
  /** Whether the current selection is a directory (for icon rendering) */
  isDirectory: boolean
  /** Callbacks for NavBar to trigger navigation in RepoDetail/FilesTab */
  onTabClick: ((tab: string) => void) | null
  onFilePathClick: ((path: string) => void) | null
  /** File nav actions for NavBar to call */
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: (() => void) | null
  onGoForward: (() => void) | null
}

interface RepoNavAPI {
  state: RepoNavState
  setActiveTab: (tab: string | null) => void
  setFilePath: (path: string | null) => void
  setIsDirectory: (isDir: boolean) => void
  setOnTabClick: (fn: ((tab: string) => void) | null) => void
  setOnFilePathClick: (fn: ((path: string) => void) | null) => void
  setFileNav: (nav: { canGoBack: boolean; canGoForward: boolean; onGoBack: () => void; onGoForward: () => void } | null) => void
}

const defaultState: RepoNavState = {
  activeTab: null,
  filePath: null,
  isDirectory: true,
  onTabClick: null,
  onFilePathClick: null,
  canGoBack: false,
  canGoForward: false,
  onGoBack: null,
  onGoForward: null,
}

const RepoNavContext = createContext<RepoNavAPI>({
  state: defaultState,
  setActiveTab: () => {},
  setFilePath: () => {},
  setIsDirectory: () => {},
  setOnTabClick: () => {},
  setOnFilePathClick: () => {},
  setFileNav: () => {},
})

export function RepoNavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RepoNavState>(defaultState)

  const setActiveTab = useCallback((tab: string | null) => {
    setState(prev => ({ ...prev, activeTab: tab }))
  }, [])

  const setFilePath = useCallback((path: string | null) => {
    setState(prev => ({ ...prev, filePath: path }))
  }, [])

  const setIsDirectory = useCallback((isDir: boolean) => {
    setState(prev => ({ ...prev, isDirectory: isDir }))
  }, [])

  const setOnTabClick = useCallback((fn: ((tab: string) => void) | null) => {
    setState(prev => ({ ...prev, onTabClick: fn }))
  }, [])

  const setOnFilePathClick = useCallback((fn: ((path: string) => void) | null) => {
    setState(prev => ({ ...prev, onFilePathClick: fn }))
  }, [])

  const setFileNav = useCallback((nav: { canGoBack: boolean; canGoForward: boolean; onGoBack: () => void; onGoForward: () => void } | null) => {
    setState(prev => ({
      ...prev,
      canGoBack: nav?.canGoBack ?? false,
      canGoForward: nav?.canGoForward ?? false,
      onGoBack: nav?.onGoBack ?? null,
      onGoForward: nav?.onGoForward ?? null,
    }))
  }, [])

  return (
    <RepoNavContext.Provider value={{ state, setActiveTab, setFilePath, setIsDirectory, setOnTabClick, setOnFilePathClick, setFileNav }}>
      {children}
    </RepoNavContext.Provider>
  )
}

export function useRepoNav() {
  return useContext(RepoNavContext)
}
