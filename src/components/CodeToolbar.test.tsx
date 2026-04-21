// src/components/CodeToolbar.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CodeToolbar from './CodeToolbar'

it('renders language, line count, and file size', () => {
  render(<CodeToolbar language="javascript" lineCount={142} fileSize={4200} wordWrap={false} onToggleWordWrap={() => {}} />)
  expect(screen.getByText('JavaScript')).toBeInTheDocument()
  expect(screen.getByText('142 lines')).toBeInTheDocument()
  expect(screen.getByText('4.1 KB')).toBeInTheDocument()
})

it('calls onToggleWordWrap when wrap button clicked', async () => {
  const onToggle = vi.fn()
  render(<CodeToolbar language="typescript" lineCount={10} fileSize={500} wordWrap={false} onToggleWordWrap={onToggle} />)
  await userEvent.click(screen.getByTitle('Toggle word wrap'))
  expect(onToggle).toHaveBeenCalledOnce()
})

it('copies content to clipboard on copy button click', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  const original = navigator.clipboard
  Object.assign(navigator, { clipboard: { writeText } })
  render(<CodeToolbar language="go" lineCount={5} fileSize={100} wordWrap={false} onToggleWordWrap={() => {}} content="package main" />)
  await userEvent.click(screen.getByTitle('Copy file contents'))
  expect(writeText).toHaveBeenCalledWith('package main')
  Object.assign(navigator, { clipboard: original })
})
