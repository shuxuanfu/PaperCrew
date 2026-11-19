import { DEMO_CASES } from '@/data'
import { demoSessionSchema } from '@/schemas/sessionSchema'
import type { DemoSession } from '@/types/session'

export interface DemoCaseSummary {
  id: string
  title: string
  description: string
  topic: string
}

export interface DemoValidationSuccess {
  success: true
  data: DemoSession
}

export interface DemoValidationFailure {
  success: false
  error: string
  issues: string[]
}

export type DemoValidationResult =
  | DemoValidationSuccess
  | DemoValidationFailure

export class DemoDataError extends Error {
  readonly issues: string[]

  constructor(message: string, issues: string[] = []) {
    super(message)
    this.name = 'DemoDataError'
    this.issues = issues
  }
}

export function listDemoSessions(): DemoCaseSummary[] {
  return DEMO_CASES.map(({ id, title, description, topic }) => ({
    id,
    title,
    description,
    topic,
  }))
}

export function validateDemoSession(data: unknown): DemoValidationResult {
  const result = demoSessionSchema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
  const preview = issues.slice(0, 12).join('\n')
  const rest =
    issues.length > 12 ? `\n… 其余 ${issues.length - 12} 处问题已省略` : ''

  return {
    success: false,
    error: `Demo 数据未通过 Schema 校验（共 ${issues.length} 处）：\n${preview}${rest}`,
    issues,
  }
}

export async function loadDemoSession(id: string): Promise<DemoSession> {
  const definition = DEMO_CASES.find((item) => item.id === id)
  if (!definition) {
    throw new DemoDataError(
      `未知的 Demo 案例「${id}」。可用案例：${DEMO_CASES.map((item) => item.id).join('、')}`,
    )
  }

  const url = `${import.meta.env.BASE_URL}data/${definition.file}`

  let response: Response
  try {
    response = await fetch(url, { cache: 'no-store' })
  } catch (error) {
    throw new DemoDataError(
      `无法请求 Demo 数据文件 ${definition.file}：${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  if (!response.ok) {
    throw new DemoDataError(
      `加载 ${definition.file} 失败：HTTP ${response.status} ${response.statusText}`,
    )
  }

  let raw: unknown
  try {
    raw = await response.json()
  } catch (error) {
    throw new DemoDataError(
      `${definition.file} 不是合法 JSON：${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const validation = validateDemoSession(raw)
  if (!validation.success) {
    throw new DemoDataError(
      `案例「${id}」未通过 Schema 校验：\n${validation.error}`,
      validation.issues,
    )
  }

  if (validation.data.sessionId !== id) {
    throw new DemoDataError(
      `案例 sessionId 不匹配：请求「${id}」，数据为「${validation.data.sessionId}」`,
    )
  }

  return validation.data
}
