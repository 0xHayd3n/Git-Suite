// ── Website link extraction ───────────────────────────────────────────────────
// Finds all external HTTP links in README content that are NOT social-platform
// or badge URLs. These surface in the Websites tab of the repo detail view.

import { looksLikeBadgeUrl } from './badgeParser'

export interface WebsiteLink {
  url:   string   // full original URL
  label: string   // markdown link text
  host:  string   // hostname with www. stripped, for display
}

// Bare hostnames to exclude — social platforms and hosting infra that belong
// in the Community sidebar or other tabs. Kept separate from SOCIAL_DOMAINS
// in badgeParser because that list contains non-hostname entries (path segments,
// partial prefixes) that are unsuitable for exact hostname matching.
const SKIP_HOSTNAMES = new Set([
  'twitter.com', 'x.com',
  'discord.gg', 'discord.com', 'discordapp.com',
  'slack.com',
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'reddit.com',
  'youtube.com', 'youtu.be',
  'twitch.tv',
  't.me', 'telegram.me', 'telegram.org',
  'bsky.app',
  'github.com',
  'opencollective.com',
  'patreon.com',
  'buymeacoffee.com',
  'ko-fi.com',
  'liberapay.com',
])

// Badge service hostnames — a subset of looksLikeBadgeUrl's BADGE_DOMAINS,
// matched against the extracted hostname so we skip badge-service links
// (e.g. img.shields.io) without triggering the catch-all that would also
// reject legitimate website URLs lacking a file extension.
const BADGE_HOSTNAMES = new Set([
  'shields.io', 'img.shields.io',
  'badgen.net',
  'badge.fury.io',
  'travis-ci.org', 'travis-ci.com',
  'app.circleci.com', 'circleci.com',
  'codecov.io',
  'coveralls.io',
  'pepy.tech',
  'codacy.com',
  'codeclimate.com',
  'sonarcloud.io',
  'snyk.io',
  'forthebadge.com',
  'david-dm.org',
  'greenkeeper.io',
  'depfu.com',
  'requires.io',
  'img.buymeacoffee.com',
  'camo.githubusercontent.com',
  'app.fossa.com',
  'pyup.io',
  'deepsource.io',
])

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Returns true when the URL is from a known badge-image service. */
function isBadgeServiceUrl(url: string, host: string): boolean {
  // Match by extracted hostname first (covers subdomains like img.shields.io)
  if (BADGE_HOSTNAMES.has(host)) return true
  // Fall through to looksLikeBadgeUrl only for URLs that contain "badge" in
  // the path or reference GitHub Actions — looksLikeBadgeUrl is NOT called for
  // plain website URLs because its catch-all would falsely reject them.
  const lower = url.toLowerCase()
  if (lower.includes('badge') || lower.includes('/actions/') || lower.includes('/workflows/')) {
    return looksLikeBadgeUrl(url)
  }
  return false
}

export function extractWebsiteLinks(content: string): WebsiteLink[] {
  const seen:   Set<string>   = new Set()
  const result: WebsiteLink[] = []
  const re = new RegExp(MARKDOWN_LINK_RE.source, MARKDOWN_LINK_RE.flags)

  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const [, label, url] = m

    // Skip anchor links and relative paths
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue

    // Skip malformed URLs and anchor-only fragments
    const host = hostnameOf(url)
    if (!host) continue

    // Skip badge/shield image URLs
    if (isBadgeServiceUrl(url, host)) continue

    // Skip known social and platform hostnames
    if (SKIP_HOSTNAMES.has(host)) continue

    // Skip mastodon instances (hostname contains 'mastodon')
    if (host.includes('mastodon')) continue

    // Deduplicate by hostname — one entry per root domain
    if (seen.has(host)) continue
    seen.add(host)

    result.push({ url, label, host })
  }

  return result
}

/**
 * Strips common markdown formatting from a label string, returning plain text.
 * Designed for README link labels which often contain bold/italic syntax.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // remove images: ![alt](url)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // unwrap links: [text](url) → text
    .replace(/\*\*(.+?)\*\*/g, '$1')                // remove bold: **text**
    .replace(/__(.+?)__/g, '$1')                    // remove bold: __text__
    .replace(/\*(.+?)\*/g, '$1')                    // remove italic: *text*
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')         // remove italic: _text_ (not inside words)
    .replace(/`([^`]+)`/g, '$1')                    // remove inline code: `text`
    .trim()
}
