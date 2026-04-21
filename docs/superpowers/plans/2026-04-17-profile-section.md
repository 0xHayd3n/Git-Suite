# Profile Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page `/profile` route showing the authenticated user's GitHub profile (sidebar + tabbed repos/people), accessible from a new Dock nav item placed after Starred.

**Architecture:** `Profile.tsx` is a self-contained view that fetches data independently via the existing `window.api.profile.*` IPC bridge — it does not extend or refactor `ProfileOverlay.tsx` (which stays as the modal for other users). Internal tab components (`ReposTab`, `StarredTab`, `PeopleTab`) live inline in `Profile.tsx`, matching ProfileOverlay's naming convention. Tab data is fetched lazily on first visit and cached in component state.

**Tech Stack:** React 18, React Router 6 (MemoryRouter), TypeScript, Vitest + @testing-library/react, plain CSS with CSS variables in `globals.css`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/env.d.ts` | Modify | Add `blog` and `created_at` to `GitHubUser` interface |
| `src/App.tsx` | Modify | Import `Profile` view, add `/profile` route |
| `src/components/Dock.tsx` | Modify | Add `ProfileIcon`, add Profile to `NAV_ITEMS` after Starred, add search placeholder case |
| `src/styles/globals.css` | Modify | Add `.profile-view`, `.profile-sidebar`, `.profile-content`, tab, avatar, meta, stats CSS; add `.repo-grid` (used by ProfileOverlay but not yet defined) |
| `src/views/Profile.tsx` | Create | Full-page profile view with sidebar + 4 tab panels |
| `src/views/Profile.test.tsx` | Create | Vitest tests for Profile view |

---

## Task 1: Type fix + Route + Dock nav item + CSS

**Files:**
- Modify: `src/env.d.ts:36-47`
- Modify: `src/App.tsx:14-68`
- Modify: `src/components/Dock.tsx:1-244`
- Modify: `src/styles/globals.css` (append after existing `/* ── Profile Overlay ──` block, around line 7690)

- [ ] **Step 1: Extend `GitHubUser` with missing fields and add `follow`/`unfollow` to the API surface**

In `src/env.d.ts`, update the `GitHubUser` interface at line 36 and check that `profile` includes `follow` and `unfollow`. If those methods are missing from the `window.api.profile` type block (search for `profile:` in `env.d.ts`), add them:

```typescript
follow:   (username: string) => Promise<void>
unfollow: (username: string) => Promise<void>
```

Also update `GitHubUser` at line 36:

```typescript
interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  bio: string | null
  location: string | null
  company: string | null
  public_repos: number
  followers: number
  following: number
  html_url: string
  blog?: string | null        // add this
  created_at?: string | null  // add this
}
```

- [ ] **Step 2: Add `ProfileIcon` SVG to `Dock.tsx`**

Add this function after `StarredIcon` (around line 38) in `src/components/Dock.tsx`:

```typescript
function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>
  )
}
```

- [ ] **Step 3: Add Profile to `NAV_ITEMS` after Starred**

Update `NAV_ITEMS` in `Dock.tsx` (line 66–71):

```typescript
const NAV_ITEMS = [
  { label: 'Discover',    path: '/discover',    icon: <DiscoverIcon /> },
  { label: 'Library',     path: '/library',     icon: <LibraryIcon /> },
  { label: 'Collections', path: '/collections', icon: <CollectionsIcon /> },
  { label: 'Starred',     path: '/starred',     icon: <StarredIcon /> },
  { label: 'Profile',     path: '/profile',     icon: <ProfileIcon /> },
]
```

- [ ] **Step 4: Add search placeholder case for `/profile`**

In `getSearchPlaceholder` in `Dock.tsx` (line 75–81), add before the `return 'Search…'` fallback:

```typescript
if (pathname.startsWith('/profile'))     return 'Search profile…'
```

- [ ] **Step 5: Add `/profile` route to `App.tsx`**

Add the import at the top (around line 17):
```typescript
import Profile from './views/Profile'
```

Add the route inside `<Routes>` after the `/starred` route (line 64):
```tsx
<Route path="/profile" element={<Profile />} />
```

- [ ] **Step 6: Add CSS for profile view to `globals.css`**

Append this block at the end of the file (after the existing profile overlay styles):

```css
/* ── Profile View (full-page) ──────────────────────────────────── */

.profile-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}

.profile-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  background: var(--bg);
}

.profile-view-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: block;
  margin: 0 auto;
  border: 3px solid var(--accent-border);
  object-fit: cover;
}

.profile-view-avatar-skeleton {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--bg3);
  margin: 0 auto;
  animation: shimmer 1.4s infinite linear;
}

.profile-view-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--t1);
  text-align: center;
  margin-top: 4px;
}

.profile-view-username {
  font-size: 12px;
  color: var(--t3);
  text-align: center;
  margin-top: 2px;
}

.profile-view-bio {
  font-size: 12px;
  color: var(--t2);
  line-height: 1.5;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.profile-view-meta {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.profile-view-meta-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--t3);
}

.profile-view-meta-row a {
  color: var(--accent);
  text-decoration: none;
}

.profile-view-meta-row a:hover { text-decoration: underline; }

.profile-view-stats {
  display: flex;
  gap: 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.profile-view-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-view-stat-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--t1);
}

.profile-view-stat-label {
  font-size: 11px;
  color: var(--t3);
}

.profile-view-edit-btn {
  width: 100%;
  padding: 7px 0;
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: var(--radius-md);
  color: var(--t2);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.profile-view-edit-btn:hover { background: var(--bg4); color: var(--t1); }

.profile-view-skeleton-line {
  height: 11px;
  border-radius: 4px;
  background: var(--bg3);
  animation: shimmer 1.4s infinite linear;
}

/* Right content panel */

.profile-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.profile-view-tabs {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
  gap: 2px;
  flex-shrink: 0;
}

.profile-view-tab {
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--t3);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: color 0.12s;
  margin-bottom: -1px;
}

.profile-view-tab:hover { color: var(--t2); }

.profile-view-tab.active {
  color: var(--t1);
  border-bottom-color: var(--accent);
}

.profile-view-tab-count {
  font-size: 10px;
  color: var(--t4);
  background: var(--bg3);
  border-radius: 9px;
  padding: 1px 6px;
}

.profile-view-tab-panel {
  flex: 1;
  overflow-y: auto;
}

.profile-view-sort-bar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px 0;
  gap: 6px;
}

.profile-view-content-pad {
  padding: 12px 16px 24px;
}

.profile-view-empty {
  padding: 24px 16px;
  color: var(--t3);
  font-size: 13px;
}

.profile-view-error {
  padding: 24px 16px;
  color: var(--t3);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-view-retry-btn {
  padding: 6px 14px;
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: var(--radius-md);
  color: var(--t2);
  font-size: 12px;
  cursor: pointer;
  width: fit-content;
}

.profile-view-retry-btn:hover { background: var(--bg4); }

/* repo-grid: used by ProfileOverlay and Profile but not previously defined — add here */
.repo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd D:/Coding/Git-Suite && npm run typecheck 2>&1 | tail -20
```

Expected: No new errors from your changes. If `typecheck` script doesn't exist, run `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add src/env.d.ts src/App.tsx src/components/Dock.tsx src/styles/globals.css
git commit -m "feat(profile): add route, Dock nav item, CSS, and extend GitHubUser type"
```

---

## Task 2: `Profile.tsx` — shell, sidebar, tab bar

**Files:**
- Create: `src/views/Profile.tsx`
- Create: `src/views/Profile.test.tsx`

**Reference:** `ProfileOverlay.tsx` for data-fetching patterns, `Onboarding.test.tsx` for test/mock structure.

- [ ] **Step 1: Write the failing tests first**

Create `src/views/Profile.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import Profile from './Profile'

// vi.mock must be at module scope — Vitest hoists these to the top of the file.
// Store mockOpenProfile at module scope so PeopleTab and tests share the same reference.
const mockOpenProfile = vi.fn()

vi.mock('../contexts/ProfileOverlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts/ProfileOverlay')>()
  return {
    ...actual,
    useProfileOverlay: () => ({
      openProfile:  mockOpenProfile,
      pushProfile:  vi.fn(),
      popProfile:   vi.fn(),
      closeProfile: vi.fn(),
      setStackAt:   vi.fn(),
      profileState: { isOpen: false, stack: [], currentUsername: '' },
    }),
  }
})

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    github: {
      getUser: vi.fn().mockResolvedValue({ login: 'alice', avatarUrl: '', publicRepos: 5 }),
    },
    profile: {
      getUser: vi.fn().mockResolvedValue({
        login: 'alice',
        name: 'Alice Smith',
        avatar_url: 'https://example.com/avatar.png',
        bio: 'Test bio',
        location: 'NYC',
        company: 'Acme',
        blog: 'https://alice.dev',
        created_at: '2020-01-15T00:00:00Z',
        public_repos: 12,
        followers: 100,
        following: 50,
        html_url: 'https://github.com/alice',
      }),
      getUserRepos: vi.fn().mockResolvedValue([]),
      getStarred:   vi.fn().mockResolvedValue([]),
      getFollowing: vi.fn().mockResolvedValue([]),
      getFollowers: vi.fn().mockResolvedValue([]),
      isFollowing:  vi.fn().mockResolvedValue(false),
      follow:       vi.fn().mockResolvedValue(undefined),
      unfollow:     vi.fn().mockResolvedValue(undefined),
    },
    org: {
      getVerified: vi.fn().mockResolvedValue(false),
    },
    ...overrides,
  }
}

function renderProfile() {
  return render(
    <ProfileOverlayProvider>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </ProfileOverlayProvider>
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'api', { value: makeApi(), writable: true, configurable: true })
})

describe('Profile — sidebar', () => {
  it('shows loading skeleton initially', () => {
    renderProfile()
    expect(document.querySelector('.profile-view-avatar-skeleton')).toBeInTheDocument()
  })

  it('renders display name after load', async () => {
    renderProfile()
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
  })

  it('renders @username after load', async () => {
    renderProfile()
    await waitFor(() => expect(screen.getByText('@alice')).toBeInTheDocument())
  })

  it('renders bio', async () => {
    renderProfile()
    await waitFor(() => expect(screen.getByText('Test bio')).toBeInTheDocument())
  })

  it('renders follower and following counts', async () => {
    renderProfile()
    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('50')).toBeInTheDocument()
    })
  })

  it('shows error state if getUser fails', async () => {
    Object.defineProperty(window, 'api', {
      value: makeApi({
        profile: {
          getUser: vi.fn().mockRejectedValue(new Error('fail')),
          getUserRepos: vi.fn().mockResolvedValue([]),
          getStarred: vi.fn().mockResolvedValue([]),
          getFollowing: vi.fn().mockResolvedValue([]),
          getFollowers: vi.fn().mockResolvedValue([]),
          isFollowing: vi.fn().mockResolvedValue(false),
        },
      }),
      writable: true, configurable: true,
    })
    renderProfile()
    await waitFor(() => expect(screen.getByText(/could not load profile/i)).toBeInTheDocument())
  })
})

describe('Profile — tab bar', () => {
  it('shows all four tabs', async () => {
    renderProfile()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /repos/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /starred/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /following/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /followers/i })).toBeInTheDocument()
    })
  })

  it('Repos tab is active by default', async () => {
    renderProfile()
    await waitFor(() => {
      const tab = screen.getByRole('button', { name: /^repos/i })
      expect(tab.className).toContain('active')
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd D:/Coding/Git-Suite && npm test -- Profile.test 2>&1 | tail -30
```

Expected: Multiple failures — `Profile` doesn't exist yet.

- [ ] **Step 3: Create `src/views/Profile.tsx` with shell + sidebar**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileOverlay } from '../contexts/ProfileOverlay'
import RepoCard, { formatCount } from '../components/RepoCard'
import PersonRow from '../components/PersonRow'
import React from 'react'

// ── Types ────────────────────────────────────────────────────────

interface GithubApiRepo {
  id: number
  name: string
  description: string | null
  language: string | null
  topics?: string[]
  stargazers_count: number | null
  forks_count: number | null
  watchers_count: number | null
  size: number | null
  open_issues_count: number | null
  homepage: string | null
  updated_at: string | null
  pushed_at: string | null
  default_branch: string | null
  owner?: { login: string; avatar_url?: string }
  license?: { spdx_id: string } | null
}

// ── Helpers ──────────────────────────────────────────────────────

function apiRepoToRow(r: GithubApiRepo) {
  return {
    id: String(r.id), owner: r.owner?.login ?? '', name: r.name,
    description: r.description ?? null, language: r.language ?? null,
    topics: JSON.stringify(r.topics ?? []),
    stars: r.stargazers_count ?? null, forks: r.forks_count ?? null,
    license: r.license?.spdx_id ?? null, homepage: r.homepage ?? null,
    updated_at: r.updated_at ?? null, pushed_at: r.pushed_at ?? null,
    saved_at: null, type: null, banner_svg: null, discovered_at: null,
    discover_query: null, watchers: r.watchers_count ?? null,
    size: r.size ?? null, open_issues: r.open_issues_count ?? null,
    starred_at: null, default_branch: r.default_branch ?? 'main',
    avatar_url: r.owner?.avatar_url ?? null, banner_color: null,
    translated_description: null, translated_description_lang: null,
    translated_readme: null, translated_readme_lang: null,
    detected_language: null, verification_score: null,
    verification_tier: null, verification_signals: null,
    verification_checked_at: null, type_bucket: null, type_sub: null,
  }
}

function formatJoined(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `Joined ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
}

// ── Skeleton ────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <>
      <div className="profile-view-avatar-skeleton" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div className="profile-view-skeleton-line" style={{ width: 110 }} />
        <div className="profile-view-skeleton-line" style={{ width: 70 }} />
      </div>
    </>
  )
}

// ── Tabs config ──────────────────────────────────────────────────

const TABS = ['Repos', 'Starred', 'Following', 'Followers'] as const
type Tab = typeof TABS[number]

// ── Profile view ──────────────────────────────────────────────────

export default function Profile() {
  const [login, setLogin]         = useState<string>('')
  const [user, setUser]           = useState<any>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [userError, setUserError] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('Repos')

  // Fetch authenticated login then full profile
  useEffect(() => {
    let isMounted = true
    window.api.github.getUser()
      .then((u: any) => {
        if (!isMounted) return
        const lg = u?.login ?? ''
        setLogin(lg)
        return window.api.profile.getUser(lg)
      })
      .then((data: any) => { if (isMounted) setUser(data) })
      .catch(() => { if (isMounted) setUserError(true) })
      .finally(() => { if (isMounted) setLoadingUser(false) })
    return () => { isMounted = false }
  }, [])

  const counts: Partial<Record<Tab, number>> = {
    Repos:     user?.public_repos,
    Followers: user?.followers,
    Following: user?.following,
  }

  return (
    <div className="profile-view">
      {/* ── Sidebar ── */}
      <aside className="profile-sidebar">
        {loadingUser ? (
          <SidebarSkeleton />
        ) : userError || !user ? (
          <p style={{ color: 'var(--t3)', fontSize: 12 }}>Could not load profile.</p>
        ) : (
          <>
            <img src={user.avatar_url} alt={user.login} className="profile-view-avatar" />
            <div>
              <div className="profile-view-name">{user.name ?? user.login}</div>
              <div className="profile-view-username">@{user.login}</div>
            </div>
            {user.bio && <div className="profile-view-bio">{user.bio}</div>}
            <div className="profile-view-meta">
              {user.location && (
                <div className="profile-view-meta-row">
                  <span>📍</span><span>{user.location}</span>
                </div>
              )}
              {user.company && (
                <div className="profile-view-meta-row">
                  <span>🏢</span><span>{user.company.replace(/^@/, '')}</span>
                </div>
              )}
              {user.blog && (
                <div className="profile-view-meta-row">
                  <span>🔗</span>
                  <a href={user.blog} onClick={e => { e.preventDefault(); window.api.openExternal(user.blog) }}>
                    {user.blog.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              {user.created_at && (
                <div className="profile-view-meta-row">
                  <span>📅</span><span>{formatJoined(user.created_at)}</span>
                </div>
              )}
            </div>
            <div className="profile-view-stats">
              <div className="profile-view-stat">
                <span className="profile-view-stat-value">{formatCount(user.followers)}</span>
                <span className="profile-view-stat-label">followers</span>
              </div>
              <div className="profile-view-stat">
                <span className="profile-view-stat-value">{formatCount(user.following)}</span>
                <span className="profile-view-stat-label">following</span>
              </div>
            </div>
            <button
              className="profile-view-edit-btn"
              onClick={() => window.api.openExternal(user.html_url)}
            >
              Edit on GitHub ↗
            </button>
          </>
        )}
      </aside>

      {/* ── Right content ── */}
      <div className="profile-content">
        {/* Tab bar */}
        <div className="profile-view-tabs">
          {TABS.map(tab => (
            <button
              key={tab}
              className={`profile-view-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {counts[tab] != null && (
                <span className="profile-view-tab-count">{formatCount(counts[tab])}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab panels — rendered when tab is active; login required */}
        <div className="profile-view-tab-panel">
          {login && activeTab === 'Repos'     && <ReposTab     login={login} />}
          {login && activeTab === 'Starred'   && <StarredTab   login={login} />}
          {login && activeTab === 'Following' && <PeopleTab    login={login} kind="following" />}
          {login && activeTab === 'Followers' && <PeopleTab    login={login} kind="followers" />}
        </div>
      </div>
    </div>
  )
}
```

> **Note on lazy caching:** React unmounts the tab component when the tab is not active. Mounting only when `activeTab === tab` provides natural lazy loading, but causes re-fetches on tab switch. Task 4 upgrades this to a cache; for now, this is intentionally simple.

- [ ] **Step 4: Add empty placeholder components** (so the file compiles)

At the bottom of `Profile.tsx`, add these stubs (Tasks 3 and 4 will fill them):

```tsx
function ReposTab({ login }: { login: string }) {
  return <p className="profile-view-empty">Loading…</p>
}

function StarredTab({ login }: { login: string }) {
  return <p className="profile-view-empty">Loading…</p>
}

function PeopleTab({ login, kind }: { login: string; kind: 'following' | 'followers' }) {
  return <p className="profile-view-empty">Loading…</p>
}
```

- [ ] **Step 5: Run the sidebar/tab tests**

```bash
cd D:/Coding/Git-Suite && npm test -- Profile.test 2>&1 | tail -30
```

Expected: All `Profile — sidebar` and `Profile — tab bar` tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/Profile.tsx src/views/Profile.test.tsx
git commit -m "feat(profile): add Profile view shell with sidebar and tab bar"
```

---

## Task 3: `ReposTab` + `StarredTab`

**Files:**
- Modify: `src/views/Profile.tsx` (replace stub functions)
- Modify: `src/views/Profile.test.tsx` (add tests)

**Reference:** `ProfileOverlay.tsx:268-367` — `ReposTab` and `StarredTab` implementations are identical in logic; copy and adapt.

- [ ] **Step 1: Write failing tests for ReposTab and StarredTab**

Add to `src/views/Profile.test.tsx`:

```typescript
import { fireEvent } from '@testing-library/react'

describe('ReposTab', () => {
  it('shows repos after fetch', async () => {
    Object.defineProperty(window, 'api', {
      value: makeApi({
        profile: {
          ...makeApi().profile,
          getUserRepos: vi.fn().mockResolvedValue([
            {
              id: 1, name: 'my-repo', description: 'A repo', language: 'TypeScript',
              stargazers_count: 42, forks_count: 3, watchers_count: 42,
              size: 100, open_issues_count: 0, homepage: null,
              updated_at: '2024-01-01T00:00:00Z', pushed_at: null,
              default_branch: 'main', owner: { login: 'alice' }, license: null,
            },
          ]),
        },
      }),
      writable: true, configurable: true,
    })
    renderProfile()
    // Switch to ensure Repos tab is active (it is by default)
    await waitFor(() => expect(screen.getByText('my-repo')).toBeInTheDocument())
  })

  it('re-fetches with new sort param when sort changes', async () => {
    const getUserRepos = vi.fn().mockResolvedValue([])
    Object.defineProperty(window, 'api', {
      value: makeApi({ profile: { ...makeApi().profile, getUserRepos } }),
      writable: true, configurable: true,
    })
    renderProfile()
    await waitFor(() => screen.getByRole('button', { name: /updated/i }))
    fireEvent.click(screen.getByRole('button', { name: /updated/i }))
    await waitFor(() => {
      expect(getUserRepos).toHaveBeenCalledWith('alice', 'updated')
    })
  })
})

describe('StarredTab', () => {
  it('shows starred repos after fetch', async () => {
    Object.defineProperty(window, 'api', {
      value: makeApi({
        profile: {
          ...makeApi().profile,
          getStarred: vi.fn().mockResolvedValue([
            {
              id: 2, name: 'cool-lib', description: null, language: 'Go',
              stargazers_count: 999, forks_count: 10, watchers_count: 999,
              size: 200, open_issues_count: 5, homepage: null,
              updated_at: '2024-03-01T00:00:00Z', pushed_at: null,
              default_branch: 'main', owner: { login: 'other' }, license: null,
            },
          ]),
        },
      }),
      writable: true, configurable: true,
    })
    renderProfile()
    fireEvent.click(screen.getByRole('button', { name: /^starred/i }))
    await waitFor(() => expect(screen.getByText('cool-lib')).toBeInTheDocument())
  })

  it('does not re-fetch when sort changes (client-side sort)', async () => {
    const getStarred = vi.fn().mockResolvedValue([])
    Object.defineProperty(window, 'api', {
      value: makeApi({ profile: { ...makeApi().profile, getStarred } }),
      writable: true, configurable: true,
    })
    renderProfile()
    fireEvent.click(screen.getByRole('button', { name: /^starred/i }))
    await waitFor(() => getStarred.mock.calls.length > 0)
    const callsBefore = getStarred.mock.calls.length
    // Sort toggle — no extra fetch expected
    fireEvent.click(screen.getByRole('button', { name: /recent/i }))
    await new Promise(r => setTimeout(r, 100))
    expect(getStarred.mock.calls.length).toBe(callsBefore)
  })
})
```

- [ ] **Step 2: Run — verify new tests fail**

```bash
cd D:/Coding/Git-Suite && npm test -- Profile.test 2>&1 | tail -20
```

Expected: New ReposTab/StarredTab tests fail (stubs don't render repos).

- [ ] **Step 3: Replace `ReposTab` stub in `Profile.tsx`**

The sort map matches `ProfileOverlay.tsx:14-16`:

```tsx
const REPO_SORTS = ['Stars', 'Updated', 'Name'] as const
type RepoSort = typeof REPO_SORTS[number]
const SORT_MAP: Record<RepoSort, string> = {
  Stars: 'stars', Updated: 'updated', Name: 'full_name',
}

function ReposTab({ login }: { login: string }) {
  const [repos, setRepos]       = useState<GithubApiRepo[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)
  const [sort, setSort]         = useState<RepoSort>('Stars')
  const [retryCount, setRetry]  = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(false)
    window.api.profile.getUserRepos(login, SORT_MAP[sort])
      .then((data: GithubApiRepo[]) => { if (isMounted) setRepos(data) })
      .catch(() => { if (isMounted) setError(true) })
      .finally(() => { if (isMounted) setLoading(false) })
    return () => { isMounted = false }
  }, [login, sort, retryCount])

  if (error) return (
    <div className="profile-view-error">
      <span>Could not load repositories.</span>
      <button className="profile-view-retry-btn" onClick={() => setRetry(n => n + 1)}>Retry</button>
    </div>
  )

  return (
    <div>
      <div className="profile-view-sort-bar">
        {REPO_SORTS.map(s => (
          <button
            key={s}
            className={`discover-sort-btn${sort === s ? ' active' : ''}`}
            onClick={() => setSort(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="profile-view-content-pad">
        {loading ? (
          <SkeletonGrid />
        ) : repos.length === 0 ? (
          <p className="profile-view-empty">No repositories yet.</p>
        ) : (
          <div className="repo-grid">
            {repos.map(r => {
              const row = apiRepoToRow(r)
              return <RepoCard key={row.id} repo={row} onNavigate={navigate} onTagClick={() => {}} />
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

Also add the `SkeletonGrid` helper (same as in `ProfileOverlay.tsx:77-91`) above `ReposTab`:

```tsx
function SkeletonGrid() {
  return (
    <div className="repo-grid">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="repo-card" style={{ minHeight: 180 }}>
          <div style={{ height: 72, background: 'var(--bg3)', animation: 'shimmer 1.4s infinite linear' }} />
          <div className="repo-card-panel">
            <div style={{ height: 13, width: '60%', background: 'var(--bg3)', borderRadius: 4, marginBottom: 8, animation: 'shimmer 1.4s infinite linear' }} />
            <div style={{ height: 11, width: '40%', background: 'var(--bg3)', borderRadius: 4, animation: 'shimmer 1.4s infinite linear' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Replace `StarredTab` stub in `Profile.tsx`**

```tsx
function StarredTab({ login }: { login: string }) {
  const [repos, setRepos]       = useState<GithubApiRepo[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)
  const [sort, setSort]         = useState<'Stars' | 'Recent'>('Stars')
  const [retryCount, setRetry]  = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(false)
    window.api.profile.getStarred(login)
      .then((data: GithubApiRepo[]) => { if (isMounted) setRepos(data) })
      .catch(() => { if (isMounted) setError(true) })
      .finally(() => { if (isMounted) setLoading(false) })
    return () => { isMounted = false }
  }, [login, retryCount])

  const sorted = [...repos].sort((a, b) =>
    sort === 'Stars'
      ? (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)
      : new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
  )

  if (error) return (
    <div className="profile-view-error">
      <span>Could not load starred repos.</span>
      <button className="profile-view-retry-btn" onClick={() => setRetry(n => n + 1)}>Retry</button>
    </div>
  )

  return (
    <div>
      <div className="profile-view-sort-bar">
        {(['Stars', 'Recent'] as const).map(s => (
          <button key={s} className={`discover-sort-btn${sort === s ? ' active' : ''}`} onClick={() => setSort(s)}>{s}</button>
        ))}
      </div>
      <div className="profile-view-content-pad">
        {loading ? <SkeletonGrid /> : sorted.length === 0 ? (
          <p className="profile-view-empty">No starred repos yet.</p>
        ) : (
          <div className="repo-grid">
            {sorted.map(r => {
              const row = apiRepoToRow(r)
              return <RepoCard key={row.id} repo={row} onNavigate={navigate} onTagClick={() => {}} />
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run all tests**

```bash
cd D:/Coding/Git-Suite && npm test -- Profile.test 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/Profile.tsx src/views/Profile.test.tsx
git commit -m "feat(profile): add ReposTab and StarredTab"
```

---

## Task 4: `PeopleTab` + tab-level fetch caching

**Files:**
- Modify: `src/views/Profile.tsx` (replace `PeopleTab` stub; upgrade tab panel mounting to cache-based)
- Modify: `src/views/Profile.test.tsx` (add tests)

**Reference:** `ProfileOverlay.tsx:369-479` — `PersonRowVerified`, `PeopleTab` implementation.

**Note on `isOwnProfile`:** `PeopleTab` receives `login` which is already the authenticated user's login (passed from the `Profile` parent). So `isOwnProfile={login === person.login}` is correct without a separate `getUser()` call — it correctly identifies when a listed person is the authenticated user themselves.

- [ ] **Step 1: Write failing tests for PeopleTab**

Add to `src/views/Profile.test.tsx`:

```typescript
describe('PeopleTab', () => {
  const personApi = {
    ...makeApi().profile,
    getFollowing: vi.fn().mockResolvedValue([
      { login: 'bob', name: 'Bob', avatar_url: 'https://example.com/bob.png', bio: null },
    ]),
    getFollowers: vi.fn().mockResolvedValue([
      { login: 'carol', name: 'Carol', avatar_url: 'https://example.com/carol.png', bio: null },
    ]),
  }

  beforeEach(() => {
    Object.defineProperty(window, 'api', {
      value: makeApi({ profile: personApi }),
      writable: true, configurable: true,
    })
  })

  it('renders people in Following tab', async () => {
    renderProfile()
    fireEvent.click(screen.getByRole('button', { name: /following/i }))
    await waitFor(() => expect(screen.getByText('bob')).toBeInTheDocument())
  })

  it('renders people in Followers tab', async () => {
    renderProfile()
    fireEvent.click(screen.getByRole('button', { name: /followers/i }))
    await waitFor(() => expect(screen.getByText('carol')).toBeInTheDocument())
  })

  it('clicking a person opens ProfileOverlay', async () => {
    // mockOpenProfile is declared at module scope above — same reference used by the component.
    mockOpenProfile.mockClear()
    renderProfile()
    fireEvent.click(screen.getByRole('button', { name: /following/i }))
    await waitFor(() => screen.getByText('bob'))
    fireEvent.click(screen.getByText('bob'))
    expect(mockOpenProfile).toHaveBeenCalledWith('bob')
  })
})
```

- [ ] **Step 2: Run — verify PeopleTab tests fail**

```bash
cd D:/Coding/Git-Suite && npm test -- Profile.test 2>&1 | tail -20
```

Expected: PeopleTab tests fail.

- [ ] **Step 3: Add `PersonRowVerified` helper to `Profile.tsx`**

Copy from `ProfileOverlay.tsx:370-379`. Add above `PeopleTab`:

```tsx
function PersonRowVerified(props: React.ComponentPropsWithoutRef<typeof PersonRow> & { login: string }) {
  const { login, ...rest } = props
  const [isVerified, setIsVerified] = useState(false)
  useEffect(() => {
    window.api.org.getVerified(login)
      .then((v: boolean) => { if (v) setIsVerified(true) })
      .catch(() => {})
  }, [login])
  return <PersonRow {...rest} isVerified={isVerified} />
}
```

- [ ] **Step 4: Replace `PeopleTab` stub in `Profile.tsx`**

Copy logic from `ProfileOverlay.tsx:381-479`. The key difference: use `openProfile` (not `pushProfile`) since we're navigating from outside the overlay.

```tsx
function PeopleTab({ login, kind }: { login: string; kind: 'following' | 'followers' }) {
  const { openProfile }                       = useProfileOverlay()
  const [people, setPeople]                   = useState<any[]>([])
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState(false)
  const [followingSet, setFollowingSet]       = useState<Set<string>>(new Set())
  const [retryCount, setRetry]                = useState(0)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(false)
    const fetch = kind === 'following'
      ? window.api.profile.getFollowing(login)
      : window.api.profile.getFollowers(login)
    fetch
      .then(async (list: any[]) => {
        if (!isMounted) return
        setPeople(list)
        try {
          const checks = await Promise.all(list.map((p: any) => window.api.profile.isFollowing(p.login)))
          if (!isMounted) return
          const set = new Set<string>()
          list.forEach((p: any, i: number) => { if (checks[i]) set.add(p.login) })
          setFollowingSet(set)
        } catch { /* people list still shown */ }
      })
      .catch(() => { if (isMounted) setError(true) })
      .finally(() => { if (isMounted) setLoading(false) })
    return () => { isMounted = false }
  }, [login, kind, retryCount])

  const handleFollowToggle = async (personLogin: string) => {
    const was = followingSet.has(personLogin)
    setFollowingSet(prev => {
      const next = new Set(prev)
      was ? next.delete(personLogin) : next.add(personLogin)
      return next
    })
    try {
      if (was) await window.api.profile.unfollow(personLogin)
      else      await window.api.profile.follow(personLogin)
    } catch {
      setFollowingSet(prev => {
        const next = new Set(prev)
        was ? next.add(personLogin) : next.delete(personLogin)
        return next
      })
    }
  }

  if (error) return (
    <div className="profile-view-error">
      <span>Could not load {kind}.</span>
      <button className="profile-view-retry-btn" onClick={() => setRetry(n => n + 1)}>Retry</button>
    </div>
  )

  if (loading) return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg3)', flexShrink: 0, animation: 'shimmer 1.4s infinite linear' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 12, width: '30%', background: 'var(--bg3)', borderRadius: 4, animation: 'shimmer 1.4s infinite linear' }} />
            <div style={{ height: 10, width: '20%', background: 'var(--bg3)', borderRadius: 4, animation: 'shimmer 1.4s infinite linear' }} />
          </div>
        </div>
      ))}
    </div>
  )

  if (people.length === 0) return (
    <p className="profile-view-empty">No {kind} yet.</p>
  )

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {people.map((person) => (
        <PersonRowVerified
          key={person.login}
          login={person.login}
          user={person}
          isFollowing={followingSet.has(person.login)}
          isOwnProfile={login === person.login}
          onOpenProfile={() => openProfile(person.login)}
          onFollowToggle={() => handleFollowToggle(person.login)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Upgrade tab mounting to use `visited` cache**

To prevent re-fetching when switching tabs back and forth, replace the tab panel section in the main `Profile` component with a `visited` state that keeps already-mounted panels alive via `display:none`:

```tsx
// In the Profile component, add state:
const [visited, setVisited] = useState<Set<Tab>>(new Set(['Repos']))

// Update tab onClick:
onClick={() => {
  setActiveTab(tab)
  setVisited(prev => new Set([...prev, tab]))
}}

// Replace the tab panel section:
<div className="profile-view-tab-panel">
  {TABS.map(tab => (
    <div key={tab} style={{ display: activeTab === tab ? 'block' : 'none', height: '100%' }}>
      {login && visited.has(tab) && tab === 'Repos'     && <ReposTab     login={login} />}
      {login && visited.has(tab) && tab === 'Starred'   && <StarredTab   login={login} />}
      {login && visited.has(tab) && tab === 'Following' && <PeopleTab    login={login} kind="following" />}
      {login && visited.has(tab) && tab === 'Followers' && <PeopleTab    login={login} kind="followers" />}
    </div>
  ))}
</div>
```

This keeps the component mounted (preserving its fetched state) while hidden, so revisiting a tab doesn't re-fetch.

- [ ] **Step 6: Run all tests**

```bash
cd D:/Coding/Git-Suite && npm test -- Profile.test 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 7: Run full test suite — check for regressions**

```bash
cd D:/Coding/Git-Suite && npm test 2>&1 | tail -20
```

Expected: All existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/views/Profile.tsx src/views/Profile.test.tsx
git commit -m "feat(profile): add PeopleTab with follow/unfollow and tab-level fetch caching"
```

---

## Done

All four tasks complete. The Profile section is fully implemented:
- Dock nav item ✓
- `/profile` route ✓
- Sidebar with avatar, bio, meta, stats, edit button ✓
- Repos / Starred / Following / Followers tabs ✓
- Lazy fetch with `visited` cache (no re-fetches on tab switch) ✓
- Error states with retry ✓
- Tests covering sidebar, tabs, sort, and people interactions ✓
