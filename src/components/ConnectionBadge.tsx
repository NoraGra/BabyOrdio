import type { MonitorState } from '../hooks/useMonitorState'

interface Props {
  state: MonitorState
  hasVideo?: boolean
}

const CONFIG: Record<MonitorState, { label: string; color: string; pulse: boolean; icon: string }> = {
  waiting:      { label: 'Warte auf Baby-Gerät…', color: '#888888', pulse: false, icon: '⏳' },
  connecting:   { label: 'Verbinde…',             color: '#888888', pulse: true,  icon: '🔄' },
  connected:    { label: 'Video + Audio',          color: '#22c55e', pulse: false, icon: '🎥' },
  reconnecting: { label: 'Verbinde neu…',          color: '#eab308', pulse: true,  icon: '🔄' },
  degraded:     { label: 'Nur Audio',              color: '#f97316', pulse: false, icon: '🔊' },
  critical:     { label: 'Verbindung getrennt',    color: '#ef4444', pulse: false, icon: '⚠️' },
}

export default function ConnectionBadge({ state, hasVideo }: Props) {
  const cfg = CONFIG[state]
  // If connected but no video track yet, show audio-only variant
  const label = (state === 'connected' && hasVideo === false) ? 'Nur Audio' : cfg.label
  const icon  = (state === 'connected' && hasVideo === false) ? '🔊' : cfg.icon

  return (
    <div className="connection-badge">
      <span
        className={`badge-dot ${cfg.pulse ? 'pulse' : ''}`}
        style={{ backgroundColor: cfg.color }}
      />
      <span className="badge-icon">{icon}</span>
      <span className="badge-label" style={{ color: cfg.color }}>
        {label}
      </span>
    </div>
  )
}
