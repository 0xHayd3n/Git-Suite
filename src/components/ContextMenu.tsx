import { useEffect, useRef, useState } from 'react'
import { Download, ChevronRight } from 'lucide-react'

export interface ContextMenuTarget {
  path: string
  type: 'blob' | 'tree'
  hasMarkdown: boolean
  fullPath: string
}

interface ContextMenuProps {
  x: number
  y: number
  target: ContextMenuTarget
  onClose: () => void
  onDownloadRaw: (target: ContextMenuTarget) => void
  onDownloadConverted: (target: ContextMenuTarget, format: 'docx' | 'pdf' | 'epub') => void
}

const MD_EXTENSIONS = new Set(['md', 'mdx', 'markdown'])

function isMarkdownFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MD_EXTENSIONS.has(ext)
}

export default function ContextMenu({ x, y, target, onClose, onDownloadRaw, onDownloadConverted }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [submenuOpen, setSubmenuOpen] = useState(false)

  const isFolder = target.type === 'tree'
  const isMd = !isFolder && isMarkdownFile(target.path)
  const isBookFolder = isFolder && target.hasMarkdown  // 2+ markdown files
  const showConvertOptions = isMd || isBookFolder

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 9999,
  }

  if (!showConvertOptions) {
    return (
      <div ref={menuRef} className="ctx-menu" style={style}>
        <button
          className="ctx-menu__item"
          onClick={() => { onDownloadRaw(target); onClose() }}
        >
          <Download size={14} />
          <span>Download</span>
        </button>
      </div>
    )
  }

  return (
    <div ref={menuRef} className="ctx-menu" style={style}>
      <div
        className="ctx-menu__item ctx-menu__item--parent"
        onMouseEnter={() => setSubmenuOpen(true)}
        onMouseLeave={() => setSubmenuOpen(false)}
      >
        <Download size={14} />
        <span>Download</span>
        <ChevronRight size={12} className="ctx-menu__arrow" />

        {submenuOpen && (
          <div className="ctx-menu ctx-menu--sub">
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadRaw(target); onClose() }}
            >
              {isFolder ? 'Zip (.zip)' : `Raw (.${target.path.split('.').pop()})`}
            </button>
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadConverted(target, 'docx'); onClose() }}
            >
              Word (.docx)
            </button>
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadConverted(target, 'pdf'); onClose() }}
            >
              PDF (.pdf)
            </button>
            <button
              className="ctx-menu__item"
              onClick={() => { onDownloadConverted(target, 'epub'); onClose() }}
            >
              ePub (.epub)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
