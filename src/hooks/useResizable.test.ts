// src/hooks/useResizable.test.ts
import { renderHook, act } from '@testing-library/react'
import { useResizable } from './useResizable'

beforeEach(() => localStorage.clear())

it('returns initial width from defaults', () => {
  const { result } = renderHook(() => useResizable({ storageKey: 'w', defaultWidth: 220, minWidth: 180, maxWidth: 500 }))
  expect(result.current.width).toBe(220)
  expect(result.current.isCollapsed).toBe(false)
})

it('toggles collapsed state', () => {
  const { result } = renderHook(() => useResizable({ storageKey: 'w', defaultWidth: 220, minWidth: 180, maxWidth: 500 }))
  act(() => result.current.toggleCollapse())
  expect(result.current.isCollapsed).toBe(true)
  act(() => result.current.toggleCollapse())
  expect(result.current.isCollapsed).toBe(false)
})

it('clamps width to min/max', () => {
  const { result } = renderHook(() => useResizable({ storageKey: 'w', defaultWidth: 220, minWidth: 180, maxWidth: 500 }))
  act(() => result.current.setWidth(100))
  expect(result.current.width).toBe(180)
  act(() => result.current.setWidth(9999))
  expect(result.current.width).toBe(500)
})
