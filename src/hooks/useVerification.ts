// src/hooks/useVerification.ts
import { useState, useEffect, useCallback } from 'react'

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

export function useVerification(): UseVerificationResult {
  const [cache, setCache] = useState<Map<string, VerificationEntry>>(new Map())

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

  // Seed cache from DB for a batch of repo IDs (e.g. on Discover mount / restore)
  const seedFromDb = useCallback((repoIds: string[]) => {
    if (!repoIds.length) return
    // Only request IDs we don't already have cached
    const missing = repoIds.filter(id => !cache.has(id))
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
  }, [cache])

  return {
    getTier:     (repoId) => cache.get(repoId)?.tier ?? null,
    getSignals:  (repoId) => cache.get(repoId)?.signals ?? [],
    isResolving: (repoId) => !cache.has(repoId),
    seedFromDb,
  }
}
