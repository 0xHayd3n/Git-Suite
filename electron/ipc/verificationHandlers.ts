// electron/ipc/verificationHandlers.ts
import { ipcMain, app } from 'electron'
import { prioritiseRepos } from '../services/verificationService'
import { getDb } from '../db'

export function registerVerificationHandlers(): void {
  // Move visible cards to front of queue
  ipcMain.handle('verification:prioritise', (_event, repoIds: string[]) => {
    prioritiseRepos(repoIds)
  })

  // Return cached score for a single repo (for initial load in RepoDetail)
  ipcMain.handle('verification:getScore', (_event, repoId: string) => {
    const db = getDb(app.getPath('userData'))
    const row = db.prepare(
      'SELECT verification_tier, verification_signals, verification_score FROM repos WHERE id = ?'
    ).get(repoId) as {
      verification_tier:    string | null
      verification_signals: string | null
      verification_score:   number | null
    } | undefined
    if (!row) return null
    return {
      tier:    row.verification_tier as 'verified' | 'likely' | null,
      signals: row.verification_signals ? JSON.parse(row.verification_signals) as string[] : [],
      score:   row.verification_score,
    }
  })

  // Return cached scores for multiple repos at once (for seeding hook cache).
  // Returns ALL repos that have been checked (verification_checked_at IS NOT NULL),
  // including those that scored below threshold (tier = null).  This prevents
  // the frontend from treating already-checked "none" repos as unresolved and
  // re-queuing them on every visit.
  ipcMain.handle('verification:getBatchScores', (_event, repoIds: string[]) => {
    if (!repoIds.length) return {}
    const db = getDb(app.getPath('userData'))
    const placeholders = repoIds.map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT id, verification_tier, verification_signals FROM repos WHERE id IN (${placeholders}) AND verification_checked_at IS NOT NULL`
    ).all(...repoIds) as {
      id: string
      verification_tier: string | null
      verification_signals: string | null
    }[]
    const result: Record<string, { tier: string | null; signals: string[] }> = {}
    for (const row of rows) {
      result[row.id] = {
        tier: row.verification_tier,
        signals: row.verification_signals ? JSON.parse(row.verification_signals) : [],
      }
    }
    return result
  })

  // Note: new-install enqueuing is done server-side in the github:saveRepo handler (main.ts)
  // directly calling enqueueRepo — no renderer-facing enqueue IPC needed.
}
