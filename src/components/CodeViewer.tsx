import { useState, useEffect, useRef } from 'react'

// Lazy-load shiki to avoid blocking initial render
let highlighterPromise: Promise<import('shiki').HighlighterGeneric<any, any>> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark'],
        langs: [
          'javascript', 'typescript', 'jsx', 'tsx', 'json', 'yaml', 'css', 'html',
          'python', 'ruby', 'go', 'rust', 'bash', 'toml', 'xml', 'sql', 'graphql',
          'markdown', 'diff', 'dockerfile', 'c', 'cpp', 'java', 'swift', 'kotlin',
          'php', 'lua', 'zig', 'elixir', 'haskell', 'shell',
        ],
      })
    )
  }
  return highlighterPromise
}

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
  // Handle dotfiles
  if (filename === 'Dockerfile') return 'dockerfile'
  if (filename === 'Makefile') return 'bash'
  return EXT_TO_LANG[ext] ?? 'text'
}

interface Props {
  content: string
  filename: string
  wordWrap?: boolean
  onLineCountReady?: (count: number) => void
}

export default function CodeViewer({ content, filename, wordWrap, onLineCountReady }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lang = detectLanguage(filename)
  const lines = content.split('\n')
  const lineCount = lines.length

  useEffect(() => {
    onLineCountReady?.(lineCount)
  }, [lineCount, onLineCountReady])

  useEffect(() => {
    let cancelled = false

    if (lang === 'text') {
      // No highlighting for unknown languages
      setHtml(null)
      return
    }

    getHighlighter().then(highlighter => {
      if (cancelled) return
      try {
        const result = highlighter.codeToHtml(content, {
          lang,
          theme: 'github-dark',
        })
        setHtml(result)
      } catch {
        // Language not loaded — fall back to plain text
        setHtml(null)
      }
    })

    return () => { cancelled = true }
  }, [content, lang])

  return (
    <div className={`code-viewer${wordWrap ? ' code-viewer--wrap' : ''}`} ref={containerRef}>
      <div className="code-viewer__gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <div
            key={i}
            className={`code-viewer__line-number${highlightedLine === i + 1 ? ' code-viewer__line-number--active' : ''}`}
            onClick={() => setHighlightedLine(prev => prev === i + 1 ? null : i + 1)}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className="code-viewer__code">
        {html ? (
          <div className="code-viewer__highlighted" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="code-viewer__plain"><code>{content}</code></pre>
        )}
      </div>
    </div>
  )
}
