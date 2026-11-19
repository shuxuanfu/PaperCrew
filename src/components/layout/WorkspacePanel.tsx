import { motion } from 'framer-motion'
import {
  Microscope,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Square,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Panel } from '@/components/ui/Panel'
import { DEFAULT_DEMO_CASE_ID } from '@/data'
import { getCompleteness } from '@/services/config/configService'
import { listDemoSessions } from '@/services/demoDataService'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { RunState } from '@/types/ui'

const DEMO_CASES = listDemoSessions()

const RUN_META: Record<RunState, { label: string; dot: string }> = {
  idle: { label: 'Ready', dot: 'bg-[#c7c7cc]' },
  created: { label: 'Starting', dot: 'bg-accent' },
  running: { label: 'Running', dot: 'bg-accent' },
  paused: { label: 'Paused', dot: 'bg-warning' },
  completed: { label: 'Completed', dot: 'bg-success' },
  failed: { label: 'Failed', dot: 'bg-danger' },
  cancelled: { label: 'Cancelled', dot: 'bg-muted' },
}

const CASE_ICONS: LucideIcon[] = [Microscope, Workflow]

interface SecondaryAction {
  label: string
  icon: LucideIcon
  enabled: boolean
  onClick: () => void
}

export function WorkspacePanel() {
  const topic = useUiStore((state) => state.topic)
  const setTopic = useUiStore((state) => state.setTopic)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const setMobileView = useUiStore((state) => state.setMobileView)
  const demoState = useUiStore((state) => state.demoState)
  const demoError = useUiStore((state) => state.demoError)
  const activeCaseId = useUiStore((state) => state.activeCaseId)
  const loadCase = useUiStore((state) => state.loadCase)
  const openSettings = useUiStore((state) => state.openSettings)

  const sessionStatus = useSessionStore((state) => state.sessionStatus)
  const currentSession = useSessionStore((state) => state.currentSession)
  const liveInput = useSessionStore((state) => state.liveInput)
  const isCancelling = useSessionStore((state) => state.isCancelling)
  const executionError = useSessionStore((state) => state.error)
  const startSession = useSessionStore((state) => state.startSession)
  const pauseSession = useSessionStore((state) => state.pauseSession)
  const resumeSession = useSessionStore((state) => state.resumeSession)
  const cancelSession = useSessionStore((state) => state.cancelSession)
  const retryAgent = useSessionStore((state) => state.retryAgent)
  const restartSession = useSessionStore((state) => state.restartSession)

  const mode = useSettingsStore((state) => state.mode)
  const api = useSettingsStore((state) => state.api)

  const runState: RunState = sessionStatus ?? 'idle'
  const isActive =
    runState === 'created' || runState === 'running' || runState === 'paused'
  const demoReady = demoState === 'ready'
  const isLive = mode === 'live'
  const completeness = getCompleteness(api)
  const topicReady = topic.trim().length >= 4
  const liveReady = completeness.complete && topicReady
  const canStart =
    !isActive && !isCancelling && (isLive ? liveReady : demoReady)
  const canRestart =
    Boolean(currentSession) &&
    !isActive &&
    (isLive ? Boolean(liveInput) : demoReady)
  const runMeta = RUN_META[runState]

  const secondaryActions: SecondaryAction[] = [
    {
      label: 'Pause',
      icon: Pause,
      enabled: runState === 'running' && !isCancelling,
      onClick: pauseSession,
    },
    {
      label: 'Resume',
      icon: Play,
      enabled: runState === 'paused' && !isCancelling,
      onClick: resumeSession,
    },
    {
      label: isCancelling ? 'Cancelling…' : 'Cancel',
      icon: Square,
      enabled: (runState === 'running' || runState === 'paused') && !isCancelling,
      onClick: () => void cancelSession(),
    },
    {
      label: 'Retry',
      icon: RotateCcw,
      enabled: runState === 'failed',
      onClick: () => {
        setActiveTab('plan')
        setMobileView('process')
        void retryAgent()
      },
    },
    {
      label: 'Restart',
      icon: RefreshCw,
      enabled: canRestart,
      onClick: () => {
        setActiveTab('plan')
        setMobileView('process')
        void restartSession()
      },
    },
  ]

  const handleStart = () => {
    setActiveTab('plan')
    setMobileView('process')
    void startSession(isLive ? topic : undefined)
  }

  return (
    <Panel className="xl:h-full">
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
            Workspace
          </h2>
          <p className="mt-1 text-[11.5px] leading-4 text-muted">
            Define the question. Guide the run.
          </p>
        </div>
        <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-canvas px-2 py-1 text-[10px] font-medium text-muted">
          <span
            className={`size-1.5 rounded-full ${runMeta.dot} ${
              runState === 'running' ? 'animate-pulse' : ''
            }`}
          />
          {runMeta.label}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4 pt-3">
        <section>
          <div className="flex items-end justify-between gap-2">
            <label
              htmlFor="research-topic"
              className="text-[13px] font-semibold tracking-[-0.005em] text-ink"
            >
              Research Topic
            </label>
            <span className="text-[10px] tabular-nums text-muted/80">
              {topic.length}/500
            </span>
          </div>
          <textarea
            id="research-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            disabled={isActive}
            maxLength={500}
            rows={5}
            aria-describedby="research-topic-hint"
            className="mt-2 w-full resize-none rounded-xl bg-canvas px-3.5 py-3 text-[12.5px] leading-[1.7] text-ink transition-shadow placeholder:text-muted/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p
            id="research-topic-hint"
            className="mt-2 text-[10.5px] leading-4 text-muted"
          >
            Describe your research question and let PaperCrew explore it.
          </p>
        </section>

        {demoState === 'error' && demoError ? (
          <div role="alert" className="mt-4 rounded-xl bg-danger-soft p-3">
            <p className="text-[11px] font-semibold text-danger-ink">
              案例加载失败
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[10px] leading-[1.55] text-danger-ink/90">
              {demoError}
            </p>
            <button
              type="button"
              onClick={() =>
                void loadCase(activeCaseId ?? DEFAULT_DEMO_CASE_ID)
              }
              className="mt-2 rounded-md bg-danger px-2.5 py-1 text-[10px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              重新加载案例
            </button>
          </div>
        ) : null}

        {runState === 'failed' && executionError ? (
          <div role="alert" className="mt-4 rounded-xl bg-danger-soft p-3">
            <p className="text-[11px] font-semibold text-danger-ink">
              执行失败
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[10px] leading-[1.55] text-danger-ink/90">
              {executionError}
            </p>
            <button
              type="button"
              onClick={() => void retryAgent()}
              className="mt-2 rounded-md bg-danger px-2.5 py-1 text-[10px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              重试失败 Agent
            </button>
          </div>
        ) : null}

        <section className="mt-6" aria-labelledby="quick-start-title">
          <div className="flex items-baseline justify-between gap-2">
            <h3
              id="quick-start-title"
              className="text-[13px] font-semibold tracking-[-0.005em] text-ink"
            >
              Quick Start
            </h3>
            {demoState === 'loading' ? (
              <span className="text-[9.5px] text-muted">Loading demo…</span>
            ) : (
              <span className="text-[9.5px] text-muted">
                {isActive ? 'Switching cancels the run' : '2 demo datasets'}
              </span>
            )}
          </div>
          <div className="mt-2.5 space-y-2">
            {DEMO_CASES.map((item, index) => {
              const Icon = CASE_ICONS[index] ?? Microscope
              const selected = activeCaseId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void loadCase(item.id)}
                  aria-pressed={selected}
                  disabled={demoState === 'loading'}
                  className={`group flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? 'border-accent/25 bg-accent-soft/40 hover:bg-accent-soft/60'
                      : 'border-transparent bg-canvas hover:bg-[#ececef]'
                  }`}
                >
                  <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium leading-[1.45] text-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-4 text-muted">
                      {item.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-6" aria-labelledby="task-control-title">
          <h3
            id="task-control-title"
            className="text-[13px] font-semibold tracking-[-0.005em] text-ink"
          >
            Task Control
          </h3>

          {isLive && !completeness.complete ? (
            <div className="mt-3 rounded-lg bg-warning-soft px-3 py-2.5">
              <p className="text-[10.5px] font-semibold text-warning-ink">
                LIVE 配置不完整
              </p>
              <p className="mt-0.5 text-[10px] leading-[1.55] text-warning-ink/90">
                缺少{' '}
                {[
                  !completeness.baseUrl ? 'Base URL' : null,
                  !completeness.apiKey ? 'API Key' : null,
                  !completeness.modelName ? 'Model Name' : null,
                ]
                  .filter(Boolean)
                  .join('、')}
                。请先在 API Settings 中补全配置。
              </p>
              <button
                type="button"
                onClick={openSettings}
                className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-accent transition-colors hover:text-accent-ink"
              >
                <Settings2 className="size-3" />
                Configure API
              </button>
            </div>
          ) : null}

          {isLive && completeness.complete && !topicReady ? (
            <p className="mt-2 text-[10px] leading-4 text-muted">
              研究课题至少需要 4 个字符才能启动 LIVE 运行。
            </p>
          ) : null}

          <motion.button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            whileTap={canStart ? { scale: 0.985 } : undefined}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,122,255,0.2)] transition-colors hover:bg-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
          >
            <Play className="size-3.5" fill="currentColor" />
            {isLive ? 'Start LIVE Run' : 'Start Research'}
          </motion.button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {secondaryActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={!action.enabled}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-canvas text-[11px] font-medium text-ink/75 transition-colors hover:bg-[#ececef] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-canvas disabled:hover:text-ink/75"
                >
                  <Icon className="size-3.5" />
                  {action.label}
                </button>
              )
            })}
          </div>
        </section>

        <div className="mt-auto pt-6">
          <div className="rounded-xl bg-canvas p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                <span
                  className={`size-1.5 rounded-full ${
                    mode === 'demo' ? 'bg-success' : 'bg-accent'
                  }`}
                />
                {mode === 'demo' ? 'DEMO Mode' : 'LIVE Mode'}
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
                Current
              </span>
            </div>
            <p className="mt-1 text-[10.5px] leading-4 text-muted">
              {mode === 'demo'
                ? 'Demo Player replays validated local JSON. No API key required.'
                : completeness.complete
                  ? `LIVE sends structured prompts to ${api.modelName} directly from this browser. Requests may incur provider costs.`
                  : 'API settings are incomplete for LIVE mode.'}
            </p>
            {mode === 'live' && !completeness.complete ? (
              <button
                type="button"
                onClick={openSettings}
                className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-accent transition-colors hover:text-accent-ink"
              >
                <Settings2 className="size-3" />
                Configure API
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-[9.5px] leading-4 text-muted/90">
            The execution engine runs four agents in serial order. DEMO replays
            validated local JSON; LIVE sends structured prompts to your
            OpenAI-compatible endpoint and validates every response with Zod.
          </p>
        </div>
      </div>
    </Panel>
  )
}
