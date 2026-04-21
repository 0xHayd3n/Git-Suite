import { describe, it, expect } from 'vitest'
import { parseComponents } from './skillParse'

const SAMPLE = `
## [CORE]
Some core content

#### Form & Input
### Button
Button docs here

### Input
Input docs here

#### Overlay & Feedback
### Dialog
Dialog docs here

## [EXTENDED]
Extended content
`

describe('parseComponents', () => {
  it('extracts component names with their categories', () => {
    const result = parseComponents(SAMPLE)
    expect(result).toEqual([
      { name: 'Button', category: 'Form & Input' },
      { name: 'Input',  category: 'Form & Input' },
      { name: 'Dialog', category: 'Overlay & Feedback' },
    ])
  })

  it('returns empty array when no ### headings exist', () => {
    expect(parseComponents('## [CORE]\nsome content\n## [EXTENDED]\nmore')).toEqual([])
  })

  it('uses "General" as category when no #### heading precedes the first component', () => {
    const content = '## [CORE]\n### Button\ndocs\n'
    expect(parseComponents(content)).toEqual([{ name: 'Button', category: 'General' }])
  })

  it('does not emit ## depth markers as components', () => {
    const result = parseComponents(SAMPLE)
    expect(result.map((c) => c.name)).not.toContain('[CORE]')
    expect(result.map((c) => c.name)).not.toContain('[EXTENDED]')
  })

  it('does not treat ##### headings as categories (Issue 1)', () => {
    const content = '##### Not A Category\n### Button\n'
    const result = parseComponents(content)
    expect(result).toEqual([{ name: 'Button', category: 'General' }])
  })

  it('handles CRLF line endings (Issue 2)', () => {
    const content = "#### Form\r\n### Button\r\n"
    const result = parseComponents(content)
    expect(result).toEqual([{ name: 'Button', category: 'Form' }])
  })

  it('resets currentCategory to General at ## depth section boundaries (Issue 3)', () => {
    const content = '#### MyCategory\n### Button\n## [EXTENDED]\n### Dialog\n'
    const result = parseComponents(content)
    expect(result).toEqual([
      { name: 'Button', category: 'MyCategory' },
      { name: 'Dialog', category: 'General' },
    ])
  })
})
