// src/components/StorybookExplorer.tsx
import { useState, useEffect } from 'react'
import { parseStorybookIndex, type StorybookComponent } from '../utils/storybookParser'

interface Props {
  storybookUrl: string
  repoName: string
}

type LoadState = 'loading' | 'error' | 'ready'

export default function StorybookExplorer({ storybookUrl, repoName }: Props) {
  const [loadState, setLoadState]                   = useState<LoadState>('loading')
  const [components, setComponents]                 = useState<StorybookComponent[]>([])
  const [selectedComponent, setSelectedComponent]   = useState<string | null>(null)
  const [selectedStoryId, setSelectedStoryId]       = useState<string | null>(null)
  const [iframeError, setIframeError]               = useState(false)

  useEffect(() => {
    setLoadState('loading')
    setComponents([])
    setSelectedComponent(null)
    setSelectedStoryId(null)
    setIframeError(false)

    window.api.storybook.getIndex(storybookUrl)
      .then((raw) => {
        if (!raw) { setLoadState('error'); return }
        const parsed = parseStorybookIndex(raw)
        if (parsed.length === 0) { setLoadState('error'); return }
        setComponents(parsed)
        setSelectedComponent(parsed[0].name)
        setSelectedStoryId(parsed[0].defaultStoryId)
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [storybookUrl])

  function selectComponent(comp: StorybookComponent) {
    setSelectedComponent(comp.name)
    setSelectedStoryId(comp.defaultStoryId)
    setIframeError(false)
  }

  function selectVariant(storyId: string) {
    setSelectedStoryId(storyId)
    setIframeError(false)
  }

  if (loadState === 'loading') {
    return <div className="sb-detecting"><span>Loading components…</span></div>
  }

  if (loadState === 'error') {
    return <div className="sb-empty">No component preview available for {repoName}.</div>
  }

  // Group components by group label
  const grouped = new Map<string | null, StorybookComponent[]>()
  for (const comp of components) {
    const arr = grouped.get(comp.group) ?? []
    arr.push(comp)
    grouped.set(comp.group, arr)
  }
  const groupOrder: (string | null)[] = [
    null,
    ...[...grouped.keys()].filter((k): k is string => k !== null).sort(),
  ]

  const iframeSrc = selectedStoryId
    ? `${storybookUrl}/iframe.html?id=${encodeURIComponent(selectedStoryId)}&viewMode=story`
    : null

  const activeComp = components.find(c => c.name === selectedComponent) ?? null

  return (
    <div className="sb-explorer">
      <div className="sb-list">
        {groupOrder.map(group => {
          const items = grouped.get(group)
          if (!items) return null
          return (
            <div key={group ?? '__top__'}>
              {group && <div className="sb-list-group-label">{group}</div>}
              {items.map(comp => (
                <div key={comp.name}>
                  <button
                    className={`sb-list-item${selectedComponent === comp.name ? ' active' : ''}`}
                    onClick={() => selectComponent(comp)}
                  >
                    {comp.name}
                  </button>
                  {selectedComponent === comp.name && comp.stories.length > 1 && (
                    <div>
                      {comp.stories.map(story => (
                        <button
                          key={story.id}
                          className={`sb-variant-item${selectedStoryId === story.id ? ' active' : ''}`}
                          onClick={() => selectVariant(story.id)}
                        >
                          {story.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="sb-preview">
        <div className="sb-preview-toolbar">
          {activeComp && (
            <>
              <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{activeComp.name}</span>
              {selectedStoryId && (
                <>
                  <span style={{ color: 'var(--border)' }}>›</span>
                  <span>{activeComp.stories.find(s => s.id === selectedStoryId)?.name ?? ''}</span>
                </>
              )}
              <div style={{ flex: 1 }} />
              {iframeSrc && (
                <button
                  onClick={() => window.api.openExternal(iframeSrc)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--t3)', fontFamily: 'Inter, sans-serif', fontSize: 11,
                    padding: '2px 6px',
                  }}
                  title="Open in browser"
                >
                  ↗
                </button>
              )}
            </>
          )}
        </div>

        <div className="sb-preview-frame-wrap">
          {iframeError ? (
            <div className="sb-empty">Could not load component preview.</div>
          ) : iframeSrc ? (
            <iframe
              key={iframeSrc}
              className="sb-preview-frame"
              src={iframeSrc}
              sandbox="allow-scripts allow-same-origin"
              title={`${selectedComponent} — ${repoName} Storybook`}
              onError={() => setIframeError(true)}
            />
          ) : (
            <div className="sb-empty">Select a component to preview.</div>
          )}
        </div>
      </div>
    </div>
  )
}
