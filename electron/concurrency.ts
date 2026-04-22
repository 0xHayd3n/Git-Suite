export async function poolAll<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx]).catch(() => {})
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
}
