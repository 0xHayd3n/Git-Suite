import type { SkillTemplate } from '../types'

export const componentLibraryTemplate: SkillTemplate = {
  type: 'component-library',
  frontmatterFields: ['repo', 'version', 'language', 'install', 'requires'],
  sections: {
    core: {
      maxLines: 80,
      instructions: `Maximum 80 lines. Start with a structured frontmatter block in a fenced code block, then the most critical usage patterns.

After the frontmatter, include:
- Provider/theme setup required at app root
- Import patterns (named vs default, tree-shaking considerations)
- The 3 most commonly used components with props and usage examples
- Critical styling or theming gotchas`,
    },
    extended: {
      maxLines: 120,
      instructions: `Maximum 120 additional lines. Include:
- Component props reference — key props per component (name, type, default, description)
- One usage example per component showing realistic prop combinations
- Theming and style customisation API
- Accessibility props and ARIA patterns
- Common errors and their fixes (format: "Error: <message>" → cause → fix)
- A "### When NOT to use" subsection (REQUIRED) — list scenarios where a different UI approach is better`,
    },
    deep: {
      maxLines: 200,
      instructions: `Maximum 200 additional lines. Include:
- Advanced component composition patterns
- Custom theme token overrides
- Server-side rendering considerations
- Animation and transition APIs if applicable
- Known issues or limitations per component
- Migration guides between major versions if documented`,
    },
  },
  rules: [
    'Show props with types and defaults for each component',
    'Include import statements with correct package paths',
    'Use JSX/TSX examples for all component usage',
  ],
}
