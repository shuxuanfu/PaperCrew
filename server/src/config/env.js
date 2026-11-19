const DEFAULT_PORT = 8787
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RATE_LIMIT = 60
const DEFAULT_RATE_WINDOW_MS = 60_000
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function readInteger(name, value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} 必须是 ${min} 到 ${max} 之间的整数。`)
  }
  return parsed
}

export function parseAllowedOrigins(value, nodeEnv = 'development') {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) {
    return nodeEnv === 'production' ? [] : [...DEV_ORIGINS]
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item === '*') {
        throw new Error('CORS_ALLOWED_ORIGINS 不允许使用通配符 *。')
      }
      let url
      try {
        url = new URL(item)
      } catch {
        throw new Error(`CORS_ALLOWED_ORIGINS 包含非法来源：${item}`)
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`CORS_ALLOWED_ORIGINS 只支持 http(s) 来源：${item}`)
      }
      if (url.origin !== item.replace(/\/$/, '')) {
        throw new Error(`CORS_ALLOWED_ORIGINS 只能配置来源，不能包含路径：${item}`)
      }
      return url.origin
    })
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV?.trim() || 'development'
  return {
    nodeEnv,
    port: readInteger('PORT', env.PORT, DEFAULT_PORT, 1, 65_535),
    apiKey: env.SEMANTIC_SCHOLAR_API_KEY?.trim() || null,
    allowedOrigins: parseAllowedOrigins(
      env.CORS_ALLOWED_ORIGINS,
      nodeEnv,
    ),
    upstreamTimeoutMs: readInteger(
      'SEMANTIC_SCHOLAR_TIMEOUT_MS',
      env.SEMANTIC_SCHOLAR_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      1_000,
      60_000,
    ),
    rateLimit: readInteger(
      'RATE_LIMIT_MAX',
      env.RATE_LIMIT_MAX,
      DEFAULT_RATE_LIMIT,
      1,
      10_000,
    ),
    rateWindowMs: readInteger(
      'RATE_LIMIT_WINDOW_MS',
      env.RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_WINDOW_MS,
      1_000,
      3_600_000,
    ),
  }
}
