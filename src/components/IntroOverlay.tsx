import { useEffect } from 'react'

interface Props {
  onDone: () => void
}

export default function IntroOverlay({ onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 2700)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="intro-overlay">
      <div className="intro-logo-wrap">
        <p className="intro-logo-text">
          <span className="intro-logo-baby">baby</span>
          <span className="intro-logo-ordio">ordio</span>
        </p>
      </div>
      <div className="intro-circle" />
    </div>
  )
}
