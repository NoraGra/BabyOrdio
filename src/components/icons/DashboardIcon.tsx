/** Small inline icons for the Analysis Dashboard — Ordio blue style */

const BLUE  = '#5B9BD5'
const AMBER = '#ea580c'   // for the audio/banner icon

interface Props { size?: number }

export function CryIcon({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {/* Face outline */}
      <circle cx="10" cy="9" r="6.5" stroke={BLUE} strokeWidth="1.8" />
      {/* Sad mouth */}
      <path d="M7.5 12 Q10 10.5 12.5 12" stroke={BLUE} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {/* Closed eyes */}
      <path d="M7.5 8.5 Q8.5 7.5 9.5 8.5" stroke={BLUE} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M10.5 8.5 Q11.5 7.5 12.5 8.5" stroke={BLUE} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* Teardrop */}
      <path d="M8.5 14.5 Q8 16.5 9 17 Q10 17.5 10 16 Q10 14.5 8.5 14.5Z" fill={BLUE} opacity="0.75" />
    </svg>
  )
}

export function MoveIcon({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {/* Motion lines */}
      <path d="M3 10 H9" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" opacity="0.35" />
      <path d="M3 7  H7"  stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" opacity="0.2"  />
      <path d="M3 13 H7"  stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" opacity="0.2"  />
      {/* Arrow body */}
      <path d="M10 6 L16 10 L10 14" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function PeakIcon({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {/* 3 ascending bars */}
      <rect x="3"  y="13" width="3.5" height="4"  rx="1" fill={BLUE} opacity="0.4" />
      <rect x="8"  y="9"  width="3.5" height="8"  rx="1" fill={BLUE} opacity="0.65" />
      <rect x="13" y="4"  width="3.5" height="13" rx="1" fill={BLUE} />
      {/* Trend arrow */}
      <path d="M4 12 L10 8 L16 4" stroke={BLUE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

/** Zzz moon — Ruhezeit / sleep quality */
export function RestIcon({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {/* Crescent moon */}
      <path
        d="M14.5 11.5 A6 6 0 1 1 8 5 A4.5 4.5 0 0 0 14.5 11.5Z"
        fill={BLUE}
        opacity="0.85"
      />
      {/* zzz letters */}
      <text x="12" y="8"  fontSize="3.5" fontWeight="700" fill={BLUE} opacity="0.5"  fontFamily="sans-serif">z</text>
      <text x="14" y="6"  fontSize="4"   fontWeight="700" fill={BLUE} opacity="0.65" fontFamily="sans-serif">z</text>
      <text x="16" y="4"  fontSize="4.5" fontWeight="700" fill={BLUE} opacity="0.8"  fontFamily="sans-serif">z</text>
    </svg>
  )
}

/** Shield / calm — for sleep quality good state */
export function SleepQualityIcon({ size = 20, level = 'deep' }: Props & { level?: 'deep' | 'light' | 'restless' }) {
  const color = level === 'deep' ? '#16a34a' : level === 'light' ? '#ca8a04' : '#ea580c'
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {/* Simple bed icon */}
      <rect x="2" y="11" width="16" height="5" rx="2" fill={color} opacity="0.2" stroke={color} strokeWidth="1.5" />
      <rect x="2" y="11" width="5" height="5" rx="1.5" fill={color} opacity="0.3" />
      {/* Pillow arc */}
      <path d="M4 11 Q10 7 16 11" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Head */}
      <circle cx="10" cy="9" r="2.5" fill={color} opacity="0.8" />
      {/* Z */}
      {level === 'deep' && (
        <text x="13" y="7" fontSize="4" fontWeight="700" fill={color} opacity="0.65" fontFamily="sans-serif">z</text>
      )}
    </svg>
  )
}

export function AudioIcon({ size = 20 }: Props) {
  const c = AMBER
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {/* Speaker */}
      <path d="M4 7.5 H7 L11 4 V16 L7 12.5 H4 Z" fill={c} opacity="0.85" />
      {/* Wave arcs */}
      <path d="M13 7 Q15 10 13 13" stroke={c} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M15 5 Q18 10 15 15" stroke={c} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
    </svg>
  )
}
