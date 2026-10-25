import { describe, expect, it } from 'vitest'
import type { ScriptRunInput, GeneratedScript } from '@shared/ai/scriptGeneration'
import { createBatch, updateBatchItem, type Batch } from '@shared/batch/batch'
import type { JobSnapshot } from '@shared/media/jobs'
import type { FootageMatchResultData } from '@shared/assembly/footageMatchRequest'
import { BatchRunner, type BatchQueue } from '../src/main/batch/batchRunner'
import { newlyFinishedScriptDrafts } from '@renderer/features/batch/batchSync'
import { assemblyPlanStates, assemblyStatusLabel } from '@renderer/features/assembly/assemblyQueue'

const NOW = '2026-10-24T12:00:00.000Z'

const request = (): ScriptRunInput => ({
  projectFolder: '/projects/harbour',
  media: [{ id: 'm1', fileName: 'boats.mp4' }],
  request: {
    topic: 'Fishing',
    count: 1,
    targetSeconds: null,
    tone: '',
    notes: '',
    reuseFootage: true
  }
})

const draft = (title: string): GeneratedScript => ({
  title,
  topic: 'Fishing',
  lines: [{ text: 'Opening line' }]
})

// A queue whose jobs wait until the test resolves them.
function fakeQueue() {
  const calls: { kind: string; path: string; extra: Record<string, unknown> }[] = []
  const pending: { resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = []
  const queue = {
    enqueue: (kind: string, path: string, extra: Record<string, unknown>) => {
      calls.push({ kind, path, extra })
      let resolve!: (value: unknown) => void
      let reject!: (error: unknown) => void
      const done = new Promise<unknown>((res, rej) => {
        resolve = res
        reject = rej
      })
      done.catch(() => undefined)
      pending.push({ resolve, reject })
      return { id: `job-${calls.length}`, done }
    },
    cancel: () => false,
    subscribe: () => () => undefined,
    list: (): JobSnapshot[] => []
  }
  return { queue: queue as unknown as BatchQueue, calls, pending }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('script batches (#145)', () => {
  it('runs each script item as a script job with its request, and keeps the drafts', async () => {
    const { queue, calls, pending } = fakeQueue()
    const saved: Batch[] = []
    const runner = new BatchRunner({
      queue,
      jobExtras: () => ({}),
      load: async () => undefined,
      save: async (_folder, batch) => {
        saved.push(batch)
      }
    })

    const batch = await runner.start({
      projectFolder: '/projects/harbour',
      items: [
        { id: 'a', request: request() },
        { id: 'b', request: request() }
      ]
    })

    expect(batch.kind).toBe('script')
    expect(batch.stage).toBeUndefined()
    expect(calls.map((call) => call.kind)).toEqual(['script', 'script'])
    expect(calls[0].extra.scriptRequest).toEqual(request())

    pending[0].resolve([draft('One')])
    await flush()
    await flush()
    const latest = saved[saved.length - 1]
    expect(latest.items.find((item) => item.id === 'a')).toMatchObject({
      status: 'done',
      scripts: [draft('One')]
    })
    expect(latest.items.find((item) => item.id === 'b')?.status).toBe('queued')
  })

  it('refuses a script batch whose item has no request', async () => {
    const { queue } = fakeQueue()
    const runner = new BatchRunner({
      queue,
      jobExtras: () => ({}),
      load: async () => undefined,
      save: async () => undefined
    })
    await expect(runner.start({ projectFolder: '/p', items: [{ id: 'a' }] })).rejects.toThrow(
      'needs its input'
    )
  })

  it('keeps analysis batches on the analysis job', async () => {
    const { queue, calls } = fakeQueue()
    const runner = new BatchRunner({
      queue,
      jobExtras: () => ({}),
      load: async () => undefined,
      save: async () => undefined
    })
    const batch = await runner.start({
      projectFolder: '/p',
      stage: 'transcript',
      items: [{ id: 'm1', path: '/p/boats.mp4' }]
    })
    expect(batch.kind).toBe('analysis')
    expect(calls[0].kind).toBe('analysis')
  })

  it('imports a finished draft once, and never a draft first seen as done', () => {
    const batch = createBatch({ id: 'batch-1', mediaIds: ['a', 'b'], createdAt: NOW })
    const seen = new Map<string, Batch['items'][number]['status']>()
    expect(newlyFinishedScriptDrafts(batch, seen)).toEqual([])

    const running = updateBatchItem(batch, 'a', { status: 'running' })
    expect(newlyFinishedScriptDrafts(running, seen)).toEqual([])

    const done = updateBatchItem(running, 'a', {
      status: 'done',
      progress: 1,
      scripts: [draft('One')]
    })
    expect(newlyFinishedScriptDrafts(done, seen)).toEqual([draft('One')])
    expect(newlyFinishedScriptDrafts(done, seen)).toEqual([])

    // A batch loaded after a restart has its finished items already, so they are not imported again.
    const afterRestart = new Map<string, Batch['items'][number]['status']>()
    expect(newlyFinishedScriptDrafts(done, afterRestart)).toEqual([])
  })
})

describe('assemble approved queue (#145)', () => {
  const result: FootageMatchResultData = {
    plan: { lines: [] },
    unmatchedLineIds: [],
    totalMs: 0,
    targetHit: null
  } as FootageMatchResultData

  it('maps each assembly item to its plan state, with the saved plan when it is ready', () => {
    const batch = createBatch({
      id: 'b1',
      kind: 'assembly',
      mediaIds: ['s1', 's2', 's3'],
      createdAt: NOW
    })
    const ready = updateBatchItem(batch, 's1', { status: 'done', progress: 1, plan: result })
    const failed = updateBatchItem(ready, 's2', {
      status: 'failed',
      progress: 0,
      error: { message: 'Network down' }
    })
    const states = assemblyPlanStates(
      updateBatchItem(failed, 's3', { status: 'running', progress: 0.5 })
    )
    expect(states).toEqual({
      s1: { status: 'ready', result },
      s2: { status: 'failed', message: 'Network down' },
      s3: { status: 'running' }
    })
  })

  it('labels the row for each plan state, and shows nothing when nothing is queued', () => {
    expect(assemblyStatusLabel(undefined)).toBeNull()
    expect(assemblyStatusLabel({ status: 'queued' })).toBe('Footage queued')
    expect(assemblyStatusLabel({ status: 'ready', result })).toBe('Footage ready to review')
  })
})
