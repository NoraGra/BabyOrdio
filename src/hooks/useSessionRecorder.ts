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

export interface ConnectionEvent {
  id: string
  startMs: number
  endMs: number | null
  type: 'reconnecting' | 'disconnected'
}

export interface SessionData {
  sessionCode: string
  startTime: Date
  endTime: Date | null
  cryEvents: CryEvent[]
  moveEvents: MoveEvent[]
  connectionEvents: ConnectionEvent[]
}

export interface SessionStats {
  durationSec: number
  cryCount: number
  cryTotalSec: number
  moveCount: number
  peakCryLevel: number
  quietPct: number              // 0–100: % of session without crying
  sleepQuality: 'deep' | 'light' | 'restless'
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

  const moveCount    = data.moveEvents.length
  const peakCryLevel = data.cryEvents.reduce((max, e) => Math.max(max, e.peakLevel), 0)
  const quietPct     = durationSec > 0 ? Math.round((1 - cryTotalSec / durationSec) * 100) : 100

  // Sleep quality based on movement rate (per minute)
  const movePerMin = durationSec > 0 ? moveCount / (durationSec / 60) : 0
  const sleepQuality: SessionStats['sleepQuality'] =
    movePerMin < 1   ? 'deep'
    : movePerMin < 3 ? 'light'
    : 'restless'

  return { durationSec, cryCount, cryTotalSec, moveCount, peakCryLevel, quietPct, sleepQuality }
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
    connectionEvents: [],
  })

  const currentCryRef        = useRef<CryEvent | null>(null)
  const currentConnRef       = useRef<ConnectionEvent | null>(null)

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

  /** Call when connection state becomes degraded or worse */
  const onConnectionLost = useCallback((type: 'reconnecting' | 'disconnected') => {
    if (currentConnRef.current) return // already open
    const evt: ConnectionEvent = {
      id: `conn-${Date.now()}`,
      startMs: msSinceStart(),
      endMs: null,
      type,
    }
    currentConnRef.current = evt
    setData(d => ({ ...d, connectionEvents: [...d.connectionEvents, evt] }))
  }, [msSinceStart])

  /** Call when connection is restored */
  const onConnectionRestored = useCallback(() => {
    if (!currentConnRef.current) return
    const endMs = msSinceStart()
    const id = currentConnRef.current.id
    currentConnRef.current = null
    setData(d => ({
      ...d,
      connectionEvents: d.connectionEvents.map(e => e.id === id ? { ...e, endMs } : e),
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
    onConnectionLost,
    onConnectionRestored,
    finalise,
  }
}
