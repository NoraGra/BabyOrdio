/**
 * useWebRTC — native WebRTC P2P connection hook
 *
 * Baby is the *offerer*; parent is the *answerer*.
 * Signaling runs via /api/signal (Vercel KV polling).
 * Media goes directly browser-to-browser, or through TURN as fallback.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

// ── ICE server config ─────────────────────────────────────────────────────
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]
// Optional TURN via env (set VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL)
const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined
if (turnUrl) {
  ICE_SERVERS.push({
    urls: turnUrl,
    username: import.meta.env.VITE_TURN_USERNAME as string ?? '',
    credential: import.meta.env.VITE_TURN_CREDENTIAL as string ?? '',
  })
}

// ── Types ─────────────────────────────────────────────────────────────────
export type WebRTCStatus =
  | 'idle'
  | 'signaling'    // waiting for offer/answer exchange
  | 'connecting'   // ICE negotiation in progress
  | 'connected'    // stream is live
  | 'reconnecting' // briefly disconnected, trying to recover
  | 'failed'
  | 'closed'

export type WebRTCTransport = 'direct' | 'relay' | 'unknown'

export interface WebRTCResult {
  status:             WebRTCStatus
  transport:          WebRTCTransport
  remoteStream:       MediaStream | null
  disconnect:         () => void
  replaceVideoTrack:  (track: MediaStreamTrack) => Promise<void>
}

interface Options {
  code:          string
  role:          'baby' | 'parent'
  localStream:   MediaStream | null
  enabled?:      boolean
  onModeSwitch?: (mode: 'livekit') => void  // baby: called when parent requests LiveKit
}

// ── Signal helpers ────────────────────────────────────────────────────────
const POLL_MS = 600

export async function postSignal(code: string, type: string, data: unknown) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch('/api/signal', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code, type, data }),
      })
      if (r.ok) return
      console.warn(`[P2P] signal POST ${type} HTTP ${r.status}`)
    } catch (e) {
      console.warn(`[P2P] signal POST ${type} attempt ${attempt + 1} failed`, e)
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
  }
}

async function getSignal(code: string) {
  try {
    const r = await fetch(`/api/signal?code=${code}`)
    if (!r.ok) return null
    return r.json()
  } catch {
    return null
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useWebRTC({ code, role, localStream, enabled = true, onModeSwitch }: Options): WebRTCResult {
  const [status,       setStatus]       = useState<WebRTCStatus>('idle')
  const [transport,    setTransport]    = useState<WebRTCTransport>('unknown')
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const pcRef               = useRef<RTCPeerConnection | null>(null)
  const pollRef             = useRef<ReturnType<typeof setInterval> | null>(null)
  const aliveRef            = useRef(false)
  const remoteDescSetRef    = useRef(false)
  const pendingCandidates   = useRef<RTCIceCandidateInit[]>([])
  const babyIceIdxRef       = useRef(0)
  const parentIceIdxRef     = useRef(0)
  // Store callback in ref so changing it never re-triggers the main effect
  const onModeSwitchRef     = useRef(onModeSwitch)
  useEffect(() => { onModeSwitchRef.current = onModeSwitch }, [onModeSwitch])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const disconnect = useCallback(() => {
    aliveRef.current = false
    stopPolling()
    pcRef.current?.close()
    pcRef.current = null
    setStatus('closed')
    setRemoteStream(null)
  }, [stopPolling])

  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack) => {
    const pc = pcRef.current
    if (!pc) return
    const sender = pc.getSenders().find(s => s.track?.kind === 'video')
    if (sender) await sender.replaceTrack(newTrack)
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (role === 'baby' && !localStream) return

    aliveRef.current          = true
    remoteDescSetRef.current  = false
    pendingCandidates.current = []
    babyIceIdxRef.current     = 0
    parentIceIdxRef.current   = 0

    const stream = new MediaStream()
    setRemoteStream(stream)
    setStatus('signaling')
    setTransport('unknown')

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // ── Add local tracks (baby) / recv-only transceivers (parent) ────
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
    } else if (role === 'parent') {
      // Explicit recvonly transceivers help Chrome negotiate correctly
      // when the answerer (parent) has no local tracks to send.
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })
    }

    // ── Receive remote tracks ─────────────────────────────────────────
    // NOTE: ev.streams[0] can be undefined in Unified Plan (modern Chrome/Firefox).
    // Always add ev.track directly as the reliable fallback path.
    pc.ontrack = (ev) => {
      const addIfMissing = (t: MediaStreamTrack) => {
        if (!stream.getTracks().includes(t)) stream.addTrack(t)
      }
      if (ev.streams.length > 0) {
        ev.streams[0].getTracks().forEach(addIfMissing)
      } else {
        addIfMissing(ev.track)
      }
    }

    // ── ICE state machine ─────────────────────────────────────────────
    pc.oniceconnectionstatechange = () => {
      if (!aliveRef.current) return
      switch (pc.iceConnectionState) {
        case 'checking':    setStatus('connecting');   break
        case 'connected':
        case 'completed':
          setStatus('connected')
          pc.getStats().then(stats => {
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && (report as any).state === 'succeeded') {
                setTransport((report as any).localCandidateType === 'relay' ? 'relay' : 'direct')
              }
            })
          })
          break
        case 'disconnected': setStatus('reconnecting'); break
        case 'failed':       setStatus('failed');       break
        case 'closed':       if (aliveRef.current) setStatus('closed'); break
      }
    }

    // ── Send our ICE candidates via signal ───────────────────────────
    pc.onicecandidate = (ev) => {
      if (ev.candidate) postSignal(code, `${role}-ice`, ev.candidate.toJSON())
    }

    // ── Buffer ICE candidates until remote desc is ready ─────────────
    const applyPending = async () => {
      for (const c of pendingCandidates.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
      }
      pendingCandidates.current = []
    }

    // ── Poll KV for signaling messages ───────────────────────────────
    const poll = async () => {
      if (!aliveRef.current) return
      const s = await getSignal(code)
      if (!s || !aliveRef.current) return

      // Baby: detect mode switch requested by parent.
      // Safe because baby awaits reset before polling starts,
      // so 'livekit' can only come from the current parent session.
      if (role === 'baby' && s.mode === 'livekit' && onModeSwitchRef.current) {
        onModeSwitchRef.current('livekit')
        return
      }

      // Parent: receive offer → create answer
      if (role === 'parent' && s.offer && !remoteDescSetRef.current) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(s.offer))
          remoteDescSetRef.current = true
          await applyPending()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await postSignal(code, 'answer', { type: answer.type, sdp: answer.sdp })
        } catch (e) { console.error('[P2P] answer error', e) }
      }

      // Baby: receive answer
      if (role === 'baby' && s.answer && !remoteDescSetRef.current) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(s.answer))
          remoteDescSetRef.current = true
          await applyPending()
        } catch (e) { console.error('[P2P] set remote answer error', e) }
      }

      // Apply new ICE candidates from the other side
      const theirIce: string[] = role === 'baby' ? (s.parentIce ?? []) : (s.babyIce ?? [])
      const myIdx = role === 'baby' ? parentIceIdxRef.current : babyIceIdxRef.current
      const newCandidates = theirIce.slice(myIdx)
      for (const raw of newCandidates) {
        const c: RTCIceCandidateInit = JSON.parse(raw)
        if (remoteDescSetRef.current) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
        } else {
          pendingCandidates.current.push(c)
        }
      }
      if (role === 'baby') parentIceIdxRef.current = theirIce.length
      else                 babyIceIdxRef.current   = theirIce.length
    }

    // ── Start: reset KV (baby), then create offer + begin polling ────
    // Awaiting reset ensures stale mode='livekit' from last session is
    // cleared before first poll fires — prevents false mode-switch trigger.
    ;(async () => {
      if (role === 'baby') {
        await postSignal(code, 'reset', null)
        if (!aliveRef.current) return  // unmounted during reset
        pc.createOffer()
          .then(async offer => {
            await pc.setLocalDescription(offer)
            await postSignal(code, 'offer', { type: offer.type, sdp: offer.sdp })
          })
          .catch(e => console.error('[P2P] offer error', e))
      }
      if (!aliveRef.current) return
      pollRef.current = setInterval(poll, POLL_MS)
      poll()
    })()

    return () => {
      aliveRef.current = false
      stopPolling()
      pc.close()
    }
  }, [code, role, localStream, enabled, stopPolling])

  return { status, transport, remoteStream, disconnect, replaceVideoTrack }
}
