// ── Link preview cache + IPC bridge ──────────────────────────────────────────
// Module-level singleton: survives React re-renders, shared across all
// ReadmeRenderer instances in the same renderer process.

export interface LinkPreviewResult {
  title:       string
  description: string
  imageUrl:    string
  faviconUrl:  string
  domain:      string
}

const EMPTY: LinkPreviewResult = { title: '', description: '', imageUrl: '', faviconUrl: '', domain: '' }

const cache    = new Map<string, LinkPreviewResult>()
const inflight = new Map<string, Promise<LinkPreviewResult>>()

/** Synchronous cache read — returns undefined if not yet fetched. */
export function getCachedPreview(url: string): LinkPreviewResult | undefined {
  return cache.get(url)
}

/**
 * Fetch link preview metadata for `url`.
 * - Returns cached value immediately if already fetched.
 * - Deduplicates concurrent requests for the same URL (one IPC call max).
 * - Never throws — returns empty strings on any error.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewResult> {
  const cached = cache.get(url)
  if (cached) return cached

  const existing = inflight.get(url)
  if (existing) return existing

  const promise = (async () => {
    try {
      const result = await window.api.linkPreview.fetch(url)
      cache.set(url, result)
      return result
    } catch {
      const fallback = { ...EMPTY }
      cache.set(url, fallback)
      return fallback
    } finally {
      inflight.delete(url)
    }
  })()

  inflight.set(url, promise)
  return promise
}
