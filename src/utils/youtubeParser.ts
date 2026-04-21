// ── YouTube link extraction ─────────────────────────────────────────────────

export interface YouTubeLink {
  videoId:    string | null
  playlistId: string | null
  url:        string
}

export interface YouTubeVideoData extends YouTubeLink {
  title:        string
  author:       string
  thumbnailUrl: string
}

// ── URL helpers ───────────────────────────────────────────────────────────

export function extractVideoId(url: string): string | null {
  // Standard: ?v=VIDEO_ID  (11 chars, letters/digits/-/_)
  let m = url.match(/[?&]v=([\w-]{11})(?:[?&&#]|$)/)
  if (m) return m[1]
  // Short: youtu.be/VIDEO_ID
  m = url.match(/youtu\.be\/([\w-]{11})(?:[?&#]|$)/)
  if (m) return m[1]
  // Embed: /embed/VIDEO_ID
  m = url.match(/\/embed\/([\w-]{11})(?:[?&#]|$)/)
  if (m) return m[1]
  // Shorts: /shorts/VIDEO_ID
  m = url.match(/\/shorts\/([\w-]{11})(?:[?&#]|$)/)
  if (m) return m[1]
  return null
}

function extractPlaylistId(url: string): string | null {
  const m = url.match(/[?&]list=([\w-]+)/)
  return m ? m[1] : null
}

// ── Main extraction ───────────────────────────────────────────────────────

export function extractYouTubeLinks(content: string): YouTubeLink[] {
  const seen  = new Set<string>()
  const links: YouTubeLink[] = []

  // Match raw YouTube URLs in any context (markdown links, plain text, HTML)
  const urlRe = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch[?][^)\s"'<>]*|embed\/[\w-]+|playlist[?][^)\s"'<>]*|shorts\/[\w-]+)|youtu\.be\/[\w-]+)[^)\s"'<>]*/g

  let m: RegExpExecArray | null
  while ((m = urlRe.exec(content)) !== null) {
    // Strip trailing markdown/punctuation artefacts
    const url       = m[0].replace(/[.,;:!?)]+$/, '')
    const videoId   = extractVideoId(url)
    const playlistId = extractPlaylistId(url)

    // De-duplicate by video ID (if present), else by playlist ID, else by full URL
    const key = videoId ?? (playlistId ? `pl:${playlistId}` : url)
    if (!seen.has(key)) {
      seen.add(key)
      links.push({ videoId, playlistId, url })
    }
  }

  // Max 30 unique entries
  return links.slice(0, 30)
}

// ── oEmbed fetch ──────────────────────────────────────────────────────────
// YouTube oEmbed is public, no API key needed, CORS-open from Electron.

export async function fetchYouTubeOEmbed(
  link: YouTubeLink,
): Promise<YouTubeVideoData> {
  // Derive best thumbnail URL from video ID — available without any API call
  const thumbFromId = link.videoId
    ? `https://img.youtube.com/vi/${link.videoId}/hqdefault.jpg`
    : ''

  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(link.url)}&format=json`
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }
    return {
      ...link,
      title:        data.title        ?? '',
      author:       data.author_name  ?? '',
      thumbnailUrl: data.thumbnail_url ?? thumbFromId,
    }
  } catch {
    // Graceful fallback — show card with thumbnail but no title/author
    return {
      ...link,
      title:        '',
      author:       '',
      thumbnailUrl: thumbFromId,
    }
  }
}
