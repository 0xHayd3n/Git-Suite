import type { CreateSession } from '../../../types/create'
import WebPreview from './WebPreview'
import McpInspector from './McpInspector'
import CliPreview from './CliPreview'
import WidgetPreview from './WidgetPreview'

interface Props { session: CreateSession }

export default function PreviewAdapter({ session }: Props) {
  if (!session.localPath) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t4)', fontSize: 12 }}>
        Chat with the AI to start building
      </div>
    )
  }
  if (session.toolType === 'webapp' || session.toolType === 'blank') return <WebPreview session={session} />
  if (session.toolType === 'mcp') return <McpInspector session={session} />
  if (session.toolType === 'cli') return <CliPreview session={session} />
  if (session.toolType === 'widget') return <WidgetPreview session={session} />
  return <WebPreview session={session} />
}
