import {
  LiteratureUpstreamError,
  searchSemanticScholar,
} from '../services/semanticScholarClient.js'

export const SEMANTIC_SCHOLAR_PROXY_PATH = '/api/semantic-scholar/search'
const MAX_QUERY_LENGTH = 300
const MIN_QUERY_LENGTH = 2
const MAX_LIMIT = 10
const DEFAULT_LIMIT = 5
const ALLOWED_PARAMS = new Set(['query', 'limit'])

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  })
  res.end(payload)
}

function sendError(res, status, code, message, extraHeaders = {}) {
  sendJson(res, status, { error: { code, message } }, extraHeaders)
}

function applyCors(req, res, allowedOrigins) {
  const origin = req.headers.origin
  if (!origin) {
    return true
  }
  if (!allowedOrigins.includes(origin)) {
    return false
  }
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  return true
}

function parseRequest(searchParams) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      return {
        error: {
          status: 400,
          code: 'unsupported_parameter',
          message: `不支持的请求参数：${key}`,
        },
      }
    }
  }

  const query = (searchParams.get('query') ?? '').trim()
  if (query.length < MIN_QUERY_LENGTH) {
    return {
      error: {
        status: 400,
        code: 'invalid_query',
        message: `query 不能为空，且至少 ${MIN_QUERY_LENGTH} 个字符。`,
      },
    }
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return {
      error: {
        status: 400,
        code: 'invalid_query',
        message: `query 不能超过 ${MAX_QUERY_LENGTH} 个字符。`,
      },
    }
  }

  const rawLimit = searchParams.get('limit')
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return {
      error: {
        status: 400,
        code: 'invalid_limit',
        message: `limit 必须是 1 到 ${MAX_LIMIT} 之间的整数。`,
      },
    }
  }

  return { query, limit }
}

export async function handleSemanticScholarRequest(
  req,
  res,
  { config, fetchImpl = fetch, rateLimiter },
) {
  setSecurityHeaders(res)

  if (!applyCors(req, res, config.allowedOrigins)) {
    sendError(
      res,
      403,
      'origin_not_allowed',
      '当前来源不在 CORS_ALLOWED_ORIGINS 白名单中。',
    )
    return
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', '仅支持 GET 请求。', {
      Allow: 'GET, OPTIONS',
    })
    return
  }

  let url
  try {
    url = new URL(req.url ?? '/', 'http://papercrew-proxy.local')
  } catch {
    sendError(res, 400, 'invalid_url', '请求地址不合法。')
    return
  }

  if (url.pathname !== SEMANTIC_SCHOLAR_PROXY_PATH) {
    sendError(res, 404, 'not_found', '代理接口不存在。')
    return
  }

  if (
    (req.headers['content-length'] &&
      req.headers['content-length'] !== '0') ||
    req.headers['transfer-encoding']
  ) {
    sendError(res, 400, 'request_body_not_allowed', 'GET 请求不允许携带请求体。')
    return
  }

  const parsed = parseRequest(url.searchParams)
  if (parsed.error) {
    sendError(
      res,
      parsed.error.status,
      parsed.error.code,
      parsed.error.message,
    )
    return
  }

  const clientKey = req.socket.remoteAddress ?? 'unknown'
  const rate = rateLimiter.check(clientKey)
  if (!rate.allowed) {
    sendError(
      res,
      429,
      'rate_limited',
      '代理请求过于频繁，请稍后重试。',
      { 'Retry-After': String(rate.retryAfterSeconds) },
    )
    return
  }

  const controller = new AbortController()
  const onAborted = () => controller.abort()
  const onClose = () => {
    if (!res.writableEnded) {
      controller.abort()
    }
  }
  req.on('aborted', onAborted)
  res.on('close', onClose)

  try {
    const result = await searchSemanticScholar({
      query: parsed.query,
      limit: parsed.limit,
      apiKey: config.apiKey,
      signal: controller.signal,
      timeoutMs: config.upstreamTimeoutMs,
      fetchImpl,
    })

    if (!res.writableEnded && !res.destroyed) {
      sendJson(res, 200, result)
    }
  } catch (error) {
    if (
      error instanceof LiteratureUpstreamError &&
      error.code === 'client_cancelled'
    ) {
      return
    }
    if (res.writableEnded || res.destroyed) {
      return
    }
    if (error instanceof LiteratureUpstreamError) {
      sendError(res, error.status, error.code, error.message)
      return
    }
    sendError(
      res,
      500,
      'internal_error',
      '文献代理内部错误，请稍后重试。',
    )
  } finally {
    req.off('aborted', onAborted)
    res.off('close', onClose)
  }
}
