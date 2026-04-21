import { createPortal } from 'react-dom'

/**
 * Window controls are portalled to document.body so they live outside every
 * stacking context in the app.  This guarantees they are always clickable
 * regardless of z-index changes elsewhere (sidebar, modals, overlays, etc.).
 *
 * The <header className="titlebar"> remains in-tree purely as a drag region
 * and layout spacer; it never renders the buttons itself.
 */
export default function Titlebar() {
  const { minimize, maximize, close } = window.api.windowControls

  return (
    <>
      <header className="titlebar">
        <div className="titlebar-left" />
      </header>
      {createPortal(
        <div className="titlebar-controls">
          <button
            data-testid="ctrl-minimize"
            className="titlebar-ctrl"
            onClick={minimize}
            aria-label="Minimize"
            title="Minimize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            data-testid="ctrl-maximize"
            className="titlebar-ctrl"
            onClick={maximize}
            aria-label="Maximize"
            title="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            data-testid="ctrl-close"
            className="titlebar-ctrl titlebar-ctrl-close"
            onClick={close}
            aria-label="Close"
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
