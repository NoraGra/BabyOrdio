import { useState } from 'react'
import Home              from './pages/Home'
import BabyDevice        from './pages/BabyDevice'
import ParentJoin        from './pages/ParentJoin'
import ParentMonitor     from './pages/ParentMonitor'
import AnalysisDashboard from './pages/AnalysisDashboard'
import type { SessionData, SessionStats } from './hooks/useSessionRecorder'

type Screen =
  | { view: 'home' }
  | { view: 'baby'; code: string }
  | { view: 'parent-join' }
  | { view: 'parent-monitor'; code: string }
  | { view: 'analysis' }

interface SavedSession { data: SessionData; stats: SessionStats }

function getInitialScreen(): Screen {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (code && /^\d{6}$/.test(code)) return { view: 'parent-monitor', code }
  return { view: 'home' }
}

export default function App() {
  const [screen, setScreen]           = useState<Screen>(getInitialScreen)
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null)

  if (screen.view === 'home') {
    return (
      <Home
        onSelectBaby={(code) => setScreen({ view: 'baby', code })}
        onSelectParent={() => setScreen({ view: 'parent-join' })}
        onViewAnalysis={savedSession ? () => setScreen({ view: 'analysis' }) : undefined}
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
        onSessionEnd={(data, stats) => {
          // Save session so it can be viewed from the Home screen later
          setSavedSession({ data, stats })
        }}
      />
    )
  }

  if (screen.view === 'analysis' && savedSession) {
    return (
      <AnalysisDashboard
        session={savedSession.data}
        stats={savedSession.stats}
        isLive={false}
        onBack={() => setScreen({ view: 'home' })}
      />
    )
  }

  return null
}
