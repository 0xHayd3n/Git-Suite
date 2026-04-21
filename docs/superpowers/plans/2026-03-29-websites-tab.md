# Websites Tab + x.com Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `getSocialPlatform` substring-match false positives and add a Websites tab that surfaces all non-social external links found in README content.

**Architecture:** Three focused changes — (1) fix the hostname-matching bug in `badgeParser.ts`, (2) add a new `websiteParser.ts` utility that follows the exact same pattern as `socialParser.ts`, (3) wire the new tab into `RepoDetail.tsx` with matching CSS. Each task is independently testable and committable.

**Tech Stack:** TypeScript, React, Vitest, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-29-websites-tab-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/badgeParser.ts` | Modify lines 204–224 | Fix `getSocialPlatform` to use hostname matching |
| `src/utils/badgeParser.test.ts` | Modify | Add false-positive regression tests |
| `src/utils/websiteParser.ts` | **Create** | `WebsiteLink` type + `extractWebsiteLinks` function |
| `src/utils/websiteParser.test.ts` | **Create** | Unit tests for `extractWebsiteLinks` |
| `src/views/RepoDetail.tsx` | Modify | State, reset, extraction, Tab type, ALL_TABS, visibleTabs, label ternary, render block |
| `src/styles/globals.css` | Modify | `.website-grid`, `.website-card`, child element styles |

---

## Task 1: Fix `getSocialPlatform` hostname matching

**Files:**
- Modify: `src/utils/badgeParser.ts:204-224`
- Modify: `src/utils/badgeParser.test.ts`

### Step 1.1 — Write the failing tests

Add a new `describe` block to `src/utils/badgeParser.test.ts` **after** the existing `looksLikeBadgeUrl` block:

```typescript
import { describe, it, expect } from 'vitest'
import { looksLikeBadgeUrl, getSocialPlatform } from './badgeParser'

// ... existing looksLikeBadgeUrl tests unchanged ...

describe('getSocialPlatform', () => {
  // True positives — must still work
  it('returns twitter for x.com', () => {
    expect(getSocialPlatform('https://x.com/handle')).toBe('twitter')
  })
  it('returns twitter for twitter.com', () => {
    expect(getSocialPlatform('https://twitter.com/handle')).toBe('twitter')
  })
  it('returns twitter for www.x.com', () => {
    expect(getSocialPlatform('https://www.x.com/handle')).toBe('twitter')
  })
  it('returns discord for discord.gg', () => {
    expect(getSocialPlatform('https://discord.gg/invite/abc')).toBe('discord')
  })
  it('returns discord for discord.com', () => {
    expect(getSocialPlatform('https://discord.com/invite/abc')).toBe('discord')
  })
  it('returns sponsor for github.com/sponsors', () => {
    expect(getSocialPlatform('https://github.com/sponsors/user')).toBe('sponsor')
  })

  // False positives that must be fixed
  it('returns null for linux.com (contains x.com substring)', () => {
    expect(getSocialPlatform('https://linux.com')).toBeNull()
  })
  it('returns null for proxmox.com (hostname ends in x.com)', () => {
    expect(getSocialPlatform('https://proxmox.com')).toBeNull()
  })
  it('returns null for sphinx.com (ends in x.com)', () => {
    expect(getSocialPlatform('https://sphinx.com')).toBeNull()
  })
  it('returns null for a generic github.com repo URL', () => {
    expect(getSocialPlatform('https://github.com/owner/repo')).toBeNull()
  })
  it('returns null for null input', () => {
    expect(getSocialPlatform(null)).toBeNull()
  })
})
```

- [ ] Add the `getSocialPlatform` import to the existing import line in `src/utils/badgeParser.test.ts`
- [ ] Add the new `describe('getSocialPlatform', ...)` block

### Step 1.2 — Run to confirm the tests fail

```bash
cd D:/Coding/Git-Suite && npx vitest run src/utils/badgeParser.test.ts
```

Expected: several tests in the new block FAIL (linux.com returning `'twitter'`, proxmox.com returning `'twitter'`, etc.)

### Step 1.3 — Implement the fix in `getSocialPlatform`

Replace the entire `getSocialPlatform` function in `src/utils/badgeParser.ts` (lines 204–224) with:

```typescript
/** Extract bare hostname (no www., lowercased) from a URL string. Returns '' on failure. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function getSocialPlatform(linkUrl: string | null): string | null {
  if (!linkUrl) return null
  const h = hostnameOf(linkUrl)
  if (!h) return null

  if (h === 'twitter.com' || h === 'x.com')                            return 'twitter'
  if (h === 'discord.gg'  || h === 'discord.com' || h === 'discordapp.com') return 'discord'
  if (h === 'slack.com')                                                return 'slack'
  if (h === 'telegram.org' || h === 't.me' || h === 'telegram.me')     return 'telegram'
  if (h === 'reddit.com')                                               return 'reddit'
  if (h === 'youtube.com' || h === 'youtu.be')                         return 'youtube'
  if (h === 'twitch.tv')                                                return 'twitch'
  if (h === 'linkedin.com')                                             return 'linkedin'
  if (h === 'instagram.com')                                            return 'instagram'
  if (h === 'facebook.com')                                             return 'facebook'
  if (h === 'patreon.com')                                              return 'patreon'
  if (h.includes('mastodon'))                                           return 'mastodon'
  if (h === 'bsky.app')                                                 return 'bluesky'
  if (h === 'opencollective.com')                                       return 'opencollective'
  if (h === 'ko-fi.com' || h === 'buymeacoffee.com')                   return 'donate'
  if (h === 'github.com' && linkUrl.toLowerCase().includes('/sponsors')) return 'sponsor'
  return null
}
```

Note: `hostnameOf` is a private helper (no `export`). The `mastodon` check keeps `includes` because Mastodon instances use varied subdomains (e.g. `mastodon.social`, `fosstodon.org` is a known gap and acceptable per spec).

### Step 1.4 — Run tests to confirm all pass

```bash
cd D:/Coding/Git-Suite && npx vitest run src/utils/badgeParser.test.ts
```

Expected: all tests PASS

### Step 1.5 — Commit

```bash
cd D:/Coding/Git-Suite
git add src/utils/badgeParser.ts src/utils/badgeParser.test.ts
git commit -m "fix: use hostname matching in getSocialPlatform to eliminate x.com false positives"
```

---

## Task 2: Create `websiteParser.ts`

**Files:**
- Create: `src/utils/websiteParser.ts`
- Create: `src/utils/websiteParser.test.ts`

### Step 2.1 — Write the failing tests

Create `src/utils/websiteParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractWebsiteLinks } from './websiteParser'

describe('extractWebsiteLinks', () => {
  it('extracts a plain external markdown link', () => {
    const md = 'See [Postman Docs](https://www.postman.com/docs) for details.'
    expect(extractWebsiteLinks(md)).toEqual([
      { url: 'https://www.postman.com/docs', label: 'Postman Docs', host: 'postman.com' },
    ])
  })

  it('strips www. from host', () => {
    const result = extractWebsiteLinks('[Site](https://www.example.com)')
    expect(result[0].host).toBe('example.com')
  })

  it('skips anchor links', () => {
    expect(extractWebsiteLinks('[TOC](#table-of-contents)')).toHaveLength(0)
  })

  it('skips relative paths', () => {
    expect(extractWebsiteLinks('[Contributing](./CONTRIBUTING.md)')).toHaveLength(0)
  })

  it('skips social domain links — x.com', () => {
    expect(extractWebsiteLinks('[Twitter](https://x.com/handle)')).toHaveLength(0)
  })

  it('skips social domain links — twitter.com', () => {
    expect(extractWebsiteLinks('[Twitter](https://twitter.com/handle)')).toHaveLength(0)
  })

  it('skips social domain links — discord.gg', () => {
    expect(extractWebsiteLinks('[Discord](https://discord.gg/abc)')).toHaveLength(0)
  })

  it('skips github.com links', () => {
    expect(extractWebsiteLinks('[Repo](https://github.com/owner/repo)')).toHaveLength(0)
  })

  it('skips badge image URLs', () => {
    // shields.io is a badge URL — looksLikeBadgeUrl returns true for it
    expect(extractWebsiteLinks('[Build](https://img.shields.io/badge/build-passing-green)')).toHaveLength(0)
  })

  it('deduplicates by URL', () => {
    const md = '[Docs](https://docs.example.com) and [Docs again](https://docs.example.com)'
    expect(extractWebsiteLinks(md)).toHaveLength(1)
  })

  it('keeps the first label when deduplicating', () => {
    const md = '[First](https://docs.example.com) [Second](https://docs.example.com)'
    expect(extractWebsiteLinks(md)[0].label).toBe('First')
  })

  it('extracts multiple distinct links', () => {
    const md = '[Alpha](https://alpha.com) [Beta](https://beta.com)'
    expect(extractWebsiteLinks(md)).toHaveLength(2)
  })

  it('skips malformed URLs silently', () => {
    expect(extractWebsiteLinks('[Bad](not-a-url)')).toHaveLength(0)
  })

  it('skips youtube.com links', () => {
    expect(extractWebsiteLinks('[Video](https://youtube.com/watch?v=abc)')).toHaveLength(0)
  })
})
```

- [ ] Create `src/utils/websiteParser.test.ts` with the content above

### Step 2.2 — Run to confirm tests fail

```bash
cd D:/Coding/Git-Suite && npx vitest run src/utils/websiteParser.test.ts
```

Expected: FAIL — `Cannot find module './websiteParser'`

### Step 2.3 — Implement `websiteParser.ts`

Create `src/utils/websiteParser.ts`:

```typescript
// ── Website link extraction ───────────────────────────────────────────────────
// Finds all external HTTP links in README content that are NOT social-platform
// or badge URLs. These surface in the Websites tab of the repo detail view.

import { looksLikeBadgeUrl } from './badgeParser'

export interface WebsiteLink {
  url:   string   // full original URL
  label: string   // markdown link text
  host:  string   // hostname with www. stripped, for display
}

// Bare hostnames to exclude — social platforms and hosting infra that belong
// in the Community sidebar or other tabs. Kept separate from SOCIAL_DOMAINS
// in badgeParser because that list contains non-hostname entries (path segments,
// partial prefixes) that are unsuitable for exact hostname matching.
const SKIP_HOSTNAMES = new Set([
  'twitter.com', 'x.com',
  'discord.gg', 'discord.com', 'discordapp.com',
  'slack.com',
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'reddit.com',
  'youtube.com', 'youtu.be',
  'twitch.tv',
  't.me', 'telegram.me', 'telegram.org',
  'bsky.app',
  'github.com',
  'opencollective.com',
  'patreon.com',
  'buymeacoffee.com',
  'ko-fi.com',
  'liberapay.com',
])

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function extractWebsiteLinks(content: string): WebsiteLink[] {
  const seen:   Set<string>   = new Set()
  const result: WebsiteLink[] = []
  const re = new RegExp(MARKDOWN_LINK_RE.source, MARKDOWN_LINK_RE.flags)

  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const [, label, url] = m

    // Skip anchor links and relative paths
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue

    // Skip malformed URLs and anchor-only fragments
    const host = hostnameOf(url)
    if (!host) continue

    // Skip badge/shield image URLs
    if (looksLikeBadgeUrl(url)) continue

    // Skip known social and platform hostnames
    if (SKIP_HOSTNAMES.has(host)) continue

    // Skip mastodon instances (hostname contains 'mastodon')
    if (host.includes('mastodon')) continue

    // Deduplicate by full URL
    if (seen.has(url)) continue
    seen.add(url)

    result.push({ url, label, host })
  }

  return result
}
```

- [ ] Create `src/utils/websiteParser.ts` with the content above

### Step 2.4 — Run tests to confirm all pass

```bash
cd D:/Coding/Git-Suite && npx vitest run src/utils/websiteParser.test.ts
```

Expected: all tests PASS

### Step 2.5 — Commit

```bash
cd D:/Coding/Git-Suite
git add src/utils/websiteParser.ts src/utils/websiteParser.test.ts
git commit -m "feat: add websiteParser utility to extract non-social external README links"
```

---

## Task 3: Wire up RepoDetail + CSS + render

**Files:**
- Modify: `src/views/RepoDetail.tsx`
- Modify: `src/styles/globals.css`

### Step 3.1 — Add the import

In `src/views/RepoDetail.tsx`, find the line:
```typescript
import { extractCommands, type CommandBlock } from '../utils/commandParser'
```
Add directly after it:
```typescript
import { extractWebsiteLinks, type WebsiteLink } from '../utils/websiteParser'
```

### Step 3.2 — Widen the `Tab` union type (line 274)

Change:
```typescript
type Tab = 'readme' | 'skill' | 'releases' | 'collections' | 'related' | 'videos' | 'posts' | 'commands'
```

To:
```typescript
type Tab = 'readme' | 'skill' | 'releases' | 'collections' | 'related' | 'videos' | 'posts' | 'websites' | 'commands'
```

### Step 3.3 — Add `websites` to `ALL_TABS` (after `posts`, before `commands`)

Change the `ALL_TABS` array (lines 275–284) from:
```typescript
const ALL_TABS: { id: Tab; label: string }[] = [
  { id: 'readme',      label: 'README' },
  { id: 'skill',       label: 'Skill file' },
  { id: 'releases',    label: 'Releases' },
  { id: 'collections', label: 'Collections' },
  { id: 'related',     label: 'Related' },
  { id: 'videos',      label: 'Videos' },
  { id: 'posts',       label: 'Posts' },
  { id: 'commands',    label: 'Commands' },
]
```

To:
```typescript
const ALL_TABS: { id: Tab; label: string }[] = [
  { id: 'readme',      label: 'README' },
  { id: 'skill',       label: 'Skill file' },
  { id: 'releases',    label: 'Releases' },
  { id: 'collections', label: 'Collections' },
  { id: 'related',     label: 'Related' },
  { id: 'videos',      label: 'Videos' },
  { id: 'posts',       label: 'Posts' },
  { id: 'websites',    label: 'Websites' },
  { id: 'commands',    label: 'Commands' },
]
```

### Step 3.4 — Add state declaration

Alongside the other parser state declarations (near `videoLinks`, `socialPosts`), add:

```typescript
const [websiteLinks, setWebsiteLinks] = useState<WebsiteLink[]>([])
```

### Step 3.5 — Add reset on route change

In the reset `useEffect` block (the one that contains `setVideoLinks([])` and `setSocialPosts([])`), add:

```typescript
setWebsiteLinks([])
```

### Step 3.6 — Add extraction call

In the `useEffect` that calls `extractYouTubeLinks` and `extractSocialPosts` (lines ~408–413):

Change:
```typescript
useEffect(() => {
  if (typeof readme !== 'string' || !readme) return
  setVideoLinks(extractYouTubeLinks(readme))
  setSocialPosts(extractSocialPosts(readme))
  setCommands(extractCommands(readme))
}, [readme])
```

To:
```typescript
useEffect(() => {
  if (typeof readme !== 'string' || !readme) return
  setVideoLinks(extractYouTubeLinks(readme))
  setSocialPosts(extractSocialPosts(readme))
  setWebsiteLinks(extractWebsiteLinks(readme))
  setCommands(extractCommands(readme))
}, [readme])
```

### Step 3.7 — Add visibility condition

In the `visibleTabs` filter (lines ~595–601), add the websites condition:

Change:
```typescript
const visibleTabs = ALL_TABS.filter(t =>
  (t.id !== 'releases' || releases === 'loading' || hasReleases) &&
  (t.id !== 'related'  || related.length > 0) &&
  (t.id !== 'videos'   || videoLinks.length > 0) &&
  (t.id !== 'posts'    || socialPosts.length > 0) &&
  (t.id !== 'commands' || commands.length > 0)
)
```

To:
```typescript
const visibleTabs = ALL_TABS.filter(t =>
  (t.id !== 'releases' || releases === 'loading' || hasReleases) &&
  (t.id !== 'related'  || related.length > 0) &&
  (t.id !== 'videos'   || videoLinks.length > 0) &&
  (t.id !== 'posts'    || socialPosts.length > 0) &&
  (t.id !== 'websites' || websiteLinks.length > 0) &&
  (t.id !== 'commands' || commands.length > 0)
)
```

### Step 3.8 — Update the tab label ternary

Change (lines ~721–724):
```typescript
{t.id === 'videos'   ? `Videos (${videoLinks.length})`
 : t.id === 'posts'   ? `Posts (${socialPosts.length})`
 : t.id === 'commands' ? `Commands (${commands.length})`
 : t.label}
```

To:
```typescript
{t.id === 'videos'   ? `Videos (${videoLinks.length})`
 : t.id === 'posts'    ? `Posts (${socialPosts.length})`
 : t.id === 'websites' ? `Websites (${websiteLinks.length})`
 : t.id === 'commands' ? `Commands (${commands.length})`
 : t.label}
```

### Step 3.9 — Add the render block

Find the `{activeTab === 'posts' && (` block (line ~953). Directly **after** the closing `)}` of the posts block, add the websites render block:

```tsx
{activeTab === 'websites' && (
  websiteLinks.length === 0 ? (
    <p className="repo-detail-placeholder">No external links found.</p>
  ) : (
    <div className="website-grid">
      {websiteLinks.map((w, i) => (
        <div
          key={i}
          className="website-card"
          onClick={() => window.api.openExternal(w.url)}
        >
          <div className="website-card-host">{w.host}</div>
          <div className="website-card-label">{w.label}</div>
          <div className="website-card-url">{w.url.replace(/^https?:\/\/(www\.)?/, '')}</div>
        </div>
      ))}
    </div>
  )
)}
```

### Step 3.10 — Add CSS to `src/styles/globals.css`

Find the `.post-grid` / `.post-card` block (lines ~4611–4675) and add directly after it:

```css
/* ── Websites tab ──────────────────────────────────────────────────────────── */
.website-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.website-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.12s, box-shadow 0.12s, transform 0.1s;
  overflow: hidden;
}
.website-card:hover {
  border-color: var(--border2);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}

.website-card-host {
  font-size: 13px;
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.website-card-label {
  font-size: 12px;
  color: var(--t2);
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.website-card-url {
  font-size: 11px;
  color: var(--t3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### Step 3.11 — Run tests to confirm nothing is broken

```bash
cd D:/Coding/Git-Suite && npx vitest run src/utils/badgeParser.test.ts src/utils/websiteParser.test.ts src/components/ReadmeRenderer.test.tsx
```

Expected: all pass

### Step 3.12 — Commit

```bash
cd D:/Coding/Git-Suite
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat: add Websites tab surfacing non-social README links"
```
