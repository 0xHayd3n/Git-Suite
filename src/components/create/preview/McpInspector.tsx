import { useState, useEffect } from 'react'
import type { CreateSession } from '../../../types/create'

interface McpTool { name: string; description: string; inputSchema?: unknown }

interface Props { session: CreateSession }

export default function McpInspector({ session }: Props) {
  const [tools, setTools] = useState<McpTool[]>([])
  const [selected, setSelected] = useState<McpTool | null>(null)
  const [inputJson, setInputJson] = useState('{}')
  const [result, setResult] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')

  useEffect(() => {
    if (!session.localPath) return
    window.api.create.spawnMcp(session.id, 'dist/index.js', session.localPath)
      .then(() => window.api.create.getMcpTools(session.id))
      .then((t: any) => { setTools(t); setStatus('running') })
      .catch(() => setStatus('error'))
  }, [session.id, session.localPath])

  function handleCall() {
    if (!selected) return
    setResult(JSON.stringify({ status: 'called', tool: selected.name }, null, 2))
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 160, borderRight: '1px solid var(--border)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t4)', marginBottom: 4 }}>Registered Tools</div>
        {tools.map(t => (
          <button key={t.name} onClick={() => { setSelected(t); setResult(null) }}
            style={{ background: selected?.name === t.name ? 'var(--accent-soft)' : 'rgba(255,255,255,0.05)', border: '1px solid', borderColor: selected?.name === t.name ? 'var(--accent-border)' : 'var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: selected?.name === t.name ? 'var(--accent-text)' : 'var(--t2)', textAlign: 'left', cursor: 'pointer' }}>
            {t.name}
          </button>
        ))}
        {tools.length === 0 && <div style={{ fontSize: 11, color: 'var(--t4)' }}>{status === 'error' ? '● Error spawning' : 'Loading…'}</div>}
      </div>
      <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {selected ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>{selected.description}</div>
            <textarea value={inputJson} onChange={e => setInputJson(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 4, padding: 6, fontSize: 10, fontFamily: 'monospace', color: 'var(--t1)', height: 60, resize: 'none', outline: 'none' }} />
            <button onClick={handleCall}
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: 'var(--accent-text)', cursor: 'pointer', alignSelf: 'flex-start' }}>
              ▶ Call
            </button>
            {result && <pre style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: 8, fontSize: 10, fontFamily: 'monospace', color: '#6a9', margin: 0 }}>{result}</pre>}
          </>
        ) : (
          <div style={{ color: 'var(--t4)', fontSize: 12, marginTop: 20 }}>Select a tool to test it</div>
        )}
      </div>
      <div className="create-preview-toolbar">
        <span className={`create-preview-status ${status === 'running' ? 'live' : 'error'}`}>
          {status === 'running' ? '● Running' : '● Stopped'}
        </span>
      </div>
    </div>
  )
}
