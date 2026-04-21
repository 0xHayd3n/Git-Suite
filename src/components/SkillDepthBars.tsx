import { parseSkillDepths } from '../utils/skillParse'

export default function SkillDepthBars({ content }: { content: string }) {
  const depths = parseSkillDepths(content)
  const total = depths.core + depths.extended + depths.deep || 1
  return (
    <>
      {[
        { label: 'Core',     lines: depths.core,     pct: Math.round((depths.core / total) * 100),                                  color: '#059669' },
        { label: 'Extended', lines: depths.extended, pct: Math.round(((depths.core + depths.extended) / total) * 100),              color: '#6d28d9' },
        { label: 'Deep',     lines: depths.deep,     pct: 100,                                                                      color: '#4c1d95' },
      ].map((d) => (
        <div key={d.label} className="skill-depth-row">
          <span className="skill-depth-label">{d.label}</span>
          <div className="skill-depth-track">
            <div className="skill-depth-fill" style={{ width: `${d.pct}%`, background: d.color }} />
          </div>
          <span className="skill-depth-meta">~{d.lines} lines</span>
        </div>
      ))}
    </>
  )
}
