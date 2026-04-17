import { useEffect, useState, useRef } from 'react'
import type { SessionData, SessionStats } from '../hooks/useSessionRecorder'

export type LiveStatus = 'full' | 'partial' | 'offline'

interface Props {
  session: SessionData
  stats: SessionStats
  /** True when called from live monitor — session is still running */
  isLive?: boolean
  /** Connection quality: full = both streams, partial = one, offline = none */
  liveStatus?: LiveStatus
  /** Show a top banner: Video inaktiv, Audio läuft weiter */
  showVideoOffBanner?: boolean
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

function buildTimeline(session: SessionData) {
  const total = (session.endTime ?? new Date()).getTime() - session.startTime.getTime()
  if (total <= 0) return []

  type SegType = 'quiet' | 'cry' | 'move' | 'both'
  const bucketMs = 5000
  const numBuckets = Math.max(1, Math.round(total / bucketMs))

  return Array.from({ length: numBuckets }, (_, i) => {
    const lo = i * bucketMs
    const hi = (i + 1) * bucketMs
    const hasCry  = session.cryEvents.some(e => e.startMs < hi && (e.endMs ?? total) > lo)
    const hasMove = session.moveEvents.some(e => e.timeMs >= lo && e.timeMs < hi)
    const type: SegType = hasCry && hasMove ? 'both' : hasCry ? 'cry' : hasMove ? 'move' : 'quiet'
    return { type, pct: 100 / numBuckets }
  })
}

/** Generates a live German recap of the last 5 minutes from recorded events. */
function buildLiveSummary(session: SessionData): string {
  const nowMs = Date.now() - session.startTime.getTime()
  const windowMs = 5 * 60 * 1000 // last 5 minutes
  const since = Math.max(0, nowMs - windowMs)

  // Cry events in window
  const recentCries = session.cryEvents.filter(e => (e.endMs ?? nowMs) >= since)
  const cryCount = recentCries.length
  const cryTotalSec = Math.round(
    recentCries.reduce((sum, e) => sum + ((e.endMs ?? nowMs) - e.startMs), 0) / 1000
  )

  // Move events in window
  const recentMoves = session.moveEvents.filter(e => e.timeMs >= since)
  const moveCount = recentMoves.length

  // Time since last event
  const lastCryEnd = recentCries.length > 0
    ? Math.max(...recentCries.map(e => e.endMs ?? nowMs))
    : null
  const lastMove = recentMoves.length > 0
    ? Math.max(...recentMoves.map(e => e.timeMs))
    : null
  const lastActivityMs = Math.max(lastCryEnd ?? 0, lastMove ?? 0)
  const silenceSec = lastActivityMs > 0 ? Math.round((nowMs - lastActivityMs) / 1000) : null

  if (cryCount === 0 && moveCount === 0) {
    const totalSec = Math.round(nowMs / 1000)
    if (totalSec < 60) return 'Alles ruhig — Session gerade gestartet.'
    return `Alles ruhig seit ${totalSec >= 120 ? `${Math.floor(totalSec / 60)} Min.` : `${totalSec} Sek.`}`
  }

  const parts: string[] = []
  if (cryCount > 0) {
    parts.push(`${cryCount}× Weinen (${fmtDur(cryTotalSec)})`)
  }
  if (moveCount > 0) {
    parts.push(`${moveCount} Bewegung${moveCount !== 1 ? 'en' : ''}`)
  }

  let tail = ''
  if (silenceSec !== null && silenceSec > 10) {
    tail = silenceSec >= 120
      ? ` · Zuletzt ruhig seit ${Math.floor(silenceSec / 60)} Min.`
      : ` · Zuletzt ruhig seit ${silenceSec} Sek.`
  }

  return `Letzte 5 Min.: ${parts.join(', ')}${tail}`
}

export default function AnalysisDashboard({ session, stats, isLive = false, liveStatus = 'offline', showVideoOffBanner = false, onBack }: Props) {
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const timeline = buildTimeline(session)

  // Live recap — refreshes every 15s so the summary stays current
  const [liveSummary, setLiveSummary] = useState(() => isLive ? buildLiveSummary(session) : '')
  const liveSummaryRef = useRef(session)
  liveSummaryRef.current = session
  useEffect(() => {
    if (!isLive) return
    setLiveSummary(buildLiveSummary(liveSummaryRef.current))
    const id = setInterval(() => {
      setLiveSummary(buildLiveSummary(liveSummaryRef.current))
    }, 15_000)
    return () => clearInterval(id)
  }, [isLive])

  // Only fetch AI summary when session has ended
  useEffect(() => {
    if (isLive) return
    setAiLoading(true)
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        durationSec:  stats.durationSec,
        cryCount:     stats.cryCount,
        cryTotalSec:  stats.cryTotalSec,
        moveCount:    stats.moveCount,
        peakCryLevel: stats.peakCryLevel,
        sessionCode:  session.sessionCode,
      }),
    })
      .then(r => r.json())
      .then(d => setAiSummary(d.analysis ?? null))
      .catch(() => setAiSummary('KI-Analyse konnte nicht geladen werden.'))
      .finally(() => setAiLoading(false))
  }, [isLive]) // runs once when component mounts, skipped if isLive

  return (
    <div className="screen analysis-screen">
      {/* Sticky header */}
      <div className="analysis-header">
        <div className="analysis-header-left">
          <button className="analysis-nav-back" onClick={onBack}>
            {isLive ? '← Zurück zur Übertragung' : '← Zurück zur Auswahl'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Code — plain blue text, no bubble */}
          <span className="header-code">
            {session.sessionCode.slice(0,3)} {session.sessionCode.slice(3)}
          </span>
          {/* LIVE badge — green / orange / red */}
          {isLive && (
            <span className={`live-badge live-badge--${liveStatus}`}>
              <span className="live-dot" />
              {liveStatus === 'offline' ? 'Auf Verbindung warten' : 'LIVE'}
            </span>
          )}
          {/* X — no circle */}
          <button className="overlay-close-x" onClick={onBack} aria-label="Schließen">
            ✕
          </button>
        </div>
      </div>

      {/* Video-off banner */}
      {showVideoOffBanner && (
        <div className="video-off-banner">
          <span className="video-off-icon">🔊</span>
          <div>
            <strong>Video inaktiv</strong> — Audio läuft weiter
            <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: 2 }}>
              Verbindung ist schwach. Video wird bei Verbesserung automatisch reaktiviert.
            </div>
          </div>
        </div>
      )}

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
            {!isLive && session.endTime && (
              <div className="session-meta-item">
                <span className="meta-label">Ende</span>
                <span className="meta-value">
                  {session.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            {isLive && (
              <div className="session-meta-item">
                <span className="meta-label">Status</span>
                <span className="meta-value" style={{ color: '#22c55e', fontSize: '0.95rem' }}>
                  ● Aktiv
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Timeline ─────────────────────────────────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">Timeline</span>
            {isLive && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted-l)' }}>aktualisiert live</span>}
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
            <p className="empty-state">Noch keine Aktivität aufgezeichnet</p>
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

        {/* ── AI Summary — only after session ends ─────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">KI-Analyse</span>
            <span className="ai-powered-tag">✨ Claude AI</span>
          </div>
          {isLive ? (
            <div className="live-recap">
              <p className="live-recap-text">{liveSummary}</p>
              <p className="live-recap-hint">
                Nach der Session erstellt Claude eine vollständige Analyse.
              </p>
            </div>
          ) : aiLoading ? (
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
              {session.cryEvents.map((e) => (
                <div className="event-row" key={e.id}>
                  <span className="event-row-icon">😢</span>
                  <span className="event-row-time">{fmtTime(e.startMs, session.startTime)}</span>
                  <span className="event-row-desc">Intensität {e.peakLevel}/10</span>
                  <span className="event-row-dur">
                    {e.endMs != null
                      ? fmtDur(Math.round((e.endMs - e.startMs) / 1000))
                      : <span style={{ color: '#ef4444' }}>läuft…</span>}
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

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
