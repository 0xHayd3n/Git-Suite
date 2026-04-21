# Skills Folder UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "Skill file" tab/panel to "Skills Folder", box-style the sub-skill sidebar entry, and replace the single global regenerate button with per-file ↻ buttons that each regenerate only their respective file.

**Architecture:** Four independent changes across the UI (RepoDetail.tsx), CSS (globals.css), and IPC layer (main.ts + preload.ts). The IPC handler gains a `target` option so the frontend can request master-only or components-only regeneration. A new `regeneratingTarget` state in the UI tracks per-file loading independently of `installState`.

**Tech Stack:** TypeScript, React, Electron IPC, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-30-skills-folder-ui-redesign.md`

---

### Task 1: Rename "Skill file" → "Skills Folder"

**Files:**
- Modify: `src/views/RepoDetail.tsx:314`
- Modify: `src/views/RepoDetail.tsx:1272`

- [ ] **Step 1: Update the tab label**

In `src/views/RepoDetail.tsx`, change line 314 from:
```typescript
  { id: 'skill',       label: 'Skill file' },
```
to:
```typescript
  { id: 'skill',       label: 'Skills Folder' },
```

- [ ] **Step 2: Update the sidebar section label**

In `src/views/RepoDetail.tsx`, change line 1272 from:
```tsx
                <SidebarLabel>Skill file</SidebarLabel>
```
to:
```tsx
                <SidebarLabel>Skills Folder</SidebarLabel>
```

- [ ] **Step 3: Verify the app builds**

Run: `npx vitest run`
Expected: All tests PASS (no logic changed)

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: rename 'Skill file' tab and panel to 'Skills Folder'"
```

---

### Task 2: Add `.sidebar-sub-skill-box` CSS class

**Files:**
- Modify: `src/styles/globals.css` (after line 2978, near `.btn-regenerate`)

The JSX change that uses this class is done in Task 4 in one shot alongside the regen button. This task only adds the CSS so the class is ready.

- [ ] **Step 1: Add `.sidebar-sub-skill-box` CSS class**

In `src/styles/globals.css`, add the following block immediately before `.btn-regenerate` (currently at line 2981):

```css
.sidebar-sub-skill-box {
  border: 1px solid var(--border2);
  background: var(--bg2);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  margin-top: 4px;
}
```

- [ ] **Step 2: Verify tests pass**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add sidebar-sub-skill-box CSS class"
```

---

### Task 3: Add `target` option to `skill:generate` IPC handler

**Files:**
- Modify: `electron/preload.ts:58-59`
- Modify: `electron/main.ts:714-838`

- [ ] **Step 1: Extend the preload type signature**

In `electron/preload.ts`, change lines 58–59 from:
```typescript
    generate: (owner: string, name: string, options?: { enabledComponents?: string[] }) =>
      ipcRenderer.invoke('skill:generate', owner, name, options),
```
to:
```typescript
    generate: (owner: string, name: string, options?: { enabledComponents?: string[]; target?: 'master' | 'components' | 'all' }) =>
      ipcRenderer.invoke('skill:generate', owner, name, options),
```

- [ ] **Step 2: Restructure the `skill:generate` IPC handler**

In `electron/main.ts`, replace the entire handler from line 714 to line 839 (inclusive of the closing `})`) with the following. This adds `target` branching and moves the component scan inside the components-only block:

```typescript
ipcMain.handle('skill:generate', async (_, owner: string, name: string, options?: { enabledComponents?: string[]; target?: 'master' | 'components' | 'all' }) => {
  const apiKey = getApiKey()
  const target = options?.target ?? 'all'

  const token = getToken() ?? null
  const readme = await getReadme(token, owner, name) ?? ''
  const releases = await getReleases(token, owner, name)
  const version = releases[0]?.tag_name ?? 'unknown'

  const db = getDb(app.getPath('userData'))
  const repo = db.prepare('SELECT id, language, topics, default_branch FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { id: string; language: string | null; topics: string | null; default_branch: string | null } | undefined
  if (!repo) throw new Error(`Repo ${owner}/${name} not found in database`)

  const language = repo.language ?? ''
  const topics = JSON.parse(repo.topics ?? '[]') as string[]

  // Component detection
  const isComponents =
    topics.some((t: string) => ['components', 'ui-components', 'design-system', 'component-library'].includes(t)) ||
    /\bui\b|components|design.?system/i.test(name)

  if (isComponents) {
    db.prepare("UPDATE repos SET type='components' WHERE id=?").run(repo.id)
  }

  // ── Scan components (only when regenerating components) ──────────
  let scannedComponents: SkillGenInput['scannedComponents']
  if (isComponents && (target === 'all' || target === 'components')) {
    try {
      const branch = repo.default_branch ?? 'main'
      const scanResult = await scanComponents(owner, name, branch)
      scannedComponents = scanResult.components.map(c => {
        const pc = parseComponent(c.path, c.source, scanResult.framework)
        return {
          name: pc.name,
          props: pc.props.map(p => ({
            name: p.name,
            type: p.type,
            required: p.required,
            ...(p.defaultValue !== undefined ? { defaultValue: p.defaultValue } : {}),
          })),
        }
      })
      console.log(`[skill-gen] Scanned ${scannedComponents.length} components for ${owner}/${name}`)
    } catch (err) {
      console.error('[skill-gen] Component scan failed, falling back to README-only:', err)
    }
  }

  const skillInput = { owner, name, language, topics, readme, version, isComponents, enabledComponents: options?.enabledComponents, scannedComponents }

  // ── Master skill generation (skipped when target === 'components') ─
  let content: string | undefined
  if (target === 'all' || target === 'master') {
    try {
      content = await generateSkillViaLocalCLI(skillInput)
    } catch (cliError) {
      console.error('[skill-gen] Local CLI error:', cliError)
      if (!apiKey) {
        const cliMsg = cliError instanceof Error ? cliError.message : String(cliError)
        throw new Error(
          /not logged in|claude login/i.test(cliMsg)
            ? cliMsg + ' Or add an Anthropic API key in Settings as a fallback.'
            : 'Claude Code unavailable and no API key set. Run `claude login` in a terminal or add an API key in Settings.'
        )
      }
      content = await generateSkill(skillInput, apiKey)
    }
  }

  // ── Components sub-skill generation (skipped when target === 'master') ─
  let componentsContent: string | null = null
  if (isComponents && (target === 'all' || target === 'components')) {
    try {
      componentsContent = await generateComponentsSkillViaLocalCLI(skillInput)
    } catch (compError) {
      console.error('[skill-gen] Components sub-skill error:', compError)
      if (apiKey) {
        try {
          componentsContent = await generateComponentsSkill(skillInput, apiKey)
        } catch (e) {
          console.error('[skill-gen] Components API fallback error:', e)
        }
      }
      // Non-fatal: master skill will still be returned even if components fails
    }
  }

  // Append ## [SKILLS] section to master skill when both exist
  if (content && componentsContent) {
    content += `\n\n## [SKILLS]\ncomponents: ${name}.components.skill.md\n`
  }

  const dir = path.join(app.getPath('userData'), 'skills', owner)
  await fs.mkdir(dir, { recursive: true })
  const generated_at = new Date().toISOString()

  // ── Persist master skill (only when generated) ───────────────────
  // Upsert preserves existing active and enabled_components on regenerate.
  // INSERT sets active=1 and enabled_components=NULL for brand-new rows only.
  // ON CONFLICT updates only the content fields — user's toggle state and component
  // selections are not touched.
  if (content) {
    await fs.writeFile(path.join(dir, `${name}.skill.md`), content, 'utf8')
    db.prepare(`
      INSERT INTO skills (repo_id, filename, content, version, generated_at, active, enabled_components)
      VALUES (?, ?, ?, ?, ?, 1, NULL)
      ON CONFLICT(repo_id) DO UPDATE SET
        filename     = excluded.filename,
        content      = excluded.content,
        version      = excluded.version,
        generated_at = excluded.generated_at
    `).run(repo.id, `${name}.skill.md`, content, version, generated_at)
  }

  // ── Persist components sub-skill (only when generated) ──────────
  if (componentsContent) {
    const compFilename = `${name}.components.skill.md`
    await fs.writeFile(path.join(dir, compFilename), componentsContent, 'utf8')
    db.prepare(`
      INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active)
      VALUES (?, 'components', ?, ?, ?, ?, 1)
      ON CONFLICT(repo_id, skill_type) DO UPDATE SET
        filename     = excluded.filename,
        content      = excluded.content,
        version      = excluded.version,
        generated_at = excluded.generated_at
    `).run(repo.id, compFilename, componentsContent, version, generated_at)
  }

  return { content, version, generated_at }
})
```

Note: `content` is now `string | undefined`. When `target === 'components'`, `content` will be `undefined` in the return value. The UI's `handleRegenerateTarget` does not use the return value of `generate()` — it calls `window.api.skill.get()` separately to refresh state — so this is safe. No callers destructure `content` from the generate return.

- [ ] **Step 3: Verify tests pass**

Run: `npx vitest run`
Expected: PASS — the handler change is additive (default `target='all'` preserves existing behaviour)

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat: add target option to skill:generate for per-file regeneration"
```

---

### Task 4: Per-file regenerate buttons in the UI

**Files:**
- Modify: `src/views/RepoDetail.tsx:404-407` (add state), `691-707` (replace handler), `1273-1326` (sidebar panel)
- Modify: `src/styles/globals.css` (add `.btn-regen-inline`, remove `.btn-regenerate`)

- [ ] **Step 1: Add `regeneratingTarget` state**

In `src/views/RepoDetail.tsx`, after line 407 (`const [selectedSkillFile, ...]`), add:

```typescript
  const [regeneratingTarget, setRegeneratingTarget] = useState<'master' | 'components' | null>(null)
```

- [ ] **Step 2: Replace `handleRegenerate` with `handleRegenerateTarget`**

In `src/views/RepoDetail.tsx`, replace lines 691–707 (the entire `handleRegenerate` function) with:

```typescript
  const handleRegenerateTarget = async (target: 'master' | 'components') => {
    setRegeneratingTarget(target)
    setInstallError(null)
    try {
      await window.api.skill.generate(owner ?? '', name ?? '', { target })
      if (target === 'master') {
        const freshRow = await window.api.skill.get(owner ?? '', name ?? '')
        setSkillRow(freshRow)
      }
      if (target === 'components') {
        const freshComp = await window.api.skill.getSubSkill(owner ?? '', name ?? '', 'components').catch(() => null)
        setComponentsSkillRow(freshComp)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setInstallError(msg.includes('Claude Code not found') || msg.includes('No API key') ? 'no-key' : 'failed')
    } finally {
      setRegeneratingTarget(null)
    }
  }
```

- [ ] **Step 3: Add ↻ button to the master skill box and remove the old global button**

In `src/views/RepoDetail.tsx`, replace lines **1272–1325** (starting from the `<SidebarLabel>` line through the closing `</button>` of the old regenerate button, inclusive) with:

Note: Task 1 already changed line 1272 to `Skills Folder`. The replacement below overwrites it again — this is intentional so the block is self-contained. The replacement ends at line 1325; the `</>` fragment closer at line 1326 is left untouched.

```tsx
                <SidebarLabel>Skills Folder</SidebarLabel>
                <div className="sidebar-skill-panel">
                  {/* File header with inline regen button */}
                  <div className="sidebar-skill-panel-header">
                    <span className="sidebar-skill-panel-filename">{name}.skill.md</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="sidebar-skill-panel-badge">✓ active</span>
                      <button
                        className="btn-regen-inline"
                        onClick={() => handleRegenerateTarget('master')}
                        disabled={regeneratingTarget !== null}
                        title="Regenerate master skill"
                      >
                        {regeneratingTarget === 'master'
                          ? <span className="spin-ring" style={{ width: 8, height: 8 }} />
                          : '↺'}
                      </button>
                    </span>
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
                {componentsSkillRow && (
                  <div className="sidebar-sub-skill-rows">
                    <div className="sidebar-sub-skill-box">
                      <div className="sidebar-sub-skill-header">
                        <span className="sidebar-sub-skill-dot" style={{ background: '#6366f1' }} />
                        <span className="sidebar-sub-skill-filename">{componentsSkillRow.filename}</span>
                        <button
                          className="btn-regen-inline"
                          onClick={() => handleRegenerateTarget('components')}
                          disabled={regeneratingTarget !== null}
                          title="Regenerate components skill"
                          style={{ marginLeft: 'auto' }}
                        >
                          {regeneratingTarget === 'components'
                            ? <span className="spin-ring" style={{ width: 8, height: 8 }} />
                            : '↺'}
                        </button>
                      </div>
                      <div className="sidebar-sub-skill-meta">
                        {(new Blob([componentsSkillRow.content]).size / 1024).toFixed(1)} KB
                        {componentsSkillRow.generated_at ? ` · ${daysAgoLabel(componentsSkillRow.generated_at)}` : ''}
                      </div>
                    </div>
                  </div>
                )}
```

Note: Task 2's `sidebar-sub-skill-box` class is already in place. The `SidebarLabel` rename is already done from Task 1, so just include `Skills Folder` here.

- [ ] **Step 4: Add `.btn-regen-inline` CSS and remove `.btn-regenerate`**

In `src/styles/globals.css`:

Add before the existing `.btn-regenerate` block (line 2981):
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
  flex-shrink: 0;
}
.btn-regen-inline:hover { opacity: 1; color: var(--t1); }
.btn-regen-inline:disabled { opacity: 0.3; cursor: default; }
```

Remove the three `.btn-regenerate` rules (lines 2981–3000):
```css
/* DELETE these three rules: */
.btn-regenerate { ... }
.btn-regenerate:hover:not(:disabled) { ... }
.btn-regenerate:disabled { ... }
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat: per-file regenerate buttons, remove global regenerate button"
```
