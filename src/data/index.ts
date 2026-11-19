export interface DemoCaseDefinition {
  id: string
  file: string
  title: string
  description: string
  topic: string
}

export const DEMO_CASES: DemoCaseDefinition[] = [
  {
    id: 'demo-medical',
    file: 'demo-medical.json',
    title: '小样本医学图像分割泛化性改进',
    description: '跨中心分布偏移下的小样本分割诊断与实验推演',
    topic: '小样本医学图像分割任务中的模型泛化性改进研究',
  },
  {
    id: 'demo-multiagent',
    file: 'demo-multiagent.json',
    title: '基于多智能体协作的复杂科研问题求解',
    description: '多 Agent 协议、协作效率与失败模式的系统研究',
    topic: '基于多智能体协作的复杂科研问题求解',
  },
]

export const DEFAULT_DEMO_CASE_ID = DEMO_CASES[0].id
