import type { CreateSession } from '../../../types/create'

interface Props { session: CreateSession }

export default function CliPreview({ session }: Props) {
  return (
    <div style={{ height: '100%', background: '#080810', padding: 16, fontFamily: 'monospace', fontSize: 11, color: '#6a9', overflow: 'auto', position: 'relative' }}>
      <div style={{ color: '#445', marginBottom: 8 }}>CLI Preview — run your tool from the terminal to see output here.</div>
      <div style={{ color: '#556' }}>$ node dist/cli.js --help</div>
      <div style={{ color: '#445', marginTop: 4 }}>Open {session.localPath} in your terminal to test.</div>
      <div className="create-preview-toolbar">
        <button className="create-preview-action" onClick={() => window.api.create.openFolder(session.localPath!)}>⇱ Open Folder</button>
      </div>
    </div>
  )
}
