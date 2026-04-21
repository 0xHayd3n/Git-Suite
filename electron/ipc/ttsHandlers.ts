import { ipcMain } from 'electron'
import { synthesizeSentence, getVoices, checkAvailable } from '../services/ttsService'

export function registerTtsHandlers(): void {
  ipcMain.handle('tts:synthesize', async (_event, params: { text: string; voiceName: string }) => {
    try {
      console.log('[TTS] synthesize request:', params.text.slice(0, 50), 'voice:', params.voiceName)
      const result = await synthesizeSentence(params.text, params.voiceName)
      console.log('[TTS] synthesize result: audio bytes =', result.audio.length, 'boundaries =', result.wordBoundaries.length)
      // Electron IPC serializes Buffer as Uint8Array; convert to ArrayBuffer for renderer
      return {
        audio: result.audio.buffer.slice(result.audio.byteOffset, result.audio.byteOffset + result.audio.byteLength),
        wordBoundaries: result.wordBoundaries,
      }
    } catch (err) {
      console.error('[TTS] synthesize error:', err)
      throw err
    }
  })

  ipcMain.handle('tts:getVoices', () => {
    return getVoices()
  })

  ipcMain.handle('tts:checkAvailable', async () => {
    try {
      const available = await checkAvailable()
      console.log('[TTS] checkAvailable:', available)
      return available
    } catch (err) {
      console.error('[TTS] checkAvailable error:', err)
      return false
    }
  })
}
