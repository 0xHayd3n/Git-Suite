# Edge TTS Engine Swap — Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Depends on:** [README TTS Reader Design](2026-04-14-readme-tts-reader-design.md)

## Overview

Swap the TTS engine from browser-native `speechSynthesis` to `msedge-tts` (Microsoft Edge neural voices) for human-sounding speech. Falls back to `speechSynthesis` when offline. Voice preference exposed in the app Settings.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TTS engine | `msedge-tts` v2.0.4 | Neural voices, free, no API key, streaming audio + word boundary metadata |
| Fallback | `speechSynthesis` when offline | Graceful degradation — robotic voice beats silence |
| Audio delivery | Sentence-buffer with look-ahead | Buffer full audio per sentence in main process, pre-buffer next sentence while current plays |
| Audio format | 24kHz MP3 (`audio-24khz-48kbitrate-mono-mp3`) | Widest browser/Electron compatibility |
| Word sync | Word boundary timeline + `timeupdate` event | `msedge-tts` provides word offsets; compare `audio.currentTime` against timeline |
| Speed control | Client-side `audio.playbackRate` | Instant speed changes, no re-synthesis needed, sounds natural up to 2x |
| Voice selection | Curated list of 3-4 voices in Settings | Clean UX — no overwhelming 400+ voice catalog |
| Voice storage | SQLite key-value (`tts_voice`) | Same pattern as `preferred_language` |

## Architecture

### 1. Electron TTS Service — `electron/services/ttsService.ts`

A new service wrapping `msedge-tts`. Runs in the Electron main process (Node.js).

**State:** Holds a single `MsEdgeTTS` instance, reused across calls. `setMetadata()` called once per voice change.

**Curated voice list:** Hardcoded array of voice `ShortName` values + display labels:
```ts
const CURATED_VOICES = [
  { shortName: 'en-US-AriaNeural', label: 'Aria (Female)' },
  { shortName: 'en-US-GuyNeural', label: 'Guy (Male)' },
  { shortName: 'en-US-JennyNeural', label: 'Jenny (Female)' },
  { shortName: 'en-GB-SoniaNeural', label: 'Sonia (Female, British)' },
]
```

**Functions:**

- **`synthesizeSentence(text: string, voiceName: string): Promise<{ audio: Buffer, wordBoundaries: WordBoundary[] }>`**
  - Calls `tts.toStream(text)` with `wordBoundaryEnabled: true`
  - Collects the full audio buffer from `audioStream` and all word boundary metadata from `metadataStream`
  - Converts offsets from 100-nanosecond units to milliseconds
  - Returns `{ audio: Buffer, wordBoundaries: [{ text: string, offsetMs: number }] }`

- **`getVoices(): CuratedVoice[]`**
  - Returns the hardcoded curated voice list (no network call)

- **`checkAvailable(): Promise<boolean>`**
  - Attempts to initialize the `MsEdgeTTS` WebSocket connection with a 3-second timeout
  - Returns `true` if connection succeeds, `false` otherwise

### 2. IPC Handlers — `electron/ipc/ttsHandlers.ts`

Following existing pattern (`downloadHandlers.ts`): `export function registerTtsHandlers()` called from `main.ts`.

**Channels:**

| Channel | Input | Output | Notes |
|---------|-------|--------|-------|
| `tts:synthesize` | `{ text: string, voiceName: string }` | `{ audio: Buffer, wordBoundaries: WordBoundary[] }` | Buffer serializes via Electron structured clone |
| `tts:getVoices` | — | `CuratedVoice[]` | Returns hardcoded list |
| `tts:checkAvailable` | — | `boolean` | 3-second timeout |

**Preload bridge** additions in `electron/preload.ts`:
```ts
tts: {
  synthesize: (text: string, voiceName: string) =>
    ipcRenderer.invoke('tts:synthesize', { text, voiceName }),
  getVoices: () => ipcRenderer.invoke('tts:getVoices'),
  checkAvailable: () => ipcRenderer.invoke('tts:checkAvailable'),
}
```

### 3. Hook Changes — `src/hooks/useTtsReader.ts`

The hook's **public API is unchanged** — same `status`, `play`, `pause`, `resume`, `stop`, `setSpeed`, `toggleAutoScroll`, `jumpToCurrent`. Only the internal engine swaps.

**Initialization:**
- On mount: call `tts:checkAvailable` and `settings:get('tts_voice')`
- Store `engine: 'edge' | 'browser'` in a ref
- If no saved voice preference, default to first curated voice

**Edge engine path (replaces `speechSynthesis` utterance chain):**

1. Call `tts:synthesize(sentenceText, voiceName)` → `{ audio, wordBoundaries }`
2. Create blob URL: `URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }))`
3. Set as `src` on a reusable `Audio` element (created once via ref, not in DOM)
4. Set `audio.playbackRate = speedRef.current`
5. Register `timeupdate` listener: walk `wordBoundaries` array, find last boundary where `offsetMs <= audio.currentTime * 1000`, call `updateHighlight(sentIdx, boundary.text)`
6. On `ended` event: revoke blob URL, play next sentence from pre-buffer

**Pre-buffering:**
- When a sentence starts playing, fire `tts:synthesize` for the next sentence
- Store the promise result in a `nextBuffer` ref
- When current sentence ends, next one is ready instantly — no gap

**Pause/resume:** `audioRef.current.pause()` / `.play()`. No re-synthesis.

**Speed change:** `audioRef.current.playbackRate = rate`. Instant, no interruption.

**Stop:** `audioRef.current.pause()`, revoke blob URL, clear highlights.

**Browser fallback path:** Existing `speechSynthesis` logic stays intact, gated behind the `engine` ref. Highlighting calls (`updateHighlight`, `clearHighlights`) are shared by both engines.

**Cleanup:** On unmount — pause audio, revoke blob URLs, cancel in-flight IPC (via AbortController or ignore stale results).

### 4. Settings Integration — `src/views/Settings.tsx`

New **TEXT-TO-SPEECH** section after the LANGUAGE section.

**UI elements:**
- Section heading: "TEXT-TO-SPEECH"
- "Voice" label with `<select>` dropdown showing curated voices (e.g., "Aria (Female)", "Guy (Male)")
- "Preview" button that synthesizes and plays a short sample sentence in the selected voice
- Subtle note below: "Requires internet connection. Falls back to browser voice when offline."

**Data flow:**
- On mount: `window.api.tts.getVoices()` → populate dropdown; `window.api.settings.get('tts_voice')` → set selected value
- On change: `window.api.settings.set('tts_voice', voiceShortName)`
- Default (no saved preference): first voice in curated list

### 5. Fallback Logic

**On mount:** `tts:checkAvailable` determines initial engine. If offline → `engine = 'browser'`, no edge-tts calls attempted.

**Mid-playback failure:** If `tts:synthesize` rejects (network drop, timeout), the hook:
1. Catches the error
2. Sets `engine = 'browser'`
3. Continues from the current sentence index using `speechSynthesis`
4. User hears a voice quality change but playback does not stop

**Stale voice preference:** If saved `tts_voice` is not in curated list, fall back to first curated voice.

## Files Changed

| File | Change |
|------|--------|
| `electron/services/ttsService.ts` | New — `msedge-tts` wrapper: synthesize, voices, availability check |
| `electron/ipc/ttsHandlers.ts` | New — IPC handlers for tts:synthesize, tts:getVoices, tts:checkAvailable |
| `electron/preload.ts` | Add `tts` namespace to API bridge |
| `electron/main.ts` | Import and call `registerTtsHandlers()` |
| `src/hooks/useTtsReader.ts` | Swap engine: Audio element + IPC synthesis, pre-buffering, fallback logic |
| `src/views/Settings.tsx` | Add TEXT-TO-SPEECH section with voice dropdown + preview |

## Edge Cases

- **No internet on launch:** `checkAvailable` returns false, uses `speechSynthesis` from the start. No error shown.
- **Internet drops mid-playback:** Current pre-buffered sentence plays to completion, then falls back to `speechSynthesis` for remaining sentences.
- **Empty audio returned:** Skip the sentence, advance to next.
- **Audio element lifecycle:** Single `Audio` instance reused. Blob URLs revoked after each sentence. Pre-buffer holds at most one sentence ahead.
- **Navigation during playback:** Existing `useEffect` cleanup pauses audio, revokes URLs, clears highlights.
- **Very long sentences:** `msedge-tts` handles arbitrary text length. Buffering time proportional to sentence length but still fast (streaming transfer).
- **Preview in Settings:** Uses same `tts:synthesize` path with a hardcoded sample sentence ("Hello, this is a preview of the selected voice.").

## Out of Scope

- Dynamic voice catalog (fetching full 400+ voice list from Microsoft)
- Non-English voice support (curated list is English-only for v1)
- Offline voice caching (sentences are not persisted)
- Audio quality settings / format picker
- Per-repo voice preferences
