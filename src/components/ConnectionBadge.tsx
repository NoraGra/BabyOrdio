import type { MonitorState } from '../hooks/useMonitorState'

/** 0 = off/lost · 1 = poor · 2 = ok · 3 = good */
export type QualityLevel = 0 | 1 | 2 | 3

interface Props {
  state:        MonitorState
  videoQuality?: QualityLevel   // provided by ParentMonitor; omitted in BabyDevice
  audioQuality?: QualityLevel
}

// Colour for a given quality level
const Q_COLOUR: Record<QualityLevel, string> = {
  0: '#555555',
  1: '#ef4444',
  2: '#eab308',
  3: '#22c55e',
}

const Q_LABEL: Record<QualityLevel, string> = {
  0: 'Aus',
  1: 'Schlecht',
  2: 'Mittel',
  3: 'Gut',
}

/** Three signal bars, like cellular reception */
function SignalBars({ level, color }: { level: QualityLevel; color: string }) {
  const heights = [7, 11, 15]  // px height for bar 1, 2, 3
  return (
    <div className="signal-bars">
      {heights.map((h, i) => (
        <div
          key={i}
          className="signal-bar"
          style={{
            height: h,
            background: i < level ? color : 'rgba(255,255,255,0.18)',
          }}
        />
      ))}
    </div>
  )
}

const STATE_META: Record<MonitorState, { dot: string; pulse: boolean }> = {
  waiting:      { dot: '#888888', pulse: false },
  connecting:   { dot: '#888888', pulse: true  },
  connected:    { dot: '#22c55e', pulse: false },
  reconnecting: { dot: '#eab308', pulse: true  },
  degraded:     { dot: '#f97316', pulse: false },
  critical:     { dot: '#ef4444', pulse: false },
}

export default function ConnectionBadge({ state, videoQuality, audioQuality }: Props) {
  const { dot, pulse } = STATE_META[state]

  // Show full quality rows only when we have quality data (parent monitor, connected)
  const showQuality =
    (state === 'connected' || state === 'degraded') &&
    (videoQuality !== undefined || audioQuality !== undefined)

  // Fallback simple label for states without quality data
  const simpleLabel: Record<MonitorState, string> = {
    waiting:      'Warte auf Baby-Gerät…',
    connecting:   'Verbinde…',
    connected:    'Verbunden',
    reconnecting: 'Verbinde neu…',
    degraded:     'Nur Audio',
    critical:     'Verbindung getrennt',
  }

  return (
    <div className="connection-badge">
      {/* Status dot */}
      <span
        className={`badge-dot ${pulse ? 'pulse' : ''}`}
        style={{ backgroundColor: dot }}
      />

      {showQuality ? (
        /* Quality rows */
        <div className="badge-quality-grid">
          {/* Video row */}
          <span className="badge-track-icon">🎥</span>
          <SignalBars level={videoQuality!} color={Q_COLOUR[videoQuality!]} />
          <span className="badge-quality-label" style={{ color: Q_COLOUR[videoQuality!] }}>
            {Q_LABEL[videoQuality!]}
          </span>

          {/* Audio row */}
          <span className="badge-track-icon">🔊</span>
          <SignalBars level={audioQuality!} color={Q_COLOUR[audioQuality!]} />
          <span className="badge-quality-label" style={{ color: Q_COLOUR[audioQuality!] }}>
            {Q_LABEL[audioQuality!]}
          </span>
        </div>
      ) : (
        /* Simple label for other states */
        <span className="badge-label" style={{ color: dot }}>
          {simpleLabel[state]}
        </span>
      )}
    </div>
  )
}
