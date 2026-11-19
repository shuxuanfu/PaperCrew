import type { ApiSettings } from '@/types/ui'

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  modelName: string
  temperature: number
  maxTokens: number
  jsonMode: boolean
  timeoutMs: number
}

export const DEFAULT_TEMPERATURE = 0.2
export const DEFAULT_MAX_TOKENS = 4096
export const DEFAULT_TIMEOUT_MS = 60_000

export function toLLMConfig(
  settings: ApiSettings,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): LLMConfig {
  return {
    baseUrl: settings.baseUrl.trim(),
    apiKey: settings.apiKey.trim(),
    modelName: settings.modelName.trim(),
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    jsonMode: settings.jsonMode,
    timeoutMs,
  }
}

export function resolveChatCompletionsUrl(baseUrl: string): URL {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new Error('Base URL 不能为空')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Base URL 必须是合法的 http(s) 地址')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Base URL 只能使用 http 或 https 协议')
  }

  let path = parsed.pathname.replace(/\/+$/, '')
  path = path.replace(/\/v1\/v1(?=\/|$)/gi, '/v1')

  if (/\/chat\/completions$/i.test(path)) {
    parsed.pathname = path
  } else if (path === '') {
    parsed.pathname = '/v1/chat/completions'
  } else {
    parsed.pathname = `${path}/chat/completions`
  }

  parsed.search = ''
  parsed.hash = ''
  return parsed
}
