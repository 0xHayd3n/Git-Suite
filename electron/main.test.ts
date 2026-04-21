// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'

let db: Database.Database | undefined

beforeEach(() => {
  db = new Database(':memory:')
  initSchema(db)
})

afterEach(() => {
  if (db) db.close()
})

describe('versioned installs query', () => {
  it('returns version refs stripping the version: prefix, ignoring non-version sub_skills', () => {
    if (!db) throw new Error('db not initialized')
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
