import fs from 'fs'
import path from 'path'
import type { ExtractionResult, RepoType } from './types'

export interface CacheValue {
  extraction: ExtractionResult
  repoType: RepoType
}

interface CacheEntry extends CacheValue {
  timestamp: number
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ENTRIES = 50

const cache = new Map<string, CacheEntry>()
let cacheDir: string | null = null

function keyToFilename(key: string): string {
  return Buffer.from(key).toString('base64url') + '.json'
}

function writeToDisk(key: string, entry: CacheEntry): void {
  if (!cacheDir) return
  try {
    const filePath = path.join(cacheDir, keyToFilename(key))
    fs.writeFileSync(filePath, JSON.stringify(entry))
  } catch (err) {
    console.error('extraction-cache: failed to write disk entry', err)
  }
}

function removeFromDisk(key: string): void {
  if (!cacheDir) return
  try {
    fs.unlinkSync(path.join(cacheDir, keyToFilename(key)))
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error('extraction-cache: failed to remove disk entry', err)
    }
  }
}

export const extractionCache = {
  init(dir: string): void {
    cacheDir = dir
    cache.clear()
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      console.error('extraction-cache: failed to create cache directory', err)
      return
    }

    // Load existing entries from disk
    let files: string[]
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    } catch (err) {
      console.error('extraction-cache: failed to read cache directory', err)
      return
    }

    const now = Date.now()
    for (const file of files) {
      const filePath = path.join(dir, file)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const entry: CacheEntry = JSON.parse(raw)
        if (now - entry.timestamp > TTL_MS) {
          // Expired — remove from disk
          try {
            fs.unlinkSync(filePath)
          } catch (rmErr: any) {
            if (rmErr?.code !== 'ENOENT') {
              console.error('extraction-cache: failed to remove expired disk entry', rmErr)
            }
          }
        } else {
          // Recover the key from the filename (strip .json, decode base64url)
          const keyEncoded = file.slice(0, -5) // remove .json
          const key = Buffer.from(keyEncoded, 'base64url').toString()
          cache.set(key, entry)
        }
      } catch (err) {
        console.error('extraction-cache: failed to parse disk entry', file, err)
      }
    }
  },

  get(key: string): CacheValue | null {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > TTL_MS) {
      cache.delete(key)
      removeFromDisk(key)
      return null
    }
    return { extraction: entry.extraction, repoType: entry.repoType }
  },

  set(key: string, value: CacheValue): void {
    // FIFO eviction when at capacity
    if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
      const oldest = cache.keys().next().value!
      cache.delete(oldest)
      removeFromDisk(oldest)
    }
    const entry: CacheEntry = { ...value, timestamp: Date.now() }
    cache.set(key, entry)
    writeToDisk(key, entry)
  },

  clear(): void {
    if (cacheDir) {
      try {
        const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'))
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(cacheDir, file))
          } catch (err: any) {
            if (err?.code !== 'ENOENT') {
              console.error('extraction-cache: failed to remove disk entry on clear', err)
            }
          }
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error('extraction-cache: failed to clear disk cache', err)
        }
      }
    }
    cache.clear()
  },
}
