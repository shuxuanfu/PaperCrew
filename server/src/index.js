import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadConfig } from './config/env.js'
import { handleSemanticScholarRequest } from './routes/semanticScholar.js'
import { RateLimiter } from './services/rateLimiter.js'

export function createProxyServer({
  config = loadConfig(),
  fetchImpl = fetch,
  rateLimiter = new RateLimiter({
    limit: config.rateLimit,
    windowMs: config.rateWindowMs,
  }),
  logger = console,
} = {}) {
  return createServer((req, res) => {
    handleSemanticScholarRequest(req, res, {
      config,
      fetchImpl,
      rateLimiter,
    }).catch((error) => {
      logger.error(
        'Semantic Scholar proxy request failed:',
        error instanceof Error ? error.message : 'unknown error',
      )
      if (!res.writableEnded && !res.destroyed) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(
          JSON.stringify({
            error: {
              code: 'internal_error',
              message: '文献代理内部错误，请稍后重试。',
            },
          }),
        )
      }
    })
  })
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : '代理配置无效。',
    )
    process.exit(1)
  }

  const server = createProxyServer({ config })
  server.listen(config.port, () => {
    console.log(
      `PaperCrew literature proxy listening on http://127.0.0.1:${config.port}`,
    )
    console.log(
      `CORS origins: ${
        config.allowedOrigins.length > 0
          ? config.allowedOrigins.join(', ')
          : '(none; set CORS_ALLOWED_ORIGINS)'
      }`,
    )
  })

  const shutdown = () => {
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
