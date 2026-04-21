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

// msedge-tts streams use custom Readable with push() and don't properly
// signal end for async iteration — they just close. Use event-based
// consumption (matching the library's own toFile implementation).
function collectAudioStream(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    stream.on('close', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

// Each metadata chunk is an individual JSON object: { Metadata: [{ Type, Data }] }
function collectWordBoundaries(stream: Readable): Promise<WordBoundary[]> {
  return new Promise((resolve, reject) => {
    const boundaries: WordBoundary[] = []
    stream.on('data', (chunk: Buffer) => {
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
    })
    stream.on('close', () => resolve(boundaries))
    stream.on('error', reject)
  })
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
  const tts = new MsEdgeTTS()
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 3000)
  )
  try {
    await Promise.race([
      tts.setMetadata('en-US-AriaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3),
      timeout,
    ])
    return true
  } catch {
    return false
  } finally {
    tts.close()
  }
}

/** Reset the singleton instance. Used in tests. */
export function resetInstance(): void {
  if (ttsInstance) ttsInstance.close()
  ttsInstance = null
  currentVoice = null
}
