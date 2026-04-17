import { useRef, useState } from 'react'

export type HelpScreen = 'home' | 'baby' | 'join' | 'monitor' | 'dashboard'

// ── SVG icons in Ordio blue stroke style ────────────────────────────────────

const Icon = ({ d, extra }: { d: string; extra?: React.ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ordio)"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
)

const ICONS = {
  phone:    <Icon d="M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />,
  eye:      <Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" extra={<circle cx="12" cy="12" r="3" stroke="var(--ordio)" strokeWidth="2.2" />} />,
  lock:     <Icon d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z" extra={<path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="var(--ordio)" strokeWidth="2.2" strokeLinecap="round" />} />,
  share:    <Icon d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6 12 2 8 6M12 2v13" />,
  screen:   <Icon d="M12 18v4m-4 0h8M2 14V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />,
  camera:   <Icon d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />,
  hash:     <Icon d="M4 9h16M4 15h16M10 3l-4 18M14 3l-4 18" />,
  bulb:     <Icon d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.2L15 18H9l-.5-2.8A7 7 0 0 1 5 9a7 7 0 0 1 7-7z" />,
  signal:   <Icon d="M1 6l4 4 4-4M9 10V2M15 6l4 4 4-4M19 10V2M5 14v8M19 14v8" />,
  chart:    <Icon d="M18 20V10M12 20V4M6 20v-6" />,
  door:     <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  timeline: <Icon d="M3 12h18M3 6h18M3 18h18" extra={<><rect x="5" y="4" width="4" height="4" rx="1" fill="var(--ordio)" stroke="none"/><rect x="12" y="10" width="6" height="4" rx="1" fill="#fca5a5" stroke="none"/><rect x="5" y="16" width="3" height="4" rx="1" fill="#fde68a" stroke="none"/></>} />,
  moon:     <Icon d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  sparkle:  <Icon d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6z" />,
}

interface HelpItem {
  icon: React.ReactNode
  title: string
  body: string
}

const HELP_CONTENT: Record<HelpScreen, { heading: string; items: HelpItem[] }> = {
  home: {
    heading: 'Wie funktioniert Baby Ordio?',
    items: [
      { icon: ICONS.phone,  title: 'Baby-Gerät',      body: 'Platziere dieses Gerät im Zimmer deines Babys. Es überträgt Kamera und Mikrofon live.' },
      { icon: ICONS.eye,    title: 'Eltern-Gerät',    body: 'Gib den Code vom Baby-Gerät ein und starte die Überwachung — funktioniert im WLAN und über das Internet.' },
      { icon: ICONS.lock,   title: 'Kein Account nötig', body: 'Der 6-stellige Code ist der einzige Zugriffsschutz. Nichts wird gespeichert oder aufgezeichnet.' },
    ],
  },
  baby: {
    heading: 'Baby-Gerät',
    items: [
      { icon: ICONS.share,  title: 'Code teilen',            body: 'Verschicke den Verbindungscode ans Eltern-Gerät — per Nachricht, AirDrop oder QR-Code.' },
      { icon: ICONS.screen, title: 'Bildschirm aktiv lassen', body: 'Wenn der Bildschirm ausgeht oder du die App verlässt, stoppt die Übertragung.' },
      { icon: ICONS.camera, title: 'Kamera wechseln',        body: 'Wechsle zwischen Front- und Rückkamera — z.B. für einen besseren Blickwinkel auf das Bett.' },
    ],
  },
  join: {
    heading: 'Code eingeben',
    items: [
      { icon: ICONS.hash, title: 'Wo finde ich den Code?', body: 'Der 6-stellige Code erscheint auf dem Bildschirm des Baby-Geräts, nachdem du dort "Baby-Gerät" gewählt hast.' },
      { icon: ICONS.bulb, title: 'Tipp: Code teilen',       body: 'Auf dem Baby-Gerät gibt es einen "Code teilen"-Button — damit kannst du den Code direkt per Nachricht verschicken.' },
    ],
  },
  monitor: {
    heading: 'Eltern-Monitor',
    items: [
      { icon: ICONS.signal, title: 'Qualitäts-Balken',    body: 'Zeigen Video- und Audio-Qualität. Bei schlechter Verbindung wird Video pausiert — Audio läuft immer weiter.' },
      { icon: ICONS.chart,  title: 'Analyse',             body: 'Öffnet das Session-Dashboard mit Timeline, Statistiken und KI-Auswertung — ohne die Übertragung zu unterbrechen.' },
      { icon: ICONS.door,   title: 'Session verlassen',   body: 'Beendet die Übertragung. Du kannst danach die Session-Auswertung einsehen.' },
    ],
  },
  dashboard: {
    heading: 'Dashboard',
    items: [
      { icon: ICONS.timeline, title: 'Timeline',       body: 'Rot = Weinen · Gelb = Bewegung · Orange = Beides · Gestreift = Verbindung weg.' },
      { icon: ICONS.moon,     title: 'Schlafqualität', body: 'Berechnet sich aus der Bewegungshäufigkeit: unter 1/Min. = Tief · 1–3 = Leicht · über 3 = Unruhig.' },
      { icon: ICONS.sparkle,  title: 'KI-Analyse',    body: 'Wähle einen Zeitraum und tippe "Jetzt analysieren" — Claude gibt dir eine verständliche Einschätzung.' },
    ],
  },
}

interface Props {
  screen: HelpScreen
  onClose: () => void
}

export default function HelpSheet({ screen, onClose }: Props) {
  const { heading, items } = HELP_CONTENT[screen]

  // Swipe-to-dismiss
  const startY    = useRef(0)
  const [dragY, setDragY] = useState(0)
  const dragging  = useRef(false)

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = true
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setDragY(dy)
  }
  const onTouchEnd = () => {
    dragging.current = false
    if (dragY > 90) {
      onClose()
    } else {
      setDragY(0)
    }
  }

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help-sheet"
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.25s ease' : 'none' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle — also tap to close */}
        <div className="help-handle" onClick={onClose} />

        <div className="help-sheet-header">
          <span className="help-sheet-title">{heading}</span>
        </div>

        <div className="help-items">
          {items.map((item, i) => (
            <div className="help-item" key={i}>
              <span className="help-item-icon">{item.icon}</span>
              <div className="help-item-text">
                <p className="help-item-title">{item.title}</p>
                <p className="help-item-body">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="help-sheet-dismiss-hint">Nach unten wischen zum Schließen</p>
      </div>
    </div>
  )
}
