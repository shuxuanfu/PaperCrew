import { LLMExecutor } from '@/agents/llmExecutor'
import { LiteratureResearcherExecutor } from '@/agents/literatureResearcherExecutor'
import { AGENT_DEFINITIONS } from '@/domain/agent/definitions'
import { AGENT_IDS } from '@/domain/agent/ids'
import { Orchestrator } from '@/engine/orchestrator'
import type { LLMConfig } from '@/services/llm/llmConfig'
import type { LLMProvider } from '@/services/llm/llmProvider'
import type { LiteratureSearch } from '@/services/literature/semanticScholarTypes'
import type {
  ExecutionUpdateHandler,
  RunAgent,
  RunSession,
} from '@/types/engine'

let liveCounter = 0

export interface LiveInput {
  topic: string
  description: string | null
}

export interface LivePlayerOptions {
  provider: LLMProvider
  getConfig: () => LLMConfig
  literatureSearch?: LiteratureSearch
  now?: () => string
  onUpdate?: ExecutionUpdateHandler
}

export class LivePlayer {
  private readonly input: LiveInput
  private readonly options: LivePlayerOptions

  constructor(input: LiveInput, options: LivePlayerOptions) {
    this.input = input
    this.options = options
  }

  createSession(): RunSession {
    const now = this.options.now ?? (() => new Date().toISOString())
    const timestamp = now()
    liveCounter += 1
    const sessionId = `run-live-${Date.now().toString(36)}-${liveCounter}`
    const topic = this.input.topic.trim()
    const description = this.input.description?.trim() || null

    const agents: RunAgent[] = AGENT_IDS.map((id) => {
      const definition = AGENT_DEFINITIONS[id]
      return {
        id,
        name: definition.name,
        role: definition.role,
        description: definition.description,
        status: 'idle',
        input: {
          topic,
          objective: definition.objective,
          context: [
            `研究课题：${topic}`,
            description ? `补充说明：${description}` : '运行模式：LIVE（真实模型调用）',
          ],
          constraints: definition.constraints,
        },
        output: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        fallbackReason: null,
      }
    })

    return {
      sessionId,
      templateId: null,
      title: topic,
      description: description ?? topic,
      topic,
      mode: 'live',
      live: { description },
      status: 'created',
      createdAt: timestamp,
      startedAt: null,
      completedAt: null,
      agents,
      events: [
        {
          id: `${sessionId}-evt-1`,
          type: 'session_created',
          agentId: null,
          timestamp,
          message: `已创建 LIVE 运行会话：${topic}。`,
          payload: {
            mode: 'live',
          },
        },
      ],
      error: null,
    }
  }

  createOrchestrator(session: RunSession): Orchestrator {
    const llmExecutor = new LLMExecutor({
      provider: this.options.provider,
      getConfig: this.options.getConfig,
    })
    const executor = this.options.literatureSearch
      ? new LiteratureResearcherExecutor(
          llmExecutor,
          this.options.literatureSearch,
        )
      : llmExecutor

    return new Orchestrator(session, {
      executor,
      onUpdate: this.options.onUpdate,
      now: this.options.now,
    })
  }
}
