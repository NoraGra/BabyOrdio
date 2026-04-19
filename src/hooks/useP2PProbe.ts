/**
 * useP2PProbe — silent background WebRTC connectivity test
 *
 * Runs a data-channel-only RTCPeerConnection to check whether P2P is
 * possible on the current network — without touching the camera/mic.
 * Baby creates the offer; parent creates the answer.
 * Uses a separate KV key (code + "pr") so it never interferes with the
 * main session signal state.
 *
 * Returns:
 *   'checking'    — ICE negotiation in progress (up to 15 s)
 *   'available'   — P2P connected ✓ safe to offer upgrade
 *   'unavailable' — P2P failed or timed out (stay on LiveKit)
 */
import { useState, useEffect } from 'react'

export type P2PProbeStatus = 'checking' | 'available' | 'unavailable'

const PROBE_POLL_MS   = 800
const PROBE_TIMEOUT   = 15_000
const ICE_SERVERS     = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

// Probe uses a derived KV key so it never collides with the real session
const probeCode = (code: string) => `${code}pr`   // e.g. "ab3x7k2mpr" (10 chars)

async function probePost(code: string, type: string, data: unknown) {
  try {
    await fetch('/api/signal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code: probeCode(code), type, data }),
    })
  } catch { /* ignore */ }
}

async function probeGet(code: string) {
  try {
    const r = await fetch(`/api/signal?code=${probeCode(code)}`, { cache: 'no-store' })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

export function useP2PProbe(code: string, role: 'baby' | 'parent'): P2PProbeStatus {
  const [status, setStatus] = useState<P2PProbeStatus>('checking')

  useEffect(() => {
    let alive           = true
    let pollId:    ReturnType<typeof setInterval>  | null = null
    let timeoutId: ReturnType<typeof setTimeout>   | null = null
    const remoteDescSet       = { v: false }
    const pendingCandidates:  RTCIceCandidateInit[] = []
    const theirIceIdx         = { v: 0 }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    // Baby opens a data channel — without it Chrome won't gather ICE candidates
    if (role === 'baby') pc.createDataChannel('probe')

    const cleanup = () => {
      alive = false
      if (pollId)    clearInterval(pollId)
      if (timeoutId) clearTimeout(timeoutId)
      try { pc.close() } catch { /* ignore */ }
    }

    pc.oniceconnectionstatechange = () => {
      if (!alive) return
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setStatus('available')
        cleanup()
      } else if (pc.iceConnectionState === 'failed') {
        setStatus('unavailable')
        cleanup()
      }
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && alive) probePost(code, `${role}-ice`, ev.candidate.toJSON())
    }

    const applyPending = async () => {
      const items = pendingCandidates.splice(0)
      for (const c of items) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
      }
    }

    const poll = async () => {
      if (!alive) return
      const s = await probeGet(code)
      if (!s || !alive) return

      if (role === 'parent' && s.offer && !remoteDescSet.v) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(s.offer))
          remoteDescSet.v = true
          await applyPending()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await probePost(code, 'answer', { type: answer.type, sdp: answer.sdp })
        } catch { /* ignore */ }
      }

      if (role === 'baby' && s.answer && !remoteDescSet.v) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(s.answer))
          remoteDescSet.v = true
          await applyPending()
        } catch { /* ignore */ }
      }

      const theirIce: string[] = role === 'baby' ? (s.parentIce ?? []) : (s.babyIce ?? [])
      const newItems = theirIce.slice(theirIceIdx.v)
      theirIceIdx.v  = theirIce.length
      for (const raw of newItems) {
        const c = JSON.parse(raw)
        if (remoteDescSet.v) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
        } else {
          pendingCandidates.push(c)
        }
      }
    }

    // Timeout — give up after PROBE_TIMEOUT ms
    timeoutId = setTimeout(() => {
      if (alive) { setStatus('unavailable'); cleanup() }
    }, PROBE_TIMEOUT)

    ;(async () => {
      if (role === 'baby') {
        await probePost(code, 'reset', null)
        if (!alive) return
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await probePost(code, 'offer', { type: offer.type, sdp: offer.sdp })
        } catch { cleanup(); return }
      }
      if (!alive) return
      pollId = setInterval(poll, PROBE_POLL_MS)
      poll()
    })()

    return cleanup
  }, [code, role])

  return status
}
