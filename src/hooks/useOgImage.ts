import { useState, useCallback, useRef } from 'react'

interface UseOgImageResult {
  ogImageUrl: string | null
  loading: boolean
  fetched: boolean
  fetch: () => void
}

export function useOgImage(owner: string, name: string): UseOgImageResult {
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)
  const [fetched, setFetched] = useState(false)

  const fetchOg = useCallback(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)

    window.api.repo.getOgImage(owner, name)
      .then(url => {
        setOgImageUrl(url)
        setFetched(true)
      })
      .catch(() => {
        setFetched(true)
      })
      .finally(() => setLoading(false))
  }, [owner, name])

  return { ogImageUrl, loading, fetched, fetch: fetchOg }
}
