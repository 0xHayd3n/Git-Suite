# Library Infrastructure Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the My Library view up to date with backend capabilities: tier system, real type badges, verification badges, sub-skills visibility, and remove the dead Updates pill.

**Architecture:** Incremental integration into the existing Library.tsx layout. No new components or IPC handlers. All patterns reused from RepoDetail, RepoCard, and existing config utilities.

**Tech Stack:** React, TypeScript, Electron IPC, SQLite, CSS

**Spec:** `docs/superpowers/specs/2026-04-08-library-infrastructure-sync-design.md`

---

### Task 1: Data Layer — Add `tier` to `LibraryRow` and SQL query

**Files:**
- Modify: `src/types/repo.ts:86-93`
- Modify: `electron/main.ts:1254-1261`

- [ ] **Step 1: Add `tier` to `LibraryRow` interface**

In `src/types/repo.ts`, add `tier` as the last field of `LibraryRow`:

```typescript
export interface LibraryRow extends RepoRow {
  active: number
  version: string | null
  generated_at: string | null
  filename: string
  content: string
  enabled_components: string | null  // JSON string[] | null; null means all enabled
  tier?: number  // 1 | 2 — skill generation quality tier
}
```

- [ ] **Step 2: Add `s.tier` to `library:getAll` SQL**

In `electron/main.ts`, find the `library:getAll` handler at line 1254. Change the SELECT to include `s.tier`:

```typescript
ipcMain.handle('library:getAll', async () => {
  const db = getDb(app.getPath('userData'))
  return db.prepare(`
    SELECT r.*, s.active, s.version, s.generated_at, s.filename, s.content, s.enabled_components, s.tier
    FROM repos r
    INNER JOIN skills s ON r.id = s.repo_id
    ORDER BY s.generated_at DESC
  `).all()
})
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No type errors. The new optional `tier` field is backward-compatible.

- [ ] **Step 4: Commit**

```bash
git add src/types/repo.ts electron/main.ts
git commit -m "feat(library): add tier field to LibraryRow and library:getAll query"
```

---

### Task 2: Replace hardcoded TYPE_BADGE with real type system

**Files:**
- Modify: `src/views/Library.tsx:1-31` (imports and TYPE_BADGE constant)
- Modify: `src/views/Library.tsx:48-93` (LibraryListRow component)

- [ ] **Step 1: Add import for `getSubTypeConfig`**

At the top of `src/views/Library.tsx`, add the import:

```typescript
import { getSubTypeConfig } from '../config/repoTypeConfig'
```

- [ ] **Step 2: Remove the `TYPE_BADGE` constant**

Delete lines 23-31 (the entire `TYPE_BADGE` constant and its comment):

```typescript
// DELETE THIS:
// ── Type badge colours ────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  components: { bg: 'rgba(109,40,217,0.08)',  color: '#5b21b6', border: 'rgba(109,40,217,0.18)',  label: 'components' },
  framework:  { bg: 'rgba(217,119,6,0.08)',   color: '#92400e', border: 'rgba(217,119,6,0.20)',   label: 'framework' },
  cli:        { bg: 'rgba(5,150,105,0.08)',   color: '#065f46', border: 'rgba(5,150,105,0.20)',   label: 'cli' },
  data:       { bg: 'rgba(59,130,246,0.08)',  color: '#1e40af', border: 'rgba(59,130,246,0.18)',  label: 'data' },
  lib:        { bg: 'rgba(0,0,0,0.04)',       color: '#6b7280', border: 'rgba(0,0,0,0.12)',       label: 'lib' },
}
```

- [ ] **Step 3: Update `LibraryListRow` to use `getSubTypeConfig`**

Replace the badge lookup in `LibraryListRow`. Change:

```typescript
const badge = row.type ? TYPE_BADGE[row.type] : null
```

to:

```typescript
const typeConfig = getSubTypeConfig(row.type_sub)
```

Then update the badge rendering (the `{badge && (...)}` block) to use `typeConfig`:

```typescript
{typeConfig && (
  <div className="library-row-badges">
    <span
      className="library-type-badge"
      style={{
        background: `${typeConfig.accentColor}12`,
        color: typeConfig.accentColor,
        borderColor: `${typeConfig.accentColor}30`,
      }}
    >
      {typeConfig.label}
    </span>
  </div>
)}
```

Note: `accentColor` is a hex string (e.g., `#7c3aed`). Append `12` for bg opacity and `30` for border opacity (hex alpha).

**Behavioral change**: Rows that previously displayed a "lib" badge (the old default for unclassified repos) will now show no badge when `type_sub` is null. This is correct per spec.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors. The old `TYPE_BADGE` references are fully replaced.

- [ ] **Step 5: Commit**

```bash
git add src/views/Library.tsx
git commit -m "feat(library): replace hardcoded TYPE_BADGE with getSubTypeConfig"
```

---

### Task 3: Add VerificationBadge to list rows

**Files:**
- Modify: `src/views/Library.tsx` (imports and LibraryListRow component)

- [ ] **Step 1: Add import for VerificationBadge**

```typescript
import VerificationBadge from '../components/VerificationBadge'
```

- [ ] **Step 2: Add a helper to parse verification signals**

Add this helper near the top of the file, after the existing `daysSince` function:

```typescript
function parseSignals(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}
```

- [ ] **Step 3: Add VerificationBadge to LibraryListRow**

In the `LibraryListRow` component, after the name span and before the type badge block, add the verification badge. The updated `library-row-info` div should be:

```typescript
<div className="library-row-info">
  <span className="library-row-name">{row.name}</span>
  {row.verification_tier && (
    <VerificationBadge
      tier={row.verification_tier as 'verified' | 'likely'}
      signals={parseSignals(row.verification_signals)}
      size="sm"
    />
  )}
  {typeConfig && (
    <div className="library-row-badges">
      <span
        className="library-type-badge"
        style={{
          background: `${typeConfig.accentColor}12`,
          color: typeConfig.accentColor,
          borderColor: `${typeConfig.accentColor}30`,
        }}
      >
        {typeConfig.label}
      </span>
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors. VerificationBadge renders only when `verification_tier` is non-null.

- [ ] **Step 5: Commit**

```bash
git add src/views/Library.tsx
git commit -m "feat(library): add VerificationBadge to library list rows"
```

---

### Task 4: Add tier badge to list rows and detail panel headers

**Files:**
- Modify: `src/views/Library.tsx` (LibraryListRow, GenericDetail, ComponentDetail)

- [ ] **Step 1: Add "Enhanced" badge to LibraryListRow**

In `LibraryListRow`, after the type badge block and before the closing `</div>` of `library-row-info`, add:

```typescript
{(row.tier ?? 1) >= 2 && (
  <span className="badge-enhanced" style={{ fontSize: 9 }}>Enhanced</span>
)}
```

- [ ] **Step 2: Add "Enhanced" badge to GenericDetail header**

In the `GenericDetail` component, in the `lib-detail-title-block` div, after the owner button, add:

```typescript
{(row.tier ?? 1) >= 2 && (
  <span className="badge-enhanced">Enhanced</span>
)}
```

The updated `lib-detail-title-block` becomes:

```typescript
<div className="lib-detail-title-block">
  <div className="lib-detail-title">{row.name}</div>
  <button
    className="owner-name-btn lib-detail-owner"
    onClick={(e) => { e.stopPropagation(); openProfile(row.owner) }}
  >
    {row.owner}
  </button>
  {(row.tier ?? 1) >= 2 && (
    <span className="badge-enhanced">Enhanced</span>
  )}
</div>
```

- [ ] **Step 3: Add "Enhanced" badge to ComponentDetail header**

In the `ComponentDetail` component, in the `lib-detail-title-block` div (inside `lib-comp-header-top`), after the owner button, add the same badge:

```typescript
{(row.tier ?? 1) >= 2 && (
  <span className="badge-enhanced">Enhanced</span>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/Library.tsx
git commit -m "feat(library): add Enhanced tier badge to list rows and detail headers"
```

---

### Task 5: Add Enhance button to detail panels

**Files:**
- Modify: `src/views/Library.tsx` (GenericDetail, ComponentDetail, Library main component)

- [ ] **Step 1: Add `onEnhance` prop to GenericDetail**

Update `GenericDetail` props to accept an `onEnhance` callback:

```typescript
function GenericDetail({
  row, collections, onToggle, onRegenerate, onEnhance, onRemove, regenerating,
}: {
  row: LibraryRow
  collections: { id: string; name: string }[]
  onToggle: (active: boolean) => void
  onRegenerate: () => void
  onEnhance: () => void
  onRemove: () => void
  regenerating: boolean
}) {
```

- [ ] **Step 2: Add Enhance button to GenericDetail actions**

In the `lib-actions` div, add the Enhance button between Regenerate and Remove, conditionally shown when tier < 2:

```typescript
<div className="lib-actions">
  <button className="lib-btn-regen" onClick={onRegenerate} disabled={regenerating}>
    {regenerating ? '⟳ Regenerating…' : '↺ Regenerate'}
  </button>
  {(row.tier ?? 1) < 2 && (
    <button className="btn-enhance" onClick={onEnhance} disabled={regenerating}>
      Enhance
    </button>
  )}
  <button className="lib-btn-remove" onClick={onRemove}>
    Remove
  </button>
</div>
```

- [ ] **Step 3: Add Enhance button to ComponentDetail footer**

In the `ComponentDetail` component, in the `lib-comp-footer` div (inside the `activeTab === 'components'` block), add the Enhance button. Update the `ComponentDetail` props to include `onEnhance`:

Add `onEnhance` to the props interface:

```typescript
function ComponentDetail({
  row, collections, activeTab, onTabChange, componentSearch, onComponentSearchChange,
  onToggleComponent, onSelectAll, onRebuild, onEnhance, onToggleActive, regenerating,
}: {
  // ...existing props...
  onEnhance: () => void
  // ...rest...
}) {
```

In the `lib-comp-footer`, add the button before the rebuild button:

```typescript
<div className="lib-comp-footer">
  <span className="lib-comp-footer-note">Skill file reflects enabled components</span>
  {(row.tier ?? 1) < 2 && (
    <button className="btn-enhance" onClick={onEnhance} disabled={regenerating}>
      Enhance
    </button>
  )}
  <button className="lib-comp-rebuild-btn" onClick={onRebuild} disabled={regenerating}>
    {regenerating ? '⟳ Rebuilding…' : '↺ Rebuild skill'}
  </button>
</div>
```

- [ ] **Step 4: Add enhance handler in Library main component**

In the `Library` main component, create the `handleEnhance` function after the existing `handleToggle` function:

```typescript
async function handleEnhance(row: LibraryRow) {
  setRegenerating(true)
  try {
    const result = await window.api.skill.enhance(row.owner, row.name)
    setRows((prev) => prev.map((r) =>
      r.id === row.id
        ? { ...r, content: result.content, version: result.version, generated_at: result.generated_at, tier: result.tier }
        : r
    ))
    setSelected((prev) => prev?.id === row.id
      ? { ...prev, content: result.content, version: result.version, generated_at: result.generated_at, tier: result.tier }
      : prev
    )
  } catch {
    // Leave state unchanged on failure
  } finally {
    setRegenerating(false)
  }
}
```

- [ ] **Step 5: Wire `onEnhance` prop in JSX**

In the Library component's JSX, add the `onEnhance` prop to both detail components:

Where `ComponentDetail` is rendered (~line 599):

```typescript
onEnhance={() => handleEnhance(selected)}
```

Where `GenericDetail` is rendered (~line 650):

```typescript
onEnhance={() => handleEnhance(selected)}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/Library.tsx
git commit -m "feat(library): add Enhance button for Tier 1 skills"
```

---

### Task 6: Add sub-skills section to detail panels

**Files:**
- Modify: `src/views/Library.tsx` (Library state, selectRow, GenericDetail, ComponentDetail)

- [ ] **Step 1: Add SubSkillRow import and sub-skill state variables**

First, update the import at the top of `src/views/Library.tsx` (line 3) to include `SubSkillRow`:

```typescript
import { type LibraryRow, type SubSkillRow } from '../types/repo'
```

Then, in the `Library` main component, add state for sub-skill data after the existing `regenerating` state:

```typescript
const [componentsSubSkill, setComponentsSubSkill] = useState<SubSkillRow | null>(null)
const [versionedInstalls, setVersionedInstalls] = useState<string[]>([])
```

- [ ] **Step 2: Fetch sub-skill data on selection**

Update the `selectRow` callback to also fetch sub-skill data. Add these calls after the existing `getCollections` call:

```typescript
const selectRow = useCallback((row: LibraryRow) => {
  setSelected(row)
  setActiveTab(row.type === 'components' ? 'components' : 'skill')
  setComponentSearch('')
  setCollections([])
  setComponentsSubSkill(null)
  setVersionedInstalls([])
  window.api.library.getCollections(row.id).then(setCollections)
  window.api.skill.getSubSkill(row.owner, row.name, 'components').then(setComponentsSubSkill).catch(() => null)
  window.api.skill.getVersionedInstalls(row.owner, row.name).then(setVersionedInstalls).catch(() => [])
}, [])
```

- [ ] **Step 3: Add sub-skills props to GenericDetail**

Update `GenericDetail` props to receive sub-skill data:

```typescript
function GenericDetail({
  row, collections, onToggle, onRegenerate, onEnhance, onRemove, regenerating,
  componentsSubSkill, versionedInstalls,
}: {
  row: LibraryRow
  collections: { id: string; name: string }[]
  onToggle: (active: boolean) => void
  onRegenerate: () => void
  onEnhance: () => void
  onRemove: () => void
  regenerating: boolean
  componentsSubSkill: SubSkillRow | null
  versionedInstalls: string[]
}) {
```

- [ ] **Step 4: Render sub-skills section in GenericDetail**

In `GenericDetail`, after the `lib-details-section` div and before the `lib-actions` div, add:

```typescript
{/* Sub-skills */}
{(componentsSubSkill || versionedInstalls.length > 0) && (
  <div className="lib-details-section">
    <span className="lib-details-label">Sub-skills</span>
    {componentsSubSkill && (
      <DetailRow
        k="Components"
        v={`${componentsSubSkill.filename} · ${componentsSubSkill.generated_at ? daysSince(componentsSubSkill.generated_at) : '—'}`}
      />
    )}
    {versionedInstalls.map((tag) => (
      <DetailRow key={tag} k="Version" v={tag} />
    ))}
  </div>
)}
```

Note: `versionedInstalls` is `string[]` (tag names only). The `getVersionedInstalls` IPC returns only tag strings, so no generation date is available for versioned installs.

- [ ] **Step 5: Pass sub-skill props to GenericDetail in JSX**

Where `GenericDetail` is rendered in the Library component, add the two new props:

```typescript
componentsSubSkill={componentsSubSkill}
versionedInstalls={versionedInstalls}
```

- [ ] **Step 6: Add sub-skills section to ComponentDetail**

Update `ComponentDetail` props to also receive sub-skill data (same pattern). Add the props:

```typescript
componentsSubSkill: SubSkillRow | null
versionedInstalls: string[]
```

In the `activeTab === 'details'` section of `ComponentDetail`, after the existing `lib-details-section` div, add the same sub-skills section as GenericDetail (same JSX block from Step 4).

Pass the props where `ComponentDetail` is rendered in the Library component.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/views/Library.tsx
git commit -m "feat(library): add sub-skills section showing components and versioned installs"
```

---

### Task 7: Remove the dead "Updates" stat pill

**Files:**
- Modify: `src/views/Library.tsx` (~line 526-537)

- [ ] **Step 1: Remove the Updates pill**

In the Library component, find the stat pills array (~line 527). Change from:

```typescript
{[
  { value: rows.length, label: 'Skills' },
  { value: rows.filter((r) => r.active === 1).length, label: 'Active' },
  { value: 0, label: 'Updates' },
].map(({ value, label }) => (
```

to:

```typescript
{[
  { value: rows.length, label: 'Skills' },
  { value: rows.filter((r) => r.active === 1).length, label: 'Active' },
].map(({ value, label }) => (
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/Library.tsx
git commit -m "fix(library): remove dead Updates stat pill"
```

---

### Task 8: Manual smoke test

- [ ] **Step 1: Launch the app**

Run: `npm start`

- [ ] **Step 2: Navigate to My Library**

Click "My Library" in the sidebar. Verify:
- Stat pills show only "Skills" and "Active" (no "Updates")
- List rows show the correct sub-type label from the real type system (not the old 5-type map)
- Verified/likely-official repos show a verification badge next to the name
- Tier 2 skills show an "Enhanced" badge in the list row

- [ ] **Step 3: Select a skill**

Click on a skill in the list. Verify:
- Detail panel header shows "Enhanced" badge if tier >= 2
- "Enhance" button appears next to "Regenerate" if tier < 2
- Sub-skills section appears at bottom if components sub-skill or versioned installs exist
- If no sub-skills exist, no empty section is shown

- [ ] **Step 4: Select a component library skill**

Click on a component library skill. Verify:
- Same tier badge and enhance button behavior
- Sub-skills section appears in the "Details" tab
- Enhance button appears in the footer area

- [ ] **Step 5: Commit final state if any fixes were needed**

```bash
git add -A
git commit -m "fix(library): address smoke test findings"
```
