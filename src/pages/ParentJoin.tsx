import { useState } from 'react'
import HelpButton from '../components/HelpButton'

interface Props {
  onJoin: (code: string) => void
  onBack: () => void
}

export default function ParentJoin({ onJoin, onBack }: Props) {
  const [code, setCode] = useState('')
  // 8-char alphanumeric (lowercase letters + digits)
  const isValid = /^[a-z0-9]{8}$/.test(code)

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValid) onJoin(code)
  }

  return (
    <div className="screen join-screen">
      <div className="join-top-bar">
        <button className="overlay-close-x overlay-close-x--labeled" onClick={onBack} aria-label="Zurück zur Auswahl">
          <span className="overlay-close-label">zurück zur Auswahl</span>
          <span className="overlay-close-icon">✕</span>
        </button>
      </div>

      <div className="join-content">
        <h2 className="join-title">Verbindungscode eingeben</h2>
        <p className="join-subtitle">
          Öffne die App auf dem Baby-Gerät und gib den 6-stelligen Code ein, der dort angezeigt wird.
        </p>

        <form className="join-form" onSubmit={handleSubmit}>
          <input
            className="code-input"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={handleInput}
            autoFocus
          />

          <button
            className="primary-button"
            type="submit"
            disabled={!isValid}
          >
            Monitoring starten
          </button>
        </form>
      </div>

      <HelpButton screen="join" />
    </div>
  )
}
