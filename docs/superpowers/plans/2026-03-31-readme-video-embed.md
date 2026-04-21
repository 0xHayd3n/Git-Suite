# README Video Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed YouTube videos inline in the ReadmeRenderer with hover previews and a theatre-mode player that expands in-place.

**Architecture:** A new rehype plugin (`rehypeYouTubeLinks`) tags YouTube `<a>` elements and their parent `<p>` with data attributes. The existing `a` and `p` component overrides in `mdComponents` read these attributes to render play/stop toggles, hover popovers, and an in-place iframe theatre embed. Only one video plays at a time.

**Tech Stack:** React, ReactMarkdown, rehype (HAST), YouTube oEmbed API, CSS

**Spec:** `docs/superpowers/specs/2026-03-31-readme-video-embed-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/utils/youtubeParser.ts` | Modify | Add `/shorts/` to `extractVideoId`, export it |
| `src/components/ReadmeRenderer.tsx` | Modify | New rehype plugin, new state/refs, updated `a` and `p` component overrides, popover + theatre components |
| `src/components/ReadmeRenderer.test.tsx` | Modify | Tests for rehype plugin, footnote exclusion, toggle behavior |
| `src/styles/globals.css` | Modify | New `.rm-yt-*` CSS classes |

---

### Task 1: Export and fix `extractVideoId` in youtubeParser

**Files:**
- Modify: `src/utils/youtubeParser.ts:17-28`

- [ ] **Step 1: Write the failing test for shorts URL extraction**

There is no dedicated test file for `youtubeParser.ts`. Add a test inline to verify the change manually. For now, just make the code change — the ReadmeRenderer tests in Task 4 will exercise this through the full pipeline.

Skip to Step 2.

- [ ] **Step 2: Add `/shorts/` pattern and export `extractVideoId`**

In `src/utils/youtubeParser.ts`, change `function extractVideoId` to `export function extractVideoId` and add a `/shorts/` match before the `return null`:

```ts
// Add after the /embed/ match (line 26) and before the final return null (line 28):
  // Shorts: /shorts/VIDEO_ID
  m = url.match(/\/shorts\/([\w-]{11})(?:[?&#]|$)/)
  if (m) return m[1]
```

Also change line 17 from:
```ts
function extractVideoId(url: string): string | null {
```
to:
```ts
export function extractVideoId(url: string): string | null {
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `youtubeParser.ts`

- [ ] **Step 4: Commit**

```bash
git add src/utils/youtubeParser.ts
git commit -m "feat: export extractVideoId and add /shorts/ URL support"
```

---

### Task 2: Add `rehypeYouTubeLinks` plugin and footnote exclusion

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx:1-11` (imports)
- Modify: `src/components/ReadmeRenderer.tsx` (new plugin function, ~after line 208)
- Modify: `src/components/ReadmeRenderer.tsx:227-236` (footnote exclusion)
- Modify: `src/components/ReadmeRenderer.tsx:815` (plugin chain)

- [ ] **Step 1: Add import for `extractVideoId`**

In `src/components/ReadmeRenderer.tsx`, add to the imports at the top of the file:

```ts
import { extractVideoId } from '../utils/youtubeParser'
```

- [ ] **Step 2: Write the `rehypeYouTubeLinks` rehype plugin**

Add this function after `rehypeAddHeadingIds` (after line 208) and before `rehypeFootnoteLinks` (line 220):

```ts
// ── Rehype plugin: tag YouTube links with video ID ──────────────
// Runs AFTER rehype-sanitize so data-* properties are not stripped.
// Stamps data-yt-id on <a> elements and data-yt-ids on parent <p>.
function rehypeYouTubeLinks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, _index, parent) => {
      if (node.tagName !== 'a') return
      const href = String(node.properties?.href ?? '')
      const videoId = extractVideoId(href)
      if (!videoId) return

      // Stamp the video ID on the <a>
      node.properties = node.properties ?? {}
      node.properties.dataYtId = videoId

      // Stamp on parent <p> as comma-separated list
      if (parent && (parent as Element).tagName === 'p') {
        const p = parent as Element
        p.properties = p.properties ?? {}
        const existing = String(p.properties.dataYtIds ?? '')
        p.properties.dataYtIds = existing ? `${existing},${videoId}` : videoId
      }
    })
  }
}
```

- [ ] **Step 3: Add footnote exclusion for YouTube links**

In `rehypeFootnoteLinks` (around line 228), after the existing image-link skip block (`if (allImages) return SKIP`), add:

```ts
      // Skip YouTube video links — they need the <a> element for the embed UI
      if (node.properties?.dataYtId) return SKIP
```

This goes right after line 236 (`if (allImages) return SKIP`).

- [ ] **Step 4: Register the plugin in the chain**

On line 815, update the `rehypePlugins` array to insert `rehypeYouTubeLinks` between `rehypeAddHeadingIds` and `rehypeFootnoteLinks`:

From:
```ts
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, rehypeAddHeadingIds, rehypeFootnoteLinks]}
```

To:
```ts
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, rehypeAddHeadingIds, rehypeYouTubeLinks, rehypeFootnoteLinks]}
```

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/ReadmeRenderer.tsx
git commit -m "feat: add rehypeYouTubeLinks plugin and footnote exclusion for YT links"
```

---

### Task 3: Add state, refs, and the `a` / `p` component overrides

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx:1` (add import for `fetchYouTubeOEmbed` and `YouTubeVideoData`)
- Modify: `src/components/ReadmeRenderer.tsx:539-544` (new state/refs)
- Modify: `src/components/ReadmeRenderer.tsx:686-694` (p override)
- Modify: `src/components/ReadmeRenderer.tsx:696-731` (a override)
- Modify: `src/components/ReadmeRenderer.tsx:806` (useMemo deps)

- [ ] **Step 1: Update the youtubeParser import**

The import added in Task 2 (`import { extractVideoId } from '../utils/youtubeParser'`) needs to be expanded. Replace it with:

```ts
import { extractVideoId, fetchYouTubeOEmbed, type YouTubeVideoData } from '../utils/youtubeParser'
```

- [ ] **Step 2: Add state and refs to ReadmeRenderer function**

Inside `export default function ReadmeRenderer(...)`, after the existing `fnHistory` state (line 544), add:

```ts
  // ── YouTube video embed state ──
  const [activeVideo, setActiveVideo] = useState<string | null>(null)
  const [hoverVideo, setHoverVideo] = useState<{ id: string; rect: DOMRect } | null>(null)
  const ytCache = useRef<Map<string, YouTubeVideoData>>(new Map())
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 3: Update the `a` component override to handle YouTube links**

Replace the existing `a` override (lines 696-731) with this version that detects `data-yt-id` on the node and renders a play/stop toggle + hover handlers. The `node` prop is available from ReactMarkdown component overrides:

```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: ({ href, children, className: nodeClass, node }: any) => {
      const ytId = node?.properties?.dataYtId as string | undefined

      // YouTube link — render with play/stop toggle and hover preview
      if (ytId) {
        const isPlaying = activeVideo === ytId
        return (
          <span
            className="rm-yt-link-wrap"
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
              hoverTimerRef.current = setTimeout(() => {
                setHoverVideo({ id: ytId, rect })
                // Fetch oEmbed data if not cached
                if (!ytCache.current.has(ytId)) {
                  fetchYouTubeOEmbed({ videoId: ytId, playlistId: null, url: href ?? '' })
                    .then(data => {
                      ytCache.current.set(ytId, data)
                      // Force re-render to show fetched data
                      setHoverVideo(prev => prev?.id === ytId ? { ...prev } : prev)
                    })
                }
              }, 300)
            }}
            onMouseLeave={() => {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
              hoverTimerRef.current = setTimeout(() => setHoverVideo(null), 200)
            }}
          >
            <a
              className="rm-link rm-yt-link"
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) window.api.openExternal(href)
              }}
            >
              {children}
            </a>
            <button
              className={`rm-yt-play-btn${isPlaying ? ' rm-yt-playing' : ''}`}
              aria-label={isPlaying ? 'Stop video' : 'Play video'}
              onClick={(e) => {
                e.stopPropagation()
                setActiveVideo(isPlaying ? null : ytId)
              }}
            >
              {isPlaying ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6z" />
                </svg>
              )}
            </button>
          </span>
        )
      }

      // Default non-YouTube link behavior (unchanged)
      return (
        <a
          className={nodeClass ?? 'rm-link'}
          href={href}
          onClick={(e) => {
            e.preventDefault()
            if (!href) return
            if (href.startsWith('http://') || href.startsWith('https://')) {
              window.api.openExternal(href)
            } else if (href.startsWith('#')) {
              if (href.startsWith('#fn-') && !href.startsWith('#fn-ref-')) {
                const n = parseInt(href.slice(4), 10)
                if (!isNaN(n)) {
                  setFnHistory(prev => {
                    const filtered = prev.filter(x => x !== n)
                    return [n, ...filtered].slice(0, 5)
                  })
                }
              }
              const target = document.getElementById(href.slice(1))
              target?.scrollIntoView({ behavior: 'smooth' })
              if (href.startsWith('#fn-ref-') && target) {
                target.classList.remove('rm-fn-ref-flash')
                void target.offsetWidth
                target.classList.add('rm-fn-ref-flash')
                setTimeout(() => target.classList.remove('rm-fn-ref-flash'), 1650)
              }
            }
          }}
        >
          {children}
        </a>
      )
    },
```

- [ ] **Step 4: Add the `TheatreEmbed` component**

Add this component inside `ReadmeRenderer.tsx`, just before the `ReadmeRenderer` function definition (before line 539). It handles loading and error states for the iframe:

```tsx
function TheatreEmbed({ videoId }: { videoId: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="rm-yt-theatre rm-yt-theatre-error">
        <p>Video unavailable.</p>
        <a
          className="rm-link"
          href={`https://www.youtube.com/watch?v=${videoId}`}
          onClick={(e) => {
            e.preventDefault()
            window.api.openExternal(`https://www.youtube.com/watch?v=${videoId}`)
          }}
        >
          Open on YouTube
        </a>
      </div>
    )
  }

  return (
    <div className="rm-yt-theatre">
      {!loaded && <div className="rm-yt-theatre-loading" />}
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="YouTube video player"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={loaded ? undefined : { opacity: 0, position: 'absolute' }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Update the `p` component override to render theatre embed**

Replace the existing `p` override (lines 686-694). Note: the `TheatreEmbed` component from Step 4 handles loading/error states internally:


```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p: ({ children, node }: any) => {
      if (node?.properties?.dataBadgeRow === true) {
        return <p className="rm-badge-row">{children}</p>
      }
      if (node?.properties?.dataLogoRow === true) {
        return <p className="rm-logo-row">{children}</p>
      }

      // Check if this paragraph contains the currently-active YouTube video
      const ytIds = String(node?.properties?.dataYtIds ?? '')
      const showTheatre = activeVideo && ytIds.split(',').includes(activeVideo)

      return (
        <>
          <p className="rm-p">{children}</p>
          {showTheatre && (
            <TheatreEmbed videoId={activeVideo} />
          )}
        </>
      )
    },
```

- [ ] **Step 6: Update `useMemo` dependency array**

The `mdComponents` useMemo (line 806) currently depends on `[fnHistory]`. Update to include `activeVideo` and `hoverVideo`:

```ts
  }), [fnHistory, activeVideo, hoverVideo])
```

- [ ] **Step 7: Add the hover popover render below the lightbox block**

After the lightbox block (after line 835, before the status bar div), add:

```ts
      {/* YouTube hover popover */}
      {hoverVideo && (() => {
        const data = ytCache.current.get(hoverVideo.id)
        return (
          <div
            className="rm-yt-popover"
            style={{
              top: hoverVideo.rect.bottom + 6,
              left: hoverVideo.rect.left,
            }}
            onMouseEnter={() => {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
            }}
            onMouseLeave={() => {
              hoverTimerRef.current = setTimeout(() => setHoverVideo(null), 200)
            }}
          >
            {data?.thumbnailUrl && (
              <img src={data.thumbnailUrl} alt={data.title} className="rm-yt-popover-thumb" />
            )}
            <div className="rm-yt-popover-info">
              <div className="rm-yt-popover-title">{data?.title || 'YouTube Video'}</div>
              {data?.author && <div className="rm-yt-popover-author">{data.author}</div>}
            </div>
          </div>
        )
      })()}
```

- [ ] **Step 8: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/components/ReadmeRenderer.tsx
git commit -m "feat: add YouTube inline embed with play/stop toggle, hover popover, and theatre mode"
```

---

### Task 4: Add CSS styles

**Files:**
- Modify: `src/styles/globals.css` (insert after `.rm-logo-row` block, before the status bar section, around line 1948)

- [ ] **Step 1: Add all `.rm-yt-*` styles**

Insert the following CSS block after the `.rm-logo-row { ... }` block (line 1947) and before the `/* ── Link hover status bar */` comment (line 1949):

```css
/* ── YouTube inline video embed ── */
.rm-yt-link-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.rm-yt-link {
  color: var(--accent-text);
  text-decoration: none;
}
.rm-yt-link:hover { text-decoration: underline; }
.rm-yt-play-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border2);
  border-radius: 4px;
  background: var(--bg3);
  color: var(--t2);
  cursor: pointer;
  padding: 0;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  flex-shrink: 0;
}
.rm-yt-play-btn:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.rm-yt-play-btn.rm-yt-playing {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

/* Theatre mode — full-width 16:9 embed */
.rm-yt-theatre {
  width: 100%;
  aspect-ratio: 16 / 9;
  margin: 12px 0 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
  background: #000;
}
.rm-yt-theatre iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

/* Hover popover — positioned fixed via JS */
.rm-yt-popover {
  position: fixed;
  z-index: 600;
  width: 280px;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: rm-yt-popover-in 0.15s ease;
}
@keyframes rm-yt-popover-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.rm-yt-popover-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
  background: #000;
}
.rm-yt-popover-info {
  padding: 8px 10px 9px;
}
.rm-yt-popover-title {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--t1);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 2px;
}
.rm-yt-popover-author {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  color: var(--t3);
}

/* Theatre loading / error states */
.rm-yt-theatre-loading {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111;
  border-radius: var(--radius-md);
  animation: rm-yt-pulse 1.5s ease-in-out infinite;
}
@keyframes rm-yt-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
.rm-yt-theatre-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  color: var(--t3);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}
.rm-yt-theatre-error p {
  margin: 0 0 8px;
}
```

- [ ] **Step 2: Verify app renders correctly**

Run: `npm run dev`
Open the app and navigate to a repo with YouTube links in its README. Verify:
- Play button appears next to YouTube links
- Hovering shows popover with thumbnail/title/author
- Clicking play shows theatre iframe below the paragraph
- Clicking stop removes it

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add CSS for YouTube inline embed, theatre mode, and hover popover"
```

---

### Task 5: Add tests

**Files:**
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Write rehype plugin detection tests**

Add a new `describe` block at the end of `ReadmeRenderer.test.tsx`:

```tsx
// ── YouTube video embed ──────────────────────────────────────────────

describe('YouTube link detection', () => {
  it('renders a YouTube watch link with a play button', () => {
    const { container } = renderMd('[My Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')
    const btn = container.querySelector('.rm-yt-play-btn')
    expect(btn).not.toBeNull()
    expect(btn?.getAttribute('aria-label')).toBe('Play video')
  })

  it('renders a YouTube shorts link with a play button', () => {
    const { container } = renderMd('[Short](https://www.youtube.com/shorts/dQw4w9WgXcQ)')
    const btn = container.querySelector('.rm-yt-play-btn')
    expect(btn).not.toBeNull()
  })

  it('renders a youtu.be short link with a play button', () => {
    const { container } = renderMd('[Video](https://youtu.be/dQw4w9WgXcQ)')
    const btn = container.querySelector('.rm-yt-play-btn')
    expect(btn).not.toBeNull()
  })

  it('renders a YouTube /embed/ link with a play button', () => {
    const { container } = renderMd('[Video](https://www.youtube.com/embed/dQw4w9WgXcQ)')
    const btn = container.querySelector('.rm-yt-play-btn')
    expect(btn).not.toBeNull()
  })

  it('does NOT add a play button to non-YouTube links', () => {
    const { container } = renderMd('[link](https://example.com/page)')
    const btn = container.querySelector('.rm-yt-play-btn')
    expect(btn).toBeNull()
  })

  it('does NOT add a play button to playlist-only YouTube links', () => {
    const { container } = renderMd('[Playlist](https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxx)')
    const btn = container.querySelector('.rm-yt-play-btn')
    expect(btn).toBeNull()
  })

  it('does NOT add a play button for malformed short video IDs', () => {
    const { container } = renderMd('[Bad](https://www.youtube.com/watch?v=short)')
    const btn = container.querySelector('.rm-yt-play-btn')
    expect(btn).toBeNull()
  })

  it('renders play buttons for multiple YouTube links in one paragraph', () => {
    const md = '[A](https://www.youtube.com/watch?v=aaaaaaaaaaa) and [B](https://www.youtube.com/watch?v=bbbbbbbbbbb)'
    const { container } = renderMd(md)
    const btns = container.querySelectorAll('.rm-yt-play-btn')
    expect(btns.length).toBe(2)
  })

  it('does NOT convert YouTube links to footnotes', () => {
    const { container } = renderMd('[My Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')
    // Should NOT have a footnote superscript for this link
    const sup = container.querySelector('sup')
    expect(sup).toBeNull()
    // Should still have the original <a> element
    const link = container.querySelector('.rm-yt-link')
    expect(link).not.toBeNull()
  })
})
```

- [ ] **Step 2: Write theatre mode toggle tests**

Add below the previous block:

```tsx
describe('YouTube theatre mode', () => {
  it('shows theatre iframe when play button is clicked', async () => {
    const { container } = renderMd('[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')
    const btn = container.querySelector('.rm-yt-play-btn') as HTMLButtonElement
    act(() => { btn.click() })
    await waitFor(() => {
      const theatre = container.querySelector('.rm-yt-theatre')
      expect(theatre).not.toBeNull()
      const iframe = theatre?.querySelector('iframe')
      expect(iframe?.src).toContain('youtube.com/embed/dQw4w9WgXcQ')
    })
  })

  it('removes theatre iframe when stop button is clicked', async () => {
    const { container } = renderMd('[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')
    const btn = container.querySelector('.rm-yt-play-btn') as HTMLButtonElement
    // Play
    act(() => { btn.click() })
    await waitFor(() => {
      expect(container.querySelector('.rm-yt-theatre')).not.toBeNull()
    })
    // Stop — re-query the button since it re-rendered
    const stopBtn = container.querySelector('.rm-yt-play-btn') as HTMLButtonElement
    act(() => { stopBtn.click() })
    await waitFor(() => {
      expect(container.querySelector('.rm-yt-theatre')).toBeNull()
    })
  })

  it('toggles play button aria-label between Play and Stop', async () => {
    const { container } = renderMd('[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')
    const btn = container.querySelector('.rm-yt-play-btn') as HTMLButtonElement
    expect(btn.getAttribute('aria-label')).toBe('Play video')
    act(() => { btn.click() })
    await waitFor(() => {
      const btn2 = container.querySelector('.rm-yt-play-btn') as HTMLButtonElement
      expect(btn2.getAttribute('aria-label')).toBe('Stop video')
    })
  })

  it('only allows one video playing at a time', async () => {
    const md = [
      '[Video A](https://www.youtube.com/watch?v=aaaaaaaaaaa)',
      '',
      '[Video B](https://www.youtube.com/watch?v=bbbbbbbbbbb)',
    ].join('\n')
    const { container } = renderMd(md)
    const btns = container.querySelectorAll('.rm-yt-play-btn') as NodeListOf<HTMLButtonElement>
    expect(btns.length).toBe(2)

    // Play video A
    act(() => { btns[0].click() })
    await waitFor(() => {
      expect(container.querySelectorAll('.rm-yt-theatre').length).toBe(1)
      expect(container.querySelector('iframe')?.src).toContain('aaaaaaaaaaa')
    })

    // Play video B — should replace A
    const btns2 = container.querySelectorAll('.rm-yt-play-btn') as NodeListOf<HTMLButtonElement>
    act(() => { btns2[1].click() })
    await waitFor(() => {
      expect(container.querySelectorAll('.rm-yt-theatre').length).toBe(1)
      expect(container.querySelector('iframe')?.src).toContain('bbbbbbbbbbb')
    })
  })
})
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run src/components/ReadmeRenderer.test.tsx`
Expected: All tests pass (existing + new)

- [ ] **Step 4: Commit**

```bash
git add src/components/ReadmeRenderer.test.tsx
git commit -m "test: add YouTube inline embed detection and theatre mode tests"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Navigate to a repo with YouTube links in its README. Verify the complete flow:
1. YouTube links show play button icon inline
2. Non-YouTube links still show footnote references (no regression)
3. Hovering a YouTube link shows popover after ~300ms with thumbnail, title, author
4. Moving cursor away dismisses popover
5. Clicking play inserts theatre iframe below the paragraph, pushing content down
6. Iframe autoplays the video
7. Play icon changes to stop icon (square)
8. Clicking stop removes iframe, content snaps back
9. Playing a second video swaps the first one out
10. Badge rows, logo rows, and image lightbox still work correctly
