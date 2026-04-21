import { useCallback, useRef } from 'react'
import { useLocalStorage } from './useLocalStorage'

interface Options {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

export function useResizable({ storageKey, defaultWidth, minWidth, maxWidth }: Options) {
  const [width, setWidthRaw] = useLocalStorage(storageKey, defaultWidth)
  const [isCollapsed, setIsCollapsed] = useLocalStorage(`${storageKey}:collapsed`, false)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const setWidth = useCallback((w: number) => {
    setWidthRaw(Math.min(maxWidth, Math.max(minWidth, w)))
  }, [minWidth, maxWidth, setWidthRaw])

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [setIsCollapsed])

  const onDragStart = useCallback((e: React.PointerEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [width])

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    setWidth(startWidth.current + delta)
  }, [setWidth])

  const onDragEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  const onDoubleClick = useCallback(() => {
    toggleCollapse()
  }, [toggleCollapse])

  return {
    width,
    setWidth,
    isCollapsed,
    toggleCollapse,
    handleProps: {
      onPointerDown: onDragStart,
      onPointerMove: onDragMove,
      onPointerUp: onDragEnd,
      onDoubleClick,
    },
  }
}
