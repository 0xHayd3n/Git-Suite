# OG Image Card Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover-to-reveal Open Graph image previews to RepoCard, fetched lazily from GitHub HTML and cached in SQLite.

**Architecture:** New IPC handler `repo:getOgImage` scrapes the `og:image` meta tag from a repo's GitHub page, distinguishes custom from generic images, and caches the result in a new `og_image_url` column. The RepoCard component fetches on first hover, shows a shimmer while loading, then reveals the image in a band between description and stats.

**Tech Stack:** Electron (net.fetch for HTML scraping), better-sqlite3, React + CSS transitions, Vitest

**Spec:** `docs/superpowers/specs/2026-04-09-og-image-card-preview-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `electron/db.ts:139` | Phase 18 migration: add `og_image_url` column |
| Modify | `src/types/repo.ts:25` | Add `og_image_url` to `RepoRow` interface |
| Modify | `electron/main.ts:1872` | Add `repo:getOgImage` IPC handler (near existing link-preview handler) |
| Modify | `electron/preload.ts:151-154` | Add `getOgImage` to existing `repo` namespace |
| Modify | `src/env.d.ts:132-134` | Add `getOgImage` type to existing `repo` declaration |
| Create | `src/hooks/useOgImage.ts` | React hook: lazy fetch + cache OG image on hover |
| Modify | `src/components/RepoCard.tsx:279-302` | Add OG image band inside `card-overlay-interactive` |
| Modify | `src/styles/globals.css:1400` | Add `.og-image-band` CSS with transition |
| Create | `electron/services/ogImageService.ts` | OG image fetch logic + generic detection |
| Create | `electron/services/ogImageService.test.ts` | Unit tests for parsing + generic detection |
| Create | `src/hooks/useOgImage.test.ts` | Unit tests for the hook |

---

### Task 1: Database Migration

**Files:**
- Modify: `electron/db.ts:139`

- [ ] **Step 1: Add Phase 18 migration**

In `electron/db.ts`, after line 139 (Phase 17 — `skills.tier`), add:

```typescript
// Phase 18 migration — OG image preview cache
try { db.exec(`ALTER TABLE repos ADD COLUMN og_image_url TEXT DEFAULT NULL`) } catch {}
```

- [ ] **Step 2: Add `og_image_url` to RepoRow interface**

In `src/types/repo.ts`, add after the `avatar_url` field (line 25):

```typescript
og_image_url: string | null
```

- [ ] **Step 3: Commit**

```bash
git add electron/db.ts src/types/repo.ts
git commit -m "feat: add og_image_url column to repos table (Phase 18)"
```

---

### Task 2: OG Image Service — Parsing & Generic Detection

**Files:**
- Create: `electron/services/ogImageService.ts`
- Create: `electron/services/ogImageService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `electron/services/ogImageService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseOgImage, isGenericGitHubOg } from './ogImageService'

describe('parseOgImage', () => {
  it('extracts og:image from standard meta tag', () => {
    const html = '<html><head><meta property="og:image" content="https://repository-images.githubusercontent.com/12345/abc" /></head></html>'
    expect(parseOgImage(html)).toBe('https://repository-images.githubusercontent.com/12345/abc')
  })

  it('extracts og:image when content comes before property', () => {
    const html = '<head><meta content="https://example.com/img.png" property="og:image" /></head>'
    expect(parseOgImage(html)).toBe('https://example.com/img.png')
  })

  it('returns null when no og:image is present', () => {
    const html = '<html><head><title>Test</title></head></html>'
    expect(parseOgImage(html)).toBeNull()
  })
})

describe('isGenericGitHubOg', () => {
  it('detects generic GitHub OG image', () => {
    expect(isGenericGitHubOg('https://opengraph.githubassets.com/abc123def456/facebook/react')).toBe(true)
  })

  it('recognizes custom repository image', () => {
    expect(isGenericGitHubOg('https://repository-images.githubusercontent.com/12345/abc-def')).toBe(false)
  })

  it('recognizes non-GitHub OG images as custom', () => {
    expect(isGenericGitHubOg('https://example.com/banner.png')).toBe(false)
  })

  it('handles empty string', () => {
    expect(isGenericGitHubOg('')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/services/ogImageService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `electron/services/ogImageService.ts`:

```typescript
const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image["'][^>]+content="([^"]+)"/i,
  /<meta[^>]+property=["']og:image["'][^>]+content='([^']+)'/i,
  /<meta[^>]+content="([^"]+)"[^>]+property=["']og:image["']/i,
  /<meta[^>]+content='([^']+)'[^>]+property=["']og:image["']/i,
]

/** Extract the og:image URL from an HTML string (head only). */
export function parseOgImage(html: string): string | null {
  for (const re of OG_IMAGE_PATTERNS) {
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * Returns true if the URL is GitHub's auto-generated OG card
 * (opengraph.githubassets.com/<hash>/<owner>/<repo>).
 * Custom social previews live on repository-images.githubusercontent.com
 * or other hosts entirely.
 */
export function isGenericGitHubOg(url: string): boolean {
  if (!url) return true
  return url.startsWith('https://opengraph.githubassets.com/')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/services/ogImageService.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/services/ogImageService.ts electron/services/ogImageService.test.ts
git commit -m "feat: add OG image parsing service with generic detection"
```

---

### Task 3: IPC Handler — `repo:getOgImage`

**Files:**
- Modify: `electron/main.ts:1872` (before the existing `fetch-link-preview` handler)
- Modify: `electron/preload.ts:151-154`
- Modify: `src/env.d.ts:132-134`

- [ ] **Step 1: Add the IPC handler in main.ts**

In `electron/main.ts`, add before the `fetch-link-preview` handler (line 1872). This handler needs access to `db` and `net`, both available in the file scope. Add at the top of the file with the other imports:

```typescript
import { parseOgImage, isGenericGitHubOg } from './services/ogImageService'
```

Then add the handler before line 1872:

```typescript
// ── OG image preview ──────────────────────────────────────────────
let ogFetchCount = 0
const OG_MAX_CONCURRENT = 2

ipcMain.handle('repo:getOgImage', async (_event, owner: string, name: string) => {
  const db = getDb(app.getPath('userData'))

  // 1. Check cache
  const row = db.prepare('SELECT og_image_url FROM repos WHERE id = ?').get(`${owner}/${name}`) as
    { og_image_url: string | null } | undefined
  if (row && row.og_image_url !== null) {
    return row.og_image_url || null          // '' → null for frontend
  }

  // 2. Concurrency gate
  if (ogFetchCount >= OG_MAX_CONCURRENT) return null
  ogFetchCount++

  try {
    const url = `https://github.com/${owner}/${name}`
    const res = await net.fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })

    if (!res.ok) {
      db.prepare('UPDATE repos SET og_image_url = ? WHERE id = ?').run('', `${owner}/${name}`)
      return null
    }

    // Read at most 100 KB — <head> is always within that
    const reader = res.body?.getReader()
    if (!reader) {
      db.prepare('UPDATE repos SET og_image_url = ? WHERE id = ?').run('', `${owner}/${name}`)
      return null
    }
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.length
      if (total >= 100_000) break
    }
    reader.cancel().catch(() => {})

    const html = new TextDecoder().decode(
      chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c })
    )

    const headEnd = html.search(/<\/head>|<body[\s>]/i)
    const head = headEnd > -1 ? html.slice(0, headEnd) : html

    let imageUrl = parseOgImage(head)

    // Resolve relative URLs
    if (imageUrl) {
      try { imageUrl = new URL(imageUrl, url).href } catch { imageUrl = null }
    }

    // Filter out generic GitHub OG cards
    if (!imageUrl || isGenericGitHubOg(imageUrl)) {
      db.prepare('UPDATE repos SET og_image_url = ? WHERE id = ?').run('', `${owner}/${name}`)
      return null
    }

    // Cache custom OG image
    db.prepare('UPDATE repos SET og_image_url = ? WHERE id = ?').run(imageUrl, `${owner}/${name}`)
    return imageUrl
  } catch {
    db.prepare('UPDATE repos SET og_image_url = ? WHERE id = ?').run('', `${owner}/${name}`)
    return null
  } finally {
    ogFetchCount--
  }
})
```

- [ ] **Step 2: Add preload binding**

In `electron/preload.ts`, add `getOgImage` to the existing `repo` object (around line 151-154):

```typescript
repo: {
  extractColor: (avatarUrl: string, repoId: string) =>
    ipcRenderer.invoke('repo:extractColor', avatarUrl, repoId),
  getOgImage: (owner: string, name: string) =>
    ipcRenderer.invoke('repo:getOgImage', owner, name),
},
```

- [ ] **Step 3: Add type declaration**

In `src/env.d.ts`, update the `repo` block (around line 132-134):

```typescript
repo: {
  extractColor: (avatarUrl: string, repoId: string) => Promise<{ h: number; s: number; l: number }>
  getOgImage: (owner: string, name: string) => Promise<string | null>
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: add repo:getOgImage IPC handler with caching"
```

---

### Task 4: React Hook — `useOgImage`

**Files:**
- Create: `src/hooks/useOgImage.ts`
- Create: `src/hooks/useOgImage.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useOgImage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOgImage } from './useOgImage'

// Mock the IPC API
const mockGetOgImage = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).api = {
    repo: { getOgImage: mockGetOgImage },
  }
})

describe('useOgImage', () => {
  it('returns idle state initially', () => {
    const { result } = renderHook(() => useOgImage('facebook', 'react'))
    expect(result.current.ogImageUrl).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.fetched).toBe(false)
  })

  it('fetches OG image on trigger and returns URL', async () => {
    mockGetOgImage.mockResolvedValue('https://repository-images.githubusercontent.com/12345/img.png')
    const { result } = renderHook(() => useOgImage('facebook', 'react'))

    await act(async () => { result.current.fetch() })

    expect(mockGetOgImage).toHaveBeenCalledWith('facebook', 'react')
    expect(result.current.ogImageUrl).toBe('https://repository-images.githubusercontent.com/12345/img.png')
    expect(result.current.loading).toBe(false)
    expect(result.current.fetched).toBe(true)
  })

  it('does not re-fetch after first call', async () => {
    mockGetOgImage.mockResolvedValue(null)
    const { result } = renderHook(() => useOgImage('owner', 'repo'))

    await act(async () => { result.current.fetch() })
    await act(async () => { result.current.fetch() })

    expect(mockGetOgImage).toHaveBeenCalledTimes(1)
  })

  it('handles null response (no custom OG image)', async () => {
    mockGetOgImage.mockResolvedValue(null)
    const { result } = renderHook(() => useOgImage('owner', 'repo'))

    await act(async () => { result.current.fetch() })

    expect(result.current.ogImageUrl).toBeNull()
    expect(result.current.fetched).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useOgImage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

Create `src/hooks/useOgImage.ts`:

```typescript
import { useState, useCallback, useRef } from 'react'

interface UseOgImageResult {
  ogImageUrl: string | null
  loading: boolean
  fetched: boolean
  fetch: () => void
}

export function useOgImage(owner: string, name: string): UseOgImageResult {
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)
  const [fetched, setFetched] = useState(false)

  const fetchOg = useCallback(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)

    window.api.repo.getOgImage(owner, name)
      .then(url => {
        setOgImageUrl(url)
        setFetched(true)
      })
      .catch(() => {
        setFetched(true)
      })
      .finally(() => setLoading(false))
  }, [owner, name])

  return { ogImageUrl, loading, fetched, fetch: fetchOg }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useOgImage.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOgImage.ts src/hooks/useOgImage.test.ts
git commit -m "feat: add useOgImage hook for lazy OG image fetching"
```

---

### Task 5: RepoCard UI — OG Image Band

**Files:**
- Modify: `src/components/RepoCard.tsx:279-302`
- Modify: `src/styles/globals.css:1400`

- [ ] **Step 1: Add CSS for the OG image band**

In `src/styles/globals.css`, after the `.card-overlay-interactive > div` block (after line 1416), add:

```css
/* ── OG image preview band ─────────────────────────────────────── */
.og-image-band {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition: max-height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              opacity 0.25s ease;
  margin: 4px 0;
}
.og-image-band.visible {
  max-height: 140px;
  opacity: 1;
}
.og-image-band img {
  width: 100%;
  height: 132px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: block;
}
.og-image-band .og-shimmer {
  width: 100%;
  height: 132px;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
  background-size: 200% 100%;
  animation: ogShimmer 1.5s infinite;
}
@keyframes ogShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 2: Import and use the hook in RepoCard**

In `src/components/RepoCard.tsx`, add the import at the top (after existing imports):

```typescript
import { useOgImage } from '../hooks/useOgImage'
```

Inside the `RepoCardInner` component (after the existing hooks around line 176), add:

```typescript
const ogImage = useOgImage(repo.owner, repo.name)
const [imgLoaded, setImgLoaded] = useState(false)
const [imgError, setImgError] = useState(false)
const [hovered, setHovered] = useState(false)
```

- [ ] **Step 3: Add hover trigger**

Update the card's root `<div>` (line 229-234) to trigger the OG fetch on mouse enter:

```tsx
<div
  ref={cardRef}
  className={`repo-card${focused ? ' kb-focused' : ''}`}
  onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
  onMouseEnter={() => { setHovered(true); ogImage.fetch() }}
  onMouseLeave={() => { setHovered(false); setTagsExpanded(false) }}
>
```

- [ ] **Step 4: Add the OG image band JSX**

Inside `card-overlay-interactive > div`, after the `<CardTags>` component (line 302) and before the type config icon (line 304), insert:

```tsx
{/* OG image preview band */}
{!imgError && (ogImage.loading || ogImage.ogImageUrl) && (
  <div className={`og-image-band${hovered && (ogImage.loading || (ogImage.ogImageUrl && imgLoaded)) ? ' visible' : ''}`}>
    {ogImage.loading && !ogImage.ogImageUrl && (
      <div className="og-shimmer" />
    )}
    {ogImage.ogImageUrl && (
      <img
        src={ogImage.ogImageUrl}
        alt=""
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgError(true)}
        style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.2s ease' }}
      />
    )}
  </div>
)}
```

- [ ] **Step 5: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/components/RepoCard.tsx src/styles/globals.css
git commit -m "feat: add OG image preview band to RepoCard on hover"
```

---

### Task 6: Manual Testing & Polish

- [ ] **Step 1: Start the app**

Run: `npm run dev`

- [ ] **Step 2: Test with a repo that has a custom OG image**

Navigate to Discover, search for a well-known repo with a custom social preview (e.g., `tailwindlabs/heroicons`, `vercel/next.js`, `vuejs/core`). Hover over the card and verify:
- Shimmer appears briefly
- Image slides in smoothly
- Image collapses on mouse leave

- [ ] **Step 3: Test with a repo that has NO custom OG image**

Hover over a smaller/personal repo without a custom social preview. Verify:
- No image band appears
- Card behaves exactly as before

- [ ] **Step 4: Test caching**

Hover over the same repo twice. On the second hover:
- No shimmer (instant image)
- No network request (check DevTools)

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Final commit (if any polish needed)**

```bash
git add -u
git commit -m "fix: polish OG image preview interactions"
```
