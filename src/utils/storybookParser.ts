// src/utils/storybookParser.ts

export interface StorybookStory {
  id: string
  name: string
}

export interface StorybookComponent {
  name: string
  group: string | null
  stories: StorybookStory[]
  defaultStoryId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStorybookIndex(raw: any): StorybookComponent[] {
  const stories: { id: string; name: string; title: string }[] = []

  if (raw?.v >= 4 && raw.entries) {
    for (const [id, entry] of Object.entries(raw.entries as Record<string, any>)) {
      // skip non-story entries (docs, templates, etc.)
      if (entry.type && entry.type !== 'story') continue
      stories.push({ id, name: entry.name ?? id, title: entry.title ?? '' })
    }
  } else if (raw?.v === 3 && raw.stories) {
    for (const [id, entry] of Object.entries(raw.stories as Record<string, any>)) {
      stories.push({ id, name: entry.name ?? entry.story ?? id, title: entry.kind ?? '' })
    }
  } else {
    return []
  }

  const map = new Map<string, { id: string; name: string }[]>()
  for (const s of stories) {
    const arr = map.get(s.title) ?? []
    arr.push({ id: s.id, name: s.name })
    map.set(s.title, arr)
  }

  const components: StorybookComponent[] = []
  for (const [title, storyList] of map) {
    const segments = title.split('/')
    const name  = segments[segments.length - 1].trim()
    if (!name) continue  // skip entries where title path produced an empty component name
    const group = segments.length > 1 ? segments.slice(0, -1).join(' / ').trim() : null

    const preferred = storyList.find(
      s => /^(primary|default)$/i.test(s.name)
    ) ?? storyList[0]

    components.push({
      name,
      group,
      stories: storyList,
      defaultStoryId: preferred.id,
    })
  }

  return components.sort((a, b) => a.name.localeCompare(b.name))
}
