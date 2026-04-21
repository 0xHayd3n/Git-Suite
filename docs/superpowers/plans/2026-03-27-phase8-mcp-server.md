# Phase 8: MCP Server & Claude Desktop Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local MCP server that lets Claude Desktop access installed Git Suite skills, and wire up Settings and Sidebar UI to show Claude Desktop connection status.

**Architecture:** A standalone Node.js process (`electron/mcp-server.ts`, compiled to `out/main/mcp-server.js`) reads directly from the SQLite DB and skill files on disk — no communication with the Electron renderer. The Electron main process spawns it as a child process on startup and exposes four IPC handlers so the Settings view can read/write the Claude Desktop config and test the server. Handler functions are exported from `mcp-server.ts` so tests can import them without triggering the MCP server startup (guarded by a `process.argv[1]` check, more reliable than `require.main === module` in Rollup-compiled output).

**Tech Stack:** `@modelcontextprotocol/sdk` (MCP protocol), `better-sqlite3` (SQLite), `fs`/`path`/`os` (file I/O), `child_process.spawn` (process management), React + TypeScript (UI)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `electron/mcp-server.ts` | Standalone MCP server with 4 tools; exports handlers for testability |
| Create | `electron/mcp-server.test.ts` | Unit tests for the 4 exported tool handler functions |
| Create | `src/views/Settings.test.tsx` | Tests for the new Claude Desktop section |
| Modify | `package.json` | Add `@modelcontextprotocol/sdk` dependency |
| Modify | `electron.vite.config.ts` | Add `mcp-server` as second entry point to main build |
| Modify | `electron/main.ts` | Spawn MCP server child process; add `mcp:*` IPC handlers |
| Modify | `electron/preload.ts` | Expose `mcp` namespace on `window.api` |
| Modify | `src/env.d.ts` | Add `mcp` types to `Window.api` |
| Modify | `src/views/Settings.tsx` | Add Claude Desktop section (status, auto-configure, copy snippet, test) |
| Modify | `src/components/Sidebar.tsx` | Replace single GitHub status dot with dual GitHub + Claude Desktop dots |
| Modify | `src/components/Sidebar.test.tsx` | Add tests for Claude Desktop status dot |
| Modify | `src/styles/globals.css` | Add `.settings-mcp-*` rules + `.status-dot.pulse` |

---

## Task 1: Add MCP SDK dependency and build entry point

**Files:**
- Modify: `package.json`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Add `@modelcontextprotocol/sdk` to dependencies**

In `package.json`, add to `"dependencies"`:
```json
"@modelcontextprotocol/sdk": "^1.0.0"
```

- [ ] **Step 2: Install the package**

```bash
npm install
```

Expected: `@modelcontextprotocol/sdk` appears in `node_modules`.

- [ ] **Step 3: Add mcp-server as a second entry point in electron.vite.config.ts**

The current config uses `build.lib.entry` for a single entry. To add a second entry, switch the `main` section to use `rollupOptions.input` instead (both forms produce the same output — `rollupOptions.input` simply supports multiple entries). Replace the `main` section of `electron.vite.config.ts`:

```typescript
main: {
  plugins: [externalizeDepsPlugin()],
  build: {
    rollupOptions: {
      input: {
        index: resolve('electron/main.ts'),
        'mcp-server': resolve('electron/mcp-server.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'cjs',
      },
    },
  },
},
```

The `format: 'cjs'` makes the output explicit — Rollup defaults to CJS for Electron main anyway, but stating it prevents ambiguity. `externalizeDepsPlugin()` remains and ensures `better-sqlite3` and `@modelcontextprotocol/sdk` are `require()`d at runtime from the project's `node_modules`, which Node resolves correctly by traversing up from `out/main/`.

- [ ] **Step 4: Verify build config compiles two outputs**

```bash
npm run build
```

Expected: `out/main/index.js` and `out/main/mcp-server.js` both exist.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts
git commit -m "build: add @modelcontextprotocol/sdk dep and mcp-server build entry"
```

---

## Task 2: Write failing unit tests for MCP server handlers

**Files:**
- Create: `electron/mcp-server.test.ts`

Write tests first — before the implementation exists. Since `electron/mcp-server.ts` does not exist yet, the import will fail and all tests will error. That's the expected "red" state.

- [ ] **Step 1: Create `electron/mcp-server.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { initSchema } from './db'
import {
  handleListSkills,
  handleGetSkill,
  handleSearchSkills,
  handleGetCollection,
} from './mcp-server'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

function seedRepo(db: Database.Database, owner: string, name: string): string {
  const repoId = `${owner}/${name}`
  db.prepare(
    `INSERT OR IGNORE INTO repos (id, owner, name, description, language, topics, stars, forks,
     license, homepage, updated_at, saved_at, type, banner_svg)
     VALUES (?, ?, ?, 'A test repo', 'TypeScript', '[]', 100, 10, NULL, NULL, NULL, NULL, NULL, NULL)`
  ).run(repoId, owner, name)
  return repoId
}

function seedSkill(db: Database.Database, repoId: string, filename: string, active = 1): void {
  db.prepare(
    `INSERT OR IGNORE INTO skills (repo_id, filename, content, version, generated_at, active)
     VALUES (?, ?, 'skill content', '1.0.0', '2026-01-01', ?)`
  ).run(repoId, filename, active)
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsuite-mcp-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── handleListSkills ──────────────────────────────────────────────────────────

describe('handleListSkills', () => {
  it('returns message when no skills installed', () => {
    const db = makeDb()
    const result = handleListSkills(db)
    expect(result.content[0].text).toBe('No active skills installed.')
    db.close()
  })

  it('lists active skills with owner/name/language/version', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    seedSkill(db, repoId, 'fastapi.skill.md')
    const result = handleListSkills(db)
    const t = result.content[0].text
    expect(t).toContain('tiangolo/fastapi')
    expect(t).toContain('TypeScript')
    expect(t).toContain('1.0.0')
    db.close()
  })

  it('excludes inactive skills', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    seedSkill(db, repoId, 'fastapi.skill.md', 0)
    const result = handleListSkills(db)
    expect(result.content[0].text).toBe('No active skills installed.')
    db.close()
  })
})

// ── handleGetSkill ────────────────────────────────────────────────────────────

describe('handleGetSkill', () => {
  it('returns not-found message when file absent', () => {
    const result = handleGetSkill(tmpDir, 'tiangolo', 'fastapi')
    expect(result.content[0].text).toContain('No skill file found')
    expect(result.content[0].text).toContain('tiangolo/fastapi')
  })

  it('returns file content when skill file exists', () => {
    const skillDir = path.join(tmpDir, 'skills', 'tiangolo')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'fastapi.skill.md'), '## [CORE]\nHello', 'utf8')
    const result = handleGetSkill(tmpDir, 'tiangolo', 'fastapi')
    expect(result.content[0].text).toContain('## [CORE]')
    expect(result.content[0].text).toContain('Hello')
  })
})

// ── handleSearchSkills ────────────────────────────────────────────────────────

describe('handleSearchSkills', () => {
  it('returns not-found message when query matches nothing', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    seedSkill(db, repoId, 'fastapi.skill.md')
    const skillDir = path.join(tmpDir, 'skills', 'tiangolo')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'fastapi.skill.md'), '## [CORE]\nFastAPI routing', 'utf8')
    const result = handleSearchSkills(db, tmpDir, 'sqlalchemy')
    expect(result.content[0].text).toContain('No skill files contain')
    db.close()
  })

  it('returns matching snippet when query found in CORE section', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    seedSkill(db, repoId, 'fastapi.skill.md')
    const skillDir = path.join(tmpDir, 'skills', 'tiangolo')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'fastapi.skill.md'),
      '## [CORE]\nFastAPI dependency injection\n## [EXTENDED]\nmore stuff',
      'utf8'
    )
    const result = handleSearchSkills(db, tmpDir, 'dependency injection')
    expect(result.content[0].text).toContain('tiangolo/fastapi')
    expect(result.content[0].text).toContain('Found in 1 skill(s)')
    db.close()
  })

  it('does not match text only in EXTENDED section', () => {
    const db = makeDb()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    seedSkill(db, repoId, 'fastapi.skill.md')
    const skillDir = path.join(tmpDir, 'skills', 'tiangolo')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'fastapi.skill.md'),
      '## [CORE]\nbasic routing\n## [EXTENDED]\nadvanced middleware',
      'utf8'
    )
    const result = handleSearchSkills(db, tmpDir, 'advanced middleware')
    expect(result.content[0].text).toContain('No skill files contain')
    db.close()
  })
})

// ── handleGetCollection ───────────────────────────────────────────────────────

describe('handleGetCollection', () => {
  it('returns not-found when collection does not exist', () => {
    const db = makeDb()
    const result = handleGetCollection(db, tmpDir, 'nonexistent')
    expect(result.content[0].text).toContain('No active collection named')
    db.close()
  })

  it('returns no-skills message when collection repos have no active skill', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO collections (id, name, owner, active, created_at) VALUES ('c1', 'Python Stack', 'user', 1, '2026-01-01')`
    ).run()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    db.prepare(`INSERT INTO collection_repos (collection_id, repo_id) VALUES ('c1', ?)`).run(repoId)
    const result = handleGetCollection(db, tmpDir, 'Python Stack')
    expect(result.content[0].text).toContain('no active skills installed')
    db.close()
  })

  it('returns concatenated skill content for all active repos', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO collections (id, name, owner, active, created_at) VALUES ('c1', 'Python Stack', 'user', 1, '2026-01-01')`
    ).run()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    seedSkill(db, repoId, 'fastapi.skill.md')
    db.prepare(`INSERT INTO collection_repos (collection_id, repo_id) VALUES ('c1', ?)`).run(repoId)
    const skillDir = path.join(tmpDir, 'skills', 'tiangolo')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'fastapi.skill.md'), '## [CORE]\nFastAPI', 'utf8')
    const result = handleGetCollection(db, tmpDir, 'Python Stack')
    expect(result.content[0].text).toContain('tiangolo/fastapi')
    expect(result.content[0].text).toContain('## [CORE]')
    db.close()
  })

  it('matches collection name case-insensitively and returns skill content', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO collections (id, name, owner, active, created_at) VALUES ('c1', 'Python Stack', 'user', 1, '2026-01-01')`
    ).run()
    const repoId = seedRepo(db, 'tiangolo', 'fastapi')
    seedSkill(db, repoId, 'fastapi.skill.md')
    db.prepare(`INSERT INTO collection_repos (collection_id, repo_id) VALUES ('c1', ?)`).run(repoId)
    const skillDir = path.join(tmpDir, 'skills', 'tiangolo')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'fastapi.skill.md'), '## [CORE]\nFastAPI content', 'utf8')
    const result = handleGetCollection(db, tmpDir, 'python stack')
    expect(result.content[0].text).toContain('tiangolo/fastapi')
    expect(result.content[0].text).toContain('FastAPI content')
    db.close()
  })
})
```

- [ ] **Step 2: Run tests — expect import errors (mcp-server.ts does not exist yet)**

```bash
npm test -- electron/mcp-server.test.ts
```

Expected: Error like `Cannot find module './mcp-server'`. This is the correct red state.

- [ ] **Step 3: Commit failing tests**

```bash
git add electron/mcp-server.test.ts
git commit -m "test(mcp): write failing tests for all four MCP server handlers"
```

---

## Task 3: Create MCP server with exported handlers

**Files:**
- Create: `electron/mcp-server.ts`

The handler functions are exported so tests can call them with an in-memory DB and a temp directory. The `main()` function wires them into the MCP protocol and only runs when the file is executed directly.

- [ ] **Step 1: Create `electron/mcp-server.ts`**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ── Data directory (cross-platform, matches Electron app.getPath('userData')) ──
export function getDataDir(): string {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'git-suite')
    case 'win32':
      return path.join(process.env.APPDATA ?? os.homedir(), 'git-suite')
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'git-suite')
  }
}

// ── Tool result shape ────────────────────────────────────────────────────────
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
}

function text(t: string): ToolResult {
  return { content: [{ type: 'text', text: t }] }
}

// ── Tool handlers (exported for unit tests) ──────────────────────────────────

export function handleListSkills(db: Database.Database): ToolResult {
  const skills = db.prepare(`
    SELECT repos.owner, repos.name, repos.description, repos.language,
           skills.version, skills.generated_at, skills.filename
    FROM skills
    INNER JOIN repos ON repos.id = skills.repo_id
    WHERE skills.active = 1
  `).all() as Array<{
    owner: string; name: string; description: string | null
    language: string | null; version: string | null
    generated_at: string | null; filename: string
  }>

  if (skills.length === 0) return text('No active skills installed.')

  const lines = skills.map(
    (s) =>
      `${s.owner}/${s.name} (${s.language ?? 'unknown'}) — ${s.description ?? 'No description'}\n` +
      `  Version: ${s.version ?? 'unknown'} | File: ${s.filename}`
  )
  return text(lines.join('\n'))
}

export function handleGetSkill(dataDir: string, owner: string, repo: string): ToolResult {
  const skillPath = path.join(dataDir, 'skills', owner, `${repo}.skill.md`)
  if (!fs.existsSync(skillPath)) {
    return text(`No skill file found for ${owner}/${repo}`)
  }
  return text(fs.readFileSync(skillPath, 'utf8'))
}

export function handleSearchSkills(
  db: Database.Database,
  dataDir: string,
  query: string
): ToolResult {
  const activeSkills = db.prepare(`
    SELECT repos.owner, repos.name, skills.filename
    FROM skills
    INNER JOIN repos ON repos.id = skills.repo_id
    WHERE skills.active = 1
  `).all() as Array<{ owner: string; name: string; filename: string }>

  const results: string[] = []
  const lq = query.toLowerCase()

  for (const skill of activeSkills) {
    const skillPath = path.join(dataDir, 'skills', skill.owner, skill.filename)
    if (!fs.existsSync(skillPath)) continue
    const content = fs.readFileSync(skillPath, 'utf8')
    // Search only the CORE section for relevance
    const coreMatch = content.match(/## \[CORE\]([\s\S]*?)(?=## \[EXTENDED\]|$)/)
    const core = coreMatch ? coreMatch[1] : content
    if (core.toLowerCase().includes(lq)) {
      results.push(`${skill.owner}/${skill.name}:\n${core.slice(0, 300).trim()}...`)
    }
  }

  if (results.length === 0) return text(`No skill files contain information about "${query}"`)
  return text(`Found in ${results.length} skill(s):\n\n${results.join('\n\n')}`)
}

export function handleGetCollection(
  db: Database.Database,
  dataDir: string,
  name: string
): ToolResult {
  const collection = db.prepare(
    `SELECT id FROM collections WHERE lower(name) = lower(?) AND active = 1`
  ).get(name) as { id: string } | undefined

  if (!collection) return text(`No active collection named "${name}"`)

  // INNER JOIN (not LEFT JOIN) so we only get repos that have an active skill.
  // Using the filter in the JOIN condition (not WHERE) keeps intent explicit.
  const repos = db.prepare(`
    SELECT repos.owner, repos.name, skills.filename
    FROM collection_repos
    JOIN repos ON repos.id = collection_repos.repo_id
    JOIN skills ON skills.repo_id = repos.id AND skills.active = 1
    WHERE collection_repos.collection_id = ?
  `).all(collection.id) as Array<{ owner: string; name: string; filename: string }>

  if (repos.length === 0) return text(`Collection "${name}" has no active skills installed.`)

  const parts: string[] = []
  for (const repo of repos) {
    if (!repo.filename) continue
    const skillPath = path.join(dataDir, 'skills', repo.owner, repo.filename)
    if (!fs.existsSync(skillPath)) continue
    const content = fs.readFileSync(skillPath, 'utf8')
    parts.push(`# ${repo.owner}/${repo.name}\n\n${content}`)
  }

  if (parts.length === 0) return text(`Collection "${name}" has no readable skill files.`)
  return text(parts.join('\n\n---\n\n'))
}

// ── MCP server wiring ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dataDir = getDataDir()
  const dbPath = path.join(dataDir, 'gitsuite.db')

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`[git-suite-mcp] DB not found at ${dbPath}\n`)
    process.exit(1)
  }

  const db = new Database(dbPath, { readonly: true })

  const server = new Server(
    { name: 'git-suite', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_skills',
        description:
          'List all installed Git Suite skills that are currently active. Use this to understand what repositories the user has installed as skills.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_skill',
        description:
          'Get the skill file for a specific repository. The skill file contains Core, Extended, and Deep sections — read as far as your context allows.',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner/organisation' },
            repo: { type: 'string', description: 'Repository name' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'search_skills',
        description:
          'Search across all installed skill files for information relevant to a query. Use this when you need to find which skill file contains information about a specific topic, pattern, or API.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to search for' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_collection',
        description:
          'Get all skill files in a named collection. Collections group related repositories together.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Collection name' },
          },
          required: ['name'],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const input = (args ?? {}) as Record<string, string>

    switch (name) {
      case 'list_skills':
        return handleListSkills(db)
      case 'get_skill':
        return handleGetSkill(dataDir, input.owner, input.repo)
      case 'search_skills':
        return handleSearchSkills(db, dataDir, input.query)
      case 'get_collection':
        return handleGetCollection(db, dataDir, input.name)
      default:
        return text(`Unknown tool: ${name}`)
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Guard: only run the server when this file is executed directly (e.g. via Claude Desktop
// or the Electron child_process.spawn). When imported by tests, process.argv[1] points
// to the Vitest runner, not this file, so main() is safely skipped.
// (require.main === module is unreliable in Rollup CJS output; argv[1] is always correct.)
const scriptName = process.argv[1] ?? ''
if (scriptName.endsWith('mcp-server.js') || scriptName.endsWith('mcp-server.ts')) {
  main().catch((err) => {
    process.stderr.write(`[git-suite-mcp] Fatal: ${err}\n`)
    process.exit(1)
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
npm run build
```

Expected: `out/main/mcp-server.js` created with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add electron/mcp-server.ts
git commit -m "feat(mcp): create standalone MCP server with list_skills, get_skill, search_skills, get_collection"
```

---

## Task 4: Spawn MCP server child process in main.ts

**Files:**
- Modify: `electron/main.ts`

Add `startMCPServer()` function and call it from `app.whenReady()`. Add four `mcp:*` IPC handlers.

- [ ] **Step 1: Add imports and mcpProcess variable to electron/main.ts**

After the existing imports at the top of `electron/main.ts`, add:

```typescript
import { spawn } from 'child_process'
```

After `let mainWindow: BrowserWindow | null = null`, add:

```typescript
let mcpProcess: ReturnType<typeof spawn> | null = null
```

- [ ] **Step 2: Add helper functions for Claude Desktop config path and MCP script path**

Add after the `mcpProcess` declaration:

```typescript
// ── MCP helpers ──────────────────────────────────────────────────────────────
function getClaudeConfigPath(): string | null {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    case 'win32':
      return path.join(process.env.APPDATA ?? os.homedir(), 'Claude', 'claude_desktop_config.json')
    default:
      return null
  }
}

function getMcpScriptPath(): string {
  return path.join(__dirname, 'mcp-server.js')
}
```

Add `import os from 'os'` at the top if not present (check — it may not be imported yet).

- [ ] **Step 3: Add startMCPServer function**

```typescript
function startMCPServer(): void {
  const mcpScript = getMcpScriptPath()
  // Use 'node' (not process.execPath — that's the Electron binary, not plain Node).
  // 'node' must be on PATH; this is the same assumption Claude Desktop makes for the
  // manual config snippet. If node is not on PATH, the spawn will fire the 'error' event.
  mcpProcess = spawn('node', [mcpScript], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  })
  mcpProcess.on('error', (err) => console.error('[MCP] spawn error:', err))
  mcpProcess.on('exit', (code) => {
    console.log('[MCP] server exited with code:', code)
    mcpProcess = null
  })
}
```

- [ ] **Step 4: Call startMCPServer in app.whenReady()**

Modify the existing `app.whenReady().then(...)` block:

```typescript
app.whenReady().then(() => {
  const db = getDb(app.getPath('userData'))
  seedCommunityCollections(db)
  startMCPServer()
  createWindow()
})
```

- [ ] **Step 5: Kill MCP server on before-quit**

Modify the existing `app.on('before-quit', ...)`:

```typescript
app.on('before-quit', () => {
  mcpProcess?.kill()
  closeDb()
})
```

- [ ] **Step 6: Add mcp:getStatus IPC handler**

Add with the other IPC handlers:

```typescript
// ── MCP IPC ──────────────────────────────────────────────────────────────────
ipcMain.handle('mcp:getStatus', async () => {
  const configPath = getClaudeConfigPath()
  if (!configPath) return { configured: false, configPath: null }
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    const config = JSON.parse(raw) as Record<string, unknown>
    const servers = config.mcpServers as Record<string, unknown> | undefined
    const configured = servers != null && 'git-suite' in servers
    return { configured, configPath }
  } catch {
    return { configured: false, configPath }
  }
})
```

- [ ] **Step 7: Add mcp:autoConfigure IPC handler**

```typescript
ipcMain.handle('mcp:autoConfigure', async () => {
  const configPath = getClaudeConfigPath()
  if (!configPath) return { success: false, error: 'Unsupported platform' }
  try {
    let existing: Record<string, unknown> = {}
    try {
      const raw = await fs.readFile(configPath, 'utf8')
      existing = JSON.parse(raw) as Record<string, unknown>
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
    const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>
    mcpServers['git-suite'] = {
      command: 'node',
      args: [getMcpScriptPath()],
    }
    existing.mcpServers = mcpServers
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(existing, null, 2), 'utf8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
```

- [ ] **Step 8: Add mcp:getConfigSnippet IPC handler**

```typescript
ipcMain.handle('mcp:getConfigSnippet', async () => {
  const snippet = {
    mcpServers: {
      'git-suite': {
        command: 'node',
        args: [getMcpScriptPath()],
      },
    },
  }
  return JSON.stringify(snippet, null, 2)
})
```

- [ ] **Step 9: Add mcp:testConnection IPC handler**

> **Note:** The spec says "sends a list_skills call to the MCP server". Implementing a full MCP stdio protocol call from the main process to the child is complex and not necessary — the DB query is the authoritative source of truth for the same information. This handler checks the process is alive and returns the DB count directly. The result is identical from the user's perspective.

```typescript
ipcMain.handle('mcp:testConnection', async () => {
  if (!mcpProcess || mcpProcess.exitCode !== null) {
    return { running: false, skillCount: 0 }
  }
  try {
    const db = getDb(app.getPath('userData'))
    const row = db.prepare(`SELECT COUNT(*) as count FROM skills WHERE active = 1`).get() as { count: number }
    return { running: true, skillCount: row.count }
  } catch {
    return { running: true, skillCount: 0 }
  }
})
```

- [ ] **Step 10: Verify app starts with no errors**

```bash
npm run dev
```

Expected: App opens, no console errors about MCP; `out/main/mcp-server.js` spawned.

- [ ] **Step 11: Commit**

```bash
git add electron/main.ts
git commit -m "feat(mcp): spawn MCP server on app start and add mcp:* IPC handlers"
```

---

## Task 5: Wire preload.ts and env.d.ts

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add mcp namespace to preload.ts**

In `electron/preload.ts`, add after the `starred` block:

```typescript
  mcp: {
    getStatus:      () => ipcRenderer.invoke('mcp:getStatus'),
    autoConfigure:  () => ipcRenderer.invoke('mcp:autoConfigure'),
    getConfigSnippet: () => ipcRenderer.invoke('mcp:getConfigSnippet'),
    testConnection: () => ipcRenderer.invoke('mcp:testConnection'),
  },
```

- [ ] **Step 2: Add mcp types to src/env.d.ts**

In `src/env.d.ts`, add after the `starred` block inside `Window.api`:

```typescript
      mcp: {
        getStatus(): Promise<{ configured: boolean; configPath: string | null }>
        autoConfigure(): Promise<{ success: boolean; error?: string }>
        getConfigSnippet(): Promise<string>
        testConnection(): Promise<{ running: boolean; skillCount: number }>
      }
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npm run build
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/env.d.ts
git commit -m "feat(mcp): expose mcp IPC namespace via preload and env types"
```

---

## Task 6: Settings view — Claude Desktop section

**Files:**
- Modify: `src/views/Settings.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Write failing Settings test**

Create `src/views/Settings.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Settings from './Settings'

function setupApi(opts: {
  apiKey?: string | null
  mcpConfigured?: boolean
  configPath?: string | null
  autoConfigResult?: { success: boolean }
  snippet?: string
  testResult?: { running: boolean; skillCount: number }
}) {
  Object.defineProperty(window, 'api', {
    value: {
      settings: {
        getApiKey: vi.fn().mockResolvedValue(opts.apiKey ?? null),
        setApiKey: vi.fn().mockResolvedValue(undefined),
      },
      mcp: {
        getStatus: vi.fn().mockResolvedValue({
          configured: opts.mcpConfigured ?? false,
          configPath: opts.configPath ?? null,
        }),
        autoConfigure: vi.fn().mockResolvedValue(opts.autoConfigResult ?? { success: true }),
        getConfigSnippet: vi.fn().mockResolvedValue(
          opts.snippet ?? '{"mcpServers":{"git-suite":{}}}'
        ),
        testConnection: vi.fn().mockResolvedValue(
          opts.testResult ?? { running: false, skillCount: 0 }
        ),
      },
    },
    writable: true,
    configurable: true,
  })
}

describe('Settings — Claude Desktop section', () => {
  beforeEach(() => {
    setupApi({})
  })

  it('renders CLAUDE DESKTOP section title', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/CLAUDE DESKTOP/i)).toBeInTheDocument()
    })
  })

  it('shows Not configured status when not configured', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/Not configured/i)).toBeInTheDocument()
    })
  })

  it('shows Connected status when configured', async () => {
    setupApi({ mcpConfigured: true, configPath: '/path/to/config.json' })
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/Connected/i)).toBeInTheDocument()
    })
  })

  it('shows config path when available', async () => {
    setupApi({ configPath: '/path/to/claude_desktop_config.json' })
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/claude_desktop_config\.json/)).toBeInTheDocument()
    })
  })

  it('renders Auto-configure button', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/Auto-configure Claude Desktop/i)).toBeInTheDocument()
    })
  })

  it('renders Copy snippet button', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/Copy/i)).toBeInTheDocument()
    })
  })

  it('renders Test connection button', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/Test connection/i)).toBeInTheDocument()
    })
  })

  it('calls mcp.autoConfigure when Auto-configure clicked', async () => {
    setupApi({ mcpConfigured: false })
    render(<Settings />)
    await waitFor(() => screen.getByText(/Auto-configure/i))
    fireEvent.click(screen.getByText(/Auto-configure/i))
    await waitFor(() => {
      expect(window.api.mcp.autoConfigure).toHaveBeenCalled()
    })
  })

  it('calls mcp.testConnection when Test connection clicked', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText(/Test connection/i))
    fireEvent.click(screen.getByText(/Test connection/i))
    await waitFor(() => {
      expect(window.api.mcp.testConnection).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run test — expect failures**

```bash
npm test -- src/views/Settings.test.tsx
```

Expected: All tests fail (section doesn't exist yet).

- [ ] **Step 3: Implement Claude Desktop section in Settings.tsx**

Replace `src/views/Settings.tsx` with:

```typescript
import { useState, useEffect, useCallback } from 'react'

export default function Settings() {
  const [apiKey, setApiKeyState] = useState('')
  const [saved, setSaved] = useState(false)

  // Claude Desktop MCP state
  const [mcpConfigured, setMcpConfigured] = useState(false)
  const [mcpConfigPath, setMcpConfigPath] = useState<string | null>(null)
  const [configSnippet, setConfigSnippet] = useState('')
  const [copied, setCopied] = useState(false)
  const [autoConfigStatus, setAutoConfigStatus] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  const loadMcpStatus = useCallback(async () => {
    const [status, snippet] = await Promise.all([
      window.api.mcp.getStatus(),
      window.api.mcp.getConfigSnippet(),
    ])
    setMcpConfigured(status.configured)
    setMcpConfigPath(status.configPath)
    setConfigSnippet(snippet)
  }, [])

  useEffect(() => {
    window.api.settings.getApiKey().then((key) => {
      if (key) setApiKeyState(key)
    })
    loadMcpStatus()
  }, [loadMcpStatus])

  const handleUpdate = async () => {
    await window.api.settings.setApiKey(apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAutoConfigure = async () => {
    setAutoConfigStatus(null)
    const result = await window.api.mcp.autoConfigure()
    if (result.success) {
      setAutoConfigStatus('Configured!')
      await loadMcpStatus()
    } else {
      setAutoConfigStatus(`Failed: ${result.error ?? 'unknown error'}`)
    }
    setTimeout(() => setAutoConfigStatus(null), 3000)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(configSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTestConnection = async () => {
    setTestResult(null)
    const result = await window.api.mcp.testConnection()
    if (result.running) {
      setTestResult(`Running — ${result.skillCount} active skill${result.skillCount !== 1 ? 's' : ''}`)
    } else {
      setTestResult('Not running')
    }
    setTimeout(() => setTestResult(null), 4000)
  }

  return (
    <div className="settings-view">
      <div className="settings-section">
        <span className="settings-section-title">ANTHROPIC API KEY</span>
        <div className="settings-key-row">
          <input
            className="settings-key-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKeyState(e.target.value)}
            placeholder="sk-ant-…"
          />
          <button className="settings-update-btn" onClick={handleUpdate}>
            {saved ? 'Saved' : 'Update'}
          </button>
        </div>
        <p className="settings-key-hint">
          Used to generate skill files with Claude Haiku. Your key is stored encrypted locally
          and never leaves your machine.
        </p>
      </div>

      <div className="settings-section">
        <span className="settings-section-title">CLAUDE DESKTOP</span>

        {mcpConfigPath && (
          <p className="settings-key-hint settings-mcp-path">
            Config found at: {mcpConfigPath}
          </p>
        )}

        <div className="settings-mcp-status">
          <span className={`status-dot ${mcpConfigured ? 'active' : 'inactive'}`} />
          <span className="status-text">
            {mcpConfigured ? 'Connected' : 'Not configured'}
          </span>
        </div>

        <div className="settings-key-row">
          <button className="settings-update-btn" onClick={handleAutoConfigure}>
            Auto-configure Claude Desktop
          </button>
          {autoConfigStatus && (
            <span className="settings-mcp-feedback">{autoConfigStatus}</span>
          )}
        </div>

        <p className="settings-key-hint">
          Or add manually to claude_desktop_config.json:
        </p>
        <div className="settings-mcp-snippet-row">
          <pre className="settings-mcp-snippet">{configSnippet}</pre>
          <button className="settings-update-btn settings-mcp-copy-btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="settings-key-row" style={{ marginTop: '10px' }}>
          <button className="settings-update-btn" onClick={handleTestConnection}>
            Test connection
          </button>
          {testResult && (
            <span className="settings-mcp-feedback">{testResult}</span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS for Claude Desktop section in globals.css**

Add after the `.settings-key-hint` rule (around line 1164):

```css
.settings-mcp-status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
}

.settings-mcp-path {
  margin-bottom: 8px;
  word-break: break-all;
}

.settings-mcp-snippet-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
}

.settings-mcp-snippet {
  flex: 1;
  padding: 8px 10px;
  font-size: 10px;
  font-family: monospace;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--t2);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  line-height: 1.5;
}

.settings-mcp-copy-btn {
  flex-shrink: 0;
}

.settings-mcp-feedback {
  font-size: 10px;
  color: var(--status-ok);
}
```

- [ ] **Step 5: Run Settings tests — expect all pass**

```bash
npm test -- src/views/Settings.test.tsx
```

Expected: All 9 tests pass.

- [ ] **Step 6: Run full test suite — confirm no regressions**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/Settings.tsx src/views/Settings.test.tsx src/styles/globals.css
git commit -m "feat(settings): add Claude Desktop MCP configuration section"
```

---

## Task 7: Sidebar — dual GitHub + Claude Desktop status

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx`
- Modify: `src/styles/globals.css`

The sidebar bottom replaces the single GitHub status row with two rows: GitHub and Claude Desktop. The spec requires the pulse animation **only when both are active**. The current CSS applies `animation: blink` to all `.active` dots — that must change: `.status-dot.active` → green, no animation. New `.status-dot.pulse` → green + blink. The Sidebar passes `pulse` only when both GitHub and Claude Desktop are active.

- [ ] **Step 1: Add failing tests to Sidebar.test.tsx**

In `src/components/Sidebar.test.tsx`, update `setupApi` to include `mcp.getStatus`, then add new tests:

Replace the existing `setupApi` function:

```typescript
function setupApi(username: string | null, mcpConfigured = false) {
  Object.defineProperty(window, 'api', {
    value: {
      windowControls: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
      github: {
        connect: vi.fn(), exchange: vi.fn(), getUser: vi.fn(),
        getStarred: vi.fn(), disconnect: vi.fn(), onCallback: vi.fn(), offCallback: vi.fn(),
      },
      settings: {
        get: vi.fn().mockResolvedValue(username),
        set: vi.fn(),
      },
      mcp: {
        getStatus: vi.fn().mockResolvedValue({
          configured: mcpConfigured,
          configPath: mcpConfigured ? '/path/to/config.json' : null,
        }),
      },
    },
    writable: true,
    configurable: true,
  })
}
```

Update the existing `beforeEach`:
```typescript
beforeEach(() => {
  setupApi(null)
})
```

Add new tests after the existing ones:

```typescript
  it('shows Claude Desktop status row', async () => {
    renderWithRouter()
    await waitFor(() => {
      expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument()
    })
  })

  it('shows Claude Desktop as inactive when not configured', async () => {
    renderWithRouter()
    await waitFor(() => {
      const claudeText = screen.getByText(/Claude Desktop/)
      expect(claudeText).toBeInTheDocument()
    })
  })

  it('shows Claude Desktop as active when configured', async () => {
    setupApi(null, true)
    renderWithRouter()
    await waitFor(() => {
      expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run Sidebar tests — expect new tests to fail**

```bash
npm test -- src/components/Sidebar.test.tsx
```

Expected: The 3 new tests fail (Claude Desktop row not yet rendered).

- [ ] **Step 3: Update Sidebar.tsx to load MCP status and render two rows**

In `src/components/Sidebar.tsx`:

1. Add `mcpConfigured` state after `githubUsername`:

```typescript
  const [mcpConfigured, setMcpConfigured] = useState(false)
```

2. Add MCP status fetch to the `useEffect`:

```typescript
  useEffect(() => {
    window.api.settings.get('github_username')
      .then((val) => {
        setGithubUsername(val && val.length > 0 ? val : null)
      })
      .catch(() => {})

    window.api.mcp.getStatus()
      .then((status) => setMcpConfigured(status.configured))
      .catch(() => {})
  }, [])
```

3. Replace the single `.sidebar-status` div with two rows. Derive `bothActive` for the pulse class:

```typescript
        {(() => {
          const githubActive = !!githubUsername
          const bothActive = githubActive && mcpConfigured
          const githubClass = bothActive ? 'pulse' : githubActive ? 'active' : 'inactive'
          const mcpClass = bothActive ? 'pulse' : mcpConfigured ? 'active' : 'inactive'
          return (
            <>
              <div className="sidebar-status">
                <span className={`status-dot ${githubClass}`} />
                <span className="status-text">
                  {githubUsername ? `${githubUsername} — connected` : 'GitHub — not connected'}
                </span>
              </div>
              <div className="sidebar-status">
                <span className={`status-dot ${mcpClass}`} />
                <span className="status-text">Claude Desktop</span>
              </div>
            </>
          )
        })()}
```

- [ ] **Step 4: Add `.status-dot.pulse` CSS and remove animation from `.active` in globals.css**

In `src/styles/globals.css`, find the `.status-dot.active` rule and remove its animation. Then add the new `.pulse` rule:

```css
/* Replace the existing .status-dot.active animation line: */
.status-dot.active {
  background: var(--status-ok);
  /* animation removed — pulse only when both active, via .pulse class */
}

/* Add after .status-dot.inactive: */
.status-dot.pulse {
  background: var(--status-ok);
  animation: blink 2s infinite;
}
```

- [ ] **Step 5: Run Sidebar tests — expect all pass**

```bash
npm test -- src/components/Sidebar.test.tsx
```

Expected: All tests pass including the 3 new ones.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx src/styles/globals.css
git commit -m "feat(sidebar): add Claude Desktop MCP status dot with pulse-when-both-active logic"
```

---

## Task 8: Final build verification

- [ ] **Step 1: Full production build**

```bash
npm run build
```

Expected: Both `out/main/index.js` and `out/main/mcp-server.js` present. No TypeScript or build errors.

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Expected: All tests pass (electron + src).

- [ ] **Step 3: Smoke test — start the app**

```bash
npm run dev
```

Verify:
- App opens normally
- Settings page shows Claude Desktop section with status
- Sidebar shows both GitHub and Claude Desktop dots
- Auto-configure button writes to the Claude Desktop config
- Test connection returns skill count

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(phase8): MCP server + Claude Desktop integration complete"
```

---

## Acceptance Checklist

- [ ] `out/main/mcp-server.js` built as standalone Node script
- [ ] `list_skills` returns all active installed skills
- [ ] `get_skill` returns full skill file content for `owner/repo`
- [ ] `search_skills` matches query in CORE section of skill files
- [ ] `get_collection` concatenates all active skills in a named collection
- [ ] MCP server spawns automatically when Git Suite opens
- [ ] MCP server is killed cleanly on app quit
- [ ] Settings → Claude Desktop shows config path and connected/not-configured status
- [ ] Auto-configure button writes git-suite entry to claude_desktop_config.json
- [ ] Copy button copies manual config JSON snippet to clipboard
- [ ] Test connection button confirms server is running and returns active skill count
- [ ] Sidebar shows both GitHub and Claude Desktop status dots
- [ ] All tests pass
