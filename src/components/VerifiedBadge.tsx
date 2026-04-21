interface Props {
  size?: number      // default 10
  tooltip?: boolean  // default true
}

export default function VerifiedBadge({ size = 10, tooltip = true }: Props) {
  return (
    <span
      title={tooltip ? 'Verified organisation — domain ownership confirmed by GitHub' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--t3)',
        cursor: 'default',
        transition: 'color 0.12s',
        lineHeight: 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="6.5" />
        <polyline points="5.5,8.5 7.2,10.5 10.5,5.5" />
      </svg>
    </span>
  )
}
