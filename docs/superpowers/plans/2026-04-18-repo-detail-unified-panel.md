# Repo Detail Unified Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the 3-column repo detail layout into a single unified panel, move the TOC inline as a right mini-sidebar, and move all sidebar metadata into a new Stats tab.

**Architecture:** Remove the 3-column CSS grid from RepoDetail; the article panel becomes the only panel. `ArticleLayout` gains a `tocSlot` prop that renders the TOC as a sticky right column inside the body when on the readme tab. All current right-sidebar content (stats, skills folder, repository, badges, topics, related) moves into a new `stats` tab rendered as a CSS grid of glass tiles.

**Tech Stack:** React 18, TypeScript, CSS (no CSS-in-JS framework), Electron

**Spec:** `docs/superpowers/specs/2026-04-18-repo-detail-unified-panel-design.md`

---

## File Map

| File | What changes |
|------|--------------|
| `src/styles/globals.css` | Replace 3-col grid with single-col; delete toc/sidebar panel classes; rename article panel class; update `library-detail-area` pointer-events; add stats tile grid |
| `src/components/ArticleLayout.tsx` | Add `tocSlot?: React.ReactNode` prop; conditional two-column body |
| `src/components/ArticleLayout.css` | Add `.article-layout-body--with-toc`, `.article-layout-body-content`, `.article-layout-toc-slot` styles |
| `src/views/RepoDetail.tsx` | Remove 3-col JSX; rename panel class; pass `tocSlot`; add `stats` tab + tile content |

---

## Task 1: Flatten the CSS grid to a single column

**Files:**
- Modify: `src/styles/globals.css:2337-2355` (`.repo-detail-layout` and `[data-fullbleed-tab]`)
- Modify: `src/styles/globals.css:2357-2410` (`.repo-detail-article-panel`, `.repo-detail-sidebar-panel`, `.repo-detail-toc-panel` blocks)
- Modify: `src/styles/globals.css:10233-10236` (`.library-detail-area` pointer-events)

- [ ] **Step 1: Replace `.repo-detail-layout` grid columns**

Find the `.repo-detail-layout` rule (around line 2337). Replace the `display: grid` and `grid-template-columns` / `gap` / `align-items: stretch` lines with a single-column grid:

```css
.repo-detail-layout {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  margin: 0 16px;
  padding-bottom: 96px;
  display: grid;
  grid-template-columns: minmax(0, 1100px);
  justify-content: center;
  overflow: hidden;
}

/* Files/Components tab: panel expands to fill available width */
.repo-detail-layout[data-fullbleed-tab] {
  grid-template-columns: minmax(0, 1600px);
}
```

- [ ] **Step 2: Rename `.repo-detail-article-panel` to `.repo-detail-panel`**

Find the `.repo-detail-article-panel` rule block (around line 2357). Rename the selector to `.repo-detail-panel` and remove the `grid-column: 2` and `transition: grid-column ...` declarations (no longer needed with single-column grid):

```css
.repo-detail-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 3: Delete `.repo-detail-sidebar-panel` and `.repo-detail-toc-panel` rule blocks**

Delete the entire `.repo-detail-sidebar-panel` rule block (around lines 2373-2389) and the entire `.repo-detail-toc-panel` rule block including its `@media` query (around lines 2391-2415). These elements will no longer exist.

- [ ] **Step 4: Update `.library-detail-area` pointer-events rule**

Find the rule around line 10233:
```css
.library-detail-area .repo-detail-install-error,
.library-detail-area .repo-detail-toc-panel,
.library-detail-area .repo-detail-article-panel,
.library-detail-area .repo-detail-sidebar-panel {
  pointer-events: auto;
}
```

Replace with:
```css
.library-detail-area .repo-detail-install-error,
.library-detail-area .repo-detail-panel {
  pointer-events: auto;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css
git commit -m "style(repo-detail): flatten 3-col grid to single unified panel column"
```

---

## Task 2: Add `tocSlot` prop to ArticleLayout

**Files:**
- Modify: `src/components/ArticleLayout.tsx:5-25` (props interface), `src/components/ArticleLayout.tsx:133-137` (body render)
- Modify: `src/components/ArticleLayout.css` (add toc layout styles)

- [ ] **Step 1: Add `tocSlot` to `ArticleLayoutProps`**

In `ArticleLayout.tsx`, add to the `ArticleLayoutProps` type (after the existing `scrollRef` prop on line 24):

```typescript
/** When provided, body renders as two columns: content | divider | toc. Pass only on readme tab. */
tocSlot?: React.ReactNode
```

- [ ] **Step 2: Destructure `tocSlot` in the function signature**

Add `tocSlot` to the destructured props on line 42 (the function parameter list).

- [ ] **Step 3: Update the body div render**

Replace lines 133-137 (the `article-layout-body` div):

```tsx
<div
  className={`article-layout-body${fullBleedBody ? ' article-layout-body--full-bleed' : ''}${tocSlot ? ' article-layout-body--with-toc' : ''}`}
>
  {tocSlot ? (
    <>
      <div className="article-layout-body-content">{body}</div>
      <div className="article-layout-toc-slot">{tocSlot}</div>
    </>
  ) : body}
</div>
```

- [ ] **Step 4: Add toc layout CSS to `ArticleLayout.css`**

Append to the end of `src/components/ArticleLayout.css`:

```css
/* ── Inline TOC layout (readme tab) ─────────────────────────────── */
.article-layout-body.article-layout-body--with-toc {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 0;          /* padding moves to .article-layout-body-content */
}

.article-layout-body-content {
  flex: 1;
  min-width: 0;
  padding: 20px 22px;
}

.article-layout-toc-slot {
  width: 200px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  border-left: 1px solid var(--glass-border);
  overflow-y: auto;
  max-height: 100vh;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ArticleLayout.tsx src/components/ArticleLayout.css
git commit -m "feat(article-layout): add tocSlot prop for inline right mini-sidebar"
```

---

## Task 3: Restructure RepoDetail layout JSX

**Files:**
- Modify: `src/views/RepoDetail.tsx:1066-1809`

This task removes the 3-column JSX structure and wires up `tocSlot`.

- [ ] **Step 1: Delete the `.repo-detail-toc-panel` div (lines 1067-1075)**

Remove this entire block:
```tsx
{activeTab === 'readme' && tocHeadings.length >= 2 && (
  <div className="repo-detail-toc-panel">
    <TocNav
      headings={tocHeadings}
      scrollContainerRef={articleBodyRef}
      headingsContainerRef={readmeBodyRef}
    />
  </div>
)}
```

- [ ] **Step 2: Rename `.repo-detail-article-panel` to `.repo-detail-panel` (line 1076)**

Change:
```tsx
<div className="repo-detail-article-panel">
```
To:
```tsx
<div className="repo-detail-panel">
```

- [ ] **Step 3: Add `tocSlot` prop to the `ArticleLayout` call**

Inside the `<ArticleLayout ... />` call (around line 1082), add the `tocSlot` prop after `scrollRef`:

```tsx
tocSlot={
  activeTab === 'readme' && tocHeadings.length >= 2
    ? <TocNav
        headings={tocHeadings}
        scrollContainerRef={articleBodyRef}
        headingsContainerRef={readmeBodyRef}
      />
    : undefined
}
```

- [ ] **Step 4: Delete the `.repo-detail-sidebar-panel` div (lines 1510-1808)**

Remove this entire block (from `<div className="repo-detail-sidebar-panel">` through its closing `</div>` on line 1808). The content will be moved to the stats tab in Task 5.

- [ ] **Step 5: Verify the outer structure closes correctly**

After the deletions, confirm the JSX structure closes cleanly:
```tsx
<div className="repo-detail-layout" data-fullbleed-tab={isFullBleedTab ? '' : undefined}>
  <div className="repo-detail-panel">
    {repoError ? (...) : (<ArticleLayout ... />)}
  </div>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "refactor(repo-detail): remove 3-col grid, wire tocSlot, delete sidebar panel"
```

---

## Task 4: Add the Stats tab

**Files:**
- Modify: `src/views/RepoDetail.tsx:413-425` (Tab type + ALL_TABS)

- [ ] **Step 1: Add `'stats'` to the `Tab` type (line 413)**

Change:
```typescript
type Tab = 'readme' | 'files' | 'skill' | 'releases' | 'collections' | 'related' | 'videos' | 'posts' | 'commands' | 'components'
```
To:
```typescript
type Tab = 'readme' | 'files' | 'skill' | 'releases' | 'collections' | 'related' | 'videos' | 'posts' | 'commands' | 'components' | 'stats'
```

- [ ] **Step 2: Add Stats entry to `ALL_TABS` (around line 424)**

Add as the last entry in `ALL_TABS`:
```typescript
{ id: 'stats', label: 'Stats' },
```

- [ ] **Step 3: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat(repo-detail): add stats tab to tab bar"
```

---

## Task 5: Stats tab content — tile grid

This task moves all sidebar content (currently deleted from JSX) into the stats tab render branch, wrapped in a tile grid layout.

**Files:**
- Modify: `src/views/RepoDetail.tsx` (add stats tab body + tile grid)
- Modify: `src/styles/globals.css` (add tile grid CSS)

- [ ] **Step 1: Add tile grid CSS to globals.css**

Find the stats/sidebar section in `globals.css` and append the tile styles:

```css
/* ── Stats tab tile grid ─────────────────────────────────────────── */
.stats-tab-grid {
  padding: 20px 22px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-content: start;
}

.stats-tile {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 2: Add stats tab body in RepoDetail**

In the `body={...}` prop of `ArticleLayout`, after the last existing tab branch (e.g. after the `components` tab block), add:

```tsx
{activeTab === 'stats' && !repoError && (
  <div className="stats-tab-grid">

    {/* ── Stats tile ── */}
    {repo && (
      <div className="stats-tile">
        <SidebarLabel>Stats</SidebarLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            { key: 'Forks',   val: formatCount(repo.forks),       icon: 'fork'  as const },
            { key: 'Issues',  val: formatCount(repo.open_issues), icon: 'issue' as const },
            ...(version !== '—' ? [{ key: 'Version', val: version, icon: 'tag' as const }] : []),
          ]).map(({ key, val, icon }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span style={{ fontFamily: 'Inter, sans-serif', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon === 'fork'  && <span style={{ fontSize: 12 }}>⑂</span>}
                {icon === 'issue' && <span style={{ fontSize: 12 }}>◎</span>}
                {icon === 'tag'   && <span style={{ fontSize: 12 }}>🏷</span>}
                {key}
              </span>
              <span style={{ fontFamily: icon === 'tag' ? 'JetBrains Mono, monospace' : 'Inter, sans-serif', color: 'var(--t2)', fontWeight: 500 }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* ── Skills Folder tile (only when learned) ── */}
    {learnState === 'LEARNED' && skillRow && (
      <div className="stats-tile">
        <SidebarLabel>Skills Folder</SidebarLabel>
        <div
          className="skill-hover-group"
          onMouseEnter={() => setHoveredBox('master')}
          onMouseLeave={() => setHoveredBox(null)}
        >
          <div className="sidebar-skill-panel">
            <div className="sidebar-skill-panel-header">
              <span className="sidebar-skill-panel-filename">{name}.skill.md</span>
              <span className="sidebar-skill-panel-badge">✓ active</span>
            </div>
            <div className="sidebar-skill-panel-body">
              {skillDepths && (() => {
                const total = Math.max(skillDepths.core + skillDepths.extended + skillDepths.deep, 1)
                return [
                  { label: 'Core',     lines: skillDepths.core,     color: '#059669', pct: Math.round(skillDepths.core / total * 100) },
                  { label: 'Extended', lines: skillDepths.extended, color: '#7c3aed', pct: Math.round((skillDepths.core + skillDepths.extended) / total * 100) },
                  { label: 'Deep',     lines: skillDepths.deep,     color: '#4c1d95', pct: 100 },
                ].map(({ label, lines, color, pct }) => (
                  <div key={label} className="sidebar-skill-depth-row">
                    <span className="sidebar-skill-depth-label">{label}</span>
                    <div className="sidebar-skill-depth-track">
                      <div className="sidebar-skill-depth-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="sidebar-skill-depth-count">~{lines}</span>
                  </div>
                ))
              })()}
              <div className="sidebar-skill-panel-meta">
                {skillRow.version ? `${skillRow.version} · ` : ''}{daysAgoLabel(skillRow.generated_at)}
              </div>
            </div>
          </div>
          <div className={`skill-hover-drawer${(hoveredBox === 'master' || relearningTarget === 'master') ? ' skill-hover-drawer--visible' : ''}`}>
            <button className="btn-drawer-regen" onClick={() => handleRelearnTarget('master')} disabled={relearningTarget !== null}>
              {relearningTarget === 'master' ? <><span className="spin-ring" style={{ width: 8, height: 8 }} /> Relearning…</> : '↺ Relearn'}
            </button>
            {(skillRow.tier ?? 1) < 2 && (
              <button className="btn-drawer-regen" onClick={handleEnhance} disabled={relearningTarget !== null} style={{ color: 'rgb(192,132,252)' }}>
                ✦ Enhance
              </button>
            )}
          </div>
        </div>
        {componentsSkillRow && (
          <div
            className="skill-hover-group"
            onMouseEnter={() => setHoveredBox('components')}
            onMouseLeave={() => setHoveredBox(null)}
            style={{ marginTop: 4 }}
          >
            <div className="sidebar-sub-skill-box">
              <div className="sidebar-sub-skill-header">
                <span className="sidebar-sub-skill-dot" style={{ background: '#6366f1' }} />
                <span className="sidebar-sub-skill-filename">{componentsSkillRow.filename}</span>
              </div>
              <div className="sidebar-sub-skill-meta">
                {(new Blob([componentsSkillRow.content]).size / 1024).toFixed(1)} KB
                {componentsSkillRow.generated_at ? ` · ${daysAgoLabel(componentsSkillRow.generated_at)}` : ''}
              </div>
            </div>
            <div className={`skill-hover-drawer${(hoveredBox === 'components' || relearningTarget === 'components') ? ' skill-hover-drawer--visible' : ''}`}>
              <button className="btn-drawer-regen" onClick={() => handleRelearnTarget('components')} disabled={relearningTarget !== null}>
                {relearningTarget === 'components' ? <><span className="spin-ring" style={{ width: 8, height: 8 }} /> Relearning…</> : '↺ Relearn'}
              </button>
            </div>
          </div>
        )}
        <div className="skills-folder-actions">
          <button className="btn-skills-folder-action" onClick={handleRelearnAll} disabled={relearningTarget !== null}>
            {relearningTarget !== null ? <><span className="spin-ring" style={{ width: 8, height: 8 }} /> Relearning…</> : '↺ Relearn all'}
          </button>
          {(skillRow.tier ?? 1) < 2 && (
            <button className="btn-skills-folder-action btn-skills-folder-action--enhance" onClick={handleEnhance} disabled={relearningTarget !== null}>
              ✦ Enhance all
            </button>
          )}
          {(skillRow.tier ?? 1) >= 2 && (
            <span className="skills-folder-enhanced-label">✦ Enhanced</span>
          )}
        </div>
      </div>
    )}

    {/* ── Repository tile ── */}
    <div className="stats-tile">
      <SidebarLabel>Repository</SidebarLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {repo && ([
          { key: 'License',        val: formatLicense(repo.license) ?? '—' },
          { key: 'Size',           val: formatSize(repo.size) },
          { key: 'Watchers',       val: formatCount(repo.watchers) },
          { key: 'Default branch', val: repo.default_branch ?? 'main', isMono: true },
        ] as { key: string; val: string; isMono?: boolean }[]).map(({ key, val, isMono }) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span style={{ fontFamily: 'Inter, sans-serif', color: 'var(--t3)' }}>{key}</span>
            <span style={{ fontFamily: isMono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif', color: 'var(--t2)', fontWeight: 500 }}>
              {val}
            </span>
          </div>
        ))}
      </div>
      <a
        href={`https://github.com/${owner}/${name}`}
        onClick={e => { e.preventDefault(); window.api.openExternal(`https://github.com/${owner}/${name}`) }}
        className="btn-view-github"
        style={{ width: '100%', marginTop: 6 }}
      >
        <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        View on GitHub ↗
      </a>
    </div>

    {/* ── Badge tiles (conditional, populated after README loads) ── */}
    {packageBadges.length > 0 && (
      <div className="stats-tile">
        <SidebarLabel>Packages</SidebarLabel>
        <div className="sidebar-badge-row">
          {packageBadges.map((b, i) => <BadgePill key={i} badge={b} />)}
        </div>
      </div>
    )}

    {qualityBadges.length > 0 && (
      <div className="stats-tile">
        <SidebarLabel>Quality</SidebarLabel>
        <div className="sidebar-badge-row">
          {qualityBadges.map((b, i) => <BadgePill key={i} badge={b} />)}
        </div>
      </div>
    )}

    {socialBadges.length > 0 && (
      <div className="stats-tile">
        <SidebarLabel>Community</SidebarLabel>
        <div className="sidebar-social-row">
          {socialBadges.map((b, i) => <SocialIcon key={i} badge={b} />)}
        </div>
      </div>
    )}

    {miscBadges.length > 0 && (
      <div className="stats-tile">
        <SidebarLabel>Badges</SidebarLabel>
        <div className="sidebar-badge-row">
          {miscBadges.map((b, i) => <BadgePill key={i} badge={b} />)}
        </div>
      </div>
    )}

    {/* ── Topics tile ── */}
    {topics.length > 0 && (
      <div className="stats-tile">
        <SidebarLabel>Topics</SidebarLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {topics.map(tag => (
            <button
              key={tag}
              className="repo-card-tag"
              onClick={() => navigate('/discover', { state: { preloadTag: tag } })}
              style={{ fontSize: 10, padding: '2px 8px' }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    )}

    {/* ── Related repos tile ── */}
    {sidebarRelated.length > 0 && (
      <div className="stats-tile">
        <SidebarLabel>Related repos</SidebarLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sidebarRelated.map(r => (
            <div key={r.id} className="sidebar-related-card" onClick={() => navigate(`/repo/${r.owner.login}/${r.name}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <img src={r.owner.avatar_url} alt={r.owner.login} style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}
                </span>
              </div>
              {r.description && (
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'var(--t3)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 4 }}>
                  {r.description}
                </div>
              )}
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                ★ {formatCount(r.stargazers_count)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. If errors appear, check that all referenced variables (`version`, `skillDepths`, `hoveredBox`, `relearningTarget`, `packageBadges`, `qualityBadges`, `socialBadges`, `miscBadges`, `topics`, `sidebarRelated`) are still in scope — they were previously used in the sidebar panel and should remain accessible.

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat(repo-detail): add stats tab with all sidebar content as tile grid"
```

---

## Notes for implementer

- **TOC sticky top offset:** The TOC slot uses `top: 0` relative to the `.article-layout` scroll container. If the sticky header's tab bar visually overlaps the TOC on initial load, adjust `top` to match the tab bar height (approximately 40px). The tab bar is always visible in the sticky header.
- **`articleBodyRef`:** This is the `scrollRef` forwarded to `ArticleLayout` and already points to `.article-layout`. The `TocNav` scroll listener continues to work unchanged — no ref updates needed.
- **`isFullBleedTab`:** Already computed in `RepoDetail` and passed as `fullBleedBody` to `ArticleLayout`. The `data-fullbleed-tab` attribute on `.repo-detail-layout` still drives the max-width override via CSS. No logic changes needed.
- **Stats tab always visible:** The Stats tab appears unconditionally in the tab bar. The Repository tile always renders (even before `repo` data loads, though it'll be empty). This matches the previous sidebar behavior.
