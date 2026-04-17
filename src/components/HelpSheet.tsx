export type HelpScreen = 'home' | 'baby' | 'join' | 'monitor' | 'dashboard'

interface HelpItem {
  icon: string
  title: string
  body: string
}

const HELP_CONTENT: Record<HelpScreen, { heading: string; items: HelpItem[] }> = {
  home: {
    heading: 'Wie funktioniert Baby Ordio?',
    items: [
      {
        icon: '📱',
        title: 'Baby-Gerät',
        body: 'Platziere dieses Gerät im Zimmer deines Babys. Es überträgt Kamera und Mikrofon live.',
      },
      {
        icon: '👀',
        title: 'Eltern-Gerät',
        body: 'Gib den Code vom Baby-Gerät ein und starte die Überwachung — funktioniert im WLAN und über das Internet.',
      },
      {
        icon: '🔒',
        title: 'Kein Account nötig',
        body: 'Der 6-stellige Code ist der einzige Zugriffsschutz. Nichts wird gespeichert oder aufgezeichnet.',
      },
    ],
  },
  baby: {
    heading: 'Baby-Gerät',
    items: [
      {
        icon: '📤',
        title: 'Code teilen',
        body: 'Verschicke den Verbindungscode ans Eltern-Gerät — per Nachricht, AirDrop oder QR-Code.',
      },
      {
        icon: '🔆',
        title: 'Bildschirm aktiv lassen',
        body: 'Wenn der Bildschirm ausgeht oder du die App verlässt, stoppt die Übertragung.',
      },
      {
        icon: '🔄',
        title: 'Kamera wechseln',
        body: 'Wechsle zwischen Front- und Rückkamera — z.B. für einen besseren Blickwinkel auf das Bett.',
      },
    ],
  },
  join: {
    heading: 'Code eingeben',
    items: [
      {
        icon: '🔢',
        title: 'Wo finde ich den Code?',
        body: 'Der 6-stellige Code erscheint auf dem Bildschirm des Baby-Geräts, nachdem du dort "Baby-Gerät" gewählt hast.',
      },
      {
        icon: '📲',
        title: 'Tipp: Code teilen',
        body: 'Auf dem Baby-Gerät gibt es einen "Code teilen"-Button — damit kannst du den Code direkt per Nachricht verschicken.',
      },
    ],
  },
  monitor: {
    heading: 'Eltern-Monitor',
    items: [
      {
        icon: '📶',
        title: 'Qualitäts-Balken',
        body: 'Zeigen Video- und Audio-Qualität. Bei schlechter Verbindung wird Video pausiert — Audio läuft immer weiter.',
      },
      {
        icon: '📊',
        title: 'Analyse',
        body: 'Öffnet das Session-Dashboard mit Timeline, Statistiken und KI-Auswertung — ohne die Übertragung zu unterbrechen.',
      },
      {
        icon: '🚪',
        title: 'Session verlassen',
        body: 'Beendet die Übertragung. Du kannst danach die Session-Auswertung einsehen.',
      },
    ],
  },
  dashboard: {
    heading: 'Dashboard',
    items: [
      {
        icon: '⏱',
        title: 'Timeline',
        body: 'Rot = Weinen · Gelb = Bewegung · Beides = Orange · Gestreift = Verbindung weg.',
      },
      {
        icon: '😴',
        title: 'Schlafqualität',
        body: 'Berechnet sich aus der Bewegungshäufigkeit: unter 1/Min. = Tief · 1–3/Min. = Leicht · über 3/Min. = Unruhig.',
      },
      {
        icon: '✨',
        title: 'KI-Analyse',
        body: 'Wähle einen Zeitraum mit den Chips und tippe "Jetzt analysieren" — Claude gibt dir eine verständliche Einschätzung.',
      },
    ],
  },
}

interface Props {
  screen: HelpScreen
  onClose: () => void
}

export default function HelpSheet({ screen, onClose }: Props) {
  const { heading, items } = HELP_CONTENT[screen]

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div className="help-sheet" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="help-handle" />

        <div className="help-sheet-header">
          <span className="help-sheet-title">{heading}</span>
          <button className="help-sheet-close" onClick={onClose} aria-label="Schließen">✕</button>
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
      </div>
    </div>
  )
}
