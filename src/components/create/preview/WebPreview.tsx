import { useState, useEffect } from 'react'
import type { CreateSession } from '../../../types/create'

interface Props { session: CreateSession }

export default function WebPreview({ session }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'building' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!session.localPath) return
    setStatus('building')
    window.api.create.startWebPreview(session.id, session.localPath)
      .then((result: any) => { setUrl(result.url); setStatus('live') })
      .catch(() => setStatus('error'))
    return () => { window.api.create.stopPreview(session.id) }
  }, [session.id, session.localPath])

  const statusLabel = { idle: '', building: '● Building…', live: '● Live', error: '● Error' }[status]
  const statusClass = { idle: '', building: 'building', live: 'live', error: 'error' }[status]

  function rebuild() {
    if (!session.localPath) return
    setStatus('building')
    window.api.create.startWebPreview(session.id, session.localPath)
      .then((r: any) => { setUrl(r.url); setStatus('live') })
      .catch(() => setStatus('error'))
  }

  return (
    <>
      {url ? (
        <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="preview" />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t4)', fontSize: 12 }}>
          {status === 'building' ? 'Starting preview…' : 'No index.html yet — keep chatting'}
        </div>
      )}
      <div className="create-preview-toolbar">
        <span className={`create-preview-status ${statusClass}`}>{statusLabel}</span>
        <button className="create-preview-action" onClick={rebuild}>↺ Rebuild</button>
        <button className="create-preview-action" onClick={() => window.api.create.openFolder(session.localPath!)}>⇱ Open</button>
      </div>
    </>
  )
}
