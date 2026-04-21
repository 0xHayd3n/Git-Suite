// ── Shell command extraction ──────────────────────────────────────────────────
// Scans a README for fenced code blocks tagged with shell-like languages and
// returns them paired with their nearest preceding label (heading / paragraph).

export interface CommandBlock {
  label: string   // last non-blank text before the block (stripped of markdown)
  lang:  string   // detected language tag (bash, sh, …)
  code:  string   // trimmed code block content
}

// Language tags that indicate shell / terminal content
const SHELL_LANGS = new Set([
  'bash', 'sh', 'shell', 'zsh', 'fish',
  'cmd', 'powershell', 'ps1', 'dos', 'bat',
  'console', 'terminal', 'csh', 'tcsh', 'ksh',
  'nu', 'nushell',
])

export function extractCommands(content: string): CommandBlock[] {
  const blocks: CommandBlock[] = []
  const lines = content.split('\n')
  const n = lines.length

  let i = 0
  while (i < n) {
    const line = lines[i]
    // Detect an opening fence: ``` or ~~~, optionally followed by a language tag
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\w[\w.-]*)?/)

    if (!fenceMatch) {
      i++
      continue
    }

    const fence     = fenceMatch[1]           // e.g. "```" or "~~~"
    const fenceChar = fence[0]
    const fenceLen  = fence.length
    const lang      = (fenceMatch[2] ?? '').toLowerCase()
    const closingRe = new RegExp(`^${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`)

    if (!SHELL_LANGS.has(lang)) {
      // Skip the entire non-shell code block
      i++
      while (i < n && !closingRe.test(lines[i])) i++
      i++ // skip closing fence
      continue
    }

    // ── Found a shell block — find context label ──────────────────────────────
    let label = ''
    for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
      const prev = lines[j].trim()
      if (!prev) continue
      // Strip markdown heading markers and bold/italic decorators
      label = prev
        .replace(/^#{1,6}\s+/, '')
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
        .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
        .trim()
      break
    }

    // ── Collect code lines ───────────────────────────────────────────────────
    const codeLines: string[] = []
    i++
    while (i < n && !closingRe.test(lines[i])) {
      codeLines.push(lines[i])
      i++
    }
    i++ // skip closing fence

    const code = codeLines.join('\n').trim()
    if (code) {
      blocks.push({ label, lang, code })
    }
  }

  return blocks
}
