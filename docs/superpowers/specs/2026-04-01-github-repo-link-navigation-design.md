# GitHub Repo Link In-App Navigation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** GitHub repository links in README content navigate in-app to the repo detail page instead of opening in the browser, and show a repo card popover on hover.

**Architecture:** Detect GitHub repo URLs at the rehype plugin level (stamp data attributes), handle them as a special case in the `a` component override alongside the existing YouTube and reference-URL branches, cache repo metadata via a new fetcher utility.

**Tech Stack:** React, rehype (HAST), React Router `useNavigate`, existing `window.api.github.getRepo` IPC, Vitest

---

## Section 1: URL Parsing — `src/utils/githubRepoUrl.ts`

A pure utility with a single exported function:

```ts
parseGitHubRepoUrl(url: string): { owner: string; name: string } | null
```

**Matching rules:**
- Matches `https://github.com/<owner>/<name>` — exactly two non-empty path segments
- Only matches `hostname === 'github.com'` exactly — subdomains such as `gist.github.com` return null
- Only matches the `https:` scheme — `http://github.com/...` returns null (GitHub always serves HTTPS; this is an intentional decision, not an oversight)
- Accepts optional trailing slash, query string, and fragment (all stripped/ignored)
- The returned `owner` and `name` values are lowercased so the cache key is always consistent
- Returns `null` for:
  - Non-GitHub URLs or non-HTTPS scheme
  - GitHub subdomains (e.g. `gist.github.com`)
  - `github.com` with zero or one path segment (e.g. user profiles like `github.com/torvalds`)
  - Any path with a third or deeper segment (e.g. `/issues`, `/pull`, `/tree`, `/blob`, `/wiki`, `/actions`, `/releases`, `/discussions`, `/commits`, `/compare`, `/settings`, `/security`, `/pulse`, `/network`, `/projects`, `/packages`, `/stargazers`, `/forks`)

**Why a separate file:** Pure function with no React dependencies makes it independently unit-testable and reusable in other parts of the app.

---

## Section 2: Rehype Integration — `rehypeGitHubRepoLinks` plugin in `ReadmeRenderer.tsx`

A new rehype plugin (following the existing `rehypeYouTubeLinks` pattern) runs **after** `rehypeSanitize` so stamped `data-*` properties survive:

```
rehypePlugins order: [rehypeRaw, rehypeSanitize, rehypeRemoveTocSection,
  rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks,
  rehypeGitHubRepoLinks,   ← NEW (after YouTube, before footnote)
  rehypeFootnoteLinks, rehypeImageOnlyLinks]
```

**Plugin behaviour:**
- Visits every `<a>` element
- Skips links that already have `dataYtId` (YouTube links)
- Calls `parseGitHubRepoUrl(href)` — if non-null, stamps `dataGhOwner` and `dataGhName` on `node.properties` (already lowercased by the parser) and returns `SKIP`

**In `rehypeFootnoteLinks`:** Add a guard after the YouTube check:
```ts
if (node.properties?.dataGhOwner) return SKIP
```
This ensures GitHub repo links are excluded from footnote conversion and do not appear in the References section.

---

## Section 3: Repo Metadata Cache — `src/utils/githubRepoFetcher.ts`

Mirrors the structure of `linkPreviewFetcher.ts` — module-level singleton with cache + in-flight dedup:

```ts
export interface GitHubRepoPreview {
  owner:       string
  name:        string
  description: string
  stars:       number
  avatarUrl:   string
}

export function getCachedRepoPreview(owner: string, name: string): GitHubRepoPreview | undefined
export async function fetchRepoPreview(owner: string, name: string): Promise<GitHubRepoPreview>
```

**Key design decisions:**
- Cache key: `${owner.toLowerCase()}/${name.toLowerCase()}` for consistency with the parser's lowercased output
- Calls `window.api.github.getRepo(owner, name)` — the IPC handler may return a full `RepoRow` or `null` (mocked as null in tests); treat both `null` result AND a thrown error the same: fall back to placeholder
- Maps `RepoRow` fields to the slim `GitHubRepoPreview` shape: `{ owner, name, description: row.description ?? '', stars: row.stars ?? 0, avatarUrl: row.avatar_url ?? '' }`
- Never throws — returns `{ owner, name, description: '', stars: 0, avatarUrl: '' }` on any error or null result
- In-flight dedup: concurrent requests for the same key share one IPC call

---

## Section 4: `a` Component Branch — `ReadmeRenderer.tsx`

### `useNavigate` hook

Add `const navigate = useNavigate()` at the top of the `ReadmeRenderer` component body, alongside the existing `useState` declarations. Because `navigate` is a stable reference from React Router (guaranteed not to change identity between renders), it does **not** need to be added to the `useMemo` dependency array for `mdComponents` — just as `setHoverLink` and other stable setters are omitted from that array.

### New state

```ts
const [hoverGhRepo,     setHoverGhRepo]     = useState<string | null>(null)  // "owner/name"
const [hoverGhRepoRect, setHoverGhRepoRect] = useState<DOMRect | null>(null)
const ghHoverTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
const currentGhHoverRef = useRef<string | null>(null)
```

### Unmount cleanup

Add a dedicated `useEffect` (do not modify the existing `linkHoverTimerRef` cleanup):
```ts
useEffect(() => {
  return () => { if (ghHoverTimerRef.current) clearTimeout(ghHoverTimerRef.current) }
}, [])
```

### `mdComponents.a` branch

Inserted after the YouTube branch and before the `rm-reference-url` branch:

```tsx
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

Note: `el` is captured synchronously from `e.currentTarget` before the `setTimeout` because React sets `currentTarget` to `null` after the event handler returns — accessing it inside the timeout would be a null-dereference. This matches the pattern already used in the YouTube and link-preview `onMouseEnter` handlers in this file.

---

## Section 5: `GitHubRepoPopover` Component — `ReadmeRenderer.tsx`

A new component rendered alongside `LinkPreviewPopover` and the YouTube popover:

```tsx
function GitHubRepoPopover({ ownerName, rect, data, onMouseEnter, onMouseLeave })
```

**Visual structure** (mirrors the existing sidebar related-repo cards):
```
┌──────────────────────────────────────┐
│  [avatar 20px]  owner/name           │
│  Description text (2 lines max)      │
│  ★ 12.4k                             │
└──────────────────────────────────────┘
```

- Avatar: `<img src={data.avatarUrl}>` — class `rm-gh-repo-popover-avatar`; hide with `style.display='none'` on `onError`
- Repo name: `owner/name` — class `rm-gh-repo-popover-name`
- Description: only rendered when non-empty — class `rm-gh-repo-popover-desc`, `-webkit-line-clamp: 2`
- Stars: only rendered when `data.stars > 0` — formatted with existing `formatStars` helper — class `rm-gh-repo-popover-stars`
- Positioning: same `style={{ top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0 }}` as `LinkPreviewPopover`
- Root element classes: **`rm-yt-popover rm-gh-repo-popover`** — the element carries BOTH classes so it inherits all base positioning, shadow, border-radius, z-index, and animation from `rm-yt-popover`, with `rm-gh-repo-popover` providing layout overrides
- Mouse enter/leave: same cancel/restart dismiss timer pattern (80ms), matching `LinkPreviewPopover`

**Rendered in the component return JSX** (alongside the YouTube and link-preview popovers):
```tsx
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

---

## Section 6: Prefetching

The existing `IntersectionObserver` effect is extended to also warm the GitHub repo preview cache. Two changes:

1. **Exclude GitHub repo links from the link-preview observer** (no double-fetching):
   ```ts
   // Updated selector — add :not([data-gh-owner])
   'a[href^="http"]:not([data-yt-id]):not([data-img-only]):not([data-gh-owner])'
   ```

2. **Observe GitHub repo links separately** for repo metadata prefetch:
   ```ts
   const ghLinks = container.querySelectorAll<HTMLAnchorElement>('a[data-gh-owner]')
   ghLinks.forEach(el => {
     const owner = el.getAttribute('data-gh-owner')
     const name  = el.getAttribute('data-gh-name')
     if (owner && name && !getCachedRepoPreview(owner, name)) {
       fetchRepoPreview(owner, name)   // fire-and-forget cache warming
     }
   })
   ```
   These are queried directly (not via `observer.observe`) since we only need one prefetch per link, not repeated observation.

---

## Section 7: CSS — `globals.css`

New styles for the GitHub repo popover. The component root carries both `rm-yt-popover` (base positioning/shadow/animation) and `rm-gh-repo-popover` (layout overrides):

```css
/* Layout overrides for the GitHub repo popover — base styles come from rm-yt-popover */
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

---

## Section 8: Testing

### `src/utils/githubRepoUrl.test.ts`

Positive cases:
- `'https://github.com/owner/repo'` → `{ owner: 'owner', name: 'repo' }`
- `'https://github.com/owner/repo/'` → `{ owner: 'owner', name: 'repo' }` (trailing slash)
- `'https://github.com/Owner/Repo'` → `{ owner: 'owner', name: 'repo' }` (lowercased)
- `'https://github.com/owner/repo?tab=readme'` → `{ owner: 'owner', name: 'repo' }` (query string ignored)
- `'https://github.com/owner/repo#readme'` → `{ owner: 'owner', name: 'repo' }` (fragment ignored)

Negative cases:
- `'https://github.com/owner/repo/issues/123'` → `null` (deeper path)
- `'https://github.com/owner/repo/tree/main'` → `null` (deeper path)
- `'https://github.com/owner'` → `null` (profile — single segment)
- `'https://github.com'` → `null` (no segments)
- `'https://example.com/owner/repo'` → `null` (wrong domain)
- `'https://gist.github.com/owner/abc'` → `null` (subdomain)
- `'http://github.com/owner/repo'` → `null` (http scheme — intentionally excluded)

### `src/utils/githubRepoFetcher.test.ts`

Mock setup: `window.api = { github: { getRepo: vi.fn() } }`

- Returns cached result on second call without calling IPC again (call count = 1)
- Deduplicates concurrent requests — two simultaneous `fetchRepoPreview` calls result in one IPC call
- Returns placeholder `{ description: '', stars: 0, avatarUrl: '' }` when IPC throws
- Returns placeholder when IPC resolves with `null`
- Never throws (always resolves)

### `src/components/ReadmeRenderer.test.tsx` (additions)

Mock setup additions: `window.api.github = { getRepo: vi.fn().mockResolvedValue({ description: 'A repo', stars: 100, avatar_url: 'https://example.com/avatar.png' }) }`

- GitHub repo link (`[react](https://github.com/facebook/react)`) is **not** converted to a footnote: no `<sup>` rendered, no `.rm-references` section appended
- GitHub repo link renders with `data-gh-owner="facebook"`, `data-gh-name="react"`, and class `rm-gh-repo-link`
- Click on GitHub repo link calls `navigate('/repo/facebook/react')` and does **not** call `window.api.openExternal`
- Non-repo GitHub link (`[issue](https://github.com/facebook/react/issues/1)`) still becomes a footnote and clicking calls `window.api.openExternal`
- Hover popover appears after 300ms showing the repo name (uses fake timers + `Promise.resolve()` drain)
- Hover popover dismissed after `mouseLeave` + 80ms timer
- GitHub repo links are excluded from the link-preview `IntersectionObserver` selector (verify `fetchLinkPreview` is not called for a `data-gh-owner` link)

---

## File Summary

| Action | File |
|--------|------|
| Create | `src/utils/githubRepoUrl.ts` |
| Create | `src/utils/githubRepoFetcher.ts` |
| Modify | `src/components/ReadmeRenderer.tsx` |
| Modify | `src/styles/globals.css` |
| Create | `src/utils/githubRepoUrl.test.ts` |
| Create | `src/utils/githubRepoFetcher.test.ts` |
| Modify | `src/components/ReadmeRenderer.test.tsx` |
