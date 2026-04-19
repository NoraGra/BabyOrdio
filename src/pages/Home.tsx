import BabyIcon from '../components/icons/BabyIcon'
import ParentIcon from '../components/icons/ParentIcon'
import HelpButton from '../components/HelpButton'

interface Props {
  onSelectBaby: (code: string) => void
  onSelectParent: () => void
  onViewAnalysis?: () => void
}

// 8-char alphanumeric — 36^8 ≈ 2.8 trillion combos (brute-force unfeasible)
// Excludes visually confusable chars: 0/o, 1/i/l
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'
function generateCode(): string {
  return Array.from({ length: 8 }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('')
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

        {/* Step 2 — Parent device */}
        <div className="role-card-wrapper">
          <span className="role-card-step">2. Dann hier verbinden:</span>
          <button
            className="role-card"
            onClick={onSelectParent}
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
