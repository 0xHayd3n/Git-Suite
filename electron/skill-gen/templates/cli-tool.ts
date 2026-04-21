import type { SkillTemplate } from '../types'

export const cliToolTemplate: SkillTemplate = {
  type: 'cli-tool',
  frontmatterFields: ['repo', 'version', 'language', 'install', 'requires'],
  sections: {
    core: {
      maxLines: 80,
      instructions: `Maximum 80 lines. Start with a structured frontmatter block in a fenced code block, then the most critical usage patterns.

After the frontmatter, include:
- Installation and basic invocation
- The 3 most common subcommand usage patterns with complete shell examples
- Critical flags and their defaults
- Piping and shell integration examples
- Critical gotchas — common flag misuses or argument ordering issues`,
    },
    extended: {
      maxLines: 120,
      instructions: `Maximum 120 additional lines. Include:
- Full subcommand reference with flags and descriptions
- Configuration file format and options with defaults noted
- Environment variables that affect behaviour
- Common errors and their fixes (format: "Error: <message>" → cause → fix)
- A "### When NOT to use" subsection (REQUIRED) — list scenarios where a different tool is better`,
    },
    deep: {
      maxLines: 200,
      instructions: `Maximum 200 additional lines. Include:
- Advanced subcommand combinations and piping patterns
- Performance considerations for large inputs
- Integration with CI/CD pipelines
- Plugin or extension system if applicable
- Known issues or limitations
- Internals useful for debugging unexpected behaviour`,
    },
  },
  rules: [
    'Show complete shell commands including flags and arguments',
    'Include subcommand aliases where they exist',
    'Note flag shorthand forms (e.g. -f for --file)',
  ],
}
