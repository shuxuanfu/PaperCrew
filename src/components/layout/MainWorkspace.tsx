import { AgentTimeline } from '@/components/agents/AgentTimeline'
import { ResearchResults } from '@/components/research/ResearchResults'
import { WorkspacePanel } from '@/components/layout/WorkspacePanel'
import { useUiStore } from '@/store/uiStore'
import type { MobileView } from '@/types/ui'

function columnVisibility(current: MobileView, target: MobileView) {
  return current === target ? 'flex' : 'hidden xl:flex'
}

export function MainWorkspace() {
  const mobileView = useUiStore((state) => state.mobileView)

  return (
    <main className="min-h-0 flex-1 overflow-y-auto xl:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 xl:grid xl:h-full xl:grid-cols-[280px_420px_minmax(0,1fr)] xl:gap-5 xl:px-6 xl:py-5">
        <div
          className={`${columnVisibility(mobileView, 'workspace')} mx-auto w-full max-w-[760px] xl:mx-0 xl:h-full xl:min-h-0 xl:max-w-none`}
        >
          <WorkspacePanel />
        </div>

        <div
          className={`${columnVisibility(mobileView, 'process')} mx-auto w-full max-w-[760px] xl:mx-0 xl:h-full xl:min-h-0 xl:max-w-none`}
        >
          <AgentTimeline />
        </div>

        <div
          className={`${columnVisibility(mobileView, 'results')} mx-auto w-full max-w-[900px] xl:mx-0 xl:h-full xl:min-h-0 xl:max-w-none`}
        >
          <ResearchResults />
        </div>
      </div>
    </main>
  )
}
