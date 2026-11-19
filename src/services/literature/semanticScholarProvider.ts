import {
  LiteratureAuthError,
  LiteratureCancelledError,
  LiteratureConfigError,
  LiteratureNetworkError,
  LiteratureRateLimitError,
  LiteratureRequestError,
  LiteratureResponseError,
  LiteratureServerError,
  LiteratureTimeoutError,
} from '@/services/literature/errors'
import {
  SEMANTIC_SCHOLAR_FIELDS,
  type SemanticScholarPaper,
  type SemanticScholarProvider,
  type SemanticScholarSearchOptions,
  type SemanticScholarSearchResult,
} from '@/services/literature/semanticScholarTypes'

export const SEMANTIC_SCHOLAR_SEARCH_URL =
  'https://api.semanticscholar.org/graph/v1/paper/search'
export const DEFAULT_LITERATURE_TIMEOUT_MS = 20_000
export const DEFAULT_QUERY_LIMIT = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSearchPayload(payload: unknown): SemanticScholarSearchResult {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new LiteratureResponseError(
      'Semantic Scholar 响应缺少 data 数组。',
    )
  }

  const papers = payload.data.filter(isRecord) as SemanticScholarPaper[]
  const total =
    typeof payload.total === 'number' && Number.isFinite(payload.total)
      ? payload.total
      : papers.length

  return { papers, total }
}

function mapHttpError(status: number): never {
  if (status === 401 || status === 403) {
    throw new LiteratureAuthError()
  }
  if (status === 400) {
    throw new LiteratureRequestError()
  }
  if (status === 404) {
    throw new LiteratureRequestError(
      'Semantic Scholar 接口不存在（404）：请检查服务地址。',
    )
  }
  if (status === 429) {
    throw new LiteratureRateLimitError()
  }
  if (status >= 500) {
    throw new LiteratureServerError()
  }
  throw new LiteratureRequestError(
    `Semantic Scholar 请求失败（HTTP ${status}）。`,
  )
}

export class SemanticScholarApiProvider implements SemanticScholarProvider {
  async search(
    query: string,
    options: SemanticScholarSearchOptions = {},
  ): Promise<SemanticScholarSearchResult> {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      throw new LiteratureConfigError('Semantic Scholar 检索词不能为空。')
    }
    if (options.signal?.aborted) {
      throw new LiteratureCancelledError()
    }

    const limit = options.limit ?? DEFAULT_QUERY_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new LiteratureConfigError('Semantic Scholar 单次检索数量不合法。')
    }

    const url = new URL(SEMANTIC_SCHOLAR_SEARCH_URL)
    url.searchParams.set('query', trimmedQuery)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('fields', SEMANTIC_SCHOLAR_FIELDS.join(','))

    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    const apiKey = options.apiKey?.trim()
    if (apiKey) {
      headers['x-api-key'] = apiKey
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_LITERATURE_TIMEOUT_MS
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const forwardAbort = () => controller.abort()
    options.signal?.addEventListener('abort', forwardAbort, { once: true })

    const transportError = (): Error => {
      if (options.signal?.aborted) {
        return new LiteratureCancelledError()
      }
      if (timedOut) {
        return new LiteratureTimeoutError()
      }
      return new LiteratureNetworkError()
    }

    try {
      let response: Response
      try {
        response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
        })
      } catch {
        throw transportError()
      }

      if (!response.ok) {
        // The HTTP status is authoritative; the body is not needed for errors.
        const cleanup = response.body?.cancel()
        if (cleanup) {
          void cleanup.catch(() => {})
        }
        mapHttpError(response.status)
      }

      let payload: unknown
      try {
        payload = (await response.json()) as unknown
      } catch {
        if (options.signal?.aborted) {
          throw new LiteratureCancelledError()
        }
        if (timedOut) {
          throw new LiteratureTimeoutError()
        }
        throw new LiteratureResponseError(
          'Semantic Scholar 返回了无法解析的 JSON。',
        )
      }

      return parseSearchPayload(payload)
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', forwardAbort)
    }
  }
}
