# Repo Detail Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the sidebar from RepoDetail, distributing its content into a Related tab, the Skill file tab, and an expandable stats bar row.

**Architecture:** Four self-contained tasks executed in order — (1) Related tab, (2) skill depths in skill tab, (3) expandable stats bar, (4) sidebar deletion. Each task leaves the app in a working state. The sidebar persists until Task 4, so content is never absent during the transition.

**Tech Stack:** React (TSX), CSS custom properties, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-27-repo-detail-layout-redesign.md`

---

## File Map

| File | Change |
|---|---|
| `src/views/RepoDetail.tsx` | All JSX and state changes |
| `src/views/RepoDetail.test.tsx` | New tests for each feature |
| `src/styles/globals.css` | Add new classes, delete sidebar classes |

---

## Task 1: Related Repos Tab

Move related repos from the sidebar into a new "Related" tab with a card grid layout.

**Files:**
- Modify: `src/views/RepoDetail.tsx` (lines 46–52, 66, 180, 349–378)
- Modify: `src/views/RepoDetail.test.tsx`
- Modify: `src/styles/globals.css` (after line 1363 — after `.related-repo-stars`)

---

- [ ] **Step 1: Add `library` mock to `setupDetail` helper**

The existing `setupDetail` helper in `src/views/RepoDetail.test.tsx` does not mock `window.api.library`. The component calls `window.api.library.getCollections(repo.id)` in a `useEffect`, so every test using `setupDetail` will throw when a repo loads. Add the missing key to the mock object inside `setupDetail` (after the `skill` key):

```tsx
library: {
  getCollections: vi.fn().mockResolvedValue([]),
},
```

- [ ] **Step 2: Write failing tests**

Add to `src/views/RepoDetail.test.tsx`, inside a new `describe` block after the existing ones:

```tsx
describe('RepoDetail related tab', () => {
  it('does not show Related tab when related repos is empty', async () => {
    setupDetail(null)
    await waitFor(() => screen.getAllByText('next.js'))
    expect(screen.queryByRole('button', { name: 'Related' })).not.toBeInTheDocument()
  })

  it('shows Related tab and cards when related repos are provided', async () => {
    Object.defineProperty(window, 'api', {
      value: {
        github: {
          getRepo: vi.fn().mockResolvedValue(repoRow),
          getReleases: vi.fn().mockResolvedValue([]),
          getRelatedRepos: vi.fn().mockResolvedValue([
            {
              owner: 'facebook', name: 'react', description: 'A JS library',
              language: 'JavaScript', stars: 200000, forks: 40000,
              open_issues: 1000, watchers: 200000, size: 30000,
              license: 'MIT', topics: '[]', updated_at: '2024-01-01', saved_at: null,
            },
          ]),
          getReadme: vi.fn().mockResolvedValue(null),
          saveRepo: vi.fn().mockResolvedValue(undefined),
          searchRepos: vi.fn().mockResolvedValue([]),
          getSavedRepos: vi.fn().mockResolvedValue([]),
        },
        settings: {
          get: vi.fn(), set: vi.fn(),
          getApiKey: vi.fn().mockResolvedValue(null),
          setApiKey: vi.fn(),
        },
        skill: {
          generate: vi.fn(),
          get: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
          detectClaudeCode: vi.fn().mockResolvedValue(false),
        },
        library: { getCollections: vi.fn().mockResolvedValue([]) },
      },
      writable: true, configurable: true,
    })
    render(
      <MemoryRouter initialEntries={['/repo/vercel/next.js']}>
        <SavedReposProvider>
          <Routes>
            <Route path="/repo/:owner/:name" element={<RepoDetail />} />
          </Routes>
        </SavedReposProvider>
      </MemoryRouter>
    )
    const relatedTab = await waitFor(() => screen.getByRole('button', { name: 'Related' }))
    fireEvent.click(relatedTab)
    await waitFor(() => screen.getByText('react'))
  })
})
```

- [ ] **Step 3: Run tests to confirm the new tests fail**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run src/views/RepoDetail.test.tsx 2>&1 | tail -20
```

Expected: 2 new tests fail — "Related tab" not found / button not present.

- [ ] **Step 4: Extend Tab type and ALL_TABS**

In `src/views/RepoDetail.tsx`, update lines 46–52:

```tsx
type Tab = 'readme' | 'skill' | 'releases' | 'collections' | 'related'
const ALL_TABS: { id: Tab; label: string }[] = [
  { id: 'readme',      label: 'README' },
  { id: 'skill',       label: 'Skill file' },
  { id: 'releases',    label: 'Releases' },
  { id: 'collections', label: 'Collections' },
  { id: 'related',     label: 'Related' },
]
```

- [ ] **Step 5: Add Related tab visibility guard**

In `src/views/RepoDetail.tsx`, update the `visibleTabs` line (currently line 180):

```tsx
const visibleTabs = ALL_TABS.filter(t =>
  (t.id !== 'releases' || releases === 'loading' || hasReleases) &&
  (t.id !== 'related' || related.length > 0)
)
```

- [ ] **Step 6: Add Related tab content in the tab body**

In `src/views/RepoDetail.tsx`, add after the `collections` tab block (after its closing `}`, before `</div>` that closes `repo-detail-tab-body`):

```tsx
{activeTab === 'related' && (
  <div className="related-repos-grid">
    {related.map((r) => (
      <div
        key={`${r.owner}/${r.name}`}
        className="related-repo-card"
        onClick={() => navigate(`/repo/${r.owner}/${r.name}`)}
      >
        <span className="related-repo-name">{r.name}</span>
        {r.description && <p className="related-repo-desc">{r.description}</p>}
        <span className="related-repo-stars">★ {formatStars(r.stars)}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 7: Add CSS for related-repos-grid**

In `src/styles/globals.css`, add after the `.related-repo-stars` rule (after line 1363):

```css
.related-repos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  padding: 4px 0;
}
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run src/views/RepoDetail.test.tsx 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/views/RepoDetail.tsx src/views/RepoDetail.test.tsx src/styles/globals.css && git commit -m "feat(repo-detail): add Related tab with card grid layout"
```

---

## Task 2: Skill Depths in Skill Tab

Move the Core/Extended/Deep depth bars from the sidebar into the Skill file tab as a header section.

**Files:**
- Modify: `src/views/RepoDetail.tsx` (lines 314–319 — skill tab body)
- Modify: `src/views/RepoDetail.test.tsx`
- Modify: `src/styles/globals.css`

---

- [ ] **Step 1: Write failing tests**

Add two new `it` cases inside the existing `describe('RepoDetail skill tab')` block in `src/views/RepoDetail.test.tsx`, after the existing test:

```tsx
  it('shows skill tab header with depth bars when skill is installed', async () => {
    const content = '## [CORE]\ninstall: npm i next\n## [EXTENDED]\nextra\n## [DEEP]\ndeep'
    setupDetail({
      repo_id: '12345', filename: 'next.js.skill.md',
      content, version: 'v14.0', generated_at: '2024-01-01', active: 1, enabled_components: null,
    })
    await waitFor(() => screen.getByText('✓ Installed'))
    fireEvent.click(screen.getByText('Skill file'))
    await waitFor(() => {
      expect(screen.getByText('Core')).toBeInTheDocument()
      expect(screen.getByText('Extended')).toBeInTheDocument()
      expect(screen.getByText('Deep')).toBeInTheDocument()
      expect(screen.getByText('next.js.skill.md')).toBeInTheDocument()
    })
  })

  it('does not show skill tab header when skill is not installed', async () => {
    setupDetail(null)
    await waitFor(() => screen.getByText('+ Install'))
    fireEvent.click(screen.getByText('Skill file'))
    await waitFor(() => {
      expect(screen.queryByText('Core')).not.toBeInTheDocument()
      expect(screen.getByText('Install this repo to generate a skill file.')).toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run src/views/RepoDetail.test.tsx 2>&1 | tail -20
```

Expected: 2 new tests fail — "Core" not found in skill tab.

- [ ] **Step 3: Replace skill tab content in RepoDetail.tsx**

Find the existing skill tab block (currently lines 314–319):

```tsx
{activeTab === 'skill' && (
  skillRow ? (
    <SkillFileContent content={skillRow.content} />
  ) : (
    <p className="repo-detail-placeholder">Install this repo to generate a skill file.</p>
  )
)}
```

Replace with:

```tsx
{activeTab === 'skill' && (
  skillRow ? (
    <>
      <div className="skill-tab-header">
        <div className="skill-tab-header-meta">
          <span>{name}.skill.md</span>
          <span>{skillRow.version ?? ''}</span>
        </div>
        {skillDepths ? (
          <>
            {[
              { label: 'Core',     lines: skillDepths.core,     pct: Math.round((skillDepths.core / depthTotal) * 100),                              color: '#34d399' },
              { label: 'Extended', lines: skillDepths.extended, pct: Math.round(((skillDepths.core + skillDepths.extended) / depthTotal) * 100),     color: '#a78bfa' },
              { label: 'Deep',     lines: skillDepths.deep,     pct: 100,                                                                            color: '#7c3aed' },
            ].map((d) => (
              <div key={d.label} className="skill-tab-depth-row">
                <span className="skill-tab-depth-label">{d.label}</span>
                <div className="skill-tab-depth-track">
                  <div className="skill-tab-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
                </div>
                <span className="skill-tab-depth-meta">~{d.lines} lines</span>
              </div>
            ))}
          </>
        ) : (
          <>
            {[
              { label: 'Core',     meta: '~80 lines',  pct: 30,  color: '#34d399' },
              { label: 'Extended', meta: '~200 lines', pct: 60,  color: '#a78bfa' },
              { label: 'Deep',     meta: '~420 lines', pct: 100, color: '#7c3aed' },
            ].map((d) => (
              <div key={d.label} className="skill-tab-depth-row">
                <span className="skill-tab-depth-label">{d.label}</span>
                <div className="skill-tab-depth-track">
                  <div className="skill-tab-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
                </div>
                <span className="skill-tab-depth-meta">{d.meta}</span>
              </div>
            ))}
          </>
        )}
        <p className="skill-tab-note">Models read as far as context allows.</p>
      </div>
      <SkillFileContent content={skillRow.content} />
    </>
  ) : (
    <p className="repo-detail-placeholder">Install this repo to generate a skill file.</p>
  )
)}
```

Note: `skillRow.version` already includes the `v` prefix in real data (e.g. `"v14.0"`), so render it directly without adding another `v`.

- [ ] **Step 4: Add CSS for skill tab header**

In `src/styles/globals.css`, add after the `.related-repos-grid` rule added in Task 1:

```css
.skill-tab-header {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 12px;
  margin-bottom: 12px;
}
.skill-tab-header-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 10px;
  color: var(--t2);
}
.skill-tab-depth-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.skill-tab-depth-label { font-size: 9px; color: var(--t3); width: 52px; flex-shrink: 0; }
.skill-tab-depth-meta { font-size: 8px; color: var(--t3); width: 52px; text-align: right; }
.skill-tab-depth-track {
  flex: 1;
  height: 3px;
  background: var(--bg4);
  border-radius: 2px;
  position: relative;
}
.skill-tab-depth-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 3px;
  border-radius: 2px;
}
.skill-tab-note {
  font-size: 9px;
  color: var(--t3);
  line-height: 1.6;
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 4px;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run src/views/RepoDetail.test.tsx 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/views/RepoDetail.tsx src/views/RepoDetail.test.tsx src/styles/globals.css && git commit -m "feat(repo-detail): move skill depth bars into skill file tab header"
```

---

## Task 3: Expandable Stats Bar Row

Add a chevron toggle to the stats bar that reveals repo metadata (license, language, size, watchers, collections).

**Files:**
- Modify: `src/views/RepoDetail.tsx` (state declarations ~line 61, reset block ~line 83, stats bar JSX ~lines 259–272)
- Modify: `src/views/RepoDetail.test.tsx`
- Modify: `src/styles/globals.css` (`.repo-detail-stats-bar` rule ~line 1004)

---

- [ ] **Step 1: Write failing tests**

Add to `src/views/RepoDetail.test.tsx`, inside a new `describe` block:

```tsx
describe('RepoDetail stats bar expand', () => {
  it('does not show detail row by default', async () => {
    setupDetail(null)
    await waitFor(() => screen.getAllByText('next.js'))
    expect(screen.queryByText('License')).not.toBeInTheDocument()
  })

  it('shows detail row when chevron is clicked', async () => {
    setupDetail(null)
    await waitFor(() => screen.getAllByText('next.js'))
    fireEvent.click(screen.getByRole('button', { name: /show more details/i }))
    expect(screen.getByText('License')).toBeInTheDocument()
  })

  it('hides detail row when chevron is clicked again', async () => {
    setupDetail(null)
    await waitFor(() => screen.getAllByText('next.js'))
    const toggle = screen.getByRole('button', { name: /show more details/i })
    fireEvent.click(toggle)
    expect(screen.getByText('License')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('License')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run src/views/RepoDetail.test.tsx 2>&1 | tail -20
```

Expected: 3 new tests fail — button not found / License not found.

- [ ] **Step 3: Add showDetails state**

In `src/views/RepoDetail.tsx`, add alongside the other state declarations near line 61:

```tsx
const [showDetails, setShowDetails] = useState(false)
```

- [ ] **Step 4: Reset showDetails in the route-change effect**

In `src/views/RepoDetail.tsx`, in the `useEffect([owner, name])` reset block (around line 83), add:

```tsx
setShowDetails(false)
```

alongside `setRepo(null)`, `setStarred(false)`, etc.

- [ ] **Step 5: Replace the stats bar JSX**

Find the stats bar block (currently lines 260–272):

```tsx
{repo && !repoError && (
  <div className="repo-detail-stats-bar">
    <span><span className="repo-detail-stat-value">{formatStars(repo.stars)}</span> stars</span>
    <span className="repo-detail-stat-sep">·</span>
    <span><span className="repo-detail-stat-value">{formatStars(repo.forks)}</span> forks</span>
    <span className="repo-detail-stat-sep">·</span>
    <span><span className="repo-detail-stat-value">{formatStars(repo.open_issues)}</span> issues</span>
    <span className="repo-detail-stat-sep">·</span>
    <span>Version <span className="repo-detail-stat-value">{version}</span></span>
    <span className="repo-detail-stat-sep">·</span>
    <span>Updated <span className="repo-detail-stat-value">{formatDate(repo.updated_at)}</span></span>
  </div>
)}
```

Replace with:

```tsx
{repo && !repoError && (
  <div className="repo-detail-stats-bar">
    <div className="repo-detail-stats-row">
      <span><span className="repo-detail-stat-value">{formatStars(repo.stars)}</span> stars</span>
      <span className="repo-detail-stat-sep">·</span>
      <span><span className="repo-detail-stat-value">{formatStars(repo.forks)}</span> forks</span>
      <span className="repo-detail-stat-sep">·</span>
      <span><span className="repo-detail-stat-value">{formatStars(repo.open_issues)}</span> issues</span>
      <span className="repo-detail-stat-sep">·</span>
      <span>Version <span className="repo-detail-stat-value">{version}</span></span>
      <span className="repo-detail-stat-sep">·</span>
      <span>Updated <span className="repo-detail-stat-value">{formatDate(repo.updated_at)}</span></span>
      <button
        className="repo-detail-stats-expand"
        onClick={() => setShowDetails(v => !v)}
        aria-label="show more details"
      >
        {showDetails ? '∨' : '›'}
      </button>
    </div>
    {showDetails && (
      <div className="repo-detail-stats-details">
        <span><span className="repo-detail-stat-key">License</span> {repo.license ?? '—'}</span>
        <span className="repo-detail-stat-sep">·</span>
        <span><span className="repo-detail-stat-key">Language</span> {repo.language ?? '—'}</span>
        <span className="repo-detail-stat-sep">·</span>
        <span><span className="repo-detail-stat-key">Size</span> {formatSize(repo.size)}</span>
        <span className="repo-detail-stat-sep">·</span>
        <span><span className="repo-detail-stat-key">Watchers</span> {repo.watchers?.toLocaleString() ?? '—'}</span>
        <span className="repo-detail-stat-sep">·</span>
        <span><span className="repo-detail-stat-key">Collections</span> {repoCols.length > 0 ? repoCols.map(c => c.name).join(', ') : '—'}</span>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Update stats bar CSS**

In `src/styles/globals.css`, replace the `.repo-detail-stats-bar` rule (lines 1004–1015) with:

```css
.repo-detail-stats-bar {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
```

The `padding`, `align-items`, `gap`, `font-size`, `color`, and `flex-wrap` that were on `.repo-detail-stats-bar` move to the new `.repo-detail-stats-row` class below. Then add new classes after `.repo-detail-stat-sep`:

```css
.repo-detail-stats-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 10px;
  color: var(--t2);
  flex-wrap: wrap;
}
.repo-detail-stats-expand {
  background: none;
  border: none;
  color: var(--t3);
  cursor: pointer;
  font-size: 11px;
  padding: 0 4px;
  font-family: inherit;
  line-height: 1;
}
.repo-detail-stats-expand:hover { color: var(--t2); }
.repo-detail-stats-details {
  border-top: 1px solid var(--border);
  padding: 6px 16px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--t2);
  align-items: center;
}
.repo-detail-stat-key { color: var(--t3); margin-right: 3px; }
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run src/views/RepoDetail.test.tsx 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/views/RepoDetail.tsx src/views/RepoDetail.test.tsx src/styles/globals.css && git commit -m "feat(repo-detail): add expandable stats bar row for repo metadata"
```

---

## Task 4: Remove the Sidebar

Delete the sidebar div and all its CSS. The main column fills the full width naturally.

**Files:**
- Modify: `src/views/RepoDetail.tsx` (sidebar div ~lines 384–468)
- Modify: `src/styles/globals.css` (sidebar section ~lines 1225–1364)

No new tests needed — deletion is verified by the existing tests still passing.

---

- [ ] **Step 1: Delete the sidebar JSX**

In `src/views/RepoDetail.tsx`, delete the entire `{/* Sidebar */}` block — from `<div className="repo-detail-sidebar">` through its closing `</div>`. This includes the skill panel, repo-meta-section, and related-repos-section divs.

The outer `repo-detail-body` div remains; only its sidebar child is removed. With one child (`repo-detail-main`, which has `flex: 1`), it will fill full width automatically — no CSS change to `.repo-detail-body` is needed.

- [ ] **Step 2: Delete sidebar CSS classes**

In `src/styles/globals.css`, delete the entire "Repo Detail Sidebar" section (comment header at ~line 1225 through ~line 1364), **with these exceptions — keep these rules:**

- `.related-repo-card`
- `.related-repo-card:hover`
- `.related-repo-name`
- `.related-repo-desc`
- `.related-repo-stars`

**Delete all of these rules:**
- `/* ── Repo Detail Sidebar ── */` comment
- `.repo-detail-sidebar`
- `.save-btn-full` and `.save-btn-full.saved`
- `.github-star-btn` and all its variants (`:hover`, `.starred`, `:disabled`)
- `.skill-panel`
- `.skill-panel-header`
- `.skill-panel-filename`
- `.skill-panel-status`
- `.skill-panel-body`
- `.skill-depth-row`
- `.skill-depth-label`
- `.skill-depth-meta`
- `.skill-depth-track`
- `.skill-depth-fill`
- `.skill-panel-note`
- `.repo-meta-section`
- `.repo-meta-label`
- `.repo-meta-row`
- `.repo-meta-key`
- `.repo-meta-val`
- `.related-repos-section`

- [ ] **Step 3: Run the full test suite**

```bash
cd "D:/Coding/Git-Suite" && npx vitest run src/views/RepoDetail.test.tsx 2>&1 | tail -30
```

Expected: all tests PASS. If any test fails because it was asserting sidebar-specific content (depth bars in the sidebar), remove those assertions — the content now lives in the skill tab.

- [ ] **Step 4: Commit**

```bash
cd "D:/Coding/Git-Suite" && git add src/views/RepoDetail.tsx src/styles/globals.css && git commit -m "feat(repo-detail): remove sidebar, single-column layout"
```

---

## Completion Check

```bash
cd "D:/Coding/Git-Suite" && npx vitest run 2>&1 | tail -20
```

Expected: full suite passes. Verify in the running app:
- Related tab appears on repos that have related repos, absent when none
- Skill file tab shows depth header above the file content
- Stats bar `›` chevron expands to show license/language/size/watchers/collections
- No sidebar — main content fills full width
