import { z } from 'zod'

export const researchBriefSchema = z.object({
  topic: z.string().min(4).max(500),
  field: z.string().max(80).optional(),
  constraints: z.string().max(800).optional(),
  outputLanguage: z.enum(['zh', 'en']).default('zh'),
})

export type ResearchBrief = z.infer<typeof researchBriefSchema>
