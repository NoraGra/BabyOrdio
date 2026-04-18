import { useEffect } from 'react'

interface Props {
  onDone: () => void
}

// Total: 2s logo hold + 2.7s animation = 4.7s
export default function IntroOverlay({ onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 4900)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="intro-overlay">
      <div className="intro-logo-wrap">
        <p className="intro-logo-text">
          <span className="intro-logo-baby">baby</span>
          <span className="intro-logo-ordio">ordio</span>
        </p>
        <p className="intro-tagline">Ganz nah bei deinem Baby</p>
      </div>
      <div className="intro-circle" />
    </div>
  )
}
