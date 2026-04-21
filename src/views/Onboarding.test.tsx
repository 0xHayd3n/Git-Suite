import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Onboarding from './Onboarding'

let navigatedTo = ''

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => (path: string) => { navigatedTo = path },
  }
})

function makeApi(overrides = {}) {
  return {
    windowControls: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
    github: {
      connect: vi.fn().mockResolvedValue(undefined),
      exchange: vi.fn().mockResolvedValue(undefined),
      getUser: vi.fn().mockResolvedValue({ login: 'alice', avatarUrl: '', publicRepos: 5 }),
      getStarred: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      onCallback: vi.fn(),
      offCallback: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue('5'),
      set: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }
}

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  navigatedTo = ''
  Object.defineProperty(window, 'api', { value: makeApi(), writable: true, configurable: true })
})

// ── Screen 0 ────────────────────────────────────────────────────
describe('Screen 0 — Welcome', () => {
  it('shows screen 0 by default', () => {
    renderOnboarding()
    expect(screen.getByTestId('onboarding-screen-0')).toBeInTheDocument()
  })

  it('renders headline and sub text', () => {
    renderOnboarding()
    expect(screen.getByText(/Turn any GitHub repo into an/i)).toBeInTheDocument()
    expect(screen.getByText(/AI skill/i)).toBeInTheDocument()
  })

  it('Connect GitHub → advances to screen 1', () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →'))
    expect(screen.getByTestId('onboarding-screen-1')).toBeInTheDocument()
  })

  it('Skip sets onboarding_complete and navigates to /discover', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith('onboarding_complete', '1')
      expect(navigatedTo).toBe('/discover')
    })
  })

  it('does not show progress dots on screen 0', () => {
    renderOnboarding()
    expect(screen.queryByTestId('progress-dots')).not.toBeInTheDocument()
  })
})

// ── Screen 1 ────────────────────────────────────────────────────
describe('Screen 1 — Connect GitHub', () => {
  beforeEach(() => {
    renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →'))
  })

  it('shows screen 1', () => {
    expect(screen.getByTestId('onboarding-screen-1')).toBeInTheDocument()
  })

  it('shows progress dots', () => {
    expect(screen.getByTestId('progress-dots')).toBeInTheDocument()
  })

  it('shows Step 1 of 2 label', () => {
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument()
  })

  it('Continue is disabled before connecting', () => {
    expect(screen.getByText('Continue →')).toBeDisabled()
  })

  it('Back returns to screen 0', () => {
    fireEvent.click(screen.getByText('← Back'))
    expect(screen.getByTestId('onboarding-screen-0')).toBeInTheDocument()
  })

  it('Connect calls github.connect and registers callback', async () => {
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => {
      expect(window.api.github.connect).toHaveBeenCalled()
      expect(window.api.github.onCallback).toHaveBeenCalled()
    })
  })

  it('after successful OAuth, Continue becomes enabled and shows connected state', async () => {
    // Simulate the onCallback being called with a code
    window.api.github.onCallback = vi.fn().mockImplementation((cb: (code: string) => void) => {
      setTimeout(() => cb('test-code'), 0)
    })
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => {
      expect(window.api.github.exchange).toHaveBeenCalledWith('test-code')
      expect(window.api.github.getUser).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText('Continue →')).not.toBeDisabled()
    })
  })

  it('Continue advances to screen 2 when connected', async () => {
    window.api.github.onCallback = vi.fn().mockImplementation((cb: (code: string) => void) => {
      setTimeout(() => cb('code'), 0)
    })
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => screen.getByText('Continue →').closest('button')?.disabled === false)
    fireEvent.click(screen.getByText('Continue →'))
    expect(screen.getByTestId('onboarding-screen-2')).toBeInTheDocument()
  })

  it('calls offCallback on unmount', () => {
    const { unmount } = renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →')) // go to screen 1
    unmount()
    expect(window.api.github.offCallback).toHaveBeenCalled()
  })
})

// ── Screen 2 ────────────────────────────────────────────────────
describe('Screen 2 — Done', () => {
  async function goToScreen2() {
    renderOnboarding()
    fireEvent.click(screen.getByText('Connect GitHub →'))
    window.api.github.onCallback = vi.fn().mockImplementation((cb: (code: string) => void) => {
      setTimeout(() => cb('code'), 0)
    })
    fireEvent.click(screen.getByText('Connect'))
    await waitFor(() => expect(window.api.github.exchange).toHaveBeenCalled())
    await waitFor(() => {
      const btn = screen.getByText('Continue →')
      if ((btn as HTMLButtonElement).disabled) throw new Error('still disabled')
    })
    fireEvent.click(screen.getByText('Continue →'))
  }

  it('shows screen 2', async () => {
    await goToScreen2()
    expect(screen.getByTestId('onboarding-screen-2')).toBeInTheDocument()
  })

  it('shows HOW IT WORKS tip box', async () => {
    await goToScreen2()
    expect(screen.getByText('HOW IT WORKS')).toBeInTheDocument()
  })

  it('Open Git Suite sets onboarding_complete and navigates to /discover', async () => {
    await goToScreen2()
    fireEvent.click(screen.getByText('Open Git Suite →'))
    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith('onboarding_complete', '1')
      expect(navigatedTo).toBe('/discover')
    })
  })

  it('Open Git Suite fires getStarred in background', async () => {
    await goToScreen2()
    fireEvent.click(screen.getByText('Open Git Suite →'))
    await waitFor(() => {
      expect(window.api.github.getStarred).toHaveBeenCalled()
    })
  })
})
