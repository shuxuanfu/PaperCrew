import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  Compass,
  FileText,
  Search,
  ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { AgentId } from '@/domain/agent/ids'
import type { AgentOutput } from '@/types/agent'
import { isProduced, type RunAgent } from '@/types/engine'
import type { AgentStatus } from '@/types/ui'

const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  planner: Compass,
  researcher: Search,
  reviewer: ShieldCheck,
  synthesizer: FileText,
}

const STATUS_META: Record<
  AgentStatus,
  { label: string; dot: string; pill: string }
> = {
  idle: {
    label: 'Idle',
    dot: 'bg-[#c7c7cc]',
    pill: 'bg-canvas text-muted',
  },
  pending: {
    label: 'Pending',
    dot: 'bg-warning',
    pill: 'bg-warning-soft text-warning-ink',
  },
  running: {
    label: 'Running',
    dot: 'bg-accent',
    pill: 'bg-accent-soft text-accent',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-success',
    pill: 'bg-success-soft text-success-ink',
  },
  failed: {
    label: 'Failed',
    dot: 'bg-danger',
    pill: 'bg-danger-soft text-danger-ink',
  },
  fallback: {
    label: 'Fallback',
    dot: 'bg-warning',
    pill: 'bg-warning-soft text-warning-ink',
  },
  skipped: {
    label: 'Skipped',
    dot: 'bg-[#c7c7cc]',
    pill: 'bg-canvas text-muted',
  },
}

const PAUSED_META = {
  label: 'Paused',
  dot: 'bg-warning',
  pill: 'bg-warning-soft text-warning-ink',
}

const ICON_TONE: Record<AgentStatus, string> = {
  idle: 'bg-canvas text-muted',
  pending: 'bg-warning-soft text-warning-ink',
  running: 'bg-accent-soft text-accent',
  completed: 'bg-success-soft text-success-ink',
  failed: 'bg-danger-soft text-danger-ink',
  fallback: 'bg-warning-soft text-warning-ink',
  skipped: 'bg-canvas text-muted',
}

function outputHighlights(output: AgentOutput): string[] {
  switch (output.type) {
    case 'planner':
      return output.researchQuestions.map((item) => item.question)
    case 'researcher':
      return output.literature.length > 0
        ? output.literature.map((item) => item.title)
        : ['No real sources retrieved in LIVE mode']
    case 'reviewer':
      return output.review.map(
        (item) => `${item.title} · ${item.severity.toUpperCase()}`,
      )
    case 'synthesizer':
      return [
        'Evidence / Hypothesis / Proposal 分区',
        '9 个章节的 Markdown 报告',
        `${output.finalReport.length} 字符正文`,
      ]
  }
}

interface AgentCardProps {
  agent: RunAgent
  status: AgentStatus
  isLast: boolean
  isPaused: boolean
  expanded: boolean
  onToggle: () => void
}

export function AgentCard({
  agent,
  status,
  isLast,
  isPaused,
  expanded,
  onToggle,
}: AgentCardProps) {
  const Icon = AGENT_ICONS[agent.id]
  const paused = isPaused && status === 'running'
  const meta = paused ? PAUSED_META : STATUS_META[status]
  const iconTone = paused ? 'bg-warning-soft text-warning-ink' : ICON_TONE[status]
  const active = status === 'running'
  const outputReady =
    (status === 'completed' || status === 'fallback') && isProduced(agent)

  let outputText = agent.output?.summary ?? 'No output has been produced yet.'
  if (paused) {
    outputText = 'Paused. Resume the run to continue generation.'
  } else if (status === 'running') {
    outputText = 'Generating output from the upstream context…'
  } else if (status === 'failed') {
    outputText = agent.error ?? 'The agent failed before producing an output.'
  } else if (status === 'skipped') {
    outputText = 'Skipped — the run was cancelled.'
  } else if (status === 'idle') {
    outputText = 'Demo 会话已加载，等待运行以展示该 Agent 的产物。'
  } else if (status === 'pending') {
    outputText = 'Queued behind the previous agent.'
  }

  const detailId = `agent-detail-${agent.id}`
  const durationLabel =
    agent.durationMs !== null
      ? `${(agent.durationMs / 1000).toFixed(1)}s`
      : null

  return (
    <li className="flex gap-3">
      <div className="flex w-9 shrink-0 flex-col items-center">
        <span
          className={`flex size-9 items-center justify-center rounded-[10px] transition-colors ${iconTone}`}
        >
          <Icon className="size-[17px]" />
        </span>
        {!isLast ? (
          <span
            className={`mt-1.5 w-px flex-1 ${
              status === 'completed' ? 'bg-accent/25' : 'bg-line'
            }`}
          />
        ) : null}
      </div>

      <div
        className={`min-w-0 flex-1 rounded-xl px-3.5 py-3 transition-colors ${
          paused
            ? 'bg-warning-soft/40'
            : active
              ? 'bg-accent-soft/50'
              : 'hover:bg-canvas/70'
        } ${isLast ? '' : 'mb-4'}`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
                  {agent.name}
                </span>
                <span className="text-[10.5px] text-muted">{agent.role}</span>
              </div>
            </div>

            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${meta.pill}`}
            >
              <span
                className={`size-1.5 rounded-full ${meta.dot} ${
                  status === 'running' && !paused ? 'animate-pulse' : ''
                }`}
              />
              {meta.label}
            </span>
          </div>

          <p className="mt-2 text-[11.5px] leading-[1.6] text-muted">
            {agent.description}
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-muted/90">
              Input · {agent.input.objective}
            </span>
            <ChevronDown
              className={`size-3.5 shrink-0 text-muted transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="detail"
              id={detailId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3 border-t border-line/80 pt-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted/80">
                    Input
                  </p>
                  <p className="mt-1 text-[11px] leading-[1.6] text-ink/75">
                    {agent.input.objective}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {agent.input.context.map((item) => (
                      <li
                        key={item}
                        className="flex gap-1.5 text-[10.5px] leading-[1.55] text-muted"
                      >
                        <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted/60" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[10px] leading-[1.5] text-muted/80">
                    约束 · {agent.input.constraints.join('；')}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted/80">
                      Output
                    </p>
                    {durationLabel ? (
                      <span className="text-[9px] tabular-nums text-muted/70">
                        {durationLabel}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`mt-1 text-[11px] leading-[1.6] ${
                      outputReady ? 'text-ink/75' : 'text-muted'
                    }`}
                  >
                    {outputText}
                  </p>
                  {outputReady && isProduced(agent) ? (
                    <ul className="mt-1.5 space-y-1">
                      {outputHighlights(agent.output).map((item) => (
                        <li
                          key={item}
                          className="flex gap-1.5 text-[10.5px] leading-[1.55] text-muted"
                        >
                          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-success/70" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </li>
  )
}
