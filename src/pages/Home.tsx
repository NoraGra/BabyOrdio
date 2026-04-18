import BabyIcon from '../components/icons/BabyIcon'
import ParentIcon from '../components/icons/ParentIcon'
import HelpButton from '../components/HelpButton'

interface Props {
  onSelectBaby: (code: string) => void
  onSelectParent: () => void
  onViewAnalysis?: () => void
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function Home({ onSelectBaby, onSelectParent, onViewAnalysis }: Props) {
  return (
    <div className="screen home-screen">

      {/* Logo — ~100 px from top */}
      <div className="home-logo-area">
        <p className="home-logo-text">
          <span className="home-logo-baby">baby</span>
          <span className="home-logo-ordio">ordio</span>
        </p>
      </div>

      {/* Role cards */}
      <div className="home-cards">

        {/* Step 1 — Baby device */}
        <div className="role-card-wrapper">
          <span className="role-card-step">1. Richte zuerst dieses ein:</span>
          <button
            className="role-card"
            onClick={() => onSelectBaby(generateCode())}
          >
            <div className="role-card-art">
              <BabyIcon size={76} />
            </div>
            <span className="role-card-name">Baby-Gerät</span>
            <span className="role-card-desc">Kamera &amp; Ton übertragen</span>
          </button>
        </div>

        {/* Step 2 — Parent device (dimmed, not clickable) */}
        <div className="role-card-wrapper role-card-wrapper--disabled">
          <span className="role-card-step">2. Wenn du das Baby-Gerät eingerichtet hast, kannst du dieses einrichten:</span>
          <button
            className="role-card"
            onClick={onSelectParent}
            tabIndex={-1}
            aria-disabled="true"
          >
            <div className="role-card-art">
              <ParentIcon size={76} />
            </div>
            <span className="role-card-name">Eltern-Gerät</span>
            <span className="role-card-desc">Baby beobachten &amp; hören</span>
          </button>
        </div>

      </div>

      {/* Last session shortcut */}
      {onViewAnalysis && (
        <button className="home-analysis-btn" onClick={onViewAnalysis}>
          📊 Letzte Session ansehen
        </button>
      )}

      <p className="home-wake-notice">⚠️ Bildschirm des Baby-Geräts muss während der Session aktiv bleiben</p>

      <HelpButton screen="home" large />
    </div>
  )
}
