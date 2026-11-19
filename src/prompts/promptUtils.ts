import type { AgentContext } from '@/types/engine'

export interface LivePrompt {
  system: string
  buildUserMessage: (context: AgentContext) => string
}

export const JSON_ONLY_RULE =
  '你必须只输出一个 JSON 对象：不要输出 Markdown 代码围栏、解释、前后缀文字，也不要输出隐藏的思考过程。'

export function topicBlock(context: AgentContext): string {
  const { session } = context
  const description = session.live?.description?.trim()
  return [
    `研究课题：${session.topic}`,
    description ? `补充说明：${description}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function upstreamJson(context: AgentContext, agentId: string): string {
  const match = context.upstream.find((item) => item.agentId === agentId)
  return match ? JSON.stringify(match.output, null, 2) : '{}'
}
