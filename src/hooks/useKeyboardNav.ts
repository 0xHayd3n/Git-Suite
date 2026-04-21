import { useCallback, useRef, useEffect } from 'react'

export interface KeyboardNavOptions {
  /** Total number of navigable items */
  itemCount: number
  /** Number of columns (for grid 2D navigation). Default 1 (list mode). */
  columns?: number
  /** Called when the focused index changes */
  onFocusChange: (index: number) => void
  /** Called when Enter is pressed on the focused item */
  onSelect: (index: number) => void
  /** Whether keyboard nav is enabled (e.g. disable when a modal is open) */
  enabled?: boolean
}

/**
 * Reusable keyboard navigation hook for list/grid views.
 *
 * Returns:
 *  - `focusIndex`: current focused item index (or -1)
 *  - `setFocusIndex`: manually set focus (e.g. on mouse hover or click)
 *  - `containerProps`: spread onto the scrollable container element
 */
export function useKeyboardNav({
  itemCount,
  columns = 1,
  onFocusChange,
  onSelect,
  enabled = true,
}: KeyboardNavOptions) {
  const focusIndexRef = useRef(-1)

  // Keep callbacks fresh without re-creating the handler
  const onFocusChangeRef = useRef(onFocusChange)
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onFocusChangeRef.current = onFocusChange }, [onFocusChange])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  const setFocusIndex = useCallback((idx: number) => {
    focusIndexRef.current = idx
    onFocusChangeRef.current(idx)
  }, [])

  // Reset focus when item count changes (new search results, etc.)
  useEffect(() => {
    if (focusIndexRef.current >= itemCount) {
      setFocusIndex(Math.max(0, itemCount - 1))
    }
  }, [itemCount, setFocusIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!enabled || itemCount === 0) return

    const cur = focusIndexRef.current
    let next = cur

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (cur === -1) { next = 0 }
        else { next = Math.min(cur + columns, itemCount - 1) }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (cur === -1) { next = 0 }
        else { next = Math.max(cur - columns, 0) }
        break
      case 'ArrowRight':
        if (columns <= 1) return // only for grids
        e.preventDefault()
        if (cur === -1) { next = 0 }
        else { next = Math.min(cur + 1, itemCount - 1) }
        break
      case 'ArrowLeft':
        if (columns <= 1) return // only for grids
        e.preventDefault()
        if (cur === -1) { next = 0 }
        else { next = Math.max(cur - 1, 0) }
        break
      case 'Enter':
        if (cur >= 0 && cur < itemCount) {
          e.preventDefault()
          onSelectRef.current(cur)
        }
        return
      case 'Home':
        e.preventDefault()
        next = 0
        break
      case 'End':
        e.preventDefault()
        next = itemCount - 1
        break
      default:
        return
    }

    if (next !== cur) {
      setFocusIndex(next)
    }
  }, [enabled, itemCount, columns, setFocusIndex])

  return {
    focusIndex: focusIndexRef.current,
    setFocusIndex,
    containerProps: {
      onKeyDown: handleKeyDown,
      tabIndex: 0,
      role: 'listbox' as const,
    },
  }
}
