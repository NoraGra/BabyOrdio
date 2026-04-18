import { useState } from 'react'
import Home              from './pages/Home'
import BabyDevice        from './pages/BabyDevice'
import ParentJoin        from './pages/ParentJoin'
import ParentMonitor     from './pages/ParentMonitor'
import AnalysisDashboard from './pages/AnalysisDashboard'
import IntroOverlay      from './components/IntroOverlay'
import type { SessionData, SessionStats } from './hooks/useSessionRecorder'

type Screen =
  | { view: 'home' }
  | { view: 'baby'; code: string }
  | { view: 'parent-join' }
  | { view: 'parent-monitor'; code: string }
  | { view: 'analysis' }

type NavDir = 'forward' | 'back'
interface NavState { screen: Screen; dir: NavDir; key: number }

interface SavedSession { data: SessionData; stats: SessionStats }

function getInitialScreen(): Screen {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (code && /^\d{6}$/.test(code)) return { view: 'parent-monitor', code }
  return { view: 'home' }
}

function shouldShowIntro(): boolean {
  try {
    const initial = getInitialScreen()
    if (initial.view !== 'home') return false
    return !sessionStorage.getItem('ordio-intro-seen')
  } catch { return false }
}

export default function App() {
  const [navState, setNavState] = useState<NavState>({
    screen: getInitialScreen(),
    dir: 'forward',
    key: 0,
  })
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null)
  const [showIntro, setShowIntro] = useState(shouldShowIntro)

  const navigate = (newScreen: Screen, dir: NavDir = 'forward') => {
    setNavState(prev => ({ screen: newScreen, dir, key: prev.key + 1 }))
  }

  const handleIntroDone = () => {
    try { sessionStorage.setItem('ordio-intro-seen', '1') } catch {}
    setShowIntro(false)
  }

  const { screen } = navState

  const renderScreen = () => {
    if (screen.view === 'home') {
      return (
        <Home
          onSelectBaby={(code) => navigate({ view: 'baby', code })}
          onSelectParent={() => navigate({ view: 'parent-join' })}
          onViewAnalysis={savedSession ? () => navigate({ view: 'analysis' }) : undefined}
        />
      )
    }

    if (screen.view === 'baby') {
      return (
        <BabyDevice
          code={screen.code}
          onBack={() => navigate({ view: 'home' }, 'back')}
        />
      )
    }

    if (screen.view === 'parent-join') {
      return (
        <ParentJoin
          onJoin={(code) => navigate({ view: 'parent-monitor', code })}
          onBack={() => navigate({ view: 'home' }, 'back')}
        />
      )
    }

    if (screen.view === 'parent-monitor') {
      return (
        <ParentMonitor
          code={screen.code}
          onBack={() => navigate({ view: 'home' }, 'back')}
          onSessionEnd={(data, stats) => {
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
          onBack={() => navigate({ view: 'home' }, 'back')}
        />
      )
    }

    return null
  }

  return (
    <>
      {showIntro && <IntroOverlay onDone={handleIntroDone} />}
      <div
        key={navState.key}
        className={navState.key === 0 ? '' : `screen-enter screen-enter--${navState.dir}`}
      >
        {renderScreen()}
      </div>
    </>
  )
}
