/**
 * Tiny LRU cache. Insert-on-get keeps recently-used entries at the tail;
 * when size exceeds max, the oldest (head) entry is evicted.
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>()
  constructor(private max: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    // Move to tail (most recently used)
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K
      this.map.delete(oldest)
    }
  }

  delete(key: K): boolean { return this.map.delete(key) }
  clear(): void { this.map.clear() }
  get size(): number { return this.map.size }
}
