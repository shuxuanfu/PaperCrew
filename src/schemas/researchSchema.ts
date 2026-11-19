import { z } from 'zod'

export const relevanceSchema = z.enum(['high', 'medium', 'low'])
export const sourceTypeSchema = z.enum(['real', 'simulated'])
export const severitySchema = z.enum(['high', 'medium', 'low'])
export const reviewCategorySchema = z.enum([
  'methodology',
  'dataset',
  'evaluation',
  'statistics',
  'reproducibility',
  'logic',
])

const questionIdSchema = z
  .string()
  .regex(/^q[1-9]\d*$/, '研究问题 id 必须形如 q1、q2、q3')

export const researchQuestionSchema = z.object({
  id: questionIdSchema,
  question: z.string().min(10, '研究问题至少 10 个字符'),
  rationale: z.string().min(20, '研究理由至少 20 个字符'),
  methodology: z.string().min(20, '研究方法至少 20 个字符'),
  expectedOutcome: z.string().min(20, '预期产出至少 20 个字符'),
})

const keywordGroupIdSchema = z
  .string()
  .regex(/^kw[1-9]\d*$/, '检索词组 id 必须形如 kw1、kw2')

export const searchKeywordGroupSchema = z.object({
  id: keywordGroupIdSchema,
  label: z.string().min(2, '检索词组标题过短'),
  keywords: z
    .array(
      z
        .string()
        .min(2, '检索词过短')
        .regex(/^[\x20-\x7E]+$/, '检索词必须为英文'),
    )
    .min(3, '每组至少包含 3 个英文检索词'),
  purpose: z.string().min(10, '检索目的至少 10 个字符'),
})

export const researchPlanSchema = z
  .object({
    researchQuestions: z
      .array(researchQuestionSchema)
      .length(3, '研究计划必须恰好包含 3 个研究子问题'),
    searchKeywords: z
      .array(searchKeywordGroupSchema)
      .length(2, '研究计划必须恰好包含 2 组检索词'),
  })
  .superRefine((plan, ctx) => {
    const questionIds = plan.researchQuestions.map((item) => item.id)
    if (new Set(questionIds).size !== questionIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['researchQuestions'],
        message: '研究问题 id 不得重复',
      })
    }
    const keywordIds = plan.searchKeywords.map((item) => item.id)
    if (new Set(keywordIds).size !== keywordIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['searchKeywords'],
        message: '检索词组 id 不得重复',
      })
    }
  })

export const literatureClueSchema = z
  .object({
    id: z.string().min(1, '文献 id 不能为空'),
    title: z.string().min(8, '文献标题过短'),
    authors: z.array(z.string().min(1)).min(1, '至少需要一位作者'),
    year: z.number().int().min(1900).max(2100),
    venue: z.string().min(3, '发表渠道过短'),
    abstract: z.string().min(40, '摘要至少 40 个字符'),
    relevance: relevanceSchema,
    sourceType: sourceTypeSchema,
    doi: z.string().nullable(),
    url: z
      .string()
      .regex(/^https?:\/\//, 'url 必须使用 http(s) 协议')
      .nullable(),
    relatedQuestionIds: z
      .array(questionIdSchema)
      .min(1, '文献必须关联至少一个研究问题'),
  })
  .superRefine((clue, ctx) => {
    if (clue.sourceType === 'simulated' && (clue.doi !== null || clue.url !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceType'],
        message: `模拟文献「${clue.id}」不得附带 DOI 或外部链接`,
      })
    }
    if (clue.doi !== null && !clue.doi.startsWith('10.')) {
      ctx.addIssue({
        code: 'custom',
        path: ['doi'],
        message: `文献「${clue.id}」的 DOI 格式不合法`,
      })
    }
  })

export const reviewerCommentSchema = z.object({
  id: z.string().min(1, '审查意见 id 不能为空'),
  title: z.string().min(6, '审查意见标题过短'),
  severity: severitySchema,
  category: reviewCategorySchema,
  problem: z.string().min(30, '问题描述至少 30 个字符'),
  impact: z.string().min(20, '影响说明至少 20 个字符'),
  recommendation: z.string().min(20, '修改建议至少 20 个字符'),
  relatedQuestionIds: z
    .array(questionIdSchema)
    .min(1, '审查意见必须关联至少一个研究问题'),
})

export const retrievalPlanSchema = z.object({
  searchStrategy: z.string().min(20, '检索策略说明至少 20 个字符'),
  keywordGroups: z
    .array(z.string().min(2, '检索词组过短'))
    .min(2, '至少需要 2 组检索词'),
  researchGaps: z
    .array(z.string().min(10, '研究空白描述过短'))
    .min(2, '至少需要 2 条研究空白'),
  nextDirections: z
    .array(z.string().min(10, '后续方向描述过短'))
    .min(2, '至少需要 2 条后续方向'),
})

export type Relevance = z.infer<typeof relevanceSchema>
export type SourceType = z.infer<typeof sourceTypeSchema>
export type ReviewSeverity = z.infer<typeof severitySchema>
export type ReviewCategory = z.infer<typeof reviewCategorySchema>
export type ResearchQuestion = z.infer<typeof researchQuestionSchema>
export type SearchKeywordGroup = z.infer<typeof searchKeywordGroupSchema>
export type ResearchPlan = z.infer<typeof researchPlanSchema>
export type LiteratureClue = z.infer<typeof literatureClueSchema>
export type ReviewerComment = z.infer<typeof reviewerCommentSchema>
export type RetrievalPlan = z.infer<typeof retrievalPlanSchema>
