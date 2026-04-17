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

export default function App() {
  const [screen, setScreen] = useState<Screen>({ view: 'home' })

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
