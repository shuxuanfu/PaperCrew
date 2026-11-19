import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { DemoExecutor } from '@/agents/demoExecutor'
import {
  StateTransitionError,
  canTransitionAgent,
  canTransitionSession,
  transitionAgent,
  transitionSession,
} from '@/engine/stateMachine'
import { DemoPlayer } from '@/engine/demoPlayer'
import { TaskController } from '@/engine/taskController'
import { demoSessionSchema } from '@/schemas/sessionSchema'
import type { AgentExecutor } from '@/types/engine'
import type { DemoAgent } from '@/types/agent'
import type { DemoSession } from '@/types/session'

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

function loadTemplate(file: string): DemoSession {
  const path = fileURLToPath(
    new URL(`../../public/data/${file}`, import.meta.url),
  )
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const parsed = demoSessionSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.message)
  }
  return parsed.data
}

const MEDICAL = 'demo-medical.json'
const MULTI = 'demo-multiagent.json'

function idleAgent(agent: DemoAgent): DemoAgent {
  return {
    ...agent,
    status: 'idle',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    fallbackReason: null,
  }
}

describe('Agent state machine', () => {
  const agent = idleAgent(loadTemplate(MEDICAL).agents[0])

  it('accepts every defined transition', () => {
    const legal: Array<[DemoAgent['status'], DemoAgent['status']]> = [
      ['idle', 'pending'],
      ['pending', 'running'],
      ['pending', 'skipped'],
      ['running', 'completed'],
      ['running', 'failed'],
      ['running', 'fallback'],
      ['running', 'skipped'],
      ['failed', 'pending'],
    ]
    for (const [from, to] of legal) {
      expect(canTransitionAgent(from, to), `${from} → ${to}`).toBe(true)
    }
  })

  it('rejects illegal transitions', () => {
    const illegal: Array<[DemoAgent['status'], DemoAgent['status']]> = [
      ['idle', 'running'],
      ['pending', 'completed'],
      ['completed', 'running'],
      ['completed', 'pending'],
      ['failed', 'completed'],
      ['failed', 'running'],
      ['fallback', 'running'],
      ['skipped', 'pending'],
    ]
    for (const [from, to] of illegal) {
      expect(canTransitionAgent(from, to), `${from} → ${to}`).toBe(false)
      expect(() =>
        transitionAgent(
          { ...agent, status: from },
          to,
          { now: '2026-01-01T00:00:00.000Z' },
        ),
      ).toThrow(StateTransitionError)
    }
  })

  it('records timestamps and completion details', () => {
    const running = transitionAgent(agent, 'pending', {
      now: '2026-01-01T00:00:00.000Z',
    })
    const started = transitionAgent(running, 'running', {
      now: '2026-01-01T00:00:01.000Z',
    })
    expect(started.startedAt).toBe('2026-01-01T00:00:01.000Z')

    const completed = transitionAgent(started, 'completed', {
      now: '2026-01-01T00:00:03.000Z',
    })
    expect(completed.completedAt).toBe('2026-01-01T00:00:03.000Z')
    expect(completed.durationMs).toBe(2000)
    expect(completed.error).toBeNull()

    const failed = transitionAgent(started, 'failed', {
      now: '2026-01-01T00:00:02.000Z',
      error: 'boom',
    })
    expect(failed.error).toBe('boom')
    expect(failed.durationMs).toBe(1000)

    const fallback = transitionAgent(started, 'fallback', {
      now: '2026-01-01T00:00:02.500Z',
      fallbackReason: 'degraded',
    })
    expect(fallback.fallbackReason).toBe('degraded')

    const retried = transitionAgent(failed, 'pending', {
      now: '2026-01-01T00:00:04.000Z',
    })
    expect(retried.startedAt).toBeNull()
    expect(retried.completedAt).toBeNull()
    expect(retried.durationMs).toBeNull()
    expect(retried.error).toBeNull()
  })
})

describe('Session state machine', () => {
  const template = loadTemplate(MEDICAL)

  it('accepts the defined lifecycle and rejects terminal regressions', () => {
    expect(canTransitionSession('created', 'running')).toBe(true)
    expect(canTransitionSession('running', 'paused')).toBe(true)
    expect(canTransitionSession('paused', 'running')).toBe(true)
    expect(canTransitionSession('running', 'completed')).toBe(true)
    expect(canTransitionSession('running', 'failed')).toBe(true)
    expect(canTransitionSession('running', 'cancelled')).toBe(true)
    expect(canTransitionSession('failed', 'running')).toBe(true)
    expect(canTransitionSession('completed', 'running')).toBe(false)
    expect(canTransitionSession('cancelled', 'running')).toBe(false)
    expect(canTransitionSession('failed', 'completed')).toBe(false)
  })

  it('only completes when every agent finished successfully', () => {
    const created = new DemoPlayer(template).createSession()
    const running = transitionSession(created, 'running', {
      now: '2026-01-01T00:00:00.000Z',
    })
    expect(() =>
      transitionSession(running, 'completed', {
        now: '2026-01-01T00:00:01.000Z',
      }),
    ).toThrow(StateTransitionError)

    const finished = {
      ...running,
      agents: running.agents.map((agent) => ({
        ...agent,
        status: 'completed' as const,
      })),
    }
    const completed = transitionSession(finished, 'completed', {
      now: '2026-01-01T00:00:02.000Z',
    })
    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBe('2026-01-01T00:00:02.000Z')
  })

  it('tracks running, paused, failed and retry transitions', () => {
    const created = new DemoPlayer(template).createSession()
    const running = transitionSession(created, 'running', {
      now: '2026-01-01T00:00:00.000Z',
    })
    expect(running.startedAt).toBe('2026-01-01T00:00:00.000Z')

    const paused = transitionSession(running, 'paused', {
      now: '2026-01-01T00:00:01.000Z',
    })
    expect(paused.status).toBe('paused')

    const resumed = transitionSession(paused, 'running', {
      now: '2026-01-01T00:00:02.000Z',
    })
    expect(resumed.status).toBe('running')

    const failed = transitionSession(resumed, 'failed', {
      now: '2026-01-01T00:00:03.000Z',
      error: 'agent failed',
    })
    expect(failed.error).toBe('agent failed')

    const retrying = transitionSession(failed, 'running', {
      now: '2026-01-01T00:00:04.000Z',
    })
    expect(retrying.status).toBe('running')
    expect(retrying.error).toBeNull()
    expect(retrying.completedAt).toBeNull()
  })
})

describe('Demo engine execution', () => {
  it.each([
    [MEDICAL],
    [MULTI],
  ])('runs %s through all four agents', async (file) => {
    const template = loadTemplate(file)
    const snapshot = JSON.stringify(template)
    const sessions: string[] = []
    const controller = new TaskController({
      resolveStepDuration: () => 0,
      onUpdate: (session) => {
        sessions.push(session.sessionId)
      },
    })

    const final = await controller.start(template)

    expect(final).not.toBeNull()
    expect(final?.status).toBe('completed')
    expect(final?.agents.map((agent) => agent.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ])
    expect(
      final?.events
        .filter((event) => event.type === 'agent_started')
        .map((event) => event.agentId),
    ).toEqual(['planner', 'researcher', 'reviewer', 'synthesizer'])
    expect(
      final?.events.filter((event) => event.type === 'session_created'),
    ).toHaveLength(1)
    expect(
      final?.events.filter((event) => event.type === 'session_started'),
    ).toHaveLength(1)
    expect(
      final?.events.filter((event) => event.type === 'session_completed'),
    ).toHaveLength(1)

    template.agents.forEach((agent, index) => {
      expect(final?.agents[index].output).toEqual(agent.output)
      expect(final?.agents[index].input).toEqual(agent.input)
    })
    expect(JSON.stringify(template)).toBe(snapshot)
    expect(new Set(sessions).size).toBe(1)
    expect(final?.templateId).toBe(template.sessionId)
  })

  it('pauses playback without starting the next agent and resumes in place', async () => {
    const template = loadTemplate(MEDICAL)
    const controller = new TaskController({
      resolveStepDuration: () => 300,
    })

    const run = controller.start(template)
    await waitFor(
      () => controller.getSession()?.agents[0].status === 'running',
    )
    expect(controller.pause()).toBe(true)

    await delay(120)
    const paused = controller.getSession()
    expect(paused?.status).toBe('paused')
    expect(paused?.agents[0].status).toBe('running')
    expect(paused?.agents[1].status).toBe('pending')
    expect(controller.pause()).toBe(false)

    expect(controller.resume()).toBe(true)
    const final = await run
    expect(final?.status).toBe('completed')
    expect(
      final?.events.filter((event) => event.type === 'session_paused'),
    ).toHaveLength(1)
    expect(
      final?.events.filter((event) => event.type === 'session_resumed'),
    ).toHaveLength(1)
  })

  it('can cancel while paused and never completes the session', async () => {
    const template = loadTemplate(MEDICAL)
    const controller = new TaskController({
      resolveStepDuration: () => 300,
    })

    const run = controller.start(template)
    await waitFor(
      () => controller.getSession()?.agents[0].status === 'running',
    )
    expect(controller.pause()).toBe(true)
    const cancelled = await controller.cancel()
    await run

    expect(cancelled?.status).toBe('cancelled')
    expect(controller.getSession()?.status).toBe('cancelled')
    expect(controller.getSession()?.agents[0].status).toBe('skipped')
    expect(
      controller
        .getSession()
        ?.events.some((event) => event.type === 'session_completed'),
    ).toBe(false)
    expect(controller.resume()).toBe(false)
    expect(controller.retry()).toBeNull()
  })

  it('cancels after an agent completes and skips all later agents', async () => {
    const template = loadTemplate(MULTI)
    const controller = new TaskController({
      resolveStepDuration: () => 50,
    })

    const run = controller.start(template)
    await waitFor(
      () => controller.getSession()?.agents[1].status === 'running',
    )
    const cancelled = await controller.cancel()
    await run

    const session = controller.getSession()
    expect(cancelled?.status).toBe('cancelled')
    expect(session?.status).toBe('cancelled')
    expect(session?.agents[0].status).toBe('completed')
    expect(session?.agents.slice(1).every((agent) => agent.status === 'skipped'))
      .toBe(true)
    expect(
      session?.events.some((event) => event.type === 'session_completed'),
    ).toBe(false)

    await delay(100)
    expect(controller.getSession()?.status).toBe('cancelled')
  })

  it('retries only the failed agent after a failure', async () => {
    const template = loadTemplate(MEDICAL)
    const demo = new DemoExecutor(template)
    const counts: Record<string, number> = {}
    let failures = 0

    const executor: AgentExecutor = {
      getPlaybook: (agentId) => demo.getPlaybook(agentId),
      async execute(context) {
        counts[context.agentId] = (counts[context.agentId] ?? 0) + 1
        if (context.agentId === 'researcher' && failures === 0) {
          failures += 1
          return { status: 'failed', error: 'Simulated researcher failure' }
        }
        return demo.execute(context)
      },
    }

    const controller = new TaskController({
      executorFactory: () => executor,
      resolveStepDuration: () => 0,
    })

    const failed = await controller.start(template)
    expect(failed?.status).toBe('failed')
    expect(failed?.agents[0].status).toBe('completed')
    expect(failed?.agents[1].status).toBe('failed')
    expect(failed?.agents[2].status).toBe('pending')
    expect(failed?.agents[3].status).toBe('pending')
    expect(failed?.error).toContain('Simulated researcher failure')
    expect(
      failed?.events.some((event) => event.type === 'agent_failed'),
    ).toBe(true)
    expect(
      failed?.events.some((event) => event.type === 'session_completed'),
    ).toBe(false)

    const retried = await controller.retry()
    expect(retried?.status).toBe('completed')
    expect(counts.planner).toBe(1)
    expect(counts.researcher).toBe(2)
    expect(counts.reviewer).toBe(1)
    expect(counts.synthesizer).toBe(1)
    expect(retried?.agents.map((agent) => agent.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ])
  })

  it('prevents duplicate starts from creating concurrent sessions', async () => {
    const template = loadTemplate(MEDICAL)
    const ids = new Set<string>()
    const controller = new TaskController({
      resolveStepDuration: () => 40,
      onUpdate: (session) => {
        ids.add(session.sessionId)
      },
    })

    const first = controller.start(template)
    const second = controller.start(template)
    expect(await second).toBeNull()

    const final = await first
    expect(final?.status).toBe('completed')
    expect(ids.size).toBe(1)
  })

  it('restarts with a fresh session', async () => {
    const template = loadTemplate(MULTI)
    const controller = new TaskController({
      resolveStepDuration: () => 0,
    })

    const first = await controller.start(template)
    const restarted = await controller.restart(template)

    expect(first?.sessionId).not.toBe(restarted?.sessionId)
    expect(restarted?.status).toBe('completed')
    expect(restarted?.templateId).toBe(template.sessionId)
    expect(
      restarted?.events.filter((event) => event.type === 'session_created'),
    ).toHaveLength(1)
  })

  it('isolates a new case from the previous run', async () => {
    const medical = loadTemplate(MEDICAL)
    const multi = loadTemplate(MULTI)
    const updates: Array<{ sessionId: string; status: string }> = []
    const controller = new TaskController({
      resolveStepDuration: () => 30,
      onUpdate: (session) => {
        updates.push({ sessionId: session.sessionId, status: session.status })
      },
    })

    const oldRun = controller.start(medical)
    await waitFor(() =>
      updates.some((update) => update.status === 'running'),
    )
    const newRun = await controller.restart(multi)
    await oldRun
    await delay(120)

    const current = controller.getSession()
    expect(newRun?.templateId).toBe(multi.sessionId)
    expect(newRun?.status).toBe('completed')
    expect(current?.sessionId).toBe(newRun?.sessionId)
    expect(current?.status).toBe('completed')

    const firstNewIndex = updates.findIndex(
      (update) => update.sessionId === newRun?.sessionId,
    )
    expect(firstNewIndex).toBeGreaterThanOrEqual(0)
    expect(
      updates
        .slice(firstNewIndex)
        .every((update) => update.sessionId === newRun?.sessionId),
    ).toBe(true)
  })
})
