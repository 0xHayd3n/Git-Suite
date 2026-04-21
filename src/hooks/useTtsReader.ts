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

/** Lightweight external store so TtsPlaybackBar can subscribe without re-rendering ReadmeRenderer. */
export interface TtsSentenceStore {
  subscribe: (cb: () => void) => () => void
  getSnapshot: () => number
}

/** Normalize text for natural speech. */
function normalizeForSpeech(text: string): string {
  return text
    // " / " between words → "and or"
    .replace(/\s+\/\s+/g, ' and or ')
    // Raw URLs → contextual replacement
    .replace(/https?:\/\/\S+/g, (url, offset, str) => {
      // Check what precedes the URL to pick a natural phrase
      const before = str.slice(0, offset).trimEnd()
      if (/see$/i.test(before)) return 'the link here'
      if (/(?:at|visit|on|from)$/i.test(before)) return 'the link here'
      if (/:$/.test(before)) return 'the link provided'
      return 'this link here'
    })
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
  const [speed, setSpeedState] = useState(1)
  const [autoScroll, setAutoScroll] = useState(true)

  const statusRef = useRef(status)
  statusRef.current = status
  const speedRef = useRef(speed)
  speedRef.current = speed
  const sentenceRef = useRef(-1)
  const autoScrollRef = useRef(true)
  autoScrollRef.current = autoScroll
  const programmaticScrollRef = useRef(false)

  // Micro external-store: lets TtsPlaybackBar subscribe to sentence changes
  // without triggering re-renders in ReadmeRenderer.
  const sentenceListenersRef = useRef(new Set<() => void>())
  const sentenceStore = useRef<TtsSentenceStore>({
    subscribe(cb) { sentenceListenersRef.current.add(cb); return () => { sentenceListenersRef.current.delete(cb) } },
    getSnapshot() { return sentenceRef.current },
  }).current

  const setSentence = useCallback((idx: number) => {
    sentenceRef.current = idx
    sentenceListenersRef.current.forEach(cb => cb())
  }, [])

  /** Find the DOM element responsible for a given sentence index.
   *  Multi-sentence paragraphs only carry the *first* sentence index on
   *  their `data-tts-sentence` attribute, so an exact querySelector miss
   *  means the sentence lives inside a paragraph that starts earlier. */
  const findSentenceEl = useCallback((idx: number): Element | null => {
    const container = containerRef.current
    if (!container) return null
    const exact = container.querySelector(`[data-tts-sentence="${idx}"]`)
    if (exact) return exact
    // Fallback: find the element whose sentence index is the largest value ≤ idx
    let best: Element | null = null
    let bestSi = -1
    container.querySelectorAll('[data-tts-sentence]').forEach(el => {
      const si = parseInt(el.getAttribute('data-tts-sentence')!, 10)
      if (si <= idx && si > bestSi) { best = el; bestSi = si }
    })
    return best
  }, [containerRef])

  const doAutoScroll = useCallback((idx: number) => {
    if (idx < 0 || !autoScrollRef.current) return
    const el = findSentenceEl(idx)
    if (!el) return

    // Scroll only when the element is outside the visible area of its scroll
    // container — avoids the aggressive re-centering that `scrollIntoView`
    // does (which shifts the entire readme on every sentence change).
    const scrollParent = containerRef.current?.closest('.article-layout') as HTMLElement | null
    if (!scrollParent) return

    const elRect = el.getBoundingClientRect()
    const spRect = scrollParent.getBoundingClientRect()
    const margin = spRect.height * 0.15 // 15% buffer at top/bottom edges

    if (elRect.top >= spRect.top + margin && elRect.bottom <= spRect.bottom - margin) {
      return // element already comfortably visible — no scroll needed
    }

    // Calculate scroll offset to place the element ~30% from the top of the container
    const elOffsetInContainer = el.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop
    const target = elOffsetInContainer - spRect.height * 0.3

    programmaticScrollRef.current = true
    scrollParent.scrollTo({ top: target, behavior: 'smooth' })
    setTimeout(() => { programmaticScrollRef.current = false }, 500)
  }, [findSentenceEl, containerRef])

  /** Set sentence + auto-scroll (used when advancing forward). */
  const advanceSentence = useCallback((idx: number) => {
    setSentence(idx)
    doAutoScroll(idx)
  }, [setSentence, doAutoScroll])

  // -- Engine state --
  const engineRef = useRef<TtsEngine>('browser')
  const voiceRef = useRef<string>('en-US-AriaNeural')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nextBufferRef = useRef<Promise<SynthesisResult | null> | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const wordBoundariesRef = useRef<WordBoundary[]>([])
  const stoppedRef = useRef(false)

  // -- DOM highlighting helpers --
  // Word highlighting uses the CSS Custom Highlight API (Chromium 105+) which
  // marks a Range without modifying the DOM — no text-node splitting, no span
  // insertion, no normalize(), so zero layout reflow per word change.
  const prevSentenceEl = useRef<Element | null>(null)
  const highlightCursor = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cssHighlights = (CSS as any).highlights as Map<string, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const HighlightCtor = (globalThis as any).Highlight as (new (...ranges: Range[]) => unknown) | undefined

  // -- Animated highlight state --
  // Instead of snapping word-by-word, the highlight smoothly sweeps forward
  // from the start of the sentence to the current word using rAF interpolation.
  const highlightAnimTarget = useRef(0)
  const highlightAnimCurrent = useRef(0)
  const highlightAnimRaf = useRef(0)

  /** Paint the continuous highlight from character 0 to `endPos` in `sentEl`. */
  const drawHighlightAt = useCallback((sentEl: Element, endPos: number) => {
    cssHighlights?.delete('tts-word')
    if (endPos <= 0 || !HighlightCtor) return

    const walker = document.createTreeWalker(sentEl, NodeFilter.SHOW_TEXT)
    let cumLen = 0
    let firstTextNode: Text | null = null

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const nodeLen = textNode.textContent?.length ?? 0
      if (!firstTextNode) firstTextNode = textNode

      if (cumLen + nodeLen >= endPos) {
        const range = new Range()
        range.setStart(firstTextNode!, 0)
        range.setEnd(textNode, endPos - cumLen)
        cssHighlights!.set('tts-word', new HighlightCtor(range))
        return
      }
      cumLen += nodeLen
    }
  }, [cssHighlights, HighlightCtor])

  /** Start or restart the rAF loop that lerps the highlight toward its target. */
  const startHighlightAnimation = useCallback(() => {
    cancelAnimationFrame(highlightAnimRaf.current)

    const tick = () => {
      const sentEl = prevSentenceEl.current
      if (!sentEl) return

      const current = highlightAnimCurrent.current
      const target = highlightAnimTarget.current

      if (Math.abs(target - current) < 0.5) {
        highlightAnimCurrent.current = target
        drawHighlightAt(sentEl, target)
        highlightAnimRaf.current = 0
        return
      }

      const next = current + (target - current) * 0.15
      highlightAnimCurrent.current = next
      drawHighlightAt(sentEl, Math.round(next))
      highlightAnimRaf.current = requestAnimationFrame(tick)
    }

    highlightAnimRaf.current = requestAnimationFrame(tick)
  }, [drawHighlightAt])

  const clearHighlights = useCallback(() => {
    cancelAnimationFrame(highlightAnimRaf.current)
    highlightAnimRaf.current = 0
    highlightAnimCurrent.current = 0
    highlightAnimTarget.current = 0
    prevSentenceEl.current?.classList.remove('tts-active-sentence')
    cssHighlights?.delete('tts-word')
    prevSentenceEl.current = null
    highlightCursor.current = 0
  }, [cssHighlights])

  const updateHighlight = useCallback((sentIdx: number, wordText: string) => {
    const container = containerRef.current
    if (!container) return

    const el = findSentenceEl(sentIdx)
    if (el && el !== prevSentenceEl.current) {
      // New element — reset animation and switch
      cancelAnimationFrame(highlightAnimRaf.current)
      highlightAnimRaf.current = 0
      highlightAnimCurrent.current = 0
      highlightAnimTarget.current = 0
      prevSentenceEl.current?.classList.remove('tts-active-sentence')
      el.classList.add('tts-active-sentence')
      prevSentenceEl.current = el
      highlightCursor.current = 0
    }
    // If same element (multi-sentence paragraph), cursor keeps advancing

    const sentEl = prevSentenceEl.current
    if (!sentEl || !wordText || !HighlightCtor) return

    // Search the full text from the cursor so repeated words ("it", "a", etc.)
    // highlight the correct occurrence, not the first one every time.
    const fullText = sentEl.textContent ?? ''
    const pos = fullText.indexOf(wordText, highlightCursor.current)
    if (pos === -1) return

    highlightCursor.current = pos + wordText.length

    // Set animation target and let the rAF loop smoothly sweep to it
    highlightAnimTarget.current = pos + wordText.length
    startHighlightAnimation()
  }, [containerRef, HighlightCtor, startHighlightAnimation, findSentenceEl])

  // -- Manual scroll detection --
  useEffect(() => {
    const container = containerRef.current?.closest('.article-layout')
    if (!container || status !== 'playing') return
    const handler = () => {
      if (!programmaticScrollRef.current) setAutoScroll(false)
    }
    container.addEventListener('scroll', handler, { passive: true })
    return () => container.removeEventListener('scroll', handler)
  }, [status, containerRef])

  // -- Initialize engine on mount --
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

  // -- Create reusable Audio element --
  useEffect(() => {
    audioRef.current = new Audio()
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  // -- Helper: revoke current blob URL --
  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  // -- Helper: pre-buffer next sentence --
  const preBufferNext = useCallback((nextIdx: number) => {
    if (nextIdx >= sentences.length) {
      nextBufferRef.current = null
      return
    }
    nextBufferRef.current = window.api.tts.synthesize(
      normalizeForSpeech(sentences[nextIdx].text),
      voiceRef.current,
    ).catch(() => null)
  }, [sentences])

  // -- Edge engine: speak a sentence --
  const edgeSpeakSentence = useCallback((idx: number, preBuffered?: SynthesisResult | null) => {
    if (idx >= sentences.length) {
      setStatus('idle')
      setSentence(-1)
      clearHighlights()
      revokeBlobUrl()
      return
    }

    advanceSentence(idx)

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

      // Highlight first word from word boundaries (same source as onTimeUpdate)
      if (result.wordBoundaries.length > 0) {
        updateHighlight(idx, result.wordBoundaries[0].text)
      }

      // Word sync via timeupdate — start at 0 since first word already highlighted
      let lastWordIdx = result.wordBoundaries.length > 0 ? 0 : -1
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
    }

    if (preBuffered) {
      playSynthesized(preBuffered)
      // Pre-buffer was already kicked off in onEnded of previous sentence
    } else {
      window.api.tts.synthesize(normalizeForSpeech(sentences[idx].text), voiceRef.current)
        .then(result => {
          if (stoppedRef.current) return
          playSynthesized(result)
          preBufferNext(idx + 1)
        })
        .catch(() => {
          // Edge TTS failed -- fall back to browser engine
          engineRef.current = 'browser'
          browserSpeakFrom(idx)
        })
    }
  }, [sentences, clearHighlights, updateHighlight, revokeBlobUrl, preBufferNext, advanceSentence, setSentence])

  // -- Browser engine: speak from sentence (existing logic) --
  const browserSpeakFrom = useCallback((fromSentence: number) => {
    if (!sentences.length || fromSentence >= sentences.length) return
    speechSynthesis.cancel()

    const voice = pickVoice()

    const speakSentence = (idx: number) => {
      if (idx >= sentences.length) {
        setStatus('idle')
        setSentence(-1)
        clearHighlights()
        return
      }

      const utt = new SpeechSynthesisUtterance(normalizeForSpeech(sentences[idx].text))
      utt.rate = speedRef.current
      if (voice) utt.voice = voice

      utt.onstart = () => {
        advanceSentence(idx)
      }

      utt.onboundary = (e) => {
        if (e.name !== 'word') return
        const word = sentences[idx].text.slice(e.charIndex, e.charIndex + (e.charLength ?? 0))
        updateHighlight(idx, word)
      }

      utt.onend = () => {
        if (statusRef.current === 'playing') speakSentence(idx + 1)
      }

      speechSynthesis.speak(utt)
    }

    speakSentence(fromSentence)
  }, [sentences, clearHighlights, updateHighlight, advanceSentence, setSentence])

  // -- Public API --
  const play = useCallback((fromSentence = 0) => {
    if (!sentences.length || fromSentence >= sentences.length) return
    stoppedRef.current = false
    setStatus('playing')
    setSentence(fromSentence)
    nextBufferRef.current = null

    if (engineRef.current === 'edge') {
      speechSynthesis.cancel()
      // Discard old Audio element to shed any stale timeupdate/ended
      // listeners from previous play sessions (stop() pauses but cannot
      // remove the anonymous listeners added inside edgeSpeakSentence).
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      audioRef.current = new Audio()
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
    setSentence(-1)
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
      if (audioRef.current) audioRef.current.playbackRate = rate
    } else if (statusRef.current === 'playing') {
      browserSpeakFrom(sentenceRef.current)
    }
  }, [browserSpeakFrom])

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(prev => !prev)
  }, [])

  const jumpToCurrent = useCallback(() => {
    setAutoScroll(true)
    const el = findSentenceEl(sentenceRef.current)
    if (!el) return

    const scrollParent = containerRef.current?.closest('.article-layout') as HTMLElement | null
    if (!scrollParent) return

    const spRect = scrollParent.getBoundingClientRect()
    const elOffsetInContainer = el.getBoundingClientRect().top - spRect.top + scrollParent.scrollTop
    const target = elOffsetInContainer - spRect.height * 0.3

    programmaticScrollRef.current = true
    scrollParent.scrollTo({ top: target, behavior: 'smooth' })
    setTimeout(() => { programmaticScrollRef.current = false }, 500)
  }, [findSentenceEl, containerRef])

  // -- Cleanup on unmount --
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
    sentenceStore,
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
