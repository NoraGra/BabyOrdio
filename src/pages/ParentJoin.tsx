import { useState } from 'react'

interface Props {
  onJoin: (code: string) => void
  onBack: () => void
}

export default function ParentJoin({ onJoin, onBack }: Props) {
  const [code, setCode] = useState('')
  const isValid = /^\d{6}$/.test(code)

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValid) onJoin(code)
  }

  return (
    <div className="screen join-screen">
      <button className="back-button" onClick={onBack}>
        ← Back
      </button>

      <div className="join-content">
        <h2 className="join-title">Enter Pairing Code</h2>
        <p className="join-subtitle">
          Open the app on the baby's device and enter the 6-digit code shown there.
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
            Start Monitoring
          </button>
        </form>
      </div>
    </div>
  )
}
