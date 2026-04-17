import { useEffect, useState, useRef, useCallback } from 'react'
import type { SessionData, SessionStats } from '../hooks/useSessionRecorder'
import ConnectionBadge from '../components/ConnectionBadge'
import type { QualityLevel } from '../components/ConnectionBadge'
import { CryIcon, MoveIcon, RestIcon, SleepQualityIcon, AudioIcon } from '../components/icons/DashboardIcon'
import HelpButton from '../components/HelpButton'
import StatusIllustration from '../components/StatusIllustration'

export type LiveStatus = 'full' | 'partial' | 'offline'

interface LiveDetectors {
  isCrying: boolean
  isMoving: boolean
  moveIntensity: number
}

interface Props {
  session: SessionData
  stats: SessionStats
  isLive?: boolean
  liveStatus?: LiveStatus
  liveDetectors?: LiveDetectors
  videoQuality?: QualityLevel
  audioQuality?: QualityLevel
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

// ── Intensity dots ──────────────────────────────────────────────────────────

function IntensityDots({ level, max = 10 }: { level: number; max?: number }) {
  return (
    <span className="intensity-dots" aria-label={`Intensität ${level} von ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`intensity-dot ${i < level ? 'intensity-dot--filled' : ''}`} />
      ))}
    </span>
  )
}

// ── Status banner logic ─────────────────────────────────────────────────────

type StatusColor = 'green' | 'orange' | 'red' | 'gray'
interface StatusInfo { headline: string; subtitle: string; color: StatusColor }

function computeLiveStatus(
  session: SessionData,
  stats: SessionStats,
  detectors?: LiveDetectors,
  liveStatus?: LiveStatus,
): StatusInfo {
  const nowMs    = Date.now() - session.startTime.getTime()
  const openCry  = session.cryEvents.find(e => e.endMs === null)
  const isCrying = detectors?.isCrying || !!openCry
  const isMoving = detectors?.isMoving ?? false
  const intensity = detectors?.moveIntensity ?? 0

  if (liveStatus === 'offline') {
    return { headline: 'Verbindung unterbrochen', subtitle: 'Status kann nicht beurteilt werden.', color: 'gray' }
  }

  if (isCrying) {
    const cryCount = session.cryEvents.length
    const dur      = openCry ? Math.round((nowMs - openCry.startMs) / 1000) : 0
    return {
      headline: 'Weint',
      subtitle: `${cryCount > 1 ? `${cryCount}. Phase · ` : ''}läuft seit ${fmtDur(dur)}`,
      color:    'red',
    }
  }

  if (isMoving) {
    const strong = intensity >= 7
    return {
      headline: strong ? 'Ist sehr unruhig' : 'Bewegt sich',
      subtitle:  `${strong ? 'Starke' : 'Leichte'} Bewegungen · Intensität ${intensity}/10`,
      color:    'orange',
    }
  }

  // Quiet — check how long
  const lastCryEnd   = session.cryEvents.length > 0
    ? Math.max(...session.cryEvents.map(e => e.endMs ?? nowMs)) : 0
  const lastMoveMs   = session.moveEvents.length > 0
    ? Math.max(...session.moveEvents.map(e => e.timeMs)) : 0
  const lastActivity = Math.max(lastCryEnd, lastMoveMs)
  const quietSec     = lastActivity > 0
    ? Math.round((nowMs - lastActivity) / 1000)
    : Math.round(nowMs / 1000)

  // Green only after ≥ 3 min quiet
  if (quietSec < 30) {
    return { headline: 'Ist gerade ruhig geworden', subtitle: `Aktiv vor ${quietSec} Sek.`, color: 'orange' }
  }
  if (quietSec < 3 * 60) {
    const sub = stats.cryCount > 0
      ? `Ruhig seit ${fmtDur(quietSec)} · ${stats.cryCount}× geweint bisher`
      : `Ruhig seit ${fmtDur(quietSec)}`
    return { headline: 'Ist ruhig', subtitle: sub, color: 'orange' }
  }
  if (quietSec < 15 * 60) {
    return { headline: 'Ist ruhig', subtitle: `Keine Aktivität seit ${fmtDur(quietSec)}`, color: 'green' }
  }
  if (quietSec < 30 * 60) {
    return { headline: 'Schläft wahrscheinlich', subtitle: `Keine Aktivität seit ${fmtDur(quietSec)}`, color: 'green' }
  }
  return {
    headline: 'Schläft tief',
    subtitle: `Keine Aktivität seit ${Math.floor(quietSec / 60)} Min.`,
    color: 'green',
  }
}

function computePostSessionStatus(session: SessionData, stats: SessionStats): StatusInfo {
  const { cryCount, cryTotalSec, moveCount, durationSec } = stats

  if (cryCount === 0 && moveCount < 5) {
    return {
      headline: 'Hat durchgeschlafen',
      subtitle: `${fmtDur(durationSec)} ohne Weinen · ${moveCount} leichte Bewegungen`,
      color: 'green',
    }
  }
  if (cryCount === 0) {
    return {
      headline: 'Hat gut geschlafen',
      subtitle: `Kein Weinen · ${moveCount} Bewegungen insgesamt`,
      color: 'green',
    }
  }
  if (cryCount === 1 && cryTotalSec < 45) {
    return {
      headline: 'Hat fast durchgeschlafen',
      subtitle: `1× kurz geweint (${fmtDur(cryTotalSec)}) · danach sofort beruhigt`,
      color: 'green',
    }
  }
  if (cryCount === 1) {
    return {
      headline: 'Hat einmal geweint',
      subtitle: `1 Weinphase (${fmtDur(cryTotalSec)}) · ${moveCount} Bewegungen`,
      color: 'orange',
    }
  }
  if (cryCount <= 3 && cryTotalSec < 120) {
    return {
      headline: 'Hat leicht unruhig geschlafen',
      subtitle: `${cryCount}× geweint · gesamt ${fmtDur(cryTotalSec)} · ${moveCount} Bewegungen`,
      color: 'orange',
    }
  }
  if (cryCount <= 5) {
    return {
      headline: 'Hat unruhig geschlafen',
      subtitle: `${cryCount}× geweint · gesamt ${fmtDur(cryTotalSec)} · ${moveCount} Bewegungen`,
      color: 'orange',
    }
  }
  return {
    headline: 'Hat viel geweint',
    subtitle: `${cryCount}× geweint · gesamt ${fmtDur(cryTotalSec)} · häufiges Aufwachen`,
    color: 'red',
  }
}

const STATUS_COLORS: Record<StatusColor, { bg: string; border: string }> = {
  green:  { bg: '#f0fdf4', border: '#bbf7d0' },
  orange: { bg: '#fff7ed', border: '#fed7aa' },
  red:    { bg: '#fef2f2', border: '#fecaca' },
  gray:   { bg: '#f9fafb', border: '#e5e7eb' },
}

// ── Timeline ────────────────────────────────────────────────────────────────

function buildTimeline(session: SessionData) {
  const total = (session.endTime ?? new Date()).getTime() - session.startTime.getTime()
  if (total <= 0) return []

  type SegType = 'quiet' | 'cry' | 'move' | 'both' | 'disconnected'
  const bucketMs   = 5000
  const numBuckets = Math.max(1, Math.round(total / bucketMs))

  return Array.from({ length: numBuckets }, (_, i) => {
    const lo = i * bucketMs
    const hi = (i + 1) * bucketMs

    // Connection lost takes priority
    const isDisconnected = session.connectionEvents.some(
      e => e.startMs < hi && (e.endMs ?? total) > lo
    )
    if (isDisconnected) return { type: 'disconnected' as SegType, pct: 100 / numBuckets }

    const hasCry  = session.cryEvents.some(e => e.startMs < hi && (e.endMs ?? total) > lo)
    const hasMove = session.moveEvents.some(e => e.timeMs >= lo && e.timeMs < hi)
    const type: SegType = hasCry && hasMove ? 'both' : hasCry ? 'cry' : hasMove ? 'move' : 'quiet'
    return { type, pct: 100 / numBuckets }
  })
}

// ── Unified activity list ───────────────────────────────────────────────────

interface ActivityItem {
  id: string
  timeMs: number
  endMs: number | null
  hasCry: boolean
  hasMove: boolean
  cryDurationMs: number | null
  cryPeakLevel: number
  movePeakIntensity: number
}

function buildActivityList(session: SessionData): ActivityItem[] {
  const items: ActivityItem[] = []
  const MERGE_WINDOW_MS = 20_000  // merge move events within 20s of a cry

  // Create an item per cry event
  for (const cry of session.cryEvents) {
    items.push({
      id:               cry.id,
      timeMs:           cry.startMs,
      endMs:            cry.endMs,
      hasCry:           true,
      hasMove:          false,
      cryDurationMs:    cry.endMs != null ? cry.endMs - cry.startMs : null,
      cryPeakLevel:     cry.peakLevel,
      movePeakIntensity: 0,
    })
  }

  // Attach move events to overlapping cry items, or create standalone items
  for (const move of session.moveEvents) {
    const overlap = items.find(it =>
      it.hasCry &&
      move.timeMs >= it.timeMs - MERGE_WINDOW_MS &&
      move.timeMs <= (it.endMs ?? it.timeMs) + MERGE_WINDOW_MS
    )
    if (overlap) {
      overlap.hasMove = true
      overlap.movePeakIntensity = Math.max(overlap.movePeakIntensity, move.intensity)
    } else {
      // Only add standalone move items if notable intensity
      if (move.intensity >= 3) {
        items.push({
          id:                move.id,
          timeMs:            move.timeMs,
          endMs:             move.timeMs,
          hasCry:            false,
          hasMove:           true,
          cryDurationMs:     null,
          cryPeakLevel:      0,
          movePeakIntensity: move.intensity,
        })
      }
    }
  }

  return items.sort((a, b) => a.timeMs - b.timeMs)
}

// ── Time window filtering ───────────────────────────────────────────────────

type WindowMinutes = 5 | 15 | 30 | 'all'

const WINDOW_LABELS: Record<WindowMinutes, string> = {
  5:    '5 Min.',
  15:   '15 Min.',
  30:   '30 Min.',
  all:  'Gesamt',
}

const WINDOW_OPTIONS: WindowMinutes[] = [5, 15, 30, 'all']

function filterStatsForWindow(
  session: SessionData,
  stats: SessionStats,
  window: WindowMinutes,
): SessionStats {
  if (window === 'all') return stats

  const now      = (session.endTime ?? new Date()).getTime()
  const cutoffMs = now - window * 60 * 1000
  const startMs  = session.startTime.getTime()

  // relative cutoff within session
  const relCutoff = cutoffMs - startMs

  const crysInWindow = session.cryEvents.filter(
    e => (e.endMs ?? (now - startMs)) >= relCutoff
  )
  const movesInWindow = session.moveEvents.filter(e => e.timeMs >= relCutoff)

  const durationSec  = window * 60
  const cryCount     = crysInWindow.length
  const cryTotalSec  = Math.round(
    crysInWindow.reduce((sum, e) => {
      const start = Math.max(e.startMs, relCutoff)
      const end   = e.endMs ?? (now - startMs)
      return sum + Math.max(0, end - start) / 1000
    }, 0)
  )
  const moveCount    = movesInWindow.length
  const peakCryLevel = crysInWindow.reduce((m, e) => Math.max(m, e.peakLevel), 0)
  const quietPct     = durationSec > 0 ? Math.round((1 - cryTotalSec / durationSec) * 100) : 100
  const movePerMin   = moveCount / window
  const sleepQuality: SessionStats['sleepQuality'] =
    movePerMin < 1 ? 'deep' : movePerMin < 3 ? 'light' : 'restless'

  return { durationSec, cryCount, cryTotalSec, moveCount, peakCryLevel, quietPct, sleepQuality }
}

// ── AI analysis call ────────────────────────────────────────────────────────

async function fetchAiAnalysis(
  session: SessionData,
  stats: SessionStats,
  isLive: boolean,
  window: WindowMinutes,
): Promise<string> {
  const r = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      durationSec:   stats.durationSec,
      cryCount:      stats.cryCount,
      cryTotalSec:   stats.cryTotalSec,
      moveCount:     stats.moveCount,
      peakCryLevel:  stats.peakCryLevel,
      sessionCode:   session.sessionCode,
      isLive,
      windowMinutes: window === 'all' ? null : window,
    }),
  })
  const d = await r.json()
  return d.analysis ?? 'Analyse konnte nicht geladen werden.'
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AnalysisDashboard({
  session, stats, isLive = false, liveStatus = 'offline',
  liveDetectors, videoQuality, audioQuality,
  showVideoOffBanner = false, onBack,
}: Props) {
  const timeline     = buildTimeline(session)
  const activityList = buildActivityList(session)

  // Status banner
  const statusInfo = isLive
    ? computeLiveStatus(session, stats, liveDetectors, liveStatus)
    : computePostSessionStatus(session, stats)

  // Timeline segment selection
  const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null)

  // AI analysis — available for both live (on demand) and post-session (auto)
  const [aiSummary, setAiSummary]   = useState<string | null>(null)
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiWindow, setAiWindow]     = useState<WindowMinutes>('all')
  const sessionRef = useRef(session)
  const statsRef   = useRef(stats)
  sessionRef.current = session
  statsRef.current   = stats

  const runAiAnalysis = useCallback((win: WindowMinutes = aiWindow) => {
    setAiLoading(true)
    setAiSummary(null)
    const filtered = filterStatsForWindow(sessionRef.current, statsRef.current, win)
    fetchAiAnalysis(sessionRef.current, filtered, isLive, win)
      .then(text => setAiSummary(text))
      .catch(() => setAiSummary('KI-Analyse konnte nicht geladen werden.'))
      .finally(() => setAiLoading(false))
  }, [isLive, aiWindow])

  // Auto-run after session ends
  useEffect(() => {
    if (!isLive) runAiAnalysis('all')
  }, [isLive]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen analysis-screen">
      <HelpButton screen="dashboard" />
      {/* Header: code left · empty center · close right */}
      <div className="analysis-header">
        <span className="header-session-code">
          Session Code: {session.sessionCode.slice(0,3)} {session.sessionCode.slice(3)}
        </span>
        <span />
        <button className="overlay-close-x overlay-close-x--labeled" onClick={onBack} aria-label="Schließen">
          <span className="overlay-close-label">zurück zur Übertragung</span>
          <span className="overlay-close-icon">✕</span>
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

        {/* ── Jetzt gerade / Session-Fazit ─────────────────────────── */}
        <div
          className="status-banner"
          style={{
            background:  STATUS_COLORS[statusInfo.color].bg,
            borderColor: STATUS_COLORS[statusInfo.color].border,
          }}
        >
          <div className="status-banner-text">
            <p className="status-banner-label">
              {isLive ? 'Dein Kind gerade:' : 'Dein Kind:'}
            </p>
            <p className="status-banner-headline">{statusInfo.headline}</p>
            <p className="status-banner-subtitle">{statusInfo.subtitle}</p>
          </div>
          <div className="status-banner-illus">
            <StatusIllustration color={statusInfo.color} headline={statusInfo.headline} />
          </div>
        </div>

        {/* ── KI-Analyse ───────────────────────────────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">KI-Analyse</span>
          </div>

          {/* Time window chips with prefix label */}
          <div className="window-chips-row">
            <span className="window-chips-label">Zeige Daten der letzten</span>
            <div className="window-chips">
              {WINDOW_OPTIONS.map(w => (
                <button
                  key={String(w)}
                  className={`window-chip ${aiWindow === w ? 'window-chip--active' : ''}`}
                  onClick={() => {
                    setAiWindow(w)
                    if (aiSummary) runAiAnalysis(w)
                  }}
                >
                  {WINDOW_LABELS[w]}
                </button>
              ))}
            </div>
          </div>

          {aiLoading ? (
            <div className="ai-summary-loading">
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              Analyse läuft…
            </div>
          ) : aiSummary ? (
            <div>
              <p className="ai-summary-text">{aiSummary}</p>
              <button className="ai-refresh-btn" onClick={() => runAiAnalysis(aiWindow)}>
                ↻ Erneut analysieren
              </button>
            </div>
          ) : (
            <button className="ai-analyze-btn" onClick={() => runAiAnalysis(aiWindow)}>
              ✨ Jetzt analysieren
            </button>
          )}
        </div>

        {/* ── Stats ────────────────────────────────────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">Statistiken</span>
          </div>
          <div className="stats-grid stats-grid--3">

            {/* Card 1: Weinen */}
            <div className="stat-card">
              <span className="stat-card-icon"><CryIcon size={24} /></span>
              <span className="stat-card-value">
                {stats.cryCount > 0
                  ? <>{stats.cryCount}× <span className="stat-value-small">· {fmtDur(stats.cryTotalSec)}</span></>
                  : '–'
                }
              </span>
              <span className="stat-card-label">Weinphasen</span>
              {stats.peakCryLevel > 0 && (
                <span className="stat-card-sub">
                  <IntensityDots level={stats.peakCryLevel} />
                </span>
              )}
            </div>

            {/* Card 2: Schlafqualität */}
            <div className="stat-card">
              <span className="stat-card-icon">
                <SleepQualityIcon size={24} level={stats.sleepQuality} />
              </span>
              <span className="stat-card-value" style={{ fontSize: '1rem', color: '#111827' }}>
                {stats.sleepQuality === 'deep' ? 'Tief' : stats.sleepQuality === 'light' ? 'Leicht' : 'Unruhig'}
              </span>
              <span className="stat-card-label">Schlafqualität</span>
              <span className="stat-card-sub">{stats.moveCount} Bewegungen</span>
            </div>

            {/* Card 3: Ruhezeit % */}
            <div className="stat-card">
              <span className="stat-card-icon"><RestIcon size={24} /></span>
              <span className="stat-card-value">{stats.quietPct}%</span>
              <span className="stat-card-label">Ruhezeit</span>
            </div>

          </div>
        </div>

        {/* ── Übersicht Session + Verbindung ───────────────────────── */}
        <div className="o-card">
          <div className="o-card-header">
            <span className="o-card-title">Übersicht Session + Verbindung</span>
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
                <span className="meta-label">Aktuelle Status Übertragung</span>
                <ConnectionBadge
                  state={liveStatus === 'full' ? 'connected' : liveStatus === 'partial' ? 'degraded' : 'reconnecting'}
                  videoQuality={videoQuality}
                  audioQuality={audioQuality}
                  bare
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
                {timeline.map((seg, i) => {
                  const segStartMs = i * (((session.endTime ?? new Date()).getTime() - session.startTime.getTime()) / timeline.length)
                  const segEndMs   = (i + 1) * (((session.endTime ?? new Date()).getTime() - session.startTime.getTime()) / timeline.length)
                  const isActive   = i === selectedSegIdx
                  const isClickable = seg.type !== 'quiet'
                  return (
                    <div
                      key={i}
                      className={`timeline-segment timeline-segment--${seg.type}${isClickable ? ' timeline-segment--clickable' : ''}${isActive ? ' timeline-segment--active' : ''}`}
                      style={{ width: `${seg.pct}%` }}
                      onClick={() => isClickable && setSelectedSegIdx(isActive ? null : i)}
                      title={isClickable ? 'Tippen für Details' : undefined}
                      data-start-ms={segStartMs}
                      data-end-ms={segEndMs}
                    />
                  )
                })}
              </div>

              {/* Segment detail popup */}
              {selectedSegIdx !== null && timeline[selectedSegIdx] && (() => {
                const seg     = timeline[selectedSegIdx]
                const total   = (session.endTime ?? new Date()).getTime() - session.startTime.getTime()
                const segMs   = total / timeline.length
                const startMs = selectedSegIdx * segMs
                const endMs   = (selectedSegIdx + 1) * segMs
                const timeStr = `${fmtTime(startMs, session.startTime)} – ${fmtTime(endMs, session.startTime)}`
                const typeLabel = seg.type === 'cry' ? 'Weinen' : seg.type === 'move' ? 'Bewegung' : seg.type === 'both' ? 'Weinen + Bewegung' : 'Verbindung unterbrochen'
                const typeIcon  = seg.type === 'cry' ? '😢' : seg.type === 'move' ? '🤸' : seg.type === 'both' ? '😢🤸' : '⚡'
                return (
                  <div className="timeline-popup" onClick={() => setSelectedSegIdx(null)}>
                    <span className="timeline-popup-icon">{typeIcon}</span>
                    <div className="timeline-popup-content">
                      <span className="timeline-popup-time">{timeStr}</span>
                      <span className="timeline-popup-label">{typeLabel}</span>
                    </div>
                    <button className="timeline-popup-close" aria-label="Schließen">✕</button>
                  </div>
                )
              })()}

              <div className="timeline-legend">
                <span className="legend-item"><span className="legend-dot legend-dot--quiet"/>Ruhig</span>
                <span className="legend-item"><span className="legend-dot legend-dot--cry"/>Weinen</span>
                <span className="legend-item"><span className="legend-dot legend-dot--move"/>Bewegung</span>
                <span className="legend-item"><span className="legend-dot legend-dot--both"/>Beides</span>
                {session.connectionEvents.length > 0 && (
                  <span className="legend-item"><span className="legend-dot legend-dot--disconnected"/>Verbindung weg</span>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted-l)', fontSize: '0.85rem' }}>Noch keine Daten.</p>
          )}
        </div>

        {/* ── Unified activity log ──────────────────────────────────── */}
        {activityList.length > 0 && (
          <div className="o-card">
            <div className="o-card-header">
              <span className="o-card-title">Aktivitäten</span>
              <span className="o-card-tag">{activityList.length}</span>
            </div>
            <div className="event-list">
              {activityList.map((item) => {
                const durationSec = item.cryDurationMs != null
                  ? Math.round(item.cryDurationMs / 1000) : null
                const peakIntensity = Math.max(item.cryPeakLevel, item.movePeakIntensity)
                const typeLabel = item.hasCry && item.hasMove ? 'Weinen + Bewegung'
                  : item.hasCry ? 'Weinen'
                  : 'Bewegung'
                return (
                  <div className="event-row activity-row" key={item.id}>
                    <span className="event-row-icon">
                      {item.hasCry && item.hasMove ? (
                        <span className="activity-icons">
                          <CryIcon size={14} /><MoveIcon size={14} />
                        </span>
                      ) : item.hasCry ? (
                        <CryIcon size={16} />
                      ) : (
                        <MoveIcon size={16} />
                      )}
                    </span>
                    <div className="activity-row-main">
                      <div className="activity-row-top">
                        <span className="event-row-time">{fmtTime(item.timeMs, session.startTime)}</span>
                        <span className="activity-type-label">{typeLabel}</span>
                        {durationSec != null && (
                          <span className="event-row-dur">{fmtDur(durationSec)}</span>
                        )}
                      </div>
                      {peakIntensity > 0 && (
                        <div className="activity-row-bottom">
                          <IntensityDots level={peakIntensity} />
                          <span className="activity-intensity-label">Intensität {peakIntensity}/10</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Connection events log ────────────────────────────────── */}
        {session.connectionEvents.length > 0 && (
          <div className="o-card">
            <div className="o-card-header">
              <span className="o-card-title">Verbindungsunterbrechungen</span>
              <span className="o-card-tag">{session.connectionEvents.length}</span>
            </div>
            <div className="event-list">
              {session.connectionEvents.map((e) => (
                <div className="event-row" key={e.id}>
                  <span className="event-row-icon" style={{ color: '#9ca3af' }}>⚡</span>
                  <span className="event-row-time">{fmtTime(e.startMs, session.startTime)}</span>
                  <span className="event-row-desc">
                    {e.type === 'disconnected' ? 'Verbindung getrennt' : 'Verbindung schwach'}
                  </span>
                  <span className="event-row-dur">
                    {e.endMs
                      ? fmtDur(Math.round((e.endMs - e.startMs) / 1000))
                      : 'noch aktiv'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
