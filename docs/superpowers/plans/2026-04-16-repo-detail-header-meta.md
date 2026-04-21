# Repo Detail Header Meta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the expanded repo view header: description below the title, language + category pills on the title row (visible labels, replacing their sidebar rows), and a Twitter-style translation indicator with the transparent Git Suite logo.

**Architecture:** Extend the existing `ArticleLayout` component with two new optional slots (`titleExtras` and `description`). Build pill nodes in `RepoDetail` using the already-existing `LanguageIcon` and `typeConfig` (no new shared component — the two pills are used in exactly one place). Remove Language + Category rows from the sidebar array so the information doesn't appear twice. Move the existing transparent logo PNG from the repo root into `src/assets/` so Vite bundles it, then render it inline inside the existing translation indicator.

**Tech Stack:** React 18, TypeScript, Vite, CSS (globals.css + ArticleLayout.css), vitest + @testing-library/react for the `ArticleLayout` contract test.

**Spec:** [2026-04-16-repo-detail-header-meta-design.md](../specs/2026-04-16-repo-detail-header-meta-design.md)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/components/ArticleLayout.tsx` | Add `titleExtras` and `description` optional props; restructure the top-panel JSX so the title shares a flex row with an extras slot and the description renders as its own line below |
| Modify | `src/components/ArticleLayout.css` | Replace the single `.article-layout-title` rule block with `.article-layout-title-row`, `.article-layout-title`, `.article-layout-title-extras`, `.article-layout-description` |
| Create | `src/components/ArticleLayout.test.tsx` | Smoke tests for the new slots: description renders when provided / is omitted when absent; titleExtras renders when provided |
| Modify | `src/views/RepoDetail.tsx` | Build `titleExtrasNode` (language + category pills), pass it and `repo.description` to `ArticleLayout`, remove Language/Category entries from the sidebar array, import and render the transparent logo inside `RepoArticleActionRow`'s translation block |
| Modify | `src/styles/globals.css` | Add `.repo-detail-header-pill` / `-label` / `-cat-icon` rules; add `.article-action-translation-logo` rule; tighten `.article-action-translation` gap from 10 px → 8 px |
| Create | `src/assets/logo-transparent.png` | Transparent logo asset copied from the existing `Git Suite logo 2.png` at repo root so Vite bundles it |

---

### Task 1: Extend ArticleLayout with `titleExtras` and `description` slots

**Files:**
- Modify: `src/components/ArticleLayout.tsx` (props + top-panel JSX)
- Modify: `src/components/ArticleLayout.css` (title-row, title, title-extras, description rules)
- Create: `src/components/ArticleLayout.test.tsx` (slot contract tests)

The `ArticleLayout` component currently exposes `byline`, `title`, `tabs`, `body`, `actionRow`, and optional `navBar`, `dither`, `fullBleedBody`, `scrollRef`. This task adds two optional slots that `RepoDetail` will consume: `titleExtras` (right side of title row) and `description` (own line below title row). No existing consumer needs to change — both new props are optional.

- [ ] **Step 1: Write the failing test for ArticleLayout slot contract**

Create `src/components/ArticleLayout.test.tsx`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { ArticleLayout } from './ArticleLayout'

// jsdom does not provide ResizeObserver; ArticleLayout measures its top panel
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const baseProps = {
  byline: <div>byline</div>,
  title: <span>title</span>,
  tabs: <div>tabs</div>,
  body: <div>body</div>,
  actionRow: <div>actions</div>,
}

describe('ArticleLayout', () => {
  it('renders without description or title-extras when props omitted', () => {
    const { container } = render(<ArticleLayout {...baseProps} />)
    expect(container.querySelector('.article-layout-description')).toBeNull()
    expect(container.querySelector('.article-layout-title-extras')).toBeNull()
  })

  it('renders description when description prop provided', () => {
    const { container, getByText } = render(
      <ArticleLayout {...baseProps} description={<span>A repo description.</span>} />,
    )
    const desc = container.querySelector('.article-layout-description')
    expect(desc).toBeTruthy()
    expect(getByText('A repo description.')).toBeTruthy()
  })

  it('renders titleExtras inside the title row when provided', () => {
    const { container, getByText } = render(
      <ArticleLayout {...baseProps} titleExtras={<span>extras</span>} />,
    )
    const extras = container.querySelector('.article-layout-title-extras')
    expect(extras).toBeTruthy()
    expect(getByText('extras')).toBeTruthy()
    // title-extras is a sibling of article-layout-title inside article-layout-title-row
    const row = container.querySelector('.article-layout-title-row')
    expect(row?.querySelector('.article-layout-title')).toBeTruthy()
    expect(row?.querySelector('.article-layout-title-extras')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/components/ArticleLayout.test.tsx`
Expected: FAIL — the assertions on `.article-layout-title-row`, `.article-layout-title-extras`, and `.article-layout-description` will fail because those classes do not yet exist in the component's output.

- [ ] **Step 3: Update the ArticleLayout component props + JSX**

Edit `src/components/ArticleLayout.tsx`.

Replace the `ArticleLayoutProps` type (currently lines 5-19):

```typescript
export type ArticleLayoutProps = {
  byline: React.ReactNode
  title: React.ReactNode
  /** Optional right-side content on the title row (e.g. metadata pills) */
  titleExtras?: React.ReactNode
  /** Optional description line below the title row */
  description?: React.ReactNode
  tabs: React.ReactNode
  body: React.ReactNode
  actionRow: React.ReactNode
  /** Optional nav/breadcrumb bar rendered above the byline; collapses with the rest of the top panel */
  navBar?: React.ReactNode
  /** Optional dithered banner rendered between byline and title */
  dither?: React.ReactNode
  /** When true, body renders without internal padding (for Files / Components tabs) and the smart-collapse is disabled */
  fullBleedBody?: boolean
  /** Forwarded ref to the scroll container (the .article-layout element itself) */
  scrollRef?: React.RefObject<HTMLDivElement>
}
```

Destructure the two new props in the function signature (currently lines 23-33):

```typescript
export function ArticleLayout({
  byline,
  title,
  titleExtras,
  description,
  tabs,
  body,
  actionRow,
  navBar,
  dither,
  fullBleedBody = false,
  scrollRef,
}: ArticleLayoutProps) {
```

Update the top-panel JSX (currently lines 101-107) to replace the single `<div className="article-layout-title">{title}</div>` line with a wrapping row plus optional description:

```tsx
<div ref={topPanelRef} className="article-layout-top-panel">
  {navBar && <div className="article-layout-navbar-slot">{navBar}</div>}
  <div className="article-layout-byline">{byline}</div>
  {dither && <div className="article-layout-dither">{dither}</div>}
  <div className="article-layout-title-row">
    <div className="article-layout-title">{title}</div>
    {titleExtras && <div className="article-layout-title-extras">{titleExtras}</div>}
  </div>
  {description && <div className="article-layout-description">{description}</div>}
  <div className="article-layout-actions">{actionRow}</div>
</div>
```

- [ ] **Step 4: Update the ArticleLayout CSS**

Edit `src/components/ArticleLayout.css`. Replace the existing `.article-layout-title` block (currently lines 111-121) with the following four blocks:

```css
.article-layout-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  column-gap: 16px;
  row-gap: 8px;
  padding: 0 20px 8px;
}

.article-layout-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--t1);
  min-width: 0;
  flex: 1 1 auto;
}

.article-layout-title-extras {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.article-layout-description {
  padding: 0 20px 10px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--t3);
}
```

Key differences from the old `.article-layout-title` block: the padding moved to the row wrapper so the wrapper can properly host the extras slot; the title itself now has `flex: 1 1 auto; min-width: 0;` so it can shrink or grow within the row without truncating (`flex-wrap: wrap` on the row lets the extras drop below when space is tight).

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run src/components/ArticleLayout.test.tsx`
Expected: PASS — all three tests green.

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: all tests pass. If `TocNav`, `RepoDetail`, or any other test that touches `ArticleLayout` fails, investigate — the old `.article-layout-title` class is preserved, so existing selectors should still match.

- [ ] **Step 7: Commit**

```bash
git add src/components/ArticleLayout.tsx src/components/ArticleLayout.css src/components/ArticleLayout.test.tsx
git commit -m "feat(article-layout): add titleExtras and description slots"
```

---

### Task 2: Show repo description in the expanded repo header

**Files:**
- Modify: `src/views/RepoDetail.tsx` (pass `description` to `ArticleLayout`)

No new logic — just wire `repo.description` through to the new slot. Visual verification happens in Task 5 at the end.

- [ ] **Step 1: Pass description to ArticleLayout**

Edit `src/views/RepoDetail.tsx`. Locate the `<ArticleLayout …>` call around line 1024. Immediately after `title={titleNode}`, add a `description` prop:

```tsx
<ArticleLayout
  navBar={<NavBar />}
  byline={bylineNode}
  dither={<DitherBackground avatarUrl={repo?.avatar_url} fallbackGradient={ditherGradient} />}
  title={titleNode}
  description={repo?.description ? <>{repo.description}</> : undefined}
  tabs={tabsNode}
  scrollRef={articleBodyRef}
  body={/* …unchanged… */}
  actionRow={/* …unchanged… */}
  fullBleedBody={isFullBleedTab}
/>
```

`repo.description` is already typed as `string | null` on the `RepoDetail` repo record. The inline fragment (`<>{repo.description}</>`) lets us pass a ReactNode to the slot while keeping the falsy case (`null` / empty string) returning `undefined`, which makes `ArticleLayout` skip the `.article-layout-description` div entirely.

- [ ] **Step 2: Run tests to confirm nothing regressed**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat(repo-detail): show description below title"
```

---

### Task 3: Show language + category pills on the title row; remove their sidebar rows

**Files:**
- Modify: `src/views/RepoDetail.tsx` (build `titleExtrasNode`, pass to `ArticleLayout`, remove Language/Category from sidebar array)
- Modify: `src/styles/globals.css` (add `.repo-detail-header-pill*` rules)

This task combines two changes that belong together semantically: putting the pills on the header and removing the now-redundant sidebar rows.

- [ ] **Step 1: Add pill CSS to globals.css**

Edit `src/styles/globals.css`. Append these rules to the repo-detail section (anywhere after the existing `.article-action-translation*` block around line 5320 is fine — group them near other repo-detail header styles if you can find an obvious section, otherwise just append before the next unrelated section):

```css
.repo-detail-header-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'Inter', sans-serif;
}

.repo-detail-header-pill-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--t2);
  white-space: nowrap;
}

.repo-detail-header-pill-cat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Build the `titleExtrasNode` in RepoDetail.tsx**

Edit `src/views/RepoDetail.tsx`. Immediately after the existing `titleNode` definition (around lines 964-969), add:

```tsx
const titleExtrasNode = (repo?.language && repo.language !== '—') || typeConfig ? (
  <>
    {repo?.language && repo.language !== '—' && (
      <span className="repo-detail-header-pill">
        <LanguageIcon lang={repo.language} size={16} boxed />
        <span className="repo-detail-header-pill-label">{repo.language}</span>
      </span>
    )}
    {typeConfig && (() => {
      const CatIcon = typeConfig.icon
      return (
        <span className="repo-detail-header-pill">
          <span
            className="repo-detail-header-pill-cat-icon"
            style={{ background: typeConfig.accentColor }}
          >
            {CatIcon && <CatIcon size={14} fill="#fff" stroke="#fff" />}
          </span>
          <span className="repo-detail-header-pill-label">{typeConfig.label}</span>
        </span>
      )
    })()}
  </>
) : null
```

`LanguageIcon` is already imported at the top of the file (line 18). `typeConfig` and the `getSubTypeConfig` helper are already in scope (line 892).

Ternary `… ? <>…</> : null` is intentional: when both language and category are unavailable, `titleExtrasNode` is `null` and `ArticleLayout` skips the `.article-layout-title-extras` wrapper entirely (no empty div in the DOM).

- [ ] **Step 3: Pass `titleExtras` to ArticleLayout**

In the same file, add the prop to the `<ArticleLayout>` call. Place it right after the `title={titleNode}` line (and alongside the `description` prop from Task 2):

```tsx
title={titleNode}
titleExtras={titleExtrasNode}
description={repo?.description ? <>{repo.description}</> : undefined}
```

- [ ] **Step 4: Remove Language + Category from the sidebar Repository array**

In the same file, locate the Repository metadata array (currently lines 1608-1614). Delete the first two entries (`Language` and `Category`). The array becomes:

```tsx
{repo && ([
  { key: 'License',        val: formatLicense(repo.license) ?? '—' },
  { key: 'Size',           val: formatSize(repo.size) },
  { key: 'Watchers',       val: formatCount(repo.watchers) },
  { key: 'Default branch', val: repo.default_branch ?? 'main', isMono: true },
] as { key: string; val: string; isMono?: boolean }[]).map(({ key, val, isMono }) => (
```

Also remove `isLang?: boolean; isCat?: boolean;` from the inline type annotation (shown in the snippet above — the new type only needs `isMono?`).

Then, inside the `.map(...)` body, delete the two conditional icon blocks that render the language icon and the category icon (currently lines 1625-1633):

```tsx
// DELETE these lines
{isLang && val !== '—' && <LanguageIcon lang={val} size={14} boxed />}
{isCat && typeConfig?.icon && (() => { const CatIcon = typeConfig.icon!; return (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, background: typeConfig.accentColor, borderRadius: 3, flexShrink: 0,
  }}>
    <CatIcon size={12} fill="#fff" stroke="#fff" />
  </span>
) })()}
```

Also remove `isLang` and `isCat` from the destructuring in the `.map` callback — the callback becomes `({ key, val, isMono })` only.

`LanguageIcon` is still imported and still used (by `titleExtrasNode` from Step 2). Do not remove the import.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass. No test asserts the presence of Language/Category rows in the sidebar, so nothing should fail — but run it to confirm.

- [ ] **Step 6: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat(repo-detail): show language+category pills on title row, remove sidebar rows"
```

---

### Task 4: Twitter-style translation indicator with transparent logo

**Files:**
- Create: `src/assets/logo-transparent.png` (copy of `Git Suite logo 2.png`)
- Modify: `src/views/RepoDetail.tsx` (import, `<img>` in translation block)
- Modify: `src/styles/globals.css` (`.article-action-translation-logo` rule + gap tweak)

- [ ] **Step 1: Move the transparent logo asset into src/assets/**

Run from the repo root:

```bash
mv "Git Suite logo 2.png" src/assets/logo-transparent.png
```

(The non-transparent `Git Suite logo.png` at the repo root is out of scope — leave it alone.)

Verify the new file exists:

Run: `ls -la src/assets/logo-transparent.png`
Expected: file listed, ~150 KB.

- [ ] **Step 2: Import the transparent logo in RepoDetail.tsx**

Edit `src/views/RepoDetail.tsx`. Near the other asset-ish imports at the top of the file (around line 18 where `LanguageIcon` lives, or alongside the component imports around lines 11-20), add:

```tsx
import logoTransparent from '../assets/logo-transparent.png'
```

- [ ] **Step 3: Add `<img>` to the translation block**

In the same file, locate `RepoArticleActionRow`'s translation block (currently lines 1854-1873). Replace the block with:

```tsx
{translationStatus && (translationStatus.translating || translationStatus.translated) && (
  <div className="article-action-translation">
    <img
      src={logoTransparent}
      alt=""
      className="article-action-translation-logo"
      aria-hidden="true"
    />
    <span className="article-action-translation-text">
      {translationStatus.translating
        ? '⟳ Translating README...'
        : translationStatus.detectedLang === 'switcher'
          ? 'Showing preferred language version'
          : `Translated from ${LANGUAGE_NAMES[translationStatus.detectedLang ?? ''] ?? translationStatus.detectedLang}`
      }
    </span>
    {translationStatus.translated && !translationStatus.translating && (
      <button
        className="article-action-translation-toggle"
        onClick={translationStatus.onToggleOriginal}
      >
        {translationStatus.showOriginal ? 'Show translation' : 'View original'}
      </button>
    )}
  </div>
)}
```

Only diff from current: the `<img>` is inserted as the first child. Text and button logic are unchanged.

Note the import: `logoTransparent` is defined at the top of the file (Step 2) and is in scope inside `RepoArticleActionRow` because the component is declared in the same file below `RepoDetail`.

- [ ] **Step 4: Add logo CSS + tighten the translation gap**

Edit `src/styles/globals.css`. Locate the existing `.article-action-translation` block (currently lines 5298-5306). Update it to tighten the gap and add a new rule for the logo:

```css
.article-action-translation {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: var(--t3);
}

.article-action-translation-logo {
  width: 14px;
  height: 14px;
  opacity: 0.7;
  flex-shrink: 0;
}
```

Only two changes in the existing block: `gap: 10px` → `gap: 8px`. The new `.article-action-translation-logo` block can go immediately after the `.article-action-translation` block and before `.article-action-translation-toggle`. Leave `.article-action-translation-toggle` and `.article-action-translation-toggle:hover` unchanged.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css src/assets/logo-transparent.png
git commit -m "feat(repo-detail): twitter-style translation indicator with transparent logo"
```

---

### Task 5: Manual visual verification

No test covers the final rendered header or pills, so the user manually verifies the result. Confirm with the user before closing out.

- [ ] **Step 1: Ask the user to open a repo and verify**

Check the following on at least one repo with a non-null description, known language, and classified category:

1. Description appears directly below the title, wraps onto multiple lines if long, muted color.
2. Language and category pills appear on the right side of the title row with their colored icon boxes and visible labels (14 px).
3. Language and Category rows are **gone** from the sidebar's Repository panel; License, Size, Watchers, Default branch remain.
4. On a translated README (e.g. a French README with English preferred), the transparent Git Suite logo appears left of "Translated from French" + "View original" link.
5. Narrowing the panel makes the pills wrap below the title; the title is never truncated.
6. On a repo with `description: null`, no empty description row renders — the action row sits directly below the title row.

If any of these fail, the user reports back and we iterate before closing.

- [ ] **Step 2: No commit for this task** — manual verification only.

---

## Out of Scope / Deferred

Explicitly not part of this plan (see spec §"Out of Scope"):

- Changes to verification badge, action buttons, dither banner, byline, navbar.
- Other sidebar rows (Stats, Skills Folder, License/Size/Watchers/Default branch, Badges, Topics, Related).
- Tab bar, tab body rendering.
- Translation logic, language detection, cache behavior.
- Refactoring `LanguageIcon` or extracting a shared pill component (the pills are used in one place).

## Risk Notes

- **CSS wrap behavior on narrow panels.** `flex-wrap: wrap` on `.article-layout-title-row` is the primary mechanism to keep the title readable when the extras are wide. If the user reports the title still gets cramped at typical panel widths, we may want to add a `min-width` on the title or force the wrap earlier with a media query. Not expected in the default layout (~900 px panel width) but worth watching.
- **`LanguageIcon` `boxed size=16`** renders a 20 px box (the helper adds +4). The category pill uses a 20 px box explicitly. If these diverge visually by a pixel on different zoom levels, we can force both to 20 px via the pill CSS. Not expected — the component's math is deterministic.
- **Existing `getSubTypeConfig` could return `null`** if `repo.type_sub` is null. That's already handled by the `typeConfig && (…)` check in `titleExtrasNode`.
