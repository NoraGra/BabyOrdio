/**
 * ParentMonitor — parent-side live view
 *
 * Architecture:
 * 1. Always starts in LiveKit mode (fast, reliable, <2 s)
 * 2. P2P starts immediately in background (no probe gate — probe was causing
 *    false-unavailable on same-WiFi / same-machine scenarios)
 * 3. When P2P video first frame is ready (onCanPlay) OR p2pStatus=connected+1.5s:
 *    - CSS crossfade: LiveKit video fades out, P2P video fades in (650ms)
 *    - After fade: LiveKit disconnects intentionally (no onBack())
 *    - Baby is signalled via KV to also switch
 * 4. Zero gap in video — both streams overlap during fade
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
import { useWebRTC, postSignal } from '../hooks/useWebRTC'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string

interface Props {
  code: string
  onBack: () => void
  onSessionEnd: (data: SessionData, stats: SessionStats) => void
  transport?: 'p2p' | 'livekit'
}

export default function ParentMonitor({ code, onBack, onSessionEnd }: Props) {
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
      intentionalSwitchRef={intentionalSwitchRef}
      onDisconnected={handleDisconnected}
    />
  )
}

// ── LiveKit wrapper ───────────────────────────────────────────────────────
interface InnerProps extends Omit<Props, 'transport'> {
  intentionalSwitchRef: React.MutableRefObject<boolean>
  onDisconnected:      () => void
}

function LiveKitParentMonitor({
  code, onBack, onSessionEnd, intentionalSwitchRef, onDisconnected,
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
  intentionalSwitchRef,
}: {
  code: string
  onBack: () => void
  onSessionEnd: (data: SessionData, stats: SessionStats) => void
  intentionalSwitchRef: React.MutableRefObject<boolean>
}) {
  const connectionState    = useConnectionState()
  const remoteParticipants = useRemoteParticipants()
  const { localParticipant } = useLocalParticipant()
  const room = useRoomContext()
  const hasBaby = remoteParticipants.length > 0

  const videoTracks = useTracks([Track.Source.Camera],     { onlySubscribed: true })
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const videoRef = videoTracks.find(t => isTrackReference(t))
  const audioRef = audioTracks.find(t => isTrackReference(t) && !t.participant.isLocal)

  // ── Unlock audio playback (browser autoplay policy) ───────────────────
  // Without this, the baby's audio track won't play even after user interaction.
  useEffect(() => {
    if (!room) return
    room.startAudio().catch(() => {})
  }, [room])

  // ── P2P background connection — starts immediately (no probe gate) ────
  // Previously gated on probe.status === 'available', which caused failures
  // when probe timed out on same-WiFi / same-machine scenarios.
  const {
    status:       p2pStatus,
    transport:    p2pTransport,
    remoteStream: p2pRemoteStream,
  } = useWebRTC({
    code,
    role:        'parent',
    localStream: null,
    enabled:     true,  // always try P2P; switch only fires if it actually connects
  })

  // P2P video element — muted so iOS allows autoplay without user gesture
  const p2pVideoRef    = useRef<HTMLVideoElement | null>(null)
  const p2pSwitchedRef = useRef(false)
  const [p2pActive, setP2pActive] = useState(false)
  // p2pVideoEl tracks the video DOM element reactively (for analysis hooks)
  const [p2pVideoEl, setP2pVideoEl] = useState<HTMLVideoElement | null>(null)
  const p2pVideoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    p2pVideoRef.current = el
    setP2pVideoEl(el)
  }, [])

  // P2P audio — simplest reliable approach across all browsers + iOS:
  //
  // We put BOTH video and audio tracks into the same muted <video> element.
  // The element starts muted (required for autoplay without user gesture).
  // Once the P2P switch is confirmed (p2pActive = true), we imperatively set
  // videoElement.muted = false. Browsers always allow unmuting an already-playing
  // video — no AudioContext, no user-gesture restriction, no resume() needed.
  //
  // Why not AudioContext? AudioContext.resume() only works synchronously inside
  // a user-gesture handler. Calling it from useEffect or setTimeout fails on
  // mobile browsers (Chrome Android, iOS Safari) even if the user has tapped.

  // When P2P stream arrives: put video + audio into the muted video element.
  useEffect(() => {
    if (!p2pRemoteStream) return
    const videoTracks = p2pRemoteStream.getVideoTracks()
    const audioTracks = p2pRemoteStream.getAudioTracks()

    const el = p2pVideoRef.current
    if (el && videoTracks.length > 0) {
      // Include audio tracks so unmuting the element later plays audio
      el.srcObject = new MediaStream([...videoTracks, ...audioTracks])
      el.play().catch(() => {})
    }
  }, [p2pRemoteStream])

  // Unmute the video element when P2P switch completes.
  // .muted = false on a playing element works everywhere — no gesture needed.
  useEffect(() => {
    if (!p2pActive) return
    const el = p2pVideoRef.current
    if (el) el.muted = false
  }, [p2pActive])

  // Core switch logic — called by onPlaying OR by the p2pStatus fallback below
  const doSwitch = useCallback(async () => {
    if (p2pSwitchedRef.current) return
    p2pSwitchedRef.current = true
    await postSignal(code, 'upgrade', 'p2p')  // signal baby
    setP2pActive(true)                         // start CSS crossfade

    // iOS workaround: re-assign srcObject with a fresh MediaStream reference
    // to force iOS WebKit to request a new keyframe. Preserve both video AND
    // audio tracks so unmuting the element afterwards plays audio correctly.
    setTimeout(() => {
      const el = p2pVideoRef.current
      if (el && el.srcObject instanceof MediaStream) {
        const vTracks = el.srcObject.getVideoTracks()
        const aTracks = el.srcObject.getAudioTracks()
        if (vTracks.length > 0) {
          el.srcObject = new MediaStream([...vTracks, ...aTracks])
          el.muted = false   // unmute here — iOS allows this after play()
          el.play().catch(() => {})
        }
      }
    }, 400)

    setTimeout(() => {
      intentionalSwitchRef.current = true
      room.disconnect()                        // drop LiveKit after fade
    }, 650)
  }, [code, room, intentionalSwitchRef])

  // Primary trigger: onCanPlay (cleanest — video is provably rendering)
  const handleP2PCanPlay = useCallback(() => doSwitch(), [doSwitch])

  // Fallback trigger: p2pStatus = 'connected' + tracks present + delay
  // Waits up to 5 s for onCanPlay; only switches if the remote stream
  // actually has tracks (guards against switching to a black screen).
  useEffect(() => {
    if (p2pStatus !== 'connected' || p2pSwitchedRef.current) return

    const id = setTimeout(() => {
      // Don't switch if no tracks yet — stay on LiveKit
      if (!p2pRemoteStream || p2pRemoteStream.getTracks().length === 0) {
        console.warn('[P2P] connected but no tracks after 5s — staying on LiveKit')
        return
      }
      doSwitch()
    }, 5000)
    return () => clearTimeout(id)
  }, [p2pStatus, p2pRemoteStream, doSwitch])

  // ── Parent viewer count ───────────────────────────────────────────────
  // LiveKit mode: count remote participants with 'parent-' prefix + 1 for self
  // P2P mode: always 1 (point-to-point)
  const lkParentCount = remoteParticipants.filter(p => p.identity.startsWith('parent-')).length + 1
  const viewerCount   = p2pActive ? 1 : lkParentCount

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

  // ── Demo mode: simulate degraded (audio-only) state for presentations ─
  const [demoDegrade, setDemoDegrade] = useState(false)

  // ── Monitor state ─────────────────────────────────────────────────────
  const lkMonitorState = deriveMonitorState(connectionState, hasBaby, !!videoRef, !!audioRef)

  // After P2P switch, use P2P status for display (LK is intentionally disconnected)
  const p2pMonitorState = (() => {
    if (p2pStatus === 'connected')    return 'connected'    as const
    if (p2pStatus === 'reconnecting') return 'reconnecting' as const
    if (p2pStatus === 'failed' || p2pStatus === 'closed') return 'critical' as const
    return 'connecting' as const
  })()
  const monitorState = demoDegrade ? 'degraded' : (p2pActive ? p2pMonitorState : lkMonitorState)

  // ── Session recorder ──────────────────────────────────────────────────
  const recorder = useSessionRecorder(code)

  // ── Analysis inputs: use P2P tracks when active, LiveKit tracks otherwise ──
  // Audio: P2P mode → raw MediaStreamTrack from p2pRemoteStream
  //        LiveKit mode → TrackReference from useTracks
  // Video: P2P mode → direct HTMLVideoElement (p2pVideoEl state)
  //        LiveKit mode → TrackReference from useTracks
  const analysisAudioInput = p2pActive
    ? (p2pRemoteStream?.getAudioTracks()[0] ?? undefined)
    : (audioRef && isTrackReference(audioRef) ? audioRef : undefined)

  const analysisVideoInput = p2pActive
    ? p2pVideoEl
    : (videoRef && isTrackReference(videoRef) ? videoRef : undefined)

  // ── Audio level ───────────────────────────────────────────────────────
  const { stats: audioStats } = useAudioAnalyzer(analysisAudioInput)

  // ── Cry detector ──────────────────────────────────────────────────────
  const cryState = useCryDetector(
    analysisAudioInput,
    (level) => recorder.onCryStart(level),
    (level) => recorder.onCryPeak(level),
    () => recorder.onCryEnd(),
  )

  // ── Move detector ─────────────────────────────────────────────────────
  const moveState = useMoveDetector(
    analysisVideoInput,
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

  // ── Talk-to-baby (LiveKit mode only) ──────────────────────────────────
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

  // ── Debug overlay (tap top-left corner 3× to toggle) ─────────────────
  const [showDebug, setShowDebug]   = useState(false)
  const debugTapRef                 = useRef(0)
  const [debugInfo, setDebugInfo]   = useState<Record<string, string>>({})

  useEffect(() => {
    if (!showDebug) return
    const id = setInterval(() => {
      const ctx   = p2pAudioCtxRef.current
      const src   = p2pAudioSourceRef.current
      const tracks = p2pAudioTracksRef.current
      setDebugInfo({
        'ctx.state':    ctx?.state ?? 'null',
        'tracks':       `${tracks.length} (${tracks.map(t => `${t.kind}:${t.readyState}`).join(', ') || '–'})`,
        'source':       src ? 'connected' : 'null',
        'p2pActive':    String(p2pActive),
        'p2pStatus':    p2pStatus,
        'remoteStream': p2pRemoteStream
          ? `v${p2pRemoteStream.getVideoTracks().length} a${p2pRemoteStream.getAudioTracks().length}`
          : 'null',
      })
    }, 500)
    return () => clearInterval(id)
  }, [showDebug, p2pActive, p2pStatus, p2pRemoteStream])

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

        {/* LiveKit audio — stop when P2P is active */}
        {audioRef && isTrackReference(audioRef) && !p2pActive && (
          <AudioTrack trackRef={audioRef} />
        )}

        {/* P2P audio is handled by the muted video element — unmuted imperatively when p2pActive */}

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

          {/* P2P video layer — MUTED so iOS allows autoplay.
              Audio is handled by the separate <audio> element above. */}
          {p2pRemoteStream && (
            <div
              className="video-layer"
              style={{ opacity: p2pActive ? 1 : 0 }}
            >
              <video
                ref={p2pVideoCallbackRef}
                className="remote-video"
                autoPlay
                playsInline
                muted
                onPlaying={handleP2PCanPlay}
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
              {viewerCount > 0 && (monitorState === 'connected' || monitorState === 'degraded') && (
                <span className="parent-count-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  {viewerCount}
                </span>
              )}
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

          {/* P2P status chip — visible when negotiating, disappears once connected */}
          {!p2pActive && p2pStatus !== 'idle' && p2pStatus !== 'connected' && (
            <div style={{
              position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: '4px 12px',
              fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none',
              backdropFilter: 'blur(4px)',
            }}>
              Direkt: {
                p2pStatus === 'signaling'   ? 'Aushandlung…' :
                p2pStatus === 'connecting'  ? 'ICE läuft…' :
                p2pStatus === 'reconnecting'? 'Verbinde neu…' :
                p2pStatus === 'failed'      ? 'fehlgeschlagen' : p2pStatus
              }
            </div>
          )}

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
                {/* Bar-chart icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6"  y1="20" x2="6"  y2="14"/>
                </svg>
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
              {/* Demo mode: simulate audio-only / degraded connection */}
              {/* Hidden from UI but functionality kept for internal testing */}
              <button
                className="speak-btn"
                style={{ display: 'none' }}
                onClick={(e) => { e.stopPropagation(); setDemoDegrade(d => !d) }}
                title="Demo: Schwaches Signal simulieren"
              >
                {demoDegrade ? '▶ Video' : '🎬 Demo'}
              </button>
            </div>
          </div>

        </div>

        {summary && <SummaryBanner summary={summary} onDismiss={clearSummary} />}
        <HelpButton screen="monitor" />

        {/* Debug tap zone — invisible 60×60 hit target top-left corner */}
        <div
          style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 60, zIndex: 200 }}
          onClick={() => {
            debugTapRef.current += 1
            if (debugTapRef.current >= 3) {
              debugTapRef.current = 0
              setShowDebug(d => !d)
            }
          }}
        />

        {/* Debug overlay */}
        {showDebug && (
          <div style={{
            position: 'fixed', bottom: 120, left: 10, zIndex: 300,
            background: 'rgba(0,0,0,0.88)', color: '#0f0', fontFamily: 'monospace',
            fontSize: 11, borderRadius: 8, padding: '8px 12px', lineHeight: 1.8,
            maxWidth: 300,
          }}>
            <div style={{ color: '#ff0', marginBottom: 4 }}>🔍 Audio Debug</div>
            {Object.entries(debugInfo).map(([k, v]) => (
              <div key={k}><span style={{ color: '#888' }}>{k}:</span> {v}</div>
            ))}
            <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>Tap top-left 3× to close</div>
          </div>
        )}

        {/* ── Connection state banners ──────────────────────────────────── */}

        {/* Reconnecting — pulsing non-intrusive banner */}
        {!p2pActive && monitorState === 'reconnecting' && (
          <div className="reconnecting-banner">
            <span className="reconnecting-dot" />
            Verbindung wird wiederhergestellt…
          </div>
        )}

        {/* Degraded (LiveKit only — in P2P mode video is direct) */}
        {!p2pActive && monitorState === 'degraded' && (
          <div className="degraded-banner">
            🔊 Nur Audio — Video pausiert für stabile Verbindung
          </div>
        )}

        {/* Critical overlay (suppress when P2P is active — LK disconnect is intentional) */}
        {!p2pActive && monitorState === 'critical' && (
          <div className="critical-overlay">
            <div className="critical-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <p className="critical-title">Verbindung unterbrochen</p>
            <p className="critical-subtitle">
              Die Verbindung zum Baby-Gerät wurde getrennt.
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
            <div className="critical-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
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
