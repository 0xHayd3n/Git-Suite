import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import type { AiChatMessage } from './AiChatOverlay.types'
import { getPageContext } from '../lib/pageContext'
import { useRotatingPlaceholder } from '../hooks/useRotatingPlaceholder'
import { startRealtimeSession, type RealtimeSession } from '../lib/whisperTranscriber'

/** Simple markdown-to-HTML for assistant messages */
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/(?:^|\n)\s*[-•]\s+/g, '\n- ')
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

/** Strip structured repo/action blocks from content */
function stripBlocks(content: string): string {
  return content
    .replace(/```repo\n[\s\S]*?```/g, '')
    .replace(/```action\n[\s\S]*?```/g, '')
    .trim()
}

interface Message {
  role: 'user' | 'assistant' | 'error'
  content: string
}

interface AiDialogueProps {
  open: boolean
  onClose: () => void
}

export default function AiDialogue({ open, onClose }: AiDialogueProps) {
  const location = useLocation()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const sttSessionRef = useRef<RealtimeSession | null>(null)
  const baseTextRef = useRef('')
  const placeholder = useRotatingPlaceholder(inputFocused, input.length > 0, true)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Stream token handler
  useEffect(() => {
    if (!loading) return
    const onToken = (token: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: last.content + token }]
        }
        return [...prev, { role: 'assistant' as const, content: token }]
      })
    }
    window.api.ai.onStreamToken(onToken)
    return () => { window.api.ai.offStreamToken(onToken) }
  }, [loading])

  const toggleListening = useCallback(async () => {
    if (isListening) {
      sttSessionRef.current?.stop()
      sttSessionRef.current = null
      setIsListening(false)
      return
    }

    // Snapshot current input so transcribed text appends cleanly
    baseTextRef.current = input ? (input.endsWith(' ') ? input : input + ' ') : ''

    try {
      const session = await startRealtimeSession((text) => {
        setInput(baseTextRef.current + text)
      })
      sttSessionRef.current = session
      setIsListening(true)
    } catch (err: any) {
      console.error('[stt] Failed to start:', err)
      setMessages(prev => [...prev, {
        role: 'error',
        content: `Voice input failed: ${err?.message || 'Unknown error'}`,
      }])
    }
  }, [isListening, input])

  // Stop session when closed or loading
  useEffect(() => {
    if (!open || loading) {
      sttSessionRef.current?.stop()
      sttSessionRef.current = null
      setIsListening(false)
    }
  }, [open, loading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const apiMessages: AiChatMessage[] = newMessages
        .filter(m => m.role !== 'error')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content, timestamp: Date.now() }))
      await window.api.ai.sendMessage({ messages: apiMessages, starredRepos: [], installedSkills: [], pageContext: getPageContext(location.pathname) })
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'error', content: err.message || 'Something went wrong' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <>
      <div className={`ai-dialogue-scrim${open ? ' active' : ''}`}>
        <button
          type="button"
          className="ai-dialogue-close"
          onClick={onClose}
          aria-label="Close AI chat"
        >
          &times;
        </button>
        <div className="ai-dialogue-zone">
          <div className="ai-dialogue-messages" ref={messagesRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`ai-panel-message ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <>
                    <div className="ai-msg-label">
                      <span className="ai-msg-status-dot" />
                      <span>Assistant</span>
                    </div>
                    <div className="ai-msg-body">
                      <span className="ai-msg-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(stripBlocks(msg.content)) }} />
                    </div>
                  </>
                ) : msg.role === 'error' ? (
                  <>
                    <div className="ai-msg-label">
                      <span className="ai-msg-status-dot" style={{ background: 'var(--red)' }} />
                      <span>Error</span>
                    </div>
                    <div className="ai-msg-body">
                      <span className="ai-msg-content">{msg.content}</span>
                    </div>
                  </>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            {loading && (
              <div className="ai-panel-message assistant">
                <div className="ai-msg-label">
                  <span className="ai-msg-status-dot ai-msg-dot-pulse" />
                  <span>Thinking…</span>
                </div>
              </div>
            )}
          </div>
          <div className="ai-dialogue-input-row">
            <input
              ref={inputRef}
              type="text"
              className="ai-panel-input"
              placeholder={isListening ? 'Listening…' : placeholder.text}
              style={{ opacity: !inputFocused && !input ? (placeholder.visible ? 1 : 0.6) : 1, transition: 'opacity 0.3s ease, border-color 0.15s' }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              aria-label="Message AI"
            />
            {input.trim() && !isListening ? (
              <button
                type="button"
                className="ai-panel-send"
                onClick={handleSend}
                disabled={loading}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className={`ai-panel-send ai-panel-mic${isListening ? ' listening' : ''}`}
                onClick={toggleListening}
                disabled={loading}
                aria-label={isListening ? 'Stop recording' : 'Voice input'}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
