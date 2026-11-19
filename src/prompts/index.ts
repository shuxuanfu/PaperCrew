import { plannerPrompt } from '@/prompts/plannerPrompt'
import { researcherPrompt } from '@/prompts/researcherPrompt'
import type { LivePrompt } from '@/prompts/promptUtils'
import { reviewerPrompt } from '@/prompts/reviewerPrompt'
import { synthesizerPrompt } from '@/prompts/synthesizerPrompt'
import type { AgentId } from '@/domain/agent/ids'

export const LIVE_PROMPTS: Record<AgentId, LivePrompt> = {
  planner: plannerPrompt,
  researcher: researcherPrompt,
  reviewer: reviewerPrompt,
  synthesizer: synthesizerPrompt,
}
