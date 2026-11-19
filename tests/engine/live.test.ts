import { afterEach, describe, expect, it, vi } from 'vitest'

import { LLMExecutor } from '@/agents/llmExecutor'
import { LivePlayer } from '@/engine/livePlayer'
import { TaskController } from '@/engine/taskController'
import { LiteratureCancelledError } from '@/services/literature/errors'
import type {
  LiteratureSearch,
  LiteratureSearchInput,
  LiteratureSearchOutcome,
} from '@/services/literature/semanticScholarTypes'
import {
  AgentExecutionError,
  LLMAuthError,
  LLMCancelledError,
  LLMTimeoutError,
} from '@/services/llm/errors'
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  resolveChatCompletionsUrl,
  type LLMConfig,
} from '@/services/llm/llmConfig'
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from '@/services/llm/llmProvider'
import { OpenAICompatibleProvider } from '@/services/llm/openAICompatibleProvider'
import type { AgentContext, UpstreamAgentResult } from '@/types/engine'
import type {
  AgentId,
  PlannerAgentOutput,
  ResearcherAgentOutput,
  ReviewerAgentOutput,
  SynthesizerAgentOutput,
} from '@/types/agent'
import type { LiteratureClue } from '@/types/research'

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await delay(5)
  }
}

const CONFIG: LLMConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test-secret',
  modelName: 'test-model',
  temperature: 0.2,
  maxTokens: DEFAULT_MAX_TOKENS,
  jsonMode: true,
  timeoutMs: DEFAULT_TIMEOUT_MS,
}

class ScriptedProvider implements LLMProvider {
  readonly requests: LLMRequest[] = []
  private readonly steps: Array<string | Error>

  constructor(steps: Array<string | Error>) {
    this.steps = [...steps]
  }

  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request)
    const step = this.steps.shift()
    if (step === undefined) {
      throw new Error('No scripted response left')
    }
    if (step instanceof Error) {
      throw step
    }
    return { content: step, model: request.model, finishReason: 'stop' }
  }
}

class AbortableProvider implements LLMProvider {
  calls = 0

  async chatCompletion(
    _request: LLMRequest,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    this.calls += 1
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        reject(new Error('aborted'))
      })
    })
  }
}

const plannerOutput: PlannerAgentOutput = {
  type: 'planner',
  summary:
    '围绕小样本医学图像分割的泛化性，拆解为三个互补的研究子问题并给出对应检索词。',
  researchQuestions: [
    {
      id: 'q1',
      question: '跨中心分布偏移如何影响小样本分割模型的泛化性能？',
      rationale:
        '不同中心的采集设备与标注协议差异会显著改变输入分布，是泛化性下降的主要来源。',
      methodology:
        '构建跨中心划分协议，比较多种归一化与自适应策略在小样本设置下的表现。',
      expectedOutcome:
        '得到跨中心性能衰减的量化分析，并给出稳定的小样本适配方案。',
    },
    {
      id: 'q2',
      question: '哪些训练策略能缓解小样本条件下的过拟合？',
      rationale:
        '小样本训练容易记忆中心特有纹理，需要系统比较正则化与数据增强策略。',
      methodology:
        '在统一骨干网络上对比正则化、自监督预训练与增强组合，进行消融实验。',
      expectedOutcome: '确定在跨中心评测中稳健的训练策略与超参数范围。',
    },
    {
      id: 'q3',
      question: '如何设计可靠的跨中心评测协议？',
      rationale:
        '单一 Dice 指标难以反映分布偏移下的失败模式，需要补充稳健性指标。',
      methodology:
        '引入分中心性能方差、最差中心表现与校准误差，构建综合评测协议。',
      expectedOutcome:
        '形成可复现的跨中心评测协议与指标组合，并公开实验配置。',
    },
  ],
  searchKeywords: [
    {
      id: 'kw1',
      label: '泛化与分布偏移',
      keywords: [
        'domain generalization',
        'distribution shift',
        'small-sample segmentation',
      ],
      purpose: '覆盖泛化性与分布偏移的主线文献',
    },
    {
      id: 'kw2',
      label: '跨中心评测与数据',
      keywords: [
        'cross-center evaluation',
        'medical imaging benchmark',
        'few-shot segmentation',
      ],
      purpose: '覆盖跨中心评测与数据设置',
    },
  ],
}

const researcherOutput: ResearcherAgentOutput = {
  type: 'researcher',
  summary:
    '本阶段未接入真实文献数据库，以下检索计划用于后续人工核实与真实检索。',
  literature: [],
  retrievalPlan: {
    searchStrategy:
      '先以泛化性与小样本关键词组合检索，再按数据集、评测协议与领域自适应方法分类筛选。',
    keywordGroups: [
      'domain generalization medical image segmentation',
      'cross-center distribution shift few-shot',
    ],
    researchGaps: [
      '缺乏统一的跨中心小样本评测基准',
      '现有方法较少报告分中心方差与置信区间',
    ],
    nextDirections: [
      '构建标准化的跨中心数据划分与评测协议',
      '引入不确定性估计与自适应归一化稳定训练',
    ],
  },
}

const reviewerOutput: ReviewerAgentOutput = {
  type: 'reviewer',
  summary:
    '整体研究问题清晰，但评测协议、对照实验与数据合规方面仍需补充具体约束。',
  review: [
    {
      id: 'r1',
      title: '跨中心评测设计不充分',
      severity: 'high',
      category: 'evaluation',
      problem:
        '当前计划只描述了单一评测指标，未说明如何划分中心以及如何处理中心间类别分布不一致的问题。',
      impact: '评测结论可能高估模型在真实临床环境中的泛化能力。',
      recommendation: '明确按中心划分训练与测试，并报告分中心指标与最差中心表现。',
      relatedQuestionIds: ['q1'],
    },
    {
      id: 'r2',
      title: '缺少对照实验约束',
      severity: 'medium',
      category: 'methodology',
      problem:
        '计划提出比较训练策略，但未设置容量匹配的基线与相同预算下的对照实验。',
      impact: '难以判断性能提升来自策略本身还是训练预算差异。',
      recommendation: '补充容量匹配基线与等预算训练控制，并报告多次随机种子结果。',
      relatedQuestionIds: ['q2'],
    },
    {
      id: 'r3',
      title: '数据划分与合规不明确',
      severity: 'medium',
      category: 'dataset',
      problem:
        '未说明跨中心数据的可获得性、隐私合规要求以及样本量差异带来的影响。',
      impact: '实验可能因数据不可获得而无法复现，从而削弱研究结论的可信度。',
      recommendation: '在计划中补充数据获取流程、伦理审查与可复现的划分清单。',
      relatedQuestionIds: ['q3'],
    },
  ],
}

const synthesizerOutput: SynthesizerAgentOutput = {
  type: 'synthesizer',
  summary:
    '综合研究计划、检索计划与评审意见，形成包含九个章节的结构化研究报告。',
  finalReport: `## 1. 研究背景
临床影像数据往往来自不同中心，采集设备与标注规范差异导致显著的分布偏移。在小样本条件下，模型容易过拟合中心特有特征，跨中心泛化性能明显下降。Evidence：现有公开研究普遍报告跨中心评测中的性能衰减，但评测协议并不统一。

## 2. 核心研究问题
围绕分布偏移的影响、稳健训练策略与可靠评测协议三个问题展开，三者共同构成从诊断到验证的完整链路。

## 3. 相关研究与证据
本阶段未接入真实文献检索，文献结论需后续核实；此处只引用项目内部的检索计划与结构性证据，不声称已找到具体论文。

## 4. 研究假设
Hypothesis：引入自适应归一化并配合强正则化，可以在小样本条件下减小跨中心性能方差，同时保持平均 Dice 不下降。

## 5. 技术路线
Proposal：构建统一的骨干网络与跨中心划分协议，依次消融归一化、数据增强与自监督预训练，并记录每个组件的贡献。

## 6. 实验设计
按中心划分训练、验证与测试集，设置容量匹配基线与等预算对照，并使用多个随机种子报告均值与方差。

## 7. 评价指标
采用 Dice 与 HD95 作为主指标，同时报告最差中心表现、跨中心方差与校准误差。综合目标可写为：
$$\\mathcal{L}=\\mathcal{L}_{seg}+\\lambda\\,\\mathrm{Var}_{c}(\\mathrm{Dice}_{c})$$

## 8. 潜在风险
跨中心数据获取与隐私合规可能延迟实验，小样本条件下的方差估计也可能不稳定。

## 9. 下一步研究建议
下一步应建立标准化的跨中心评测协议，并验证不确定性估计对性能预警的有效性。`,
}

const VALID_PIPELINE = [
  plannerOutput,
  researcherOutput,
  reviewerOutput,
  synthesizerOutput,
]

const REAL_PAPER: LiteratureClue = {
  id: 's2-paper-1',
  title: 'Domain Generalization for Medical Image Segmentation',
  authors: ['Ada Lovelace'],
  year: 2023,
  venue: 'MICCAI',
  abstract:
    'A domain generalization benchmark for medical image segmentation across centers.',
  relevance: 'high',
  sourceType: 'real',
  doi: '10.1000/papercrew-test',
  url: 'https://www.semanticscholar.org/paper/s2-paper-1',
  openAccessPdf: null,
  citationCount: 12,
  referenceCount: 30,
  relatedQuestionIds: [],
}

const COMPLETED_OUTCOME: LiteratureSearchOutcome = {
  literature: [REAL_PAPER],
  status: 'completed',
  queries: ['domain generalization medical image segmentation'],
  searchedAt: '2026-01-01T00:00:00.000Z',
  durationMs: 12,
  totalFound: 1,
  error: null,
  warnings: [],
}

class StaticLiteratureSearch implements LiteratureSearch {
  calls = 0
  readonly inputs: LiteratureSearchInput[] = []

  constructor(private readonly outcome: LiteratureSearchOutcome) {}

  async search(
    input: LiteratureSearchInput,
    _signal: AbortSignal,
  ): Promise<LiteratureSearchOutcome> {
    this.calls += 1
    this.inputs.push(input)
    return structuredClone(this.outcome)
  }
}

class HangingLiteratureSearch implements LiteratureSearch {
  calls = 0

  async search(
    _input: LiteratureSearchInput,
    signal: AbortSignal,
  ): Promise<LiteratureSearchOutcome> {
    this.calls += 1
    return new Promise<LiteratureSearchOutcome>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new LiteratureCancelledError()),
        { once: true },
      )
    })
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function completionBody(content: string) {
  return {
    model: 'test-model',
    choices: [
      { message: { content }, finish_reason: 'stop' },
    ],
  }
}

function hangingBodyFetch(onRead?: () => void) {
  return (_url: string, init: RequestInit): Promise<Response> => {
    const signal = init.signal
    return Promise.resolve({
      ok: true,
      status: 200,
      body: null,
      json: () => {
        onRead?.()
        return new Promise<unknown>((_resolve, reject) => {
          const abort = () =>
            reject(new DOMException('Aborted', 'AbortError'))
          if (signal?.aborted) {
            abort()
            return
          }
          signal?.addEventListener('abort', abort, { once: true })
        })
      },
    } as unknown as Response)
  }
}

function buildContext(
  agentId: AgentId,
  upstream: UpstreamAgentResult[] = [],
  signal = new AbortController().signal,
): AgentContext {
  const player = new LivePlayer(
    { topic: '小样本医学图像分割的泛化性改进研究', description: null },
    {
      provider: new ScriptedProvider([]),
      getConfig: () => CONFIG,
      now: () => '2026-01-01T00:00:00.000Z',
    },
  )
  return { session: player.createSession(), agentId, upstream, signal }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LLM configuration', () => {
  it('normalizes OpenAI-compatible base URLs without duplicating /v1', () => {
    expect(resolveChatCompletionsUrl('https://api.openai.com').pathname).toBe(
      '/v1/chat/completions',
    )
    expect(
      resolveChatCompletionsUrl('https://api.openai.com/v1').pathname,
    ).toBe('/v1/chat/completions')
    expect(
      resolveChatCompletionsUrl('https://gateway.example.com/openai/v1/')
        .pathname,
    ).toBe('/openai/v1/chat/completions')
    expect(
      resolveChatCompletionsUrl('https://api.openai.com/v1/v1').pathname,
    ).toBe('/v1/chat/completions')
    expect(
      resolveChatCompletionsUrl(
        'https://api.openai.com/v1/chat/completions',
      ).pathname,
    ).toBe('/v1/chat/completions')
  })
})

describe('OpenAI-compatible provider', () => {
  const messages: LLMMessage[] = [{ role: 'user', content: 'ping' }]

  it('sends bearer auth, model, sampling parameters and JSON mode', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return jsonResponse(200, completionBody('{"ok":true}'))
    })

    const provider = new OpenAICompatibleProvider()
    const response = await provider.chatCompletion({
      baseURL: CONFIG.baseUrl,
      apiKey: CONFIG.apiKey,
      model: CONFIG.modelName,
      messages,
      temperature: 0.2,
      maxTokens: 1234,
      responseFormat: 'json_object',
      timeoutMs: 5000,
    })

    expect(response.content).toBe('{"ok":true}')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(
      'https://api.example.com/v1/chat/completions',
    )
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test-secret')
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body.model).toBe('test-model')
    expect(body.temperature).toBe(0.2)
    expect(body.max_tokens).toBe(1234)
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('never sends response_format unless JSON mode is configured', async () => {
    const calls: RequestInit[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      calls.push(init)
      return jsonResponse(200, completionBody('{"ok":true}'))
    })

    const provider = new OpenAICompatibleProvider()
    await provider.chatCompletion({
      baseURL: CONFIG.baseUrl,
      apiKey: CONFIG.apiKey,
      model: CONFIG.modelName,
      messages,
      maxTokens: 256,
    })

    const body = JSON.parse(String(calls[0].body)) as Record<string, unknown>
    expect(body.response_format).toBeUndefined()
  })

  it('maps HTTP errors to friendly, non-sensitive messages', async () => {
    const cases: Array<[number, string]> = [
      [401, '认证失败：请检查 API Key。'],
      [403, '认证失败：请检查 API Key。'],
      [404, '接口地址错误：请检查 Base URL；若地址正确，请确认 Model Name。'],
      [429, '请求限流：请稍后重试。'],
      [500, '服务商暂时不可用（5xx）：请稍后重试。'],
      [503, '服务商暂时不可用（5xx）：请稍后重试。'],
    ]

    for (const [status, message] of cases) {
      vi.stubGlobal('fetch', async () =>
        jsonResponse(status, { error: 'secret-detail-should-not-surface' }),
      )
      const provider = new OpenAICompatibleProvider()
      await expect(
        provider.chatCompletion({
          baseURL: CONFIG.baseUrl,
          apiKey: CONFIG.apiKey,
          model: CONFIG.modelName,
          messages,
        }),
      ).rejects.toThrow(message)
      vi.unstubAllGlobals()
    }
  })

  it('rejects with a timeout error when the request exceeds the deadline', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const provider = new OpenAICompatibleProvider()
    await expect(
      provider.chatCompletion({
        baseURL: CONFIG.baseUrl,
        apiKey: CONFIG.apiKey,
        model: CONFIG.modelName,
        messages,
        timeoutMs: 20,
      }),
    ).rejects.toThrow('请求超时：请检查网络或适当增加超时时间。')
  })

  it('maps aborts and network failures to distinct errors', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const provider = new OpenAICompatibleProvider()
    const controller = new AbortController()
    const pending = provider.chatCompletion(
      {
        baseURL: CONFIG.baseUrl,
        apiKey: CONFIG.apiKey,
        model: CONFIG.modelName,
        messages,
        timeoutMs: 10_000,
      },
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toThrow('请求已取消。')

    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(
      provider.chatCompletion({
        baseURL: CONFIG.baseUrl,
        apiKey: CONFIG.apiKey,
        model: CONFIG.modelName,
        messages,
      }),
    ).rejects.toThrow('网络异常：无法连接到配置的接口地址。')
  })

  it('rejects responses without usable message content', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse(200, {
        choices: [{ message: { content: '   ' }, finish_reason: 'stop' }],
      }),
    )
    const provider = new OpenAICompatibleProvider()
    await expect(
      provider.chatCompletion({
        baseURL: CONFIG.baseUrl,
        apiKey: CONFIG.apiKey,
        model: CONFIG.modelName,
        messages,
      }),
    ).rejects.toThrow('响应格式错误')
  })
})

describe('OpenAI-compatible provider request lifecycle', () => {
  const messages: LLMMessage[] = [{ role: 'user', content: 'ping' }]

  function request(timeoutMs?: number) {
    return {
      baseURL: CONFIG.baseUrl,
      apiKey: CONFIG.apiKey,
      model: CONFIG.modelName,
      messages,
      timeoutMs,
    }
  }

  it('completes a normal request without timeout or cancellation', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse(200, completionBody('{"ok":true}')),
    )
    const controller = new AbortController()
    const provider = new OpenAICompatibleProvider()

    const response = await provider.chatCompletion(
      request(5000),
      controller.signal,
    )

    expect(response.content).toBe('{"ok":true}')
    expect(controller.signal.aborted).toBe(false)
  })

  it('times out while the response body is still being read', async () => {
    vi.stubGlobal('fetch', hangingBodyFetch())
    const provider = new OpenAICompatibleProvider()
    const startedAt = Date.now()

    const pending = provider.chatCompletion(request(30))
    await expect(pending).rejects.toBeInstanceOf(LLMTimeoutError)
    await expect(pending).rejects.toMatchObject({ code: 'timeout' })

    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it('cancels while the response body is still being read', async () => {
    let bodyReadStarted = false
    vi.stubGlobal(
      'fetch',
      hangingBodyFetch(() => {
        bodyReadStarted = true
      }),
    )
    const controller = new AbortController()
    const provider = new OpenAICompatibleProvider()

    const pending = expect(
      provider.chatCompletion(request(10_000), controller.signal),
    ).rejects.toMatchObject({
      name: LLMCancelledError.name,
      code: 'cancelled',
    })

    await waitFor(() => bodyReadStarted)
    controller.abort()
    await pending
  })

  it('keeps the HTTP status error even if the error body never finishes', async () => {
    vi.stubGlobal('fetch', async () => {
      return {
        ok: false,
        status: 403,
        body: {
          cancel: () => new Promise<void>(() => {}),
        },
      } as unknown as Response
    })
    const provider = new OpenAICompatibleProvider()

    await expect(provider.chatCompletion(request(20))).rejects.toMatchObject({
      name: LLMAuthError.name,
      code: 'auth',
    })
  })

  it('clears the timeout and external abort listener after completion', async () => {
    vi.useFakeTimers()
    try {
      let requestSignal: AbortSignal | null | undefined
      vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
        requestSignal = init.signal
        return jsonResponse(200, completionBody('{"ok":true}'))
      })
      const controller = new AbortController()
      const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
      const provider = new OpenAICompatibleProvider()

      await provider.chatCompletion(request(5000), controller.signal)

      expect(vi.getTimerCount()).toBe(0)
      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(requestSignal?.aborted).toBe(false)

      controller.abort()
      expect(requestSignal?.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('LLM executor', () => {
  it('accepts fenced JSON and validates it with the LIVE schema', async () => {
    const provider = new ScriptedProvider([
      '```json\n' + JSON.stringify(plannerOutput) + '\n```',
    ])
    const executor = new LLMExecutor({
      provider,
      getConfig: () => CONFIG,
    })

    const result = await executor.execute(buildContext('planner'))

    expect(result.status).toBe('completed')
    if (result.status !== 'completed') return
    expect(result.source).toBe('live')
    expect(result.output.type).toBe('planner')
    expect(provider.requests).toHaveLength(1)
  })

  it('issues exactly one repair request after a validation failure', async () => {
    const provider = new ScriptedProvider([
      '{"type":"planner"}',
      JSON.stringify(plannerOutput),
    ])
    const executor = new LLMExecutor({
      provider,
      getConfig: () => CONFIG,
    })

    const result = await executor.execute(buildContext('planner'))

    expect(result.status).toBe('completed')
    expect(provider.requests).toHaveLength(2)
    const repairMessages = provider.requests[1].messages
    expect(repairMessages.at(-2)?.role).toBe('assistant')
    expect(repairMessages.at(-1)?.content).toContain('未通过数据结构校验')
  })

  it('fails with a structural error when the repair is also invalid', async () => {
    const provider = new ScriptedProvider(['not json', '{"type":"planner"}'])
    const executor = new LLMExecutor({
      provider,
      getConfig: () => CONFIG,
    })

    const promise = executor.execute(buildContext('planner'))
    await expect(promise).rejects.toBeInstanceOf(AgentExecutionError)
    await expect(promise).rejects.toThrow('已尝试一次修复')
    expect(provider.requests).toHaveLength(2)
  })

  it('surfaces provider errors instead of falling back to demo data', async () => {
    const provider = new ScriptedProvider([new LLMAuthError()])
    const executor = new LLMExecutor({
      provider,
      getConfig: () => CONFIG,
    })

    await expect(
      executor.execute(buildContext('planner')),
    ).rejects.toThrow('认证失败：请检查 API Key。')
  })

  it('aborts an in-flight model call when the signal is cancelled', async () => {
    const provider = new AbortableProvider()
    const executor = new LLMExecutor({
      provider,
      getConfig: () => CONFIG,
    })
    const controller = new AbortController()

    const pending = executor.execute(
      buildContext('planner', [], controller.signal),
    )
    await waitFor(() => provider.calls === 1)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects reviewer comments that reference unknown research questions', async () => {
    const broken = structuredClone(reviewerOutput)
    broken.review[0].relatedQuestionIds = ['q9']
    const provider = new ScriptedProvider([
      JSON.stringify(broken),
      JSON.stringify(broken),
    ])
    const executor = new LLMExecutor({
      provider,
      getConfig: () => CONFIG,
    })

    const upstream: UpstreamAgentResult[] = [
      { agentId: 'planner', output: plannerOutput },
    ]

    await expect(
      executor.execute(buildContext('reviewer', upstream)),
    ).rejects.toThrow('q9')
  })
})

describe('LIVE session and orchestration', () => {
  it('builds a live session with idle agents and no output', () => {
    const player = new LivePlayer(
      { topic: '小样本医学图像分割的泛化性改进研究', description: null },
      {
        provider: new ScriptedProvider([]),
        getConfig: () => CONFIG,
        now: () => '2026-01-01T00:00:00.000Z',
      },
    )
    const session = player.createSession()

    expect(session.mode).toBe('live')
    expect(session.templateId).toBeNull()
    expect(session.status).toBe('created')
    expect(session.live).toEqual({ description: null })
    expect(session.agents).toHaveLength(4)
    expect(session.agents.every((agent) => agent.output === null)).toBe(true)
    expect(session.events[0]?.type).toBe('session_created')
  })

  it('runs the four live agents in serial order and completes', async () => {
    const provider = new ScriptedProvider(
      VALID_PIPELINE.map((output) => JSON.stringify(output)),
    )
    const controller = new TaskController({
      live: { provider, getConfig: () => CONFIG },
      resolveStepDuration: () => 0,
    })

    await controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: '跨中心分布偏移',
    })
    const session = controller.getSession()

    expect(session?.status).toBe('completed')
    expect(session?.mode).toBe('live')
    expect(session?.agents.map((agent) => agent.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ])
    expect(session?.agents[3]?.output?.type).toBe('synthesizer')
    expect(provider.requests).toHaveLength(4)
    expect(provider.requests[1].messages.at(-1)?.content).toContain(
      '研究计划 JSON',
    )
    expect(
      session?.events.some(
        (event) =>
          event.type === 'agent_completed' &&
          event.agentId === 'researcher' &&
          event.payload?.source === 'live',
      ),
    ).toBe(true)
  })

  it('fails the session on a mid-run provider error without demo fallback', async () => {
    const provider = new ScriptedProvider([
      JSON.stringify(plannerOutput),
      new LLMAuthError(),
    ])
    const controller = new TaskController({
      live: { provider, getConfig: () => CONFIG },
      resolveStepDuration: () => 0,
    })

    await controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: null,
    })
    const session = controller.getSession()

    expect(session?.status).toBe('failed')
    expect(session?.mode).toBe('live')
    expect(session?.error).toContain('认证失败')
    expect(session?.agents[1]?.status).toBe('failed')
    expect(session?.agents[1]?.output).toBeNull()
    expect(session?.agents.some((agent) => agent.status === 'fallback')).toBe(
      false,
    )
  })

  it('fails the agent and session with a readable error on timeout', async () => {
    const provider = new ScriptedProvider([new LLMTimeoutError()])
    const controller = new TaskController({
      live: { provider, getConfig: () => CONFIG },
      resolveStepDuration: () => 0,
    })

    await controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: null,
    })
    const session = controller.getSession()

    expect(session?.status).toBe('failed')
    expect(session?.agents[0]?.status).toBe('failed')
    expect(session?.agents[0]?.error).toContain('请求超时')
    expect(session?.error).toContain('请求超时')
    expect(session?.agents.some((agent) => agent.status === 'fallback')).toBe(
      false,
    )
  })

  it('cancels an active live run and skips remaining agents', async () => {
    const provider = new AbortableProvider()
    const controller = new TaskController({
      live: { provider, getConfig: () => CONFIG },
      resolveStepDuration: () => 0,
    })

    const run = controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: null,
    })
    await waitFor(() => provider.calls === 1)
    await controller.cancel()
    await run

    const session = controller.getSession()
    expect(session?.status).toBe('cancelled')
    expect(session?.agents[0]?.status).toBe('skipped')
    expect(session?.agents[0]?.output).toBeNull()
    expect(provider.calls).toBe(1)
  })
})

describe('LIVE literature retrieval workflow', () => {
  it('injects Semantic Scholar papers into the Researcher output and downstream agents', async () => {
    const provider = new ScriptedProvider(
      VALID_PIPELINE.map((output) => JSON.stringify(output)),
    )
    const literatureSearch = new StaticLiteratureSearch(COMPLETED_OUTCOME)
    const controller = new TaskController({
      live: {
        provider,
        getConfig: () => CONFIG,
        literatureSearch,
      },
      resolveStepDuration: () => 0,
    })

    await controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: null,
    })
    const session = controller.getSession()
    const researcher = session?.agents[1]

    expect(session?.status).toBe('completed')
    expect(literatureSearch.calls).toBe(1)
    expect(literatureSearch.inputs[0].plannerKeywords).toHaveLength(2)
    expect(literatureSearch.inputs[0].retrievalPlan.keywordGroups).toEqual(
      researcherOutput.retrievalPlan?.keywordGroups,
    )
    expect(researcher?.status).toBe('completed')
    if (researcher?.output?.type !== 'researcher') {
      throw new Error('Researcher output missing')
    }
    expect(researcher.output.literature).toEqual([REAL_PAPER])
    expect(researcher.output.retrieval?.status).toBe('completed')
    expect(researcher.output.retrieval?.totalReturned).toBe(1)
    expect(researcher.output.summary).toContain('Semantic Scholar')

    expect(provider.requests[2].messages.at(-1)?.content).toContain(
      REAL_PAPER.title,
    )
    expect(provider.requests[3].messages.at(-1)?.content).toContain(
      REAL_PAPER.doi,
    )
  })

  it('keeps the run alive on a failed search without fabricating papers', async () => {
    const provider = new ScriptedProvider(
      VALID_PIPELINE.map((output) => JSON.stringify(output)),
    )
    const literatureSearch = new StaticLiteratureSearch({
      ...COMPLETED_OUTCOME,
      literature: [],
      status: 'failed',
      totalFound: 0,
      error: 'Semantic Scholar 请求受限（429）：请稍后重试。',
      warnings: ['Semantic Scholar 请求受限（429）：请稍后重试。'],
    })
    const controller = new TaskController({
      live: {
        provider,
        getConfig: () => CONFIG,
        literatureSearch,
      },
      resolveStepDuration: () => 0,
    })

    await controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: null,
    })
    const session = controller.getSession()
    const researcher = session?.agents[1]

    expect(session?.status).toBe('completed')
    expect(researcher?.status).toBe('completed')
    if (researcher?.output?.type !== 'researcher') {
      throw new Error('Researcher output missing')
    }
    expect(researcher.output.literature).toEqual([])
    expect(researcher.output.retrieval?.status).toBe('failed')
    expect(researcher.output.retrieval?.error).toContain('429')
    expect(researcher.output.summary).toContain('未使用模拟或虚构论文替代')
    expect(session?.agents.some((agent) => agent.status === 'fallback')).toBe(
      false,
    )
  })

  it('records an empty search outcome without substituting demo literature', async () => {
    const provider = new ScriptedProvider(
      VALID_PIPELINE.map((output) => JSON.stringify(output)),
    )
    const literatureSearch = new StaticLiteratureSearch({
      ...COMPLETED_OUTCOME,
      literature: [],
      status: 'empty',
      totalFound: 0,
      error: null,
      warnings: [],
    })
    const controller = new TaskController({
      live: {
        provider,
        getConfig: () => CONFIG,
        literatureSearch,
      },
      resolveStepDuration: () => 0,
    })

    await controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: null,
    })
    const researcher = controller.getSession()?.agents[1]

    expect(researcher?.status).toBe('completed')
    if (researcher?.output?.type !== 'researcher') {
      throw new Error('Researcher output missing')
    }
    expect(researcher.output.literature).toEqual([])
    expect(researcher.output.retrieval?.status).toBe('empty')
    expect(researcher.output.retrieval?.totalReturned).toBe(0)
  })

  it('cancels an in-flight Semantic Scholar search with the session', async () => {
    const provider = new ScriptedProvider([
      JSON.stringify(plannerOutput),
      JSON.stringify(researcherOutput),
    ])
    const literatureSearch = new HangingLiteratureSearch()
    const controller = new TaskController({
      live: {
        provider,
        getConfig: () => CONFIG,
        literatureSearch,
      },
      resolveStepDuration: () => 0,
    })

    const run = controller.startLive({
      topic: '小样本医学图像分割的泛化性改进研究',
      description: null,
    })
    await waitFor(() => literatureSearch.calls === 1)
    await controller.cancel()
    await run

    const session = controller.getSession()
    const researcher = session?.agents[1]
    expect(session?.status).toBe('cancelled')
    expect(researcher?.status).toBe('skipped')
    expect(researcher?.output).toBeNull()
    expect(literatureSearch.calls).toBe(1)
  })
})
