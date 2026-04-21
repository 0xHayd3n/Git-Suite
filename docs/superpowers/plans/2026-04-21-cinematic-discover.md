# Cinematic Discover Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width cinematic hero banner and a horizontal "Recommended for You" row above the existing Discover grid.

**Architecture:** Two new focused components (`DiscoverHero`, `DiscoverRow`) are inserted into the `discover-main` flex column above `GridHeader` and the scrollable grid. Recommended data is fetched on Discover mount (reusing the existing `recommendedCache` ref) and split into `heroRepo` (items[0]) and `rowRepos` (items[1–7]). Everything below the row — search, filters, grid, pagination — is untouched.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, existing `DitherBackground` component, `window.api.github.getRecommended()` IPC call.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/DiscoverHero.tsx` | Cinematic hero banner |
| Create | `src/components/DiscoverHero.css` | Hero styles |
| Create | `src/components/DiscoverHero.test.tsx` | Hero unit tests |
| Create | `src/components/DiscoverRow.tsx` | Horizontal recommended row |
| Create | `src/components/DiscoverRow.css` | Row styles |
| Create | `src/components/DiscoverRow.test.tsx` | Row unit tests |
| Modify | `src/views/Discover.tsx` | Fetch recommended, add state, render hero+row |

---

## Task 1: `DiscoverHero` component

**Files:**
- Create: `src/components/DiscoverHero.tsx`
- Create: `src/components/DiscoverHero.css`
- Create: `src/components/DiscoverHero.test.tsx`

### Background knowledge

- `DitherBackground` lives at `src/components/DitherBackground.tsx`. It takes `avatarUrl?: string | null` and `fallbackGradient?: [string, string]`. It uses `ResizeObserver` internally — mock it in tests (see Task 1 test setup below).
- `RepoRow` type is in `src/types/repo.ts`. Key fields used here: `owner`, `name`, `description`, `stars`, `forks`, `language`, `avatar_url`, `starred_at`, `pushed_at`.
- `formatCount` is exported from `src/components/RepoCard.tsx` — import it for star/fork counts.
- `getLangColor` is exported from `src/lib/languages.ts` — used to colour the language dot.
- `window.api.github.starRepo(owner, name)` and `window.api.github.unstarRepo(owner, name)` — async IPC calls for starring.
- `.discover-layout` already has `padding-left: 66px`, so `discover-main` starts past the floating sidebar rail. The hero just needs normal padding (14px left), no extra indent.

---

- [ ] **Step 1.1: Write failing tests**

Create `src/components/DiscoverHero.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiscoverHero from './DiscoverHero'
import type { RepoRow } from '../types/repo'

vi.mock('./DitherBackground', () => ({
  default: () => <div data-testid="dither-bg" />,
}))

vi.mock('../hooks/useBayerDither', () => ({ useBayerDither: vi.fn() }))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver

  globalThis.window.api = {
    github: {
      starRepo: vi.fn().mockResolvedValue(undefined),
      unstarRepo: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.api
})

const repo: RepoRow = {
  id: '1', owner: 'vercel', name: 'next.js',
  description: 'The React Framework', language: 'JavaScript',
  stars: 128000, forks: 27000, topics: '[]',
  avatar_url: 'https://example.com/avatar.png',
  starred_at: null, pushed_at: '2024-01-01T00:00:00Z',
  license: null, homepage: null, updated_at: null, saved_at: null,
  type: null, banner_svg: null, discovered_at: null, discover_query: null,
  watchers: null, size: null, open_issues: null, default_branch: null,
  og_image_url: null, banner_color: null,
  translated_description: null, translated_description_lang: null,
  translated_readme: null, translated_readme_lang: null, detected_language: null,
  verification_score: null, verification_tier: null, verification_signals: null,
  verification_checked_at: null, type_bucket: null, type_sub: null,
}

describe('DiscoverHero', () => {
  it('renders null when repo is null', () => {
    const { container } = render(
      <DiscoverHero repo={null} onNavigate={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders owner/name as title', () => {
    render(<DiscoverHero repo={repo} onNavigate={vi.fn()} />)
    expect(screen.getByText('vercel / next.js')).toBeTruthy()
  })

  it('renders description', () => {
    render(<DiscoverHero repo={repo} onNavigate={vi.fn()} />)
    expect(screen.getByText('The React Framework')).toBeTruthy()
  })

  it('calls onNavigate with correct path on View Repo click', async () => {
    const onNavigate = vi.fn()
    render(<DiscoverHero repo={repo} onNavigate={onNavigate} />)
    await userEvent.click(screen.getByRole('button', { name: /view repo/i }))
    expect(onNavigate).toHaveBeenCalledWith('/repo/vercel/next.js')
  })

  it('renders DitherBackground with avatarUrl', () => {
    render(<DiscoverHero repo={repo} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('dither-bg')).toBeTruthy()
  })

  it('star button calls starRepo when not yet starred', async () => {
    render(<DiscoverHero repo={repo} onNavigate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /star/i }))
    expect(window.api.github.starRepo).toHaveBeenCalledWith('vercel', 'next.js')
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
npm test -- --reporter=verbose src/components/DiscoverHero.test.tsx
```

Expected: FAIL — `DiscoverHero` module not found.

- [ ] **Step 1.3: Create `src/components/DiscoverHero.css`**

```css
.discover-hero {
  position: relative;
  height: 220px;
  flex-shrink: 0;
  overflow: hidden;
}

.discover-hero-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100px;
  background: linear-gradient(to bottom, transparent, var(--bg));
  z-index: 1;
  pointer-events: none;
}

.discover-hero-avatar {
  position: absolute;
  top: 18px;
  right: 20px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
}

.discover-hero-avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.discover-hero-owner {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}

.discover-hero-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 0 24px 22px 16px;
  max-width: 580px;
}

.discover-hero-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--accent-text);
  opacity: 0.8;
  margin-bottom: 5px;
}

.discover-hero-title {
  font-size: 26px;
  font-weight: 800;
  color: var(--t1);
  letter-spacing: -0.4px;
  line-height: 1.15;
  margin-bottom: 5px;
}

.discover-hero-desc {
  font-size: 12px;
  color: var(--t3);
  margin-bottom: 10px;
  max-width: 440px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.discover-hero-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.discover-hero-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--t4);
}

.discover-hero-lang-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.discover-hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.discover-hero-btn-primary {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background: var(--accent);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.discover-hero-btn-primary:hover {
  opacity: 0.88;
}

.discover-hero-btn-ghost {
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.07);
  color: var(--t2);
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: background 0.15s;
}

.discover-hero-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.12);
}

.discover-hero-btn-ghost.starred {
  color: #f87171;
  border-color: rgba(220, 38, 38, 0.3);
}
```

- [ ] **Step 1.4: Create `src/components/DiscoverHero.tsx`**

```tsx
import { useState } from 'react'
import './DiscoverHero.css'
import DitherBackground from './DitherBackground'
import { formatCount } from './RepoCard'
import { getLangColor } from '../lib/languages'
import type { RepoRow } from '../types/repo'

interface DiscoverHeroProps {
  repo: RepoRow | null
  onNavigate: (path: string) => void
  onStar?: (id: string, starred: boolean) => void
}

export default function DiscoverHero({ repo, onNavigate, onStar }: DiscoverHeroProps) {
  const [starred, setStarred] = useState(!!repo?.starred_at)
  const [starWorking, setStarWorking] = useState(false)

  if (!repo) return null

  const handleViewRepo = () => onNavigate(`/repo/${repo.owner}/${repo.name}`)

  const handleStar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (starWorking) return
    setStarWorking(true)
    try {
      if (starred) {
        await window.api.github.unstarRepo(repo.owner, repo.name)
        setStarred(false)
        onStar?.(repo.id, false)
      } else {
        await window.api.github.starRepo(repo.owner, repo.name)
        setStarred(true)
        onStar?.(repo.id, true)
      }
    } catch { /* silently ignore */ }
    finally { setStarWorking(false) }
  }

  const langColor = getLangColor(repo.language)

  return (
    <div className="discover-hero">
      <DitherBackground avatarUrl={repo.avatar_url} />
      <div className="discover-hero-fade" />

      {repo.avatar_url && (
        <div className="discover-hero-avatar">
          <img className="discover-hero-avatar-img" src={repo.avatar_url} alt={repo.owner} />
          <span className="discover-hero-owner">{repo.owner}</span>
        </div>
      )}

      <div className="discover-hero-content">
        <div className="discover-hero-label">Featured · Top Recommended</div>
        <div className="discover-hero-title">{repo.owner} / {repo.name}</div>
        {repo.description && (
          <div className="discover-hero-desc">{repo.description}</div>
        )}
        <div className="discover-hero-meta">
          {repo.language && (
            <span className="discover-hero-meta-item">
              <span
                className="discover-hero-lang-dot"
                style={{ background: langColor }}
              />
              {repo.language}
            </span>
          )}
          {repo.stars != null && (
            <span className="discover-hero-meta-item">⭐ {formatCount(repo.stars)}</span>
          )}
          {repo.forks != null && (
            <span className="discover-hero-meta-item">🍴 {formatCount(repo.forks)}</span>
          )}
        </div>
        <div className="discover-hero-actions">
          <button
            className="discover-hero-btn-primary"
            onClick={handleViewRepo}
            aria-label="View repo"
          >
            View Repo ↗
          </button>
          <button
            className={`discover-hero-btn-ghost${starred ? ' starred' : ''}`}
            onClick={handleStar}
            disabled={starWorking}
            aria-label={starred ? 'Unstar' : 'Star'}
          >
            {starred ? '♥ Starred' : '♡ Star'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 1.5: Run tests — expect pass**

```bash
npm test -- --reporter=verbose src/components/DiscoverHero.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 1.6: Commit**

```bash
git add src/components/DiscoverHero.tsx src/components/DiscoverHero.css src/components/DiscoverHero.test.tsx
git commit -m "feat(discover): add DiscoverHero cinematic banner component"
```

---

## Task 2: `DiscoverRow` component

**Files:**
- Create: `src/components/DiscoverRow.tsx`
- Create: `src/components/DiscoverRow.css`
- Create: `src/components/DiscoverRow.test.tsx`

### Background knowledge

- Same `DitherBackground` import and mock pattern as Task 1.
- Each card navigates to `/repo/{owner}/{name}` via `onNavigate`.
- "More →" button calls `onMore()` — parent wires it to `setViewMode('recommended')`.
- If `repos` is empty the component returns `null` — no empty section header rendered.

---

- [ ] **Step 2.1: Write failing tests**

Create `src/components/DiscoverRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiscoverRow from './DiscoverRow'
import type { RepoRow } from '../types/repo'

vi.mock('./DitherBackground', () => ({
  default: () => <div data-testid="dither-bg" />,
}))

vi.mock('../hooks/useBayerDither', () => ({ useBayerDither: vi.fn() }))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function makeRepo(owner: string, name: string): RepoRow {
  return {
    id: `${owner}/${name}`, owner, name,
    description: null, language: 'TypeScript', stars: 1000, forks: 100,
    topics: '[]', avatar_url: null, starred_at: null, pushed_at: null,
    license: null, homepage: null, updated_at: null, saved_at: null,
    type: null, banner_svg: null, discovered_at: null, discover_query: null,
    watchers: null, size: null, open_issues: null, default_branch: null,
    og_image_url: null, banner_color: null,
    translated_description: null, translated_description_lang: null,
    translated_readme: null, translated_readme_lang: null, detected_language: null,
    verification_score: null, verification_tier: null, verification_signals: null,
    verification_checked_at: null, type_bucket: null, type_sub: null,
  }
}

const repos = [
  makeRepo('facebook', 'react'),
  makeRepo('microsoft', 'vscode'),
  makeRepo('golang', 'go'),
]

describe('DiscoverRow', () => {
  it('renders null when repos is empty', () => {
    const { container } = render(
      <DiscoverRow repos={[]} onNavigate={vi.fn()} onMore={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a card for each repo', () => {
    render(<DiscoverRow repos={repos} onNavigate={vi.fn()} onMore={vi.fn()} />)
    expect(screen.getByText('facebook / react')).toBeTruthy()
    expect(screen.getByText('microsoft / vscode')).toBeTruthy()
    expect(screen.getByText('golang / go')).toBeTruthy()
  })

  it('renders "Recommended for You" section heading', () => {
    render(<DiscoverRow repos={repos} onNavigate={vi.fn()} onMore={vi.fn()} />)
    expect(screen.getByText('Recommended for You')).toBeTruthy()
  })

  it('calls onMore when More button is clicked', async () => {
    const onMore = vi.fn()
    render(<DiscoverRow repos={repos} onNavigate={vi.fn()} onMore={onMore} />)
    await userEvent.click(screen.getByRole('button', { name: /more/i }))
    expect(onMore).toHaveBeenCalledOnce()
  })

  it('calls onNavigate with correct path when a card is clicked', async () => {
    const onNavigate = vi.fn()
    render(<DiscoverRow repos={repos} onNavigate={onNavigate} onMore={vi.fn()} />)
    await userEvent.click(screen.getByText('facebook / react'))
    expect(onNavigate).toHaveBeenCalledWith('/repo/facebook/react')
  })
})
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
npm test -- --reporter=verbose src/components/DiscoverRow.test.tsx
```

Expected: FAIL — `DiscoverRow` module not found.

- [ ] **Step 2.3: Create `src/components/DiscoverRow.css`**

```css
.discover-row {
  flex-shrink: 0;
  padding: 10px 20px 14px;
}

.discover-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.discover-row-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--t2);
}

.discover-row-more {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent-text);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 6px;
  padding: 3px 9px;
  cursor: pointer;
  transition: background 0.15s;
}

.discover-row-more:hover {
  background: var(--accent-hover);
}

.discover-row-cards {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.discover-row-cards::-webkit-scrollbar {
  display: none;
}

.discover-row-card {
  flex-shrink: 0;
  width: 170px;
  height: 104px;
  border-radius: 10px;
  background: var(--bg2);
  border: 1px solid var(--border);
  overflow: hidden;
  position: relative;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.12s;
}

.discover-row-card:hover {
  border-color: var(--accent-border);
  transform: translateY(-1px);
}

.discover-row-card-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 7px 10px;
  background: linear-gradient(to top, rgba(10, 10, 14, 0.97) 0%, transparent 100%);
  z-index: 1;
}

.discover-row-card-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--t1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.discover-row-card-meta {
  font-size: 9px;
  color: var(--t4);
  margin-top: 1px;
}
```

- [ ] **Step 2.4: Create `src/components/DiscoverRow.tsx`**

```tsx
import './DiscoverRow.css'
import DitherBackground from './DitherBackground'
import { formatCount } from './RepoCard'
import type { RepoRow } from '../types/repo'

interface DiscoverRowProps {
  repos: RepoRow[]
  onNavigate: (path: string) => void
  onMore: () => void
}

export default function DiscoverRow({ repos, onNavigate, onMore }: DiscoverRowProps) {
  if (repos.length === 0) return null

  return (
    <div className="discover-row">
      <div className="discover-row-header">
        <span className="discover-row-title">Recommended for You</span>
        <button className="discover-row-more" onClick={onMore} aria-label="More recommended repos">
          More →
        </button>
      </div>
      <div className="discover-row-cards">
        {repos.map(repo => (
          <div
            key={repo.id}
            className="discover-row-card"
            onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
          >
            <DitherBackground avatarUrl={repo.avatar_url} />
            <div className="discover-row-card-content">
              <div className="discover-row-card-name">{repo.owner} / {repo.name}</div>
              <div className="discover-row-card-meta">
                {repo.stars != null && `⭐ ${formatCount(repo.stars)}`}
                {repo.language && ` · ${repo.language}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2.5: Run tests — expect pass**

```bash
npm test -- --reporter=verbose src/components/DiscoverRow.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/DiscoverRow.tsx src/components/DiscoverRow.css src/components/DiscoverRow.test.tsx
git commit -m "feat(discover): add DiscoverRow horizontal recommended strip"
```

---

## Task 3: Wire into `Discover.tsx`

**Files:**
- Modify: `src/views/Discover.tsx`

### Background knowledge

- `recommendedCache` is already declared as `const recommendedCache = useRef<RepoRow[] | null>(null)` and `recommendedItemsCache` as `useRef<RecommendationItem[] | null>(null)`. Reuse them — if already populated (e.g. user previously switched to recommended view), derive hero/row immediately without a second API call.
- `window.api.github.getRecommended()` returns `{ items: RecommendationItem[] }` where `RecommendationItem = { repo: RepoRow, anchors: Anchor[] }` (see `src/types/recommendation.ts`).
- `heroRepo` and `rowRepos` are NEW state. Add them near the existing `recommendedCache` refs.
- Render location: **outside** `discover-content` (not inside the scrollable div). Place hero + row between the `discover-main::before` pseudo-element and `<GridHeader>` inside the non-landing branch. The hero and row are `flex-shrink: 0` sections; the grid scroll container begins at `discover-content`.
- `handleHeroStar`: a simple inline handler — the hero component manages its own optimistic state; the parent only needs to handle side effects if required (none needed here, so pass `undefined` for `onStar`).

---

- [ ] **Step 3.1: Add `heroRepo` and `rowRepos` state**

In `Discover.tsx`, after the existing `recommendedCache` refs (around line 67–68), add:

```tsx
const [heroRepo, setHeroRepo] = useState<RepoRow | null>(null)
const [rowRepos, setRowRepos] = useState<RepoRow[]>([])
```

- [ ] **Step 3.2: Add fetch-recommended-on-mount effect**

Add a `useEffect` that runs once on mount. Place it after the existing `useEffect(() => { popDiscoverSnapshot() }, [])` (around line 194):

```tsx
useEffect(() => {
  async function loadHeroData() {
    try {
      let items: import('../types/recommendation').RecommendationItem[]
      if (recommendedItemsCache.current) {
        items = recommendedItemsCache.current
      } else {
        const response = await window.api.github.getRecommended()
        items = response.items
        recommendedItemsCache.current = items
        recommendedCache.current = items.map(i => i.repo)
      }
      setHeroRepo(items[0]?.repo ?? null)
      setRowRepos(items.slice(1, 8).map(i => i.repo))
    } catch {
      // non-critical — hero/row simply won't render
    }
  }
  loadHeroData()
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3.3: Add imports**

At the top of `Discover.tsx`, add:

```tsx
import DiscoverHero from '../components/DiscoverHero'
import DiscoverRow from '../components/DiscoverRow'
```

- [ ] **Step 3.4: Render hero and row**

In the JSX, find the non-landing branch (inside `discover-main`, where `!showLanding`). The current structure is:

```tsx
<>
  <GridHeader ... />
  <div ref={scrollRef} className={`discover-content ...`}>
    ...
    <DiscoverGrid ... />
  </div>
</>
```

Add `DiscoverHero` and `DiscoverRow` immediately before `<GridHeader>`:

```tsx
<>
  {heroRepo && (
    <DiscoverHero repo={heroRepo} onNavigate={navigateToRepo} />
  )}
  {rowRepos.length > 0 && (
    <DiscoverRow
      repos={rowRepos}
      onNavigate={navigateToRepo}
      onMore={() => setViewMode('recommended')}
    />
  )}
  <GridHeader ... />
  <div ref={scrollRef} className={`discover-content ...`}>
    ...
  </div>
</>
```

- [ ] **Step 3.5: Run full test suite**

```bash
npm test
```

Expected: all tests PASS. If any pre-existing tests fail, investigate before continuing — do not proceed with failures.

- [ ] **Step 3.6: Commit**

```bash
git add src/views/Discover.tsx
git commit -m "feat(discover): wire cinematic hero and recommended row into Discover"
```

---

## Done

All three tasks complete. The Discover view now shows:
1. Cinematic dither-art hero (top recommended repo) when the landing is dismissed
2. Horizontal "Recommended for You" strip (repos 2–8) with a "More →" button linking to the full recommended view
3. Existing grid below, unchanged
