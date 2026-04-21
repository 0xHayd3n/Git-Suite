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
