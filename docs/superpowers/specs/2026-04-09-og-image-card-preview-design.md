# OG Image Card Preview

## Summary

Add hover-to-reveal Open Graph image previews to `RepoCard` components throughout the app. When a user hovers over a card in grid view, the card expands to show the repo's custom OG image (the same image shown when sharing on Twitter/Discord/Slack) in a band between the description and the stats. Repos without a custom OG image show no change on hover.

## Goals

- Give users an instant visual sense of what a repo is about without leaving the grid
- Keep the default grid view clean — previews only appear on interaction
- Minimize API load by caching results and fetching lazily

## Non-Goals

- No fallback content (code snippets, README, generated images) for repos without custom OG images
- No preview in list view (`RepoListRow`) — rows stay compact
- No prefetching — only fetch on first hover

## Approach

Scrape the `og:image` meta tag from the repo's GitHub HTML page. This is the same method link previewers (Discord, Slack, Twitter) use. It's reliable, works for any Git host, and gives us a clean way to detect custom vs generic OG images.

## Schema

Add one column to the `repos` table:

```sql
ALTER TABLE repos ADD COLUMN og_image_url TEXT DEFAULT NULL;
```

Semantics:
- `NULL` — not yet fetched
- `''` (empty string) — fetched, no custom OG image exists
- URL string — the custom OG image URL

## Backend: New IPC Handler

### `window.api.repo.getOgImage(owner: string, name: string): Promise<string | null>`

1. Check SQLite for cached `og_image_url` on the matching repo row
2. If cached (non-NULL, including empty string): return the value (empty string → `null` to the frontend)
3. If `NULL` (not yet fetched):
   a. Fetch `https://github.com/{owner}/{repo}` HTML
   b. Parse the `<meta property="og:image" content="...">` tag
   c. Determine if the image is custom or GitHub's generic generated card:
      - Generic pattern: `https://opengraph.githubassets.com/<hex>/<owner>/<repo>` (auto-generated, shows repo name/description/stats on a plain background)
      - Custom: URL points to `repository-images.githubusercontent.com` or another host entirely (uploaded by the repo owner via Settings → Social preview)
      - Example generic: `https://opengraph.githubassets.com/abc123def/facebook/react`
      - Example custom: `https://repository-images.githubusercontent.com/12345678/abcdef-1234-...`
   d. Store result in SQLite: custom URL or `''` for generic/missing
   e. Return the URL or `null`

### Concurrency Control

- Semaphore in the backend service: max 2 concurrent OG image fetches
- Failed fetches store `''` (treat as no image) — no retry until user manually refreshes

## Frontend: RepoCard Changes

### Card Layout (on hover, when OG image exists)

```
┌──────────────────────────────┐
│  Avatar  RepoName  Badge     │  ← Header (unchanged)
│  Description text...         │  ← Description (unchanged)
│                              │
│  ┌──────────────────────┐    │
│  │                      │    │  ← OG Image band (NEW)
│  │   OG Preview Image   │    │     ~140px tall
│  │                      │    │     rounded corners
│  └──────────────────────┘    │     subtle border
│                              │
│  ★ 22.1k  ⑂ 1.2k  2d ago   │  ← Stats (unchanged)
│  [tag1] [tag2] [tag3]       │  ← Topics (unchanged)
└──────────────────────────────┘
```

### Animation

- **Trigger:** `mouseenter` on the card
- **Expand:** Image band transitions from `height: 0; opacity: 0` to `height: 140px; opacity: 1`
- **Timing:** ~250ms, `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out)
- **Collapse:** `mouseleave` reverses the animation
- **No image:** If `og_image_url` is null/empty, hover behavior is unchanged from today
- **Card shadow:** Elevates slightly on hover when preview is present (`box-shadow` transition)

### Loading State (first hover, uncached)

1. On first hover of an uncached repo, expand the band with a shimmer skeleton
2. Fire `window.api.repo.getOgImage(owner, name)`
3. On response:
   - If URL returned: fade the image in over the skeleton
   - If null: collapse the band back to 0 (no image available)
4. If the `<img>` fails to load at runtime (404, CORS, etc.): collapse the band and treat as no image

### Grid Impact

- The expanding card pushes cards below it down via natural CSS grid flow
- No absolute positioning or overlays — the card genuinely grows

## Scope

Applies to `RepoCard` wherever it's rendered:
- Discover grid
- Library grid
- Starred grid
- Collections grid

Does NOT apply to:
- `RepoListRow` (list view)
- `RepoDetail` (already has full repo context)

## Testing

- Unit test for OG image URL parsing (custom vs generic detection)
- Unit test for SQLite caching logic (null vs empty string vs URL)
- Component test: RepoCard renders image band on hover when URL is present
- Component test: RepoCard does not change on hover when URL is absent
