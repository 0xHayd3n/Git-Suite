import logoSrc from '../assets/logo.png'
import './DiscoverSidebar.css'

function ReposIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z" />
    </svg>
  )
}

function CollectionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

interface NavRailProps {
  activePanel: 'repos' | 'collections' | null
  onPanelToggle: (panel: 'repos' | 'collections') => void
}

export default function NavRail({ activePanel, onPanelToggle }: NavRailProps) {
  return (
    <div className="sidebar-rail">
      <img src={logoSrc} alt="Git Suite" className="rail-logo" />
      <button
        type="button"
        className={`nav-rail-btn${activePanel === 'repos' ? ' active' : ''}`}
        onClick={() => onPanelToggle('repos')}
        aria-label="Repositories"
        title="Repositories"
      >
        <ReposIcon />
      </button>
      <button
        type="button"
        className={`nav-rail-btn${activePanel === 'collections' ? ' active' : ''}`}
        onClick={() => onPanelToggle('collections')}
        aria-label="Collections"
        title="Collections"
      >
        <CollectionsIcon />
      </button>
    </div>
  )
}
