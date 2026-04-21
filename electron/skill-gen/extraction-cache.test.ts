import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { extractionCache } from './extraction-cache'
import type { ExtractionResult } from './types'

const mockExtraction: ExtractionResult = {
  repoType: 'library',
  manifest: { ecosystem: 'node', name: 'test' },
  fileTree: ['src/index.ts'],
}

describe('extractionCache', () => {
  beforeEach(() => {
    extractionCache.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for cache miss', () => {
    expect(extractionCache.get('owner/repo@main')).toBeNull()
  })

  it('stores and retrieves a cache entry', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    const result = extractionCache.get('owner/repo@main')
    expect(result).not.toBeNull()
    expect(result!.extraction.manifest.name).toBe('test')
    expect(result!.repoType).toBe('library')
  })

  it('returns null after TTL expires', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    vi.advanceTimersByTime(11 * 60 * 1000) // 11 minutes
    expect(extractionCache.get('owner/repo@main')).toBeNull()
  })

  it('returns entry before TTL expires', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    vi.advanceTimersByTime(9 * 60 * 1000) // 9 minutes
    expect(extractionCache.get('owner/repo@main')).not.toBeNull()
  })

  it('evicts oldest entry when capacity reached', () => {
    for (let i = 0; i < 50; i++) {
      extractionCache.set(`owner/repo-${i}@main`, { extraction: mockExtraction, repoType: 'library' })
    }
    // Add one more — should evict repo-0
    extractionCache.set('owner/repo-new@main', { extraction: mockExtraction, repoType: 'library' })
    expect(extractionCache.get('owner/repo-0@main')).toBeNull()
    expect(extractionCache.get('owner/repo-new@main')).not.toBeNull()
  })

  it('clear() removes all entries', () => {
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    extractionCache.clear()
    expect(extractionCache.get('owner/repo@main')).toBeNull()
  })

  it('works without init (graceful degradation)', () => {
    // Parent beforeEach calls clear() but never init(), so cacheDir is null
    // This verifies set/get work in pure in-memory mode without disk persistence
    extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
    const result = extractionCache.get('owner/repo@main')
    expect(result).not.toBeNull()
    expect(result!.extraction.manifest.name).toBe('test')
  })

  describe('disk persistence', () => {
    let tmpDir: string

    beforeEach(() => {
      vi.useRealTimers()
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extraction-cache-test-'))
      extractionCache.clear()
      extractionCache.init(tmpDir)
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      extractionCache.clear()
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    })

    it('persists entries to disk on set', () => {
      extractionCache.set('owner/repo@main', { extraction: mockExtraction, repoType: 'library' })
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json'))
      expect(files).toHaveLength(1)

      const content = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8'))
      expect(content.extraction.manifest.name).toBe('test')
      expect(content.repoType).toBe('library')
      expect(content.timestamp).toBeTypeOf('number')
    })

    it('restores entries from disk on re-init after restart', () => {
      // Clear in-memory + disk, then simulate a leftover disk file from a previous session
      extractionCache.clear()

      // Simulate a previous session's cache file on disk
      fs.mkdirSync(tmpDir, { recursive: true })
      const key = 'owner/restored@main'
      const filename = Buffer.from(key).toString('base64url') + '.json'
      const entry = { extraction: mockExtraction, repoType: 'library', timestamp: Date.now() }
      fs.writeFileSync(path.join(tmpDir, filename), JSON.stringify(entry))

      // Re-init should load the entry from disk
      extractionCache.init(tmpDir)

      const result = extractionCache.get('owner/restored@main')
      expect(result).not.toBeNull()
      expect(result!.extraction.manifest.name).toBe('test')
      expect(result!.repoType).toBe('library')
    })

    it('evicts expired entries from disk on init', () => {
      // Write an expired entry directly to disk
      const key = 'owner/expired@main'
      const filename = Buffer.from(key).toString('base64url') + '.json'
      const expiredTimestamp = Date.now() - 11 * 60 * 1000 // 11 minutes ago
      const entry = { extraction: mockExtraction, repoType: 'library', timestamp: expiredTimestamp }
      fs.writeFileSync(path.join(tmpDir, filename), JSON.stringify(entry))

      // Re-init should discard expired entry and delete file
      extractionCache.clear()
      extractionCache.init(tmpDir)

      expect(extractionCache.get('owner/expired@main')).toBeNull()
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json'))
      expect(files).toHaveLength(0)
    })

    it('removes disk file on FIFO eviction', () => {
      // Fill cache to capacity
      for (let i = 0; i < 50; i++) {
        extractionCache.set(`owner/repo-${i}@main`, { extraction: mockExtraction, repoType: 'library' })
      }
      expect(fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json'))).toHaveLength(50)

      // Add one more — should evict repo-0 from memory AND disk
      extractionCache.set('owner/repo-new@main', { extraction: mockExtraction, repoType: 'library' })
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json'))
      expect(files).toHaveLength(50) // 50, not 51
    })

  })
})
