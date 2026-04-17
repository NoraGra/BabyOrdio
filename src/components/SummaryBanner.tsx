import type { MissedSummary } from '../hooks/useConnectionLog'

interface Props {
  summary: MissedSummary
  onDismiss: () => void
}

/** Level bar: filled squares proportional to value/10 */
function LevelBar({ value }: { value: number }) {
  const bars = 10
  return (
    <div className="level-bar" aria-label={`${value} von 10`}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`level-bar-cell ${i < value ? 'level-bar-cell--filled' : ''}`}
        />
      ))}
      <span className="level-bar-num">{value}/10</span>
    </div>
  )
}

export default function SummaryBanner({ summary, onDismiss }: Props) {
  const { audioStats } = summary
  const hasAudio = audioStats.peak > 0 || audioStats.activityCount > 0

  return (
    <div className="summary-banner" role="status">
      <div className="summary-top">
        <span className="summary-icon">📋</span>
        <div className="summary-text">
          <p className="summary-headline">Verbindung wiederhergestellt</p>
          <p className="summary-message">{summary.message}</p>
        </div>
        <button className="summary-close" onClick={onDismiss} aria-label="Schließen">✕</button>
      </div>

      {hasAudio && (
        <div className="summary-audio">
          <div className="summary-stat">
            <span className="stat-label">Lautstärke Ø</span>
            <LevelBar value={audioStats.average} />
          </div>
          <div className="summary-stat">
            <span className="stat-label">Spitzenwert</span>
            <div className="stat-peak-row">
              <LevelBar value={audioStats.peak} />
              {audioStats.peakTime && (
                <span className="stat-time">
                  um {audioStats.peakTime.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Aktivitäten</span>
            <span className="stat-value stat-activity">
              {audioStats.activityCount === 0
                ? 'Keine'
                : audioStats.activityCount === 1
                  ? '1 Ereignis'
                  : `${audioStats.activityCount} Ereignisse`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
