import { DemoPlayer } from '@/engine/demoPlayer'
import { LivePlayer, type LiveInput } from '@/engine/livePlayer'
import type { Orchestrator } from '@/engine/orchestrator'
import type {
  AgentExecutor,
  ExecutionUpdateHandler,
  RunSession,
} from '@/types/engine'
import type { AgentId } from '@/domain/agent/ids'
import type { DemoSession } from '@/types/session'
import type { LLMConfig } from '@/services/llm/llmConfig'
import type { LLMProvider } from '@/services/llm/llmProvider'
import type { LiteratureSearch } from '@/services/literature/semanticScholarTypes'

interface SessionPlayer {
  createSession: () => RunSession
  createOrchestrator: (session: RunSession) => Orchestrator
}

export interface LiveDependencies {
  provider: LLMProvider
  getConfig: () => LLMConfig
  literatureSearch?: LiteratureSearch
}

export interface TaskControllerOptions {
  onUpdate?: ExecutionUpdateHandler
  onError?: (message: string) => void
  now?: () => string
  resolveStepDuration?: (agentId: AgentId, baseDurationMs: number) => number
  executorFactory?: (template: DemoSession) => AgentExecutor
  live?: LiveDependencies
}

export class TaskController {
  private readonly options: TaskControllerOptions
  private orchestrator: Orchestrator | null = null
  private generation = 0
  private activeRun: Promise<RunSession | null> | null = null

  constructor(options: TaskControllerOptions = {}) {
    this.options = options
  }

  getSession(): RunSession | null {
    return this.orchestrator?.getSession() ?? null
  }

  isActive(): boolean {
    const status = this.orchestrator?.getSession().status
    return status === 'created' || status === 'running' || status === 'paused'
  }

  start(template: DemoSession): Promise<RunSession | null> {
    return this.startRun(
      (onUpdate) =>
        new DemoPlayer(template, {
          now: this.options.now,
          resolveStepDuration: this.options.resolveStepDuration,
          executorFactory: this.options.executorFactory,
          onUpdate,
        }),
    )
  }

  startLive(input: LiveInput): Promise<RunSession | null> {
    const live = this.options.live
    if (!live) {
      throw new Error('LIVE executor 未配置，无法启动真实模型运行。')
    }
    return this.startRun(
      (onUpdate) =>
        new LivePlayer(input, {
          provider: live.provider,
          getConfig: live.getConfig,
          literatureSearch: live.literatureSearch,
          now: this.options.now,
          onUpdate,
        }),
    )
  }

  pause(): boolean {
    return this.orchestrator?.pause() ?? false
  }

  resume(): boolean {
    return this.orchestrator?.resume() ?? false
  }

  async cancel(): Promise<RunSession | null> {
    if (!this.orchestrator || !this.orchestrator.cancel()) {
      return this.orchestrator?.getSession() ?? null
    }
    if (this.activeRun) {
      return this.activeRun
    }
    return this.orchestrator.getSession()
  }

  retry(): Promise<RunSession | null> | null {
    if (!this.orchestrator) {
      return null
    }
    const generation = this.generation
    const retryRun = this.orchestrator.retry()
    if (!retryRun) {
      return null
    }

    const run = retryRun
      .then(() => this.orchestrator?.getSession() ?? null)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : String(error)
        if (generation === this.generation) {
          this.options.onError?.(message)
        }
        return this.orchestrator?.getSession() ?? null
      })

    this.activeRun = run
    return run
  }

  async restart(template: DemoSession): Promise<RunSession | null> {
    if (this.isActive()) {
      await this.cancel()
    }
    return this.start(template)
  }

  async restartLive(input: LiveInput): Promise<RunSession | null> {
    if (this.isActive()) {
      await this.cancel()
    }
    return this.startLive(input)
  }

  dispose(): void {
    this.generation += 1
    this.orchestrator?.dispose()
    this.orchestrator = null
    this.activeRun = null
  }

  private startRun(
    createPlayer: (onUpdate: ExecutionUpdateHandler) => SessionPlayer,
  ): Promise<RunSession | null> {
    if (this.isActive()) {
      return Promise.resolve(null)
    }

    this.generation += 1
    const generation = this.generation
    this.orchestrator?.dispose()
    this.orchestrator = null

    const player = createPlayer((session, meta) => {
      if (generation === this.generation) {
        this.options.onUpdate?.(session, meta)
      }
    })

    const session = player.createSession()
    const orchestrator = player.createOrchestrator(session)
    this.orchestrator = orchestrator

    this.options.onUpdate?.(structuredClone(session), {
      currentAgentId: null,
      event: null,
    })

    const run = orchestrator
      .start()
      .then(() => orchestrator.getSession())
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : String(error)
        if (generation === this.generation) {
          this.options.onError?.(message)
        }
        return orchestrator.getSession()
      })
      .finally(() => {
        if (generation === this.generation) {
          this.activeRun = null
        }
      })

    this.activeRun = run
    return run
  }
}
