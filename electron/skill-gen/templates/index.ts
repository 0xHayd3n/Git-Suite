import type { RepoType, ExtractionResult, SkillTemplate, ComponentEntry } from '../types'
import { libraryTemplate } from './library'
import { cliToolTemplate } from './cli-tool'
import { frameworkTemplate } from './framework'
import { componentLibraryTemplate } from './component-library'
import { monorepoTemplate } from './monorepo'
import { infrastructureTemplate } from './infrastructure'
import { genericTemplate } from './generic'

const templateRegistry: Record<RepoType, SkillTemplate> = {
  library: libraryTemplate,
  'cli-tool': cliToolTemplate,
  framework: frameworkTemplate,
  'component-library': componentLibraryTemplate,
  monorepo: monorepoTemplate,
  infrastructure: infrastructureTemplate,
  generic: genericTemplate,
}

export function getTemplate(type: RepoType): SkillTemplate {
  return templateRegistry[type] ?? genericTemplate
}

function formatExtractionData(extraction: ExtractionResult): string {
  const parts: string[] = []

  parts.push(`Repo Type: ${extraction.repoType}`)
  parts.push(`Ecosystem: ${extraction.manifest.ecosystem}`)

  if (extraction.manifest.name) {
    parts.push(`Package Name: ${extraction.manifest.name}`)
  }

  if (extraction.fileTree.length > 0) {
    parts.push(`\nFile Tree (sample):\n${extraction.fileTree.slice(0, 30).map(f => `  ${f}`).join('\n')}`)
  }

  if (extraction.exports && extraction.exports.length > 0) {
    const exportLines = extraction.exports.map(e => {
      const sig = e.signature ? `: ${e.signature}` : ''
      return `  - ${e.name} (${e.kind})${sig}`
    })
    parts.push(`\nExports:\n${exportLines.join('\n')}`)
  }

  if (extraction.commands && extraction.commands.length > 0) {
    const commandLines = extraction.commands.map(cmd => {
      const desc = cmd.description ? ` — ${cmd.description}` : ''
      const flagLines = cmd.flags.map(f => {
        const short = f.short ? `, ${f.short}` : ''
        const def = f.default !== undefined ? ` (default: ${f.default})` : ''
        const flagDesc = f.description ? ` — ${f.description}` : ''
        return `      ${f.name}${short} [${f.type}]${def}${flagDesc}`
      })
      const flagSection = flagLines.length > 0 ? `\n    Flags:\n${flagLines.join('\n')}` : ''
      return `  - ${cmd.name}${desc}${flagSection}`
    })
    parts.push(`\nCommands:\n${commandLines.join('\n')}`)
  }

  if (extraction.components && extraction.components.length > 0) {
    const componentLines = extraction.components.map(c => {
      const propLines = c.props.map(p => {
        const req = p.required ? 'required' : 'optional'
        const def = p.defaultValue !== undefined ? `, default: ${p.defaultValue}` : ''
        return `      ${p.name}: ${p.type} (${req}${def})`
      })
      const propSection = propLines.length > 0 ? `\n    Props:\n${propLines.join('\n')}` : ''
      return `  - ${c.name}${propSection}`
    })
    parts.push(`\nComponents:\n${componentLines.join('\n')}`)
  }

  if (extraction.packages && extraction.packages.length > 0) {
    const packageLines = extraction.packages.map(p => {
      const desc = p.description ? ` — ${p.description}` : ''
      const main = p.mainExport ? ` (main: ${p.mainExport})` : ''
      return `  - ${p.name}${desc}${main}`
    })
    parts.push(`\nPackages:\n${packageLines.join('\n')}`)
  }

  if (extraction.resources && extraction.resources.length > 0) {
    const resourceLines = extraction.resources.map(r => `  - ${r.type}: ${r.name}`)
    parts.push(`\nResources:\n${resourceLines.join('\n')}`)
  }

  if (extraction.configSchema && extraction.configSchema.length > 0) {
    const configLines = extraction.configSchema.map(c => {
      const def = c.default !== undefined ? ` (default: ${c.default})` : ''
      return `  - ${c.key}: ${c.type}${def}`
    })
    parts.push(`\nConfig Schema:\n${configLines.join('\n')}`)
  }

  return parts.join('\n')
}

export function buildPromptFromTemplate(
  type: RepoType,
  extraction: ExtractionResult,
  readme: string,
  repoFullName: string,
  focusInstructions?: string | null,
  topics?: string[],
): string {
  const template = getTemplate(type)
  const readmeTruncated = readme.slice(0, 12000)

  const manifest = extraction.manifest
  const version = manifest.version ?? 'unknown'
  const ecosystem = manifest.ecosystem
  const topicsStr = topics && topics.length > 0 ? topics.join(', ') : ''

  const extractionData = formatExtractionData(extraction)

  const typeRules = template.rules.map(r => `- ${r}`).join('\n')
  const typeRulesSection = typeRules ? `\n${typeRules}` : ''

  const focusSection = focusInstructions
    ? `\n--- REPO-SPECIFIC FOCUS ---\n${focusInstructions}\n--- END FOCUS ---\n\nUse the above to tailor your output. Emphasize the patterns and concepts described above over generic content.\n`
    : ''

  return `Generate a skill file for the GitHub repository "${repoFullName}".

Language: ${ecosystem}
Topics: ${topicsStr}
Version: ${version}

--- EXTRACTED DATA ---
${extractionData}
--- END EXTRACTED DATA ---

README:
${readmeTruncated}
${focusSection}
Produce a skill.md file with exactly three depth sections.

SECTION MARKER FORMAT — follow exactly:
✅ CORRECT: ## [CORE]
❌ WRONG:  ## [CORE] Some Title Here

## [CORE]
${template.sections.core.instructions}

The FIRST thing after ## [CORE] must be this fenced code block:
\`\`\`
repo: ${repoFullName}
version: ${version}
language: ${ecosystem}
install: <from README>
requires: <runtime deps>
\`\`\`

## [EXTENDED]
${template.sections.extended.instructions}

## [DEEP]
${template.sections.deep.instructions}

Rules:
- Write for an AI coding assistant as the reader
- Be dense and precise — no filler
- Prefer code examples over prose
- Each section independently useful
- Do not reproduce licence text, contributor lists, changelog
- Do not include URLs unless verbatim in README
- CRITICAL: Only include information from the README and extracted data — do not invent
- Start immediately with ## [CORE]
- Do not use any tools${typeRulesSection}`
}

export function buildComponentsPrompt(
  extraction: ExtractionResult,
  readme: string,
  repoFullName: string,
  focusInstructions: string | null,
  scannedComponents?: Array<{ name: string; props: Array<{ name: string; type: string; required: boolean; defaultValue?: string }> }>,
): string {
  const readmeTruncated = readme.slice(0, 12000)
  const extractionData = formatExtractionData(extraction)

  // Format scanned components if provided
  let componentSection: string
  const comps = scannedComponents ?? extraction.components
  if (comps && comps.length > 0) {
    const scannedBlock = comps.map(c => {
      if (c.props.length === 0) return `- ${c.name}: (no props extracted)`
      const propList = c.props.map(p => {
        let desc = `${p.name} (${p.type}, ${p.required ? 'required' : 'optional'}`
        if (p.defaultValue !== undefined) desc += `, default: ${p.defaultValue}`
        desc += ')'
        return desc
      }).join(', ')
      return `- ${c.name}: ${propList}`
    }).join('\n')
    componentSection = `SCANNED COMPONENTS (from source code analysis):
${scannedBlock}

Document all components listed above. Use the README for general context (package name, import paths, design system) and the scanned data for component names and props.`
  } else {
    componentSection = 'Document all components you can identify from the README.'
  }

  const focusSection = focusInstructions
    ? `\n--- REPO-SPECIFIC FOCUS ---\n${focusInstructions}\n--- END FOCUS ---\n\nUse the above to tailor your output. Emphasize the patterns and concepts described above over generic content.\n`
    : ''

  return `Generate a components skill file for the GitHub repository "${repoFullName}".

--- EXTRACTED DATA ---
${extractionData}
--- END EXTRACTED DATA ---

README:
${readmeTruncated}
${focusSection}
${componentSection}

Produce a components.skill.md file using this exact format:

## [COMPONENTS]

One sentence describing what this component library provides and its design system (e.g. Material Design, Radix primitives, headless, etc.).

Then for each component, use this structure:

### ComponentName
**Import:** \`import { ComponentName } from 'package-name'\`
**Props:** (list key props as: \`propName\` — type — default — description)
**Variants:** variant1 | variant2 | variant3 (omit if not applicable)
**Example:**
\`\`\`tsx
<ComponentName prop="value" onEvent={handler} />
\`\`\`
**Gotcha:** one-line gotcha if there is a common mistake (omit if none)

---

Rules:
- Write for an AI coding assistant — optimise for fast, accurate component usage
- Include ONLY components documented in the README or listed in the scanned data above — do not invent components
- Key props only (3–6 per component) — skip internal/rarely-used props
- Prefer real prop names from the scanned data or README over guessed names
- Do not include URLs unless they appear verbatim in the README
- Group related components under a #### Category heading (e.g. #### Form & Input)
- Start immediately with ## [COMPONENTS] on its own line — no preamble
- Do not use any tools — output the skill file text directly.`
}
