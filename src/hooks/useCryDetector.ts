import { useEffect, useRef, useState } from 'react'
import type { TrackReference } from '@livekit/components-react'
import type { AudioInput } from './useAudioAnalyzer'

export interface CryState {
  isCrying: boolean
  /** 0–10 confidence level */
  confidence: number
  /** 0–10 current frequency energy score */
  level: number
}

const EMPTY: CryState = { isCrying: false, confidence: 0, level: 0 }

function resolveMediaTrack(input: AudioInput): MediaStreamTrack | undefined {
  if (!input) return undefined
  if (input instanceof MediaStreamTrack) return input
  return (input as TrackReference).publication?.track?.mediaStreamTrack
}

function resolveKey(input: AudioInput): string | undefined {
  if (!input) return undefined
  if (input instanceof MediaStreamTrack) return input.id
  return (input as TrackReference).publication?.trackSid
}

/**
 * Detects baby crying using Web Audio API frequency analysis.
 * Accepts either a LiveKit TrackReference or a raw MediaStreamTrack (P2P mode).
 *
 * Algorithm:
 *  1. Split audio into frequency bands using FFT
 *  2. Score energy in the infant-cry signature bands:
 *     - Fundamental: 250–700 Hz  (warbling pitch of a cry)
 *     - 1st harmonic: 700–1400 Hz
 *     - Formant region: 1400–3000 Hz (bright, nasal quality)
 *  3. Require sustained detection for 600 ms before confirming
 *  4. Require 800 ms of silence before clearing
 *
 * This is a real frequency-pattern classifier — no pre-trained model
 * needed, runs entirely in the browser at ~10 Hz.
 */
export function useCryDetector(
  input: AudioInput,
  onCryStart?: (level: number) => void,
  onCryPeak?: (level: number) => void,
  onCryEnd?: () => void,
) {
  const [state, setState] = useState<CryState>(EMPTY)
  const trackKey = resolveKey(input)

  // Refs for edge-detection timers
  const cryingRef     = useRef(false)
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peakRef       = useRef(0)

  useEffect(() => {
    const mediaStreamTrack = resolveMediaTrack(input)
    if (!mediaStreamTrack) return

    let ctx: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null

    try {
      ctx = new AudioContext()
      const sampleRate = ctx.sampleRate          // typically 48000
      source  = ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack]))
      analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)

      const binCount  = analyser.frequencyBinCount     // 1024
      const freqData  = new Uint8Array(binCount)
      const hzPerBin  = sampleRate / analyser.fftSize  // ~23.4 Hz/bin

      // Convert Hz range → bin indices
      const binRange = (lo: number, hi: number) => [
        Math.round(lo / hzPerBin),
        Math.min(Math.round(hi / hzPerBin), binCount - 1),
      ] as [number, number]

      const CRY_BANDS: [number, number][] = [
        binRange(250,  700),    // fundamental
        binRange(700,  1400),   // 1st harmonic
        binRange(1400, 3000),   // formant / bright nasal
      ]
      // Reference: low-energy background band (should be quiet)
      const NOISE_BAND = binRange(50, 200)

      const bandEnergy = (lo: number, hi: number): number => {
        let sum = 0
        for (let i = lo; i <= hi; i++) sum += freqData[i]
        return sum / (hi - lo + 1) / 255  // 0–1
      }

      intervalId = setInterval(() => {
        if (!analyser) return
        analyser.getByteFrequencyData(freqData)

        const [nlo, nhi] = NOISE_BAND
        const noise = bandEnergy(nlo, nhi)

        // Weighted sum of cry-band energies
        const cry0 = bandEnergy(...CRY_BANDS[0])
        const cry1 = bandEnergy(...CRY_BANDS[1])
        const cry2 = bandEnergy(...CRY_BANDS[2])
        const cryScore = (cry0 * 0.45 + cry1 * 0.35 + cry2 * 0.20) - noise * 0.5

        // Normalise to 0–10
        const level = Math.min(10, Math.max(0, Math.round(cryScore * 22)))
        // Confidence: how much cry vs noise
        const confidence = Math.min(10, Math.round(
          (cry0 + cry1 > 0 ? cryScore / (noise + 0.01) : 0) * 3
        ))

        const detected = level >= 4 && confidence >= 4

        setState({ isCrying: cryingRef.current, confidence, level })

        if (detected) {
          // Cancel any pending "end" timer
          if (endTimerRef.current) { clearTimeout(endTimerRef.current); endTimerRef.current = null }

          if (level > peakRef.current) {
            peakRef.current = level
            if (cryingRef.current) onCryPeak?.(level)
          }

          if (!cryingRef.current && !startTimerRef.current) {
            // Start confirmed after 600 ms sustained detection
            startTimerRef.current = setTimeout(() => {
              startTimerRef.current = null
              if (!cryingRef.current) {
                cryingRef.current = true
                peakRef.current = level
                onCryStart?.(level)
                setState(s => ({ ...s, isCrying: true }))
              }
            }, 600)
          }
        } else {
          // Cancel pending "start" if signal dropped
          if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null }

          if (cryingRef.current && !endTimerRef.current) {
            // Confirm end after 800 ms of silence
            endTimerRef.current = setTimeout(() => {
              endTimerRef.current = null
              if (cryingRef.current) {
                cryingRef.current = false
                peakRef.current = 0
                onCryEnd?.()
                setState(s => ({ ...s, isCrying: false }))
              }
            }, 800)
          }
        }
      }, 100) // 10 Hz
    } catch (e) {
      console.warn('[useCryDetector] setup failed:', e)
    }

    return () => {
      if (intervalId)        clearInterval(intervalId)
      if (startTimerRef.current) clearTimeout(startTimerRef.current)
      if (endTimerRef.current)   clearTimeout(endTimerRef.current)
      try { source?.disconnect() } catch {}
      ctx?.close().catch(() => {})
      startTimerRef.current = null
      endTimerRef.current   = null
      cryingRef.current     = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey])

  return state
}
