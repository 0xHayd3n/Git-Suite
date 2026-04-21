import { describe, it, expect } from 'vitest'
import { componentLibraryExtractor } from './component-library'

describe('componentLibraryExtractor.getFilesToFetch', () => {
  it('fetches .tsx files in components/', () => {
    const tree = ['src/components/Button.tsx', 'src/components/Modal.tsx', 'src/utils.ts']
    const result = componentLibraryExtractor.getFilesToFetch(tree, { ecosystem: 'node' })
    expect(result).toContain('src/components/Button.tsx')
    expect(result).toContain('src/components/Modal.tsx')
    expect(result).not.toContain('src/utils.ts')
  })
})

describe('componentLibraryExtractor.extract', () => {
  it('extracts React component with props', () => {
    const files = new Map([
      ['src/Button.tsx', `
interface ButtonProps {
  variant: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

export function Button({ variant, size = 'md', disabled, onClick, children }: ButtonProps) {
  return <button className={variant} disabled={disabled} onClick={onClick}>{children}</button>
}
`],
    ])
    const result = componentLibraryExtractor.extract(files, { ecosystem: 'node' })
    expect(result.components).toBeDefined()
    const btn = result.components!.find(c => c.name === 'Button')
    expect(btn).toBeDefined()
    expect(btn!.props.length).toBeGreaterThan(0)
    expect(btn!.props.find(p => p.name === 'variant')).toBeDefined()
  })

  it('returns empty for non-component files', () => {
    const files = new Map([['utils.ts', 'export function add(a: number, b: number) { return a + b }']])
    const result = componentLibraryExtractor.extract(files, { ecosystem: 'node' })
    expect(result.components ?? []).toEqual([])
  })
})
