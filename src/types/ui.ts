import type { SessionStatus } from '@/types/session'

export type { AgentStatus } from '@/types/agent'

export type RunState = 'idle' | SessionStatus

export type ResearchTab = 'plan' | 'literature' | 'review' | 'report'

export type MobileView = 'workspace' | 'process' | 'results'

export type DemoLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface ApiSettings {
  baseUrl: string
  apiKey: string
  modelName: string
  temperature: number
  maxTokens: number
  jsonMode: boolean
  semanticScholarApiKey: string
}
