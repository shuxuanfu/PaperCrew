import { motion } from 'framer-motion'
import { FlaskConical, Radio } from 'lucide-react'

import { FinalReport } from '@/components/research/FinalReport'
import { LiteratureList } from '@/components/research/LiteratureList'
import { ResearchPlan } from '@/components/research/ResearchPlan'
import { ReviewPanel } from '@/components/research/ReviewPanel'
import { Panel } from '@/components/ui/Panel'
import { DEFAULT_DEMO_CASE_ID } from '@/data'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { AgentId, AgentStatus } from '@/types/agent'
import type { ResearchTab } from '@/types/ui'

const TABS: { id: ResearchTab; label: string }[] = [
  { id: 'plan', label: 'Research Plan' },
  { id: 'literature', label: 'Literature' },
  { id: 'review', label: 'Review' },
  { id: 'report', label: 'Final Report' },
]

const TAB_AGENT: Record<ResearchTab, AgentId> = {
  plan: 'planner',
  literature: 'researcher',
  review: 'reviewer',
  report: 'synthesizer',
}

const AGENT_LABEL: Record<AgentId, string> = {
  planner: 'Planner',
  researcher: 'Researcher',
  reviewer: 'Reviewer',
  synthesizer: 'Synthesizer',
}

const STATUS_MESSAGE: Record<AgentStatus, string> = {
  idle: 'Start Research to generate this output.',
  pending: 'Queued behind the previous agent.',
  running: 'Generating output from upstream context…',
  completed: 'Output is ready.',
  failed: 'This agent failed before producing an output.',
  fallback: 'Fallback output is ready.',
  skipped: 'Run cancelled before this output was produced.',
}

export function ResearchResults() {
  const activeTab = useUiStore((state) => state.activeTab)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const demoState = useUiStore((state) => state.demoState)
  const demoError = useUiStore((state) => state.demoError)
  const activeCaseId = useUiStore((state) => state.activeCaseId)
  const loadCase = useUiStore((state) => state.loadCase)

  const template = useSessionStore((state) => state.template)
  const currentSession = useSessionStore((state) => state.currentSession)
  const sessionStatus = useSessionStore((state) => state.sessionStatus)
  const executionError = useSessionStore((state) => state.error)
  const mode = useSettingsStore((state) => state.mode)
  const liveOutput = currentSession?.mode === 'live'

  const producerId = TAB_AGENT[activeTab]
  const producerAgent = currentSession?.agents.find(
    (agent) => agent.id === producerId,
  )
  const producerStatus = producerAgent?.status
  const outputReady =
    (producerStatus === 'completed' || producerStatus === 'fallback') &&
    Boolean(producerAgent?.output)

  const renderContent = () => {
    if (!currentSession) {
      if (template) {
        return (
          <div className="rounded-xl bg-canvas px-4 py-5">
            <p className="text-[12px] font-medium text-ink">
              Results appear as each agent completes.
            </p>
            <p className="mt-1 text-[11px] leading-[1.6] text-muted">
              Start the {mode === 'live' ? 'LIVE' : 'Demo'} run to let{' '}
              {AGENT_LABEL[producerId]} produce this section. The engine will
              reveal outputs in pipeline order.
            </p>
          </div>
        )
      }
      if (demoState === 'error') {
        return (
          <div role="alert" className="rounded-xl bg-danger-soft p-3.5">
            <p className="text-[11.5px] font-semibold text-danger-ink">
              结果数据加载失败
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[10.5px] leading-[1.55] text-danger-ink/90">
              {demoError}
            </p>
            <button
              type="button"
              onClick={() =>
                void loadCase(activeCaseId ?? DEFAULT_DEMO_CASE_ID)
              }
              className="mt-2 rounded-md bg-danger px-2.5 py-1 text-[10.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              重新加载案例
            </button>
          </div>
        )
      }
      return (
        <div className="space-y-3" aria-live="polite">
          {[0, 1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-4 animate-pulse rounded bg-canvas"
              style={{ width: `${92 - item * 9}%` }}
            />
          ))}
          <p className="pt-2 text-[10.5px] text-muted">
            Preparing results…
          </p>
        </div>
      )
    }

    if (!producerAgent) {
      return (
        <div className="rounded-xl bg-danger-soft p-3.5">
          <p className="text-[11.5px] font-semibold text-danger-ink">
            当前运行缺少 {AGENT_LABEL[producerId]} 的输出
          </p>
        </div>
      )
    }

    if (!outputReady) {
      const isRunning = producerStatus === 'running'
      const isFailed = producerStatus === 'failed'
      return (
        <div
          className={`rounded-xl px-4 py-5 ${
            isFailed ? 'bg-danger-soft' : 'bg-canvas'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`size-1.5 rounded-full ${
                isRunning
                  ? 'animate-pulse bg-accent'
                  : isFailed
                    ? 'bg-danger'
                    : 'bg-[#c7c7cc]'
              }`}
            />
            <p
              className={`text-[12px] font-medium ${
                isFailed ? 'text-danger-ink' : 'text-ink'
              }`}
            >
              Waiting for {AGENT_LABEL[producerId]}
            </p>
          </div>
          <p
            className={`mt-1.5 text-[11px] leading-[1.6] ${
              isFailed ? 'text-danger-ink/90' : 'text-muted'
            }`}
          >
            {isFailed
              ? (producerAgent.error ??
                executionError ??
                STATUS_MESSAGE.failed)
              : STATUS_MESSAGE[producerAgent.status]}
          </p>
          {sessionStatus === 'paused' ? (
            <p className="mt-2 text-[10.5px] text-warning-ink">
              Session paused — playback will continue from this agent.
            </p>
          ) : null}
        </div>
      )
    }

    const output = producerAgent.output
    if (!output) {
      return null
    }

    if (activeTab === 'plan' && output.type === 'planner') {
      return (
        <ResearchPlan
          plan={{
            researchQuestions: output.researchQuestions,
            searchKeywords: output.searchKeywords,
          }}
        />
      )
    }

    if (activeTab === 'literature' && output.type === 'researcher') {
      return (
        <LiteratureList
          literature={output.literature}
          retrievalPlan={output.retrievalPlan ?? null}
          live={currentSession.mode === 'live'}
        />
      )
    }

    if (activeTab === 'review' && output.type === 'reviewer') {
      return <ReviewPanel review={output.review} />
    }

    if (activeTab === 'report' && output.type === 'synthesizer') {
      return (
        <FinalReport
          report={output.finalReport}
          title={currentSession.title}
        />
      )
    }

    return null
  }

  return (
    <Panel className="xl:h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
            Research Results
          </h2>
          <p className="mt-1 text-[11.5px] leading-4 text-muted">
            Structured output from the four-agent run.
          </p>
        </div>
        {liveOutput ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[8.5px] font-semibold tracking-[0.07em] text-accent">
            <Radio className="size-3" />
            LIVE MODEL OUTPUT
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[8.5px] font-semibold tracking-[0.07em] text-warning-ink">
            <FlaskConical className="size-3" />
            DEMO DATA
          </span>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Research results"
        className="hide-scrollbar mt-4 flex gap-5 overflow-x-auto border-b border-line px-6"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 pb-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 ${
                active ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {active ? (
                <motion.span
                  layoutId="research-tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
        <motion.div
          key={`${currentSession?.sessionId ?? 'no-session'}-${activeTab}-${
            producerStatus ?? 'none'
          }`}
          role="tabpanel"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {renderContent()}
        </motion.div>
      </div>
    </Panel>
  )
}
