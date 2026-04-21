const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image["'][^>]+content="([^"]+)"/i,
  /<meta[^>]+property=["']og:image["'][^>]+content='([^']+)'/i,
  /<meta[^>]+content="([^"]+)"[^>]+property=["']og:image["']/i,
  /<meta[^>]+content='([^']+)'[^>]+property=["']og:image["']/i,
]

/** Extract the og:image URL from an HTML string (head only). */
export function parseOgImage(html: string): string | null {
  for (const re of OG_IMAGE_PATTERNS) {
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * Returns true if the URL is GitHub's auto-generated OG card
 * (opengraph.githubassets.com/<hash>/<owner>/<repo>).
 * Custom social previews live on repository-images.githubusercontent.com
 * or other hosts entirely.
 */
export function isGenericGitHubOg(url: string): boolean {
  if (!url) return true
  return url.startsWith('https://opengraph.githubassets.com/')
}
