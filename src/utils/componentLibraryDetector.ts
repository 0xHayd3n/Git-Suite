// src/utils/componentLibraryDetector.ts

// Hyphenated strings matching GitHub topic tags (all lowercase, dash-separated)
const TOPIC_KEYWORDS = new Set([
  'react-components', 'vue-components', 'angular-components',
  'svelte-components', 'web-components', 'ui-library', 'ui-kit',
  'ui-components', 'component-library', 'design-system', 'storybook',
  'components', 'react-ui', 'css-framework',
])

// Space-separated strings matching prose descriptions (all lowercase, space-separated)
const DESCRIPTION_KEYWORDS = [
  'components', 'ui library', 'ui kit', 'design system', 'component library',
]

export function isComponentLibraryRepo(
  topics: string[],
  description: string | null,
): boolean {
  if (topics.some(t => TOPIC_KEYWORDS.has(t.toLowerCase()))) return true
  if (!description) return false
  const lower = description.toLowerCase()
  return DESCRIPTION_KEYWORDS.some(kw => lower.includes(kw))
}
