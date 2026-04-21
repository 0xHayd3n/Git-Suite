import type { ExtractionResult, SkillFlavour, ValidateOutput, ValidationIssue, ValidationResult } from './types'

function extractUrls(text: string): Set<string> {
  const urls = new Set<string>()
  const re = /https?:\/\/[^\s)\]>"'`]+/gi
  for (const m of text.matchAll(re)) {
    urls.add(m[0].replace(/[.,;:!?)]+$/, ''))
  }
  return urls
}

function stripHallucinatedUrls(content: string, readme: string): { fixed: string; removedCount: number } {
  const allowedUrls = extractUrls(readme)
  const isAllowed = (url: string): boolean => {
    const clean = url.replace(/[.,;:!?)]+$/, '')
    if (allowedUrls.has(clean)) return true
    for (const allowed of allowedUrls) {
      if (clean.startsWith(allowed)) return true
    }
    return false
  }

  let removedCount = 0
  let result = content

  // Replace markdown links [text](url) → keep text if URL not allowed
  result = result.replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_match, text, url) => {
    if (isAllowed(url)) return _match
    removedCount++
    return text
  })

  // Remove bare URLs line by line, skipping code fences
  const lines = result.split('\n')
  let inCodeFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i].trim())) { inCodeFence = !inCodeFence; continue }
    if (inCodeFence) continue
    lines[i] = lines[i].replace(/https?:\/\/[^\s)\]>"'`]+/g, (url) => {
      if (isAllowed(url)) return url
      removedCount++
      return ''
    })
    lines[i] = lines[i]
      .replace(/\bReference:\s*$/i, '')
      .replace(/\bdocumented at\s*$/i, '')
      .replace(/\bsee\s*$/i, '')
      .replace(/\bin docs\s*$/i, '')
  }

  return { fixed: lines.join('\n').replace(/\n{3,}/g, '\n\n'), removedCount }
}

function getTextOutsideCodeBlocks(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let inCodeFence = false
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence
      continue
    }
    if (!inCodeFence) {
      result.push(line)
    }
  }
  return result.join('\n')
}

function stripLinesWithReferences(
  content: string,
  invalidNames: Set<string>,
  pattern: (name: string) => RegExp
): { fixed: string; removedCount: number } {
  const lines = content.split('\n')
  let inCodeFence = false
  let removedCount = 0
  const result: string[] = []

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence
      result.push(line)
      continue
    }
    if (inCodeFence) {
      result.push(line)
      continue
    }

    let shouldRemove = false
    for (const name of invalidNames) {
      if (pattern(name).test(line)) {
        shouldRemove = true
        break
      }
    }

    if (shouldRemove) {
      removedCount++
    } else {
      result.push(line)
    }
  }

  return { fixed: result.join('\n').replace(/\n{3,}/g, '\n\n'), removedCount }
}

export function validate(content: string, extraction: ExtractionResult, readme: string): ValidateOutput {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  let autoFixes = 0
  let fixedContent = content

  // 1. Structure check
  const requiredSections = ['CORE', 'EXTENDED', 'DEEP']
  for (const section of requiredSections) {
    const re = new RegExp(`##\\s+\\[${section}\\]`)
    if (!re.test(content)) {
      errors.push({
        check: 'structure',
        message: `Missing required section: ## [${section}]`,
      })
    }
  }

  // 2. URL hallucination check
  if (readme !== undefined) {
    const { fixed, removedCount } = stripHallucinatedUrls(fixedContent, readme)
    if (removedCount > 0) {
      fixedContent = fixed
      autoFixes += removedCount
    }
  }

  // 3. Version check
  if (extraction.manifest.version) {
    const expectedVersion = extraction.manifest.version
    // Find first fenced code block
    const firstFenceMatch = fixedContent.match(/```[\s\S]*?```/)
    if (firstFenceMatch) {
      const blockContent = firstFenceMatch[0]
      const versionMatch = blockContent.match(/version:\s*(\S+)/)
      if (versionMatch && versionMatch[1] !== expectedVersion) {
        fixedContent = fixedContent.replace(
          /^(```[\s\S]*?)version:\s*\S+/m,
          (_full, pre) => `${pre}version: ${expectedVersion}`
        )
        autoFixes++
      }
    }
  }

  // 4. Export verification — auto-strip when authoritative (5+ exports)
  if (extraction.exports && extraction.exports.length >= 5) {
    const knownExportNames = new Set(extraction.exports.map(e => e.name))
    const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
    const funcCallRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g
    const invalidNames = new Set<string>()
    for (const m of textOutsideCode.matchAll(funcCallRe)) {
      if (!knownExportNames.has(m[1])) {
        invalidNames.add(m[1])
        warnings.push({
          check: 'export-verification',
          message: `Function '${m[1]}()' referenced but not found in extraction exports — auto-stripped`,
        })
      }
    }
    if (invalidNames.size > 0) {
      const { fixed, removedCount } = stripLinesWithReferences(
        fixedContent, invalidNames, (name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\)`)
      )
      fixedContent = fixed
      autoFixes += removedCount
    }
  } else if (extraction.exports && extraction.exports.length > 0) {
    // Below threshold — warn only (existing behavior)
    const knownExportNames = new Set(extraction.exports.map(e => e.name))
    const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
    const funcCallRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g
    for (const m of textOutsideCode.matchAll(funcCallRe)) {
      if (!knownExportNames.has(m[1])) {
        warnings.push({
          check: 'export-verification',
          message: `Function '${m[1]}()' referenced but not found in extraction exports`,
        })
      }
    }
  }

  // 5. Command flag verification — auto-strip when authoritative (5+ known flags)
  if (extraction.commands && extraction.commands.length > 0) {
    const knownFlags = new Set<string>()
    for (const cmd of extraction.commands) {
      for (const flag of cmd.flags) {
        knownFlags.add(flag.name)
        if (flag.short) knownFlags.add(flag.short)
      }
    }

    if (knownFlags.size >= 5) {
      const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
      const flagRe = /--[a-zA-Z][a-zA-Z0-9-]*/g
      const invalidFlags = new Set<string>()
      for (const m of textOutsideCode.matchAll(flagRe)) {
        if (!knownFlags.has(m[0])) {
          invalidFlags.add(m[0])
          warnings.push({
            check: 'command-verification',
            message: `Flag '${m[0]}' referenced but not found in extraction commands — auto-stripped`,
          })
        }
      }
      if (invalidFlags.size > 0) {
        const { fixed, removedCount } = stripLinesWithReferences(
          fixedContent, invalidFlags, (flag) => new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        )
        fixedContent = fixed
        autoFixes += removedCount
      }
    } else {
      // Below threshold — warn only
      const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
      const flagRe = /--[a-zA-Z][a-zA-Z0-9-]*/g
      for (const m of textOutsideCode.matchAll(flagRe)) {
        if (!knownFlags.has(m[0])) {
          warnings.push({
            check: 'command-verification',
            message: `Flag '${m[0]}' referenced but not found in extraction commands`,
          })
        }
      }
    }
  }

  const result: ValidationResult = {
    passed: errors.length === 0,
    errors,
    warnings,
    autoFixes,
  }

  return { content: fixedContent, result }
}

export function validateSkill(
  content: string,
  readme: string,
  extraction: ExtractionResult,
  flavour: SkillFlavour,
): ValidateOutput {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  let autoFixes = 0
  let fixedContent = content

  // 1. Structure check — generated markers must be present
  if (!fixedContent.includes('<!-- generated:start -->')) {
    errors.push({ check: 'structure', message: 'Missing <!-- generated:start --> marker' })
  }
  if (!fixedContent.includes('<!-- generated:end -->')) {
    errors.push({ check: 'structure', message: 'Missing <!-- generated:end --> marker' })
  }

  // 2. URL hallucination strip
  const { fixed: urlFixed, removedCount } = stripHallucinatedUrls(fixedContent, readme)
  if (removedCount > 0) {
    fixedContent = urlFixed
    autoFixes += removedCount
  }

  // 3. Export + command verification — library only (domain skills don't assert API surface)
  if (flavour === 'library') {
    if (extraction.exports && extraction.exports.length >= 5) {
      const knownExportNames = new Set(extraction.exports.map(e => e.name))
      const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
      const funcCallRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g
      const invalidNames = new Set<string>()
      for (const m of textOutsideCode.matchAll(funcCallRe)) {
        if (!knownExportNames.has(m[1])) {
          invalidNames.add(m[1])
          warnings.push({ check: 'export-verification', message: `Function '${m[1]}()' not in extraction exports — auto-stripped` })
        }
      }
      if (invalidNames.size > 0) {
        const { fixed, removedCount: rc } = stripLinesWithReferences(
          fixedContent, invalidNames, (name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\)`)
        )
        fixedContent = fixed
        autoFixes += rc
      }
    } else if (extraction.exports && extraction.exports.length > 0) {
      const knownExportNames = new Set(extraction.exports.map(e => e.name))
      const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
      const funcCallRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g
      for (const m of textOutsideCode.matchAll(funcCallRe)) {
        if (!knownExportNames.has(m[1])) {
          warnings.push({ check: 'export-verification', message: `Function '${m[1]}()' not in extraction exports` })
        }
      }
    }

    if (extraction.commands && extraction.commands.length > 0) {
      const knownFlags = new Set<string>()
      for (const cmd of extraction.commands) {
        for (const flag of cmd.flags) {
          knownFlags.add(flag.name)
          if (flag.short) knownFlags.add(flag.short)
        }
      }
      if (knownFlags.size >= 5) {
        const textOutsideCode = getTextOutsideCodeBlocks(fixedContent)
        const flagRe = /--[a-zA-Z][a-zA-Z0-9-]*/g
        const invalidFlags = new Set<string>()
        for (const m of textOutsideCode.matchAll(flagRe)) {
          if (!knownFlags.has(m[0])) {
            invalidFlags.add(m[0])
            warnings.push({ check: 'command-verification', message: `Flag '${m[0]}' not in extraction commands — auto-stripped` })
          }
        }
        if (invalidFlags.size > 0) {
          const { fixed, removedCount: rc } = stripLinesWithReferences(
            fixedContent, invalidFlags, (flag) => new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          )
          fixedContent = fixed
          autoFixes += rc
        }
      }
    }
  }

  return {
    content: fixedContent,
    result: { passed: errors.length === 0, errors, warnings, autoFixes },
  }
}

export function validateComponents(content: string, readme: string): ValidateOutput {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  let autoFixes = 0
  let fixedContent = content

  const { fixed, removedCount } = stripHallucinatedUrls(fixedContent, readme)
  if (removedCount > 0) {
    fixedContent = fixed
    autoFixes += removedCount
  }

  return { content: fixedContent, result: { passed: true, errors, warnings, autoFixes } }
}
