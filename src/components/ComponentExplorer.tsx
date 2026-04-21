// src/components/ComponentExplorer.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Framework, ComponentScanResult } from '../types/components'
import { parseComponent, type ParsedComponent } from '../utils/componentParser'
import { generateProps } from '../utils/propsGenerator'
import { buildIframeHtml } from '../utils/iframeTemplate'

interface Props {
  owner: string
  name:  string
  branch: string
}

type ScanState   = 'scanning' | 'done' | 'error'
type RenderState = 'pending' | 'rendering' | 'rendered' | 'fallback'

export default function ComponentExplorer({ owner, name, branch }: Props) {
  const [scanState,    setScanState]    = useState<ScanState>('scanning')
  const [framework,    setFramework]    = useState<Framework | null>(null)
  const [components,   setComponents]   = useState<ParsedComponent[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [renderStates, setRenderStates] = useState<Record<string, RenderState>>({})
  const [renderErrors, setRenderErrors] = useState<Record<string, string>>({})
  const [blobUrls,     setBlobUrls]     = useState<Record<string, string>>({})
  const [propsOpen,    setPropsOpen]    = useState(true)

  const iframeRef        = useRef<HTMLIFrameElement | null>(null)
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sourceMapRef     = useRef<Record<string, string>>({})
  const createdUrls      = useRef<string[]>([])
  const pendingPathRef   = useRef<string | null>(null)

  // Scan on mount
  useEffect(() => {
    window.api.components.scan(owner, name, branch)
      .then((result: ComponentScanResult) => {
        const parsed = result.components.map(c =>
          parseComponent(c.path, c.source, result.framework),
        )
        sourceMapRef.current = Object.fromEntries(
          result.components.map(c => [c.path, c.source]),
        )
        setFramework(result.framework)
        setComponents(parsed)
        setScanState('done')
        if (parsed.length > 0) {
          doSelect(parsed[0], result.components[0]?.source ?? '')
        }
      })
      .catch(() => setScanState('error'))
  }, [owner, name, branch])

  // postMessage error bridge listener
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return
      if (e.data?.type === 'render-error') {
        const errMsg = (e.data.message as string | undefined) ?? 'Unknown render error'
        setRenderErrors(prev => ({ ...prev, ...(selectedPath ? { [selectedPath]: errMsg } : {}) }))
        setRenderStates(prev => {
          const current = selectedPath ? prev[selectedPath] : null
          if (!selectedPath || (current !== 'rendering' && current !== 'rendered')) return prev
          return { ...prev, [selectedPath]: 'fallback' }
        })
        if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [selectedPath])

  // Cleanup blob URLs and timeout on unmount
  useEffect(() => () => {
    createdUrls.current.forEach(u => URL.revokeObjectURL(u))
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
  }, [])

  async function doSelect(comp: ParsedComponent, source: string) {
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
    setSelectedPath(comp.path)
    pendingPathRef.current = comp.path

    if (!comp.renderable) {
      setRenderStates(prev => ({ ...prev, [comp.path]: 'fallback' }))
      return
    }

    // Use cached blob URL if already generated
    if (blobUrls[comp.path]) {
      if (renderStates[comp.path] === 'rendered' || renderStates[comp.path] === 'fallback') return
      setRenderStates(prev => ({ ...prev, [comp.path]: 'rendering' }))
      startTimeout(comp.path)
      return
    }

    // Show rendering overlay while we compile + build the iframe HTML
    setRenderStates(prev => ({ ...prev, [comp.path]: 'rendering' }))

    const html = await buildIframeHtml(comp, source, generateProps(comp.props))

    // If the user navigated away while compiling, discard this result
    if (pendingPathRef.current !== comp.path) return

    if (!html) {
      setRenderErrors(prev => ({ ...prev, [comp.path]: 'Compilation failed — see DevTools console for details' }))
      setRenderStates(prev => {
        if (prev[comp.path] !== 'rendering') return prev
        return { ...prev, [comp.path]: 'fallback' }
      })
      return
    }

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    createdUrls.current.push(url)
    setBlobUrls(prev => ({ ...prev, [comp.path]: url }))
    startTimeout(comp.path)
  }

  function startTimeout(path: string) {
    renderTimeoutRef.current = setTimeout(() => {
      setRenderStates(prev => {
        if (prev[path] !== 'rendering') return prev
        return { ...prev, [path]: 'fallback' }
      })
    }, 5000)
  }

  const handleIframeLoad = useCallback(() => {
    if (!selectedPath) return
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current)
    setRenderStates(prev => {
      if (prev[selectedPath] !== 'rendering') return prev
      return { ...prev, [selectedPath]: 'rendered' }
    })
  }, [selectedPath])

  // Group by parent folder
  const grouped = new Map<string, ParsedComponent[]>()
  for (const comp of components) {
    const parts = comp.path.split('/')
    const group = parts.length > 1 ? (parts[parts.length - 2] ?? '') : ''
    grouped.set(group, [...(grouped.get(group) ?? []), comp])
  }

  const selectedComp   = components.find(c => c.path === selectedPath) ?? null
  const renderState    = selectedPath ? (renderStates[selectedPath] ?? 'pending') : 'pending'
  const renderError    = selectedPath ? (renderErrors[selectedPath] ?? null) : null
  const blobUrl        = selectedPath ? (blobUrls[selectedPath] ?? null) : null
  const selectedSource = selectedPath ? (sourceMapRef.current[selectedPath] ?? '') : ''

  if (scanState === 'scanning') {
    return (
      <div className="sb-explorer">
        <div className="sb-detecting"><span>Scanning components…</span></div>
      </div>
    )
  }

  if (scanState === 'error' || components.length === 0) {
    return (
      <div className="sb-explorer">
        <div className="sb-empty">No components found.</div>
      </div>
    )
  }

  void framework

  return (
    <div className="sb-explorer">
      {/* Sidebar */}
      <div className="sb-list">
        {[...grouped.entries()].map(([group, items]) => (
          <div key={group || '__root__'}>
            {items.length > 1 && group && (
              <div className="sb-list-group-label">{group}</div>
            )}
            {items.map(comp => {
              const rs = renderStates[comp.path] ?? 'pending'
              return (
                <button
                  key={comp.path}
                  className={`sb-list-item${selectedPath === comp.path ? ' active' : ''}`}
                  onClick={() => doSelect(comp, sourceMapRef.current[comp.path] ?? '')}
                >
                  {comp.name}
                  {rs === 'rendering' && (
                    <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }}>◌</span>
                  )}
                  {rs === 'rendered' && (
                    <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--accent)' }}>●</span>
                  )}
                  {rs === 'fallback' && (
                    <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.4 }}>{`</>`}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Preview pane */}
      <div className="sb-preview">
        <div className="sb-preview-toolbar">
          {selectedComp && (
            <>
              <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{selectedComp.name}</span>
              <span style={{ color: 'var(--border)' }}>›</span>
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>
                {selectedComp.path.split('/').pop()}
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() =>
                  window.api.openExternal(
                    `https://github.com/${owner}/${name}/blob/${branch}/${selectedPath}`,
                  )
                }
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--t3)', fontFamily: 'Inter, sans-serif',
                  fontSize: 11, padding: '2px 6px',
                }}
                title="Open on GitHub"
              >↗</button>
            </>
          )}
        </div>

        <div
          className="sb-preview-frame-wrap"
          style={{ padding: 0, position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {renderState === 'rendering' && (
            <div className="sb-detecting" style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
              <span>Rendering…</span>
            </div>
          )}

          {renderState === 'fallback' ? (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
              {renderError && (
                <details style={{ flexShrink: 0, background: '#1a0000', borderBottom: '1px solid #3a1010' }}>
                  <summary style={{
                    padding: '6px 12px', cursor: 'pointer', fontSize: 11,
                    fontFamily: 'monospace', color: '#ff7b7b', userSelect: 'none',
                  }}>
                    ⚠ Render error — click to expand
                  </summary>
                  <pre style={{
                    margin: 0, padding: '8px 12px', fontSize: 10,
                    fontFamily: 'monospace', color: '#ff9a9a', whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>{renderError}</pre>
                </details>
              )}
              <pre style={{
                flex: 1, margin: 0, padding: '16px', overflow: 'auto', fontSize: 11,
                fontFamily: 'monospace', background: 'var(--surface)',
                color: 'var(--t1)',
              }}>
                <code>{selectedSource}</code>
              </pre>
            </div>
          ) : blobUrl ? (
            <iframe
              ref={iframeRef}
              className="sb-preview-frame"
              src={blobUrl}
              sandbox="allow-scripts"
              style={{
                visibility: renderState === 'rendered' ? 'visible' : 'hidden',
                flex: 1, border: 'none', width: '100%',
              }}
              onLoad={handleIframeLoad}
              title={`${selectedComp?.name ?? ''} preview`}
            />
          ) : (
            <div className="sb-empty">Select a component.</div>
          )}
        </div>

        {/* Props table */}
        {selectedComp && selectedComp.props.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              onClick={() => setPropsOpen(p => !p)}
              style={{
                width: '100%', padding: '6px 12px', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--t3)', fontFamily: 'Inter, sans-serif',
              }}
            >
              {propsOpen ? '▾' : '▸'} Props ({selectedComp.props.length})
            </button>
            {propsOpen && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    {['Prop', 'Type', 'Req'].map(h => (
                      <th key={h} style={{
                        padding: '4px 8px', textAlign: 'left',
                        color: 'var(--t3)', fontWeight: 500,
                        borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedComp.props.map(p => (
                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px', color: 'var(--t1)' }}>{p.name}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--t3)' }}>{p.type}</td>
                      <td style={{ padding: '4px 8px', color: p.required ? 'var(--accent)' : 'var(--t3)' }}>
                        {p.required ? '✓' : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
