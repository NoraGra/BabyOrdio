/** Parent (with phone / monitor) illustration icon — Ordio blue outline style */
export default function ParentIcon({ size = 80 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Signal arcs above phone */}
      <path d="M30 18 Q40 10 50 18" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.38" />
      <path d="M33 22 Q40 16 47 22" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M36 26 Q40 22 44 26" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9" />
      {/* Antenna dot */}
      <circle cx="40" cy="29" r="2" fill="#5B9BD5" />

      {/* Phone body */}
      <rect x="26" y="34" width="28" height="36" rx="5" fill="#A8D5F0" stroke="#5B9BD5" strokeWidth="2.5" />
      {/* Phone screen */}
      <rect x="30" y="39" width="20" height="22" rx="2.5" fill="#fff" opacity="0.85" />
      {/* Baby face on screen */}
      <circle cx="40" cy="47" r="6" fill="#D6E9F8" stroke="#5B9BD5" strokeWidth="1.5" />
      <path d="M37 47 Q38.5 45.5 40 47" stroke="#5B9BD5" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M40 47 Q41.5 45.5 43 47" stroke="#5B9BD5" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M38 50 Q40 51.5 42 50" stroke="#5B9BD5" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      {/* Phone home bar */}
      <rect x="36" y="64" width="8" height="2.5" rx="1.25" fill="#5B9BD5" opacity="0.45" />
    </svg>
  )
}
