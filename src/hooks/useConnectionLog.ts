import { useEffect, useRef, useState } from 'react'
import type { MonitorState } from './useMonitorState'
import type { AudioStats } from './useAudioAnalyzer'

export interface AudioSummary {
  peak: number
  peakTime: Date | null
  average: number
  activityCount: number
}

export interface MissedSummary {
  /** Human-readable headline, e.g. "Verbindung unterbrochen seit 14:32 — Dauer: 2 Min." */
  message: string
  durationSec: number
  /** Audio stats captured at the moment the disruption ended (may be sparse if fully disconnected) */
  audioStats: AudioSummary
}

/**
 * Tracks connection disruptions and produces a summary when the connection
 * is restored. Audio stats at restoration time are included in the summary.
 *
 * Returns:
 *  - summary: shown to the parent when they reconnect
 *  - clearSummary: dismiss the banner
 */
export function useConnectionLog(
  monitorState: MonitorState,
  audioStats: AudioStats,
) {
  const [summary, setSummary] = useState<MissedSummary | null>(null)
  const disruptionStartRef = useRef<Date | null>(null)
  const prevStateRef = useRef<MonitorState>(monitorState)

  // Always up-to-date ref so the effect (which only depends on monitorState)
  // can read the latest audio stats without stale closures
  const audioStatsRef = useRef<AudioStats>(audioStats)
  audioStatsRef.current = audioStats

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = monitorState

    const isDisrupted = (s: MonitorState) =>
      s === 'critical' || s === 'reconnecting' || s === 'degraded'

    // Disruption started
    if (!isDisrupted(prev) && isDisrupted(monitorState)) {
      disruptionStartRef.current = new Date()
    }

    // Disruption ended — back to connected or waiting
    if (isDisrupted(prev) && !isDisrupted(monitorState) && disruptionStartRef.current) {
      const start = disruptionStartRef.current
      const durationSec = Math.round((Date.now() - start.getTime()) / 1000)
      disruptionStartRef.current = null

      if (durationSec < 3) return // ignore blinks under 3 s

      const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const durStr =
        durationSec < 60
          ? `${durationSec} Sek.`
          : `${Math.floor(durationSec / 60)} Min. ${durationSec % 60} Sek.`

      const type = prev === 'degraded' ? 'Nur Audio' : 'Verbindung unterbrochen'

      const as = audioStatsRef.current
      setSummary({
        message: `${type} seit ${startTime} — Dauer: ${durStr}`,
        durationSec,
        audioStats: {
          peak:          as.peak,
          peakTime:      as.peakTime,
          average:       as.average,
          activityCount: as.activityCount,
        },
      })
    }
  }, [monitorState])

  return {
    summary,
    clearSummary: () => setSummary(null),
  }
}
