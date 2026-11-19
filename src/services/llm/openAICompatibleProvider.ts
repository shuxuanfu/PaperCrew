import {
  LLMAuthError,
  LLMCancelledError,
  LLMConfigError,
  LLMEndpointError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMRequestError,
  LLMResponseError,
  LLMServerError,
  LLMTimeoutError,
} from '@/services/llm/errors'
import {
  DEFAULT_TIMEOUT_MS,
  resolveChatCompletionsUrl,
} from '@/services/llm/llmConfig'
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from '@/services/llm/llmProvider'

const DEFAULT_TEMPERATURE = 0.2

function assertRequest(request: LLMRequest): void {
  if (!request.baseURL.trim()) {
    throw new LLMConfigError('缺少 Base URL：请打开 API Settings 完成配置。')
  }
  if (!request.apiKey.trim()) {
    throw new LLMConfigError('缺少 API Key：请打开 API Settings 完成配置。')
  }
  if (!request.model.trim()) {
    throw new LLMConfigError('缺少 Model Name：请打开 API Settings 完成配置。')
  }
  if (request.messages.length === 0) {
    throw new LLMConfigError('请求缺少 messages。')
  }
}

function readContent(payload: unknown): {
  content: string
  model: string
  finishReason: string | null
} {
  if (typeof payload !== 'object' || payload === null) {
    throw new LLMResponseError()
  }

  const choice = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choice) || choice.length === 0) {
    throw new LLMResponseError('响应格式错误：缺少 choices。')
  }

  const first = choice[0] as {
    message?: { content?: unknown }
    finish_reason?: unknown
  }
  const rawContent = first.message?.content
  let content = ''
  if (typeof rawContent === 'string') {
    content = rawContent
  } else if (Array.isArray(rawContent)) {
    content = rawContent
      .map((part) =>
        typeof part === 'object' &&
        part !== null &&
        typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .join('')
  }

  if (!content.trim()) {
    throw new LLMResponseError('响应格式错误：模型返回了空内容。')
  }

  const model =
    typeof (payload as { model?: unknown }).model === 'string'
      ? (payload as { model: string }).model
      : ''
  const finishReason =
    typeof first.finish_reason === 'string' ? first.finish_reason : null

  return { content, model, finishReason }
}

function mapHttpError(status: number): never {
  if (status === 401 || status === 403) {
    throw new LLMAuthError()
  }
  if (status === 404) {
    throw new LLMEndpointError()
  }
  if (status === 429) {
    throw new LLMRateLimitError()
  }
  if (status >= 500) {
    throw new LLMServerError()
  }
  if (status === 400 || status === 422) {
    throw new LLMRequestError()
  }
  throw new LLMRequestError(`HTTP ${status}`)
}

export class OpenAICompatibleProvider implements LLMProvider {
  async chatCompletion(
    request: LLMRequest,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    assertRequest(request)
    if (signal?.aborted) {
      throw new LLMCancelledError()
    }

    let url: URL
    try {
      url = resolveChatCompletionsUrl(request.baseURL)
    } catch (error) {
      throw new LLMConfigError(
        error instanceof Error ? error.message : 'Base URL 不合法。',
      )
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages satisfies LLMMessage[],
      temperature: request.temperature ?? DEFAULT_TEMPERATURE,
    }
    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens
    }
    if (request.responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' }
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const forwardAbort = () => controller.abort()
    signal?.addEventListener('abort', forwardAbort, { once: true })

    const transportError = (): Error => {
      if (signal?.aborted) {
        return new LLMCancelledError()
      }
      if (timedOut) {
        return new LLMTimeoutError()
      }
      return new LLMNetworkError()
    }

    try {
      let response: Response
      try {
        response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${request.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } catch {
        throw transportError()
      }

      if (!response.ok) {
        // The HTTP status is authoritative; never let error-body parsing
        // replace it or block the error path.
        const bodyCleanup = response.body?.cancel()
        if (bodyCleanup) {
          void bodyCleanup.catch(() => {})
        }
        mapHttpError(response.status)
      }

      let payload: unknown
      try {
        payload = (await response.json()) as unknown
      } catch (error) {
        if (signal?.aborted) {
          throw new LLMCancelledError()
        }
        if (timedOut) {
          throw new LLMTimeoutError()
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new LLMNetworkError()
        }
        throw new LLMResponseError(
          '响应格式错误：接口返回的不是合法 JSON。',
        )
      }

      const parsed = readContent(payload)
      return {
        content: parsed.content,
        model: parsed.model || request.model,
        finishReason: parsed.finishReason,
      }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }
}
