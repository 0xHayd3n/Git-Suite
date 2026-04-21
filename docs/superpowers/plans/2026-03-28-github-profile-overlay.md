# GitHub Profile Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width profile overlay that appears over the main content area whenever any owner name is clicked, showing the user's avatar, bio, repos, starred repos, following, and followers — all with follow/unfollow actions.

**Architecture:** A `ProfileOverlay` React context provides `openProfile`/`pushProfile`/`popProfile`/`closeProfile` globally. The overlay renders as `position: absolute; inset: 0` inside `<main className="main-content">` (already `position: relative`), keeping the sidebar and titlebar unaffected. Owner name `<button>` elements replace plain text spans across all five views.

**Tech Stack:** React context + hooks, Electron IPC (`ipcMain.handle` / `ipcRenderer.invoke`), better-sqlite3, existing `RepoCard` component from Discover.tsx.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `electron/github.ts` | Add 7 profile API functions |
| Modify | `electron/db.ts` | Add `profile_cache` table to `db.exec()` schema block |
| Modify | `electron/main.ts` | Add profile imports + 8 IPC handlers |
| Modify | `electron/preload.ts` | Expose `window.api.profile` namespace |
| Modify | `src/env.d.ts` | TypeScript types for `window.api.profile` |
| Create | `src/contexts/ProfileOverlay.tsx` | Global open/close/push/pop state |
| Modify | `src/App.tsx` | Wrap with `ProfileOverlayProvider`, mount overlay inside `<main>` |
| Create | `src/components/ProfileOverlay.tsx` | Full overlay component (header, tabs, content) |
| Create | `src/components/PersonRow.tsx` | Reusable following/follower list row |
| Modify | `src/views/Discover.tsx` | Owner name → clickable button |
| Modify | `src/views/RepoDetail.tsx` | Owner name → clickable button |
| Modify | `src/views/Library.tsx` | Owner name → clickable button |
| Modify | `src/views/Starred.tsx` | Owner name → clickable button |
| Modify | `src/views/Collections.tsx` | Owner name → clickable button (collection detail rows) |
| Modify | `src/styles/globals.css` | Styles: overlay, owner-name, person-row, btn-follow, btn-following, tabs |

---

## Task 1: Profile GitHub API functions

**Files:**
- Modify: `electron/github.ts`

The existing `api()` helper in `github.ts` handles auth and error wrapping. Add 7 new exported functions using it.

- [ ] **Step 1: Read the existing `api()` helper signature in `electron/github.ts`**

  Open the file and look at how `api(path, token)` is defined and how existing functions like `getUser` and `searchRepos` call it. This is the pattern to follow.

- [ ] **Step 2: Add 7 profile API functions after the last existing export**

  ```typescript
  // ── Profile API ───────────────────────────────────────────────────

  export async function getProfileUser(token: string, username: string): Promise<any> {
    return api(`/users/${username}`, token)
  }

  export async function getUserRepos(token: string, username: string, sort = 'stars'): Promise<any[]> {
    return api(`/users/${username}/repos?sort=${sort}&per_page=30&type=public`, token)
  }

  export async function getUserStarred(token: string, username: string): Promise<any[]> {
    return api(`/users/${username}/starred?per_page=30`, token)
  }

  export async function getUserFollowing(token: string, username: string): Promise<any[]> {
    return api(`/users/${username}/following?per_page=50`, token)
  }

  export async function getUserFollowers(token: string, username: string): Promise<any[]> {
    return api(`/users/${username}/followers?per_page=50`, token)
  }

  export async function checkIsFollowing(token: string, username: string): Promise<boolean> {
    try {
      const res = await fetch(`https://api.github.com/user/following/${username}`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'GitSuite' },
      })
      return res.status === 204
    } catch {
      return false
    }
  }

  export async function followUser(token: string, username: string): Promise<void> {
    await fetch(`https://api.github.com/user/following/${username}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'GitSuite' },
    })
  }

  export async function unfollowUser(token: string, username: string): Promise<void> {
    await fetch(`https://api.github.com/user/following/${username}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'GitSuite' },
    })
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep "github.ts"`
  Expected: no output (no errors in this file)

- [ ] **Step 4: Commit**

  ```bash
  git add electron/github.ts
  git commit -m "feat(profile): add GitHub profile API functions"
  ```

---

## Task 2: profile_cache DB table + IPC handlers

**Files:**
- Modify: `electron/db.ts`
- Modify: `electron/main.ts`

All schema DDL lives in `electron/db.ts` inside the `db.exec(...)` block of the `getDb()` function — **not** in `main.ts`. The IPC handlers live in `main.ts`.

- [ ] **Step 1: Add `profile_cache` table to `electron/db.ts`**

  Open `electron/db.ts`, find the `db.exec(` call containing all the `CREATE TABLE IF NOT EXISTS` statements (search for `CREATE TABLE`). Append inside that same template-literal string, after the last table:
  ```sql
  CREATE TABLE IF NOT EXISTS profile_cache (
    username   TEXT PRIMARY KEY,
    data       TEXT,
    fetched_at TEXT
  );
  ```

- [ ] **Step 3: Add profile imports at the top of `electron/main.ts`**

  Find the existing import line for `github.ts` functions (it imports `fetchGitHubTopics`, `extractTags`, etc). Add the 7 new profile functions to that import:
  ```typescript
  import {
    // ... existing imports ...
    getProfileUser, getUserRepos, getUserStarred,
    getUserFollowing, getUserFollowers,
    checkIsFollowing, followUser, unfollowUser,
  } from './github'
  ```

- [ ] **Step 4: Add 8 IPC handlers after the Search IPC section**

  Add a new `// ── Profile IPC ──` section:
  ```typescript
  // ── Profile IPC ──────────────────────────────────────────────────

  ipcMain.handle('profile:getUser', async (_, username: string) => {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    const db = getDb(app.getPath('userData'))
    const TTL = 10 * 60 * 1000
    const cached = db.prepare('SELECT data, fetched_at FROM profile_cache WHERE username = ?').get(username) as { data: string; fetched_at: string } | undefined
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL) {
      return JSON.parse(cached.data)
    }
    const user = await getProfileUser(token, username)
    db.prepare('INSERT OR REPLACE INTO profile_cache (username, data, fetched_at) VALUES (?, ?, ?)').run(username, JSON.stringify(user), new Date().toISOString())
    return user
  })

  ipcMain.handle('profile:getUserRepos', async (_, username: string, sort?: string) => {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    return getUserRepos(token, username, sort)
  })

  ipcMain.handle('profile:getStarred', async (_, username: string) => {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    return getUserStarred(token, username)
  })

  ipcMain.handle('profile:getFollowing', async (_, username: string) => {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    return getUserFollowing(token, username)
  })

  ipcMain.handle('profile:getFollowers', async (_, username: string) => {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    return getUserFollowers(token, username)
  })

  ipcMain.handle('profile:isFollowing', async (_, username: string) => {
    const token = getToken()
    if (!token) return false
    return checkIsFollowing(token, username)
  })

  ipcMain.handle('profile:follow', async (_, username: string) => {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    return followUser(token, username)
  })

  ipcMain.handle('profile:unfollow', async (_, username: string) => {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    return unfollowUser(token, username)
  })
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep -E "db\.ts|main\.ts"`
  Expected: only pre-existing errors, no new ones from profile section

- [ ] **Step 6: Commit**

  ```bash
  git add electron/db.ts electron/main.ts
  git commit -m "feat(profile): add profile_cache table and 8 IPC handlers"
  ```

---

## Task 3: Preload bridge + type declarations

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add `profile` namespace to `electron/preload.ts`**

  Find the `search: { ... }` block at the end of `contextBridge.exposeInMainWorld('api', { ... })`. Add `profile` after it, **inside** the same object:

  ```typescript
  profile: {
    getUser:      (username: string) => ipcRenderer.invoke('profile:getUser', username),
    getUserRepos: (username: string, sort?: string) => ipcRenderer.invoke('profile:getUserRepos', username, sort),
    getStarred:   (username: string) => ipcRenderer.invoke('profile:getStarred', username),
    getFollowing: (username: string) => ipcRenderer.invoke('profile:getFollowing', username),
    getFollowers: (username: string) => ipcRenderer.invoke('profile:getFollowers', username),
    isFollowing:  (username: string) => ipcRenderer.invoke('profile:isFollowing', username),
    follow:       (username: string) => ipcRenderer.invoke('profile:follow', username),
    unfollow:     (username: string) => ipcRenderer.invoke('profile:unfollow', username),
  },
  ```

- [ ] **Step 2: Add `GitHubUser` interface and `profile` types to `src/env.d.ts`**

  Add before the final closing of the `Window` interface declaration:

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
  }
  ```

  Add `profile` to the `api` object type:

  ```typescript
  profile: {
    getUser:      (username: string) => Promise<GitHubUser>
    getUserRepos: (username: string, sort?: string) => Promise<any[]>
    getStarred:   (username: string) => Promise<any[]>
    getFollowing: (username: string) => Promise<GitHubUser[]>
    getFollowers: (username: string) => Promise<GitHubUser[]>
    isFollowing:  (username: string) => Promise<boolean>
    follow:       (username: string) => Promise<void>
    unfollow:     (username: string) => Promise<void>
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep -E "preload|env.d"`
  Expected: no output

- [ ] **Step 4: Commit**

  ```bash
  git add electron/preload.ts src/env.d.ts
  git commit -m "feat(profile): expose profile API via preload bridge"
  ```

---

## Task 4: ProfileOverlay context

**Files:**
- Create: `src/contexts/ProfileOverlay.tsx`

This is the global state for the overlay. It does not render anything — just provides open/push/pop/close functions plus the current state.

- [ ] **Step 1: Create `src/contexts/ProfileOverlay.tsx`**

  ```typescript
  import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

  interface ProfileState {
    isOpen: boolean
    stack: string[]
    currentUsername: string
  }

  interface ProfileOverlayContextValue {
    profileState: ProfileState
    openProfile:  (username: string) => void
    pushProfile:  (username: string) => void
    popProfile:   () => void
    closeProfile: () => void
    setStackAt:   (index: number, username: string) => void
  }

  const ProfileOverlayContext = createContext<ProfileOverlayContextValue | null>(null)

  const CLOSED: ProfileState = { isOpen: false, stack: [], currentUsername: '' }

  export function ProfileOverlayProvider({ children }: { children: ReactNode }) {
    const [profileState, setProfileState] = useState<ProfileState>(CLOSED)

    const openProfile = useCallback((username: string) => {
      setProfileState({ isOpen: true, stack: [username], currentUsername: username })
    }, [])

    const pushProfile = useCallback((username: string) => {
      setProfileState(prev => {
        const stack = [...prev.stack, username]
        return { isOpen: true, stack, currentUsername: username }
      })
    }, [])

    const popProfile = useCallback(() => {
      setProfileState(prev => {
        const stack = prev.stack.slice(0, -1)
        if (stack.length === 0) return CLOSED
        return { isOpen: true, stack, currentUsername: stack[stack.length - 1] }
      })
    }, [])

    const closeProfile = useCallback(() => setProfileState(CLOSED), [])

    const setStackAt = useCallback((index: number, username: string) => {
      setProfileState(prev => {
        const stack = prev.stack.slice(0, index + 1)
        return { isOpen: true, stack, currentUsername: username }
      })
    }, [])

    // Close on Escape
    useEffect(() => {
      const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeProfile() }
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [closeProfile])

    return (
      <ProfileOverlayContext.Provider value={{ profileState, openProfile, pushProfile, popProfile, closeProfile, setStackAt }}>
        {children}
      </ProfileOverlayContext.Provider>
    )
  }

  export function useProfileOverlay() {
    const ctx = useContext(ProfileOverlayContext)
    if (!ctx) throw new Error('useProfileOverlay must be used inside ProfileOverlayProvider')
    return ctx
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep "ProfileOverlay"`
  Expected: no output

- [ ] **Step 3: Commit**

  ```bash
  git add src/contexts/ProfileOverlay.tsx
  git commit -m "feat(profile): add ProfileOverlay context with open/push/pop/close"
  ```

---

## Task 5: Wire context + overlay mount point in App.tsx

**Files:**
- Modify: `src/App.tsx`

The overlay renders inside `<main className="main-content">`. This element needs `position: relative` (add via CSS) so the absolutely-positioned overlay is scoped to the content area only.

- [ ] **Step 1: Add `position: relative` to `.main-content` in `src/styles/globals.css`**

  Find the `.main-content` rule and add `position: relative`:
  ```css
  .main-content {
    position: relative;
    /* ... existing rules ... */
  }
  ```

- [ ] **Step 2: Update `src/App.tsx` to import and use `ProfileOverlayProvider` and `ProfileOverlay`**

  ```typescript
  import { ProfileOverlayProvider } from './contexts/ProfileOverlay'
  import ProfileOverlay from './components/ProfileOverlay'
  import { useProfileOverlay } from './contexts/ProfileOverlay'
  ```

  Update `AppContent` to render the overlay inside `<main>`:
  ```tsx
  // Inside AppContent, replace:
  <main className="main-content">
    <Routes>...</Routes>
  </main>

  // With:
  <main className="main-content">
    <Routes>...</Routes>
    <ProfileOverlayPortal />
  </main>
  ```

  Add `ProfileOverlayPortal` as a small component in App.tsx:
  ```tsx
  function ProfileOverlayPortal() {
    const { profileState } = useProfileOverlay()
    if (!profileState.isOpen) return null
    return <ProfileOverlay />
  }
  ```

  Wrap `<SavedReposProvider>` with `<ProfileOverlayProvider>` in `App()`:
  ```tsx
  export default function App() {
    return (
      <MemoryRouter ...>
        <ProfileOverlayProvider>
          <SavedReposProvider>
            <AppContent />
          </SavedReposProvider>
        </ProfileOverlayProvider>
      </MemoryRouter>
    )
  }
  ```

- [ ] **Step 3: Create a minimal stub `src/components/ProfileOverlay.tsx` so App.tsx compiles**

  ```typescript
  export default function ProfileOverlay() {
    return <div className="profile-overlay"><p>Loading...</p></div>
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep -E "App\.tsx|ProfileOverlay"`
  Expected: no new errors

- [ ] **Step 5: Commit**

  ```bash
  git add src/App.tsx src/components/ProfileOverlay.tsx src/styles/globals.css
  git commit -m "feat(profile): wire ProfileOverlayProvider and mount point in App"
  ```

---

## Task 6: Build ProfileOverlay component — header + tabs shell

**Files:**
- Modify: `src/components/ProfileOverlay.tsx` (replace stub)
- Modify: `src/styles/globals.css`

This task builds the complete overlay shell: fade-in animation, breadcrumb nav bar, profile identity header (with skeleton), and tab bar. Tab content is stubbed as empty divs — filled in Tasks 7 and 8.

- [ ] **Step 1: Add CSS for overlay, header, tabs to `src/styles/globals.css`**

  Append at the end of `globals.css`:

  ```css
  /* ── ProfileOverlay ──────────────────────────────────────────────── */

  @keyframes profileFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .profile-overlay {
    position: absolute;
    inset: 0;
    background: var(--bg);
    z-index: 100;
    display: flex;
    flex-direction: column;
    animation: profileFadeIn 0.15s ease;
    overflow: hidden;
  }

  .profile-nav-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    height: 38px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .profile-breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--t3);
  }

  .profile-breadcrumb-item {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    color: var(--t3);
    cursor: pointer;
  }

  .profile-breadcrumb-item:hover { color: var(--t1); }
  .profile-breadcrumb-item.current { color: var(--t1); cursor: default; }

  .btn-back {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    color: var(--t2);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    margin-right: 4px;
  }
  .btn-back:hover { background: var(--bg3); color: var(--t1); }

  .btn-close-overlay {
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    color: var(--t3);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    line-height: 1;
  }
  .btn-close-overlay:hover { background: var(--bg3); color: var(--t1); }

  .profile-identity-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 24px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .profile-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
    object-fit: cover;
  }

  .profile-meta { flex: 1; min-width: 0; }

  .profile-display-name {
    font-family: 'Inter', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: var(--t1);
  }

  .profile-login {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--t3);
    margin-top: 2px;
  }

  .profile-bio {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    color: var(--t2);
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-stats {
    display: flex;
    gap: 14px;
    margin-top: 5px;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: var(--t3);
  }

  .profile-stats strong { color: var(--t1); }

  .btn-follow {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 500;
    padding: 7px 16px;
    border-radius: var(--radius-md);
    background: var(--accent);
    border: none;
    color: white;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .btn-follow:hover { opacity: 0.88; }

  .btn-following {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 500;
    padding: 7px 16px;
    border-radius: var(--radius-md);
    background: var(--bg3);
    border: 1px solid var(--border2);
    color: var(--t2);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }
  .btn-following:hover {
    background: var(--red-soft);
    border-color: var(--red-border);
    color: var(--red);
  }

  .profile-tab-bar {
    display: flex;
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    background: var(--bg);
    flex-shrink: 0;
  }

  .profile-tab-btn {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 16px;
    margin-bottom: -1px;
    cursor: pointer;
    transition: color 0.12s;
    color: var(--t2);
  }
  .profile-tab-btn.active {
    font-weight: 600;
    color: var(--t1);
    border-bottom-color: var(--accent);
  }

  .profile-tab-count {
    margin-left: 5px;
    font-size: 11px;
    color: var(--t3);
    font-weight: 400;
  }

  .profile-tab-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /* Skeleton shimmer (reuse existing animation from globals) */
  .profile-skeleton-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--bg3);
    flex-shrink: 0;
  }

  .profile-skeleton-line {
    height: 12px;
    border-radius: 4px;
    background: var(--bg3);
    animation: shimmer 1.4s infinite linear;
  }

  /* Owner name clickable style (used across all views) */
  .owner-name-btn {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    transition: color 0.12s;
  }
  .owner-name-btn:hover {
    color: var(--accent-text);
    text-decoration: underline;
  }

  /* PersonRow */
  .person-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.1s;
  }
  .person-row:hover { background: var(--bg3); }

  .person-row-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
    object-fit: cover;
  }

  .person-row-name {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--t1);
  }

  .person-row-login {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--t3);
  }

  .person-row-bio {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }
  ```

- [ ] **Step 2: Write the full `ProfileOverlay` component**

  Replace the stub in `src/components/ProfileOverlay.tsx`:

  ```typescript
  import { useState, useEffect } from 'react'
  import { useProfileOverlay } from '../contexts/ProfileOverlay'

  const TABS = ['Repos', 'Starred', 'Following', 'Followers'] as const
  type Tab = typeof TABS[number]

  function formatCount(n: number | null | undefined): string {
    if (n == null) return '—'
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
  }

  function SkeletonHeader() {
    return (
      <div className="profile-identity-row">
        <div className="profile-skeleton-avatar" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="profile-skeleton-line" style={{ width: 180 }} />
          <div className="profile-skeleton-line" style={{ width: 120 }} />
          <div className="profile-skeleton-line" style={{ width: 260 }} />
        </div>
      </div>
    )
  }

  export default function ProfileOverlay() {
    const { profileState, popProfile, closeProfile, setStackAt, pushProfile } = useProfileOverlay()
    const { stack, currentUsername } = profileState

    const [user, setUser] = useState<any>(null)
    const [loadingUser, setLoadingUser] = useState(true)
    const [activeTab, setActiveTab] = useState<Tab>('Repos')

    // Reset tab + re-fetch when username changes
    useEffect(() => {
      setUser(null)
      setLoadingUser(true)
      setActiveTab('Repos')
      window.api.profile.getUser(currentUsername)
        .then(setUser)
        .catch(() => setUser(null))
        .finally(() => setLoadingUser(false))
    }, [currentUsername])

    const counts: Partial<Record<Tab, number>> = {
      Repos:     user?.public_repos,
      Followers: user?.followers,
      Following: user?.following,
    }

    return (
      <div className="profile-overlay">
        {/* ── Nav bar ── */}
        <div className="profile-nav-bar">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {stack.length > 1 && (
              <button className="btn-back" onClick={popProfile}>← Back</button>
            )}
            <div className="profile-breadcrumb">
              {stack.map((username, i) => (
                <span key={`${username}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {i > 0 && <span style={{ opacity: 0.4 }}>›</span>}
                  <button
                    className={`profile-breadcrumb-item${i === stack.length - 1 ? ' current' : ''}`}
                    onClick={() => i < stack.length - 1 && setStackAt(i, username)}
                  >
                    {username}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <button className="btn-close-overlay" onClick={closeProfile}>✕</button>
        </div>

        {/* ── Profile identity ── */}
        {loadingUser ? (
          <SkeletonHeader />
        ) : user ? (
          <ProfileHeader user={user} currentUsername={currentUsername} />
        ) : (
          <div style={{ padding: '20px 24px', color: 'var(--t3)', fontSize: 13 }}>
            Could not load profile for @{currentUsername}
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="profile-tab-bar">
          {TABS.map(tab => (
            <button
              key={tab}
              className={`profile-tab-btn${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {counts[tab] != null && (
                <span className="profile-tab-count">{formatCount(counts[tab])}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="profile-tab-content">
          {activeTab === 'Repos'     && <ReposTab username={currentUsername} />}
          {activeTab === 'Starred'   && <StarredTab username={currentUsername} />}
          {activeTab === 'Following' && <PeopleTab username={currentUsername} kind="following" onOpenProfile={pushProfile} />}
          {activeTab === 'Followers' && <PeopleTab username={currentUsername} kind="followers" onOpenProfile={pushProfile} />}
        </div>
      </div>
    )
  }

  // ── ProfileHeader ─────────────────────────────────────────────────
  function ProfileHeader({ user, currentUsername }: { user: any; currentUsername: string }) {
    const [loggedInUsername, setLoggedInUsername] = useState<string>('')
    const [following, setFollowing] = useState(false)
    const [followLoading, setFollowLoading] = useState(true)

    useEffect(() => {
      window.api.github.getUser().then((u: any) => setLoggedInUsername(u?.login ?? '')).catch(() => {})
    }, [])

    useEffect(() => {
      setFollowLoading(true)
      window.api.profile.isFollowing(currentUsername)
        .then(setFollowing)
        .catch(() => setFollowing(false))
        .finally(() => setFollowLoading(false))
    }, [currentUsername])

    const handleFollowToggle = async () => {
      const was = following
      setFollowing(!was)
      try {
        if (was) await window.api.profile.unfollow(currentUsername)
        else      await window.api.profile.follow(currentUsername)
      } catch {
        setFollowing(was)
      }
    }

    const isOwnProfile = loggedInUsername === currentUsername

    return (
      <div className="profile-identity-row">
        <img src={user.avatar_url} alt={user.login} className="profile-avatar" />
        <div className="profile-meta">
          <div className="profile-display-name">{user.name ?? user.login}</div>
          <div className="profile-login">@{user.login}</div>
          {user.bio && <div className="profile-bio">{user.bio}</div>}
          <div className="profile-stats">
            <span><strong>{formatCount(user.followers)}</strong> followers</span>
            <span><strong>{formatCount(user.following)}</strong> following</span>
            {user.location && <span>📍 {user.location}</span>}
            {user.company && <span>{user.company.replace(/^@/, '')}</span>}
          </div>
        </div>
        {!isOwnProfile && !followLoading && (
          <button
            className={following ? 'btn-following' : 'btn-follow'}
            onClick={handleFollowToggle}
          >
            {following ? 'Following ✓' : '+ Follow'}
          </button>
        )}
      </div>
    )
  }

  // ── Stub tab components — replaced in Tasks 7 + 8 ─────────────────
  function ReposTab({ username }: { username: string }) {
    return <div style={{ padding: 24, color: 'var(--t3)', fontSize: 13 }}>Loading repos for @{username}…</div>
  }

  function StarredTab({ username }: { username: string }) {
    return <div style={{ padding: 24, color: 'var(--t3)', fontSize: 13 }}>Loading starred for @{username}…</div>
  }

  function PeopleTab({ username, kind, onOpenProfile }: { username: string; kind: 'following' | 'followers'; onOpenProfile: (u: string) => void }) {
    return <div style={{ padding: 24, color: 'var(--t3)', fontSize: 13 }}>Loading {kind} for @{username}…</div>
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep "ProfileOverlay"`
  Expected: no errors

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/ProfileOverlay.tsx src/styles/globals.css
  git commit -m "feat(profile): build overlay shell — header, breadcrumb nav, tab bar"
  ```

---

## Task 7: Repos and Starred tab content

**Files:**
- Modify: `src/components/ProfileOverlay.tsx`

Replace the stub `ReposTab` and `StarredTab` components with real implementations. These reuse the existing `RepoCard` component — but `RepoCard` lives in `Discover.tsx` as a non-exported function. It needs to be moved to a shared location first.

- [ ] **Step 1: Extract `RepoCard` from `Discover.tsx` into `src/components/RepoCard.tsx`**

  In `Discover.tsx`, find the `RepoCard` function and all the types/helpers it depends on that are not already in `src/types/repo.ts`:
  - `InstallState` type
  - `formatHealth` function
  - `formatCount` function
  - `StarIcon` / `ForkIcon` / `IssueIcon` SVG components (if any)
  - `parseEmoji` function (if any)

  Create `src/components/RepoCard.tsx` exporting `RepoCard` with the same props interface. Import everything it needs from `src/types/repo.ts`, `./BannerSVG`, and `../contexts/SavedRepos`.

  In `Discover.tsx`, delete the now-moved code and add:
  ```typescript
  import RepoCard from '../components/RepoCard'
  ```

- [ ] **Step 2: Verify Discover still compiles and works**

  Run: `npx tsc --noEmit 2>&1 | grep -E "Discover|RepoCard"`
  Expected: no errors

- [ ] **Step 3: Replace stub `ReposTab` in `ProfileOverlay.tsx`**

  ```typescript
  import RepoCard from './RepoCard'

  const REPO_SORTS = ['Stars', 'Updated', 'Name'] as const
  type RepoSort = typeof REPO_SORTS[number]

  const SORT_MAP: Record<RepoSort, string> = {
    Stars: 'stars', Updated: 'updated', Name: 'full_name',
  }

  function ReposTab({ username }: { username: string }) {
    const [repos, setRepos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [sort, setSort] = useState<RepoSort>('Stars')
    const navigate = useNavigate()  // works — ProfileOverlay renders inside MemoryRouter

    useEffect(() => {
      setLoading(true)
      window.api.profile.getUserRepos(username, SORT_MAP[sort])
        .then(setRepos)
        .catch(() => setRepos([]))
        .finally(() => setLoading(false))
    }, [username, sort])

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px 0', gap: 8 }}>
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
        <div style={{ padding: '12px 24px 24px' }}>
          {loading ? (
            <SkeletonGrid />
          ) : repos.length === 0 ? (
            <p style={{ color: 'var(--t3)', fontSize: 13 }}>No public repos.</p>
          ) : (
            <div className="repo-grid">
              {repos.map(r => {
                // getUserRepos returns raw GitHub API shape — convert to RepoRow-compatible
                const row = apiRepoToRow(r)
                return (
                  <RepoCard
                    key={row.id}
                    repo={row}
                    onNavigate={navigate}
                    onTagClick={() => {}}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }
  ```

  Add the `apiRepoToRow` helper inside ProfileOverlay.tsx (converts raw GitHub API repo shape to RepoRow-compatible object):
  ```typescript
  function apiRepoToRow(r: any) {
    return {
      id:            String(r.id),
      owner:         r.owner?.login ?? '',
      name:          r.name,
      description:   r.description ?? null,
      language:      r.language ?? null,
      topics:        JSON.stringify(r.topics ?? []),
      stars:         r.stargazers_count ?? null,
      forks:         r.forks_count ?? null,
      license:       r.license?.spdx_id ?? null,
      homepage:      r.homepage ?? null,
      updated_at:    r.updated_at ?? null,
      saved_at:      null,
      type:          null,
      banner_svg:    null,
      discovered_at: null,
      discover_query:null,
      watchers:      r.watchers_count ?? null,
      size:          r.size ?? null,
      open_issues:   r.open_issues_count ?? null,
      starred_at:    null,
      default_branch:r.default_branch ?? 'main',
    }
  }
  ```

- [ ] **Step 4: Replace stub `StarredTab`**

  Identical to `ReposTab` except:
  - Fetches via `window.api.profile.getStarred(username)` (no sort param)
  - Sort options: 'Stars', 'Recent' (client-side sort only — no re-fetch)
  - Empty state: "No starred repos yet."

  ```typescript
  function StarredTab({ username }: { username: string }) {
    const [repos, setRepos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [sort, setSort] = useState<'Stars' | 'Recent'>('Stars')
    const navigate = useNavigate()

    useEffect(() => {
      setLoading(true)
      window.api.profile.getStarred(username)
        .then(setRepos)
        .catch(() => setRepos([]))
        .finally(() => setLoading(false))
    }, [username])

    const sorted = [...repos].sort((a, b) =>
      sort === 'Stars'
        ? (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)
        : new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
    )

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px 0', gap: 8 }}>
          {(['Stars', 'Recent'] as const).map(s => (
            <button key={s} className={`discover-sort-btn${sort === s ? ' active' : ''}`} onClick={() => setSort(s)}>{s}</button>
          ))}
        </div>
        <div style={{ padding: '12px 24px 24px' }}>
          {loading ? <SkeletonGrid /> : sorted.length === 0 ? (
            <p style={{ color: 'var(--t3)', fontSize: 13 }}>No starred repos yet.</p>
          ) : (
            <div className="repo-grid">
              {sorted.map(r => (
                <RepoCard key={r.id} repo={apiRepoToRow(r)} onNavigate={navigate} onTagClick={() => {}} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 5: Add `SkeletonGrid` helper (9-card shimmer)**

  ```typescript
  function SkeletonGrid() {
    return (
      <div className="repo-grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="repo-card" style={{ minHeight: 180 }}>
            <div style={{ height: 72, background: 'var(--bg3)', animation: 'shimmer 1.4s infinite linear' }} />
            <div className="repo-card-body">
              <div style={{ height: 13, width: '60%', background: 'var(--bg3)', borderRadius: 4, marginBottom: 8, animation: 'shimmer 1.4s infinite linear' }} />
              <div style={{ height: 11, width: '40%', background: 'var(--bg3)', borderRadius: 4, animation: 'shimmer 1.4s infinite linear' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  ```

- [ ] **Step 6: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep "ProfileOverlay\|RepoCard"`
  Expected: no new errors

- [ ] **Step 7: Commit**

  ```bash
  git add src/components/ProfileOverlay.tsx src/components/RepoCard.tsx src/views/Discover.tsx
  git commit -m "feat(profile): repos and starred tabs with RepoCard grid"
  ```

---

## Task 8: PersonRow component + Following/Followers tabs

**Files:**
- Create: `src/components/PersonRow.tsx`
- Modify: `src/components/ProfileOverlay.tsx`

- [ ] **Step 1: Create `src/components/PersonRow.tsx`**

  `GitHubUser` is declared as an ambient global interface in `src/env.d.ts` — it cannot be named-imported. Declare it inline or use `any` with a comment. Use the inline approach:

  ```typescript
  // GitHubUser is an ambient global from src/env.d.ts — cannot be named-imported
  interface GHUser {
    login: string
    name: string | null
    avatar_url: string
    bio: string | null
  }

  interface PersonRowProps {
    user: GHUser
    isFollowing: boolean
    isOwnProfile: boolean
    onOpenProfile: () => void
    onFollowToggle: () => void   // called without event — stopPropagation handled internally
  }

  export default function PersonRow({ user, isFollowing, isOwnProfile, onOpenProfile, onFollowToggle }: PersonRowProps) {
    return (
      <div className="person-row" onClick={onOpenProfile}>
        <img src={user.avatar_url} alt={user.login} className="person-row-avatar" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="person-row-name">{user.name ?? user.login}</div>
          <div className="person-row-login">@{user.login}</div>
          {user.bio && <div className="person-row-bio">{user.bio}</div>}
        </div>
        <button
          className={isFollowing ? 'btn-following' : 'btn-follow'}
          style={{ fontSize: 11, padding: '5px 12px' }}
          onClick={(e) => { e.stopPropagation(); onFollowToggle() }}
        >
          {isFollowing || isOwnProfile ? 'Following ✓' : '+ Follow'}
        </button>
      </div>
    )
  }
  ```

  Note: `GitHubUser` is an ambient global in `src/env.d.ts` and cannot be named-imported. Use the inline `GHUser` interface defined in the code block above.

- [ ] **Step 2: Replace stub `PeopleTab` in `ProfileOverlay.tsx`**

  ```typescript
  import PersonRow from './PersonRow'

  function PeopleTab({ username, kind, onOpenProfile }: {
    username: string
    kind: 'following' | 'followers'
    onOpenProfile: (u: string) => void
  }) {
    const [people, setPeople]           = useState<any[]>([])
    const [loading, setLoading]         = useState(true)
    const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())
    const [loggedInUser, setLoggedInUser] = useState<string>('')

    useEffect(() => {
      window.api.github.getUser().then((u: any) => setLoggedInUser(u?.login ?? '')).catch(() => {})
    }, [])

    useEffect(() => {
      setLoading(true)
      const fetch = kind === 'following'
        ? window.api.profile.getFollowing(username)
        : window.api.profile.getFollowers(username)
      fetch
        .then(async (list) => {
          setPeople(list)
          // Seed followingSet: check which ones the logged-in user follows
          const checks = await Promise.all(list.map((p: any) => window.api.profile.isFollowing(p.login)))
          const set = new Set<string>()
          list.forEach((p: any, i: number) => { if (checks[i]) set.add(p.login) })
          setFollowingSet(set)
        })
        .catch(() => setPeople([]))
        .finally(() => setLoading(false))
    }, [username, kind])

    const handleFollowToggle = async (login: string) => {
      const was = followingSet.has(login)
      setFollowingSet(prev => {
        const next = new Set(prev)
        was ? next.delete(login) : next.add(login)
        return next
      })
      try {
        if (was) await window.api.profile.unfollow(login)
        else      await window.api.profile.follow(login)
      } catch {
        setFollowingSet(prev => {
          const next = new Set(prev)
          was ? next.add(login) : next.delete(login)
          return next
        })
      }
    }

    if (loading) {
      return (
        <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
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
    }

    if (people.length === 0) {
      return <p style={{ padding: '20px 24px', color: 'var(--t3)', fontSize: 13 }}>No {kind} yet.</p>
    }

    return (
      <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {people.map((person) => (
          <PersonRow
            key={person.login}
            user={person}
            isFollowing={followingSet.has(person.login)}
            isOwnProfile={loggedInUser === person.login}
            onOpenProfile={() => onOpenProfile(person.login)}
            onFollowToggle={() => handleFollowToggle(person.login)}
          />
        ))}
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `npx tsc --noEmit 2>&1 | grep -E "PersonRow|ProfileOverlay|PeopleTab"`
  Expected: no errors

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/PersonRow.tsx src/components/ProfileOverlay.tsx
  git commit -m "feat(profile): following/followers tabs with PersonRow and follow toggle"
  ```

---

## Task 9: Wire owner name clicks across all 5 views

**Files:**
- Modify: `src/views/Discover.tsx`
- Modify: `src/views/RepoDetail.tsx`
- Modify: `src/views/Library.tsx`
- Modify: `src/views/Starred.tsx`
- Modify: `src/views/Collections.tsx` (collection detail rows only)

In each view, the owner name plain text becomes a `<button className="owner-name-btn">` that calls `openProfile(owner)` via `useProfileOverlay()`. Every click needs `e.stopPropagation()`.

- [ ] **Step 1: Update `Discover.tsx` — make owner name in `RepoCard` clickable**

  Since `RepoCard` is now in `src/components/RepoCard.tsx` (from Task 7), add `onOwnerClick?: (owner: string) => void` to its props. Inside `RepoCard`, find:
  ```tsx
  <span className="repo-card-owner">{repo.owner}</span>
  ```
  Replace with:
  ```tsx
  <button
    className="owner-name-btn repo-card-owner"
    onClick={e => { e.stopPropagation(); onOwnerClick?.(repo.owner) }}
  >
    {repo.owner}
  </button>
  ```

  In `Discover.tsx`, pass `onOwnerClick`:
  ```tsx
  const { openProfile } = useProfileOverlay()
  // ...
  <RepoCard repo={r} onNavigate={navigate} onTagClick={addTag} onOwnerClick={openProfile} />
  ```

- [ ] **Step 2: Update `RepoDetail.tsx` — owner in header and breadcrumb**

  Add `const { openProfile } = useProfileOverlay()` near the top of `RepoDetail`.

  Find the owner text in the header area. Replace:
  ```tsx
  <div className="...owner class...">{repo.owner}</div>
  ```
  With:
  ```tsx
  <button
    className="owner-name-btn ...owner class..."
    onClick={e => { e.stopPropagation(); openProfile(repo.owner) }}
  >
    {repo.owner}
  </button>
  ```

  Do the same for any breadcrumb owner text.

- [ ] **Step 3: Update `Library.tsx` — owner in list rows and detail panel**

  Add `const { openProfile } = useProfileOverlay()` in the component.

  Find all `<div className="lib-detail-owner">{row.owner}</div>` (and any list row owner text). Replace with:
  ```tsx
  <button
    className="owner-name-btn lib-detail-owner"
    onClick={e => { e.stopPropagation(); openProfile(row.owner) }}
  >
    {row.owner}
  </button>
  ```

- [ ] **Step 4: Update `Starred.tsx` — owner prefix**

  Add `const { openProfile } = useProfileOverlay()`.

  Find:
  ```tsx
  <span className="starred-owner">{r.owner}/</span>
  ```
  Replace with:
  ```tsx
  <button
    className="owner-name-btn starred-owner"
    onClick={e => { e.stopPropagation(); openProfile(r.owner) }}
  >
    {r.owner}
  </button>
  <span style={{ color: 'var(--t3)' }}>/</span>
  ```

- [ ] **Step 5: Update `Collections.tsx` — owner in collection detail repo rows**

  Add `const { openProfile } = useProfileOverlay()`.

  Find where repo owner is displayed in the collection detail (right-hand panel). Replace the text with:
  ```tsx
  <button
    className="owner-name-btn"
    onClick={e => { e.stopPropagation(); openProfile(row.owner) }}
  >
    {row.owner}
  </button>
  ```

- [ ] **Step 6: Verify TypeScript compiles across all 5 views**

  Run: `npx tsc --noEmit 2>&1 | grep -E "Discover|RepoDetail|Library|Starred|Collections"`
  Expected: only pre-existing errors

- [ ] **Step 7: Commit**

  ```bash
  git add src/views/Discover.tsx src/views/RepoDetail.tsx src/views/Library.tsx src/views/Starred.tsx src/views/Collections.tsx src/components/RepoCard.tsx
  git commit -m "feat(profile): make owner names clickable across all views"
  ```

---

## Task 10: Final integration check

- [ ] **Step 1: Run the full TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1
  ```
  Expected: only the same pre-existing errors that existed before this feature (mcp-server.ts, preload.ts parameter mismatch, tag-extractor.test.ts). No new errors.

- [ ] **Step 2: Start the app and verify manually**

  ```bash
  npm run dev
  ```

  Test checklist:
  - [ ] Click owner name on a Discover card → profile overlay opens, fades in
  - [ ] Profile header shows avatar, name, login, bio, follower/following counts
  - [ ] Escape key closes the overlay
  - [ ] ✕ button closes the overlay
  - [ ] Repos tab shows 3-column card grid
  - [ ] Starred tab shows grid with sort toggle
  - [ ] Following tab shows person rows
  - [ ] Clicking a person in Following → breadcrumb shows user1 › user2
  - [ ] Back button returns to user1
  - [ ] Clicking owner in Library / Starred / RepoDetail / Collections also opens overlay
  - [ ] Card/row click navigation still works (stopPropagation only on owner name)

- [ ] **Step 3: Final commit if no issues**

  ```bash
  git add -A
  git commit -m "feat(profile): GitHub profile overlay — complete"
  ```

---

## Key implementation notes for subagents

1. **`getToken()` in main.ts** — The existing pattern for getting the GitHub token is `const token = getToken()`. Check the existing IPC handlers (`github:getRepo`, etc.) to confirm the exact pattern used in this codebase before writing the profile IPC handlers.

2. **`useNavigate()` inside ProfileOverlay** — `ProfileOverlay` renders inside `<main className="main-content">` which is inside the `MemoryRouter` in `App.tsx`, so `useNavigate()` will work correctly.

3. **`GitHubUser` type in PersonRow** — The type is declared as a global `interface` in `src/env.d.ts`. In component files, you don't need to import it — it's ambient. But if TypeScript complains, declare it locally in the component file.

4. **`RepoCard` extraction (Task 7, Step 1)** — Be thorough about finding ALL the helpers `RepoCard` depends on. Search for every identifier used in the function body that isn't from an import. Move only what `RepoCard` actually needs.

5. **CSS `position: relative` on `.main-content`** — This is required for `position: absolute; inset: 0` on the overlay to work correctly. Check globals.css first — it may already be set.

6. **People tab `isFollowing` bulk check** — The spec calls one `isFollowing` per person. With 50 people that's 50 API calls. This is acceptable for MVP since GitHub allows 5000 API calls/hour for authenticated users.

7. **`window.api.github.getUser()` called in both `ProfileHeader` and `PeopleTab`** — Both components independently call this to get the logged-in username for "is own profile" detection. This fires two IPC calls per profile open. Acceptable for MVP — if this becomes a problem, lift the logged-in user fetch to `ProfileOverlay` and pass it down as a prop.
