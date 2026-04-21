export default function SectionHeader({ label }: { label: string }) {
  return (
    <div className="library-section-header">
      <span className="library-section-label">{label}</span>
      <div className="library-section-line" />
    </div>
  )
}
