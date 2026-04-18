import { useState, useCallback, useEffect, useRef } from 'react'
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
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
import HelpButton         from '../components/HelpButton'
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
      audio={false}  /* mic starts muted; toggled on demand via speak button */
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
  const connectionState       = useConnectionState()
  const remoteParticipants    = useRemoteParticipants()
  const { localParticipant }  = useLocalParticipant()
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

  // ── Alert sounds + connection event recording ─────────────────────────
  const { playWarning, playCritical } = useAlertSound()
  const prevStateRef = useRef(monitorState)

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = monitorState
    if (prev === monitorState) return
    if (monitorState === 'critical') {
      playCritical()
      recorder.onConnectionLost('disconnected')
    } else if (monitorState === 'reconnecting') {
      playWarning()
      recorder.onConnectionLost('reconnecting')
    } else if (monitorState === 'connected' || monitorState === 'degraded') {
      recorder.onConnectionRestored()
    }
  }, [monitorState, playCritical, playWarning, recorder])

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

  // ── Talk-to-baby (two-way audio) ─────────────────────────────────────
  const [isSpeaking, setIsSpeaking] = useState(false)

  const toggleSpeak = useCallback(async () => {
    try {
      if (isSpeaking) {
        await localParticipant.setMicrophoneEnabled(false)
        setIsSpeaking(false)
      } else {
        await localParticipant.setMicrophoneEnabled(true)
        setIsSpeaking(true)
      }
    } catch (e) {
      console.error('Mic toggle failed:', e)
    }
  }, [isSpeaking, localParticipant])

  // ── End session confirm ───────────────────────────────────────────────
  const [showEndConfirm, setShowEndConfirm] = useState(false)

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

  // Controls are always visible — no auto-hide

  return (
    <>
      {/* ── Live monitor (always mounted = LiveKit stays connected) ── */}
      <div className="screen parent-screen">
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

        {/* ── Always-visible overlay controls ── */}
        <div className="parent-controls">

          {/* TOP: badge (left) + timer + beenden (right) */}
          <div className="parent-header">
            <ConnectionBadge
              state={monitorState}
              videoQuality={videoQuality}
              audioQuality={audioQuality}
              light
            />
            <div className="parent-header-right">
              {(monitorState === 'connected' || monitorState === 'degraded') && (
                <SessionTimer />
              )}
              <button
                className="end-circle-btn end-circle-btn--labeled"
                onClick={(e) => { e.stopPropagation(); setShowEndConfirm(true) }}
                title="Session verlassen"
                aria-label="Session verlassen"
              >
                <span className="end-circle-label">Session verlassen</span>
                <span className="end-circle-icon">✕</span>
              </button>
            </div>
          </div>

          {/* BOTTOM LEFT: live indicators stacked above Analyse + Speak buttons */}
          <div className="parent-bottom-left">
            {moveState.isMoving && (
              <div className="live-indicator live-indicator--move">
                🏃 Bewegt sich
              </div>
            )}
            {cryState.isCrying && (
              <div className="live-indicator live-indicator--cry">😢 Weint gerade</div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="analyse-btn"
                onClick={(e) => { e.stopPropagation(); setShowDashboard(true) }}
              >
                Analyse
              </button>
              <button
                className={`speak-btn${isSpeaking ? ' speak-btn--active' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleSpeak() }}
                aria-label={isSpeaking ? 'Mikrofon deaktivieren' : 'Mit Baby sprechen'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                {isSpeaking ? 'Mikrofon aktiv' : 'Sprechen'}
              </button>
            </div>
          </div>

        </div>

        {summary && <SummaryBanner summary={summary} onDismiss={clearSummary} />}
        <HelpButton screen="monitor" />

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

      {/* ── End session confirm ── */}
      {showEndConfirm && (
        <div className="parent-confirm-overlay" onClick={() => setShowEndConfirm(false)}>
          <div className="parent-confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">Session verlassen?</p>
            <p className="confirm-body">Du verlässt die Session. Das Baby-Gerät bleibt aktiv.</p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn--danger" onClick={() => { setShowEndConfirm(false); handleEnd() }}>
                Ja, verlassen
              </button>
              <button className="confirm-btn confirm-btn--cancel" onClick={() => setShowEndConfirm(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard overlay — rendered ON TOP, LiveKit untouched ── */}
      {showDashboard && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <AnalysisDashboard
            session={recorder.data}
            stats={recorder.stats}
            isLive
            liveStatus={
              monitorState === 'connected'    ? (videoRef && audioRef ? 'full' : 'partial')
              : monitorState === 'degraded'   ? 'partial'
              : 'offline'
            }
            liveDetectors={{
              isCrying:      cryState.isCrying,
              isMoving:      moveState.isMoving,
              moveIntensity: moveState.intensity,
            }}
            videoQuality={videoQuality}
            audioQuality={audioQuality}
            showVideoOffBanner={monitorState === 'degraded'}
            onBack={() => setShowDashboard(false)}
          />
        </div>
      )}
    </>
  )
}
