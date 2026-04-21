const VERBS = [
  'need', 'want', 'find', 'get', 'make', 'build', 'create', 'use',
  'render', 'parse', 'convert', 'generate', 'read', 'write', 'handle',
  'manage', 'display', 'show', 'run', 'execute', 'process', 'fetch',
  'store', 'send', 'receive', 'connect', 'work', 'help', 'looking',
]

export type SearchMode = 'raw' | 'natural'

export function detectSearchMode(query: string): SearchMode {
  const trimmed = query.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)

  if (words.length <= 2) return 'raw'

  const lower = trimmed.toLowerCase()
  if (VERBS.some(v => lower.includes(v))) return 'natural'

  if (words.length >= 3) return 'natural'

  return 'raw'
}
