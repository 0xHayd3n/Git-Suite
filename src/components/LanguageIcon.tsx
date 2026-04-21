import { LANG_MAP, FALLBACK_COLOR } from '../lib/languages'

interface LanguageIconProps {
  lang: string | null
  size?: number
  /** If true, render the raw coloured icon; if false, use currentColor (for monochrome contexts) */
  coloured?: boolean
  /** If true, render inside a square container with language colour background and white icon */
  boxed?: boolean
}

/**
 * Renders the Simple Icon for a language, or a coloured dot fallback when no icon exists.
 */
export default function LanguageIcon({ lang, size = 12, coloured = true, boxed = false }: LanguageIconProps) {
  if (!lang) return null
  const def = LANG_MAP.get(lang.toLowerCase())
  const color = def?.color ?? FALLBACK_COLOR

  const scale = def?.scale ?? 1

  if (boxed) {
    const boxSize = size + 4
    const iconSize = Math.round(size * 0.75 * scale)
    if (def?.icon) {
      const Icon = def.icon
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: boxSize,
            height: boxSize,
            background: color,
            flexShrink: 0,
            lineHeight: 0,
          }}
        >
          <Icon size={iconSize} color="#fff" />
        </span>
      )
    }
    // Fallback: square with white dot
    const dotSize = Math.round(iconSize * 0.6)
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: boxSize,
          height: boxSize,
          background: color,
          flexShrink: 0,
          lineHeight: 0,
        }}
      >
        <span style={{ display: 'inline-block', width: dotSize, height: dotSize, borderRadius: '50%', background: 'var(--t1)' }} />
      </span>
    )
  }

  if (def?.icon) {
    const Icon = def.icon
    const scaledSize = Math.round(size * scale)
    if (def.doubleLayer) {
      const fg = coloured ? def.color : 'currentColor'
      return (
        <span style={{ position: 'relative', display: 'inline-flex', width: scaledSize, height: scaledSize, flexShrink: 0, lineHeight: 0 }}>
          <Icon size={scaledSize} color={fg} style={{ position: 'absolute', inset: 0 }} />
          <Icon size={scaledSize} color={fg} style={{ position: 'relative' }} />
        </span>
      )
    }
    return (
      <Icon
        size={scaledSize}
        color={coloured ? def.color : 'currentColor'}
      />
    )
  }

  // Fallback: coloured dot
  const dotSize = Math.round(size * 0.7)
  return (
    <span
      style={{
        display: 'inline-block',
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        background: coloured ? color : 'currentColor',
        flexShrink: 0,
      }}
    />
  )
}
