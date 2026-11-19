export const SEMANTIC_SCHOLAR_SEARCH_URL =
  'https://api.semanticscholar.org/graph/v1/paper/search'

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
]

const MAX_RESPONSE_BYTES = 2_000_000

export class LiteratureUpstreamError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'LiteratureUpstreamError'
    this.status = status
    this.code = code
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null
}

function statusError(status) {
  if (status === 400) {
    return new LiteratureUpstreamError(
      400,
      'upstream_request',
      'Semantic Scholar 拒绝了检索请求。',
    )
  }
  if (status === 401 || status === 403) {
    return new LiteratureUpstreamError(
      status,
      'upstream_auth',
      'Semantic Scholar 认证失败：请检查后端 SEMANTIC_SCHOLAR_API_KEY。',
    )
  }
  if (status === 404) {
    return new LiteratureUpstreamError(
      404,
      'upstream_not_found',
      'Semantic Scholar 检索接口不存在。',
    )
  }
  if (status === 429) {
    return new LiteratureUpstreamError(
      429,
      'upstream_rate_limit',
      'Semantic Scholar 请求受限（429）：请稍后重试；匿名额度更低，可在后端配置 API Key。',
    )
  }
  if (status >= 500) {
    return new LiteratureUpstreamError(
      status,
      'upstream_server',
      'Semantic Scholar 服务暂时不可用，请稍后重试。',
    )
  }
  return new LiteratureUpstreamError(
    502,
    'upstream_status',
    `Semantic Scholar 返回了未预期的 HTTP ${status}。`,
  )
}

export async function searchSemanticScholar({
  query,
  limit,
  apiKey = null,
  signal,
  timeoutMs = 15_000,
  fetchImpl = fetch,
}) {
  if (signal?.aborted) {
    throw new LiteratureUpstreamError(
      499,
      'client_cancelled',
      '客户端已取消请求。',
    )
  }

  const url = new URL(SEMANTIC_SCHOLAR_SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('fields', SEMANTIC_SCHOLAR_FIELDS.join(','))

  const headers = { Accept: 'application/json' }
  if (apiKey) {
    headers['x-api-key'] = apiKey
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })

  const transportError = () => {
    if (signal?.aborted) {
      return new LiteratureUpstreamError(
        499,
        'client_cancelled',
        '客户端已取消请求。',
      )
    }
    if (timedOut) {
      return new LiteratureUpstreamError(
        504,
        'upstream_timeout',
        'Semantic Scholar 请求超时，请稍后重试。',
      )
    }
    return new LiteratureUpstreamError(
      502,
      'upstream_network',
      '文献代理无法连接 Semantic Scholar。',
    )
  }

  try {
    let response
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
    } catch {
      throw transportError()
    }

    if (!response.ok) {
      const cleanup = response.body?.cancel()
      if (cleanup) {
        void cleanup.catch(() => {})
      }
      throw statusError(response.status)
    }

    let text
    try {
      text = await response.text()
    } catch {
      throw transportError()
    }

    if (text.length > MAX_RESPONSE_BYTES) {
      throw new LiteratureUpstreamError(
        502,
        'upstream_response',
        'Semantic Scholar 响应过大，已拒绝转发。',
      )
    }

    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new LiteratureUpstreamError(
        502,
        'upstream_response',
        'Semantic Scholar 返回了无法解析的 JSON。',
      )
    }

    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new LiteratureUpstreamError(
        502,
        'upstream_response',
        'Semantic Scholar 响应缺少 data 数组。',
      )
    }

    const data = payload.data.filter(isRecord)
    const total =
      typeof payload.total === 'number' && Number.isFinite(payload.total)
        ? payload.total
        : data.length

    return { data, total }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
