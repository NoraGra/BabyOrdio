/**
 * useWebRTC — native WebRTC P2P connection hook
 *
 * Baby is the *offerer*; parent is the *answerer*.
 * Signaling runs via /api/signal (Vercel KV polling).
 * Media goes directly browser-to-browser, or through TURN as fallback.
 *
 * ICE strategy: collect ALL candidates locally, send as one atomic batch
 * after gathering is complete (or after 3 s timeout). This avoids the KV
 * race-condition where rapid individual writes overwrite each other.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

// ── ICE server config ─────────────────────────────────────────────────────
const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
    ],
  },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Free public TURN relay — used automatically if direct ICE fails
  // (covers mDNS resolution failures, AP isolation, strict firewalls)
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443',
    ],
    username:   'openrelayproject',
    credential: 'openrelayproject',
  },
]
// Optional custom TURN via env (set VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL)
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
  replaceVideoTrack:  (track: MediaStreamTrack | null) => Promise<void>
  replaceAudioTrack:  (track: MediaStreamTrack) => Promise<void>
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
const LOG = (...args: unknown[]) => console.log('[P2P]', ...args)

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
  console.error(`[P2P] signal POST ${type} FAILED after 3 attempts`)
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

  // Store audio + video sender refs explicitly.
  // When LiveKit stops the original track it calls sender.replaceTrack(null),
  // which sets sender.track = null. At that point the usual
  // getSenders().find(s => s.track?.kind === 'audio') returns undefined and
  // replaceAudioTrack silently does nothing. Storing refs avoids this problem.
  const audioSenderRef = useRef<RTCRtpSender | null>(null)
  const videoSenderRef = useRef<RTCRtpSender | null>(null)

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

  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack | null) => {
    // Use stored ref first (survives sender.track becoming null after replaceTrack(null))
    const sender = videoSenderRef.current
      ?? pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
    if (sender) {
      LOG('replaceVideoTrack → sender found, replacing track', newTrack?.id ?? 'null')
      await sender.replaceTrack(newTrack)
    } else {
      LOG('replaceVideoTrack → NO sender found!')
    }
  }, [])

const replaceAudioTrack = useCallback(async (newTrack: MediaStreamTrack) => {
    // Use stored ref first (survives sender.track becoming null after replaceTrack(null))
    const sender = audioSenderRef.current
      ?? pcRef.current?.getSenders().find(s => s.track?.kind === 'audio')
    if (sender) {
      LOG('replaceAudioTrack → sender found, replacing track', newTrack.id)
      await sender.replaceTrack(newTrack)
    } else {
      LOG('replaceAudioTrack → NO sender found!')
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (role === 'baby' && !localStream) return

    LOG(`starting as ${role}, code=${code}`)

    aliveRef.current          = true
    remoteDescSetRef.current  = false
    pendingCandidates.current = []
    babyIceIdxRef.current     = 0
    parentIceIdxRef.current   = 0

    setRemoteStream(null)   // clear any previous stream
    setStatus('signaling')
    setTransport('unknown')

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // ── Add local tracks (baby only) ─────────────────────────────────
    // Parent (answerer) intentionally adds NO transceivers here.
    // Unified Plan (Chrome + Safari/iOS) creates recvonly transceivers
    // automatically when setRemoteDescription(offer) is called.
    // Adding explicit recvonly transceivers BEFORE the offer breaks
    // Safari/iOS WebKit because the pre-created MIDs don't match the
    // offer's m-lines, causing SDP negotiation failure.
    if (localStream) {
      LOG('adding local tracks:', localStream.getTracks().map(t => t.kind))
      localStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStream)
        // Store refs so replaceAudioTrack/replaceVideoTrack can find them
        // even if sender.track is later set to null by LiveKit
        if (track.kind === 'audio') audioSenderRef.current = sender
        if (track.kind === 'video') videoSenderRef.current = sender
      })
      // Baby (offerer): add a recvonly transceiver so parent can speak back.
      // This creates an m-line in the offer; parent's answerer side sees it as
      // sendonly → parent uses that sender to stream mic audio to baby.
    }

    // ── Receive remote tracks ─────────────────────────────────────────
    // IMPORTANT: We create a NEW MediaStream reference each time ontrack fires.
    // This is required on iOS Safari — mutating an existing MediaStream that is
    // already set as srcObject does NOT trigger the video element to update.
    // A new reference causes React to re-run useEffect([remoteStream]) which
    // re-assigns srcObject and calls play(), reliably waking up the video on iOS.
    const receivedTracks: MediaStreamTrack[] = []

    pc.ontrack = (ev) => {
      LOG('ontrack:', ev.track.kind, 'streams:', ev.streams.length)

      const addTrack = (t: MediaStreamTrack) => {
        if (!receivedTracks.find(x => x.id === t.id)) {
          receivedTracks.push(t)
          LOG('track added:', t.kind, '— total tracks:', receivedTracks.length)
        }
      }

      if (ev.streams.length > 0) {
        ev.streams[0].getTracks().forEach(addTrack)
      } else {
        addTrack(ev.track)
      }

      // New MediaStream reference → triggers React re-render → re-sets srcObject
      setRemoteStream(new MediaStream(receivedTracks))
    }

    // ── ICE state machine ─────────────────────────────────────────────
    pc.oniceconnectionstatechange = () => {
      if (!aliveRef.current) return
      LOG('ICE state:', pc.iceConnectionState)
      switch (pc.iceConnectionState) {
        case 'checking':    setStatus('connecting');   break
        case 'connected':
        case 'completed':
          setStatus('connected')
          pc.getStats().then(stats => {
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && (report as any).state === 'succeeded') {
                const t = (report as any).localCandidateType === 'relay' ? 'relay' : 'direct'
                LOG('transport:', t)
                setTransport(t)
              }
            })
          })
          break
        case 'disconnected': setStatus('reconnecting'); break
        case 'failed':
          LOG('ICE FAILED — no connection established')
          setStatus('failed')
          break
        case 'closed':       if (aliveRef.current) setStatus('closed'); break
      }
    }

    pc.onicegatheringstatechange = () => {
      LOG('ICE gathering state:', pc.iceGatheringState)
    }

    pc.onsignalingstatechange = () => {
      LOG('signaling state:', pc.signalingState)
    }

    // ── Batch ICE sending ─────────────────────────────────────────────
    // Collect all candidates locally, then send as ONE atomic KV write
    // once gathering is done. Prevents race-condition overwrites in KV.
    const gatheredCandidates: RTCIceCandidateInit[] = []
    let gatheringTimer: ReturnType<typeof setTimeout> | null = null

    const sendIceBatch = () => {
      if (gatheredCandidates.length === 0) return
      LOG(`sending ICE batch (${gatheredCandidates.length} candidates) as ${role}`)
      postSignal(code, `${role}-ice`, gatheredCandidates)
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        LOG('gathered ICE candidate:', ev.candidate.type, ev.candidate.address ?? '?')
        gatheredCandidates.push(ev.candidate.toJSON())
        // Safety-valve: send after 3 s of no new candidates (in case null never fires)
        if (gatheringTimer) clearTimeout(gatheringTimer)
        gatheringTimer = setTimeout(sendIceBatch, 3000)
      } else {
        // null = end of gathering
        LOG('ICE gathering complete')
        if (gatheringTimer) clearTimeout(gatheringTimer)
        sendIceBatch()
      }
    }

    // ── Buffer ICE candidates until remote desc is ready ─────────────
    const applyPending = async () => {
      LOG(`applying ${pendingCandidates.current.length} buffered ICE candidates`)
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
      if (role === 'baby' && s.mode === 'livekit' && onModeSwitchRef.current) {
        LOG('parent requested LiveKit switch')
        onModeSwitchRef.current('livekit')
        return
      }

      // Parent: receive offer → create answer
      if (role === 'parent' && s.offer && !remoteDescSetRef.current) {
        LOG('received offer, creating answer')
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(s.offer))
          remoteDescSetRef.current = true
          await applyPending()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          LOG('posting answer')
          await postSignal(code, 'answer', { type: answer.type, sdp: answer.sdp })
        } catch (e) { console.error('[P2P] answer error', e) }
      }

      // Baby: receive answer
      if (role === 'baby' && s.answer && !remoteDescSetRef.current) {
        LOG('received answer')
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(s.answer))
          remoteDescSetRef.current = true
          await applyPending()
        } catch (e) { console.error('[P2P] set remote answer error', e) }
      }

      // Apply new ICE candidates from the other side
      // With batch ICE, all candidates arrive at once (array replaces previous)
      const theirIce: string[] = role === 'baby' ? (s.parentIce ?? []) : (s.babyIce ?? [])
      const myIdx = role === 'baby' ? parentIceIdxRef.current : babyIceIdxRef.current
      const newCandidates = theirIce.slice(myIdx)
      if (newCandidates.length > 0) {
        LOG(`applying ${newCandidates.length} new ICE candidates from other side`)
      }
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
    ;(async () => {
      if (role === 'baby') {
        LOG('resetting KV and creating offer')
        await postSignal(code, 'reset', null)
        if (!aliveRef.current) return
        pc.createOffer()
          .then(async offer => {
            await pc.setLocalDescription(offer)
            LOG('offer created, posting to KV')
            await postSignal(code, 'offer', { type: offer.type, sdp: offer.sdp })
          })
          .catch(e => console.error('[P2P] offer error', e))
      }
      if (!aliveRef.current) return
      LOG('starting poll loop')
      pollRef.current = setInterval(poll, POLL_MS)
      poll()
    })()

    return () => {
      LOG(`cleanup (${role})`)
      aliveRef.current = false
      if (gatheringTimer) clearTimeout(gatheringTimer)
      stopPolling()
      pc.close()
      audioSenderRef.current = null
      videoSenderRef.current = null
      setRemoteStream(null)
    }
  }, [code, role, localStream, enabled, stopPolling])  // eslint-disable-line react-hooks/exhaustive-deps

  return { status, transport, remoteStream, disconnect, replaceVideoTrack, replaceAudioTrack }
}
