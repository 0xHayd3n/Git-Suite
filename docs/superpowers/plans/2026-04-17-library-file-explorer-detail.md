# Library File Explorer Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Library detail panel with a compact-header + GitHub file tree view that animates in on each repo selection.

**Architecture:** New `LibraryFilesDetail` component renders a single-row compact header (lang icon, name, author, actions) above a `FilesTab` body wrapped in an isolated `RepoNavProvider`. `Library.tsx` drops all the old sub-skill/tab/collections state and always renders `LibraryFilesDetail` with `key={selected.id}` so a CSS keyframe animation re-fires on every new selection.

**Tech Stack:** React, TypeScript, CSS keyframes, Vitest + @testing-library/react

---

### Task 1: Add CSS animation

**Files:**
- Modify: `src/styles/globals.css` (append near end of library section, around line 6170)

- [ ] **Step 1: Add the keyframe and component styles**

  Append to `src/styles/globals.css` after the last `.lib-detail-*` rule:

  ```css
  /* ── LibraryFilesDetail ──────────────────────────────────── */
  @keyframes panel-slide-in {
    from { opacity: 0; transform: translateX(16px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .library-files-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    animation: panel-slide-in 280ms ease-out forwards;
  }

  .lib-files-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }

  .lib-files-lang {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .lib-files-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--t1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .lib-files-owner {
    font-size: 11px;
    color: var(--t3);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .lib-files-meta {
    font-size: 11px;
    color: var(--t3);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .lib-files-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .lib-files-install-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .lib-files-install-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .lib-files-install-error {
    font-size: 11px;
    color: #e53e3e;
    padding: 4px 12px;
    flex-shrink: 0;
  }

  .lib-files-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/styles/globals.css
  git commit -m "style: add LibraryFilesDetail CSS and panel-slide-in animation"
  ```

---

### Task 2: Create `LibraryFilesDetail` component

**Files:**
- Create: `src/components/LibraryFilesDetail.tsx`
- Create: `src/components/LibraryFilesDetail.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `src/components/LibraryFilesDetail.test.tsx`:

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { MemoryRouter } from 'react-router-dom'
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import LibraryFilesDetail from './LibraryFilesDetail'
  import type { LibraryRow } from '../types/repo'

  // FilesTab makes GitHub API calls — mock the whole module
  vi.mock('./FilesTab', () => ({
    default: () => <div data-testid="files-tab" />,
  }))

  const baseRow: LibraryRow = {
    id: 'r1', owner: 'acme', name: 'my-skill', language: 'TypeScript',
    description: 'A skill', content: '# Core\nfoo', topics: '[]',
    stars: 1200, forks: null, license: 'MIT', homepage: null,
    updated_at: null, pushed_at: null, saved_at: '2026-01-01',
    type: 'skill', banner_svg: null, discovered_at: null, discover_query: null,
    watchers: null, size: null, open_issues: null, starred_at: null,
    default_branch: 'main', avatar_url: null, og_image_url: null,
    banner_color: null, translated_description: null,
    translated_description_lang: null, translated_readme: null,
    translated_readme_lang: null, detected_language: null,
    verification_score: null, verification_tier: null,
    verification_signals: null, verification_checked_at: null,
    type_bucket: 'tools', type_sub: null,
    active: 1, version: 'v2.0', generated_at: '2026-01-01T00:00:00.000Z',
    filename: 'my-skill.skill.md', enabled_components: null,
    enabled_tools: null, tier: 1, installed: 1,
  }

  function renderDetail(overrides: Partial<LibraryRow> = {}, props = {}) {
    const row = { ...baseRow, ...overrides }
    return render(
      <MemoryRouter>
        <LibraryFilesDetail
          row={row}
          onToggleActive={vi.fn()}
          onInstalled={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    )
  }

  beforeEach(() => {
    vi.stubGlobal('api', {
      skill: {
        generate: vi.fn().mockResolvedValue({ content: 'c', version: 'v1', generated_at: null }),
      },
    })
  })

  describe('LibraryFilesDetail', () => {
    it('renders repo name and owner in compact header', () => {
      renderDetail()
      expect(screen.getByText('my-skill')).toBeInTheDocument()
      expect(screen.getByText(/by acme/)).toBeInTheDocument()
    })

    it('renders star count when present', () => {
      renderDetail()
      expect(screen.getByText(/1,200/)).toBeInTheDocument()
    })

    it('renders FilesTab', () => {
      renderDetail()
      expect(screen.getByTestId('files-tab')).toBeInTheDocument()
    })

    it('shows active toggle when installed', () => {
      renderDetail({ installed: 1, active: 1 })
      expect(screen.getByRole('button', { name: /toggle skill active/i })).toBeInTheDocument()
    })

    it('calls onToggleActive when toggle clicked', async () => {
      const onToggleActive = vi.fn()
      render(
        <MemoryRouter>
          <LibraryFilesDetail
            row={baseRow}
            onToggleActive={onToggleActive}
            onInstalled={vi.fn()}
          />
        </MemoryRouter>
      )
      await userEvent.click(screen.getByRole('button', { name: /toggle skill active/i }))
      expect(onToggleActive).toHaveBeenCalledWith(false)
    })

    it('shows Install button when not installed', () => {
      renderDetail({ installed: 0 })
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /toggle skill active/i })).not.toBeInTheDocument()
    })

    it('calls onInstalled after successful install', async () => {
      const onInstalled = vi.fn()
      render(
        <MemoryRouter>
          <LibraryFilesDetail
            row={{ ...baseRow, installed: 0 }}
            onToggleActive={vi.fn()}
            onInstalled={onInstalled}
          />
        </MemoryRouter>
      )
      await userEvent.click(screen.getByRole('button', { name: /install/i }))
      await waitFor(() => expect(onInstalled).toHaveBeenCalledWith({ content: 'c', version: 'v1', generated_at: null }))
    })

    it('shows error message on failed install', async () => {
      ;(window.api.skill.generate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('net'))
      renderDetail({ installed: 0 })
      await userEvent.click(screen.getByRole('button', { name: /install/i }))
      await waitFor(() => expect(screen.getByText(/install failed/i)).toBeInTheDocument())
    })
  })
  ```

- [ ] **Step 2: Run tests — expect them to fail**

  ```bash
  npx vitest run src/components/LibraryFilesDetail.test.tsx
  ```

  Expected: all tests fail with "Cannot find module './LibraryFilesDetail'"

- [ ] **Step 3: Implement `LibraryFilesDetail.tsx`**

  Create `src/components/LibraryFilesDetail.tsx`:

  ```tsx
  import { useState } from 'react'
  import { ExternalLink } from 'lucide-react'
  import { useNavigate } from 'react-router-dom'
  import { RepoNavProvider } from '../contexts/RepoNav'
  import FilesTab from './FilesTab'
  import Toggle from './Toggle'
  import { getLangConfig } from './BannerSVG'
  import type { LibraryRow } from '../types/repo'

  interface Props {
    row: LibraryRow
    onToggleActive: (v: boolean) => void
    onInstalled: (result: { content: string; version: string | null; generated_at: string | null }) => void
  }

  export default function LibraryFilesDetail({ row, onToggleActive, onInstalled }: Props) {
    const [installing, setInstalling] = useState(false)
    const [installError, setInstallError] = useState<string | null>(null)
    const navigate = useNavigate()
    const cfg = getLangConfig(row.language ?? '')

    async function handleInstall() {
      setInstalling(true)
      setInstallError(null)
      try {
        const result = await window.api.skill.generate(row.owner, row.name)
        onInstalled(result)
      } catch {
        setInstallError('Install failed')
      } finally {
        setInstalling(false)
      }
    }

    return (
      <div className="library-files-detail">
        <div className="lib-files-header">
          <div className="lib-files-lang" style={{ background: cfg.bg, color: cfg.primary }}>
            {cfg.abbr}
          </div>
          <div className="lib-files-title">{row.name}</div>
          <div className="lib-files-owner">by {row.owner}</div>
          {row.stars != null && (
            <div className="lib-files-meta">⭐ {row.stars.toLocaleString()}</div>
          )}
          {row.version && (
            <div className="lib-files-meta">{row.version}</div>
          )}
          <div className="lib-files-actions">
            <button
              className="lib-btn-view-repo"
              onClick={() => navigate(`/repo/${row.owner}/${row.name}`)}
              title="View repo"
            >
              <ExternalLink size={12} />
            </button>
            {row.installed === 0 ? (
              <button
                className="lib-files-install-btn"
                onClick={handleInstall}
                disabled={installing}
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            ) : (
              <Toggle on={row.active === 1} onChange={onToggleActive} ariaLabel="Toggle skill active" />
            )}
          </div>
        </div>

        {installError && (
          <div className="lib-files-install-error">{installError}</div>
        )}

        <div className="lib-files-body">
          <RepoNavProvider>
            <FilesTab
              owner={row.owner}
              name={row.name}
              branch={row.default_branch ?? 'main'}
            />
          </RepoNavProvider>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 4: Run tests — expect them to pass**

  ```bash
  npx vitest run src/components/LibraryFilesDetail.test.tsx
  ```

  Expected: all 7 tests pass

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/LibraryFilesDetail.tsx src/components/LibraryFilesDetail.test.tsx
  git commit -m "feat: LibraryFilesDetail — compact header + file explorer"
  ```

---

### Task 3: Wire up `Library.tsx` and update its tests

**Files:**
- Modify: `src/views/Library.tsx`
- Modify: `src/views/Library.test.tsx`

- [ ] **Step 1: Update Library.tsx — remove dead state and clean up imports**

  **Remove these imports** (lines ~11-15):
  ```tsx
  import { parseComponents } from '../utils/skillParse'
  import GenericDetail from '../components/GenericDetail'
  import ComponentDetail from '../components/ComponentDetail'
  import MCPToolsDetail from '../components/MCPToolsDetail'
  import NotInstalledDetail from '../components/NotInstalledDetail'
  import type { McpScanResult } from '../types/mcp'
  ```

  **Add this import** (after the LibraryDetailPanel import):
  ```tsx
  import LibraryFilesDetail from '../components/LibraryFilesDetail'
  ```

  **Remove these state declarations** (lines ~55-63):
  ```tsx
  const [activeTab, setActiveTab] = useState<'components' | 'skill' | 'details'>('components')
  const [componentSearch, setComponentSearch] = useState('')
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([])
  const [toolSearch,       setToolSearch]       = useState('')
  const [mcpActiveTab,     setMcpActiveTab]     = useState<'tools' | 'skill' | 'details'>('tools')
  const [versionedInstalls, setVersionedInstalls] = useState<string[]>([])
  const [mcpScanResult,    setMcpScanResult]    = useState<McpScanResult | null>(null)
  ```

- [ ] **Step 2: Clean up `selectRow`**

  In `selectRow` (lines ~96-122), remove these lines:
  ```tsx
  setActiveTab('components')
  setComponentSearch('')
  setCollections([])
  setToolSearch('')
  setMcpActiveTab('tools')
  setVersionedInstalls([])
  setMcpScanResult(null)
  window.api.library.getCollections(row.id).then(setCollections)
  window.api.skill.getVersionedInstalls(row.owner, row.name).then(setVersionedInstalls).catch(() => [])
  ```

  Also remove the `mcpScanResult` set inside the `getSubSkill('mcp-tools')` callback:
  ```tsx
  // Remove these two lines inside the .then() callback:
  if (sub) {
    try { setMcpScanResult(JSON.parse(sub.content) as McpScanResult) } catch { setMcpScanResult(null) }
  }
  ```

  After cleanup, `selectRow` should contain only:
  ```tsx
  const selectRow = useCallback((row: LibraryRow) => {
    if (selected?.id === row.id && panelOpen) {
      setPanelOpen(false)
      setSelected(null)
      return
    }
    setSelected(row)
    setPanelOpen(true)
    setComponentsSubSkill(null)
    setMcpToolsSubSkill(null)
    window.api.skill.getSubSkill(row.owner, row.name, 'components').then(setComponentsSubSkill).catch(() => null)
    window.api.skill.getSubSkill(row.owner, row.name, 'mcp-tools').then(setMcpToolsSubSkill).catch(() => null)
  }, [selected, panelOpen])
  ```

- [ ] **Step 3: Replace the detail rendering block in the JSX**

  Find the `<LibraryDetailPanel open onClose={closePanel}>` block (lines ~297-483). Verify the `open` prop is `open={panelOpen}` (not hardcoded `open`). If it is hardcoded `true`, change it to `open={panelOpen}`.

  Replace the entire content inside `<LibraryDetailPanel>` — the `{selected ? (...) : (...)}` block — with:

  ```tsx
  {selected ? (
    <LibraryFilesDetail
      key={selected.id}
      row={selected}
      onToggleActive={(v) => handleToggle(selected, v)}
      onInstalled={(result) => {
        const updated = { ...selected, installed: 1, active: 1, ...result }
        setRows(prev => prev.map(r => r.id === selected.id ? updated : r))
        setSelected(updated)
        toast('Skill installed', 'success')
      }}
    />
  ) : (
    <div className="library-detail-empty">
      <span>Select a skill to view details</span>
    </div>
  )}
  ```

- [ ] **Step 4: Run the full test suite to see what breaks**

  ```bash
  npx vitest run src/views/Library.test.tsx
  ```

  Expected failures:
  - "falls back to GenericDetail when no components sub-skill" — checks for 'Regenerate' which no longer exists
  - The `Library — MCP dispatch` describe block — checks for MCPToolsDetail content
  - `getCollections` and `getVersionedInstalls` calls in `beforeEach` mock are now unused (not a failure, just stale)

- [ ] **Step 5: Update `Library.test.tsx`**

  **Remove** the test at line ~146: `'falls back to GenericDetail when no components sub-skill'`

  **Remove** the entire `describe('Library — MCP dispatch', ...)` block (lines ~161-181)

  **Remove** from the `beforeEach` mock stub (lines ~53-76) the following now-unused API mocks:
  ```tsx
  getCollections: vi.fn().mockResolvedValue([]),
  // and inside skill:
  getVersionedInstalls: vi.fn().mockResolvedValue([]),
  setEnabledComponents: vi.fn().mockResolvedValue(undefined),
  setEnabledTools: vi.fn().mockResolvedValue(undefined),
  ```

  **Add** a `vi.mock` for FilesTab at the top of the file (after imports):
  ```tsx
  vi.mock('../components/FilesTab', () => ({
    default: () => <div data-testid="files-tab" />,
  }))
  ```

  **Add** a new test to the `Library — new layout` describe block:
  ```tsx
  it('shows file explorer header after selecting a skill', async () => {
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    await user.click(screen.getByText('react').closest('.library-card')!)
    expect(await screen.findByText('react')).toBeInTheDocument()
    expect(screen.getByText(/by facebook/)).toBeInTheDocument()
    expect(screen.getByTestId('files-tab')).toBeInTheDocument()
  })
  ```

- [ ] **Step 6: Run tests — expect them to pass**

  ```bash
  npx vitest run src/views/Library.test.tsx
  ```

  Expected: all remaining tests pass

- [ ] **Step 7: Run the full test suite**

  ```bash
  npx vitest run
  ```

  Expected: all tests pass (no regressions in other files)

- [ ] **Step 8: Commit**

  ```bash
  git add src/views/Library.tsx src/views/Library.test.tsx
  git commit -m "feat(library): replace detail panel with file explorer view"
  ```

---

## Done

The Library detail panel now always shows `LibraryFilesDetail`: a 40px compact header (lang icon, name, author, star count, version, toggle/install, view-repo) above a full `FilesTab` GitHub file browser. Each selection triggers a 280ms slide-in animation via `key={selected.id}` remount.
