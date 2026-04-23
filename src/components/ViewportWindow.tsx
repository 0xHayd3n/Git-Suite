import { useRef, useState, useEffect, type ReactNode } from 'react'

interface ViewportWindowProps {
  /** Minimum height of the placeholder when not rendered (approx card height). */
  placeholderHeight: number
  /** Pixels of margin around viewport before mounting/unmounting. */
  rootMargin?: string
  /** Children to render when visible. */
  children: ReactNode
  /** Optional className for the wrapper (for grid-item styling). */
  className?: string
}

/**
 * Lightweight viewport windowing: mounts `children` only when the wrapper is within
 * (or near) the viewport. When off-screen, renders a sized placeholder so the scroll
 * container's total height stays stable.
 */
export default function ViewportWindow({
  placeholderHeight,
  rootMargin = '500px',
  children,
  className,
}: ViewportWindowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    if (!ref.current) return
    const el = ref.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin, visible])

  return (
    <div
      ref={ref}
      className={className}
      {...(visible ? { 'data-vw': '' } : { style: { height: placeholderHeight } })}
    >
      {visible ? children : null}
    </div>
  )
}
