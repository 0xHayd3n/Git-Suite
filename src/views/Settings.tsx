import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useAppearance, type BackgroundMode } from '../contexts/Appearance'

type SetupPhase = 'idle' | 'checking' | 'installing' | 'auth' | 'done' | 'error'
type LoginPhase = 'idle' | 'logging-in' | 'done' | 'error'
type CategoryId = 'general' | 'claude-desktop' | 'appearance' | 'language' | 'downloads'

const BACKGROUND_OPTIONS: { value: BackgroundMode; label: string }[] = [
  { value: 'none', label: 'Default' },
  { value: 'dither', label: 'Dithered' },
]

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const GeneralIcon = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v1.8 M8 12.7v1.8 M1.5 8h1.8 M12.7 8h1.8 M3.4 3.4l1.3 1.3 M11.3 11.3l1.3 1.3 M3.4 12.6l1.3-1.3 M11.3 4.7l1.3-1.3" />
  </svg>
)

const DesktopIcon = () => (
  <svg {...iconProps}>
    <rect x="1.5" y="2.5" width="13" height="9" rx="1" />
    <path d="M6 14.5h4 M8 11.5v3" />
  </svg>
)

const PaletteIcon = () => (
  <svg {...iconProps}>
    <path d="M8 1.5C4.4 1.5 1.5 4.4 1.5 8s2.9 6.5 6.5 6.5c.8 0 1.3-.6 1.3-1.3 0-.3-.1-.6-.3-.9-.2-.3-.3-.5-.3-.8 0-.7.6-1.3 1.3-1.3h1.5c2.2 0 4-1.8 4-4 0-3.1-2.9-6.2-6.5-6.2Z" />
    <circle cx="4.5" cy="7.2" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="6.8" cy="4.4" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="10" cy="4.4" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.2" r="0.7" fill="currentColor" stroke="none" />
  </svg>
)

const GlobeIcon = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="8" r="6.5" />
    <ellipse cx="8" cy="8" rx="2.6" ry="6.5" />
    <path d="M1.5 8h13" />
  </svg>
)

const DownloadIcon = () => (
  <svg {...iconProps}>
    <path d="M8 2v8.5 M4.5 7l3.5 3.5L11.5 7 M2.5 13.5h11" />
  </svg>
)

const CATEGORIES: { id: CategoryId; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <GeneralIcon /> },
  { id: 'claude-desktop', label: 'Claude Desktop', icon: <DesktopIcon /> },
  { id: 'appearance', label: 'Appearance', icon: <PaletteIcon /> },
  { id: 'language', label: 'Language & Speech', icon: <GlobeIcon /> },
  { id: 'downloads', label: 'Downloads', icon: <DownloadIcon /> },
]

export default function Settings() {
  const { background, setBackground } = useAppearance()
  const [activeCategory, setActiveCategory] = useState<CategoryId>('general')
  const [apiKey, setApiKeyState] = useState('')
  const [saved, setSaved] = useState(false)
  const [claudeCodeInstalled, setClaudeCodeInstalled] = useState<boolean | null>(null)
  const [claudeCodeLoggedIn, setClaudeCodeLoggedIn] = useState<boolean | null>(null)
  const [preferredLanguage, setPreferredLanguage] = useState('en')
  const [downloadFolder, setDownloadFolder] = useState<string>('')
  const [defaultDownloadFolder, setDefaultDownloadFolder] = useState<string>('')

  // TTS voice state
  const [ttsVoices, setTtsVoices] = useState<{ shortName: string; label: string }[]>([])
  const [ttsVoice, setTtsVoice] = useState<string>('')
  const [ttsPreviewPlaying, setTtsPreviewPlaying] = useState(false)

  // Setup flow state
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('idle')
  const [setupLines, setSetupLines] = useState<string[]>([])

  // Login flow state
  const [loginPhase, setLoginPhase] = useState<LoginPhase>('idle')
  const [loginLines, setLoginLines] = useState<string[]>([])
  const [loginNeedsCode, setLoginNeedsCode] = useState(false)
  const [loginCode, setLoginCode] = useState('')
  const [loginCodeSubmitted, setLoginCodeSubmitted] = useState(false)

  // Claude Desktop MCP state
  const [mcpConfigured, setMcpConfigured] = useState(false)
  const [mcpConfigPath, setMcpConfigPath] = useState<string | null>(null)
  const [configSnippet, setConfigSnippet] = useState('')
  const [copied, setCopied] = useState(false)
  const [autoConfigStatus, setAutoConfigStatus] = useState<string | null>(null)
  const [autoConfigIsError, setAutoConfigIsError] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const loadMcpStatus = useCallback(async () => {
    const [status, snippet] = await Promise.all([
      window.api.mcp.getStatus(),
      window.api.mcp.getConfigSnippet(),
    ])
    setMcpConfigured(status.configured)
    setMcpConfigPath(status.configPath)
    setConfigSnippet(snippet)
  }, [])

  useEffect(() => {
    window.api.settings.getApiKey().then((key) => {
      if (key) setApiKeyState(key)
    })
    window.api.skill.detectClaudeCode().then(installed => {
      setClaudeCodeInstalled(installed)
      if (installed) window.api.skill.checkAuthStatus().then(setClaudeCodeLoggedIn)
      else setClaudeCodeLoggedIn(false)
    })
    loadMcpStatus()
    window.api.settings.getPreferredLanguage().then(setPreferredLanguage).catch(() => {})
    window.api.download.getDefaultFolder().then((val: string) => {
      setDefaultDownloadFolder(val)
    })
    window.api.settings.get('downloadFolder').then((val: string | null) => {
      setDownloadFolder(val ?? '')
    })
    window.api.tts.getVoices().then((voices: { shortName: string; label: string }[]) => {
      setTtsVoices(voices)
      if (voices.length > 0) {
        window.api.settings.get('tts_voice').then((saved: string | null) => {
          setTtsVoice(saved && voices.some(v => v.shortName === saved) ? saved : voices[0].shortName)
        })
      }
    }).catch(() => {})
  }, [loadMcpStatus])

  const handleChangeFolder = async () => {
    const result = await window.api.download.pickFolder()
    if (result) {
      await window.api.settings.set('downloadFolder', result)
      setDownloadFolder(result)
    }
  }

  const handleResetFolder = async () => {
    await window.api.settings.set('downloadFolder', '')
    setDownloadFolder('')
  }

  const savePreferredLanguage = async (lang: string) => {
    setPreferredLanguage(lang)
    await window.api.settings.setPreferredLanguage(lang)
  }

  const saveTtsVoice = async (voice: string) => {
    setTtsVoice(voice)
    await window.api.settings.set('tts_voice', voice)
  }

  const handleTtsPreview = async () => {
    if (ttsPreviewPlaying) return
    setTtsPreviewPlaying(true)
    try {
      const result = await window.api.tts.synthesize(
        'Hello, this is a preview of the selected voice.',
        ttsVoice,
      )
      const blob = new Blob([result.audio], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setTtsPreviewPlaying(false)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setTtsPreviewPlaying(false)
      }
      await audio.play()
    } catch {
      setTtsPreviewPlaying(false)
    }
  }

  const handleUpdate = async () => {
    await window.api.settings.setApiKey(apiKey)
    setSaved(true)
    timers.current.push(setTimeout(() => setSaved(false), 2000))
  }

  const handleSetup = useCallback(async () => {
    setSetupPhase('checking')
    setSetupLines([])

    const onProgress = ({ phase, message }: { phase: string; message: string }) => {
      setSetupPhase(phase as SetupPhase)
      setSetupLines((prev) => [...prev, message])
    }

    window.api.skill.onSetupProgress(onProgress)
    try {
      await window.api.skill.setup()
      const installed = await window.api.skill.detectClaudeCode()
      setClaudeCodeInstalled(installed)
      if (installed) window.api.skill.checkAuthStatus().then(setClaudeCodeLoggedIn)
    } finally {
      window.api.skill.offSetupProgress(onProgress)
    }
  }, [])

  const handleLogin = useCallback(async () => {
    setLoginPhase('logging-in')
    setLoginLines([])

    let hadError = false

    const onProgress = ({ message, isError, done }: { message: string; isError?: boolean; done?: boolean }) => {
      if (message === '__NEED_CODE__') { setLoginNeedsCode(true); return }
      setLoginLines((prev) => [...prev, message])
      if (isError) { hadError = true; setLoginPhase('error') }
      if (done)    {
        setLoginNeedsCode(false)
        setLoginCodeSubmitted(false)
        setLoginPhase('done')
        window.api.skill.checkAuthStatus().then(setClaudeCodeLoggedIn)
      }
    }

    window.api.skill.onLoginProgress(onProgress)
    try {
      await window.api.skill.loginClaude()
      if (!hadError) setLoginPhase('done')
    } catch {
      setLoginPhase('error')
    } finally {
      window.api.skill.offLoginProgress(onProgress)
    }
  }, [])

  const handleAutoConfigure = async () => {
    setAutoConfigStatus(null)
    const result = await window.api.mcp.autoConfigure()
    if (result.success) {
      setAutoConfigStatus('Configured!')
      setAutoConfigIsError(false)
      await loadMcpStatus()
    } else {
      setAutoConfigStatus(`Failed: ${result.error ?? 'unknown error'}`)
      setAutoConfigIsError(true)
    }
    timers.current.push(setTimeout(() => { setAutoConfigStatus(null); setAutoConfigIsError(false) }, 3000))
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(configSnippet)
    setCopied(true)
    timers.current.push(setTimeout(() => setCopied(false), 2000))
  }

  const handleTestConnection = async () => {
    setTestResult(null)
    const result = await window.api.mcp.testConnection()
    if (result.running) {
      setTestResult(`Running — ${result.skillCount} active skill${result.skillCount !== 1 ? 's' : ''}`)
    } else {
      setTestResult('Not running')
    }
    timers.current.push(setTimeout(() => setTestResult(null), 4000))
  }

  const renderGeneral = () => (
    <>
      <div className="settings-group">
        <div className="settings-group-title">Claude</div>
        <div className="settings-group-body">
          <div className="settings-group-row">
            <div className="settings-group-row-main">
              <div className="settings-group-row-label">Status</div>
              <div className="settings-group-row-sub">
                <span className={`status-dot ${claudeCodeLoggedIn === true ? 'active' : claudeCodeLoggedIn === false ? 'inactive' : ''}`} />
                {claudeCodeLoggedIn === null && 'Checking Claude…'}
                {claudeCodeLoggedIn === true && 'Claude ready — skills generated via your subscription'}
                {claudeCodeLoggedIn === false && !claudeCodeInstalled && 'Claude not installed'}
                {claudeCodeLoggedIn === false && claudeCodeInstalled === true && 'Not logged in to Claude'}
              </div>
            </div>
            {claudeCodeInstalled === false && setupPhase === 'idle' && loginPhase === 'idle' && (
              <button className="settings-btn" onClick={handleSetup}>Install</button>
            )}
            {claudeCodeInstalled === true && claudeCodeLoggedIn === false && loginPhase === 'idle' && setupPhase === 'idle' && (
              <button className="settings-btn" onClick={handleLogin}>Log in</button>
            )}
          </div>

          {setupPhase !== 'idle' && setupPhase !== 'done' && (
            <div className="settings-group-row settings-group-row--full">
              <div className="settings-setup-log">
                {setupLines.map((line, i) => (
                  <div key={i} className={`settings-setup-line${setupPhase === 'error' && i === setupLines.length - 1 ? ' error' : ''}`}>
                    {line}
                  </div>
                ))}
                {setupPhase !== 'error' && (
                  <div className="settings-setup-line muted">…</div>
                )}
              </div>
            </div>
          )}

          {setupPhase === 'done' && (
            <div className="settings-group-row settings-group-row--full">
              <p className="settings-hint success">
                Claude installed and authenticated — skills now use your subscription.
              </p>
            </div>
          )}

          {loginPhase === 'logging-in' && (
            <div className="settings-group-row settings-group-row--full">
              <div className="settings-setup-log">
                {loginLines.map((line, i) => {
                  const urlMatch = line.match(/(https:\/\/\S+)/)
                  return (
                    <div key={i} className="settings-setup-line">
                      {urlMatch ? (
                        <>
                          {line.slice(0, urlMatch.index)}
                          <a
                            href="#"
                            style={{ color: 'var(--accent)', wordBreak: 'break-all' }}
                            onClick={(e) => { e.preventDefault(); window.api.openExternal(urlMatch[1]) }}
                          >
                            {urlMatch[1]}
                          </a>
                          {line.slice((urlMatch.index ?? 0) + urlMatch[1].length)}
                        </>
                      ) : line}
                    </div>
                  )
                })}
                {loginNeedsCode ? (
                  <div style={{ marginTop: 8 }}>
                    <p className="settings-hint" style={{ marginBottom: 6 }}>
                      Your browser opened — authenticate, then paste the code shown back here:
                    </p>
                    <div className="settings-inline-row">
                      <input
                        className="settings-input"
                        type="text"
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && loginCode.trim()) {
                            const { ok } = await window.api.skill.loginSubmitCode(loginCode.trim())
                            setLoginCode('')
                            setLoginNeedsCode(false)
                            if (ok) {
                              setLoginCodeSubmitted(true)
                            } else {
                              setLoginLines((prev) => [...prev, 'Session expired — please try again.'])
                              setLoginPhase('error')
                            }
                          }
                        }}
                        placeholder="Paste authentication code…"
                        autoFocus
                      />
                      <button
                        className="settings-btn"
                        disabled={!loginCode.trim()}
                        onClick={async () => {
                          const { ok } = await window.api.skill.loginSubmitCode(loginCode.trim())
                          setLoginCode('')
                          setLoginNeedsCode(false)
                          if (ok) {
                            setLoginCodeSubmitted(true)
                          } else {
                            setLoginLines((prev) => [...prev, 'Session expired — please try again.'])
                            setLoginPhase('error')
                          }
                        }}
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="settings-setup-line muted">
                    {loginCodeSubmitted ? 'Verifying code…' : 'Waiting for browser login…'}
                  </div>
                )}
              </div>
            </div>
          )}

          {loginPhase === 'error' && (
            <div className="settings-group-row settings-group-row--full">
              <div className="settings-setup-log">
                {loginLines.map((line, i) => (
                  <div key={i} className={`settings-setup-line${i === loginLines.length - 1 ? ' error' : ''}`}>{line}</div>
                ))}
                <div className="settings-inline-row" style={{ marginTop: 8 }}>
                  <button className="settings-btn" onClick={() => { setLoginPhase('idle'); setLoginLines([]); setLoginNeedsCode(false); setLoginCodeSubmitted(false) }}>
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {loginPhase === 'done' && (
            <div className="settings-group-row settings-group-row--full">
              <p className="settings-hint success">
                Logged in — skill generation now uses your Claude subscription.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">
          Anthropic API key{claudeCodeLoggedIn === true && ' (optional)'}
        </div>
        <div className="settings-group-body">
          <div className="settings-group-row settings-group-row--full">
            <div className="settings-inline-row">
              <input
                className="settings-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder="sk-ant-…"
              />
              <button className="settings-btn" onClick={handleUpdate}>
                {saved ? 'Saved' : 'Update'}
              </button>
            </div>
            <p className="settings-hint">
              {claudeCodeLoggedIn === true
                ? 'Claude is active. This key is used as a fallback only.'
                : 'Used to generate skill files with Claude Haiku. Your key is stored encrypted locally and never leaves your machine.'}
            </p>
          </div>
        </div>
      </div>
    </>
  )

  const renderClaudeDesktop = () => (
    <div className="settings-group">
      <div className="settings-group-title">Claude Desktop integration</div>
      <div className="settings-group-body">
        <div className="settings-group-row">
          <div className="settings-group-row-main">
            <div className="settings-group-row-label">Status</div>
            <div className="settings-group-row-sub">
              <span className={`status-dot ${mcpConfigured ? 'active' : 'inactive'}`} />
              {mcpConfigured ? 'Configured' : 'Not configured'}
            </div>
          </div>
          <button className="settings-btn" onClick={handleAutoConfigure}>
            Auto-configure
          </button>
        </div>

        {mcpConfigPath && (
          <div className="settings-group-row settings-group-row--full">
            <p className="settings-hint settings-mcp-path">
              Config file: {mcpConfigPath}
            </p>
          </div>
        )}

        {autoConfigStatus && (
          <div className="settings-group-row settings-group-row--full">
            <p className={`settings-hint${autoConfigIsError ? ' error' : ' success'}`}>{autoConfigStatus}</p>
          </div>
        )}

        <div className="settings-group-row settings-group-row--full">
          <div className="settings-group-row-label">Manual configuration</div>
          <p className="settings-hint" style={{ marginTop: 4 }}>
            Add this to <code>claude_desktop_config.json</code>:
          </p>
          <div className="settings-mcp-snippet-row">
            <pre className="settings-mcp-snippet">{configSnippet}</pre>
            <button className="settings-btn settings-mcp-copy-btn" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="settings-group-row">
          <div className="settings-group-row-main">
            <div className="settings-group-row-label">Test connection</div>
            <div className="settings-group-row-sub">
              {testResult ?? 'Verify the MCP server is reachable.'}
            </div>
          </div>
          <button className="settings-btn" onClick={handleTestConnection}>
            Test
          </button>
        </div>
      </div>
    </div>
  )

  const renderAppearance = () => (
    <>
      <div className="settings-group">
        <div className="settings-group-title">Theme</div>
        <div className="settings-group-body">
          <div className="settings-group-row settings-group-row--full">
            <div className="settings-group-row-label">Dark by design</div>
            <p className="settings-hint" style={{ marginTop: 4 }}>
              Git Suite is a dark-only app. The palette is tuned for long sessions
              reading code and READMEs; a light mode isn&rsquo;t planned.
            </p>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Background</div>
        <div className="settings-group-body">
          <div className="settings-group-row settings-group-row--full">
            <p className="settings-hint" style={{ marginBottom: 12 }}>
              Choose the wallpaper shown behind the app.
            </p>
            <div className="bg-picker" role="radiogroup" aria-label="Background style">
              {BACKGROUND_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={background === opt.value}
                  className={`bg-picker-option${background === opt.value ? ' selected' : ''}`}
                  onClick={() => setBackground(opt.value)}
                >
                  <div className={`bg-picker-preview bg-picker-preview--${opt.value}`} />
                  <div className="bg-picker-label">{opt.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )

  const renderLanguage = () => (
    <>
      <div className="settings-group">
        <div className="settings-group-title">Language</div>
        <div className="settings-group-body">
          <div className="settings-group-row">
            <div className="settings-group-row-main">
              <div className="settings-group-row-label">Preferred language</div>
              <div className="settings-group-row-sub">
                Repo descriptions and READMEs in other languages will be automatically translated.
              </div>
            </div>
            <select
              className="settings-select"
              value={preferredLanguage}
              onChange={e => savePreferredLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="it">Italian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese (Simplified)</option>
              <option value="ru">Russian</option>
              <option value="ar">Arabic</option>
              <option value="hi">Hindi</option>
              <option value="nl">Dutch</option>
              <option value="pl">Polish</option>
              <option value="tr">Turkish</option>
              <option value="vi">Vietnamese</option>
              <option value="id">Indonesian</option>
              <option value="sv">Swedish</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Text-to-Speech</div>
        <div className="settings-group-body">
          <div className="settings-group-row">
            <div className="settings-group-row-main">
              <div className="settings-group-row-label">Voice</div>
              <div className="settings-group-row-sub">
                Requires internet connection. Falls back to browser voice when offline.
              </div>
            </div>
            <div className="settings-select-row">
              <select
                className="settings-select"
                value={ttsVoice}
                onChange={e => saveTtsVoice(e.target.value)}
              >
                {ttsVoices.map(v => (
                  <option key={v.shortName} value={v.shortName}>{v.label}</option>
                ))}
              </select>
              <button
                className="settings-btn"
                onClick={handleTtsPreview}
                disabled={ttsPreviewPlaying || !ttsVoice}
              >
                {ttsPreviewPlaying ? 'Playing…' : 'Preview'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )

  const renderDownloads = () => (
    <div className="settings-group">
      <div className="settings-group-title">Download location</div>
      <div className="settings-group-body">
        <div className="settings-group-row settings-group-row--full">
          <div className="settings-group-row-label">Folder</div>
          <div className="settings-group-row-sub" style={{ marginTop: 4 }}>
            Where downloaded repository ZIP files are saved.
          </div>
          <div className="settings-inline-row" style={{ marginTop: 10 }}>
            <span className="settings-path">
              {downloadFolder || defaultDownloadFolder || 'Loading…'}
            </span>
            <button className="settings-btn" onClick={handleChangeFolder}>Change</button>
            {downloadFolder && (
              <button className="settings-btn settings-btn--link" onClick={handleResetFolder}>
                Reset to default
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const activeLabel = CATEGORIES.find(c => c.id === activeCategory)?.label ?? ''

  return (
    <div className="settings-view">
      <aside className="settings-sidebar">
        <h1 className="settings-title">Settings</h1>
        <nav className="settings-nav" aria-label="Settings categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              className={`settings-nav-item${activeCategory === cat.id ? ' active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              aria-current={activeCategory === cat.id ? 'page' : undefined}
            >
              <span className="settings-nav-icon">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="settings-content">
        <div key={activeCategory} className="settings-pane">
          <h2 className="settings-pane-title">{activeLabel}</h2>
          {activeCategory === 'general' && renderGeneral()}
          {activeCategory === 'claude-desktop' && renderClaudeDesktop()}
          {activeCategory === 'appearance' && renderAppearance()}
          {activeCategory === 'language' && renderLanguage()}
          {activeCategory === 'downloads' && renderDownloads()}
        </div>
      </main>
    </div>
  )
}
