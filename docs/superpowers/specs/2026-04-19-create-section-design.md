# Create Section — Design Spec

**Date:** 2026-04-19
**Status:** Approved

---

## Overview

Create is a new primary section in Git Suite, positioned between Library and Discover in the dock. It is a canvas-based tool builder where users mix GitHub repositories with AI guidance to produce new tools — MCP servers, web apps, CLI utilities, desktop widgets, and more. The output is always a GitHub repository owned by the user.

The interaction model: select a template, drop repos onto a canvas, have a guided AI conversation that builds the tool incrementally, watch a live preview run as code is generated, and publish to GitHub when ready.

---

## Navigation & Entry Point

- **Route:** `/create`
- **Dock position:** Between Library and Discover (third slot)
- **Dock icon:** ✦ (spark/create icon)
- **Landing:** Template gallery — not the canvas

---

## Template Gallery (Landing)

The first thing a user sees is a Canva-style grid of tool templates. Templates pre-populate the canvas with a tool type and give the AI a meaningful starting context.

**Template categories (filter tabs):**
- All
- MCP Server
- Web App
- CLI Tool
- Desktop Widget

**Initial template set (v1):**
| Template | Type | Description |
|---|---|---|
| MCP Server Starter | MCP Server | Expose tools, resources, and prompts to any MCP client |
| 3D Interactive App | Web App | Browser-based 3D with Three.js, physics, and shaders |
| CLI Tool | CLI Tool | Terminal utility, cross-platform, ships as a binary |
| Desktop Widget | Desktop | Always-on-top Electron overlay, cross-platform |
| Data Dashboard | Web App | Charts and tables connected to any API or dataset |
| Start from scratch | — | Blank canvas, no template |

A search bar and type filter sit above the grid. Templates are displayed as cards with a gradient header, type badge, name, and one-line description.

**First launch (no sessions):** Template grid is shown fullscreen with a brief tagline ("Build something new"). The Recent sessions strip only appears once at least one session exists.

**Recent sessions strip:** Shown above the template grid when sessions exist. Displays up to 6 most-recently-updated sessions as compact cards (name, type badge, last-updated time). Clicking a card navigates directly to the canvas for that session (`/create/:sessionId`).

---

## GitHub OAuth Scope Requirement

Creating repositories via the GitHub API (`POST /user/repos`) requires the `repo` scope, which is broader than the current `read:user,public_repo` scope used by the app's OAuth registration.

**Required action before implementation:**
1. Update the OAuth scope string in `electron/github.ts` from `read:user,public_repo` to `read:user,repo`
2. Update the GitHub OAuth app registration at github.com/settings/developers accordingly
3. Existing authenticated users will need to re-authorize — the app should detect a missing scope (403 on repo creation) and prompt re-authorization via `github:connect`

This is a prerequisite for the publish flow and must be done before the Create section ships.

---

## Canvas Layout

After selecting a template or clicking a session card, the user enters the three-panel canvas at `/create/:sessionId`.

### Top Metadata Bar

A slim bar spanning the full canvas width:
- Editable tool name (left)
- Tool type badge
- Repo context chips (added repos shown as removable tags, + repo button)
- **Draft / Published status** (right)
- **Publish** or **Push Update** button (right)

### Left Panel — Repo Browser

Two stacked sections:

1. **Your Library** — repos the user has saved in Git Suite, searchable. Already-added repos are highlighted.
2. **AI Suggests** — repos AI surfaces as relevant to the current template and conversation context.

Repos are dragged or clicked onto the canvas to add them as context. Adding a repo:
- Appends it as a chip in the metadata bar
- Marks the repo ID in the session's `repo_ids` list
- Injects its name, description, and first 500 chars of README into the next AI message's system context
- Triggers a `create:getSuggestions` refresh

**Suggestion refresh trigger:** `create:getSuggestions` fires only when a repo is added or removed, and when the session is first loaded. It does **not** fire on every chat message. Suggestions are stored in session state (not DB) and survive until the next trigger.

### Center Panel — Live Preview (type-specific adapters)

#### Web App / 3D App

A local static file server (HTTP) is spawned per session by the main process on session open. The preview uses an Electron `WebContentsView` (not `<webview>`, which is deprecated in Electron 31) embedded in the canvas, pointed at `http://localhost:{port}` where `port` is a randomly assigned free port tracked per session. The server is shut down when the session is closed.

After each AI generation step that produces file changes, the main process writes the new files to `local_path` and sends a reload signal to the `WebContentsView`.

Toolbar overlay (bottom of preview):
- `● Live` / `● Building...` / `● Error` status indicator
- `↺ Rebuild` — manual rebuild trigger
- `⇱ Open` — open `local_path` in the OS file manager
- `⛶ Fullscreen`

File strip (below preview): clickable list of all generated files in `local_path`. Clicking a file opens a read-only code inspector panel over the preview.

#### MCP Server

A subprocess is spawned by the main process via `child_process.spawn` running the generated server entry point (`node dist/index.js` or equivalent). Communication uses stdio (JSON-RPC per MCP spec). The subprocess is tracked per session (stored in a main-process map, not in DB).

Subprocess lifecycle:
- **Spawn:** on session open (if `local_path` has a built entry point) or after first successful build
- **Restart:** after each code generation step — kill existing process, rebuild, respawn
- **Kill:** on session close or app quit

Restart includes a 500ms debounce to avoid rapid respawns during multi-file AI generation.

Preview UI:
- Left: list of registered tools (fetched via `tools/list` JSON-RPC after spawn)
- Right: tool tester — select a tool, provide JSON inputs, call `tools/call`, display response
- Status: `● Running` / `● Building...` / `● Error (exit code N)`

#### CLI Tool

The generated CLI binary (or `node dist/cli.js` for Node-based tools) is run in an embedded terminal panel using `node-pty` — a native Node module that provides a real PTY. This adds a native dependency and must be included in the Electron build config (`extraResources` or `nativeModuleReplace`).

**Note:** `node-pty` requires native compilation and must be listed as a v1 dependency explicitly. If this is unacceptable for v1, CLI preview falls back to a non-interactive output panel (spawn process, capture stdout/stderr, display in a scrollable div — no stdin).

#### Desktop Widget

The widget is launched as a second `BrowserWindow` with `alwaysOnTop: true`. It is tracked in a main-process map keyed by session ID. Each session has at most one widget window at a time.

Widget window lifecycle:
- **Launch:** on first successful build or manual `↺ Relaunch`
- **Relaunch:** kill existing window, respawn — with 500ms debounce after code changes
- **Detach (`⇱ Detach`):** the window is removed from session tracking; it continues running independently. If the app quits, a detached widget window is also closed (standard Electron behavior). There is no mechanism to re-attach.
- **Session close:** tracked (non-detached) widget windows are closed

### Right Panel — AI Chat

The AI conversation is the build engine. It starts automatically with context from the selected template and any added repos.

**Conversation history & context management:** The Claude CLI subprocess model (`aiChatService`) is stateless — each call receives the full message history. For Create sessions, the full `chat_history` JSON array is loaded from DB and passed on every `create:sendMessage` call. To avoid hitting Claude's context limit on long sessions, context is managed as follows:
- Repo README injections are limited to the first 500 characters per repo
- After 20 messages, only the most recent 15 are passed as history (the first 5 are summarized by an AI pre-call and replaced with a summary message)
- Template context and repo list are always included as the system message (not truncated)

**Code extraction protocol:** AI responses for the Create section follow a structured format enforced by the system prompt:

```
<files>
<file path="src/scene.ts">
[file content]
</file>
<file path="package.json">
[file content]
</file>
</files>

[Human-readable explanation of what changed and why, optionally asking a follow-up question]
```

The main process parses `<files>` blocks first. Each `<file>` node is written to `{local_path}/{path}`. After writing, a diff of changed/new paths is computed and returned to the renderer as `changedFiles: string[]`. The human-readable text after `</files>` is shown in the chat bubble. If no `<files>` block is present, the full response is treated as a chat-only message (no file writes, no rebuild).

**Behavior:**
- AI opens with a targeted question based on the template
- Each user answer triggers a code generation step (may produce a `<files>` block)
- Changed files are shown inline in the chat as a compact diff summary (`+ particles.ts`, `~ scene.ts`)
- File changes trigger a preview rebuild automatically
- The user can steer at any point

---

## Publish Flow

Publishing is not a separate stage — it is a persistent state in the metadata bar.

### State: Draft

- Status pill: `● Draft`
- Button: `Publish ↗`
- Clicking Publish:
  1. Calls `create:publishToGitHub` — creates a new GitHub repo under the user's account via `POST /user/repos`
  2. Initializes a git repo in `local_path`, makes initial commit, and pushes using the token-in-remote-URL pattern: `https://{token}@github.com/{user}/{repo}.git`. The stored `github_repo_url` is the clean HTTPS URL (no token). Subsequent `create:pushUpdate` calls reconstruct the credential URL from the stored token each time.
  3. Triggers a separate AI call (`create:generateReadme`) to produce a README from the conversation summary — this runs async and does not block the initial push; silent failure is acceptable (the session README from the AI chat is already committed). The initial push includes whatever README.md the AI generated during the session.
  4. Updates `publish_status` to `'published'` and stores `github_repo_url` in DB
  5. Transitions UI to Published state

### State: Published (up to date)

- Status pill: `✓ Published · github.com/{user}/{repo} ↗`
- Button: `Push Update` (disabled)
- Changes pending is detected by the main process tracking a `dirty` boolean in memory per session. `dirty` is set to `true` after any file write from a code generation step post-publish. It is reset to `false` after a successful `create:pushUpdate`.

### State: Published (changes pending)

- Status pill: `✓ Published` + `{n} changes` badge (count from `changedFiles` since last push)
- Diff strip below metadata bar: `+ particles.ts  ~ scene.ts  ~ audio.ts`
- Button: `Push Update ↑` (active)
- Clicking Push Update: runs `git add . && git commit -m "Update via Git Suite Create"` then `git push https://{token}@github.com/{user}/{repo}.git` in `local_path` via `child_process.exec`. Token is read from the existing electron-store at push time. On success: `dirty = false`, badge clears.

---

## Sessions & Persistence

Each Create project is a **session**. Sessions persist across app restarts.

**`local_path` storage:** Generated files are stored in `{app.getPath('userData')}/create-sessions/{sessionId}/`. This is a stable, user-specific path that survives app updates. On `create:deleteSession`, the directory is removed with `fs.rm(local_path, { recursive: true })`.

**Stale path handling:** On session load, if `local_path` does not exist on disk (e.g., userData was cleared), the session loads in "files missing" state. The canvas shows a warning and a "Rebuild" button that re-triggers the last AI generation step to regenerate files.

**Session conflict avoidance:** Each session has its own subdirectory keyed by UUID session ID — no conflicts between sessions.

---

## Backend / IPC Handlers

New IPC channel: `create:*`

| Handler | Purpose |
|---|---|
| `create:getTemplates` | Return bundled template list |
| `create:startSession` | Initialize new session (template + optional repo list) → returns sessionId |
| `create:getSessions` | List existing sessions for landing page (sorted by updated_at desc) |
| `create:getSession` | Load a saved session by ID — returns full session including chat_history and file list from disk |
| `create:sendMessage` | Send chat message → AI response, write `<files>` to disk, return `{reply, changedFiles}` |
| `create:rebuildPreview` | Trigger preview rebuild for current tool type without a new AI message |
| `create:getMcpTools` | Query running MCP server subprocess for registered tools (tools/list) |
| `create:callMcpTool` | Call a registered MCP tool with given inputs (tools/call) |
| `create:getSuggestions` | Get AI repo suggestions given current template + repo list |
| `create:publishToGitHub` | Create GitHub repo + initial git push |
| `create:generateReadme` | Async AI call to produce README from conversation — called after publish |
| `create:pushUpdate` | Commit dirty files + push to existing repo |
| `create:deleteSession` | Remove session from DB + delete local_path directory |

**Session resumption:** Navigating to `/create/:sessionId` calls `create:getSession`. The canvas self-initializes from the returned data. `create:startSession` is only called when creating a brand-new session from the template gallery.

---

## Database

New table: `create_sessions`

```sql
CREATE TABLE create_sessions (
  id TEXT PRIMARY KEY,                -- UUID v4
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  tool_type TEXT NOT NULL,            -- 'mcp' | 'webapp' | 'cli' | 'widget' | 'blank'
  repo_ids TEXT NOT NULL DEFAULT '[]', -- JSON string[] of repo IDs; orphaned IDs are silently ignored on load
  chat_history TEXT NOT NULL DEFAULT '[]', -- JSON message[]
  local_path TEXT,                    -- absolute path under userData/create-sessions/{id}/
  publish_status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published'
  github_repo_url TEXT,               -- null if draft
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**`repo_ids` FK handling:** The column stores repo IDs as a JSON array with no DB-level FK constraint (matching the app's existing pattern). On session load, repo IDs that no longer exist in the `repos` table are silently filtered out — the session loads without them, and the UI shows the remaining repos.

**UUID generation:** Use the `crypto.randomUUID()` API available in Node 18+ (Electron 31 ships Node 20). No additional dependency needed.

---

## AI Integration

- Uses the existing Claude CLI subprocess model (`aiChatService`)
- System prompt per session: template name + tool type + repo names/descriptions/README excerpts (500 chars each) + code extraction format instructions
- `chat_history` is loaded from DB and passed in full on each call, with context truncation applied as described above
- `<files>` block parsing happens in the main process, not the renderer
- Streaming responses are piped to the renderer for real-time chat feel; file writes happen after the stream closes

---

## What This Is Not

- Not a code editor — the user doesn't write code directly; the AI does
- Not a package manager — repos are context and inspiration, not just npm installs
- Not limited to web — MCP servers, CLIs, and desktop widgets are first-class
- Not ephemeral — sessions persist; the user can return and keep building

---

## Out of Scope (v1)

- Collaborative multi-user sessions
- Forking another user's created tool
- Marketplace / sharing created tools publicly within Git Suite
- Running created tools on a remote server
- Version history / branching within a session (beyond git push)
- Browser Extension template type (tab included in filter for future use, no template in v1)
