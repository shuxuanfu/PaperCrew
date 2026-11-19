import type { AgentId } from '@/domain/agent/ids'

export interface AgentDefinition {
  id: AgentId
  name: string
  role: string
  description: string
  objective: string
  constraints: string[]
}

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  planner: {
    id: 'planner',
    name: 'Planner',
    role: 'Research planning',
    description:
      '把研究课题拆解为可执行的研究子问题与英文检索词组，为后续 Agent 提供结构化的研究计划。',
    objective: '将研究课题拆解为 3 个研究子问题与 2 组英文检索词，并输出结构化 JSON。',
    constraints: [
      '只输出单个 JSON 对象，不输出解释或 Markdown 围栏',
      '严格遵循 Planner 的 Output Schema',
    ],
  },
  researcher: {
    id: 'researcher',
    name: 'Researcher',
    role: 'Evidence landscape',
    description:
      '基于研究计划给出检索策略、研究空白与后续方向。本阶段未接入真实文献库，文献条目保持为空。',
    objective: '根据研究计划输出检索策略、研究空白与后续研究方向，不虚构真实文献。',
    constraints: [
      'literature 必须为空数组，不得编造论文、DOI 或链接',
      '只输出单个 JSON 对象',
    ],
  },
  reviewer: {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Method review',
    description:
      '从方法、数据、评估、统计与可复现性角度审查研究计划，给出 3 条可操作的评审意见。',
    objective: '审查研究计划并产出 3 条具体的结构化评审意见。',
    constraints: [
      'review 必须恰好 3 条，severity 与 category 使用枚举值',
      '只输出单个 JSON 对象',
    ],
  },
  synthesizer: {
    id: 'synthesizer',
    name: 'Synthesizer',
    role: 'Report synthesis',
    description:
      '整合研究计划、检索计划与评审意见，撰写区分 Evidence / Hypothesis / Proposal 的 9 章节 Markdown 报告。',
    objective: '整合上游输出，撰写包含 9 个章节与公式的结构化研究报告。',
    constraints: [
      '报告必须包含规定的 9 个二级标题与 LaTeX 公式',
      '只输出单个 JSON 对象',
    ],
  },
}
