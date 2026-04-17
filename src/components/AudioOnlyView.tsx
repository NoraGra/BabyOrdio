interface Props {
  waiting?: boolean
}

export default function AudioOnlyView({ waiting = false }: Props) {
  return (
    <div className="audio-only-view">
      <div className="audio-only-icon">{waiting ? '👶' : '🔊'}</div>
      <div className="audio-only-bars">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="audio-bar"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <p className="audio-only-label">
        {waiting
          ? 'Warte auf Baby-Gerät…'
          : 'Nur Audio — Video pausiert für stabile Verbindung'}
      </p>
    </div>
  )
}
