import { getLangConfig } from './BannerSVG'

interface LangBadgeProps {
  lang: string | null
  size?: number
}

export default function LangBadge({ lang, size = 24 }: LangBadgeProps) {
  const cfg = getLangConfig(lang ?? '')
  return (
    <div
      className="lang-badge"
      style={{
        width: size, height: size,
        background: cfg.bg, color: cfg.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, fontSize: Math.max(8, size * 0.4),
        fontWeight: 600, flexShrink: 0,
      }}
    >
      {cfg.abbr}
    </div>
  )
}
