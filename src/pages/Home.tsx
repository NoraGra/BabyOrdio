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

      {/* Wordmark */}
      <div className="home-header">
        <div className="home-wordmark">
          <div className="home-wordmark-icon">👶</div>
          <span>
            <span className="home-wordmark-text">Baby </span>
            <span className="home-wordmark-sub">Ordio</span>
          </span>
        </div>
        <p className="home-subtitle">Wähle deine Rolle um zu beginnen</p>
      </div>

      {/* Role buttons */}
      <div className="home-buttons">
        <button
          className="role-button role-button--baby"
          onClick={() => onSelectBaby(generateCode())}
        >
          <div className="role-icon-wrap">🍼</div>
          <div className="role-text">
            <div className="role-name">Baby-Gerät</div>
            <div className="role-desc">Dieses Gerät filmt &amp; überträgt</div>
          </div>
          <span className="role-arrow">›</span>
        </button>

        <button
          className="role-button role-button--parent"
          onClick={onSelectParent}
        >
          <div className="role-icon-wrap">👀</div>
          <div className="role-text">
            <div className="role-name">Eltern-Gerät</div>
            <div className="role-desc">Schaue &amp; höre dein Baby zu</div>
          </div>
          <span className="role-arrow">›</span>
        </button>

        {/* Show last analysis if available */}
        {onViewAnalysis && (
          <button
            className="role-button"
            style={{ borderColor: 'var(--ordio)', opacity: 0.85 }}
            onClick={onViewAnalysis}
          >
            <div className="role-icon-wrap" style={{ background: 'var(--ordio-light)' }}>📊</div>
            <div className="role-text">
              <div className="role-name">Letzte Analyse</div>
              <div className="role-desc">Session-Report ansehen</div>
            </div>
            <span className="role-arrow" style={{ color: 'var(--ordio)' }}>›</span>
          </button>
        )}
      </div>
    </div>
  )
}
