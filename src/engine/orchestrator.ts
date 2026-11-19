import { AGENT_IDS, type AgentId } from '@/domain/agent/ids'
import { PlaybackClock } from '@/engine/playbackClock'
import {
  StateTransitionError,
  isAgentFinished,
  transitionAgent,
  transitionSession,
} from '@/engine/stateMachine'
import {
  isProduced,
  type AgentExecutor,
  type ExecutionUpdateHandler,
  type RunSession,
  type UpstreamAgentResult,
} from '@/types/engine'
import type { AgentStatus } from '@/types/agent'
import type {
  AgentEvent,
  AgentEventType,
  SessionStatus,
} from '@/types/session'

export interface OrchestratorOptions {
  executor: AgentExecutor
  onUpdate?: ExecutionUpdateHandler
  now?: () => string
  resolveStepDuration?: (agentId: AgentId, baseDurationMs: number) => number
}

interface AgentUpdateOptions {
  eventType: AgentEventType
  message: string
  error?: string | null
  fallbackReason?: string | null
  output?: RunSession['agents'][number]['output']
  payload?: Record<string, unknown>
}

export class Orchestrator {
  private session: RunSession
  private readonly executor: AgentExecutor
  private readonly onUpdate?: ExecutionUpdateHandler
  private readonly now: () => string
  private readonly resolveStepDuration: (
    agentId: AgentId,
    baseDurationMs: number,
  ) => number
  private readonly clock = new PlaybackClock()
  private abortController = new AbortController()
  private currentAgentId: AgentId | null = null
  private eventSeq: number
  private started = false
  private disposed = false

  constructor(session: RunSession, options: OrchestratorOptions) {
    this.session = session
    this.executor = options.executor
    this.onUpdate = options.onUpdate
    this.now = options.now ?? (() => new Date().toISOString())
    this.resolveStepDuration =
      options.resolveStepDuration ?? ((_agentId, baseMs) => baseMs)
    this.eventSeq = session.events.length
  }

  getSession(): RunSession {
    return structuredClone(this.session)
  }

  getCurrentAgentId(): AgentId | null {
    return this.currentAgentId
  }

  start(): Promise<void> {
    if (this.started) {
      throw new StateTransitionError('Orchestrator 已经启动，不能重复启动')
    }
    this.started = true
    return this.runInitial()
  }

  pause(): boolean {
    if (this.session.status !== 'running') {
      return false
    }
    this.clock.pause()
    this.changeSessionStatus(
      'paused',
      'session_paused',
      'Session paused. The current agent will not advance until resumed.',
      { currentAgentId: this.currentAgentId },
    )
    return true
  }

  resume(): boolean {
    if (this.session.status !== 'paused') {
      return false
    }
    this.changeSessionStatus(
      'running',
      'session_resumed',
      'Session resumed from the paused step.',
      { currentAgentId: this.currentAgentId },
    )
    this.clock.resume()
    return true
  }

  cancel(): boolean {
    if (
      this.session.status !== 'running' &&
      this.session.status !== 'paused'
    ) {
      return false
    }

    this.clock.cancel()
    this.abortController.abort()

    for (const agent of this.session.agents) {
      if (agent.status === 'running' || agent.status === 'pending') {
        this.updateAgent(agent.id, 'skipped', {
          eventType: 'agent_skipped',
          message: `${agent.name} skipped because the session was cancelled.`,
        })
      }
    }

    this.currentAgentId = null
    this.changeSessionStatus(
      'cancelled',
      'session_cancelled',
      'Session cancelled. No further agents will be started.',
    )
    return true
  }

  retry(): Promise<void> | null {
    if (this.session.status !== 'failed') {
      return null
    }

    const failedIndex = this.session.agents.findIndex(
      (agent) => agent.status === 'failed',
    )
    if (failedIndex < 0) {
      return null
    }

    const failedAgent = this.session.agents[failedIndex]
    this.abortController = new AbortController()
    this.clock.reset()
    this.currentAgentId = null

    this.updateAgent(failedAgent.id, 'pending', {
      eventType: 'agent_progress',
      message: `Retrying ${failedAgent.name} from the failed step.`,
      payload: { from: 'failed', to: 'pending', retry: true },
    })
    this.changeSessionStatus(
      'running',
      'session_resumed',
      `Retrying ${failedAgent.name}. Completed agents will not run again.`,
      { retry: true, agentId: failedAgent.id },
    )

    return this.runFrom(failedIndex)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.clock.cancel()
    this.abortController.abort()
  }

  private async runInitial(): Promise<void> {
    try {
      this.changeSessionStatus(
        'running',
        'session_started',
        'Session started. Agents run in serial order.',
        { agentOrder: [...AGENT_IDS] },
      )

      for (const agent of this.session.agents) {
        if (agent.status === 'idle') {
          this.updateAgent(agent.id, 'pending', {
            eventType: 'agent_progress',
            message: `${agent.name} queued behind the previous agent.`,
            payload: { from: 'idle', to: 'pending' },
          })
        }
      }

      await this.runFrom(0)
    } catch (error) {
      this.failUnexpected(error)
    }
  }

  private async runFrom(startIndex: number): Promise<void> {
    try {
      for (let index = startIndex; index < AGENT_IDS.length; index += 1) {
        if (this.disposed || this.session.status !== 'running') {
          return
        }
        if (!(await this.clock.wait(0))) {
          return
        }
        if (this.disposed || this.session.status !== 'running') {
          return
        }

        const agentId = AGENT_IDS[index]
        const agent = this.session.agents[index]
        if (!agent || agent.id !== agentId) {
          throw new Error(`Agent 顺序异常：期望 ${agentId}`)
        }
        if (isAgentFinished(agent.status)) {
          continue
        }
        if (agent.status === 'skipped') {
          continue
        }
        if (agent.status === 'idle') {
          this.updateAgent(agentId, 'pending', {
            eventType: 'agent_progress',
            message: `${agent.name} queued behind the previous agent.`,
            payload: { from: 'idle', to: 'pending' },
          })
        }
        if (this.session.agents[index].status !== 'pending') {
          throw new Error(
            `Agent「${agentId}」无法从 ${this.session.agents[index].status} 启动`,
          )
        }

        this.currentAgentId = agentId
        const playbook = this.executor.getPlaybook?.(agentId) ?? null
        this.updateAgent(agentId, 'running', {
          eventType: 'agent_started',
          message:
            playbook?.startedMessage ??
            `${agent.name} started with upstream context.`,
          payload: { from: 'pending', to: 'running' },
        })

        const baseDuration = playbook?.durationMs ?? 0
        const duration = Math.max(
          0,
          this.resolveStepDuration(agentId, baseDuration),
        )

        if (duration > 0) {
          const firstHalf = Math.max(1, Math.floor(duration / 2))
          if (!(await this.clock.wait(firstHalf))) {
            return
          }
          if (this.disposed || this.isCancelled()) {
            return
          }
          this.emitEvent(
            'agent_progress',
            agentId,
            playbook?.progressMessages?.[0] ??
              `${agent.name} is processing upstream context.`,
            { percent: 50 },
          )
          if (!(await this.clock.wait(duration - firstHalf))) {
            return
          }
        }

        if (!(await this.clock.wait(0))) {
          return
        }
        if (this.disposed || this.isCancelled()) {
          return
        }

        const upstream = this.collectUpstream(index)
        let result
        try {
          result = await this.executor.execute({
            session: structuredClone(this.session),
            agentId,
            upstream,
            signal: this.abortController.signal,
          })
        } catch (error) {
          if (this.disposed || this.isCancelled()) {
            return
          }
          this.failAgent(
            agentId,
            error instanceof Error ? error.message : String(error),
          )
          return
        }

        if (this.disposed || this.isCancelled()) {
          return
        }
        if (!(await this.clock.wait(0))) {
          return
        }
        if (this.disposed || this.isCancelled()) {
          return
        }

        if (result.status === 'failed') {
          this.failAgent(agentId, result.error)
          return
        }

        this.updateAgent(agentId, result.status, {
          eventType:
            result.status === 'fallback' ? 'agent_fallback' : 'agent_completed',
          message:
            result.status === 'fallback'
              ? (result.fallbackReason ??
                `${agent.name} produced a fallback output.`)
              : (playbook?.completedMessage ??
                `${agent.name} completed and handed off its output.`),
          fallbackReason: result.fallbackReason ?? null,
          output: result.output,
          payload: {
            outputType: result.output.type,
            summary: result.summary ?? result.output.summary,
            source: result.source ?? this.session.mode,
          },
        })
      }

      if (this.disposed || this.session.status !== 'running') {
        return
      }
      this.currentAgentId = null
      this.changeSessionStatus(
        'completed',
        'session_completed',
        'All four agents completed. Session finished successfully.',
        {
          completed: this.session.agents.map((agent) => agent.id),
        },
      )
    } catch (error) {
      this.failUnexpected(error)
    }
  }

  private isCancelled(): boolean {
    return this.session.status === 'cancelled'
  }

  private collectUpstream(startIndex: number): UpstreamAgentResult[] {
    return this.session.agents
      .slice(0, startIndex)
      .flatMap((agent) =>
        isAgentFinished(agent.status) && isProduced(agent)
          ? [{ agentId: agent.id, output: agent.output }]
          : [],
      )
  }

  private failAgent(agentId: AgentId, error: string): void {
    const agent = this.session.agents.find((item) => item.id === agentId)
    if (!agent) {
      return
    }

    if (agent.status === 'running') {
      this.updateAgent(agentId, 'failed', {
        eventType: 'agent_failed',
        message: `${agent.name} failed: ${error}`,
        error,
      })
    }

    if (this.session.status === 'running') {
      this.currentAgentId = null
      this.changeSessionStatus(
        'failed',
        null,
        `Session failed while running ${agent.name}.`,
        { failedAgentId: agentId, error },
        error,
      )
    }
  }

  private failUnexpected(error: unknown): void {
    if (this.disposed) {
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    const running = this.session.agents.find(
      (agent) => agent.status === 'running',
    )
    if (running) {
      this.failAgent(running.id, message)
      return
    }
    if (this.session.status === 'running') {
      this.currentAgentId = null
      this.changeSessionStatus(
        'failed',
        null,
        `Session failed: ${message}`,
        { error: message },
        message,
      )
    }
  }

  private updateAgent(
    agentId: AgentId,
    next: AgentStatus,
    options: AgentUpdateOptions,
  ): void {
    const agent = this.session.agents.find((item) => item.id === agentId)
    if (!agent) {
      throw new Error(`Unknown agent「${agentId}」`)
    }

    const timestamp = this.now()
    const updated = transitionAgent(agent, next, {
      now: timestamp,
      error: options.error,
      fallbackReason: options.fallbackReason,
    })
    const withOutput =
      options.output !== undefined
        ? { ...updated, output: options.output }
        : updated

    this.session = {
      ...this.session,
      agents: this.session.agents.map((item) =>
        item.id === agentId ? withOutput : item,
      ),
    }

    const event = this.createEvent(
      options.eventType,
      agentId,
      options.message,
      { from: agent.status, to: next, ...options.payload },
      timestamp,
    )
    this.emit(event)
  }

  private changeSessionStatus(
    next: SessionStatus,
    eventType: AgentEventType | null,
    message: string,
    payload?: Record<string, unknown>,
    error?: string,
  ): void {
    const timestamp = this.now()
    this.session = transitionSession(this.session, next, {
      now: timestamp,
      error,
    })
    let event: AgentEvent | null = null
    if (eventType !== null) {
      event = this.createEvent(
        eventType,
        null,
        message,
        payload,
        timestamp,
      )
      this.emit(event)
      return
    }
    this.emit(null)
  }

  private emitEvent(
    type: AgentEventType,
    agentId: AgentId,
    message: string,
    payload?: Record<string, unknown>,
  ): void {
    const event = this.createEvent(type, agentId, message, payload)
    this.emit(event)
  }

  private createEvent(
    type: AgentEventType,
    agentId: AgentId | null,
    message: string,
    payload?: Record<string, unknown>,
    timestamp = this.now(),
  ): AgentEvent {
    this.eventSeq += 1
    const event: AgentEvent = {
      id: `${this.session.sessionId}-evt-${this.eventSeq}`,
      type,
      agentId,
      timestamp,
      message,
    }
    if (payload !== undefined) {
      event.payload = payload
    }
    this.session = {
      ...this.session,
      events: [...this.session.events, event],
    }
    return event
  }

  private emit(event: AgentEvent | null): void {
    if (this.disposed || !this.onUpdate) {
      return
    }
    this.onUpdate(structuredClone(this.session), {
      currentAgentId: this.currentAgentId,
      event: event ? structuredClone(event) : null,
    })
  }
}
