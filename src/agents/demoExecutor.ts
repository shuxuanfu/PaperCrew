import type {
  AgentContext,
  AgentExecutor,
  AgentPlaybook,
  AgentResult,
} from '@/engine/agentExecutor'
import type { AgentId } from '@/domain/agent/ids'
import type { DemoSession } from '@/types/session'

function abortError(): Error {
  const error = new Error('Agent execution aborted')
  error.name = 'AbortError'
  return error
}

export class DemoExecutor implements AgentExecutor {
  private readonly template: DemoSession

  constructor(template: DemoSession) {
    this.template = template
  }

  getPlaybook(agentId: AgentId): AgentPlaybook | null {
    const agent = this.template.agents.find((item) => item.id === agentId)
    if (!agent) {
      return null
    }

    const events = this.template.events.filter(
      (event) => event.agentId === agentId,
    )
    const started = events.find((event) => event.type === 'agent_started')
    const progress = events
      .filter((event) => event.type === 'agent_progress')
      .map((event) => event.message)
    const completed = events.find(
      (event) =>
        event.type === 'agent_completed' || event.type === 'agent_fallback',
    )

    return {
      durationMs: agent.durationMs ?? 0,
      startedMessage: started?.message,
      progressMessages: progress,
      completedMessage: completed?.message,
    }
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    if (context.signal.aborted) {
      throw abortError()
    }

    const agent = this.template.agents.find(
      (item) => item.id === context.agentId,
    )
    if (!agent) {
      return {
        status: 'failed',
        error: `Demo 数据缺少 Agent「${context.agentId}」的输出`,
      }
    }

    if (agent.status === 'failed') {
      return {
        status: 'failed',
        error: agent.error ?? `Demo Agent「${agent.id}」处于失败状态`,
      }
    }

    if (agent.status === 'fallback') {
      return {
        status: 'fallback',
        output: structuredClone(agent.output),
        summary: agent.output.summary,
        fallbackReason:
          agent.fallbackReason ?? 'Demo data provides a fallback output.',
        source: 'demo',
      }
    }

    return {
      status: 'completed',
      output: structuredClone(agent.output),
      summary: agent.output.summary,
      source: 'demo',
    }
  }
}
