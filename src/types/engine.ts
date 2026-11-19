import type { RunMode } from '@/domain/agent/ids'
import type {
  AgentId,
  AgentOutput,
  AgentStatus,
  DemoAgent,
} from '@/types/agent'
import type { AgentEvent, SessionStatus } from '@/types/session'

export interface RunAgent extends Omit<DemoAgent, 'output'> {
  output: AgentOutput | null
}

export interface LiveRunInfo {
  description: string | null
}

export interface RunSession {
  sessionId: string
  templateId: string | null
  title: string
  description: string
  topic: string
  mode: RunMode
  live: LiveRunInfo | null
  status: SessionStatus
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  agents: RunAgent[]
  events: AgentEvent[]
  error: string | null
}

export function isProduced(
  agent: RunAgent,
): agent is RunAgent & { output: AgentOutput } {
  return agent.output !== null
}

export interface UpstreamAgentResult {
  agentId: AgentId
  output: AgentOutput
}

export interface AgentContext {
  session: Readonly<RunSession>
  agentId: AgentId
  upstream: ReadonlyArray<UpstreamAgentResult>
  signal: AbortSignal
}

export type AgentResult =
  | {
      status: 'completed' | 'fallback'
      output: AgentOutput
      summary?: string
      fallbackReason?: string
      source?: RunMode
    }
  | {
      status: 'failed'
      error: string
    }

export interface AgentPlaybook {
  durationMs?: number
  startedMessage?: string
  progressMessages?: string[]
  completedMessage?: string
}

export interface AgentExecutor {
  execute(context: AgentContext): Promise<AgentResult>
  getPlaybook?(agentId: AgentId): AgentPlaybook | null
}

export interface ExecutionMeta {
  currentAgentId: AgentId | null
  event: AgentEvent | null
}

export type ExecutionUpdateHandler = (
  session: RunSession,
  meta: ExecutionMeta,
) => void

export type { AgentId, AgentStatus }
