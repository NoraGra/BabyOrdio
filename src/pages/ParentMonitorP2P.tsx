/**
 * ParentMonitorP2P — Parent-side monitoring via native WebRTC (no LiveKit)
 *
 * Receives the baby's camera + audio stream directly.
 * Shows a fallback banner when connection degrades.
 * User can switch to LiveKit mode with full analysis features.
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { useWebRTC, postSignal } from '../hooks/useWebRTC'
import ConnectionBadge from '../components/ConnectionBadge'
import SessionTimer from '../components/SessionTimer'
import HelpButton from '../components/HelpButton'
import type { MonitorState } from '../hooks/useMonitorState'

interface Props {
  code: string
  onBack: () => void
  onSwitchToLiveKit: () => void
}

const STATUS_TO_BADGE: Record<string, MonitorState> = {
  idle:        'connecting',
  signaling:   'connecting',
  connecting:  'connecting',
  connected:   'connected',
  reconnecting:'reconnecting',
  failed:      'critical',
  closed:      'critical',
}

export default function ParentMonitorP2P({ code, onBack, onSwitchToLiveKit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showEndConfirm,    setShowEndConfirm]   = useState(false)
  const [showFallbackBanner, setShowFallbackBanner] = useState(false)
  // Demo: simulate poor quality button (hidden — triple-tap top-left corner)
  const tapCount = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // P2P connection (parent is answerer — no local stream needed)
  const { status, transport, remoteStream, disconnect } = useWebRTC({
    code, role: 'parent', localStream: null,
  })

  // Attach remote stream to <video>
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Auto-show fallback banner when connection fails
  useEffect(() => {
    if (status === 'failed' || status === 'reconnecting') {
      const id = setTimeout(() => setShowFallbackBanner(true), 8_000)
      return () => clearTimeout(id)
    }
    if (status === 'connected') {
      setShowFallbackBanner(false)
    }
  }, [status])

  // Demo trigger: triple-tap corner to simulate poor connection
  const handleCornerTap = useCallback(() => {
    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 1500)
    if (tapCount.current >= 3) {
      tapCount.current = 0
      setShowFallbackBanner(true)
    }
  }, [])

  const handleEnd = () => { disconnect(); onBack() }
  const handleSwitchToLiveKit = async () => {
    // Tell the baby device to also switch to LiveKit (it polls KV every 600ms)
    await postSignal(code, 'mode', 'livekit')
    disconnect()
    onSwitchToLiveKit()
  }

  const badgeState: MonitorState = STATUS_TO_BADGE[status] ?? 'connecting'
  const isConnected = status === 'connected'
  const transportLabel = transport === 'direct' ? '🔒 P2P direkt'
                       : transport === 'relay'  ? '🔒 P2P relay'
                       : '🔒 P2P…'

  return (
    <>
      <div className="screen parent-screen">

        {/* ── Remote video ───────────────────────────────────────────── */}
        <video
          ref={videoRef}
          className="remote-video"
          autoPlay
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {/* ── Waiting state ───────────────────────────────────────────── */}
        {!isConnected && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 16,
          }}>
            <div className="spinner" />
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              {status === 'signaling' ? 'Verbinde…' : status === 'connecting' ? 'Stream startet…' : 'Warte…'}
            </p>
          </div>
        )}

        {/* ── Controls overlay ────────────────────────────────────────── */}
        <div className="parent-controls">

          {/* TOP: badge + transport label + timer + end */}
          <div className="parent-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ConnectionBadge state={badgeState} light />
              <span className="transport-badge transport-badge--p2p" style={{ fontSize: '0.7rem' }}>
                {transportLabel}
              </span>
            </div>

            {/* Demo trigger zone — invisible tap target */}
            <div
              style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 60, zIndex: 20 }}
              onClick={handleCornerTap}
            />

            <div className="parent-header-right">
              {isConnected && <SessionTimer />}
              <button
                className="end-circle-btn end-circle-btn--labeled"
                onClick={() => setShowEndConfirm(true)}
                aria-label="Session verlassen"
              >
                <span className="end-circle-label">Session verlassen</span>
                <span className="end-circle-icon">✕</span>
              </button>
            </div>
          </div>

          {/* BOTTOM LEFT: switch info */}
          <div className="parent-bottom-left">
            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
              P2P-Modus · Analyse nur im stabilen Modus verfügbar
            </p>
            <button
              className="analyse-btn"
              onClick={handleSwitchToLiveKit}
              style={{ background: 'rgba(255,255,255,0.15)', fontSize: '0.75rem' }}
            >
              Stabiler Modus
            </button>
          </div>
        </div>

        {/* ── Connection failed overlay ────────────────────────────────── */}
        {status === 'failed' && !showFallbackBanner && (
          <div className="critical-overlay">
            <p className="critical-title">Verbindung fehlgeschlagen</p>
            <p className="critical-subtitle">P2P-Verbindung konnte nicht hergestellt werden.</p>
            <button className="primary-button" style={{ maxWidth: 240 }} onClick={handleSwitchToLiveKit}>
              Mit stabilem Modus erneut versuchen
            </button>
            <button
              className="primary-button"
              style={{ maxWidth: 240, background: 'var(--surface-2)', marginTop: 8 }}
              onClick={handleEnd}
            >
              Zurück
            </button>
          </div>
        )}

        <HelpButton screen="monitor" />
      </div>

      {/* ── Fallback banner ──────────────────────────────────────────────── */}
      {showFallbackBanner && (
        <div className="p2p-fallback-overlay">
          <div className="p2p-fallback-sheet">
            <div className="p2p-fallback-icon">📡</div>
            <p className="p2p-fallback-title">Verbindung instabil</p>
            <p className="p2p-fallback-body">
              Für stabileres Monitoring kannst du auf verschlüsselte Server-Verbindung wechseln.
              LiveKit sieht dabei verschlüsselte Pakete, aber <strong>nie den Inhalt</strong>.
            </p>
            <div className="p2p-fallback-actions">
              <button className="confirm-btn confirm-btn--danger" onClick={handleSwitchToLiveKit}>
                Ja, wechseln
              </button>
              <button className="confirm-btn confirm-btn--cancel" onClick={() => setShowFallbackBanner(false)}>
                Nein danke, so lassen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End session confirm ──────────────────────────────────────────── */}
      {showEndConfirm && (
        <div className="parent-confirm-overlay" onClick={() => setShowEndConfirm(false)}>
          <div className="parent-confirm-sheet" onClick={e => e.stopPropagation()}>
            <p className="confirm-title">Session verlassen?</p>
            <p className="confirm-body">Du verlässt die Session. Das Baby-Gerät bleibt aktiv.</p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn--danger" onClick={() => { setShowEndConfirm(false); handleEnd() }}>
                Ja, verlassen
              </button>
              <button className="confirm-btn confirm-btn--cancel" onClick={() => setShowEndConfirm(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
