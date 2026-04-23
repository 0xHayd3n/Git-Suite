import { useState, useEffect, useRef } from 'react'

export function useTooltip() {
  const [text, setText] = useState<string | null>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const currentText = useRef<string | null>(null)
  const lastOwner = useRef<Element | null>(null)

  const pendingX = useRef(0)
  const pendingY = useRef(0)
  const pendingTarget = useRef<Element | null>(null)
  const framePending = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      pendingX.current = e.clientX
      pendingY.current = e.clientY
      pendingTarget.current = e.target as Element | null

      if (framePending.current) return
      framePending.current = true

      requestAnimationFrame(() => {
        framePending.current = false

        const x = pendingX.current
        const y = pendingY.current
        const target = pendingTarget.current

        if (nodeRef.current) {
          const el = nodeRef.current
          el.style.left = x + 'px'
          el.style.top = y + 'px'

          // Apply default position, then check bounds and flip if needed
          el.style.transform = 'translate(10px, -100%)'
          const rect = el.getBoundingClientRect()
          const vw = window.innerWidth
          const margin = 8

          const flipX = rect.right > vw - margin
          const flipY = rect.top < margin

          const tx = flipX ? -(rect.width + 10) : 10
          const tyStr = flipY ? '16px' : '-100%'
          el.style.transform = `translate(${tx}px, ${tyStr})`
        }

        if (!target) return

        // Fast path: still inside same tooltip element
        if (lastOwner.current?.contains(target)) return

        const owner = target.closest('[title],[data-tooltip]') as Element | null

        if (owner) {
          const title = owner.getAttribute('title')
          if (title) {
            owner.setAttribute('data-tooltip', title)
            owner.removeAttribute('title')
          }
          const stored = owner.getAttribute('data-tooltip') ?? title
          lastOwner.current = owner
          if (currentText.current !== stored) {
            currentText.current = stored
            setText(stored)
          }
        } else {
          lastOwner.current = null
          if (currentText.current !== null) {
            currentText.current = null
            setText(null)
          }
        }
      })
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    return () => document.removeEventListener('mousemove', onMove)
  }, [])

  return { text, nodeRef }
}
