export type LLMRole = 'system' | 'user' | 'assistant'

export interface LLMMessage {
  role: LLMRole
  content: string
}

export interface LLMRequest {
  baseURL: string
  apiKey: string
  model: string
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json_object'
  timeoutMs?: number
}

export interface LLMResponse {
  content: string
  model: string
  finishReason: string | null
}

export interface LLMProvider {
  chatCompletion(
    request: LLMRequest,
    signal?: AbortSignal,
  ): Promise<LLMResponse>
}
