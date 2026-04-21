# Web Speech API STT Replacement

**Date:** 2026-04-13
**Status:** Approved

## Problem

The current STT implementation uses `@huggingface/transformers` to run a Whisper ONNX model in Electron's main process. Model downloads fail repeatedly with `ERR_CONTENT_LENGTH_MISMATCH` due to Electron's `net.fetch` / `SimpleURLLoaderWrapper` mishandling Hugging Face CDN responses. The user wants to replace this with a ground-up implementation that doesn't depend on third-party ML packages.

## Chosen Approach

Use the browser's built-in `SpeechRecognition` / `webkitSpeechRecognition` API directly in the renderer process. This eliminates all model downloads, IPC round-trips, and third-party dependencies.

## Requirements

- High accuracy for technical terminology
- Real-time interim results updating the input field approximately every second
- Free, no user action required (no API keys, no account setup)
- Minimal external dependencies

## Risks and Tradeoffs

- **Internet required at runtime:** The Web Speech API in Chromium streams audio to Google's servers for recognition. This trades the current problem (one-time model download fails) for a runtime network dependency. The user has approved using an online API.
- **Privacy:** Audio is sent to Google for processing. Acceptable for this use case (searching/discussing public GitHub repos).
- **Availability:** Google may throttle or disable Web Speech API access from non-Chrome Electron contexts. If this happens, we pivot to Approach 2 (custom cloud API streaming).
- **Mic permissions:** The existing `setPermissionRequestHandler` in `main.ts` auto-grants media permissions. The SpeechRecognition API manages the mic internally — no explicit stream acquisition or cleanup needed.

## Architecture

### Current flow (removed)

```
Renderer (whisperTranscriber.ts)
  -> IPC (preload.ts: sttPreload / sttTranscribe)
  -> Main process (sttService.ts)
  -> @huggingface/transformers (Whisper ONNX, net.fetch model download)
  -> text result via IPC back to renderer
```

### New flow

```
Renderer (whisperTranscriber.ts)
  -> SpeechRecognition API (built into Chromium/Electron)
  -> onresult callback -> onUpdate(transcript)
```

Everything stays in the renderer. No IPC, no main process involvement, no model files, no downloads.

## Implementation Details

### `src/lib/whisperTranscriber.ts` — full rewrite (~40 lines)

- Create `SpeechRecognition` instance (with `webkitSpeechRecognition` fallback constructor)
- Configure: `continuous = true`, `interimResults = true`, `lang = 'en-US'`
- `onresult` handler: concatenate all results (final + interim) into the full cumulative transcript and call `onUpdate(transcript)`. Consumers do `setInput(baseText + text)` so `text` must be the complete transcription so far, not an incremental delta.
- `onerror` handler: auto-restart on `no-speech` (with backoff — max 3 consecutive restarts within 10 seconds before surfacing error), log and stop on fatal errors
- `onend` handler: auto-restart if session is still active (API can stop on silence timeouts), subject to same backoff
- `stop()` sets `running = false` and calls `recognition.stop()`
- Function remains `async` (returns `Promise<RealtimeSession>`) for API compatibility — resolves immediately since there is no model to load
- Exports same `RealtimeSession` interface

### Files removed

- **`electron/services/sttService.ts`** — deleted entirely
- **`stt:preload` and `stt:transcribe` IPC handlers** in `electron/ipc/aiChatHandlers.ts` — removed
- **`sttPreload` and `sttTranscribe`** in `electron/preload.ts` — removed
- **`sttPreload` and `sttTranscribe`** type declarations in `src/env.d.ts` — removed
- **`@huggingface/transformers`** from `package.json` — removed (only used by sttService)

### Files with minor updates

- **`src/components/AiChatOverlay.tsx`** — remove `isModelLoading` state and "Loading speech model..." placeholder text (model preload no longer exists; recognition starts instantly)
- **`src/components/AiDialogue.tsx`** — same `isModelLoading` cleanup

### Type declarations

Add `SpeechRecognition` and `webkitSpeechRecognition` types to `src/env.d.ts`:

```typescript
interface Window {
  SpeechRecognition: typeof SpeechRecognition
  webkitSpeechRecognition: typeof SpeechRecognition
}
```

## Error Handling

| Error | Cause | Response |
|-------|-------|----------|
| `network` | API unavailable in Electron | Stop session, surface error |
| `not-allowed` | Mic permission denied | Stop session, surface error |
| `no-speech` | Silence detected | Auto-restart silently |
| `audio-capture` | No mic available | Stop session, surface error |
| `aborted` | Programmatic stop | Do nothing (expected) |

Auto-restart on `onend`: the SpeechRecognition API fires `onend` after silence even with `continuous = true`. The session auto-restarts unless the user explicitly called `stop()`. A restart backoff prevents tight loops: max 3 consecutive restarts within 10 seconds, after which the session stops and surfaces an error.

## Fallback

If the Web Speech API does not work in Electron 31 (constructor missing or `network` error on start), we pivot to Approach 2: custom audio pipeline streaming to a free cloud Whisper API. That would be a separate design. This implementation does NOT include a built-in fallback — it's Web Speech API or nothing, tested at integration time.
