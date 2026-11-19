import type {
  AgentContext,
  AgentExecutor,
  AgentPlaybook,
  AgentResult,
} from '@/types/engine'
import type { AgentId, AgentOutput } from '@/types/agent'
import type { LLMConfig } from '@/services/llm/llmConfig'
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
} from '@/services/llm/llmProvider'
import { AgentExecutionError, LLMError } from '@/services/llm/errors'
import { parseJsonResponse } from '@/services/llm/responseParser'
import {
  appendProgrammaticReferences,
  citationIssues,
} from '@/agents/synthesizerCitations'
import { AGENT_DEFINITIONS } from '@/domain/agent/definitions'
import { LIVE_PROMPTS } from '@/prompts'
import { liveAgentOutputSchemas } from '@/schemas/liveSchemas'
import type { LiteratureClue } from '@/types/research'

const MAX_REPORTED_ISSUES = 8

export interface LLMExecutorOptions {
  getConfig: () => LLMConfig
  provider: LLMProvider
}

interface ValidationSuccess {
  ok: true
  output: AgentOutput
}

interface ValidationFailure {
  ok: false
  issues: string[]
}

type ValidationOutcome = ValidationSuccess | ValidationFailure

function abortError(): Error {
  const error = new Error('Agent execution aborted')
  error.name = 'AbortError'
  return error
}

function summarizeIssues(issues: string[]): string {
  const shown = issues.slice(0, MAX_REPORTED_ISSUES)
  const rest =
    issues.length > MAX_REPORTED_ISSUES
      ? `；另有 ${issues.length - MAX_REPORTED_ISSUES} 处未列出`
      : ''
  return `${shown.join('；')}${rest}`
}

function crossAgentIssues(
  output: AgentOutput,
  context: AgentContext,
): string[] {
  if (output.type === 'planner') {
    return []
  }

  if (output.type === 'synthesizer') {
    const researcher = context.upstream.find(
      (item) => item.agentId === 'researcher',
    )
    if (!researcher || researcher.output.type !== 'researcher') {
      return output.finalReport.includes('[S2:')
        ? ['缺少上游 Researcher 输出，无法校验最终报告的真实文献引用']
        : []
    }

    const issues = citationIssues(
      output.finalReport,
      researcher.output.literature,
    )
    const knownDois = new Set(
      researcher.output.literature
        .map((item) => item.doi?.toLowerCase())
        .filter((doi): doi is string => Boolean(doi)),
    )
    const citedDois =
      output.finalReport.match(/\b10\.\d{4,9}\/[^\s<>"')\]]+/g) ?? []
    const unknownDois = [
      ...new Set(citedDois.map((doi) => doi.replace(/[.,;]+$/, ''))),
    ].filter((doi) => !knownDois.has(doi.toLowerCase()))
    unknownDois.forEach((doi) => {
      issues.push(
        `最终报告引用了未由 Semantic Scholar 返回的 DOI ${doi}，不得编造参考文献`,
      )
    })
    return issues
  }

  const planner = context.upstream.find((item) => item.agentId === 'planner')
  if (!planner || planner.output.type !== 'planner') {
    return ['缺少上游 Planner 输出，无法校验关联的研究问题 id']
  }

  const knownIds = new Set(
    planner.output.researchQuestions.map((item) => item.id),
  )
  const entries =
    output.type === 'reviewer'
      ? output.review
      : output.type === 'researcher'
        ? output.literature
        : []

  const issues: string[] = []
  entries.forEach((entry, index) => {
    entry.relatedQuestionIds.forEach((questionId) => {
      if (!knownIds.has(questionId)) {
        issues.push(
          `第 ${index + 1} 条内容引用了不存在的研究问题 ${questionId}`,
        )
      }
    })
  })
  return issues
}

function repairInstruction(issues: string[]): string {
  return [
    '你上一次的输出未通过数据结构校验：',
    ...issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => `- ${issue}`),
    '',
    '请返回完整、修正后的 JSON 对象（包含全部必需字段），只输出 JSON，不要输出其他文字。',
  ].join('\n')
}

export class LLMExecutor implements AgentExecutor {
  private readonly provider: LLMProvider
  private readonly getConfig: () => LLMConfig

  constructor(options: LLMExecutorOptions) {
    this.provider = options.provider
    this.getConfig = options.getConfig
  }

  getPlaybook(agentId: AgentId): AgentPlaybook {
    const name = AGENT_DEFINITIONS[agentId].name
    return {
      durationMs: 0,
      startedMessage: `${name} is calling the configured model…`,
      completedMessage: `${name} completed and its JSON output passed validation.`,
    }
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    if (context.signal.aborted) {
      throw abortError()
    }

    const prompt = LIVE_PROMPTS[context.agentId]
    const config = this.getConfig()

    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.buildUserMessage(context) },
    ]

    const first = await this.request(config, messages, context.signal)
    const firstOutcome = this.validate(first.content, context)
    if (firstOutcome.ok) {
      return this.completed(firstOutcome.output)
    }

    const repairMessages: LLMMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      { role: 'user', content: repairInstruction(firstOutcome.issues) },
    ]
    const repaired = await this.request(
      config,
      repairMessages,
      context.signal,
    )
    const repairedOutcome = this.validate(repaired.content, context)

    if (!repairedOutcome.ok) {
      throw new AgentExecutionError(
        `响应格式错误：模型输出未满足数据结构要求（已尝试一次修复）。${summarizeIssues(
          repairedOutcome.issues,
        )}`,
      )
    }

    return this.completed(repairedOutcome.output)
  }

  private completed(output: AgentOutput): AgentResult {
    return {
      status: 'completed',
      output,
      summary: output.summary,
      source: 'live',
    }
  }

  private validate(content: string, context: AgentContext): ValidationOutcome {
    let raw: unknown
    try {
      raw = parseJsonResponse(content)
    } catch (error) {
      return {
        ok: false,
        issues: [
          error instanceof Error ? error.message : '无法解析模型返回的 JSON',
        ],
      }
    }

    const parsed = liveAgentOutputSchemas[context.agentId].safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.length ? issue.path.join('.') : '(root)'
          return `${path}: ${issue.message}`
        }),
      }
    }

    const output = parsed.data as AgentOutput
    const crossIssues = crossAgentIssues(output, context)
    if (crossIssues.length > 0) {
      return { ok: false, issues: crossIssues }
    }

    if (output.type === 'synthesizer') {
      const researcher = context.upstream.find(
        (item) => item.agentId === 'researcher',
      )
      const literature: LiteratureClue[] =
        researcher?.output.type === 'researcher'
          ? researcher.output.literature
          : []
      return {
        ok: true,
        output: {
          ...output,
          finalReport: appendProgrammaticReferences(
            output.finalReport,
            literature,
          ),
        },
      }
    }

    return { ok: true, output }
  }

  private async request(
    config: LLMConfig,
    messages: LLMMessage[],
    signal: AbortSignal,
  ): Promise<LLMResponse> {
    if (signal.aborted) {
      throw abortError()
    }

    try {
      return await this.provider.chatCompletion(
        {
          baseURL: config.baseUrl,
          apiKey: config.apiKey,
          model: config.modelName,
          messages,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          responseFormat: config.jsonMode ? 'json_object' : undefined,
          timeoutMs: config.timeoutMs,
        },
        signal,
      )
    } catch (error) {
      if (signal.aborted) {
        throw abortError()
      }
      if (error instanceof LLMError) {
        throw new AgentExecutionError(error.message)
      }
      throw new AgentExecutionError('模型调用失败：请检查网络与 API 配置。')
    }
  }
}
