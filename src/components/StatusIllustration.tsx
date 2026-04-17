import { useId } from 'react'

type StatusColor = 'green' | 'orange' | 'red' | 'gray'

interface Props {
  color: StatusColor
  headline: string
}

export default function StatusIllustration({ color, headline }: Props) {
  if (color === 'gray')   return <IllusOffline />
  if (color === 'red')    return <IllusCrying />
  if (color === 'orange') return <IllusMoving intense={headline.includes('sehr')} />
  // green
  if (headline.includes('tief') || headline.includes('wahrscheinlich')) return <IllusSleeping />
  return <IllusCalm />
}

// ── Sleeping — moon + stars + zzz ──────────────────────────────────────────
function IllusSleeping() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const maskId = `moon-${uid}`
  return (
    <svg viewBox="0 0 110 90" fill="none" className="status-illus" aria-hidden>
      <defs>
        <mask id={maskId}>
          <rect width="110" height="90" fill="white" />
          <circle cx="40" cy="36" r="22" fill="black" />
        </mask>
      </defs>
      {/* Soft glow bg */}
      <circle cx="52" cy="45" r="38" fill="rgba(46,91,255,0.07)" className="illus-glow" />
      {/* Moon */}
      <circle cx="52" cy="45" r="27" fill="#2E5BFF" opacity="0.88" mask={`url(#${maskId})`} />
      {/* Stars */}
      <circle cx="80" cy="18" r="3"   fill="#2E5BFF" className="illus-star illus-star-1" />
      <circle cx="92" cy="36" r="2"   fill="#2E5BFF" className="illus-star illus-star-2" />
      <circle cx="87" cy="56" r="2.5" fill="#2E5BFF" className="illus-star illus-star-3" />
      <circle cx="70" cy="10" r="1.5" fill="#2E5BFF" className="illus-star illus-star-2" />
      {/* Zzz */}
      <text x="72" y="72" fontSize="9"  fontWeight="800" fill="#2E5BFF" fontFamily="Plus Jakarta Sans,sans-serif" className="illus-z illus-z1">z</text>
      <text x="80" y="61" fontSize="11" fontWeight="800" fill="#2E5BFF" fontFamily="Plus Jakarta Sans,sans-serif" className="illus-z illus-z2">z</text>
      <text x="90" y="49" fontSize="13" fontWeight="800" fill="#2E5BFF" fontFamily="Plus Jakarta Sans,sans-serif" className="illus-z illus-z3">z</text>
    </svg>
  )
}

// ── Calm — ripple rings ────────────────────────────────────────────────────
function IllusCalm() {
  return (
    <svg viewBox="0 0 110 90" fill="none" className="status-illus" aria-hidden>
      {/* Expanding ripple rings */}
      <circle cx="55" cy="45" r="34" stroke="#2E5BFF" strokeWidth="1.5" fill="none" className="illus-ring illus-ring-1" />
      <circle cx="55" cy="45" r="34" stroke="#2E5BFF" strokeWidth="1.5" fill="none" className="illus-ring illus-ring-2" />
      <circle cx="55" cy="45" r="34" stroke="#2E5BFF" strokeWidth="1.5" fill="none" className="illus-ring illus-ring-3" />
      {/* Center heart */}
      <path
        d="M55 51 C55 51 44 43 44 37 C44 33 47.5 30 51 32 C53 33 55 35 55 35 C55 35 57 33 59 32 C62.5 30 66 33 66 37 C66 43 55 51 55 51Z"
        fill="#2E5BFF"
        opacity="0.9"
        className="illus-heartbeat"
      />
    </svg>
  )
}

// ── Moving — wave arcs ────────────────────────────────────────────────────
function IllusMoving({ intense }: { intense: boolean }) {
  return (
    <svg viewBox="0 0 110 90" fill="none" className="status-illus" aria-hidden>
      {/* Motion lines */}
      <path d="M10 45 Q28 30 46 45 Q64 60 82 45 Q96 34 105 45"
        stroke="#2E5BFF" strokeWidth={intense ? 2.5 : 2} strokeLinecap="round" fill="none"
        className="illus-wave illus-wave-1" />
      <path d="M10 55 Q28 40 46 55 Q64 70 82 55 Q96 44 105 55"
        stroke="#2E5BFF" strokeWidth={intense ? 2 : 1.5} strokeLinecap="round" fill="none"
        opacity="0.6" className="illus-wave illus-wave-2" />
      <path d="M10 35 Q28 20 46 35 Q64 50 82 35 Q96 24 105 35"
        stroke="#2E5BFF" strokeWidth={intense ? 2 : 1.5} strokeLinecap="round" fill="none"
        opacity="0.6" className="illus-wave illus-wave-3" />
      {/* Dots on main wave */}
      <circle cx="28" cy="35" r={intense ? 4 : 3} fill="#2E5BFF" opacity="0.7" className="illus-wave-dot illus-wave-dot-1" />
      <circle cx="55" cy="52" r={intense ? 5 : 4} fill="#2E5BFF" className="illus-wave-dot illus-wave-dot-2" />
      <circle cx="82" cy="35" r={intense ? 4 : 3} fill="#2E5BFF" opacity="0.7" className="illus-wave-dot illus-wave-dot-3" />
    </svg>
  )
}

// ── Crying — sound waves ──────────────────────────────────────────────────
function IllusCrying() {
  return (
    <svg viewBox="0 0 110 90" fill="none" className="status-illus" aria-hidden>
      {/* Sound source dot */}
      <circle cx="28" cy="45" r="7" fill="#2E5BFF" className="illus-sound-src" />
      {/* Wave arcs emanating right */}
      <path d="M40 28 Q58 28 58 45 Q58 62 40 62"
        stroke="#2E5BFF" strokeWidth="2.5" strokeLinecap="round" fill="none"
        className="illus-sound-wave illus-sound-w1" />
      <path d="M50 18 Q76 18 76 45 Q76 72 50 72"
        stroke="#2E5BFF" strokeWidth="2" strokeLinecap="round" fill="none"
        opacity="0.65" className="illus-sound-wave illus-sound-w2" />
      <path d="M62 9 Q94 9 94 45 Q94 81 62 81"
        stroke="#2E5BFF" strokeWidth="1.5" strokeLinecap="round" fill="none"
        opacity="0.35" className="illus-sound-wave illus-sound-w3" />
    </svg>
  )
}

// ── Offline — broken signal ───────────────────────────────────────────────
function IllusOffline() {
  return (
    <svg viewBox="0 0 110 90" fill="none" className="status-illus" aria-hidden>
      {/* Wifi arcs — muted */}
      <path d="M20 52 Q55 18 90 52" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M30 62 Q55 38 80 62" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M40 72 Q55 58 70 72" stroke="#6b7280" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="55" cy="79" r="4" fill="#6b7280" />
      {/* X overlay */}
      <line x1="36" y1="26" x2="74" y2="64" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" className="illus-offline-x" />
      <line x1="74" y1="26" x2="36" y2="64" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" className="illus-offline-x" />
    </svg>
  )
}
