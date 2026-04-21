// electron/db-helpers.ts
// Shared DB utilities used by both main.ts and IPC handlers.
import type Database from 'better-sqlite3'

/**
 * Cascade-update the repo primary key from a synthetic "owner/name" ID to the
 * real numeric GitHub ID.  Must be called INSIDE a transaction so all updates
 * are atomic.  Uses deferred FK checks because child rows must temporarily
 * reference the new id before the parent row is updated (or vice-versa).
 */
export function cascadeRepoId(db: Database.Database, owner: string, name: string, newId: string): void {
  const existing = db.prepare('SELECT id FROM repos WHERE owner = ? AND name = ?')
    .get(owner, name) as { id: string } | undefined
  if (!existing || existing.id === newId) return          // nothing to fix

  const oldId = existing.id
  db.pragma('defer_foreign_keys = ON')

  // If the target numeric id already belongs to a different row, merge FK refs and delete it
  const target = db.prepare('SELECT id FROM repos WHERE id = ?').get(newId) as { id: string } | undefined
  if (target) {
    // Move FK refs from the stale (owner/name) row onto the target row, then delete stale row
    db.prepare('UPDATE collection_repos SET repo_id = ? WHERE repo_id = ?').run(newId, oldId)
    db.prepare('UPDATE skills SET repo_id = ? WHERE repo_id = ?').run(newId, oldId)
    db.prepare('UPDATE sub_skills SET repo_id = ? WHERE repo_id = ?').run(newId, oldId)
    db.prepare('DELETE FROM repos WHERE id = ?').run(oldId)
  } else {
    // Target id is free — just rename
    db.prepare('UPDATE repos SET id = ? WHERE id = ?').run(newId, oldId)
    db.prepare('UPDATE collection_repos SET repo_id = ? WHERE repo_id = ?').run(newId, oldId)
    db.prepare('UPDATE skills SET repo_id = ? WHERE repo_id = ?').run(newId, oldId)
    db.prepare('UPDATE sub_skills SET repo_id = ? WHERE repo_id = ?').run(newId, oldId)
  }
}
