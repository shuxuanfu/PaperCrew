import { OpenAICompatibleProvider } from '@/services/llm/openAICompatibleProvider'
import type { LLMProvider } from '@/services/llm/llmProvider'
import { useSettingsStore } from '@/store/settingsStore'
import type { ApiSettings } from '@/types/ui'
import type { RunMode } from '@/domain/agent/ids'

export type ApiField = 'baseUrl' | 'apiKey' | 'modelName' | 'temperature' | 'maxTokens'

export interface SetupIssue {
  field: ApiField
  message: string
}

export interface ApiCompleteness {
  baseUrl: boolean
  apiKey: boolean
  modelName: boolean
  complete: boolean
}

const TEST_PROMPT = 'Reply with the single word: ok'
const TEST_TIMEOUT_MS = 20_000

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`
}

export function getCompleteness(api: ApiSettings): ApiCompleteness {
  const baseUrl = api.baseUrl.trim() !== ''
  const apiKey = api.apiKey.trim() !== ''
  const modelName = api.modelName.trim() !== ''
  return { baseUrl, apiKey, modelName, complete: baseUrl && apiKey && modelName }
}

export function validateApiSettings(api: ApiSettings): SetupIssue[] {
  const issues: SetupIssue[] = []
  if (!api.baseUrl.trim()) {
    issues.push({ field: 'baseUrl', message: 'Base URL 不能为空。' })
  } else if (!isHttpUrl(api.baseUrl.trim())) {
    issues.push({
      field: 'baseUrl',
      message: 'Base URL 必须是合法的 http(s) 地址。',
    })
  }
  if (!api.apiKey.trim()) {
    issues.push({ field: 'apiKey', message: 'API Key 不能为空。' })
  }
  if (!api.modelName.trim()) {
    issues.push({ field: 'modelName', message: 'Model Name 不能为空。' })
  }
  if (
    !Number.isFinite(api.temperature) ||
    api.temperature < 0 ||
    api.temperature > 2
  ) {
    issues.push({
      field: 'temperature',
      message: 'Temperature 必须在 0 到 2 之间。',
    })
  }
  if (
    !Number.isInteger(api.maxTokens) ||
    api.maxTokens < 256 ||
    api.maxTokens > 32_000
  ) {
    issues.push({
      field: 'maxTokens',
      message: 'Max Tokens 必须是 256 到 32000 之间的整数。',
    })
  }
  return issues
}

export interface TestConnectionResult {
  model: string
  latencyMs: number
}

export class ConfigService {
  static getMode(): RunMode {
    return useSettingsStore.getState().mode
  }

  static setMode(mode: RunMode): void {
    useSettingsStore.getState().setMode(mode)
  }

  static read(): ApiSettings {
    return useSettingsStore.getState().api
  }

  static isComplete(): boolean {
    return getCompleteness(ConfigService.read()).complete
  }

  static missingFields(): string[] {
    const api = ConfigService.read()
    const c = getCompleteness(api)
    const missing: string[] = []
    if (!c.baseUrl) missing.push('Base URL')
    if (!c.apiKey) missing.push('API Key')
    if (!c.modelName) missing.push('Model Name')
    return missing
  }

  static save(api: ApiSettings): SetupIssue[] {
    const issues = validateApiSettings(api)
    if (issues.length > 0) {
      return issues
    }
    useSettingsStore.getState().saveApiSettings({
      baseUrl: api.baseUrl.trim(),
      apiKey: api.apiKey.trim(),
      modelName: api.modelName.trim(),
      temperature: api.temperature,
      maxTokens: api.maxTokens,
      jsonMode: api.jsonMode,
    })
    return []
  }

  static clear(): void {
    useSettingsStore.getState().deleteApiSettings()
  }

  static async testConnection(
    api: ApiSettings,
    provider: LLMProvider = new OpenAICompatibleProvider(),
  ): Promise<TestConnectionResult> {
    const issues = validateApiSettings(api)
    if (issues.length > 0) {
      throw new Error(issues[0].message)
    }

    const startedAt = Date.now()
    const response = await provider.chatCompletion(
      {
        baseURL: api.baseUrl.trim(),
        apiKey: api.apiKey.trim(),
        model: api.modelName.trim(),
        messages: [{ role: 'user', content: TEST_PROMPT }],
        temperature: 0,
        maxTokens: 256,
        timeoutMs: TEST_TIMEOUT_MS,
      },
      undefined,
    )

    return {
      model: response.model,
      latencyMs: Date.now() - startedAt,
    }
  }
}
