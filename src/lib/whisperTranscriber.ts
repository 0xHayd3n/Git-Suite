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
