export default function ComponentPreview({ name }: { name: string }) {
  const n = name.toLowerCase()
  if (n === 'button') return (
    <button style={{ background: 'var(--bg4)', color: 'var(--t1)', fontFamily: 'Inter, sans-serif', fontSize: 8, padding: '3px 8px', borderRadius: 3, border: 'none', cursor: 'default' }}>Button</button>
  )
  if (n === 'input') return (
    <div style={{ background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 3, padding: '3px 6px', fontSize: 8, color: 'var(--t3)', width: 60 }}>Input</div>
  )
  if (n === 'select') return (
    <div style={{ background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 3, padding: '3px 6px', fontSize: 8, color: 'var(--t3)', width: 60, display: 'flex', justifyContent: 'space-between' }}>Select <span>&#9662;</span></div>
  )
  if (n === 'badge') return (
    <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 20, padding: '2px 7px', fontSize: 8, color: 'var(--accent-text)' }}>Badge</div>
  )
  if (n === 'switch') return (
    <div style={{ width: 24, height: 13, background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 7, position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 13, width: 8, height: 8, borderRadius: '50%', background: 'var(--t1)' }} />
    </div>
  )
  if (n === 'checkbox') return (
    <div style={{ width: 11, height: 11, background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--t1)', fontSize: 7, lineHeight: 1 }}>&#10003;</span>
    </div>
  )
  if (n === 'slider') return (
    <div style={{ width: 60, height: 4, background: 'var(--border2)', borderRadius: 2, position: 'relative' }}>
      <div style={{ width: '60%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '58%', width: 8, height: 8, borderRadius: '50%', background: 'var(--t1)', border: '1px solid var(--border2)' }} />
    </div>
  )
  if (n === 'tooltip') return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '2px 6px', fontSize: 8, color: 'var(--t2)' }}>Tooltip</div>
  )
  if (n === 'dialog') return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 4, padding: '4px 8px', fontSize: 8, color: 'var(--t2)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>Dialog</div>
  )
  if (n === 'progress') return (
    <div style={{ width: 60, height: 5, background: 'var(--border2)', borderRadius: 3 }}>
      <div style={{ width: '65%', height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
    </div>
  )
  if (n === 'tabs') return (
    <div style={{ display: 'flex', gap: 4 }}>
      <div style={{ fontSize: 8, color: 'var(--accent-text)', borderBottom: '1px solid var(--accent)', paddingBottom: 1 }}>Tab1</div>
      <div style={{ fontSize: 8, color: 'var(--t3)' }}>Tab2</div>
    </div>
  )
  if (n === 'avatar') return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: 'var(--accent-text)' }}>AB</div>
  )
  if (n === 'card') return (
    <div style={{ background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 8px', fontSize: 8, color: 'var(--t2)' }}>Card</div>
  )
  if (n === 'separator') return (
    <div style={{ width: 60, height: 1, background: 'var(--border2)' }} />
  )
  return <span style={{ fontSize: 8, color: 'var(--t3)' }}>{name}</span>
}
