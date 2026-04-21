import { looksLikeBadgeUrl } from './badgeParser'

export type ImageTreatment = 'logo' | 'content'

export interface ImageContext {
  src:               string
  isLinked:          boolean
  nearestHeadingText: string
  declaredWidth?:    number
  declaredHeight?:   number
}

const SPONSOR_HEADING_KEYWORDS = [
  'sponsor', 'backer', 'supporter', 'built with', 'thanks to',
  'made by', 'powered by', 'partner',
]

export function classifyImage(ctx: ImageContext): ImageTreatment {
  // 1. Known badge domain
  if (ctx.src && looksLikeBadgeUrl(ctx.src)) return 'logo'

  // 2. Sponsor/partner heading context
  const heading = ctx.nearestHeadingText.toLowerCase()
  if (SPONSOR_HEADING_KEYWORDS.some(kw => heading.includes(kw))) return 'logo'

  // 4. Declared dimensions: wide-and-short banner/logo
  if (ctx.declaredWidth !== undefined && ctx.declaredHeight !== undefined && ctx.declaredHeight > 0) {
    const ratio = ctx.declaredWidth / ctx.declaredHeight
    if (ratio > 2.5 && ctx.declaredHeight < 120) return 'logo'
  }

  return 'content'
}
