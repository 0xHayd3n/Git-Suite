import { useState, useEffect, useRef } from 'react'

export function useTooltip() {
  const [text, setText] = useState<string | null>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const currentText = useRef<string | null>(null)
  const lastOwner = useRef<Element | null>(null)

  // Latest captured mouse values — updated on every event, consumed once per frame
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
          nodeRef.current.style.left = x + 'px'
          nodeRef.current.style.top = y + 'px'
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
