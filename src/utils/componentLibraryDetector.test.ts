import { describe, it, expect } from 'vitest'
import { isComponentLibraryRepo } from './componentLibraryDetector'

describe('isComponentLibraryRepo — topic matches', () => {
  it('returns true for react-components topic', () => {
    expect(isComponentLibraryRepo(['react-components'], null)).toBe(true)
  })
  it('returns true for ui-library topic', () => {
    expect(isComponentLibraryRepo(['ui-library'], null)).toBe(true)
  })
  it('returns true for design-system topic', () => {
    expect(isComponentLibraryRepo(['design-system'], null)).toBe(true)
  })
  it('returns true for component-library topic', () => {
    expect(isComponentLibraryRepo(['component-library'], null)).toBe(true)
  })
  it('returns true for ui-kit topic', () => {
    expect(isComponentLibraryRepo(['ui-kit'], null)).toBe(true)
  })
  it('returns true for storybook topic', () => {
    expect(isComponentLibraryRepo(['storybook'], null)).toBe(true)
  })
  it('is case-insensitive for topics', () => {
    expect(isComponentLibraryRepo(['UI-Library'], null)).toBe(true)
  })
  it('returns false for unrelated topics', () => {
    expect(isComponentLibraryRepo(['cli', 'node', 'typescript'], null)).toBe(false)
  })
  it('returns false for empty topics and null description', () => {
    expect(isComponentLibraryRepo([], null)).toBe(false)
  })
})

describe('isComponentLibraryRepo — description matches', () => {
  it('returns true when description contains "components"', () => {
    expect(isComponentLibraryRepo([], 'A collection of reusable components')).toBe(true)
  })
  it('returns true when description contains "design system"', () => {
    expect(isComponentLibraryRepo([], 'Our design system for web apps')).toBe(true)
  })
  it('returns true when description contains "ui library" (case-insensitive)', () => {
    expect(isComponentLibraryRepo([], 'UI Library for Vue 3')).toBe(true)
  })
  it('returns true when description contains "ui kit"', () => {
    expect(isComponentLibraryRepo([], 'A minimal UI kit')).toBe(true)
  })
  it('returns false when description has no keywords', () => {
    expect(isComponentLibraryRepo([], 'Fast async job queue for Node.js')).toBe(false)
  })
  it('returns false for null description with no topics', () => {
    expect(isComponentLibraryRepo([], null)).toBe(false)
  })
  it('returns false when description contains "component" singular but not "components" or "component library"', () => {
    expect(isComponentLibraryRepo([], 'A chart component for React')).toBe(false)
  })
})

describe('isComponentLibraryRepo — combined', () => {
  it('returns true when topics match even if description does not', () => {
    expect(isComponentLibraryRepo(['react-ui'], 'Fast async job queue')).toBe(true)
  })
  it('returns true when description matches even if topics do not', () => {
    expect(isComponentLibraryRepo(['cli'], 'A component library for React')).toBe(true)
  })
})
