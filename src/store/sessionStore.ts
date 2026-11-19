import { create } from 'zustand'

import { TaskController } from '@/engine/taskController'
import type { LiveInput } from '@/engine/livePlayer'
import { ConfigService } from '@/services/config/configService'
import { LiteratureSearchService } from '@/services/literature/literatureSearchService'
import { SemanticScholarApiProvider } from '@/services/literature/semanticScholarProvider'
import { toLLMConfig } from '@/services/llm/llmConfig'
import { OpenAICompatibleProvider } from '@/services/llm/openAICompatibleProvider'
import type { AgentId, AgentStatus } from '@/types/agent'
import type { RunSession } from '@/types/engine'
import type { AgentEvent, DemoSession, SessionStatus } from '@/types/session'

interface SessionState {
  template: DemoSession | null
  currentSession: RunSession | null
  currentAgentId: AgentId | null
  sessionStatus: SessionStatus | null
  isPlaying: boolean
  isPaused: boolean
  isCancelling: boolean
  events: AgentEvent[]
  error: string | null
  liveInput: LiveInput | null

  setTemplate: (template: DemoSession) => void
  startSession: (topic?: string) => Promise<void>
  pauseSession: () => void
  resumeSession: () => void
  cancelSession: () => Promise<void>
  retryAgent: () => Promise<void>
  restartSession: () => Promise<void>
  updateAgentStatus: (agentId: AgentId, status: AgentStatus) => void
  appendEvent: (event: AgentEvent) => void
  resetSession: () => void
}

const IDLE_RUNTIME = {
  currentSession: null,
  currentAgentId: null,
  sessionStatus: null,
  isPlaying: false,
  isPaused: false,
  isCancelling: false,
  events: [],
  error: null,
} satisfies Pick<
  SessionState,
  | 'currentSession'
  | 'currentAgentId'
  | 'sessionStatus'
  | 'isPlaying'
  | 'isPaused'
  | 'isCancelling'
  | 'events'
  | 'error'
>

let controller: TaskController | null = null

function getController(): TaskController {
  if (!controller) {
    throw new Error('TaskController 尚未初始化')
  }
  return controller
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  template: null,
  liveInput: null,
  ...IDLE_RUNTIME,

  setTemplate: (template) => {
    getController().dispose()
    set({
      template,
      ...IDLE_RUNTIME,
    })
  },

  startSession: async (topic) => {
    const status = get().sessionStatus
    if (
      get().isPlaying ||
      get().isPaused ||
      status === 'created' ||
      status === 'running' ||
      status === 'paused'
    ) {
      return
    }

    if (ConfigService.getMode() === 'live') {
      const trimmed = topic?.trim() ?? ''
      if (trimmed.length < 4) {
        set({ error: 'LIVE 模式需要先填写研究课题（至少 4 个字符）。' })
        return
      }
      const missing = ConfigService.missingFields()
      if (missing.length > 0) {
        set({
          error: `LIVE 模式配置不完整：缺少 ${missing.join(
            '、',
          )}。请先在 API Settings 中补全配置。`,
        })
        return
      }

      const liveInput: LiveInput = { topic: trimmed, description: null }
      set({ error: null, isCancelling: false, liveInput })
      try {
        await getController().startLive(liveInput)
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isPlaying: false,
          isPaused: false,
          isCancelling: false,
        })
      }
      return
    }

    const template = get().template
    if (!template) {
      set({ error: '尚未加载 Demo 案例，无法启动运行。' })
      return
    }

    set({ error: null, isCancelling: false })
    try {
      await getController().start(template)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isPlaying: false,
        isPaused: false,
        isCancelling: false,
      })
    }
  },

  pauseSession: () => {
    getController().pause()
  },

  resumeSession: () => {
    getController().resume()
  },

  cancelSession: async () => {
    const status = get().sessionStatus
    if (status !== 'running' && status !== 'paused') {
      return
    }
    set({ isCancelling: true })
    try {
      await getController().cancel()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isCancelling: false,
      })
    } finally {
      set({ isCancelling: false })
    }
  },

  retryAgent: async () => {
    if (get().sessionStatus !== 'failed') {
      return
    }
    set({ error: null })
    try {
      await getController().retry()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  restartSession: async () => {
    const liveInput = get().liveInput
    const liveMode =
      get().currentSession?.mode === 'live' ||
      ConfigService.getMode() === 'live'

    if (liveInput && liveMode) {
      set({ error: null })
      try {
        await getController().restartLive(liveInput)
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isPlaying: false,
          isPaused: false,
          isCancelling: false,
        })
      }
      return
    }

    const template = get().template
    if (!template) {
      set({ error: '尚未加载 Demo 案例，无法重新开始。' })
      return
    }
    set({ error: null })
    try {
      await getController().restart(template)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isPlaying: false,
        isPaused: false,
        isCancelling: false,
      })
    }
  },

  updateAgentStatus: (agentId, status) => {
    set((state) => {
      if (!state.currentSession) {
        return state
      }
      return {
        currentSession: {
          ...state.currentSession,
          agents: state.currentSession.agents.map((agent) =>
            agent.id === agentId ? { ...agent, status } : agent,
          ),
        },
      }
    })
  },

  appendEvent: (event) => {
    set((state) => {
      if (state.events.some((item) => item.id === event.id)) {
        return state
      }
      const events = [...state.events, event]
      return {
        events,
        currentSession: state.currentSession
          ? { ...state.currentSession, events }
          : null,
      }
    })
  },

  resetSession: () => {
    getController().dispose()
    set({ ...IDLE_RUNTIME })
  },
}))

controller = new TaskController({
  live: {
    provider: new OpenAICompatibleProvider(),
    getConfig: () => toLLMConfig(ConfigService.read()),
    literatureSearch: new LiteratureSearchService({
      provider: new SemanticScholarApiProvider(),
      getApiKey: () => ConfigService.read().semanticScholarApiKey,
    }),
  },
  onUpdate: (session, meta) => {
    useSessionStore.setState((state) => ({
      currentSession: session,
      currentAgentId: meta.currentAgentId,
      sessionStatus: session.status,
      events: session.events,
      isPlaying: session.status === 'running',
      isPaused: session.status === 'paused',
      isCancelling:
        session.status === 'running' || session.status === 'paused'
          ? state.isCancelling
          : false,
      error: session.error,
    }))
  },
  onError: (message) => {
    useSessionStore.setState({
      error: message,
      isPlaying: false,
      isPaused: false,
      isCancelling: false,
    })
  },
})
