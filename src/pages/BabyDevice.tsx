/**
 * BabyDevice — Baby-side streaming
 *
 * Architecture:
 * 1. Camera is acquired ONCE at top level (getUserMedia)
 * 2. In LiveKit mode: stream is published manually to LiveKit room
 *    + background P2P runs with the same stream (probe → full connection)
 * 3. When parent auto-triggers P2P upgrade: mode switches to 'p2p'
 *    → BabyDeviceP2P receives the pre-acquired stream (no camera flash)
 * 4. Switch back to LiveKit: new LiveKit session (camera re-acquired)
 *
 * This ensures the camera NEVER turns off during a LiveKit → P2P switch.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  useParticipants,
  VideoTrack,
  AudioTrack,
  isTrackReference,
} from '@livekit/components-react'
import { ConnectionQuality, RoomEvent, Track, LocalVideoTrack, LocalAudioTrack } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { QRCodeSVG } from 'qrcode.react'
import { useToken } from '../hooks/useToken'
import { useWakeLock } from '../hooks/useWakeLock'
import { useWebRTC } from '../hooks/useWebRTC'
import { useP2PProbe } from '../hooks/useP2PProbe'
import ConnectionBadge from '../components/ConnectionBadge'
import ModeBadge from '../components/ModeBadge'
import HelpButton from '../components/HelpButton'
import BabyDeviceP2P from './BabyDeviceP2P'
import type { MonitorState } from '../hooks/useMonitorState'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string

interface Props {
  code: string
  onBack: () => void
}

export default function BabyDevice({ code, onBack }: Props) {
  const [mode,        setMode]        = useState<'p2p' | 'livekit'>('livekit')
  const [camStream,   setCamStream]   = useState<MediaStream | null>(null)
  const [camError,    setCamError]    = useState<string | null>(null)

  // Ref prevents onDisconnected → onBack() when WE initiate the LiveKit disconnect
  const isIntentionalSwitchRef = useRef(false)

  // ── Acquire camera ONCE — shared between LiveKit and P2P ──────────────
  useEffect(() => {
    let alive = true
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
      .then(s  => { if (alive) setCamStream(s) })
      .catch(e => { if (alive) setCamError(e.message) })

    return () => { alive = false }
  }, [])

  // Stop camera tracks on full unmount only
  const camStreamRef = useRef(camStream)
  useEffect(() => { camStreamRef.current = camStream }, [camStream])
  useEffect(() => () => { camStreamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  // ── P2P probe (data-channel-only ICE test) ────────────────────────────
  const probeStatus = useP2PProbe(code, 'baby')

  // ── Background P2P media connection ───────────────────────────────────
  // Stays enabled even in p2p mode so the parent's stream is never interrupted.
  // BabyDeviceP2P receives this connection as a handoff (no re-negotiation).
  const {
    status:     p2pStatus,
    transport:  p2pTransport,
    disconnect: p2pDisconnect,
  } = useWebRTC({
    code,
    role:        'baby',
    localStream: camStream,
    enabled:     probeStatus === 'available' && !!camStream,
    onModeSwitch: () => {
      // Parent requested switch back to LiveKit
      isIntentionalSwitchRef.current = false
      setMode('livekit')
    },
  })

  // ── Poll for upgrade signal from parent while in LiveKit mode ─────────
  useEffect(() => {
    if (mode !== 'livekit') return
    let alive = true
    const poll = async () => {
      try {
        const r = await fetch(`/api/signal?code=${code}`, { cache: 'no-store' })
        if (!r.ok || !alive) return
        const s = await r.json()
        if (alive && s.upgradeRequest === 'p2p') {
          // Mark as intentional so LiveKit onDisconnected doesn't call onBack()
          isIntentionalSwitchRef.current = true
          setMode('p2p')
        }
      } catch { /* ignore */ }
    }
    const id = setInterval(poll, 1000)
    return () => { alive = false; clearInterval(id) }
  }, [mode, code])

  // ── Suppress LiveKit onDisconnected during intentional switch ─────────
  const handleDisconnected = useCallback(() => {
    if (!isIntentionalSwitchRef.current) onBack()
  }, [onBack])

  // ── Render ─────────────────────────────────────────────────────────────
  if (camError) {
    return (
      <div className="screen error-screen">
        <p>⚠️ Kamera: {camError}</p>
        <button className="secondary-button" onClick={onBack}>Zurück</button>
      </div>
    )
  }

  if (!camStream) {
    return (
      <div className="screen loading-screen">
        <div className="spinner" />
        <p>Kamera wird aktiviert…</p>
      </div>
    )
  }

  // P2P mode — hand off the pre-acquired stream and existing P2P connection
  // so there's no camera flash and no stream re-negotiation
  if (mode === 'p2p') {
    return (
      <BabyDeviceP2P
        code={code}
        onBack={onBack}
        initialStream={camStream}
        p2pHandoff={{
          status:     p2pStatus,
          transport:  p2pTransport,
          disconnect: p2pDisconnect,
        }}
        onSwitchToLiveKit={() => {
          isIntentionalSwitchRef.current = false
          setMode('livekit')
        }}
      />
    )
  }

  // LiveKit mode — publish pre-acquired stream manually
  return (
    <LiveKitBabyDevice
      code={code}
      onBack={handleDisconnected}
      camStream={camStream}
      probeStatus={probeStatus}
      p2pStatus={p2pStatus}
    />
  )
}

// ── LiveKit baby device ───────────────────────────────────────────────────
interface LiveKitProps {
  code:        string
  onBack:      () => void
  camStream:   MediaStream
  probeStatus: 'checking' | 'available' | 'unavailable'
  p2pStatus:   string
}

function LiveKitBabyDevice({ code, onBack, camStream, probeStatus, p2pStatus }: LiveKitProps) {
  const tokenState = useToken(code, 'baby')

  if (!LIVEKIT_URL) return (
    <div className="screen error-screen">
      <p>⚠️ VITE_LIVEKIT_URL is not set.</p>
      <button className="back-button" onClick={onBack}>← Back</button>
    </div>
  )

  if (tokenState.status === 'loading') return (
    <div className="screen loading-screen"><div className="spinner" /><p>Verbinde…</p></div>
  )

  if (tokenState.status === 'error') return (
    <div className="screen error-screen">
      <p>⚠️ {tokenState.message}</p>
      <button className="primary-button" onClick={onBack}>Erneut versuchen</button>
    </div>
  )

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={tokenState.token}
      connect
      audio={false}   // manual publish — we provide the stream
      video={false}   // manual publish — we provide the stream
      onDisconnected={onBack}
    >
      <BabyRoom
        code={code}
        onBack={onBack}
        camStream={camStream}
        probeStatus={probeStatus}
        p2pStatus={p2pStatus}
      />
    </LiveKitRoom>
  )
}

// ── BabyRoom (inside LiveKit context) ────────────────────────────────────
function BabyRoom({ code, onBack, camStream, probeStatus, p2pStatus }: LiveKitProps) {
  const room                  = useRoomContext()
  const { localParticipant }  = useLocalParticipant()
  const connectionState       = useConnectionState()
  const allParticipants       = useParticipants()

  const [showQR,           setShowQR]           = useState(false)
  const [pairingExpanded,  setPairingExpanded]  = useState(true)
  const [showEndConfirm,   setShowEndConfirm]   = useState(false)
  const [nightMode,        setNightMode]        = useState(false)
  const [joinToast,        setJoinToast]        = useState<string | null>(null)
  const [isSwitchingCam,   setIsSwitchingCam]  = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useWakeLock()

  // ── Publish pre-acquired stream to LiveKit (instead of auto-acquire) ──
  useEffect(() => {
    if (!localParticipant || !camStream) return

    const videoTrack = camStream.getVideoTracks()[0]
    const audioTrack = camStream.getAudioTracks()[0]

    const lkVideo = videoTrack ? new LocalVideoTrack(videoTrack, undefined, false) : null
    const lkAudio = audioTrack ? new LocalAudioTrack(audioTrack, undefined, false) : null

    if (lkVideo) localParticipant.publishTrack(lkVideo, { source: Track.Source.Camera }).catch(console.error)
    if (lkAudio) localParticipant.publishTrack(lkAudio, { source: Track.Source.Microphone }).catch(console.error)

    return () => {
      if (lkVideo) localParticipant.unpublishTrack(videoTrack).catch(() => {})
      if (lkAudio) localParticipant.unpublishTrack(audioTrack).catch(() => {})
    }
  }, [localParticipant, camStream])

  // ── Attach camera stream to local preview ────────────────────────────
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camStream
  }, [camStream])

  // ── Collapse pairing after 60s ───────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setPairingExpanded(false), 60_000)
    return () => clearTimeout(id)
  }, [])

  // ── Parent join toast ────────────────────────────────────────────────
  useEffect(() => {
    if (!room) return
    const onJoined = (p: Participant) => {
      if (!p.identity.startsWith('parent-')) return
      setJoinToast('Elternteil verbunden ✓')
      setTimeout(() => setJoinToast(null), 3000)
    }
    room.on(RoomEvent.ParticipantConnected, onJoined)
    return () => { room.off(RoomEvent.ParticipantConnected, onJoined) }
  }, [room])

  // ── Flip camera ──────────────────────────────────────────────────────
  const flipCamera = useCallback(async () => {
    if (isSwitchingCam) return
    setIsSwitchingCam(true)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams    = devices.filter(d => d.kind === 'videoinput')
      if (cams.length < 2) return
      const currentId = camStream.getVideoTracks()[0]?.getSettings().deviceId
      const next = cams.find(d => d.deviceId !== currentId) ?? cams[0]
      await room.switchActiveDevice('videoinput', next.deviceId)
    } catch (e) { console.error('Camera flip failed:', e) }
    finally { setIsSwitchingCam(false) }
  }, [room, camStream, isSwitchingCam])

  const connectedParents = allParticipants.filter(p => !p.isLocal && p.identity.startsWith('parent-'))
  const parentCount      = connectedParents.length

  const badgeState: MonitorState =
    connectionState === 'reconnecting' ? 'reconnecting'
    : connectionState === 'disconnected' ? 'critical'
    : connectionState === 'connected' ? 'connected'
    : 'connecting'

  // Remote audio (parent speaks to baby)
  const remoteTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const parentAudio  = remoteTracks.find(t => isTrackReference(t) && !t.participant.isLocal)

  const formattedCode = `${code.slice(0, 4)} ${code.slice(4)}`
  const qrUrl         = `${window.location.origin}/?code=${code}`

  return (
    <div className={`screen baby-screen${nightMode ? ' baby-screen--night' : ''}`}>

      {/* Camera preview from pre-acquired stream */}
      <video ref={videoRef} className="baby-preview" autoPlay playsInline muted />

      {/* Parent audio */}
      {parentAudio && isTrackReference(parentAudio) && <AudioTrack trackRef={parentAudio} />}

      {/* Night mode overlay */}
      {nightMode && (
        <div className="night-mode-overlay" onClick={() => setNightMode(false)}>
          <span className="night-mode-hint">🌙 Tippen zum Beenden</span>
        </div>
      )}

      <div className="baby-overlay">

        {/* ── Top bar ───────────────────────────────────────────────── */}
        <div className="baby-top">
          <div className="baby-top-left">
            <div className="baby-badge-row">
              <ConnectionBadge state={badgeState} />
              {parentCount > 0 && (
                <span className="parent-count-badge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  {parentCount}
                </span>
              )}
              <ModeBadge mode="secured" />
            </div>
            <span className="wake-notice-inline">
              Wenn der Bildschirm ausgeht oder du die App verlässt, stoppt die Übertragung.
            </span>
            <div className="baby-top-actions">
              <button className="flip-camera-btn" onClick={flipCamera} disabled={isSwitchingCam}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4v6h6"/>
                  <path d="M23 20v-6h-6"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
                Kamera drehen
              </button>
              <button className="flip-camera-btn" onClick={() => setNightMode(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                Night Mode
              </button>
            </div>
          </div>

          <button
            className="end-circle-btn end-circle-btn--labeled"
            onClick={() => setShowEndConfirm(true)}
            aria-label="Session beenden"
          >
            <span className="end-circle-label">Session für alle beenden</span>
            <span className="end-circle-icon">✕</span>
          </button>
        </div>

        {/* ── Bottom: code + QR ─────────────────────────────────────── */}
        <div className="baby-bottom">
          {joinToast && <p className="baby-join-toast">{joinToast}</p>}

          {showQR ? (
            <div className="qr-container" onClick={() => setShowQR(false)}>
              <QRCodeSVG value={qrUrl} size={180} bgColor="rgba(0,0,0,0.85)" fgColor="#ffffff" level="M" />
              <p className="qr-hint">Tippen zum Schließen</p>
            </div>
          ) : pairingExpanded ? (
            <>
              <p className="code-label">Code zum Verbinden</p>
              <p className="code-value">{formattedCode}</p>
              <div className="pairing-actions">
                <button className="show-qr-btn" onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: 'Baby Ordio', text: `Code: ${formattedCode}`, url: qrUrl }).catch(() => {})
                  } else {
                    navigator.clipboard?.writeText(`${formattedCode} — ${qrUrl}`)
                  }
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                  Code teilen
                </button>
                <button className="show-qr-btn" onClick={() => setShowQR(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 17v3M17 14h3"/>
                  </svg>
                  Code anzeigen
                </button>
              </div>
            </>
          ) : (
            <button className="connect-collapsed-btn" onClick={() => { setPairingExpanded(true); setShowQR(true) }}>
              Code anzeigen
            </button>
          )}
        </div>
      </div>

      {/* ── End session confirm ──────────────────────────────────────────── */}
      {showEndConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-sheet">
            <p className="confirm-title">Session für alle beenden?</p>
            <p className="confirm-body">Die Übertragung wird für alle Geräte beendet.</p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn--danger" onClick={() => { setShowEndConfirm(false); onBack() }}>
                Ja, beenden
              </button>
              <button className="confirm-btn confirm-btn--cancel" onClick={() => setShowEndConfirm(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpButton screen="baby" />
    </div>
  )
}
