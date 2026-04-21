import type { SkillTemplate } from '../types'

export const libraryTemplate: SkillTemplate = {
  type: 'library',
  frontmatterFields: ['repo', 'version', 'language', 'install', 'requires'],
  sections: {
    core: {
      maxLines: 80,
      instructions: `Maximum 80 lines. Start with a structured frontmatter block in a fenced code block, then the most critical usage patterns.

After the frontmatter, include:
- Primary import paths and any known import gotchas (correct vs incorrect import examples)
- The 3 most common usage patterns with brief code examples
- Critical gotchas — prefer "wrong way / right way" pairs where applicable
- Any model reading only this section should be able to immediately use the library correctly`,
    },
    extended: {
      maxLines: 120,
      instructions: `Maximum 120 additional lines. Include:
- Secondary API surface and less common patterns
- Configuration options with defaults noted
- Integration tips with other libraries/frameworks
- Common errors and their fixes (format: "Error: <message>" → cause → fix)
- Include type signatures for exported functions
- A "### When NOT to use" subsection (REQUIRED) — list anti-patterns, wrong-tool-for-the-job scenarios, and common misuses`,
    },
    deep: {
      maxLines: 200,
      instructions: `Maximum 200 additional lines. Include:
- Edge cases and advanced configuration
- Performance considerations and benchmarks if documented
- Migration guides between versions if documented
- Known issues or limitations
- Internals useful for debugging`,
    },
  },
  rules: [
    'Include type signatures for all exported functions',
    'Show import paths with correct package specifiers',
  ],
}
