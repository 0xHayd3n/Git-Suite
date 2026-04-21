import { useEffect, useRef, useState } from 'react'

/**
 * Processes an avatar image into a white silhouette:
 * dark pixels → transparent, light pixels → white.
 * Returns a data URL for the processed image, or null.
 */
export function useWhitewashAvatar(avatarUrl: string | null | undefined): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!avatarUrl) {
      setDataUrl(null)
      return
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (cancelled) return
      canvas.width = 44
      canvas.height = 44
      ctx.drawImage(img, 0, 0, 44, 44)

      try {
        const imageData = ctx.getImageData(0, 0, 44, 44)
        const data = imageData.data
        const threshold = 110

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b

          if (luminance < threshold) {
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0
          } else {
            const alpha = Math.min(255, Math.round(((luminance - threshold) / (255 - threshold)) * 255))
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = alpha
          }
        }

        ctx.putImageData(imageData, 0, 0)
        setDataUrl(canvas.toDataURL())
      } catch {
        // Canvas tainted (CORS) — hide the icon
        setDataUrl(null)
      }
    }

    img.onerror = () => {
      if (!cancelled) setDataUrl(null)
    }

    img.src = avatarUrl
    return () => { cancelled = true }
  }, [avatarUrl])

  return dataUrl
}
