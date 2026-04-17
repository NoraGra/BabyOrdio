import { useCallback, useRef } from 'react'

/**
 * Plays an alert tone using the Web Audio API — no sound files needed.
 * Two modes:
 *  - 'warning'  → 2 soft beeps (reconnecting)
 *  - 'critical' → 3 urgent beeps (connection lost)
 *
 * Note: AudioContext requires a prior user gesture on iOS/Safari.
 * Since the parent already tapped "Start Monitoring", it should be unlocked.
 */
export function useAlertSound() {
  const ctxRef = useRef<AudioContext | null>(null)

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
    }
    return ctxRef.current
  }

  const playBeeps = useCallback((count: number, freq: number, volume: number) => {
    try {
      const ctx = getCtx()
      // Resume in case AudioContext was suspended
      if (ctx.state === 'suspended') ctx.resume()

      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.type = 'sine'
        osc.frequency.value = freq

        const t = ctx.currentTime + i * 0.4
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(volume, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28)

        osc.start(t)
        osc.stop(t + 0.3)
      }
    } catch (e) {
      console.warn('Alert sound failed:', e)
    }
  }, [])

  const playWarning  = useCallback(() => playBeeps(2, 660, 0.25), [playBeeps])
  const playCritical = useCallback(() => playBeeps(3, 880, 0.45), [playBeeps])

  return { playWarning, playCritical }
}
