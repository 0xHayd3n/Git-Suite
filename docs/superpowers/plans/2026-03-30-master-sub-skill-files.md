# Master + Sub-Skill Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the skill file system so each repo has a master skill (overview, install, core patterns) plus optional sub-skill files generated for specific concerns — starting with a `components` sub-skill for component libraries.

**Architecture:** A new `sub_skills` table (keyed on `repo_id + skill_type`) stores sub-skill files independently of the master `skills` table. When a repo is installed, the master skill is always generated; if the repo is a component library, a `components` sub-skill is also generated in a second Haiku call. The master skill appends a `## [SKILLS]` section listing available sub-skills. The MCP server exposes a new `get_components_skill` tool. The UI shows both files in the Skills tab when both are present. The `active` column on `sub_skills` is reserved for a future toggle — always set to 1 in this iteration; no user-facing toggle is built yet.

**Tech Stack:** TypeScript, Electron IPC (ipcMain/ipcRenderer), better-sqlite3, React, claude-haiku-4-5 CLI

---

## File Structure

| File | Change |
|------|--------|
| `electron/db.ts` | Add `sub_skills` table in the main `db.exec()` block |
| `src/types/repo.ts` | Add `SubSkillRow` interface |
| `src/env.d.ts` | Add `skill.getSubSkill` to `window.api` |
| `electron/preload.ts` | Expose `skill:getSubSkill` IPC |
| `electron/skill-gen.ts` | Add `buildComponentsPrompt()` + `generateComponentsSkillViaLocalCLI()` |
| `electron/main.ts` | Update `skill:generate`, `skill:delete`; add `skill:getSubSkill` handler |
| `src/views/RepoDetail.tsx` | Load + display components sub-skill below master in Skills tab |
| `electron/mcp-server.ts` | Add `get_components_skill` tool; update `list_skills` to note sub-skills |

---

## Task 1: Add `sub_skills` DB table

**Files:**
- Modify: `electron/db.ts`

The existing `skills` table has `repo_id TEXT PRIMARY KEY` — only one row per repo. Rather than alter that table (risky for existing users), add a separate `sub_skills` table for all sub-skill types.

**Important:** New tables belong inside the existing `db.exec(...)` block in `initSchema`, NOT in a try/catch Phase migration block. The try/catch pattern is only for `ALTER TABLE` statements. `CREATE TABLE IF NOT EXISTS` is idempotent and safe to put in the main block.

- [ ] **Step 1: Add `sub_skills` table inside the existing `db.exec(...)` block in `initSchema`**

Find the `db.exec(\`...\`)` block in `electron/db.ts` (starts around line 8). Add the new table after the `settings` table and before the closing backtick:

```sql
CREATE TABLE IF NOT EXISTS sub_skills (
  repo_id      TEXT NOT NULL REFERENCES repos(id),
  skill_type   TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content      TEXT NOT NULL,
  version      TEXT,
  generated_at TEXT,
  active       INTEGER DEFAULT 1,
  PRIMARY KEY (repo_id, skill_type)
);
```

- [ ] **Step 2: Verify no crash on startup**

Run: `npm run dev` and confirm the app opens without errors.
Expected: App loads normally; `sub_skills` table now exists in `gitsuite.db`.

- [ ] **Step 3: Commit**

```bash
git add electron/db.ts
git commit -m "feat: add sub_skills table for per-type skill files"
```

---

## Task 2: Add `SubSkillRow` type and expose IPC surface

**Files:**
- Modify: `src/types/repo.ts`
- Modify: `src/env.d.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add `SubSkillRow` to `src/types/repo.ts`**

After the existing `SkillRow` interface:

```typescript
export interface SubSkillRow {
  repo_id: string
  skill_type: string          // 'components' | future types
  filename: string
  content: string
  version: string | null
  generated_at: string | null // nullable — matches DB schema (TEXT, no NOT NULL)
  active: number
}
```

- [ ] **Step 2: Add `skill.getSubSkill` to `window.api` in `src/env.d.ts`**

Update the import at the top of `env.d.ts` to include `SubSkillRow`:
```typescript
import type { RepoRow, ReleaseRow, SkillRow, SubSkillRow, LibraryRow, CollectionRow, CollectionRepoRow, StarredRepoRow } from './types/repo'
```

Inside the `skill:` block in `Window`, after the existing entries:

```typescript
getSubSkill(owner: string, name: string, skillType: string): Promise<SubSkillRow | null>
```

- [ ] **Step 3: Expose `skill:getSubSkill` in `electron/preload.ts`**

Inside the `skill:` object, after the existing entries:

```typescript
getSubSkill: (owner: string, name: string, skillType: string) =>
  ipcRenderer.invoke('skill:getSubSkill', owner, name, skillType),
```

- [ ] **Step 4: Commit**

```bash
git add src/types/repo.ts src/env.d.ts electron/preload.ts
git commit -m "feat: add SubSkillRow type and getSubSkill IPC surface"
```

---

## Task 3: Components prompt + generation functions in `skill-gen.ts`

**Files:**
- Modify: `electron/skill-gen.ts`

The components sub-skill uses a completely different prompt — flat per-component format instead of CORE/EXTENDED/DEEP depth sections.

- [ ] **Step 1: Add `buildComponentsPrompt()` after the existing `buildPrompt()` function**

```typescript
function buildComponentsPrompt(input: SkillGenInput): string {
  const readmeTruncated = input.readme.slice(0, 12000)
  const componentList = input.enabledComponents && input.enabledComponents.length > 0
    ? `Only document these components: ${input.enabledComponents.join(', ')}.`
    : 'Document all components you can identify from the README.'

  return `Generate a components skill file for the GitHub repository "${input.owner}/${input.name}".

Language: ${input.language}
Version: ${input.version}

README:
${readmeTruncated}

${componentList}

Produce a components.skill.md file using this exact format:

## [COMPONENTS]

One sentence describing what this component library provides and its design system (e.g. Material Design, Radix primitives, headless, etc.).

Then for each component, use this structure:

### ComponentName
**Import:** \`import { ComponentName } from 'package-name'\`
**Props:** (list key props as: \`propName\` — type — default — description)
**Variants:** variant1 | variant2 | variant3 (omit if not applicable)
**Example:**
\`\`\`tsx
<ComponentName prop="value" onEvent={handler} />
\`\`\`
**Gotcha:** one-line gotcha if there is a common mistake (omit if none)

---

Rules:
- Write for an AI coding assistant — optimise for fast, accurate component usage
- Include ONLY components documented in the README above — do not invent components
- Key props only (3–6 per component) — skip internal/rarely-used props
- Prefer real prop names from the README over guessed names
- Do not include URLs unless they appear verbatim in the README
- Group related components under a #### Category heading (e.g. #### Form & Input)
- Start immediately with ## [COMPONENTS] on its own line — no preamble
- Do not use any tools — output the skill file text directly.`
}
```

- [ ] **Step 2: Add `generateComponentsSkillViaLocalCLI()` after `generateSkillViaLocalCLI()`**

```typescript
export async function generateComponentsSkillViaLocalCLI(input: SkillGenInput): Promise<string> {
  const nodePath = await findNode()
  if (!nodePath) throw new Error('Node.js not found. Cannot invoke Claude Code CLI.')

  const cliPath = findLocalCli()
  if (!cliPath) throw new Error('Claude Code not found in node_modules. Run npm install.')

  console.log(`[skill-gen] generateComponentsSkillViaLocalCLI: node=${nodePath} cli=${cliPath}`)

  return new Promise((resolve, reject) => {
    const proc = spawn(
      nodePath,
      [cliPath, '--print', '--output-format', 'json', '--max-turns', '3', '--model', 'claude-haiku-4-5'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: buildEnv(true),
      }
    )

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))
    proc.on('error', (err) => reject(new Error(`Failed to spawn node: ${err.message}`)))

    proc.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf8')
      const stderr = Buffer.concat(errChunks).toString('utf8')

      let parsed: { result?: string; is_error?: boolean } | null = null
      try { parsed = JSON.parse(stdout) } catch { /* not JSON */ }

      if (parsed !== null) {
        if (parsed.is_error) {
          const msg = parsed.result ?? 'unknown error'
          reject(new Error(`Claude CLI error (components): ${msg.slice(0, 300)}`))
          return
        }
        const result = parsed.result ?? ''
        if (!result.trim()) {
          reject(new Error('Components skill generation returned empty content. Please try again.'))
          return
        }
        resolve(stripHallucinatedUrls(result, input.readme))
        return
      }

      if (code !== 0) {
        const detail = stderr || stdout || '(no output)'
        reject(new Error(`Claude CLI exited with code ${code}: ${detail.slice(0, 400)}`))
        return
      }

      resolve(stripHallucinatedUrls(stdout.trim(), input.readme))
    })

    proc.stdin.write(buildComponentsPrompt(input), 'utf8')
    proc.stdin.end()
  })
}
```

- [ ] **Step 3: Add API-key fallback `generateComponentsSkill()` after the CLI version**

```typescript
export async function generateComponentsSkill(input: SkillGenInput, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildComponentsPrompt(input) }],
  })
  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return stripHallucinatedUrls(raw, input.readme)
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/skill-gen.ts
git commit -m "feat: add components skill prompt and generation functions"
```

---

## Task 4: Update `main.ts` IPC handlers

**Files:**
- Modify: `electron/main.ts`

Four changes: (1) update import; (2) `skill:generate` generates components sub-skill when applicable and appends `## [SKILLS]` to master; (3) `skill:delete` removes sub-skill files and rows; (4) add `skill:getSubSkill` handler.

- [ ] **Step 1: Update the import line at the top of `main.ts`**

Find the existing import from `./skill-gen` and add the two new exports:

```typescript
import {
  generateSkill, generateSkillViaLocalCLI,
  generateComponentsSkill, generateComponentsSkillViaLocalCLI,
  detectClaudeCode, checkAuthStatus, findNpm, installClaudeCLI,
  triggerClaudeAuth, invalidateClaudePathCache, loginClaude
} from './skill-gen'
```

- [ ] **Step 2: Update `skill:generate` handler — generate components sub-skill and append `## [SKILLS]`**

Find the block immediately after `content` is assigned (after the try/catch for `generateSkillViaLocalCLI`/`generateSkill`). Insert before the `fs.mkdir` / `fs.writeFile` calls:

```typescript
  // ── Generate components sub-skill (if applicable) ────────────────
  let componentsContent: string | null = null
  if (isComponents) {
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

  // Append ## [SKILLS] section to master skill listing available sub-skills
  if (componentsContent) {
    content += `\n\n## [SKILLS]\ncomponents: ${name}.components.skill.md\n`
  }
```

- [ ] **Step 3: Write components sub-skill file and upsert to DB**

After the master skill `fs.writeFile` and DB insert/upsert, add:

```typescript
  // ── Persist components sub-skill ─────────────────────────────────
  // sub.filename is a basename (e.g. "myrepo.components.skill.md"), not a full path
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
      -- active is intentionally NOT updated — preserved for future user toggle
    `).run(repo.id, compFilename, componentsContent, version, generated_at)
  }
```

- [ ] **Step 4: Update `skill:delete` to also remove sub-skills**

Find the `skill:delete` handler. After the existing `fs.unlink` for the master skill file, add:

```typescript
  // Remove all sub-skill files and DB rows (filename is a basename under skills/<owner>/)
  const subSkills = db.prepare(
    `SELECT filename FROM sub_skills WHERE repo_id = (SELECT id FROM repos WHERE owner = ? AND name = ?)`
  ).all(owner, name) as { filename: string }[]

  for (const sub of subSkills) {
    const subPath = path.join(app.getPath('userData'), 'skills', owner, sub.filename)
    await fs.unlink(subPath).catch(() => {})
  }

  db.prepare(
    `DELETE FROM sub_skills WHERE repo_id = (SELECT id FROM repos WHERE owner = ? AND name = ?)`
  ).run(owner, name)
```

- [ ] **Step 5: Add `skill:getSubSkill` handler**

Add alongside the other skill handlers. Note: no `active` filter here — IPC returns whatever is stored; callers decide whether to show inactive rows. This is consistent with `skill:get` which also doesn't filter on `active`.

```typescript
ipcMain.handle('skill:getSubSkill', (_event, owner: string, name: string, skillType: string) => {
  return db.prepare(`
    SELECT ss.* FROM sub_skills ss
    JOIN repos r ON ss.repo_id = r.id
    WHERE r.owner = ? AND r.name = ? AND ss.skill_type = ?
  `).get(owner, name, skillType) ?? null
})
```

- [ ] **Step 6: Manual verification checklist**

After implementing Steps 1–5, verify manually:
- Install a known component library (e.g. `mui/material-ui` or `shadcn-ui/ui`)
- Confirm `## [SKILLS]` section appears at the bottom of the master skill content in the UI
- Open the app's DB (`gitsuite.db`) and confirm a row exists in `sub_skills` with `skill_type = 'components'`
- Confirm the components skill file exists at `<userData>/skills/<owner>/<name>.components.skill.md`
- Uninstall the skill and confirm both the master and components rows are gone from the DB
- Confirm both `.skill.md` and `.components.skill.md` files are deleted from disk

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
git commit -m "feat: generate components sub-skill on install, persist to sub_skills table"
```

---

## Task 5: Display components sub-skill in `RepoDetail.tsx`

**Files:**
- Modify: `src/views/RepoDetail.tsx`

When a components sub-skill is present, show it in the Skills tab below the master skill file.

- [ ] **Step 1: Add `componentsSkillRow` state alongside `skillRow`**

Import `SubSkillRow` (update the existing import line):
```typescript
import { parseTopics, formatStars, type RepoRow, type ReleaseRow, type SkillRow, type SubSkillRow } from '../types/repo'
```

Add state near `skillRow`:
```typescript
const [componentsSkillRow, setComponentsSkillRow] = useState<SubSkillRow | null>(null)
```

- [ ] **Step 2: Load components sub-skill in the effect that loads `skillRow`**

Find the effect that calls `window.api.skill.get(owner, name)`. After `setSkillRow(row)` (or `setSkillRow(null)` on the clear path), add:

```typescript
// Load components sub-skill if present
const compRow = await window.api.skill.getSubSkill(owner, name, 'components').catch(() => null)
setComponentsSkillRow(compRow)
```

Also clear on the reset path (where `setSkillRow(null)` is called when owner/name changes):
```typescript
setComponentsSkillRow(null)
```

- [ ] **Step 3: Refresh components sub-skill after install / regenerate / uninstall**

In `handleInstall` and `handleRegenerate`, after `setSkillRow(freshRow)`:
```typescript
const freshComp = await window.api.skill.getSubSkill(owner, name, 'components').catch(() => null)
setComponentsSkillRow(freshComp)
```

In `handleUninstall`, after `setSkillRow(null)`:
```typescript
setComponentsSkillRow(null)
```

- [ ] **Step 4: Render components sub-skill in the Skills tab**

Find the `<SkillFileContent content={skillRow.content} />` line in the Skills tab render. After it, add:

```tsx
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
```

Note: `generated_at` is nullable on `SubSkillRow` — guard before calling `daysAgoLabel`.

- [ ] **Step 5: Add CSS for the sub-skill section in `src/styles/globals.css`**

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

- [ ] **Step 6: Commit**

```bash
git add src/views/RepoDetail.tsx src/styles/globals.css
git commit -m "feat: display components sub-skill in Skills tab"
```

---

## Task 6: Update MCP server to expose components sub-skill

**Files:**
- Modify: `electron/mcp-server.ts`

Add a `get_components_skill` MCP tool and update `list_skills` to surface which repos have sub-skills. The MCP `get_components_skill` filters `WHERE active = 1` (consistent with other MCP queries). The IPC `skill:getSubSkill` does not filter on `active` — this is intentional; the two paths have different roles (MCP = Claude's view of what's active; IPC = raw data access for the UI).

- [ ] **Step 1: Add `handleGetComponentsSkill` export function**

```typescript
export function handleGetComponentsSkill(
  db: Database.Database,
  dataDir: string,
  owner: string,
  repo: string
): ToolResult {
  // filename is a basename only — construct full path from dataDir/skills/<owner>/
  const row = db.prepare(`
    SELECT ss.filename FROM sub_skills ss
    JOIN repos r ON ss.repo_id = r.id
    WHERE r.owner = ? AND r.name = ? AND ss.skill_type = 'components' AND ss.active = 1
  `).get(owner, repo) as { filename: string } | undefined

  if (!row) return text(`No components skill file found for ${owner}/${repo}`)

  const skillPath = path.join(dataDir, 'skills', owner, row.filename)
  const resolved = path.resolve(skillPath)
  const base = path.resolve(path.join(dataDir, 'skills'))
  if (!resolved.startsWith(base + path.sep)) return text(`Invalid skill path for ${owner}/${repo}`)
  if (!fs.existsSync(resolved)) return text(`Components skill file missing on disk for ${owner}/${repo}`)

  return text(fs.readFileSync(resolved, 'utf8'))
}
```

- [ ] **Step 2: Register `get_components_skill` in the tools list**

In the `ListToolsRequestSchema` handler, add after the `get_skill` entry:

```typescript
{
  name: 'get_components_skill',
  description:
    'Get the components skill file for a component library repository. Contains per-component props, variants, import paths, and usage examples. Use this when working with UI components from an installed library.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner/organisation' },
      repo: { type: 'string', description: 'Repository name' },
    },
    required: ['owner', 'repo'],
  },
},
```

- [ ] **Step 3: Wire it in the `CallToolRequestSchema` switch**

```typescript
case 'get_components_skill':
  if (!input.owner || !input.repo) return text('Missing required parameters: owner, repo')
  return handleGetComponentsSkill(db, dataDir, input.owner, input.repo)
```

- [ ] **Step 4: Update `handleListSkills` to note sub-skills**

Replace the `lines` map with:

```typescript
const subSkillMap = new Map<string, string[]>()
const subs = db.prepare(`
  SELECT r.owner, r.name, ss.skill_type
  FROM sub_skills ss
  JOIN repos r ON r.id = ss.repo_id
  WHERE ss.active = 1
`).all() as Array<{ owner: string; name: string; skill_type: string }>

for (const s of subs) {
  const key = `${s.owner}/${s.name}`
  if (!subSkillMap.has(key)) subSkillMap.set(key, [])
  subSkillMap.get(key)!.push(s.skill_type)
}

const lines = skills.map((s) => {
  const key = `${s.owner}/${s.name}`
  const subTypes = subSkillMap.get(key) ?? []
  const subNote = subTypes.length > 0 ? ` | Sub-skills: ${subTypes.join(', ')}` : ''
  return (
    `${s.owner}/${s.name} (${s.language ?? 'unknown'}) — ${s.description ?? 'No description'}\n` +
    `  Version: ${s.version ?? 'unknown'} | File: ${s.filename}${subNote}`
  )
})
```

- [ ] **Step 5: Commit**

```bash
git add electron/mcp-server.ts
git commit -m "feat: add get_components_skill MCP tool, list sub-skills in list_skills"
```

---

## Task 7: Add `## [SKILLS]` and `## [COMPONENTS]` section colouring

**Files:**
- Modify: `src/views/RepoDetail.tsx`

The `SECTION_COLORS` map needs entries for the two new section markers. The current values in the file are:

```typescript
const SECTION_COLORS: Record<string, string> = {
  '## [CORE]':     '#059669',
  '## [EXTENDED]': '#6d28d9',
  '## [DEEP]':     '#4c1d95',
}
```

- [ ] **Step 1: Add `## [SKILLS]` and `## [COMPONENTS]` entries**

Replace the existing `SECTION_COLORS` object with:

```typescript
const SECTION_COLORS: Record<string, string> = {
  '## [CORE]':       '#059669',
  '## [EXTENDED]':   '#6d28d9',
  '## [DEEP]':       '#4c1d95',
  '## [COMPONENTS]': '#0891b2',  // cyan — component library sub-skill
  '## [SKILLS]':     '#64748b',  // muted slate — index/directory marker
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: add SKILLS and COMPONENTS section colour markers"
```
