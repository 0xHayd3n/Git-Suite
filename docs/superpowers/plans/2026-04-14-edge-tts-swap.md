# Edge TTS Engine Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the README TTS engine from browser `speechSynthesis` to `msedge-tts` neural voices, with offline fallback and voice selection in Settings.

**Architecture:** Electron main process synthesizes audio per-sentence via `msedge-tts`, sends audio buffer + word boundary timeline to renderer via IPC. Renderer plays audio via `Audio` element, syncs word highlighting against the timeline. Falls back to existing `speechSynthesis` when offline.

**Tech Stack:** `msedge-tts` v2.0.4, Electron IPC (`ipcMain.handle`), Web Audio (`Audio` element), React, Vitest

**Spec:** `docs/superpowers/specs/2026-04-14-edge-tts-swap-design.md`

---

### Task 1: Electron TTS Service

**Files:**
- Create: `electron/services/ttsService.ts`
- Create: `electron/services/ttsService.test.ts`

This task creates the `msedge-tts` wrapper service in the Electron main process. It exposes three functions: `synthesizeSentence`, `getVoices`, and `checkAvailable`.

- [ ] **Step 0: Install msedge-tts dependency**

```bash
npm install msedge-tts
```

Expected: Package installs successfully. Verify with `node -e "require('msedge-tts')"`.

- [ ] **Step 1: Write the test file**

Create `electron/services/ttsService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock msedge-tts before importing the service
// Each metadata chunk is an individual JSON object with a Metadata array —
// the real library emits one chunk per word boundary event.
vi.mock('msedge-tts', () => {
  const mockAudioChunks = [Buffer.from('fake-audio-data')]
  // Each chunk is a separate JSON string, matching the real library's behavior
  const mockMetadataChunks = [
    JSON.stringify({
      Metadata: [{
        Type: 'WordBoundary',
        Data: {
          Offset: 5000000,       // 500ms in 100ns units
          Duration: 3000000,
          text: { Text: 'Hello', Length: 5, BoundaryType: 'WordBoundary' },
        },
      }],
    }),
    JSON.stringify({
      Metadata: [{
        Type: 'WordBoundary',
        Data: {
          Offset: 10000000,      // 1000ms
          Duration: 4000000,
          text: { Text: 'world', Length: 5, BoundaryType: 'WordBoundary' },
        },
      }],
    }),
  ]

  const { Readable } = require('stream')

  return {
    MsEdgeTTS: vi.fn().mockImplementation(() => ({
      setMetadata: vi.fn().mockResolvedValue(undefined),
      toStream: vi.fn().mockReturnValue({
        audioStream: Readable.from(mockAudioChunks),
        metadataStream: Readable.from(mockMetadataChunks.map(s => Buffer.from(s))),
      }),
      close: vi.fn(),
    })),
    OUTPUT_FORMAT: {
      AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3',
    },
  }
})

import { synthesizeSentence, getVoices, checkAvailable, resetInstance } from './ttsService'

describe('ttsService', () => {
  beforeEach(() => {
    resetInstance()
  })

  describe('getVoices', () => {
    it('returns curated voice list', () => {
      const voices = getVoices()
      expect(voices.length).toBeGreaterThanOrEqual(3)
      expect(voices[0]).toHaveProperty('shortName')
      expect(voices[0]).toHaveProperty('label')
      expect(voices.every(v => v.shortName.includes('Neural'))).toBe(true)
    })
  })

  describe('synthesizeSentence', () => {
    it('returns audio buffer and word boundaries with ms offsets', async () => {
      const result = await synthesizeSentence('Hello world.', 'en-US-AriaNeural')
      expect(result.audio).toBeInstanceOf(Buffer)
      expect(result.audio.length).toBeGreaterThan(0)
      expect(result.wordBoundaries).toEqual([
        { text: 'Hello', offsetMs: 500 },
        { text: 'world', offsetMs: 1000 },
      ])
    })
  })

  describe('checkAvailable', () => {
    it('returns true when MsEdgeTTS connects successfully', async () => {
      const available = await checkAvailable()
      expect(available).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/services/ttsService.test.ts`
Expected: FAIL — module `./ttsService` not found

- [ ] **Step 3: Implement the service**

Create `electron/services/ttsService.ts`:

```ts
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { Readable } from 'stream'

export interface WordBoundary {
  text: string
  offsetMs: number
}

export interface SynthesisResult {
  audio: Buffer
  wordBoundaries: WordBoundary[]
}

export interface CuratedVoice {
  shortName: string
  label: string
}

const CURATED_VOICES: CuratedVoice[] = [
  { shortName: 'en-US-AriaNeural', label: 'Aria (Female)' },
  { shortName: 'en-US-GuyNeural', label: 'Guy (Male)' },
  { shortName: 'en-US-JennyNeural', label: 'Jenny (Female)' },
  { shortName: 'en-GB-SoniaNeural', label: 'Sonia (Female, British)' },
]

let ttsInstance: MsEdgeTTS | null = null
let currentVoice: string | null = null

async function getInstance(voiceName: string): Promise<MsEdgeTTS> {
  if (ttsInstance && currentVoice === voiceName) return ttsInstance
  if (ttsInstance) ttsInstance.close()

  ttsInstance = new MsEdgeTTS()
  await ttsInstance.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  })
  currentVoice = voiceName
  return ttsInstance
}

async function collectAudioStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// The metadata stream emits individual JSON chunks — one per word/sentence
// boundary event. Each chunk is: { Metadata: [{ Type, Data }] }
async function collectWordBoundaries(stream: Readable): Promise<WordBoundary[]> {
  const boundaries: WordBoundary[] = []
  for await (const chunk of stream) {
    try {
      const parsed = JSON.parse(chunk.toString())
      for (const entry of parsed.Metadata ?? []) {
        if (entry.Type === 'WordBoundary') {
          boundaries.push({
            text: entry.Data.text.Text,
            offsetMs: Math.round(entry.Data.Offset / 10000), // 100ns → ms
          })
        }
      }
    } catch {
      // Individual chunk parse failure is non-fatal
    }
  }
  return boundaries
}

export async function synthesizeSentence(text: string, voiceName: string): Promise<SynthesisResult> {
  const tts = await getInstance(voiceName)
  const { audioStream, metadataStream } = tts.toStream(text)

  // Collect audio and metadata in parallel
  const [audio, wordBoundaries] = await Promise.all([
    collectAudioStream(audioStream),
    metadataStream ? collectWordBoundaries(metadataStream) : Promise.resolve([]),
  ])

  return { audio, wordBoundaries }
}

export function getVoices(): CuratedVoice[] {
  return CURATED_VOICES
}

export async function checkAvailable(): Promise<boolean> {
  try {
    const tts = new MsEdgeTTS()
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    )
    await Promise.race([
      tts.setMetadata('en-US-AriaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3),
      timeout,
    ])
    tts.close()
    return true
  } catch {
    return false
  }
}

/** Reset the singleton instance. Used in tests. */
export function resetInstance(): void {
  if (ttsInstance) ttsInstance.close()
  ttsInstance = null
  currentVoice = null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/services/ttsService.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron/services/ttsService.ts electron/services/ttsService.test.ts
git commit -m "feat: add msedge-tts service wrapper"
```

---

### Task 2: IPC Handlers and Preload Bridge

**Files:**
- Create: `electron/ipc/ttsHandlers.ts`
- Modify: `electron/preload.ts:264` (add `tts` namespace before closing `})`)
- Modify: `electron/main.ts:30` (add import), `electron/main.ts:1767` (add registration call)

This task wires the TTS service into Electron's IPC layer and exposes it to the renderer via the preload bridge.

- [ ] **Step 1: Create the IPC handler file**

Create `electron/ipc/ttsHandlers.ts`:

```ts
import { ipcMain } from 'electron'
import { synthesizeSentence, getVoices, checkAvailable } from '../services/ttsService'

export function registerTtsHandlers(): void {
  ipcMain.handle('tts:synthesize', async (_event, params: { text: string; voiceName: string }) => {
    return synthesizeSentence(params.text, params.voiceName)
  })

  ipcMain.handle('tts:getVoices', () => {
    return getVoices()
  })

  ipcMain.handle('tts:checkAvailable', () => {
    return checkAvailable()
  })
}
```

- [ ] **Step 2: Add import and registration to `electron/main.ts`**

Add import at line 30 (after `registerAiChatHandlers` import):

```ts
import { registerTtsHandlers } from './ipc/ttsHandlers'
```

Add registration call at line 1768 (after `registerAiChatHandlers()`):

```ts
registerTtsHandlers()
```

- [ ] **Step 3: Add `tts` namespace to preload bridge**

In `electron/preload.ts`, add the `tts` namespace before the closing `})` at line 264. Insert after the `ai` namespace (after line 263):

```ts
  tts: {
    synthesize: (text: string, voiceName: string) =>
      ipcRenderer.invoke('tts:synthesize', { text, voiceName }),
    getVoices: () => ipcRenderer.invoke('tts:getVoices'),
    checkAvailable: () => ipcRenderer.invoke('tts:checkAvailable'),
  },
```

- [ ] **Step 4: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ttsHandlers.ts electron/preload.ts electron/main.ts
git commit -m "feat: add TTS IPC handlers and preload bridge"
```

---

### Task 3: Refactor `useTtsReader` Hook — Dual Engine

**Files:**
- Modify: `src/hooks/useTtsReader.ts` (full rewrite of internals)
- Modify: `src/hooks/useTtsReader.test.ts` (update tests for dual engine)
- Modify: `src/test/setup.ts` (add `window.api.tts` stub)

This is the core task. The hook's public API stays the same but the internal engine switches from `speechSynthesis` to `Audio` element + IPC synthesis, with fallback.

- [ ] **Step 1: Add `window.api.tts` stub to test setup**

In `src/test/setup.ts`, add after the `speechSynthesis` stub (after line 36):

```ts
// Stub window.api.tts for TTS hook tests
if (typeof window !== 'undefined' && !(window as any).api?.tts) {
  const api = (window as any).api ?? {}
  api.tts = {
    synthesize: async () => ({ audio: new ArrayBuffer(0), wordBoundaries: [] }),
    getVoices: async () => [
      { shortName: 'en-US-AriaNeural', label: 'Aria (Female)' },
    ],
    checkAvailable: async () => false,
  }
  api.settings = api.settings ?? {
    get: async () => null,
    set: async () => {},
  }
  if (!(window as any).api) {
    Object.defineProperty(window, 'api', {
      value: api,
      writable: true,
      configurable: true,
    })
  }
}
```

- [ ] **Step 2: Update tests for dual engine**

Rewrite `src/hooks/useTtsReader.test.ts` to test both engines. The existing tests already cover the browser engine path; add tests for the edge engine path and fallback:

```ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTtsReader } from './useTtsReader'
import type { TtsSentence, TtsSection } from '../utils/rehypeTtsAnnotate'

// Mock SpeechSynthesisUtterance
globalThis.SpeechSynthesisUtterance = vi.fn().mockImplementation((text: string) => ({
  text,
  rate: 1,
  voice: null,
  onstart: null,
  onboundary: null,
  onend: null,
})) as unknown as typeof SpeechSynthesisUtterance

// Mock speechSynthesis
const mockCancel = vi.fn()
const mockSpeak = vi.fn()
const mockPause = vi.fn()
const mockResume = vi.fn()
const mockGetVoices = vi.fn(() => [])

beforeEach(() => {
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

  // Default: edge TTS unavailable → browser fallback
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

  vi.clearAllMocks()
  globalThis.SpeechSynthesisUtterance = vi.fn().mockImplementation((text: string) => ({
    text,
    rate: 1,
    voice: null,
    onstart: null,
    onboundary: null,
    onend: null,
  })) as unknown as typeof SpeechSynthesisUtterance
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
    expect(result.current.currentSentence).toBe(-1)
    expect(result.current.currentWord).toBe(-1)
  })

  it('play() sets status to playing (browser engine)', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    expect(mockCancel).toHaveBeenCalled()
    expect(mockSpeak).toHaveBeenCalled()
    expect(result.current.status).toBe('playing')
    expect(result.current.currentSentence).toBe(0)
  })

  it('play(fromSentence) starts from the specified sentence', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play(1))
    expect(result.current.currentSentence).toBe(1)
  })

  it('stop() resets to idle', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.stop())
    expect(result.current.status).toBe('idle')
    expect(result.current.currentSentence).toBe(-1)
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
      // Allow the mount effect to run
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
```

- [ ] **Step 3: Run tests to see current state**

Run: `npx vitest run src/hooks/useTtsReader.test.ts`
Expected: Tests should reflect the current browser-only behavior. Some new tests may fail because the hook doesn't have edge engine yet.

- [ ] **Step 4: Rewrite the hook with dual engine support**

Rewrite `src/hooks/useTtsReader.ts`. The key changes:
1. Add initialization effect that calls `tts:checkAvailable` and `settings:get('tts_voice')`
2. Store `engine` ref (`'edge' | 'browser'`)
3. Add `audioRef` (reusable `Audio` element), `nextBufferRef` (pre-buffered next sentence)
4. Edge engine path in `speakSentence`: call `tts:synthesize` → blob URL → audio.play() → timeupdate for word sync
5. Keep browser engine path (existing `speechSynthesis` code) behind engine check
6. Pause/resume: branch on engine (audio.pause vs speechSynthesis.pause)
7. Stop: branch on engine
8. Speed: set `audio.playbackRate` for edge, re-synthesize for browser
9. Fallback: catch IPC errors → switch engine to browser → continue from current sentence

```ts
import { useState, useCallback, useRef, useEffect } from 'react'
import type { TtsSentence, TtsSection } from '../utils/rehypeTtsAnnotate'

type TtsStatus = 'idle' | 'playing' | 'paused'
type TtsEngine = 'edge' | 'browser'

interface WordBoundary {
  text: string
  offsetMs: number
}

interface SynthesisResult {
  audio: ArrayBuffer
  wordBoundaries: WordBoundary[]
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  const preferred = voices.find(v =>
    v.lang.startsWith('en') && (/natural|enhanced/i).test(v.name)
  )
  return preferred ?? voices.find(v => v.lang.startsWith('en')) ?? voices[0] ?? null
}

export function useTtsReader(
  sentences: TtsSentence[],
  sections: TtsSection[],
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [status, setStatus] = useState<TtsStatus>('idle')
  const [currentSentence, setCurrentSentence] = useState(-1)
  const [currentWord, setCurrentWord] = useState(-1)
  const [speed, setSpeedState] = useState(1)
  const [autoScroll, setAutoScroll] = useState(true)

  const statusRef = useRef(status)
  statusRef.current = status
  const speedRef = useRef(speed)
  speedRef.current = speed
  const sentenceRef = useRef(currentSentence)
  sentenceRef.current = currentSentence
  const programmaticScrollRef = useRef(false)

  // ── Engine state ──
  const engineRef = useRef<TtsEngine>('browser')
  const voiceRef = useRef<string>('en-US-AriaNeural')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nextBufferRef = useRef<Promise<SynthesisResult> | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const wordBoundariesRef = useRef<WordBoundary[]>([])
  const stoppedRef = useRef(false)

  // ── DOM highlighting helpers ──
  const prevSentenceEl = useRef<Element | null>(null)
  const prevWordSpan = useRef<HTMLSpanElement | null>(null)

  const removeWordHighlight = useCallback(() => {
    const span = prevWordSpan.current
    if (span && span.parentNode) {
      const parent = span.parentNode
      while (span.firstChild) parent.insertBefore(span.firstChild, span)
      parent.removeChild(span)
      parent.normalize()
    }
    prevWordSpan.current = null
  }, [])

  const clearHighlights = useCallback(() => {
    prevSentenceEl.current?.classList.remove('tts-active-sentence')
    removeWordHighlight()
    containerRef.current?.classList.remove('tts-playing')
    prevSentenceEl.current = null
  }, [containerRef, removeWordHighlight])

  const updateHighlight = useCallback((sentIdx: number, wordText: string) => {
    const container = containerRef.current
    if (!container) return

    container.classList.add('tts-playing')

    const sentAttr = String(sentIdx)
    if (sentAttr !== (prevSentenceEl.current?.getAttribute('data-tts-sentence') ?? '')) {
      prevSentenceEl.current?.classList.remove('tts-active-sentence')
      const el = container.querySelector(`[data-tts-sentence="${sentIdx}"]`)
      el?.classList.add('tts-active-sentence')
      prevSentenceEl.current = el
    }

    removeWordHighlight()
    const sentEl = prevSentenceEl.current
    if (!sentEl || !wordText) return

    const walker = document.createTreeWalker(sentEl, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const idx = textNode.textContent?.indexOf(wordText) ?? -1
      if (idx === -1) continue

      const before = idx > 0 ? textNode.splitText(idx) : textNode
      before.splitText(wordText.length)
      const span = document.createElement('span')
      span.className = 'tts-active-word'
      before.parentNode!.insertBefore(span, before)
      span.appendChild(before)
      prevWordSpan.current = span
      return
    }
  }, [containerRef, removeWordHighlight])

  // ── Auto-scroll ──
  useEffect(() => {
    if (currentSentence < 0 || !autoScroll) return
    const el = containerRef.current?.querySelector(`[data-tts-sentence="${currentSentence}"]`)
    if (el) {
      programmaticScrollRef.current = true
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => { programmaticScrollRef.current = false }, 500)
    }
  }, [currentSentence, autoScroll, containerRef])

  // ── Manual scroll detection ──
  useEffect(() => {
    const container = containerRef.current?.closest('.repo-detail-tab-body')
    if (!container || status !== 'playing') return
    const handler = () => {
      if (!programmaticScrollRef.current) setAutoScroll(false)
    }
    container.addEventListener('scroll', handler, { passive: true })
    return () => container.removeEventListener('scroll', handler)
  }, [status, containerRef])

  // ── Initialize engine on mount ──
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const [available, savedVoice] = await Promise.all([
          window.api.tts.checkAvailable(),
          window.api.settings.get('tts_voice'),
        ])
        if (cancelled) return
        engineRef.current = available ? 'edge' : 'browser'
        if (savedVoice) voiceRef.current = savedVoice
      } catch {
        engineRef.current = 'browser'
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // ── Create reusable Audio element ──
  useEffect(() => {
    audioRef.current = new Audio()
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  // ── Helper: revoke current blob URL ──
  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  // ── Helper: pre-buffer next sentence ──
  const preBufferNext = useCallback((nextIdx: number) => {
    if (nextIdx >= sentences.length) {
      nextBufferRef.current = null
      return
    }
    nextBufferRef.current = window.api.tts.synthesize(
      sentences[nextIdx].text,
      voiceRef.current,
    ).catch(() => null)
  }, [sentences])

  // ── Edge engine: speak a sentence ──
  const edgeSpeakSentence = useCallback((idx: number, preBuffered?: SynthesisResult | null) => {
    if (idx >= sentences.length) {
      setStatus('idle')
      setCurrentSentence(-1)
      setCurrentWord(-1)
      clearHighlights()
      revokeBlobUrl()
      return
    }

    stoppedRef.current = false
    setCurrentSentence(idx)
    setCurrentWord(0)

    const audio = audioRef.current!

    const playSynthesized = (result: SynthesisResult) => {
      if (stoppedRef.current) return

      revokeBlobUrl()
      const blob = new Blob([result.audio], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      wordBoundariesRef.current = result.wordBoundaries

      audio.src = url
      audio.playbackRate = speedRef.current

      // Highlight first word
      const firstWord = sentences[idx].words[0] ?? ''
      updateHighlight(idx, firstWord)

      // Word sync via timeupdate
      let lastWordIdx = -1
      const onTimeUpdate = () => {
        const currentMs = audio.currentTime * 1000
        let matchIdx = -1
        for (let i = wordBoundariesRef.current.length - 1; i >= 0; i--) {
          if (wordBoundariesRef.current[i].offsetMs <= currentMs) {
            matchIdx = i
            break
          }
        }
        if (matchIdx >= 0 && matchIdx !== lastWordIdx) {
          lastWordIdx = matchIdx
          setCurrentWord(matchIdx)
          updateHighlight(idx, wordBoundariesRef.current[matchIdx].text)
        }
      }

      const onEnded = () => {
        audio.removeEventListener('timeupdate', onTimeUpdate)
        audio.removeEventListener('ended', onEnded)
        if (statusRef.current !== 'playing' || stoppedRef.current) return

        // Play next sentence from pre-buffer
        const nextIdx = idx + 1
        if (nextBufferRef.current) {
          nextBufferRef.current.then(result => {
            if (result) {
              preBufferNext(nextIdx + 1)
              edgeSpeakSentence(nextIdx, result)
            } else {
              // Pre-buffer failed — try fresh synthesis, or fallback
              edgeSpeakSentence(nextIdx)
            }
          })
        } else {
          edgeSpeakSentence(nextIdx)
        }
      }

      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.addEventListener('ended', onEnded)
      audio.play().catch(() => {
        audio.removeEventListener('timeupdate', onTimeUpdate)
        audio.removeEventListener('ended', onEnded)
      })

      // Pre-buffer next
      preBufferNext(idx + 1)
    }

    if (preBuffered) {
      playSynthesized(preBuffered)
    } else {
      window.api.tts.synthesize(sentences[idx].text, voiceRef.current)
        .then(result => {
          if (stoppedRef.current) return
          playSynthesized(result)
        })
        .catch(() => {
          // Edge TTS failed — fall back to browser engine
          engineRef.current = 'browser'
          browserSpeakFrom(idx)
        })
    }
  }, [sentences, clearHighlights, updateHighlight, revokeBlobUrl, preBufferNext])

  // ── Browser engine: speak from sentence (existing logic) ──
  const browserSpeakFrom = useCallback((fromSentence: number) => {
    if (!sentences.length || fromSentence >= sentences.length) return
    speechSynthesis.cancel()

    const voice = pickVoice()

    const speakSentence = (idx: number) => {
      if (idx >= sentences.length) {
        setStatus('idle')
        setCurrentSentence(-1)
        setCurrentWord(-1)
        clearHighlights()
        return
      }

      const utt = new SpeechSynthesisUtterance(sentences[idx].text)
      utt.rate = speedRef.current
      if (voice) utt.voice = voice

      utt.onstart = () => {
        setCurrentSentence(idx)
        setCurrentWord(0)
        const firstWord = sentences[idx].words[0] ?? ''
        updateHighlight(idx, firstWord)
      }

      utt.onboundary = (e) => {
        if (e.name !== 'word') return
        const spoken = sentences[idx].text.slice(0, e.charIndex)
        const wordIdx = spoken.split(/\s+/).filter(Boolean).length
        setCurrentWord(wordIdx)
        const word = sentences[idx].text.slice(e.charIndex, e.charIndex + (e.charLength ?? 0))
        updateHighlight(idx, word)
      }

      utt.onend = () => {
        if (statusRef.current === 'playing') speakSentence(idx + 1)
      }

      speechSynthesis.speak(utt)
    }

    speakSentence(fromSentence)
  }, [sentences, clearHighlights, updateHighlight])

  // ── Public API ──
  const play = useCallback((fromSentence = 0) => {
    if (!sentences.length || fromSentence >= sentences.length) return
    stoppedRef.current = false
    setStatus('playing')
    setCurrentSentence(fromSentence)
    nextBufferRef.current = null

    if (engineRef.current === 'edge') {
      // Stop any browser speech and audio
      speechSynthesis.cancel()
      audioRef.current?.pause()
      revokeBlobUrl()
      edgeSpeakSentence(fromSentence)
    } else {
      audioRef.current?.pause()
      revokeBlobUrl()
      browserSpeakFrom(fromSentence)
    }
  }, [sentences, edgeSpeakSentence, browserSpeakFrom, revokeBlobUrl])

  const pause = useCallback(() => {
    setStatus('paused')
    if (engineRef.current === 'edge') {
      audioRef.current?.pause()
    } else {
      speechSynthesis.pause()
    }
  }, [])

  const resume = useCallback(() => {
    setStatus('playing')
    if (engineRef.current === 'edge') {
      audioRef.current?.play()
    } else {
      speechSynthesis.resume()
    }
  }, [])

  const stop = useCallback(() => {
    stoppedRef.current = true
    setStatus('idle')
    setCurrentSentence(-1)
    setCurrentWord(-1)
    clearHighlights()
    nextBufferRef.current = null

    if (engineRef.current === 'edge') {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
      }
      revokeBlobUrl()
    }
    speechSynthesis.cancel()
  }, [clearHighlights, revokeBlobUrl])

  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate)
    speedRef.current = rate
    if (engineRef.current === 'edge') {
      // Instant speed change on Audio element
      if (audioRef.current) audioRef.current.playbackRate = rate
    } else if (statusRef.current === 'playing') {
      // Browser engine: must re-synthesize
      browserSpeakFrom(sentenceRef.current)
    }
  }, [browserSpeakFrom])

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(prev => !prev)
  }, [])

  const jumpToCurrent = useCallback(() => {
    setAutoScroll(true)
    const el = containerRef.current?.querySelector(`[data-tts-sentence="${sentenceRef.current}"]`)
    if (el) {
      programmaticScrollRef.current = true
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => { programmaticScrollRef.current = false }, 500)
    }
  }, [containerRef])

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      revokeBlobUrl()
      if (typeof window !== 'undefined' && window.speechSynthesis) speechSynthesis.cancel()
      clearHighlights()
    }
  }, [clearHighlights, revokeBlobUrl])

  return {
    status,
    currentSentence,
    currentWord,
    speed,
    autoScroll,
    play,
    pause,
    resume,
    stop,
    setSpeed,
    toggleAutoScroll,
    jumpToCurrent,
    sections,
    totalSentences: sentences.length,
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/hooks/useTtsReader.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: No regressions in existing tests (ReadmeRenderer tests, etc.)

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useTtsReader.ts src/hooks/useTtsReader.test.ts src/test/setup.ts
git commit -m "feat: dual-engine TTS — edge neural voices with browser fallback"
```

---

### Task 4: Settings UI — Voice Selection

**Files:**
- Modify: `src/views/Settings.tsx:437` (add TEXT-TO-SPEECH section after LANGUAGE)
- Modify: `src/views/Settings.test.tsx` (add TTS section tests)

This task adds a voice preference dropdown to the Settings view.

- [ ] **Step 1: Add tests for the TTS settings section**

Add to the end of `src/views/Settings.test.tsx`, inside a new describe block:

```ts
describe('Settings — Text-to-Speech section', () => {
  beforeEach(() => {
    setupApi({})
    // Add tts and settings.get to the mock API
    ;(window.api as any).tts = {
      getVoices: vi.fn().mockResolvedValue([
        { shortName: 'en-US-AriaNeural', label: 'Aria (Female)' },
        { shortName: 'en-US-GuyNeural', label: 'Guy (Male)' },
      ]),
      synthesize: vi.fn().mockResolvedValue({ audio: new ArrayBuffer(0), wordBoundaries: [] }),
      checkAvailable: vi.fn().mockResolvedValue(true),
    }
    ;(window.api as any).settings.get = vi.fn().mockResolvedValue(null)
    ;(window.api as any).settings.set = vi.fn().mockResolvedValue(undefined)
  })

  it('renders TEXT-TO-SPEECH section title', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/TEXT-TO-SPEECH/)).toBeInTheDocument()
    })
  })

  it('renders voice dropdown with curated voices', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Aria (Female)')).toBeInTheDocument()
      expect(screen.getByText('Guy (Male)')).toBeInTheDocument()
    })
  })

  it('saves voice preference on change', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Aria (Female)'))
    const select = screen.getByDisplayValue('Aria (Female)') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'en-US-GuyNeural' } })
    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith('tts_voice', 'en-US-GuyNeural')
    })
  })

  it('renders Preview button', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/Preview/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/Settings.test.tsx`
Expected: FAIL — TEXT-TO-SPEECH section not found

- [ ] **Step 3: Add TTS section to Settings component**

In `src/views/Settings.tsx`, add state and effects for the TTS section. At the top of the component (after existing state declarations around line 34):

```ts
// TTS voice state
const [ttsVoices, setTtsVoices] = useState<{ shortName: string; label: string }[]>([])
const [ttsVoice, setTtsVoice] = useState<string>('')
const [ttsPreviewPlaying, setTtsPreviewPlaying] = useState(false)
```

In the existing `useEffect` that loads settings (around line 48), add after the `downloadFolder` loading:

```ts
window.api.tts.getVoices().then((voices: { shortName: string; label: string }[]) => {
  setTtsVoices(voices)
  if (voices.length > 0) {
    window.api.settings.get('tts_voice').then((saved: string | null) => {
      setTtsVoice(saved && voices.some(v => v.shortName === saved) ? saved : voices[0].shortName)
    })
  }
}).catch(() => {})
```

Add the save handler after `savePreferredLanguage`:

```ts
const saveTtsVoice = async (voice: string) => {
  setTtsVoice(voice)
  await window.api.settings.set('tts_voice', voice)
}

const handleTtsPreview = async () => {
  if (ttsPreviewPlaying) return
  setTtsPreviewPlaying(true)
  try {
    const result = await window.api.tts.synthesize(
      'Hello, this is a preview of the selected voice.',
      ttsVoice,
    )
    const blob = new Blob([result.audio], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      setTtsPreviewPlaying(false)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      setTtsPreviewPlaying(false)
    }
    await audio.play()
  } catch {
    setTtsPreviewPlaying(false)
  }
}
```

Add the JSX section after the LANGUAGE section `</div>` (after line 437):

```tsx
<div className="settings-section">
  <span className="settings-section-title">TEXT-TO-SPEECH</span>
  <div className="settings-row">
    <div className="settings-row-info">
      <div className="settings-row-title">Voice</div>
      <div className="settings-row-sub">
        Requires internet connection. Falls back to browser voice when offline.
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        value={ttsVoice}
        onChange={e => saveTtsVoice(e.target.value)}
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          color: 'var(--t1)',
          background: 'var(--bg3)',
          border: '1px solid var(--border2)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 10px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {ttsVoices.map(v => (
          <option key={v.shortName} value={v.shortName}>{v.label}</option>
        ))}
      </select>
      <button
        className="settings-update-btn"
        onClick={handleTtsPreview}
        disabled={ttsPreviewPlaying || !ttsVoice}
      >
        {ttsPreviewPlaying ? 'Playing…' : 'Preview'}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/views/Settings.test.tsx`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/views/Settings.tsx src/views/Settings.test.tsx
git commit -m "feat: add TTS voice preference to Settings"
```

---

### Task 5: Integration — Wire Voice Preference to Hook

**Files:**
- Modify: `src/hooks/useTtsReader.ts` (read voice from Settings on init — already handled in Task 3, but verify integration)

This task verifies end-to-end integration: Settings saves voice → hook reads voice → edge TTS uses it.

- [ ] **Step 1: Verify the hook reads the saved voice preference**

The hook's init effect (added in Task 3) already calls `window.api.settings.get('tts_voice')`. Verify this works by running the full test suite:

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: integration fixes for edge TTS"
```

Only commit if changes were needed. If everything passes, skip this step.
