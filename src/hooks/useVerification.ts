// src/hooks/useVerification.ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

type VerificationTier = 'verified' | 'likely' | null

interface VerificationEntry {
  tier:    VerificationTier
  signals: string[]
}

interface UseVerificationResult {
  getTier:     (repoId: string) => VerificationTier
  getSignals:  (repoId: string) => string[]
  isResolving: (repoId: string) => boolean
  seedFromDb:  (repoIds: string[]) => void
}

const EMPTY_SIGNALS: string[] = []

export function useVerification(): UseVerificationResult {
  const [cache, setCache] = useState<Map<string, VerificationEntry>>(new Map())
  const cacheRef = useRef(cache)
  cacheRef.current = cache

  useEffect(() => {
    const handler = (data: { repoId: string; tier: VerificationTier; signals: string[] }) => {
      setCache(prev => {
        const next = new Map(prev)
        next.set(data.repoId, { tier: data.tier, signals: data.signals })
        return next
      })
    }
    window.api.verification.onUpdated(handler)
    return () => { window.api.verification.offUpdated(handler) }
  }, [])

  // Stable callback — uses cacheRef so it never needs cache in its deps
  const seedFromDb = useCallback((repoIds: string[]) => {
    if (!repoIds.length) return
    const missing = repoIds.filter(id => !cacheRef.current.has(id))
    if (!missing.length) return
    window.api.verification.getBatchScores(missing).then(results => {
      setCache(prev => {
        const next = new Map(prev)
        for (const [repoId, entry] of Object.entries(results)) {
          if (!next.has(repoId)) {
            next.set(repoId, { tier: entry.tier as VerificationTier, signals: entry.signals })
          }
        }
        return next
      })
    }).catch(() => { /* ignore */ })
  }, [])

  // Stable object reference — only changes when cache or seedFromDb changes.
  // EMPTY_SIGNALS is a stable reference so getSignals never returns a fresh [] literal,
  // which would bust memo(RepoCard) on every render for uncached repos.
  return useMemo(() => ({
    getTier:     (repoId: string) => cache.get(repoId)?.tier ?? null,
    getSignals:  (repoId: string) => cache.get(repoId)?.signals ?? EMPTY_SIGNALS,
    isResolving: (repoId: string) => !cache.has(repoId),
    seedFromDb,
  }), [cache, seedFromDb])
}
