import { useEffect, useRef, useCallback, useState } from 'react'
import type { TrackReference } from '@livekit/components-react'

export interface AudioStats {
  /** Current RMS level, 0–10 */
  level: number
  /** Highest level seen since last reset, 0–10 */
  peak: number
  /** When the peak occurred */
  peakTime: Date | null
  /** Rolling average level, 0–10 */
  average: number
  /** How many distinct loud events were detected (rising edges above threshold) */
  activityCount: number
}

const EMPTY_STATS: AudioStats = {
  level: 0,
  peak: 0,
  peakTime: null,
  average: 0,
  activityCount: 0,
}

/** Minimum level counted as "activity" */
const ACTIVITY_ON  = 6
/** Hysteresis: level must fall below this before next activity is counted */
const ACTIVITY_OFF = 4

/**
 * Analyzes the audio level of an incoming audio TrackReference.
 * Uses the Web Audio API AnalyserNode — does not affect existing playback.
 * Polls at ~10 Hz.
 */
export function useAudioAnalyzer(trackRef: TrackReference | undefined) {
  const [stats, setStats] = useState<AudioStats>(EMPTY_STATS)

  // Accumulation lives in a ref to avoid triggering re-renders on every frame
  const acc = useRef({
    sum: 0,
    count: 0,
    peak: 0,
    peakTime: null as Date | null,
    actCount: 0,
    wasActive: false,
  })

  const resetStats = useCallback(() => {
    acc.current = { sum: 0, count: 0, peak: 0, peakTime: null, actCount: 0, wasActive: false }
    setStats(EMPTY_STATS)
  }, [])

  // Track SID as dep so effect re-runs when the track is replaced
  const trackSid = trackRef?.publication?.trackSid

  useEffect(() => {
    const mediaStreamTrack = trackRef?.publication?.track?.mediaStreamTrack
    if (!mediaStreamTrack) return

    let ctx: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null

    try {
      ctx = new AudioContext()
      // Create a fresh MediaStream from the track so we don't disturb LiveKit's playback
      source = ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack]))
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const a = acc.current

      intervalId = setInterval(() => {
        if (!analyser) return
        analyser.getByteTimeDomainData(dataArray)

        // RMS over one frame
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const n = (dataArray[i] - 128) / 128
          sum += n * n
        }
        const rms = Math.sqrt(sum / dataArray.length)
        // Map typical speech range (0–0.4 RMS) to 0–10
        const level = Math.min(10, Math.round(rms * 28))

        a.sum += level
        a.count += 1

        if (level > a.peak) {
          a.peak = level
          a.peakTime = new Date()
        }

        // Rising-edge activity detection
        if (level >= ACTIVITY_ON && !a.wasActive) {
          a.actCount += 1
          a.wasActive = true
        } else if (level < ACTIVITY_OFF) {
          a.wasActive = false
        }

        setStats({
          level,
          peak: a.peak,
          peakTime: a.peakTime,
          average: a.count > 0 ? Math.round(a.sum / a.count) : 0,
          activityCount: a.actCount,
        })
      }, 100) // 10 Hz
    } catch (e) {
      console.warn('[useAudioAnalyzer] setup failed:', e)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
      try { source?.disconnect() } catch {}
      ctx?.close().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSid])

  return { stats, resetStats }
}
