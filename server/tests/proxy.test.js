import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { test } from 'node:test'

import { loadConfig, parseAllowedOrigins } from '../src/config/env.js'
import { createProxyServer } from '../src/index.js'
import { RateLimiter } from '../src/services/rateLimiter.js'
import {
  SEMANTIC_SCHOLAR_FIELDS,
  SEMANTIC_SCHOLAR_SEARCH_URL,
} from '../src/services/semanticScholarClient.js'

const SEARCH_PATH = '/api/semantic-scholar/search'
const ORIGIN = 'http://frontend.test'
const SERVER_KEY = 'server-only-s2-secret'

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(handler) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  fn.calls = calls
  return fn
}

async function startProxy(t, options = {}) {
  const logs = []
  const config = {
    nodeEnv: 'test',
    port: 0,
    apiKey: options.apiKey ?? null,
    allowedOrigins: options.allowedOrigins ?? [ORIGIN],
    upstreamTimeoutMs: options.timeoutMs ?? 1_000,
    rateLimit: 100,
    rateWindowMs: 60_000,
  }
  const server = createProxyServer({
    config,
    fetchImpl: options.fetchImpl,
    rateLimiter:
      options.rateLimiter ??
      new RateLimiter({ limit: config.rateLimit, windowMs: config.rateWindowMs }),
    logger: {
      error: (...args) => logs.push(args.join(' ')),
    },
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections?.()
      }),
  )
  const address = server.address()
  return {
    base: `http://127.0.0.1:${address.port}`,
    logs,
  }
}

async function getJson(base, path, init = {}) {
  const response = await fetch(`${base}${path}`, init)
  const text = await response.text()
  return {
    response,
    text,
    body: text ? JSON.parse(text) : null,
  }
}

test('normal request is forwarded with fixed upstream URL, fields and server key', async (t) => {
  const fetchImpl = mockFetch(() =>
    jsonResponse(200, {
      total: 37,
      data: [
        {
          paperId: 'p1',
          title: 'Paper One',
          authors: [{ name: 'Ada Lovelace' }],
        },
      ],
    }),
  )
  const { base } = await startProxy(t, {
    fetchImpl,
    apiKey: SERVER_KEY,
  })

  const { response, body } = await getJson(
    base,
    `${SEARCH_PATH}?query=domain%20generalization&limit=5`,
    { headers: { Origin: ORIGIN } },
  )

  assert.equal(response.status, 200)
  assert.equal(body.total, 37)
  assert.equal(body.data[0].paperId, 'p1')
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    ORIGIN,
  )

  assert.equal(fetchImpl.calls.length, 1)
  const upstream = new URL(fetchImpl.calls[0].url)
  assert.equal(
    `${upstream.origin}${upstream.pathname}`,
    SEMANTIC_SCHOLAR_SEARCH_URL,
  )
  assert.equal(upstream.searchParams.get('query'), 'domain generalization')
  assert.equal(upstream.searchParams.get('limit'), '5')
  assert.equal(
    upstream.searchParams.get('fields'),
    SEMANTIC_SCHOLAR_FIELDS.join(','),
  )
  assert.equal(
    fetchImpl.calls[0].init.headers['x-api-key'],
    SERVER_KEY,
  )
})

test('rejects missing query, invalid limit and unsupported parameters', async (t) => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { total: 0, data: [] }))
  const { base } = await startProxy(t, { fetchImpl })

  const missing = await getJson(base, SEARCH_PATH)
  assert.equal(missing.response.status, 400)
  assert.equal(missing.body.error.code, 'invalid_query')

  const empty = await getJson(base, `${SEARCH_PATH}?query=%20%20`)
  assert.equal(empty.response.status, 400)
  assert.equal(empty.body.error.code, 'invalid_query')

  const long = await getJson(
    base,
    `${SEARCH_PATH}?query=${'a'.repeat(301)}`,
  )
  assert.equal(long.response.status, 400)
  assert.equal(long.body.error.code, 'invalid_query')

  for (const limit of ['0', '11', 'abc', '2.5']) {
    const result = await getJson(base, `${SEARCH_PATH}?query=test&limit=${limit}`)
    assert.equal(result.response.status, 400)
    assert.equal(result.body.error.code, 'invalid_limit')
  }

  const arbitrary = await getJson(
    base,
    `${SEARCH_PATH}?query=test&url=https://evil.example`,
  )
  assert.equal(arbitrary.response.status, 400)
  assert.equal(arbitrary.body.error.code, 'unsupported_parameter')

  const clientKey = await getJson(
    base,
    `${SEARCH_PATH}?query=test&apiKey=client-secret`,
  )
  assert.equal(clientKey.response.status, 400)
  assert.equal(clientKey.body.error.code, 'unsupported_parameter')
  assert.equal(fetchImpl.calls.length, 0)
})

test('maps upstream 400, 401, 403, 429 and 5xx without leaking the key', async (t) => {
  for (const status of [400, 401, 403, 429, 503]) {
    const fetchImpl = mockFetch(() =>
      jsonResponse(status, {
        error: `upstream failed with ${SERVER_KEY}`,
      }),
    )
    const { base } = await startProxy(t, {
      fetchImpl,
      apiKey: SERVER_KEY,
    })
    const { response, text, body } = await getJson(
      base,
      `${SEARCH_PATH}?query=test`,
    )
    assert.equal(response.status, status)
    assert.match(body.error.code, /^upstream_/)
    assert.equal(text.includes(SERVER_KEY), false)
    assert.equal(response.headers.get('x-api-key'), null)
  }
})

test('maps network failure to 502 and upstream timeout to 504', async (t) => {
  const network = await startProxy(t, {
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    },
  })
  const networkResult = await getJson(
    network.base,
    `${SEARCH_PATH}?query=test`,
  )
  assert.equal(networkResult.response.status, 502)
  assert.equal(networkResult.body.error.code, 'upstream_network')

  const timeoutFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      )
    })
  const timeout = await startProxy(t, {
    fetchImpl: timeoutFetch,
    timeoutMs: 20,
  })
  const timeoutResult = await getJson(
    timeout.base,
    `${SEARCH_PATH}?query=test`,
  )
  assert.equal(timeoutResult.response.status, 504)
  assert.equal(timeoutResult.body.error.code, 'upstream_timeout')
})

test('aborts the upstream request when the client disconnects', async (t) => {
  let started
  const startedPromise = new Promise((resolve) => {
    started = resolve
  })
  let upstreamAborted = false
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      started()
      init.signal.addEventListener(
        'abort',
        () => {
          upstreamAborted = true
          reject(new Error('aborted'))
        },
        { once: true },
      )
    })
  const { base } = await startProxy(t, { fetchImpl })
  const controller = new AbortController()

  const pending = fetch(`${base}${SEARCH_PATH}?query=test`, {
    signal: controller.signal,
  }).catch(() => null)
  await startedPromise
  controller.abort()
  await pending

  const deadline = Date.now() + 1000
  while (!upstreamAborted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(upstreamAborted, true)
})

test('enforces CORS allowlist and rejects wildcard configuration', async (t) => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { total: 0, data: [] }))
  const { base } = await startProxy(t, { fetchImpl })

  const preflight = await fetch(`${base}${SEARCH_PATH}`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'GET',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN)
  assert.match(
    preflight.headers.get('access-control-allow-methods') ?? '',
    /GET/,
  )

  const blocked = await getJson(base, `${SEARCH_PATH}?query=test`, {
    headers: { Origin: 'https://evil.example' },
  })
  assert.equal(blocked.response.status, 403)
  assert.equal(blocked.body.error.code, 'origin_not_allowed')
  assert.equal(
    blocked.response.headers.get('access-control-allow-origin'),
    null,
  )
  assert.equal(fetchImpl.calls.length, 0)

  assert.throws(
    () => parseAllowedOrigins('*', 'production'),
    /通配符/,
  )
  assert.deepEqual(loadConfig({ NODE_ENV: 'production' }).allowedOrigins, [])
  assert.deepEqual(loadConfig({ NODE_ENV: 'development' }).allowedOrigins, [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])
})

test('restricts methods and rejects request bodies on GET', async (t) => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { total: 0, data: [] }))
  const { base } = await startProxy(t, { fetchImpl })

  const post = await getJson(base, `${SEARCH_PATH}?query=test`, {
    method: 'POST',
  })
  assert.equal(post.response.status, 405)
  assert.equal(post.body.error.code, 'method_not_allowed')

  const bodyResult = await new Promise((resolve, reject) => {
    const req = httpRequest(
      `${base}${SEARCH_PATH}?query=test`,
      {
        method: 'GET',
        headers: {
          Origin: ORIGIN,
          'Content-Type': 'application/json',
          'Content-Length': '7',
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode, text }))
      },
    )
    req.on('error', reject)
    req.end('{"x":1}')
  })
  assert.equal(bodyResult.status, 400)
  assert.equal(JSON.parse(bodyResult.text).error.code, 'request_body_not_allowed')
  assert.equal(fetchImpl.calls.length, 0)
})

test('applies the in-memory rate limit', async (t) => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { total: 0, data: [] }))
  const { base } = await startProxy(t, {
    fetchImpl,
    rateLimiter: new RateLimiter({ limit: 2, windowMs: 60_000 }),
  })

  const first = await getJson(base, `${SEARCH_PATH}?query=one`)
  const second = await getJson(base, `${SEARCH_PATH}?query=two`)
  const third = await getJson(base, `${SEARCH_PATH}?query=three`)

  assert.equal(first.response.status, 200)
  assert.equal(second.response.status, 200)
  assert.equal(third.response.status, 429)
  assert.equal(third.body.error.code, 'rate_limited')
  assert.ok(Number(third.response.headers.get('retry-after')) >= 1)
  assert.equal(fetchImpl.calls.length, 2)
})

test('never writes the API key to logs', async (t) => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { total: 0, data: [] }))
  const { base, logs } = await startProxy(t, {
    fetchImpl,
    apiKey: SERVER_KEY,
  })

  await getJson(base, `${SEARCH_PATH}?query=test`)
  assert.equal(logs.join(' ').includes(SERVER_KEY), false)
})
