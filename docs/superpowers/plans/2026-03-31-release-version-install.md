# Release-Version Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users install a skill generated from a specific GitHub release tag, using the README pinned to that tag, coexisting alongside the latest install.

**Architecture:** Thread an optional `ref` field through the existing `skill:generate` IPC path — preload type → main handler. When `ref` is present, `getReadme` fetches at that tag, the component scan is skipped, output is written to `{name}@{sanitised_ref}.skill.md`, and the row is stored in `sub_skills`. A new `skill:get-versioned-installs` handler returns installed refs so the UI can pre-populate per-row state on tab mount. `sanitiseRef` is extracted to its own utility file so it can be tested without importing Electron.

**Tech Stack:** Electron IPC, better-sqlite3, React, TypeScript, Vitest.

---

## File Map

| File | Change |
|------|--------|
| `electron/sanitiseRef.ts` | **Create** — pure `sanitiseRef` helper |
| `electron/sanitiseRef.test.ts` | **Create** — unit tests for sanitiseRef |
| `electron/github.ts` | Add optional `ref` param to `getReadme` |
| `electron/github.test.ts` | Add tests for `getReadme` ref param (reuse existing `mockFetch`) |
| `electron/preload.ts` | Add `ref` to `skill.generate` options type; add `getVersionedInstalls` binding |
| `electron/main.ts` | Import `sanitiseRef`; update `skill:generate` handler; add `skill:get-versioned-installs` handler |
| `electron/main.test.ts` | Test `skill:get-versioned-installs` query logic using in-memory DB |
| `src/views/RepoDetail.tsx` | Add per-row install button + state to Releases tab |
| `src/styles/globals.css` | Hover/installed styles for release row install button |

---

## Task 1: `sanitiseRef` utility

Extracted to its own file so it can be tested without importing Electron's `app`/`ipcMain`.

**Files:**
- Create: `electron/sanitiseRef.ts`
- Create: `electron/sanitiseRef.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/sanitiseRef.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sanitiseRef } from './sanitiseRef'

describe('sanitiseRef', () => {
  it('passes through a clean semver tag unchanged', () => {
    expect(sanitiseRef('v1.2.3')).toBe('v1.2.3')
  })

  it('passes through a pre-release tag unchanged', () => {
    expect(sanitiseRef('v9.0.0-beta.0')).toBe('v9.0.0-beta.0')
  })

  it('replaces slashes with underscores', () => {
    expect(sanitiseRef('releases/v7.3.9')).toBe('releases_v7.3.9')
  })

  it('strips leading @scope/ prefix entirely', () => {
    expect(sanitiseRef('@scope/v7')).toBe('v7')
  })

  it('preserves underscores introduced by slash replacement', () => {
    const result = sanitiseRef('releases/v7.3.9')
    expect(result).toContain('_')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run electron/sanitiseRef.test.ts --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

Create `electron/sanitiseRef.ts`:

```ts
/**
 * Sanitise a GitHub tag ref for safe use in a filename.
 * - Replaces `/` with `_` (e.g. releases/v7.3.9 → releases_v7.3.9)
 * - Strips any character outside [a-zA-Z0-9._\-_] (removes @, spaces, etc.)
 */
export function sanitiseRef(ref: string): string {
  return ref
    .replace(/^@[^/]+\//, '')   // strip leading @scope/ prefix (e.g. @scope/v7 → v7)
    .replace(/\//g, '_')         // remaining slashes → underscores
    .replace(/[^a-zA-Z0-9._\-_]/g, '')  // strip anything else unsafe in filenames
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run electron/sanitiseRef.test.ts --reporter=verbose
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/sanitiseRef.ts electron/sanitiseRef.test.ts
git commit -m "feat: add sanitiseRef utility for versioned skill filenames"
```

---

## Task 2: `getReadme` ref parameter

**Files:**
- Modify: `electron/github.ts:105-111`
- Modify: `electron/github.test.ts` (add to existing file, reusing `mockFetch`)

- [ ] **Step 1: Write the failing tests**

In `electron/github.test.ts`, add a new `describe` block at the end of the file. Do **not** create a new `mockFetch` — reuse the module-level one already declared at line 4:

```ts
describe('getReadme', () => {
  beforeEach(() => mockFetch.mockReset())

  it('appends ?ref= query param when ref is provided', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({ content: Buffer.from('# hello').toString('base64'), encoding: 'base64' })
    )
    await getReadme(null, 'owner', 'repo', 'v7.3.9')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('?ref=v7.3.9'),
      expect.anything()
    )
  })

  it('omits ?ref= when ref is not provided', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({ content: Buffer.from('# hello').toString('base64'), encoding: 'base64' })
    )
    await getReadme(null, 'owner', 'repo')
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).not.toContain('?ref=')
  })

  it('returns null on 404 regardless of ref', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    const result = await getReadme(null, 'owner', 'repo', 'v1.0.0')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run electron/github.test.ts --reporter=verbose 2>&1 | grep -A3 "getReadme"
```

Expected: FAIL — `getReadme` does not accept a fourth argument.

- [ ] **Step 3: Implement the change**

In `electron/github.ts` line 105, change:

```ts
export async function getReadme(token: string | null, owner: string, name: string): Promise<string | null> {
  const res = await fetch(`${BASE}/repos/${owner}/${name}/readme`, { headers: githubHeaders(token) })
```

To:

```ts
export async function getReadme(token: string | null, owner: string, name: string, ref?: string): Promise<string | null> {
  const url = ref
    ? `${BASE}/repos/${owner}/${name}/readme?ref=${encodeURIComponent(ref)}`
    : `${BASE}/repos/${owner}/${name}/readme`
  const res = await fetch(url, { headers: githubHeaders(token) })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run electron/github.test.ts --reporter=verbose 2>&1 | grep -A3 "getReadme"
```

Expected: all 3 new tests PASS, no existing tests broken.

- [ ] **Step 5: Commit**

```bash
git add electron/github.ts electron/github.test.ts
git commit -m "feat: add optional ref param to getReadme"
```

---

## Task 3: Preload — type updates + new binding

**Files:**
- Modify: `electron/preload.ts:58-59` and after `getSubSkill` (line 95)

- [ ] **Step 1: Add `ref` to the generate options type**

In `electron/preload.ts` line 58, change:

```ts
generate: (owner: string, name: string, options?: { enabledComponents?: string[], target?: 'master' | 'components' | 'all' }) =>
  ipcRenderer.invoke('skill:generate', owner, name, options),
```

To:

```ts
generate: (owner: string, name: string, options?: { enabledComponents?: string[], target?: 'master' | 'components' | 'all', ref?: string }) =>
  ipcRenderer.invoke('skill:generate', owner, name, options),
```

- [ ] **Step 2: Add `getVersionedInstalls` binding**

After the `getSubSkill` line (the last entry in the `skill` object, currently line 95–96), add:

```ts
getVersionedInstalls: (owner: string, name: string): Promise<string[]> =>
  ipcRenderer.invoke('skill:get-versioned-installs', owner, name),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add ref to skill.generate options and getVersionedInstalls binding"
```

---

## Task 4: Main process — `skill:generate` ref path

**Files:**
- Modify: `electron/main.ts:726` (handler signature and body)

Add `import { sanitiseRef } from './sanitiseRef'` at the top of the file alongside other local imports.

- [ ] **Step 1: Add the import**

At the top of `electron/main.ts`, with the other local imports, add:

```ts
import { sanitiseRef } from './sanitiseRef'
```

- [ ] **Step 2: Update the handler signature**

At line 726, change:

```ts
ipcMain.handle('skill:generate', async (_, owner: string, name: string, options?: { enabledComponents?: string[], target?: 'master' | 'components' | 'all' }) => {
```

To:

```ts
ipcMain.handle('skill:generate', async (_, owner: string, name: string, options?: { enabledComponents?: string[], target?: 'master' | 'components' | 'all', ref?: string }) => {
```

- [ ] **Step 3: Update the README fetch, version, and releases logic**

Replace lines 730–732:

```ts
const readme = await getReadme(token, owner, name) ?? ''
const releases = await getReleases(token, owner, name)
const version = releases[0]?.tag_name ?? 'unknown'
```

With:

```ts
const ref = options?.ref
const readme = await getReadme(token, owner, name, ref)
if (ref && readme === null) throw new Error(`README not found at ref ${ref}`)
const readmeContent = readme ?? ''
const releases = ref ? [] : await getReleases(token, owner, name)
const version = ref ?? (releases[0]?.tag_name ?? 'unknown')
```

- [ ] **Step 4: Update `skillInput` to use `readmeContent`**

Find the line (currently ~777):

```ts
const skillInput = { owner, name, language, topics, readme, version, isComponents, enabledComponents: options?.enabledComponents, scannedComponents }
```

Change `readme` to `readme: readmeContent`:

```ts
const skillInput = { owner, name, language, topics, readme: readmeContent, version, isComponents, enabledComponents: options?.enabledComponents, scannedComponents }
```

- [ ] **Step 5: Skip component scan when `ref` is set**

The component scan block starts with `if (isComponents) {` (~line 747). Change it to:

```ts
if (isComponents && !ref) {
```

This skips scanning entirely for versioned installs — component scanning at arbitrary tags is out of scope.

- [ ] **Step 6: Update the target and file write block**

Change the target line (~775):

```ts
const target = options?.target ?? 'all'
```

To:

```ts
const target = ref ? 'master' : (options?.target ?? 'all')
```

Replace the file write and DB upsert block for `content` (~lines 819–836) with the following. The components sub-skill block that follows must also be guarded with `if (!ref && componentsContent)`:

```ts
const dir = path.join(app.getPath('userData'), 'skills', owner)
await fs.mkdir(dir, { recursive: true })
const generated_at = new Date().toISOString()

if (content !== undefined) {
  if (ref) {
    // Versioned install — write to sub_skills, never touch the skills table
    const safe = sanitiseRef(ref)
    const filename = `${name}@${safe}.skill.md`
    await fs.writeFile(path.join(dir, filename), content, 'utf8')
    db.prepare(`
      INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(repo_id, skill_type) DO UPDATE SET
        filename     = excluded.filename,
        content      = excluded.content,
        version      = excluded.version,
        generated_at = excluded.generated_at
    `).run(repo.id, `version:${safe}`, filename, content, version, generated_at)
  } else {
    // Default install — existing logic unchanged
    if (componentsContent) {
      content += `\n\n## [SKILLS]\ncomponents: ${name}.components.skill.md\n`
    }
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
}

// Components sub-skill — only for non-versioned installs
if (!ref && componentsContent) {
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
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add electron/main.ts
git commit -m "feat: skill:generate supports ref for version-pinned installs"
```

---

## Task 5: `skill:get-versioned-installs` IPC handler

**Files:**
- Modify: `electron/main.ts` (add handler)
- Modify: `electron/main.test.ts` (or nearest test file for main process logic)

Note: this test validates the SQL query shape using an in-memory DB directly. The IPC handler wiring itself cannot be unit-tested without full Electron mocking, which is out of scope. The integration is verified by the manual smoke test in Task 7.

- [ ] **Step 1: Write the failing test**

In the main process test file, add:

```ts
import Database from 'better-sqlite3'
import { initSchema } from './db'

describe('versioned installs query', () => {
  it('returns version refs stripping the version: prefix, ignoring non-version sub_skills', () => {
    const db = new Database(':memory:')
    initSchema(db)

    // Seed a repo (only non-nullable columns required)
    db.prepare("INSERT INTO repos (id, owner, name) VALUES ('r1', 'owner', 'repo')").run()

    // One versioned sub-skill and one components sub-skill
    db.prepare("INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active) VALUES ('r1', 'version:v7.3.9', 'repo@v7.3.9.skill.md', '', 'v7.3.9', '', 1)").run()
    db.prepare("INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active) VALUES ('r1', 'components', 'repo.components.skill.md', '', '', '', 1)").run()

    const rows = db.prepare(
      "SELECT skill_type FROM sub_skills WHERE repo_id = ? AND skill_type LIKE 'version:%'"
    ).all('r1') as { skill_type: string }[]
    const refs = rows.map((r: { skill_type: string }) => r.skill_type.replace(/^version:/, ''))

    expect(refs).toEqual(['v7.3.9'])
  })
})
```

- [ ] **Step 2: Run to verify the test passes** (the query is pure SQL — no new implementation needed to pass this test)

```bash
npx vitest run electron/main.test.ts --reporter=verbose 2>&1 | grep -A5 "versioned installs"
```

Expected: PASS.

- [ ] **Step 3: Add the IPC handler to `main.ts`**

After the closing line of the `skill:generate` handler block, add:

```ts
ipcMain.handle('skill:get-versioned-installs', async (_, owner: string, name: string) => {
  const db = getDb(app.getPath('userData'))
  const repo = db.prepare('SELECT id FROM repos WHERE owner = ? AND name = ?').get(owner, name) as { id: string } | undefined
  if (!repo) return []
  const rows = db.prepare(
    "SELECT skill_type FROM sub_skills WHERE repo_id = ? AND skill_type LIKE 'version:%'"
  ).all(repo.id) as { skill_type: string }[]
  return rows.map(r => r.skill_type.replace(/^version:/, ''))
})
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add skill:get-versioned-installs IPC handler"
```

---

## Task 6: Releases tab — per-row install button

**Files:**
- Modify: `src/views/RepoDetail.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add state declarations**

In `RepoDetail.tsx`, near line 408 alongside other `useState` declarations, add:

```ts
const [versionedInstalls, setVersionedInstalls] = useState<Set<string>>(new Set())
const [versionInstallStates, setVersionInstallStates] = useState<Map<string, 'UNINSTALLED' | 'GENERATING' | 'INSTALLED' | 'ERROR'>>(new Map())
```

- [ ] **Step 2: Fetch versioned installs on mount**

Near line 501 alongside the existing `getReleases` call, add:

```ts
window.api.skill.getVersionedInstalls(owner, name)
  .then(refs => setVersionedInstalls(new Set(refs)))
  .catch(() => {})
```

- [ ] **Step 3: Add the install handler function**

Before the component's `return` statement, add:

```ts
async function handleVersionInstall(tag: string) {
  setVersionInstallStates(prev => new Map(prev).set(tag, 'GENERATING'))
  try {
    await window.api.github.saveRepo(owner ?? '', name ?? '')
    await window.api.skill.generate(owner ?? '', name ?? '', { ref: tag })
    setVersionInstallStates(prev => new Map(prev).set(tag, 'INSTALLED'))
    setVersionedInstalls(prev => new Set([...prev, tag]))
  } catch {
    setVersionInstallStates(prev => new Map(prev).set(tag, 'ERROR'))
  }
}
```

- [ ] **Step 4: Replace the releases render block**

Find the existing releases render block (the `<div className="repo-releases">` section, ~lines 1068–1083) and replace it with:

```tsx
<div className="repo-releases">
  {(releases as ReleaseRow[]).map(r => {
    const isInstalled = versionedInstalls.has(r.tag_name)
    const rowState = isInstalled ? 'INSTALLED' : (versionInstallStates.get(r.tag_name) ?? 'UNINSTALLED')
    const safe = sanitiseRef(r.tag_name)
    return (
      <div key={r.tag_name} className="repo-release-item">
        <div className="repo-release-header">
          <span className="repo-release-tag">{r.tag_name}</span>
          {r.name && <span className="repo-release-name">{r.name}</span>}
          <span className="repo-release-date">{formatDate(r.published_at)}</span>
          <div className="repo-release-install">
            {rowState === 'INSTALLED' ? (
              <span className="repo-release-installed-label">{name}@{safe}.skill.md</span>
            ) : rowState === 'GENERATING' ? (
              <span className="repo-release-installing-label">Installing…</span>
            ) : rowState === 'ERROR' ? (
              <button className="repo-release-install-btn repo-release-install-btn--error" onClick={() => handleVersionInstall(r.tag_name)}>
                Failed — retry
              </button>
            ) : (
              <button className="repo-release-install-btn" onClick={() => handleVersionInstall(r.tag_name)}>
                Install this version
              </button>
            )}
          </div>
        </div>
        {r.body && (
          <p className="repo-release-body">
            {r.body.slice(0, 200)}{r.body.length > 200 ? '…' : ''}
          </p>
        )}
      </div>
    )
  })}
</div>
```

Note: `sanitiseRef` is used in the renderer only to derive the display filename. Import it:

```ts
import { sanitiseRef } from '../../electron/sanitiseRef'
```

Add this import at the top of `RepoDetail.tsx` with the other imports.

- [ ] **Step 5: Add CSS**

In `src/styles/globals.css`, find the `.repo-release-item` block and add after it:

```css
.repo-release-install {
  margin-left: auto;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.repo-release-item:hover .repo-release-install {
  opacity: 1;
}
.repo-release-install-btn {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 5px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent-text);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}
.repo-release-install-btn:hover {
  background: var(--accent-hover);
}
.repo-release-install-btn--error {
  border-color: var(--red-border);
  background: var(--red-soft);
  color: var(--red);
}
.repo-release-installed-label {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--t3);
  white-space: nowrap;
}
.repo-release-installing-label {
  font-size: 11px;
  color: var(--t3);
  font-style: italic;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat: per-row install button on Releases tab for version-pinned skills"
```

---

## Task 7: Full test suite + smoke test

- [ ] **Step 1: Run all tests**

```bash
npx vitest run 2>&1
```

Expected: all existing tests pass; all new tests pass.

- [ ] **Step 2: Fix any regressions**

If any pre-existing tests fail, fix them before marking complete. Do not skip or delete tests.

- [ ] **Step 3: Smoke-test manually**

1. Launch the app (`npm run dev` or equivalent)
2. Open any repo with releases (e.g. material-ui)
3. Click the **Releases** tab
4. Hover a release row — "Install this version" button appears
5. Click it — shows "Installing…" then switches to the versioned filename label
6. Navigate away and back to the same repo — the installed row still shows the installed label
7. Click the main `+ Install` header button — still works, creates `{name}.skill.md`, does not affect versioned rows

- [ ] **Step 4: Commit any fixes**

```bash
git add -p
git commit -m "fix: resolve any regressions from versioned install changes"
```
