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
  status:       WebRTCStatus
  transport:    WebRTCTransport
  remoteStream: MediaStream | null
  disconnect:   () => void
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
  try {
    await fetch('/api/signal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, type, data }),
    })
  } catch (e) {
    console.warn('[P2P] signal POST failed', e)
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

  useEffect(() => {
    if (!enabled) return
    // Baby must have a local stream before connecting
    if (role === 'baby' && !localStream) return

    aliveRef.current       = true
    remoteDescSetRef.current = false
    pendingCandidates.current = []
    babyIceIdxRef.current  = 0
    parentIceIdxRef.current = 0

    // Only baby resets — parent must NOT clear the offer baby already wrote
    if (role === 'baby') postSignal(code, 'reset', null)

    const stream = new MediaStream()
    setRemoteStream(stream)
    setStatus('signaling')
    setTransport('unknown')

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // ── Add local tracks ──────────────────────────────────────────────
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
    }

    // ── Receive remote tracks ─────────────────────────────────────────
    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach(t => {
        if (!stream.getTracks().includes(t)) stream.addTrack(t)
      })
    }

    // ── ICE state machine ─────────────────────────────────────────────
    pc.oniceconnectionstatechange = () => {
      if (!aliveRef.current) return
      switch (pc.iceConnectionState) {
        case 'checking':
          setStatus('connecting')
          break
        case 'connected':
        case 'completed':
          setStatus('connected')
          // Detect relay vs direct
          pc.getStats().then(stats => {
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && (report as any).state === 'succeeded') {
                const t = (report as any).localCandidateType as string
                setTransport(t === 'relay' ? 'relay' : 'direct')
              }
            })
          })
          break
        case 'disconnected':
          setStatus('reconnecting')
          break
        case 'failed':
          setStatus('failed')
          break
        case 'closed':
          if (aliveRef.current) setStatus('closed')
          break
      }
    }

    // ── Send our ICE candidates to signal ────────────────────────────
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      postSignal(code, `${role}-ice`, ev.candidate.toJSON())
    }

    // ── Apply buffered ICE candidates once remote desc is set ────────
    const applyPending = async () => {
      for (const c of pendingCandidates.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
      }
      pendingCandidates.current = []
    }

    // ── Baby creates offer immediately ───────────────────────────────
    if (role === 'baby') {
      pc.createOffer()
        .then(async offer => {
          await pc.setLocalDescription(offer)
          await postSignal(code, 'offer', { type: offer.type, sdp: offer.sdp })
        })
        .catch(e => console.error('[P2P] offer error', e))
    }

    // ── Polling loop ─────────────────────────────────────────────────
    const poll = async () => {
      if (!aliveRef.current) return
      const s = await getSignal(code)
      if (!s || !aliveRef.current) return

      // Parent: receive offer, create answer
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

      // Baby: detect mode switch requested by parent
      // Only react AFTER remote description is set — prevents false trigger
      // from stale 'livekit' mode left in KV by a previous session
      if (role === 'baby' && s.mode === 'livekit' && remoteDescSetRef.current && onModeSwitch) {
        onModeSwitch('livekit')
        return   // stop further P2P processing
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
      const theirIce: string[] = role === 'baby'
        ? (s.parentIce ?? [])
        : (s.babyIce ?? [])
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

    pollRef.current = setInterval(poll, POLL_MS)
    poll() // first poll immediately

    return () => {
      aliveRef.current = false
      stopPolling()
      pc.close()
    }
  }, [code, role, localStream, enabled, onModeSwitch, stopPolling])

  return { status, transport, remoteStream, disconnect }
}
