import { ShieldCheck, Shield, Check } from 'lucide-react'

export default function VerificationToggles({
  active, onToggle,
}: {
  active: Set<'verified' | 'likely'>
  onToggle: (tier: 'verified' | 'likely') => void
}) {
  return (
    <>
      <button
        className={`discover-verification-btn${active.has('verified') ? ' active' : ''}`}
        onClick={() => onToggle('verified')}
        title="Official"
        aria-pressed={active.has('verified')}
      >
        <span className="discover-verification-check">{active.has('verified') && <Check size={9} />}</span>
        <ShieldCheck size={12} color="#7c3aed" fill="#7c3aed" />
      </button>
      <button
        className={`discover-verification-btn${active.has('likely') ? ' active' : ''}`}
        onClick={() => onToggle('likely')}
        title="Partial Official"
        aria-pressed={active.has('likely')}
      >
        <span className="discover-verification-check">{active.has('likely') && <Check size={9} />}</span>
        <Shield size={12} color="#16a34a" fill="#16a34a" />
      </button>
    </>
  )
}
