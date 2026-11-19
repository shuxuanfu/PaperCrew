import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  LiteratureCancelledError,
  LiteratureRateLimitError,
} from '@/services/literature/errors'
import { LiteratureSearchService } from '@/services/literature/literatureSearchService'
import { mapSemanticScholarPaper } from '@/services/literature/semanticScholarMapper'
import {
  SEMANTIC_SCHOLAR_SEARCH_URL,
  SemanticScholarApiProvider,
} from '@/services/literature/semanticScholarProvider'
import {
  SEMANTIC_SCHOLAR_FIELDS,
  type SemanticScholarPaper,
  type SemanticScholarProvider,
  type SemanticScholarSearchOptions,
} from '@/services/literature/semanticScholarTypes'
import type { RetrievalPlan, SearchKeywordGroup } from '@/types/research'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function hangingBodyFetch() {
  return (_url: string, init: RequestInit): Promise<Response> => {
    const signal = init.signal
    return Promise.resolve({
      ok: true,
      status: 200,
      body: null,
      json: () =>
        new Promise<unknown>((_resolve, reject) => {
          const abort = () => reject(new DOMException('Aborted', 'AbortError'))
          if (signal?.aborted) {
            abort()
            return
          }
          signal?.addEventListener('abort', abort, { once: true })
        }),
    } as unknown as Response)
  }
}

const plannerKeywords: SearchKeywordGroup[] = [
  {
    id: 'kw1',
    label: '泛化与分布偏移',
    keywords: ['domain generalization', 'medical image segmentation'],
    purpose: '覆盖泛化主线',
  },
  {
    id: 'kw2',
    label: '跨中心评测',
    keywords: ['cross-center evaluation', 'few-shot segmentation'],
    purpose: '覆盖评测协议',
  },
]

const retrievalPlan: RetrievalPlan = {
  searchStrategy:
    '先检索泛化性与小样本分割，再补充跨中心评测与领域自适应方法。',
  keywordGroups: [
    'domain shift medical imaging',
    'cross-site evaluation segmentation',
  ],
  researchGaps: ['缺少统一评测基准'],
  nextDirections: ['建立标准化跨中心数据划分'],
}

function paper(
  paperId: string,
  title: string,
  overrides: Partial<SemanticScholarPaper> = {},
): SemanticScholarPaper {
  return {
    paperId,
    title,
    authors: [{ name: 'Ada Lovelace' }],
    year: 2024,
    venue: 'Test Venue',
    abstract: 'domain generalization medical image segmentation study',
    url: `https://www.semanticscholar.org/paper/${paperId}`,
    externalIds: { DOI: `10.1000/${paperId}` },
    citationCount: 12,
    referenceCount: 30,
    ...overrides,
  }
}

class RecordingProvider implements SemanticScholarProvider {
  readonly queries: string[] = []
  readonly options: SemanticScholarSearchOptions[] = []
  private readonly handler: (
    query: string,
    index: number,
  ) => SemanticScholarPaper[] | Error

  constructor(
    handler: (query: string, index: number) => SemanticScholarPaper[] | Error,
  ) {
    this.handler = handler
  }

  async search(
    query: string,
    options: SemanticScholarSearchOptions = {},
  ): Promise<{ papers: SemanticScholarPaper[]; total: number }> {
    const index = this.queries.length
    this.queries.push(query)
    this.options.push(options)
    const result = this.handler(query, index)
    if (result instanceof Error) {
      throw result
    }
    return { papers: result, total: result.length }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Semantic Scholar provider', () => {
  it('requests the graph search endpoint with query, limit and all fields anonymously', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return jsonResponse(200, { total: 1, data: [paper('p1', 'Paper One')] })
    })

    const provider = new SemanticScholarApiProvider()
    const result = await provider.search('domain generalization', { limit: 5 })

    expect(result.papers).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('GET')
    const url = new URL(calls[0].url)
    expect(`${url.origin}${url.pathname}`).toBe(SEMANTIC_SCHOLAR_SEARCH_URL)
    expect(url.searchParams.get('query')).toBe('domain generalization')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('fields')).toBe(
      SEMANTIC_SCHOLAR_FIELDS.join(','),
    )
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Accept).toBe('application/json')
    expect(headers['x-api-key']).toBeUndefined()
  })

  it('sends x-api-key only when a key is configured', async () => {
    const headersSeen: Array<Record<string, string>> = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      headersSeen.push(init.headers as Record<string, string>)
      return jsonResponse(200, { total: 0, data: [] })
    })

    const provider = new SemanticScholarApiProvider()
    await provider.search('query', { apiKey: '  s2-secret  ' })
    await provider.search('query', { apiKey: '   ' })

    expect(headersSeen[0]['x-api-key']).toBe('s2-secret')
    expect(headersSeen[1]['x-api-key']).toBeUndefined()
  })

  it('maps 401 and 403 to an auth error without leaking the key', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(401, { error: 'nope' }))
    const provider = new SemanticScholarApiProvider()

    const error = await provider
      .search('query', { apiKey: 's2-secret' })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'auth' })
    expect(String((error as Error).message)).not.toContain('s2-secret')
  })

  it('maps 429 to a rate limit error', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(429, { error: 'slow' }))
    const provider = new SemanticScholarApiProvider()

    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'rate_limit',
    })
  })

  it('maps 400, 403 and 404 to request or auth errors', async () => {
    const provider = new SemanticScholarApiProvider()

    vi.stubGlobal('fetch', async () => jsonResponse(400, { error: 'bad' }))
    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'request',
    })

    vi.stubGlobal('fetch', async () => jsonResponse(403, { error: 'forbidden' }))
    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'auth',
    })

    vi.stubGlobal('fetch', async () => jsonResponse(404, { error: 'missing' }))
    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'request',
    })
  })

  it('maps 5xx to a server error', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(503, { error: 'down' }))
    const provider = new SemanticScholarApiProvider()

    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'server',
    })
  })

  it('maps fetch rejection to a network error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    const provider = new SemanticScholarApiProvider()

    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects malformed JSON and payloads without a data array', async () => {
    vi.stubGlobal('fetch', async () => new Response('not json', { status: 200 }))
    const provider = new SemanticScholarApiProvider()
    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'response',
    })

    vi.stubGlobal('fetch', async () => jsonResponse(200, { total: 3 }))
    await expect(provider.search('query')).rejects.toMatchObject({
      code: 'response',
    })
  })

  it('times out a hanging response body', async () => {
    vi.stubGlobal('fetch', hangingBodyFetch())
    const provider = new SemanticScholarApiProvider()

    await expect(
      provider.search('query', { timeoutMs: 15 }),
    ).rejects.toMatchObject({ code: 'timeout' })
  })

  it('cancels an in-flight request through the external AbortSignal', async () => {
    vi.stubGlobal('fetch', hangingBodyFetch())
    const provider = new SemanticScholarApiProvider()
    const controller = new AbortController()

    const pending = provider.search('query', { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
  })
})

describe('Semantic Scholar mapper', () => {
  it('maps a complete paper without inventing metadata', () => {
    const mapped = mapSemanticScholarPaper(
      {
        paperId: 'abc123',
        title: 'Robust Segmentation',
        authors: [{ name: 'Ada Lovelace' }, { name: '  ' }, { name: null }],
        year: 2023,
        venue: 'Medical Imaging',
        abstract: 'domain generalization medical image segmentation',
        url: 'https://www.semanticscholar.org/paper/abc123',
        externalIds: { DOI: 'https://doi.org/10.1000/xyz' },
        openAccessPdf: { url: 'https://example.org/paper.pdf' },
        citationCount: 42,
        referenceCount: 60,
      },
      ['domain generalization', 'medical image', 'segmentation'],
    )

    expect(mapped).toEqual({
      id: 'abc123',
      title: 'Robust Segmentation',
      authors: ['Ada Lovelace'],
      year: 2023,
      venue: 'Medical Imaging',
      abstract: 'domain generalization medical image segmentation',
      relevance: 'high',
      sourceType: 'real',
      doi: '10.1000/xyz',
      url: 'https://www.semanticscholar.org/paper/abc123',
      openAccessPdf: 'https://example.org/paper.pdf',
      citationCount: 42,
      referenceCount: 60,
      relatedQuestionIds: [],
    })
  })

  it('keeps missing optional fields null instead of fabricating values', () => {
    const mapped = mapSemanticScholarPaper(
      { paperId: 'p1', title: 'Bare Paper' },
      [],
    )

    expect(mapped).toMatchObject({
      id: 'p1',
      title: 'Bare Paper',
      authors: [],
      year: null,
      venue: null,
      abstract: null,
      doi: null,
      url: null,
      openAccessPdf: null,
      citationCount: null,
      referenceCount: null,
      relatedQuestionIds: [],
      sourceType: 'real',
      relevance: 'low',
    })
  })

  it('accepts DOI only from externalIds and rejects malformed identifiers', () => {
    const withoutDoi = mapSemanticScholarPaper(
      {
        paperId: 'p1',
        title: 'Paper',
        url: 'https://example.org/paper',
        externalIds: { DOI: 'not-a-doi', ArXiv: '2401.00001' },
      },
      [],
    )
    expect(withoutDoi?.doi).toBeNull()
    expect(withoutDoi?.url).toBe('https://example.org/paper')

    const invalid = mapSemanticScholarPaper(
      {
        paperId: 'p2',
        title: 'Paper',
        year: 1800,
        url: 'javascript:alert(1)',
        openAccessPdf: { url: 'not-a-url' },
      },
      [],
    )
    expect(invalid?.year).toBeNull()
    expect(invalid?.url).toBeNull()
    expect(invalid?.openAccessPdf).toBeNull()
  })

  it('returns null when paperId or title is missing', () => {
    expect(mapSemanticScholarPaper({ title: 'No id' }, [])).toBeNull()
    expect(mapSemanticScholarPaper({ paperId: 'p1' }, [])).toBeNull()
    expect(
      mapSemanticScholarPaper({ paperId: 'p1', title: '   ' }, []),
    ).toBeNull()
  })
})

describe('LiteratureSearchService', () => {
  it('uses both planner keyword groups plus retrieval plan queries', async () => {
    const provider = new RecordingProvider((_query, index) => [
      paper(`p${index}`, `Paper ${index}`),
    ])
    const service = new LiteratureSearchService({
      provider,
      getApiKey: () => 's2-key',
      limitPerQuery: 5,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })

    const outcome = await service.search(
      { plannerKeywords, retrievalPlan },
      new AbortController().signal,
    )

    expect(outcome.status).toBe('completed')
    expect(outcome.queries).toEqual([
      'domain generalization medical image segmentation',
      'cross-center evaluation few-shot segmentation',
      'domain shift medical imaging',
      'cross-site evaluation segmentation',
    ])
    expect(provider.queries).toEqual(outcome.queries)
    expect(provider.options.every((options) => options.limit === 5)).toBe(true)
    expect(provider.options.every((options) => options.apiKey === 's2-key')).toBe(
      true,
    )
    expect(outcome.literature).toHaveLength(4)
    expect(outcome.searchedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(outcome.totalFound).toBe(4)
  })

  it('deduplicates papers returned by multiple queries', async () => {
    const provider = new RecordingProvider((_query, index) => [
      paper('shared', 'Shared Paper'),
      paper(`unique-${index}`, `Unique ${index}`),
    ])
    const service = new LiteratureSearchService({ provider })

    const outcome = await service.search(
      { plannerKeywords, retrievalPlan },
      new AbortController().signal,
    )
    const ids = outcome.literature.map((item) => item.id)

    expect(ids.filter((id) => id === 'shared')).toHaveLength(1)
    expect(new Set(ids).size).toBe(ids.length)
    expect(outcome.literature).toHaveLength(5)
  })

  it('caps the merged result at eight papers while keeping queries balanced', async () => {
    const provider = new RecordingProvider((_query, index) =>
      Array.from({ length: 5 }, (_, item) =>
        paper(`p${index}-${item}`, `Paper ${index}-${item}`),
      ),
    )
    const service = new LiteratureSearchService({ provider })

    const outcome = await service.search(
      { plannerKeywords, retrievalPlan },
      new AbortController().signal,
    )

    expect(outcome.literature).toHaveLength(8)
    expect(outcome.literature.map((item) => item.id)).toEqual([
      'p0-0',
      'p1-0',
      'p2-0',
      'p3-0',
      'p0-1',
      'p1-1',
      'p2-1',
      'p3-1',
    ])
    expect(outcome.totalFound).toBe(20)
  })

  it('returns an empty outcome without fabricating papers', async () => {
    const provider = new RecordingProvider(() => [])
    const service = new LiteratureSearchService({ provider })

    const outcome = await service.search(
      { plannerKeywords, retrievalPlan },
      new AbortController().signal,
    )

    expect(outcome.status).toBe('empty')
    expect(outcome.literature).toEqual([])
    expect(outcome.error).toBeNull()
    expect(outcome.totalFound).toBe(0)
  })

  it('returns failed with empty literature when every query fails', async () => {
    const provider = new RecordingProvider(() => new LiteratureRateLimitError())
    const service = new LiteratureSearchService({ provider })

    const outcome = await service.search(
      { plannerKeywords, retrievalPlan },
      new AbortController().signal,
    )

    expect(outcome.status).toBe('failed')
    expect(outcome.literature).toEqual([])
    expect(outcome.error).toContain('429')
    expect(outcome.warnings).toHaveLength(4)
    expect(outcome.totalFound).toBe(0)
  })

  it('keeps successful results when only some queries fail', async () => {
    const provider = new RecordingProvider((_query, index) =>
      index === 1
        ? new Error('temporary failure')
        : [paper(`p${index}`, `Paper ${index}`)],
    )
    const service = new LiteratureSearchService({ provider })

    const outcome = await service.search(
      { plannerKeywords, retrievalPlan },
      new AbortController().signal,
    )

    expect(outcome.status).toBe('completed')
    expect(outcome.literature).toHaveLength(3)
    expect(outcome.warnings).toHaveLength(1)
    expect(outcome.error).toContain('部分查询失败')
  })

  it('does not contact the provider when the signal is already aborted', async () => {
    const provider = new RecordingProvider(() => [])
    const service = new LiteratureSearchService({ provider })
    const controller = new AbortController()
    controller.abort()

    await expect(
      service.search(
        { plannerKeywords, retrievalPlan },
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(LiteratureCancelledError)
    expect(provider.queries).toHaveLength(0)
  })
})
