# Repo Detail Header Meta Design

**Date:** 2026-04-16
**Status:** Draft

## Summary

Refresh the expanded repo view (`RepoDetail`) header so that (a) the repo description appears directly below the title, (b) language and category pills sit on the right side of the title row (with visible labels, replacing their existing sidebar rows), and (c) the translation indicator in the action row is restyled Twitter-style with the transparent Git Suite logo on the left. All changes are confined to the `ArticleLayout` top panel and the sidebar's Repository metadata block — tab structure, body rendering, verification badge, and action buttons are unchanged.

## Current State

### Header (`src/components/ArticleLayout.tsx` + `src/views/RepoDetail.tsx`)

Top-panel order inside `ArticleLayout`:

```
navbar
byline          (avatar · owner · updated-date)
dither banner
title           (repo-name + verification badge)
action row      (Learn · Star · Download · ───── translation indicator)
tabs
```

- The repo **description** (`repo.description`) is not rendered anywhere in the header — it is only consumed internally to classify component libraries (`RepoDetail.tsx:506-507`).
- **Title row** (`ArticleLayout.css:111-121`) is a flex row holding only the name + verification badge. It has no right-aligned slot.
- **Language and category pills** live in the sidebar's Repository panel (`RepoDetail.tsx:1606-1638`) as rows of a `key: val` list. The language uses `<LanguageIcon boxed size={14}>` (18 px colored box, white icon); the category uses an 18 px `typeConfig.accentColor` box with a 12 px icon. Both are followed by the text value on the right.
- **Translation indicator** (`RepoDetail.tsx:1854-1873`, styled in `globals.css:5298-5320`) renders on the right edge of the action row as plain 11 px text: `Translated from <Language>` followed by a `View original` / `Show translation` accent-color button. No logo.

### Logo assets

- `src/assets/logo.png` — the opaque logo used by `NavBar`, `DiscoverLanding`, `DiscoverSidebar`.
- `Git Suite logo 2.png` (repo root, untracked) — the transparent variant with no background fill, currently not imported anywhere.

## Proposed State

```
┌─ article panel (glass) ──────────────────────────────────────────┐
│  ●  lucidrains · Updated Nov 5                                   │
│                                                                  │
│  ▬ dither banner ▬                                               │
│                                                                  │
│  vit-pytorch ✓                 [🟦 TS TypeScript] [🌐 Website]    │ ← title row
│  A Pytorch implementation of Vision Transformer, with the        │ ← description
│  simplest possible way to use it for image classification.       │
│                                                                  │
│  ───────────────────────────────────────────────────────────     │
│   🎓 Learn   ☆ Star   ⬇ Download   [⌾] Translated from French · Show original │
│  ───────────────────────────────────────────────────────────     │
│   README  Files  Skill Folder  …                                 │
│  ───────────────────────────────────────────────────────────     │
└──────────────────────────────────────────────────────────────────┘
```

### Change 1: `ArticleLayout` accepts title-row extras and a description line

**File:** `src/components/ArticleLayout.tsx`

Extend the props:

```ts
export type ArticleLayoutProps = {
  byline: React.ReactNode
  title: React.ReactNode
  titleExtras?: React.ReactNode    // NEW — rendered on right of title row
  description?: React.ReactNode    // NEW — rendered as own line below title row
  tabs: React.ReactNode
  body: React.ReactNode
  actionRow: React.ReactNode
  navBar?: React.ReactNode
  dither?: React.ReactNode
  fullBleedBody?: boolean
  scrollRef?: React.RefObject<HTMLDivElement>
}
```

Update the top-panel JSX (`ArticleLayout.tsx:96-111`):

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

The existing `article-layout-title` div no longer controls the row layout — it's now a child of the new `article-layout-title-row` wrapper.

### Change 2: New CSS for title row + description

**File:** `src/components/ArticleLayout.css`

Replace the current `.article-layout-title` block with:

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
  /* existing styles retained, but padding moves to .article-layout-title-row */
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--t1);
  min-width: 0;            /* allow flexible shrink before wrap */
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

**Wrap behavior:** when the panel is narrow, `.article-layout-title-extras` wraps onto its own line below the title via `flex-wrap: wrap` on the row. Title is never truncated. Column-gap only applies when both children are on the same line.

### Change 3: Language + category pills on the title row

**File:** `src/views/RepoDetail.tsx`

Alongside `titleNode` (~line 964), build a new `titleExtrasNode`:

```tsx
const titleExtrasNode = (
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
)
```

Then pass it to `ArticleLayout`:

```tsx
<ArticleLayout
  …
  title={titleNode}
  titleExtras={titleExtrasNode}
  description={repo?.description ? <>{repo.description}</> : undefined}
  …
/>
```

### Change 4: Pill styles in `globals.css`

Append to the repo-detail section of `src/styles/globals.css`:

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

The language pill re-uses `<LanguageIcon boxed size={16}>` — which renders a 20 px colored box with a white icon — so both pills are 20 px tall and visually symmetric.

### Change 5: Remove Language + Category from the sidebar

**File:** `src/views/RepoDetail.tsx` (~line 1608)

In the array passed to the Repository metadata block, drop the first two entries and their branching icon logic. The array becomes:

```tsx
{repo && ([
  { key: 'License',        val: formatLicense(repo.license) ?? '—' },
  { key: 'Size',           val: formatSize(repo.size) },
  { key: 'Watchers',       val: formatCount(repo.watchers) },
  { key: 'Default branch', val: repo.default_branch ?? 'main', isMono: true },
] as { key: string; val: string; isMono?: boolean }[]).map(({ key, val, isMono }) => (
  …
))}
```

The inline `isLang` / `isCat` rendering blocks are deleted along with the removed entries. The `LanguageIcon` import in `RepoDetail.tsx` stays (used by the new `titleExtrasNode`).

### Change 6: Transparent logo asset

Move `Git Suite logo 2.png` from the repo root into `src/assets/logo-transparent.png` so it's bundled by Vite and importable like the existing `logo.png`. The file at the repo root can be deleted after the copy, or kept as a source asset — either is fine.

### Change 7: Twitter-style translation indicator

**File:** `src/views/RepoDetail.tsx`

At the top of the file (alongside other asset imports around line 1-50):

```tsx
import logoTransparent from '../assets/logo-transparent.png'
```

Update the translation block in `RepoArticleActionRow` (`RepoDetail.tsx:1854-1873`):

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

**File:** `src/styles/globals.css` — update the existing `.article-action-translation` block:

```css
.article-action-translation {
  display: flex;
  align-items: center;
  gap: 8px;                  /* tighter so logo + text feel connected */
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

/* .article-action-translation-text — no new rules needed */
/* .article-action-translation-toggle — unchanged from current */
```

Wording remains identical to current; only the logo is added and the gap is tightened slightly (10 px → 8 px) so the logo feels tied to the text rather than floating.

## Edge Cases

- **No description**: `repo.description` is `null` or empty string → the `description` prop is `undefined` → `ArticleLayout` renders no `.article-layout-description` element. No empty row appears.
- **Missing language**: `repo.language` is null or `'—'` → language pill is omitted. Category pill still renders.
- **No category match**: `typeConfig` is null (repo has no classified bucket/sub) → category pill is omitted. Language pill still renders.
- **Both missing**: neither pill renders → `titleExtrasNode` is empty fragment → `.article-layout-title-extras` is either empty (no visual impact) or we can wrap the whole block in a conditional. Simpler to always render the empty fragment — browser paints nothing.
- **Very long title**: title takes its natural width up to the available space, pills wrap onto the next line via `flex-wrap: wrap`. Title is never truncated.
- **Very long description**: wraps onto as many lines as needed; no truncation.
- **Translation indicator + long action row**: existing `margin-left: auto` on `.article-action-translation` keeps it flush right regardless of how many action buttons precede it. Logo is 14 px so its footprint is negligible.

## Out of Scope

- Verification badge behavior, sizing, or positioning (stays adjacent to title).
- Action row buttons (Learn / Star / Download) styling and behavior.
- Dither banner, byline, navbar.
- Sidebar rows other than Language + Category (Stats panel, Skills Folder, License/Size/Watchers/Default branch, Badges, Topics, Related).
- Tab bar, tab body rendering.
- Translation logic, language detection, cache behavior (`setReadmeTranslated`, etc.).
- Replacing the existing `LanguageIcon` component or its API.

## Files Touched

| File | Change |
|---|---|
| `src/components/ArticleLayout.tsx` | Add `titleExtras` + `description` props, restructure top-panel JSX |
| `src/components/ArticleLayout.css` | Replace `.article-layout-title` block with `.article-layout-title-row`/`-title`/`-title-extras`/`-description` |
| `src/views/RepoDetail.tsx` | Build `titleExtrasNode`, pass it + description to `ArticleLayout`, remove Language+Category from sidebar array, import transparent logo, add `<img>` to translation block |
| `src/styles/globals.css` | Add `.repo-detail-header-pill*` rules, add `.article-action-translation-logo`, tighten `.article-action-translation` gap |
| `src/assets/logo-transparent.png` | New asset (copied from `Git Suite logo 2.png` at repo root) |

## Testing / Verification

No automated tests exist for `ArticleLayout` or `RepoDetail` header markup. Manual verification path (user handles):

1. Open a repo with a non-null description, a known language, and a classified category → expect pills on title row and description below.
2. Open a repo with `description: null` → no description row, title row still renders.
3. Open a repo whose README is translated (e.g. a French README with English preferred) → transparent logo appears left of "Translated from French · Show original".
4. Narrow the window until the title row wraps → pills drop below the title, title stays readable.
5. Confirm the Language and Category rows are gone from the sidebar Repository panel.
