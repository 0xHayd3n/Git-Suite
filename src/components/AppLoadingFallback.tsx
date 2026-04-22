export default function AppLoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      width: '100%',
      opacity: 0.4,
      fontSize: 13,
      color: 'var(--t2)',
    }}>
      Loading…
    </div>
  )
}
