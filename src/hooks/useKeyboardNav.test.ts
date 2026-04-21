import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useKeyboardNav } from './useKeyboardNav'

function makeEvent(key: string): React.KeyboardEvent {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent
}

describe('useKeyboardNav', () => {
  it('ArrowDown moves focus from -1 to 0', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 5, onFocusChange, onSelect,
    }))

    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowDown')) })
    expect(onFocusChange).toHaveBeenCalledWith(0)
  })

  it('ArrowDown increments focus index', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 5, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(2) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowDown')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(3)
  })

  it('ArrowDown does not exceed itemCount - 1', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 3, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(2) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowDown')) })
    // Should stay at 2 (last item), so no new call beyond the setFocusIndex call
    expect(onFocusChange).toHaveBeenLastCalledWith(2)
  })

  it('ArrowUp decrements focus index', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 5, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(3) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowUp')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(2)
  })

  it('ArrowUp does not go below 0', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 5, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(0) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowUp')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(0)
  })

  it('Enter calls onSelect with current index', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 5, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(2) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('Enter')) })
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('Enter does nothing when focus is -1', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 5, onFocusChange, onSelect,
    }))

    act(() => { result.current.containerProps.onKeyDown(makeEvent('Enter')) })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('grid mode: ArrowDown jumps by columns', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 12, columns: 3, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(1) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowDown')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(4) // 1 + 3
  })

  it('grid mode: ArrowRight moves by 1', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 12, columns: 3, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(1) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowRight')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(2)
  })

  it('grid mode: ArrowLeft moves by 1 backward', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 12, columns: 3, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(5) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowLeft')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(4)
  })

  it('Home goes to first item', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 10, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(7) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('Home')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(0)
  })

  it('End goes to last item', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 10, onFocusChange, onSelect,
    }))

    act(() => { result.current.setFocusIndex(2) })
    act(() => { result.current.containerProps.onKeyDown(makeEvent('End')) })
    expect(onFocusChange).toHaveBeenLastCalledWith(9)
  })

  it('does nothing when disabled', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 5, onFocusChange, onSelect, enabled: false,
    }))

    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowDown')) })
    expect(onFocusChange).not.toHaveBeenCalled()
  })

  it('does nothing when itemCount is 0', () => {
    const onFocusChange = vi.fn()
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardNav({
      itemCount: 0, onFocusChange, onSelect,
    }))

    act(() => { result.current.containerProps.onKeyDown(makeEvent('ArrowDown')) })
    expect(onFocusChange).not.toHaveBeenCalled()
  })
})
