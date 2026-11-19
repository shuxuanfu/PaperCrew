import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check, RotateCcw } from 'lucide-react'

import { AgentCard } from '@/components/agents/AgentCard'
import { Panel } from '@/components/ui/Panel'
import { DEFAULT_DEMO_CASE_ID } from '@/data'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'

export function AgentTimeline() {
  const template = useSessionStore((state) => state.template)
  const currentSession = useSessionStore((state) => state.currentSession)
  const currentAgentId = useSessionStore((state) => state.currentAgentId)
  const sessionStatus = useSessionStore((state) => state.sessionStatus)
  const executionError = useSessionStore((state) => state.error)
  const retryAgent = useSessionStore((state) => state.retryAgent)

  const demoState = useUiStore((state) => state.demoState)
  const demoError = useUiStore((state) => state.demoError)
  const activeCaseId = useUiStore((state) => state.activeCaseId)
  const loadCase = useUiStore((state) => state.loadCase)
  const expandedAgents = useUiStore((state) => state.expandedAgents)
  const toggleAgent = useUiStore((state) => state.toggleAgent)
  const expandAgent = useUiStore((state) => state.expandAgent)

  useEffect(() => {
    if (currentAgentId) {
      expandAgent(currentAgentId)
    }
  }, [currentAgentId, expandAgent])

  const agents = currentSession?.agents ?? template?.agents ?? []
  const statusFor = (index: number) =>
    currentSession ? currentSession.agents[index].status : 'idle'
  const completedCount = currentSession
    ? currentSession.agents.filter(
        (agent) => agent.status === 'completed' || agent.status === 'fallback',
      ).length
    : 0
  const progress = agents.length ? (completedCount / agents.length) * 100 : 0
  const isPaused = sessionStatus === 'paused'

  return (
    <Panel className="xl:h-full">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
              Research Process
            </h2>
            <p className="mt-1 max-w-[300px] text-[11.5px] leading-[1.5] text-muted">
              Four AI agents working together to explore your research question.
            </p>
          </div>
          <span className="mt-1 text-[10px] font-medium tabular-nums text-muted">
            {completedCount}/{agents.length || 4}
          </span>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-canvas">
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">
        {!agents.length ? (
          demoState === 'error' ? (
            <div role="alert" className="rounded-xl bg-danger-soft p-3.5">
              <p className="text-[11.5px] font-semibold text-danger-ink">
                无法加载 Demo 会话
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
                重新加载
              </button>
            </div>
          ) : (
            <div className="space-y-3" aria-live="polite">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex animate-pulse items-start gap-3"
                >
                  <span className="size-9 shrink-0 rounded-[10px] bg-canvas" />
                  <span className="mt-1 h-4 flex-1 rounded bg-canvas" />
                </div>
              ))}
              <p className="pt-2 text-[10.5px] text-muted">
                Loading demo session…
              </p>
            </div>
          )
        ) : (
          <>
            <ol aria-label="Agent execution order">
              {agents.map((agent, index) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  status={statusFor(index)}
                  isLast={index === agents.length - 1}
                  isPaused={isPaused}
                  expanded={expandedAgents[agent.id]}
                  onToggle={() => toggleAgent(agent.id)}
                />
              ))}
            </ol>

            {sessionStatus === 'completed' ? (
              <motion.div
                key="completed"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="ml-12 flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2.5"
              >
                <Check className="mt-0.5 size-3.5 shrink-0 text-success-ink" />
                <p className="text-[10.5px] leading-4 text-success-ink">
                  All four agents completed. Session finished successfully.
                </p>
              </motion.div>
            ) : null}

            {sessionStatus === 'failed' ? (
              <div
                role="alert"
                className="ml-12 mt-1 rounded-xl bg-danger-soft px-3 py-2.5"
              >
                <p className="text-[10.5px] leading-4 text-danger-ink">
                  {executionError ?? 'An agent failed before completing.'}
                </p>
                <button
                  type="button"
                  onClick={() => void retryAgent()}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-danger-ink underline-offset-2 hover:underline"
                >
                  <RotateCcw className="size-3" />
                  Retry failed agent
                </button>
              </div>
            ) : null}

            {sessionStatus === 'cancelled' ? (
              <div className="ml-12 mt-1 rounded-xl bg-warning-soft px-3 py-2.5">
                <p className="text-[10.5px] leading-4 text-warning-ink">
                  Run cancelled. Completed stages are preserved; restart to
                  replay from Planner.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  )
}
