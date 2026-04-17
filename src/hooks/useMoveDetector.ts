import { useEffect, useRef, useState } from 'react'
import type { TrackReference } from '@livekit/components-react'

export interface MoveState {
  isMoving: boolean
  /** 0–10 motion intensity */
  intensity: number
}

const EMPTY: MoveState = { isMoving: false, intensity: 0 }

/**
 * Detects baby movement by comparing consecutive video frames.
 *
 * Algorithm:
 *  1. Draw video to an offscreen canvas every 200 ms (5 fps)
 *  2. Compare pixel luminance with previous frame (downsampled 4×)
 *  3. Compute RMS of differences → motion score 0–10
 *  4. Debounce: confirm movement after 300 ms, clear after 1 s
 *
 * Runs entirely in the browser. No ML model needed.
 */
export function useMoveDetector(
  trackRef: TrackReference | undefined,
  onMove?: (intensity: number) => void,
) {
  const [state, setState] = useState<MoveState>(EMPTY)
  const trackSid = trackRef?.publication?.trackSid

  const movingRef         = useRef(false)
  const moveTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFireRef       = useRef(0)  // throttle onMove callback

  useEffect(() => {
    // Wait briefly for the <video> element to be attached to the track
    const attach = () => {
      const track = trackRef?.publication?.track
      if (!track) return null
      // LiveKit attaches the track to HTMLVideoElements; grab the first one
      const attachedEls = (track as any).attachedElements as HTMLVideoElement[] | undefined
      return attachedEls?.[0] ?? null
    }

    let videoEl: HTMLVideoElement | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null

    // Wait up to 2 s for the video element to appear
    const waitId = setInterval(() => {
      videoEl = attach()
      if (videoEl) {
        clearInterval(waitId)
        start(videoEl)
      }
    }, 200)

    const canvas  = document.createElement('canvas')
    const ctx2d   = canvas.getContext('2d', { willReadFrequently: true })
    let prevData: Uint8ClampedArray | null = null

    function start(el: HTMLVideoElement) {
      // Downsample to 80×60 for efficiency
      canvas.width  = 80
      canvas.height = 60

      intervalId = setInterval(() => {
        if (!ctx2d || el.readyState < 2 || el.videoWidth === 0) return

        ctx2d.drawImage(el, 0, 0, 80, 60)
        const frame = ctx2d.getImageData(0, 0, 80, 60)
        const data  = frame.data

        if (!prevData) {
          prevData = data.slice()
          return
        }

        // Compute mean absolute luminance difference (every 4th pixel for speed)
        let sumDiff = 0
        let count   = 0
        for (let i = 0; i < data.length; i += 16) {  // step 4 pixels at a time
          const lNew = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]
          const lOld = 0.299 * prevData[i] + 0.587 * prevData[i+1] + 0.114 * prevData[i+2]
          sumDiff += Math.abs(lNew - lOld)
          count++
        }
        prevData = data.slice()

        const avgDiff = sumDiff / count  // 0–255
        // Map: 0 diff → 0, 15 diff → 10 (15/255 ≈ 6% change = clear movement)
        const intensity = Math.min(10, Math.round((avgDiff / 15) * 10))

        setState({ isMoving: movingRef.current, intensity })

        if (intensity >= 3) {
          if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null }

          if (!movingRef.current && !moveTimerRef.current) {
            moveTimerRef.current = setTimeout(() => {
              moveTimerRef.current = null
              movingRef.current = true
              setState({ isMoving: true, intensity })
              // Throttle callback to max once per 2 s
              const now = Date.now()
              if (now - lastFireRef.current > 2000) {
                lastFireRef.current = now
                onMove?.(intensity)
              }
            }, 300)
          }
        } else {
          if (moveTimerRef.current) { clearTimeout(moveTimerRef.current); moveTimerRef.current = null }

          if (movingRef.current && !clearTimerRef.current) {
            clearTimerRef.current = setTimeout(() => {
              clearTimerRef.current = null
              movingRef.current = false
              setState(s => ({ ...s, isMoving: false }))
            }, 1000)
          }
        }
      }, 200)  // 5 fps
    }

    return () => {
      clearInterval(waitId)
      if (intervalId)         clearInterval(intervalId)
      if (moveTimerRef.current)  clearTimeout(moveTimerRef.current)
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      moveTimerRef.current  = null
      clearTimerRef.current = null
      movingRef.current     = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSid])

  return state
}
