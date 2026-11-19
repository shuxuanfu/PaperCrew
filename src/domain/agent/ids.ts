export const AGENT_IDS = [
  'planner',
  'researcher',
  'reviewer',
  'synthesizer',
] as const

export type AgentId = (typeof AGENT_IDS)[number]

export type RunMode = 'demo' | 'live'
