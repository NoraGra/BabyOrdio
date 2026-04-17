import { useState, useCallback, useEffect, useRef } from 'react'
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
        <p>⚠️ VITE_LIVEKIT_URL is not set.</p>
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

  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true })
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const videoRef = videoTracks.find((t) => isTrackReference(t))
  const audioRef = audioTracks.find((t) => isTrackReference(t))

  const monitorState = deriveMonitorState(connectionState, hasBaby, !!videoRef, !!audioRef)

  // Tap to hide / show controls
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000)
  }, [])

  // Auto-hide controls after 4s when video is live
  useEffect(() => {
    if (monitorState === 'connected') {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000)
    } else {
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [monitorState])

  return (
    <div className="screen parent-screen" onClick={showControls}>
      {/* Audio — invisible, just plays to speakers */}
      {audioRef && isTrackReference(audioRef) && (
        <AudioTrack trackRef={audioRef} />
      )}

      {/* Video area */}
      <div className="video-container">
        {videoRef && isTrackReference(videoRef) ? (
          <VideoTrack trackRef={videoRef} className="remote-video" />
        ) : (
          <AudioOnlyView waiting={!hasBaby} />
        )}
      </div>

      {/* Controls overlay — fades in/out */}
      <div className={`parent-controls ${controlsVisible ? 'controls-visible' : 'controls-hidden'}`}>
        <div className="parent-header">
          <ConnectionBadge state={monitorState} />
          <div className="parent-header-right">
            {(monitorState === 'connected' || monitorState === 'degraded') && (
              <SessionTimer />
            )}
            <button className="end-session-btn" onClick={(e) => { e.stopPropagation(); onBack() }}>
              End
            </button>
          </div>
        </div>
      </div>

      {/* Degraded banner */}
      {monitorState === 'degraded' && (
        <div className="degraded-banner">
          🔊 Audio only — video paused to maintain connection
        </div>
      )}

      {/* Critical overlay */}
      {monitorState === 'critical' && (
        <div className="critical-overlay">
          <p className="critical-title">Connection Lost</p>
          <p className="critical-subtitle">
            The connection to the baby device was interrupted.
          </p>
          <button className="primary-button" onClick={onBack}>Reconnect</button>
        </div>
      )}
    </div>
  )
}
