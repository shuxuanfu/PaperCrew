import type {
  AgentContext,
  AgentExecutor,
  AgentPlaybook,
  AgentResult,
} from '@/types/engine'
import type { AgentId } from '@/domain/agent/ids'
import { AgentExecutionError } from '@/services/llm/errors'
import { LiteratureCancelledError } from '@/services/literature/errors'
import type {
  LiteratureSearch,
  LiteratureSearchOutcome,
} from '@/services/literature/semanticScholarTypes'
import { liveResearcherFinalSchema } from '@/schemas/liveSchemas'

function abortError(): Error {
  const error = new Error('Agent execution aborted')
  error.name = 'AbortError'
  return error
}

function buildSummary(
  baseSummary: string,
  outcome: LiteratureSearchOutcome,
): string {
  if (outcome.status === 'failed') {
    return `${baseSummary} Semantic Scholar 真实文献检索失败：${
      outcome.error ?? '未知错误'
    }。未使用模拟或虚构论文替代。`
  }
  if (outcome.status === 'empty') {
    return `${baseSummary} 已查询 Semantic Scholar，但未检索到可用的真实论文；未生成虚构文献。`
  }
  return `${baseSummary} 已通过 Semantic Scholar 检索到 ${outcome.literature.length} 篇真实论文（${outcome.queries.length} 个查询；API 匹配 ${outcome.totalMatched} 条，实际返回 ${outcome.totalFetched} 条，去重后保留 ${outcome.literature.length} 条）。`
}

function validateRelatedQuestions(
  output: ReturnType<typeof liveResearcherFinalSchema.parse>,
  context: AgentContext,
): string | null {
  const planner = context.upstream.find((item) => item.agentId === 'planner')
  if (!planner || planner.output.type !== 'planner') {
    return '缺少上游 Planner 输出，无法校验真实文献关联的研究问题。'
  }
  const known = new Set(
    planner.output.researchQuestions.map((question) => question.id),
  )
  for (const [index, clue] of output.literature.entries()) {
    for (const questionId of clue.relatedQuestionIds) {
      if (!known.has(questionId)) {
        return `第 ${index + 1} 篇真实文献引用了不存在的研究问题 ${questionId}。`
      }
    }
  }
  return null
}

export class LiteratureResearcherExecutor implements AgentExecutor {
  private readonly base: AgentExecutor
  private readonly searchService: LiteratureSearch

  constructor(base: AgentExecutor, searchService: LiteratureSearch) {
    this.base = base
    this.searchService = searchService
  }

  getPlaybook(agentId: AgentId): AgentPlaybook | null {
    const base = this.base.getPlaybook?.(agentId) ?? null
    if (agentId !== 'researcher') {
      return base
    }
    return {
      durationMs: base?.durationMs ?? 0,
      startedMessage:
        'Researcher is building a search plan and querying Semantic Scholar…',
      progressMessages: base?.progressMessages,
      completedMessage:
        'Researcher completed with validated real literature metadata.',
    }
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const result = await this.base.execute(context)
    if (context.agentId !== 'researcher') {
      return result
    }
    if (
      result.status !== 'completed' ||
      !result.output ||
      result.output.type !== 'researcher' ||
      !result.output.retrievalPlan
    ) {
      return result
    }

    const planner = context.upstream.find((item) => item.agentId === 'planner')
    if (!planner || planner.output.type !== 'planner') {
      throw new AgentExecutionError(
        '真实文献检索缺少上游 Planner 输出，无法构建检索词。',
      )
    }

    let outcome: LiteratureSearchOutcome
    try {
      outcome = await this.searchService.search(
        {
          plannerKeywords: planner.output.searchKeywords,
          retrievalPlan: result.output.retrievalPlan,
        },
        context.signal,
      )
    } catch (error) {
      if (context.signal.aborted || error instanceof LiteratureCancelledError) {
        throw abortError()
      }
      throw new AgentExecutionError(
        error instanceof Error
          ? error.message
          : 'Semantic Scholar 真实文献检索失败。',
      )
    }

    if (context.signal.aborted) {
      throw abortError()
    }

    const finalRaw = {
      ...result.output,
      summary: buildSummary(result.output.summary, outcome),
      literature: outcome.literature,
      retrieval: {
        status: outcome.status,
        queries: outcome.queries,
        queryStats: outcome.queryStats,
        searchedAt: outcome.searchedAt,
        durationMs: outcome.durationMs,
        totalMatched: outcome.totalMatched,
        totalFetched: outcome.totalFetched,
        totalReturned: outcome.literature.length,
        error: outcome.error,
        warnings: outcome.warnings,
      },
    }

    const parsed = liveResearcherFinalSchema.safeParse(finalRaw)
    if (!parsed.success) {
      throw new AgentExecutionError(
        `真实文献结果未通过 Schema 校验：${parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('；')}`,
      )
    }

    const relatedIssue = validateRelatedQuestions(parsed.data, context)
    if (relatedIssue) {
      throw new AgentExecutionError(relatedIssue)
    }

    return {
      status: 'completed',
      output: parsed.data,
      summary: parsed.data.summary,
      source: 'live',
    }
  }
}
