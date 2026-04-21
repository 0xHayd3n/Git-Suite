# AI Search Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered chat search mode to the SmartBar, allowing users to converse with Claude Sonnet to discover, evaluate, and manage GitHub repositories.

**Architecture:** A mode toggle dropdown in the SmartBar switches between normal search and AI chat. AI mode opens an overlay chat panel below the SmartBar. Messages are sent to Claude Sonnet via the existing Anthropic SDK / Claude Code CLI fallback. Chat history persists in SQLite. Claude can execute actions (star, install skill, navigate) via the existing IPC bridge.

**Tech Stack:** React 18, TypeScript, Electron IPC, Anthropic SDK (`@anthropic-ai/sdk`), better-sqlite3, lucide-react icons

---

## File Structure

| File | Responsibility |
|------|----------------|
| `electron/db.ts` | Add `ai_chats` table (migration phase 20) |
| `electron/services/aiChatService.ts` | Claude API integration — system prompt, streaming, message sending |
| `electron/ipc/aiChatHandlers.ts` | IPC handlers for chat CRUD + sending messages to Claude |
| `electron/main.ts` | Import and register AI chat handlers |
| `electron/preload.ts` | Expose `window.api.ai.*` namespace |
| `src/components/SmartBar.tsx` | Add mode toggle dropdown, AI mode state prop, chat overlay mount point |
| `src/components/AiChatOverlay.tsx` | Chat overlay panel — messages, input, repo cards, history |
| `src/styles/globals.css` | Styles for mode toggle, dropdown, chat overlay, messages, repo cards |
| `src/views/Discover.tsx` | Add AI mode state, pass to SmartBar, handle navigation from chat |

---

### Task 1: Database — Add `ai_chats` Table

**Files:**
- Modify: `electron/db.ts` (add migration phase 20 after line 145)

- [ ] **Step 1: Add the migration in `db.ts`**

After the existing Phase 19 migration block (line 145: `try { db.exec('ALTER TABLE repos ADD COLUMN created_at TEXT') } catch {}`), add:

```typescript
// Phase 20 – AI chat history
db.exec(`CREATE TABLE IF NOT EXISTS ai_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  messages TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`)
```

- [ ] **Step 2: Verify the app starts without errors**

Run: `npx electron-vite build && npx electron .`
Expected: App launches, no crash. Check DevTools console for DB errors.

- [ ] **Step 3: Commit**

```bash
git add electron/db.ts
git commit -m "feat(db): add ai_chats table for AI search history"
```

---

### Task 2: AI Chat Service — Claude Integration with Streaming

**Files:**
- Create: `electron/services/aiChatService.ts`

- [ ] **Step 1: Create the service file**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from '../store'

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
  repoCards?: { owner: string; name: string; description: string; stars: number; language: string }[]
  actions?: { action: string; owner: string; name: string; result?: string }[]
  timestamp: number
}

interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: string) => void
}

function buildSystemPrompt(starredRepos: string[], installedSkills: string[]): string {
  return `You are a GitHub repository assistant inside Git Suite. Help users find, evaluate, and manage repositories.

You can perform these actions by including JSON blocks in your response:

1. Suggest repos — include a block like:
\`\`\`repo
{"owner":"example","name":"repo","description":"A great tool","stars":1234,"language":"TypeScript"}
\`\`\`

2. Execute actions — include a block like:
\`\`\`action
{"action":"star","owner":"example","name":"repo"}
\`\`\`
Valid actions: "star", "unstar", "install" (generates skill), "navigate" (opens repo detail)

Keep responses concise and helpful. Only suggest repos you are confident exist on GitHub.
When suggesting repos, always include the \`\`\`repo block so they render as clickable cards.

${starredRepos.length > 0 ? `\nUser's starred repos (don't re-suggest unless asked): ${starredRepos.join(', ')}` : ''}
${installedSkills.length > 0 ? `\nUser's installed skills (don't suggest installing again): ${installedSkills.join(', ')}` : ''}`
}

export async function sendMessageStream(
  messages: AiChatMessage[],
  starredRepos: string[],
  installedSkills: string[],
  callbacks: StreamCallbacks
): Promise<void> {
  const apiKey = getApiKey()

  // Fallback: try Claude Code CLI if no API key
  if (!apiKey) {
    try {
      const { checkAuthStatus, generateWithRawPrompt } = await import('../skill-gen/legacy')
      const authed = await checkAuthStatus()
      if (authed) {
        const systemPrompt = buildSystemPrompt(starredRepos, installedSkills)
        const apiMessages = messages.map(m => ({ role: m.role, content: m.content }))
        const prompt = `${systemPrompt}\n\n${apiMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`
        // generateWithRawPrompt(prompt, readme, options) — pass empty readme, use sonnet
        const result = await generateWithRawPrompt(prompt, '', { model: 'claude-sonnet-4-6', maxTokens: 2048 })
        callbacks.onDone(result)
        return
      }
    } catch {}
    callbacks.onError('No API key configured. Connect to Claude in Settings.')
    return
  }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(starredRepos, installedSkills)

  const apiMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: apiMessages,
    })

    let fullText = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const token = event.delta.text
        fullText += token
        callbacks.onToken(token)
      }
    }
    callbacks.onDone(fullText)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    callbacks.onError(message)
  }
}

export function parseAssistantMessage(content: string): AiChatMessage {
  const repoCards: AiChatMessage['repoCards'] = []
  const actions: AiChatMessage['actions'] = []

  const repoRegex = /```repo\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = repoRegex.exec(content)) !== null) {
    try { repoCards.push(JSON.parse(match[1].trim())) } catch {}
  }

  const actionRegex = /```action\n([\s\S]*?)```/g
  while ((match = actionRegex.exec(content)) !== null) {
    try { actions.push(JSON.parse(match[1].trim())) } catch {}
  }

  return {
    role: 'assistant',
    content,
    repoCards: repoCards.length > 0 ? repoCards : undefined,
    actions: actions.length > 0 ? actions : undefined,
    timestamp: Date.now(),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/aiChatService.ts
git commit -m "feat: add AI chat service with Claude streaming and message parsing"
```

---

### Task 3: IPC Handlers — Chat CRUD and Message Sending

**Files:**
- Create: `electron/ipc/aiChatHandlers.ts`

- [ ] **Step 1: Create the IPC handler file**

```typescript
import { ipcMain, app, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { sendMessageStream, parseAssistantMessage, AiChatMessage } from '../services/aiChatService'

export function registerAiChatHandlers(): void {
  ipcMain.handle('ai:getChats', () => {
    const db = getDb(app.getPath('userData'))
    return db.prepare(
      'SELECT id, title, updated_at FROM ai_chats ORDER BY updated_at DESC'
    ).all()
  })

  ipcMain.handle('ai:getChat', (_event, id: number) => {
    const db = getDb(app.getPath('userData'))
    const row = db.prepare('SELECT * FROM ai_chats WHERE id = ?').get(id) as {
      id: number; title: string; messages: string; created_at: string; updated_at: string
    } | undefined
    if (!row) return null
    return { ...row, messages: JSON.parse(row.messages) as AiChatMessage[] }
  })

  ipcMain.handle('ai:saveChat', (_event, chat: { id?: number; title: string; messages: AiChatMessage[] }) => {
    const db = getDb(app.getPath('userData'))
    const messagesJson = JSON.stringify(chat.messages)
    if (chat.id) {
      db.prepare(
        'UPDATE ai_chats SET title = ?, messages = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(chat.title, messagesJson, chat.id)
      return chat.id
    } else {
      const result = db.prepare(
        'INSERT INTO ai_chats (title, messages) VALUES (?, ?)'
      ).run(chat.title, messagesJson)
      return result.lastInsertRowid
    }
  })

  ipcMain.handle('ai:deleteChat', (_event, id: number) => {
    const db = getDb(app.getPath('userData'))
    db.prepare('DELETE FROM ai_chats WHERE id = ?').run(id)
  })

  ipcMain.handle('ai:sendMessage', async (event, payload: {
    messages: AiChatMessage[]
    starredRepos: string[]
    installedSkills: string[]
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return new Promise<string>((resolve, reject) => {
      sendMessageStream(
        payload.messages,
        payload.starredRepos,
        payload.installedSkills,
        {
          onToken: (token) => {
            win?.webContents.send('ai:stream-token', token)
          },
          onDone: (fullText) => {
            resolve(fullText)
          },
          onError: (error) => {
            reject(new Error(error))
          },
        }
      )
    })
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc/aiChatHandlers.ts
git commit -m "feat: add AI chat IPC handlers for CRUD and streaming"
```

---

### Task 4: Register IPC Handlers and Preload Bridge

**Files:**
- Modify: `electron/main.ts` (add import + registration call)
- Modify: `electron/preload.ts` (add `ai` namespace)

- [ ] **Step 1: Register handlers in `main.ts`**

Add import near other IPC handler imports (around line 30):
```typescript
import { registerAiChatHandlers } from './ipc/aiChatHandlers'
```

Add registration call near line 1765 (after `registerDownloadHandlers()`):
```typescript
registerAiChatHandlers()
```

- [ ] **Step 2: Add preload bridge in `preload.ts`**

Add the `ai` namespace inside the `contextBridge.exposeInMainWorld('api', { ... })` object, after the `download` namespace (around line 241):

```typescript
ai: {
  getChats: () => ipcRenderer.invoke('ai:getChats'),
  getChat: (id: number) => ipcRenderer.invoke('ai:getChat', id),
  saveChat: (chat: { id?: number; title: string; messages: unknown[] }) =>
    ipcRenderer.invoke('ai:saveChat', chat),
  deleteChat: (id: number) => ipcRenderer.invoke('ai:deleteChat', id),
  sendMessage: (payload: { messages: unknown[]; starredRepos: string[]; installedSkills: string[] }) =>
    ipcRenderer.invoke('ai:sendMessage', payload),
  onStreamToken: (cb: (token: string) => void) => {
    const wrapper = (_event: unknown, token: string) => cb(token)
    callbackWrappers.set(cb, wrapper)
    ipcRenderer.on('ai:stream-token', wrapper)
  },
  offStreamToken: (cb: (token: string) => void) => {
    const wrapper = callbackWrappers.get(cb)
    if (wrapper) {
      ipcRenderer.removeListener('ai:stream-token', wrapper)
      callbackWrappers.delete(cb)
    }
  },
},
```

- [ ] **Step 3: Extend `src/env.d.ts` with AI types**

Find the existing `Window` interface in `src/env.d.ts` and add the `ai` namespace to the `api` object type. Add the `AiChatMessage` import from `./components/AiChatOverlay.types` and add:

```typescript
ai: {
  getChats: () => Promise<{ id: number; title: string; updated_at: string }[]>
  getChat: (id: number) => Promise<{ id: number; title: string; messages: AiChatMessage[]; created_at: string; updated_at: string } | null>
  saveChat: (chat: { id?: number; title: string; messages: AiChatMessage[] }) => Promise<number>
  deleteChat: (id: number) => Promise<void>
  sendMessage: (payload: { messages: AiChatMessage[]; starredRepos: string[]; installedSkills: string[] }) => Promise<string>
  onStreamToken: (cb: (token: string) => void) => void
  offStreamToken: (cb: (token: string) => void) => void
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/preload.ts src/env.d.ts
git commit -m "feat: register AI chat IPC handlers and preload bridge"
```

---

### Task 5: SmartBar — Mode Toggle Dropdown

**Files:**
- Modify: `src/components/SmartBar.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add mode toggle state and props to SmartBar**

In `SmartBar.tsx`, add `Sparkles` and `ChevronDown` to the lucide-react imports (line 1):

```typescript
import { Search, X, Sparkles, ChevronDown, /* ...existing imports... */ } from 'lucide-react'
```

Update the `SmartBarProps` interface (lines 127-135) to add:

```typescript
interface SmartBarProps {
  query: string
  onQueryChange: (q: string) => void
  activeBucket: string | null
  onBucketChange: (bucketId: string | null) => void
  inputRef?: React.Ref<HTMLInputElement>
  selectedTypes: string[]
  onSelectedTypesChange: (types: string[]) => void
  aiMode: boolean
  onAiModeChange: (aiMode: boolean) => void
  onAiSubmit?: (query: string) => void
}
```

Add state for the dropdown inside the component function (after line 145):

```typescript
const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
const modeDropdownRef = useRef<HTMLDivElement>(null)
```

Add a click-outside handler for the mode dropdown (add a new useEffect):

```typescript
useEffect(() => {
  if (!modeDropdownOpen) return
  const handleClick = (e: MouseEvent) => {
    if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
      setModeDropdownOpen(false)
    }
  }
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setModeDropdownOpen(false)
  }
  document.addEventListener('mousedown', handleClick)
  document.addEventListener('keydown', handleEscape)
  return () => {
    document.removeEventListener('mousedown', handleClick)
    document.removeEventListener('keydown', handleEscape)
  }
}, [modeDropdownOpen])
```

- [ ] **Step 2: Update the search box JSX**

Replace the search input section (lines 252-272) with:

```tsx
<div className="smart-bar-search" style={aiMode ? { borderColor: 'rgba(168,85,247,0.3)' } : undefined} ref={modeDropdownRef}>
  <button
    className="smart-bar-mode-toggle"
    onClick={() => setModeDropdownOpen(prev => !prev)}
  >
    {aiMode
      ? <Sparkles size={13} style={{ color: '#c084fc' }} />
      : <Search size={13} className="smart-bar-search-icon" />
    }
    <ChevronDown size={8} style={{ color: 'var(--t3)' }} />
  </button>
  {modeDropdownOpen && (
    <div className="smart-bar-mode-dropdown">
      <button
        className={`smart-bar-mode-option ${!aiMode ? 'active' : ''}`}
        onClick={() => { onAiModeChange(false); setModeDropdownOpen(false) }}
      >
        <Search size={13} /> Search
      </button>
      <button
        className={`smart-bar-mode-option ${aiMode ? 'active' : ''}`}
        onClick={() => { onAiModeChange(true); setModeDropdownOpen(false) }}
      >
        <Sparkles size={13} /> AI Search
      </button>
    </div>
  )}
  <div className="smart-bar-search-divider" />
  <input
    className="smart-bar-search-input"
    type="text"
    placeholder={aiMode ? 'Ask AI anything…' : 'Search repositories…'}
    value={query}
    onChange={e => onQueryChange(e.target.value)}
    onKeyDown={e => {
      if (e.key === 'Enter' && aiMode && query.trim() && onAiSubmit) {
        onAiSubmit(query.trim())
      }
    }}
    ref={inputRef}
  />
  {query && (
    <button className="smart-bar-search-clear" onClick={() => onQueryChange('')}>
      <X size={12} />
    </button>
  )}
</div>
```

- [ ] **Step 3: Dim bucket bar in AI mode**

On the bucket wrapper div (around line 185), add an opacity style:

```tsx
<div className="smart-bar-buckets-wrapper" ref={wrapperRef} style={aiMode ? { opacity: 0.35, pointerEvents: 'none' } : undefined}>
```

- [ ] **Step 4: Add CSS for mode toggle and dropdown**

In `src/styles/globals.css`, add after the `.smart-bar-search-clear:hover` block (around line 7659):

```css
/* ── SmartBar Mode Toggle ─────────────────────────────────────── */
.smart-bar-mode-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 4px;
  transition: background 0.12s;
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--t3);
}
.smart-bar-mode-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
}

.smart-bar-search-divider {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.smart-bar-mode-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 200;
  min-width: 150px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 10px;
  padding: 4px;
}

.smart-bar-mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  color: var(--t2);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  border: none;
  background: none;
  text-align: left;
}
.smart-bar-mode-option:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--t1);
}
.smart-bar-mode-option.active {
  color: var(--t1);
  font-weight: 500;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/SmartBar.tsx src/styles/globals.css
git commit -m "feat: add search/AI mode toggle dropdown to SmartBar"
```

---

### Task 6: Chat Overlay Component

**Files:**
- Create: `src/components/AiChatOverlay.tsx`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Create `AiChatOverlay.tsx`**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Clock, Plus, Trash2 } from 'lucide-react'
import type { AiChatMessage } from './AiChatOverlay.types'

// Re-export type for consumers
export type { AiChatMessage }

interface RepoCard {
  owner: string
  name: string
  description: string
  stars: number
  language: string
}

interface AiChat {
  id?: number
  title: string
  messages: AiChatMessage[]
  created_at?: string
  updated_at?: string
}

interface AiChatOverlayProps {
  visible: boolean
  onClose: () => void
  onNavigate: (owner: string, name: string) => void
  initialQuery?: string
  onInitialQueryConsumed?: () => void
}

// NOTE: Do NOT declare global Window here. Instead, extend the existing
// src/env.d.ts with the `ai` namespace. Add to the existing Window.api interface:
//   ai: {
//     getChats: () => Promise<{ id: number; title: string; updated_at: string }[]>
//     getChat: (id: number) => Promise<AiChat | null>
//     saveChat: (chat: { id?: number; title: string; messages: AiChatMessage[] }) => Promise<number>
//     deleteChat: (id: number) => Promise<void>
//     sendMessage: (payload: { messages: AiChatMessage[]; starredRepos: string[]; installedSkills: string[] }) => Promise<string>
//     onStreamToken: (cb: (token: string) => void) => void
//     offStreamToken: (cb: (token: string) => void) => void
//   }

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function AiChatOverlay({ visible, onClose, onNavigate, initialQuery, onInitialQueryConsumed }: AiChatOverlayProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [chatId, setChatId] = useState<number | undefined>()
  const [showHistory, setShowHistory] = useState(false)
  const [chatList, setChatList] = useState<{ id: number; title: string; updated_at: string }[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // Focus input when overlay opens
  useEffect(() => {
    if (visible) inputRef.current?.focus()
  }, [visible])

  // Auto-send initial query from SmartBar
  useEffect(() => {
    if (visible && initialQuery && messages.length === 0 && !streaming) {
      onInitialQueryConsumed?.()
      // Directly invoke send logic with the initial query
      const userMsg: AiChatMessage = { role: 'user', content: initialQuery, timestamp: Date.now() }
      setMessages([userMsg])
      setStreaming(true)
      setStreamText('')
      ;(async () => {
        try {
          const [starred, library] = await Promise.all([
            window.api.starred.getAll(),
            window.api.library.getAll(),
          ])
          const fullText = await window.api.ai.sendMessage({
            messages: [userMsg],
            starredRepos: starred.map(r => `${r.owner}/${r.name}`),
            installedSkills: library.map(r => `${r.owner}/${r.name}`),
          })
          const repoCards: AiChatMessage['repoCards'] = []
          const actions: AiChatMessage['actions'] = []
          const repoRegex = /```repo\n([\s\S]*?)```/g
          let match: RegExpExecArray | null
          while ((match = repoRegex.exec(fullText)) !== null) {
            try { repoCards.push(JSON.parse(match[1].trim())) } catch {}
          }
          const actionRegex = /```action\n([\s\S]*?)```/g
          while ((match = actionRegex.exec(fullText)) !== null) {
            try { actions.push(JSON.parse(match[1].trim())) } catch {}
          }
          for (const action of actions) {
            try {
              if (action.action === 'star') await window.api.github.starRepo(action.owner, action.name)
              else if (action.action === 'install') await window.api.skill.generate(action.owner, action.name, {})
              else if (action.action === 'navigate') onNavigate(action.owner, action.name)
              action.result = 'success'
            } catch { action.result = 'failed' }
          }
          const assistantMsg: AiChatMessage = {
            role: 'assistant', content: fullText,
            repoCards: repoCards.length > 0 ? repoCards : undefined,
            actions: actions.length > 0 ? actions : undefined,
            timestamp: Date.now(),
          }
          const finalMessages = [userMsg, assistantMsg]
          setMessages(finalMessages)
          const savedId = await window.api.ai.saveChat({
            title: initialQuery.slice(0, 60),
            messages: finalMessages,
          })
          setChatId(savedId)
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`, timestamp: Date.now(),
          }])
        } finally { setStreaming(false); setStreamText('') }
      })()
    }
  }, [visible, initialQuery])

  // Load most recent chat on first open
  useEffect(() => {
    if (!visible) return
    window.api.ai.getChats().then(chats => {
      if (chats.length > 0) {
        const latest = chats[0]
        const cutoff = Date.now() - 24 * 60 * 60 * 1000
        if (new Date(latest.updated_at).getTime() > cutoff) {
          window.api.ai.getChat(latest.id).then(chat => {
            if (chat) {
              setMessages(chat.messages)
              setChatId(chat.id)
            }
          })
        }
      }
    })
  }, [visible])

  // Click outside to close
  useEffect(() => {
    if (!visible) return
    const handleClick = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Delay to avoid immediate close from the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEscape)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, onClose])

  // Stream token listener
  const handleToken = useCallback((token: string) => {
    setStreamText(prev => prev + token)
  }, [])

  useEffect(() => {
    window.api.ai.onStreamToken(handleToken)
    return () => window.api.ai.offStreamToken(handleToken)
  }, [handleToken])

  async function handleSend() {
    if (!input.trim() || streaming) return

    const userMsg: AiChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setStreaming(true)
    setStreamText('')

    try {
      const [starred, library] = await Promise.all([
        window.api.starred.getAll(),
        window.api.library.getAll(),
      ])
      const starredNames = starred.map(r => `${r.owner}/${r.name}`)
      const installedNames = library.map(r => `${r.owner}/${r.name}`)

      const fullText = await window.api.ai.sendMessage({
        messages: updatedMessages,
        starredRepos: starredNames,
        installedSkills: installedNames,
      })

      // Parse repo cards and actions from response
      const repoCards: RepoCard[] = []
      const actions: { action: string; owner: string; name: string; result?: string }[] = []

      const repoRegex = /```repo\n([\s\S]*?)```/g
      let match: RegExpExecArray | null
      while ((match = repoRegex.exec(fullText)) !== null) {
        try { repoCards.push(JSON.parse(match[1].trim())) } catch {}
      }
      const actionRegex = /```action\n([\s\S]*?)```/g
      while ((match = actionRegex.exec(fullText)) !== null) {
        try { actions.push(JSON.parse(match[1].trim())) } catch {}
      }

      // Execute actions
      for (const action of actions) {
        try {
          if (action.action === 'star') await window.api.github.starRepo(action.owner, action.name)
          else if (action.action === 'unstar') await window.api.github.unstarRepo(action.owner, action.name)
          else if (action.action === 'install') await window.api.skill.generate(action.owner, action.name, {})
          else if (action.action === 'navigate') onNavigate(action.owner, action.name)
          action.result = 'success'
        } catch (err) {
          action.result = 'failed'
        }
      }

      const assistantMsg: AiChatMessage = {
        role: 'assistant',
        content: fullText,
        repoCards: repoCards.length > 0 ? repoCards : undefined,
        actions: actions.length > 0 ? actions : undefined,
        timestamp: Date.now(),
      }

      const finalMessages = [...updatedMessages, assistantMsg]
      setMessages(finalMessages)

      // Save to DB
      const title = chatId ? undefined : updatedMessages[0]?.content.slice(0, 60) || 'New chat'
      const savedId = await window.api.ai.saveChat({
        id: chatId,
        title: title || 'Chat',
        messages: finalMessages,
      })
      if (!chatId) setChatId(savedId)
    } catch (err) {
      const errorMsg: AiChatMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setStreaming(false)
      setStreamText('')
    }
  }

  async function handleNewChat() {
    setMessages([])
    setChatId(undefined)
    setShowHistory(false)
    inputRef.current?.focus()
  }

  async function handleLoadChat(id: number) {
    const chat = await window.api.ai.getChat(id)
    if (chat) {
      setMessages(chat.messages)
      setChatId(chat.id)
    }
    setShowHistory(false)
  }

  async function handleDeleteChat(id: number) {
    await window.api.ai.deleteChat(id)
    setChatList(prev => prev.filter(c => c.id !== id))
    if (chatId === id) handleNewChat()
  }

  async function handleShowHistory() {
    const chats = await window.api.ai.getChats()
    setChatList(chats)
    setShowHistory(true)
  }

  function renderContent(content: string): string {
    // Strip ```repo and ```action blocks from display text
    return content
      .replace(/```repo\n[\s\S]*?```/g, '')
      .replace(/```action\n[\s\S]*?```/g, '')
      .trim()
  }

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  if (!visible) return null

  return (
    <div className="ai-chat-overlay" ref={overlayRef}>
      <button className="ai-chat-history-tab" onClick={handleShowHistory}>
        <Clock size={12} style={{ marginRight: 3 }} />
        History
      </button>

      {showHistory ? (
        <div className="ai-chat-history">
          <div className="ai-chat-history-header">
            <button className="ai-chat-new-btn" onClick={handleNewChat}>
              <Plus size={12} /> New chat
            </button>
          </div>
          <div className="ai-chat-history-list">
            {chatList.map(chat => (
              <div key={chat.id} className="ai-chat-history-item">
                <button className="ai-chat-history-item-btn" onClick={() => handleLoadChat(chat.id)}>
                  <span className="ai-chat-history-title">{chat.title}</span>
                  <span className="ai-chat-history-time">{relativeTime(chat.updated_at)}</span>
                </button>
                <button className="ai-chat-history-delete" onClick={() => handleDeleteChat(chat.id)}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {chatList.length === 0 && (
              <div className="ai-chat-history-empty">No conversations yet</div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="ai-chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-msg ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="ai-chat-avatar">✦</div>
                )}
                <div>
                  <div className="ai-chat-bubble">{renderContent(msg.content)}</div>
                  {msg.repoCards?.map((repo, j) => (
                    <div
                      key={j}
                      className="ai-chat-repo-card"
                      onClick={() => onNavigate(repo.owner, repo.name)}
                    >
                      <div className="ai-chat-repo-info">
                        <div className="ai-chat-repo-name">{repo.owner}/{repo.name}</div>
                        <div className="ai-chat-repo-desc">{repo.description}</div>
                        <div className="ai-chat-repo-meta">
                          <span>⭐ {formatStars(repo.stars)}</span>
                          <span>{repo.language}</span>
                        </div>
                      </div>
                      <button
                        className="ai-chat-repo-action"
                        onClick={e => { e.stopPropagation(); onNavigate(repo.owner, repo.name) }}
                      >
                        View →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {streaming && streamText && (
              <div className="ai-chat-msg assistant">
                <div className="ai-chat-avatar">✦</div>
                <div className="ai-chat-bubble">{renderContent(streamText)}</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="ai-chat-input-area">
            <input
              ref={inputRef}
              className="ai-chat-input"
              placeholder="Ask about repos, request actions…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
              disabled={streaming}
            />
            <button className="ai-chat-send" onClick={handleSend} disabled={streaming}>
              <Send size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the types file**

Create `src/components/AiChatOverlay.types.ts`:

```typescript
export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
  repoCards?: { owner: string; name: string; description: string; stars: number; language: string }[]
  actions?: { action: string; owner: string; name: string; result?: string }[]
  timestamp: number
}
```

- [ ] **Step 3: Add CSS for the chat overlay**

In `src/styles/globals.css`, add after the mode toggle styles:

```css
/* ── AI Chat Overlay ──────────────────────────────────────────── */
.ai-chat-overlay {
  position: absolute;
  top: calc(100% + 6px);
  left: 20px;
  right: 20px;
  z-index: 150;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-chat-history-tab {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  color: var(--t3);
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  transition: color 0.12s, background 0.12s;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  z-index: 1;
}
.ai-chat-history-tab:hover {
  color: var(--t1);
  background: rgba(255, 255, 255, 0.04);
}

.ai-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-chat-messages::-webkit-scrollbar { width: 4px; }
.ai-chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.ai-chat-msg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.ai-chat-msg.user {
  justify-content: flex-end;
}

.ai-chat-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.ai-chat-bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.ai-chat-msg.user .ai-chat-bubble {
  background: rgba(56, 189, 248, 0.15);
  color: var(--t1);
  border-bottom-right-radius: 3px;
}
.ai-chat-msg.assistant .ai-chat-bubble {
  background: rgba(255, 255, 255, 0.05);
  color: var(--t2);
  border-bottom-left-radius: 3px;
}

/* Repo cards inside chat */
.ai-chat-repo-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  margin-top: 6px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.ai-chat-repo-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.14);
}
.ai-chat-repo-info { flex: 1; }
.ai-chat-repo-name { font-size: 12px; font-weight: 600; color: var(--t1); }
.ai-chat-repo-desc { font-size: 11px; color: var(--t3); margin-top: 1px; }
.ai-chat-repo-meta { font-size: 10px; color: var(--t3); margin-top: 2px; display: flex; gap: 10px; }
.ai-chat-repo-action {
  font-size: 10px;
  color: #38bdf8;
  padding: 3px 8px;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 5px;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s;
}
.ai-chat-repo-action:hover {
  background: rgba(56, 189, 248, 0.1);
}

/* Chat input */
.ai-chat-input-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.ai-chat-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--t1);
  font-size: 12.5px;
  outline: none;
  font-family: 'Inter', sans-serif;
}
.ai-chat-input::placeholder { color: var(--t3); }
.ai-chat-input:focus { border-color: rgba(168, 85, 247, 0.3); }
.ai-chat-send {
  background: rgba(168, 85, 247, 0.2);
  border: none;
  color: #c084fc;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
  display: flex;
  align-items: center;
}
.ai-chat-send:hover { background: rgba(168, 85, 247, 0.35); }
.ai-chat-send:disabled { opacity: 0.4; cursor: default; }

/* History panel */
.ai-chat-history {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 420px;
}
.ai-chat-history-header {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ai-chat-new-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #c084fc;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.ai-chat-new-btn:hover { background: rgba(168, 85, 247, 0.1); }
.ai-chat-history-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}
.ai-chat-history-item {
  display: flex;
  align-items: center;
}
.ai-chat-history-item-btn {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--t2);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.ai-chat-history-item-btn:hover { background: rgba(255, 255, 255, 0.04); }
.ai-chat-history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.ai-chat-history-time { font-size: 10px; color: var(--t3); flex-shrink: 0; }
.ai-chat-history-delete {
  color: var(--t3);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
}
.ai-chat-history-item:hover .ai-chat-history-delete { opacity: 1; }
.ai-chat-history-delete:hover { color: #f87171; }
.ai-chat-history-empty {
  text-align: center;
  color: var(--t3);
  font-size: 12px;
  padding: 30px;
}

/* Dimmed grid behind overlay */
.discover-content-dimmed {
  opacity: 0.3;
  pointer-events: none;
  transition: opacity 0.2s;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/AiChatOverlay.tsx src/components/AiChatOverlay.types.ts src/styles/globals.css
git commit -m "feat: add AI chat overlay component with streaming, history, and repo cards"
```

---

### Task 7: Wire Everything into Discover View

**Files:**
- Modify: `src/views/Discover.tsx`
- Modify: `src/components/SmartBar.tsx` (minor: remove old search icon)

- [ ] **Step 1: Add AI mode state and chat overlay to Discover.tsx**

Add imports at the top of `Discover.tsx`:

```typescript
import AiChatOverlay from '../components/AiChatOverlay'
```

Add state variables (near the existing `activeBucket` / `selectedTypes` state, around line 90):

```typescript
const [aiMode, setAiMode] = useState(false)
const [aiChatVisible, setAiChatVisible] = useState(false)
const [aiInitialQuery, setAiInitialQuery] = useState<string | undefined>()
```

Add handler for AI submit (near `handleBucketChange`):

```typescript
function handleAiSubmit(query: string) {
  setAiInitialQuery(query)
  setAiChatVisible(true)
  setContextQuery('')  // Clear the SmartBar input after handing off to chat
}
```

Add handler for navigation from chat:

```typescript
function handleAiNavigate(owner: string, name: string) {
  navigate(`/repo/${owner}/${name}`)
}
```

- [ ] **Step 2: Update SmartBar props in Discover.tsx**

Update the SmartBar JSX (lines 840-848) to pass new props:

```tsx
<SmartBar
  query={contextQuery}
  onQueryChange={setContextQuery}
  activeBucket={activeBucket}
  onBucketChange={handleBucketChange}
  inputRef={discoverInputRef}
  selectedTypes={selectedTypes}
  onSelectedTypesChange={setSelectedTypes}
  aiMode={aiMode}
  onAiModeChange={setAiMode}
  onAiSubmit={handleAiSubmit}
/>
```

- [ ] **Step 3: Mount AiChatOverlay and add dim class**

Add the chat overlay right after SmartBar in the JSX, inside the `smart-bar` parent's relative container. The SmartBar's parent div should wrap both:

```tsx
<div style={{ position: 'relative' }}>
  <SmartBar
    query={contextQuery}
    onQueryChange={setContextQuery}
    activeBucket={activeBucket}
    onBucketChange={handleBucketChange}
    inputRef={discoverInputRef}
    selectedTypes={selectedTypes}
    onSelectedTypesChange={setSelectedTypes}
    aiMode={aiMode}
    onAiModeChange={setAiMode}
    onAiSubmit={handleAiSubmit}
  />
  <AiChatOverlay
    visible={aiChatVisible}
    onClose={() => setAiChatVisible(false)}
    onNavigate={handleAiNavigate}
    initialQuery={aiInitialQuery}
    onInitialQueryConsumed={() => setAiInitialQuery(undefined)}
  />
</div>
```

On the discover-content scrollable div (around line 911), add conditional dimming:

```tsx
<div className={`discover-content ${aiChatVisible ? 'discover-content-dimmed' : ''}`}>
```

- [ ] **Step 4: Update SmartBar test base props**

In `src/components/SmartBar.test.tsx`, add the new props to `baseProps`:

```typescript
const baseProps = {
  query: '',
  onQueryChange: vi.fn(),
  activeBucket: null,
  onBucketChange: vi.fn(),
  selectedTypes: [] as string[],
  onSelectedTypesChange: vi.fn(),
  aiMode: false,
  onAiModeChange: vi.fn(),
}
```

- [ ] **Step 5: Commit**

```bash
git add src/views/Discover.tsx src/components/SmartBar.test.tsx
git commit -m "feat: wire AI chat overlay into Discover view with mode toggle"
```

---

### Task 8: Disable AI Search When Not Authenticated

**Files:**
- Modify: `src/components/SmartBar.tsx`
- Modify: `src/views/Discover.tsx`

- [ ] **Step 1: Add `aiAvailable` prop to SmartBar**

In `SmartBarProps`, add:

```typescript
aiAvailable?: boolean
```

In the mode dropdown, disable the AI option when not available:

```tsx
<button
  className={`smart-bar-mode-option ${aiMode ? 'active' : ''}`}
  onClick={() => {
    if (aiAvailable) { onAiModeChange(true); setModeDropdownOpen(false) }
  }}
  disabled={!aiAvailable}
  title={!aiAvailable ? 'Connect to Claude in Settings' : undefined}
  style={!aiAvailable ? { opacity: 0.4, cursor: 'default' } : undefined}
>
  <Sparkles size={13} /> AI Search
</button>
```

- [ ] **Step 2: Check auth status in Discover.tsx**

Add state and effect:

```typescript
const [aiAvailable, setAiAvailable] = useState(false)

useEffect(() => {
  async function checkAi() {
    try {
      const key = await window.api.settings.getApiKey()
      if (key) { setAiAvailable(true); return }
      const status = await window.api.skill.checkAuthStatus()
      setAiAvailable(!!status)
    } catch { setAiAvailable(false) }
  }
  checkAi()
}, [])
```

Pass to SmartBar:

```tsx
<SmartBar ... aiAvailable={aiAvailable} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SmartBar.tsx src/views/Discover.tsx
git commit -m "feat: disable AI search toggle when Claude is not configured"
```
