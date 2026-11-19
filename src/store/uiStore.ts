import { create } from 'zustand'

import { DEMO_CASES, DEFAULT_DEMO_CASE_ID } from '@/data'
import type { AgentId } from '@/domain/agent/ids'
import { AGENT_IDS } from '@/domain/agent/ids'
import { loadDemoSession } from '@/services/demoDataService'
import { useSessionStore } from '@/store/sessionStore'
import type { DemoLoadState, MobileView, ResearchTab } from '@/types/ui'

let loadToken = 0

function createAgentRecord<T>(value: T): Record<AgentId, T> {
  const record = {} as Record<AgentId, T>
  for (const id of AGENT_IDS) {
    record[id] = value
  }
  return record
}

interface UiState {
  topic: string
  activeCaseId: string | null
  demoState: DemoLoadState
  demoError: string | null
  expandedAgents: Record<AgentId, boolean>
  activeTab: ResearchTab
  mobileView: MobileView
  settingsOpen: boolean

  setTopic: (topic: string) => void
  bootDemo: () => Promise<void>
  loadCase: (caseId: string) => Promise<void>
  expandAgent: (id: AgentId) => void
  toggleAgent: (id: AgentId) => void
  setActiveTab: (tab: ResearchTab) => void
  setMobileView: (view: MobileView) => void
  openSettings: () => void
  closeSettings: () => void
}

export const useUiStore = create<UiState>()((set, get) => ({
  topic: DEMO_CASES[0]?.topic ?? '',
  activeCaseId: null,
  demoState: 'idle',
  demoError: null,
  expandedAgents: createAgentRecord(false),
  activeTab: 'plan',
  mobileView: 'workspace',
  settingsOpen: false,

  setTopic: (topic) => set({ topic }),

  bootDemo: async () => {
    if (get().demoState !== 'idle') {
      return
    }
    await get().loadCase(DEFAULT_DEMO_CASE_ID)
  },

  loadCase: async (caseId) => {
    if (
      get().activeCaseId === caseId &&
      get().demoState === 'ready' &&
      useSessionStore.getState().template
    ) {
      return
    }

    const requestId = ++loadToken
    const previousCaseId = get().activeCaseId
    const previousTopic = get().topic

    const sessionState = useSessionStore.getState()
    if (
      sessionState.sessionStatus === 'running' ||
      sessionState.sessionStatus === 'paused'
    ) {
      await sessionState.cancelSession()
    }

    set({ demoState: 'loading', demoError: null })

    try {
      const session = await loadDemoSession(caseId)
      if (requestId !== loadToken) {
        return
      }
      useSessionStore.getState().setTemplate(session)
      set({
        activeCaseId: caseId,
        topic: session.topic,
        demoState: 'ready',
        activeTab: 'plan',
        expandedAgents: createAgentRecord(false),
      })
    } catch (error) {
      if (requestId !== loadToken) {
        return
      }
      set({
        demoState: 'error',
        demoError: error instanceof Error ? error.message : String(error),
        activeCaseId: previousCaseId,
        topic: previousTopic,
      })
    }
  },

  expandAgent: (id) =>
    set((state) => ({
      expandedAgents: {
        ...state.expandedAgents,
        [id]: true,
      },
    })),

  toggleAgent: (id) =>
    set((state) => ({
      expandedAgents: {
        ...state.expandedAgents,
        [id]: !state.expandedAgents[id],
      },
    })),

  setActiveTab: (activeTab) => set({ activeTab }),
  setMobileView: (mobileView) => set({ mobileView }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}))
