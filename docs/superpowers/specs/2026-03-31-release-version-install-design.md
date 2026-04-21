# Release-Version Install Design

**Date:** 2026-03-31
**Status:** Approved

## Problem

The `+ Install` button on a repo always generates a skill from the latest default branch. Users who need an older or specific release (e.g. material-ui v7 instead of v9 beta) have no way to install a version-pinned skill that reflects that release's actual docs and API surface.

## Goal

Allow users to install a skill generated from a specific release tag, using the README at that tag. The versioned skill coexists with the latest install without conflict.

## Approach

Extend the existing `skill:generate` IPC flow with an optional `ref` parameter. When present, the main process fetches the README at that tag ref and names the output file with the version appended. No new IPC channels, no duplicated logic, no regression to the existing install path.

---

## What Is New vs Existing

All of the following are **net-new additions** — none exist in the codebase today:

- `ref` field on the `skill.generate` options type (preload + main handler)
- `window.api.skill.getVersionedInstalls` preload binding
- `skill:get-versioned-installs` IPC handler in main.ts
- `getReadme` ref parameter in github.ts
- Per-row install button UI in the Releases tab

Existing code that is **unchanged**: `skills` table, `sub_skills` table schema, `skill:get`, `skill:delete`, the main `+ Install` button flow.

---

## Design

### 1. UI — Releases Tab

**File:** `src/views/RepoDetail.tsx`

- Each release row gets a small "Install this version" button revealed on row hover.
- The button follows the same three-state machine as the main install button: `UNINSTALLED → GENERATING → INSTALLED`.
- On tab mount, install state is checked for all visible rows via a single batched call `window.api.skill.getVersionedInstalls(owner, name)` which returns a `string[]` of installed version refs. The component converts this to a `Set<string>` locally for O(1) per-row membership checks. IPC serialisation cannot carry a `Set` — the conversion happens in the renderer, not in preload. This avoids N+1 IPC round-trips for repos with many releases (capped at 10 by the existing fetch).
- If a row's tag is in the installed set, the button is replaced with a muted "Installed" label showing the versioned filename (e.g. `material-ui@v7.3.9.skill.md`).
- The existing `+ Install` header button is unchanged — it always installs latest.
- Repos with no releases already hide the Releases tab entirely (existing `hasReleases` guard) — no new empty-state UI needed.

### 2. IPC / Preload

**File:** `electron/preload.ts`

Add `ref` to the existing options object — no new channel needed:

```ts
window.api.skill.generate(owner, name, {
  target?: 'master' | 'components' | 'all'
  enabledComponents?: string[]
  ref?: string   // ← new, optional release tag e.g. "v7.3.9"
})
```

Add a new batched lookup call:

```ts
window.api.skill.getVersionedInstalls(owner: string, name: string): Promise<string[]>
// Returns array of installed version refs for that repo, e.g. ["v7.3.9", "v8.0.0"]
```

The existing `skill:get` call is unchanged.

### 3. DB Schema

**File:** `electron/db.ts`

The current `skills` table uses `repo_id TEXT PRIMARY KEY` — only one row per repo. A versioned install must not overwrite the latest-install row.

The existing `sub_skills` table already has a `(repo_id, skill_type)` composite primary key and supports multiple rows per repo. Versioned installs are stored here with `skill_type = 'version:<sanitised_ref>'`, e.g. `skill_type = 'version:v7.3.9'`.

No schema migration required — `sub_skills` already exists with the right shape.

A new IPC handler `skill:get-versioned-installs` queries `sub_skills WHERE repo_id = ? AND skill_type LIKE 'version:%'` and returns the list of version refs.

### 4. Main Process — `skill:generate` handler

**File:** `electron/main.ts`

The `ipcMain.handle('skill:generate', ...)` handler signature in `main.ts` must be updated to extract `ref` from the incoming options object alongside the existing `enabledComponents` and `target` fields.

When `ref` is present in the incoming options:

| Step | Current behaviour | With `ref` |
|------|------------------|------------|
| README fetch | `getReadme(token, owner, name)` | `getReadme(token, owner, name, ref)` |
| Version field | `releases[0]?.tag_name ?? 'unknown'` | `ref` directly |
| Component scan | runs against `repo.default_branch` | **unchanged — always uses `default_branch`** (see note) |
| Output filename | `{name}.skill.md` | `{name}@{sanitised_ref}.skill.md` |
| Storage table | `skills` (upsert by `repo_id`) | `sub_skills` (upsert by `(repo_id, 'version:<ref>')`) |

**Component scan note:** Scanning source files at an arbitrary tag is out of scope. When `ref` is set, the component scan is skipped entirely (same as `target: 'master'`). The skill is generated from the README only.

**Filename sanitisation:** `tag_name` values from GitHub can contain slashes (e.g. `releases/v7.3.9`) which are invalid in Windows filenames. The ref is sanitised before embedding in the filename: replace `/` with `_`, strip any characters outside `[a-zA-Z0-9._@-]`. Example: `releases/v7.3.9` → `releases_v7.3.9`.

**Error handling:** If `getReadme` returns null for the specified ref (tag predates README, or tag does not exist), the handler returns an error: `"README not found at ref <ref>"` rather than silently generating an empty skill.

### 5. GitHub API

**File:** `electron/github.ts`

`getReadme(token, owner, name)` gains an optional fourth parameter `ref?: string` passed as `?ref=<value>` in the query string:

```ts
async function getReadme(token: string, owner: string, name: string, ref?: string): Promise<string | null>
```

`getRepoTree` and `getFileContent` are not modified — component scanning at a specific ref is out of scope.

---

## Out of Scope

- Component skill generation at a specific tag (source scanning at arbitrary refs is complex).
- Showing a diff between versions.
- Automatically upgrading a pinned version when a new release ships.
- Installing from a pre-release tag via the header `+ Install` button (only available per-row in the Releases tab).

---

## Testing

| Case | Expected |
|------|----------|
| Install v7.3.9 of a repo | Creates `{name}@v7.3.9.skill.md` in skills folder; row stored in `sub_skills` with `skill_type = 'version:v7.3.9'` |
| Install v7.3.9 then install latest | Both rows exist; latest in `skills`, versioned in `sub_skills`; files do not overwrite each other |
| Tab mount with one version installed | That row shows `INSTALLED` state; others show `UNINSTALLED` |
| Tag name with slash (`releases/v7.3.9`) | Filename is `{name}@releases_v7.3.9.skill.md`; sanitisation applied |
| `ref` pointing to non-existent tag or tag with no README | Handler returns error `"README not found at ref <ref>"`; UI shows error state on that row |
| Install via header `+ Install` button | Behaviour identical to today; `ref` is absent; no regression |
| Delete main skill when versioned installs exist | Existing `skill:delete` already iterates and removes all `sub_skills` rows including versioned ones — DB rows are removed; files are deleted where they exist on disk (missing files are silently ignored by the existing handler). No per-row "delete this version" action is provided in this iteration. |
| Ref beginning with `@` (e.g. `@scope/v7`) | Sanitisation strips the leading `@` since the filename already uses `@` as a separator — result: `{name}@scopev7.skill.md`. Leading `@` in a ref is collapsed by the regex pass. |
