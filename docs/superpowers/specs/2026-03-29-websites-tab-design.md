# Websites Tab + x.com False-Positive Fix — Design Spec
**Date:** 2026-03-29

---

## Problem

Two distinct issues exist in the repository detail view's social/community link handling:

1. **`x.com` false-positive icons** — `getSocialPlatform` uses substring matching (`url.includes('x.com')`), causing any domain that ends in `x.com` (e.g. `linux.com`, `matrix.com`, `sphinx.com`, `proxmox.com`) to render a Twitter/X icon in the Community sidebar.

2. **No surface for general website links** — External HTTP links found in README content that are not social platform URLs have nowhere to appear in the UI. Users cannot discover project-related websites, documentation pages, or tool links from the repo detail view.

---

## Goals

- Fix icon misclassification by using proper hostname matching throughout `getSocialPlatform`.
- Add a **Websites** tab that surfaces all non-social external links found in the README.
- Keep the Community sidebar unchanged in intent — social profile links remain there.

---

## Bug Fix — `getSocialPlatform` Hostname Matching

**File:** `src/utils/badgeParser.ts`

Replace all `url.includes(domain)` substring checks with proper URL hostname parsing:

```ts
function hostnameMatches(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === domain || host === `www.${domain}`
  } catch {
    return false
  }
}
```

Apply this check for every platform entry. A URL matches a platform only when its parsed hostname equals the target domain exactly (with or without `www.`). This eliminates all false positives from domains that happen to contain a social domain string as a substring.

---

## New Utility — `src/utils/websiteParser.ts`

### Type

```ts
export interface WebsiteLink {
  url:   string   // full original URL
  label: string   // markdown link text
  host:  string   // hostname with www. stripped, for display
}
```

### Function

```ts
export function extractWebsiteLinks(content: string): WebsiteLink[]
```

### Logic

1. Scan the full README content for markdown links using the pattern `[text](url)`.
2. For each matched URL:
   - Skip if the URL is a relative path or anchor link (`#…`).
   - Skip if `looksLikeBadgeUrl(url)` returns true (reuses the existing export from `badgeParser.ts`).
   - Skip if the parsed hostname matches any entry in `WEBSITE_SKIP_HOSTNAMES` (see below).
   - Skip duplicates — deduplicate by full URL.
3. Return the full list with no cap (all matched links are returned).

### `WEBSITE_SKIP_HOSTNAMES`

`SOCIAL_DOMAINS` in `badgeParser.ts` contains entries that are not clean hostnames (e.g. `'github.com/sponsors'` includes a path segment, `'mastodon.'` is a partial prefix). `websiteParser.ts` therefore defines its own curated skip list of bare hostnames:

```ts
const WEBSITE_SKIP_HOSTNAMES = new Set([
  'twitter.com', 'x.com',
  'discord.gg', 'discord.com',
  'slack.com',
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'reddit.com',
  'youtube.com', 'youtu.be',
  'twitch.tv',
  't.me', 'telegram.me', 'telegram.org',
  'bsky.app',
  'github.com',        // covers github.com/sponsors and all other github links
  'opencollective.com',
  'patreon.com',
  'buymeacoffee.com',
  'ko-fi.com',
  'liberapay.com',
])
```

A URL is skipped if `new URL(url).hostname.replace(/^www\./, '')` is in this set. Mastodon instances (matched via the `'mastodon.'` prefix in `SOCIAL_DOMAINS`) are handled by checking if the hostname contains `'mastodon'` as a substring.

### Dependencies

- `looksLikeBadgeUrl` — already exported from `badgeParser.ts`, no new exports required from that file.

---

## RepoDetail Wiring

### Types

Add `'websites'` to the `Tab` union type:

```ts
type Tab = 'readme' | 'skill' | 'releases' | 'collections' | 'related' | 'videos' | 'posts' | 'commands' | 'websites'
```

### State

```ts
const [websiteLinks, setWebsiteLinks] = useState<WebsiteLink[]>([])
```

### Extraction

Added to the existing `useEffect` that processes the README string (same block as `extractSocialPosts` and `extractYouTubeLinks`):

```ts
setWebsiteLinks(extractWebsiteLinks(readme))
```

### Reset on route change

Added to the reset block that fires on `[owner, name]` change (alongside `setVideoLinks([])`, `setSocialPosts([])`, etc.):

```ts
setWebsiteLinks([])
```

### Tab Definition

Added to `ALL_TABS` (after `'posts'`):

```ts
{ id: 'websites', label: 'Websites' }
```

### Visibility Condition

Added to the `visibleTabs` filter:

```ts
(t.id !== 'websites' || websiteLinks.length > 0)
```

### Tab Label

The existing ternary chain in the tab bar render, updated to include websites:

```ts
t.id === 'videos'   ? `Videos (${videoLinks.length})`
: t.id === 'posts'    ? `Posts (${socialPosts.length})`
: t.id === 'websites' ? `Websites (${websiteLinks.length})`
: t.id === 'commands' ? `Commands (${commands.length})`
: t.label
```

---

## Websites Tab Render

A `website-grid` container div. One card per `WebsiteLink`, styled consistently with the existing `post-card` pattern.

### Card anatomy

| Element | Content | Style |
|---------|---------|-------|
| Title | `host` (e.g. `postman.com`) | Bold, primary text colour |
| Subtitle | `label` (markdown link text, truncated) | Secondary text colour |
| Footer | Full `url`, muted, truncated with ellipsis | Small, muted text colour |

Clicking any card calls `window.api.openExternal(url)`.

---

## CSS

New classes added to `src/styles/globals.css`, following the existing naming conventions:

- `.website-grid` — grid layout matching `.post-grid` / `.video-grid`
- `.website-card` — card container matching `.post-card`
- `.website-card-host` — title line
- `.website-card-label` — subtitle line
- `.website-card-url` — muted footer URL line

---

## Edge Cases

- **Very long label text** — truncate with CSS `text-overflow: ellipsis` on the subtitle.
- **URLs with no markdown label** — bare URLs in README (not wrapped in `[text](url)`) are not captured; only proper markdown links are extracted.
- **Duplicate URLs with different labels** — deduplicate by URL, keep the first-encountered label.
- **Malformed URLs** — wrap all `new URL()` calls in try/catch; skip any URL that fails to parse.
- **Mastodon instances** — hostname contains `'mastodon'` substring check covers community instances (e.g. `mastodon.social`, `fosstodon.org` would not match — acceptable).
- **Social domain false negatives** — if a social URL uses an unrecognised hostname (e.g. a redirect service), it will appear in Websites rather than Community. Acceptable edge case.
- **github.com links** — all `github.com` URLs are excluded from Websites (issues, PRs, profile links etc. would be noise). This is intentional.

---

## Files Touched

| File | Change |
|------|--------|
| `src/utils/badgeParser.ts` | Fix `getSocialPlatform` to use `hostnameMatches` helper |
| `src/utils/websiteParser.ts` | **New file** — `WebsiteLink` type + `extractWebsiteLinks` + `WEBSITE_SKIP_HOSTNAMES` |
| `src/views/RepoDetail.tsx` | Widen `Tab` union; add state, reset, extraction call, tab entry, visibility condition, tab label arm, render block |
| `src/styles/globals.css` | Add `.website-grid`, `.website-card`, and child element styles |
