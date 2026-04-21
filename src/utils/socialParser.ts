// ── Social post / profile link extraction ────────────────────────────────────
// Finds Twitter/X, Facebook and LinkedIn profile + post URLs in README content.

export type SocialPlatform = 'twitter' | 'facebook' | 'linkedin'

export interface SocialPostLink {
  platform:  SocialPlatform
  url:       string
  handle:    string | null   // @username, company name, etc.
  postType:  string          // 'Profile' | 'Tweet' | 'Page' | 'Post' | 'Group' | …
}

// ── Per-platform parsers ──────────────────────────────────────────────────────

function parseTwitter(url: string): Pick<SocialPostLink, 'handle' | 'postType'> | null {
  try {
    const u    = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (!parts.length) return null
    const first = parts[0].toLowerCase()
    // Skip utility paths
    if (['hashtag', 'search', 'intent', 'share', 'i', 'home', 'explore', 'notifications'].includes(first)) return null
    const isStatus = parts[1]?.toLowerCase() === 'status'
    return {
      handle:   '@' + parts[0],
      postType: isStatus ? 'Tweet' : 'Profile',
    }
  } catch { return null }
}

function parseFacebook(url: string): Pick<SocialPostLink, 'handle' | 'postType'> | null {
  try {
    const u    = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (!parts.length) return null
    const first = parts[0].toLowerCase()
    // Skip utility / sharing paths
    if (['sharer', 'share', 'dialog', 'login', 'help', 'policies', 'legal', 'about'].includes(first)) return null
    if (first === 'groups') return parts[1] ? { handle: parts[1].replace(/-/g, ' '), postType: 'Group' } : null
    if (first === 'pages')  return parts[1] ? { handle: parts[1].replace(/-/g, ' '), postType: 'Page'  } : null
    if (first === 'events') return { handle: null, postType: 'Event' }
    // Treat as a profile / page
    return { handle: parts[0], postType: 'Page' }
  } catch { return null }
}

function parseLinkedIn(url: string): Pick<SocialPostLink, 'handle' | 'postType'> | null {
  try {
    const u    = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (!parts.length) return null
    const first = parts[0].toLowerCase()
    if (first === 'in')      return { handle: parts[1] ?? null, postType: 'Profile' }
    if (first === 'company') return { handle: (parts[1] ?? '').replace(/-/g, ' ') || null, postType: 'Company' }
    if (first === 'posts' || first === 'pulse' || first === 'feed') return { handle: null, postType: 'Post' }
    if (first === 'school')  return { handle: parts[1] ?? null, postType: 'School' }
    // Skip: login, signup, feed, etc.
    return null
  } catch { return null }
}

// ── Main extraction ───────────────────────────────────────────────────────────

const SOCIAL_URL_RE =
  /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|facebook\.com|linkedin\.com)\/[^\s)"'<>\]\[]+/gi

// postType values that represent identity/profile pages rather than content.
// These belong in the sidebar Community section (via badgeParser), not the Posts tab.
const PROFILE_POST_TYPES = new Set(['Profile', 'Page', 'Company'])

export function extractSocialPosts(content: string): SocialPostLink[] {
  const seen  = new Set<string>()
  const posts: SocialPostLink[] = []
  const re    = new RegExp(SOCIAL_URL_RE.source, SOCIAL_URL_RE.flags)

  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    // Strip trailing markdown/punctuation artefacts
    const url = m[0].replace(/[.,;:!?)\]]+$/, '')
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    let platform: SocialPlatform
    let parsed:   Pick<SocialPostLink, 'handle' | 'postType'> | null

    if (/(?:twitter\.com|x\.com)/i.test(url)) {
      platform = 'twitter'
      parsed   = parseTwitter(url)
    } else if (/facebook\.com/i.test(url)) {
      platform = 'facebook'
      parsed   = parseFacebook(url)
    } else if (/linkedin\.com/i.test(url)) {
      platform = 'linkedin'
      parsed   = parseLinkedIn(url)
    } else {
      continue
    }

    if (!parsed) continue
    // Skip profile/identity pages — they surface in the sidebar via badgeParser
    if (PROFILE_POST_TYPES.has(parsed.postType)) continue
    posts.push({ platform, url, ...parsed })
  }

  // Cap at 50 entries
  return posts.slice(0, 50)
}
