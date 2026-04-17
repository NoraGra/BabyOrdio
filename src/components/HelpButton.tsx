import { useState } from 'react'
import HelpSheet, { type HelpScreen } from './HelpSheet'

interface Props {
  screen: HelpScreen
  large?: boolean
}

export default function HelpButton({ screen, large = false }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className={`help-btn ${large ? 'help-btn--large' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Hilfe"
      >
        {/* Question mark SVG — stroke style matching other icons */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={large ? 2.2 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="17" r="0.4" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && <HelpSheet screen={screen} onClose={() => setOpen(false)} />}
    </>
  )
}
