interface Props {
  onSelectBaby: (code: string) => void
  onSelectParent: () => void
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function Home({ onSelectBaby, onSelectParent }: Props) {
  return (
    <div className="screen home-screen">
      <div className="home-header">
        <div className="home-logo">👶</div>
        <h1 className="home-title">Baby Monitor</h1>
        <p className="home-subtitle">Choose your role to begin</p>
      </div>

      <div className="home-buttons">
        <button
          className="role-button role-button--baby"
          onClick={() => onSelectBaby(generateCode())}
        >
          <span className="role-icon">🍼</span>
          <span className="role-name">Baby Device</span>
          <span className="role-desc">Stream audio &amp; video from this device</span>
        </button>

        <button
          className="role-button role-button--parent"
          onClick={onSelectParent}
        >
          <span className="role-icon">👀</span>
          <span className="role-name">Parent Device</span>
          <span className="role-desc">Monitor your baby from this device</span>
        </button>
      </div>
    </div>
  )
}
