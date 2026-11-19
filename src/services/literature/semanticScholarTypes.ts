import type {
  LiteratureClue,
  LiteratureRetrievalStatus,
  RetrievalPlan,
  SearchKeywordGroup,
} from '@/types/research'

export const SEMANTIC_SCHOLAR_FIELDS = [
  'paperId',
  'title',
  'authors',
  'year',
  'venue',
  'abstract',
  'url',
  'externalIds',
  'publicationTypes',
  'openAccessPdf',
  'citationCount',
  'referenceCount',
  'fieldsOfStudy',
] as const

export interface SemanticScholarAuthor {
  authorId?: string | null
  name?: string | null
}

export interface SemanticScholarPaper {
  paperId?: string | null
  title?: string | null
  authors?: SemanticScholarAuthor[] | null
  year?: number | null
  venue?: string | null
  abstract?: string | null
  url?: string | null
  externalIds?: Record<string, unknown> | null
  publicationTypes?: string[] | null
  openAccessPdf?: { url?: string | null } | null
  citationCount?: number | null
  referenceCount?: number | null
  fieldsOfStudy?: string[] | null
}

export interface SemanticScholarSearchResult {
  papers: SemanticScholarPaper[]
  total: number
}

export interface SemanticScholarSearchOptions {
  signal?: AbortSignal
  apiKey?: string | null
  timeoutMs?: number
  limit?: number
}

export interface SemanticScholarProvider {
  search(
    query: string,
    options?: SemanticScholarSearchOptions,
  ): Promise<SemanticScholarSearchResult>
}

export interface LiteratureSearchInput {
  plannerKeywords: SearchKeywordGroup[]
  retrievalPlan: RetrievalPlan
}

export interface LiteratureSearchOutcome {
  literature: LiteratureClue[]
  status: Extract<LiteratureRetrievalStatus, 'completed' | 'empty' | 'failed'>
  queries: string[]
  searchedAt: string
  durationMs: number
  totalFound: number
  error: string | null
  warnings: string[]
}

export interface LiteratureSearch {
  search(
    input: LiteratureSearchInput,
    signal: AbortSignal,
  ): Promise<LiteratureSearchOutcome>
}
