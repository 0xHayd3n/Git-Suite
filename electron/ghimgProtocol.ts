import { protocol, net } from 'electron'
import { getToken } from './store'

// GitHub asset URLs (github.com/user/repo/assets/ID/UUID) redirect to
// private-user-images.githubusercontent.com which requires GitHub auth.
// This protocol proxies those requests through the stored token so <img>
// tags in the renderer can load them without a browser session.

export function registerGhImgProtocol(): void {
  protocol.handle('ghimg', async (request) => {
    const originalUrl = 'https://' + request.url.slice('ghimg://'.length)

    const token = getToken()
    const headers: Record<string, string> = {
      'User-Agent': 'GitSuite/1.0',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await net.fetch(originalUrl, {
        signal: AbortSignal.timeout(20000),
        headers,
      })

      if (!response.ok) return new Response(null, { status: response.status })

      const buffer = await response.arrayBuffer()
      const contentType = response.headers.get('Content-Type') ?? 'image/gif'
      return new Response(buffer, { headers: { 'Content-Type': contentType } })
    } catch {
      return new Response(null, { status: 500 })
    }
  })
}
