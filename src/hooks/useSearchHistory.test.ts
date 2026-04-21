import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchHistory } from './useSearchHistory'

const STORAGE_KEY = 'discover-search-history'

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with empty entries when no localStorage data', () => {
    const { result } = renderHook(() => useSearchHistory())
    expect(result.current.entries).toEqual([])
  })

  it('initializes from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['react', 'vue']))
    const { result } = renderHook(() => useSearchHistory())
    expect(result.current.entries).toEqual(['react', 'vue'])
  })

  it('add() puts entry at front of list', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    expect(result.current.entries).toEqual(['vue', 'react'])
  })

  it('add() deduplicates — existing entry moves to front', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.add('react'))
    expect(result.current.entries).toEqual(['react', 'vue'])
  })

  it('add() trims whitespace', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('  react  '))
    expect(result.current.entries).toEqual(['react'])
  })

  it('add() ignores empty strings', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add(''))
    act(() => result.current.add('   '))
    expect(result.current.entries).toEqual([])
  })

  it('add() caps at 20 entries, drops oldest', () => {
    const { result } = renderHook(() => useSearchHistory())
    for (let i = 0; i < 25; i++) {
      act(() => result.current.add(`query-${i}`))
    }
    expect(result.current.entries).toHaveLength(20)
    expect(result.current.entries[0]).toBe('query-24')
    expect(result.current.entries[19]).toBe('query-5')
  })

  it('remove() removes single entry by value', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.remove('react'))
    expect(result.current.entries).toEqual(['vue'])
  })

  it('clear() resets to empty array', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.clear())
    expect(result.current.entries).toEqual([])
  })

  it('persists to localStorage on add', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['react'])
  })

  it('persists to localStorage on remove', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.add('vue'))
    act(() => result.current.remove('react'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['vue'])
  })

  it('persists to localStorage on clear', () => {
    const { result } = renderHook(() => useSearchHistory())
    act(() => result.current.add('react'))
    act(() => result.current.clear())
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([])
  })
})
