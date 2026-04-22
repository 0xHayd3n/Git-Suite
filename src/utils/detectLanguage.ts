const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  jsx: 'jsx', tsx: 'tsx',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  css: 'css', html: 'html', htm: 'html',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  toml: 'toml', xml: 'xml', svg: 'xml',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  md: 'markdown', diff: 'diff',
  dockerfile: 'dockerfile',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
  java: 'java', swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  php: 'php', lua: 'lua', zig: 'zig',
  ex: 'elixir', exs: 'elixir', hs: 'haskell',
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (filename === 'Dockerfile') return 'dockerfile'
  if (filename === 'Makefile') return 'bash'
  return EXT_TO_LANG[ext] ?? 'text'
}
