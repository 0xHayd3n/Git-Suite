# Recommended-card Anchor Strip Redesign

**Date:** 2026-04-15
**Status:** Design approved; pending implementation plan

## Summary

On the Discover → Recommended view, every card currently embeds a "Because you starred [link] + [link]" caption inside the description block, competing with the repo description for reading attention. This change lifts the attribution out of the description area and places it in a dedicated glass strip below the card footer, rendered as pill-shaped chips that carry the anchor repo's avatar alongside its name.

## Motivation

- The italic caption inside the description area visually competes with the repo description and blurs the card's information hierarchy.
- Avatars would make the attribution scannable at a glance — users recognise their own starred repos faster by avatar than by name.
- A distinct surface below the footer signals "this card exists *because of* these repos" more clearly than an inline caption.

## Goals

- Remove the inline `Because you starred X + Y` caption from the description area of `RepoCard`.
- Add a new glass-panelled strip as the final zone of the card (below `.repo-card-footer`) that renders one chip per anchor, each chip showing the anchor owner's avatar and the anchor repo's name.
- Keep the "because you starred" framing so the strip's purpose is explicit to new users.
- Route chip clicks to the anchor repo's page (same navigation behaviour the current caption links provide).

## Non-goals

- No change to how anchors are **selected** — `findAnchors` logic, thresholds, ordering, and the two-anchor display cap remain as-is.
- No change to the "All" tab or any non-recommended view.
- No redesign of the card's dithered header, info panel, or footer.
- No change to the recommendation IPC envelope (`RecommendationResponse`) beyond the field added to `Anchor`.

## Current state

`src/components/RepoCard.tsx:260-280` renders the caption inside `.repo-card-top-text`, under the description:

```tsx
{viewMode === 'recommended' && anchors && anchors.length > 0 && (
  <div className="recommended-anchor-caption">
    Because you starred{' '}
    {anchors.slice(0, 2).map((a, i) => (
      <Fragment key={`${a.owner}/${a.name}`}>
        {i > 0 && ' + '}
        <a href="#" className="recommended-anchor-link" onClick={…}>
          {a.name}
        </a>
      </Fragment>
    ))}
  </div>
)}
```

Accompanying CSS lives at `src/styles/globals.css:9860-9874`:

```css
.recommended-anchor-caption { font-size: 0.78rem; color: var(--t3); font-style: italic; margin: 4px 0; }
.recommended-anchor-link    { color: var(--t2); text-decoration: none; font-style: normal; }
.recommended-anchor-link:hover { text-decoration: underline; }
```

The `Anchor` type (`src/types/recommendation.ts:42-49`) carries `owner`, `name`, `reasons[]`, `similarity` — **no avatar URL**.

Anchors are built in `electron/services/recommendationEngine.ts` inside `findAnchors` (around line 239), constructed from `anchor` which is a `RepoRow`. `RepoRow` already exposes `avatar_url` from the local SQLite cache.

## Design

### Data layer

**Extend `Anchor`:**

```ts
export interface Anchor {
  owner: string
  name: string
  /** Owner avatar URL (github.com/{owner}.png equivalent) — used by the recommended-card anchor strip. */
  avatar_url: string | null
  /** Structured tokens, e.g. "topic:ai-agent", "bucket:ai-ml", "sub:ai-coding", "language:Python". */
  reasons: string[]
  /** Similarity score (higher = more similar). Unbounded above — IDF-weighted topic overlap plus bucket/sub-type/language bumps; typical range 0.2–5. Used for ordering anchors, not for UI display. */
  similarity: number
}
```

Preserve the existing JSDoc on `reasons` and `similarity` verbatim — only the new `avatar_url` field is added.

**Populate in `findAnchors`** — at the one construction site in `recommendationEngine.ts`, thread the field from the source `RepoRow`:

```ts
results.push({
  owner: anchor.owner,
  name: anchor.name,
  avatar_url: anchor.avatar_url ?? null,
  reasons,
  similarity,
})
```

No other server-side changes. The field passes through the existing IPC envelope unchanged.

### Component structure

In `src/components/RepoCard.tsx`:

**Current JSX shape** (for clarity — `.repo-card-footer` is *inside* `.repo-card-info`, not a sibling):

```
.repo-card
├── .repo-card-dither           (zone 1: header)
└── .repo-card-info             (zone 2: info panel — dark glass)
    ├── .repo-card-top
    │   └── .repo-card-top-text ← current caption lives here
    ├── .repo-card-grow
    └── .repo-card-footer       ← current footer
```

**Target JSX shape:**

```
.repo-card
├── .repo-card-dither
├── .repo-card-info             (unchanged except caption removed)
└── .repo-card-anchors          ← NEW strip, direct child of .repo-card
```

1. **Remove** the `.recommended-anchor-caption` block from inside `.repo-card-top-text` (lines 260–280, plus the now-unused `Fragment` import if it has no other consumer).
2. **Add** the new strip immediately after the `.repo-card-info` closing `</div>` (the one at line 350), as a direct child of `.repo-card`:

```tsx
{/* Zone 3: Anchor attribution strip (recommended-mode only) */}
{viewMode === 'recommended' && anchors && anchors.length > 0 && (
  <div className="repo-card-anchors" onClick={e => e.stopPropagation()}>
    <span className="repo-card-anchors-label">Because you starred</span>
    <div className="repo-card-anchor-chips">
      {anchors.slice(0, 2).map(a => (
        <button
          key={`${a.owner}/${a.name}`}
          type="button"
          className="repo-card-anchor-chip"
          onClick={e => {
            e.stopPropagation()
            onNavigate(`/repo/${a.owner}/${a.name}`)
          }}
          title={`${a.owner}/${a.name}`}
        >
          {a.avatar_url && (
            <img className="repo-card-anchor-avatar" src={a.avatar_url} alt="" />
          )}
          <span className="repo-card-anchor-name">{a.name}</span>
        </button>
      ))}
    </div>
  </div>
)}
```

**Why below `.repo-card-info` rather than inside it?** The info panel is itself a dark glass surface (`rgba(0,0,0,0.75)` + `blur(8px)`) whose background extends from the top of the info area through the footer. Keeping the new strip as a *sibling* of `.repo-card-info` — not a child — means the strip's lighter grey glass renders against the card's base surface (`rgba(255,255,255,0.03)`) instead of on top of the info panel's dark glass. That's what produces the visual separation between footer and strip. The card already has `overflow: hidden` + `border-radius: 10px`, so the strip inherits the bottom corner rounding automatically.

**Why inline in `RepoCard.tsx` rather than an extracted component?** The block is under 30 lines and used in exactly one place. An extracted component would add indirection without reuse benefit.

### Behaviour

| Situation | Behaviour |
|-----------|-----------|
| `viewMode !== 'recommended'` | Strip not rendered. Card height unchanged from today. |
| `anchors.length === 0` | Strip not rendered. (Some recommended cards have no anchors above threshold; these continue to render without the strip, same as today.) |
| `anchors.length === 1` | One chip rendered. No separator. |
| `anchors.length >= 2` | Up to two chips rendered (`.slice(0, 2)` — unchanged from today). |
| Chip `avatar_url === null` | Name-only chip — no placeholder. Rare; only if the upstream row genuinely has no avatar. |
| Chip clicked | `stopPropagation` + `onNavigate('/repo/{owner}/{name}')`. Card's own click does not fire. |
| Chip `title` hover | Full `owner/name` shown for disambiguation (chip text shows `name` only to match the current caption's convention). |
| Strip container clicked (outside any chip) | `stopPropagation` swallows the event so clicking the label or chip gap does not trigger card navigation. |

### Styling

Add to `src/styles/globals.css`, replacing the removed `.recommended-anchor-caption`/`.recommended-anchor-link` rules:

```css
/* ── Zone 3: Recommended anchor strip ─────────────────────────────── */
.repo-card-anchors {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.10);
}

.repo-card-anchors-label {
  font-size: 9.5px;
  font-style: italic;
  color: var(--t3);
  flex-shrink: 0;
  letter-spacing: 0.01em;
}

.repo-card-anchor-chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  min-width: 0;
}

.repo-card-anchor-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px 2px 2px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  font-size: 10px;
  color: var(--t2);
  max-width: 100%;
  min-width: 0;
}
.repo-card-anchor-chip:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.repo-card-anchor-avatar {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.repo-card-anchor-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
```

**Design rationale:**

- **Strip height ~28–30px** — a readable shelf that does not inflate card footprint meaningfully.
- **Background `rgba(255,255,255,0.06)` + `blur(12px)`** — mid grey glass; clearly distinct from the dark info panel above it, matches the translucent popover feel already used elsewhere in the app (e.g., `.layout-popover` at `globals.css:9833`).
- **Chip avatar 14×14 circle** — small enough that two chips fit on one row in the narrowest card column, large enough to be identifiable.
- **No hover rule on the strip itself** — only the chips react to hover, which keeps the card's hover behaviour focused on its main body.
- **No bottom border-radius declarations on the strip** — parent `.repo-card` has `overflow: hidden` + `border-radius: 10px`, so rounding is inherited.

## Testing

This is a visual change with light logic; testing emphasis is on:

1. **Type / render test on `Anchor` shape.** `electron/services/recommendationEngine.test.ts` already exercises `findAnchors`. Add an assertion that the returned anchors carry `avatar_url` equal to the source `RepoRow.avatar_url`.
2. **Visual verification by the user.** The user tests UI changes themselves (no automated screenshot/dev-server work in this repo).
3. **Manual edge-case walk:** cards with 0 / 1 / 2 anchors; a card where an anchor row has `avatar_url === null`; the "All" tab (strip absent); hover on a chip; click on a chip; click on the label and empty gap between chips (both should be inert, not navigate the card).

## Out of scope

- Changing anchor selection or ordering.
- Showing reasons (`reasons[]`) in the UI — they remain engine-internal for now.
- Any non-recommended view.
- Responsive layout beyond the existing card width — the strip uses `flex-wrap: wrap`, so narrower cards will wrap a chip to a second row if needed.

## Files touched

| File | Change |
|------|--------|
| `src/types/recommendation.ts` | Add `avatar_url: string \| null` to `Anchor`. |
| `electron/services/recommendationEngine.ts` | Populate `avatar_url` in `findAnchors`'s Anchor construction. |
| `electron/services/recommendationEngine.test.ts` | Assert `avatar_url` propagates from source `RepoRow`. |
| `src/components/RepoCard.tsx` | Remove inline caption block; add `.repo-card-anchors` sibling after `.repo-card-info`. |
| `src/styles/globals.css` | Remove `.recommended-anchor-caption` / `.recommended-anchor-link`; add `.repo-card-anchors*` rules. |
