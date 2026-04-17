interface Props {
  waiting?: boolean
}

/**
 * Shown on the parent screen when video is unavailable.
 * - waiting=true  → baby hasn't joined yet
 * - waiting=false → video degraded, audio only
 */
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
        {waiting ? 'Waiting for Baby Device…' : 'Audio only — video paused to maintain connection'}
      </p>
    </div>
  )
}
