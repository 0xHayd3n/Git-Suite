# Phase 2 Design: GitHub Integration & Onboarding

**Date:** 2026-03-26
**Status:** Approved
**Scope:** GitHub OAuth flow, starred repos sync, GitHub API service, three-screen onboarding, sidebar status

---

## 1. Overview

Phase 2 adds GitHub connectivity to Git Suite. On first launch the user sees a three-screen onboarding flow. They can connect a GitHub OAuth App, which grants read access to their public profile and starred repositories. After connecting, starred repos are synced into the local SQLite database. The sidebar footer reflects connection status on every subsequent launch.

---

## 2. New & Modified Files

### New
| File | Purpose |
|------|---------|
| `electron/store.ts` | electron-store singleton — token storage + display cache |
| `electron/github.ts` | GitHub API service — getUser, getStarred, getRepo |

### Modified
| File | Changes |
|------|---------|
| `electron/main.ts` | Protocol registration, deep link handling, 7 new IPC handlers |
| `electron/preload.ts` | Expose `window.api.github` and `window.api.settings` |
| `src/App.tsx` | Onboarding gate on mount |
| `src/views/Onboarding.tsx` | Replace placeholder with full 3-screen flow |
| `src/components/Sidebar.tsx` | GitHub connection status in footer |
| `src/styles/globals.css` | Onboarding layout, progress dots, permission rows, stat cards |
| `src/env.d.ts` | Add github/settings to Window.api types |

---

## 3. Main Process

### 3.1 `electron/store.ts`

Singleton `electron-store` instance. All sensitive data lives here, never in SQLite.

Token is stored as plaintext JSON in the electron-store file on disk (electron-store encryption requires an `encryptionKey` option which is not configured here — the store is unencrypted local storage, protected only by OS file permissions).

**Stored keys:**
- `github.token` — OAuth access token
- `github.username` — display username
- `github.avatarUrl` — avatar URL

**Exported functions:**
- `getToken() → string | undefined`
- `setToken(token: string) → void`
- `clearToken() → void`
- `getGitHubUser() → { username: string, avatarUrl: string } | undefined`
- `setGitHubUser(username: string, avatarUrl: string) → void`
- `clearGitHubUser() → void`

**Collision note:** The existing `electron/main.ts` already creates an `electron-store` instance for window bounds (`const store = new Store<StoreSchema>()`). The new `electron/store.ts` is a separate store instance with a different schema. To avoid naming collisions in `main.ts`, import only the exported functions from `electron/store.ts` (e.g. `import { getToken, setToken } from './store'`) — never import or re-export the store instance itself.

### 3.2 `electron/github.ts`

Pure async functions. No side effects beyond HTTP. Token always sourced from store — never passed from renderer.

**Constants (hardcoded):**
- `CLIENT_ID` — GitHub OAuth App client ID
- `CLIENT_SECRET` — GitHub OAuth App client secret
- `OAUTH_URL` — `https://github.com/login/oauth/authorize?client_id={CLIENT_ID}&scope=read:user&redirect_uri=gitsuite://oauth/callback`
- `BASE` — `https://api.github.com`

**Functions:**
- `getUser(token: string) → Promise<GitHubUser>` — `GET /user`
- `getStarred(token: string) → Promise<GitHubRepo[]>` — paginated `GET /user/starred`, follows `Link: rel="next"` header, max 10 pages, returns flat array
- `getRepo(token: string, owner: string, name: string) → Promise<GitHubRepo>` — `GET /repos/{owner}/{name}`

All functions throw `Error` on non-2xx response.

Standard headers on every request to `api.github.com`:
```
Authorization: Bearer {token}
Accept: application/vnd.github.v3+json
```

### 3.3 `electron/main.ts` Additions

**Placement:** The protocol registration and single-instance lock must be at module scope — top-level, before any `app.whenReady()` call. Placing them inside `whenReady` is incorrect and will silently fail on Windows for the first cold-launch OAuth callback.

**Protocol registration** (module scope):
```ts
app.setAsDefaultProtocolClient('gitsuite')
```

**Single-instance lock** (module scope, Windows deep link support):
```ts
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit() }
else {
  app.on('second-instance', (_, argv) => {
    // On Windows, deep link URL arrives in argv
    const url = argv.find(a => a.startsWith('gitsuite://'))
    if (url) handleDeepLink(url)
    // Also focus the window if minimised
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
  })
}
```

**macOS deep link** (module scope):
```ts
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})
```

**`handleDeepLink(url: string)`** — helper function, extracts `code` query param from the URL, calls `mainWindow?.webContents.send('oauth:callback', code)`. Guard against `mainWindow` not yet existing (unlikely but safe).

**IPC handlers:**

| Handle | Action |
|--------|--------|
| `github:connect` | `shell.openExternal(OAUTH_URL)` — catch and re-throw with message "Failed to open browser" so the renderer can reset button state |
| `github:exchange` | POST code to `https://github.com/login/oauth/access_token` with `Accept: application/json` header; parse JSON; extract `access_token`; store via `setToken()` |
| `github:getUser` | Read token from store, call `getUser()`, call `setGitHubUser()`, write username to settings table |
| `github:getStarred` | Check `last_starred_sync` in settings; if set and `Date.now() - Number(last_starred_sync) < 3_600_000` (1hr in ms) return early; fetch all pages; upsert into `repos` table; update `last_starred_sync` and `starred_repo_count` |
| `github:disconnect` | `clearToken()`, `clearGitHubUser()`, set `github_username` to `''` in settings (empty string signals "not connected" — no delete path needed) |
| `settings:get` | Read from SQLite settings table by key |
| `settings:set` | Write to SQLite settings table |

**`github:exchange` POST detail:**
```ts
const res = await fetch('https://github.com/login/oauth/access_token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',  // required — default response is URL-encoded
  },
  body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
})
const data = await res.json()
// GitHub returns { error, error_description } on failure — validate before storing
if (!data.access_token) {
  throw new Error(data.error_description ?? 'OAuth exchange failed')
}
setToken(data.access_token)
```

**Starred upsert logic:**

The `repos` table PK is `id TEXT`. The GitHub API returns a numeric repo id — store it as `String(repo.id)`. The conflict target is `(owner, name)` (unique index added in db.ts — see section 8).

```sql
INSERT INTO repos (id, owner, name, description, language, topics, stars, forks,
                   license, homepage, updated_at, saved_at, type, banner_svg)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
ON CONFLICT(owner, name) DO UPDATE SET
  description = excluded.description,
  language    = excluded.language,
  topics      = excluded.topics,
  stars       = excluded.stars,
  forks       = excluded.forks,
  updated_at  = excluded.updated_at
  -- id, saved_at, type, banner_svg intentionally NOT updated (preserve user data)
```

### 3.4 `electron/preload.ts` Additions

The `onCallback`/`offCallback` pattern must store the wrapper function reference so the listener can be properly removed. Use a module-level `Map` in the preload closure:

```ts
const callbackWrappers = new Map<Function, Function>()

window.api.github = {
  connect:    () => ipcRenderer.invoke('github:connect'),
  exchange:   (code: string) => ipcRenderer.invoke('github:exchange', code),
  getUser:    () => ipcRenderer.invoke('github:getUser'),
  getStarred: () => ipcRenderer.invoke('github:getStarred'),
  disconnect: () => ipcRenderer.invoke('github:disconnect'),
  onCallback: (cb: (code: string) => void) => {
    const wrapper = (_: unknown, code: string) => cb(code)
    callbackWrappers.set(cb, wrapper)
    ipcRenderer.on('oauth:callback', wrapper as never)
  },
  offCallback: (cb: (code: string) => void) => {
    const wrapper = callbackWrappers.get(cb)
    if (wrapper) {
      ipcRenderer.removeListener('oauth:callback', wrapper as never)
      callbackWrappers.delete(cb)
    }
  },
}
window.api.settings = {
  get: (key: string) => ipcRenderer.invoke('settings:get', key),
  set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
}
```

---

## 4. Renderer

### 4.1 `src/App.tsx` — Onboarding Gate

On mount, read `settings.get('onboarding_complete')`. Use an `isChecking` boolean state initialised to `true`; render `null` while checking to avoid a one-frame flash of the main app. On resolution: if not `'1'`, navigate to `/onboarding`; set `isChecking` to `false` either way.

```ts
const [isChecking, setIsChecking] = useState(true)
useEffect(() => {
  window.api.settings.get('onboarding_complete').then(val => {
    if (val !== '1') navigate('/onboarding')
    setIsChecking(false)
  })
}, [])
if (isChecking) return null
```

If `onboarding_complete = '1'` and GitHub is connected, also fire-and-forget the starred sync:
```ts
window.api.settings.get('onboarding_complete').then(async val => {
  if (val !== '1') { navigate('/onboarding'); setIsChecking(false); return }
  setIsChecking(false)
  // background sync — no await
  window.api.github.getStarred().catch(() => {})
})
```

### 4.2 `src/views/Onboarding.tsx`

Single component. Internal `step` state: `0 | 1 | 2`.

---

#### Screen 0 — Welcome

Full-screen layout over the background SVG.

**Background SVG:**
- Radial gradient fill: `#180d30` centre → `#0a0a0e` edge
- 7–8 nodes connected by thin lines: `stroke="#7c3aed"` `opacity="0.15"`
- Filled circles at node positions: `opacity` 0.3–0.45
- Two rows of faint monospace repo names at the bottom: `opacity` 0.35–0.6

**Content (centred):**
- Pill: "Git Suite" — `var(--accent-soft)` background, `var(--accent-border)` border, `var(--accent)` text, 10px, 5px border-radius
- Headline: 26px, weight 700, line-height 1.2. "Turn any GitHub repo into an **AI skill**." — "AI skill." rendered in `var(--accent)`
- Subtext: 11px, `var(--t2)`, line-height 1.7, max-width 320px
- "Connect GitHub →" button → sets step to 1
- "Skip" text button → `settings.set('onboarding_complete','1')` then navigate `/discover`

No progress dots on screen 0.

---

#### Screen 1 — Connect GitHub

**Progress dots:** 2 dots (representing the Connect and Done steps). First dot is active on this screen.

**Layout (centred):**
- "Step 1 of 2" label, 9px, `var(--t3)`
- "Connect GitHub" heading, 15px, weight 600
- Body text: "Git Suite uses GitHub to let you browse repos and sync the ones you already know. It never writes to GitHub or accesses private repos."

**Permission card** (`var(--bg3)` background, `var(--border)` border, 8px radius):
- Header row: GitHub icon (16×16) + "GitHub" label (13px weight 600) + Connect button (right-aligned)
- Sub-text: "Not connected" → updates to `@{username} · {n} repos starred` in `var(--status-ok)` after connect
- Divider
- Row: ★ badge + "Read starred repositories"
- Row: ◎ badge + "Read public profile"
- Row: ✕ "No write access, ever" — muted style

**Permission row badge styles:**
- ★ and ◎: `var(--accent-soft)` background, `var(--accent-border)` border, `#a78bfa` text, 16×16
- ✕: transparent background, `var(--border)` border, `var(--t3)` text

**Connect button states:**
1. "Connect" — enabled
2. "Connecting..." — disabled, `opacity: 0.6` (while OAuth flow in progress)
3. "✓ Connected" — green tint background

**On Connect click:**
1. Set button to "Connecting..."
2. Call `github.connect()` — if it rejects (browser failed to open), reset button to "Connect" and show error
3. Register `github.onCallback(handleCode)` listener
4. `handleCode(code)`: call `github.exchange(code)` → `github.getUser()` → update UI to connected state, store username in settings

**Continue button:** disabled at `opacity: 0.3` until connected. On click → step 2.
**Back button:** → step 0.

**Cleanup:** `useEffect` returns cleanup that calls `github.offCallback(handleCode)` on unmount (removes the wrapper via the Map in preload).

---

#### Screen 2 — Done

**Progress dots:** 2 dots. Second dot is active on this screen.

**Layout (centred):**
- Green ✓ icon in rounded square (`var(--status-ok)` background tint, 40×40, 10px radius)
- "Ready to go" heading, 15px, weight 600
- Subtext pointing to Discover and Starred

**Stat cards** (3 equal-width, `var(--bg3)` background, `var(--border)` border, 6px radius):
- Repos synced: read `starred_repo_count` from settings. Shows `0` on first view — the actual sync happens fire-and-forget after "Open Git Suite →" is clicked and the count is not available until next launch.
- Skills installed: hardcoded `0`
- Status: hardcoded "Ready"
- Value: 16px bold `var(--t1)`. Label: 8px uppercase `var(--t3)`

**Tip box** (`var(--bg3)` background, `var(--border)` border, 6px radius):
- "HOW IT WORKS" label: 8px uppercase `#a78bfa`
- Body: "Find any repo → hit + Install → Git Suite generates a skill file and injects it into Claude automatically. Your AI now knows that repo."
- 10px, `var(--t2)`, line-height 1.6

**"Open Git Suite →" button** (full width):
1. `settings.set('onboarding_complete','1')`
2. Call `github.getStarred()` — fire and forget (no await, catch and discard)
3. navigate `/discover`

---

#### Progress Dots

```css
.onboarding-dots {
  position: absolute;
  top: 20px; /* below titlebar */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  align-items: center;
}
.dot {
  height: 3px;
  border-radius: 3px;
  background: var(--t3);
  width: 5px;
  transition: all 0.25s;
}
.dot.active {
  width: 16px;
  background: #a78bfa;
}
```

---

### 4.3 `src/components/Sidebar.tsx` — Status Footer

On mount, read `settings.get('github_username')`.

- **Connected** (value is a non-empty string): green pulse dot (existing `.status-dot.active` class) + `"{username} — connected"`
- **Not connected** (value is `null`, `undefined`, or `''`): dim dot + `"GitHub — not connected"`

Single read on mount — no live subscription needed at this phase.

---

## 5. OAuth Data Flow

```
User clicks Connect
  → github:connect IPC
  → shell.openExternal(OAUTH_URL)  [throws on browser error → renderer resets button]
  → System browser opens GitHub authorisation page
  → User authorises
  → GitHub redirects to gitsuite://oauth/callback?code=xxx
  → Electron intercepts (open-url on macOS / second-instance on Windows)
  → handleDeepLink() extracts code
  → mainWindow.webContents.send('oauth:callback', code)
  → Onboarding component receives code via onCallback listener
  → github:exchange IPC → POST with Accept:application/json → token stored in electron-store
  → github:getUser IPC → GET /user → username + avatar stored in store + settings table
  → UI updates: button → "✓ Connected", sub-text → "@username · N repos starred"
  → Continue button unlocks
```

---

## 6. Starred Sync

**Trigger points:**
1. "Open Git Suite →" button in onboarding (fire-and-forget)
2. App launch in `App.tsx` if `onboarding_complete = '1'` (fire-and-forget after onboarding check)

**`github:getStarred` handler logic:**
1. Read token from electron-store — if falsy (no token, e.g. user skipped onboarding), return early
2. Read `last_starred_sync` from settings
3. If set and `Date.now() - Number(last_starred_sync) < 3_600_000` (milliseconds — 1 hour) → return early (cached)
4. Fetch all starred pages (max 10), following `Link` header
5. Upsert each repo into `repos` table using `String(repo.id)` as the TEXT id (preserve `saved_at`, `type`, `banner_svg`)
6. Write `last_starred_sync = Date.now().toString()` to settings (milliseconds)
7. Write `starred_repo_count = repos.length.toString()` to settings

---

## 7. TypeScript Types (`src/env.d.ts`)

```ts
interface Window {
  api: {
    windowControls: { minimize(): void; maximize(): void; close(): void }
    github: {
      connect(): Promise<void>
      exchange(code: string): Promise<void>
      getUser(): Promise<void>
      getStarred(): Promise<void>
      disconnect(): Promise<void>
      onCallback(cb: (code: string) => void): void
      offCallback(cb: (code: string) => void): void
    }
    settings: {
      get(key: string): Promise<string | null>
      set(key: string, value: string): Promise<void>
    }
  }
}
```

---

## 8. Database Notes

**New unique index** on `repos(owner, name)` — required for the upsert conflict clause. Add to `electron/db.ts` schema init:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS repos_owner_name ON repos (owner, name);
```

**`id` column type:** The `repos` table defines `id TEXT PRIMARY KEY`. GitHub API returns a numeric repo id — store it as `String(repo.id)` to match this type.

**New settings keys used this phase:**
| Key | Value |
|-----|-------|
| `onboarding_complete` | `'1'` when done |
| `github_username` | GitHub login string, or `''` when disconnected |
| `last_starred_sync` | Unix timestamp in **milliseconds** as string |
| `starred_repo_count` | Integer as string |

---

## 9. Out of Scope (Deferred)

- Settings page OAuth reconnect/disconnect UI (Phase N)
- Manual Sync button in Starred view (Phase 3)
- Avatar display (Phase N)
- Private repo support (Phase N)
- Claude Desktop status in sidebar (Phase 7)
- electron-store encryption at rest (Phase N)
