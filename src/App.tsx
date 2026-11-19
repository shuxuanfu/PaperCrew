import { useEffect } from 'react'

import { Header } from '@/components/layout/Header'
import { MainWorkspace } from '@/components/layout/MainWorkspace'
import { MobileViewSwitcher } from '@/components/layout/MobileViewSwitcher'
import { ApiSettings } from '@/components/settings/ApiSettings'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'

function App() {
  const mode = useSettingsStore((state) => state.mode)
  const bootDemo = useUiStore((state) => state.bootDemo)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const setMobileView = useUiStore((state) => state.setMobileView)
  const sessionStatus = useSessionStore((state) => state.sessionStatus)
  const sessionId = useSessionStore((state) => state.currentSession?.sessionId)

  useEffect(() => {
    void bootDemo()
  }, [bootDemo])

  useEffect(() => {
    if (sessionStatus === 'completed') {
      setActiveTab('report')
      setMobileView('results')
    }
  }, [sessionStatus, sessionId, setActiveTab, setMobileView])

  return (
    <div className="flex h-full min-h-full flex-col overflow-hidden bg-canvas">
      <Header />
      <MobileViewSwitcher />
      <MainWorkspace />

      <footer className="shrink-0 border-t border-line bg-surface/70">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-1 px-4 py-2.5 text-[10.5px] text-muted sm:px-5 lg:px-6">
          <span>
            {mode === 'demo'
              ? 'DEMO mode · outputs are validated local JSON.'
              : 'LIVE mode · requests go from this browser to your configured endpoint.'}
          </span>
          <span className="tabular-nums">
            PaperCrew · Engine · P6 · Demo + LLM Executors
          </span>
        </div>
      </footer>

      <ApiSettings />
    </div>
  )
}

export default App
