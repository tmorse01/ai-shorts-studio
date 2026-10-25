import { describe, expect, it } from 'vitest'
import { emptyAnalysisFile, type AnalysisFile, type StageOutcome } from '@shared/analysis/analysis'
import {
  AnalysisService,
  type AnalysisQueue,
  type AnalysisStorage
} from '../src/main/analysis/analysisService'
import { JobCancelledError } from '../src/main/jobs/jobQueue'

// Cancel stops the running stage for one clip. The stage is marked failed, so Retry can start it again,
// and the job's late cancellation does not restart the chain.

function setup() {
  const pending: {
    id: string
    reject: (error: unknown) => void
    resolve: (o: StageOutcome) => void
  }[] = []
  const cancelled: string[] = []
  let counter = 0
  const queue: AnalysisQueue = {
    enqueue: () => {
      counter += 1
      const id = `job-${counter}`
      let resolve!: (o: StageOutcome) => void
      let reject!: (error: unknown) => void
      const done = new Promise<StageOutcome>((res, rej) => {
        resolve = res
        reject = rej
      })
      pending.push({ id, resolve, reject })
      return { id, done }
    },
    cancel: (id) => {
      cancelled.push(id)
      return true
    },
    setHeld: () => undefined
  }
  let saved: AnalysisFile = emptyAnalysisFile()
  const storage: AnalysisStorage = {
    load: async () => saved,
    save: async (_folder, file) => {
      saved = file
    }
  }
  return { queue, storage, pending, cancelled, saved: () => saved }
}

const item = { id: 'm1', path: '/footage/a.mp4' }
const folder = '/project'

// Lets pending promise callbacks run.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

describe('AnalysisService.cancel', () => {
  it('stops the running stage, marks it failed with a plain message, and ignores the late cancel', async () => {
    const env = setup()
    const service = new AnalysisService({ queue: env.queue, storage: env.storage })
    await service.sync(folder, [item])
    expect(env.pending).toHaveLength(1)

    const file = await service.cancel(folder, item)
    expect(env.cancelled).toEqual(['job-1'])
    expect(file.records.m1?.stages.transcript).toEqual({
      status: 'failed',
      error: { message: 'Analysis was cancelled.' }
    })

    // The queue rejects the cancelled job. Nothing restarts, and the failed stage stays failed.
    env.pending[0]?.reject(new JobCancelledError())
    await flush()
    expect(env.pending).toHaveLength(1)
    expect(env.saved().records.m1?.stages.transcript.status).toBe('failed')
  })

  it('does nothing when no stage is running', async () => {
    const env = setup()
    const service = new AnalysisService({ queue: env.queue, storage: env.storage })
    await service.sync(folder, [])
    await service.cancel(folder, item)
    expect(env.cancelled).toEqual([])
  })

  it('lets Retry start the cancelled stage again', async () => {
    const env = setup()
    const service = new AnalysisService({ queue: env.queue, storage: env.storage })
    await service.sync(folder, [item])
    await service.cancel(folder, item)
    await service.reanalyze(folder, item)
    expect(env.pending).toHaveLength(2)
  })
})
