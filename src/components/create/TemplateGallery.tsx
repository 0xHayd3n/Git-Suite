import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateTemplate, CreateSession } from '../../types/create'

const TYPE_LABELS: Record<string, string> = {
  mcp: 'MCP Server', webapp: 'Web App', cli: 'CLI Tool', widget: 'Desktop', blank: '',
}

const FILTERS = ['All', 'MCP Server', 'Web App', 'CLI Tool', 'Desktop Widget']

export default function TemplateGallery() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<CreateTemplate[]>([])
  const [sessions, setSessions] = useState<CreateSession[]>([])
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.api.create.getTemplates().then(setTemplates)
    window.api.create.getSessions().then(setSessions)
  }, [])

  async function handleSelectTemplate(t: CreateTemplate) {
    const name = t.toolType === 'blank' ? 'Untitled Tool' : t.name
    const session = await window.api.create.startSession({
      templateId: t.id,
      toolType: t.toolType,
      name,
    })
    navigate(`/create/${session.id}`)
  }

  const typeMap: Record<string, string> = { mcp: 'MCP Server', webapp: 'Web App', cli: 'CLI Tool', widget: 'Desktop Widget' }
  const visible = templates.filter(t => {
    if (filter !== 'All' && typeMap[t.toolType] !== filter) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="create-gallery">
      <div className="create-gallery-header">
        <h1 className="create-gallery-title">Build something new</h1>
        <p className="create-gallery-subtitle">Pick a template to start. Mix repos and let AI build it with you.</p>
      </div>

      {sessions.length > 0 && (
        <section className="create-recent">
          <h2 className="create-section-label">Recent</h2>
          <div className="create-recent-grid">
            {sessions.slice(0, 6).map(s => (
              <button key={s.id} className="create-recent-card" onClick={() => navigate(`/create/${s.id}`)}>
                <span className="create-recent-name">{s.name}</span>
                <span className="create-recent-meta">{TYPE_LABELS[s.toolType] ?? s.toolType}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="create-templates">
        <div className="create-filters">
          <input
            className="create-search"
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="create-filter-tabs">
            {FILTERS.map(f => (
              <button key={f} className={`create-filter-tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        <div className="create-template-grid">
          {visible.map(t => (
            <button key={t.id} className="create-template-card" onClick={() => handleSelectTemplate(t)}>
              <div className="create-template-header" style={{ background: `linear-gradient(135deg, ${t.gradient[0]}, ${t.gradient[1]})` }}>
                <span className="create-template-emoji">{t.emoji}</span>
                {t.toolType !== 'blank' && (
                  <span className="create-template-badge">{TYPE_LABELS[t.toolType]}</span>
                )}
              </div>
              <div className="create-template-body">
                <div className="create-template-name">{t.name}</div>
                <div className="create-template-desc">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
