# Repo Detail Glass Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the RepoDetail view so the banner becomes a full chiaroscuro background and tabs+content float in a frosted glass panel.

**Architecture:** Replace the fixed-height BannerSVG banner with a full-height ChiaroscuroBackground stage. The identity overlay becomes relatively positioned at the top of the stage. Tabs and content are wrapped in a glass panel with backdrop-filter blur, rounded corners, and margin on all sides.

**Tech Stack:** React, CSS (globals.css), existing ChiaroscuroBackground component

**Spec:** `docs/superpowers/specs/2026-04-08-repo-detail-glass-panel-design.md`

---

### Task 1: Add CSS for new stage and glass containers

**Files:**
- Modify: `src/styles/globals.css:1482-1509` (banner section)

- [ ] **Step 1: Remove `.repo-detail-banner` and add `.repo-detail-stage`**

In `src/styles/globals.css`, replace the `.repo-detail-banner` rule (lines 1482-1487):

```css
.repo-detail-banner {
  position: relative;
  height: 190px;
  flex-shrink: 0;
  overflow: hidden;
}
```

With:

```css
.repo-detail-stage {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 2: Modify `.repo-detail-banner-overlay`**

Replace the `.repo-detail-banner-overlay` rule (lines 1489-1509):

```css
.repo-detail-banner-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 22px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  z-index: 2;

  /* Re-scope all theme variables to light-background equivalents.
     Any component rendered inside the banner automatically gets
     readable colours — no per-element overrides needed. */
  --t1:      rgba(0,0,0,0.88);
  --t2:      rgba(0,0,0,0.60);
  --t3:      rgba(0,0,0,0.38);
  --bg4:     rgba(255,255,255,0.96);
  --border:  rgba(0,0,0,0.08);
  --border2: rgba(0,0,0,0.15);
}
```

With:

```css
.repo-detail-banner-overlay {
  position: relative;
  z-index: 2;
  padding: 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

Key changes: `position: relative` instead of absolute, removed `bottom/left/right`, removed light-mode variable overrides, changed to `flex-direction: column` since identity and stats stack vertically, tightened gap.

- [ ] **Step 3: Update hardcoded light-mode colors on banner child elements**

In `src/styles/globals.css`, change `.repo-detail-banner-name` (line 1614):

```css
color: rgba(0,0,0,0.85);
```
to:
```css
color: var(--t1);
```

Change `.repo-detail-banner-owner` (line 1621):

```css
color: rgba(0,0,0,0.60) !important;
```
to:
```css
color: var(--t2) !important;
```

Change `.repo-detail-banner-desc` (line 1626):

```css
color: rgba(0,0,0,0.45);
```
to:
```css
color: var(--t3);
```

- [ ] **Step 4: Add `.repo-detail-glass` class**

Add this new rule right after `.repo-detail-banner-overlay` (after the rule modified in Step 2):

```css
.repo-detail-glass {
  position: relative;
  z-index: 2;
  margin: 0 16px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add glass panel and stage CSS for RepoDetail"
```

---

### Task 2: Restructure RepoDetail.tsx layout

**Files:**
- Modify: `src/views/RepoDetail.tsx:1-9` (imports)
- Modify: `src/views/RepoDetail.tsx:843` (gradient derivation)
- Modify: `src/views/RepoDetail.tsx:894-974` (banner + body restructure)

- [ ] **Step 1: Update imports**

In `src/views/RepoDetail.tsx`, replace the BannerSVG import (line 8):

```tsx
import BannerSVG, { getLangConfig } from '../components/BannerSVG'
```

With:

```tsx
import { getLangConfig } from '../components/BannerSVG'
import ChiaroscuroBackground from '../components/ChiaroscuroBackground'
```

Add the gradient imports. Find the existing import from `../config/repoTypeConfig` if there is one, or add a new import near the top:

```tsx
import { getSubTypeConfig, getBucketGradient, getBucketColor } from '../config/repoTypeConfig'
```

- [ ] **Step 2: Add gradient derivation**

Near line 843 where `typeBucket` is defined, add the gradient derivation right after:

```tsx
const typeBucket = repo?.type_bucket ?? (repo ? classifyRepoBucket(repo)?.bucket : null) ?? null
const typeConfig = getSubTypeConfig(repo?.type_sub ?? null)
const gradient = getBucketGradient(typeConfig?.accentColor ?? getBucketColor(typeBucket))
```

Note: If `getSubTypeConfig` is already imported or `typeConfig` already exists elsewhere in the file, reuse it rather than duplicating.

- [ ] **Step 3: Restructure the banner and body into stage layout**

Replace the banner section (starting at line 894 `{/* Banner */}`) through the start of body (line 974 `<div className="repo-detail-body">`), wrapping it all in the new structure.

**Replace** the banner block (lines 894-958):

```tsx
      {/* Banner */}
      <div className="repo-detail-banner">
        <BannerSVG
          owner={owner ?? ''} name={name ?? ''}
          typeBucket={typeBucket}
          size="detail"
        />
        {/* Content — bottom left */}
        <div className="repo-detail-banner-overlay">
          ...
        </div>
      </div>
```

And the learn error + body opening (lines 960-974):

```tsx
      {/* Learn error banner */}
      {learnError && (...)}

      {/* Body */}
      <div className="repo-detail-body">
```

**With** the new stage structure:

```tsx
      {/* Stage — chiaroscuro background + glass panel */}
      <div className="repo-detail-stage">
        <ChiaroscuroBackground avatarUrl={repo?.avatar_url} fallbackGradient={gradient} />

        {/* Identity overlay */}
        <div className="repo-detail-banner-overlay">
          <div className="repo-detail-banner-identity">
            {repo?.avatar_url ? (
              <img
                src={repo.avatar_url}
                alt={owner}
                style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div
                className="repo-detail-lang-badge-lg"
                style={{ background: `${cfg.primary}33`, color: cfg.primary }}
              >
                {cfg.abbr}
              </div>
            )}
            <div className="repo-detail-banner-title">
              <span className="repo-detail-banner-name">{name}</span>
              {liveTier && (
                <span>
                  <VerificationBadge tier={liveTier} signals={liveSignals} size="md" />
                </span>
              )}
              <button
                className="owner-name-btn repo-detail-banner-owner"
                onClick={(e) => { e.stopPropagation(); openProfile(owner ?? '') }}
              >
                {owner}
              </button>
            </div>
          </div>

          {/* Stats row */}
          {repo && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, marginTop: 10,
                fontFamily: 'Inter, sans-serif', fontSize: 11,
                color: 'rgba(255,255,255,0.6)', flexWrap: 'wrap',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                  </svg>
                  {formatCount(repo.stars)}
                </span>
                <span>⑂ {formatCount(repo.forks)}</span>
                <span>◎ {formatCount(repo.open_issues)}</span>
                {version !== '—' && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{version}</span>
                )}
                <span>◷ {formatDate(repo.pushed_at ?? repo.updated_at)}</span>
              </div>
            </>
          )}
        </div>

        {/* Learn error banner */}
        {learnError && (
          <div className="repo-detail-install-error">
            {learnError === 'no-key'
              ? <>To generate skills, add an Anthropic API key in{' '}
                  <button className="install-error-link" onClick={() => navigate('/settings')}>Settings</button>
                  {' '}or run <code style={{ fontSize: 10, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>npm i -g @anthropic-ai/claude-code</code> then restart.
                </>
              : 'Learning failed — try again'}
          </div>
        )}

        {/* Glass panel */}
        <div className="repo-detail-glass">
          <div className="repo-detail-body">
```

Note: The avatar's inline border changes from `rgba(0,0,0,0.10)` to `rgba(255,255,255,0.15)` for visibility on the dark background.

- [ ] **Step 4: Close the glass panel div**

Find the closing `</div>` for `.repo-detail-body` near the end of the component. Add an additional closing `</div>` after it for the `.repo-detail-glass` wrapper, and another for the `.repo-detail-stage` wrapper. The closing structure should be:

```tsx
          </div>  {/* .repo-detail-body */}
        </div>    {/* .repo-detail-glass */}
      </div>      {/* .repo-detail-stage */}
    </div>        {/* .repo-detail */}
```

Make sure the existing closing `</div>` for `.repo-detail` remains as the outermost.

- [ ] **Step 5: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: restructure RepoDetail with chiaroscuro background and glass panel"
```

---

### Task 3: Visual verification

**Files:** None (verification only)

- [ ] **Step 1: Build and verify no compile errors**

Run: `npm run build` (or the project's build command)
Expected: No TypeScript or build errors

- [ ] **Step 2: Visual check**

Open the app, navigate to any repo detail page. Verify:
1. Chiaroscuro background fills the area below the breadcrumb
2. Identity info (avatar, name, owner, stats) is readable with light text on the dark background
3. Glass panel has rounded corners on all four sides with visible margin
4. Tabs and content render correctly inside the glass panel
5. Scrolling within the tab content works
6. The glass panel's backdrop-filter blur is visible (content behind it appears frosted)

- [ ] **Step 3: Fix any visual issues found**

If any issues are discovered (spacing, colors, readability), fix them in the relevant file and commit.
