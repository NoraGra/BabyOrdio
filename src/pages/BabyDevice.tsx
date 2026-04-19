/**
 * BabyDevice — Baby-side streaming
 *
 * Architecture:
 * 1. Camera + mic acquired ONCE at top level (getUserMedia)
 * 2. In LiveKit mode: stream published manually to LiveKit room
 *    + background P2P runs with the same stream (starts immediately)
 * 3. When parent auto-triggers P2P upgrade: mode switches to 'p2p'
 *    → BabyDeviceP2P receives the pre-acquired stream (no camera flash)
 * 4. Switch back to LiveKit: new LiveKit session (camera re-acquired)
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  useParticipants,
  AudioTrack,
  isTrackReference,
} from '@livekit/components-react'
import { RoomEvent, Track, LocalVideoTrack, LocalAudioTrack } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { QRCodeSVG } from 'qrcode.react'
import { useToken } from '../hooks/useToken'
import { useWakeLock } from '../hooks/useWakeLock'
import { useWebRTC } from '../hooks/useWebRTC'
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
  const [mode,       setMode]       = useState<'p2p' | 'livekit'>('livekit')
  const [camStream,  setCamStream]  = useState<MediaStream | null>(null)
  const [camError,   setCamError]   = useState<string | null>(null)

  // Ref prevents onDisconnected → onBack() when WE initiate the LiveKit disconnect
  const isIntentionalSwitchRef = useRef(false)

  // ── Acquire camera + mic ONCE — shared between LiveKit and P2P ────────
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

  // Stop all tracks on full unmount
  const camStreamRef = useRef(camStream)
  useEffect(() => { camStreamRef.current = camStream }, [camStream])
  useEffect(() => () => { camStreamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  // ── Background P2P — starts immediately (same as parent side) ────────
  // BabyDeviceP2P receives this connection as a handoff (no re-negotiation).
  const {
    status:           p2pStatus,
    transport:        p2pTransport,
    disconnect:       p2pDisconnect,
    replaceVideoTrack: p2pReplaceVideoTrack,
  } = useWebRTC({
    code,
    role:        'baby',
    localStream: camStream,
    enabled:     !!camStream,   // start as soon as camera is ready
    onModeSwitch: () => {
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
  if (mode === 'p2p') {
    return (
      <BabyDeviceP2P
        code={code}
        onBack={onBack}
        initialStream={camStream}
        p2pHandoff={{
          status:            p2pStatus,
          transport:         p2pTransport,
          disconnect:        p2pDisconnect,
          replaceVideoTrack: p2pReplaceVideoTrack,
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
      p2pStatus={p2pStatus}
    />
  )
}

// ── LiveKit baby device ───────────────────────────────────────────────────
interface LiveKitProps {
  code:       string
  onBack:     () => void
  camStream:  MediaStream
  p2pStatus:  string
}

function LiveKitBabyDevice({ code, onBack, camStream, p2pStatus }: LiveKitProps) {
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
        p2pStatus={p2pStatus}
      />
    </LiveKitRoom>
  )
}

// ── BabyRoom (inside LiveKit context) ────────────────────────────────────
function BabyRoom({ code, onBack, camStream, p2pStatus }: LiveKitProps) {
  const room                  = useRoomContext()
  const { localParticipant }  = useLocalParticipant()
  const connectionState       = useConnectionState()
  const allParticipants       = useParticipants()

  const [showQR,           setShowQR]           = useState(false)
  const [pairingExpanded,  setPairingExpanded]  = useState(true)
  const [showEndConfirm,   setShowEndConfirm]   = useState(false)
  const [nightMode,        setNightMode]        = useState(false)
  const [joinToast,        setJoinToast]        = useState<string | null>(null)
  const [shareToast,       setShareToast]       = useState<string | null>(null)
  const [isSwitchingCam,   setIsSwitchingCam]  = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Keep a ref to the currently published video track so we can unpublish on flip
  const publishedVideoTrackRef = useRef<MediaStreamTrack | null>(null)
  // Track current facing mode for mobile-compatible camera flip
  const facingModeRef = useRef<'environment' | 'user'>('environment')

  useWakeLock()

  // ── Publish pre-acquired stream to LiveKit ────────────────────────────
  useEffect(() => {
    if (!localParticipant || !camStream) return

    const videoTrack = camStream.getVideoTracks()[0]
    const audioTrack = camStream.getAudioTracks()[0]

    // userProvidedTrack=true: LiveKit won't stop/restart these tracks
    const lkVideo = videoTrack ? new LocalVideoTrack(videoTrack, undefined, true) : null
    const lkAudio = audioTrack ? new LocalAudioTrack(audioTrack, undefined, true) : null

    if (lkVideo) {
      publishedVideoTrackRef.current = videoTrack
      localParticipant.publishTrack(lkVideo, { source: Track.Source.Camera }).catch(console.error)
    }
    if (lkAudio) {
      localParticipant.publishTrack(lkAudio, { source: Track.Source.Microphone }).catch(console.error)
    }

    return () => {
      if (videoTrack) localParticipant.unpublishTrack(videoTrack).catch(() => {})
      if (audioTrack) localParticipant.unpublishTrack(audioTrack).catch(() => {})
      publishedVideoTrackRef.current = null
    }
  }, [localParticipant, camStream])

  // ── Attach camera stream to local preview ────────────────────────────
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.srcObject = camStream
    videoRef.current.play().catch(() => {})
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
  // Uses facingMode toggle (not deviceId) — works on mobile Chrome where
  // enumerateDevices() returns empty deviceIds. Unpublishes the old LiveKit
  // track and publishes the new one without touching the audio track.
  const flipCamera = useCallback(async () => {
    if (isSwitchingCam) return
    setIsSwitchingCam(true)
    try {
      const nextFacing: 'environment' | 'user' =
        facingModeRef.current === 'environment' ? 'user' : 'environment'

      // Unpublish + stop old video track first (required on some mobile browsers)
      const oldVideoTrack = publishedVideoTrackRef.current
      if (oldVideoTrack) {
        await localParticipant.unpublishTrack(oldVideoTrack).catch(() => {})
        oldVideoTrack.stop()
        publishedVideoTrackRef.current = null
      }

      // Acquire new video stream with the opposite facingMode
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      const newVideoTrack = newVideoStream.getVideoTracks()[0]

      // Publish new video track to LiveKit
      const lkVideo = new LocalVideoTrack(newVideoTrack, undefined, true)
      publishedVideoTrackRef.current = newVideoTrack
      await localParticipant.publishTrack(lkVideo, { source: Track.Source.Camera })

      // Update local preview (new video + existing audio tracks)
      if (videoRef.current) {
        videoRef.current.srcObject = new MediaStream([newVideoTrack, ...camStream.getAudioTracks()])
      }

      facingModeRef.current = nextFacing
    } catch (e) { console.error('Camera flip failed:', e) }
    finally { setIsSwitchingCam(false) }
  }, [localParticipant, camStream, isSwitchingCam])

  const connectedParents = allParticipants.filter(p => !p.isLocal && p.identity.startsWith('parent-'))
  const parentCount      = connectedParents.length

  const badgeState: MonitorState =
    connectionState === 'reconnecting' ? 'reconnecting'
    : connectionState === 'disconnected' ? 'critical'
    : connectionState === 'connected' ? 'connected'
    : 'connecting'

  // Remote audio (parent speaks to baby via LiveKit)
  const remoteTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const parentAudio  = remoteTracks.find(t => isTrackReference(t) && !t.participant.isLocal)

  const formattedCode = `${code.slice(0, 4)} ${code.slice(4)}`
  const qrUrl         = `${window.location.origin}/?code=${code}`

  return (
    <div className={`screen baby-screen${nightMode ? ' baby-screen--night' : ''}`}>

      {/* Camera preview from pre-acquired stream */}
      <video ref={videoRef} className="baby-preview" autoPlay playsInline muted />

      {/* Parent audio (speak-to-baby function) */}
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
                {/* Camera outline icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                {isSwitchingCam ? 'Wechsle…' : 'Kamera drehen'}
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
          {shareToast && <p className="baby-join-toast">{shareToast}</p>}

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
                <button className="show-qr-btn" onClick={async () => {
                  // Try system share sheet first; fall back to clipboard
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: 'Baby Ordio', text: `Code: ${formattedCode}`, url: qrUrl })
                      return
                    } catch (e) {
                      if ((e as DOMException).name === 'AbortError') return // user cancelled
                    }
                  }
                  try {
                    await navigator.clipboard.writeText(`${formattedCode} — ${qrUrl}`)
                    setShareToast('Link kopiert ✓')
                    setTimeout(() => setShareToast(null), 2200)
                  } catch { /* ignore */ }
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                  Teilen
                </button>
                <button className="show-qr-btn" onClick={() => setShowQR(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 17v3M17 14h3"/>
                  </svg>
                  QR Code anzeigen
                </button>
              </div>
            </>
          ) : (
            <button className="connect-collapsed-btn" onClick={() => { setPairingExpanded(true); setShowQR(false) }}>
              Anzeigen
            </button>
          )}

          {/* P2P status chip — helps diagnose connection issues */}
          {p2pStatus !== 'idle' && p2pStatus !== 'connected' && (
            <p className="p2p-status-chip">
              Direkt: {p2pStatus === 'signaling' ? 'Aushandlung…' : p2pStatus === 'connecting' ? 'ICE…' : p2pStatus === 'failed' ? 'fehlgeschlagen' : p2pStatus}
            </p>
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
