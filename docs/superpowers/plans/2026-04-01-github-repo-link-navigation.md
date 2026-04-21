# GitHub Repo Link In-App Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub repository links in README content navigate in-app to the repo detail page and show a hover card styled like the existing related-repo sidebar cards, instead of opening a browser.

**Architecture:** A new rehype plugin stamps `data-gh-owner`/`data-gh-name` on qualifying `<a>` elements (those pointing to `https://github.com/<owner>/<name>` exactly); the `a` component override in `ReadmeRenderer` handles the new branch with in-app navigation (`useNavigate`) and a hover popover backed by a new `githubRepoFetcher` utility that mirrors `linkPreviewFetcher`. The existing footnote system skips GitHub repo links entirely.

**Tech Stack:** React, React Router `useNavigate`, rehype HAST (`unist-util-visit`), Vitest, `window.api.github.getRepo` IPC

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/utils/githubRepoUrl.ts` | Pure URL parser — decides if a URL is a repo link |
| Create | `src/utils/githubRepoFetcher.ts` | Module-level cache + IPC bridge for repo metadata |
| Modify | `src/components/ReadmeRenderer.tsx` | Rehype plugin, `a` branch, popover component, state, prefetch |
| Modify | `src/styles/globals.css` | Styles for `rm-gh-repo-popover` and sub-elements |
| Create | `src/utils/githubRepoUrl.test.ts` | Unit tests for URL parser |
| Create | `src/utils/githubRepoFetcher.test.ts` | Unit tests for fetcher cache/dedup/fallback |
| Modify | `src/components/ReadmeRenderer.test.tsx` | Integration tests for the new link behaviour |

---

## Task 1: URL Parser utility

**Files:**
- Create: `src/utils/githubRepoUrl.ts`
- Create: `src/utils/githubRepoUrl.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/utils/githubRepoUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseGitHubRepoUrl } from './githubRepoUrl'

describe('parseGitHubRepoUrl', () => {
  // ── Positive cases ──────────────────────────────────────────────────
  it('parses a simple repo URL', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('accepts a trailing slash', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react/'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('lowercases owner and name', () => {
    expect(parseGitHubRepoUrl('https://github.com/Facebook/React'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('ignores query string', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react?tab=readme'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  it('ignores fragment', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react#readme'))
      .toEqual({ owner: 'facebook', name: 'react' })
  })

  // ── Negative cases ──────────────────────────────────────────────────
  it('returns null for deeper paths (issues)', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react/issues/123')).toBeNull()
  })

  it('returns null for deeper paths (tree)', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react/tree/main')).toBeNull()
  })

  it('returns null for a user profile (single segment)', () => {
    expect(parseGitHubRepoUrl('https://github.com/torvalds')).toBeNull()
  })

  it('returns null for github.com root', () => {
    expect(parseGitHubRepoUrl('https://github.com')).toBeNull()
  })

  it('returns null for non-GitHub domains', () => {
    expect(parseGitHubRepoUrl('https://example.com/owner/repo')).toBeNull()
  })

  it('returns null for GitHub subdomains (gist)', () => {
    expect(parseGitHubRepoUrl('https://gist.github.com/owner/abc')).toBeNull()
  })

  it('returns null for http:// scheme', () => {
    expect(parseGitHubRepoUrl('http://github.com/facebook/react')).toBeNull()
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

Run: `npm test -- --reporter=verbose src/utils/githubRepoUrl.test.ts`
Expected: All tests FAIL with "Cannot find module './githubRepoUrl'"

- [ ] **Step 1.3: Implement the parser**

Create `src/utils/githubRepoUrl.ts`:

```ts
/**
 * Parses a URL and returns { owner, name } if it points to a GitHub repository
 * root page (exactly two non-empty path segments), or null otherwise.
 *
 * Rules:
 * - Scheme must be https (http is intentionally excluded — GitHub always uses HTTPS)
 * - Hostname must be exactly 'github.com' (subdomains like gist.github.com return null)
 * - Exactly two non-empty path segments (owner + repo name)
 * - Trailing slash, query string, and fragment are ignored
 * - Returned owner and name are lowercased for consistent cache keys
 */
export function parseGitHubRepoUrl(url: string): { owner: string; name: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname !== 'github.com') return null

  // Split pathname and filter empty segments (handles leading '/' and trailing '/')
  const segments = parsed.pathname.split('/').filter(Boolean)

  // Exactly two segments: owner + repo name
  if (segments.length !== 2) return null

  const [owner, name] = segments
  if (!owner || !name) return null

  return { owner: owner.toLowerCase(), name: name.toLowerCase() }
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

Run: `npm test -- --reporter=verbose src/utils/githubRepoUrl.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add src/utils/githubRepoUrl.ts src/utils/githubRepoUrl.test.ts
git commit -m "feat: add parseGitHubRepoUrl utility"
```

---

## Task 2: Repo metadata fetcher

**Files:**
- Create: `src/utils/githubRepoFetcher.ts`
- Create: `src/utils/githubRepoFetcher.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `src/utils/githubRepoFetcher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRepoPreview, getCachedRepoPreview } from './githubRepoFetcher'

// Reset module-level cache between tests by re-importing fresh each time.
// Vitest supports this with vi.resetModules() + dynamic re-import.
beforeEach(async () => {
  vi.resetModules()
  vi.restoreAllMocks()
})

function mockApi(impl: () => Promise<unknown>) {
  Object.defineProperty(window, 'api', {
    writable: true,
    value: { github: { getRepo: vi.fn(impl) } },
  })
}

// Re-import after reset so we always get a fresh module cache
async function freshImport() {
  const mod = await import('./githubRepoFetcher')
  return mod
}

describe('fetchRepoPreview', () => {
  it('maps IPC RepoRow fields to GitHubRepoPreview shape', async () => {
    mockApi(() => Promise.resolve({
      id: '1', owner: 'facebook', name: 'react',
      description: 'A JS library', stars: 200000, avatar_url: 'https://example.com/avatar.png',
    }))
    const { fetchRepoPreview: fetch } = await freshImport()
    const result = await fetch('facebook', 'react')
    expect(result).toEqual({
      owner: 'facebook',
      name: 'react',
      description: 'A JS library',
      stars: 200000,
      avatarUrl: 'https://example.com/avatar.png',
    })
  })

  it('returns cached result on second call without extra IPC calls', async () => {
    const getRepo = vi.fn().mockResolvedValue({
      id: '1', owner: 'facebook', name: 'react',
      description: 'A JS library', stars: 100, avatar_url: '',
    })
    Object.defineProperty(window, 'api', { writable: true, value: { github: { getRepo } } })
    const { fetchRepoPreview: fetch } = await freshImport()
    await fetch('facebook', 'react')
    await fetch('facebook', 'react')
    expect(getRepo).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent requests — only one IPC call', async () => {
    const getRepo = vi.fn().mockResolvedValue({
      id: '1', owner: 'vuejs', name: 'vue',
      description: '', stars: 0, avatar_url: '',
    })
    Object.defineProperty(window, 'api', { writable: true, value: { github: { getRepo } } })
    const { fetchRepoPreview: fetch } = await freshImport()
    await Promise.all([fetch('vuejs', 'vue'), fetch('vuejs', 'vue')])
    expect(getRepo).toHaveBeenCalledTimes(1)
  })

  it('returns placeholder when IPC throws', async () => {
    mockApi(() => Promise.reject(new Error('IPC failure')))
    const { fetchRepoPreview: fetch } = await freshImport()
    const result = await fetch('bad', 'repo')
    expect(result).toEqual({ owner: 'bad', name: 'repo', description: '', stars: 0, avatarUrl: '' })
  })

  it('returns placeholder when IPC resolves with null', async () => {
    mockApi(() => Promise.resolve(null))
    const { fetchRepoPreview: fetch } = await freshImport()
    const result = await fetch('nobody', 'nothing')
    expect(result).toEqual({ owner: 'nobody', name: 'nothing', description: '', stars: 0, avatarUrl: '' })
  })

  it('never throws — always resolves', async () => {
    mockApi(() => Promise.reject(new Error('boom')))
    const { fetchRepoPreview: fetch } = await freshImport()
    await expect(fetch('x', 'y')).resolves.toBeDefined()
  })
})

describe('getCachedRepoPreview', () => {
  it('returns undefined before fetch', async () => {
    mockApi(() => Promise.resolve(null))
    const { getCachedRepoPreview: getCache } = await freshImport()
    expect(getCache('unseen', 'repo')).toBeUndefined()
  })

  it('returns the cached value after fetch', async () => {
    mockApi(() => Promise.resolve({
      id: '1', owner: 'test', name: 'pkg', description: 'hi', stars: 5, avatar_url: '',
    }))
    const { fetchRepoPreview: fetch, getCachedRepoPreview: getCache } = await freshImport()
    await fetch('test', 'pkg')
    expect(getCache('test', 'pkg')).toBeDefined()
    expect(getCache('test', 'pkg')?.description).toBe('hi')
  })
})
```

- [ ] **Step 2.2: Run tests to confirm they fail**

Run: `npm test -- --reporter=verbose src/utils/githubRepoFetcher.test.ts`
Expected: All tests FAIL with "Cannot find module './githubRepoFetcher'"

- [ ] **Step 2.3: Implement the fetcher**

Create `src/utils/githubRepoFetcher.ts`:

```ts
// ── GitHub repo preview cache + IPC bridge ────────────────────────────────────
// Module-level singleton: survives React re-renders, shared across all
// ReadmeRenderer instances in the same renderer process.
// Mirrors the structure of linkPreviewFetcher.ts.

export interface GitHubRepoPreview {
  owner:       string
  name:        string
  description: string
  stars:       number
  avatarUrl:   string
}

const cache    = new Map<string, GitHubRepoPreview>()
const inflight = new Map<string, Promise<GitHubRepoPreview>>()

function cacheKey(owner: string, name: string): string {
  return `${owner.toLowerCase()}/${name.toLowerCase()}`
}

function placeholder(owner: string, name: string): GitHubRepoPreview {
  return { owner, name, description: '', stars: 0, avatarUrl: '' }
}

/** Synchronous cache read — returns undefined if not yet fetched. */
export function getCachedRepoPreview(owner: string, name: string): GitHubRepoPreview | undefined {
  return cache.get(cacheKey(owner, name))
}

/**
 * Fetch repo metadata for `owner/name`.
 * - Returns cached value immediately if already fetched.
 * - Deduplicates concurrent requests (one IPC call max per repo).
 * - Never throws — returns a placeholder on any error or null result.
 */
export async function fetchRepoPreview(owner: string, name: string): Promise<GitHubRepoPreview> {
  const key = cacheKey(owner, name)

  const cached = cache.get(key)
  if (cached) return cached

  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    try {
      const row = await window.api.github.getRepo(owner, name)
      const result: GitHubRepoPreview = row
        ? {
            owner:       owner.toLowerCase(),
            name:        name.toLowerCase(),
            description: row.description ?? '',
            stars:       row.stars        ?? 0,
            avatarUrl:   row.avatar_url   ?? '',
          }
        : placeholder(owner, name)
      cache.set(key, result)
      return result
    } catch {
      const fallback = placeholder(owner, name)
      cache.set(key, fallback)
      return fallback
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

Run: `npm test -- --reporter=verbose src/utils/githubRepoFetcher.test.ts`
Expected: All tests PASS

- [ ] **Step 2.5: Commit**

```bash
git add src/utils/githubRepoFetcher.ts src/utils/githubRepoFetcher.test.ts
git commit -m "feat: add githubRepoFetcher utility with cache and dedup"
```

---

## Task 3: Rehype plugin + footnote guard

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx` (lines 1–15 imports, ~213–237 plugin area, ~250–285 footnote plugin, ~1122 rehypePlugins list)

- [ ] **Step 3.1: Write failing tests for the new rehype behaviour**

Add this describe block to `src/components/ReadmeRenderer.test.tsx`.

First, update the `beforeEach` mock to include the GitHub API (add `github: { getRepo: vi.fn().mockResolvedValue(null) }` to the `window.api` value):

```ts
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    writable: true,
    value: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      linkPreview: {
        fetch: vi.fn().mockResolvedValue({
          title: 'Test Page', description: 'A description', imageUrl: '',
          faviconUrl: '', domain: 'example.com',
        }),
      },
      github: {
        getRepo: vi.fn().mockResolvedValue(null),
      },
    },
  })
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})
```

Then add the test suite near the bottom of the file (before the closing of the last describe):

```ts
describe('GitHub repo link behaviour', () => {
  it('renders with data-gh-owner, data-gh-name, and rm-gh-repo-link class', () => {
    const { container } = renderMd('[react](https://github.com/facebook/react)')
    const link = container.querySelector('a[data-gh-owner]') as HTMLAnchorElement | null
    expect(link).not.toBeNull()
    expect(link?.getAttribute('data-gh-owner')).toBe('facebook')
    expect(link?.getAttribute('data-gh-name')).toBe('react')
    expect(link?.className).toContain('rm-gh-repo-link')
  })

  it('is NOT converted to a footnote — no .rm-references section', () => {
    const { container } = renderMd('[react](https://github.com/facebook/react)')
    expect(container.querySelector('.rm-references')).toBeNull()
  })

  it('does NOT call openExternal on click', () => {
    const { container } = renderMd('[react](https://github.com/facebook/react)')
    const link = container.querySelector('a[data-gh-owner]') as HTMLAnchorElement
    act(() => { link.click() })
    expect(window.api.openExternal).not.toHaveBeenCalled()
  })

  it('non-repo GitHub link is still converted to footnote', () => {
    const { container } = renderMd('[issue](https://github.com/facebook/react/issues/1)')
    expect(container.querySelector('.rm-references')).not.toBeNull()
  })
})
```

- [ ] **Step 3.2: Run to confirm tests fail**

Run: `npm test -- --reporter=verbose src/components/ReadmeRenderer.test.tsx`
Expected: The 4 new GitHub tests FAIL (the first 3 because the rehype plugin does not exist yet; the 4th should PASS since footnotes already work)

- [ ] **Step 3.3: Add import and rehype plugin**

At the top of `ReadmeRenderer.tsx`, add the import after the existing utility imports (around line 12):

```ts
import { parseGitHubRepoUrl } from '../utils/githubRepoUrl'
import { fetchRepoPreview, getCachedRepoPreview } from '../utils/githubRepoFetcher'
```

Then add the plugin function after `rehypeYouTubeLinks` (around line 237):

```ts
// ── Rehype plugin: tag GitHub repo links with owner/name data attributes ──────
// Runs AFTER rehype-sanitize so data-* properties are not stripped.
// Stamps dataGhOwner and dataGhName on <a> elements that point to a GitHub
// repository root page (exactly two path segments). These links are handled
// separately in the `a` component override and excluded from footnote conversion.
function rehypeGitHubRepoLinks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return
      // Skip YouTube links — already handled
      if (node.properties?.dataYtId) return SKIP
      const href = String(node.properties?.href ?? '')
      const parsed = parseGitHubRepoUrl(href)
      if (!parsed) return
      node.properties = node.properties ?? {}
      node.properties.dataGhOwner = parsed.owner
      node.properties.dataGhName  = parsed.name
      return SKIP
    })
  }
}
```

- [ ] **Step 3.4: Add guard in `rehypeFootnoteLinks`**

In the `rehypeFootnoteLinks` function (around line 268), add a guard right after the existing `if (node.properties?.dataYtId) return SKIP` line:

```ts
// Skip GitHub repo links — they navigate in-app and must not become footnotes
if (node.properties?.dataGhOwner) return SKIP
```

- [ ] **Step 3.5: Add plugin to the rehypePlugins list**

In the `ReactMarkdown` component render (around line 1122), update `rehypePlugins` to include the new plugin after `rehypeYouTubeLinks` and before `rehypeFootnoteLinks`:

```ts
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks, rehypeGitHubRepoLinks, rehypeFootnoteLinks, rehypeImageOnlyLinks]}
```

- [ ] **Step 3.6: Run tests to confirm they pass**

Run: `npm test -- --reporter=verbose src/components/ReadmeRenderer.test.tsx`
Expected: All existing tests still pass; all 4 new GitHub tests now PASS

- [ ] **Step 3.7: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: add rehypeGitHubRepoLinks plugin and footnote guard"
```

---

## Task 4: `a` component branch — click navigation and hover popover

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx` (component body + mdComponents + JSX return)

- [ ] **Step 4.1: Write failing tests for click navigation and hover popover**

Add to the `'GitHub repo link behaviour'` describe block in `ReadmeRenderer.test.tsx`:

```ts
import { MemoryRouter } from 'react-router-dom'

// Helper that wraps ReadmeRenderer in MemoryRouter (needed for useNavigate)
function renderMdInRouter(content: string) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ReadmeRenderer content={content} repoOwner="owner" repoName="repo" branch="main" />
    </MemoryRouter>
  )
}
```

Note: `ReadmeRenderer` will need `useNavigate` which requires a Router context. Update all existing `renderMd` calls to also use `MemoryRouter`, OR confirm the existing tests still pass by running them first. The simplest approach: add a separate helper `renderMdInRouter` used only for GitHub-specific tests.

Add these tests to the `'GitHub repo link behaviour'` describe:

```ts
it('clicking a GitHub repo link does not call openExternal', () => {
  const { container } = renderMdInRouter('[react](https://github.com/facebook/react)')
  const link = container.querySelector('a[data-gh-owner]') as HTMLAnchorElement
  act(() => { link.click() })
  expect(window.api.openExternal).not.toHaveBeenCalled()
})

describe('hover popover', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows popover after 300ms hover with repo name', async () => {
    ;(window.api.github.getRepo as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '1', owner: 'facebook', name: 'react',
      description: 'A JS library', stars: 200000, avatar_url: '',
      language: null, topics: '[]', forks: null, license: null,
      readme: null, pushed_at: null, homepage: null,
    })
    const { container } = renderMdInRouter('[react](https://github.com/facebook/react)')
    const link = container.querySelector('a[data-gh-owner]')!
    fireEvent.mouseEnter(link)
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(container.querySelector('.rm-gh-repo-popover')).not.toBeNull()
    expect(container.querySelector('.rm-gh-repo-popover-name')?.textContent).toBe('facebook/react')
  })

  it('hides popover 80ms after mouse leaves', async () => {
    ;(window.api.github.getRepo as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '1', owner: 'facebook', name: 'react',
      description: '', stars: 0, avatar_url: '',
      language: null, topics: '[]', forks: null, license: null,
      readme: null, pushed_at: null, homepage: null,
    })
    const { container } = renderMdInRouter('[react](https://github.com/facebook/react)')
    const link = container.querySelector('a[data-gh-owner]')!
    fireEvent.mouseEnter(link)
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    fireEvent.mouseLeave(link)
    await vi.advanceTimersByTimeAsync(80)
    expect(container.querySelector('.rm-gh-repo-popover')).toBeNull()
  })
})
```

- [ ] **Step 4.2: Run to confirm new tests fail**

Run: `npm test -- --reporter=verbose src/components/ReadmeRenderer.test.tsx`
Expected: New hover/click tests FAIL (useNavigate throws outside Router or branch not implemented)

- [ ] **Step 4.3: Add `useNavigate` and new state to the component body**

In `ReadmeRenderer`, add to the imports at the top:

```ts
import { useNavigate } from 'react-router-dom'
import { formatStars } from '../types/repo'
```

In the `ReadmeRenderer` function body, immediately after the existing `useState` declarations (around line 699), add:

```ts
const navigate = useNavigate()

// GitHub repo hover popover state
const [hoverGhRepo,     setHoverGhRepo]     = useState<string | null>(null)  // "owner/name"
const [hoverGhRepoRect, setHoverGhRepoRect] = useState<DOMRect | null>(null)
const ghHoverTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
const currentGhHoverRef = useRef<string | null>(null)
```

After the existing link-preview cleanup `useEffect` (around line 761), add the GitHub hover cleanup:

```ts
// Clean up GitHub hover timer on unmount
useEffect(() => {
  return () => { if (ghHoverTimerRef.current) clearTimeout(ghHoverTimerRef.current) }
}, [])
```

- [ ] **Step 4.4: Add the `a` component branch for GitHub repo links**

In `mdComponents.a` (around line 888), insert the new branch **after the YouTube `if (ytId)` block and before the `rm-reference-url` block**:

```tsx
// ── GitHub repository link — navigate in-app ─────────────────────
const ghOwner = node?.properties?.dataGhOwner as string | undefined
const ghName  = node?.properties?.dataGhName  as string | undefined

if (ghOwner && ghName) {
  return (
    <a
      className="rm-link rm-gh-repo-link"
      href={href}
      data-gh-owner={ghOwner}
      data-gh-name={ghName}
      onClick={(e) => {
        e.preventDefault()
        navigate(`/repo/${ghOwner}/${ghName}`)
      }}
      onMouseEnter={(e) => {
        setHoverGhRepo(null)
        currentGhHoverRef.current = `${ghOwner}/${ghName}`
        if (ghHoverTimerRef.current) clearTimeout(ghHoverTimerRef.current)
        const el = e.currentTarget as HTMLElement   // capture before async gap
        ghHoverTimerRef.current = setTimeout(async () => {
          const rect = el.getBoundingClientRect()
          await fetchRepoPreview(ghOwner, ghName)
          if (currentGhHoverRef.current === `${ghOwner}/${ghName}`) {
            setHoverGhRepo(`${ghOwner}/${ghName}`)
            setHoverGhRepoRect(rect)
          }
        }, 300)
      }}
      onMouseLeave={() => {
        currentGhHoverRef.current = null
        if (ghHoverTimerRef.current) clearTimeout(ghHoverTimerRef.current)
        ghHoverTimerRef.current = setTimeout(() => setHoverGhRepo(null), 80)
      }}
    >
      {children}
    </a>
  )
}
```

- [ ] **Step 4.5: Add `GitHubRepoPopover` component**

Add this component after `LinkPreviewPopover` and before `TheatreEmbed` (around line 634):

```tsx
// ── GitHub repo hover popover ─────────────────────────────────────────────────

interface GitHubRepoPopoverProps {
  ownerName:   string
  rect:        DOMRect | null
  data:        import('../utils/githubRepoFetcher').GitHubRepoPreview
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function GitHubRepoPopover({ ownerName, rect, data, onMouseEnter, onMouseLeave }: GitHubRepoPopoverProps) {
  return (
    <div
      className="rm-yt-popover rm-gh-repo-popover"
      style={{ top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="rm-gh-repo-popover-header">
        {data.avatarUrl && (
          <img
            src={data.avatarUrl}
            alt=""
            className="rm-gh-repo-popover-avatar"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <span className="rm-gh-repo-popover-name">{ownerName}</span>
      </div>
      {data.description && (
        <div className="rm-gh-repo-popover-desc">{data.description}</div>
      )}
      {data.stars > 0 && (
        <div className="rm-gh-repo-popover-stars">★ {formatStars(data.stars)}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4.6: Render the popover in the JSX return**

In the component return, after the `{/* Link preview popover */}` block and before the `<div className="rm-status-bar" .../>` line, add:

```tsx
{/* GitHub repo hover popover */}
{hoverGhRepo && (() => {
  const [ghO, ghN] = hoverGhRepo.split('/')
  const data = getCachedRepoPreview(ghO, ghN)
  if (!data) return null
  return (
    <GitHubRepoPopover
      ownerName={hoverGhRepo}
      rect={hoverGhRepoRect}
      data={data}
      onMouseEnter={() => {
        if (ghHoverTimerRef.current) clearTimeout(ghHoverTimerRef.current)
      }}
      onMouseLeave={() => {
        ghHoverTimerRef.current = setTimeout(() => setHoverGhRepo(null), 80)
      }}
    />
  )
})()}
```

- [ ] **Step 4.7: Also update `mdComponents` dependency array**

The `mdComponents` useMemo currently ends with:
```ts
}), [fnHistory, activeVideo, hoverVideo])
```
`navigate`, `setHoverGhRepo`, and the other new state setters are stable references and do **not** need to be added. No change needed here.

- [ ] **Step 4.8: Wrap existing tests in MemoryRouter**

The existing `renderMd` helper and `defaultProps` do not use a Router. After adding `useNavigate`, every `renderMd` call will fail without a Router context. Update the helper at the top of `ReadmeRenderer.test.tsx`:

```ts
import { MemoryRouter } from 'react-router-dom'

function renderMd(content: string) {
  return render(
    <MemoryRouter>
      <ReadmeRenderer {...defaultProps} content={content} />
    </MemoryRouter>
  )
}
```

Also update the inline `render(...)` calls in the `'link preview popover'` describe block (they use `<ReadmeRenderer ... />` directly without `renderMd`) — wrap each one in `<MemoryRouter>`:

```tsx
render(
  <MemoryRouter>
    <ReadmeRenderer content={'[visit](https://example.com)'} repoOwner="o" repoName="r" branch="main" />
  </MemoryRouter>
)
```

- [ ] **Step 4.9: Run all tests**

Run: `npm test -- --reporter=verbose src/components/ReadmeRenderer.test.tsx`
Expected: All tests PASS (both old and new GitHub tests)

- [ ] **Step 4.10: Commit**

```bash
git add src/components/ReadmeRenderer.tsx src/components/ReadmeRenderer.test.tsx
git commit -m "feat: add GitHub repo link in-app navigation and hover popover"
```

---

## Task 5: Prefetch extension

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx` (the `IntersectionObserver` useEffect, around line 834)

- [ ] **Step 5.1: Write a failing test for the IntersectionObserver exclusion**

Add to the `'GitHub repo link behaviour'` describe block:

```ts
it('does not call linkPreview.fetch for a data-gh-owner link', async () => {
  // IntersectionObserver is not available in JSDOM — this test just verifies
  // that the link-preview selector excludes [data-gh-owner] links.
  // We check the rendered DOM: the GitHub repo link should have data-gh-owner
  // and NOT have been processed by the link-preview prefetcher.
  const { container } = renderMdInRouter('[react](https://github.com/facebook/react)')
  // Advance timers to let any prefetch fire
  await act(async () => { await Promise.resolve() })
  // linkPreview.fetch should never be called for this URL
  expect(window.api.linkPreview.fetch).not.toHaveBeenCalledWith(
    expect.stringContaining('github.com/facebook/react')
  )
})
```

- [ ] **Step 5.2: Run to confirm test passes already (or fails if selector is wrong)**

Run: `npm test -- --reporter=verbose src/components/ReadmeRenderer.test.tsx`

If the test passes already (JSDOM has no IntersectionObserver by default, so the observer block short-circuits early), that is fine — proceed.

- [ ] **Step 5.3: Update the IntersectionObserver selector and add GitHub prefetch**

In the `useEffect` that creates the `IntersectionObserver` (around line 834–850), make two changes:

1. Update the link-preview selector to exclude `[data-gh-owner]`:
```ts
const links = container.querySelectorAll<HTMLAnchorElement>(
  'a[href^="http"]:not([data-yt-id]):not([data-img-only]):not([data-gh-owner])'
)
```

2. After `links.forEach(el => observer.observe(el))`, add the GitHub repo prefetch:
```ts
// Prefetch GitHub repo metadata for all repo links visible in this render
const ghLinks = container.querySelectorAll<HTMLAnchorElement>('a[data-gh-owner]')
ghLinks.forEach(el => {
  const owner = el.getAttribute('data-gh-owner')
  const name  = el.getAttribute('data-gh-name')
  if (owner && name && !getCachedRepoPreview(owner, name)) {
    fetchRepoPreview(owner, name)   // fire-and-forget cache warming
  }
})
```

- [ ] **Step 5.4: Run all tests**

Run: `npm test -- --reporter=verbose src/components/ReadmeRenderer.test.tsx`
Expected: All tests PASS

- [ ] **Step 5.5: Commit**

```bash
git add src/components/ReadmeRenderer.tsx
git commit -m "feat: exclude GitHub repo links from link-preview observer, add repo prefetch"
```

---

## Task 6: CSS for the GitHub repo popover

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 6.1: Add the new styles**

In `globals.css`, after the `/* ── Link preview popover ─────── */` block (ending around line 2072), add:

```css
/* ── GitHub repo hover popover ───────────────────────────────────────────── */
/* Layout overrides — base positioning/shadow/animation from .rm-yt-popover  */
.rm-gh-repo-popover {
  width: 280px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rm-gh-repo-popover-header {
  display: flex;
  align-items: center;
  gap: 7px;
}

.rm-gh-repo-popover-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.rm-gh-repo-popover-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--t1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rm-gh-repo-popover-desc {
  font-size: 11px;
  color: var(--t2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.rm-gh-repo-popover-stars {
  font-size: 11px;
  color: var(--t3);
}
```

- [ ] **Step 6.2: Run the full test suite to make sure nothing regressed**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6.3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add CSS for GitHub repo hover popover"
```

---

## Task 7: Final verification

- [ ] **Step 7.1: Run the complete test suite**

Run: `npm test`
Expected: All tests pass, zero failures

- [ ] **Step 7.2: Verify the new test files have coverage**

Run: `npm test -- --reporter=verbose src/utils/githubRepoUrl.test.ts src/utils/githubRepoFetcher.test.ts`
Expected: All tests pass

- [ ] **Step 7.3: Final commit (if any cleanup needed)**

```bash
git add -p   # review any remaining unstaged changes
git commit -m "feat: complete GitHub repo link in-app navigation"
```
