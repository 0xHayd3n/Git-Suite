# Create Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Create section to Git Suite — a canvas-based AI tool builder where users mix GitHub repos to produce new tools (MCP servers, web apps, CLIs, widgets) published as GitHub repositories.

**Architecture:** Three-panel canvas (repo browser | live preview | AI chat) built on Electron IPC with a new `create:*` handler set. Sessions persist in SQLite. The AI chat drives incremental code generation via the existing `aiChatService` subprocess model. Preview is type-specific: `WebContentsView` + local HTTP server for web tools, `child_process.spawn` + JSON-RPC for MCP servers, stdout panel for CLIs, second `BrowserWindow` for widgets.

**Tech Stack:** Electron 31 + React 18 + React Router 6 (MemoryRouter) + better-sqlite3 + plain CSS + existing `aiChatService` (Claude CLI subprocess)

---

## File Map

### New — Electron
| File | Responsibility |
|---|---|
| `electron/templates/index.ts` | Static template definitions array |
| `electron/services/createSessionService.ts` | DB CRUD for `create_sessions`, file-tree reading, in-memory dirty/process maps |
| `electron/services/createAiService.ts` | System prompt builder, code extraction (`<files>` parser), context truncation, getSuggestions, generateReadme |
| `electron/services/createGitService.ts` | `git init / add / commit / push` using token-in-URL pattern |
| `electron/services/createPreviewService.ts` | HTTP server lifecycle, `WebContentsView` management, MCP subprocess lifecycle, widget `BrowserWindow` lifecycle |
| `electron/ipc/createHandlers.ts` | All `create:*` IPC handler registrations |

### New — Frontend
| File | Responsibility |
|---|---|
| `src/types/create.ts` | TS types: `CreateSession`, `CreateTemplate`, `CreateMessage`, `ToolType` |
| `src/views/Create.tsx` | Route shell: renders `TemplateGallery` or `CreateCanvas` |
| `src/views/Create.css` | All styles for the Create section |
| `src/components/create/TemplateGallery.tsx` | Template grid + Recent sessions strip |
| `src/components/create/CreateCanvas.tsx` | Three-panel canvas layout |
| `src/components/create/CreateMetaBar.tsx` | Top bar: name, type badge, repo chips, publish state/button |
| `src/components/create/RepoBrowser.tsx` | Left panel: library repos + AI suggestions |
| `src/components/create/AiChatPanel.tsx` | Right panel: streaming AI chat + diff summaries |
| `src/components/create/FileStrip.tsx` | Bottom file list + code inspector overlay |
| `src/components/create/preview/PreviewAdapter.tsx` | Switches between preview components by tool_type |
| `src/components/create/preview/WebPreview.tsx` | Wrapper for WebContentsView (IPC-driven, no DOM embed) |
| `src/components/create/preview/McpInspector.tsx` | MCP tool list + tester UI |
| `src/components/create/preview/CliPreview.tsx` | CLI stdout/stderr output panel |
| `src/components/create/preview/WidgetPreview.tsx` | Widget window controls (relaunch, detach) |

### Modified
| File | Change |
|---|---|
| `electron/db.ts` | Add `create_sessions` table to `initSchema` |
| `electron/github.ts` | Update OAuth scope from `public_repo` to `repo` |
| `electron/main.ts` | Import + call `registerCreateHandlers` |
| `electron/preload.ts` | Expose `window.api.create.*` |
| `src/App.tsx` | Add `/create` and `/create/:sessionId` routes |
| `src/components/Dock.tsx` | Add Create nav item (between Library and Discover) |

### Tests
| File | Covers |
|---|---|
| `electron/services/createAiService.test.ts` | Code extraction parser, context truncation logic, system prompt shape |
| `electron/services/createGitService.test.ts` | Git command string construction (mocked `child_process.exec`) |

---

## Task 1: DB Schema + Types + OAuth Scope

**Files:**
- Modify: `electron/db.ts`
- Modify: `electron/github.ts`
- Create: `src/types/create.ts`

- [ ] **Step 1: Add `create_sessions` table to `initSchema`**

In `electron/db.ts`, inside the `db.exec(...)` template string, add after the last `CREATE TABLE IF NOT EXISTS`:

```sql
CREATE TABLE IF NOT EXISTS create_sessions (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  template_id    TEXT NOT NULL,
  tool_type      TEXT NOT NULL,
  repo_ids       TEXT NOT NULL DEFAULT '[]',
  chat_history   TEXT NOT NULL DEFAULT '[]',
  local_path     TEXT,
  publish_status TEXT NOT NULL DEFAULT 'draft',
  github_repo_url TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
```

- [ ] **Step 2: Fix OAuth scope**

In `electron/github.ts` line 5, change:
```ts
`https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=read:user,public_repo&redirect_uri=gitsuite://oauth/callback`
```
to:
```ts
`https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=read:user,repo&redirect_uri=gitsuite://oauth/callback`
```

- [ ] **Step 3: Create `src/types/create.ts`**

```ts
export type ToolType = 'mcp' | 'webapp' | 'cli' | 'widget' | 'blank'

export interface CreateTemplate {
  id: string
  name: string
  description: string
  toolType: ToolType
  gradient: [string, string]
  emoji: string
}

export interface CreateMessage {
  role: 'user' | 'assistant'
  content: string
  changedFiles?: string[]
  timestamp: number
}

export interface CreateSession {
  id: string
  name: string
  templateId: string
  toolType: ToolType
  repoIds: string[]
  chatHistory: CreateMessage[]
  localPath: string | null
  publishStatus: 'draft' | 'published'
  githubRepoUrl: string | null
  createdAt: string
  updatedAt: string
  // runtime only — not persisted
  filesMissing?: boolean
}

export interface CreateSessionRow {
  id: string
  name: string
  template_id: string
  tool_type: ToolType
  repo_ids: string
  chat_history: string
  local_path: string | null
  publish_status: 'draft' | 'published'
  github_repo_url: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/db.ts electron/github.ts src/types/create.ts
git commit -m "feat(create): db schema, types, oauth scope"
```

---

## Task 2: Template Definitions

**Files:**
- Create: `electron/templates/index.ts`

- [ ] **Step 1: Create template data**

```ts
// electron/templates/index.ts
import type { CreateTemplate } from '../../src/types/create'

export const TEMPLATES: CreateTemplate[] = [
  {
    id: 'mcp-server',
    name: 'MCP Server Starter',
    description: 'Expose tools, resources, and prompts to any MCP client.',
    toolType: 'mcp',
    gradient: ['#1a2a4a', '#0f1520'],
    emoji: '🔌',
  },
  {
    id: '3d-web-app',
    name: '3D Interactive App',
    description: 'Browser-based 3D with Three.js, physics, and shaders.',
    toolType: 'webapp',
    gradient: ['#1a1a3a', '#0f0f20'],
    emoji: '🎮',
  },
  {
    id: 'cli-tool',
    name: 'CLI Tool',
    description: 'Terminal utility, cross-platform, ships as a binary.',
    toolType: 'cli',
    gradient: ['#1a2a1a', '#0f150f'],
    emoji: '⚡',
  },
  {
    id: 'desktop-widget',
    name: 'Desktop Widget',
    description: 'Always-on-top Electron overlay, cross-platform.',
    toolType: 'widget',
    gradient: ['#2a1a1a', '#150f0f'],
    emoji: '🖥️',
  },
  {
    id: 'data-dashboard',
    name: 'Data Dashboard',
    description: 'Charts and tables connected to any API or dataset.',
    toolType: 'webapp',
    gradient: ['#1a2a2a', '#0f1515'],
    emoji: '📊',
  },
  {
    id: 'blank',
    name: 'Start from scratch',
    description: 'Blank canvas, no template.',
    toolType: 'blank',
    gradient: ['#111122', '#0a0a15'],
    emoji: '+',
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add electron/templates/index.ts
git commit -m "feat(create): template definitions"
```

---

## Task 3: Create Session Service

**Files:**
- Create: `electron/services/createSessionService.ts`

- [ ] **Step 1: Write the service**

```ts
// electron/services/createSessionService.ts
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import type Database from 'better-sqlite3'
import type { CreateSession, CreateSessionRow, CreateMessage } from '../../src/types/create'

// In-memory dirty tracking and subprocess maps (keyed by sessionId)
export const dirtyMap = new Map<string, boolean>()
export const pendingChangesMap = new Map<string, string[]>()

function sessionsDir(): string {
  return path.join(app.getPath('userData'), 'create-sessions')
}

function sessionPath(sessionId: string): string {
  return path.join(sessionsDir(), sessionId)
}

function rowToSession(row: CreateSessionRow): CreateSession {
  return {
    id: row.id,
    name: row.name,
    templateId: row.template_id,
    toolType: row.tool_type,
    repoIds: JSON.parse(row.repo_ids) as string[],
    chatHistory: JSON.parse(row.chat_history) as CreateMessage[],
    localPath: row.local_path,
    publishStatus: row.publish_status,
    githubRepoUrl: row.github_repo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function startSession(
  db: Database.Database,
  templateId: string,
  toolType: string,
  name: string,
): Promise<CreateSession> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const local_path = sessionPath(id)
  await fs.mkdir(local_path, { recursive: true })
  db.prepare(`
    INSERT INTO create_sessions (id, name, template_id, tool_type, repo_ids, chat_history, local_path, publish_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, '[]', '[]', ?, 'draft', ?, ?)
  `).run(id, name, templateId, toolType, local_path, now, now)
  return rowToSession(db.prepare('SELECT * FROM create_sessions WHERE id = ?').get(id) as CreateSessionRow)
}

export function getSessions(db: Database.Database): CreateSession[] {
  const rows = db.prepare('SELECT * FROM create_sessions ORDER BY updated_at DESC LIMIT 50').all() as CreateSessionRow[]
  return rows.map(rowToSession)
}

export async function getSession(db: Database.Database, id: string): Promise<CreateSession | null> {
  const row = db.prepare('SELECT * FROM create_sessions WHERE id = ?').get(id) as CreateSessionRow | undefined
  if (!row) return null
  const session = rowToSession(row)
  // Check if local_path still exists
  if (session.localPath) {
    try {
      await fs.access(session.localPath)
    } catch {
      session.filesMissing = true
    }
  }
  return session
}

export function appendMessage(db: Database.Database, id: string, message: CreateMessage): void {
  const row = db.prepare('SELECT chat_history FROM create_sessions WHERE id = ?').get(id) as { chat_history: string } | undefined
  if (!row) return
  const history = JSON.parse(row.chat_history) as CreateMessage[]
  history.push(message)
  db.prepare('UPDATE create_sessions SET chat_history = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(history), new Date().toISOString(), id)
}

export function updateRepoIds(db: Database.Database, id: string, repoIds: string[]): void {
  db.prepare('UPDATE create_sessions SET repo_ids = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(repoIds), new Date().toISOString(), id)
}

export function updateName(db: Database.Database, id: string, name: string): void {
  db.prepare('UPDATE create_sessions SET name = ?, updated_at = ? WHERE id = ?')
    .run(name, new Date().toISOString(), id)
}

export function markPublished(db: Database.Database, id: string, githubRepoUrl: string): void {
  db.prepare('UPDATE create_sessions SET publish_status = ?, github_repo_url = ?, updated_at = ? WHERE id = ?')
    .run('published', githubRepoUrl, new Date().toISOString(), id)
  dirtyMap.set(id, false)
  pendingChangesMap.set(id, [])
}

export function setDirty(sessionId: string, changedFiles: string[]): void {
  dirtyMap.set(sessionId, true)
  const existing = pendingChangesMap.get(sessionId) ?? []
  pendingChangesMap.set(sessionId, [...new Set([...existing, ...changedFiles])])
}

export function clearDirty(sessionId: string): void {
  dirtyMap.set(sessionId, false)
  pendingChangesMap.set(sessionId, [])
}

export async function getFileList(localPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(localPath, { recursive: true, withFileTypes: true })
    return (entries as unknown as { name: string; parentPath: string; isDirectory(): boolean }[])
      .filter(e => !e.isDirectory())
      .map(e => path.relative(localPath, path.join(e.parentPath, e.name)).replace(/\\/g, '/'))
  } catch {
    return []
  }
}

export async function deleteSession(db: Database.Database, id: string): Promise<void> {
  const row = db.prepare('SELECT local_path FROM create_sessions WHERE id = ?').get(id) as { local_path: string | null } | undefined
  db.prepare('DELETE FROM create_sessions WHERE id = ?').run(id)
  if (row?.local_path) {
    await fs.rm(row.local_path, { recursive: true, force: true })
  }
  dirtyMap.delete(id)
  pendingChangesMap.delete(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/createSessionService.ts
git commit -m "feat(create): session service — db crud, file i/o, dirty tracking"
```

---

## Task 4: AI Service (TDD)

**Files:**
- Create: `electron/services/createAiService.ts`
- Create: `electron/services/createAiService.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/services/createAiService.test.ts
import { describe, it, expect } from 'vitest'
import { extractFiles, truncateHistory, buildSystemPrompt } from './createAiService'

describe('extractFiles', () => {
  it('returns empty array and full text when no <files> block', () => {
    const input = 'Hello! What should we build?'
    const result = extractFiles(input)
    expect(result.files).toEqual([])
    expect(result.reply).toBe('Hello! What should we build?')
  })

  it('extracts single file and reply text', () => {
    const input = `<files>\n<file path="src/index.ts">\nconsole.log('hi')\n</file>\n</files>\n\nAdded entry point.`
    const result = extractFiles(input)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('src/index.ts')
    expect(result.files[0].content).toBe("console.log('hi')")
    expect(result.reply).toBe('Added entry point.')
  })

  it('extracts multiple files', () => {
    const input = `<files>\n<file path="a.ts">\nA\n</file>\n<file path="b.ts">\nB\n</file>\n</files>\n\nDone.`
    const result = extractFiles(input)
    expect(result.files).toHaveLength(2)
    expect(result.files[1].path).toBe('b.ts')
  })
})

describe('truncateHistory', () => {
  it('returns history unchanged when 20 or fewer messages', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant' as 'user' | 'assistant',
      content: `msg ${i}`,
      timestamp: i,
    }))
    expect(truncateHistory(messages)).toHaveLength(20)
  })

  it('truncates to 15 most recent when over 20 messages', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant' as 'user' | 'assistant',
      content: `msg ${i}`,
      timestamp: i,
    }))
    const result = truncateHistory(messages)
    expect(result).toHaveLength(16) // summary + 15 recent
    expect(result[0].role).toBe('assistant')
    expect(result[0].content).toContain('[Summary')
    expect(result[result.length - 1].content).toBe('msg 24')
  })
})

describe('buildSystemPrompt', () => {
  it('includes template and tool type', () => {
    const prompt = buildSystemPrompt('MCP Server Starter', 'mcp', [])
    expect(prompt).toContain('MCP Server Starter')
    expect(prompt).toContain('mcp')
  })

  it('includes repo context limited to 500 chars', () => {
    const longReadme = 'A'.repeat(1000)
    const prompt = buildSystemPrompt('test', 'webapp', [{ name: 'my-repo', description: 'A tool', readmeExcerpt: longReadme }])
    const readmeSection = prompt.split('my-repo')[1]
    expect(readmeSection?.length).toBeLessThan(600)
  })

  it('includes <files> format instructions', () => {
    const prompt = buildSystemPrompt('test', 'cli', [])
    expect(prompt).toContain('<files>')
    expect(prompt).toContain('<file path=')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- electron/services/createAiService.test.ts
```
Expected: fail with "Cannot find module './createAiService'"

- [ ] **Step 3: Implement the service**

```ts
// electron/services/createAiService.ts
import type { CreateMessage } from '../../src/types/create'

export interface ExtractedFile {
  path: string
  content: string
}

export interface ExtractResult {
  files: ExtractedFile[]
  reply: string
}

export function extractFiles(response: string): ExtractResult {
  const filesMatch = response.match(/<files>([\s\S]*?)<\/files>/)
  if (!filesMatch) return { files: [], reply: response.trim() }

  const filesBlock = filesMatch[1]
  const fileMatches = [...filesBlock.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)\n?<\/file>/g)]
  const files = fileMatches.map(m => ({ path: m[1], content: m[2] }))
  const reply = response.slice((filesMatch.index ?? 0) + filesMatch[0].length).trim()
  return { files, reply }
}

export function truncateHistory(history: CreateMessage[]): CreateMessage[] {
  if (history.length <= 20) return history
  const summary: CreateMessage = {
    role: 'assistant',
    content: `[Summary of first ${history.length - 15} messages: conversation established tool purpose, selected repos, and initial code structure.]`,
    timestamp: history[0].timestamp,
  }
  return [summary, ...history.slice(-15)]
}

export interface RepoContext {
  name: string
  description: string
  readmeExcerpt: string
}

export function buildSystemPrompt(templateName: string, toolType: string, repos: RepoContext[]): string {
  const repoSection = repos.length > 0
    ? `\n## Repo Context\n${repos.map(r =>
        `### ${r.name}\n${r.description}\n${r.readmeExcerpt.slice(0, 500)}`
      ).join('\n\n')}`
    : ''

  return `You are an expert software engineer building a "${templateName}" (type: ${toolType}) tool for the user.

Your job: have a conversation to understand what the user wants, then generate the code incrementally.

When you produce or update files, wrap them in this exact format:
<files>
<file path="src/example.ts">
// file content here
</file>
</files>

Then write a plain-English explanation of what changed and optionally ask a follow-up question.

If you are only asking a question or clarifying (no code changes), do NOT include a <files> block.
${repoSection}

Tool type: ${toolType}
Template: ${templateName}

Start by asking the user one focused question about the purpose of their tool.`
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- electron/services/createAiService.test.ts
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add electron/services/createAiService.ts electron/services/createAiService.test.ts
git commit -m "feat(create): ai service — code extraction, context truncation, system prompt"
```

---

## Task 5: Git Service (TDD)

**Files:**
- Create: `electron/services/createGitService.ts`
- Create: `electron/services/createGitService.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/services/createGitService.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildPushUrl } from './createGitService'

describe('buildPushUrl', () => {
  it('embeds token in HTTPS URL', () => {
    const url = buildPushUrl('ghp_abc123', 'haydo', 'my-tool')
    expect(url).toBe('https://ghp_abc123@github.com/haydo/my-tool.git')
  })

  it('does not include token in clean URL', () => {
    const clean = `https://github.com/haydo/my-tool`
    expect(clean).not.toContain('ghp_')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- electron/services/createGitService.test.ts
```

- [ ] **Step 3: Implement git service**

```ts
// electron/services/createGitService.ts
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export function buildPushUrl(token: string, username: string, repoName: string): string {
  return `https://${token}@github.com/${username}/${repoName}.git`
}

export function cleanRepoUrl(username: string, repoName: string): string {
  return `https://github.com/${username}/${repoName}`
}

export async function gitInit(localPath: string): Promise<void> {
  await execAsync('git init', { cwd: localPath })
  await execAsync('git config user.email "gitsuite@local"', { cwd: localPath })
  await execAsync('git config user.name "Git Suite"', { cwd: localPath })
}

export async function gitCommitAll(localPath: string, message: string): Promise<void> {
  await execAsync('git add .', { cwd: localPath })
  await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: localPath })
}

export async function gitPush(localPath: string, pushUrl: string): Promise<void> {
  // Set remote (or update if already exists)
  try {
    await execAsync(`git remote add origin ${pushUrl}`, { cwd: localPath })
  } catch {
    await execAsync(`git remote set-url origin ${pushUrl}`, { cwd: localPath })
  }
  await execAsync('git push -u origin HEAD', { cwd: localPath })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- electron/services/createGitService.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add electron/services/createGitService.ts electron/services/createGitService.test.ts
git commit -m "feat(create): git service — init, commit, push with token-url"
```

---

## Task 6: Preview Service

**Files:**
- Create: `electron/services/createPreviewService.ts`

- [ ] **Step 1: Create the preview service**

```ts
// electron/services/createPreviewService.ts
import { BrowserWindow, WebContentsView, app } from 'electron'
import { createServer, type Server } from 'http'
import { readFile } from 'fs/promises'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'

// Per-session HTTP servers (web previews)
const httpServers = new Map<string, { server: Server; port: number }>()

// Per-session MCP server subprocesses
const mcpProcesses = new Map<string, ChildProcess>()

// Per-session widget BrowserWindows (tracked, not detached)
const widgetWindows = new Map<string, BrowserWindow>()

// Per-session WebContentsViews
const webViews = new Map<string, WebContentsView>()

export async function startHttpServer(sessionId: string, localPath: string): Promise<number> {
  await stopHttpServer(sessionId)
  const server = createServer(async (req, res) => {
    let filePath = path.join(localPath, req.url === '/' ? 'index.html' : req.url!)
    try {
      const data = await readFile(filePath)
      const ext = path.extname(filePath).slice(1)
      const mime: Record<string, string> = { html: 'text/html', js: 'application/javascript', ts: 'application/javascript', css: 'text/css', json: 'application/json' }
      res.writeHead(200, { 'Content-Type': mime[ext] ?? 'text/plain' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve(addr.port)
    })
    server.on('error', reject)
  })
  httpServers.set(sessionId, { server, port })
  return port
}

export async function stopHttpServer(sessionId: string): Promise<void> {
  const entry = httpServers.get(sessionId)
  if (entry) {
    await new Promise<void>(resolve => entry.server.close(() => resolve()))
    httpServers.delete(sessionId)
  }
}

export function getHttpPort(sessionId: string): number | null {
  return httpServers.get(sessionId)?.port ?? null
}

export function spawnMcpProcess(sessionId: string, entryPoint: string, cwd: string): ChildProcess {
  killMcpProcess(sessionId)
  const proc = spawn('node', [entryPoint], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  mcpProcesses.set(sessionId, proc)
  return proc
}

export function killMcpProcess(sessionId: string): void {
  const proc = mcpProcesses.get(sessionId)
  if (proc && !proc.killed) proc.kill()
  mcpProcesses.delete(sessionId)
}

export function getMcpProcess(sessionId: string): ChildProcess | undefined {
  return mcpProcesses.get(sessionId)
}

export function launchWidgetWindow(sessionId: string, localPath: string): BrowserWindow {
  closeWidgetWindow(sessionId)
  const win = new BrowserWindow({
    width: 300,
    height: 200,
    alwaysOnTop: true,
    frame: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: 'Git Suite Widget',
  })
  win.loadFile(path.join(localPath, 'index.html'))
  widgetWindows.set(sessionId, win)
  win.on('closed', () => widgetWindows.delete(sessionId))
  return win
}

export function closeWidgetWindow(sessionId: string): void {
  const win = widgetWindows.get(sessionId)
  if (win && !win.isDestroyed()) win.close()
  widgetWindows.delete(sessionId)
}

export function detachWidgetWindow(sessionId: string): void {
  widgetWindows.delete(sessionId)
}

export function closeAllForSession(sessionId: string): void {
  stopHttpServer(sessionId)
  killMcpProcess(sessionId)
  closeWidgetWindow(sessionId)
}

export function closeAllOnQuit(): void {
  for (const [id] of widgetWindows) closeWidgetWindow(id)
  for (const [id] of mcpProcesses) killMcpProcess(id)
  for (const [id] of httpServers) stopHttpServer(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/createPreviewService.ts
git commit -m "feat(create): preview service — http server, mcp process, widget window lifecycle"
```

---

## Task 7: IPC Handlers

**Files:**
- Create: `electron/ipc/createHandlers.ts`

- [ ] **Step 1: Write all handlers**

```ts
// electron/ipc/createHandlers.ts
import { ipcMain, app, shell } from 'electron'
import { getDb } from '../db'
import { getToken, getGitHubUser } from '../store'
import { TEMPLATES } from '../templates/index'
import {
  startSession, getSessions, getSession, appendMessage,
  updateRepoIds, updateName, markPublished, setDirty, clearDirty,
  getFileList, deleteSession, dirtyMap, pendingChangesMap
} from '../services/createSessionService'
import { buildSystemPrompt, extractFiles, truncateHistory } from '../services/createAiService'
import { buildPushUrl, cleanRepoUrl, gitInit, gitCommitAll, gitPush } from '../services/createGitService'
import {
  startHttpServer, stopHttpServer, getHttpPort,
  spawnMcpProcess, killMcpProcess, getMcpProcess,
  launchWidgetWindow, closeWidgetWindow, detachWidgetWindow,
  closeAllForSession, closeAllOnQuit
} from '../services/createPreviewService'
import { sendMessageStream } from '../services/aiChatService'
import { githubHeaders } from '../github'
import type { CreateMessage, ToolType } from '../../src/types/create'

export function registerCreateHandlers(): void {
  ipcMain.handle('create:getTemplates', () => TEMPLATES)

  ipcMain.handle('create:startSession', async (_event, payload: { templateId: string; toolType: ToolType; name: string }) => {
    const db = getDb(app.getPath('userData'))
    return startSession(db, payload.templateId, payload.toolType, payload.name)
  })

  ipcMain.handle('create:getSessions', () => {
    const db = getDb(app.getPath('userData'))
    return getSessions(db)
  })

  ipcMain.handle('create:getSession', async (_event, id: string) => {
    const db = getDb(app.getPath('userData'))
    const session = await getSession(db, id)
    if (!session || !session.localPath) return session
    const files = await getFileList(session.localPath)
    return { ...session, files, dirty: dirtyMap.get(id) ?? false, pendingChanges: pendingChangesMap.get(id) ?? [] }
  })

  ipcMain.handle('create:updateName', (_event, id: string, name: string) => {
    const db = getDb(app.getPath('userData'))
    updateName(db, id, name)
  })

  ipcMain.handle('create:updateRepos', (_event, id: string, repoIds: string[]) => {
    const db = getDb(app.getPath('userData'))
    updateRepoIds(db, id, repoIds)
  })

  ipcMain.handle('create:deleteSession', async (_event, id: string) => {
    const db = getDb(app.getPath('userData'))
    closeAllForSession(id)
    await deleteSession(db, id)
  })

  ipcMain.handle('create:sendMessage', async (event, payload: {
    sessionId: string
    userMessage: string
    templateName: string
    toolType: ToolType
    repos: { name: string; description: string; readmeExcerpt: string }[]
    history: CreateMessage[]
  }) => {
    const db = getDb(app.getPath('userData'))
    const session = await getSession(db, payload.sessionId)
    if (!session) throw new Error('Session not found')

    const systemPrompt = buildSystemPrompt(payload.templateName, payload.toolType, payload.repos)
    const userMsg: CreateMessage = { role: 'user', content: payload.userMessage, timestamp: Date.now() }
    appendMessage(db, payload.sessionId, userMsg)

    const truncated = truncateHistory([...payload.history, userMsg])
    const aiMessages = truncated.map(m => ({ role: m.role, content: m.content }))

    return new Promise<{ reply: string; changedFiles: string[] }>((resolve, reject) => {
      let fullText = ''
      sendMessageStream(
        aiMessages as any,
        [], [],
        systemPrompt,
        {
          onToken: (token) => {
            fullText += token
            // Forward stream tokens to renderer
            const win = require('electron').BrowserWindow.fromWebContents(event.sender)
            if (win && !win.isDestroyed()) win.webContents.send('create:stream-token', { sessionId: payload.sessionId, token })
          },
          onDone: async (text) => {
            const { files, reply } = extractFiles(text)
            const changedFiles: string[] = []
            // Write generated files
            if (files.length > 0 && session.localPath) {
              const { mkdir, writeFile } = await import('fs/promises')
              const path = await import('path')
              for (const f of files) {
                const dest = path.join(session.localPath, f.path)
                await mkdir(path.dirname(dest), { recursive: true })
                await writeFile(dest, f.content, 'utf-8')
                changedFiles.push(f.path)
              }
              // Mark dirty if already published
              const fresh = await getSession(db, payload.sessionId)
              if (fresh?.publishStatus === 'published') {
                setDirty(payload.sessionId, changedFiles)
              }
            }
            const assistantMsg: CreateMessage = { role: 'assistant', content: reply, changedFiles, timestamp: Date.now() }
            appendMessage(db, payload.sessionId, assistantMsg)
            resolve({ reply, changedFiles })
          },
          onError: reject,
        }
      ).catch(reject)
    })
  })

  ipcMain.handle('create:startWebPreview', async (_event, sessionId: string, localPath: string) => {
    const port = await startHttpServer(sessionId, localPath)
    return { port, url: `http://localhost:${port}` }
  })

  ipcMain.handle('create:stopPreview', async (_event, sessionId: string) => {
    closeAllForSession(sessionId)
  })

  ipcMain.handle('create:spawnMcp', (_event, sessionId: string, entryPoint: string, cwd: string) => {
    const proc = spawnMcpProcess(sessionId, entryPoint, cwd)
    return new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => resolve({ ok: !proc.killed }), 800)
    })
  })

  ipcMain.handle('create:getMcpTools', (_event, sessionId: string) => {
    const proc = getMcpProcess(sessionId)
    if (!proc) return []
    return new Promise<unknown[]>((resolve) => {
      const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      let response = ''
      const handler = (data: Buffer) => {
        response += data.toString()
        try {
          const parsed = JSON.parse(response)
          proc.stdout?.off('data', handler)
          resolve(parsed.result?.tools ?? [])
        } catch { /* incomplete */ }
      }
      proc.stdout?.on('data', handler)
      proc.stdin?.write(request + '\n')
      setTimeout(() => { proc.stdout?.off('data', handler); resolve([]) }, 3000)
    })
  })

  ipcMain.handle('create:launchWidget', (_event, sessionId: string, localPath: string) => {
    launchWidgetWindow(sessionId, localPath)
  })

  ipcMain.handle('create:detachWidget', (_event, sessionId: string) => {
    detachWidgetWindow(sessionId)
  })

  ipcMain.handle('create:relaunchWidget', (_event, sessionId: string, localPath: string) => {
    closeWidgetWindow(sessionId)
    setTimeout(() => launchWidgetWindow(sessionId, localPath), 500)
  })

  ipcMain.handle('create:getSuggestions', async (_event, templateId: string, repoIds: string[]) => {
    // v1: returns empty array — suggestions feature is deferred.
    // To wire real suggestions later: call recommendHandlers logic with templateId as context.
    const suggestions: { name: string; description: string }[] = []
    return suggestions
  })

  ipcMain.handle('create:openFolder', (_event, localPath: string) => {
    shell.openPath(localPath)
  })

  ipcMain.handle('create:getFileContent', async (_event, localPath: string, filePath: string) => {
    const { readFile } = await import('fs/promises')
    const path = await import('path')
    return readFile(path.join(localPath, filePath), 'utf-8')
  })

  ipcMain.handle('create:publishToGitHub', async (_event, payload: {
    sessionId: string
    repoName: string
    description: string
    isPrivate: boolean
    localPath: string
  }) => {
    const token = getToken()
    const user = getGitHubUser()
    if (!token || !user) throw new Error('Not authenticated')

    // Create GitHub repo
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: payload.repoName, description: payload.description, private: payload.isPrivate, auto_init: false }),
    })
    if (res.status === 403) throw new Error('SCOPE_MISSING')
    if (!res.ok) throw new Error(`GitHub error: ${res.status}`)
    const repoData = await res.json() as { html_url: string; name: string }

    // Git init + commit + push
    await gitInit(payload.localPath)
    await gitCommitAll(payload.localPath, 'Initial commit via Git Suite Create')
    const pushUrl = buildPushUrl(token, user.username, repoData.name)
    await gitPush(payload.localPath, pushUrl)

    const cleanUrl = cleanRepoUrl(user.username, repoData.name)
    const db = getDb(app.getPath('userData'))
    markPublished(db, payload.sessionId, cleanUrl)
    return { githubRepoUrl: cleanUrl }
  })

  ipcMain.handle('create:pushUpdate', async (_event, payload: {
    sessionId: string
    localPath: string
    githubRepoUrl: string
  }) => {
    const token = getToken()
    const user = getGitHubUser()
    if (!token || !user) throw new Error('Not authenticated')
    const repoName = payload.githubRepoUrl.split('/').pop()!
    await gitCommitAll(payload.localPath, 'Update via Git Suite Create')
    const pushUrl = buildPushUrl(token, user.username, repoName)
    await gitPush(payload.localPath, pushUrl)
    clearDirty(payload.sessionId)
  })
}

export { closeAllOnQuit }
```

- [ ] **Step 2: Register in `electron/main.ts`**

Add at the top with other imports:
```ts
import { registerCreateHandlers, closeAllOnQuit } from './ipc/createHandlers'
```

Find the block where other handlers are registered (e.g., after `registerAiChatHandlers()`) and add:
```ts
registerCreateHandlers()
```

Also add to the `app.on('before-quit')` or `app.on('will-quit')` handler:
```ts
closeAllOnQuit()
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/createHandlers.ts electron/main.ts
git commit -m "feat(create): ipc handlers — all create:* channels"
```

---

## Task 8: Preload + Route Wiring

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Dock.tsx`

- [ ] **Step 1: Add `window.api.create` to preload**

In `electron/preload.ts`, add a new `create` key inside the `contextBridge.exposeInMainWorld('api', { ... })` object:

```ts
  create: {
    getTemplates: () => ipcRenderer.invoke('create:getTemplates'),
    startSession: (payload: { templateId: string; toolType: string; name: string }) =>
      ipcRenderer.invoke('create:startSession', payload),
    getSessions: () => ipcRenderer.invoke('create:getSessions'),
    getSession: (id: string) => ipcRenderer.invoke('create:getSession', id),
    updateName: (id: string, name: string) => ipcRenderer.invoke('create:updateName', id, name),
    updateRepos: (id: string, repoIds: string[]) => ipcRenderer.invoke('create:updateRepos', id, repoIds),
    deleteSession: (id: string) => ipcRenderer.invoke('create:deleteSession', id),
    sendMessage: (payload: unknown) => ipcRenderer.invoke('create:sendMessage', payload),
    startWebPreview: (sessionId: string, localPath: string) => ipcRenderer.invoke('create:startWebPreview', sessionId, localPath),
    stopPreview: (sessionId: string) => ipcRenderer.invoke('create:stopPreview', sessionId),
    spawnMcp: (sessionId: string, entryPoint: string, cwd: string) => ipcRenderer.invoke('create:spawnMcp', sessionId, entryPoint, cwd),
    getMcpTools: (sessionId: string) => ipcRenderer.invoke('create:getMcpTools', sessionId),
    launchWidget: (sessionId: string, localPath: string) => ipcRenderer.invoke('create:launchWidget', sessionId, localPath),
    detachWidget: (sessionId: string) => ipcRenderer.invoke('create:detachWidget', sessionId),
    relaunchWidget: (sessionId: string, localPath: string) => ipcRenderer.invoke('create:relaunchWidget', sessionId, localPath),
    getSuggestions: (templateId: string, repoIds: string[]) => ipcRenderer.invoke('create:getSuggestions', templateId, repoIds),
    openFolder: (localPath: string) => ipcRenderer.invoke('create:openFolder', localPath),
    getFileContent: (localPath: string, filePath: string) => ipcRenderer.invoke('create:getFileContent', localPath, filePath),
    publishToGitHub: (payload: unknown) => ipcRenderer.invoke('create:publishToGitHub', payload),
    pushUpdate: (payload: unknown) => ipcRenderer.invoke('create:pushUpdate', payload),
    onStreamToken: (cb: (data: { sessionId: string; token: string }) => void) => {
      const wrapper = (_: unknown, data: { sessionId: string; token: string }) => cb(data)
      callbackWrappers.set(cb, wrapper)
      ipcRenderer.on('create:stream-token', wrapper)
    },
    offStreamToken: (cb: (data: { sessionId: string; token: string }) => void) => {
      const wrapper = callbackWrappers.get(cb)
      if (wrapper) {
        ipcRenderer.removeListener('create:stream-token', wrapper)
        callbackWrappers.delete(cb)
      }
    },
  },
```

- [ ] **Step 2: Add `/create` routes in `src/App.tsx`**

Add import at the top:
```ts
import Create from './views/Create'
```

Inside the `<Routes>` block, add before the `/starred` route:
```tsx
<Route path="/create" element={<Create />} />
<Route path="/create/:sessionId" element={<Create />} />
```

Update the `isDiscoverPage` condition to exclude `/create`:
```ts
const isDiscoverPage = location.pathname === '/' || location.pathname.startsWith('/discover') || location.pathname.startsWith('/library') || location.pathname.startsWith('/repo/')
```
(No change needed — `/create` already excluded from that check.)

- [ ] **Step 3: Add Create to the Dock**

In `src/components/Dock.tsx`, add a `CreateIcon` function after `LibraryIcon`:

```ts
function CreateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  )
}
```

Update `NAV_ITEMS` to insert Create between Library and Discover:
```ts
const NAV_ITEMS = [
  { label: 'Library',  path: '/library',  icon: <LibraryIcon /> },
  { label: 'Create',   path: '/create',   icon: <CreateIcon /> },
  { label: 'Discover', path: '/discover', icon: <DiscoverIcon /> },
  { label: 'Profile',  path: '/profile',  icon: <ProfileIcon /> },
]
```

Update `getTabPrefix`:
```ts
if (pathname.startsWith('/create')) return '/create'
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/App.tsx src/components/Dock.tsx
git commit -m "feat(create): preload api, routes, dock nav item"
```

---

## Task 9: Template Gallery View

**Files:**
- Create: `src/views/Create.tsx`
- Create: `src/views/Create.css`
- Create: `src/components/create/TemplateGallery.tsx`

- [ ] **Step 1: Create `src/views/Create.tsx`** (route shell)

```tsx
// src/views/Create.tsx
import { useParams } from 'react-router-dom'
import TemplateGallery from '../components/create/TemplateGallery'
import CreateCanvas from '../components/create/CreateCanvas'
import './Create.css'

export default function Create() {
  const { sessionId } = useParams<{ sessionId?: string }>()
  if (sessionId) return <CreateCanvas sessionId={sessionId} />
  return <TemplateGallery />
}
```

- [ ] **Step 2: Create `src/components/create/TemplateGallery.tsx`**

```tsx
// src/components/create/TemplateGallery.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateTemplate, CreateSession } from '../../types/create'

const TYPE_LABELS: Record<string, string> = {
  mcp: 'MCP Server', webapp: 'Web App', cli: 'CLI Tool', widget: 'Desktop', blank: '',
}

const FILTERS = ['All', 'MCP Server', 'Web App', 'CLI Tool', 'Desktop Widget']

export default function TemplateGallery() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<CreateTemplate[]>([])
  const [sessions, setSessions] = useState<CreateSession[]>([])
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.api.create.getTemplates().then(setTemplates)
    window.api.create.getSessions().then(setSessions)
  }, [])

  async function handleSelectTemplate(t: CreateTemplate) {
    const name = t.toolType === 'blank' ? 'Untitled Tool' : t.name
    const session = await window.api.create.startSession({
      templateId: t.id,
      toolType: t.toolType,
      name,
    })
    navigate(`/create/${session.id}`)
  }

  const typeMap: Record<string, string> = { mcp: 'MCP Server', webapp: 'Web App', cli: 'CLI Tool', widget: 'Desktop Widget' }
  const visible = templates.filter(t => {
    if (filter !== 'All' && typeMap[t.toolType] !== filter) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="create-gallery">
      <div className="create-gallery-header">
        <h1 className="create-gallery-title">Build something new</h1>
        <p className="create-gallery-subtitle">Pick a template to start. Mix repos and let AI build it with you.</p>
      </div>

      {sessions.length > 0 && (
        <section className="create-recent">
          <h2 className="create-section-label">Recent</h2>
          <div className="create-recent-grid">
            {sessions.slice(0, 6).map(s => (
              <button key={s.id} className="create-recent-card" onClick={() => navigate(`/create/${s.id}`)}>
                <span className="create-recent-name">{s.name}</span>
                <span className="create-recent-meta">{TYPE_LABELS[s.toolType] ?? s.toolType}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="create-templates">
        <div className="create-filters">
          <input
            className="create-search"
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="create-filter-tabs">
            {FILTERS.map(f => (
              <button key={f} className={`create-filter-tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        <div className="create-template-grid">
          {visible.map(t => (
            <button key={t.id} className="create-template-card" onClick={() => handleSelectTemplate(t)}>
              <div className="create-template-header" style={{ background: `linear-gradient(135deg, ${t.gradient[0]}, ${t.gradient[1]})` }}>
                <span className="create-template-emoji">{t.emoji}</span>
                {t.toolType !== 'blank' && (
                  <span className="create-template-badge">{TYPE_LABELS[t.toolType]}</span>
                )}
              </div>
              <div className="create-template-body">
                <div className="create-template-name">{t.name}</div>
                <div className="create-template-desc">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Create base styles in `src/views/Create.css`**

```css
/* ── Create section ────────────────────────────────────────────── */

.create-gallery {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.create-gallery-header { text-align: center; }
.create-gallery-title { font-size: 22px; font-weight: 700; color: var(--t1); margin: 0 0 6px; }
.create-gallery-subtitle { font-size: 13px; color: var(--t3); margin: 0; }

.create-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--t4); margin: 0 0 10px; }

.create-recent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.create-recent-card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.create-recent-card:hover { border-color: var(--accent); }
.create-recent-name { font-size: 12px; color: var(--t1); font-weight: 500; }
.create-recent-meta { font-size: 10px; color: var(--t4); }

.create-filters { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.create-search { background: var(--surface-1); border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; font-size: 12px; color: var(--t1); width: 280px; }
.create-filter-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.create-filter-tab { background: var(--surface-1); border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px; font-size: 11px; color: var(--t3); cursor: pointer; }
.create-filter-tab.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.create-template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.create-template-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; cursor: pointer; text-align: left; }
.create-template-card:hover { border-color: var(--accent); }
.create-template-header { height: 80px; display: flex; align-items: center; justify-content: center; position: relative; }
.create-template-emoji { font-size: 28px; }
.create-template-badge { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.4); border-radius: 3px; padding: 2px 6px; font-size: 9px; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.5px; }
.create-template-body { padding: 10px 12px; }
.create-template-name { font-size: 12px; color: var(--t1); font-weight: 600; margin-bottom: 4px; }
.create-template-desc { font-size: 11px; color: var(--t3); line-height: 1.4; }

/* ── Canvas ─────────────────────────────────────────────────────── */

.create-canvas { display: flex; flex-direction: column; height: 100%; }

.create-meta-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 44px;
  background: var(--surface-0);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.create-meta-name { font-size: 13px; font-weight: 600; color: var(--t1); background: transparent; border: none; outline: none; }
.create-meta-name:hover { background: var(--surface-1); border-radius: 4px; padding: 2px 4px; margin: -2px -4px; }
.create-type-badge { background: var(--accent-dim); border-radius: 3px; padding: 2px 7px; font-size: 10px; color: var(--accent); }
.create-repo-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.create-repo-chip { background: var(--surface-1); border: 1px solid var(--border); border-radius: 3px; padding: 2px 7px; font-size: 10px; color: var(--t2); display: flex; align-items: center; gap: 4px; }
.create-repo-chip-remove { color: var(--t4); cursor: pointer; }
.create-add-repo-btn { background: transparent; border: 1px dashed var(--border); border-radius: 3px; padding: 2px 7px; font-size: 10px; color: var(--t4); cursor: pointer; }
.create-meta-right { margin-left: auto; display: flex; gap: 6px; align-items: center; }
.create-draft-pill { background: var(--surface-1); border: 1px solid var(--border); border-radius: 4px; padding: 3px 8px; font-size: 11px; color: var(--t3); }
.create-published-pill { background: var(--surface-1); border: 1px solid #2a4a2a; border-radius: 4px; padding: 3px 8px; font-size: 11px; color: #5a8a5a; display: flex; align-items: center; gap: 6px; }
.create-published-link { color: #4a7a4a; text-decoration: underline; cursor: pointer; }
.create-changes-badge { background: #2a4a1a; border-radius: 3px; padding: 1px 5px; font-size: 10px; color: #8aca6a; }
.create-publish-btn { background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; padding: 3px 12px; font-size: 11px; color: var(--accent); cursor: pointer; font-weight: 600; }
.create-push-btn { background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; padding: 3px 12px; font-size: 11px; color: var(--accent); cursor: pointer; font-weight: 600; }
.create-push-btn:disabled { opacity: 0.4; cursor: default; }

.create-panels { display: flex; flex: 1; min-height: 0; }

/* Left panel */
.create-repo-panel { width: 220px; flex-shrink: 0; background: var(--surface-0); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.create-repo-panel-section { padding: 8px 10px; }
.create-repo-panel-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--t4); margin-bottom: 6px; display: block; }
.create-repo-search { background: var(--surface-1); border: 1px solid var(--border); border-radius: 4px; padding: 4px 7px; font-size: 11px; color: var(--t1); width: 100%; }
.create-repo-list { display: flex; flex-direction: column; gap: 3px; padding: 0 6px 6px; }
.create-repo-item { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 4px; cursor: pointer; border: 1px solid transparent; }
.create-repo-item:hover { background: var(--surface-1); }
.create-repo-item.added { background: var(--accent-dim); border-color: var(--accent); }
.create-repo-item-name { font-size: 11px; color: var(--t1); }
.create-repo-item-meta { font-size: 9px; color: var(--t4); }
.create-suggest-label { display: flex; align-items: center; gap: 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); }

/* Center preview */
.create-preview-panel { flex: 1; min-width: 0; background: var(--surface-bg); display: flex; flex-direction: column; }
.create-preview-area { flex: 1; position: relative; overflow: hidden; }
.create-preview-toolbar { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(10,10,20,0.85); border: 1px solid var(--border); border-radius: 6px; padding: 5px 12px; display: flex; gap: 10px; align-items: center; backdrop-filter: blur(4px); }
.create-preview-status { font-size: 11px; }
.create-preview-status.live { color: #5a9a6a; }
.create-preview-status.building { color: #9a9a5a; }
.create-preview-status.error { color: #9a5a5a; }
.create-preview-action { font-size: 11px; color: var(--t3); background: none; border: none; cursor: pointer; }
.create-preview-action:hover { color: var(--t1); }
.create-file-strip { background: var(--surface-0); border-top: 1px solid var(--border); padding: 4px 10px; display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; overflow-x: auto; }
.create-file-chip { font-size: 10px; color: var(--t3); cursor: pointer; white-space: nowrap; }
.create-file-chip:hover { color: var(--t1); }
.create-file-count { font-size: 10px; color: var(--t4); margin-left: auto; white-space: nowrap; }
.create-diff-strip { background: var(--surface-0); border-bottom: 1px solid var(--border); padding: 3px 14px; display: flex; gap: 10px; font-size: 10px; font-family: monospace; }
.create-diff-added { color: #5a9a6a; }
.create-diff-changed { color: var(--accent); }

/* Right panel */
.create-chat-panel { width: 260px; flex-shrink: 0; background: var(--surface-0); border-left: 1px solid var(--border); display: flex; flex-direction: column; }
.create-chat-header { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--t4); }
.create-chat-messages { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.create-chat-msg { border-radius: 6px; padding: 7px 9px; font-size: 11px; line-height: 1.5; }
.create-chat-msg.user { background: var(--surface-1); color: var(--t2); align-self: flex-end; max-width: 90%; }
.create-chat-msg.assistant { background: #1a2a1a; color: #6a9; }
.create-chat-diff { background: var(--surface-bg); border: 1px solid var(--border); border-radius: 4px; padding: 5px 7px; font-size: 10px; font-family: monospace; margin-top: 4px; line-height: 1.6; }
.create-chat-diff-add { color: #5a9a6a; }
.create-chat-diff-mod { color: var(--accent); }
.create-chat-input { padding: 8px; border-top: 1px solid var(--border); }
.create-chat-input textarea { width: 100%; background: var(--surface-1); border: 1px solid var(--border); border-radius: 5px; padding: 7px 9px; font-size: 11px; color: var(--t1); resize: none; height: 60px; font-family: inherit; }
.create-chat-send { margin-top: 5px; width: 100%; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; padding: 5px; font-size: 11px; color: var(--accent); cursor: pointer; }
.create-chat-send:disabled { opacity: 0.4; cursor: default; }

/* Code inspector overlay */
.create-code-inspector { position: absolute; inset: 0; background: var(--surface-bg); z-index: 10; display: flex; flex-direction: column; }
.create-code-inspector-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.create-code-inspector-title { font-size: 11px; color: var(--t2); font-family: monospace; }
.create-code-inspector-close { margin-left: auto; background: none; border: none; color: var(--t3); cursor: pointer; font-size: 14px; }
.create-code-inspector-body { flex: 1; overflow: auto; padding: 12px; font-family: monospace; font-size: 11px; line-height: 1.6; color: var(--t2); white-space: pre; }
```

- [ ] **Step 4: Commit**

```bash
git add src/views/Create.tsx src/views/Create.css src/components/create/TemplateGallery.tsx
git commit -m "feat(create): template gallery view"
```

---

## Task 10: Canvas Shell + Repo Browser + AI Chat Panel

**Files:**
- Create: `src/components/create/CreateCanvas.tsx`
- Create: `src/components/create/CreateMetaBar.tsx`
- Create: `src/components/create/RepoBrowser.tsx`
- Create: `src/components/create/AiChatPanel.tsx`
- Create: `src/components/create/FileStrip.tsx`

- [ ] **Step 1: Create `src/components/create/CreateCanvas.tsx`**

```tsx
// src/components/create/CreateCanvas.tsx
import { useState, useEffect } from 'react'
import CreateMetaBar from './CreateMetaBar'
import RepoBrowser from './RepoBrowser'
import AiChatPanel from './AiChatPanel'
import PreviewAdapter from './preview/PreviewAdapter'
import FileStrip from './FileStrip'
import type { CreateSession, CreateMessage } from '../../types/create'

interface Props { sessionId: string }

export default function CreateCanvas({ sessionId }: Props) {
  const [session, setSession] = useState<CreateSession & { files?: string[]; dirty?: boolean; pendingChanges?: string[] } | null>(null)
  const [streamingToken, setStreamingToken] = useState('')
  const [inspectFile, setInspectFile] = useState<string | null>(null)
  const [inspectContent, setInspectContent] = useState('')

  useEffect(() => {
    window.api.create.getSession(sessionId).then(s => setSession(s as any))
  }, [sessionId])

  useEffect(() => {
    const cb = (data: { sessionId: string; token: string }) => {
      if (data.sessionId === sessionId) setStreamingToken(t => t + data.token)
    }
    window.api.create.onStreamToken(cb)
    return () => window.api.create.offStreamToken(cb)
  }, [sessionId])

  async function handleFileClick(filePath: string) {
    if (!session?.localPath) return
    const content = await window.api.create.getFileContent(session.localPath, filePath)
    setInspectFile(filePath)
    setInspectContent(content)
  }

  function handleMessageSent(updatedHistory: CreateMessage[], changedFiles: string[]) {
    setStreamingToken('')
    setSession(prev => prev ? { ...prev, chatHistory: updatedHistory, files: [...(prev.files ?? []), ...changedFiles.filter(f => !(prev.files ?? []).includes(f))] } : prev)
  }

  function handleAddRepo(repoId: string) {
    if (!session) return
    const newIds = session.repoIds.includes(repoId) ? session.repoIds : [...session.repoIds, repoId]
    window.api.create.updateRepos(sessionId, newIds)
    setSession(prev => prev ? { ...prev, repoIds: newIds } : prev)
  }

  function handleRemoveRepo(repoId: string) {
    if (!session) return
    const newIds = session.repoIds.filter(id => id !== repoId)
    window.api.create.updateRepos(sessionId, newIds)
    setSession(prev => prev ? { ...prev, repoIds: newIds } : prev)
  }

  function handlePublished(url: string) {
    setSession(prev => prev ? { ...prev, publishStatus: 'published', githubRepoUrl: url, dirty: false, pendingChanges: [] } : prev)
  }

  function handlePushed() {
    setSession(prev => prev ? { ...prev, dirty: false, pendingChanges: [] } : prev)
  }

  if (!session) return <div className="create-canvas"><div style={{ padding: 40, color: 'var(--t4)' }}>Loading…</div></div>

  return (
    <div className="create-canvas">
      <CreateMetaBar
        session={session}
        onNameChange={name => { window.api.create.updateName(sessionId, name); setSession(prev => prev ? { ...prev, name } : prev) }}
        onRemoveRepo={handleRemoveRepo}
        onPublished={handlePublished}
        onPushed={handlePushed}
      />
      {session.publishStatus === 'published' && (session as any).pendingChanges?.length > 0 && (
        <div className="create-diff-strip">
          {((session as any).pendingChanges as string[]).map((f: string) => (
            <span key={f} className="create-diff-changed">~ {f}</span>
          ))}
        </div>
      )}
      <div className="create-panels">
        <RepoBrowser repoIds={session.repoIds} templateId={session.templateId} onAdd={handleAddRepo} onRemove={handleRemoveRepo} />
        <div className="create-preview-panel">
          <div className="create-preview-area">
            <PreviewAdapter session={session} />
            {inspectFile && (
              <div className="create-code-inspector">
                <div className="create-code-inspector-header">
                  <span className="create-code-inspector-title">{inspectFile}</span>
                  <button className="create-code-inspector-close" onClick={() => setInspectFile(null)}>✕</button>
                </div>
                <pre className="create-code-inspector-body">{inspectContent}</pre>
              </div>
            )}
          </div>
          <FileStrip files={session.files ?? []} onFileClick={handleFileClick} />
        </div>
        <AiChatPanel
          session={session}
          streamingToken={streamingToken}
          onMessageSent={handleMessageSent}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/create/CreateMetaBar.tsx`**

```tsx
// src/components/create/CreateMetaBar.tsx
import { useState } from 'react'
import type { CreateSession } from '../../types/create'

const TYPE_LABELS: Record<string, string> = { mcp: 'MCP Server', webapp: 'Web App', cli: 'CLI Tool', widget: 'Desktop', blank: 'Custom' }

interface Props {
  session: CreateSession & { dirty?: boolean; pendingChanges?: string[] }
  onNameChange: (name: string) => void
  onRemoveRepo: (repoId: string) => void
  onPublished: (url: string) => void
  onPushed: () => void
}

export default function CreateMetaBar({ session, onNameChange, onRemoveRepo, onPublished, onPushed }: Props) {
  const [publishing, setPublishing] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [repoName, setRepoName] = useState(session.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'))

  async function handlePublish() {
    setPublishing(true)
    try {
      const result = await window.api.create.publishToGitHub({
        sessionId: session.id,
        repoName,
        description: `Built with Git Suite Create`,
        isPrivate: false,
        localPath: session.localPath!,
      }) as { githubRepoUrl: string }
      onPublished(result.githubRepoUrl)
    } catch (e: any) {
      if (e.message === 'SCOPE_MISSING') {
        alert('GitHub permission needed. Please reconnect your GitHub account to grant repo creation access.')
        window.api.github.connect()
      }
    } finally {
      setPublishing(false)
    }
  }

  async function handlePush() {
    setPushing(true)
    try {
      await window.api.create.pushUpdate({ sessionId: session.id, localPath: session.localPath!, githubRepoUrl: session.githubRepoUrl! })
      onPushed()
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="create-meta-bar">
      <input
        className="create-meta-name"
        value={session.name}
        onChange={e => onNameChange(e.target.value)}
      />
      <span className="create-type-badge">{TYPE_LABELS[session.toolType] ?? session.toolType}</span>
      <div className="create-repo-chips">
        {session.repoIds.map(id => (
          <span key={id} className="create-repo-chip">
            {id.split('/')[1] ?? id}
            <button className="create-repo-chip-remove" onClick={() => onRemoveRepo(id)}>×</button>
          </span>
        ))}
      </div>
      <div className="create-meta-right">
        {session.publishStatus === 'draft' ? (
          <>
            <span className="create-draft-pill">● Draft</span>
            <button className="create-publish-btn" onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish ↗'}
            </button>
          </>
        ) : (
          <>
            <span className="create-published-pill">
              ✓ Published
              {(session as any).pendingChanges?.length > 0 && (
                <span className="create-changes-badge">{(session as any).pendingChanges.length} changes</span>
              )}
              <span className="create-published-link" onClick={() => window.api.openExternal(session.githubRepoUrl!)}>
                {session.githubRepoUrl?.replace('https://github.com/', '')} ↗
              </span>
            </span>
            <button className="create-push-btn" onClick={handlePush} disabled={pushing || !(session as any).dirty}>
              {pushing ? 'Pushing…' : 'Push Update ↑'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/create/RepoBrowser.tsx`**

```tsx
// src/components/create/RepoBrowser.tsx
import { useState, useEffect } from 'react'
import type { LibraryRow } from '../../types/repo'

interface Props {
  repoIds: string[]
  templateId: string
  onAdd: (repoId: string) => void
  onRemove: (repoId: string) => void
}

export default function RepoBrowser({ repoIds, templateId, onAdd, onRemove }: Props) {
  const [libraryRepos, setLibraryRepos] = useState<LibraryRow[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.api.library.getAll().then(setLibraryRepos)
  }, [])

  const filtered = libraryRepos.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.owner.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="create-repo-panel">
      <div className="create-repo-panel-section">
        <span className="create-repo-panel-label">Your Library</span>
        <input className="create-repo-search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="create-repo-list">
        {filtered.slice(0, 20).map(r => {
          const id = `${r.owner}/${r.name}`
          const added = repoIds.includes(id)
          return (
            <div
              key={id}
              className={`create-repo-item${added ? ' added' : ''}`}
              onClick={() => added ? onRemove(id) : onAdd(id)}
            >
              <div>
                <div className="create-repo-item-name">{r.name}</div>
                <div className="create-repo-item-meta">★ {r.stars?.toLocaleString()} · {r.language}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/create/AiChatPanel.tsx`**

```tsx
// src/components/create/AiChatPanel.tsx
import { useState, useEffect, useRef } from 'react'
import type { CreateSession, CreateMessage } from '../../types/create'

interface Props {
  session: CreateSession
  streamingToken: string
  onMessageSent: (history: CreateMessage[], changedFiles: string[]) => void
}

const TEMPLATE_NAMES: Record<string, string> = {
  'mcp-server': 'MCP Server Starter',
  '3d-web-app': '3D Interactive App',
  'cli-tool': 'CLI Tool',
  'desktop-widget': 'Desktop Widget',
  'data-dashboard': 'Data Dashboard',
  blank: 'Custom Tool',
}

export default function AiChatPanel({ session, streamingToken, onMessageSent }: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [localHistory, setLocalHistory] = useState<CreateMessage[]>(session.chatHistory)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [localHistory, streamingToken])

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    const msg = input.trim()
    setInput('')
    try {
      const result = await window.api.create.sendMessage({
        sessionId: session.id,
        userMessage: msg,
        templateName: TEMPLATE_NAMES[session.templateId] ?? session.templateId,
        toolType: session.toolType,
        repos: session.repoIds.map(id => ({ name: id.split('/')[1] ?? id, description: '', readmeExcerpt: '' })),
        history: localHistory,
      }) as { reply: string; changedFiles: string[] }
      const userMsg: CreateMessage = { role: 'user', content: msg, timestamp: Date.now() }
      const assistantMsg: CreateMessage = { role: 'assistant', content: result.reply, changedFiles: result.changedFiles, timestamp: Date.now() }
      const updated = [...localHistory, userMsg, assistantMsg]
      setLocalHistory(updated)
      onMessageSent(updated, result.changedFiles)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="create-chat-panel">
      <div className="create-chat-header">AI Builder</div>
      <div className="create-chat-messages">
        {localHistory.length === 0 && !sending && (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--t4)' }}>
            Type a message to start building your {TEMPLATE_NAMES[session.templateId] ?? 'tool'}.
          </div>
        )}
        {localHistory.map((m, i) => (
          <div key={i} className={`create-chat-msg ${m.role}`}>
            {m.content}
            {m.changedFiles && m.changedFiles.length > 0 && (
              <div className="create-chat-diff">
                {m.changedFiles.map(f => <div key={f} className="create-chat-diff-add">+ {f}</div>)}
              </div>
            )}
          </div>
        ))}
        {sending && streamingToken && (
          <div className="create-chat-msg assistant">{streamingToken}</div>
        )}
        {sending && !streamingToken && (
          <div className="create-chat-msg assistant" style={{ color: 'var(--t4)' }}>Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="create-chat-input">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Describe what you want…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          disabled={sending}
        />
        <button className="create-chat-send" onClick={handleSend} disabled={sending || !input.trim()}>
          {sending ? 'Building…' : 'Send →'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `src/components/create/FileStrip.tsx`**

```tsx
// src/components/create/FileStrip.tsx
interface Props {
  files: string[]
  onFileClick: (filePath: string) => void
}

export default function FileStrip({ files, onFileClick }: Props) {
  if (files.length === 0) return null
  return (
    <div className="create-file-strip">
      {files.slice(0, 12).map(f => (
        <button key={f} className="create-file-chip" onClick={() => onFileClick(f)}>{f}</button>
      ))}
      {files.length > 12 && <span className="create-file-count">+{files.length - 12} more</span>}
      <span className="create-file-count">{files.length} files</span>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/create/
git commit -m "feat(create): canvas shell, meta bar, repo browser, ai chat, file strip"
```

---

## Task 11: Preview Adapters

**Files:**
- Create: `src/components/create/preview/PreviewAdapter.tsx`
- Create: `src/components/create/preview/WebPreview.tsx`
- Create: `src/components/create/preview/McpInspector.tsx`
- Create: `src/components/create/preview/CliPreview.tsx`
- Create: `src/components/create/preview/WidgetPreview.tsx`

- [ ] **Step 1: `PreviewAdapter.tsx`**

```tsx
// src/components/create/preview/PreviewAdapter.tsx
import type { CreateSession } from '../../../types/create'
import WebPreview from './WebPreview'
import McpInspector from './McpInspector'
import CliPreview from './CliPreview'
import WidgetPreview from './WidgetPreview'

interface Props { session: CreateSession }

export default function PreviewAdapter({ session }: Props) {
  if (!session.localPath) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t4)', fontSize: 12 }}>Chat with the AI to start building</div>
  }
  if (session.toolType === 'webapp' || session.toolType === 'blank') return <WebPreview session={session} />
  if (session.toolType === 'mcp') return <McpInspector session={session} />
  if (session.toolType === 'cli') return <CliPreview session={session} />
  if (session.toolType === 'widget') return <WidgetPreview session={session} />
  return <WebPreview session={session} />
}
```

- [ ] **Step 2: `WebPreview.tsx`**

```tsx
// src/components/create/preview/WebPreview.tsx
import { useState, useEffect } from 'react'
import type { CreateSession } from '../../../types/create'

interface Props { session: CreateSession }

export default function WebPreview({ session }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'building' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!session.localPath) return
    setStatus('building')
    window.api.create.startWebPreview(session.id, session.localPath)
      .then((result: any) => { setUrl(result.url); setStatus('live') })
      .catch(() => setStatus('error'))
    return () => { window.api.create.stopPreview(session.id) }
  }, [session.id, session.localPath])

  const statusLabel = { idle: '', building: '● Building…', live: '● Live', error: '● Error' }[status]
  const statusClass = { idle: '', building: 'building', live: 'live', error: 'error' }[status]

  return (
    <>
      {url ? (
        <iframe
          src={url}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="preview"
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t4)', fontSize: 12 }}>
          {status === 'building' ? 'Starting preview…' : 'No index.html yet — keep chatting'}
        </div>
      )}
      <div className="create-preview-toolbar">
        <span className={`create-preview-status ${statusClass}`}>{statusLabel}</span>
        <button className="create-preview-action" onClick={() => { setStatus('building'); window.api.create.startWebPreview(session.id, session.localPath!).then((r: any) => { setUrl(r.url); setStatus('live') }) }}>↺ Rebuild</button>
        <button className="create-preview-action" onClick={() => window.api.create.openFolder(session.localPath!)}>⇱ Open</button>
      </div>
    </>
  )
}
```

- [ ] **Step 3: `McpInspector.tsx`**

```tsx
// src/components/create/preview/McpInspector.tsx
import { useState, useEffect } from 'react'
import type { CreateSession } from '../../../types/create'

interface McpTool { name: string; description: string; inputSchema?: unknown }

interface Props { session: CreateSession }

export default function McpInspector({ session }: Props) {
  const [tools, setTools] = useState<McpTool[]>([])
  const [selected, setSelected] = useState<McpTool | null>(null)
  const [inputJson, setInputJson] = useState('{}')
  const [result, setResult] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')

  useEffect(() => {
    if (!session.localPath) return
    window.api.create.spawnMcp(session.id, 'dist/index.js', session.localPath)
      .then(() => window.api.create.getMcpTools(session.id))
      .then((t: any) => { setTools(t); setStatus('running') })
      .catch(() => setStatus('error'))
  }, [session.id, session.localPath])

  async function handleCall() {
    if (!selected) return
    // Simple IPC call — MCP call-tool not fully wired in v1 (shows JSON placeholder)
    setResult(JSON.stringify({ status: 'called', tool: selected.name }, null, 2))
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 160, borderRight: '1px solid var(--border)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t4)', marginBottom: 4 }}>Registered Tools</div>
        {tools.map(t => (
          <button key={t.name} onClick={() => { setSelected(t); setResult(null) }}
            style={{ background: selected?.name === t.name ? 'var(--accent-dim)' : 'var(--surface-1)', border: '1px solid', borderColor: selected?.name === t.name ? 'var(--accent)' : 'var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: selected?.name === t.name ? 'var(--accent)' : 'var(--t2)', textAlign: 'left', cursor: 'pointer' }}>
            {t.name}
          </button>
        ))}
        {tools.length === 0 && <div style={{ fontSize: 11, color: 'var(--t4)' }}>{status === 'error' ? '● Error spawning' : 'Loading…'}</div>}
      </div>
      <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {selected ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>{selected.description}</div>
            <textarea value={inputJson} onChange={e => setInputJson(e.target.value)}
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, padding: 6, fontSize: 10, fontFamily: 'monospace', color: 'var(--t1)', height: 60, resize: 'none' }} />
            <button onClick={handleCall}
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', alignSelf: 'flex-start' }}>
              ▶ Call
            </button>
            {result && <pre style={{ background: 'var(--surface-1)', borderRadius: 4, padding: 8, fontSize: 10, fontFamily: 'monospace', color: '#6a9', margin: 0 }}>{result}</pre>}
          </>
        ) : (
          <div style={{ color: 'var(--t4)', fontSize: 12, marginTop: 20 }}>Select a tool to test it</div>
        )}
      </div>
      <div className="create-preview-toolbar">
        <span className={`create-preview-status ${status === 'running' ? 'live' : 'error'}`}>
          {status === 'running' ? '● Running' : '● Stopped'}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `CliPreview.tsx`**

```tsx
// src/components/create/preview/CliPreview.tsx
import type { CreateSession } from '../../../types/create'

interface Props { session: CreateSession }

export default function CliPreview({ session }: Props) {
  return (
    <div style={{ height: '100%', background: '#080810', padding: 16, fontFamily: 'monospace', fontSize: 11, color: '#6a9', overflow: 'auto' }}>
      <div style={{ color: '#445', marginBottom: 8 }}>CLI Preview — run your tool from the terminal to see output here.</div>
      <div style={{ color: '#556' }}>$ node dist/cli.js --help</div>
      <div style={{ color: '#445', marginTop: 4 }}>Open {session.localPath} in your terminal to test.</div>
      <div className="create-preview-toolbar">
        <button className="create-preview-action" onClick={() => window.api.create.openFolder(session.localPath!)}>⇱ Open Folder</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: `WidgetPreview.tsx`**

```tsx
// src/components/create/preview/WidgetPreview.tsx
import { useState } from 'react'
import type { CreateSession } from '../../../types/create'

interface Props { session: CreateSession }

export default function WidgetPreview({ session }: Props) {
  const [launched, setLaunched] = useState(false)

  async function launch() {
    await window.api.create.launchWidget(session.id, session.localPath!)
    setLaunched(true)
  }

  async function relaunch() {
    await window.api.create.relaunchWidget(session.id, session.localPath!)
  }

  async function detach() {
    await window.api.create.detachWidget(session.id)
    setLaunched(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--t3)' }}>
        {launched ? 'Widget is running as a floating window' : 'Launch the widget to preview it'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!launched ? (
          <button className="create-push-btn" onClick={launch}>▶ Launch Widget</button>
        ) : (
          <>
            <button className="create-publish-btn" onClick={relaunch}>↺ Relaunch</button>
            <button style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 12px', fontSize: 11, color: 'var(--t2)', cursor: 'pointer' }} onClick={detach}>⇱ Detach</button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/create/preview/
git commit -m "feat(create): preview adapters — web, mcp, cli, widget"
```

---

## Task 12: Manual Verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify template gallery**

Navigate to Create in the dock. Confirm:
- Template grid renders with 6 cards
- Filter tabs work (MCP Server, Web App, etc.)
- Search filters cards by name
- No Recent sessions strip on first load

- [ ] **Step 3: Verify session creation**

Click "MCP Server Starter". Confirm:
- Canvas opens with three panels
- Meta bar shows name + MCP Server badge
- Left panel shows library repos
- Right panel shows AI chat prompt
- `create_sessions` row exists in SQLite (check with DB browser or `electron/db.ts` logging)

- [ ] **Step 4: Verify AI chat + code generation**

Type "Build me a tool that reads files" in the chat. Confirm:
- Streaming tokens appear in the chat panel
- If AI produces `<files>` block, file strip appears at bottom
- Files land in userData/create-sessions/{id}/

- [ ] **Step 5: Verify web preview**

Click "3D Interactive App" template. Ask AI to generate a minimal HTML file. Confirm:
- Preview toolbar shows `● Live`
- iframe renders the generated index.html

- [ ] **Step 6: Verify Recent sessions strip**

Go back to Create landing. Confirm the session appears in the Recent strip.

- [ ] **Step 7: Run tests**

```bash
npm test
```
Expected: all existing tests pass + new createAiService and createGitService tests pass

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat(create): complete create section — gallery, canvas, ai chat, preview, publish"
```

---

## Notes for Implementer

- **`callbackWrappers` in preload:** The `create` block's `onStreamToken`/`offStreamToken` uses `callbackWrappers` — a `Map` that already exists at the top of `electron/preload.ts`. Verify it's there before adding the block; do not add a second declaration.
- **`create:callMcpTool`:** The spec lists this handler; v1 defers real MCP tool invocation — `McpInspector` shows a placeholder result. Add the stub handler alongside `create:getMcpTools` if TypeScript requires it to be registered. Real implementation (forwarding `tools/call` JSON-RPC to the MCP subprocess) is a v2 task.
- **`create:generateReadme`:** Listed in the spec IPC table; v1 defers this — the initial publish commit includes whatever README.md the AI generated during the session. Add a stub handler that resolves immediately to avoid "channel not found" errors.
- **`sendMessageStream` signature:** Check the actual signature in `electron/services/aiChatService.ts` before wiring Task 7. The current signature is `(messages, starredRepos, installedSkills, pageContext, callbacks)`. Pass `[]` for starredRepos/installedSkills and the system prompt string as `pageContext` — `aiChatService` injects it into the Claude prompt via its internal `buildSystemPrompt`.
- **`getGitHubUser()` shape:** Verify the return type in `electron/store.ts` — it returns `{ username, avatarUrl }`. The publish handler accesses `.username`; confirm this matches before shipping.
- **`window.api.create` type safety:** The `api` object in `preload.ts` is typed via ambient declaration in `electron.d.ts` or similar. Add `create` to the ambient type if the project has one; if not, cast `(window.api as any).create` in components.
- **`var(--surface-bg)`, `var(--accent-dim)`, `var(--accent)`:** Check `src/styles/globals.css` for the exact CSS variable names in use and adjust the Create CSS to match.
- **`sendMessageStream` signature:** The existing function in `aiChatService.ts` takes `(messages, starredRepos, installedSkills, pageContext, callbacks)`. For Create, pass `[]` for starredRepos/installedSkills and the system prompt as `pageContext` — this injects it into the Claude system prompt via the existing `buildSystemPrompt` in `aiChatService.ts`. Verify by inspecting that function before wiring.
- **CLI preview `node-pty`:** v1 uses the fallback output panel (no interactive terminal). If `node-pty` is added later, replace `CliPreview.tsx` with a PTY-backed terminal.
- **OAuth re-auth:** After updating the scope string in `github.ts`, users must reconnect GitHub to get the `repo` scope. The publish handler detects the 403 and calls `github.connect()` — test this path manually.
