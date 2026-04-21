import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVerification } from './useVerification'

function makeApi() {
  return {
    verification: {
      prioritise: vi.fn().mockResolvedValue(undefined),
      getScore:   vi.fn().mockResolvedValue(null),
      onUpdated:  vi.fn(),
      offUpdated: vi.fn(),
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: makeApi(),
    writable: true,
    configurable: true,
  })
})

describe('useVerification', () => {
  it('registers and unregisters IPC listener on mount/unmount', () => {
    const { unmount } = renderHook(() => useVerification())
    expect(window.api.verification.onUpdated).toHaveBeenCalledTimes(1)
    unmount()
    expect(window.api.verification.offUpdated).toHaveBeenCalledTimes(1)
  })

  it('getTier returns null when no data for repoId', () => {
    const { result } = renderHook(() => useVerification())
    expect(result.current.getTier('nobody/repo')).toBeNull()
  })

  it('updates tier map when IPC event fires', () => {
    let capturedCb: ((data: any) => void) | undefined
    window.api.verification.onUpdated = vi.fn(cb => { capturedCb = cb })

    const { result } = renderHook(() => useVerification())

    act(() => {
      capturedCb?.({ repoId: 'facebook/react', tier: 'verified', signals: ['registry_match'] })
    })

    expect(result.current.getTier('facebook/react')).toBe('verified')
    expect(result.current.getSignals('facebook/react')).toEqual(['registry_match'])
  })

  it('isResolving returns true for repoId not yet seen', () => {
    const { result } = renderHook(() => useVerification())
    expect(result.current.isResolving('unknown/repo')).toBe(true)
  })

  it('isResolving returns false after IPC update received', () => {
    let capturedCb: ((data: any) => void) | undefined
    window.api.verification.onUpdated = vi.fn(cb => { capturedCb = cb })

    const { result } = renderHook(() => useVerification())

    act(() => {
      capturedCb?.({ repoId: 'some/repo', tier: null, signals: [] })
    })

    expect(result.current.isResolving('some/repo')).toBe(false)
  })
})
