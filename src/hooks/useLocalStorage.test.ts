// src/hooks/useLocalStorage.test.ts
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from './useLocalStorage'

beforeEach(() => localStorage.clear())

it('returns the initial value when localStorage is empty', () => {
  const { result } = renderHook(() => useLocalStorage('key', 42))
  expect(result.current[0]).toBe(42)
})

it('persists value to localStorage on update', () => {
  const { result } = renderHook(() => useLocalStorage('key', 0))
  act(() => result.current[1](10))
  expect(result.current[0]).toBe(10)
  expect(JSON.parse(localStorage.getItem('key')!)).toBe(10)
})

it('reads existing value from localStorage on mount', () => {
  localStorage.setItem('key', JSON.stringify('hello'))
  const { result } = renderHook(() => useLocalStorage('key', ''))
  expect(result.current[0]).toBe('hello')
})
