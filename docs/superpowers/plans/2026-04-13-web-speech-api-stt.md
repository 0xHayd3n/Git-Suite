# Web Speech API STT Replacement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `@huggingface/transformers` Whisper STT pipeline with the browser-native `SpeechRecognition` API, running entirely in the renderer process.

**Architecture:** All STT logic moves to a single renderer-side module (`src/lib/whisperTranscriber.ts`). The main process STT service, IPC handlers, and preload bridges are deleted. UI components keep the same `startRealtimeSession(onUpdate)` API but remove the now-unnecessary `isModelLoading` state.

**Tech Stack:** Web Speech API (built into Chromium/Electron), TypeScript, React

**Spec:** `docs/superpowers/specs/2026-04-13-web-speech-api-stt-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Rewrite | `src/lib/whisperTranscriber.ts` | SpeechRecognition session management |
| Modify | `src/env.d.ts:175-176` | Remove `sttPreload`/`sttTranscribe` types, add `SpeechRecognition` window types |
| Modify | `src/components/AiChatOverlay.tsx` | Remove `isModelLoading` state, update placeholder/disabled logic |
| Modify | `src/components/AiDialogue.tsx` | Remove `isModelLoading` state, update placeholder/disabled logic |
| Modify | `electron/ipc/aiChatHandlers.ts:1-4,50-57` | Remove STT import and IPC handlers |
| Modify | `electron/preload.ts:251-252` | Remove `sttPreload`/`sttTranscribe` bridges |
| Delete | `electron/services/sttService.ts` | Entire file |
| Modify | `package.json:21` | Remove `@huggingface/transformers` dependency |

---

### Task 1: Rewrite `whisperTranscriber.ts` with Web Speech API

**Files:**
- Rewrite: `src/lib/whisperTranscriber.ts`

- [ ] **Step 1: Write the new implementation**

Replace the entire file with:

```typescript
export interface RealtimeSession {
  stop: () => void
}

const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 10_000

/**
 * Start a real-time transcription session using the browser's
 * built-in SpeechRecognition API (Chromium).
 */
export async function startRealtimeSession(
  onUpdate: (text: string) => void,
): Promise<RealtimeSession> {
  const SpeechRecognition =
    window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    throw new Error('SpeechRecognition API is not available in this browser')
  }

  const recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-US'

  let running = true
  const restartTimestamps: number[] = []

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let transcript = ''
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript
    }
    onUpdate(transcript)
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return
    console.error('[stt] SpeechRecognition error:', event.error)
    running = false
  }

  recognition.onend = () => {
    if (!running) return
    // Backoff: stop if too many restarts in a short window
    const now = Date.now()
    restartTimestamps.push(now)
    // Keep only timestamps within the window
    while (restartTimestamps.length > 0 && restartTimestamps[0] < now - RESTART_WINDOW_MS) {
      restartTimestamps.shift()
    }
    if (restartTimestamps.length > MAX_RESTARTS) {
      console.error('[stt] Too many restarts, stopping session')
      running = false
      return
    }
    recognition.start()
  }

  recognition.start()

  return {
    stop() {
      running = false
      recognition.stop()
    },
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: May show errors for `SpeechRecognition` types — that's OK, fixed in Task 2. No other errors should appear from our file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whisperTranscriber.ts
git commit -m "feat: rewrite STT to use browser SpeechRecognition API"
```

---

### Task 2: Update type declarations in `env.d.ts`

**Files:**
- Modify: `src/env.d.ts:175-176` (remove STT types) and `:19` (add SpeechRecognition window types)

- [ ] **Step 1: Remove `sttPreload` and `sttTranscribe` from the `ai` interface, add SpeechRecognition window types**

In `src/env.d.ts`, inside the `ai` block (lines 169-179), remove these two lines:

```typescript
        sttPreload: () => Promise<void>
        sttTranscribe: (pcmBuffer: ArrayBuffer) => Promise<string>
```

Then at the top of the `declare global` block (after line 19 `declare global {`), add:

```typescript
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
```

Note: There are two `Window` interfaces in this file — TypeScript merges them, so this is valid. The new one adds speech types, the existing one (line 33) declares `api`. If TypeScript's DOM lib does not include `SpeechRecognition` types, replace `typeof SpeechRecognition` with `any` as a fallback.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: Clean (no errors related to our changes).

- [ ] **Step 3: Commit**

```bash
git add src/env.d.ts
git commit -m "feat: update type declarations for Web Speech API STT"
```

---

### Task 3: Remove main process STT infrastructure

**Files:**
- Delete: `electron/services/sttService.ts`
- Modify: `electron/ipc/aiChatHandlers.ts:1-4,50-57`
- Modify: `electron/preload.ts:251-252`

- [ ] **Step 1: Delete `sttService.ts`**

```bash
rm electron/services/sttService.ts
```

- [ ] **Step 2: Remove STT import and handlers from `aiChatHandlers.ts`**

In `electron/ipc/aiChatHandlers.ts`:

Remove the import on line 4:
```typescript
import { preloadModel, transcribeAudio } from '../services/sttService'
```

Remove the two IPC handlers (lines 50-57):
```typescript
  ipcMain.handle('stt:preload', async () => {
    await preloadModel()
  })

  ipcMain.handle('stt:transcribe', async (_event, pcmBuffer: ArrayBuffer) => {
    const pcm = new Float32Array(pcmBuffer)
    return transcribeAudio(pcm)
  })
```

- [ ] **Step 3: Remove STT bridges from `preload.ts`**

In `electron/preload.ts`, remove lines 251-252:
```typescript
    sttPreload: () => ipcRenderer.invoke('stt:preload') as Promise<void>,
    sttTranscribe: (pcmBuffer: ArrayBuffer) => ipcRenderer.invoke('stt:transcribe', pcmBuffer) as Promise<string>,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add electron/services/sttService.ts electron/ipc/aiChatHandlers.ts electron/preload.ts
git commit -m "refactor: remove main process STT service, IPC handlers, and preload bridges"
```

---

### Task 4: Clean up UI components — remove `isModelLoading`

**Files:**
- Modify: `src/components/AiChatOverlay.tsx`
- Modify: `src/components/AiDialogue.tsx`

- [ ] **Step 1: Update `AiChatOverlay.tsx`**

1. Remove the `isModelLoading` state declaration (line 97):
   ```typescript
   const [isModelLoading, setIsModelLoading] = useState(false)
   ```

2. In `toggleListening()` (lines 210-232), remove the `setIsModelLoading` calls. The function becomes:
   ```typescript
   async function toggleListening() {
     if (isListening) {
       sttSessionRef.current?.stop()
       sttSessionRef.current = null
       setIsListening(false)
       return
     }

     baseTextRef.current = input ? (input.endsWith(' ') ? input : input + ' ') : ''

     try {
       const session = await startRealtimeSession((text) => {
         setInput(baseTextRef.current + text)
       })
       sttSessionRef.current = session
       setIsListening(true)
     } catch (err: any) {
       console.error('[ai-chat] STT failed:', err)
     }
   }
   ```

3. Update the placeholder (line 437) — remove the `isModelLoading` branch:
   ```typescript
   placeholder={isListening ? 'Listening…' : 'Ask about repos, request actions…'}
   ```

4. Remove `isModelLoading` from all `disabled` props (lines 441, 444, 451):
   - `disabled={streaming || isModelLoading}` → `disabled={streaming}`
   - Same for the send button and mic button

- [ ] **Step 2: Update `AiDialogue.tsx`**

1. Remove the `isModelLoading` state declaration (line 61):
   ```typescript
   const [isModelLoading, setIsModelLoading] = useState(false)
   ```

2. In `toggleListening` callback (lines 108-135), remove `setIsModelLoading` calls. The callback becomes:
   ```typescript
   const toggleListening = useCallback(async () => {
     if (isListening) {
       sttSessionRef.current?.stop()
       sttSessionRef.current = null
       setIsListening(false)
       return
     }

     baseTextRef.current = input ? (input.endsWith(' ') ? input : input + ' ') : ''

     try {
       const session = await startRealtimeSession((text) => {
         setInput(baseTextRef.current + text)
       })
       sttSessionRef.current = session
       setIsListening(true)
     } catch (err: any) {
       console.error('[stt] Failed to start:', err)
       setMessages(prev => [...prev, {
         role: 'error',
         content: `Voice input failed: ${err?.message || 'Unknown error'}`,
       }])
     }
   }, [isListening, input])
   ```

3. Update the placeholder (line 228) — remove `isModelLoading` branch:
   ```typescript
   placeholder={isListening ? 'Listening…' : placeholder.text}
   ```

4. Remove `isModelLoading` from `disabled` props (lines 236, 244, 257):
   - Line 236: remove the `disabled={isModelLoading}` prop from the `<input>` element entirely
   - Line 244: `disabled={loading || isModelLoading}` → `disabled={loading}`
   - Line 257: `disabled={loading || isModelLoading}` → `disabled={loading}`

5. In the style conditional (line 229), remove `&& !isModelLoading` from the opacity condition:
   - Before: `opacity: !inputFocused && !input && !isModelLoading ? ...`
   - After: `opacity: !inputFocused && !input ? ...`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/AiChatOverlay.tsx src/components/AiDialogue.tsx
git commit -m "refactor: remove isModelLoading state from STT UI components"
```

---

### Task 5: Remove `@huggingface/transformers` dependency

**Files:**
- Modify: `package.json:21`

- [ ] **Step 1: Uninstall the package**

```bash
npm uninstall @huggingface/transformers
```

This removes the dependency from `package.json` and updates `package-lock.json`.

- [ ] **Step 2: Verify no remaining imports**

Run: `grep -r "@huggingface/transformers" --include="*.ts" --include="*.tsx" .`
Expected: No matches (the only usage was in the deleted `sttService.ts`).

- [ ] **Step 3: Verify full build**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @huggingface/transformers dependency"
```
