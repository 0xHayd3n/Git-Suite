import { memo, useRef, useState, useEffect } from 'react'
import { useBayerDither } from '../hooks/useBayerDither'

interface DitherBackgroundProps {
  avatarUrl?: string | null
  fallbackGradient?: [string, string]
  staticFrame?: boolean
}

const DitherBackground = memo(function DitherBackground({
  avatarUrl,
  fallbackGradient,
  staticFrame = false,
}: DitherBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let rafId = 0
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const w = Math.floor(entry.contentRect.width)
      const h = Math.floor(entry.contentRect.height)
      // Debounce via rAF to prevent resize → setState → re-render → resize loop
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h })
      })
    })
    ro.observe(el)
    return () => { cancelAnimationFrame(rafId); ro.disconnect() }
  }, [])

  useBayerDither(canvasRef, avatarUrl ?? null, size.width, size.height, staticFrame)

  const fallbackBg = fallbackGradient
    ? `linear-gradient(135deg, ${fallbackGradient[0]} 0%, ${fallbackGradient[1]} 100%)`
    : '#1a1a1f'

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: fallbackBg }}>
      <canvas ref={canvasRef} className="dither-canvas" />
      <div className="corner-glass corner-glass-tl" />
      <div className="corner-glass corner-glass-tr" />
    </div>
  )
})

export default DitherBackground
