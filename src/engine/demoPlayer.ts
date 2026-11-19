import { DemoExecutor } from '@/agents/demoExecutor'
import { Orchestrator } from '@/engine/orchestrator'
import type {
  AgentExecutor,
  ExecutionUpdateHandler,
  RunAgent,
  RunSession,
} from '@/types/engine'
import type { DemoSession } from '@/types/session'
import type { AgentId } from '@/domain/agent/ids'

let runCounter = 0

export interface DemoPlayerOptions {
  now?: () => string
  resolveStepDuration?: (agentId: AgentId, baseDurationMs: number) => number
  onUpdate?: ExecutionUpdateHandler
  executorFactory?: (template: DemoSession) => AgentExecutor
}

export class DemoPlayer {
  private readonly template: DemoSession
  private readonly options: DemoPlayerOptions

  constructor(template: DemoSession, options: DemoPlayerOptions = {}) {
    this.template = template
    this.options = options
  }

  createSession(): RunSession {
    const now = this.options.now ?? (() => new Date().toISOString())
    const timestamp = now()
    runCounter += 1
    const sessionId = `run-${this.template.sessionId}-${Date.now().toString(
      36,
    )}-${runCounter}`

    const cloned = structuredClone(this.template)
    const createdEvent = {
      id: `${sessionId}-evt-1`,
      type: 'session_created' as const,
      agentId: null,
      timestamp,
      message:
        cloned.events.find((event) => event.type === 'session_created')
          ?.message ??
        `已创建 Demo 运行会话：${cloned.title}。`,
      payload: {
        templateId: cloned.sessionId,
        mode: 'demo',
      },
    }

    const agents: RunAgent[] = cloned.agents.map((agent) => ({
      ...agent,
      status: 'idle',
      startedAt: null,
      completedAt: null,
      durationMs: null,
      error: null,
      fallbackReason: null,
    }))

    return {
      sessionId,
      templateId: cloned.sessionId,
      title: cloned.title,
      description: cloned.description,
      topic: cloned.topic,
      mode: 'demo',
      live: null,
      status: 'created',
      createdAt: timestamp,
      startedAt: null,
      completedAt: null,
      agents,
      events: [createdEvent],
      error: null,
    }
  }

  createOrchestrator(session: RunSession): Orchestrator {
    const executor =
      this.options.executorFactory?.(this.template) ??
      new DemoExecutor(this.template)

    return new Orchestrator(session, {
      executor,
      onUpdate: this.options.onUpdate,
      now: this.options.now,
      resolveStepDuration: this.options.resolveStepDuration,
    })
  }
}
