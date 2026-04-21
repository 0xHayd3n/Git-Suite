import type { SkillTemplate } from '../types'

export const infrastructureTemplate: SkillTemplate = {
  type: 'infrastructure',
  frontmatterFields: ['repo', 'version', 'language', 'install', 'requires'],
  sections: {
    core: {
      maxLines: 80,
      instructions: `Maximum 80 lines. Start with a structured frontmatter block in a fenced code block, then the most critical usage patterns.

After the frontmatter, include:
- Provider and backend setup (required configuration block)
- The 3 most commonly defined resource types with minimal working examples
- Required variables and their types
- Deployment commands (init, plan, apply)
- Critical gotchas — state management, provider version pinning`,
    },
    extended: {
      maxLines: 120,
      instructions: `Maximum 120 additional lines. Include:
- Full resource reference — resource types, required and optional arguments
- Variable definitions with types, defaults, and validation
- Output values and how to reference them
- Module usage patterns
- Common errors and their fixes (format: "Error: <message>" → cause → fix)
- A "### When NOT to use" subsection (REQUIRED) — list scenarios where a simpler IaC approach is better`,
    },
    deep: {
      maxLines: 200,
      instructions: `Maximum 200 additional lines. Include:
- Advanced resource configuration and lifecycle management
- Remote state backend configuration
- Workspace and environment management
- Import existing resources patterns
- Known issues or provider-specific limitations
- Migration guides between major versions if documented`,
    },
  },
  rules: [
    'Show complete resource blocks including required arguments',
    'Include variable type constraints and validation rules',
    'Note which arguments force resource replacement on change',
  ],
}
