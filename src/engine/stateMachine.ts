import type { AgentStatus } from '@/types/agent'
import type { SessionStatus } from '@/types/session'
import type { RunAgent, RunSession } from '@/types/engine'

export const AGENT_TRANSITIONS: Record<AgentStatus, readonly AgentStatus[]> = {
  idle: ['pending'],
  pending: ['running', 'skipped'],
  running: ['completed', 'failed', 'fallback', 'skipped'],
  completed: [],
  failed: ['pending'],
  fallback: [],
  skipped: [],
}

export const SESSION_TRANSITIONS: Record<
  SessionStatus,
  readonly SessionStatus[]
> = {
  created: ['running', 'cancelled'],
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  completed: [],
  failed: ['running'],
  cancelled: [],
}

export class StateTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StateTransitionError'
  }
}

export function canTransitionAgent(
  from: AgentStatus,
  to: AgentStatus,
): boolean {
  return AGENT_TRANSITIONS[from].includes(to)
}

export function canTransitionSession(
  from: SessionStatus,
  to: SessionStatus,
): boolean {
  return SESSION_TRANSITIONS[from].includes(to)
}

export function assertAgentTransition(
  from: AgentStatus,
  to: AgentStatus,
): void {
  if (!canTransitionAgent(from, to)) {
    throw new StateTransitionError(
      `非法 Agent 状态转换：${from} → ${to}`,
    )
  }
}

export function assertSessionTransition(
  from: SessionStatus,
  to: SessionStatus,
): void {
  if (!canTransitionSession(from, to)) {
    throw new StateTransitionError(
      `非法 Session 状态转换：${from} → ${to}`,
    )
  }
}

export interface AgentTransitionOptions {
  now: string
  error?: string | null
  fallbackReason?: string | null
}

function elapsedSince(start: string | null, end: string): number | null {
  if (start === null) {
    return null
  }
  const duration = Date.parse(end) - Date.parse(start)
  return Number.isFinite(duration) ? Math.max(0, duration) : null
}

export function transitionAgent(
  agent: RunAgent,
  next: AgentStatus,
  options: AgentTransitionOptions,
): RunAgent {
  assertAgentTransition(agent.status, next)
  const timestamp = options.now

  switch (next) {
    case 'pending':
      return {
        ...agent,
        status: next,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        fallbackReason: null,
      }
    case 'running':
      return {
        ...agent,
        status: next,
        startedAt: timestamp,
        completedAt: null,
        durationMs: null,
        error: null,
        fallbackReason: null,
      }
    case 'completed': {
      const durationMs = elapsedSince(agent.startedAt, timestamp)
      return {
        ...agent,
        status: next,
        completedAt: timestamp,
        durationMs: durationMs ?? 0,
        error: null,
        fallbackReason: null,
      }
    }
    case 'fallback': {
      const durationMs = elapsedSince(agent.startedAt, timestamp)
      return {
        ...agent,
        status: next,
        completedAt: timestamp,
        durationMs: durationMs ?? 0,
        error: null,
        fallbackReason:
          options.fallbackReason?.trim() || 'Fallback output from demo data.',
      }
    }
    case 'failed': {
      const durationMs = elapsedSince(agent.startedAt, timestamp)
      return {
        ...agent,
        status: next,
        completedAt: timestamp,
        durationMs: durationMs ?? 0,
        error: options.error?.trim() || 'Agent execution failed.',
        fallbackReason: null,
      }
    }
    case 'skipped':
      return {
        ...agent,
        status: next,
        error: null,
        fallbackReason: null,
      }
    case 'idle':
      return {
        ...agent,
        status: next,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        fallbackReason: null,
      }
  }
}

export function isAgentFinished(status: AgentStatus): boolean {
  return status === 'completed' || status === 'fallback'
}

export function areAllAgentsFinished(agents: RunAgent[]): boolean {
  return (
    agents.length > 0 && agents.every((agent) => isAgentFinished(agent.status))
  )
}

export interface SessionTransitionOptions {
  now: string
  error?: string | null
}

export function transitionSession(
  session: RunSession,
  next: SessionStatus,
  options: SessionTransitionOptions,
): RunSession {
  assertSessionTransition(session.status, next)

  if (next === 'completed' && !areAllAgentsFinished(session.agents)) {
    throw new StateTransitionError(
      '所有 Agent 成功完成前，Session 不能进入 completed',
    )
  }

  const timestamp = options.now

  switch (next) {
    case 'running':
      return {
        ...session,
        status: next,
        startedAt: session.startedAt ?? timestamp,
        completedAt: null,
        error: null,
      }
    case 'completed':
      return {
        ...session,
        status: next,
        completedAt: timestamp,
        error: null,
      }
    case 'failed':
      return {
        ...session,
        status: next,
        completedAt: timestamp,
        error: options.error?.trim() || 'Session execution failed.',
      }
    case 'cancelled':
      return {
        ...session,
        status: next,
        completedAt: timestamp,
      }
    case 'paused':
    case 'created':
      return {
        ...session,
        status: next,
      }
  }
}
