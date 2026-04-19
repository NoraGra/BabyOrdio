/**
 * ModeBadge — shows the current connection mode
 *
 * "Sicherer Modus"  = LiveKit (encrypted, via server, always available)
 * "Privater Modus"  = P2P    (no server between devices, max privacy)
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
    ? 'Sicherer Modus'
    : transport === 'relay' ? 'Privater Modus (Relay)' : 'Privater Modus'

  return (
    <>
      <span className="mode-badge" data-mode={mode}>
        {/* Lock icon — outline stroke style */}
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

            {/* Sicherer Modus */}
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
                  Sicherer Modus {mode === 'secured' && <span className="mode-info-current">Aktiv</span>}
                </p>
                <p className="mode-info-desc">
                  Dein Stream läuft verschlüsselt über sichere Server —
                  wie ein Brief im versiegelten Umschlag.
                  Kein Unbefugter kann ihn lesen. Verbindungsaufbau in &lt;2 Sekunden, funktioniert überall.
                </p>
              </div>
            </div>

            <div className="mode-info-divider" />

            {/* Privater Modus */}
            <div className={`mode-info-row ${mode === 'direct' ? 'mode-info-row--active' : ''}`}>
              <div className="mode-info-icon mode-info-icon--direct">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div className="mode-info-text">
                <p className="mode-info-name">
                  Privater Modus {mode === 'direct' && <span className="mode-info-current">Aktiv</span>}
                </p>
                <p className="mode-info-desc">
                  Dein Stream geht direkt von Gerät zu Gerät —
                  kein Server dazwischen, maximale Privatsphäre.
                  Automatischer Wechsel wenn Netzwerk es erlaubt (~10–20 Sekunden nach Start).
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
