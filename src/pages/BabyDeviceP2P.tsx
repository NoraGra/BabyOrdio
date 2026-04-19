/**
 * BabyDeviceP2P — Baby-side streaming via native WebRTC (no LiveKit)
 *
 * Used when transport = 'p2p'. All UI is identical to BabyDevice.
 *
 * Supports two modes:
 * 1. Standalone: acquires camera itself, creates own P2P connection
 * 2. Handed-off: receives pre-acquired stream + existing P2P connection from
 *    BabyDevice (used for seamless LiveKit → P2P switch — no camera flash,
 *    no P2P re-negotiation, no stream blip on the parent side)
 */
import { useEffect, useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useWakeLock } from '../hooks/useWakeLock'
import { useWebRTC } from '../hooks/useWebRTC'
import type { WebRTCStatus, WebRTCTransport } from '../hooks/useWebRTC'
import ConnectionBadge from '../components/ConnectionBadge'
import ModeBadge from '../components/ModeBadge'
import HelpButton from '../components/HelpButton'
import type { MonitorState } from '../hooks/useMonitorState'

interface P2PHandoff {
  status:            WebRTCStatus
  transport:         WebRTCTransport
  disconnect:        () => void
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>
}

interface Props {
  code: string
  onBack: () => void
  onSwitchToLiveKit: () => void
  /** Provided on seamless LiveKit→P2P switch — use instead of getUserMedia */
  initialStream?: MediaStream
  /** Provided on seamless switch — skip new WebRTC negotiation, reuse existing */
  p2pHandoff?: P2PHandoff
}

const STATUS_TO_BADGE: Record<string, MonitorState> = {
  idle:        'connecting',
  signaling:   'connecting',
  connecting:  'connecting',
  connected:   'connected',
  reconnecting:'reconnecting',
  failed:      'critical',
  closed:      'critical',
}

export default function BabyDeviceP2P({
  code,
  onBack,
  onSwitchToLiveKit,
  initialStream,
  p2pHandoff,
}: Props) {
  const [localStream,     setLocalStream]     = useState<MediaStream | null>(initialStream ?? null)
  const [camError,        setCamError]        = useState<string | null>(null)
  const [showQR,          setShowQR]          = useState(false)
  const [pairingExpanded, setPairingExpanded] = useState(true)
  const [showEndConfirm,  setShowEndConfirm]  = useState(false)
  const [nightMode,       setNightMode]       = useState(false)
  const [isSwitchingCam,  setIsSwitchingCam] = useState(false)
  const videoRef      = useRef<HTMLVideoElement>(null)
  // Track current facing mode for mobile-compatible camera flip
  const facingModeRef = useRef<'environment' | 'user'>('environment')

  useWakeLock()

  // ── Acquire camera + mic (only when no stream was handed off) ─────────
  useEffect(() => {
    if (initialStream) return  // already have a stream — skip getUserMedia

    let active = true
    let acquired: MediaStream | null = null

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
      .then(s => {
        if (active) { acquired = s; setLocalStream(s) }
        else        { s.getTracks().forEach(t => t.stop()) }
      })
      .catch(err => { if (active) setCamError(err.message) })

    return () => {
      active = false
      acquired?.getTracks().forEach(t => t.stop())  // only stop what WE acquired
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps -- initialStream is stable

  // ── Attach stream to <video> preview ───────────────────────────────────
  useEffect(() => {
    if (videoRef.current && localStream) videoRef.current.srcObject = localStream
  }, [localStream])

  // ── Collapse pairing after 60s ──────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setPairingExpanded(false), 60_000)
    return () => clearTimeout(id)
  }, [])

  // ── P2P connection ──────────────────────────────────────────────────────
  // When p2pHandoff is provided: reuse existing connection (seamless switch).
  // When not: create fresh connection (standalone P2P start).
  const ownWebRTC = useWebRTC({
    code,
    role:        'baby',
    localStream: localStream,
    enabled:     !p2pHandoff,   // disabled when handed off
    onModeSwitch: () => onSwitchToLiveKit(),
  })

  const status             = p2pHandoff ? p2pHandoff.status             : ownWebRTC.status
  const transport          = p2pHandoff ? p2pHandoff.transport          : ownWebRTC.transport
  const disconnect         = p2pHandoff ? p2pHandoff.disconnect         : ownWebRTC.disconnect
  const replaceVideoTrack  = p2pHandoff ? p2pHandoff.replaceVideoTrack  : ownWebRTC.replaceVideoTrack

  // ── Flip camera ─────────────────────────────────────────────────────────
  // Uses facingMode toggle — works on mobile Chrome where enumerateDevices()
  // returns empty deviceIds. Replaces the video sender in the RTCPeerConnection
  // via replaceTrack (no re-negotiation needed) and updates local preview.
  const flipCamera = async () => {
    if (isSwitchingCam || !localStream) return
    setIsSwitchingCam(true)
    try {
      const nextFacing: 'environment' | 'user' =
        facingModeRef.current === 'environment' ? 'user' : 'environment'

      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      const newVideoTrack = newVideoStream.getVideoTracks()[0]

      // Replace track in the active P2P RTCPeerConnection (no re-negotiation)
      await replaceVideoTrack(newVideoTrack).catch(e => console.warn('replaceTrack failed', e))

      // Stop old video track(s)
      localStream.getVideoTracks().forEach(t => t.stop())

      // Build new preview stream: new video + existing audio
      const newStream = new MediaStream([newVideoTrack, ...localStream.getAudioTracks()])
      setLocalStream(newStream)

      facingModeRef.current = nextFacing
    } catch (e) { console.error('Flip failed', e) }
    finally { setIsSwitchingCam(false) }
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleEndConfirm = () => { disconnect(); onBack() }

  const handleShare = () => {
    const qrUrl = `${window.location.origin}/?code=${code}`
    const formattedCode = `${code.slice(0, 4)} ${code.slice(4)}`
    if (navigator.share) {
      navigator.share({ title: 'Baby Ordio', text: `Code: ${formattedCode}`, url: qrUrl }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(`${formattedCode} — ${qrUrl}`)
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const formattedCode = `${code.slice(0, 4)} ${code.slice(4)}`
  const qrUrl = `${window.location.origin}/?code=${code}`
  const badgeState: MonitorState = STATUS_TO_BADGE[status] ?? 'connecting'
  const isConnected = status === 'connected'

  if (camError) {
    return (
      <div className="screen error-screen">
        <p>⚠️ Kamera: {camError}</p>
        <button className="secondary-button" onClick={onBack}>Zurück</button>
        <button className="primary-button" onClick={onSwitchToLiveKit}>
          Mit LiveKit versuchen
        </button>
      </div>
    )
  }

  return (
    <div className={`screen baby-screen${nightMode ? ' baby-screen--night' : ''}`}>

      {/* ── Local camera preview ─────────────────────────────────────── */}
      <video ref={videoRef} className="baby-preview" autoPlay playsInline muted />

      {/* ── Night mode overlay ───────────────────────────────────────── */}
      {nightMode && (
        <div className="night-mode-overlay" onClick={() => setNightMode(false)}>
          <span className="night-mode-hint">🌙 Tippen zum Beenden</span>
        </div>
      )}

      <div className="baby-overlay">

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <div className="baby-top">
          <div className="baby-top-left">
            <div className="baby-badge-row">
              <ConnectionBadge state={badgeState} />
              <ModeBadge mode="direct" transport={transport} />
            </div>
            <span className="wake-notice-inline">
              Wenn der Bildschirm ausgeht oder du die App verlässt, stoppt die Übertragung.
            </span>
            <div className="baby-top-actions">
              <button
                className="flip-camera-btn"
                onClick={flipCamera}
                disabled={isSwitchingCam}
              >
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

          {/* End button — top right */}
          <button
            className="end-circle-btn end-circle-btn--labeled"
            onClick={() => setShowEndConfirm(true)}
            aria-label="Session beenden"
          >
            <span className="end-circle-label">Session für alle beenden</span>
            <span className="end-circle-icon">✕</span>
          </button>
        </div>

        {/* ── Bottom: code + pairing ───────────────────────────────────── */}
        <div className="baby-bottom">
          <p className="baby-viewer-label">
            {isConnected ? '✓ Elternteil verbunden' : 'Warte auf Verbindung…'}
          </p>

          {showQR ? (
            <div className="qr-container" onClick={() => setShowQR(false)}>
              <QRCodeSVG
                value={qrUrl}
                size={180}
                bgColor="rgba(0,0,0,0.85)"
                fgColor="#ffffff"
                level="M"
              />
              <p className="qr-hint">Tippen zum Schließen</p>
            </div>
          ) : pairingExpanded ? (
            <>
              <p className="code-label">Code zum Verbinden</p>
              <p className="code-value">{formattedCode}</p>
              <div className="pairing-actions">
                <button className="show-qr-btn" onClick={handleShare}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                  Code teilen
                </button>
                <button className="show-qr-btn" onClick={() => setShowQR(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
            <button
              className="connect-collapsed-btn"
              onClick={() => { setPairingExpanded(true); setShowQR(true) }}
            >
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
              <button className="confirm-btn confirm-btn--danger" onClick={handleEndConfirm}>
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
