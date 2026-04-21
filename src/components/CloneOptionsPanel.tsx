import { useRef, useState } from 'react'
import {
  Archive, BookOpen, FileText, FileType, Bookmark,
  FolderDown, Check, X, Loader2, Copy, Monitor,
  type LucideIcon,
} from 'lucide-react'
import { getDownloadOptions, type DownloadOption } from '../lib/getDownloadOptions'

const ICON_MAP: Record<string, LucideIcon> = {
  'archive': Archive,
  'book-open': BookOpen,
  'file-text': FileText,
  'file-type': FileType,
  'bookmark': Bookmark,
  'folder-down': FolderDown,
}

type ItemState = 'idle' | 'loading' | 'done' | 'error'
type CloneTab = 'https' | 'ssh' | 'cli'

interface Props {
  owner: string
  name: string
  typeBucket: string
  typeSub: string | null
  defaultBranch: string
  open: boolean
}

export default function CloneOptionsPanel({
  owner, name, typeBucket, typeSub, defaultBranch, open,
}: Props) {
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({})
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [folders, setFolders] = useState<string[] | null>(null)
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [folderExpanded, setFolderExpanded] = useState(false)
  const [cloneTab, setCloneTab] = useState<CloneTab>('https')
  const [urlCopied, setUrlCopied] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  const options = getDownloadOptions(typeBucket, typeSub)
  const downloadOptions = options.filter(o => o.id !== 'folder' && o.id !== 'clone')

  const cloneUrls: Record<CloneTab, string> = {
    https: `https://github.com/${owner}/${name}.git`,
    ssh: `git@github.com:${owner}/${name}.git`,
    cli: `gh repo clone ${owner}/${name}`,
  }

  function setItem(id: string, state: ItemState, error?: string) {
    setItemStates(prev => ({ ...prev, [id]: state }))
    if (error) setItemErrors(prev => ({ ...prev, [id]: error }))
    if (state === 'done') setTimeout(() => setItemStates(prev => ({ ...prev, [id]: 'idle' })), 2000)
    if (state === 'error') setTimeout(() => setItemStates(prev => ({ ...prev, [id]: 'idle' })), 3000)
  }

  async function handleAction(option: DownloadOption) {
    try {
      setItem(option.id, 'loading')
      switch (option.id) {
        case 'zip':       await window.api.download.repoZip(owner, name); break
        case 'epub':      await window.api.download.repoConverted(owner, name, 'epub'); break
        case 'pdf':       await window.api.download.repoConverted(owner, name, 'pdf'); break
        case 'docx':      await window.api.download.repoConverted(owner, name, 'docx'); break
        case 'bookmarks': await window.api.download.bookmarks(owner, name); break
        case 'clone':
        case 'folder': return
      }
      setItem(option.id, 'done')
    } catch (err) {
      setItem(option.id, 'error', err instanceof Error ? err.message : 'Failed')
    }
  }

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(cloneUrls[cloneTab])
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch { /* ignore */ }
  }

  function handleOpenDesktop() {
    window.open(`x-github-client://openRepo/https://github.com/${owner}/${name}`, '_self')
  }

  async function handleFolderToggle() {
    if (folderExpanded) { setFolderExpanded(false); return }
    setFolderExpanded(true)
    if (folders) return
    setFoldersLoading(true)
    try {
      const result = await window.api.download.topLevelFolders(owner, name)
      setFolders(result)
    } catch {
      setFolders([])
    } finally {
      setFoldersLoading(false)
    }
  }

  async function handleFolderDownload(folderPath: string) {
    setItem('folder', 'loading')
    try {
      await window.api.download.rawFolder({ owner, name, branch: defaultBranch, path: folderPath })
      setItem('folder', 'done')
      setFolderExpanded(false)
    } catch (err) {
      setItem('folder', 'error', err instanceof Error ? err.message : 'Failed')
    }
  }

  if (!open) return null

  return (
    <section id="repo-detail-clone-panel" className="clone-panel">
      {/* Clone URL row */}
      <div className="clone-panel__clone-row">
        <div className="clone-panel__tabs">
          {(['https', 'ssh', 'cli'] as CloneTab[]).map(t => (
            <button
              key={t}
              className={`clone-panel__tab${cloneTab === t ? ' clone-panel__tab--active' : ''}`}
              onClick={() => setCloneTab(t)}
            >
              {t === 'https' ? 'HTTPS' : t === 'ssh' ? 'SSH' : 'GitHub CLI'}
            </button>
          ))}
        </div>
        <div className="clone-panel__url-row">
          <input
            ref={urlRef}
            className="clone-panel__url"
            value={cloneUrls[cloneTab]}
            readOnly
            onClick={() => urlRef.current?.select()}
          />
          <button
            className="clone-panel__copy"
            onClick={handleCopyUrl}
            title="Copy to clipboard"
          >
            {urlCopied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Open with GitHub Desktop */}
      <button className="clone-panel__item" onClick={handleOpenDesktop}>
        <Monitor size={14} />
        <span>Open with GitHub Desktop</span>
      </button>

      {/* Download options */}
      <div className="clone-panel__downloads">
        {downloadOptions.map(option => {
          const Icon = ICON_MAP[option.icon]
          const state = itemStates[option.id] ?? 'idle'
          return (
            <button
              key={option.id}
              className="clone-panel__item"
              onClick={() => handleAction(option)}
              disabled={state === 'loading'}
              title={state === 'error' ? itemErrors[option.id] ?? 'Failed' : undefined}
            >
              {state === 'loading' ? <Loader2 size={14} className="spin" /> :
               state === 'done'    ? <Check size={14} /> :
               state === 'error'   ? <X size={14} /> :
               Icon ? <Icon size={14} /> : null}
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>

      {/* Download folder subsection */}
      <button className="clone-panel__item" onClick={handleFolderToggle}>
        <FolderDown size={14} />
        <span>Download folder{'\u2026'}</span>
      </button>
      {folderExpanded && (
        <div className="clone-panel__folders">
          {foldersLoading && (
            <div className="clone-panel__loading">
              <Loader2 size={14} className="spin" /> Loading…
            </div>
          )}
          {folders && folders.length === 0 && <div className="clone-panel__empty">No folders</div>}
          {folders && folders.map(f => (
            <button
              key={f}
              className="clone-panel__folder-item"
              onClick={() => handleFolderDownload(f)}
            >
              <FolderDown size={12} />
              <span>{f}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
