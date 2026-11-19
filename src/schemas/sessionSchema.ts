import { z } from 'zod'

import {
  agentIdSchema,
  demoAgentSchema,
  isoTimestampSchema,
} from '@/schemas/agentSchema'
import {
  literatureClueSchema,
  researchPlanSchema,
  reviewerCommentSchema,
} from '@/schemas/researchSchema'

const AGENT_ORDER = ['planner', 'researcher', 'reviewer', 'synthesizer'] as const

const REQUIRED_REPORT_SECTIONS = [
  '研究背景',
  '核心研究问题',
  '相关研究与证据',
  '研究假设',
  '技术路线',
  '实验设计',
  '评价指标',
  '潜在风险',
  '下一步研究建议',
]

export const sessionStatusSchema = z.enum([
  'created',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
])

export const agentEventTypeSchema = z.enum([
  'session_created',
  'session_started',
  'session_paused',
  'session_resumed',
  'session_cancelled',
  'agent_started',
  'agent_progress',
  'agent_completed',
  'agent_failed',
  'agent_fallback',
  'agent_skipped',
  'session_completed',
])

export const agentEventSchema = z
  .object({
    id: z.string().min(1, '事件 id 不能为空'),
    type: agentEventTypeSchema,
    agentId: agentIdSchema.nullable(),
    timestamp: isoTimestampSchema,
    message: z.string().min(4, '事件描述过短'),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((event, ctx) => {
    const sessionLevel = event.type.startsWith('session_')
    if (sessionLevel && event.agentId !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentId'],
        message: `会话级事件「${event.type}」的 agentId 必须为 null`,
      })
    }
    if (!sessionLevel && event.agentId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentId'],
        message: `Agent 事件「${event.type}」必须指定 agentId`,
      })
    }
  })

function sameIdSequence(left: string[], right: string[]) {
  return (
    left.length === right.length && left.every((id, index) => id === right[index])
  )
}

export const demoSessionSchema = z
  .object({
    sessionId: z
      .string()
      .regex(/^demo-[a-z0-9-]+$/, 'sessionId 必须形如 demo-medical'),
    title: z.string().min(4, '会话标题过短'),
    description: z.string().min(20, '会话描述至少 20 个字符'),
    topic: z.string().min(4, '研究课题过短'),
    mode: z.literal('demo'),
    status: sessionStatusSchema,
    createdAt: isoTimestampSchema,
    agents: z.array(demoAgentSchema).length(4, '会话必须包含 4 个 Agent'),
    researchPlan: researchPlanSchema,
    literature: z
      .array(literatureClueSchema)
      .min(5, '每套案例至少提供 5 条研究线索'),
    review: z
      .array(reviewerCommentSchema)
      .length(3, '每套案例必须恰好包含 3 条审查意见'),
    finalReport: z.string().min(600, '最终报告至少 600 个字符'),
    events: z.array(agentEventSchema).min(8, '事件时间线过短'),
  })
  .superRefine((session, ctx) => {
    const addIssue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: 'custom', path, message })
    }

    const questionIds = session.researchPlan.researchQuestions.map(
      (item) => item.id,
    )
    const questionIdSet = new Set(questionIds)

    const checkRelatedIds = (
      entries: { relatedQuestionIds: string[] }[],
      path: string,
    ) => {
      entries.forEach((entry, index) => {
        entry.relatedQuestionIds.forEach((questionId, relatedIndex) => {
          if (!questionIdSet.has(questionId)) {
            addIssue(
              [path, index, 'relatedQuestionIds', relatedIndex],
              `关联的研究问题 ${questionId} 不存在`,
            )
          }
        })
      })
    }

    checkRelatedIds(session.literature, 'literature')
    checkRelatedIds(session.review, 'review')

    const literatureIds = session.literature.map((item) => item.id)
    if (new Set(literatureIds).size !== literatureIds.length) {
      addIssue(['literature'], '文献 id 不得重复')
    }
    const reviewIds = session.review.map((item) => item.id)
    if (new Set(reviewIds).size !== reviewIds.length) {
      addIssue(['review'], '审查意见 id 不得重复')
    }

    questionIds.forEach((questionId) => {
      const covered = session.literature.some((clue) =>
        clue.relatedQuestionIds.includes(questionId),
      )
      if (!covered) {
        addIssue(
          ['literature'],
          `研究问题 ${questionId} 缺少可追溯的文献线索`,
        )
      }
    })

    const agentIds = session.agents.map((agent) => agent.id)
    if (new Set(agentIds).size !== session.agents.length) {
      addIssue(['agents'], 'Agent id 不得重复')
    }
    AGENT_ORDER.forEach((expectedId, index) => {
      if (agentIds[index] !== expectedId) {
        addIssue(
          ['agents', index, 'id'],
          `Agent 必须按 Planner → Researcher → Reviewer → Synthesizer 顺序排列`,
        )
      }
    })

    const planner = session.agents.find((agent) => agent.id === 'planner')
    if (planner && planner.output.type === 'planner') {
      const outputQuestionIds = planner.output.researchQuestions.map(
        (item) => item.id,
      )
      if (!sameIdSequence(outputQuestionIds, questionIds)) {
        addIssue(
          ['agents', 0, 'output', 'researchQuestions'],
          'Planner 输出的研究问题必须与 researchPlan 完全一致',
        )
      }
      const planKeywordIds = session.researchPlan.searchKeywords.map(
        (item) => item.id,
      )
      const outputKeywordIds = planner.output.searchKeywords.map(
        (item) => item.id,
      )
      if (!sameIdSequence(outputKeywordIds, planKeywordIds)) {
        addIssue(
          ['agents', 0, 'output', 'searchKeywords'],
          'Planner 输出的检索词必须与 researchPlan 完全一致',
        )
      }
    }

    const researcher = session.agents.find((agent) => agent.id === 'researcher')
    if (researcher && researcher.output.type === 'researcher') {
      const outputIds = researcher.output.literature.map((item) => item.id)
      if (!sameIdSequence(outputIds, literatureIds)) {
        addIssue(
          ['agents', 1, 'output', 'literature'],
          'Researcher 输出的文献必须与 session.literature 完全一致',
        )
      }
    }

    const reviewer = session.agents.find((agent) => agent.id === 'reviewer')
    if (reviewer && reviewer.output.type === 'reviewer') {
      const outputIds = reviewer.output.review.map((item) => item.id)
      if (!sameIdSequence(outputIds, reviewIds)) {
        addIssue(
          ['agents', 2, 'output', 'review'],
          'Reviewer 输出的审查意见必须与 session.review 完全一致',
        )
      }
    }

    const synthesizer = session.agents.find(
      (agent) => agent.id === 'synthesizer',
    )
    if (
      synthesizer &&
      synthesizer.output.type === 'synthesizer' &&
      synthesizer.output.finalReport !== session.finalReport
    ) {
      addIssue(
        ['agents', 3, 'output', 'finalReport'],
        'Synthesizer 输出的报告必须与 session.finalReport 完全一致',
      )
    }

    if (session.status === 'completed') {
      session.agents.forEach((agent, index) => {
        if (agent.status !== 'completed') {
          addIssue(
            ['agents', index, 'status'],
            `会话已完成时 Agent「${agent.id}」的状态必须为 completed`,
          )
        }
      })
    }

    REQUIRED_REPORT_SECTIONS.forEach((section) => {
      const heading = new RegExp(`##\\s*\\d+\\.?\\s*${section}`)
      if (!heading.test(session.finalReport)) {
        addIssue(
          ['finalReport'],
          `最终报告缺少必需章节：${section}`,
        )
      }
    })
    ;(['Evidence', 'Hypothesis', 'Proposal'] as const).forEach((label) => {
      if (!session.finalReport.includes(label)) {
        addIssue(
          ['finalReport'],
          `最终报告必须区分并标注 ${label}`,
        )
      }
    })
    if (!session.finalReport.includes('$$')) {
      addIssue(['finalReport'], '最终报告必须包含 LaTeX 公式')
    }

    const events = session.events
    const createdCount = events.filter(
      (event) => event.type === 'session_created',
    ).length
    const completedCount = events.filter(
      (event) => event.type === 'session_completed',
    ).length
    if (createdCount !== 1) {
      addIssue(['events'], '事件时间线必须恰好包含 1 个 session_created')
    }
    if (completedCount !== 1) {
      addIssue(['events'], '事件时间线必须恰好包含 1 个 session_completed')
    }
    if (events[0]?.type !== 'session_created') {
      addIssue(['events', 0, 'type'], '首个事件必须为 session_created')
    }
    if (events[events.length - 1]?.type !== 'session_completed') {
      addIssue(
        ['events', events.length - 1, 'type'],
        '最后一个事件必须为 session_completed',
      )
    }

    let previousTime = Number.NEGATIVE_INFINITY
    const startedAgents = new Set<string>()
    const finishedAgents = new Set<string>()
    let expectedStartIndex = 0

    events.forEach((event, index) => {
      const time = Date.parse(event.timestamp)
      if (time < previousTime) {
        addIssue(
          ['events', index, 'timestamp'],
          '事件时间戳不得早于上一事件',
        )
      }
      previousTime = Math.max(previousTime, time)

      if (event.type === 'agent_started') {
        if (event.agentId === null) {
          return
        }
        if (startedAgents.has(event.agentId)) {
          addIssue(
            ['events', index, 'agentId'],
            `Agent「${event.agentId}」重复启动`,
          )
          return
        }
        if (event.agentId !== AGENT_ORDER[expectedStartIndex]) {
          addIssue(
            ['events', index, 'agentId'],
            `Agent 必须按 Planner → Researcher → Reviewer → Synthesizer 串行启动，当前为 ${event.agentId}`,
          )
          return
        }
        if (
          expectedStartIndex > 0 &&
          !finishedAgents.has(AGENT_ORDER[expectedStartIndex - 1])
        ) {
          addIssue(
            ['events', index],
            `Agent「${AGENT_ORDER[expectedStartIndex - 1]}」尚未完成，不能启动下一个 Agent`,
          )
        }
        startedAgents.add(event.agentId)
        expectedStartIndex += 1
        return
      }

      if (event.agentId === null) {
        return
      }

      if (!startedAgents.has(event.agentId)) {
        addIssue(
          ['events', index],
          `Agent「${event.agentId}」在启动前出现了 ${event.type} 事件`,
        )
        return
      }

      if (
        event.type === 'agent_progress' &&
        finishedAgents.has(event.agentId)
      ) {
        addIssue(
          ['events', index],
          `Agent「${event.agentId}」完成后仍有进度事件`,
        )
      }

      if (
        event.type === 'agent_completed' ||
        event.type === 'agent_fallback' ||
        event.type === 'agent_failed'
      ) {
        if (finishedAgents.has(event.agentId)) {
          addIssue(
            ['events', index],
            `Agent「${event.agentId}」重复出现完成类事件`,
          )
        }
        finishedAgents.add(event.agentId)
      }
    })

    AGENT_ORDER.forEach((agentId) => {
      if (!startedAgents.has(agentId)) {
        addIssue(['events'], `缺少 Agent「${agentId}」的启动事件`)
      }
      if (!finishedAgents.has(agentId)) {
        addIssue(['events'], `缺少 Agent「${agentId}」的完成事件`)
      }
    })

    session.agents.forEach((agent, index) => {
      if (agent.startedAt === null || agent.completedAt === null) {
        return
      }
      const startEvent = events.find(
        (event) =>
          event.type === 'agent_started' && event.agentId === agent.id,
      )
      const endEvent = events.find(
        (event) =>
          (event.type === 'agent_completed' ||
            event.type === 'agent_fallback') &&
          event.agentId === agent.id,
      )
      if (startEvent && startEvent.timestamp !== agent.startedAt) {
        addIssue(
          ['agents', index, 'startedAt'],
          `Agent「${agent.id}」的 startedAt 与事件时间不一致`,
        )
      }
      if (endEvent && endEvent.timestamp !== agent.completedAt) {
        addIssue(
          ['agents', index, 'completedAt'],
          `Agent「${agent.id}」的 completedAt 与事件时间不一致`,
        )
      }
      if (!startEvent || !endEvent) {
        addIssue(
          ['agents', index],
          `Agent「${agent.id}」缺少对应的启动或完成事件`,
        )
      }
    })
  })

export type SessionStatus = z.infer<typeof sessionStatusSchema>
export type AgentEventType = z.infer<typeof agentEventTypeSchema>
export type AgentEvent = z.infer<typeof agentEventSchema>
export type DemoSession = z.infer<typeof demoSessionSchema>
