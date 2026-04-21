import { useState, useRef, useEffect } from 'react'
import { Clipboard, Check, Folder } from 'lucide-react'
import FileIcon from './FileIcon'

interface Props {
  path: string
  onNavigate: (path: string) => void
  onPathSubmit?: (path: string) => void
  isDirectory?: boolean
}

export default function BreadcrumbBar({ path, onNavigate, onPathSubmit, isDirectory }: Props) {
  const segments = path.split('/')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only enter edit mode if clicking the container background itself
    if (e.target === e.currentTarget && onPathSubmit) {
      setEditing(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = inputRef.current?.value.trim() ?? ''
      onPathSubmit?.(value)
      setEditing(false)
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="breadcrumb-bar breadcrumb-bar--editing">
        <input
          ref={inputRef}
          className="breadcrumb-bar__edit-input"
          type="text"
          defaultValue={path}
          onKeyDown={handleKeyDown}
          onBlur={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="breadcrumb-bar" onClick={handleContainerClick}>
      <button
        className="breadcrumb-bar__segment"
        onClick={() => onNavigate('')}
      >
        root
      </button>
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1
        const segPath = segments.slice(0, i + 1).join('/')
        return (
          <span key={segPath}>
            <span className="breadcrumb-bar__sep">/</span>
            {isLast ? (
              <span className="breadcrumb-bar__current">
                {isDirectory
                  ? <Folder size={13} color="var(--accent)" />
                  : <FileIcon filename={segment} size={13} />
                }
                {segment}
              </span>
            ) : (
              <button
                className="breadcrumb-bar__segment"
                onClick={() => onNavigate(segPath)}
              >
                {segment}
              </button>
            )}
          </span>
        )
      })}
      <button className="breadcrumb-bar__copy" title="Copy file path" onClick={handleCopyPath}>
        {copied ? <Check size={12} /> : <Clipboard size={12} />}
      </button>
    </div>
  )
}
