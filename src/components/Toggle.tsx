interface ToggleProps {
  on: boolean
  onChange: (value: boolean) => void
  mini?: boolean
  ariaLabel: string
}

export default function Toggle({ on, onChange, mini = false, ariaLabel }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`lib-toggle${mini ? ' lib-toggle-mini' : ''} ${on ? 'on' : 'off'}`}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
    >
      <div className="lib-toggle-knob" />
    </button>
  )
}
