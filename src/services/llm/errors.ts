export type LLMErrorCode =
  | 'config'
  | 'auth'
  | 'endpoint'
  | 'request'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'response'
  | 'parse'
  | 'validation'

export class LLMError extends Error {
  readonly code: LLMErrorCode

  constructor(code: LLMErrorCode, message: string) {
    super(message)
    this.name = 'LLMError'
    this.code = code
  }
}

export class LLMConfigError extends LLMError {
  constructor(message: string) {
    super('config', message)
    this.name = 'LLMConfigError'
  }
}

export class LLMAuthError extends LLMError {
  constructor() {
    super('auth', '认证失败：请检查 API Key。')
    this.name = 'LLMAuthError'
  }
}

export class LLMEndpointError extends LLMError {
  constructor() {
    super(
      'endpoint',
      '接口地址错误：请检查 Base URL；若地址正确，请确认 Model Name。',
    )
    this.name = 'LLMEndpointError'
  }
}

export class LLMRequestError extends LLMError {
  constructor(detail?: string) {
    super(
      'request',
      detail
        ? `请求被拒绝：${detail}`
        : '请求被拒绝：请检查 Model Name、温度与 Max Tokens。',
    )
    this.name = 'LLMRequestError'
  }
}

export class LLMRateLimitError extends LLMError {
  constructor() {
    super('rate_limit', '请求限流：请稍后重试。')
    this.name = 'LLMRateLimitError'
  }
}

export class LLMServerError extends LLMError {
  constructor() {
    super('server', '服务商暂时不可用（5xx）：请稍后重试。')
    this.name = 'LLMServerError'
  }
}

export class LLMNetworkError extends LLMError {
  constructor() {
    super('network', '网络异常：无法连接到配置的接口地址。')
    this.name = 'LLMNetworkError'
  }
}

export class LLMTimeoutError extends LLMError {
  constructor() {
    super('timeout', '请求超时：请检查网络或适当增加超时时间。')
    this.name = 'LLMTimeoutError'
  }
}

export class LLMCancelledError extends LLMError {
  constructor() {
    super('cancelled', '请求已取消。')
    this.name = 'LLMCancelledError'
  }
}

export class LLMResponseError extends LLMError {
  constructor(message = '响应格式错误：模型输出未满足数据结构要求。') {
    super('response', message)
    this.name = 'LLMResponseError'
  }
}

export class LLMParseError extends LLMError {
  constructor(message = '响应格式错误：无法解析模型返回的 JSON。') {
    super('parse', message)
    this.name = 'LLMParseError'
  }
}

export class LLMValidationError extends LLMError {
  readonly issues: string[]

  constructor(issues: string[]) {
    super('validation', '响应格式错误：模型输出未满足数据结构要求。')
    this.name = 'LLMValidationError'
    this.issues = issues
  }
}

export class AgentExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentExecutionError'
  }
}
