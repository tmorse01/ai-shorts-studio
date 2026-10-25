import { describe, expect, it } from 'vitest'
import type { Batch } from '@shared/batch/batch'
import type { JobSnapshot } from '@shared/media/jobs'
import { BatchRunner, type BatchQueue } from '../src/main/batch/batchRunner'
import { JobCancelledError, type JobInput } from '../src/main/jobs/jobQueue'
import { UserFacingError } from '../src/main/errors'

// A queue that only does what the test tells it: each job waits until the test finishes or fails it.
function fakeQueue() {
  type Fake = {
    id: string
    path: string
    extra: Omit<JobInput, 'path'>
    status: JobSnapshot['status']
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }
  const jobs = new Map<string, Fake>()
  const listeners = new Set<(job: JobSnapshot) => void>()
  let sequence = 0
  const snapshot = (job: Fake, progress = 0): JobSnapshot => ({
    id: job.id,
    kind: 'analysis',
    label: job.path,
    status: job.status,
    progress
  })
  const queue = {
    enqueue: (_kind: 'analysis', path: string, extra: Omit<JobInput, 'path'>) => {
      sequence += 1
      const id = `job-${sequence}`
      let resolve!: (value: unknown) => void
      let reject!: (error: unknown) => void
      const done = new Promise<unknown>((res, rej) => {
        resolve = res
        reject = rej
      })
      done.catch(() => undefined)
      jobs.set(id, { id, path, extra, status: 'queued', resolve, reject })
      return { id, done }
    },
    cancel: (id: string) => {
      const job = jobs.get(id)
      if (!job || job.status === 'done' || job.status === 'failed') return false
      job.status = 'cancelled'
      job.reject(new JobCancelledError())
      return true
    },
    subscribe: (listener: (job: JobSnapshot) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    list: () => [...jobs.values()].map((job) => snapshot(job))
  }
  const emit = (job: Fake, progress = 0) => {
    for (const listener of listeners) listener(snapshot(job, progress))
  }
  return {
    queue: queue as unknown as BatchQueue,
    jobs,
    run(id: string, progress = 0.5) {
      const job = jobs.get(id)
      if (!job) throw new Error(`no job ${id}`)
      job.status = 'running'
      emit(job, progress)
    },
    finish(id: string) {
      const job = jobs.get(id)
      if (!job) throw new Error(`no job ${id}`)
      job.status = 'done'
      job.resolve({ outcome: 'done' })
    },
    fail(id: string, error: unknown) {
      const job = jobs.get(id)
      if (!job) throw new Error(`no job ${id}`)
      job.status = 'failed'
      job.reject(error)
    },
    finishWith(id: string, value: unknown) {
      const job = jobs.get(id)
      if (!job) throw new Error(`no job ${id}`)
      job.status = 'done'
      job.resolve(value)
    }
  }
}

function setup() {
  const fake = fakeQueue()
  const saved: Batch[] = []
  const changes: Batch[] = []
  const stored = new Map<string, Batch>()
  let batchNumber = 0
  const runner = new BatchRunner({
    queue: fake.queue,
    jobExtras: (_folder, stage, mediaId) => ({
      outDir: `/frames/${mediaId}`,
      resultFile: stage === 'vision' ? `/v/${mediaId}.json` : undefined
    }),
    load: async (_folder, batchId) => stored.get(batchId),
    save: async (_folder, batch) => {
      saved.push(structuredClone(batch))
      stored.set(batch.id, structuredClone(batch))
    },
    onChange: (_folder, batch) => changes.push(batch),
    newId: () => `${++batchNumber}`,
    now: () => '2026-10-24T10:00:00.000Z'
  })
  return { fake, runner, saved, changes, stored }
}

const items = [
  { id: 'a', path: '/media/a.mp4' },
  { id: 'b', path: '/media/b.mp4' }
]

describe('BatchRunner', () => {
  it('saves the queued batch, runs each item as an analysis job, and saves when each finishes', async () => {
    const { fake, runner, saved } = setup()
    const batch = await runner.start({ projectFolder: '/p', stage: 'shots', items })

    expect(batch.id).toBe('batch-1')
    expect(saved).toHaveLength(1)
    expect([...fake.jobs.values()].map((job) => [job.path, job.extra])).toEqual([
      ['/media/a.mp4', { stage: 'shots', outDir: '/frames/a', resultFile: undefined }],
      ['/media/b.mp4', { stage: 'shots', outDir: '/frames/b', resultFile: undefined }]
    ])

    fake.finish('job-1')
    await flush()
    expect(saved.at(-1)?.items[0]?.status).toBe('done')
    expect(saved.at(-1)?.status).toBe('running')

    fake.finish('job-2')
    await flush()
    expect(saved.at(-1)?.status).toBe('done')
  })

  it('reports progress without saving it', async () => {
    const { fake, runner, changes, saved } = setup()
    await runner.start({ projectFolder: '/p', stage: 'transcript', items: items.slice(0, 1) })
    const savesBefore = saved.length
    fake.run('job-1', 0.4)
    const last = changes.at(-1)
    expect(last?.items[0]).toMatchObject({ status: 'running', progress: 0.4 })
    expect(saved).toHaveLength(savesBefore)
  })

  it('cancels one item and leaves the others running', async () => {
    const { fake, runner } = setup()
    await runner.start({ projectFolder: '/p', stage: 'shots', items })
    const result = await runner.cancel('/p', 'batch-1', 'a')
    expect(result.cancelled).toBe(true)
    expect(result.batch.items.map((item) => item.status)).toEqual(['cancelled', 'queued'])
    await flush()
    // The job's rejection does not change the item again.
    expect(result.batch.items[0]?.status).toBe('cancelled')
    expect(fake.jobs.get('job-1')?.status).toBe('cancelled')
  })

  it('records a failure with a plain message and retries only that item', async () => {
    const { fake, runner } = setup()
    await runner.start({ projectFolder: '/p', stage: 'shots', items })
    fake.fail('job-1', new Error('ffmpeg exited with code 1'))
    await flush()

    const failed = await runner.retry('/p', 'batch-1', [])
    expect(failed.retried).toEqual([])

    fake.fail('job-2', new UserFacingError('The file is damaged.'))
    await flush()
    const retried = await runner.retry('/p', 'batch-1', [{ id: 'a', path: '/media/a.mp4' }])
    expect(retried.retried).toEqual(['a'])
    expect(retried.batch.items[0]).toMatchObject({ status: 'queued', attempts: 2 })
    expect(retried.batch.items[1]).toMatchObject({ status: 'failed' })
    expect(retried.batch.items[1]?.error).toEqual({
      message: 'The file is damaged.',
      details: undefined
    })
  })

  it('loads a saved batch that the runner does not hold, for retry', async () => {
    const { runner, stored } = setup()
    stored.set('old', {
      id: 'old',
      stage: 'shots',
      status: 'failed',
      createdAt: '2026-10-24T09:00:00.000Z',
      items: [{ id: 'a', status: 'failed', progress: 0, attempts: 1, error: { message: 'x' } }]
    })
    const result = await runner.retry('/p', 'old', [{ id: 'a', path: '/media/a.mp4' }])
    expect(result.retried).toEqual(['a'])
  })

  it('refuses to retry a batch that does not exist', async () => {
    const { runner } = setup()
    await expect(runner.retry('/p', 'missing', items)).rejects.toThrow(/not found/)
  })
})

const footage = (lineId: string) => ({
  lines: [{ lineId, text: `line ${lineId}` }],
  targetMs: null,
  docs: [],
  mediaNames: {},
  shots: {},
  durationsMs: {}
})

describe('BatchRunner assembly batches', () => {
  it('runs each script as an assembly job and saves the plan it matched', async () => {
    const { fake, runner, saved } = setup()
    const batch = await runner.start({
      projectFolder: '/p',
      kind: 'assembly',
      items: [{ id: 's1', footage: footage('l1') }]
    })

    expect(batch.kind).toBe('assembly')
    const [job] = [...fake.jobs.values()]
    expect(job.extra).toEqual({
      assembly: { batchId: batch.id, reuse: false, footage: footage('l1') }
    })

    const plan = { plan: { lines: [] }, unmatchedLineIds: ['l1'], totalMs: 0, targetHit: null }
    fake.finishWith(job.id, plan)
    await flush()
    expect(saved.at(-1)?.items[0]).toMatchObject({ id: 's1', status: 'done', plan })
    expect(saved.at(-1)?.status).toBe('done')
  })

  it('records a failed match with its message, and after a restart retries it only with its footage request', async () => {
    const { fake, runner, stored } = setup()
    await runner.start({
      projectFolder: '/p',
      kind: 'assembly',
      items: [{ id: 's1', footage: footage('l1') }]
    })
    fake.fail('job-1', new UserFacingError('The footage could not be read.'))
    await flush()
    expect(stored.get('batch-1')?.items[0]).toMatchObject({
      status: 'failed',
      error: { message: 'The footage could not be read.' }
    })

    // A runner that did not start the batch holds no footage requests, since they are not saved.
    const restarted = new BatchRunner({
      queue: fake.queue,
      jobExtras: () => ({}),
      load: async (_folder, batchId) => stored.get(batchId),
      save: async () => undefined
    })
    await expect(restarted.retry('/p', 'batch-1', [{ id: 's1' }])).rejects.toThrow(
      'Retrying an item needs its footage request.'
    )
    const retried = await restarted.retry('/p', 'batch-1', [{ id: 's1', footage: footage('l1') }])
    expect(retried.retried).toEqual(['s1'])
    expect(retried.batch.items[0]).toMatchObject({ status: 'queued', attempts: 2 })
  })
})

// Lets queued promise callbacks run.
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
