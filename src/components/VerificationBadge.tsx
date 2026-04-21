// src/components/VerificationBadge.tsx
import { ShieldCheck, Shield } from 'lucide-react'
import type { CSSProperties } from 'react'

// Inject badge CSS once into the document head (avoids duplicate <style> tags with 30+ badges)
let stylesInjected = false
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const style = document.createElement('style')
  style.dataset.vbStyles = '1'
  style.textContent = `
    @keyframes vbPulse {
      0%, 100% { opacity: 0.3; }
      50%       { opacity: 0.7; }
    }
    .vb-wrap:hover .vb-tooltip { opacity: 1 !important; pointer-events: auto !important; }
  `
  document.head.appendChild(style)
}

type VerificationTier = 'verified' | 'likely' | null

interface Props {
  tier:       VerificationTier
  signals:    string[]
  size?:      'sm' | 'md'
  resolving?: boolean
  variant?:   'badge' | 'icon'
}

const SIGNAL_LABELS: Record<string, string> = {
  registry_match: 'Registry match',
  verified_org:   'Verified organisation',
  homepage_match: 'Homepage domain match',
  self_named:     'Self-named repository',
  dependent_tier: 'High dependent count',
}

export default function VerificationBadge({ tier, signals, size = 'sm', resolving = false, variant = 'badge' }: Props) {
  ensureStyles()

  // Resolving dot — shown while no cached result exists
  if (tier === null && resolving) {
    return (
      <span
        aria-label="Verifying"
        style={{
          display:      'inline-block',
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   'var(--t3)',
          animation:    'vbPulse 1.8s ease-in-out infinite',
          flexShrink:   0,
        }}
      />
    )
  }

  if (tier === null) return null

  const isVerified = tier === 'verified'
  const iconColor  = isVerified ? '#7c3aed' : '#16a34a'

  // Icon-only variant — just the shield with hover tooltip showing classification reason
  if (variant === 'icon') {
    const icoSize = size === 'sm' ? 11 : 15
    return (
      <span
        className="vb-wrap"
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      >
        {isVerified
          ? <ShieldCheck size={icoSize} color={iconColor} fill={iconColor} />
          : <Shield      size={icoSize} color={iconColor} fill={iconColor} />
        }
        {/* Tooltip — CSS-driven visibility via .vb-wrap:hover .vb-tooltip */}
        <span
          className="vb-tooltip"
          style={{
            position:      'absolute',
            bottom:        'calc(100% + 6px)',
            left:          '50%',
            transform:     'translateX(-50%)',
            background:    'var(--bg4)',
            border:        '1px solid var(--border2)',
            borderRadius:  6,
            padding:       '8px 10px',
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      11,
            color:         'var(--t2)',
            whiteSpace:    'nowrap',
            opacity:       0,
            pointerEvents: 'none',
            transition:    'opacity 0.15s',
            zIndex:        100,
          }}
        >
          <div style={{ fontWeight: 600, color: isVerified ? '#7c3aed' : '#16a34a', marginBottom: signals.length > 0 ? 4 : 0 }}>
            {isVerified ? 'Official' : 'Likely Official'}
          </div>
          {signals.map(s => (
            <div key={s}>
              <span style={{ color: '#7c3aed', marginRight: 5 }}>✓</span>
              {SIGNAL_LABELS[s] ?? s}
            </div>
          ))}
        </span>
      </span>
    )
  }

  const iconSize   = size === 'sm' ? 10 : 12
  const padX       = size === 'sm' ? 6  : 8
  const padY       = size === 'sm' ? 2  : 3
  const label      = isVerified ? 'Official' : 'Likely Official'

  const badgeStyle: CSSProperties = {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           4,
    padding:       `${padY}px ${padX}px`,
    borderRadius:  4,
    border:        `1px solid ${isVerified ? 'rgba(124,58,237,0.25)' : 'rgba(22,163,74,0.25)'}`,
    background:    isVerified ? 'rgba(124,58,237,0.12)' : 'rgba(22,163,74,0.12)',
    fontFamily:    'Inter, sans-serif',
    fontSize:      10,
    fontWeight:    500,
    color:         isVerified ? 'var(--t1)' : '#16a34a',
    whiteSpace:    'nowrap',
    cursor:        'default',
    userSelect:    'none',
  }

  return (
    <span className="vb-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span style={badgeStyle}>
        {isVerified
          ? <ShieldCheck size={iconSize} color={iconColor} fill={iconColor} />
          : <Shield      size={iconSize} color={iconColor} fill={iconColor} />
        }
        <span>{label}</span>
      </span>

      {/* Tooltip — CSS-driven visibility via .vb-wrap:hover .vb-tooltip */}
      {signals.length > 0 && (
        <span
          className="vb-tooltip"
          style={{
            position:      'absolute',
            bottom:        'calc(100% + 6px)',
            left:          '50%',
            transform:     'translateX(-50%)',
            background:    'var(--bg4)',
            border:        '1px solid var(--border2)',
            borderRadius:  6,
            padding:       '8px 10px',
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      11,
            color:         'var(--t2)',
            whiteSpace:    'nowrap',
            opacity:       0,
            pointerEvents: 'none',
            transition:    'opacity 0.15s',
            zIndex:        100,
          }}
        >
          {signals.map(s => (
            <div key={s}>
              <span style={{ color: '#7c3aed', marginRight: 5 }}>✓</span>
              {SIGNAL_LABELS[s] ?? s}
            </div>
          ))}
        </span>
      )}
    </span>
  )
}
