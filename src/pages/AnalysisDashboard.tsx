import { useEffect, useState } from 'react'
import type { SessionData, SessionStats } from '../hooks/useSessionRecorder'

interface Props {
  session: SessionData
  stats: SessionStats
  onBack: () => void
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec} Sek.`
  return `${Math.floor(sec / 60)} Min. ${sec % 60} Sek.`
}

function fmtTime(msFromStart: number, startTime: Date): string {
  const t = new Date(startTime.getTime() + msFromStart)
  return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Build a colour-coded timeline array from events */
function buildTimeline(session: SessionData) {
  const total = (session.endTime ?? new Date()).getTime() - session.startTime.getTime()
  if (total <= 0) return []

  interface Seg { type: 'quiet' | 'cry' | 'move' | 'both'; pct: number }
  const segments: Seg[] = []

  // Resolution: 1 bucket per 5 s
  const bucketMs = 5000
  const numBuckets = Math.max(1, Math.round(total / bucketMs))

  for (let i = 0; i < numBuckets; i++) {
    const lo = i * bucketMs
    const hi = (i + 1) * bucketMs

    const hasCry = session.cryEvents.some(e => {
      const end = e.endMs ?? total
      return e.startMs < hi && end > lo
    })
    const hasMove = session.moveEvents.some(e => e.timeMs >= lo && e.timeMs < hi)

    segments.push({
      type: hasCry && hasMove ? 'both' : hasCry ? 'cry' : hasMove ? 'move' : 'quiet',
      pct: 100 / numBuckets,
    })
  }
  return segments
}

export default function AnalysisDashboard({ session, stats, onBack }: Props) {
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(true)
  const timeline = buildTimeline(session)

  useEffect(() => {
    const payload = {
      durationSec:  stats.durationSec,
      cryCount:     stats.cryCount,
      cryTotalSec:  stats.cryTotalSec,
      moveCount:    stats.moveCount,
      peakCryLevel: stats.peakCryLevel,
      sessionCode:  session.sessionCode,
    }

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(d => setAiSummary(d.analysis ?? null))
      .catch(() => setAiSummary('KI-Analyse konnte nicht geladen werden.'))
      .finally(() => setAiLoading(false))
  }, [])  // run once on mount

  return (
    <div className="screen analysis-screen">
      {/* Sticky header */}
      <div className="analysis-header">
        <div className="analysis-header-left">
          <button className="analysis-nav-back" onClick={onBack}>
            ← Zurück
          </button>
          <span className="analysis-title">Session-Analyse</span>
        </div>
        <span className="o-card-tag">{session.sessionCode.slice(0,3)} {session.sessionCode.slice(3)}</span>
      </div>

      <div className="analysis-body">

        {/* ── Overview ─────────────────────────────────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">Übersicht</span>
            <span className="o-card-tag">Session</span>
          </div>
          <div className="session-meta">
            <div className="session-meta-item">
              <span className="meta-label">Dauer</span>
              <span className="meta-value">{fmtDur(stats.durationSec)}</span>
            </div>
            <div className="session-meta-item">
              <span className="meta-label">Start</span>
              <span className="meta-value">
                {session.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="session-meta-item">
              <span className="meta-label">Ende</span>
              <span className="meta-value">
                {(session.endTime ?? new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        {/* ── Timeline ─────────────────────────────────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">Timeline</span>
          </div>
          {timeline.length > 0 ? (
            <>
              <div className="timeline-bar">
                {timeline.map((seg, i) => (
                  <div
                    key={i}
                    className={`timeline-segment timeline-segment--${seg.type}`}
                    style={{ flex: seg.pct }}
                    title={seg.type}
                  />
                ))}
              </div>
              <div className="timeline-legend">
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#E8EAF0' }} />
                  Ruhig
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#FCA5A5' }} />
                  Weinen
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#FDE68A' }} />
                  Bewegung
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: '#F97316', opacity: 0.7 }} />
                  Beides
                </span>
              </div>
            </>
          ) : (
            <p className="empty-state">Keine Daten aufgezeichnet</p>
          )}
        </div>

        {/* ── Stats grid ───────────────────────────────────────────── */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card-icon">😢</span>
            <span className="stat-card-value">{stats.cryCount}</span>
            <span className="stat-card-label">Weinphasen</span>
            {stats.cryTotalSec > 0 && (
              <span className="stat-card-sub">gesamt {fmtDur(stats.cryTotalSec)}</span>
            )}
          </div>
          <div className="stat-card">
            <span className="stat-card-icon">🏃</span>
            <span className="stat-card-value">{stats.moveCount}</span>
            <span className="stat-card-label">Bewegungen</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-icon">📈</span>
            <span className="stat-card-value">{stats.peakCryLevel}/10</span>
            <span className="stat-card-label">Max. Weinintensität</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-icon">😴</span>
            <span className="stat-card-value">
              {stats.durationSec > 0
                ? `${Math.round(100 - (stats.cryTotalSec / stats.durationSec) * 100)}%`
                : '—'}
            </span>
            <span className="stat-card-label">Ruhezeit</span>
          </div>
        </div>

        {/* ── AI Summary ───────────────────────────────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">KI-Analyse</span>
            <span className="ai-powered-tag">✨ Claude AI</span>
          </div>
          {aiLoading ? (
            <div className="ai-summary-loading">
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              Analyse läuft…
            </div>
          ) : (
            <p className="ai-summary-text">{aiSummary}</p>
          )}
        </div>

        {/* ── Cry events log ───────────────────────────────────────── */}
        {session.cryEvents.length > 0 && (
          <div className="o-card">
            <div className="o-card-header">
              <span className="o-card-title">Weinphasen</span>
              <span className="o-card-tag">{session.cryEvents.length}×</span>
            </div>
            <div className="events-list">
              {session.cryEvents.map((e, i) => (
                <div className="event-row" key={e.id}>
                  <span className="event-row-icon">😢</span>
                  <span className="event-row-time">{fmtTime(e.startMs, session.startTime)}</span>
                  <span className="event-row-desc">Intensität {e.peakLevel}/10</span>
                  <span className="event-row-dur">
                    {e.endMs != null ? fmtDur(Math.round((e.endMs - e.startMs) / 1000)) : 'läuft'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Move events log ──────────────────────────────────────── */}
        {session.moveEvents.length > 0 && (
          <div className="o-card">
            <div className="o-card-header">
              <span className="o-card-title">Bewegungen</span>
              <span className="o-card-tag">{session.moveEvents.length}×</span>
            </div>
            <div className="events-list">
              {session.moveEvents.slice(-10).map((e) => (
                <div className="event-row" key={e.id}>
                  <span className="event-row-icon">🏃</span>
                  <span className="event-row-time">{fmtTime(e.timeMs, session.startTime)}</span>
                  <span className="event-row-desc">Intensität {e.intensity}/10</span>
                </div>
              ))}
              {session.moveEvents.length > 10 && (
                <p className="empty-state">+ {session.moveEvents.length - 10} weitere</p>
              )}
            </div>
          </div>
        )}

        {/* Spacer at bottom for comfortable scrolling */}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
