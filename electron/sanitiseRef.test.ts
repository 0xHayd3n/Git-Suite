import { describe, it, expect } from 'vitest'
import { sanitiseRef } from './sanitiseRef'

describe('sanitiseRef', () => {
  it('passes through a clean semver tag unchanged', () => {
    expect(sanitiseRef('v1.2.3')).toBe('v1.2.3')
  })

  it('passes through a pre-release tag unchanged', () => {
    expect(sanitiseRef('v9.0.0-beta.0')).toBe('v9.0.0-beta.0')
  })

  it('replaces slashes with underscores', () => {
    expect(sanitiseRef('releases/v7.3.9')).toBe('releases_v7.3.9')
  })

  it('strips leading @scope/ prefix entirely', () => {
    expect(sanitiseRef('@scope/v7')).toBe('v7')
  })

  it('strips characters unsafe in filenames', () => {
    expect(sanitiseRef('v1.0 (final)')).toBe('v1.0final')
  })
})
