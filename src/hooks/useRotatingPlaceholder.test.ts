import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRotatingPlaceholder } from './useRotatingPlaceholder'

describe('useRotatingPlaceholder', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns the first suggestion initially', () => {
    const { result } = renderHook(() => useRotatingPlaceholder(false, false))
    expect(result.current.text).toBeTruthy()
    expect(result.current.visible).toBe(true)
  })

  it('cycles to next suggestion after interval', () => {
    const { result } = renderHook(() => useRotatingPlaceholder(false, false))
    const first = result.current.text
    act(() => { vi.advanceTimersByTime(3500) })
    // During fade-out, visible should be false
    expect(result.current.visible).toBe(false)
    act(() => { vi.advanceTimersByTime(400) })
    // After fade completes, text changes and visible is true
    expect(result.current.visible).toBe(true)
    expect(result.current.text).not.toBe(first)
  })

  it('stops cycling when focused', () => {
    const { result, rerender } = renderHook(
      ({ focused }) => useRotatingPlaceholder(focused, false),
      { initialProps: { focused: false } }
    )
    const initial = result.current.text
    rerender({ focused: true })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(result.current.text).toBe(initial)
  })

  it('stops cycling when input has value', () => {
    const { result, rerender } = renderHook(
      ({ hasValue }) => useRotatingPlaceholder(false, hasValue),
      { initialProps: { hasValue: false } }
    )
    const initial = result.current.text
    rerender({ hasValue: true })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(result.current.text).toBe(initial)
  })

  it('clears pending timeout when stopped mid-cycle', () => {
    const { result, rerender } = renderHook(
      ({ focused }) => useRotatingPlaceholder(focused, false),
      { initialProps: { focused: false } }
    )
    const initial = result.current.text

    // Fire interval at 3500ms — starts fade-out
    act(() => { vi.advanceTimersByTime(3500) })
    expect(result.current.visible).toBe(false)

    // Stop mid-timeout (before the 400ms timeout completes)
    rerender({ focused: true })

    // Advance past where timeout would have fired
    act(() => { vi.advanceTimersByTime(500) })

    // Text should NOT have changed — timeout was cleared
    expect(result.current.text).toBe(initial)
  })
})
