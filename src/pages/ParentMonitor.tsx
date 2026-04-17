import { useState, useCallback, useEffect, useRef } from 'react'
import {
  LiveKitRoom,
  useConnectionState,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
  AudioTrack,
  isTrackReference,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useToken }           from '../hooks/useToken'
import { deriveMonitorState } from '../hooks/useMonitorState'
import { useAlertSound }      from '../hooks/useAlertSound'
import { useAudioAnalyzer }   from '../hooks/useAudioAnalyzer'
import { useConnectionLog }   from '../hooks/useConnectionLog'
import { useCryDetector }     from '../hooks/useCryDetector'
import { useMoveDetector }    from '../hooks/useMoveDetector'
import { useSessionRecorder } from '../hooks/useSessionRecorder'
import type { SessionData, SessionStats } from '../hooks/useSessionRecorder'
import ConnectionBadge  from '../components/ConnectionBadge'
import SessionTimer     from '../components/SessionTimer'
import AudioOnlyView    from '../components/AudioOnlyView'
import SummaryBanner    from '../components/SummaryBanner'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string

interface Props {
  code: string
  onBack: () => void
  onOpenAnalysis: (data: SessionData, stats: SessionStats) => void
}

export default function ParentMonitor({ code, onBack, onOpenAnalysis }: Props) {
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
      <ParentRoom code={code} onBack={onBack} onOpenAnalysis={onOpenAnalysis} />
    </LiveKitRoom>
  )
}

function ParentRoom({
  code,
  onBack,
  onOpenAnalysis,
}: {
  code: string
  onBack: () => void
  onOpenAnalysis: (data: SessionData, stats: SessionStats) => void
}) {
  const connectionState    = useConnectionState()
  const remoteParticipants = useRemoteParticipants()
  const hasBaby = remoteParticipants.length > 0

  const videoTracks = useTracks([Track.Source.Camera],     { onlySubscribed: true })
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const videoRef = videoTracks.find(t => isTrackReference(t))
  const audioRef = audioTracks.find(t => isTrackReference(t))

  const monitorState = deriveMonitorState(connectionState, hasBaby, !!videoRef, !!audioRef)

  // ── Session recorder ────────────────────────────────────────────────
  const recorder = useSessionRecorder(code)

  // ── Audio level ─────────────────────────────────────────────────────
  const { stats: audioStats } = useAudioAnalyzer(
    audioRef && isTrackReference(audioRef) ? audioRef : undefined,
  )

  // ── Cry detector ────────────────────────────────────────────────────
  const cryState = useCryDetector(
    audioRef && isTrackReference(audioRef) ? audioRef : undefined,
    (level) => recorder.onCryStart(level),
    (level) => recorder.onCryPeak(level),
    () => recorder.onCryEnd(),
  )

  // ── Move detector ───────────────────────────────────────────────────
  const moveState = useMoveDetector(
    videoRef && isTrackReference(videoRef) ? videoRef : undefined,
    (intensity) => recorder.onMove(intensity),
  )

  // ── Alert sounds ────────────────────────────────────────────────────
  const { playWarning, playCritical } = useAlertSound()
  const prevStateRef = useRef(monitorState)

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = monitorState
    if (prev === monitorState) return
    if (monitorState === 'critical')     playCritical()
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

  // ── Connection disruption summary ────────────────────────────────────
  const { summary, clearSummary } = useConnectionLog(monitorState, audioStats)

  // ── Analyse button handler ───────────────────────────────────────────
  const handleAnalyse = useCallback(() => {
    const finalData = recorder.finalise()
    onOpenAnalysis(finalData, recorder.stats)
  }, [recorder, onOpenAnalysis])

  // ── Controls auto-hide ───────────────────────────────────────────────
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
    <div className="screen parent-screen" onClick={showControls}>
      {/* Invisible audio player */}
      {audioRef && isTrackReference(audioRef) && (
        <AudioTrack trackRef={audioRef} />
      )}

      {/* Video */}
      <div className="video-container">
        {videoRef && isTrackReference(videoRef) ? (
          <VideoTrack trackRef={videoRef} className="remote-video" />
        ) : (
          <AudioOnlyView waiting={!hasBaby} />
        )}
      </div>

      {/* Controls overlay */}
      <div className={`parent-controls ${controlsVisible ? 'controls-visible' : 'controls-hidden'}`}>
        <div className="parent-header">
          <ConnectionBadge state={monitorState} hasVideo={!!videoRef} />
          <div className="parent-header-right">
            {(monitorState === 'connected' || monitorState === 'degraded') && (
              <SessionTimer />
            )}
            <button
              className="analyse-btn"
              onClick={(e) => { e.stopPropagation(); handleAnalyse() }}
            >
              📊 Analyse
            </button>
            <button className="end-session-btn" onClick={(e) => { e.stopPropagation(); onBack() }}>
              Ende
            </button>
          </div>
        </div>
      </div>

      {/* Live indicators (cry / move) */}
      <div className="parent-footer">
        {cryState.isCrying && (
          <div className="live-indicator live-indicator--cry">
            😢 Weinen erkannt
          </div>
        )}
        {moveState.isMoving && (
          <div className="live-indicator live-indicator--move">
            🏃 Bewegung {moveState.intensity}/10
          </div>
        )}
      </div>

      {/* Reconnect summary */}
      {summary && (
        <SummaryBanner summary={summary} onDismiss={clearSummary} />
      )}

      {/* Degraded banner */}
      {monitorState === 'degraded' && (
        <div className="degraded-banner">
          🔊 Nur Audio — Video pausiert für stabile Verbindung
        </div>
      )}

      {/* Critical overlay */}
      {monitorState === 'critical' && (
        <div className="critical-overlay">
          <p className="critical-title">Verbindung getrennt</p>
          <p className="critical-subtitle">
            Die Verbindung zum Baby-Gerät wurde unterbrochen.
          </p>
          <button className="primary-button" style={{ maxWidth: 200 }} onClick={(e) => { e.stopPropagation(); handleAnalyse() }}>
            📊 Session analysieren
          </button>
          <button className="primary-button" style={{ maxWidth: 200, background: 'var(--surface-2)', marginTop: 8 }} onClick={onBack}>
            Zurück
          </button>
        </div>
      )}
    </div>
  )
}
