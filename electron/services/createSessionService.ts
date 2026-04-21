import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import type Database from 'better-sqlite3'
import type { CreateSession, CreateSessionRow, CreateMessage } from '../../src/types/create'

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
