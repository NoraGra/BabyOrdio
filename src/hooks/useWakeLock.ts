import { useEffect, useRef } from 'react'

/**
 * Requests a screen wake lock so the device doesn't sleep during monitoring.
 * Silently no-ops on browsers that don't support the Wake Lock API (e.g. Firefox).
 * Re-acquires the lock automatically if the page becomes visible again.
 */
export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  const acquire = async () => {
    if (!('wakeLock' in navigator)) return
    try {
      lockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Permission denied or not supported — safe to ignore
    }
  }

  useEffect(() => {
    acquire()

    // Re-acquire after the page becomes visible again (e.g. user switches back)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [])
}
