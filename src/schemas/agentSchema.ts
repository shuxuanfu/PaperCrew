import { z } from 'zod'

import {
  literatureClueSchema,
  literatureRetrievalSchema,
  researchQuestionSchema,
  retrievalPlanSchema,
  reviewerCommentSchema,
  searchKeywordGroupSchema,
} from '@/schemas/researchSchema'

export const agentIdSchema = z.enum([
  'planner',
  'researcher',
  'reviewer',
  'synthesizer',
])

export const agentStatusSchema = z.enum([
  'idle',
  'pending',
  'running',
  'completed',
  'failed',
  'fallback',
  'skipped',
])

export const isoTimestampSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: '必须是可解析的 ISO 时间戳',
  })

export const agentInputSchema = z.object({
  topic: z.string().min(4, 'Agent 输入课题过短'),
  objective: z.string().min(15, 'Agent 目标至少 15 个字符'),
  context: z.array(z.string().min(6)).min(2, 'Agent 输入上下文至少 2 条'),
  constraints: z.array(z.string().min(4)).min(1, 'Agent 约束至少 1 条'),
})

export const plannerAgentOutputSchema = z.object({
  type: z.literal('planner'),
  summary: z.string().min(20, 'Planner 输出摘要至少 20 个字符'),
  researchQuestions: z.array(researchQuestionSchema).length(3),
  searchKeywords: z.array(searchKeywordGroupSchema).length(2),
})

export const researcherAgentOutputSchema = z.object({
  type: z.literal('researcher'),
  summary: z.string().min(20, 'Researcher 输出摘要至少 20 个字符'),
  literature: z
    .array(literatureClueSchema)
    .min(5, 'Researcher 至少需要提供 5 条研究线索'),
  retrievalPlan: retrievalPlanSchema.optional(),
  retrieval: literatureRetrievalSchema.optional(),
})

export const reviewerAgentOutputSchema = z.object({
  type: z.literal('reviewer'),
  summary: z.string().min(20, 'Reviewer 输出摘要至少 20 个字符'),
  review: z.array(reviewerCommentSchema).length(3),
})

export const synthesizerAgentOutputSchema = z.object({
  type: z.literal('synthesizer'),
  summary: z.string().min(20, 'Synthesizer 输出摘要至少 20 个字符'),
  finalReport: z.string().min(600, '最终报告至少 600 个字符'),
})

export const agentOutputSchema = z.discriminatedUnion('type', [
  plannerAgentOutputSchema,
  researcherAgentOutputSchema,
  reviewerAgentOutputSchema,
  synthesizerAgentOutputSchema,
])

const EXPECTED_OUTPUT_TYPE = {
  planner: 'planner',
  researcher: 'researcher',
  reviewer: 'reviewer',
  synthesizer: 'synthesizer',
} as const

export const demoAgentSchema = z
  .object({
    id: agentIdSchema,
    name: z.string().min(2, 'Agent 名称过短'),
    role: z.string().min(2, 'Agent 角色过短'),
    description: z.string().min(10, 'Agent 描述过短'),
    status: agentStatusSchema,
    input: agentInputSchema,
    output: agentOutputSchema,
    startedAt: isoTimestampSchema.nullable(),
    completedAt: isoTimestampSchema.nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    error: z.string().nullable(),
    fallbackReason: z.string().nullable(),
  })
  .superRefine((agent, ctx) => {
    if (agent.output.type !== EXPECTED_OUTPUT_TYPE[agent.id]) {
      ctx.addIssue({
        code: 'custom',
        path: ['output', 'type'],
        message: `Agent「${agent.id}」的输出类型必须为 ${EXPECTED_OUTPUT_TYPE[agent.id]}`,
      })
    }

    if (agent.status === 'completed') {
      if (agent.startedAt === null || agent.completedAt === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['completedAt'],
          message: `已完成 Agent「${agent.id}」必须包含 startedAt 与 completedAt`,
        })
        return
      }
      if (agent.durationMs === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['durationMs'],
          message: `已完成 Agent「${agent.id}」必须包含 durationMs`,
        })
        return
      }
      const elapsed =
        Date.parse(agent.completedAt) - Date.parse(agent.startedAt)
      if (elapsed !== agent.durationMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['durationMs'],
          message: `Agent「${agent.id}」的 durationMs（${agent.durationMs}）与时间戳差值（${elapsed}）不一致`,
        })
      }
      if (agent.error !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['error'],
          message: `已完成 Agent「${agent.id}」不应包含 error`,
        })
      }
    }

    if (agent.status === 'failed' && agent.error === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['error'],
        message: `失败 Agent「${agent.id}」必须提供 error`,
      })
    }

    if (agent.status === 'fallback' && agent.fallbackReason === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackReason'],
        message: `Fallback Agent「${agent.id}」必须提供 fallbackReason`,
      })
    }
  })

export type AgentId = z.infer<typeof agentIdSchema>
export type AgentStatus = z.infer<typeof agentStatusSchema>
export type AgentInput = z.infer<typeof agentInputSchema>
export type RetrievalPlan = z.infer<typeof retrievalPlanSchema>
export type PlannerAgentOutput = z.infer<typeof plannerAgentOutputSchema>
export type ResearcherAgentOutput = z.infer<typeof researcherAgentOutputSchema>
export type ReviewerAgentOutput = z.infer<typeof reviewerAgentOutputSchema>
export type SynthesizerAgentOutput = z.infer<
  typeof synthesizerAgentOutputSchema
>
export type AgentOutput = z.infer<typeof agentOutputSchema>
export type DemoAgent = z.infer<typeof demoAgentSchema>
