# Skill File Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all generated skill files in the sidebar (nested under master) and replace the appended sub-skill layout in the expanded Skill tab with a clickable file icon picker.

**Architecture:** Two independent changes in the same two files — (1) sidebar gets tree-style nested sub-skill rows between the master panel and the Regenerate button; (2) the expanded skill tab gets a `selectedSkillFile` state and a horizontal file card picker at the top that drives which file's metadata and content are shown below.

**Tech Stack:** React + TypeScript, CSS custom properties, existing `SkillFileContent` component, `daysAgoLabel` helper already in scope.

---

## File Map

| File | Change |
|------|--------|
| `src/views/RepoDetail.tsx` | Add `selectedSkillFile` state; add sidebar sub-skill rows; replace skill tab content |
| `src/styles/globals.css` | Add sidebar sub-skill row CSS; add file picker CSS; remove `.sub-skill-section*` CSS |

---

### Task 1: Sidebar nested sub-skill rows

**Files:**
- Modify: `src/styles/globals.css` (after line 2909, before `/* ── Regenerate skill button ── */`)
- Modify: `src/views/RepoDetail.tsx` (between line 1289 `</div>` and line 1290 `<button className="btn-regenerate"`)

---

- [ ] **Step 1: Add sidebar sub-skill CSS to `globals.css`**

Insert after the `.sidebar-skill-panel-meta` closing brace (line 2909) and before the `/* ── Regenerate skill button ── */` comment:

```css
/* ── Sidebar sub-skill rows ── */
.sidebar-sub-skill-rows {
  padding-left: 12px;
  border-left: 1px solid var(--border2);
  margin-left: 8px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sidebar-sub-skill-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-sub-skill-header {
  display: flex;
  align-items: center;
  gap: 5px;
}
.sidebar-sub-skill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sidebar-sub-skill-filename {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--t1);
  font-weight: 500;
}
.sidebar-sub-skill-meta {
  font-family: 'Inter', sans-serif;
  font-size: 9px;
  color: var(--t3);
  padding-left: 11px;
}
```

The `old_string` to match for the Edit tool:
```
}

/* ── Regenerate skill button ── */
```
The `new_string`:
```
}

/* ── Sidebar sub-skill rows ── */
.sidebar-sub-skill-rows {
  padding-left: 12px;
  border-left: 1px solid var(--border2);
  margin-left: 8px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sidebar-sub-skill-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-sub-skill-header {
  display: flex;
  align-items: center;
  gap: 5px;
}
.sidebar-sub-skill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sidebar-sub-skill-filename {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--t1);
  font-weight: 500;
}
.sidebar-sub-skill-meta {
  font-family: 'Inter', sans-serif;
  font-size: 9px;
  color: var(--t3);
  padding-left: 11px;
}

/* ── Regenerate skill button ── */
```

- [ ] **Step 2: Add sidebar sub-skill JSX to `RepoDetail.tsx`**

The insertion point is between the closing `</div>` of `.sidebar-skill-panel` (line 1289) and the `<button className="btn-regenerate"` (line 1290). Use the Edit tool with this `old_string`:

```tsx
                </div>
                <button
                  className="btn-regenerate"
```

Replace with:

```tsx
                </div>
                {componentsSkillRow && (
                  <div className="sidebar-sub-skill-rows">
                    <div className="sidebar-sub-skill-row">
                      <div className="sidebar-sub-skill-header">
                        <span className="sidebar-sub-skill-dot" style={{ background: '#6366f1' }} />
                        <span className="sidebar-sub-skill-filename">{componentsSkillRow.filename}</span>
                      </div>
                      <div className="sidebar-sub-skill-meta">
                        {(new Blob([componentsSkillRow.content]).size / 1024).toFixed(1)} KB
                        {componentsSkillRow.generated_at ? ` · ${daysAgoLabel(componentsSkillRow.generated_at)}` : ''}
                      </div>
                    </div>
                  </div>
                )}
                <button
                  className="btn-regenerate"
```

- [ ] **Step 3: Run the dev server and verify visually**

```bash
npm run dev
```

- Navigate to any installed repo that has a components sub-skill (e.g. material-ui).
- Confirm the sidebar shows the components filename in monospace with an indigo dot, indented below the master panel, between the master card and the Regenerate button.
- Confirm the Regenerate button still appears and works.
- Confirm that for a repo without a components sub-skill, no extra rows appear.

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat: show sub-skill files as nested rows in sidebar"
```

---

### Task 2: File picker in expanded Skill file tab

**Files:**
- Modify: `src/styles/globals.css` — add file picker CSS after `.skill-tab-note` block (line 2309); remove `.sub-skill-section*` blocks (lines 3002–3026)
- Modify: `src/views/RepoDetail.tsx` — add `selectedSkillFile` state (after line 406); replace skill tab content (lines 937–989)

---

- [ ] **Step 1: Add file picker CSS to `globals.css`**

Insert after the `.skill-tab-note` closing brace (line 2309) and before `/* ── Settings view ── */`. Use this `old_string`:

```css
}

/* ── Settings view ── */
```

Replace with:

```css
}

/* ── Skill file picker ── */
.skill-file-picker {
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.skill-file-card {
  --card-color: #059669;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border2);
  background: var(--bg2);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  min-width: 90px;
  max-width: 180px;
}
.skill-file-card:hover {
  border-color: var(--card-color);
}
.skill-file-card.active {
  border-color: var(--card-color);
  background: var(--bg3);
}
.skill-file-card-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--t2);
  text-align: center;
  word-break: break-all;
  line-height: 1.4;
}

/* ── Settings view ── */
```

- [ ] **Step 2: Remove `.sub-skill-section*` CSS from `globals.css`**

Find and delete the following block entirely (lines 3002–3026). Use `old_string`:

```css
.sub-skill-section {
  margin-top: 16px;
  border-top: 1px solid var(--border2);
}

.sub-skill-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg2);
}

.sub-skill-section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--t2);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sub-skill-section-meta {
  font-size: 10px;
  color: var(--t3);
}
```

Replace with: *(empty string — delete entirely)*

- [ ] **Step 3: Add `selectedSkillFile` state to `RepoDetail.tsx`** (two edits)

**Edit A** — declare the state after line 406. Use `old_string`:

```tsx
  const [componentsSkillRow, setComponentsSkillRow] = useState<SubSkillRow | null>(null)

  // Video state
```

Replace with:

```tsx
  const [componentsSkillRow, setComponentsSkillRow] = useState<SubSkillRow | null>(null)
  const [selectedSkillFile, setSelectedSkillFile] = useState<string>('master')

  // Video state
```

**Edit B** — reset to `'master'` on repo navigation (line 466, in the reset block). Use `old_string`:

```tsx
    setSkillRow(null)
    setComponentsSkillRow(null)
    setStarred(false)
```

Replace with:

```tsx
    setSkillRow(null)
    setComponentsSkillRow(null)
    setSelectedSkillFile('master')
    setStarred(false)
```

- [ ] **Step 4: Replace skill tab content in `RepoDetail.tsx`**

Replace the current skill tab truthy branch (lines 937–989). Use `old_string`:

```tsx
                      <div className="skill-tab-header">
                        <div className="skill-tab-header-meta">
                          <span>{name}.skill.md</span>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: 'var(--t3)', fontWeight: 400 }}>{skillRow.version ?? ''}</span>
                        </div>
                        <div className="skill-tab-file-info">
                          <span>
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                              <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 8.75 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688Z"/>
                            </svg>
                            {skillRow.filename}
                          </span>
                          <span>
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                            </svg>
                            {daysAgoLabel(skillRow.generated_at)}
                          </span>
                          <span>
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                              <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm.25-11.25a.75.75 0 0 0-1.5 0v4.69L5.03 7.72a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l2.5-2.5a.75.75 0 0 0-1.06-1.06L8.25 9.44V4.75Z"/>
                            </svg>
                            {(new Blob([skillRow.content]).size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        {skillDepths && [
                          { label: 'Core',     lines: skillDepths.core,     pct: Math.round((skillDepths.core / Math.max(skillDepths.core + skillDepths.extended + skillDepths.deep, 1)) * 100),                                                                                          color: '#059669' },
                          { label: 'Extended', lines: skillDepths.extended, pct: Math.round(((skillDepths.core + skillDepths.extended) / Math.max(skillDepths.core + skillDepths.extended + skillDepths.deep, 1)) * 100), color: '#6d28d9' },
                          { label: 'Deep',     lines: skillDepths.deep,     pct: 100,                                                                                                                                      color: '#4c1d95' },
                        ].map(d => (
                          <div key={d.label} className="skill-tab-depth-row">
                            <span className="skill-tab-depth-label">{d.label}</span>
                            <div className="skill-tab-depth-track">
                              <div className="skill-tab-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
                            </div>
                            <span className="skill-tab-depth-meta">~{d.lines} lines</span>
                          </div>
                        ))}
                        <p className="skill-tab-note">Models read as far as context allows.</p>
                      </div>
                      <SkillFileContent content={skillRow.content} />
                      {componentsSkillRow && (
                        <div className="sub-skill-section">
                          <div className="sub-skill-section-header">
                            <span className="sub-skill-section-label">⬡ Components</span>
                            <span className="sub-skill-section-meta">
                              {(new Blob([componentsSkillRow.content]).size / 1024).toFixed(1)} KB
                              {componentsSkillRow.generated_at ? ` · ${daysAgoLabel(componentsSkillRow.generated_at)}` : ''}
                            </span>
                          </div>
                          <SkillFileContent content={componentsSkillRow.content} />
                        </div>
                      )}
                    </>
```

Replace with:

```tsx
                      {(() => {
                        const skillFiles = [
                          { key: 'master', filename: skillRow.filename, content: skillRow.content, version: skillRow.version, generated_at: skillRow.generated_at, color: '#059669' },
                          ...(componentsSkillRow ? [{ key: 'components', filename: componentsSkillRow.filename, content: componentsSkillRow.content, version: componentsSkillRow.version, generated_at: componentsSkillRow.generated_at, color: '#6366f1' }] : []),
                        ]
                        const selected = skillFiles.find(f => f.key === selectedSkillFile) ?? skillFiles[0]
                        return (
                          <>
                            <div className="skill-file-picker">
                              {skillFiles.map(f => (
                                <button
                                  key={f.key}
                                  className={`skill-file-card${selectedSkillFile === f.key ? ' active' : ''}`}
                                  style={{ '--card-color': f.color } as React.CSSProperties}
                                  onClick={() => setSelectedSkillFile(f.key)}
                                >
                                  <svg width="20" height="20" viewBox="0 0 16 16" fill={f.color}>
                                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 8.75 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688Z"/>
                                  </svg>
                                  <span className="skill-file-card-name">{f.filename}</span>
                                </button>
                              ))}
                            </div>
                            <div className="skill-tab-header">
                              <div className="skill-tab-file-info">
                                <span>
                                  <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                                    <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm.25-11.25a.75.75 0 0 0-1.5 0v4.69L5.03 7.72a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l2.5-2.5a.75.75 0 0 0-1.06-1.06L8.25 9.44V4.75Z"/>
                                  </svg>
                                  {(new Blob([selected.content]).size / 1024).toFixed(1)} KB
                                </span>
                                {(selected.version ?? '') !== '' && (
                                  <span>{selected.version}</span>
                                )}
                                {selected.generated_at && (
                                  <span>
                                    <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                                      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                                    </svg>
                                    {daysAgoLabel(selected.generated_at)}
                                  </span>
                                )}
                              </div>
                              {selected.key === 'master' && skillDepths && [
                                { label: 'Core',     lines: skillDepths.core,     pct: Math.round((skillDepths.core / Math.max(skillDepths.core + skillDepths.extended + skillDepths.deep, 1)) * 100),                                                                                          color: '#059669' },
                                { label: 'Extended', lines: skillDepths.extended, pct: Math.round(((skillDepths.core + skillDepths.extended) / Math.max(skillDepths.core + skillDepths.extended + skillDepths.deep, 1)) * 100), color: '#6d28d9' },
                                { label: 'Deep',     lines: skillDepths.deep,     pct: 100,                                                                                                                                      color: '#4c1d95' },
                              ].map(d => (
                                <div key={d.label} className="skill-tab-depth-row">
                                  <span className="skill-tab-depth-label">{d.label}</span>
                                  <div className="skill-tab-depth-track">
                                    <div className="skill-tab-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
                                  </div>
                                  <span className="skill-tab-depth-meta">~{d.lines} lines</span>
                                </div>
                              ))}
                              {selected.key === 'master' && <p className="skill-tab-note">Models read as far as context allows.</p>}
                            </div>
                            <SkillFileContent content={selected.content} />
                          </>
                        )
                      })()}
```

- [ ] **Step 5: Run the dev server and verify visually**

```bash
npm run dev
```

For a repo with both skill files (e.g. material-ui):
- Confirm the Skill file tab shows two file cards at the top: green master card and indigo components card.
- Master card is active (highlighted border) by default.
- Clicking the components card switches the metadata row and content to show the components file.
- Depth bars appear only when master card is active.
- Confirm no TypeScript errors in the console.

For a repo with only a master skill (no components):
- Confirm a single green card renders and the tab behaves identically to before.

- [ ] **Step 6: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat: add skill file picker to Skill tab, replace sub-skill divider"
```
