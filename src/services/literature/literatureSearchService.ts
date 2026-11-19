import { LiteratureCancelledError } from '@/services/literature/errors'
import { mapSemanticScholarPaper } from '@/services/literature/semanticScholarMapper'
import {
  DEFAULT_LITERATURE_TIMEOUT_MS,
  DEFAULT_QUERY_LIMIT,
} from '@/services/literature/semanticScholarProvider'
import type {
  LiteratureSearch,
  LiteratureSearchInput,
  LiteratureSearchOutcome,
  SemanticScholarPaper,
  SemanticScholarProvider,
} from '@/services/literature/semanticScholarTypes'
import type { LiteratureClue } from '@/types/research'

const DEFAULT_MAX_RESULTS = 8
const MAX_QUERIES = 4

export interface LiteratureSearchServiceOptions {
  provider: SemanticScholarProvider
  getApiKey?: () => string | null | undefined
  limitPerQuery?: number
  maxResults?: number
  timeoutMs?: number
  now?: () => Date
}

function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildQueries(input: LiteratureSearchInput): string[] {
  const plannerQueries = input.plannerKeywords
    .slice(0, 2)
    .map((group) => group.keywords.join(' '))
  const planQueries = input.retrievalPlan.keywordGroups

  const queries: string[] = []
  const seen = new Set<string>()
  for (const candidate of [...plannerQueries, ...planQueries]) {
    const query = normalizeQuery(candidate)
    const key = query.toLowerCase()
    if (query.length < 2 || seen.has(key) || queries.length >= MAX_QUERIES) {
      continue
    }
    seen.add(key)
    queries.push(query)
  }
  return queries
}

function mergeResults(
  groups: SemanticScholarPaper[][],
  keywords: string[],
  maxResults: number,
): LiteratureClue[] {
  const merged: LiteratureClue[] = []
  const seen = new Set<string>()
  const maxGroupLength = Math.max(0, ...groups.map((group) => group.length))

  for (let round = 0; round < maxGroupLength; round += 1) {
    for (const group of groups) {
      const paper = group[round]
      if (!paper) {
        continue
      }
      const mapped = mapSemanticScholarPaper(paper, keywords)
      if (!mapped || seen.has(mapped.id)) {
        continue
      }
      seen.add(mapped.id)
      merged.push(mapped)
      if (merged.length >= maxResults) {
        return merged
      }
    }
  }

  return merged
}

export class LiteratureSearchService implements LiteratureSearch {
  private readonly provider: SemanticScholarProvider
  private readonly getApiKey?: () => string | null | undefined
  private readonly limitPerQuery: number
  private readonly maxResults: number
  private readonly timeoutMs: number
  private readonly now: () => Date

  constructor(options: LiteratureSearchServiceOptions) {
    this.provider = options.provider
    this.getApiKey = options.getApiKey
    this.limitPerQuery = options.limitPerQuery ?? DEFAULT_QUERY_LIMIT
    this.maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_LITERATURE_TIMEOUT_MS
    this.now = options.now ?? (() => new Date())
  }

  async search(
    input: LiteratureSearchInput,
    signal: AbortSignal,
  ): Promise<LiteratureSearchOutcome> {
    const startedAt = Date.now()
    const searchedAt = this.now().toISOString()
    const queries = buildQueries(input)
    const keywords = [
      ...input.plannerKeywords.flatMap((group) => group.keywords),
      ...input.retrievalPlan.keywordGroups,
    ]

    if (queries.length === 0) {
      return {
        literature: [],
        status: 'empty',
        queries,
        searchedAt,
        durationMs: Date.now() - startedAt,
        totalFound: 0,
        error: '没有可用的英文检索关键词，未发起 Semantic Scholar 请求。',
        warnings: [],
      }
    }

    if (signal.aborted) {
      throw new LiteratureCancelledError()
    }

    const apiKey = this.getApiKey?.() ?? null
    const groups: SemanticScholarPaper[][] = []
    const warnings: string[] = []
    let totalFound = 0
    let succeeded = 0

    for (const query of queries) {
      if (signal.aborted) {
        throw new LiteratureCancelledError()
      }
      try {
        const result = await this.provider.search(query, {
          signal,
          apiKey,
          limit: this.limitPerQuery,
          timeoutMs: this.timeoutMs,
        })
        groups.push(result.papers)
        totalFound += result.papers.length
        succeeded += 1
      } catch (error) {
        if (signal.aborted || error instanceof LiteratureCancelledError) {
          throw new LiteratureCancelledError()
        }
        groups.push([])
        warnings.push(
          `${query}：${
            error instanceof Error ? error.message : '未知检索错误'
          }`,
        )
      }
    }

    if (succeeded === 0) {
      return {
        literature: [],
        status: 'failed',
        queries,
        searchedAt,
        durationMs: Date.now() - startedAt,
        totalFound: 0,
        error:
          warnings[0] ??
          'Semantic Scholar 检索失败：所有查询均未成功返回。',
        warnings,
      }
    }

    const literature = mergeResults(groups, keywords, this.maxResults)
    return {
      literature,
      status: literature.length > 0 ? 'completed' : 'empty',
      queries,
      searchedAt,
      durationMs: Date.now() - startedAt,
      totalFound,
      error:
        warnings.length > 0
          ? `部分查询失败：${warnings.join('；')}`
          : null,
      warnings,
    }
  }
}
