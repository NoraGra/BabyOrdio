import { useEffect, useState, useCallback } from 'react'
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  VideoTrack,
  isTrackReference,
} from '@livekit/components-react'
import { ConnectionQuality, RoomEvent, Track, Room } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { QRCodeSVG } from 'qrcode.react'
import { useToken } from '../hooks/useToken'
import { useWakeLock } from '../hooks/useWakeLock'
import ConnectionBadge from '../components/ConnectionBadge'
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
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const connectionState = useConnectionState()
  const [showQR, setShowQR] = useState(false)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  useWakeLock()

  const qrUrl = `${window.location.origin}/?code=${code}`

  // Audio priority: disable video when upload quality drops
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

  // Flip between front and back camera
  const flipCamera = useCallback(async () => {
    if (isSwitchingCamera) return
    setIsSwitchingCamera(true)
    try {
      const devices = await Room.getLocalDevices('videoinput')
      if (devices.length < 2) return
      const currentPub = localParticipant.getTrackPublication(Track.Source.Camera)
      const currentId = (currentPub?.track as MediaStreamTrack | undefined)
        ?.getSettings().deviceId
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

  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false })
  const localVideo = tracks.find((t) => isTrackReference(t) && t.participant.isLocal)
  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`

  return (
    <div className="screen baby-screen">
      {localVideo && isTrackReference(localVideo) && (
        <VideoTrack trackRef={localVideo} className="baby-preview" />
      )}

      <div className="baby-overlay">
        {/* Top bar */}
        <div className="baby-top">
          <ConnectionBadge state={badgeState} />
          <div className="baby-top-actions">
            <button
              className="icon-btn"
              onClick={flipCamera}
              disabled={isSwitchingCamera}
              title="Flip camera"
            >
              🔄
            </button>
            <button className="end-session-btn" onClick={onBack}>End</button>
          </div>
        </div>

        {/* Bottom: code + QR toggle */}
        <div className="baby-bottom">
          {showQR ? (
            <div className="qr-container" onClick={() => setShowQR(false)}>
              <QRCodeSVG
                value={qrUrl}
                size={180}
                bgColor="rgba(0,0,0,0.85)"
                fgColor="#ffffff"
                level="M"
              />
              <p className="qr-hint">Tap to close</p>
            </div>
          ) : (
            <>
              <p className="code-label">Pairing Code</p>
              <p className="code-value" onClick={() => setShowQR(true)}>
                {formattedCode}
              </p>
              <p className="code-tap-hint">Tap code to show QR</p>
              <p className="wake-notice">⚠️ Keep this screen on</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
