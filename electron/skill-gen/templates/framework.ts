import type { SkillTemplate } from '../types'

export const frameworkTemplate: SkillTemplate = {
  type: 'framework',
  frontmatterFields: ['repo', 'version', 'language', 'install', 'requires'],
  sections: {
    core: {
      maxLines: 80,
      instructions: `Maximum 80 lines. Start with a structured frontmatter block in a fenced code block, then the most critical usage patterns.

After the frontmatter, include:
- Project setup and scaffolding commands
- Core configuration options (config file format and minimal working example)
- The 3 most common usage patterns with code examples
- Middleware or plugin registration pattern
- Critical gotchas — common configuration mistakes`,
    },
    extended: {
      maxLines: 120,
      instructions: `Maximum 120 additional lines. Include:
- Plugin and middleware system — how to write and register custom plugins
- Full configuration reference with defaults noted
- Lifecycle hooks and their execution order
- Integration tips with databases, auth, or other services
- Common errors and their fixes (format: "Error: <message>" → cause → fix)
- A "### When NOT to use" subsection (REQUIRED) — list scenarios where a lighter-weight solution is better`,
    },
    deep: {
      maxLines: 200,
      instructions: `Maximum 200 additional lines. Include:
- Advanced configuration and custom plugin authoring
- Performance tuning and scaling considerations
- Migration guides between major versions if documented
- Known issues or limitations
- Internals useful for debugging framework-level issues`,
    },
  },
  rules: [
    'Show complete project setup from scratch including config files',
    'Include middleware/plugin registration signatures',
    'Document lifecycle hook names and their call order',
  ],
}
