import { useCallback, useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'discover-search-history'
const MAX_ENTRIES = 20

export function useSearchHistory() {
  const [entries, setEntries] = useLocalStorage<string[]>(STORAGE_KEY, [])

  const add = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setEntries(prev => {
      const without = prev.filter(e => e !== trimmed)
      return [trimmed, ...without].slice(0, MAX_ENTRIES)
    })
  }, [setEntries])

  const remove = useCallback((query: string) => {
    setEntries(prev => prev.filter(e => e !== query))
  }, [setEntries])

  const clear = useCallback(() => {
    setEntries([])
  }, [setEntries])

  return useMemo(() => ({ entries, add, remove, clear }), [entries, add, remove, clear])
}
