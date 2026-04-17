import { useState } from 'react'
import Home from './pages/Home'
import BabyDevice from './pages/BabyDevice'
import ParentJoin from './pages/ParentJoin'
import ParentMonitor from './pages/ParentMonitor'

type Screen =
  | { view: 'home' }
  | { view: 'baby'; code: string }
  | { view: 'parent-join' }
  | { view: 'parent-monitor'; code: string }

// If the URL has ?code=XXXXXX (from a QR scan), jump straight to monitoring
function getInitialScreen(): Screen {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (code && /^\d{6}$/.test(code)) {
    return { view: 'parent-monitor', code }
  }
  return { view: 'home' }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(getInitialScreen)

  if (screen.view === 'home') {
    return (
      <Home
        onSelectBaby={(code) => setScreen({ view: 'baby', code })}
        onSelectParent={() => setScreen({ view: 'parent-join' })}
      />
    )
  }

  if (screen.view === 'baby') {
    return (
      <BabyDevice
        code={screen.code}
        onBack={() => setScreen({ view: 'home' })}
      />
    )
  }

  if (screen.view === 'parent-join') {
    return (
      <ParentJoin
        onJoin={(code) => setScreen({ view: 'parent-monitor', code })}
        onBack={() => setScreen({ view: 'home' })}
      />
    )
  }

  if (screen.view === 'parent-monitor') {
    return (
      <ParentMonitor
        code={screen.code}
        onBack={() => setScreen({ view: 'home' })}
      />
    )
  }

  return null
}
