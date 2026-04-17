import { useEffect, useState, useRef } from 'react'
import type { SessionData, SessionStats } from '../hooks/useSessionRecorder'
import ConnectionBadge from '../components/ConnectionBadge'
import type { QualityLevel } from '../components/ConnectionBadge'
import { CryIcon, MoveIcon, PeakIcon, AudioIcon } from '../components/icons/DashboardIcon'

export type LiveStatus = 'full' | 'partial' | 'offline'

interface Props {
  session: SessionData
  stats: SessionStats
  /** True when called from live monitor — session is still running */
  isLive?: boolean
  /** Connection quality: full = both streams, partial = one, offline = none */
  liveStatus?: LiveStatus
  /** Per-track quality levels (only when isLive) */
  videoQuality?: QualityLevel
  audioQuality?: QualityLevel
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

type LiveWindow = 5 | 15 | 30 | null   // null = since start

/** Movement trend: compare activity in first half vs second half of window */
function moveTrend(moves: SessionData['moveEvents'], since: number, nowMs: number): '↑' | '↓' | '→' | null {
  if (moves.length < 4) return null
  const mid = (since + nowMs) / 2
  const first  = moves.filter(e => e.timeMs >= since && e.timeMs < mid).length
  const second = moves.filter(e => e.timeMs >= mid).length
  if (second > first * 1.4) return '↑'
  if (first  > second * 1.4) return '↓'
  return '→'
}

/** Generates a live German recap for the chosen time window. */
function buildLiveSummary(session: SessionData, windowMin: LiveWindow): string {
  const nowMs = Date.now() - session.startTime.getTime()
  const since = windowMin !== null ? Math.max(0, nowMs - windowMin * 60_000) : 0
  const label = windowMin !== null ? `Letzte ${windowMin} Min.` : 'Seit Beginn'

  // Cry events in window
  const recentCries = session.cryEvents.filter(e => (e.endMs ?? nowMs) >= since)
  const cryCount    = recentCries.length
  const cryTotalSec = Math.round(
    recentCries.reduce((sum, e) => sum + ((e.endMs ?? nowMs) - e.startMs), 0) / 1000
  )

  // Move events in window — with enrichment
  const recentMoves = session.moveEvents.filter(e => e.timeMs >= since)
  const moveCount   = recentMoves.length
  const avgIntensity = moveCount > 0
    ? Math.round(recentMoves.reduce((s, e) => s + e.intensity, 0) / moveCount)
    : 0
  const trend = moveTrend(recentMoves, since, nowMs)

  // Time since last activity
  const lastCryEnd = recentCries.length > 0
    ? Math.max(...recentCries.map(e => e.endMs ?? nowMs)) : null
  const lastMoveMs = recentMoves.length > 0
    ? Math.max(...recentMoves.map(e => e.timeMs)) : null
  const lastActivityMs  = Math.max(lastCryEnd ?? 0, lastMoveMs ?? 0)
  const silenceSec = lastActivityMs > 0 ? Math.round((nowMs - lastActivityMs) / 1000) : null

  if (cryCount === 0 && moveCount === 0) {
    if (nowMs < 60_000) return 'Alles ruhig — Session gerade gestartet.'
    return `Alles ruhig${windowMin !== null ? ` (${label})` : ' seit Beginn'}.`
  }

  const parts: string[] = []
  if (cryCount > 0) {
    parts.push(`${cryCount}× Weinen (${fmtDur(cryTotalSec)})`)
  }
  if (moveCount > 0) {
    // e.g. "8 Bewegungen · Ø 4/10 · ↑"
    let moveStr = `${moveCount} Bewegung${moveCount !== 1 ? 'en' : ''}`
    if (avgIntensity > 0) moveStr += ` · Ø ${avgIntensity}/10`
    if (trend)            moveStr += ` ${trend}`
    parts.push(moveStr)
  }

  let tail = ''
  if (silenceSec !== null && silenceSec > 10) {
    tail = silenceSec >= 120
      ? ` · Ruhig seit ${Math.floor(silenceSec / 60)} Min.`
      : ` · Ruhig seit ${silenceSec} Sek.`
  }

  return `${label}: ${parts.join(' · ')}${tail}`
}

export default function AnalysisDashboard({ session, stats, isLive = false, liveStatus = 'offline', videoQuality, audioQuality, showVideoOffBanner = false, onBack }: Props) {
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const timeline = buildTimeline(session)

  // Time window selector for live recap
  const [liveWindow, setLiveWindow] = useState<LiveWindow>(5)

  // Live recap — refreshes every 15s so the summary stays current
  const [liveSummary, setLiveSummary] = useState(() => isLive ? buildLiveSummary(session, 5) : '')
  const liveSummaryRef = useRef(session)
  liveSummaryRef.current = session
  const liveWindowRef = useRef<LiveWindow>(5)
  liveWindowRef.current = liveWindow
  useEffect(() => {
    if (!isLive) return
    setLiveSummary(buildLiveSummary(liveSummaryRef.current, liveWindowRef.current))
    const id = setInterval(() => {
      setLiveSummary(buildLiveSummary(liveSummaryRef.current, liveWindowRef.current))
    }, 15_000)
    return () => clearInterval(id)
  }, [isLive])

  // Rebuild immediately when window changes
  useEffect(() => {
    if (!isLive) return
    setLiveSummary(buildLiveSummary(liveSummaryRef.current, liveWindow))
  }, [liveWindow, isLive])

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
      {/* Sticky header — 3 columns: back | code (center) | X */}
      <div className="analysis-header">
        <button className="analysis-nav-back" onClick={onBack}>
          {isLive ? '← Zurück' : '← Zurück'}
        </button>
        <span className="header-session-code">
          Session Code: {session.sessionCode.slice(0,3)} {session.sessionCode.slice(3)}
        </span>
        <button className="overlay-close-x" onClick={onBack} aria-label="Schließen">
          ✕
        </button>
      </div>

      {/* Video-off banner */}
      {showVideoOffBanner && (
        <div className="video-off-banner">
          <span className="video-off-icon"><AudioIcon size={22} /></span>
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
            {isLive && videoQuality !== undefined && audioQuality !== undefined && (
              <div className="session-meta-item session-meta-item--badge">
                <span className="meta-label">Status Übertragung</span>
                <ConnectionBadge
                  state={liveStatus === 'full' ? 'connected' : liveStatus === 'partial' ? 'degraded' : 'reconnecting'}
                  videoQuality={videoQuality}
                  audioQuality={audioQuality}
                />
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
            <span className="stat-card-icon"><CryIcon size={24} /></span>
            <span className="stat-card-value">{stats.cryCount}</span>
            <span className="stat-card-label">Weinphasen</span>
            {stats.cryTotalSec > 0 && (
              <span className="stat-card-sub">gesamt {fmtDur(stats.cryTotalSec)}</span>
            )}
          </div>
          <div className="stat-card">
            <span className="stat-card-icon"><MoveIcon size={24} /></span>
            <span className="stat-card-value">{stats.moveCount}</span>
            <span className="stat-card-label">Bewegungen</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-icon"><PeakIcon size={24} /></span>
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
            <div className="live-recap-wrapper">
              {/* Window selector */}
              <div className="window-selector" role="group" aria-label="Zeitraum">
                {([5, 15, 30, null] as LiveWindow[]).map(w => (
                  <button
                    key={String(w)}
                    className={`window-chip ${liveWindow === w ? 'window-chip--active' : ''}`}
                    onClick={() => setLiveWindow(w)}
                  >
                    {w === null ? 'Seit Beginn' : `${w} Min.`}
                  </button>
                ))}
              </div>
              <div className="live-recap">
                <p className="live-recap-text">{liveSummary}</p>
                <p className="live-recap-hint">
                  Nach der Session erstellt Claude eine vollständige Analyse.
                </p>
              </div>
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
                  <span className="event-row-icon"><CryIcon size={16} /></span>
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
                  <span className="event-row-icon"><MoveIcon size={16} /></span>
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
