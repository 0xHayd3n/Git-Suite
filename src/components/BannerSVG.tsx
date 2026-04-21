export interface BannerSVGProps {
  owner: string
  name: string
  typeBucket: string | null
  size: 'card' | 'detail'
}

// ── Language configuration ───────────────────────────────────────
export interface LangConfig {
  bg: string
  primary: string
  secondary: string
  abbr: string
}

// 16-color palette — each visually distinct, used as fallback when no avatar colour is available
const PALETTE: Omit<LangConfig, 'abbr'>[] = [
  { bg: '#f0f8fb', primary: 'hsl(193,30%,72%)', secondary: 'hsl(193,25%,80%)' },  //  0 cyan
  { bg: '#f5f2fa', primary: 'hsl(261,30%,72%)', secondary: 'hsl(261,25%,80%)' },  //  1 purple
  { bg: '#faf8f0', primary: 'hsl(48,30%,72%)',  secondary: 'hsl(48,25%,80%)' },   //  2 yellow
  { bg: '#faf2f2', primary: 'hsl(0,30%,72%)',   secondary: 'hsl(0,25%,80%)' },    //  3 red
  { bg: '#f0faf3', primary: 'hsl(142,30%,72%)', secondary: 'hsl(142,25%,80%)' },  //  4 green
  { bg: '#f0f6fa', primary: 'hsl(199,30%,72%)', secondary: 'hsl(199,25%,80%)' },  //  5 sky
  { bg: '#faf4f0', primary: 'hsl(24,30%,72%)',  secondary: 'hsl(24,25%,80%)' },   //  6 orange
  { bg: '#faf0f5', primary: 'hsl(322,30%,72%)', secondary: 'hsl(322,25%,80%)' },  //  7 pink
  { bg: '#f2f2fa', primary: 'hsl(235,30%,72%)', secondary: 'hsl(235,25%,80%)' },  //  8 indigo
  { bg: '#f0faf6', primary: 'hsl(160,30%,72%)', secondary: 'hsl(160,25%,80%)' },  //  9 emerald
  { bg: '#faf6f0', primary: 'hsl(43,30%,72%)',  secondary: 'hsl(43,25%,80%)' },   // 10 amber
  { bg: '#f8f0fa', primary: 'hsl(293,30%,72%)', secondary: 'hsl(293,25%,80%)' },  // 11 fuchsia
  { bg: '#f0fafa', primary: 'hsl(174,30%,72%)', secondary: 'hsl(174,25%,80%)' },  // 12 teal
  { bg: '#faf3f0', primary: 'hsl(16,30%,72%)',  secondary: 'hsl(16,25%,80%)' },   // 13 coral
  { bg: '#f2f4fa', primary: 'hsl(213,30%,72%)', secondary: 'hsl(213,25%,80%)' },  // 14 blue
  { bg: '#f5f2fa', primary: 'hsl(277,30%,72%)', secondary: 'hsl(277,25%,80%)' },  // 15 violet
]

// ── Seeded hash ──────────────────────────────────────────────────
function djb2(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
  return h
}

export function getLangConfig(language: string): LangConfig {
  const seed = djb2(language)
  const col = PALETTE[seed % PALETTE.length]
  const abbr = language ? language.slice(0, 2) : '—'
  return { ...col, abbr }
}

// ── Main component ────────────────────────────────────────────────
export default function BannerSVG({ size }: BannerSVGProps) {
  const [w, h] = size === 'card' ? [260, 72] : [500, 175]

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={w} height={h} fill="#f5f5f7" />
    </svg>
  )
}
