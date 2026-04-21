# Git Suite — Design Spec
**Date:** 2026-03-26
**Product:** Git Suite
**Brand:** Eleutex
**Status:** Approved

---

## Overview

Git Suite is a frameless Electron desktop application that turns any GitHub repository into a structured skill file. Skill files are automatically served to Claude Desktop via a local MCP server, making every installed repo's API surface available to Claude without manual prompting.

**Core value proposition:** Browse GitHub → Install any repo → Claude understands your stack automatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron (latest stable), frameless window |
| Renderer | React 18 (hooks only, no class components) |
| Bundler | electron-vite + Vite |
| Language | TypeScript throughout |
| Styling | Raw CSS with CSS variables — no framework |
| Font | JetBrains Mono exclusively (@fontsource/jetbrains-mono) |
| Database | better-sqlite3 (repos, skills, collections, settings) |
| Secrets | electron-store (encrypted GitHub token + Anthropic API key) |
| AI | @anthropic-ai/sdk — Claude Haiku for skill generation |
| MCP | @modelcontextprotocol/sdk — local MCP server |

---

## Design System

### Colour Tokens
```css
--bg:           #0a0a0e   /* app background */
--bg2:          #0f0f14   /* sidebar, topbars */
--bg3:          #141419   /* cards, panels */
--bg4:          #1a1a22   /* inputs, code blocks */
--border:       rgba(255,255,255,0.06)
--border2:      rgba(255,255,255,0.10)
--accent:       #7c3aed
--accent-soft:  rgba(124,58,237,0.10)
--accent-border:rgba(124,58,237,0.25)
--t1:           #e8e8f0   /* primary text */
--t2:           #6b6b80   /* secondary text */
--t3:           #34344a   /* muted / labels */
```

### Typography
- Font: JetBrains Mono only
- Weights: 400 (body), 500 (labels/subheadings), 700 (headings/repo names)
- No system fonts anywhere

### Layout Constants
- Sidebar width: 180px
- Card border-radius: 8px
- Button/input border-radius: 5–6px
- Borders: 0.5–1px solid var(--border) or var(--border2)

---

## Window

- Frameless Electron window with custom titlebar
- Traffic light dots: red `#ff5f57`, yellow `#febc2e`, green `#28c840`
- Minimum size: 1000×660
- Window position + size persisted between launches

---

## Navigation — Left Sidebar (180px)

Five nav items (icon + label). Active item: `background: var(--accent-soft)`, 2px right border `var(--accent)`.

```
Browse
  ├ Python
  ├ JavaScript
  ├ TypeScript
  ├ Rust
  ├ Go
  └ C/C++
Discover
My Library
Collections
Starred
───────────
[bottom] Claude Desktop status (pulse dot + "MCP Connected" / "Not connected")
```

**Browse view:** Clicking "Browse" (or any language sub-item) renders the Discover grid pre-filtered to that language. Browse is not a separate view — it is Discover with a language constraint applied. Selecting a sub-item sets the active language filter chip in the Discover grid. The Browse nav item and the Discover filter chips are two entry points to the same underlying grid; their language lists differ intentionally: Browse exposes the six most common programming languages; the Discover filter chips also include CLI, Web, and Data/ML as topic-based filters.

**Claude Desktop status check:** The main process watches the Claude Desktop config file at the path stored in `settings.claude_desktop_config_path`. If the file contains the `git-suite-mcp` entry AND the MCP socket is accepting connections, status is "MCP Connected." The main process checks on app start and re-checks every 30 seconds, emitting an IPC event to the renderer on change.

---

## Views

### 1. Discover
Grid browser for GitHub public repos (trending/search).

**Topbar:** Search input + sort buttons (Stars, Updated)
**Filter chips:** All · Python · TypeScript · Rust · Go · CLI · Web · Data/ML (single-select)
**Layout:** 3-column card grid
**Section headers:** e.g. "Trending this week" with `<hr>`

**Card anatomy:**
- Banner (72px tall): deterministic SVG illustration (see Banner section)
- Language badge top-left of banner (2-letter abbrev, language colour)
- Gradient scrim over bottom 40% of banner
- Repo name (bold) + owner (muted)
- Description (2-line clamp)
- Tags row
- Footer: star count + Save/Saved button

**Save button states:**
- `+ Save` → purple outline
- `✓ Saved` → green tint, non-interactive

Card click → Repo Detail view.

---

### 2. Repo Detail
Full detail for a single repo.

**Breadcrumb:** `Discover › Python › fastapi`
**Banner (175px):** same SVG approach, wider. Gradient scrim. Title + owner overlaid bottom-left.
**Stats bar:** Stars · Forks · Issues · Version · Updated

**Left column (main):**
- Description + tag pills
- Tab bar: README | Skill file | Releases | Collections
- README tab: fetches + renders README.md as styled markdown
- Skill file tab: generated skill.md with Core/Extended/Deep sections + line counts
- Releases tab: version history list
- Collections tab: which collections include this repo

**Right sidebar (220px):**
- Save/Saved button (full width)
- Skill panel (post-install): filename, ✓ generated, three depth bars (Core ~Nlines, Extended ~Nlines, Deep ~Nlines) with coloured progress bars (green / purple / deep purple)
- Note: "Active in Claude Desktop. Models read as far as context allows."
- Repo metadata: License, Language, Size, Watchers, Contributors, In collections
- Related repos: 3 cards (name, description, star count)

---

### 3. My Library
Split-panel: repo list left (220px), detail panel right.

**Topbar:** Search/filter input + sort (Active, A–Z, Recent)
**Stats pills:** Skills total · Active count · Updates available

**List grouping:**
- "Component libs"
- "Active"
- "Inactive" (dimmed to 45% opacity)

**Row:** language badge · repo name · type badge · active dot · toggle switch
**Type badges:** components (purple) · framework (amber) · cli/tui (green) · data (blue) · lib (grey)
**Update badge:** amber pill e.g. `v5.3 → v6.0`

**Detail panel — Generic mode:**
- Repo title, owner, active toggle
- Skill file panel with depth bars
- Metadata table
- Regenerate + Remove buttons

**Detail panel — Component library mode** (auto-detected):
- Repo title, owner, active toggle
- Type pill + enabled component count + skill file line count
- Tab bar: Components | Skill file | Details
- Components tab: search input, "Select all" link, enabled count
- Component grid (2 cols): name + self-referential preview (Button shows a button, Input shows an input, etc.) + toggle
- Grouped by category: Form & Input · Overlay & Feedback · Navigation & Layout
- Inactive cards: 38% opacity
- Footer: "Skill file reflects enabled components" + Rebuild skill button

**Component self-referential previews:** A Phase 5 spike item. Map known component names to a small static preview renderer (e.g. `Button` → `<button>` element styled with the design system, `Input` → `<input>`, `Badge` → a small pill, `Slider` → a range input). Unrecognised component names get a generic placeholder (a grey rectangle). The preview renders inside a sandboxed iframe or isolated DOM node to avoid style bleed.

**Skill regeneration trigger:** Skill files for component libraries are regenerated only when the user clicks "Rebuild skill." Individual toggle changes update the `enabled_components` JSON in SQLite immediately (optimistic) but do NOT trigger Haiku. This prevents cost and latency from rapid toggling.

---

### 4. Collections
Split-panel: collection list left (240px), detail right.

**Topbar:** Search input + "+ New collection" button

**List grouping:**
- "Mine" (user-created)
- "Community" (installed from platform)

**Row:** 4px coloured left-side strip (border-left) · emoji icon badge · name · skill count · missing count · toggle

**Detail panel:**
- Banner SVG (80px, collection theme)
- Meta bar: creator · mine/community pill · skill count · active toggle
- Tab bar: Skills | Details
- Skills list: language badge · name · version · file size · saved/missing status. Missing rows: amber border + "+ Save" button
- Footer: status note + "Edit collection" or "+ Save all missing"

**New collection flow:** inline modal — name input, description, add repos from library or search

---

### 5. Starred
Single-panel list of user's GitHub starred repos.

**GitHub account bar:** avatar initials · username · handle · "synced N minutes ago" · Sync GitHub button
**Topbar:** Search input + sort (Recent · Stars · A–Z)
**Filter chips:** All (N) · Not installed (N) · Installed (N)
**Grouping:** "This week" · "This month" · "Older"

**Row:** language dot (coloured circle) · repo name (owner prefix muted) · type badge · description · star count · + Install / ✓ Installed button

**Install button states:**
- `+ Install` → purple outline
- `⟳ Generating...` → amber tint — shown for a minimum of 1.5 seconds (prevents flicker on fast generation), real async in background
- `✓ Installed` → green tint, non-interactive

---

### 6. Onboarding (first-run only)
Three screens, progress dots top-centre, skippable.

**Screen 0 — Welcome:**
- Full-screen node-graph SVG background (purple nodes/edges, repo names as ambient text)
- Centred: Git Suite wordmark pill · headline · sub-text
- Buttons: "Connect GitHub →" (primary) · "Skip" (ghost)

**Screen 1 — Connect GitHub:**
- Step 1 of 1
- Connect card with GitHub icon + status + Connect button
- Permissions list: Read starred repos ✓ · Read public profile ✓ · No write access ✕
- Continue button locked until OAuth resolves

**Screen 2 — Done:**
- Green check icon · "Ready to go" title
- Stats: repos synced · skills installed (0) · status
- How it works tip box
- "Open Git Suite" button

---

## Banner SVG Generation

Deterministic SVG banners — NOT AI-generated, procedurally drawn from repo name + language + topics.

**Seed:** simple hash of `repoName` → pseudo-random values for positioning/sizing.

| Language | Visual pattern |
|---|---|
| Python | Route/node graph with API endpoint labels (GET, POST, PUT) |
| TypeScript/JS | Stacked UI chrome fragments (rectangles suggesting cards, inputs, buttons) |
| Rust | Geometric triangles/polygons, angular, sparse |
| Go | Organic floating circles of varying radius |
| Data/ML | Grid of small squares with opacity gradient (attention matrix) |
| CLI/TUI | Terminal-style bordered boxes with monospace text fragments |
| Generic | Minimal scatter of dots connected by thin lines |

- Colours: 2–3 derived from language colour palette, dark (near-black bg, subtle mid-tone elements)
- Gradient scrim: bottom 40% fades to near-black for text legibility
- Card banners: `260×72` viewBox
- Detail banners: `500×175` viewBox
- If repo README has images → fetch first one, use as banner (crop to fill)

---

## Skill File Format

Generated by Claude Haiku. System prompt:

```
You are generating a skill file for the repository: {repoName}
README content: {readmeContent} (truncated to 8000 tokens)
Package metadata: {packageJson or similar}

Generate a skill.md file with exactly three depth sections:

## [CORE] ~80 lines maximum.
Install command, the 3 most common usage patterns, critical gotchas.

## [EXTENDED] ~120 additional lines.
Secondary API surface, less common patterns, integration tips, configuration options.

## [DEEP] ~200 additional lines.
Edge cases, internals, advanced configuration, known bugs, performance considerations.

Rules:
- Write for an AI model as the reader, not a human
- Be dense and precise, not conversational
- Prefer code examples over prose
- Each section must be independently useful if read alone
- Do not reproduce licence text or contributor lists
```

**Storage path:** `{app.getPath('userData')}/skills/{owner}/{repo}.skill.md`
- macOS: `~/Library/Application Support/GitSuite/skills/`
- Windows: `%APPDATA%\GitSuite\skills\`
Use Electron's `app.getPath('userData')` — never hardcode the platform path.

For component libraries: skill file is fully regenerated each time enabled components change.

---

## MCP Server

Local MCP server on unix socket / named pipe. Auto-starts with app, auto-stops on quit. If app not running → tools return empty results (no error).

**Tools:**
| Tool | Signature | Purpose |
|---|---|---|
| `search_skills` | `(query: string)` | Relevant skill file excerpts |
| `get_skill` | `(owner: string, repo: string, depth?: 'core' \| 'extended' \| 'full')` | Skill file content, depth-filtered |
| `list_skills` | `()` | All active installed skills with metadata |
| `get_collection` | `(name: string)` | All skills in a collection |

**`get_skill` depth behaviour:** The `depth` parameter controls how much of the skill file is returned. `core` returns only the `[CORE]` section (~80 lines). `extended` returns `[CORE]` + `[EXTENDED]` (~200 lines). `full` (default) returns all three sections. Claude can call with `depth: 'core'` for a quick orientation, then `depth: 'full'` when it needs more detail. The MCP server does not attempt to infer model context window size — depth selection is the caller's responsibility.

**SQLite concurrency:** The MCP binary and the Electron app both open the same SQLite database file. Both must open with WAL (Write-Ahead Logging) mode enabled (`PRAGMA journal_mode=WAL`). The MCP binary is read-only (no writes). The Electron app is the sole writer. This eliminates lock contention in practice.

**Claude Desktop config:**
```json
{
  "mcpServers": {
    "git-suite": {
      "command": "git-suite-mcp"
    }
  }
}
```

`git-suite-mcp` is a standalone Electron helper that reads from the local SQLite DB and can run without the full app open.

---

## Data Model (SQLite)

```sql
CREATE TABLE repos (
  id TEXT PRIMARY KEY,        -- "{owner}/{name}"
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT,
  topics TEXT,                -- JSON array
  stars INTEGER,
  forks INTEGER,
  license TEXT,
  homepage TEXT,
  updated_at TEXT,
  saved_at TEXT,
  type TEXT,                  -- 'framework' | 'components' | 'cli' | 'data' | 'lib'
  banner_svg TEXT             -- cached generated SVG
);

CREATE TABLE skills (
  repo_id TEXT PRIMARY KEY REFERENCES repos(id),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,      -- full skill.md content
  version TEXT,               -- repo version at generation time
  generated_at TEXT,
  active INTEGER DEFAULT 1,
  enabled_components TEXT     -- JSON array, null for non-component repos
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT DEFAULT 'user',  -- 'user' | github username for community
  active INTEGER DEFAULT 1,
  created_at TEXT,
  color_start TEXT,
  color_end TEXT
);

CREATE TABLE collection_repos (
  collection_id TEXT REFERENCES collections(id),
  repo_id TEXT REFERENCES repos(id),
  PRIMARY KEY (collection_id, repo_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- keys: onboarding_complete, claude_desktop_config_path
-- NOTE: github_token and anthropic_api_key live in electron-store (encrypted), NOT here
```

---

## GitHub API Integration

REST API v3.

**Auth:** The onboarding "Connect GitHub" flow uses a full GitHub OAuth App flow. A registered GitHub OAuth App client ID is bundled as a compile-time env var (injected via Vite). The OAuth flow opens a browser via `shell.openExternal` and receives the callback at `gitsuite://oauth/callback` via Electron deep link registration. The resulting access token is stored in electron-store (encrypted) — never in SQLite.

**Secrets:** `github_token` and `anthropic_api_key` live exclusively in electron-store. The `settings` SQLite table is for non-sensitive app preferences only (e.g. `onboarding_complete`, `claude_desktop_config_path`).

**Endpoints:**
- `GET /user` — authenticated user profile
- `GET /users/{username}/starred` — paginated starred repos
- `GET /search/repositories?q=...&sort=stars` — discover/search
- `GET /repos/{owner}/{repo}` — repo metadata
- `GET /repos/{owner}/{repo}/readme` — README (base64 decode)
- `GET /repos/{owner}/{repo}/releases` — release history

**Caching:** All responses cached in SQLite with 1-hour TTL. A small muted "cached" label appears near the section header when data is served from cache rather than a live fetch.

**README image banner:** When a repo README contains images, fetch the first image URL and store it as a data URI in `repos.banner_svg`. CSP must include `img-src data: https:`. Once cached, the banner is deterministic (served from SQLite).

---

## Component Library Detection (Heuristic)

Repo is classified as `type: 'components'` if:
- topics includes `components`, `ui-components`, or `design-system`
- OR repo name includes `ui`, `components`, or `design-system`

Heuristic — does not need to be perfect.

---

## File Structure

```
git-suite/
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # contextBridge API
│   ├── mcp-server.ts        # MCP server process
│   └── db.ts                # SQLite via better-sqlite3
├── src/
│   ├── main.tsx             # React entry
│   ├── App.tsx              # Root with router
│   ├── styles/
│   │   └── globals.css      # CSS variables + resets
│   ├── components/
│   │   ├── Titlebar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── RepoCard.tsx
│   │   ├── BannerSVG.tsx    # deterministic banner generator
│   │   └── SkillPanel.tsx
│   ├── views/
│   │   ├── Discover.tsx
│   │   ├── RepoDetail.tsx
│   │   ├── Library.tsx
│   │   ├── Collections.tsx
│   │   ├── Starred.tsx
│   │   └── Onboarding.tsx
│   ├── services/
│   │   ├── github.ts        # GitHub API client
│   │   ├── skill-gen.ts     # Haiku generation pipeline
│   │   └── mcp.ts           # MCP server communication
│   └── store/
│       └── index.ts         # React context / state
├── electron-builder.yml
├── vite.config.ts
└── package.json
```

---

## Build Phases

| Phase | Scope |
|---|---|
| 1 — Shell | electron-vite + React + TS scaffold, frameless titlebar, sidebar nav, CSS design system, SQLite init + schema, window bounds persistence (electron-store) |
| 2 — GitHub Integration | OAuth flow, starred repos sync, GitHub API service layer + caching, onboarding 3-screen flow |
| 3 — Discover + Repo Detail | Discover grid, search, filter chips, section headers, banner SVG generator, Repo Detail view |
| 4 — Skill Generation | Anthropic API key settings, Haiku pipeline, skill file storage, Install button state machine, depth bars |
| 5 — My Library | Library list + sections + toggles, generic detail panel, component lib detection, component browser + self-referential previews, per-component toggle + Rebuild |
| 6 — Collections | Collections list + detail, new collection flow, missing skill detection + Save all missing |
| 7 — MCP Server | MCP server process, tool implementations, Claude Desktop config detection + sidebar status, app lifecycle integration |
| 8 — Polish | Window state persistence, update detection, error states, loading skeletons, keyboard shortcuts (Cmd+K = global search/command palette, Cmd+, = Settings modal), app icon + packaging (electron-builder), Windows support |

---

## Key Constraints

- **No CSS framework** — raw CSS with design tokens only
- **SQLite is source of truth** — GitHub API populates it, React reads from it (never direct API calls from components)
- **All secrets via electron-store** — never SQLite or localStorage
- **Skill generation is non-blocking** — fire-and-forget with async state updates
- **MCP server is the core value** — prioritise correctness over visual polish in early phases
- **macOS first** — Windows support added in Phase 8
- **Banner SVGs are deterministic** — same repo always produces identical banner
