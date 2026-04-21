import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTtsReader } from './useTtsReader'
import type { TtsSentence, TtsSection } from '../utils/rehypeTtsAnnotate'

// Mock speechSynthesis
const mockCancel = vi.fn()
const mockSpeak = vi.fn()
const mockPause = vi.fn()
const mockResume = vi.fn()
const mockGetVoices = vi.fn(() => [])

beforeEach(() => {
  vi.clearAllMocks()

  // Re-mock SpeechSynthesisUtterance after clearAllMocks
  globalThis.SpeechSynthesisUtterance = vi.fn().mockImplementation((text: string) => ({
    text,
    rate: 1,
    voice: null,
    onstart: null,
    onboundary: null,
    onend: null,
  })) as unknown as typeof SpeechSynthesisUtterance

  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      cancel: mockCancel,
      speak: mockSpeak,
      pause: mockPause,
      resume: mockResume,
      getVoices: mockGetVoices,
      speaking: false,
      paused: false,
      onvoiceschanged: null,
    },
    writable: true,
    configurable: true,
  })

  // Default: edge TTS unavailable -> browser fallback
  Object.defineProperty(window, 'api', {
    value: {
      tts: {
        synthesize: vi.fn().mockResolvedValue({
          audio: new ArrayBuffer(8),
          wordBoundaries: [{ text: 'Hello', offsetMs: 100 }],
        }),
        getVoices: vi.fn().mockResolvedValue([
          { shortName: 'en-US-AriaNeural', label: 'Aria (Female)' },
        ]),
        checkAvailable: vi.fn().mockResolvedValue(false),
      },
      settings: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    writable: true,
    configurable: true,
  })
})

const sentences: TtsSentence[] = [
  { sentenceIndex: 0, text: 'Hello world.', words: ['Hello', 'world.'] },
  { sentenceIndex: 1, text: 'Second sentence.', words: ['Second', 'sentence.'] },
]

const sections: TtsSection[] = [
  { headingText: 'Intro', sentenceIndex: 0 },
]

function makeContainerRef() {
  const div = document.createElement('div')
  return { current: div }
}

describe('useTtsReader', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    expect(result.current.status).toBe('idle')
    expect(result.current.sentenceStore.getSnapshot()).toBe(-1)
  })

  it('play() sets status to playing (browser engine)', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    expect(mockCancel).toHaveBeenCalled()
    expect(mockSpeak).toHaveBeenCalled()
    expect(result.current.status).toBe('playing')
    expect(result.current.sentenceStore.getSnapshot()).toBe(0)
  })

  it('play(fromSentence) starts from the specified sentence', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play(1))
    expect(result.current.sentenceStore.getSnapshot()).toBe(1)
  })

  it('stop() resets to idle', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.stop())
    expect(result.current.status).toBe('idle')
    expect(result.current.sentenceStore.getSnapshot()).toBe(-1)
  })

  it('pause() sets status to paused', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.pause())
    expect(result.current.status).toBe('paused')
  })

  it('resume() sets status to playing', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.pause())
    act(() => result.current.resume())
    expect(result.current.status).toBe('playing')
  })

  it('setSpeed updates speed state', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.setSpeed(1.5))
    expect(result.current.speed).toBe(1.5)
  })

  it('cleanup cancels speech on unmount', () => {
    const { unmount } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    unmount()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('toggleAutoScroll flips the autoScroll flag', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    expect(result.current.autoScroll).toBe(true)
    act(() => result.current.toggleAutoScroll())
    expect(result.current.autoScroll).toBe(false)
  })

  describe('edge engine', () => {
    beforeEach(() => {
      // Make edge TTS available
      ;(window.api as any).tts.checkAvailable = vi.fn().mockResolvedValue(true)
    })

    it('calls tts:checkAvailable on mount', async () => {
      renderHook(() => useTtsReader(sentences, sections, makeContainerRef()))
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
      expect(window.api.tts.checkAvailable).toHaveBeenCalled()
    })

    it('reads saved voice preference on mount', async () => {
      renderHook(() => useTtsReader(sentences, sections, makeContainerRef()))
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
      expect(window.api.settings.get).toHaveBeenCalledWith('tts_voice')
    })
  })
})
