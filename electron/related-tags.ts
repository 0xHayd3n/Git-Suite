function parseTopicsField(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) as string[] } catch { return [] }
}

export function getRelatedTags(
  results: Array<{ topics?: string | string[] | null }>,
  currentTags: string[],
  limit = 8
): string[] {
  const freq = new Map<string, number>()

  for (const repo of results) {
    for (const topic of parseTopicsField(repo.topics)) {
      if (!currentTags.includes(topic)) {
        freq.set(topic, (freq.get(topic) ?? 0) + 1)
      }
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic)
}
