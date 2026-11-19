import { describe, expect, it } from 'vitest'

import { LLMExecutor } from '@/agents/llmExecutor'
import { extractS2PaperIds } from '@/agents/synthesizerCitations'
import { LivePlayer } from '@/engine/livePlayer'
import type { LLMConfig } from '@/services/llm/llmConfig'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from '@/services/llm/llmProvider'
import type { UpstreamAgentResult, AgentContext } from '@/types/engine'
import type {
  ResearcherAgentOutput,
  SynthesizerAgentOutput,
} from '@/types/agent'
import type { LiteratureClue } from '@/types/research'

const CONFIG: LLMConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test-secret',
  modelName: 'test-model',
  temperature: 0.2,
  maxTokens: 4096,
  jsonMode: true,
  timeoutMs: 10_000,
}

class ScriptedProvider implements LLMProvider {
  readonly requests: LLMRequest[] = []
  private index = 0

  constructor(private readonly contents: string[]) {}

  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request)
    const content =
      this.contents[Math.min(this.index, this.contents.length - 1)] ?? ''
    this.index += 1
    return { content, model: 'test-model', finishReason: 'stop' }
  }
}

function makePaper(overrides: Partial<LiteratureClue> = {}): LiteratureClue {
  return {
    id: 'p1',
    title: 'Real Paper Title',
    authors: ['Ada Lovelace'],
    year: 2024,
    venue: 'Test Venue',
    abstract: 'A real paper from Semantic Scholar.',
    relevance: 'high',
    sourceType: 'real',
    doi: '10.1000/real-paper',
    url: 'https://www.semanticscholar.org/paper/p1',
    openAccessPdf: null,
    citationCount: 10,
    referenceCount: 20,
    relatedQuestionIds: [],
    ...overrides,
  }
}

function makeResearcher(literature: LiteratureClue[]): ResearcherAgentOutput {
  return {
    type: 'researcher',
    summary:
      'Researcher 已完成真实文献检索计划，并注入 Semantic Scholar 返回的真实论文。',
    literature,
    retrievalPlan: {
      searchStrategy:
        '使用领域泛化与跨中心评测关键词检索真实论文，并按论文元数据筛选。',
      keywordGroups: [
        'domain generalization medical image segmentation',
        'cross-center evaluation segmentation',
      ],
      researchGaps: ['缺乏统一评测基准', '缺少跨中心方差报告'],
      nextDirections: ['建立标准化评测协议', '报告分中心置信区间'],
    },
  }
}

const FILLER =
  '这一段用于说明研究背景、证据边界与实验约束，确保报告满足长度要求，并且不引入任何未经检索验证的论文或性能数字。'.repeat(
    8,
  )

function makeReport(citation = '', extra = ''): string {
  return `## 1. 研究背景
${FILLER}

## 2. 核心研究问题
${FILLER}

## 3. 相关研究与证据
Evidence：真实文献证据来自 Researcher 输出的 Semantic Scholar 集合。${citation}
${extra}

## 4. 研究假设
Hypothesis：跨中心自适应归一化可以降低性能方差。

## 5. 技术路线
Proposal：构建统一的训练与评测流程，并记录组件贡献。

## 6. 实验设计
按中心划分训练、验证与测试集，设置容量匹配基线与多个随机种子。

## 7. 评价指标
采用 Dice 与 HD95：
$$\\mathcal{L}=\\mathcal{L}_{seg}+\\lambda\\,\\mathrm{Var}_{c}(\\mathrm{Dice}_{c})$$

## 8. 潜在风险
数据获取与合规审查可能延迟实验，小样本方差估计也可能不稳定。

## 9. 下一步研究建议
建立标准化跨中心评测协议，并验证不确定性估计的预警能力。`
}

function buildContext(literature: LiteratureClue[]): AgentContext {
  const player = new LivePlayer(
    { topic: '小样本医学图像分割的泛化性改进研究', description: null },
    {
      provider: new ScriptedProvider([]),
      getConfig: () => CONFIG,
      now: () => '2026-01-01T00:00:00.000Z',
    },
  )
  const upstream: UpstreamAgentResult[] = [
    { agentId: 'researcher', output: makeResearcher(literature) },
  ]
  return {
    session: player.createSession(),
    agentId: 'synthesizer',
    upstream,
    signal: new AbortController().signal,
  }
}

function synthesizerJson(report: string): string {
  const output: SynthesizerAgentOutput = {
    type: 'synthesizer',
    summary:
      '综合真实文献证据、研究假设与评审意见，形成结构化研究报告并标注引用边界。',
    finalReport: report,
  }
  return JSON.stringify(output)
}

function executor(provider: ScriptedProvider): LLMExecutor {
  return new LLMExecutor({ provider, getConfig: () => CONFIG })
}

describe('Synthesizer S2 citations', () => {
  it('accepts a known paperId and appends programmatic references', async () => {
    const paper = makePaper()
    const provider = new ScriptedProvider([
      synthesizerJson(makeReport('该方法已有真实证据 [S2:p1]。')),
    ])

    const result = await executor(provider).execute(buildContext([paper]))

    expect(result.status).toBe('completed')
    if (result.status !== 'completed' || result.output.type !== 'synthesizer') {
      throw new Error('Synthesizer output missing')
    }
    const report = result.output.finalReport
    expect(report).toContain('[S2:p1]')
    expect(report).toContain('### 参考文献（由程序根据 Semantic Scholar 数据生成）')
    expect(report).toContain(paper.title)
    expect(report).toContain(paper.doi)
    expect(report).toContain('[Semantic Scholar](https://www.semanticscholar.org/paper/p1)')
    expect(report.indexOf('### 参考文献')).toBeLessThan(
      report.indexOf('## 4. 研究假设'),
    )
    expect(extractS2PaperIds(report)).toEqual(['p1'])
  })

  it('rejects an unknown paperId after the single repair attempt', async () => {
    const provider = new ScriptedProvider([
      synthesizerJson(makeReport('引用不存在的论文 [S2:ghost-paper]。')),
      synthesizerJson(makeReport('引用不存在的论文 [S2:ghost-paper]。')),
    ])

    await expect(
      executor(provider).execute(buildContext([makePaper()])),
    ).rejects.toThrow('ghost-paper')
    expect(provider.requests).toHaveLength(2)
  })

  it('rejects any S2 citation when the real literature set is empty', async () => {
    const provider = new ScriptedProvider([
      synthesizerJson(makeReport('没有证据也要引用 [S2:ghost-paper]。')),
      synthesizerJson(makeReport('没有证据也要引用 [S2:ghost-paper]。')),
    ])

    await expect(
      executor(provider).execute(buildContext([])),
    ).rejects.toThrow('ghost-paper')
    expect(provider.requests).toHaveLength(2)
  })

  it('allows a real paper without a DOI and never invents a DOI', async () => {
    const paper = makePaper({
      id: 'no-doi-paper',
      title: 'Paper Without DOI',
      doi: null,
      url: null,
      openAccessPdf: null,
    })
    const provider = new ScriptedProvider([
      synthesizerJson(makeReport('该论文没有 DOI，但仍可引用 [S2:no-doi-paper]。')),
    ])

    const result = await executor(provider).execute(buildContext([paper]))
    expect(result.status).toBe('completed')
    if (result.status !== 'completed' || result.output.type !== 'synthesizer') {
      throw new Error('Synthesizer output missing')
    }
    expect(result.output.finalReport).toContain('DOI：暂无数据')
    expect(result.output.finalReport).not.toMatch(/10\.\d{4,9}\//)
    expect(result.output.finalReport).toContain('来源链接：暂无数据')
  })

  it('generates references from Researcher metadata and shows missing fields', async () => {
    const paper = makePaper({
      id: 'sparse-paper',
      title: 'Sparse Metadata Paper',
      authors: [],
      year: null,
      venue: null,
      doi: null,
      url: null,
      openAccessPdf: null,
    })
    const provider = new ScriptedProvider([
      synthesizerJson(makeReport('稀疏元数据论文 [S2:sparse-paper]。')),
    ])

    const result = await executor(provider).execute(buildContext([paper]))
    expect(result.status).toBe('completed')
    if (result.status !== 'completed' || result.output.type !== 'synthesizer') {
      throw new Error('Synthesizer output missing')
    }
    const report = result.output.finalReport
    expect(report).toContain('Sparse Metadata Paper')
    expect(report).toContain('暂无数据')
    expect(report).not.toContain('Ada Lovelace')
    expect(report).not.toContain('10.1000/real-paper')
  })

  it('rejects S2 citations when no Researcher output is available', async () => {
    const provider = new ScriptedProvider([
      synthesizerJson(makeReport('缺少上游证据仍引用 [S2:p1]。')),
      synthesizerJson(makeReport('缺少上游证据仍引用 [S2:p1]。')),
    ])
    const context = buildContext([makePaper()])
    const withoutResearcher: AgentContext = {
      ...context,
      upstream: context.upstream.filter(
        (item) => item.agentId !== 'researcher',
      ),
    }

    await expect(
      executor(provider).execute(withoutResearcher),
    ).rejects.toThrow('无法校验最终报告的真实文献引用')
    expect(provider.requests).toHaveLength(2)
  })

  it('rejects a fabricated DOI outside the real literature set', async () => {
    const provider = new ScriptedProvider([
      synthesizerJson(
        makeReport('伪造 DOI 10.9999/fabricated 不应通过。'),
      ),
      synthesizerJson(
        makeReport('伪造 DOI 10.9999/fabricated 不应通过。'),
      ),
    ])

    await expect(
      executor(provider).execute(buildContext([makePaper()])),
    ).rejects.toThrow('10.9999/fabricated')
    expect(provider.requests).toHaveLength(2)
  })
})
