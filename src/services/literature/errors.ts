export type LiteratureErrorCode =
  | 'config'
  | 'auth'
  | 'request'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'response'

export class LiteratureError extends Error {
  readonly code: LiteratureErrorCode

  constructor(message: string, code: LiteratureErrorCode) {
    super(message)
    this.name = 'LiteratureError'
    this.code = code
  }
}

export class LiteratureConfigError extends LiteratureError {
  constructor(message = '文献检索配置不完整。') {
    super(message, 'config')
    this.name = 'LiteratureConfigError'
  }
}

export class LiteratureAuthError extends LiteratureError {
  constructor(
    message = 'Semantic Scholar 认证失败：请检查 API Key，或清空 Key 后使用匿名访问。',
  ) {
    super(message, 'auth')
    this.name = 'LiteratureAuthError'
  }
}

export class LiteratureRequestError extends LiteratureError {
  constructor(message = 'Semantic Scholar 拒绝了检索请求：请检查关键词。') {
    super(message, 'request')
    this.name = 'LiteratureRequestError'
  }
}

export class LiteratureRateLimitError extends LiteratureError {
  constructor(
    message = 'Semantic Scholar 请求受限（429）：请稍后重试，或在 API Settings 中配置 Semantic Scholar API Key 提高额度。',
  ) {
    super(message, 'rate_limit')
    this.name = 'LiteratureRateLimitError'
  }
}

export class LiteratureServerError extends LiteratureError {
  constructor(message = 'Semantic Scholar 服务暂时不可用（5xx）：请稍后重试。') {
    super(message, 'server')
    this.name = 'LiteratureServerError'
  }
}

export class LiteratureNetworkError extends LiteratureError {
  constructor(
    message = 'Semantic Scholar 网络请求失败：可能是网络、CORS 或接口不可达。',
  ) {
    super(message, 'network')
    this.name = 'LiteratureNetworkError'
  }
}

export class LiteratureTimeoutError extends LiteratureError {
  constructor(message = 'Semantic Scholar 请求超时：请稍后重试。') {
    super(message, 'timeout')
    this.name = 'LiteratureTimeoutError'
  }
}

export class LiteratureCancelledError extends LiteratureError {
  constructor(message = '文献检索已取消。') {
    super(message, 'cancelled')
    this.name = 'LiteratureCancelledError'
  }
}

export class LiteratureResponseError extends LiteratureError {
  constructor(message = 'Semantic Scholar 返回了无法解析的响应。') {
    super(message, 'response')
    this.name = 'LiteratureResponseError'
  }
}
