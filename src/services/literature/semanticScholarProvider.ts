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
import type {
  SemanticScholarPaper,
  SemanticScholarProvider,
  SemanticScholarSearchOptions,
  SemanticScholarSearchResult,
} from '@/services/literature/semanticScholarTypes'

export const SEMANTIC_SCHOLAR_PROXY_PATH = '/api/semantic-scholar/search'
export const DEFAULT_LITERATURE_TIMEOUT_MS = 20_000
export const DEFAULT_QUERY_LIMIT = 5

export interface SemanticScholarApiProviderOptions {
  proxyUrl?: string
  fetchImpl?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSearchPayload(payload: unknown): SemanticScholarSearchResult {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new LiteratureResponseError(
      '文献代理响应缺少 data 数组。',
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
    throw new LiteratureAuthError(
      '文献代理认证失败：请检查后端 SEMANTIC_SCHOLAR_API_KEY 配置。',
    )
  }
  if (status === 400 || status === 404 || status === 405) {
    throw new LiteratureRequestError(
      status === 404
        ? '文献代理接口不存在（404）：请检查 VITE_SEMANTIC_SCHOLAR_PROXY_URL。'
        : '文献代理拒绝了检索请求：请检查关键词与参数。',
    )
  }
  if (status === 429) {
    throw new LiteratureRateLimitError(
      'Semantic Scholar 请求受限（429）：请稍后重试；匿名额度较低，可在后端配置 API Key。',
    )
  }
  if (status === 504) {
    throw new LiteratureTimeoutError(
      '文献代理请求 Semantic Scholar 超时：请稍后重试。',
    )
  }
  if (status === 502 || status >= 500) {
    throw new LiteratureServerError(
      '文献代理无法正常访问 Semantic Scholar（5xx）：请检查后端网络与配置。',
    )
  }
  throw new LiteratureRequestError(
    `文献代理请求失败（HTTP ${status}）。`,
  )
}

function resolveProxyBase(configured: string | undefined): string {
  const value = configured?.trim()
  if (!value) {
    throw new LiteratureConfigError(
      '未配置文献代理地址：请设置 VITE_SEMANTIC_SCHOLAR_PROXY_URL 并重启前端。',
    )
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new LiteratureConfigError(
      'VITE_SEMANTIC_SCHOLAR_PROXY_URL 不是合法的 http(s) 地址。',
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LiteratureConfigError(
      'VITE_SEMANTIC_SCHOLAR_PROXY_URL 必须使用 http(s) 协议。',
    )
  }
  return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`
}

export class SemanticScholarApiProvider implements SemanticScholarProvider {
  private readonly proxyUrl: string | undefined
  private readonly fetchImpl: typeof fetch

  constructor(options: SemanticScholarApiProviderOptions = {}) {
    this.proxyUrl =
      options.proxyUrl ??
      import.meta.env.VITE_SEMANTIC_SCHOLAR_PROXY_URL
    this.fetchImpl = options.fetchImpl ?? fetch
  }

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
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      throw new LiteratureConfigError('文献检索单次数量必须在 1 到 10 之间。')
    }

    const base = resolveProxyBase(this.proxyUrl)
    const url = new URL(
      SEMANTIC_SCHOLAR_PROXY_PATH.replace(/^\//, ''),
      base,
    )
    url.searchParams.set('query', trimmedQuery)
    url.searchParams.set('limit', String(limit))

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
      return new LiteratureNetworkError(
        '无法连接文献代理：请确认后端已启动、地址正确且 CORS 允许当前前端来源。',
      )
    }

    try {
      let response: Response
      try {
        response = await this.fetchImpl(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
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
          '文献代理返回了无法解析的 JSON。',
        )
      }

      return parseSearchPayload(payload)
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', forwardAbort)
    }
  }
}
