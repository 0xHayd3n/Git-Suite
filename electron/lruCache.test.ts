import { describe, it, expect } from 'vitest'
import { LRUCache } from './lruCache'

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    expect(c.get('a')).toBe(1)
  })

  it('evicts oldest when capacity exceeded', () => {
    const c = new LRUCache<string, number>(2)
    c.set('a', 1); c.set('b', 2); c.set('c', 3)
    expect(c.get('a')).toBeUndefined()
    expect(c.get('b')).toBe(2)
    expect(c.get('c')).toBe(3)
  })

  it('treats get() as a use (promotes to most-recent)', () => {
    const c = new LRUCache<string, number>(2)
    c.set('a', 1); c.set('b', 2)
    c.get('a')           // promote 'a'
    c.set('c', 3)        // should evict 'b', not 'a'
    expect(c.get('a')).toBe(1)
    expect(c.get('b')).toBeUndefined()
  })
})
