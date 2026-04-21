export default function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="lib-detail-row">
      <span className="lib-detail-key">{k}</span>
      <span className="lib-detail-val">{v}</span>
    </div>
  )
}
