export function parseSkillDepths(content: string): { core: number; extended: number; deep: number } {
  const coreMatch  = content.match(/## \[CORE\]([\s\S]*?)(?=## \[EXTENDED\]|$)/)
  const extMatch   = content.match(/## \[EXTENDED\]([\s\S]*?)(?=## \[DEEP\]|$)/)
  const deepMatch  = content.match(/## \[DEEP\]([\s\S]*?)$/)
  return {
    core:     coreMatch  ? coreMatch[1].trim().split(/\r?\n/).length  : 0,
    extended: extMatch   ? extMatch[1].trim().split(/\r?\n/).length   : 0,
    deep:     deepMatch  ? deepMatch[1].trim().split(/\r?\n/).length  : 0,
  }
}

export interface ComponentEntry { name: string; category: string }

export function parseComponents(content: string): ComponentEntry[] {
  const results: ComponentEntry[] = []
  let currentCategory = 'General'

  for (const line of content.split(/\r?\n/)) {
    const sectionMatch  = line.match(/^##(?!#)/)
    const categoryMatch = line.match(/^#{4}(?!#)\s+(.+)$/)
    const componentMatch = line.match(/^#{3}(?!#)\s+(.+)$/)

    if (sectionMatch) {
      currentCategory = 'General'
    } else if (categoryMatch) {
      currentCategory = categoryMatch[1].trim()
    } else if (componentMatch) {
      results.push({ name: componentMatch[1].trim(), category: currentCategory })
    }
  }

  return results
}
