import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import NavBar from './NavBar'

// Mock hooks that reach outside router context
vi.mock('../contexts/RepoNav', () => ({
  useRepoNav: () => ({
    state: {
      activeTab: null,
      filePath: null,
      isDirectory: false,
      canGoBack: false,
      canGoForward: false,
      onTabClick: null,
      onFilePathClick: null,
      onGoBack: null,
      onGoForward: null,
    },
    setActiveTab: vi.fn(),
    setFilePath: vi.fn(),
  }),
}))

vi.mock('../hooks/useWhitewashAvatar', () => ({
  useWhitewashAvatar: () => null,
}))

vi.mock('../assets/logo.png', () => ({ default: 'logo.png' }))

function renderAt(pathname: string, state?: object) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="*" element={<NavBar />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('NavBar breadcrumb — /library/collection/:id', () => {
  it('shows Library > collection name when state.collectionName is provided', () => {
    renderAt('/library/collection/abc123', { collectionName: 'My Stack' })
    expect(screen.getByText('My Stack')).toBeInTheDocument()
    expect(screen.getByText('Library')).toBeInTheDocument()
  })

  it('shows Library > Collection when no router state is present', () => {
    renderAt('/library/collection/abc123')
    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getByText('Collection')).toBeInTheDocument()
  })
})
