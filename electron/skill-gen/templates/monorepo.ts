import type { SkillTemplate } from '../types'

export const monorepoTemplate: SkillTemplate = {
  type: 'monorepo',
  frontmatterFields: ['repo', 'version', 'language', 'install', 'requires'],
  sections: {
    core: {
      maxLines: 80,
      instructions: `Maximum 80 lines. Start with a structured frontmatter block in a fenced code block, then the most critical usage patterns.

After the frontmatter, include:
- Workspace setup and package manager requirements
- Package listing and their primary purposes
- How to install and use individual packages vs the full monorepo
- Cross-package import patterns
- Critical gotchas — workspace resolution issues, version conflicts`,
    },
    extended: {
      maxLines: 120,
      instructions: `Maximum 120 additional lines. Include:
- Per-package API surface and main exports
- Inter-package dependency relationships
- Shared configuration packages and how to extend them
- Build and development scripts
- Common errors and their fixes (format: "Error: <message>" → cause → fix)
- A "### When NOT to use" subsection (REQUIRED) — list anti-patterns for monorepo consumption`,
    },
    deep: {
      maxLines: 200,
      instructions: `Maximum 200 additional lines. Include:
- Advanced workspace tooling (Turborepo, Nx, Lerna) configuration if used
- Publishing individual packages workflow
- Versioning strategy across packages
- Known issues or limitations
- Internals useful for debugging cross-package issues`,
    },
  },
  rules: [
    'List all packages with their npm names and paths',
    'Show cross-package import examples',
    'Note which packages are public vs internal',
  ],
}
