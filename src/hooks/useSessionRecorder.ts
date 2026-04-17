import { useRef, useCallback, useState } from 'react'

export interface CryEvent {
  id: string
  startMs: number   // ms since session start
  endMs: number | null
  peakLevel: number  // 0–10
}

export interface MoveEvent {
  id: string
  timeMs: number    // ms since session start
  intensity: number // 0–10
}

export interface SessionData {
  sessionCode: string
  startTime: Date
  endTime: Date | null
  cryEvents: CryEvent[]
  moveEvents: MoveEvent[]
}

export interface SessionStats {
  durationSec: number
  cryCount: number
  cryTotalSec: number
  moveCount: number
  peakCryLevel: number
}

function deriveStats(data: SessionData): SessionStats {
  const now = data.endTime ?? new Date()
  const durationSec = Math.round((now.getTime() - data.startTime.getTime()) / 1000)

  const cryCount = data.cryEvents.length
  const cryTotalSec = Math.round(
    data.cryEvents.reduce((sum, e) => {
      const end = e.endMs ?? (now.getTime() - data.startTime.getTime())
      return sum + Math.max(0, end - e.startMs) / 1000
    }, 0)
  )

  const moveCount = data.moveEvents.length
  const peakCryLevel = data.cryEvents.reduce((max, e) => Math.max(max, e.peakLevel), 0)

  return { durationSec, cryCount, cryTotalSec, moveCount, peakCryLevel }
}

/**
 * Records cry and movement events during a monitoring session.
 * Returns stable callbacks — safe to call from animation loops.
 */
export function useSessionRecorder(sessionCode: string) {
  const startTime = useRef(new Date())
  const [data, setData] = useState<SessionData>({
    sessionCode,
    startTime: startTime.current,
    endTime: null,
    cryEvents: [],
    moveEvents: [],
  })

  const currentCryRef = useRef<CryEvent | null>(null)

  const msSinceStart = useCallback(
    () => Date.now() - startTime.current.getTime(),
    [],
  )

  /** Call when crying starts */
  const onCryStart = useCallback((level: number) => {
    if (currentCryRef.current) return // already tracking
    const evt: CryEvent = {
      id: `cry-${Date.now()}`,
      startMs: msSinceStart(),
      endMs: null,
      peakLevel: level,
    }
    currentCryRef.current = evt
    setData(d => ({ ...d, cryEvents: [...d.cryEvents, evt] }))
  }, [msSinceStart])

  /** Call periodically while crying to update peak level */
  const onCryPeak = useCallback((level: number) => {
    if (!currentCryRef.current) return
    if (level > currentCryRef.current.peakLevel) {
      currentCryRef.current.peakLevel = level
      setData(d => ({
        ...d,
        cryEvents: d.cryEvents.map(e =>
          e.id === currentCryRef.current!.id ? { ...e, peakLevel: level } : e
        ),
      }))
    }
  }, [])

  /** Call when crying stops */
  const onCryEnd = useCallback(() => {
    if (!currentCryRef.current) return
    const endMs = msSinceStart()
    const id = currentCryRef.current.id
    currentCryRef.current = null
    setData(d => ({
      ...d,
      cryEvents: d.cryEvents.map(e => e.id === id ? { ...e, endMs } : e),
    }))
  }, [msSinceStart])

  /** Call on significant movement (debounced in detector) */
  const onMove = useCallback((intensity: number) => {
    const evt: MoveEvent = {
      id: `move-${Date.now()}`,
      timeMs: msSinceStart(),
      intensity,
    }
    setData(d => ({ ...d, moveEvents: [...d.moveEvents, evt] }))
  }, [msSinceStart])

  const finalise = useCallback((): SessionData => {
    const final = { ...data, endTime: new Date() }
    setData(final)
    return final
  }, [data])

  return {
    data,
    stats: deriveStats(data),
    onCryStart,
    onCryPeak,
    onCryEnd,
    onMove,
    finalise,
  }
}
