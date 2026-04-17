import { useEffect } from 'react'
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useTracks,
  VideoTrack,
  isTrackReference,
} from '@livekit/components-react'
import { ConnectionQuality, RoomEvent, Track } from 'livekit-client'
import type { Participant } from 'livekit-client'
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
        <p>⚠️ VITE_LIVEKIT_URL is not set. Check your .env file.</p>
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

// Inner component — must be inside LiveKitRoom to use hooks
function BabyRoom({ code, onBack }: { code: string; onBack: () => void }) {
  const { localParticipant } = useLocalParticipant()
  const connectionState = useConnectionState()
  useWakeLock()

  // --- Audio priority: disable video on poor quality ---
  useEffect(() => {
    if (!localParticipant) return

    const handleQualityChange = (participant: Participant, quality: ConnectionQuality) => {
      if (participant !== localParticipant) return
      if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
        localParticipant.setCameraEnabled(false).catch(console.error)
      } else if (quality === ConnectionQuality.Good || quality === ConnectionQuality.Excellent) {
        localParticipant.setCameraEnabled(true).catch(console.error)
      }
    }

    localParticipant.on(RoomEvent.ConnectionQualityChanged as unknown as string, handleQualityChange)
    return () => {
      localParticipant.off(RoomEvent.ConnectionQualityChanged as unknown as string, handleQualityChange)
    }
  }, [localParticipant])

  // Map connection state to a badge state (baby device perspective)
  const badgeState: MonitorState =
    connectionState === 'reconnecting' ? 'reconnecting'
    : connectionState === 'disconnected' ? 'critical'
    : connectionState === 'connected' ? 'connected'
    : 'connecting'

  // Local camera preview
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false })
  const localVideo = tracks.find((t) => isTrackReference(t) && t.participant.isLocal)

  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`

  return (
    <div className="screen baby-screen">
      {/* Camera preview — dimmed and in background */}
      {localVideo && isTrackReference(localVideo) && (
        <VideoTrack trackRef={localVideo} className="baby-preview" />
      )}

      {/* Overlay */}
      <div className="baby-overlay">
        <div className="baby-top">
          <ConnectionBadge state={badgeState} />
          <button className="end-session-btn" onClick={onBack}>End</button>
        </div>

        <div className="baby-bottom">
          <p className="code-label">Pairing Code</p>
          <p className="code-value">{formattedCode}</p>
          <p className="wake-notice">⚠️ Keep this screen on</p>
        </div>
      </div>
    </div>
  )
}
