# README Video Embed — Design Spec

**Date:** 2026-03-31
**Scope:** Inline YouTube video embedding with theatre mode in ReadmeRenderer

## Summary

Detect YouTube links in rendered READMEs and enhance them with:
1. A hover popover showing thumbnail, title, and author
2. An inline play/stop toggle button
3. A theatre-mode iframe embed that appears in-place, pushing content down

## Detection: Rehype Plugin (`rehypeYouTubeLinks`)

- **Must run AFTER `rehypeSanitize`** so that `data-*` attributes are not stripped (same constraint as `rehypeImageClassifier`). Positioned after `rehypeAddHeadingIds`, before `rehypeFootnoteLinks`.
- Walks all `<a>` elements, checks if `href` matches a YouTube video URL
- Extracts video ID using the existing `extractVideoId` from `youtubeParser.ts` (newly exported)
- Stamps `data-yt-id={videoId}` on the `<a>` element
- **Also stamps `data-yt-ids` on the parent `<p>` element** — a comma-separated list of video IDs found in child links. This follows the established pattern used for `dataBadgeRow` and `dataLogoRow`, allowing the `p` component override to read the attribute from `node.properties` without needing to inspect React children.

## `extractVideoId` Update

The existing `extractVideoId` in `youtubeParser.ts` handles `/watch`, `/embed/`, and `youtu.be/` URLs but **not** `/shorts/` URLs (even though `extractYouTubeLinks` matches them in its regex). Add a `/shorts/` pattern to `extractVideoId` before exporting it.

## Footnote Exclusion

`rehypeFootnoteLinks` currently converts external links into text + footnote superscripts. YouTube links with `data-yt-id` must be **skipped** by this plugin (same pattern as the existing image-link skip) so the `<a>` element survives for the component override.

## Hover Popover

- Triggered on mouse enter over a YouTube-tagged link (300ms delay to avoid flicker)
- Fetches oEmbed data via existing `fetchYouTubeOEmbed`
- Results cached in a `useRef<Map<string, YouTubeVideoData>>` at ReadmeRenderer level
- Popover shows: 16:9 thumbnail, title (bold), author name
- Dismisses on mouse leave with a small grace period (allows moving cursor into popover)
- Positioned absolutely relative to the link, kept within readme bounds

## Play/Stop Toggle

- Rendered as a `<button>` element with `aria-label="Play video"` / `"Stop video"`
- Keyboard-focusable, activates on Enter/Space
- Small inline icon next to each YouTube link
- Default state: play triangle icon
- Active state: stop square icon
- Only one video can be active at a time — managed by `useState<string | null>` (`activeVideo`)
- Clicking play on a different link swaps the active video

## Theatre Mode Embed

- When a video is active, the `p` component override checks `node?.properties?.dataYtIds` against `activeVideo`. If matched, it appends a `<div class="rm-yt-theatre">` containing a YouTube iframe below the paragraph.
- Iframe URL: `https://www.youtube.com/embed/{videoId}?autoplay=1`
- Iframe attributes: `sandbox="allow-scripts allow-same-origin allow-presentation"` and `allow="autoplay; encrypted-media"` for security
- Fills full width of `.rm-content` container
- 16:9 aspect ratio via `aspect-ratio: 16/9`
- Rounded corners, subtle border, vertical margin for breathing room
- **Loading state:** Show a dark placeholder with a subtle spinner/pulse while the iframe loads
- **Error state:** If the iframe fails to load, show a fallback message with a link to open the video externally
- Clicking stop removes the embed and content snaps back

## State in ReadmeRenderer

| State/Ref | Type | Purpose |
|-----------|------|---------|
| `activeVideo` | `useState<string \| null>` | Currently playing video ID |
| `ytCache` | `useRef<Map<string, YouTubeVideoData>>` | oEmbed fetch cache |
| `hoverVideo` | `useState<{id: string, rect: DOMRect} \| null>` | Popover anchor |

## Component Override Changes

### `a` component
- Detects `data-yt-id` on node properties
- Renders link text + inline play/stop `<button>` with aria-label
- Attaches hover handlers for popover (mouse enter/leave with delay)

### `p` component
- Reads `node?.properties?.dataYtIds` (stamped by rehype plugin)
- After rendering children, checks if any video ID in the list matches `activeVideo`
- If so, appends the theatre iframe div below the paragraph content

## New CSS Classes

| Class | Purpose |
|-------|---------|
| `.rm-yt-play-btn` | Inline play/stop toggle button |
| `.rm-yt-popover` | Floating preview card (thumbnail + metadata) |
| `.rm-yt-theatre` | Full-width 16:9 iframe container |
| `.rm-yt-theatre-loading` | Loading placeholder with pulse animation |

## Files Touched

1. `src/utils/youtubeParser.ts` — add `/shorts/` to `extractVideoId`, export it
2. `src/components/ReadmeRenderer.tsx` — rehype plugin, state, component overrides
3. `src/styles/globals.css` — new video embed styles

## Testing

- **Rehype plugin:** YouTube link detection (watch, shorts, embed, youtu.be), non-YouTube link passthrough, `data-yt-id` on `<a>` and `data-yt-ids` on parent `<p>`
- **Footnote exclusion:** YouTube links are not converted to footnotes
- **Toggle behavior:** Play/stop toggling, single-active-video constraint (clicking play on video B while A is active stops A)
- **Edge cases:** Multiple YouTube links in one paragraph, playlist-only links (no video ID) are ignored, malformed URLs
