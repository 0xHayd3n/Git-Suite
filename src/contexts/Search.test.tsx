import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchProvider, useSearch } from './Search'

function Consumer() {
  const { query, setQuery } = useSearch()
  return (
    <>
      <span data-testid="query">{query}</span>
      <button onClick={() => setQuery('hello')}>set</button>
    </>
  )
}

function renderWithProvider() {
  return render(<SearchProvider><Consumer /></SearchProvider>)
}

describe('SearchContext', () => {
  it('provides an empty query by default', () => {
    renderWithProvider()
    expect(screen.getByTestId('query')).toHaveTextContent('')
  })

  it('updates query when setQuery is called', () => {
    renderWithProvider()
    fireEvent.click(screen.getByRole('button', { name: 'set' }))
    expect(screen.getByTestId('query')).toHaveTextContent('hello')
  })

  it('provides inputRef as null by default', () => {
    function RefConsumer() {
      const { inputRef } = useSearch()
      return <span data-testid="ref">{inputRef === null ? 'null' : 'set'}</span>
    }
    render(<SearchProvider><RefConsumer /></SearchProvider>)
    expect(screen.getByTestId('ref')).toHaveTextContent('null')
  })
})
