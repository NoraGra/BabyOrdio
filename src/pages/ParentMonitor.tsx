import { useState, useCallback, useEffect, useRef } from 'react'
import {
  LiveKitRoom,
  useConnectionState,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
  AudioTrack,
  isTrackReference,
} from '@livekit/components-react'
import { Track, RoomEvent, ConnectionQuality } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { useToken }           from '../hooks/useToken'
import { deriveMonitorState } from '../hooks/useMonitorState'
import { useAlertSound }      from '../hooks/useAlertSound'
import { useAudioAnalyzer }   from '../hooks/useAudioAnalyzer'
import { useConnectionLog }   from '../hooks/useConnectionLog'
import { useCryDetector }     from '../hooks/useCryDetector'
import { useMoveDetector }    from '../hooks/useMoveDetector'
import { useSessionRecorder } from '../hooks/useSessionRecorder'
import type { SessionData, SessionStats } from '../hooks/useSessionRecorder'
import ConnectionBadge, { type QualityLevel } from '../components/ConnectionBadge'
import SessionTimer       from '../components/SessionTimer'
import AudioOnlyView      from '../components/AudioOnlyView'
import SummaryBanner      from '../components/SummaryBanner'
import AnalysisDashboard  from './AnalysisDashboard'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string

interface Props {
  code: string
  onBack: () => void
  onSessionEnd: (data: SessionData, stats: SessionStats) => void
}

export default function ParentMonitor({ code, onBack, onSessionEnd }: Props) {
  const tokenState = useToken(code, 'parent')

  if (!LIVEKIT_URL) {
    return (
      <div className="screen error-screen">
        <p>⚠️ VITE_LIVEKIT_URL is not set.</p>
        <button className="back-button" onClick={onBack}>← Back</button>
      </div>
    )
  }

  if (tokenState.status === 'loading') {
    return <div className="screen loading-screen"><div className="spinner" /><p>Verbinde…</p></div>
  }

  if (tokenState.status === 'error') {
    return (
      <div className="screen error-screen">
        <p>⚠️ {tokenState.message}</p>
        <button className="primary-button" onClick={onBack}>Erneut versuchen</button>
      </div>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={tokenState.token}
      connect
      audio={false}
      video={false}
      onDisconnected={onBack}
    >
      <ParentRoom code={code} onBack={onBack} onSessionEnd={onSessionEnd} />
    </LiveKitRoom>
  )
}

function ParentRoom({
  code,
  onBack,
  onSessionEnd,
}: {
  code: string
  onBack: () => void
  onSessionEnd: (data: SessionData, stats: SessionStats) => void
}) {
  const connectionState    = useConnectionState()
  const remoteParticipants = useRemoteParticipants()
  const hasBaby = remoteParticipants.length > 0

  const videoTracks = useTracks([Track.Source.Camera],     { onlySubscribed: true })
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const videoRef = videoTracks.find(t => isTrackReference(t))
  const audioRef = audioTracks.find(t => isTrackReference(t))

  const monitorState = deriveMonitorState(connectionState, hasBaby, !!videoRef, !!audioRef)

  // ── Connection quality (per track) ───────────────────────────────────
  const room = useRoomContext()
  const [lkQuality, setLkQuality] = useState<ConnectionQuality>(ConnectionQuality.Excellent)

  useEffect(() => {
    if (!room) return
    const handler = (quality: ConnectionQuality, participant: Participant) => {
      if (!participant.isLocal) setLkQuality(quality)
    }
    room.on(RoomEvent.ConnectionQualityChanged, handler)
    return () => { room.off(RoomEvent.ConnectionQualityChanged, handler) }
  }, [room])

  // Map LiveKit quality + track presence → 0–3 scale
  const toLevel = (q: ConnectionQuality, hasTrack: boolean): QualityLevel => {
    if (!hasTrack) return 0
    if (q === ConnectionQuality.Excellent) return 3
    if (q === ConnectionQuality.Good)      return 2
    return 1  // Poor / Lost
  }

  // Audio is prioritised: Good → still 3 bars; Poor → 2 bars
  const toAudioLevel = (q: ConnectionQuality, hasTrack: boolean): QualityLevel => {
    if (!hasTrack) return 0
    if (q === ConnectionQuality.Excellent || q === ConnectionQuality.Good) return 3
    return 2  // Poor — audio may still be partially ok
  }

  const videoQuality = toLevel(lkQuality, !!videoRef)
  const audioQuality = toAudioLevel(lkQuality, !!audioRef)

  // ── Session recorder (runs for the whole session) ────────────────────
  const recorder = useSessionRecorder(code)

  // ── Audio level ──────────────────────────────────────────────────────
  const { stats: audioStats } = useAudioAnalyzer(
    audioRef && isTrackReference(audioRef) ? audioRef : undefined,
  )

  // ── Cry detector ─────────────────────────────────────────────────────
  const cryState = useCryDetector(
    audioRef && isTrackReference(audioRef) ? audioRef : undefined,
    (level) => recorder.onCryStart(level),
    (level) => recorder.onCryPeak(level),
    () => recorder.onCryEnd(),
  )

  // ── Move detector ────────────────────────────────────────────────────
  const moveState = useMoveDetector(
    videoRef && isTrackReference(videoRef) ? videoRef : undefined,
    (intensity) => recorder.onMove(intensity),
  )

  // ── Alert sounds ─────────────────────────────────────────────────────
  const { playWarning, playCritical } = useAlertSound()
  const prevStateRef = useRef(monitorState)

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = monitorState
    if (prev === monitorState) return
    if (monitorState === 'critical')          playCritical()
    else if (monitorState === 'reconnecting') playWarning()
  }, [monitorState, playCritical, playWarning])

  useEffect(() => {
    const isDisrupted = monitorState === 'critical' || monitorState === 'reconnecting'
    if (!isDisrupted) return
    const id = setInterval(() => {
      if (monitorState === 'critical') playCritical()
      else                             playWarning()
    }, 10_000)
    return () => clearInterval(id)
  }, [monitorState, playCritical, playWarning])

  // ── Connection disruption summary ─────────────────────────────────────
  const { summary, clearSummary } = useConnectionLog(monitorState, audioStats)

  // ── Dashboard overlay (session stays alive!) ──────────────────────────
  const [showDashboard, setShowDashboard] = useState(false)
  const prevMonitorRef = useRef(monitorState)

  // Auto-open dashboard when video drops to degraded
  useEffect(() => {
    const prev = prevMonitorRef.current
    prevMonitorRef.current = monitorState
    if (prev !== 'degraded' && monitorState === 'degraded') {
      setShowDashboard(true)
    }
  }, [monitorState])

  // ── End session ───────────────────────────────────────────────────────
  const handleEnd = useCallback(() => {
    const finalData = recorder.finalise()
    onSessionEnd(finalData, recorder.stats)
    onBack()
  }, [recorder, onSessionEnd, onBack])

  // ── Controls auto-hide ────────────────────────────────────────────────
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000)
  }, [])

  useEffect(() => {
    if (monitorState === 'connected') {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000)
    } else {
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [monitorState])

  return (
    <>
      {/* ── Live monitor (always mounted = LiveKit stays connected) ── */}
      <div className="screen parent-screen" onClick={showControls}>
        {audioRef && isTrackReference(audioRef) && (
          <AudioTrack trackRef={audioRef} />
        )}

        <div className="video-container">
          {videoRef && isTrackReference(videoRef) ? (
            <VideoTrack trackRef={videoRef} className="remote-video" />
          ) : (
            <AudioOnlyView waiting={!hasBaby} />
          )}
        </div>

        <div className={`parent-controls ${controlsVisible ? 'controls-visible' : 'controls-hidden'}`}>
          <div className="parent-header">
            <ConnectionBadge
              state={monitorState}
              videoQuality={videoQuality}
              audioQuality={audioQuality}
            />
            <div className="parent-header-right">
              {(monitorState === 'connected' || monitorState === 'degraded') && (
                <SessionTimer />
              )}
              <button
                className="analyse-btn"
                onClick={(e) => { e.stopPropagation(); setShowDashboard(true) }}
              >
                📊 Analyse
              </button>
              <button
                className="end-session-btn"
                onClick={(e) => { e.stopPropagation(); handleEnd() }}
              >
                Ende
              </button>
            </div>
          </div>
        </div>

        <div className="parent-footer">
          {cryState.isCrying && (
            <div className="live-indicator live-indicator--cry">😢 Weinen erkannt</div>
          )}
          {moveState.isMoving && (
            <div className="live-indicator live-indicator--move">
              🏃 Bewegung {moveState.intensity}/10
            </div>
          )}
        </div>

        {summary && <SummaryBanner summary={summary} onDismiss={clearSummary} />}

        {monitorState === 'degraded' && (
          <div className="degraded-banner">
            🔊 Nur Audio — Video pausiert für stabile Verbindung
          </div>
        )}

        {monitorState === 'critical' && (
          <div className="critical-overlay">
            <p className="critical-title">Verbindung getrennt</p>
            <p className="critical-subtitle">
              Die Verbindung zum Baby-Gerät wurde unterbrochen.
            </p>
            <button
              className="primary-button"
              style={{ maxWidth: 220 }}
              onClick={(e) => { e.stopPropagation(); setShowDashboard(true) }}
            >
              📊 Session analysieren
            </button>
            <button
              className="primary-button"
              style={{ maxWidth: 220, background: 'var(--surface-2)', marginTop: 8 }}
              onClick={handleEnd}
            >
              Zurück
            </button>
          </div>
        )}
      </div>

      {/* ── Dashboard overlay — rendered ON TOP, LiveKit untouched ── */}
      {showDashboard && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <AnalysisDashboard
            session={recorder.data}
            stats={recorder.stats}
            isLive
            showVideoOffBanner={monitorState === 'degraded'}
            onBack={() => setShowDashboard(false)}
          />
        </div>
      )}
    </>
  )
}
