# Library Infrastructure Sync — Design Spec

## Problem

The My Library view (`src/views/Library.tsx`) was built before several backend features were added. It now lags behind the infrastructure it depends on:

- **Tier system** (Tier 1 vs 2) — invisible in Library, fully supported in RepoDetail
- **Type badges** — hardcoded 5-type `TYPE_BADGE` map instead of the real `type_bucket`/`type_sub` system (8 buckets, 75+ sub-types)
- **Verification badges** — shown in RepoDetail, absent in Library
- **"Updates" stat pill** — hardcoded to 0, dead placeholder
- **Sub-skills** — components sub-skills and versioned installs exist in DB (`sub_skills` table) but are invisible in Library

## Approach

Incremental integration: add missing data to the existing layout without restructuring. Reuse existing components and patterns from RepoDetail, RepoCard, and Discover.

## Scope

Six changes, no new components or IPC handlers.

---

## 1. Data Layer

### 1.1 `LibraryRow` type (`src/types/repo.ts`)

Add `tier` to the interface:

```typescript
export interface LibraryRow extends RepoRow {
  active: number
  version: string | null
  generated_at: string | null
  filename: string
  content: string
  enabled_components: string | null
  tier?: number  // 1 | 2, from skills table
}
```

### 1.2 `library:getAll` SQL (`electron/main.ts`)

Include `s.tier` in the SELECT:

```sql
SELECT r.*, s.active, s.version, s.generated_at, s.filename, s.content, s.enabled_components, s.tier
FROM repos r INNER JOIN skills s ON r.id = s.repo_id
ORDER BY s.generated_at DESC
```

### 1.3 Sub-skill fetching (on selection)

When `selected` changes, fetch in parallel using existing IPC:

- `window.api.skill.getSubSkill(owner, name, 'components')` → `SubSkillRow | null`
- `window.api.skill.getVersionedInstalls(owner, name)` → `string[]`

Store in component state: `componentsSubSkill` (`SubSkillRow | null`, defined in `src/types/repo.ts`) and `versionedInstalls` (`string[]`). No loading spinners needed — these are local DB queries.

**Note**: `verification_tier`, `verification_signals`, `type_bucket`, and `type_sub` are already available on `LibraryRow` via `RepoRow` inheritance and the `r.*` in the SQL query. No additional query changes are needed for those fields.

---

## 2. List Row Changes

### 2.1 Replace hardcoded type badges

Remove the `TYPE_BADGE` constant (5-entry map). Replace with `getSubTypeConfig(row.type_sub)` from `src/config/repoTypeConfig.ts`.

- Renders label and accent color from the real sub-type system
- Fallback: if `type_sub` is null, show no badge (instead of the current "lib" default)

**Note on grouping logic**: The existing `row.type === 'components'` checks used for section grouping (component libs vs active vs inactive) and for choosing `ComponentDetail` vs `GenericDetail` should remain unchanged. The `type` field continues to serve this purpose. Only the *badge rendering* switches to `type_sub`.

### 2.2 Add verification badge

Add `VerificationBadge` component (already exists, used in RepoDetail) to rows where `verification_tier` is non-null. Size: `"sm"`. Positioned after the repo name.

- Parse `verification_signals` from JSON string to `string[]` before passing as props (use `JSON.parse()` with fallback to `[]`).
- If `verification_tier` is non-null but `verification_signals` is null, pass `signals` as `[]`.

### 2.3 Add tier indicator

Show a small "Enhanced" badge on rows where `(tier ?? 1) >= 2`. Use the existing `badge-enhanced` CSS class from RepoDetail.

### 2.4 Row layout

```
[Lang] [Name] [VerificationBadge?] [TypeBadge?] [EnhancedBadge?]    [ActiveDot] [Toggle]
```

No changes to: language badge, active dot, toggle switch, row click behavior.

---

## 3. Detail Panel Changes

### 3.1 Tier in header

- **GenericDetail and ComponentDetail**: Show "Enhanced" badge in header when `(tier ?? 1) >= 2`.

### 3.2 Enhance action

- Add "Enhance" button next to "Regenerate" when `(tier ?? 1) < 2`.
- Uses existing `window.api.skill.enhance(owner, name)` IPC handler.
- Same `btn-enhance` CSS class as RepoDetail.
- On success, update local state with returned `{ content, version, generated_at, tier: 2 }`.
- On failure, catch the error and leave state unchanged (no toast needed — same pattern as regenerate).
- Disable the "Enhance" button during the operation using the existing `regenerating` state (share with regenerate since they are mutually exclusive).

### 3.3 Sub-skills section

Add a "Sub-skills" section at the bottom of the details area in both GenericDetail and ComponentDetail.

**Components sub-skill** (when `componentsSubSkill` is non-null):
- Row showing: filename, generation date (display-only — no toggle, as no `sub_skills` toggle IPC handler exists)

**Versioned installs** (when `versionedInstalls` has entries):
- List each version tag with generation date
- Read-only display (installs are managed from RepoDetail's releases section)

**If neither exists**: omit the section entirely (no empty state).

---

## 4. Stat Pills

Remove the "Updates" pill (hardcoded to 0). Keep only:

- **Skills**: total count of all rows
- **Active**: count of rows where `active === 1`

---

## Files Modified

| File | Change |
|------|--------|
| `src/types/repo.ts` | Add `tier` to `LibraryRow` |
| `electron/main.ts` | Add `s.tier` to `library:getAll` SQL |
| `src/views/Library.tsx` | All UI changes: remove `TYPE_BADGE`, add imports for `getSubTypeConfig`/`VerificationBadge`, add tier badge/enhance button, add sub-skills section, remove Updates pill, fetch sub-skill data on selection |

## Files NOT Modified

- No new components created
- No new IPC handlers added
- No changes to existing `VerificationBadge`, `repoTypeConfig.ts`, or skill generation pipeline

## Dependencies

All dependencies already exist in the codebase:

- `VerificationBadge` component (`src/components/VerificationBadge.tsx`)
- `getSubTypeConfig()` function (`src/config/repoTypeConfig.ts`)
- `skill:enhance` IPC handler (`electron/main.ts`)
- `skill:getSubSkill` IPC handler (`electron/main.ts`)
- `skill:get-versioned-installs` IPC handler (`electron/main.ts`)
- `badge-enhanced`, `btn-enhance` CSS classes (`src/styles/globals.css`)
