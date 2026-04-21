import { useState, useEffect, useRef } from 'react'
import type { CreateSession, CreateMessage } from '../../types/create'

interface Props {
  session: CreateSession
  streamingToken: string
  onMessageSent: (history: CreateMessage[], changedFiles: string[]) => void
}

const TEMPLATE_NAMES: Record<string, string> = {
  'mcp-server': 'MCP Server Starter',
  '3d-web-app': '3D Interactive App',
  'cli-tool': 'CLI Tool',
  'desktop-widget': 'Desktop Widget',
  'data-dashboard': 'Data Dashboard',
  blank: 'Custom Tool',
}

export default function AiChatPanel({ session, streamingToken, onMessageSent }: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [localHistory, setLocalHistory] = useState<CreateMessage[]>(session.chatHistory)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [localHistory, streamingToken])

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    const msg = input.trim()
    setInput('')
    try {
      const result = await window.api.create.sendMessage({
        sessionId: session.id,
        userMessage: msg,
        templateName: TEMPLATE_NAMES[session.templateId] ?? session.templateId,
        toolType: session.toolType,
        repos: session.repoIds.map(id => ({ name: id.split('/')[1] ?? id, description: '', readmeExcerpt: '' })),
        history: localHistory,
      }) as { reply: string; changedFiles: string[] }
      const userMsg: CreateMessage = { role: 'user', content: msg, timestamp: Date.now() }
      const assistantMsg: CreateMessage = { role: 'assistant', content: result.reply, changedFiles: result.changedFiles, timestamp: Date.now() }
      const updated = [...localHistory, userMsg, assistantMsg]
      setLocalHistory(updated)
      onMessageSent(updated, result.changedFiles)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="create-chat-panel">
      <div className="create-chat-header">AI Builder</div>
      <div className="create-chat-messages">
        {localHistory.length === 0 && !sending && (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--t4)' }}>
            Type a message to start building your {TEMPLATE_NAMES[session.templateId] ?? 'tool'}.
          </div>
        )}
        {localHistory.map((m, i) => (
          <div key={i} className={`create-chat-msg ${m.role}`}>
            {m.content}
            {m.changedFiles && m.changedFiles.length > 0 && (
              <div className="create-chat-diff">
                {m.changedFiles.map(f => <div key={f} className="create-chat-diff-add">+ {f}</div>)}
              </div>
            )}
          </div>
        ))}
        {sending && streamingToken && (
          <div className="create-chat-msg assistant">{streamingToken}</div>
        )}
        {sending && !streamingToken && (
          <div className="create-chat-msg assistant" style={{ color: 'var(--t4)' }}>Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="create-chat-input">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Describe what you want…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          disabled={sending}
        />
        <button className="create-chat-send" onClick={handleSend} disabled={sending || !input.trim()}>
          {sending ? 'Building…' : 'Send →'}
        </button>
      </div>
    </div>
  )
}
