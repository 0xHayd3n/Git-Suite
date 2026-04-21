# Skill Hover Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace always-visible inline regen buttons on each skill box with hover-reveal action drawers that slide out below the box, and add a minimal "↺ all" control next to the "Skills Folder" section title.

**Architecture:** Three independent tasks: (1) CSS-only — add all new classes and remove the old `btn-regen-inline` block; (2) React primitives — update `SidebarLabel`, add `hoveredBox` state, add `handleRegenerateAll`; (3) JSX panel — rewire the sidebar skills panel block to use hover groups, drawer siblings, and the new `SidebarLabel` action prop.

**Tech Stack:** React 18, TypeScript, CSS custom properties (design tokens), Vitest

---

## File Map

| File | Role |
|------|------|
| `src/views/RepoDetail.tsx` | All React changes: state, handlers, JSX |
| `src/styles/globals.css` | All CSS changes: new classes, removed classes |

No new files. No backend changes.

---

### Task 1: Add CSS — hover drawer classes, regenerate-all button, remove btn-regen-inline

**Files:**
- Modify: `src/styles/globals.css` (lines 2985–3005)

This task is CSS-only. No TSX changes.

The current `.btn-regen-inline` block (lines 2993–3005) is being removed because the feature it powered is being replaced. All new CSS classes are inserted after the `.sidebar-sub-skill-box` block (line 2991) and before `/* ── View on GitHub link-button ── */` (line 3007).

- [ ] **Step 1: Read the insertion zone to confirm exact surrounding text**

  Read `src/styles/globals.css` lines 2985–3010 to confirm the exact text of the `.sidebar-sub-skill-box` block, the `.btn-regen-inline` block, and the `/* ── View on GitHub link-button ── */` comment. Use this as anchors for the Edit calls in steps 2 and 3.

- [ ] **Step 2: Remove the `.btn-regen-inline` block**

  Find and delete exactly these 4 lines (no other lines):

  ```css
  .btn-regen-inline {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--t3);
    font-size: 12px;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    line-height: 1;
    opacity: 0.6;
  }
  .btn-regen-inline:hover:not(:disabled) { opacity: 1; color: var(--t1); }
  .btn-regen-inline:disabled { opacity: 0.3; cursor: default; }
  ```

  Replace with an empty string (delete entirely, including the blank line before `/* ── View on GitHub`).

- [ ] **Step 3: Add all new CSS classes after `.sidebar-sub-skill-box` block**

  Insert the following block immediately after the closing `}` of `.sidebar-sub-skill-box` (after line 2991), before `/* ── View on GitHub link-button ── */`:

  ```css
  /* ── Skill hover group & drawer ── */
  .skill-hover-group { position: relative; }

  .skill-hover-drawer {
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 150ms ease, opacity 150ms ease;
    border: 1px solid var(--border2);
    border-top: none;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    background: var(--bg2);
  }
  .skill-hover-drawer--visible {
    max-height: 36px;
    opacity: 1;
  }

  /* Square off box bottom corners when drawer is open */
  .skill-hover-group:has(.skill-hover-drawer--visible) .sidebar-skill-panel,
  .skill-hover-group:has(.skill-hover-drawer--visible) .sidebar-sub-skill-box {
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }

  .btn-drawer-regen {
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--t2);
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    padding: 8px 11px;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .btn-drawer-regen:hover:not(:disabled) { color: var(--t1); background: var(--bg3); }
  .btn-drawer-regen:disabled { opacity: 0.5; cursor: default; }

  /* ── Regenerate-all button in section label ── */
  .btn-regen-all {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--t3);
    font-family: 'Inter', sans-serif;
    font-size: 9px;
    font-weight: 500;
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    line-height: 1;
    opacity: 0.5;
    text-transform: none;
    letter-spacing: 0;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .btn-regen-all:hover:not(:disabled) { opacity: 1; color: var(--t2); }
  .btn-regen-all:disabled { opacity: 0.3; cursor: default; }
  ```

- [ ] **Step 4: Run tests**

  ```bash
  npx vitest run
  ```

  Expected: all main-workspace test suites pass (failures in `.claude/worktrees/` are pre-existing and unrelated).

- [ ] **Step 5: Commit**

  ```bash
  git add src/styles/globals.css
  git commit -m "style: add hover drawer CSS, remove btn-regen-inline"
  ```

---

### Task 2: Update SidebarLabel, add hoveredBox state, add handleRegenerateAll

**Files:**
- Modify: `src/views/RepoDetail.tsx`
  - `SidebarLabel` component: lines ~290–304
  - State block: line ~408 (after `regeneratingTarget`)
  - Handler block: line ~712 (after `handleRegenerateTarget`)

Three surgical edits. No JSX panel changes yet — those come in Task 3.

- [ ] **Step 1: Read the three target zones**

  Read `src/views/RepoDetail.tsx`:
  - Lines 289–304 (`SidebarLabel` component)
  - Lines 407–409 (`regeneratingTarget` state line and surroundings)
  - Lines 711–715 (end of `handleRegenerateTarget` and blank lines after)

  Confirm exact current text before editing.

- [ ] **Step 2: Update `SidebarLabel` to accept an optional `action` prop**

  Current `SidebarLabel` (lines 290–304):
  ```typescript
  function SidebarLabel({ children }: { children: React.ReactNode }) {
    return (
      <div style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--t3)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 8,
      }}>
        {children}
      </div>
    )
  }
  ```

  Replace with:
  ```typescript
  function SidebarLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
    return (
      <div style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--t3)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {children}
        {action}
      </div>
    )
  }
  ```

  All existing `<SidebarLabel>` usages that pass no `action` are unaffected — `{undefined}` renders nothing.

- [ ] **Step 3: Add `hoveredBox` state after `regeneratingTarget`**

  Find line 408:
  ```typescript
    const [regeneratingTarget, setRegeneratingTarget] = useState<'master' | 'components' | null>(null)
  ```

  Replace with:
  ```typescript
    const [regeneratingTarget, setRegeneratingTarget] = useState<'master' | 'components' | null>(null)
    const [hoveredBox, setHoveredBox] = useState<'master' | 'components' | null>(null)
  ```

- [ ] **Step 4: Add `handleRegenerateAll` after `handleRegenerateTarget`**

  Find the blank line immediately after the closing `}` of `handleRegenerateTarget` (line ~712). Insert:

  ```typescript
    const handleRegenerateAll = async () => {
      setInstallError(null)
      await handleRegenerateTarget('master')
      if (componentsSkillRow) {
        await handleRegenerateTarget('components')
      }
    }
  ```

  Note: `handleRegenerateTarget` already sets/clears `regeneratingTarget` internally via `finally`, so sequential `await` calls are safe — the second only starts after the first's `finally` has run.

- [ ] **Step 5: Run tests**

  ```bash
  npx vitest run
  ```

  Expected: all main-workspace suites pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/views/RepoDetail.tsx
  git commit -m "feat: add hoveredBox state, handleRegenerateAll, SidebarLabel action prop"
  ```

---

### Task 3: Rewire sidebar skills panel JSX — hover groups, drawers, SidebarLabel action

**Files:**
- Modify: `src/views/RepoDetail.tsx` (lines ~1274–1338)

This is the largest single edit. Replace the entire sidebar skill panel block (from `<SidebarLabel>Skills Folder</SidebarLabel>` through the closing `</>` of the installed branch) with the new version.

- [ ] **Step 1: Read the current sidebar skills panel block**

  Read `src/views/RepoDetail.tsx` lines 1274–1340 to confirm the exact current text. The block starts with:
  ```tsx
                <SidebarLabel>Skills Folder</SidebarLabel>
  ```
  and ends with:
  ```tsx
              </>
  ```
  (the closing fragment of the `installState === 'INSTALLED' && skillRow ?` branch).

- [ ] **Step 2: Replace the sidebar skills panel block**

  The derivation rules for drawer visibility:
  - Master drawer visible when: `hoveredBox === 'master' || regeneratingTarget === 'master'`
  - Components drawer visible when: `hoveredBox === 'components' || regeneratingTarget === 'components'`

  Replace the block (from `<SidebarLabel>Skills Folder</SidebarLabel>` through the closing `</>`) with:

  ```tsx
                <SidebarLabel action={
                  <button
                    className="btn-regen-all"
                    onClick={handleRegenerateAll}
                    disabled={regeneratingTarget !== null}
                    title="Regenerate all skill files"
                    aria-label="Regenerate all skill files"
                  >
                    {regeneratingTarget !== null
                      ? <span className="spin-ring" style={{ width: 7, height: 7 }} />
                      : '↺ all'}
                  </button>
                }>
                  Skills Folder
                </SidebarLabel>
                <div
                  className="skill-hover-group"
                  onMouseEnter={() => setHoveredBox('master')}
                  onMouseLeave={() => setHoveredBox(null)}
                >
                  <div className="sidebar-skill-panel">
                    {/* File header */}
                    <div className="sidebar-skill-panel-header">
                      <span className="sidebar-skill-panel-filename">{name}.skill.md</span>
                      <span className="sidebar-skill-panel-badge">✓ active</span>
                    </div>
                    {/* Depth bars */}
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
                  <div className={`skill-hover-drawer${(hoveredBox === 'master' || regeneratingTarget === 'master') ? ' skill-hover-drawer--visible' : ''}`}>
                    <button
                      className="btn-drawer-regen"
                      onClick={() => handleRegenerateTarget('master')}
                      disabled={regeneratingTarget !== null}
                      aria-label="Regenerate master skill"
                    >
                      {regeneratingTarget === 'master'
                        ? <><span className="spin-ring" style={{ width: 8, height: 8 }} /> Regenerating…</>
                        : '↺ Regenerate'}
                    </button>
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
                    <div className={`skill-hover-drawer${(hoveredBox === 'components' || regeneratingTarget === 'components') ? ' skill-hover-drawer--visible' : ''}`}>
                      <button
                        className="btn-drawer-regen"
                        onClick={() => handleRegenerateTarget('components')}
                        disabled={regeneratingTarget !== null}
                        aria-label="Regenerate components skill"
                      >
                        {regeneratingTarget === 'components'
                          ? <><span className="spin-ring" style={{ width: 8, height: 8 }} /> Regenerating…</>
                          : '↺ Regenerate'}
                      </button>
                    </div>
                  </div>
                )}
  ```

  **Notes for the implementer:**
  - The `.sidebar-sub-skill-rows` wrapper div that previously surrounded the components box is gone — the `.skill-hover-group` wrapper replaces it. The `margin-top: 4px` that `.sidebar-sub-skill-box` previously had in CSS is now an inline `style={{ marginTop: 4 }}` on the `.skill-hover-group` wrapper instead, because the box's bottom radius transition needs the outer wrapper to be the margin carrier.
  - The `btn-regen-inline` buttons that were in the headers are removed — just the filename/badge spans remain.
  - The closing `</>` fragment from the `installState === 'INSTALLED'` branch stays in place after this block — do not remove it.

- [ ] **Step 3: Verify no remaining `btn-regen-inline` references in RepoDetail.tsx**

  ```bash
  grep -n "btn-regen-inline" src/views/RepoDetail.tsx
  ```

  Expected: no output.

- [ ] **Step 4: Verify no remaining `sidebar-sub-skill-rows` wrapper in RepoDetail.tsx**

  ```bash
  grep -n "sidebar-sub-skill-rows" src/views/RepoDetail.tsx
  ```

  Expected: no output (this class was a now-removed wrapper div).

- [ ] **Step 5: Run tests**

  ```bash
  npx vitest run
  ```

  Expected: all main-workspace suites pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/views/RepoDetail.tsx
  git commit -m "feat: hover-reveal drawer per skill box, regenerate-all in section header"
  ```
