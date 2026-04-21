import type { Extractor, ManifestInfo, CommandEntry, FlagEntry, ExtractionResult } from '../types'

const MAX_FILES = 15

function stripLeadingDotSlash(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path
}

function getFilesToFetch(fileTree: string[], manifest: ManifestInfo): string[] {
  const selected = new Set<string>()
  const treeSet = new Set(fileTree)

  const add = (path: string) => {
    if (treeSet.has(path) && selected.size < MAX_FILES) {
      selected.add(path)
    }
  }

  const { ecosystem, bin } = manifest

  // Bin entry points from manifest
  if (bin) {
    if (typeof bin === 'string') {
      add(stripLeadingDotSlash(bin))
    } else {
      for (const entry of Object.values(bin)) {
        add(stripLeadingDotSlash(entry))
      }
    }
  }

  // Files matching commands/, cmd/ patterns or cli/command in name
  for (const file of fileTree) {
    if (selected.size >= MAX_FILES) break
    const lower = file.toLowerCase()
    if (
      lower.includes('/commands/') ||
      lower.startsWith('commands/') ||
      lower.includes('/cmd/') ||
      lower.startsWith('cmd/') ||
      lower.includes('cli') ||
      lower.includes('command')
    ) {
      selected.add(file)
    }
  }

  // Rust-specific CLI files
  if (ecosystem === 'rust') {
    add('src/main.rs')
    add('src/cli.rs')
    add('src/args.rs')
  }

  // Python-specific CLI files
  if (ecosystem === 'python') {
    add('cli.py')
    add('__main__.py')
    add('src/__main__.py')
    for (const file of fileTree) {
      if (selected.size >= MAX_FILES) break
      const lower = file.toLowerCase()
      if (lower.endsWith('.py') && (lower.includes('click') || lower.includes('argparse') || lower.includes('typer') || lower.includes('cli'))) {
        selected.add(file)
      }
    }
  }

  return Array.from(selected)
}

// ─── Commander.js parsing ────────────────────────────────────────────────────

function parseCommanderOptions(block: string): FlagEntry[] {
  const flags: FlagEntry[] = []
  // Match .option('flags', 'description', default) or .option('flags', 'description')
  const optionRegex = /\.option\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]*)['"])?(?:\s*,\s*([^)]+))?\s*\)/g
  let m: RegExpExecArray | null
  while ((m = optionRegex.exec(block)) !== null) {
    const flagStr = m[1]
    const description = m[2]
    const defaultVal = m[3]?.trim()

    // Parse flag string like "-t, --template <name>" or "--no-git" or "--minify"
    const parts = flagStr.split(',').map(s => s.trim())
    let shortFlag: string | undefined
    let longFlag: string | undefined

    for (const part of parts) {
      if (part.startsWith('--')) {
        longFlag = part.split(' ')[0] // strip arg placeholder
      } else if (part.startsWith('-')) {
        shortFlag = part.split(' ')[0]
      }
    }

    const name = longFlag ?? shortFlag ?? flagStr
    const flag: FlagEntry = {
      name,
      type: flagStr.includes('<') ? 'string' : 'boolean',
    }
    if (shortFlag && longFlag) flag.short = shortFlag
    if (description) flag.description = description
    if (defaultVal && defaultVal !== 'false' && defaultVal !== 'true') {
      flag.default = defaultVal.replace(/^['"]|['"]$/g, '')
    }
    flags.push(flag)
  }
  return flags
}

function extractCommander(content: string): CommandEntry[] {
  const commands: CommandEntry[] = []

  // Split on program.command(...) occurrences
  // We'll find each .command('name') call and collect what follows until the next .command() or end
  const commandRegex = /\.command\(\s*['"]([^'"]+)['"]\s*\)/g
  let m: RegExpExecArray | null
  const positions: Array<{ name: string; index: number }> = []

  while ((m = commandRegex.exec(content)) !== null) {
    positions.push({ name: m[1], index: m.index })
  }

  for (let i = 0; i < positions.length; i++) {
    const { name, index } = positions[i]
    const end = i + 1 < positions.length ? positions[i + 1].index : content.length
    const block = content.slice(index, end)

    // Extract description
    const descMatch = block.match(/\.description\(\s*['"]([^'"]+)['"]\s*\)/)
    const description = descMatch?.[1]

    const flags = parseCommanderOptions(block)

    commands.push({ name, flags, ...(description ? { description } : {}) })
  }

  return commands
}

// ─── Yargs parsing ───────────────────────────────────────────────────────────

function parseYargsOptions(block: string): FlagEntry[] {
  const flags: FlagEntry[] = []
  // Match .option('name', { alias: 'x', type: '...', default: ... })
  const optionRegex = /\.option\(\s*'([^']+)'\s*,\s*\{([^}]+)\}\s*\)/g
  let m: RegExpExecArray | null
  while ((m = optionRegex.exec(block)) !== null) {
    const name = `--${m[1]}`
    const opts = m[2]

    const aliasMatch = opts.match(/alias\s*:\s*['"]([^'"]+)['"]/)
    const typeMatch = opts.match(/type\s*:\s*['"]([^'"]+)['"]/)
    const defaultMatch = opts.match(/default\s*:\s*([^,}\n]+)/)
    const descMatch = opts.match(/description\s*:\s*['"]([^'"]+)['"]/)

    const flag: FlagEntry = {
      name,
      type: typeMatch?.[1] ?? 'string',
    }
    if (aliasMatch) flag.short = `-${aliasMatch[1]}`
    if (defaultMatch) flag.default = defaultMatch[1].trim().replace(/^['"]|['"]$/g, '')
    if (descMatch) flag.description = descMatch[1]
    flags.push(flag)
  }
  return flags
}

function extractYargs(content: string): CommandEntry[] {
  const commands: CommandEntry[] = []

  // Match .command('name [args]', 'description', ...)
  const commandRegex = /\.command\(\s*'([^']+)'\s*,\s*'([^']*)'\s*(?:,\s*[\s\S]*?)?\)/g
  let m: RegExpExecArray | null

  // We need to find each command block — let's do positional approach
  const positions: Array<{ name: string; description: string; index: number }> = []
  while ((m = commandRegex.exec(content)) !== null) {
    const rawName = m[1].split(' ')[0] // strip positional args like [port]
    positions.push({ name: rawName, description: m[2], index: m.index })
  }

  for (let i = 0; i < positions.length; i++) {
    const { name, description, index } = positions[i]
    const end = i + 1 < positions.length ? positions[i + 1].index : content.length
    const block = content.slice(index, end)

    const flags = parseYargsOptions(block)
    commands.push({ name, description, flags })
  }

  return commands
}

// ─── Clap (Rust) parsing ─────────────────────────────────────────────────────

function snakeToKebab(s: string): string {
  return s.replace(/_/g, '-')
}

function extractClap(content: string): CommandEntry[] {
  // Find the main #[command(...)] struct or Parser struct
  const commandMatch = content.match(/#\[command\([^)]*(?:name\s*=\s*"([^"]*)")?[^)]*(?:about\s*=\s*"([^"]*)")?\)\]/)
  const cmdName = commandMatch?.[1] ?? 'main'
  const cmdDesc = commandMatch?.[2]

  const flags: FlagEntry[] = []

  // Parse struct fields with #[arg(...)] attributes
  // Match pattern: optional doc comment + #[arg(...)] + field_name: type
  const fieldRegex = /(?:\/\/\/([^\n]*)\n\s*)*#\[arg\(([^)]*)\)\]\s*(\w+)\s*:/g
  let m: RegExpExecArray | null

  while ((m = fieldRegex.exec(content)) !== null) {
    const docComment = m[1]?.trim()
    const argAttrs = m[2]
    const fieldName = m[3]

    // Skip non-flag fields (no long/short attributes)
    if (!argAttrs.includes('long') && !argAttrs.includes('short')) continue

    const longName = `--${snakeToKebab(fieldName)}`

    const shortMatch = argAttrs.match(/short\s*=\s*'([^']+)'/)
    const defaultMatch = argAttrs.match(/default_value\s*=\s*"([^"]*)"/)

    const flag: FlagEntry = {
      name: longName,
      type: 'boolean',
    }
    if (shortMatch) flag.short = `-${shortMatch[1]}`
    if (defaultMatch) flag.default = defaultMatch[1]
    if (docComment) flag.description = docComment

    flags.push(flag)
  }

  // Also capture doc comments that appear before the #[arg] line using a multi-line approach
  // (Re-parse with a broader regex to capture doc comments above fields)
  const docFieldRegex = /((?:\s*\/\/\/[^\n]*\n)+)\s*#\[arg\(([^)]*)\)\]\s*(\w+)\s*:/g
  while ((m = docFieldRegex.exec(content)) !== null) {
    const docLines = m[1]
    const argAttrs = m[2]
    const fieldName = m[3]

    if (!argAttrs.includes('long') && !argAttrs.includes('short')) continue

    const longName = `--${snakeToKebab(fieldName)}`
    const existing = flags.find(f => f.name === longName)
    if (existing && !existing.description) {
      // Extract last doc comment line
      const docMatch = docLines.match(/\/\/\/\s*(.+)$/)
      if (docMatch) existing.description = docMatch[1].trim()
    }
  }

  if (flags.length === 0 && !commandMatch) return []

  return [{ name: cmdName, flags, ...(cmdDesc ? { description: cmdDesc } : {}) }]
}

// ─── Click (Python) parsing ──────────────────────────────────────────────────

function extractClick(content: string): CommandEntry[] {
  const commands: CommandEntry[] = []

  // Find blocks of click decorators followed by def function_name
  // Match: @click.command() ... @click.option(...) ... def name(...)
  const blockRegex = /((?:@click\.[^\n]+\n)+)def (\w+)\s*\(/g
  let m: RegExpExecArray | null

  while ((m = blockRegex.exec(content)) !== null) {
    const decorators = m[1]
    const funcName = m[2]

    if (!decorators.includes('@click.command')) continue

    const flags: FlagEntry[] = []
    const optionRegex = /@click\.option\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?([^)]*)\)/g
    let om: RegExpExecArray | null
    while ((om = optionRegex.exec(decorators)) !== null) {
      const name = om[1]
      const short = om[2]?.startsWith('-') ? om[2] : undefined
      const rest = om[3]

      const defaultMatch = rest.match(/default\s*=\s*([^,)]+)/)
      const helpMatch = rest.match(/help\s*=\s*['"]([^'"]*)['"]/)
      const defaultVal = defaultMatch?.[1]?.trim()
      const help = helpMatch?.[1]

      const flag: FlagEntry = { name, type: 'string' }
      if (short) flag.short = short
      if (defaultVal) flag.default = defaultVal.replace(/^['"]|['"]$/g, '')
      if (help) flag.description = help
      flags.push(flag)
    }

    // Also get description from docstring
    const afterDef = content.slice((m.index ?? 0) + m[0].length)
    const docMatch = afterDef.match(/^\s*"""([^"]+)"""/)
    const description = docMatch?.[1].trim()

    commands.push({ name: funcName, flags, ...(description ? { description } : {}) })
  }

  return commands
}

// ─── Argparse (Python) parsing ───────────────────────────────────────────────

function extractArgparse(content: string): CommandEntry[] {
  const commands: CommandEntry[] = []

  // Track which variable names correspond to which subparser names
  // e.g. convert_parser = subparsers.add_parser('convert', ...)
  const subparserVarToName = new Map<string, string>()
  const subparserRegex = /(\w+)\s*=\s*\w+\.add_parser\(\s*['"]([^'"]+)['"](?:[^)]*help\s*=\s*['"]([^'"]*)['"])?[^)]*\)/g
  let m: RegExpExecArray | null
  while ((m = subparserRegex.exec(content)) !== null) {
    const varName = m[1]
    const cmdName = m[2]
    const description = m[3]
    subparserVarToName.set(varName, cmdName)
    commands.push({ name: cmdName, ...(description ? { description } : {}), flags: [] })
  }

  // Track root parser variable name: look for `X = argparse.ArgumentParser(...)`
  const parserVarMatch = content.match(/(\w+)\s*=\s*argparse\.ArgumentParser\s*\(/)
  const rootParserVar = parserVarMatch?.[1] ?? 'parser'

  const rootFlags: FlagEntry[] = []

  // Match varName.add_argument('--flag', ...) or varName.add_argument('-f', '--flag', ...)
  const addArgRegex = /(\w+)\.add_argument\(\s*['"]([^'"]+)['"]/g
  while ((m = addArgRegex.exec(content)) !== null) {
    const varName = m[1]
    const firstArg = m[2]

    // Get the full argument call to parse opts
    const callStart = m.index
    const callEnd = content.indexOf(')', callStart)
    const fullCall = callEnd >= 0 ? content.slice(callStart, callEnd + 1) : ''

    // Determine short and long flag names from the call
    let short: string | undefined
    let name: string

    if (firstArg.startsWith('--')) {
      name = firstArg
    } else if (firstArg.startsWith('-')) {
      short = firstArg
      // Look for a second arg that is a long flag
      const secondArgMatch = fullCall.match(/add_argument\(\s*['"][^'"]+['"]\s*,\s*['"](-{2}[^'"]+)['"]/)
      if (secondArgMatch) {
        name = secondArgMatch[1]
      } else {
        name = firstArg
      }
    } else {
      // Positional argument — skip
      continue
    }

    const opts = fullCall.slice(fullCall.indexOf('(') + 1)
    const typeMatch = opts.match(/type\s*=\s*(\w+)/)
    const defaultMatch = opts.match(/default\s*=\s*([^,)]+)/)
    const helpMatch = opts.match(/help\s*=\s*['"]([^'"]+)['"]/)

    const flag: FlagEntry = { name, type: typeMatch?.[1] ?? 'string' }
    if (short) flag.short = short
    if (defaultMatch) flag.default = defaultMatch[1].trim().replace(/^['"]|['"]$/g, '')
    if (helpMatch) flag.description = helpMatch[1]

    if (varName === rootParserVar) {
      rootFlags.push(flag)
    } else {
      // Find the subcommand this variable belongs to
      const cmdName = subparserVarToName.get(varName)
      if (cmdName) {
        const cmd = commands.find(c => c.name === cmdName)
        if (cmd) cmd.flags.push(flag)
      }
    }
  }

  if (rootFlags.length > 0 && commands.length === 0) {
    // Top-level parser only
    commands.push({ name: 'main', flags: rootFlags })
  } else if (rootFlags.length > 0) {
    // Keep root flags separate from subcommands — don't attach them to subcommands
    commands.unshift({ name: 'main', flags: rootFlags })
  }

  return commands
}

// ─── Framework detection and dispatch ────────────────────────────────────────

function detectFramework(content: string, filePath: string): 'commander' | 'yargs' | 'clap' | 'click' | 'argparse' | null {
  if (filePath.endsWith('.rs') || content.includes('#[derive(Parser)]') || content.includes('#[command(')) {
    return 'clap'
  }
  if (filePath.endsWith('.py') || content.includes('@click.')) {
    if (content.includes('@click.')) return 'click'
    if (content.includes('argparse') || content.includes('add_argument')) return 'argparse'
    return null
  }
  if (content.includes("from 'commander'") || content.includes('require(\'commander\')') || content.includes('from "commander"')) {
    return 'commander'
  }
  if (content.includes('.command(') && content.includes('.option(') && content.includes('program')) {
    return 'commander'
  }
  if (content.includes('yargs') && content.includes('.command(')) {
    return 'yargs'
  }
  return null
}

function extract(files: Map<string, string>, _manifest: ManifestInfo): Partial<ExtractionResult> {
  const allCommands: CommandEntry[] = []
  const seen = new Set<string>()

  for (const [filePath, content] of files) {
    const framework = detectFramework(content, filePath)
    if (!framework) continue

    let cmds: CommandEntry[] = []
    if (framework === 'commander') cmds = extractCommander(content)
    else if (framework === 'yargs') cmds = extractYargs(content)
    else if (framework === 'clap') cmds = extractClap(content)
    else if (framework === 'click') cmds = extractClick(content)
    else if (framework === 'argparse') cmds = extractArgparse(content)

    for (const cmd of cmds) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name)
        allCommands.push(cmd)
      }
    }
  }

  if (allCommands.length === 0) return {}
  return { commands: allCommands }
}

export const cliToolExtractor: Extractor = {
  getFilesToFetch,
  extract,
}
