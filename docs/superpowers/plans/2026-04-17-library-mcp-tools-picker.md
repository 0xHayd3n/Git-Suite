# Library MCP Tools Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce an interactive MCP tools picker for MCP-server skills in the Library view. Users can enable/disable individual MCP tools and rebuild the skill file scoped to the selected subset — mirroring the existing ComponentDetail pattern. Adds a three-tier scanner (static source parse → manifest → README) that caches results in `sub_skills`, a new `enabled_tools` column on `skills`, and a new detail variant `MCPToolsDetail` that dispatches before `GenericDetail`.

**Architecture:** New static scanner `electron/mcp-scanner.ts` walks the repo's source tree (TS/JS/Python) for MCP SDK registrations, falls back to manifest files (`tools.json`, `mcp.json`, `.mcp/tools.json`), then to README heading extraction. Results are cached as a `mcp-tools` row in the existing `sub_skills` table. A new SQLite column `skills.enabled_tools` stores a JSON `string[]` of enabled tool names (null = all enabled). A new React component `MCPToolsDetail` mirrors `ComponentDetail`'s tabs/toolbar/footer. Variant dispatch in `Library.tsx` gains an `mcp-tools` branch ahead of `GenericDetail`. The skill generation prompt template gets a new `enabledTools` branch so rebuilds produce skills scoped to the selected tool subset.

**Tech Stack:** Electron + Node (scanner, IPC), better-sqlite3 (schema migration + `enabled_tools` column), React 18 + TypeScript (`MCPToolsDetail`), Vitest + @testing-library/react (component tests), Node fs/URL for static parsing (simple regex approach — no AST dependency).

**Spec:** [2026-04-17-library-discover-style-redesign-design.md](../specs/2026-04-17-library-discover-style-redesign-design.md) — section 5 covers this plan exclusively.

**Depends on:** [2026-04-17-library-layout-redesign.md](2026-04-17-library-layout-redesign.md) must land first — this plan inserts `MCPToolsDetail` into `Library.tsx`'s new variant dispatch and requires the `subSkillIds` plumbing added there.

**Branch policy:** Per user's CLAUDE.md override, all tasks commit directly to `main`. Do **not** create worktrees; subagent-driven-development's worktree prerequisite is overridden here.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/types/mcp.ts` | `McpTool` and `McpScanResult` interfaces |
| Create | `electron/mcp-scanner.ts` | Three-tier scanner: static parse → manifest → README. Exports `scanMcpTools(token, owner, name, branch)` |
| Create | `electron/mcp-scanner.test.ts` | Unit tests against in-repo fixtures (pure function tests — no IPC) |
| Create | `electron/fixtures/mcp-scanner/*` | Small TS/JS/Python fixtures + manifest JSON + README MD for the scanner tests |
| Modify | `electron/db.ts` | Migration: `ALTER TABLE skills ADD COLUMN enabled_tools TEXT` |
| Modify | `electron/main.ts` | New IPC handlers `mcp:scanTools`, `skill:setEnabledTools`; extend `skill:generate` to accept `enabledTools`; update `library:getAll` SELECT to project `s.enabled_tools`; pass `enabledTools` into the prompt |
| Modify | `electron/preload.ts` | Expose `window.api.mcp.scanTools` and `window.api.skill.setEnabledTools` |
| Modify | `electron/skill-generator.ts` (or wherever the prompt is built — see Task 6) | Add `enabledTools` branch to the prompt template |
| Modify | `src/types/repo.ts` | `LibraryRow.enabled_tools: string \| null` |
| Create | `src/components/MCPToolsDetail.tsx` | New interactive detail variant (Tools / Skill file / Details tabs; warning banner; Rebuild) |
| Create | `src/components/MCPToolsDetail.test.tsx` | Component tests |
| Modify | `src/views/Library.tsx` | Add variant dispatch: ComponentDetail → MCPToolsDetail → GenericDetail; fetch `mcp-tools` sub-skill on selection; update `subSkillIds` derivation |
| Modify | `src/views/Library.test.tsx` | Add dispatch tests for the mcp-tools branch |

---

## Task 1: Add `mcp.ts` types

**Files:**
- Create: `src/types/mcp.ts`

- [ ] **Step 1: Write the failing test**

Create `src/types/mcp.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { McpTool, McpScanResult } from './mcp'

describe('mcp types', () => {
  it('McpTool shape', () => {
    expectTypeOf<McpTool>().toHaveProperty('name').toEqualTypeOf<string>()
    expectTypeOf<McpTool>().toHaveProperty('description').toEqualTypeOf<string | null>()
    expectTypeOf<McpTool>().toHaveProperty('category').toEqualTypeOf<string | null>()
    expectTypeOf<McpTool>().toHaveProperty('source').toEqualTypeOf<'static' | 'manifest' | 'readme-approx'>()
  })

  it('McpScanResult shape', () => {
    expectTypeOf<McpScanResult>().toHaveProperty('tools').toEqualTypeOf<McpTool[]>()
    expectTypeOf<McpScanResult>().toHaveProperty('source').toEqualTypeOf<'static' | 'manifest' | 'readme-approx'>()
    expectTypeOf<McpScanResult>().toHaveProperty('detectedAt').toEqualTypeOf<string>()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/types/mcp.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the types**

Create `src/types/mcp.ts`:

```typescript
export interface McpTool {
  name: string
  description: string | null
  category: string | null
  paramSchema: unknown | null
  source: 'static' | 'manifest' | 'readme-approx'
}

export interface McpScanResult {
  tools: McpTool[]
  source: 'static' | 'manifest' | 'readme-approx'
  detectedAt: string
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/types/mcp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/mcp.ts src/types/mcp.test.ts
git commit -m "feat(library): McpTool + McpScanResult types"
```

---

## Task 2: Scanner — static TypeScript / JavaScript tier

**Files:**
- Create: `electron/mcp-scanner.ts`
- Create: `electron/mcp-scanner.test.ts`
- Create: `electron/fixtures/mcp-scanner/static-ts/server.ts` (fixture)
- Create: `electron/fixtures/mcp-scanner/static-js/server.js` (fixture)

The scanner is decomposed to keep each tier independently testable. This task implements only the static TS/JS tier against local fixture files (no GitHub calls yet — the IPC wiring in Task 5 composes this with `getFileContent`).

The static parser uses simple regexes (no AST dependency). Patterns:

- `server.registerTool('name', { description: '...', ... })` — MCP SDK v1 pattern.
- `server.tool('name', { description: '...' })` — shorter alias.
- `server.registerTool("name", ...)` with double quotes.

Description extraction: the `description` field inside the object literal, parsed with a second regex. Failing to extract a description yields `null` (not an error).

- [ ] **Step 1: Write the failing test**

Create `electron/fixtures/mcp-scanner/static-ts/server.ts`:

```typescript
// Fixture — imitates a real MCP server file. NOT imported by the app.
const server = {} as any

server.registerTool('search_docs', {
  description: 'Search documentation by keyword.',
  inputSchema: {},
})

server.registerTool('list_files', {
  description: 'List files in a directory.',
})

server.registerTool("get_pr", { description: "Fetch a pull request by number." })
```

Create `electron/fixtures/mcp-scanner/static-js/server.js`:

```javascript
// Fixture — JS variant.
server.tool('ping', { description: 'Health check.' })
server.tool('noop')
```

Create `electron/mcp-scanner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseStaticTS } from './mcp-scanner'

const fixturePath = (name: string) => join(__dirname, 'fixtures/mcp-scanner', name)

describe('mcp-scanner — static TS', () => {
  it('extracts three tools with names and descriptions', () => {
    const source = readFileSync(fixturePath('static-ts/server.ts'), 'utf8')
    const tools = parseStaticTS(source)
    expect(tools).toHaveLength(3)
    expect(tools[0]).toMatchObject({ name: 'search_docs', description: 'Search documentation by keyword.', source: 'static' })
    expect(tools[1]).toMatchObject({ name: 'list_files', description: 'List files in a directory.', source: 'static' })
    expect(tools[2]).toMatchObject({ name: 'get_pr',      description: 'Fetch a pull request by number.', source: 'static' })
  })

  it('handles the shorter server.tool alias in JS', () => {
    const source = readFileSync(fixturePath('static-js/server.js'), 'utf8')
    const tools = parseStaticTS(source)
    expect(tools.map(t => t.name)).toEqual(['ping', 'noop'])
    expect(tools[0].description).toBe('Health check.')
    expect(tools[1].description).toBeNull()
  })

  it('returns empty array on no matches', () => {
    expect(parseStaticTS('const foo = 1;')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/mcp-scanner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parseStaticTS`**

Create `electron/mcp-scanner.ts`:

```typescript
import type { McpTool } from '../src/types/mcp'

const STATIC_TS_RX = /server\.(?:registerTool|tool)\s*\(\s*(['"])([\w.-]+)\1(?:\s*,\s*(\{[^}]*\}))?/g
const DESC_RX      = /description\s*:\s*(['"])(.*?)\1/

export function parseStaticTS(source: string): McpTool[] {
  const tools: McpTool[] = []
  let match: RegExpExecArray | null
  STATIC_TS_RX.lastIndex = 0
  while ((match = STATIC_TS_RX.exec(source)) !== null) {
    const name = match[2]
    const objBody = match[3] ?? ''
    const descMatch = objBody ? DESC_RX.exec(objBody) : null
    tools.push({
      name,
      description: descMatch?.[2] ?? null,
      category:    null,
      paramSchema: null,
      source:      'static',
    })
  }
  return tools
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/mcp-scanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/mcp-scanner.ts electron/mcp-scanner.test.ts electron/fixtures/mcp-scanner
git commit -m "feat(library): MCP scanner — static TS/JS tier"
```

---

## Task 3: Scanner — static Python tier

**Files:**
- Modify: `electron/mcp-scanner.ts`
- Modify: `electron/mcp-scanner.test.ts`
- Create: `electron/fixtures/mcp-scanner/static-py/server.py`

Python MCP servers use `@mcp.tool()` decorators. The function's docstring is the description.

- [ ] **Step 1: Write the failing test**

Create `electron/fixtures/mcp-scanner/static-py/server.py`:

```python
from mcp.server import FastMCP
mcp = FastMCP('demo')

@mcp.tool()
def list_users() -> list:
    """List all users."""
    return []

@mcp.tool()
def get_user(user_id: int):
    """Fetch a user by id."""
    return None

@mcp.tool()
def no_docstring():
    return 42
```

Append to `electron/mcp-scanner.test.ts`:

```typescript
import { parseStaticPy } from './mcp-scanner'

describe('mcp-scanner — static Python', () => {
  it('extracts decorated tools with docstrings', () => {
    const source = readFileSync(fixturePath('static-py/server.py'), 'utf8')
    const tools = parseStaticPy(source)
    expect(tools).toHaveLength(3)
    expect(tools[0]).toMatchObject({ name: 'list_users', description: 'List all users.', source: 'static' })
    expect(tools[1]).toMatchObject({ name: 'get_user',   description: 'Fetch a user by id.', source: 'static' })
    expect(tools[2]).toMatchObject({ name: 'no_docstring', description: null, source: 'static' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- electron/mcp-scanner.test.ts`
Expected: FAIL — `parseStaticPy` not exported.

- [ ] **Step 3: Implement `parseStaticPy`**

Append to `electron/mcp-scanner.ts`:

```typescript
// Two-pass parse: find each `@mcp.tool(...)\ndef name(...):`, then peek at the
// following line for an optional docstring (triple- or single-quoted).
const PY_DECL_RX = /@mcp\.tool\s*\([^)]*\)\s*\n\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\([^)]*\)(?:\s*->\s*[^:]+)?\s*:/g
const PY_DOCSTRING_RX = /^[ \t]*(?:("{3}|'{3})([\s\S]*?)\1|(['"])([^\r\n]*?)\3)/

export function parseStaticPy(source: string): McpTool[] {
  const tools: McpTool[] = []
  let match: RegExpExecArray | null
  PY_DECL_RX.lastIndex = 0
  while ((match = PY_DECL_RX.exec(source)) !== null) {
    const name = match[1]
    // Peek at the body directly after the `def ... :` header
    const after = source.slice(PY_DECL_RX.lastIndex).replace(/^\s*\n/, '')
    const doc = PY_DOCSTRING_RX.exec(after)
    const raw = doc ? (doc[2] ?? doc[4]) : null
    const description = raw ? raw.trim().split(/\r?\n/)[0].trim() : null
    tools.push({ name, description, category: null, paramSchema: null, source: 'static' })
  }
  return tools
}
```

Note: only the first line of a multi-line docstring is kept — that's acceptable fidelity for a picker UI.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- electron/mcp-scanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/mcp-scanner.ts electron/mcp-scanner.test.ts electron/fixtures/mcp-scanner/static-py
git commit -m "feat(library): MCP scanner — static Python tier"
```

---

## Task 4: Scanner — manifest + README tiers + chain orchestrator

**Files:**
- Modify: `electron/mcp-scanner.ts`
- Modify: `electron/mcp-scanner.test.ts`
- Create: `electron/fixtures/mcp-scanner/manifest/tools.json`
- Create: `electron/fixtures/mcp-scanner/readme/README.md`

Manifest tier: parse `tools.json` / `mcp.json` / `.mcp/tools.json`. Expected shape: `{ tools: [{ name, description?, category? }] }`.

README tier: find `## Tools` or `## Available tools` heading, extract bullet list entries. Each bullet's first backtick-quoted token is the tool name; anything after `—` or `:` is the description.

- [ ] **Step 1: Write the failing tests + fixtures**

Create `electron/fixtures/mcp-scanner/manifest/tools.json`:

```json
{
  "tools": [
    { "name": "fetch_issue", "description": "Fetch a GitHub issue.", "category": "github" },
    { "name": "close_issue", "description": "Close a GitHub issue.", "category": "github" },
    { "name": "ping" }
  ]
}
```

Create `electron/fixtures/mcp-scanner/readme/README.md`:

Write the file with literal em-dash characters (not `\u2014` escapes — markdown doesn't interpret those):

```markdown
# My MCP Server

Some intro prose.

## Tools

- `list_files` — list files in a directory
- `read_file`: read the contents of a file
- `search_code` — grep-like search across the repo

## License

MIT
```

Both em-dashes above are the actual U+2014 character. When creating this file with the Write tool, paste the em-dash directly; do not use `\u2014` escape sequences (they'll land in the file as six literal bytes and the bullet regex won't match).

Append to `electron/mcp-scanner.test.ts`:

```typescript
import { parseManifest, parseReadme, scanFromSources } from './mcp-scanner'

describe('mcp-scanner — manifest', () => {
  it('parses manifest with name/description/category', () => {
    const source = readFileSync(fixturePath('manifest/tools.json'), 'utf8')
    const tools = parseManifest(source)
    expect(tools).toHaveLength(3)
    expect(tools[0]).toMatchObject({ name: 'fetch_issue', description: 'Fetch a GitHub issue.', category: 'github', source: 'manifest' })
    expect(tools[2]).toMatchObject({ name: 'ping', description: null, category: null, source: 'manifest' })
  })

  it('returns [] on malformed json', () => {
    expect(parseManifest('not json')).toEqual([])
  })
})

describe('mcp-scanner — README', () => {
  it('extracts tools from a ## Tools section', () => {
    const source = readFileSync(fixturePath('readme/README.md'), 'utf8')
    const tools = parseReadme(source)
    expect(tools.map(t => t.name)).toEqual(['list_files', 'read_file', 'search_code'])
    expect(tools[0].description).toBe('list files in a directory')
    expect(tools[1].description).toBe('read the contents of a file')
    expect(tools[2].description).toBe('grep-like search across the repo')
    expect(tools[0].source).toBe('readme-approx')
  })

  it('returns [] when no heading matches', () => {
    expect(parseReadme('# Intro\n\nNo tools section here.')).toEqual([])
  })
})

describe('mcp-scanner — chain orchestrator', () => {
  it('returns static when static parse yields tools', () => {
    const result = scanFromSources({
      staticSources: [readFileSync(fixturePath('static-ts/server.ts'), 'utf8')],
      manifestSource: readFileSync(fixturePath('manifest/tools.json'), 'utf8'),
      readmeSource:   readFileSync(fixturePath('readme/README.md'), 'utf8'),
    })
    expect(result.source).toBe('static')
    expect(result.tools.length).toBe(3)
  })

  it('falls back to manifest when static empty', () => {
    const result = scanFromSources({
      staticSources: ['const foo = 1;'],
      manifestSource: readFileSync(fixturePath('manifest/tools.json'), 'utf8'),
      readmeSource:   null,
    })
    expect(result.source).toBe('manifest')
    expect(result.tools.length).toBe(3)
  })

  it('falls back to readme when static and manifest empty', () => {
    const result = scanFromSources({
      staticSources: [],
      manifestSource: null,
      readmeSource:   readFileSync(fixturePath('readme/README.md'), 'utf8'),
    })
    expect(result.source).toBe('readme-approx')
    expect(result.tools.length).toBe(3)
  })

  it('returns empty tools with static source when everything fails', () => {
    const result = scanFromSources({ staticSources: [], manifestSource: null, readmeSource: null })
    expect(result.tools).toEqual([])
    expect(result.source).toBe('static')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- electron/mcp-scanner.test.ts`
Expected: FAIL — `parseManifest`, `parseReadme`, `scanFromSources` not exported.

- [ ] **Step 3: Implement the tiers + orchestrator**

Append to `electron/mcp-scanner.ts`:

```typescript
import type { McpScanResult } from '../src/types/mcp'

export function parseManifest(source: string): McpTool[] {
  try {
    const data = JSON.parse(source) as { tools?: Array<{ name?: string; description?: string; category?: string }> }
    if (!Array.isArray(data.tools)) return []
    return data.tools
      .filter(t => typeof t.name === 'string' && t.name.length > 0)
      .map(t => ({
        name:        t.name!,
        description: typeof t.description === 'string' ? t.description : null,
        category:    typeof t.category    === 'string' ? t.category    : null,
        paramSchema: null,
        source:      'manifest' as const,
      }))
  } catch {
    return []
  }
}

const README_TOOLS_HEADING_RX = /^##\s+(?:Available\s+)?Tools\s*$/im

export function parseReadme(source: string): McpTool[] {
  const match = README_TOOLS_HEADING_RX.exec(source)
  if (!match) return []
  const start = match.index + match[0].length
  // Stop at the next `## ` heading.
  const rest = source.slice(start)
  const nextHeading = /\n##\s+/.exec(rest)
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest

  const tools: McpTool[] = []
  // Bullet forms: `- \`name\` \u2014 description`, `- \`name\`: description`, `- \`name\``
  const bulletRx = /^\s*[-*]\s+`([\w.-]+)`\s*(?:[\u2014\u2013\-:]\s*(.+))?$/gm
  let m: RegExpExecArray | null
  while ((m = bulletRx.exec(section)) !== null) {
    const desc = (m[2] ?? '').trim()
    tools.push({
      name: m[1],
      description: desc.length > 0 ? desc : null,
      category: null,
      paramSchema: null,
      source: 'readme-approx',
    })
  }
  return tools
}

export interface ScanSources {
  staticSources: string[]           // contents of candidate source files
  manifestSource: string | null     // contents of first manifest found, or null
  readmeSource:   string | null
}

export function scanFromSources(src: ScanSources): McpScanResult {
  const detectedAt = new Date().toISOString()

  const staticTools = src.staticSources.flatMap(s => [...parseStaticTS(s), ...parseStaticPy(s)])
  if (staticTools.length > 0) {
    return { tools: staticTools, source: 'static', detectedAt }
  }

  if (src.manifestSource) {
    const manifestTools = parseManifest(src.manifestSource)
    if (manifestTools.length > 0) {
      return { tools: manifestTools, source: 'manifest', detectedAt }
    }
  }

  if (src.readmeSource) {
    const readmeTools = parseReadme(src.readmeSource)
    if (readmeTools.length > 0) {
      return { tools: readmeTools, source: 'readme-approx', detectedAt }
    }
  }

  return { tools: [], source: 'static', detectedAt }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- electron/mcp-scanner.test.ts`
Expected: PASS (all new tests + previous Task 2/3 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/mcp-scanner.ts electron/mcp-scanner.test.ts electron/fixtures/mcp-scanner
git commit -m "feat(library): MCP scanner — manifest, README, chain orchestrator"
```

---

## Task 5: Schema migration + IPC wiring

**Files:**
- Modify: `electron/db.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/repo.ts`

Add the `enabled_tools` column, extend `library:getAll`, and wire three new IPC endpoints.

- [ ] **Step 1: Add the migration**

In `src/types/repo.ts`, inside `LibraryRow` extension block (around line 102, after `enabled_components`):

```typescript
  enabled_components: string | null
  enabled_tools:      string | null  // JSON string[] | null; null means all tools enabled
  tier?: number
```

Also add to `SkillRow`:

```typescript
  enabled_components: string | null
  enabled_tools:      string | null
  tier?: number
```

Edit `electron/db.ts`. Add a migration block near the other Phase migrations (around line 139, after the tier migration):

```typescript
// Library MCP tools picker — subset of enabled MCP tools per skill
try { db.exec(`ALTER TABLE skills ADD COLUMN enabled_tools TEXT`) } catch {}
```

- [ ] **Step 2: Write the failing test for the migration**

Create `electron/db.mcp-migration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb } from './db'

describe('db migration — enabled_tools', () => {
  it('adds enabled_tools column to skills', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-suite-db-'))
    const db = getDb(dir)
    const info = db.prepare("PRAGMA table_info('skills')").all() as { name: string }[]
    expect(info.some(c => c.name === 'enabled_tools')).toBe(true)
  })

  it('preserves existing rows (enabled_tools defaults to null)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-suite-db-'))
    const db = getDb(dir)
    // Insert a dummy skill row
    db.prepare(`INSERT INTO repos (id, owner, name, topics) VALUES ('r1', 'o', 'n', '[]')`).run()
    db.prepare(`INSERT INTO skills (repo_id, filename, content, version, generated_at, active) VALUES ('r1', 'n.skill.md', '', 'v1', 'now', 1)`).run()
    const row = db.prepare(`SELECT enabled_tools FROM skills WHERE repo_id = 'r1'`).get() as { enabled_tools: string | null }
    expect(row.enabled_tools).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails (or passes if migration already applied)**

Run: `npm test -- electron/db.mcp-migration.test.ts`
Expected: PASS if Step 1's edit is already in place. If the test runs before the edit, it FAILs with `no such column: enabled_tools`.

- [ ] **Step 4: Extend `library:getAll` and add handlers in `electron/main.ts`**

Modify the `library:getAll` handler (around line 1156):

```typescript
ipcMain.handle('library:getAll', async () => {
  const db = getDb(app.getPath('userData'))
  return db.prepare(`
    SELECT r.*, s.active, s.version, s.generated_at, s.filename, s.content,
           s.enabled_components, s.enabled_tools, s.tier
    FROM repos r
    INNER JOIN skills s ON r.id = s.repo_id
    ORDER BY s.generated_at DESC
  `).all()
})
```

Add `skill:setEnabledTools` directly after `skill:setEnabledComponents` (around line 1178):

```typescript
ipcMain.handle('skill:setEnabledTools', async (_, owner: string, name: string, enabled: string[]) => {
  const db = getDb(app.getPath('userData'))
  db.prepare(
    'UPDATE skills SET enabled_tools = ? WHERE repo_id = (SELECT id FROM repos WHERE owner = ? AND name = ?)'
  ).run(JSON.stringify(enabled), owner, name)
})
```

Add the `mcp:scanTools` handler. Add an import at the top of `main.ts`:

```typescript
import { scanFromSources } from './mcp-scanner'
import type { McpScanResult } from '../src/types/mcp'
```

And add the handler near the other skill handlers:

```typescript
ipcMain.handle('mcp:scanTools', async (_, owner: string, name: string): Promise<McpScanResult> => {
  const token = getToken() ?? null

  const db = getDb(app.getPath('userData'))
  const repo = db.prepare('SELECT id, default_branch FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { id: string; default_branch: string | null } | undefined
  if (!repo) throw new Error(`Repo ${owner}/${name} not found`)
  const branch = repo.default_branch ?? 'main'

  // Pull candidate sources. Keep the tree scan narrow: top-level + src/**.
  const tree = await getRepoTree(token, owner, name, branch).catch(() => [])
  const isSource = (path: string) => /\.(ts|tsx|js|mjs|py)$/.test(path) && (path.startsWith('src/') || !path.includes('/'))
  const sourcePaths = tree.filter(e => e.type === 'blob' && isSource(e.path)).slice(0, 50).map(e => e.path)

  const staticSources = (await Promise.all(
    sourcePaths.map(p => getFileContent(token, owner, name, p).catch(() => null))
  )).filter((s): s is string => typeof s === 'string')

  const manifestCandidates = ['tools.json', 'mcp.json', '.mcp/tools.json']
  let manifestSource: string | null = null
  for (const p of manifestCandidates) {
    const s = await getFileContent(token, owner, name, p).catch(() => null)
    if (s) { manifestSource = s; break }
  }

  const readmeSource = await getReadme(token, owner, name).catch(() => null)

  const result = scanFromSources({ staticSources, manifestSource, readmeSource })

  // Cache into sub_skills
  const filename = `${name}-mcp-tools.json`
  db.prepare(`
    INSERT INTO sub_skills (repo_id, skill_type, filename, content, version, generated_at, active)
    VALUES (?, 'mcp-tools', ?, ?, NULL, ?, 1)
    ON CONFLICT(repo_id, skill_type) DO UPDATE SET
      filename = excluded.filename,
      content  = excluded.content,
      generated_at = excluded.generated_at
  `).run(repo.id, filename, JSON.stringify(result), result.detectedAt)

  return result
})
```

(Ensure `getReadme`, `getRepoTree`, `getFileContent` are already imported at the top of `main.ts`. They are — re-use.)

- [ ] **Step 5: Expose IPC in `electron/preload.ts`**

In the `skill:` block, add after `setEnabledComponents`:

```typescript
    setEnabledTools: (owner: string, name: string, enabled: string[]) =>
      ipcRenderer.invoke('skill:setEnabledTools', owner, name, enabled),
```

`electron/preload.ts` already has a top-level `mcp` block (around line 127) for the MCP server management IPC (`getStatus`, `autoConfigure`, etc.). **Do not add a second `mcp` block — that duplicates the key and silently clobbers the existing methods.** Instead, append `scanTools` to the existing block:

```typescript
  mcp: {
    getStatus:        () => ipcRenderer.invoke('mcp:getStatus'),
    autoConfigure:    () => ipcRenderer.invoke('mcp:autoConfigure'),
    getConfigSnippet: () => ipcRenderer.invoke('mcp:getConfigSnippet'),
    testConnection:   () => ipcRenderer.invoke('mcp:testConnection'),
    scanTools:        (owner: string, name: string) =>
      ipcRenderer.invoke('mcp:scanTools', owner, name),
  },
```

- [ ] **Step 6: Update the `window.api` ambient declaration**

The ambient types for `window.api` live in `src/env.d.ts` (around lines 49–207). Locate the `mcp: { ... }` block (around line 133) and append `scanTools`:

```typescript
    mcp: {
      getStatus:        () => Promise<...>
      autoConfigure:    () => Promise<...>
      getConfigSnippet: () => Promise<...>
      testConnection:   () => Promise<...>
      scanTools:        (owner: string, name: string) => Promise<import('./types/mcp').McpScanResult>
    }
```

Also append `setEnabledTools` to the `skill` block in the same file, matching the preload signature:

```typescript
      setEnabledTools: (owner: string, name: string, enabled: string[]) => Promise<void>
```

And extend the `skill.generate` signature's options object to include `enabledTools?: string[]`.

- [ ] **Step 7: Extend `skill:generate` to accept `enabledTools`**

In `electron/main.ts` at `ipcMain.handle('skill:generate', ...)` (line 864), extend the options type:

```typescript
ipcMain.handle('skill:generate', async (_, owner: string, name: string, options?: {
  enabledComponents?: string[],
  enabledTools?:      string[],
  target?: 'master' | 'components' | 'all',
  ref?: string,
}) => {
```

Pass `enabledTools` through to wherever the prompt is assembled — usually a `SkillGenInput` shape. Locate the call site for `buildSkillPrompt` / `generateSkill` (grep in main.ts). Add `enabledTools: options?.enabledTools` to the payload.

Also mirror the preload signature:

```typescript
skill.generate: (owner, name, options?: { enabledComponents?: string[], enabledTools?: string[], target?: ..., ref?: ... })
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- electron/db.mcp-migration.test.ts`
Expected: PASS.

Also run: `npm test` (full suite) — no regression from the `library:getAll` SELECT change or the `LibraryRow` shape widening.

- [ ] **Step 9: Commit**

```bash
git add electron/db.ts electron/main.ts electron/preload.ts src/types/repo.ts electron/db.mcp-migration.test.ts
git commit -m "feat(library): enabled_tools column + mcp:scanTools + skill:setEnabledTools IPC"
```

---

## Task 6: Skill-generator prompt-template branch for `enabledTools`

**Files:**
- Modify: `electron/main.ts` (or the skill-generator module — see Step 1)

Scope this task down: the existing `enabledComponents` branch narrows a skill's content to a component subset; the `enabledTools` branch does the parallel for MCP tools. The exact prompt wording is deferred to the implementer (per spec §9: "the implementation plan should block on reviewing the existing components-subset prompt and designing a parallel MCP-tools prompt").

- [ ] **Step 1: Locate the skill-generation prompt**

The existing `enabledComponents` branch lives in `electron/skill-gen/legacy.ts`:
- Line 14: `SkillGenInput.enabledComponents?: string[]` (type declaration)
- Line 32–33: branch that appends `COMPONENT_PROMPT_APPEND(input.enabledComponents.join(', '))` to the prompt
- Lines 119–129: where the component list gets filtered + re-inserted into the prompt body

The handler at `electron/main.ts:864` (`skill:generate`) calls into this module via `buildSkillPrompt` / `generateSkill`. The `SkillGenInput` type also needs widening to accept `enabledTools`.

- [ ] **Step 2: Write the failing test**

Since the prompt is an internal implementation detail, test at the handler level: when `skill:generate` is called with `enabledTools: ['a', 'b']`, the Anthropic SDK mock is called with a prompt that contains both tool names in a "scope to" context. Add or modify `electron/main.test.ts` (create if absent):

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('skill:generate — enabledTools branch', () => {
  it('includes selected tool names in the prompt', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '# skill' }],
    })
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class { messages = { create: mockCreate } }
    }))

    // ... construct a minimal repo row + invoke the handler under test ...
    // This test is a placeholder — adapt to the codebase's testing approach.
    // If no main-process test scaffold exists, skip this test and rely on
    // integration testing through MCPToolsDetail in Task 8.
  })
})
```

*(Testing the main process without a harness is out of scope. If the codebase lacks one, skip this test file and record in the commit message that prompt-template verification is manual.)*

- [ ] **Step 3: Implement the prompt branch**

Three edits in `electron/skill-gen/legacy.ts`:

1. **Widen `SkillGenInput`** (line 14) to accept the new field:

```typescript
  enabledComponents?: string[]
  enabledTools?: string[]
```

2. **Add a constant parallel to `COMPONENT_PROMPT_APPEND`** (look for the existing one near top-of-file; define `TOOLS_PROMPT_APPEND` next to it):

```typescript
const TOOLS_PROMPT_APPEND = (names: string) =>
  `\n\nScope this skill to only these MCP tools: ${names}. ` +
  `Omit documentation for any tool not in this list. Focus sections on the subset's workflow.`
```

3. **Add a conditional alongside line 32–33**:

```typescript
const append =
  input.isComponents && input.enabledComponents && input.enabledComponents.length > 0
    ? COMPONENT_PROMPT_APPEND(input.enabledComponents.join(', '))
    : input.enabledTools && input.enabledTools.length > 0
      ? TOOLS_PROMPT_APPEND(input.enabledTools.join(', '))
      : ''
```

4. **Pass `enabledTools` from the handler**: in `electron/main.ts:864` (`skill:generate`), ensure the `SkillGenInput` payload the handler constructs includes `enabledTools: options?.enabledTools`. Re-read lines around 900–920 (where `isComponents` and `enabledComponents` are currently wired in) and mirror the pattern exactly.

**Re-read the components branch before writing the tools branch** — the exact wording should be internally consistent across both branches.

- [ ] **Step 4: Manual verification**

Add a debug log line under the branch temporarily:

```typescript
console.log('[skill:generate] enabledTools =', options?.enabledTools)
```

Run the app, trigger an MCP rebuild from the MCPToolsDetail UI (after Task 8), confirm the log prints. Remove the log before commit.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat(library): skill generator honors enabledTools subset"
```

---

## Task 7: `MCPToolsDetail` component

**Files:**
- Create: `src/components/MCPToolsDetail.tsx`
- Create: `src/components/MCPToolsDetail.test.tsx`

Mirrors `ComponentDetail`. Reuse layout class names where they match (`lib-comp-header`, `lib-comp-tabs`, `lib-comp-toolbar`, etc.) so MCPToolsDetail visually matches. Adds a warning banner above the toolbar when `scanResult.source === 'readme-approx'`.

**Props:**

```typescript
interface MCPToolsDetailProps {
  row: LibraryRow
  collections: { id: string; name: string }[]
  activeTab: 'tools' | 'skill' | 'details'
  onTabChange: (t: 'tools' | 'skill' | 'details') => void
  toolSearch: string
  onToolSearchChange: (v: string) => void
  scanResult: McpScanResult | null           // null = not scanned yet
  onRescan: () => void
  onToggleTool: (name: string) => void
  onSelectAll: () => void
  onRebuild: () => void
  onToggleActive: (v: boolean) => void
  onEnhance: () => void
  regenerating: boolean
  mcpToolsSubSkill: SubSkillRow | null        // for Details tab "MCP tools" row
  versionedInstalls: string[]
}
```

- [ ] **Step 1: Write the failing test**

Create `src/components/MCPToolsDetail.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { ProfileOverlayProvider } from '../contexts/ProfileOverlay'
import MCPToolsDetail from './MCPToolsDetail'
import type { LibraryRow } from '../types/repo'
import type { McpScanResult } from '../types/mcp'

const mockRow: LibraryRow = {
  id: 'r1', owner: 'modelcontextprotocol', name: 'server-github', language: 'TypeScript',
  description: 'GitHub MCP server', content: '# Core',
  topics: '[]', stars: null, forks: null, license: 'MIT',
  homepage: null, updated_at: null, pushed_at: null, saved_at: '2026-01-01',
  type: 'skill', banner_svg: null, discovered_at: null, discover_query: null,
  watchers: null, size: null, open_issues: null, starred_at: null,
  default_branch: null, avatar_url: null, og_image_url: null, banner_color: null,
  translated_description: null, translated_description_lang: null,
  translated_readme: null, translated_readme_lang: null, detected_language: null,
  verification_score: null, verification_tier: null, verification_signals: null, verification_checked_at: null,
  type_bucket: 'utilities', type_sub: 'mcp-server',
  active: 1, version: 'v1.0', generated_at: '2026-01-01T00:00:00.000Z',
  filename: 'server-github.skill.md', enabled_components: null, enabled_tools: null, tier: 1,
}

const staticScan: McpScanResult = {
  source: 'static', detectedAt: '2026-01-01T00:00:00.000Z',
  tools: [
    { name: 'create_issue', description: 'Create an issue', category: 'github', paramSchema: null, source: 'static' },
    { name: 'close_issue',  description: 'Close an issue',  category: 'github', paramSchema: null, source: 'static' },
  ],
}

const readmeScan: McpScanResult = { ...staticScan, source: 'readme-approx', tools: staticScan.tools.map(t => ({ ...t, source: 'readme-approx' })) }

function renderDetail(props: Partial<React.ComponentProps<typeof MCPToolsDetail>> = {}) {
  const defaults = {
    row: mockRow,
    collections: [],
    activeTab: 'tools' as const,
    onTabChange: () => {},
    toolSearch: '',
    onToolSearchChange: () => {},
    scanResult: staticScan,
    onRescan: () => {},
    onToggleTool: () => {},
    onSelectAll: () => {},
    onRebuild: () => {},
    onToggleActive: () => {},
    onEnhance: () => {},
    regenerating: false,
    mcpToolsSubSkill: null,
    versionedInstalls: [],
  }
  return render(
    <MemoryRouter>
      <ProfileOverlayProvider>
        <MCPToolsDetail {...defaults} {...props} />
      </ProfileOverlayProvider>
    </MemoryRouter>
  )
}

describe('MCPToolsDetail', () => {
  it('renders tool names and descriptions on tools tab', () => {
    renderDetail()
    expect(screen.getByText('create_issue')).toBeInTheDocument()
    expect(screen.getByText('Create an issue')).toBeInTheDocument()
    expect(screen.getByText('close_issue')).toBeInTheDocument()
  })

  it('renders MCP server type pill', () => {
    renderDetail()
    expect(screen.getByText(/MCP server/i)).toBeInTheDocument()
  })

  it('omits warning banner when scan source is static', () => {
    renderDetail()
    expect(screen.queryByText(/extracted from README/i)).not.toBeInTheDocument()
  })

  it('shows warning banner when scan source is readme-approx', () => {
    renderDetail({ scanResult: readmeScan })
    expect(screen.getByText(/extracted from README/i)).toBeInTheDocument()
  })

  it('invokes onRebuild when Rebuild button clicked', async () => {
    const user = userEvent.setup()
    const onRebuild = vi.fn()
    renderDetail({ onRebuild })
    await user.click(screen.getByRole('button', { name: /Rebuild skill/i }))
    expect(onRebuild).toHaveBeenCalled()
  })

  it('invokes onToggleTool when a tool card clicked', async () => {
    const user = userEvent.setup()
    const onToggleTool = vi.fn()
    renderDetail({ onToggleTool })
    await user.click(screen.getByText('create_issue'))
    expect(onToggleTool).toHaveBeenCalledWith('create_issue')
  })

  it('invokes onSelectAll', async () => {
    const user = userEvent.setup()
    const onSelectAll = vi.fn()
    renderDetail({ onSelectAll })
    await user.click(screen.getByRole('button', { name: /Select all/i }))
    expect(onSelectAll).toHaveBeenCalled()
  })

  it('filters tools by toolSearch', () => {
    renderDetail({ toolSearch: 'close' })
    expect(screen.queryByText('create_issue')).not.toBeInTheDocument()
    expect(screen.getByText('close_issue')).toBeInTheDocument()
  })

  it('switches to skill tab', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    renderDetail({ onTabChange })
    await user.click(screen.getByRole('button', { name: 'Skill file' }))
    expect(onTabChange).toHaveBeenCalledWith('skill')
  })

  it('renders "not scanned yet" when scanResult is null', () => {
    renderDetail({ scanResult: null })
    expect(screen.getByRole('button', { name: /Scan tools/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/MCPToolsDetail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MCPToolsDetail`**

Create `src/components/MCPToolsDetail.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { ExternalLink, AlertTriangle } from 'lucide-react'
import Toggle from './Toggle'
import DetailRow from './DetailRow'
import SkillDepthBars from './SkillDepthBars'
import { getLangConfig } from './BannerSVG'
import { formatDate, daysSince } from '../utils/dateHelpers'
import { useProfileOverlay } from '../contexts/ProfileOverlay'
import type { LibraryRow, SubSkillRow } from '../types/repo'
import type { McpScanResult } from '../types/mcp'

export interface MCPToolsDetailProps {
  row: LibraryRow
  collections: { id: string; name: string }[]
  activeTab: 'tools' | 'skill' | 'details'
  onTabChange: (t: 'tools' | 'skill' | 'details') => void
  toolSearch: string
  onToolSearchChange: (v: string) => void
  scanResult: McpScanResult | null
  onRescan: () => void
  onToggleTool: (name: string) => void
  onSelectAll: () => void
  onRebuild: () => void
  onToggleActive: (v: boolean) => void
  onEnhance: () => void
  regenerating: boolean
  mcpToolsSubSkill: SubSkillRow | null
  versionedInstalls: string[]
}

export default function MCPToolsDetail({
  row, collections, activeTab, onTabChange, toolSearch, onToolSearchChange,
  scanResult, onRescan, onToggleTool, onSelectAll, onRebuild,
  onToggleActive, onEnhance, regenerating, mcpToolsSubSkill, versionedInstalls,
}: MCPToolsDetailProps) {
  const lang = row.language ?? ''
  const cfg  = getLangConfig(lang)
  const { openProfile } = useProfileOverlay()
  const navigate = useNavigate()

  const enabledNames: string[] | null = row.enabled_tools
    ? (() => { try { return JSON.parse(row.enabled_tools!) as string[] } catch { return null } })()
    : null
  const enabledSet = enabledNames ? new Set(enabledNames) : null
  const tools = scanResult?.tools ?? []
  const isEnabled = (name: string) => enabledSet === null ? true : enabledSet.has(name)
  const enabledCount = enabledSet === null ? tools.length : enabledNames!.length
  const totalCount   = tools.length

  const filtered = tools.filter(t => t.name.toLowerCase().includes(toolSearch.toLowerCase()))
  const categories = Array.from(new Set(filtered.map(t => t.category ?? '(uncategorized)')))
  const skillSizeKb = (row.content.length / 1024).toFixed(1)
  const collectionsStr = collections.length > 0 ? collections.map(c => c.name).join(', ') : '\u2014'
  const skillLineCount = row.content.split('\n').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header — reuses ComponentDetail classes */}
      <div className="lib-comp-header">
        <div className="lib-comp-header-top">
          <div className="lib-detail-lang" style={{ background: cfg.bg, color: cfg.primary }}>
            {cfg.abbr}
          </div>
          <div className="lib-detail-title-block">
            <div className="lib-detail-title">{row.name}</div>
            <button
              className="owner-name-btn lib-detail-owner"
              onClick={(e) => { e.stopPropagation(); openProfile(row.owner) }}
            >
              {row.owner}
            </button>
            {(row.tier ?? 1) >= 2 && <span className="badge-enhanced">Enhanced</span>}
          </div>
          <div className="lib-detail-active-row">
            <button
              className="lib-btn-view-repo"
              onClick={() => navigate(`/repo/${row.owner}/${row.name}`)}
              title="View repo"
            >
              <ExternalLink size={13} />
            </button>
            <span className="lib-detail-active-label">Active</span>
            <Toggle on={row.active === 1} onChange={onToggleActive} ariaLabel="Toggle skill active" />
          </div>
        </div>
        <span className="lib-comp-type-pill">MCP server</span>
        <p className="lib-comp-count-line">
          {enabledCount} of {totalCount} enabled {'\u00B7'} skill file {skillLineCount} lines
        </p>
        <div className="lib-comp-tabs">
          {(['tools', 'skill', 'details'] as const).map(t => (
            <button
              key={t}
              className={`lib-comp-tab${activeTab === t ? ' active' : ''}`}
              onClick={() => onTabChange(t)}
            >
              {t === 'tools' ? 'Tools' : t === 'skill' ? 'Skill file' : 'Details'}
            </button>
          ))}
        </div>
      </div>

      {/* Tools tab */}
      {activeTab === 'tools' && (
        <>
          {scanResult === null ? (
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 12 }}>
                Tools have not been scanned yet.
              </p>
              <button className="lib-comp-rebuild-btn" onClick={onRescan}>Scan tools</button>
            </div>
          ) : (
            <>
              {scanResult.source === 'readme-approx' && (
                <div className="mcp-warning-banner" role="alert">
                  <AlertTriangle size={12} />
                  <span>Tools extracted from README &mdash; may be incomplete or out of date.</span>
                </div>
              )}

              <div className="lib-comp-toolbar">
                <input
                  className="lib-comp-search"
                  placeholder="Search tools\u2026"
                  value={toolSearch}
                  onChange={(e) => onToolSearchChange(e.target.value)}
                />
                <span className="lib-comp-count-text">{enabledCount} / {totalCount}</span>
                <button className="lib-comp-select-all" onClick={onSelectAll}>Select all</button>
                <button className="lib-comp-select-all" onClick={onRescan} title="Rescan tools">
                  {'\u21BB'} Rescan
                </button>
              </div>

              <div className="lib-comp-body">
                {categories.map(cat => {
                  const catTools = filtered.filter(t => (t.category ?? '(uncategorized)') === cat)
                  if (catTools.length === 0) return null
                  return (
                    <div key={cat}>
                      <div className="lib-comp-category-label">{cat}</div>
                      <div className="mcp-tools-list">
                        {catTools.map(tool => {
                          const on = isEnabled(tool.name)
                          return (
                            <div
                              key={tool.name}
                              className={`mcp-tool-card${on ? ' active' : ' inactive'}`}
                              onClick={() => onToggleTool(tool.name)}
                            >
                              <div className="mcp-tool-card-body">
                                <span className="mcp-tool-name">{tool.name}</span>
                                {tool.description && <p className="mcp-tool-desc">{tool.description}</p>}
                              </div>
                              <Toggle on={on} onChange={() => onToggleTool(tool.name)} mini ariaLabel={`Toggle ${tool.name} tool`} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {tools.length === 0 && (
                  <p style={{ fontSize: 10, color: 'var(--t2)', padding: '8px 0' }}>
                    No MCP tools detected in this repo.
                  </p>
                )}
              </div>

              <div className="lib-comp-footer">
                <span className="lib-comp-footer-note">Skill file reflects enabled tools</span>
                {(row.tier ?? 1) < 2 && (
                  <button className="btn-enhance" onClick={onEnhance} disabled={regenerating}>Enhance</button>
                )}
                <button className="lib-comp-rebuild-btn" onClick={onRebuild} disabled={regenerating}>
                  {regenerating ? '\u27F3 Rebuilding\u2026' : '\u21BA Rebuild skill'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Skill file tab — identical to ComponentDetail */}
      {activeTab === 'skill' && (
        <div className="lib-detail-body">
          <div className="lib-skill-panel">
            <div className="lib-skill-panel-header">
              <span className="lib-skill-panel-filename">{row.name}.skill.md</span>
              <span className="lib-skill-panel-status-ok">{'\u2713'} current</span>
            </div>
            <div className="lib-skill-panel-body">
              <SkillDepthBars content={row.content} />
              <p className="lib-skill-note">
                Generated from v{row.version ?? '\u2014'} {'\u00B7'} {row.generated_at ? daysSince(row.generated_at) : '\u2014'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Details tab — mirrors ComponentDetail, adds "MCP tools" row */}
      {activeTab === 'details' && (
        <div className="lib-detail-body">
          <div className="lib-details-section">
            <span className="lib-details-label">Details</span>
            <DetailRow k="Saved"          v={formatDate(row.saved_at)} />
            <DetailRow k="Repo version"   v={row.version ?? '\u2014'} />
            <DetailRow k="Skill size"     v={`${skillSizeKb} KB`} />
            <DetailRow k="Language"       v={row.language ?? '\u2014'} />
            <DetailRow k="License"        v={row.license ?? '\u2014'} />
            <DetailRow k="In collections" v={collectionsStr} />
          </div>
          {(mcpToolsSubSkill || versionedInstalls.length > 0) && (
            <div className="lib-details-section">
              <span className="lib-details-label">Sub-skills</span>
              {mcpToolsSubSkill && (
                <DetailRow
                  k="MCP tools"
                  v={`${scanResult?.source ?? '\u2014'} \u00B7 ${mcpToolsSubSkill.generated_at ? daysSince(mcpToolsSubSkill.generated_at) : '\u2014'}`}
                />
              )}
              {versionedInstalls.map(tag => (
                <DetailRow key={tag} k="Version" v={tag} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add CSS for MCPToolsDetail-specific classes**

Append to `src/styles/globals.css`:

```css
.mcp-warning-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  border-bottom: 1px solid #fde68a;
}
.mcp-tools-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mcp-tool-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg-card, var(--panel));
}
.mcp-tool-card.inactive { opacity: 0.6; }
.mcp-tool-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mcp-tool-name { font-size: 12px; font-weight: 600; color: var(--t1); font-family: var(--mono, monospace); }
.mcp-tool-desc { font-size: 11px; color: var(--t2); margin: 0; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/components/MCPToolsDetail.test.tsx`
Expected: PASS (all ten tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/MCPToolsDetail.tsx src/components/MCPToolsDetail.test.tsx src/styles/globals.css
git commit -m "feat(library): MCPToolsDetail component"
```

---

## Task 8: Wire `MCPToolsDetail` into `Library.tsx`

**Files:**
- Modify: `src/views/Library.tsx`
- Modify: `src/views/Library.test.tsx`

Insert the MCP dispatch branch between Components and Generic:

1. `ComponentDetail` — if `componentsSubSkill` present.
2. `MCPToolsDetail` — if `mcpToolsSubSkill` present.
3. `GenericDetail` — else.

Also replace the Phase-1 `subSkillIds` heuristic (Plan 1 Task 8 Step 4) with actual presence derived from fetching both sub-skill types per row lazily on-demand. For MVP, fetch when a row is selected; the indicator updates after the first click. If an eager preload is wanted later, add a `sub_skills:presenceMap` handler in a follow-up.

- [ ] **Step 1: Write the failing test**

Extend `src/views/Library.test.tsx`:

```typescript
describe('Library — MCP dispatch', () => {
  it('renders MCPToolsDetail when mcp-tools sub-skill exists', async () => {
    ;(window.api.skill.getSubSkill as ReturnType<typeof vi.fn>).mockImplementation(
      (_o: string, _n: string, type: string) => {
        if (type === 'mcp-tools') return Promise.resolve({
          repo_id: 'repo-1', skill_type: 'mcp-tools',
          filename: 'f.json',
          content: JSON.stringify({ tools: [{ name: 't1', description: 'x', category: null, paramSchema: null, source: 'static' }], source: 'static', detectedAt: 'now' }),
          version: null, generated_at: 'now', active: 1,
        })
        return Promise.resolve(null)
      }
    )
    const user = userEvent.setup()
    renderLibrary()
    await screen.findAllByText('react')
    await user.click(screen.getByText('react').closest('.library-card')!)
    expect(await screen.findByText(/MCP server/i)).toBeInTheDocument()
    expect(screen.getByText('t1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/views/Library.test.tsx`
Expected: FAIL — Library renders GenericDetail, not MCPToolsDetail.

- [ ] **Step 3: Extend `Library.tsx` with MCP state + dispatch**

Add to imports in `src/views/Library.tsx`:

```typescript
import MCPToolsDetail from '../components/MCPToolsDetail'
import type { McpScanResult } from '../types/mcp'
```

Add state alongside `componentsSubSkill`:

```typescript
const [mcpToolsSubSkill, setMcpToolsSubSkill] = useState<SubSkillRow | null>(null)
const [mcpScanResult,    setMcpScanResult]    = useState<McpScanResult | null>(null)
const [toolSearch,       setToolSearch]       = useState('')
```

Update `selectRow` to also fetch `mcp-tools` sub-skill:

```typescript
setMcpToolsSubSkill(null)
setMcpScanResult(null)
setToolSearch('')
window.api.skill.getSubSkill(row.owner, row.name, 'mcp-tools').then((sub: SubSkillRow | null) => {
  setMcpToolsSubSkill(sub)
  if (sub) {
    try { setMcpScanResult(JSON.parse(sub.content) as McpScanResult) } catch { setMcpScanResult(null) }
  }
}).catch(() => null)
```

Wire the dispatch in the slide-in panel body. Replace the current `componentsSubSkill ? ComponentDetail : GenericDetail` with:

```tsx
{selected && (
  componentsSubSkill ? (
    <ComponentDetail { /* ... existing ... */ } />
  ) : mcpToolsSubSkill ? (
    <MCPToolsDetail
      row={selected}
      collections={collections}
      activeTab={mcpActiveTab}
      onTabChange={setMcpActiveTab}
      toolSearch={toolSearch}
      onToolSearchChange={setToolSearch}
      scanResult={mcpScanResult}
      onRescan={async () => {
        setRegenerating(true)
        try {
          const result = await window.api.mcp.scanTools(selected.owner, selected.name)
          setMcpScanResult(result)
          toast('Tools rescanned', 'success')
        } catch {
          toast('Scan failed', 'error')
        } finally {
          setRegenerating(false)
        }
      }}
      onToggleTool={(name) => {
        const allNames = (mcpScanResult?.tools ?? []).map(t => t.name)
        const enabledNames: string[] | null = selected.enabled_tools
          ? (() => { try { return JSON.parse(selected.enabled_tools!) as string[] } catch { return null } })()
          : null
        const currentSet = enabledNames ? new Set(enabledNames) : new Set(allNames)
        if (currentSet.has(name)) currentSet.delete(name); else currentSet.add(name)
        const newEnabled = Array.from(currentSet)
        const json = JSON.stringify(newEnabled)
        setRows(prev => prev.map(r => r.id === selected.id ? { ...r, enabled_tools: json } : r))
        setSelected(prev => prev ? { ...prev, enabled_tools: json } : prev)
        window.api.skill.setEnabledTools(selected.owner, selected.name, newEnabled)
      }}
      onSelectAll={() => {
        const all = (mcpScanResult?.tools ?? []).map(t => t.name)
        const json = JSON.stringify(all)
        setRows(prev => prev.map(r => r.id === selected.id ? { ...r, enabled_tools: json } : r))
        setSelected(prev => prev ? { ...prev, enabled_tools: json } : prev)
        window.api.skill.setEnabledTools(selected.owner, selected.name, all)
      }}
      onRebuild={async () => {
        const allNames = (mcpScanResult?.tools ?? []).map(t => t.name)
        const enabledNames: string[] | null = selected.enabled_tools
          ? (() => { try { return JSON.parse(selected.enabled_tools!) as string[] } catch { return null } })()
          : null
        const enabledList = enabledNames ?? allNames
        setRegenerating(true)
        try {
          const result = await window.api.skill.generate(selected.owner, selected.name, { enabledTools: enabledList })
          setRows(prev => prev.map(r => r.id === selected.id
            ? { ...r, content: result.content, generated_at: result.generated_at }
            : r))
          setSelected(prev => prev ? { ...prev, content: result.content, generated_at: result.generated_at } : prev)
          toast('Skill rebuilt', 'success')
        } catch {
          toast('Failed to rebuild skill', 'error')
        } finally {
          setRegenerating(false)
        }
      }}
      onToggleActive={(v) => handleToggle(selected, v)}
      onEnhance={() => handleEnhance(selected)}
      regenerating={regenerating}
      mcpToolsSubSkill={mcpToolsSubSkill}
      versionedInstalls={versionedInstalls}
    />
  ) : (
    <GenericDetail { /* ... existing ... */ } />
  )
)}
```

Also add a separate `activeTab` state for MCP (since its tab names differ from ComponentDetail):

```typescript
const [mcpActiveTab, setMcpActiveTab] = useState<'tools' | 'skill' | 'details'>('tools')
```

Update `selectRow` to reset it:

```typescript
setMcpActiveTab('tools')
```

- [ ] **Step 4: Update `subSkillIds` derivation to reflect mcp-tools presence**

Replace the Phase-1 heuristic in `Library.tsx`:

```typescript
useEffect(() => {
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.type_bucket === 'frameworks' && row.type_sub === 'ui-library') ids.add(row.id)
  }
  setSubSkillIds(ids)
}, [rows])
```

With a post-selection update:

```typescript
// When a row's sub-skill presence becomes known, reflect it on the card's indicator.
useEffect(() => {
  if (!selected) return
  if (componentsSubSkill || mcpToolsSubSkill) {
    setSubSkillIds(prev => {
      if (prev.has(selected.id)) return prev
      const next = new Set(prev)
      next.add(selected.id)
      return next
    })
  }
}, [selected, componentsSubSkill, mcpToolsSubSkill])
```

This is eventually-consistent: the indicator flips on after first selection. A follow-up batched `sub_skills:presenceMap` IPC is cleaner but out of scope.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/views/Library.test.tsx`
Expected: PASS.

Also run the full suite:

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/Library.tsx src/views/Library.test.tsx
git commit -m "feat(library): dispatch MCPToolsDetail when mcp-tools sub-skill present"
```

---

## Task 9: End-to-end smoke + completion marker

**Files:** none — validation only.

- [ ] **Step 1: Manual smoke (user runs)**

Record the checklist in the commit message so the user can step through:

- Install an MCP server repo via Discover (e.g. `modelcontextprotocol/servers`).
- Open Library → find the server → click the card.
- Panel opens with MCPToolsDetail. First time: shows "Scan tools" button.
- Click Scan → tools populate. Warning banner appears only if source is `readme-approx`.
- Disable a tool; enabled count decrements.
- Click Rebuild → skill content regenerates; skill-file tab reflects new content.
- Rescan → tools re-populate (cache updated in `sub_skills`).
- Enhance button works (if tier 1).
- Escape / ✕ close the panel.
- Card's sub-skill indicator appears after first open.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit completion marker**

```bash
git commit --allow-empty -m "chore(library): Plan 2 MCP tools picker complete"
```

---

## Notes for the implementer

- **Scanner coverage is deliberately narrow.** The static parser targets the common MCP SDK TS/JS patterns (`registerTool`, `tool`) and Python's `@mcp.tool()` decorator. Wild variants (dynamic name binding, metaprogramming) will fall through to the manifest or README tiers — that's intentional.
- **Known TS parser limitation: nested object literals.** `STATIC_TS_RX`'s `(\{[^}]*\})` object-body capture stops at the first `}`. If a tool is declared with `inputSchema: { type: 'object' }` *before* `description:`, the description will be missed and come back as `null`. Real-world MCP servers commonly do this. Acceptable for MVP (user sees a tool card with no description, not a crash); a proper fix is a small brace-counter state machine, deferred unless the user reports it.
- **Fixture location under `electron/fixtures/mcp-scanner/`.** Verify at execution time that the repo's electron build config does not try to transform or import these files — they're test-only. A quick `grep -rn "fixtures" electron/` before running the build should confirm no cross-references.
- **`sub_skills` unique constraint is already declared.** `electron/db.ts` defines `PRIMARY KEY (repo_id, skill_type)` on the `sub_skills` table, which SQLite accepts as the conflict target for the Task 5 upsert. No additional migration needed.
- **Warning banner dismissal** is not persisted (per spec §5.5). Implement session-only dismissal via local component state if the user asks for it post-landing; the current plan keeps it always-visible when `source === 'readme-approx'` to favor clarity over cleverness.
- **`subSkillIds` indicator is lazy** (Task 8 Step 4). A batched precomputation is a clean follow-up: add a `sub_skills:presenceMap()` IPC that returns `Record<repoId, string[]>` of skill types, call it once on Library load, seed `subSkillIds` accordingly.
- **Re-read the existing `enabledComponents` prompt branch before writing the `enabledTools` one** (Task 6). Mirroring its style is more important than specific wording.
- **Testing the prompt template is best done integration-style** — via MCPToolsDetail → Rebuild → verify the Anthropic call gets the expected options. If no main-process test harness exists, the commit message should call that out as manual verification.
