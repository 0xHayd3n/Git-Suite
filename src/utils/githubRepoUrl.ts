/**
 * Parses a URL and returns { owner, name } if it points to a GitHub repository
 * root page (exactly two non-empty path segments), or null otherwise.
 *
 * Rules:
 * - Scheme must be https (http is intentionally excluded — GitHub always uses HTTPS)
 * - Hostname must be exactly 'github.com' (subdomains like gist.github.com return null)
 * - Exactly two non-empty path segments (owner + repo name)
 * - Trailing slash, query string, and fragment are ignored
 * - Returned owner and name are lowercased for consistent cache keys
 */
export function parseGitHubRepoUrl(url: string): { owner: string; name: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname !== 'github.com') return null

  // Split pathname and filter empty segments (handles leading '/' and trailing '/')
  const segments = parsed.pathname.split('/').filter(Boolean)

  // Exactly two segments: owner + repo name
  if (segments.length !== 2) return null

  const [owner, name] = segments
  if (!owner || !name) return null

  return { owner: owner.toLowerCase(), name: name.toLowerCase() }
}
