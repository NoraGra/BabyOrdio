import { useEffect, useState, useCallback } from 'react'
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
import { ConnectionQuality, RoomEvent, Track, Room } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { QRCodeSVG } from 'qrcode.react'
import { useToken } from '../hooks/useToken'
import { useWakeLock } from '../hooks/useWakeLock'
import ConnectionBadge from '../components/ConnectionBadge'
import HelpButton from '../components/HelpButton'
import type { MonitorState } from '../hooks/useMonitorState'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string

interface Props {
  code: string
  onBack: () => void
}

export default function BabyDevice({ code, onBack }: Props) {
  const tokenState = useToken(code, 'baby')

  if (!LIVEKIT_URL) {
    return (
      <div className="screen error-screen">
        <p>⚠️ VITE_LIVEKIT_URL is not set.</p>
        <button className="back-button" onClick={onBack}>← Back</button>
      </div>
    )
  }

  if (tokenState.status === 'loading') {
    return <div className="screen loading-screen"><div className="spinner" /><p>Setting up…</p></div>
  }

  if (tokenState.status === 'error') {
    return (
      <div className="screen error-screen">
        <p>⚠️ {tokenState.message}</p>
        <button className="primary-button" onClick={onBack}>Try Again</button>
      </div>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={tokenState.token}
      connect
      audio
      video
      onDisconnected={onBack}
    >
      <BabyRoom code={code} onBack={onBack} />
    </LiveKitRoom>
  )
}

function BabyRoom({ code, onBack }: { code: string; onBack: () => void }) {
  const room               = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const connectionState    = useConnectionState()
  const allParticipants    = useParticipants()
  const [showQR, setShowQR]               = useState(false)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const [pairingExpanded, setPairingExpanded]     = useState(true)
  const [showEndConfirm, setShowEndConfirm]       = useState(false)
  const [nightMode, setNightMode]                 = useState(false)
  // Toast when a parent joins
  const [joinToast, setJoinToast]                 = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setPairingExpanded(false), 60_000)
    return () => clearTimeout(id)
  }, [])

  useWakeLock()

  // Count connected parents
  const connectedParents = allParticipants.filter(
    p => !p.isLocal && p.identity.startsWith('parent-')
  )
  const parentCount = connectedParents.length

  // Toast when a new parent joins
  useEffect(() => {
    if (!room) return
    const onJoined = (participant: Participant) => {
      if (!participant.identity.startsWith('parent-')) return
      setJoinToast('Elternteil hat sich verbunden ✓')
      setTimeout(() => setJoinToast(null), 3000)
    }
    room.on(RoomEvent.ParticipantConnected, onJoined)
    return () => { room.off(RoomEvent.ParticipantConnected, onJoined) }
  }, [room])

  // Auto-dimming quality handler
  useEffect(() => {
    if (!room || !localParticipant) return
    const handleQualityChange = (quality: ConnectionQuality, participant: Participant) => {
      if (participant.identity !== localParticipant.identity) return
      if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
        localParticipant.setCameraEnabled(false).catch(console.error)
      } else if (quality === ConnectionQuality.Good || quality === ConnectionQuality.Excellent) {
        localParticipant.setCameraEnabled(true).catch(console.error)
      }
    }
    room.on(RoomEvent.ConnectionQualityChanged, handleQualityChange)
    return () => { room.off(RoomEvent.ConnectionQualityChanged, handleQualityChange) }
  }, [room, localParticipant])

  // Flip camera
  const flipCamera = useCallback(async () => {
    if (isSwitchingCamera) return
    setIsSwitchingCamera(true)
    try {
      const devices = await Room.getLocalDevices('videoinput')
      if (devices.length < 2) return
      const currentPub = localParticipant.getTrackPublication(Track.Source.Camera)
      const currentId  = (currentPub?.track as MediaStreamTrack | undefined)?.getSettings().deviceId
      const next = devices.find(d => d.deviceId !== currentId) ?? devices[0]
      await room.switchActiveDevice('videoinput', next.deviceId)
    } catch (e) {
      console.error('Camera flip failed:', e)
    } finally {
      setIsSwitchingCamera(false)
    }
  }, [room, localParticipant, isSwitchingCamera])

  const badgeState: MonitorState =
    connectionState === 'reconnecting' ? 'reconnecting'
    : connectionState === 'disconnected' ? 'critical'
    : connectionState === 'connected' ? 'connected'
    : 'connecting'

  const tracks      = useTracks([Track.Source.Camera], { onlySubscribed: false })
  const localVideo  = tracks.find(t => isTrackReference(t) && t.participant.isLocal)

  // Remote audio (parent speaking to baby)
  const remoteTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const parentAudio  = remoteTracks.find(t => isTrackReference(t) && !t.participant.isLocal)

  const formattedCode = `${code.slice(0, 4)} ${code.slice(4)}`
  const qrUrl = `${window.location.origin}/?code=${code}`

  const handleEndRequest = () => setShowEndConfirm(true)
  const handleEndConfirm = () => { setShowEndConfirm(false); onBack() }
  const handleEndCancel  = () => setShowEndConfirm(false)

  const parentLabel = parentCount === 0
    ? 'Kein Elternteil verbunden'
    : parentCount === 1
    ? '1 Elternteil schaut zu'
    : `${parentCount} Elternteile schauen zu`

  return (
    <div className={`screen baby-screen${nightMode ? ' baby-screen--night' : ''}`}>
      {/* Camera preview */}
      {localVideo && isTrackReference(localVideo) && (
        <VideoTrack trackRef={localVideo} className="baby-preview" />
      )}

      {/* Play parent audio on baby device */}
      {parentAudio && isTrackReference(parentAudio) && (
        <AudioTrack trackRef={parentAudio} />
      )}

      {/* Night mode overlay — tap anywhere to exit */}
      {nightMode && (
        <div className="night-mode-overlay" onClick={() => setNightMode(false)}>
          <span className="night-mode-hint">🌙 Tippen zum Beenden</span>
        </div>
      )}

      <div className="baby-overlay">
        {/* ── Top bar ───────────────────────────────────────────── */}
        <div className="baby-top">
          {/* Left column: badge row + flip button */}
          <div className="baby-top-left">
            <div className="baby-badge-row">
              <ConnectionBadge state={badgeState} />
              {parentCount > 0 && (
                <span className="parent-count-badge">
                  👁 {parentCount}
                </span>
              )}
            </div>
            <span className="wake-notice-inline">
              Wenn der Bildschirm ausgeht oder du die App verlässt, stoppt die Übertragung.
            </span>
            <div className="baby-top-actions">
              <button
                className="flip-camera-btn"
                onClick={flipCamera}
                disabled={isSwitchingCamera}
                aria-label="Kamera wechseln"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4v6h6"/>
                  <path d="M23 20v-6h-6"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
                Kamera drehen
              </button>
              {/* Night mode toggle */}
              <button
                className="flip-camera-btn"
                onClick={() => setNightMode(true)}
                aria-label="Nachtmodus aktivieren"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                Night Mode
              </button>
            </div>
          </div>

          {/* Right: end button — top-right */}
          <button
            className="end-circle-btn end-circle-btn--labeled"
            onClick={handleEndRequest}
            aria-label="Session beenden"
          >
            <span className="end-circle-label">Session für alle beenden</span>
            <span className="end-circle-icon">✕</span>
          </button>
        </div>

        {/* ── Bottom: code + QR ─────────────────────────────────── */}
        <div className="baby-bottom">
          {/* Parent viewer count */}
          <p className="baby-viewer-label">{parentLabel}</p>

          {/* Toast when parent joins */}
          {joinToast && <p className="baby-join-toast">{joinToast}</p>}

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
                {/* Share — works natively on iOS (AirDrop etc.) */}
                <button
                  className="show-qr-btn"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: 'Baby Ordio — Verbindungscode',
                        text: `Verbinde dich mit Baby Ordio.\nCode: ${formattedCode}`,
                        url: qrUrl,
                      }).catch(() => {})
                    } else {
                      navigator.clipboard?.writeText(`${formattedCode} — ${qrUrl}`)
                    }
                  }}
                >
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
            <button
              className="connect-collapsed-btn"
              onClick={() => { setPairingExpanded(true); setShowQR(true) }}
            >
              Code anzeigen
            </button>
          )}
        </div>
      </div>

      {/* ── End session confirm dialog ─────────────────────────── */}
      {showEndConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-sheet">
            <p className="confirm-title">Session für alle beenden?</p>
            <p className="confirm-body">Die Übertragung wird für alle Geräte beendet.</p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn--danger" onClick={handleEndConfirm}>
                Ja, beenden
              </button>
              <button className="confirm-btn confirm-btn--cancel" onClick={handleEndCancel}>
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
