# Recommended-card Anchor Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the "Because you starred X + Y" caption out of the Recommended-card description and into a new grey-glass strip below the footer, rendered as pill chips carrying each anchor's avatar and repo name.

**Architecture:** Three-file-group change. Extend `Anchor` with `avatar_url` (threaded server-side from the source `RepoRow`). Replace the inline caption in `RepoCard.tsx` with a new `.repo-card-anchors` sibling of `.repo-card-info`. Swap the old caption CSS for new strip + chip styles in `globals.css`.

**Tech Stack:** TypeScript, React 18, Vite (electron-vite), Vitest (vitest run), Electron main-process services, CSS (global stylesheet).

**Spec:** `docs/superpowers/specs/2026-04-15-recommended-anchor-strip-design.md`

---

## File Structure

**Files this plan touches:**

| File | Role | Change |
|------|------|--------|
| `src/types/recommendation.ts` | Shared type definitions (renderer + main process) | Add `avatar_url: string \| null` to `Anchor`. |
| `electron/services/recommendationEngine.ts` | Anchor construction | In `findAnchors`, include `avatar_url` from source `RepoRow`. |
| `electron/services/recommendationEngine.test.ts` | Anchor engine tests (vitest) | Add one assertion that `avatar_url` propagates. |
| `src/components/RepoCard.tsx` | Discover repo card (React, single-file component) | Remove inline caption block (lines 260–280). Add new strip as sibling of `.repo-card-info`. |
| `src/styles/globals.css` | Global stylesheet | Remove `.recommended-anchor-caption` / `.recommended-anchor-link` rules (lines 9860–9874). Add `.repo-card-anchors*` rules. |

**Decomposition rationale:** The change spans three concerns — engine data shape, card JSX, card CSS. Each is a clean commit boundary. Engine must land first because the card will read `anchor.avatar_url`. JSX and CSS are split into separate tasks because the CSS is large enough to review independently and swapping the JSX without CSS (or vice versa) is recoverable mid-plan if a reviewer wants changes.

---

## Task 1: Extend Anchor type and propagate `avatar_url` from the engine

**Goal:** Add `avatar_url: string | null` to the `Anchor` interface, populate it in `findAnchors` from the source `RepoRow`, and cover it with a test.

**Files:**
- Modify: `src/types/recommendation.ts:42-49`
- Modify: `electron/services/recommendationEngine.ts:237-244` (the `results.push({...})` block inside `findAnchors`)
- Modify: `electron/services/recommendationEngine.test.ts` (add one assertion inside the existing `describe('findAnchors', …)` block around line 290)

- [ ] **Step 1: Write the failing test**

In `electron/services/recommendationEngine.test.ts`, add a new `it` block inside the existing `describe('findAnchors', …)` block (after the "picks anchor with shared rare topics" test at line 323). The `makeRepo` helper already exists (line 56); use it.

```ts
it('propagates avatar_url from the source RepoRow onto the Anchor', () => {
  const anchor = makeRepo({
    id: 'a1', owner: 'microsoft', name: 'autogen',
    topics: JSON.stringify(['ai-agent']),
    avatar_url: 'https://avatars.githubusercontent.com/u/6154722?v=4',
  })
  const profile = emptyProfile({ anchorPool: [anchor] })
  const anchors = findAnchors(
    cand({ topics: ['ai-agent'] }),
    profile,
    stats
  )
  expect(anchors.length).toBe(1)
  expect(anchors[0].avatar_url).toBe('https://avatars.githubusercontent.com/u/6154722?v=4')
})

it('anchor.avatar_url is null when source RepoRow.avatar_url is null', () => {
  const anchor = makeRepo({
    id: 'a2', owner: 'o', name: 'a',
    topics: JSON.stringify(['ai-agent']),
    avatar_url: null,
  })
  const profile = emptyProfile({ anchorPool: [anchor] })
  const anchors = findAnchors(
    cand({ topics: ['ai-agent'] }),
    profile,
    stats
  )
  expect(anchors.length).toBe(1)
  expect(anchors[0].avatar_url).toBeNull()
})
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test -- recommendationEngine`

Expected: both new tests fail. The `propagates avatar_url…` test fails because TypeScript will either (a) accept `avatar_url` on the `Anchor` but find it `undefined` at runtime, producing `expected undefined to be '…'`, or (b) error out at type-check time saying `avatar_url` is not a property of `Anchor`. Either failure is acceptable — the point is it doesn't pass.

- [ ] **Step 3: Extend the `Anchor` type**

In `src/types/recommendation.ts`, modify the `Anchor` interface (lines 42–49) to add the new field **between `name` and `reasons`**. Preserve the existing JSDoc on `reasons` and `similarity` verbatim:

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

- [ ] **Step 4: Populate `avatar_url` in `findAnchors`**

In `electron/services/recommendationEngine.ts`, modify the `results.push({…})` call inside `findAnchors` (lines 237–244) to include the new field. The surrounding loop variable `anchor` is already a `RepoRow` (see line 213), which has `avatar_url: string | null`:

```ts
if (similarity >= ANCHOR_THRESHOLD) {
  results.push({
    owner: anchor.owner,
    name: anchor.name,
    avatar_url: anchor.avatar_url ?? null,
    reasons,
    similarity,
  })
}
```

The `?? null` is belt-and-braces: `RepoRow.avatar_url` is already `string | null`, but the nullish coalesce makes the intent explicit at the push site.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- recommendationEngine`

Expected: all tests in `recommendationEngine.test.ts` pass, including the two new ones. No other tests should have broken — `findAnchors` is only called from `rankCandidates` inside the same file, and the additional field does not affect call sites that don't read it.

- [ ] **Step 6: Commit**

```bash
git add src/types/recommendation.ts electron/services/recommendationEngine.ts electron/services/recommendationEngine.test.ts
git commit -m "$(cat <<'EOF'
feat(recommend): thread avatar_url through the Anchor type

The recommended-card UI is moving the anchor attribution into a new
strip with avatar + name chips. Extend Anchor with avatar_url and
populate it in findAnchors from the source RepoRow. No behaviour
change for existing consumers.
EOF
)"
```

---

## Task 2: Replace the inline caption with the new anchor strip in `RepoCard`

**Goal:** Remove the old caption block from inside the description area and add the new `.repo-card-anchors` strip as a sibling of `.repo-card-info`. Rendered only in `recommended` view mode with one or more anchors. The CSS rules this depends on land in Task 3 — between tasks the strip will render unstyled; that's intentional and will be fixed in the next commit.

**Files:**
- Modify: `src/components/RepoCard.tsx:1` (possibly remove unused `Fragment` from the import)
- Modify: `src/components/RepoCard.tsx:260-280` (remove inline caption block)
- Modify: `src/components/RepoCard.tsx:350-351` (insert new strip between `</div>` closing `.repo-card-info` and `</div>` closing `.repo-card`)

- [ ] **Step 1: Remove the inline caption block**

In `src/components/RepoCard.tsx`, delete lines 260–280 (the entire `{viewMode === 'recommended' && anchors && anchors.length > 0 && ( … )}` block inside `.repo-card-top-text`):

```tsx
            {/* DELETE THIS ENTIRE BLOCK */}
            {viewMode === 'recommended' && anchors && anchors.length > 0 && (
              <div className="recommended-anchor-caption">
                Because you starred{' '}
                {anchors.slice(0, 2).map((a, i) => (
                  <Fragment key={`${a.owner}/${a.name}`}>
                    {i > 0 && ' + '}
                    <a
                      href="#"
                      className="recommended-anchor-link"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onNavigate(`/repo/${a.owner}/${a.name}`)
                      }}
                    >
                      {a.name}
                    </a>
                  </Fragment>
                ))}
              </div>
            )}
```

After deletion, `.repo-card-top-text` should contain only the `.repo-card-name` `<div>` and the optional description `<p>`.

- [ ] **Step 2: Check whether `Fragment` is still referenced**

Use the Grep tool with `pattern: "Fragment"`, `path: "src/components/RepoCard.tsx"`, `output_mode: "content"`, `-n: true`.

If the only remaining hit is the import on line 1, remove `Fragment` from that import. Line 1 should go from:

```tsx
import { Fragment, useState, useEffect, useRef, memo } from 'react'
```

to:

```tsx
import { useState, useEffect, useRef, memo } from 'react'
```

If there are other `Fragment` hits (there shouldn't be — this is the only usage today), leave the import alone.

- [ ] **Step 3: Add the new anchor strip as a sibling of `.repo-card-info`**

Insert the new block **between** the `</div>` that closes `.repo-card-info` (currently at line 350) and the `</div>` that closes `.repo-card` (line 351). After the edit, the bottom of the component's return should look like this:

```tsx
        </div>
      </div>
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
    </div>
  )
})
```

**Important:**
- The strip is a child of `.repo-card` (`<div ref={cardRef} className={'repo-card…'}>` at line 217–221), **not** a child of `.repo-card-info`. The first two `</div>`s above close `.repo-card-footer` and `.repo-card-info`.
- `type="button"` is required so the chip never accidentally submits a form if the card is later placed in a form context.
- `alt=""` on the avatar is intentional — the avatar is decorative; the accessible name is the adjacent `.repo-card-anchor-name` text.

- [ ] **Step 4: Type-check the change**

Run: `npm run build`

Expected: TypeScript succeeds. The `a.avatar_url` access is valid because Task 1 added the field. The build also bundles the renderer; surface any type errors here. (If you only want type-checking without bundling, `npx tsc --noEmit` works, but the repo's standard gate is `npm run build`.)

- [ ] **Step 5: Run the test suite**

Run: `npm run test`

Expected: all tests pass. This change has no dedicated component test (none exists today) but should not break any existing test. Watch especially for tests that import from `src/types/recommendation.ts` or `src/components/RepoCard.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/RepoCard.tsx
git commit -m "$(cat <<'EOF'
refactor(discover): replace inline anchor caption with a new strip

Remove the "Because you starred X + Y" caption from inside the
description and render it as a new zone-3 strip below the footer,
with avatar+name chips per anchor. CSS follows in the next commit;
the strip renders unstyled between commits.
EOF
)"
```

---

## Task 3: Swap anchor caption CSS for strip + chip styles

**Goal:** Remove the dead `.recommended-anchor-caption` / `.recommended-anchor-link` rules and add the new `.repo-card-anchors*` rules so the strip renders with the mid-grey glass treatment.

**Files:**
- Modify: `src/styles/globals.css:9860-9874` (delete old rules) and an adjacent insertion point for the new rules.

- [ ] **Step 1: Delete the old caption CSS**

In `src/styles/globals.css`, delete the block at lines 9860–9874:

```css
/* DELETE THIS BLOCK */
/* Recommended-mode anchor caption ("Because you starred X + Y") */
.recommended-anchor-caption {
  font-size: 0.78rem;
  color: var(--t3);
  font-style: italic;
  margin: 4px 0;
}
.recommended-anchor-link {
  color: var(--t2);
  text-decoration: none;
  font-style: normal;
}
.recommended-anchor-link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 2: Add the new strip + chip CSS in the same location**

In place of the deleted block, insert:

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

The parent `.repo-card` has `overflow: hidden` + `border-radius: 10px` (see `globals.css:1784-1794`), so the strip inherits the card's bottom corner rounding automatically — do not add explicit border-radius declarations to `.repo-card-anchors`.

- [ ] **Step 3: Verify no other selectors reference the deleted classes**

Use the Grep tool with `pattern: "recommended-anchor-caption|recommended-anchor-link"` and no `path` (defaults to the whole repo). Expected: zero hits anywhere under `src/` or `electron/`. The old classes were used only in `RepoCard.tsx` (removed in Task 2) and `globals.css` (removed in this task).

- [ ] **Step 4: Build to confirm CSS parses**

Run: `npm run build`

Expected: build succeeds. Vite surfaces CSS parse errors at build time; if the new rules have a typo, you'll see it here.

- [ ] **Step 5: Run the test suite**

Run: `npm run test`

Expected: all tests pass (no tests touch these classes).

- [ ] **Step 6: Manual visual verification**

The user verifies UI changes themselves (per repo convention). After committing, hand off and ask them to confirm:

- A Recommended card with ≥1 anchor shows the new strip below the footer with a mid-grey glass background, a top divider, and chips rendering as `[avatar] name`.
- A Recommended card with 0 anchors shows no strip (card retains its previous height).
- The "All" tab shows no strip on any card.
- Hovering a chip lifts its background to `rgba(255,255,255,0.12)` and turns the text white; the rest of the card does not hover-lift.
- Clicking a chip navigates to that anchor's repo page without triggering the card's own navigate.
- Clicking the label text or the empty gap between chips does nothing (card does not navigate).

- [ ] **Step 7: Commit**

```bash
git add src/styles/globals.css
git commit -m "$(cat <<'EOF'
style(discover): add glass strip + chip styles for recommended-card anchors

Swap the old .recommended-anchor-caption rules for .repo-card-anchors
and chip styles that implement the mid-grey glass treatment described
in the design doc. Inherits bottom corner rounding from the parent
.repo-card (overflow: hidden + border-radius: 10px).
EOF
)"
```

---

## Post-implementation checklist

- [ ] `npm run test` passes green
- [ ] `npm run build` completes without errors
- [ ] No hits for `recommended-anchor-caption` or `recommended-anchor-link` anywhere in the repo (Grep with no `path` set)
- [ ] User has visually confirmed the new strip on a Recommended card
- [ ] Three commits landed in order: `feat(recommend)`, `refactor(discover)`, `style(discover)`

## Out of scope (do not do)

- Changing anchor selection, ordering, or the two-anchor display cap.
- Adding a RepoCard component test (none exists today; introducing a component-test harness is a separate concern).
- Surfacing `anchor.reasons[]` in the UI.
- Any visual change to the "All" tab.
- Responsive tweaks beyond `flex-wrap: wrap`, which already handles narrow cards gracefully.
