# README Text-to-Speech Reader — Design Spec

**Date:** 2026-04-14
**Status:** Approved

## Overview

Add a text-to-speech feature to the README view so users can listen to a repo's README read aloud with real-time word and sentence highlighting. A speaker icon next to the README title starts full playback; smaller icons on section headings allow starting from any section. A floating playback bar above the Dock provides play/pause, stop, speed control, and auto-scroll management.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TTS engine | Browser-native `speechSynthesis` (Web Speech API) | Free, offline-capable, zero dependencies, matches STT precedent |
| Highlighting style | Sentence + word combo | Active sentence gets a subtle tint; active word within it gets a strong highlight |
| Content scope | Full README + section entry points | Main icon reads everything; per-heading icons start from that section |
| Playback controls | Compact floating bar above Dock | Play/pause, stop, speed, section nav, auto-scroll toggle |
| Auto-scroll | On by default, toggleable | Disables on manual scroll; "Jump to current" button when off |
| Architecture | Self-contained hook + component | `useTtsReader` hook, `TtsPlaybackBar` component, `rehypeTtsAnnotate` plugin |

## Architecture

### 1. Text Extraction & Sentence Chunking — `rehypeTtsAnnotate` plugin

A new rehype plugin that runs after `rehype-sanitize` in the `ReadmeRenderer` pipeline:

1. Walks the HAST tree in reading order
2. Skips non-readable nodes: images, code blocks (`pre`/`code`), badges, tables
3. Assigns `data-tts-sentence="N"` to text-containing elements
4. Wraps individual words in spans with `data-tts-word="N"` (word index within the sentence)
5. Records a section map: `{ headingText, sentenceIndex }[]` for each `h2`/`h3`, enabling section-level entry points
6. Produces a side-channel output: `{ sentenceIndex, text, words: string[] }[]` for the hook to consume. Delivery mechanism: a mutable object is passed via rehype plugin options (e.g., `{ result: [] }`), and the plugin populates it during tree traversal. The component reads from this object after rendering.

**Sentence splitting:** Regex-based — split on `.` `!` `?` followed by whitespace or end-of-string. Known limitation: will misfire on version numbers (`v2.0.1`), URLs, abbreviations (`e.g.`), and file paths. Acceptable for v1 — the splitter can be refined iteratively without architectural changes.

### 2. `useTtsReader` Hook

**Input:** Array of sentence strings from the rehype plugin.

**Exposed state:**
- `status`: `'idle' | 'playing' | 'paused'`
- `currentSentence`: number (active sentence index)
- `currentWord`: number (active word index within current sentence)
- `speed`: number (playback rate)
- `autoScroll`: boolean

**Exposed actions:**
- `play(fromSentence?: number)` — start playback, optionally from a specific sentence (for section entry points)
- `pause()` — pause current utterance
- `resume()` — resume paused utterance
- `stop()` — cancel speech, reset to idle
- `setSpeed(rate: number)` — cancel current utterance, restart current sentence at new rate (API limitation: rate can't change mid-utterance)
- `toggleAutoScroll()` — toggle auto-scroll on/off

**Implementation details:**
- Creates one `SpeechSynthesisUtterance` per sentence, chained via the `end` event
- Uses the `boundary` event (`charIndex` + `charLength`) to track the active word
- Voice selection: picks the first English voice whose name contains "natural" or "enhanced", falling back to the system default
- Cleanup: `useEffect` cleanup calls `speechSynthesis.cancel()` on unmount or navigation

### 3. Highlighting

DOM-driven via the hook — no React re-renders of ReactMarkdown:

- The `useTtsReader` hook directly manipulates the DOM to toggle highlighting classes. When `currentSentence` or `currentWord` changes, the hook:
  1. Removes `.tts-active-sentence` from the previously active sentence element
  2. Adds `.tts-active-sentence` to the new `[data-tts-sentence="N"]` element
  3. Removes `.tts-active-word` from the previously active word span
  4. Adds `.tts-active-word` to the new `[data-tts-word="N"]` span within the active sentence
  5. Adds `.tts-playing` to the `.readme-body` container when TTS is active (removed on stop)
- CSS rules in `globals.css` target these classes:
  - `.tts-playing [data-tts-sentence]`: reduced opacity (unfocused sentences)
  - `.tts-active-sentence`: subtle purple tint (`rgba(124, 58, 237, 0.15)`), full opacity
  - `.tts-active-word`: strong highlight (`#7c3aed` background, white text, `border-radius: 3px`)
- Element lookup uses `containerRef.current.querySelector('[data-tts-sentence="N"]')` — fast since it's scoped to the readme container.

This avoids ReactMarkdown re-renders entirely. The hook receives `containerRef` and manipulates classes directly.

### 4. Auto-scroll

- On `currentSentence` change: `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` on the active sentence element
- `autoScroll` defaults to `true`
- User-initiated scroll detection: a scroll event listener on the README panel checks if the scroll was programmatic (flagged) or manual. Manual scroll disables auto-scroll.
- When auto-scroll is off, a "Jump to current" pill appears in the playback bar. Clicking it scrolls to the active sentence and re-enables auto-scroll.

### 5. UI Components

#### Speaker Icons

- **Main icon:** `Volume2` from `lucide-react`, placed next to the README `h1` title. Clicking calls `play()` from sentence 0.
- **Section icons:** Smaller `Volume2` icons on each `h2`/`h3`, visible on hover. Clicking calls `play(sentenceIndexForThatSection)` using the section map from the rehype plugin.
- Icons don't render if `window.speechSynthesis` is unavailable or if the README has fewer than 1 extractable sentence.

#### `<TtsPlaybackBar>`

- **Position:** Fixed above the Dock, same horizontal centering, offset upward. Rendered via a React portal.
- **Visibility:** Only when `status !== 'idle'`. Animates in/out with slide-up + fade.
- **Controls:**
  - Play/Pause toggle button
  - Stop button (stops playback, hides bar)
  - Section indicator: "Section 2 of 5" with left/right arrows to skip between sections
  - Speed control: cycles through `1x → 1.25x → 1.5x → 2x` on click
  - Auto-scroll toggle: scroll icon, highlighted when active
  - "Jump to current" pill: visible only when auto-scroll is off
- **Styling:** Glassmorphic background (`backdrop-filter: blur(12px)`), purple accent border (`rgba(124, 58, 237, 0.3)`), matches existing app aesthetic.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useTtsReader.ts` | New — hook with all speechSynthesis logic |
| `src/components/TtsPlaybackBar.tsx` | New — floating playback controls |
| `src/components/TtsPlaybackBar.css` | New — playback bar styles |
| `src/components/ReadmeRenderer.tsx` | Add `rehypeTtsAnnotate` plugin, speaker icons, TTS hook integration, CSS custom property updates |
| `src/styles/globals.css` | Add `[data-tts-*]` highlight styles |

## Edge Cases

- **No `speechSynthesis`:** Speaker icons don't render. No error.
- **Voice loading delay:** Wait for `speechSynthesis.onvoiceschanged` before enabling icons.
- **Navigation during playback:** `useEffect` cleanup cancels speech.
- **Empty/short READMEs:** Icons don't render if fewer than 1 extractable sentence.
- **Language:** No detection. Browser's default voice handles whatever language is present. Best-effort for non-English.
- **Long READMEs:** No limit. One utterance per sentence, so memory is not an issue.
- **Speed change mid-sentence:** Cancels and restarts current sentence at new rate.
- **Tab/focus switching:** Speech continues in background (expected behavior, like a podcast).

## Out of Scope

- Cloud TTS / HD voices — browser-native only for now
- Reading code blocks or tables aloud
- Language detection or voice picker UI
- Persisting playback position across navigation
