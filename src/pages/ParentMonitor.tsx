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
import { useToken } from '../hooks/useToken'
import { deriveMonitorState } from '../hooks/useMonitorState'
import ConnectionBadge from '../components/ConnectionBadge'
import SessionTimer from '../components/SessionTimer'
import AudioOnlyView from '../components/AudioOnlyView'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string

interface Props {
  code: string
  onBack: () => void
}

export default function ParentMonitor({ code, onBack }: Props) {
  const tokenState = useToken(code, 'parent')

  if (!LIVEKIT_URL) {
    return (
      <div className="screen error-screen">
        <p>⚠️ VITE_LIVEKIT_URL is not set. Check your .env file.</p>
        <button className="back-button" onClick={onBack}>← Back</button>
      </div>
    )
  }

  if (tokenState.status === 'loading') {
    return <div className="screen loading-screen"><div className="spinner" /><p>Connecting…</p></div>
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
      audio={false}
      video={false}
      onDisconnected={onBack}
    >
      <ParentRoom onBack={onBack} />
    </LiveKitRoom>
  )
}

function ParentRoom({ onBack }: { onBack: () => void }) {
  const connectionState = useConnectionState()
  const remoteParticipants = useRemoteParticipants()
  const hasBaby = remoteParticipants.length > 0

  // Subscribe to all remote tracks
  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true })
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })

  const videoRef = videoTracks.find((t) => isTrackReference(t))
  const audioRef = audioTracks.find((t) => isTrackReference(t))

  const hasVideo = !!videoRef
  const hasAudio = !!audioRef

  const monitorState = deriveMonitorState(connectionState, hasBaby, hasVideo, hasAudio)

  return (
    <div className="screen parent-screen">
      {/* Invisible audio element — renders audio to speakers */}
      {audioRef && isTrackReference(audioRef) && (
        <AudioTrack trackRef={audioRef} />
      )}

      {/* Header bar */}
      <div className="parent-header">
        <ConnectionBadge state={monitorState} />
        <div className="parent-header-right">
          {monitorState === 'connected' || monitorState === 'degraded' ? (
            <SessionTimer />
          ) : null}
          <button className="end-session-btn" onClick={onBack}>End</button>
        </div>
      </div>

      {/* Video area */}
      <div className="video-container">
        {videoRef && isTrackReference(videoRef) ? (
          <VideoTrack trackRef={videoRef} className="remote-video" />
        ) : (
          <AudioOnlyView waiting={!hasBaby} />
        )}
      </div>

      {/* Critical state overlay */}
      {monitorState === 'critical' && (
        <div className="critical-overlay">
          <p className="critical-title">Connection Lost</p>
          <p className="critical-subtitle">
            The connection to the baby device was interrupted.
          </p>
          <button className="primary-button" onClick={onBack}>
            Reconnect
          </button>
        </div>
      )}
    </div>
  )
}
