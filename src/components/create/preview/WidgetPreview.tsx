import { useState } from 'react'
import type { CreateSession } from '../../../types/create'

interface Props { session: CreateSession }

export default function WidgetPreview({ session }: Props) {
  const [launched, setLaunched] = useState(false)

  async function launch() {
    await window.api.create.launchWidget(session.id, session.localPath!)
    setLaunched(true)
  }

  async function relaunch() {
    await window.api.create.relaunchWidget(session.id, session.localPath!)
  }

  async function detach() {
    await window.api.create.detachWidget(session.id)
    setLaunched(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--t3)' }}>
        {launched ? 'Widget is running as a floating window' : 'Launch the widget to preview it'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!launched ? (
          <button className="create-push-btn" onClick={launch}>▶ Launch Widget</button>
        ) : (
          <>
            <button className="create-publish-btn" onClick={relaunch}>↺ Relaunch</button>
            <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 12px', fontSize: 11, color: 'var(--t2)', cursor: 'pointer' }} onClick={detach}>⇱ Detach</button>
          </>
        )}
      </div>
    </div>
  )
}
