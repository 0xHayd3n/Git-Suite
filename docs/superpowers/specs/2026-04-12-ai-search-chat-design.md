# AI Search Chat — Design Spec

## Overview

Add an AI-powered search mode to the SmartBar on the Discover view. Users toggle between normal search and AI search via a minimalist dropdown inside the search box. AI search opens an inline chat overlay where Claude Sonnet helps users find, evaluate, and manage repositories through natural conversation.

## SmartBar Mode Toggle

The search box gains a **mode selector** on the left side of the input — a clickable area showing the current mode icon plus a tiny chevron.

**Dropdown options:**
- **Search** (default) — magnifying glass icon, existing behavior unchanged
- **AI Search** — sparkles icon, switches to AI chat mode

**Visual changes when AI mode is active:**
- Search icon swaps to sparkles, colored purple (`#c084fc`)
- Search box border tinted purple (`rgba(168,85,247,0.3)`)
- Placeholder changes to `"Ask AI anything…"`
- Bucket bar dims to 35% opacity (visible but non-interactive)
- Enter key or send button opens/focuses the chat overlay

**Switching back to Search:**
- Chat overlay closes, conversation preserved in memory
- Buckets restore to full opacity
- Normal search behavior resumes

**No auth state:**
- If neither API key nor Claude Code CLI is configured, the "AI Search" option is grayed out with tooltip: "Connect to Claude in Settings"

## Chat Overlay Panel

Appears below the SmartBar when the user sends a message in AI mode.

**Layout:**
- Absolutely positioned, anchored to SmartBar bottom edge
- Full content width (`left: 20px; right: 20px`)
- Max height ~420px, scrollable message area
- Glassmorphic style: `rgba(0,0,0,0.85)` background, `backdrop-filter: blur(20px)`, subtle border
- Grid underneath dimmed with semi-transparent overlay
- `z-index: 150` (same layer as subtype popover)

**Message types:**
- **User messages** — right-aligned, blue-tinted bubble (`rgba(56,189,248,0.15)`)
- **AI messages** — left-aligned, dark bubble with purple ✦ avatar
- **Repo cards** — inline within AI messages: avatar, owner/name, description, stars, language, "View →" button
- **Action confirmations** — inline text (e.g., "Done! I've starred X and started generating the skill")

**Chat input:**
- Fixed at bottom of overlay panel
- Text input with placeholder `"Ask about repos, request actions…"`
- Send button with arrow icon, purple tint

**Closing:**
- Click outside the panel
- Press Escape
- Switch back to Search mode via dropdown
- Conversation preserved on close — reopening shows last conversation

## AI Actions & Capabilities

Claude can perform actions on the user's behalf through the existing IPC bridge.

**Supported actions:**
- **Navigate to repo** — repo card "View →" routes to `/repo/:owner/:name`
- **Star/unstar** — `window.api.github.starRepo(owner, name)` / `unstarRepo(owner, name)`
- **Install skill** — `window.api.skill.generate(owner, name, {})` with default options; fire-and-forget (skill generation progress is not shown in chat — user can check Library for status)
- **Search GitHub** — `window.api.github.searchRepos(query, sort?, order?, page?)` to find repos
- **Get repo details** — fetch README, topics, language for informed recommendations

**Response format:**
- Claude returns natural language text interleaved with structured JSON blocks for actions and repo cards
- Repo cards render from structured data; actions execute via IPC
- Action intents: `{ action: "star" | "install" | "navigate", owner: string, name: string }`

## Chat History & Persistence

**SQLite table — `ai_chats`:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `title` | TEXT | Auto-generated from first user message |
| `messages` | TEXT (JSON) | Array of message objects |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

**Message object shape:**
```typescript
interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
  repoCards?: { owner: string; name: string; description: string; stars: number; language: string }[]
  actions?: { action: string; owner: string; name: string; result?: string }[]
  timestamp: number
}
```

**History panel:**
- Accessed via "History" button in top-right of chat overlay
- Slides in as a list within the overlay, replacing message area temporarily
- Shows conversation titles sorted by most recent with relative timestamps
- Click to load conversation, "New conversation" button at top
- Delete button to remove old conversations

**IPC handlers:**
- `ai.getChats()` — list all (id, title, updated_at)
- `ai.getChat(id)` — load full conversation
- `ai.saveChat(chat)` — create or update
- `ai.deleteChat(id)` — remove

**Lifecycle:**
- Switching to AI mode loads most recent conversation (or starts new if none)
- Switching back to Search preserves active conversation
- New conversation auto-created if the most recent conversation's `updated_at` is older than 24 hours

## Claude Integration

**Model:** `claude-sonnet-4-6` (same as skill enhancement tier)

**Auth flow (on send):**
1. Check `getApiKey()` — if present, use Anthropic SDK directly
2. If no API key, check Claude Code CLI auth — if authenticated, use CLI
3. If neither, show error toast: "Connect to Claude in Settings to use AI Search"

**System prompt:**
- Role: "You are a GitHub repository assistant inside Git Suite. Help users find, evaluate, and manage repositories."
- Injected context per conversation:
  - User's starred repos (names + descriptions)
  - User's installed skills (to avoid redundant suggestions)
  - Available actions with structured output format
- Anti-hallucination: instruct Claude to only suggest repos it can verify via GitHub search

**Streaming:**
- Responses stream token-by-token into chat bubble
- Repo cards render once their structured block is complete
- Max output: 2048 tokens per response (enforced via `max_tokens` API parameter)

## Files Affected

**New files:**
- `src/components/AiChatOverlay.tsx` — chat overlay panel component
- `src/components/AiChatMessage.tsx` — message bubble + repo card rendering
- `src/components/AiChatHistory.tsx` — history list panel
- `electron/services/aiChatService.ts` — Claude API integration, system prompt, streaming
- `electron/ipc/aiChatHandlers.ts` — IPC handlers for chat CRUD + message sending

**Modified files:**
- `src/components/SmartBar.tsx` — add mode toggle dropdown, AI mode state, chat overlay mount
- `src/styles/globals.css` — styles for mode toggle, chat overlay, messages, repo cards
- `electron/main.ts` — register AI chat IPC handlers
- `electron/preload.ts` — expose `window.api.ai.*` namespace
- `electron/db.ts` — add `ai_chats` table creation
