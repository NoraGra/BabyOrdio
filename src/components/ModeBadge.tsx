/**
 * ModeBadge — shows the current connection mode (secured / direct)
 * with a ? button that opens a plain-language explanation sheet.
 *
 * "Gesichert"  = LiveKit (encrypted, via server)
 * "Direkt"     = P2P    (no server between devices)
 *
 * Both modes are safe. The difference is where the stream travels.
 */
import { useState } from 'react'

interface Props {
  mode: 'secured' | 'direct'
  /** Optional: show relay vs direct for P2P */
  transport?: 'direct' | 'relay' | 'unknown'
}

export default function ModeBadge({ mode, transport }: Props) {
  const [showInfo, setShowInfo] = useState(false)

  const label = mode === 'secured'
    ? 'Gesichert'
    : transport === 'relay' ? 'Direkt (Relay)' : 'Direkt'

  return (
    <>
      <span className="mode-badge" data-mode={mode}>
        {/* Lock icon */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        {label}
        {/* Info button */}
        <button
          className="mode-badge__info"
          onClick={e => { e.stopPropagation(); setShowInfo(true) }}
          aria-label="Mehr erfahren"
        >
          ?
        </button>
      </span>

      {showInfo && (
        <div className="mode-info-overlay" onClick={() => setShowInfo(false)}>
          <div className="mode-info-sheet" onClick={e => e.stopPropagation()}>

            {/* Gesichert */}
            <div className={`mode-info-row ${mode === 'secured' ? 'mode-info-row--active' : ''}`}>
              <div className="mode-info-icon mode-info-icon--secured">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div className="mode-info-text">
                <p className="mode-info-name">
                  Gesichert {mode === 'secured' && <span className="mode-info-current">Aktiv</span>}
                </p>
                <p className="mode-info-desc">
                  Dein Stream läuft verschlüsselt über sichere Server —
                  wie ein Brief in einem versiegelten Umschlag.
                  Kein Unbefugter kann ihn lesen. Funktioniert überall.
                </p>
              </div>
            </div>

            <div className="mode-info-divider" />

            {/* Direkt */}
            <div className={`mode-info-row ${mode === 'direct' ? 'mode-info-row--active' : ''}`}>
              <div className="mode-info-icon mode-info-icon--direct">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11.5a19.36 19.36 0 0 1-3-8.59A2 2 0 0 1 3.77 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div className="mode-info-text">
                <p className="mode-info-name">
                  Direkt {mode === 'direct' && <span className="mode-info-current">Aktiv</span>}
                </p>
                <p className="mode-info-desc">
                  Dein Stream geht direkt von Gerät zu Gerät —
                  kein Server dazwischen, wie ein Flüstern ins Ohr.
                  Maximale Privatsphäre. Funktioniert im gleichen Netzwerk.
                </p>
              </div>
            </div>

            <button className="mode-info-close" onClick={() => setShowInfo(false)}>
              Schließen
            </button>
          </div>
        </div>
      )}
    </>
  )
}
