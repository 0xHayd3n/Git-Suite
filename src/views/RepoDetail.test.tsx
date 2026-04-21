import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RepoDetail from './RepoDetail'
import { SavedReposProvider } from '../contexts/SavedRepos'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import { parseSkillDepths } from '../utils/skillParse'
import type { SkillRow } from '../types/repo'

// ── parseSkillDepths unit tests ──────────────────────────────────────
describe('parseSkillDepths', () => {
  it('counts lines in each section', () => {
    const content = '## [CORE]\nfoo\nbar\n## [EXTENDED]\nbaz\n## [DEEP]\nqux\nquux'
    const result = parseSkillDepths(content)
    expect(result.core).toBe(2)
    expect(result.extended).toBe(1)
    expect(result.deep).toBe(2)
  })

  it('returns zeros for empty content', () => {
    const result = parseSkillDepths('')
    expect(result.core).toBe(0)
    expect(result.extended).toBe(0)
    expect(result.deep).toBe(0)
  })
})

// ── RepoDetail install button tests ─────────────────────────────────

const repoRow = {
  owner: 'vercel', name: 'next.js', description: 'The React framework',
  language: 'TypeScript', stars: 100000, forks: 20000, open_issues: 500,
  watchers: 100000, size: 50000, license: 'MIT', topics: '[]',
  updated_at: '2024-01-01', saved_at: null,
}

function setupDetail(
  skillRow: SkillRow | null,
  apiKey: string | null = null,
  generateFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ content: '## [CORE]\nfoo', version: 'v1' }),
  relatedRepos: object[] = [],
) {
  Object.defineProperty(window, 'api', {
    value: {
      github: {
        getRepo: vi.fn().mockResolvedValue(repoRow),
        getReleases: vi.fn().mockResolvedValue([]),
        getRelatedRepos: vi.fn().mockResolvedValue(relatedRepos),
        getReadme: vi.fn().mockResolvedValue(null),
        saveRepo: vi.fn().mockResolvedValue(undefined),
        searchRepos: vi.fn().mockResolvedValue([]),
        getSavedRepos: vi.fn().mockResolvedValue([]),
        starRepo: vi.fn().mockResolvedValue(undefined),
        unstarRepo: vi.fn().mockResolvedValue(undefined),
        isStarred: vi.fn().mockResolvedValue(false),
      },
      org: {
        getVerified: vi.fn().mockResolvedValue(false),
      },
      settings: {
        get: vi.fn(),
        set: vi.fn(),
        getApiKey: vi.fn().mockResolvedValue(apiKey),
        setApiKey: vi.fn(),
      },
      skill: {
        generate: generateFn,
        get: vi.fn().mockResolvedValue(skillRow),
        getSubSkill: vi.fn().mockResolvedValue(null),
        getVersionedInstalls: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        detectClaudeCode: vi.fn().mockResolvedValue(false),
      },
      library: {
        getCollections: vi.fn().mockResolvedValue([]),
      },
      storybook: {
        detect: vi.fn().mockResolvedValue(null),
      },
      translate: {
        detect: vi.fn().mockResolvedValue(null),
        translate: vi.fn().mockResolvedValue(null),
      },
      verification: {
        prioritise:  vi.fn().mockResolvedValue(undefined),
        getScore:    vi.fn().mockResolvedValue(null),
        onUpdated:   vi.fn(),
        offUpdated:  vi.fn(),
      },
    },
    writable: true, configurable: true,
  })
  return render(
    <MemoryRouter initialEntries={['/repo/vercel/next.js']}>
      <ProfileOverlayProvider>
        <SavedReposProvider>
          <Routes>
            <Route path="/repo/:owner/:name" element={<RepoDetail />} />
          </Routes>
        </SavedReposProvider>
      </ProfileOverlayProvider>
    </MemoryRouter>
  )
}

describe('RepoDetail install button', () => {
  it('shows "+ Learn" when skill not installed', async () => {
    setupDetail(null)
    await waitFor(() => screen.getAllByText('next.js'))
    expect(screen.getByText('+ Learn')).toBeInTheDocument()
  })

  it('shows "✓ Learned" when skill row exists on mount', async () => {
    setupDetail({
      repo_id: '12345', filename: 'next.js.skill.md',
      content: '## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz',
      version: 'v14.0', generated_at: '2024-01-01', active: 1, enabled_components: null, enabled_tools: null,
    })
    await waitFor(() => screen.getByText('✓ Learned'))
  })

  it('transitions to generating on click', async () => {
    // Pass a never-resolving generate fn so the button stays in GENERATING state
    const neverResolves = vi.fn().mockReturnValue(new Promise(() => {}))
    setupDetail(null, 'sk-ant-test', neverResolves)
    await waitFor(() => screen.getAllByText('next.js'))
    fireEvent.click(screen.getByText('+ Learn'))
    await waitFor(() => screen.getByText('Learning…'))
  })
})

describe('RepoDetail skill tab', () => {
  it('shows skill content in Skill file tab when installed', async () => {
    const content = '## [CORE]\ninstall: npm i next\n## [EXTENDED]\nextra\n## [DEEP]\ndeep'
    setupDetail({
      repo_id: '12345', filename: 'next.js.skill.md',
      content, version: 'v14.0', generated_at: '2024-01-01', active: 1, enabled_components: null, enabled_tools: null,
    })
    await waitFor(() => screen.getByText('✓ Learned'))
    fireEvent.click(screen.getByRole('button', { name: 'Skills Folder' }))
    await waitFor(() => screen.getByText(/install: npm i next/))
  })

  it('shows skill tab header with depth bars when skill is installed', async () => {
    const content = '## [CORE]\ninstall: npm i next\n## [EXTENDED]\nextra\n## [DEEP]\ndeep'
    setupDetail({
      repo_id: '12345', filename: 'next.js.skill.md',
      content, version: 'v14.0', generated_at: '2024-01-01', active: 1, enabled_components: null, enabled_tools: null,
    })
    await waitFor(() => screen.getByText('✓ Learned'))
    fireEvent.click(screen.getByRole('button', { name: 'Skills Folder' }))
    await waitFor(() => {
      expect(screen.getAllByText('Core').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Extended').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Deep').length).toBeGreaterThan(0)
      expect(screen.getAllByText('next.js.skill.md').length).toBeGreaterThan(0)
    })
  })

  it('does not show skill tab header when skill is not installed', async () => {
    setupDetail(null)
    await waitFor(() => screen.getByText('+ Learn'))
    fireEvent.click(screen.getByRole('button', { name: 'Skills Folder' }))
    await waitFor(() => {
      expect(screen.queryAllByText('Core').length).toBe(0)
      expect(screen.getAllByText('Learn this repo to generate a Skills Folder for Claude.').length).toBeGreaterThan(0)
    })
  })
})

describe('RepoDetail related tab', () => {
  it('does not show Related tab when related repos is empty', async () => {
    setupDetail(null)
    await waitFor(() => screen.getAllByText('next.js'))
    expect(screen.queryByRole('button', { name: 'Related' })).not.toBeInTheDocument()
  })

  it('shows Related tab and cards when related repos are provided', async () => {
    setupDetail(null, null, vi.fn(), [
      {
        owner: 'facebook', name: 'react', description: 'A JS library',
        language: 'JavaScript', stars: 200000, forks: 40000,
        open_issues: 1000, watchers: 200000, size: 30000,
        license: 'MIT', topics: '[]', updated_at: '2024-01-01', saved_at: null,
      },
    ])
    const relatedTab = await waitFor(() => screen.getByRole('button', { name: 'Related' }))
    fireEvent.click(relatedTab)
    await waitFor(() => screen.getByText('react'))
  })
})
