// src/utils/storybookParser.test.ts
import { describe, it, expect } from 'vitest'
import { parseStorybookIndex } from './storybookParser'

const V4_INDEX = {
  v: 4,
  entries: {
    'button--primary':   { type: 'story', id: 'button--primary',   name: 'Primary',   title: 'Button' },
    'button--secondary': { type: 'story', id: 'button--secondary', name: 'Secondary', title: 'Button' },
    'button--docs':      { type: 'docs',  id: 'button--docs',      name: 'Docs',      title: 'Button' },
    'card--default':     { type: 'story', id: 'card--default',      name: 'Default',   title: 'Card' },
    'textfield--empty':  { type: 'story', id: 'textfield--empty',  name: 'Empty',     title: 'Forms/TextField' },
  },
}

const V3_STORIES = {
  v: 3,
  stories: {
    'button--primary':   { name: 'Primary',   kind: 'Button',          story: 'Primary'   },
    'button--secondary': { name: 'Secondary', kind: 'Button',          story: 'Secondary' },
    'card--default':     { name: 'Default',   kind: 'Card',            story: 'Default'   },
    'textfield--empty':  { name: 'Empty',     kind: 'Forms/TextField', story: 'Empty'     },
  },
}

describe('parseStorybookIndex — v4', () => {
  it('groups stories by component title', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const names = result.map(c => c.name)
    expect(names).toContain('Button')
    expect(names).toContain('Card')
    expect(names).toContain('TextField')
  })

  it('extracts the last path segment as component name', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const tf = result.find(c => c.name === 'TextField')
    expect(tf).toBeDefined()
    expect(tf!.group).toBe('Forms')
  })

  it('skips docs entries', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const btn = result.find(c => c.name === 'Button')!
    expect(btn.stories.every(s => s.name !== 'Docs')).toBe(true)
  })

  it('sets defaultStoryId to a story named Primary if present', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const btn = result.find(c => c.name === 'Button')!
    expect(btn.defaultStoryId).toBe('button--primary')
  })

  it('sets defaultStoryId to first story when no Primary/Default', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const tf = result.find(c => c.name === 'TextField')!
    expect(tf.defaultStoryId).toBe('textfield--empty')
  })

  it('sets group to null for top-level components', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const btn = result.find(c => c.name === 'Button')!
    expect(btn.group).toBeNull()
  })

  it('returns components sorted alphabetically by name', () => {
    const result = parseStorybookIndex(V4_INDEX)
    const names = result.map(c => c.name)
    expect(names).toEqual([...names].sort())
  })
})

describe('parseStorybookIndex — v3', () => {
  it('parses v3 stories.json format', () => {
    const result = parseStorybookIndex(V3_STORIES)
    const names = result.map(c => c.name)
    expect(names).toContain('Button')
    expect(names).toContain('Card')
    expect(names).toContain('TextField')
  })

  it('reads kind field as component title in v3', () => {
    const result = parseStorybookIndex(V3_STORIES)
    const tf = result.find(c => c.name === 'TextField')!
    expect(tf.group).toBe('Forms')
  })
})

describe('parseStorybookIndex — edge cases', () => {
  it('returns empty array for empty entries', () => {
    expect(parseStorybookIndex({ v: 4, entries: {} })).toEqual([])
  })

  it('returns empty array for unrecognised format', () => {
    expect(parseStorybookIndex({ v: 99 })).toEqual([])
  })

  it('includes entries with absent type field (real v4 format)', () => {
    const index = {
      v: 4,
      entries: {
        'badge--default': { id: 'badge--default', name: 'Default', title: 'Badge' }, // no type field
      },
    }
    const result = parseStorybookIndex(index)
    expect(result.find(c => c.name === 'Badge')).toBeDefined()
  })

  it('skips entries where title resolves to empty string', () => {
    const index = {
      v: 4,
      entries: {
        'untitled--story': { type: 'story', id: 'untitled--story', name: 'Story', title: '' },
        'button--primary': { type: 'story', id: 'button--primary', name: 'Primary', title: 'Button' },
      },
    }
    const result = parseStorybookIndex(index)
    expect(result.every(c => c.name !== '')).toBe(true)
    expect(result.find(c => c.name === 'Button')).toBeDefined()
  })
})
