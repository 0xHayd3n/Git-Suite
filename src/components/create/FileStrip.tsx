interface Props {
  files: string[]
  onFileClick: (filePath: string) => void
}

export default function FileStrip({ files, onFileClick }: Props) {
  if (files.length === 0) return null
  return (
    <div className="create-file-strip">
      {files.slice(0, 12).map(f => (
        <button key={f} className="create-file-chip" onClick={() => onFileClick(f)}>{f}</button>
      ))}
      {files.length > 12 && <span className="create-file-count">+{files.length - 12} more</span>}
      <span className="create-file-count">{files.length} files</span>
    </div>
  )
}
