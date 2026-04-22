import { protocol, net } from 'electron'
import { BADGE_DOMAINS } from '../src/utils/badgeParser'
import { LRUCache } from './lruCache'

// Fallback: 1×1 transparent PNG returned when badge fetch fails
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const BADGE_CACHE_TTL = 60 * 60 * 1000 // 1 hour
const badgeCache = new LRUCache<string, { buffer: ArrayBuffer; contentType: string; ts: number }>(100)

function isAllowedDomain(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return BADGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

export function registerBadgeProtocol(): void {
  protocol.handle('badge', async (request) => {
    // badge://img.shields.io/npm/v/foo → https://img.shields.io/npm/v/foo
    const originalUrl = 'https://' + request.url.slice('badge://'.length)

    if (!isAllowedDomain(originalUrl)) {
      return new Response(null, { status: 403 })
    }

    const cached = badgeCache.get(originalUrl)
    if (cached && Date.now() - cached.ts < BADGE_CACHE_TTL) {
      return new Response(cached.buffer, { headers: { 'Content-Type': cached.contentType } })
    }

    try {
      const response = await net.fetch(originalUrl, {
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
      }

      const buffer = await response.arrayBuffer()

      if (buffer.byteLength > 100 * 1024) {
        return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
      }

      const contentType = response.headers.get('Content-Type') ?? 'image/svg+xml'
      badgeCache.set(originalUrl, { buffer, contentType, ts: Date.now() })
      return new Response(buffer, { headers: { 'Content-Type': contentType } })
    } catch {
      return new Response(TRANSPARENT_PNG, { headers: { 'Content-Type': 'image/png' } })
    }
  })
}
