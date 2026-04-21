// ── Badge extraction utility ────────────────────────────────────────────────
// Scans the README preamble (everything before the first ## heading) for
// badge images and social links, extracts + classifies them, and returns a
// cleaned content string with those lines removed.

export type BadgeCategory = 'package' | 'quality' | 'social' | 'badge'

export interface ParsedBadge {
  alt:      string
  imgUrl:   string | null   // null = prose link only (no image)
  linkUrl:  string | null
  category: BadgeCategory
}

export interface BadgeExtractionResult {
  badges:  ParsedBadge[]
  cleaned: string
}

// ── Classification keyword lists ──────────────────────────────────────────

const SOCIAL_DOMAINS = [
  'twitter.com', 'x.com', 'discord.gg', 'discord.com', 'slack.com',
  'instagram.com', 'facebook.com', 'linkedin.com', 'reddit.com',
  'youtube.com', 'twitch.tv', 't.me', 'telegram.me', 'telegram.org',
  'mastodon.', 'bsky.app', 'github.com/sponsors', 'opencollective.com',
  'patreon.com', 'buymeacoffee.com', 'ko-fi.com', 'liberapay.com',
]

const SOCIAL_ALT_KEYWORDS = [
  'twitter', 'discord', 'slack', 'follow', 'sponsor', 'chat', 'community',
  'instagram', 'facebook', 'linkedin', 'reddit', 'youtube', 'twitch',
  'telegram', 'mastodon', 'bluesky', 'patreon', 'donate', 'ko-fi', 'kofi',
]

const PACKAGE_KEYWORDS = [
  'npm', 'version', 'downloads', 'pypi', 'gem', 'crate', 'nuget',
  'packagist', 'release', 'latest', 'maven', 'gradle', 'composer',
  'pub.dev', 'hackage', 'hex.pm', 'cargo',
]

const QUALITY_KEYWORDS = [
  'build', ' ci', 'test', 'coverage', 'codecov', 'coveralls',
  'passing', 'failing', 'workflow', 'action', 'lint', 'sonar',
  'status', 'checks', 'pipeline', 'travis', 'circleci', 'appveyor',
  'codacy', 'codeclimate', 'snyk', 'deepscan', 'vulnerability', 'security',
]

// Badge image services — used to filter out screenshots / logos
export const BADGE_DOMAINS = [
  'shields.io', 'badgen.net', 'badge.fury.io',
  'travis-ci.org', 'travis-ci.com',
  'circleci.com', 'codecov.io', 'coveralls.io',
  'pepy.tech', 'codacy.com', 'codeclimate.com',
  'sonarcloud.io', 'snyk.io', 'forthebadge.com',
  'david-dm.org', 'greenkeeper.io', 'depfu.com',
  'requires.io', 'img.buymeacoffee.com',
  'camo.githubusercontent.com',
  'opencollective.com',   // backers / sponsors stats
  'liberapay.com',         // donation badges
  'app.fossa.com',         // licence scan badges
  'pyup.io',               // Python dependency badges
  'deepsource.io',         // code quality badges
  'img.shields.io',        // explicit shields subdomain
]

export function looksLikeBadgeUrl(url: string): boolean {
  const lower = url.toLowerCase()
  // Known badge service domains — always accept regardless of extension
  if (BADGE_DOMAINS.some(d => lower.includes(d))) return true
  // URL path explicitly references "badge" or a GitHub Actions workflow
  if (lower.includes('badge') || lower.includes('/actions/') || lower.includes('/workflows/')) return true
  // Reject obvious raster/vector images that are NOT from badge services.
  // SVGs without a known badge domain are typically logos, hero images, etc.
  if (/\.(png|jpg|jpeg|gif|webp|ico|svg)(\?.*)?$/.test(lower)) return false
  // Anything else (e.g. a dynamic JSON/text endpoint) is probably a badge
  return true
}

function classifyBadge(alt: string, imgUrl: string | null, linkUrl: string | null): BadgeCategory {
  const hay = `${alt} ${imgUrl ?? ''} ${linkUrl ?? ''}`.toLowerCase()

  // Social — link domain check first (highest precision)
  if (linkUrl) {
    const lnk = linkUrl.toLowerCase()
    if (SOCIAL_DOMAINS.some(d => lnk.includes(d))) return 'social'
  }
  if (SOCIAL_ALT_KEYWORDS.some(k => hay.includes(k))) return 'social'

  if (PACKAGE_KEYWORDS.some(k => hay.includes(k))) return 'package'
  if (QUALITY_KEYWORDS.some(k => hay.includes(k)))  return 'quality'

  return 'badge'
}

// ── Line-level helpers ─────────────────────────────────────────────────────

// Returns true if, after stripping known badge/img markup, only
// whitespace + separators remain.  Table rows are excluded.
function isEmptyAfterBadgeRemoval(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (t.startsWith('|')) return false   // table row — leave alone

  let s = t

  // HTML linked: <a href="..."><img src="..." .../></a>
  s = s.replace(
    /<a[^>]+href="([^"]*)"[^>]*>\s*<img[^>]+src="([^"]*)"[^>]*\/?>\s*<\/a>/gi,
    (match, _link, src) => looksLikeBadgeUrl(src) ? '' : match,
  )
  // Linked MD badge: [![alt](img)](link)
  s = s.replace(
    /\[!\[[^\]]*\]\(([^)]+)\)\]\([^)]+\)/g,
    (match, src) => looksLikeBadgeUrl(src) ? '' : match,
  )
  // Standalone MD image: ![alt](img)
  s = s.replace(
    /!\[[^\]]*\]\(([^)]+)\)/g,
    (match, src) => looksLikeBadgeUrl(src) ? '' : match,
  )
  // Standalone HTML img
  s = s.replace(
    /<img[^>]+src="([^"]*)"[^>]*\/?>/gi,
    (match, src) => looksLikeBadgeUrl(src) ? '' : match,
  )
  // Strip HTML wrapper tags + entities
  s = s.replace(/<\/?(p|div|center|br|span|a)[^>]*>/gi, '')
  s = s.replace(/&[a-z]+;/gi, ' ')

  s = s.trim()
  return s === '' || /^[|\s·\-—\n\r]+$/.test(s)
}

// Extracts all badge/image entries from a single line (consumes patterns
// left-to-right so nothing is double-counted).
function extractBadgesFromLine(line: string): ParsedBadge[] {
  const badges: ParsedBadge[] = []
  let s = line

  // 1. HTML linked — try alt-before-src and alt-after-src attribute orders
  s = s.replace(
    /<a[^>]+href="([^"]*)"[^>]*>\s*<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>\s*<\/a>/gi,
    (_, linkUrl, imgUrl, alt) => {
      if (looksLikeBadgeUrl(imgUrl))
        badges.push({ alt, imgUrl, linkUrl, category: classifyBadge(alt, imgUrl, linkUrl) })
      return ''
    },
  )
  s = s.replace(
    /<a[^>]+href="([^"]*)"[^>]*>\s*<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>\s*<\/a>/gi,
    (_, linkUrl, alt, imgUrl) => {
      if (looksLikeBadgeUrl(imgUrl))
        badges.push({ alt, imgUrl, linkUrl, category: classifyBadge(alt, imgUrl, linkUrl) })
      return ''
    },
  )
  // HTML linked without alt attribute
  s = s.replace(
    /<a[^>]+href="([^"]*)"[^>]*>\s*<img[^>]+src="([^"]*)"[^>]*\/?>\s*<\/a>/gi,
    (_, linkUrl, imgUrl) => {
      if (looksLikeBadgeUrl(imgUrl))
        badges.push({ alt: '', imgUrl, linkUrl, category: classifyBadge('', imgUrl, linkUrl) })
      return ''
    },
  )

  // 2. Linked MD badge: [![alt](img)](link)
  s = s.replace(
    /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g,
    (_, alt, imgUrl, linkUrl) => {
      if (looksLikeBadgeUrl(imgUrl))
        badges.push({ alt, imgUrl, linkUrl, category: classifyBadge(alt, imgUrl, linkUrl) })
      return ''
    },
  )

  // 3. Standalone MD image — skip if char before ! is ] (was inside linked badge)
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, imgUrl, offset, str) => {
      const prev = str[offset - 1]
      if (prev === '[') return match   // part of a linked badge, already handled
      if (looksLikeBadgeUrl(imgUrl))
        badges.push({ alt, imgUrl, linkUrl: null, category: classifyBadge(alt, imgUrl, null) })
      return ''
    },
  )

  // 4. Standalone HTML img
  s = s.replace(
    /<img[^>]+src="([^"]*)"[^>]*\/?>/gi,
    (_, imgUrl) => {
      if (looksLikeBadgeUrl(imgUrl))
        badges.push({ alt: '', imgUrl, linkUrl: null, category: classifyBadge('', imgUrl, null) })
      return ''
    },
  )

  return badges
}

// ── Derive display label for a social link (used as tooltip) ─────────────

/** Extract bare hostname (no www., lowercased) from a URL string. Returns '' on failure. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function getSocialPlatform(linkUrl: string | null): string | null {
  if (!linkUrl) return null
  const h = hostnameOf(linkUrl)
  if (!h) return null

  if (h === 'twitter.com' || h === 'x.com')                            return 'twitter'
  if (h === 'discord.gg'  || h === 'discord.com' || h === 'discordapp.com') return 'discord'
  if (h === 'slack.com')                                                return 'slack'
  if (h === 'telegram.org' || h === 't.me' || h === 'telegram.me')     return 'telegram'
  if (h === 'reddit.com')                                               return 'reddit'
  if (h === 'youtube.com' || h === 'youtu.be')                         return 'youtube'
  if (h === 'twitch.tv')                                                return 'twitch'
  if (h === 'linkedin.com')                                             return 'linkedin'
  if (h === 'instagram.com')                                            return 'instagram'
  if (h === 'facebook.com')                                             return 'facebook'
  if (h === 'patreon.com')                                              return 'patreon'
  if (h.includes('mastodon'))                                           return 'mastodon'
  if (h === 'bsky.app')                                                 return 'bluesky'
  if (h === 'opencollective.com')                                       return 'opencollective'
  if (h === 'ko-fi.com' || h === 'buymeacoffee.com')                   return 'donate'
  if (h === 'github.com' && linkUrl.toLowerCase().includes('/sponsors')) return 'sponsor'
  return null
}

export const PLATFORM_LABELS: Record<string, string> = {
  twitter:       'Twitter / X',
  discord:       'Discord',
  slack:         'Slack',
  telegram:      'Telegram',
  reddit:        'Reddit',
  youtube:       'YouTube',
  twitch:        'Twitch',
  linkedin:      'LinkedIn',
  instagram:     'Instagram',
  facebook:      'Facebook',
  patreon:       'Patreon',
  mastodon:      'Mastodon',
  bluesky:       'Bluesky',
  opencollective:'Open Collective',
  donate:        'Donate',
  sponsor:       'Sponsor',
}

// ── Badge text extraction (for themed pill rendering) ─────────────────────
// Parses a badge's image URL to extract a human-readable { label, value }
// pair so the UI can render a themed pill instead of a raw badge image.

export function getBadgeText(badge: ParsedBadge): { label: string; value: string } {
  const url   = badge.imgUrl ?? ''
  const alt   = badge.alt   ?? ''

  if (url) {
    // ── shields.io static: /badge/LABEL-MESSAGE-COLOR ────────────────────
    const shieldsStatic = url.match(/shields\.io\/badge\/([^?&#/]+)/i)
    if (shieldsStatic) {
      const raw     = decodeURIComponent(shieldsStatic[1])
      // Replace double-hyphen (escaped literal hyphen) with placeholder
      const escaped = raw.replace(/--/g, '\x00')
      const parts   = escaped
        .split('-')
        .map(p => p.replace(/\x00/g, '-').replace(/_/g, ' ').trim())
        .filter(Boolean)

      if (parts.length >= 3) {
        // label – message – color  →  drop color (last)
        return { label: parts[0], value: parts.slice(1, -1).join(' ') }
      }
      if (parts.length === 2) {
        // message – color  →  just value, no label
        return { label: '', value: parts[0] }
      }
      return { label: '', value: parts[0] ?? alt }
    }

    // ── badgen.net: /badge/{label}/{status}[/{color}] ────────────────────
    const badgen = url.match(/badgen\.net\/badge\/([^/?&#]+)\/([^/?&#]+)/i)
    if (badgen) {
      return {
        label: decodeURIComponent(badgen[1]).replace(/_/g, ' '),
        value: decodeURIComponent(badgen[2]).replace(/_/g, ' '),
      }
    }

    // ── GitHub Actions workflow badge ────────────────────────────────────
    const actions = url.match(/\/workflows\/([^/]+)\/badge\.svg/i)
    if (actions) {
      return { label: 'CI', value: decodeURIComponent(actions[1]).replace(/_/g, ' ') }
    }

    // ── Known dynamic shields.io types — use alt as value ────────────────
    if (url.includes('shields.io/npm/v/')) return { label: 'npm', value: alt }
    if (url.includes('shields.io/npm/dm/') || url.includes('shields.io/npm/dw/'))
      return { label: 'downloads', value: alt }
    if (url.includes('codecov.io'))  return { label: 'coverage', value: alt }
    if (url.includes('coveralls.io')) return { label: 'coverage', value: alt }
    if (url.includes('travis-ci'))   return { label: 'build', value: alt || 'status' }
    if (url.includes('circleci.com')) return { label: 'build', value: alt || 'status' }

    // ── Generic shields.io dynamic — use alt ─────────────────────────────
    if (url.includes('shields.io') && alt) return { label: '', value: alt }
  }

  // ── Final fallback: alt text ──────────────────────────────────────────
  return { label: '', value: alt || '?' }
}

// ── Main export ────────────────────────────────────────────────────────────

export function extractBadges(content: string): BadgeExtractionResult {
  if (!content) return { badges: [], cleaned: content }

  const lines = content.split('\n')
  const badges: ParsedBadge[] = []
  const badgeLineIndices = new Set<number>()

  // ── Find preamble boundary (first ## heading or setext underline) ───────
  let boundary = lines.length
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    // ATX heading H2+, or setext underline (=== or ---) only when preceded by text
    if (/^#{2,}\s/.test(t)) { boundary = i; break }
    if (/^={3,}$/.test(t) && i > 0 && lines[i - 1].trim()) { boundary = i - 1; break }
    if (/^-{3,}$/.test(t) && i > 0 && lines[i - 1].trim()) { boundary = i - 1; break }
  }

  // ── Scan preamble for badge lines ────────────────────────────────────────
  for (let i = 0; i < boundary; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    if (isEmptyAfterBadgeRemoval(line)) {
      const lineBadges = extractBadgesFromLine(line.trim())
      if (lineBadges.length > 0) {
        badges.push(...lineBadges)
        badgeLineIndices.add(i)
      }
    }
  }

  // ── Scan preamble for social prose links (supplement social badges) ─────
  // Restricted to the preamble (same boundary as badge scan) so that inline
  // social links in the body (e.g. per-project Discord links in an awesome-list)
  // do not flood the Community sidebar.
  const preamble = lines.slice(0, boundary).join('\n')
  const SOCIAL_DOMAIN_RE = new RegExp(
    SOCIAL_DOMAINS.map(d => d.replace(/\./g, '\\.').replace(/\//g, '\\/')).join('|'),
    'i',
  )
  // Markdown prose links: [text](url)
  const proseLinkRe = /\[([^\]]{1,40})\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = proseLinkRe.exec(preamble)) !== null) {
    const [, text, url] = m
    if (!SOCIAL_DOMAIN_RE.test(url)) continue
    const alreadyCaptured = badges.some(b => b.linkUrl === url)
    if (!alreadyCaptured) {
      badges.push({ alt: text, imgUrl: null, linkUrl: url, category: 'social' })
    }
  }

  // HTML anchor links: <a href="url">text</a>
  // Many READMEs (e.g. awesome) use HTML anchors in the preamble nav rather
  // than markdown links, so we need to scan for those too.
  const proseHtmlRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{1,60})<\/a>/gi
  while ((m = proseHtmlRe.exec(preamble)) !== null) {
    const [, url, text] = m
    if (!SOCIAL_DOMAIN_RE.test(url)) continue
    const alreadyCaptured = badges.some(b => b.linkUrl === url)
    if (!alreadyCaptured) {
      badges.push({ alt: text.trim(), imgUrl: null, linkUrl: url, category: 'social' })
    }
  }

  // ── Build cleaned content ─────────────────────────────────────────────────
  // IMPORTANT: filter (not map-to-empty) so badge lines are fully removed.
  // Replacing with '' creates blank lines inside HTML blocks, which terminates
  // CommonMark type-6 HTML blocks prematurely — causing subsequent tags like
  // <sub>, </div>, <a href="…"> to appear as literal text rather than HTML.
  const cleanedLines = lines.filter((_, i) => !badgeLineIndices.has(i))
  // Collapse runs of 3+ blank lines (from the original content) to 2
  const cleaned = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n')

  return { badges, cleaned }
}
