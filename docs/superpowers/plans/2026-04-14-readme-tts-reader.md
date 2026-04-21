# README Text-to-Speech Reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-native text-to-speech with sentence+word highlighting, section entry points, a floating playback bar, and auto-scroll to the README view.

**Architecture:** A `rehypeTtsAnnotate` plugin annotates the HAST tree with `data-tts-sentence` and `data-tts-word` attributes, producing a sentence array via a mutable side-channel. A `useTtsReader` hook drives `speechSynthesis` and manipulates DOM classes for highlighting. A `<TtsPlaybackBar>` component renders floating controls above the Dock via a portal.

**Tech Stack:** Web Speech API (`speechSynthesis`), React 18, rehype (HAST), CSS, vitest

**Spec:** `docs/superpowers/specs/2026-04-14-readme-tts-reader-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/utils/rehypeTtsAnnotate.ts` | Rehype plugin — walks HAST, assigns `data-tts-*` attributes, builds sentence array and section map |
| `src/utils/rehypeTtsAnnotate.test.ts` | Tests for the rehype plugin |
| `src/hooks/useTtsReader.ts` | Hook — owns `speechSynthesis` lifecycle, exposes state/actions, DOM class toggling for highlights |
| `src/hooks/useTtsReader.test.ts` | Tests for the TTS hook |
| `src/components/TtsPlaybackBar.tsx` | Floating playback controls above the Dock |
| `src/components/TtsPlaybackBar.css` | Playback bar styles |
| `src/components/ReadmeRenderer.tsx` | Modified — wire in plugin, hook, speaker icons |
| `src/styles/globals.css` | Modified — add TTS highlight styles |

---

## Task 1: Rehype TTS Annotate Plugin

**Files:**
- Create: `src/utils/rehypeTtsAnnotate.ts`
- Create: `src/utils/rehypeTtsAnnotate.test.ts`

- [ ] **Step 1: Write failing tests for the plugin**

Create `src/utils/rehypeTtsAnnotate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import { rehypeTtsAnnotate, type TtsAnnotation } from './rehypeTtsAnnotate'

function process(html: string) {
  const output: TtsAnnotation = { sentences: [], sections: [] }
  const result = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeTtsAnnotate, { output })
    .use(rehypeStringify)
    .processSync(html)
  return { html: String(result), output }
}

describe('rehypeTtsAnnotate', () => {
  it('wraps words in spans with data-tts-word attributes', () => {
    const { html, output } = process('<p>Hello world.</p>')
    expect(output.sentences).toHaveLength(1)
    expect(output.sentences[0].text).toBe('Hello world.')
    expect(output.sentences[0].words).toEqual(['Hello', 'world.'])
    // Verify DOM structure has word-level spans
    expect(html).toContain('data-tts-word="0"')
    expect(html).toContain('data-tts-word="1"')
    expect(html).toContain('data-tts-sentence="0"')
  })

  it('splits multi-sentence paragraphs into separate sentence spans', () => {
    const { html, output } = process('<p>First sentence. Second sentence.</p>')
    expect(output.sentences).toHaveLength(2)
    expect(output.sentences[0].text).toBe('First sentence.')
    expect(output.sentences[1].text).toBe('Second sentence.')
    // Each sentence gets its own wrapper with a unique data-tts-sentence
    expect(html).toContain('data-tts-sentence="0"')
    expect(html).toContain('data-tts-sentence="1"')
  })

  it('skips code blocks', () => {
    const { output } = process('<p>Before.</p><pre><code>const x = 1</code></pre><p>After.</p>')
    expect(output.sentences).toHaveLength(2)
    expect(output.sentences.map(s => s.text)).toEqual(['Before.', 'After.'])
  })

  it('skips images and tables', () => {
    const { output } = process('<p>Text.</p><img src="x.png"/><table><tr><td>Data</td></tr></table>')
    expect(output.sentences).toHaveLength(1)
    expect(output.sentences[0].text).toBe('Text.')
  })

  it('records section map from h2/h3 headings', () => {
    const { output } = process('<h2>Intro</h2><p>Hello.</p><h3>Details</h3><p>More.</p>')
    expect(output.sections).toHaveLength(2)
    expect(output.sections[0]).toEqual({ headingText: 'Intro', sentenceIndex: 0 })
    expect(output.sections[1]).toEqual({ headingText: 'Details', sentenceIndex: 1 })
  })

  it('handles empty content gracefully', () => {
    const { output } = process('')
    expect(output.sentences).toHaveLength(0)
    expect(output.sections).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/rehypeTtsAnnotate.test.ts`
Expected: FAIL — module `./rehypeTtsAnnotate` not found

- [ ] **Step 3: Implement the rehype plugin**

Create `src/utils/rehypeTtsAnnotate.ts`:

```typescript
import { visit, SKIP } from 'unist-util-visit'
import type { Root, Element, Text, ElementContent } from 'hast'

export interface TtsSentence {
  sentenceIndex: number
  text: string
  words: string[]
}

export interface TtsSection {
  headingText: string
  sentenceIndex: number
}

export interface TtsAnnotation {
  sentences: TtsSentence[]
  sections: TtsSection[]
}

interface Options {
  output: TtsAnnotation
}

const SKIP_TAGS = new Set(['pre', 'code', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'svg', 'video', 'audio'])

// Split text into sentences on . ! ? followed by whitespace or end-of-string.
// Keeps the punctuation attached to the sentence.
function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g)
  if (!raw) return text.trim() ? [text.trim()] : []
  return raw.map(s => s.trim()).filter(Boolean)
}

function extractText(node: Element): string {
  let text = ''
  for (const child of node.children) {
    if (child.type === 'text') text += (child as Text).value
    else if (child.type === 'element' && !SKIP_TAGS.has((child as Element).tagName)) {
      text += extractText(child as Element)
    }
  }
  return text
}

// Build word-level <span> elements for a sentence
function makeWordSpans(words: string[]): ElementContent[] {
  const children: ElementContent[] = []
  words.forEach((word, i) => {
    if (i > 0) children.push({ type: 'text', value: ' ' })
    children.push({
      type: 'element',
      tagName: 'span',
      properties: { dataTtsWord: String(i) },
      children: [{ type: 'text', value: word }],
    })
  })
  return children
}

// Build a sentence-level <span> wrapping word spans
function makeSentenceSpan(sentenceIndex: number, words: string[]): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { dataTtsSentence: String(sentenceIndex) },
    children: makeWordSpans(words),
  }
}

export function rehypeTtsAnnotate(options: Options) {
  const { output } = options
  let sentenceCounter = 0

  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      // Skip non-readable elements entirely
      if (SKIP_TAGS.has(node.tagName)) return SKIP

      // Record section headings
      if (node.tagName === 'h2' || node.tagName === 'h3') {
        const headingText = extractText(node).trim()
        if (headingText) {
          output.sections.push({ headingText, sentenceIndex: sentenceCounter })
        }
        return SKIP
      }

      // Only annotate leaf text containers (p, li, dd)
      if (node.tagName !== 'p' && node.tagName !== 'li' && node.tagName !== 'dd') return

      const fullText = extractText(node).trim()
      if (!fullText) return SKIP

      const sentences = splitSentences(fullText)

      // Replace the node's children with sentence/word spans
      const newChildren: ElementContent[] = []

      for (const sentenceText of sentences) {
        const words = sentenceText.split(/\s+/).filter(Boolean)
        output.sentences.push({
          sentenceIndex: sentenceCounter,
          text: sentenceText,
          words,
        })

        if (newChildren.length > 0) {
          newChildren.push({ type: 'text', value: ' ' })
        }
        newChildren.push(makeSentenceSpan(sentenceCounter, words))
        sentenceCounter++
      }

      // Replace original children with annotated spans
      node.children = newChildren

      return SKIP
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/rehypeTtsAnnotate.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/rehypeTtsAnnotate.ts src/utils/rehypeTtsAnnotate.test.ts
git commit -m "feat: add rehypeTtsAnnotate plugin for TTS sentence/word extraction"
```

---

## Task 2: TTS Highlight Styles

**Files:**
- Modify: `src/styles/globals.css` (after `.readme-body` block, ~line 3267)

- [ ] **Step 1: Add TTS highlight CSS rules**

Add the following after the `.readme-body` block (around line 3267) in `src/styles/globals.css`:

```css
/* ── TTS Read-Aloud Highlighting ── */
.readme-body.tts-playing [data-tts-sentence] {
  transition: opacity 0.2s ease;
  opacity: 0.4;
}

.readme-body.tts-playing .tts-active-sentence {
  opacity: 1;
  background: rgba(124, 58, 237, 0.15);
  border-radius: 4px;
}

.readme-body.tts-playing .tts-active-word {
  background: #7c3aed;
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}
```

- [ ] **Step 2: Verify styles are syntactically valid**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (app still renders — no CSS parse errors breaking the build)

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add TTS highlighting CSS rules for sentence and word tracking"
```

---

## Task 3: `useTtsReader` Hook

**Files:**
- Create: `src/hooks/useTtsReader.ts`
- Create: `src/hooks/useTtsReader.test.ts`

- [ ] **Step 1: Write failing tests for the hook**

Create `src/hooks/useTtsReader.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTtsReader } from './useTtsReader'
import type { TtsSentence, TtsSection } from '../utils/rehypeTtsAnnotate'

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
  vi.clearAllMocks()
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

  it('play() calls speechSynthesis.speak and sets status to playing', () => {
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

  it('stop() cancels speech and resets to idle', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.stop())
    expect(mockCancel).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.currentSentence).toBe(-1)
  })

  it('pause() calls speechSynthesis.pause', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.pause())
    expect(mockPause).toHaveBeenCalled()
    expect(result.current.status).toBe('paused')
  })

  it('resume() calls speechSynthesis.resume', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    act(() => result.current.pause())
    act(() => result.current.resume())
    expect(mockResume).toHaveBeenCalled()
    expect(result.current.status).toBe('playing')
  })

  it('setSpeed restarts current sentence at new rate', () => {
    const { result } = renderHook(() =>
      useTtsReader(sentences, sections, makeContainerRef())
    )
    act(() => result.current.play())
    mockSpeak.mockClear()
    mockCancel.mockClear()
    act(() => result.current.setSpeed(1.5))
    expect(mockCancel).toHaveBeenCalled()
    expect(mockSpeak).toHaveBeenCalled()
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useTtsReader.test.ts`
Expected: FAIL — module `./useTtsReader` not found

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useTtsReader.ts`:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react'
import type { TtsSentence, TtsSection } from '../utils/rehypeTtsAnnotate'

type TtsStatus = 'idle' | 'playing' | 'paused'

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

  // ── DOM highlighting helpers ──
  const prevSentenceEl = useRef<Element | null>(null)
  const prevWordEl = useRef<Element | null>(null)

  const clearHighlights = useCallback(() => {
    prevSentenceEl.current?.classList.remove('tts-active-sentence')
    prevWordEl.current?.classList.remove('tts-active-word')
    containerRef.current?.classList.remove('tts-playing')
    prevSentenceEl.current = null
    prevWordEl.current = null
  }, [containerRef])

  const updateHighlight = useCallback((sentIdx: number, wordIdx: number) => {
    const container = containerRef.current
    if (!container) return

    container.classList.add('tts-playing')

    // Sentence highlight
    if (sentIdx !== (prevSentenceEl.current?.getAttribute('data-tts-sentence') ?? '')) {
      prevSentenceEl.current?.classList.remove('tts-active-sentence')
      const el = container.querySelector(`[data-tts-sentence="${sentIdx}"]`)
      el?.classList.add('tts-active-sentence')
      prevSentenceEl.current = el
    }

    // Word highlight
    prevWordEl.current?.classList.remove('tts-active-word')
    const sentEl = prevSentenceEl.current
    if (sentEl && wordIdx >= 0) {
      const wordEls = sentEl.querySelectorAll(`[data-tts-word]`)
      const wordEl = wordEls[wordIdx] ?? null
      wordEl?.classList.add('tts-active-word')
      prevWordEl.current = wordEl
    }
  }, [containerRef])

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

  // ── Core speak function ──
  const speakFrom = useCallback((fromSentence: number) => {
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
        updateHighlight(idx, 0)
      }

      utt.onboundary = (e) => {
        if (e.name !== 'word') return
        const spoken = sentences[idx].text.slice(0, e.charIndex)
        const wordIdx = spoken.split(/\s+/).filter(Boolean).length
        setCurrentWord(wordIdx)
        updateHighlight(idx, wordIdx)
      }

      utt.onend = () => {
        if (statusRef.current === 'playing') speakSentence(idx + 1)
      }

      speechSynthesis.speak(utt)
    }

    setStatus('playing')
    setCurrentSentence(fromSentence)
    speakSentence(fromSentence)
  }, [sentences, clearHighlights, updateHighlight])

  const play = useCallback((fromSentence = 0) => {
    speakFrom(fromSentence)
  }, [speakFrom])

  const pause = useCallback(() => {
    speechSynthesis.pause()
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    speechSynthesis.resume()
    setStatus('playing')
  }, [])

  const stop = useCallback(() => {
    speechSynthesis.cancel()
    setStatus('idle')
    setCurrentSentence(-1)
    setCurrentWord(-1)
    clearHighlights()
  }, [clearHighlights])

  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate)
    if (statusRef.current === 'playing') {
      speakFrom(sentenceRef.current)
    }
  }, [speakFrom])

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
      speechSynthesis.cancel()
      clearHighlights()
    }
  }, [clearHighlights])

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useTtsReader.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTtsReader.ts src/hooks/useTtsReader.test.ts
git commit -m "feat: add useTtsReader hook for speechSynthesis playback and highlighting"
```

---

## Task 4: `TtsPlaybackBar` Component

**Files:**
- Create: `src/components/TtsPlaybackBar.tsx`
- Create: `src/components/TtsPlaybackBar.css`

- [ ] **Step 1: Create the component CSS**

Create `src/components/TtsPlaybackBar.css`:

```css
/* ── TTS Playback Bar — floats above the Dock ── */
.tts-bar {
  position: fixed;
  bottom: 80px; /* above the Dock (Dock is at bottom: 20px, ~44px tall) */
  left: 50%;
  transform: translateX(-50%);
  z-index: 999; /* just below Dock's 1000 */
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  background: rgba(20, 20, 30, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--t3);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  animation: tts-bar-in 0.25s ease-out;
}

@keyframes tts-bar-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.tts-bar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--t2);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.tts-bar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--t1);
}

.tts-bar-btn--active {
  color: var(--accent-text);
}

.tts-bar-btn--stop:hover {
  color: #f87171;
}

.tts-bar-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
}

.tts-bar-section {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--t3);
  font-size: 11px;
  min-width: 90px;
  justify-content: center;
}

.tts-bar-section button {
  background: none;
  border: none;
  color: var(--t3);
  cursor: pointer;
  padding: 2px;
  font-size: 10px;
  line-height: 1;
}

.tts-bar-section button:hover {
  color: var(--t1);
}

.tts-bar-speed {
  background: rgba(255, 255, 255, 0.06);
  border: none;
  color: var(--t2);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  min-width: 36px;
  text-align: center;
}

.tts-bar-speed:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tts-bar-jump {
  background: rgba(124, 58, 237, 0.2);
  border: 1px solid rgba(124, 58, 237, 0.3);
  color: var(--accent-text);
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  white-space: nowrap;
}

.tts-bar-jump:hover {
  background: rgba(124, 58, 237, 0.3);
}
```

- [ ] **Step 2: Create the component**

Create `src/components/TtsPlaybackBar.tsx`:

```tsx
import { createPortal } from 'react-dom'
import { Pause, Play, Square, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import './TtsPlaybackBar.css'

interface Props {
  status: 'idle' | 'playing' | 'paused'
  speed: number
  autoScroll: boolean
  sections: { headingText: string; sentenceIndex: number }[]
  currentSentence: number
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSetSpeed: (rate: number) => void
  onToggleAutoScroll: () => void
  onJumpToCurrent: () => void
  onPlayFrom: (sentenceIndex: number) => void
}

const SPEEDS = [1, 1.25, 1.5, 2]

export default function TtsPlaybackBar({
  status, speed, autoScroll, sections, currentSentence,
  onPlay, onPause, onResume, onStop, onSetSpeed,
  onToggleAutoScroll, onJumpToCurrent, onPlayFrom,
}: Props) {
  if (status === 'idle') return null

  // Find which section the current sentence is in
  let currentSectionIdx = 0
  for (let i = sections.length - 1; i >= 0; i--) {
    if (currentSentence >= sections[i].sentenceIndex) {
      currentSectionIdx = i
      break
    }
  }

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed)
    const next = SPEEDS[(idx + 1) % SPEEDS.length]
    onSetSpeed(next)
  }

  const prevSection = () => {
    if (currentSectionIdx > 0) {
      onPlayFrom(sections[currentSectionIdx - 1].sentenceIndex)
    }
  }

  const nextSection = () => {
    if (currentSectionIdx < sections.length - 1) {
      onPlayFrom(sections[currentSectionIdx + 1].sentenceIndex)
    }
  }

  return createPortal(
    <div className="tts-bar">
      {/* Play / Pause */}
      <button
        className="tts-bar-btn"
        onClick={status === 'playing' ? onPause : onResume}
        title={status === 'playing' ? 'Pause' : 'Resume'}
      >
        {status === 'playing' ? <Pause size={14} /> : <Play size={14} />}
      </button>

      {/* Stop */}
      <button className="tts-bar-btn tts-bar-btn--stop" onClick={onStop} title="Stop">
        <Square size={12} />
      </button>

      <div className="tts-bar-divider" />

      {/* Section nav */}
      {sections.length > 0 && (
        <div className="tts-bar-section">
          <button onClick={prevSection} disabled={currentSectionIdx === 0} title="Previous section">
            <ChevronLeft size={12} />
          </button>
          <span>{currentSectionIdx + 1} / {sections.length}</span>
          <button onClick={nextSection} disabled={currentSectionIdx >= sections.length - 1} title="Next section">
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      <div className="tts-bar-divider" />

      {/* Speed */}
      <button className="tts-bar-speed" onClick={cycleSpeed} title="Playback speed">
        {speed}x
      </button>

      {/* Auto-scroll toggle */}
      <button
        className={`tts-bar-btn${autoScroll ? ' tts-bar-btn--active' : ''}`}
        onClick={onToggleAutoScroll}
        title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
      >
        <ScrollText size={14} />
      </button>

      {/* Jump to current */}
      {!autoScroll && (
        <button className="tts-bar-jump" onClick={onJumpToCurrent}>
          Jump to current
        </button>
      )}
    </div>,
    document.body
  )
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/TtsPlaybackBar.tsx src/components/TtsPlaybackBar.css
git commit -m "feat: add TtsPlaybackBar floating control component"
```

---

## Task 5: Wire Plugin, Hook, and Speaker Icons into ReadmeRenderer

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx`

This is the integration task — connecting all the pieces.

- [ ] **Step 1: Add imports at the top of ReadmeRenderer.tsx**

Add after the existing imports (around line 20):

```typescript
import { Volume2 } from 'lucide-react'
import { rehypeTtsAnnotate, type TtsAnnotation } from '../utils/rehypeTtsAnnotate'
import { useTtsReader } from '../hooks/useTtsReader'
import TtsPlaybackBar from './TtsPlaybackBar'
```

- [ ] **Step 2: Add TTS state and hook wiring inside the component**

Inside the `ReadmeRenderer` function body (after the existing `containerRef` at line 843), add:

```typescript
// ── TTS state ──
const ttsOutput = useRef<TtsAnnotation>({ sentences: [], sections: [] })
const [ttsReady, setTtsReady] = useState(false)
```

After the existing `useEffect` blocks (around line 900), add the `useTtsReader` hook call:

```typescript
const tts = useTtsReader(
  ttsReady ? ttsOutput.current.sentences : [],
  ttsReady ? ttsOutput.current.sections : [],
  containerRef,
)
```

And add a voice-readiness check:

```typescript
// Wait for speechSynthesis voices to load
useEffect(() => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const check = () => {
    if (speechSynthesis.getVoices().length > 0) setTtsReady(true)
  }
  check()
  speechSynthesis.onvoiceschanged = check
  return () => { speechSynthesis.onvoiceschanged = null }
}, [])
```

- [ ] **Step 3: Reset TTS output when content changes**

Add an effect that clears and rebuilds the TTS annotation when the content prop changes. Place after the TTS state:

```typescript
// Reset TTS annotation when content changes
useEffect(() => {
  ttsOutput.current = { sentences: [], sections: [] }
}, [content])
```

- [ ] **Step 4: Add the rehype plugin to the ReactMarkdown pipeline**

In the `rehypePlugins` array (line 1380), add `rehypeTtsAnnotate` at the end (after all other plugins, since it must run after sanitize):

Change:
```typescript
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks, rehypeGitHubRepoLinks, rehypeBlobLinks(repoOwner, repoName, basePath), rehypeFootnoteLinks, rehypeImageOnlyLinks]}
```

To:
```typescript
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks, rehypeGitHubRepoLinks, rehypeBlobLinks(repoOwner, repoName, basePath), rehypeFootnoteLinks, rehypeImageOnlyLinks, [rehypeTtsAnnotate, { output: ttsOutput.current }]]}
```

- [ ] **Step 5: Add the main speaker icon and TtsPlaybackBar**

Inside the `mdComponents` useMemo block, replace the existing `h1`, `h2`, and `h3` component renderers (lines 1042-1046). The existing renderers destructure `{ children, id }` and apply `className="rm-h1"` etc. — we must preserve the `id` (used by TOC scroll-to-heading) and the `rm-*` class names.

A helper to extract text from React children (handles inline markup like `## Getting **Started**`):

```typescript
// Add this helper inside ReadmeRenderer, before the mdComponents useMemo:
function extractChildText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractChildText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return extractChildText((children as any).props.children)
  }
  return ''
}
```

Replace the heading renderers:

```typescript
h1: ({ children, id }: any) => (
  <h1 id={id} className="rm-h1 tts-heading-wrap">
    {children}
    {ttsReady && ttsOutput.current.sentences.length > 0 && (
      <button
        className="tts-heading-btn"
        onClick={() => tts.play(0)}
        title="Read aloud"
      >
        <Volume2 size={18} />
      </button>
    )}
  </h1>
),
h2: ({ children, id }: any) => {
  const text = extractChildText(children)
  const section = ttsOutput.current.sections.find(s => s.headingText === text)
  return (
    <h2 id={id} className="rm-h2 tts-heading-wrap">
      {children}
      {ttsReady && section && (
        <button
          className="tts-heading-btn"
          onClick={() => tts.play(section.sentenceIndex)}
          title="Read from here"
        >
          <Volume2 size={14} />
        </button>
      )}
    </h2>
  )
},
h3: ({ children, id }: any) => {
  const text = extractChildText(children)
  const section = ttsOutput.current.sections.find(s => s.headingText === text)
  return (
    <h3 id={id} className="rm-h3 tts-heading-wrap">
      {children}
      {ttsReady && section && (
        <button
          className="tts-heading-btn"
          onClick={() => tts.play(section.sentenceIndex)}
          title="Read from here"
        >
          <Volume2 size={14} />
        </button>
      )}
    </h3>
  )
},
```

- [ ] **Step 6: Render TtsPlaybackBar after the readme-body div**

Just before the closing of the component's return (before the final lightbox/popover portals), add:

```tsx
<TtsPlaybackBar
  status={tts.status}
  speed={tts.speed}
  autoScroll={tts.autoScroll}
  sections={tts.sections}
  currentSentence={tts.currentSentence}
  onPlay={() => tts.play()}
  onPause={tts.pause}
  onResume={tts.resume}
  onStop={tts.stop}
  onSetSpeed={tts.setSpeed}
  onToggleAutoScroll={tts.toggleAutoScroll}
  onJumpToCurrent={tts.jumpToCurrent}
  onPlayFrom={(si) => tts.play(si)}
/>
```

- [ ] **Step 7: Add heading hover-reveal CSS to globals.css**

Append to the TTS section in `src/styles/globals.css` (after the highlight rules from Task 2):

```css
/* ── TTS heading speaker icons ── */
.tts-heading-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tts-heading-btn {
  opacity: 0;
  background: none;
  border: none;
  color: var(--t3);
  cursor: pointer;
  padding: 2px;
  display: flex;
  transition: opacity 0.15s;
}

.tts-heading-wrap:hover .tts-heading-btn {
  opacity: 1;
}

.tts-heading-btn:hover {
  color: var(--accent-text);
}
```

- [ ] **Step 8: Run the existing ReadmeRenderer tests**

Run: `npx vitest run src/components/ReadmeRenderer.test.tsx`
Expected: PASS — existing tests should not break (the TTS plugin runs silently alongside)

- [ ] **Step 9: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/styles/globals.css
git commit -m "feat: integrate TTS plugin, hook, speaker icons, and playback bar into ReadmeRenderer"
```

---

## Task 6: Manual Smoke Test Checklist

This task is a manual verification pass — no automated tests.

- [ ] **Step 1: Launch the app and navigate to a repo with a README**

Run: `npm run dev` (or the Electron launch command)

- [ ] **Step 2: Verify speaker icon appears next to the README h1**

Look for the Volume2 icon. It should only appear if the README has extractable prose.

- [ ] **Step 3: Click the main speaker icon — verify TTS starts**

- Audio should play via system speakers
- The playback bar should animate in above the Dock
- Sentences should highlight with a purple tint
- The active word should have a strong purple background

- [ ] **Step 4: Test playback controls**

- Pause/resume toggles correctly
- Stop hides the bar and clears highlights
- Speed cycles through 1x, 1.25x, 1.5x, 2x
- Section nav arrows skip between sections

- [ ] **Step 5: Test auto-scroll**

- Scroll down during playback — auto-scroll should disable
- "Jump to current" pill should appear in the bar
- Click it — should scroll back and re-enable auto-scroll

- [ ] **Step 6: Test section entry points**

- Hover over an h2/h3 heading — small speaker icon should appear
- Click it — playback should start from that section

- [ ] **Step 7: Navigate away during playback**

- Click a different nav item while TTS is playing
- Audio should stop immediately with no errors

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "chore: finalize README TTS reader feature"
```
