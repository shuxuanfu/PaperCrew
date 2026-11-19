import { z } from 'zod'

import {
  literatureClueSchema,
  literatureRetrievalSchema,
  researchQuestionSchema,
  retrievalPlanSchema,
  reviewerCommentSchema,
  searchKeywordGroupSchema,
} from '@/schemas/researchSchema'
import type { AgentId, AgentOutput } from '@/types/agent'

const REQUIRED_REPORT_SECTIONS = [
  '研究背景',
  '核心研究问题',
  '相关研究与证据',
  '研究假设',
  '技术路线',
  '实验设计',
  '评价指标',
  '潜在风险',
  '下一步研究建议',
]

const liveLiteratureClueSchema = literatureClueSchema.superRefine(
  (clue, ctx) => {
    if (clue.sourceType !== 'simulated') {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceType'],
        message: '模型不得直接生成真实文献，sourceType 必须为 simulated',
      })
    }
    if (clue.doi !== null || clue.url !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['doi'],
        message: '模型生成的文献不允许返回 DOI 或 URL',
      })
    }
  },
)

const livePlannerOutputSchema = z
  .object({
    type: z.literal('planner'),
    summary: z.string().min(20, 'Planner 输出摘要至少 20 个字符'),
    researchQuestions: z
      .array(researchQuestionSchema)
      .length(3, '必须恰好包含 3 个研究问题'),
    searchKeywords: z
      .array(searchKeywordGroupSchema)
      .length(2, '必须恰好包含 2 组检索词'),
  })
  .superRefine((output, ctx) => {
    const questionIds = output.researchQuestions.map((item) => item.id)
    if (questionIds.join(',') !== 'q1,q2,q3') {
      ctx.addIssue({
        code: 'custom',
        path: ['researchQuestions'],
        message: '研究问题 id 必须按顺序为 q1、q2、q3',
      })
    }
    const keywordIds = output.searchKeywords.map((item) => item.id)
    if (keywordIds.join(',') !== 'kw1,kw2') {
      ctx.addIssue({
        code: 'custom',
        path: ['searchKeywords'],
        message: '检索词组 id 必须按顺序为 kw1、kw2',
      })
    }
  })

const liveResearcherPlanSchema = z.object({
  type: z.literal('researcher'),
  summary: z.string().min(20, 'Researcher 输出摘要至少 20 个字符'),
  literature: z
    .array(liveLiteratureClueSchema)
    .max(0, '模型不得直接生成文献，真实文献由 Semantic Scholar 检索注入'),
  retrievalPlan: retrievalPlanSchema,
})

export const liveResearcherFinalSchema = z
  .object({
    type: z.literal('researcher'),
    summary: z.string().min(20, 'Researcher 输出摘要至少 20 个字符'),
    literature: z
      .array(literatureClueSchema)
      .max(8, '真实文献最多保留 8 条'),
    retrievalPlan: retrievalPlanSchema,
    retrieval: literatureRetrievalSchema,
  })
  .superRefine((output, ctx) => {
    const ids = output.literature.map((item) => item.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['literature'],
        message: '真实文献 paperId 不得重复',
      })
    }
    output.literature.forEach((item, index) => {
      if (item.sourceType !== 'real') {
        ctx.addIssue({
          code: 'custom',
          path: ['literature', index, 'sourceType'],
          message: 'LIVE 最终文献必须全部来自真实检索',
        })
      }
    })
  })

const liveReviewerOutputSchema = z.object({
  type: z.literal('reviewer'),
  summary: z.string().min(20, 'Reviewer 输出摘要至少 20 个字符'),
  review: z.array(reviewerCommentSchema).length(3, '必须恰好包含 3 条审查意见'),
})

const liveSynthesizerOutputSchema = z
  .object({
    type: z.literal('synthesizer'),
    summary: z.string().min(20, 'Synthesizer 输出摘要至少 20 个字符'),
    finalReport: z.string().min(600, '最终报告至少 600 个字符'),
  })
  .superRefine((output, ctx) => {
    REQUIRED_REPORT_SECTIONS.forEach((section) => {
      const heading = new RegExp(`##\\s*\\d+\\.?\\s*${section}`)
      if (!heading.test(output.finalReport)) {
        ctx.addIssue({
          code: 'custom',
          path: ['finalReport'],
          message: `最终报告缺少必需章节：${section}`,
        })
      }
    })
    ;(['Evidence', 'Hypothesis', 'Proposal'] as const).forEach((label) => {
      if (!output.finalReport.includes(label)) {
        ctx.addIssue({
          code: 'custom',
          path: ['finalReport'],
          message: `最终报告必须区分并标注 ${label}`,
        })
      }
    })
    if (!output.finalReport.includes('$$')) {
      ctx.addIssue({
        code: 'custom',
        path: ['finalReport'],
        message: '最终报告必须包含 LaTeX 公式',
      })
    }
  })

export const liveAgentOutputSchemas: Record<
  AgentId,
  z.ZodType<AgentOutput>
> = {
  planner: livePlannerOutputSchema,
  researcher: liveResearcherPlanSchema,
  reviewer: liveReviewerOutputSchema,
  synthesizer: liveSynthesizerOutputSchema,
}

export const REPORT_SECTIONS = REQUIRED_REPORT_SECTIONS
