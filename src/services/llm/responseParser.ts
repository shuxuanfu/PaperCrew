import { LLMParseError } from '@/services/llm/errors'

function stripCodeFences(content: string): string {
  const trimmed = content.trim().replace(/^\uFEFF/, '')
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced) {
    return fenced[1].trim()
  }
  return trimmed
}

function extractObject(content: string): string {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return content.slice(start, end + 1)
  }
  return content
}

export function parseJsonResponse(content: string): unknown {
  const withoutFences = stripCodeFences(content)
  if (!withoutFences) {
    throw new LLMParseError('响应格式错误：模型返回了空内容。')
  }

  try {
    return JSON.parse(withoutFences) as unknown
  } catch {
    const candidate = extractObject(withoutFences)
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      throw new LLMParseError()
    }
  }
}
