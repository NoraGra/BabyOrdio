/** Sleeping baby illustration icon — Ordio blue outline style */
export default function BabyIcon({ size = 80 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* zzz letters */}
      <text x="44" y="14" fontSize="9" fontWeight="700" fill="#5B9BD5" fontFamily="sans-serif" opacity="0.75">z</text>
      <text x="52" y="10" fontSize="11" fontWeight="700" fill="#5B9BD5" fontFamily="sans-serif" opacity="0.55">z</text>
      <text x="61" y="6" fontSize="13" fontWeight="700" fill="#5B9BD5" fontFamily="sans-serif" opacity="0.38">z</text>

      {/* Pillow / bed base */}
      <ellipse cx="40" cy="68" rx="28" ry="6" fill="#D6E9F8" />

      {/* Blanket / body */}
      <path
        d="M14 55 Q14 48 22 46 Q30 44 40 44 Q50 44 58 46 Q66 48 66 55 L66 62 Q54 66 40 66 Q26 66 14 62 Z"
        fill="#A8D5F0"
        stroke="#5B9BD5"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Blanket fold detail */}
      <path
        d="M20 52 Q40 56 60 52"
        stroke="#5B9BD5"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />

      {/* Head */}
      <circle cx="40" cy="36" r="18" fill="#fff" stroke="#5B9BD5" strokeWidth="2.5" />

      {/* Closed eyes */}
      <path d="M29 36 Q32 33 35 36" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M45 36 Q48 33 51 36" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* Small smile */}
      <path d="M36 42 Q40 45 44 42" stroke="#5B9BD5" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Cheek blush */}
      <circle cx="28" cy="40" r="3.5" fill="#F9C6C6" opacity="0.6" />
      <circle cx="52" cy="40" r="3.5" fill="#F9C6C6" opacity="0.6" />

      {/* Hair tuft */}
      <path d="M37 18 Q40 13 43 18" stroke="#5B9BD5" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}
