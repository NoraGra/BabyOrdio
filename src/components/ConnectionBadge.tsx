import type { MonitorState } from '../hooks/useMonitorState'

interface Props {
  state: MonitorState
}

const CONFIG: Record<MonitorState, { label: string; color: string; pulse: boolean }> = {
  waiting:      { label: 'Waiting for Baby Device…', color: '#888888', pulse: false },
  connecting:   { label: 'Connecting…',              color: '#888888', pulse: true  },
  connected:    { label: 'Connected',                color: '#22c55e', pulse: false },
  reconnecting: { label: 'Reconnecting…',            color: '#eab308', pulse: true  },
  degraded:     { label: 'Audio Only',               color: '#f97316', pulse: false },
  critical:     { label: 'Connection Lost',          color: '#ef4444', pulse: false },
}

export default function ConnectionBadge({ state }: Props) {
  const { label, color, pulse } = CONFIG[state]

  return (
    <div className="connection-badge">
      <span
        className={`badge-dot ${pulse ? 'pulse' : ''}`}
        style={{ backgroundColor: color }}
      />
      <span className="badge-label" style={{ color }}>
        {label}
      </span>
    </div>
  )
}
