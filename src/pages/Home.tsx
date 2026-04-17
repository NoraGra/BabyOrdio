import BabyIcon from '../components/icons/BabyIcon'
import ParentIcon from '../components/icons/ParentIcon'

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

      {/* Last session shortcut */}
      {onViewAnalysis && (
        <button className="home-analysis-btn" onClick={onViewAnalysis}>
          📊 Letzte Session ansehen
        </button>
      )}
    </div>
  )
}
