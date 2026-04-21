import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOgImage } from './useOgImage'

// Mock the IPC API
const mockGetOgImage = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).api = {
    repo: { getOgImage: mockGetOgImage },
  }
})

describe('useOgImage', () => {
  it('returns idle state initially', () => {
    const { result } = renderHook(() => useOgImage('facebook', 'react'))
    expect(result.current.ogImageUrl).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.fetched).toBe(false)
  })

  it('fetches OG image on trigger and returns URL', async () => {
    mockGetOgImage.mockResolvedValue('https://repository-images.githubusercontent.com/12345/img.png')
    const { result } = renderHook(() => useOgImage('facebook', 'react'))

    await act(async () => { result.current.fetch() })

    expect(mockGetOgImage).toHaveBeenCalledWith('facebook', 'react')
    expect(result.current.ogImageUrl).toBe('https://repository-images.githubusercontent.com/12345/img.png')
    expect(result.current.loading).toBe(false)
    expect(result.current.fetched).toBe(true)
  })

  it('does not re-fetch after first call', async () => {
    mockGetOgImage.mockResolvedValue(null)
    const { result } = renderHook(() => useOgImage('owner', 'repo'))

    await act(async () => { result.current.fetch() })
    await act(async () => { result.current.fetch() })

    expect(mockGetOgImage).toHaveBeenCalledTimes(1)
  })

  it('handles null response (no custom OG image)', async () => {
    mockGetOgImage.mockResolvedValue(null)
    const { result } = renderHook(() => useOgImage('owner', 'repo'))

    await act(async () => { result.current.fetch() })

    expect(result.current.ogImageUrl).toBeNull()
    expect(result.current.fetched).toBe(true)
  })
})
