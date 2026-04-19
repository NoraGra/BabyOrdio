/**
 * ParentMonitor — parent-side live view
 *
 * Architecture:
 * 1. Always starts in LiveKit mode (fast, reliable)
 * 2. Background P2P probe runs silently (data-channel ICE test)
 * 3. When probe succeeds, full P2P media connection starts in background
 * 4. When P2P video first frame is ready (onCanPlay):
 *    - CSS crossfade: LiveKit video fades out, P2P video fades in (600ms)
 *    - After fade: LiveKit disconnects (intentionally — no onBack())
 *    - Baby is signalled via KV to also switch
 * 5. Zero gap in video — both streams overlap during fade
 */
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
import ModeBadge          from '../components/ModeBadge'
import AnalysisDashboard  from './AnalysisDashboard'
import { useP2PProbe }    from '../hooks/useP2PProbe'
import { useWebRTC, postSignal } from '../hooks/useWebRTC'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string

interface Props {
  code: string
  onBack: () => void
  onSessionEnd: (data: SessionData, stats: SessionStats) => void
  transport?: 'p2p' | 'livekit'
}

export default function ParentMonitor({ code, onBack, onSessionEnd }: Props) {
  // P2P probe runs at top level — passed down to ParentRoom inside LiveKit context
  const probeStatus = useP2PProbe(code, 'parent')

  // intentionalSwitchRef prevents LiveKit onDisconnected → onBack() during P2P crossfade
  const intentionalSwitchRef = useRef(false)

  const handleDisconnected = useCallback(() => {
    if (!intentionalSwitchRef.current) onBack()
  }, [onBack])

  return (
    <LiveKitParentMonitor
      code={code}
      onBack={onBack}
      onSessionEnd={onSessionEnd}
      probeStatus={probeStatus}
      intentionalSwitchRef={intentionalSwitchRef}
      onDisconnected={handleDisconnected}
    />
  )
}

// ── LiveKit wrapper ───────────────────────────────────────────────────────
interface InnerProps extends Omit<Props, 'transport'> {
  probeStatus:         'checking' | 'available' | 'unavailable'
  intentionalSwitchRef: React.MutableRefObject<boolean>
  onDisconnected:      () => void
}

function LiveKitParentMonitor({
  code, onBack, onSessionEnd, probeStatus, intentionalSwitchRef, onDisconnected,
}: InnerProps) {
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
      onDisconnected={onDisconnected}
    >
      <ParentRoom
        code={code}
        onBack={onBack}
        onSessionEnd={onSessionEnd}
        probeStatus={probeStatus}
        intentionalSwitchRef={intentionalSwitchRef}
      />
    </LiveKitRoom>
  )
}

// ── ParentRoom (inside LiveKit context) ───────────────────────────────────
function ParentRoom({
  code,
  onBack,
  onSessionEnd,
  probeStatus,
  intentionalSwitchRef,
}: {
  code: string
  onBack: () => void
  onSessionEnd: (data: SessionData, stats: SessionStats) => void
  probeStatus: 'checking' | 'available' | 'unavailable'
  intentionalSwitchRef: React.MutableRefObject<boolean>
}) {
  const connectionState    = useConnectionState()
  const remoteParticipants = useRemoteParticipants()
  const { localParticipant } = useLocalParticipant()
  const hasBaby = remoteParticipants.length > 0

  const videoTracks = useTracks([Track.Source.Camera],     { onlySubscribed: true })
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const videoRef = videoTracks.find(t => isTrackReference(t))
  const audioRef = audioTracks.find(t => isTrackReference(t))

  // ── P2P background connection ─────────────────────────────────────────
  const {
    status:       p2pStatus,
    transport:    p2pTransport,
    remoteStream: p2pRemoteStream,
  } = useWebRTC({
    code,
    role:        'parent',
    localStream: null,
    enabled:     probeStatus === 'available',
  })

  // P2P video element
  const p2pVideoRef    = useRef<HTMLVideoElement>(null)
  const p2pSwitchedRef = useRef(false)
  const [p2pActive, setP2pActive] = useState(false)

  // Attach P2P stream to video element
  useEffect(() => {
    if (p2pVideoRef.current && p2pRemoteStream) {
      p2pVideoRef.current.srcObject = p2pRemoteStream
    }
  }, [p2pRemoteStream])

  const room = useRoomContext()

  // Core switch logic — called by onCanPlay OR by the p2pStatus fallback below
  const doSwitch = useCallback(async () => {
    if (p2pSwitchedRef.current) return
    p2pSwitchedRef.current = true
    await postSignal(code, 'upgrade', 'p2p')  // signal baby
    setP2pActive(true)                         // start CSS crossfade
    setTimeout(() => {
      intentionalSwitchRef.current = true
      room.disconnect()                        // drop LiveKit after fade
    }, 650)
  }, [code, room, intentionalSwitchRef])

  // Primary trigger: onCanPlay (cleanest — video is provably rendering)
  const handleP2PCanPlay = useCallback(() => doSwitch(), [doSwitch])

  // Fallback trigger: p2pStatus = 'connected' + 1.5 s delay
  // Needed because some browsers don't fire canplay when tracks are added
  // to a MediaStream that's already set as srcObject.
  useEffect(() => {
    if (p2pStatus !== 'connected' || p2pSwitchedRef.current) return
    // Re-set srcObject + force play so the video element wakes up
    if (p2pVideoRef.current && p2pRemoteStream) {
      p2pVideoRef.current.srcObject = p2pRemoteStream
      p2pVideoRef.current.play().catch(() => {})
    }
    // Give onCanPlay 1.5 s to fire; if it hasn't, switch anyway
    const id = setTimeout(() => doSwitch(), 1500)
    return () => clearTimeout(id)
  }, [p2pStatus, p2pRemoteStream, doSwitch])

  // ── LiveKit connection quality ────────────────────────────────────────
  const [lkQuality, setLkQuality] = useState<ConnectionQuality>(ConnectionQuality.Excellent)

  useEffect(() => {
    if (!room) return
    const handler = (quality: ConnectionQuality, participant: Participant) => {
      if (!participant.isLocal) setLkQuality(quality)
    }
    room.on(RoomEvent.ConnectionQualityChanged, handler)
    return () => { room.off(RoomEvent.ConnectionQualityChanged, handler) }
  }, [room])

  const toLevel = (q: ConnectionQuality, hasTrack: boolean): QualityLevel => {
    if (!hasTrack) return 0
    if (q === ConnectionQuality.Excellent) return 3
    if (q === ConnectionQuality.Good)      return 2
    return 1
  }
  const toAudioLevel = (q: ConnectionQuality, hasTrack: boolean): QualityLevel => {
    if (!hasTrack) return 0
    if (q === ConnectionQuality.Excellent || q === ConnectionQuality.Good) return 3
    return 2
  }

  const videoQuality = toLevel(lkQuality, !!videoRef)
  const audioQuality = toAudioLevel(lkQuality, !!audioRef)

  // ── Monitor state ─────────────────────────────────────────────────────
  const lkMonitorState = deriveMonitorState(connectionState, hasBaby, !!videoRef, !!audioRef)

  // After P2P switch, use P2P status for display (LK is intentionally disconnected)
  const p2pMonitorState = (() => {
    if (p2pStatus === 'connected')    return 'connected'    as const
    if (p2pStatus === 'reconnecting') return 'reconnecting' as const
    if (p2pStatus === 'failed' || p2pStatus === 'closed') return 'critical' as const
    return 'connecting' as const
  })()
  const monitorState = p2pActive ? p2pMonitorState : lkMonitorState

  // ── Session recorder ──────────────────────────────────────────────────
  const recorder = useSessionRecorder(code)

  // ── Audio level ───────────────────────────────────────────────────────
  const { stats: audioStats } = useAudioAnalyzer(
    audioRef && isTrackReference(audioRef) ? audioRef : undefined,
  )

  // ── Cry detector ──────────────────────────────────────────────────────
  const cryState = useCryDetector(
    audioRef && isTrackReference(audioRef) ? audioRef : undefined,
    (level) => recorder.onCryStart(level),
    (level) => recorder.onCryPeak(level),
    () => recorder.onCryEnd(),
  )

  // ── Move detector ─────────────────────────────────────────────────────
  const moveState = useMoveDetector(
    videoRef && isTrackReference(videoRef) ? videoRef : undefined,
    (intensity) => recorder.onMove(intensity),
  )

  // ── Alert sounds + connection events ──────────────────────────────────
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

  // ── Talk-to-baby ──────────────────────────────────────────────────────
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

  // ── Dashboard overlay ─────────────────────────────────────────────────
  const [showDashboard, setShowDashboard] = useState(false)
  const prevMonitorRef = useRef(monitorState)

  useEffect(() => {
    const prev = prevMonitorRef.current
    prevMonitorRef.current = monitorState
    if (prev !== 'degraded' && monitorState === 'degraded') setShowDashboard(true)
  }, [monitorState])

  // ── End session ───────────────────────────────────────────────────────
  const handleEnd = useCallback(() => {
    const finalData = recorder.finalise()
    onSessionEnd(finalData, recorder.stats)
    onBack()
  }, [recorder, onSessionEnd, onBack])

  return (
    <>
      <div className="screen parent-screen">

        {/* LiveKit audio — stop when P2P is active (P2P video plays its own audio) */}
        {audioRef && isTrackReference(audioRef) && !p2pActive && (
          <AudioTrack trackRef={audioRef} />
        )}

        {/* ── Dual video layers — crossfade between LiveKit and P2P ──── */}
        <div className="video-container">

          {/* LiveKit video layer — fades out when P2P takes over */}
          <div
            className="video-layer"
            style={{ opacity: p2pActive ? 0 : 1 }}
          >
            {videoRef && isTrackReference(videoRef) ? (
              <VideoTrack trackRef={videoRef} className="remote-video" />
            ) : (
              <AudioOnlyView waiting={!hasBaby && !p2pActive} />
            )}
          </div>

          {/* P2P video layer — fades in when ready (always rendered once stream exists) */}
          {p2pRemoteStream && (
            <div
              className="video-layer"
              style={{ opacity: p2pActive ? 1 : 0 }}
            >
              <video
                ref={p2pVideoRef}
                className="remote-video"
                autoPlay
                playsInline
                onCanPlay={handleP2PCanPlay}
              />
            </div>
          )}
        </div>

        {/* ── Always-visible overlay controls ── */}
        <div className="parent-controls">

          {/* TOP: badge (left) + timer + beenden (right) */}
          <div className="parent-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ConnectionBadge
                state={monitorState}
                videoQuality={p2pActive ? 3 : videoQuality}
                audioQuality={p2pActive ? 3 : audioQuality}
                light
              />
              <ModeBadge
                mode={p2pActive ? 'direct' : 'secured'}
                transport={p2pActive ? p2pTransport : undefined}
              />
            </div>
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

          {/* BOTTOM LEFT: live indicators + action buttons */}
          <div className="parent-bottom-left">
            {moveState.isMoving && (
              <div className="live-indicator live-indicator--move">🏃 Bewegt sich</div>
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
              {/* Speak button only available in LiveKit mode (P2P audio is one-way for now) */}
              {!p2pActive && (
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
              )}
            </div>
          </div>

        </div>

        {summary && <SummaryBanner summary={summary} onDismiss={clearSummary} />}
        <HelpButton screen="monitor" />

        {/* Degraded banner (LiveKit only — in P2P mode video is direct) */}
        {!p2pActive && monitorState === 'degraded' && (
          <div className="degraded-banner">
            🔊 Nur Audio — Video pausiert für stabile Verbindung
          </div>
        )}

        {/* Critical overlay (suppress when P2P is active — LK disconnect is intentional) */}
        {!p2pActive && monitorState === 'critical' && (
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

        {/* P2P critical overlay (only if P2P connection fails after switch) */}
        {p2pActive && p2pMonitorState === 'critical' && (
          <div className="critical-overlay">
            <p className="critical-title">Direktverbindung getrennt</p>
            <p className="critical-subtitle">
              Die direkte Verbindung wurde unterbrochen.
            </p>
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
            videoQuality={p2pActive ? 3 : videoQuality}
            audioQuality={p2pActive ? 3 : audioQuality}
            showVideoOffBanner={!p2pActive && monitorState === 'degraded'}
            onBack={() => setShowDashboard(false)}
          />
        </div>
      )}
    </>
  )
}
