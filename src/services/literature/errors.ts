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
    message = '文献代理认证失败：请检查后端 SEMANTIC_SCHOLAR_API_KEY 配置。',
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
    message = 'Semantic Scholar 请求受限（429）：请稍后重试；匿名额度较低，可在后端配置 API Key。',
  ) {
    super(message, 'rate_limit')
    this.name = 'LiteratureRateLimitError'
  }
}

export class LiteratureServerError extends LiteratureError {
  constructor(
    message = '文献代理无法正常访问 Semantic Scholar（5xx）：请检查后端网络与配置。',
  ) {
    super(message, 'server')
    this.name = 'LiteratureServerError'
  }
}

export class LiteratureNetworkError extends LiteratureError {
  constructor(
    message = '无法连接文献代理：请确认后端已启动、地址正确且 CORS 允许当前前端来源。',
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
