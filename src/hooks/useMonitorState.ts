import { ConnectionState } from 'livekit-client'

/**
 * Maps LiveKit's raw connection state + track presence to our 5 product states.
 *
 * waiting      — room joined, no baby device present yet
 * connecting   — establishing connection / negotiating tracks
 * connected    — audio + video flowing normally
 * reconnecting — temporary drop, auto-recovering
 * degraded     — audio only (video paused to preserve connection)
 * critical     — connection permanently lost, manual retry required
 */
export type MonitorState =
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'degraded'
  | 'critical'

export function deriveMonitorState(
  connectionState: ConnectionState,
  hasBaby: boolean,
  hasVideo: boolean,
  hasAudio: boolean,
): MonitorState {
  if (connectionState === ConnectionState.Disconnected) return 'critical'
  if (connectionState === ConnectionState.Reconnecting) return 'reconnecting'
  if (connectionState === ConnectionState.Connecting) return 'connecting'

  // Connected to the room — now check if the baby device is present
  if (!hasBaby) return 'waiting'
  if (hasAudio && hasVideo) return 'connected'
  if (hasAudio && !hasVideo) return 'degraded'

  // Baby is in the room but tracks haven't arrived yet
  return 'connecting'
}
