import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, Clock, Plus, Trash2, Mic, MicOff } from 'lucide-react'
import type { AiChatMessage } from './AiChatOverlay.types'
import { getPageContext } from '../lib/pageContext'
import { startRealtimeSession, type RealtimeSession } from '../lib/whisperTranscriber'

export type { AiChatMessage }

interface AiChatOverlayProps {
  visible: boolean
  onClose: () => void
  onNavigate: (owner: string, name: string) => void
  initialQuery?: string
  onInitialQueryConsumed?: () => void
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** Simple markdown-to-HTML for chat bubbles — no external dependency */
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Code blocks (before other processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Convert " - " list patterns to actual list items (inline lists from AI)
  html = html.replace(/(?:^|\n)\s*[-•]\s+/g, '\n- ')
  // Split into lines for block processing
  const lines = html.split('\n')
  const out: string[] = []
  let inList = false
  for (const line of lines) {
    if (line.match(/^- /)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${line.slice(2)}</li>`)
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      if (line.trim()) out.push(`<p>${line}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

/** Parse structured repo/action blocks from Claude's response, with validation */
function parseResponseBlocks(fullText: string): { repoCards: NonNullable<AiChatMessage['repoCards']>; actions: NonNullable<AiChatMessage['actions']> } {
  const repoCards: NonNullable<AiChatMessage['repoCards']> = []
  const actions: NonNullable<AiChatMessage['actions']> = []

  const repoRegex = /```repo\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = repoRegex.exec(fullText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (typeof parsed.owner === 'string' && typeof parsed.name === 'string' && typeof parsed.description === 'string') {
        repoCards.push({ owner: parsed.owner, name: parsed.name, description: parsed.description, stars: Number(parsed.stars) || 0, language: String(parsed.language || '') })
      }
    } catch {}
  }

  const actionRegex = /```action\n([\s\S]*?)```/g
  while ((match = actionRegex.exec(fullText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (typeof parsed.action === 'string' && typeof parsed.owner === 'string' && typeof parsed.name === 'string') {
        actions.push({ action: parsed.action, owner: parsed.owner, name: parsed.name, result: parsed.result != null ? String(parsed.result) : undefined })
      }
    } catch {}
  }

  return { repoCards, actions }
}

export default function AiChatOverlay({ visible, onClose, onNavigate, initialQuery, onInitialQueryConsumed }: AiChatOverlayProps) {
  const location = useLocation()
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [chatId, setChatId] = useState<number | undefined>()
  const [showHistory, setShowHistory] = useState(false)
  const [chatList, setChatList] = useState<{ id: number; title: string; updated_at: string }[]>([])

  const [isListening, setIsListening] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sttSessionRef = useRef<RealtimeSession | null>(null)
  const baseTextRef = useRef('')

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // Focus input when overlay opens
  useEffect(() => {
    if (visible) inputRef.current?.focus()
  }, [visible])

  // Auto-send initial query when overlay opens
  useEffect(() => {
    if (visible && initialQuery && messages.length === 0 && !streaming) {
      onInitialQueryConsumed?.()
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
          const { text: fullText, html } = await window.api.ai.sendMessage({
            messages: [userMsg],
            starredRepos: starred.map((r: any) => `${r.owner}/${r.name}`),
            installedSkills: library.map((r: any) => `${r.owner}/${r.name}`),
            pageContext: getPageContext(location.pathname),
          })
          const { repoCards, actions } = parseResponseBlocks(fullText)
          const assistantMsg: AiChatMessage = {
            role: 'assistant', content: fullText, contentHtml: html,
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
          console.error('[ai-chat] Initial query error:', err)
          setMessages(prev => [...prev, {
            role: 'assistant' as const, content: `Error: ${err instanceof Error ? err.message : String(err) || 'Something went wrong'}`, timestamp: Date.now(),
          }])
        } finally { setStreaming(false); setStreamText('') }
      })()
    }
  }, [visible, initialQuery])

  // Load most recent chat on first open (skip if initialQuery is being sent)
  useEffect(() => {
    if (!visible || initialQuery) return
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

  async function toggleListening() {
    if (isListening) {
      sttSessionRef.current?.stop()
      sttSessionRef.current = null
      setIsListening(false)
      return
    }

    baseTextRef.current = input ? (input.endsWith(' ') ? input : input + ' ') : ''

    try {
      const session = await startRealtimeSession((text) => {
        setInput(baseTextRef.current + text)
      })
      sttSessionRef.current = session
      setIsListening(true)
    } catch (err: any) {
      console.error('[ai-chat] STT failed:', err)
    }
  }

  // Stop session when overlay closes or streaming starts
  useEffect(() => {
    if (!visible || streaming) {
      sttSessionRef.current?.stop()
      sttSessionRef.current = null
      setIsListening(false)
    }
  }, [visible, streaming])

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
      const starredNames = starred.map((r: any) => `${r.owner}/${r.name}`)
      const installedNames = library.map((r: any) => `${r.owner}/${r.name}`)

      console.log('[ai-chat] Sending message, conversation length:', updatedMessages.length)
      const { text: fullText, html } = await window.api.ai.sendMessage({
        messages: updatedMessages,
        starredRepos: starredNames,
        installedSkills: installedNames,
        pageContext: getPageContext(location.pathname),
      })
      console.log('[ai-chat] Response received, length:', fullText?.length ?? 0)

      const { repoCards, actions } = parseResponseBlocks(fullText)
      const assistantMsg: AiChatMessage = {
        role: 'assistant',
        content: fullText,
        contentHtml: html,
        repoCards: repoCards.length > 0 ? repoCards : undefined,
        actions: actions.length > 0 ? actions : undefined,
        timestamp: Date.now(),
      }

      const finalMessages = [...updatedMessages, assistantMsg]
      setMessages(finalMessages)

      if (chatId) {
        // Update existing chat — preserve original title
        await window.api.ai.saveChat({ id: chatId, title: '', messages: finalMessages })
      } else {
        // New chat — set title from first message
        const title = updatedMessages[0]?.content.slice(0, 60) || 'New chat'
        const savedId = await window.api.ai.saveChat({ title, messages: finalMessages })
        setChatId(savedId)
      }
    } catch (err) {
      console.error('[ai-chat] Send error:', err)
      const errorMsg: AiChatMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err) || 'Something went wrong'}`,
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

  function stripBlocks(content: string): string {
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
                  {msg.role === 'assistant'
                    ? <div className="ai-chat-bubble" dangerouslySetInnerHTML={{ __html: msg.contentHtml || renderMarkdown(stripBlocks(msg.content)) }} />
                    : <div className="ai-chat-bubble">{stripBlocks(msg.content)}</div>}
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
                <div className="ai-chat-bubble" dangerouslySetInnerHTML={{ __html: renderMarkdown(stripBlocks(streamText)) }} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="ai-chat-input-area">
            <input
              ref={inputRef}
              className="ai-chat-input"
              placeholder={isListening ? 'Listening…' : 'Ask about repos, request actions…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
              disabled={streaming}
            />
            {input.trim() && !isListening ? (
              <button className="ai-chat-send" onClick={handleSend} disabled={streaming}>
                <Send size={14} />
              </button>
            ) : (
              <button
                className={`ai-chat-mic${isListening ? ' listening' : ''}`}
                onClick={toggleListening}
                disabled={streaming}
                title={isListening ? 'Stop recording' : 'Voice input'}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
