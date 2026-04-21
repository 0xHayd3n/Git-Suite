# Phase 6: Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional Collections view that groups related skills into named bundles, with Mine/Community grouping, per-skill saved/missing status, inline install, new collection modal, active toggle, and populated RepoDetail Collections tab.

**Architecture:** Backend adds collection IPC handlers (getAll, getDetail, create, delete, toggle) plus an idempotent community seed function that inserts stub repo rows using `"owner/name"` as their id to avoid FK breakage when later discovered via GitHub. Frontend implements a two-column split Collections view (list + detail panel) with an overlay modal for creation, reusing existing CSS variable tokens and the BannerSVG component. RepoDetail's Collections tab renders navigable pill buttons using `useNavigate`.

**Tech Stack:** Electron + React 18 + React Router 6 + better-sqlite3 + plain CSS (JetBrains Mono)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/types/repo.ts` | Modify | Add `CollectionRow` and `CollectionRepoRow` interfaces |
| `electron/main.ts` | Modify | Fix upsert `id` preservation, add `seedCommunityCollections`, add 5 collection IPC handlers, update `library:getCollections` return type |
| `electron/collections.test.ts` | Create | Unit tests for seed logic and query helpers |
| `electron/preload.ts` | Modify | Expose `collection` API namespace to renderer |
| `src/env.d.ts` | Modify | Update `library.getCollections` type + add `collection` namespace |
| `src/styles/globals.css` | Modify | Append all collection-specific CSS classes |
| `src/views/Collections.tsx` | Replace | Full two-column collections view with modal |
| `src/views/Collections.test.tsx` | Create | Basic render tests |
| `src/views/RepoDetail.tsx` | Modify | Populate Collections tab with navigable pills |

---

### Task 1: Add TypeScript types for collections

**Files:**
- Modify: `src/types/repo.ts`

- [ ] **Step 1: Add `CollectionRow` and `CollectionRepoRow` to the bottom of `src/types/repo.ts`**

```typescript
export interface CollectionRow {
  id: string
  name: string
  description: string | null
  owner: string          // 'user' = mine; anything else = community owner handle
  active: number         // 0 | 1
  created_at: string | null
  color_start: string | null
  color_end: string | null
  repo_count: number     // total repos in this collection (from COUNT join)
  saved_count: number    // repos that have an installed skill (from SUM join)
}

export interface CollectionRepoRow {
  owner: string
  name: string
  language: string | null
  version: string | null         // from skills.version — null if not installed
  content_size: number | null    // length(skills.content) in bytes — null if not installed
  saved: number                  // 1 if skill installed, 0 if missing
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/repo.ts
git commit -m "feat(types): add CollectionRow and CollectionRepoRow"
```

---

### Task 2: Backend — fix upsert id preservation + community seed

**Files:**
- Modify: `electron/main.ts`
- Create: `electron/collections.test.ts`

**Why fix upserts:** All three GitHub upsert handlers currently include `id = excluded.id` in their `ON CONFLICT(owner, name) DO UPDATE SET` clauses. When community repos are seeded with a synthetic id (`"owner/name"`), a later GitHub upsert would overwrite that id, breaking the `collection_repos` FK reference. Removing `id = excluded.id` is safe because the UNIQUE INDEX on `(owner, name)` is the real deduplication key; the id just needs to be stable.

- [ ] **Step 1: Write tests for the seed function**

Create `electron/collections.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'
import { seedCommunityCollections, COMMUNITY_COLLECTIONS, getCollectionAll, getCollectionDetail } from './main'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  initSchema(db)
})

afterEach(() => {
  db.close()
})

describe('seedCommunityCollections', () => {
  it('inserts all community collections', () => {
    seedCommunityCollections(db)
    const rows = db.prepare('SELECT * FROM collections').all() as any[]
    expect(rows).toHaveLength(COMMUNITY_COLLECTIONS.length)
  })

  it('is idempotent — no duplicates on second call', () => {
    seedCommunityCollections(db)
    seedCommunityCollections(db)
    const rows = db.prepare('SELECT * FROM collections').all() as any[]
    expect(rows).toHaveLength(COMMUNITY_COLLECTIONS.length)
  })

  it('creates a stub repo row for each community repo slug', () => {
    seedCommunityCollections(db)
    const coll = COMMUNITY_COLLECTIONS[0]
    for (const slug of coll.repos) {
      const [owner, name] = slug.split('/')
      const row = db.prepare('SELECT * FROM repos WHERE owner = ? AND name = ?').get(owner, name)
      expect(row).not.toBeNull()
    }
  })

  it('links stub repos in collection_repos', () => {
    seedCommunityCollections(db)
    const coll = COMMUNITY_COLLECTIONS[0]
    const links = db.prepare('SELECT * FROM collection_repos WHERE collection_id = ?').all(coll.id) as any[]
    expect(links).toHaveLength(coll.repos.length)
  })
})

describe('getCollectionAll', () => {
  it('returns collections with repo_count and saved_count', () => {
    seedCommunityCollections(db)
    const rows = getCollectionAll(db) as any[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('repo_count')
    expect(rows[0]).toHaveProperty('saved_count')
    expect(rows[0].saved_count).toBe(0)  // no skills in memory db
  })
})

describe('getCollectionDetail', () => {
  it('returns repo rows with saved=0 when no skills installed', () => {
    seedCommunityCollections(db)
    const id = COMMUNITY_COLLECTIONS[0].id
    const repos = getCollectionDetail(db, id) as any[]
    expect(repos).toHaveLength(COMMUNITY_COLLECTIONS[0].repos.length)
    expect(repos[0].saved).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run electron/collections.test.ts
```

Expected: FAIL — `seedCommunityCollections`, `COMMUNITY_COLLECTIONS`, `getCollectionAll`, `getCollectionDetail` not yet exported from `./main`

- [ ] **Step 3: Remove `id = excluded.id` from all three GitHub upsert handlers**

In `electron/main.ts`:

**github:getStarred** (around line 143) — remove this line from the ON CONFLICT SET clause:
```
id          = excluded.id,
```

**github:searchRepos** (around line 210) — remove this line from the ON CONFLICT SET clause:
```
id          = excluded.id,
```

**github:getRepo** (around line 257) — remove this line from the ON CONFLICT SET clause:
```
id             = excluded.id,
```

Leave all other `SET` lines unchanged in each handler.

- [ ] **Step 4: Add `COMMUNITY_COLLECTIONS`, `seedCommunityCollections`, `getCollectionAll`, `getCollectionDetail`, and `getCollectionColors` to `electron/main.ts`**

Add after the imports (before the `WindowStoreSchema` interface), as exported symbols so the test can import them:

```typescript
// ── Community collections seed data ─────────────────────────────
export const COMMUNITY_COLLECTIONS = [
  {
    id: 'community-python-api',
    name: 'Python API Stack',
    description: 'Full production Python API setup — FastAPI, Pydantic, SQLAlchemy, Alembic, HTTPX.',
    owner: 'git-suite',
    repos: ['tiangolo/fastapi', 'pydantic/pydantic', 'sqlalchemy/sqlalchemy', 'sqlalchemy/alembic', 'encode/httpx'],
    color_start: '#3b82f6', color_end: '#6366f1',
  },
  {
    id: 'community-tui-toolkit',
    name: 'TUI Toolkit',
    description: 'Everything for terminal UIs in Go using the Charm ecosystem.',
    owner: 'charmbracelet-fan',
    repos: ['charmbracelet/bubbletea', 'charmbracelet/lipgloss', 'charmbracelet/bubbles', 'muesli/termenv'],
    color_start: '#4ade80', color_end: '#16a34a',
  },
  {
    id: 'community-react-ui',
    name: 'React UI Essentials',
    description: 'The standard React UI toolkit — components, animation, forms, validation, data fetching.',
    owner: 'frontend-collective',
    repos: ['shadcn-ui/ui', 'radix-ui/primitives', 'framer/motion', 'react-hook-form/react-hook-form', 'colinhacks/zod', 'TanStack/query'],
    color_start: '#facc15', color_end: '#f59e0b',
  },
] as const

export function seedCommunityCollections(db: Database.Database): void {
  // Idempotency: only seed if no community collections exist yet
  const existing = db.prepare("SELECT id FROM collections WHERE owner != 'user'").get()
  if (existing) return

  const now = new Date().toISOString()

  const insertColl = db.prepare(`
    INSERT OR IGNORE INTO collections (id, name, description, owner, active, created_at, color_start, color_end)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `)
  const insertStubRepo = db.prepare(`
    INSERT OR IGNORE INTO repos (id, owner, name, description, language, topics, stars, forks,
                                  license, homepage, updated_at, saved_at, type, banner_svg)
    VALUES (?, ?, ?, NULL, NULL, '[]', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  `)
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO collection_repos (collection_id, repo_id) VALUES (?, ?)
  `)

  db.transaction(() => {
    for (const coll of COMMUNITY_COLLECTIONS) {
      insertColl.run(coll.id, coll.name, coll.description, coll.owner, now, coll.color_start, coll.color_end)
      for (const slug of coll.repos) {
        const [owner, name] = slug.split('/')
        const stubId = `${owner}/${name}`
        insertStubRepo.run(stubId, owner, name)
        insertLink.run(coll.id, stubId)
      }
    }
  })()
}

export function getCollectionAll(db: Database.Database): unknown[] {
  return db.prepare(`
    SELECT c.*,
      COUNT(cr.repo_id) as repo_count,
      SUM(CASE WHEN s.repo_id IS NOT NULL THEN 1 ELSE 0 END) as saved_count
    FROM collections c
    LEFT JOIN collection_repos cr ON cr.collection_id = c.id
    LEFT JOIN skills s ON s.repo_id = cr.repo_id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all()
}

export function getCollectionDetail(db: Database.Database, id: string): unknown[] {
  return db.prepare(`
    SELECT r.owner, r.name, r.language,
      s.version,
      CAST(length(s.content) AS INTEGER) as content_size,
      CASE WHEN s.repo_id IS NOT NULL THEN 1 ELSE 0 END as saved
    FROM collection_repos cr
    JOIN repos r ON r.id = cr.repo_id
    LEFT JOIN skills s ON s.repo_id = r.id
    WHERE cr.collection_id = ?
  `).all(id)
}

function getCollectionColors(language: string | null): { color_start: string; color_end: string } {
  switch (language?.toLowerCase()) {
    case 'typescript':
    case 'javascript': return { color_start: '#a78bfa', color_end: '#7c3aed' }
    case 'go':         return { color_start: '#4ade80', color_end: '#16a34a' }
    case 'python':     return { color_start: '#3b82f6', color_end: '#6366f1' }
    case 'rust':       return { color_start: '#f87171', color_end: '#dc2626' }
    default:           return { color_start: '#34d399', color_end: '#0d9488' }
  }
}
```

- [ ] **Step 5: Update `app.whenReady()` to call seed**

In `electron/main.ts`, update the `app.whenReady()` block:

```typescript
// BEFORE:
app.whenReady().then(() => {
  getDb(app.getPath('userData'))
  createWindow()
})

// AFTER:
app.whenReady().then(() => {
  const db = getDb(app.getPath('userData'))
  seedCommunityCollections(db)
  createWindow()
})
```

- [ ] **Step 6: Add the 5 collection IPC handlers to `electron/main.ts`**

Add after the existing `library:getCollections` handler (around line 441):

```typescript
// ── Collection IPC ───────────────────────────────────────────────
ipcMain.handle('collection:getAll', async () => {
  const db = getDb(app.getPath('userData'))
  return getCollectionAll(db)
})

ipcMain.handle('collection:getDetail', async (_, id: string) => {
  const db = getDb(app.getPath('userData'))
  return getCollectionDetail(db, id)
})

ipcMain.handle('collection:create', async (_, name: string, description: string, repoIds: string[]) => {
  const db = getDb(app.getPath('userData'))
  const id = `user-${Date.now()}`
  const now = new Date().toISOString()

  // Pick colors from most common language among selected repos
  const langs = repoIds.length > 0
    ? (db.prepare(`SELECT language FROM repos WHERE id IN (${repoIds.map(() => '?').join(',')})`)
        .all(...repoIds) as { language: string | null }[]).map(r => r.language)
    : []
  const langCounts: Record<string, number> = {}
  for (const l of langs) if (l) langCounts[l] = (langCounts[l] ?? 0) + 1
  const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const { color_start, color_end } = getCollectionColors(topLang)

  const insertLink = db.prepare('INSERT OR IGNORE INTO collection_repos (collection_id, repo_id) VALUES (?, ?)')
  db.transaction(() => {
    db.prepare(`
      INSERT INTO collections (id, name, description, owner, active, created_at, color_start, color_end)
      VALUES (?, ?, ?, 'user', 1, ?, ?, ?)
    `).run(id, name, description || null, now, color_start, color_end)
    for (const repoId of repoIds) {
      insertLink.run(id, repoId)
    }
  })()

  return id
})

ipcMain.handle('collection:delete', async (_, id: string) => {
  const db = getDb(app.getPath('userData'))
  db.transaction(() => {
    db.prepare('DELETE FROM collection_repos WHERE collection_id = ?').run(id)
    db.prepare('DELETE FROM collections WHERE id = ?').run(id)
  })()
})

ipcMain.handle('collection:toggle', async (_, id: string, active: number) => {
  const db = getDb(app.getPath('userData'))
  db.prepare('UPDATE collections SET active = ? WHERE id = ?').run(active, id)
})
```

- [ ] **Step 7: Update `library:getCollections` to return `{ id, name }[]`**

Find the existing handler (around line 433):

```typescript
// BEFORE:
ipcMain.handle('library:getCollections', async (_, repoId: string) => {
  const db = getDb(app.getPath('userData'))
  const rows = db.prepare(`
    SELECT c.name FROM collections c
    JOIN collection_repos cr ON cr.collection_id = c.id
    WHERE cr.repo_id = ?
  `).all(repoId) as { name: string }[]
  return rows.map((r) => r.name)
})

// AFTER:
ipcMain.handle('library:getCollections', async (_, repoId: string) => {
  const db = getDb(app.getPath('userData'))
  return db.prepare(`
    SELECT c.id, c.name FROM collections c
    JOIN collection_repos cr ON cr.collection_id = c.id
    WHERE cr.repo_id = ?
  `).all(repoId) as { id: string; name: string }[]
})
```

- [ ] **Step 8: Run tests**

```bash
npx vitest run electron/collections.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 9: Commit**

```bash
git add electron/main.ts electron/collections.test.ts
git commit -m "feat(backend): community seed, collection IPC handlers, fix upsert id preservation"
```

---

### Task 3: Preload and TypeScript declarations

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add `collection` namespace to preload**

In `electron/preload.ts`, inside the `contextBridge.exposeInMainWorld('api', { ... })` object, add after the `library` block:

```typescript
collection: {
  getAll:    () => ipcRenderer.invoke('collection:getAll'),
  getDetail: (id: string) => ipcRenderer.invoke('collection:getDetail', id),
  create:    (name: string, description: string, repoIds: string[]) =>
    ipcRenderer.invoke('collection:create', name, description, repoIds),
  delete:    (id: string) => ipcRenderer.invoke('collection:delete', id),
  toggle:    (id: string, active: number) => ipcRenderer.invoke('collection:toggle', id, active),
},
```

- [ ] **Step 2: Update `src/env.d.ts`**

**2a.** Update the import at the top to include the new types:

```typescript
// BEFORE:
import type { RepoRow, ReleaseRow, SkillRow, LibraryRow } from './types/repo'

// AFTER:
import type { RepoRow, ReleaseRow, SkillRow, LibraryRow, CollectionRow, CollectionRepoRow } from './types/repo'
```

**2b.** Update `library.getCollections` return type:

```typescript
// BEFORE:
getCollections(repoId: string): Promise<string[]>

// AFTER:
getCollections(repoId: string): Promise<{ id: string; name: string }[]>
```

**2c.** Add `collection` namespace after the `library` block:

```typescript
collection: {
  getAll(): Promise<CollectionRow[]>
  getDetail(id: string): Promise<CollectionRepoRow[]>
  create(name: string, description: string, repoIds: string[]): Promise<string>
  delete(id: string): Promise<void>
  toggle(id: string, active: number): Promise<void>
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/env.d.ts
git commit -m "feat(ipc): expose collection API to renderer, update getCollections return type"
```

---

### Task 4: CSS — all collection styles

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Append collection CSS to the bottom of `src/styles/globals.css`**

```css
/* ── Collections ─────────────────────────────────────────────────── */

.collections-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.collections-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.collections-search {
  flex: 1;
  background: var(--bg4);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 6px 10px;
  font-size: 11px;
  font-family: inherit;
  color: var(--t1);
  outline: none;
}
.collections-search::placeholder { color: var(--t3); }
.collections-search:focus { border-color: var(--border2); }

.coll-new-btn {
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 5px;
  padding: 7px 13px;
  font-size: 11px;
  font-family: inherit;
  color: #a78bfa;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}
.coll-new-btn:hover { background: rgba(124,58,237,0.18); }

.collections-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── List column ────────────────────────────────────────────────── */

.collections-list {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 8px 0;
}

.coll-section-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--t3);
  padding: 8px 12px 4px;
}

.coll-row {
  margin: 2px 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  cursor: pointer;
  overflow: hidden;
}
.coll-row:hover { background: var(--bg3); }
.coll-row.selected { background: var(--bg3); border-color: var(--border2); }

.coll-strip {
  height: 4px;
  width: 100%;
}

.coll-row-inner { padding: 8px 10px; }

.coll-row-top {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 4px;
}

.coll-emoji-badge {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.coll-row-name {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  color: var(--t1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coll-row-meta {
  font-size: 10px;
  color: var(--t3);
  margin-bottom: 6px;
}
.coll-row-meta.has-missing { color: #fbbf24; }

.coll-row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.coll-tag {
  font-size: 9px;
  background: var(--bg4);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 5px;
  color: var(--t3);
}

/* ── Detail panel ───────────────────────────────────────────────── */

.collections-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.coll-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 12px;
  color: var(--t3);
}

.coll-detail-banner {
  height: 80px;
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
}

.coll-banner-name {
  position: absolute;
  bottom: 8px;
  left: 14px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}

.coll-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.coll-meta-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.coll-meta-creator { font-size: 11px; color: var(--t2); }

.coll-mine-pill {
  font-size: 9px;
  background: var(--accent-soft);
  color: #a78bfa;
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  padding: 2px 7px;
}

.coll-community-pill {
  font-size: 9px;
  background: rgba(52,211,153,0.08);
  color: #34d399;
  border: 1px solid rgba(52,211,153,0.18);
  border-radius: 10px;
  padding: 2px 7px;
}

.coll-meta-count { font-size: 11px; color: var(--t3); }
.coll-meta-count.has-missing { color: #fbbf24; }

.coll-meta-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.coll-active-label { font-size: 11px; color: var(--t2); }

/* ── Tabs ────────────────────────────────────────────────────────── */

.coll-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
  flex-shrink: 0;
}

.coll-tab {
  font-size: 11px;
  color: var(--t3);
  padding: 9px 10px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: none;
  border-left: none;
  border-right: none;
  border-top: none;
  font-family: inherit;
}
.coll-tab:hover { color: var(--t2); }
.coll-tab.active { color: var(--t1); border-bottom-color: var(--accent); }

/* ── Skills tab ─────────────────────────────────────────────────── */

.coll-tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.coll-description {
  font-size: 11px;
  color: var(--t2);
  line-height: 1.65;
  margin-bottom: 14px;
}

.coll-section-label-detail {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--t3);
  margin-bottom: 8px;
}

.coll-skills-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coll-skill-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px 12px;
}

.coll-skill-row.missing {
  border-color: rgba(251,191,36,0.2);
  background: rgba(251,191,36,0.03);
}

.coll-skill-lang {
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
}

.coll-skill-info { flex: 1; min-width: 0; }

.coll-skill-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--t1);
}

.coll-skill-meta {
  font-size: 10px;
  color: var(--t3);
  margin-top: 1px;
}

.coll-skill-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.coll-skill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.coll-skill-dot.saved { background: #34d399; }
.coll-skill-dot.missing { background: var(--t3); }

.coll-skill-status-text { font-size: 10px; }
.coll-skill-status-text.saved { color: #34d399; }
.coll-skill-status-text.missing { color: var(--t3); }

.coll-save-btn {
  font-size: 9px;
  font-family: inherit;
  background: transparent;
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  padding: 3px 7px;
  color: #a78bfa;
  cursor: pointer;
}
.coll-save-btn:hover { background: var(--accent-soft); }
.coll-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Footer ─────────────────────────────────────────────────────── */

.coll-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg2);
}

.coll-footer-status { font-size: 10px; color: var(--t3); }
.coll-footer-status.has-missing { color: #fbbf24; }

.coll-footer-actions { display: flex; gap: 8px; }

.coll-edit-btn {
  font-size: 10px;
  font-family: inherit;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  padding: 5px 10px;
  color: #a78bfa;
  cursor: pointer;
}
.coll-edit-btn:hover { background: rgba(124,58,237,0.18); }

.coll-save-all-btn {
  font-size: 10px;
  font-family: inherit;
  background: rgba(52,211,153,0.08);
  border: 1px solid rgba(52,211,153,0.2);
  border-radius: 4px;
  padding: 5px 10px;
  color: #34d399;
  cursor: pointer;
}
.coll-save-all-btn:hover { background: rgba(52,211,153,0.14); }

/* ── Details tab ────────────────────────────────────────────────── */

.coll-kv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.coll-kv-row { display: flex; gap: 12px; }

.coll-kv-key {
  font-size: 10px;
  color: var(--t3);
  width: 100px;
  flex-shrink: 0;
}

.coll-kv-val { font-size: 10px; color: var(--t1); }

.coll-delete-btn {
  font-size: 10px;
  font-family: inherit;
  background: transparent;
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 4px;
  padding: 6px 12px;
  color: #f87171;
  cursor: pointer;
  margin-top: 12px;
}
.coll-delete-btn:hover { background: rgba(239,68,68,0.06); }

/* ── New collection modal ────────────────────────────────────────── */

.coll-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.coll-modal {
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 8px;
  padding: 24px;
  width: 440px;
  max-width: calc(100vw - 40px);
}

.coll-modal-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 16px;
}

.coll-modal-label {
  font-size: 10px;
  color: var(--t3);
  margin-bottom: 5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.coll-modal-input {
  width: 100%;
  background: var(--bg4);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 7px 10px;
  font-size: 11px;
  font-family: inherit;
  color: var(--t1);
  outline: none;
  margin-bottom: 12px;
  box-sizing: border-box;
}
.coll-modal-input:focus { border-color: var(--border2); }

.coll-modal-textarea {
  width: 100%;
  background: var(--bg4);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 7px 10px;
  font-size: 11px;
  font-family: inherit;
  color: var(--t1);
  outline: none;
  resize: none;
  margin-bottom: 12px;
  box-sizing: border-box;
}
.coll-modal-textarea:focus { border-color: var(--border2); }

.coll-modal-repo-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 5px;
  margin-bottom: 16px;
}

.coll-modal-repo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.coll-modal-repo-row:last-child { border-bottom: none; }
.coll-modal-repo-row:hover { background: var(--bg4); }
.coll-modal-repo-row.checked { background: rgba(124,58,237,0.06); }

.coll-modal-repo-name { flex: 1; font-size: 11px; color: var(--t1); }

.coll-modal-repo-check {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--border2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.coll-modal-repo-check.checked {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-size: 9px;
}

.coll-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.coll-modal-cancel {
  font-size: 11px;
  font-family: inherit;
  background: transparent;
  border: 1px solid var(--border2);
  border-radius: 5px;
  padding: 7px 14px;
  color: var(--t2);
  cursor: pointer;
}
.coll-modal-cancel:hover { background: var(--bg4); }

.coll-modal-create {
  font-size: 11px;
  font-family: inherit;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 5px;
  padding: 7px 14px;
  color: #fff;
  cursor: pointer;
}
.coll-modal-create:hover { background: #6d28d9; }
.coll-modal-create:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(css): add collection view styles"
```

---

### Task 5: Implement Collections.tsx

**Files:**
- Replace: `src/views/Collections.tsx`
- Create: `src/views/Collections.test.tsx`

- [ ] **Step 1: Write render tests**

Create `src/views/Collections.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Collections from './Collections'

const mockCollections = [
  {
    id: 'user-1', name: 'My Stack', description: 'Tools I use',
    owner: 'user', active: 1, created_at: '2026-01-01T00:00:00.000Z',
    color_start: '#3b82f6', color_end: '#6366f1',
    repo_count: 2, saved_count: 2,
  },
  {
    id: 'community-python-api', name: 'Python API Stack',
    description: 'FastAPI and friends', owner: 'git-suite',
    active: 1, created_at: '2026-01-01T00:00:00.000Z',
    color_start: '#3b82f6', color_end: '#6366f1',
    repo_count: 5, saved_count: 2,
  },
]

beforeEach(() => {
  vi.stubGlobal('api', {
    collection: {
      getAll: vi.fn().mockResolvedValue(mockCollections),
      getDetail: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue('new-id'),
      delete: vi.fn().mockResolvedValue(undefined),
      toggle: vi.fn().mockResolvedValue(undefined),
    },
    library: { getAll: vi.fn().mockResolvedValue([]) },
    settings: { getApiKey: vi.fn().mockResolvedValue('key') },
    skill: { generate: vi.fn().mockResolvedValue({ content: '', version: 'v1', generated_at: '' }) },
    github: { saveRepo: vi.fn().mockResolvedValue(undefined) },
  })
})

describe('Collections', () => {
  it('renders the topbar with new collection button', async () => {
    render(<MemoryRouter><Collections /></MemoryRouter>)
    expect(await screen.findByText('+ New collection')).toBeInTheDocument()
  })

  it('renders Mine and Community section labels', async () => {
    render(<MemoryRouter><Collections /></MemoryRouter>)
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(await screen.findByText('Community')).toBeInTheDocument()
  })

  it('renders collection names', async () => {
    render(<MemoryRouter><Collections /></MemoryRouter>)
    expect(await screen.findByText('My Stack')).toBeInTheDocument()
    expect(await screen.findByText('Python API Stack')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/views/Collections.test.tsx
```

Expected: FAIL (stub renders "Collections — coming in Phase 6")

- [ ] **Step 3: Replace `src/views/Collections.tsx` with full implementation**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { CollectionRow, CollectionRepoRow, LibraryRow } from '../types/repo'
import BannerSVG from '../components/BannerSVG'

// ── Language badge ─────────────────────────────────────────────
const LANG_ABBR: Record<string, string> = {
  Python: 'Py', TypeScript: 'Ts', JavaScript: 'Js',
  Rust: 'Rs', Go: 'Go', 'C++': 'C+', C: 'C',
}
const LANG_BG: Record<string, string> = {
  Python: 'rgba(14,155,191,0.15)', TypeScript: 'rgba(167,139,250,0.15)',
  JavaScript: 'rgba(250,204,21,0.15)', Rust: 'rgba(248,113,113,0.15)',
  Go: 'rgba(74,222,128,0.15)',
}
const LANG_TEXT: Record<string, string> = {
  Python: '#0e9bbf', TypeScript: '#a78bfa',
  JavaScript: '#facc15', Rust: '#f87171', Go: '#4ade80',
}

function LangBadge({ lang, size = 24 }: { lang: string | null; size?: number }) {
  const abbr = lang ? (LANG_ABBR[lang] ?? lang.slice(0, 2)) : '??'
  return (
    <div
      className="coll-skill-lang"
      style={{
        width: size, height: size,
        background: lang ? (LANG_BG[lang] ?? 'rgba(100,100,100,0.15)') : 'rgba(100,100,100,0.15)',
        color: lang ? (LANG_TEXT[lang] ?? 'var(--t3)') : 'var(--t3)',
      }}
    >
      {abbr}
    </div>
  )
}

// ── Toggle (reuses lib-toggle CSS from Library) ────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      className={`lib-toggle${on ? ' on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
    />
  )
}

// ── Collection list row ────────────────────────────────────────
function CollRow({
  coll,
  selected,
  onClick,
  onToggle,
}: {
  coll: CollectionRow
  selected: boolean
  onClick: () => void
  onToggle: () => void
}) {
  const missing = coll.repo_count - coll.saved_count
  const metaText = missing > 0
    ? `${coll.repo_count} skills · ${missing} missing`
    : `${coll.repo_count} skills · all saved`

  const emojis = ['📦', '🔧', '⚡', '🚀', '🌐', '🎨', '🔬', '🛡️', '🌿', '🎯']
  const hash = coll.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const emoji = emojis[hash % emojis.length]
  const badgeBg = coll.color_start ? `${coll.color_start}22` : 'rgba(100,100,100,0.15)'

  return (
    <div className={`coll-row${selected ? ' selected' : ''}`} onClick={onClick}>
      <div
        className="coll-strip"
        style={{
          background: `linear-gradient(to right, ${coll.color_start ?? '#444'}, ${coll.color_end ?? '#666'})`,
        }}
      />
      <div className="coll-row-inner">
        <div className="coll-row-top">
          <div className="coll-emoji-badge" style={{ background: badgeBg }}>{emoji}</div>
          <span className="coll-row-name">{coll.name}</span>
          <Toggle on={coll.active === 1} onToggle={onToggle} />
        </div>
        <div className={`coll-row-meta${missing > 0 ? ' has-missing' : ''}`}>{metaText}</div>
        {coll.owner !== 'user' && (
          <div className="coll-row-tags">
            <span className="coll-tag">{coll.owner}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── New collection modal ───────────────────────────────────────
function NewCollectionModal({
  libraryRows,
  onClose,
  onCreate,
}: {
  libraryRows: LibraryRow[]
  onClose: () => void
  onCreate: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [repoSearch, setRepoSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const filtered = libraryRows.filter(r =>
    `${r.owner}/${r.name}`.toLowerCase().includes(repoSearch.toLowerCase())
  )

  function toggleRepo(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    try {
      const id = await window.api.collection.create(name.trim(), desc.trim(), [...selected])
      onCreate(id)
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="coll-modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="coll-modal">
        <div className="coll-modal-title">New collection</div>

        <div className="coll-modal-label">Name</div>
        <input
          className="coll-modal-input"
          placeholder="e.g. My API Stack"
          maxLength={40}
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <div className="coll-modal-label">Description</div>
        <textarea
          className="coll-modal-textarea"
          placeholder="Optional"
          rows={3}
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />

        <div className="coll-modal-label">Add skills from your library</div>
        <input
          className="coll-modal-input"
          placeholder="Search installed repos…"
          value={repoSearch}
          onChange={e => setRepoSearch(e.target.value)}
        />

        <div className="coll-modal-repo-list">
          {filtered.length === 0 && (
            <div style={{ padding: '12px', fontSize: 11, color: 'var(--t3)' }}>
              No installed repos found
            </div>
          )}
          {filtered.map(r => (
            <div
              key={r.id}
              className={`coll-modal-repo-row${selected.has(r.id) ? ' checked' : ''}`}
              onClick={() => toggleRepo(r.id)}
            >
              <LangBadge lang={r.language} size={18} />
              <span className="coll-modal-repo-name">{r.owner}/{r.name}</span>
              <div className={`coll-modal-repo-check${selected.has(r.id) ? ' checked' : ''}`}>
                {selected.has(r.id) && '✓'}
              </div>
            </div>
          ))}
        </div>

        <div className="coll-modal-actions">
          <button className="coll-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            className="coll-modal-create"
            disabled={!name.trim() || creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating…' : 'Create collection'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────────────
function CollDetail({
  coll,
  repos,
  onToggle,
  onDelete,
  onInstall,
  onInstallAll,
  installing,
}: {
  coll: CollectionRow
  repos: CollectionRepoRow[]
  onToggle: () => void
  onDelete: () => void
  onInstall: (owner: string, name: string) => void
  onInstallAll: () => void
  installing: Set<string>
}) {
  const [tab, setTab] = useState<'skills' | 'details'>('skills')
  const isMine = coll.owner === 'user'
  const missing = repos.filter(r => r.saved === 0)
  const langs = [...new Set(repos.map(r => r.language).filter(Boolean))] as string[]
  const totalBytes = repos.reduce((s, r) => s + (r.content_size ?? 0), 0)
  const createdDate = coll.created_at ? new Date(coll.created_at).toLocaleDateString() : '—'

  return (
    <>
      <div className="coll-detail-banner">
        <BannerSVG
          owner={coll.owner}
          name={coll.name}
          language={langs[0] ?? null}
          variant="detail"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        <div className="coll-banner-name">{coll.name}</div>
      </div>

      <div className="coll-meta-bar">
        <div className="coll-meta-left">
          <span className="coll-meta-creator">
            {isMine ? 'Created by you' : `by ${coll.owner}`}
          </span>
          {isMine
            ? <span className="coll-mine-pill">mine</span>
            : <span className="coll-community-pill">community</span>
          }
          <span className={`coll-meta-count${missing.length > 0 ? ' has-missing' : ''}`}>
            {repos.length} skill{repos.length !== 1 ? 's' : ''}
            {missing.length > 0 && ` · ${missing.length} missing`}
          </span>
        </div>
        <div className="coll-meta-right">
          <Toggle on={coll.active === 1} onToggle={onToggle} />
          <span className="coll-active-label">Active</span>
        </div>
      </div>

      <div className="coll-tabs">
        <button
          className={`coll-tab${tab === 'skills' ? ' active' : ''}`}
          onClick={() => setTab('skills')}
        >
          Skills
        </button>
        <button
          className={`coll-tab${tab === 'details' ? ' active' : ''}`}
          onClick={() => setTab('details')}
        >
          Details
        </button>
      </div>

      <div className="coll-tab-content">
        {tab === 'skills' && (
          <>
            {coll.description && (
              <div className="coll-description">{coll.description}</div>
            )}
            <div className="coll-section-label-detail">Skills in this collection</div>
            <div className="coll-skills-list">
              {repos.map(r => {
                const key = `${r.owner}/${r.name}`
                const isInstalling = installing.has(key)
                return (
                  <div key={key} className={`coll-skill-row${r.saved === 0 ? ' missing' : ''}`}>
                    <LangBadge lang={r.language} />
                    <div className="coll-skill-info">
                      <div className="coll-skill-name">{r.name}</div>
                      <div className="coll-skill-meta">
                        {r.owner}
                        {r.version ? ` · ${r.version}` : ''}
                        {r.content_size ? ` · ${Math.round(r.content_size / 1024)} KB` : ''}
                      </div>
                    </div>
                    <div className="coll-skill-status">
                      <div className={`coll-skill-dot ${r.saved === 1 ? 'saved' : 'missing'}`} />
                      <span className={`coll-skill-status-text ${r.saved === 1 ? 'saved' : 'missing'}`}>
                        {r.saved === 1 ? 'saved' : 'missing'}
                      </span>
                      {r.saved === 0 && (
                        <button
                          className="coll-save-btn"
                          disabled={isInstalling}
                          onClick={() => onInstall(r.owner, r.name)}
                        >
                          {isInstalling ? '⟳' : '+ Save'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {tab === 'details' && (
          <>
            <div className="coll-kv-list">
              <div className="coll-kv-row">
                <span className="coll-kv-key">Created</span>
                <span className="coll-kv-val">{createdDate}</span>
              </div>
              <div className="coll-kv-row">
                <span className="coll-kv-key">Repos</span>
                <span className="coll-kv-val">{repos.length}</span>
              </div>
              <div className="coll-kv-row">
                <span className="coll-kv-key">Total size</span>
                <span className="coll-kv-val">
                  {totalBytes > 0 ? `${Math.round(totalBytes / 1024)} KB` : '—'}
                </span>
              </div>
              <div className="coll-kv-row">
                <span className="coll-kv-key">Languages</span>
                <span className="coll-kv-val">{langs.length > 0 ? langs.join(', ') : '—'}</span>
              </div>
              {!isMine && (
                <div className="coll-kv-row">
                  <span className="coll-kv-key">Curator</span>
                  <span className="coll-kv-val">{coll.owner}</span>
                </div>
              )}
            </div>
            {isMine && (
              <button className="coll-delete-btn" onClick={onDelete}>
                Delete collection
              </button>
            )}
          </>
        )}
      </div>

      <div className="coll-footer">
        <span className={`coll-footer-status${missing.length > 0 ? ' has-missing' : ''}`}>
          {missing.length === 0
            ? `All ${repos.length} skills active in Claude Desktop`
            : `${missing.length} skill${missing.length !== 1 ? 's' : ''} missing — collection partially active`
          }
        </span>
        <div className="coll-footer-actions">
          {isMine && <button className="coll-edit-btn">Edit collection</button>}
          {missing.length > 0 && (
            <button className="coll-save-all-btn" onClick={onInstallAll}>
              + Save all missing
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main view ──────────────────────────────────────────────────
export default function Collections() {
  const [searchParams] = useSearchParams()
  const [collections, setCollections] = useState<CollectionRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('select'))
  const [detail, setDetail] = useState<CollectionRepoRow[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [libraryRows, setLibraryRows] = useState<LibraryRow[]>([])
  const [installing, setInstalling] = useState<Set<string>>(new Set())

  const selected = collections.find(c => c.id === selectedId) ?? null

  const load = useCallback(async () => {
    const colls = await window.api.collection.getAll()
    setCollections(colls)
    setSelectedId(prev => prev ?? colls[0]?.id ?? null)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    window.api.library.getAll().then(rows => setLibraryRows(rows))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    window.api.collection.getDetail(selectedId).then(rows => setDetail(rows))
  }, [selectedId])

  async function handleToggle(id: string, newActive: number) {
    await window.api.collection.toggle(id, newActive)
    setCollections(prev => prev.map(c => c.id === id ? { ...c, active: newActive } : c))
  }

  async function handleDelete(id: string) {
    await window.api.collection.delete(id)
    setCollections(prev => prev.filter(c => c.id !== id))
    setSelectedId(prev => prev === id ? null : prev)
  }

  async function handleInstall(owner: string, name: string) {
    const apiKey = await window.api.settings.getApiKey()
    if (!apiKey) return
    const key = `${owner}/${name}`
    setInstalling(prev => new Set(prev).add(key))
    try {
      await window.api.github.saveRepo(owner, name)
      await window.api.skill.generate(owner, name)
      if (selectedId) {
        const rows = await window.api.collection.getDetail(selectedId)
        setDetail(rows)
      }
      await load()
    } finally {
      setInstalling(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  async function handleInstallAll() {
    const missing = detail.filter(r => r.saved === 0)
    await Promise.all(missing.map(r => handleInstall(r.owner, r.name)))
  }

  async function handleCreate(newId: string) {
    setShowModal(false)
    await load()
    setSelectedId(newId)
  }

  const mine = collections.filter(c => c.owner === 'user')
  const community = collections.filter(c => c.owner !== 'user')
  const filterFn = (c: CollectionRow) =>
    c.name.toLowerCase().includes(search.toLowerCase())

  return (
    <div className="collections-root">
      <div className="collections-topbar">
        <input
          className="collections-search"
          placeholder="Search collections…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="coll-new-btn" onClick={() => setShowModal(true)}>
          + New collection
        </button>
      </div>

      <div className="collections-body">
        <div className="collections-list">
          {mine.filter(filterFn).length > 0 && (
            <>
              <div className="coll-section-label">Mine</div>
              {mine.filter(filterFn).map(c => (
                <CollRow
                  key={c.id}
                  coll={c}
                  selected={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                  onToggle={() => handleToggle(c.id, c.active === 1 ? 0 : 1)}
                />
              ))}
            </>
          )}
          {community.filter(filterFn).length > 0 && (
            <>
              <div className="coll-section-label">Community</div>
              {community.filter(filterFn).map(c => (
                <CollRow
                  key={c.id}
                  coll={c}
                  selected={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                  onToggle={() => handleToggle(c.id, c.active === 1 ? 0 : 1)}
                />
              ))}
            </>
          )}
        </div>

        <div className="collections-detail">
          {selected ? (
            <CollDetail
              coll={selected}
              repos={detail}
              onToggle={() => handleToggle(selected.id, selected.active === 1 ? 0 : 1)}
              onDelete={() => handleDelete(selected.id)}
              onInstall={handleInstall}
              onInstallAll={handleInstallAll}
              installing={installing}
            />
          ) : (
            <div className="coll-detail-empty">Select a collection</div>
          )}
        </div>
      </div>

      {showModal && (
        <NewCollectionModal
          libraryRows={libraryRows}
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/views/Collections.test.tsx
```

Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/Collections.tsx src/views/Collections.test.tsx
git commit -m "feat(ui): implement Collections view — list, detail panel, new collection modal"
```

---

### Task 6: Update RepoDetail Collections tab

**Files:**
- Modify: `src/views/RepoDetail.tsx`

The current tab shows a single placeholder paragraph. Update it to load `{ id, name }[]` from `library:getCollections` and render clickable pills that navigate to `/collections?select={id}`.

- [ ] **Step 1: Add `repoCols` state to `RepoDetail`**

In `src/views/RepoDetail.tsx`, add alongside the other `useState` declarations (around line 60):

```typescript
const [repoCols, setRepoCols] = useState<{ id: string; name: string }[]>([])
```

- [ ] **Step 2: Load collections when repo id is available**

Add a new `useEffect` after the existing repo-fetch effect (after line 100):

```typescript
useEffect(() => {
  if (!repo?.id) return
  window.api.library.getCollections(repo.id).then(cols => setRepoCols(cols))
}, [repo?.id])
```

- [ ] **Step 3: Replace the Collections tab content**

Find the existing placeholder (around line 268):

```typescript
{activeTab === 'collections' && (
  <p className="repo-detail-placeholder">Not in any collections.</p>
)}
```

Replace with:

```typescript
{activeTab === 'collections' && (
  <div style={{ padding: '4px 0' }}>
    {repoCols.length === 0 ? (
      <p className="repo-detail-placeholder">
        Not in any collections. Add to a collection from the Collections view.
      </p>
    ) : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {repoCols.map(col => (
          <button
            key={col.id}
            onClick={() => navigate(`/collections?select=${col.id}`)}
            style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-border)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 11,
              color: '#a78bfa',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {col.name}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Run existing RepoDetail tests to confirm no regressions**

```bash
npx vitest run src/views/RepoDetail.test.tsx
```

Expected: all existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat(ui): populate RepoDetail Collections tab with navigable collection pills"
```

---

### Task 7: Full test run + verification

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests PASS (no regressions in Discover, Library, App, Onboarding, skillParse tests)

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Final commit if any last-minute fixes were needed**

```bash
git add -A
git commit -m "fix: Phase 6 final cleanup"
```

---

## Deliverable Checklist

- [ ] Collections list shows Mine / Community sections with correct row styling
- [ ] Gradient accent strips use per-collection `color_start` / `color_end`
- [ ] Clicking a row selects it and loads the detail panel
- [ ] Skills tab shows saved (green dot) and missing (amber border + `+ Save` button)
- [ ] `+ Save` installs a single missing skill inline
- [ ] `+ Save all missing` installs all missing skills simultaneously
- [ ] Active toggle updates `collections.active` in SQLite
- [ ] New collection modal creates collection and links selected installed repos
- [ ] Community collections pre-seeded on app start (idempotent)
- [ ] Repo Detail Collections tab shows navigable collection pills
- [ ] Navigating from RepoDetail to `/collections?select=id` auto-selects that collection
- [ ] All existing tests continue to pass
