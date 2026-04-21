import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'

interface SearchContextValue {
  query: string
  setQuery: (q: string) => void
  inputRef: React.RefObject<HTMLInputElement> | null
  setInputRef: (ref: React.RefObject<HTMLInputElement>) => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [inputRef, setInputRef] = useState<React.RefObject<HTMLInputElement> | null>(null)

  const value = useMemo(
    () => ({ query, setQuery, inputRef, setInputRef }),
    [query, inputRef],
  )

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider')
  return ctx
}
