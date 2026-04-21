import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Library from './Library'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import { SearchProvider } from '../contexts/Search'
import { ToastProvider } from '../contexts/Toast'

vi.mock('../components/CollectionsSidebar', () => ({
  default: () => <div data-testid="collections-sidebar" />,
}))

vi.mock('./RepoDetail', () => ({
  default: () => <div data-testid="repo-detail" />,
}))

vi.mock('./CollectionDetail', () => ({
  default: () => <div data-testid="collection-detail" />,
}))

const mockRows = [
  { id: 'repo-1', owner: 'facebook', name: 'react', active: 1,
    language: 'TypeScript', description: 'A JS library', topics: '[]',
    stars: null, forks: null, license: 'MIT', homepage: null, updated_at: null,
    pushed_at: null, saved_at: '2026-01-01', type: 'skill', banner_svg: null,
    discovered_at: null, discover_query: null, watchers: null, size: null,
    open_issues: null, starred_at: null, default_branch: null, avatar_url: null,
    og_image_url: null, banner_color: null, translated_description: null,
    translated_description_lang: null, translated_readme: null,
    translated_readme_lang: null, detected_language: null,
    verification_score: null, verification_tier: null, verification_signals: null,
    verification_checked_at: null, type_bucket: 'frameworks', type_sub: 'web-framework',
    version: 'v18.0.0', generated_at: '2026-01-01T00:00:00.000Z',
    enabled_components: null, enabled_tools: null, tier: 1, installed: 1 },
]

function renderLibrary(initialPath = '/library') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ProfileOverlayProvider>
        <SearchProvider>
          <ToastProvider>
            <Library />
          </ToastProvider>
        </SearchProvider>
      </ProfileOverlayProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.stubGlobal('api', {
    library: { getAll: vi.fn().mockResolvedValue(mockRows) },
    starred: { getAll: vi.fn().mockResolvedValue([]) },
    collection: { getAll: vi.fn().mockResolvedValue([]) },
  })
})

describe('Library', () => {
  it('renders the nav rail with Repositories and Collections buttons', async () => {
    renderLibrary()
    await screen.findByText('react')
    expect(screen.getByRole('button', { name: 'Repositories' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collections' })).toBeInTheDocument()
  })

  it('Repositories panel is open by default', async () => {
    renderLibrary()
    await screen.findByText('react')
    const panel = document.querySelector('.library-panel:not(.collapsed)')
    expect(panel).toBeInTheDocument()
  })

  it('clicking Repos button again collapses the panel', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findByText('react')
    await user.click(screen.getByRole('button', { name: 'Repositories' }))
    const panels = document.querySelectorAll('.library-panel')
    expect([...panels].every(p => p.classList.contains('collapsed'))).toBe(true)
  })

  it('shows empty state when no repo or collection is selected', async () => {
    renderLibrary()
    expect(await screen.findByText('Your Library')).toBeInTheDocument()
  })

  it('shows repo count in empty state subtitle', async () => {
    renderLibrary()
    expect(await screen.findByText(/1 skill installed/)).toBeInTheDocument()
  })

  it('shows "No skills installed yet" when library is empty', async () => {
    ;(window.api.library.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([])
    renderLibrary()
    expect(await screen.findByText(/No skills installed yet/)).toBeInTheDocument()
  })

  it('switching to Collections panel shows the collections sidebar', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findByText('react')
    await user.click(screen.getByRole('button', { name: 'Collections' }))
    expect(screen.getByTestId('collections-sidebar')).toBeInTheDocument()
  })
})
