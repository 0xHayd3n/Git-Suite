import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSearch } from '../contexts/Search'

// ── Nav icons (20×20, filled) ────────────────────────────────────

function DiscoverIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.5 2A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22H20V2H6.5z" />
      <rect x="9" y="7" width="7" height="1.5" rx=".75" fill="rgba(0,0,0,0.35)" />
    </svg>
  )
}

function StarredIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z" />
    </svg>
  )
}

function CreateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  )
}

function AiIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  )
}

// ── Nav items config ──────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Library',  path: '/library',  icon: <LibraryIcon /> },
  { label: 'Projects', path: '/create',   icon: <CreateIcon /> },
  { label: 'Discover', path: '/discover', icon: <DiscoverIcon /> },
  { label: 'Profile',  path: '/profile',  icon: <ProfileIcon /> },
]

// ── Helpers ───────────────────────────────────────────────────────

function getSearchPlaceholder(pathname: string): string {
  if (pathname.startsWith('/discover'))    return 'Search repos…'
  if (pathname.startsWith('/library'))     return 'Filter skills…'
  if (pathname.startsWith('/starred'))     return 'Filter starred…'
  if (pathname.startsWith('/profile'))     return 'Search profile…'
  return 'Search…'
}

function isActive(currentPath: string, itemPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(itemPath + '/')
}

// Map a pathname to its owning tab prefix (so /repo/* counts as /discover)
function getTabPrefix(pathname: string): string | null {
  if (pathname.startsWith('/discover') || pathname.startsWith('/repo/')) return '/discover'
  if (pathname.startsWith('/library'))     return '/library'
  if (pathname.startsWith('/create'))      return '/create'
  if (pathname.startsWith('/profile'))     return '/profile'
  if (pathname.startsWith('/settings'))    return '/settings'
  return null
}

// ── Component ─────────────────────────────────────────────────────

interface DockProps {
  onAiClick: () => void
  aiOpen?: boolean
}

export default function Dock({ onAiClick, aiOpen }: DockProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { query, setQuery, setInputRef } = useSearch()
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const searchBtnRef = useRef<HTMLButtonElement>(null)
  const lastTabPath = useRef<Record<string, string>>({})
  const isOnboarding = location.pathname === '/onboarding'

  useEffect(() => { setInputRef(searchInputRef) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep last visited path per tab so dock clicks restore previous position.
  useEffect(() => {
    const prefix = getTabPrefix(location.pathname)
    if (prefix) lastTabPath.current[prefix] = location.pathname
  }, [location.pathname])

  const handleNavClick = useCallback((tabPath: string) => {
    const saved = lastTabPath.current[tabPath] ?? tabPath
    if (saved !== tabPath) {
      // Push the tab root first so the back button has a valid parent entry,
      // then push the saved sub-path. React 18 batches both before rendering.
      navigate(tabPath)
      navigate(saved)
    } else {
      navigate(saved)
    }
  }, [navigate])

  const toggleSearch = useCallback(() => {
    setSearchOpen(prev => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 50)
      return !prev
    })
  }, [])

  // Close search bar on click outside (but not when clicking the search button)
  useEffect(() => {
    if (!searchOpen) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        searchBarRef.current && !searchBarRef.current.contains(target) &&
        searchBtnRef.current && !searchBtnRef.current.contains(target)
      ) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [searchOpen])

  // Close search on Escape
  useEffect(() => {
    if (!searchOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [searchOpen])

  // Global keyboard shortcut: "/" to focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Close search on navigation
  useEffect(() => {
    setSearchOpen(false)
  }, [location.pathname])

  if (isOnboarding) return null

  return (
    <>
      {/* Floating search bar above dock */}
      <div
        ref={searchBarRef}
        className={`dock-search-floating${searchOpen ? ' open' : ''}`}
      >
        <SearchIcon />
        <input
          ref={searchInputRef}
          className="dock-search-floating-input"
          placeholder={getSearchPlaceholder(location.pathname)}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="dock-search-floating-kbd">/</span>
      </div>

      <nav className={`floating-dock${aiOpen ? ' ai-hidden' : ''}`} role="navigation" aria-label="Main navigation">
        {/* TTS playback bar portals in here when active; collapses when empty */}
        <div id="tts-dock-slot" />

        <div className="dock-items-row">
          {/* Nav items */}
          {NAV_ITEMS.map(({ label, path, icon }) => (
            <button
              key={path}
              type="button"
              className={`dock-item${isActive(location.pathname, path) ? ' dock-item-active' : ''}`}
              onClick={() => handleNavClick(path)}
              aria-label={label}
              title={label}
            >
              {icon}
            </button>
          ))}

          <span className="dock-divider" aria-hidden="true" />

          {/* Settings */}
          <button
            type="button"
            className={`dock-item${location.pathname === '/settings' ? ' dock-item-active' : ''}`}
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon />
          </button>

          {/* Search icon */}
          <button
            ref={searchBtnRef}
            type="button"
            className={`dock-item${searchOpen ? ' dock-item-active' : ''}`}
            onClick={toggleSearch}
            aria-label="Search"
            title="Search"
          >
            <SearchIcon />
          </button>

          {/* AI */}
          <button
            type="button"
            className={`dock-item dock-item-ai${aiOpen ? ' open' : ''}`}
            onClick={onAiClick}
            aria-label="AI Assistant"
            title="AI Assistant"
          >
            <AiIcon />
          </button>
        </div>
      </nav>
    </>
  )
}
