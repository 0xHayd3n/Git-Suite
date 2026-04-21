import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CloneOptionsPanel from './CloneOptionsPanel'

// Mock window.api.download — the renderer-side IPC surface exposed by preload.ts
const mockRepoZip = vi.fn().mockResolvedValue(undefined)
const mockRepoConverted = vi.fn().mockResolvedValue(undefined)
const mockBookmarks = vi.fn().mockResolvedValue(undefined)
const mockTopLevelFolders = vi.fn().mockResolvedValue(['src', 'docs', 'tests'])
const mockRawFolder = vi.fn().mockResolvedValue(undefined)

Object.defineProperty(window, 'api', {
  value: {
    download: {
      repoZip: mockRepoZip,
      repoConverted: mockRepoConverted,
      bookmarks: mockBookmarks,
      topLevelFolders: mockTopLevelFolders,
      rawFolder: mockRawFolder,
    },
  },
  writable: true,
})

Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
})

beforeEach(() => {
  vi.clearAllMocks()
})

const defaultProps = {
  owner: 'sindresorhus',
  name: 'awesome',
  typeBucket: 'resource',
  typeSub: null,
  defaultBranch: 'main',
}

describe('CloneOptionsPanel', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<CloneOptionsPanel {...defaultProps} open={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the clone URL tabs when open is true', () => {
    render(<CloneOptionsPanel {...defaultProps} open={true} />)
    expect(screen.getByText('HTTPS')).toBeInTheDocument()
    expect(screen.getByText('SSH')).toBeInTheDocument()
    expect(screen.getByText('GitHub CLI')).toBeInTheDocument()
  })

  it('copies the active clone URL to clipboard', async () => {
    render(<CloneOptionsPanel {...defaultProps} open={true} />)
    const copyBtn = screen.getByTitle('Copy to clipboard')
    fireEvent.click(copyBtn)
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/sindresorhus/awesome.git')
    })
  })

  it('calls repoZip when ZIP download is clicked', async () => {
    render(<CloneOptionsPanel {...defaultProps} open={true} />)
    const zipBtn = await screen.findByText(/ZIP/i)
    fireEvent.click(zipBtn.closest('button')!)
    await waitFor(() => {
      expect(mockRepoZip).toHaveBeenCalledWith('sindresorhus', 'awesome')
    })
  })
})
