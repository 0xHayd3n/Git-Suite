import { describe, it, expect } from 'vitest'
import { getDownloadOptions, type DownloadOption } from './getDownloadOptions'

function getDefault(opts: DownloadOption[]) {
  return opts.find(o => o.isDefault)
}

describe('getDownloadOptions', () => {
  it('returns ePub default for learning/book', () => {
    const opts = getDownloadOptions('learning', 'book')
    expect(getDefault(opts)?.id).toBe('epub')
  })

  it('returns PDF default for learning/tutorial', () => {
    const opts = getDownloadOptions('learning', 'tutorial')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/course', () => {
    const opts = getDownloadOptions('learning', 'course')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/cheatsheet', () => {
    const opts = getDownloadOptions('learning', 'cheatsheet')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/interview-prep', () => {
    const opts = getDownloadOptions('learning', 'interview-prep')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns PDF default for learning/research-paper', () => {
    const opts = getDownloadOptions('learning', 'research-paper')
    expect(getDefault(opts)?.id).toBe('pdf')
  })

  it('returns bookmarks default for learning/awesome-list', () => {
    const opts = getDownloadOptions('learning', 'awesome-list')
    expect(getDefault(opts)?.id).toBe('bookmarks')
  })

  it('returns ZIP default for learning/roadmap', () => {
    const opts = getDownloadOptions('learning', 'roadmap')
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('returns ZIP default for learning/coding-challenge', () => {
    const opts = getDownloadOptions('learning', 'coding-challenge')
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('returns ZIP default for dev-tools/algorithm', () => {
    const opts = getDownloadOptions('dev-tools', 'algorithm')
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('returns ZIP default for any non-learning bucket', () => {
    for (const bucket of ['frameworks', 'ai-ml', 'editors', 'lang-projects', 'infrastructure', 'utilities']) {
      const opts = getDownloadOptions(bucket, 'anything')
      expect(getDefault(opts)?.id).toBe('zip')
    }
  })

  it('returns ZIP default when typeSub is null', () => {
    const opts = getDownloadOptions('learning', null)
    expect(getDefault(opts)?.id).toBe('zip')
  })

  it('always includes zip, clone, and folder', () => {
    const opts = getDownloadOptions('learning', 'book')
    const ids = opts.map(o => o.id)
    expect(ids).toContain('zip')
    expect(ids).toContain('clone')
    expect(ids).toContain('folder')
  })

  it('has exactly one default', () => {
    const opts = getDownloadOptions('learning', 'book')
    expect(opts.filter(o => o.isDefault)).toHaveLength(1)
  })

  it('includes epub and docx for learning/book but not bookmarks', () => {
    const opts = getDownloadOptions('learning', 'book')
    const ids = opts.map(o => o.id)
    expect(ids).toContain('epub')
    expect(ids).toContain('docx')
    expect(ids).toContain('pdf')
    expect(ids).not.toContain('bookmarks')
  })

  it('includes bookmarks for awesome-list but not epub or docx', () => {
    const opts = getDownloadOptions('learning', 'awesome-list')
    const ids = opts.map(o => o.id)
    expect(ids).toContain('bookmarks')
    expect(ids).not.toContain('epub')
    expect(ids).not.toContain('docx')
  })

  it('non-learning buckets only have zip, clone, folder', () => {
    const opts = getDownloadOptions('frameworks', 'web-framework')
    const ids = opts.map(o => o.id)
    expect(ids).toEqual(['zip', 'clone', 'folder'])
  })
})
