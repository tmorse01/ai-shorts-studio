import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_STAGES,
  emptyAnalysisFile,
  newAnalysisRecord,
  type AnalysisFile,
  type AnalysisStage,
  type StageOutcome
} from '@shared/analysis/analysis'
import {
  AnalysisService,
  type AnalysisQueue,
  type AnalysisStorage,
  type MediaTarget
} from '../src/main/analysis/analysisService'
import { JobCancelledError } from '../src/main/jobs/jobQueue'
import { UserFacingError } from '../src/main/errors'

// A queue the test finishes by hand, so each stage's result is chosen by the test.
interface FakeJob {
  id: string
  path: string
  stage: AnalysisStage
  resolve: (outcome: StageOutcome) => void
  reject: (error: unknown) => void
}

function fakeQueue() {
  const jobs: FakeJob[] = []
  const cancelled: string[] = []
  const held: boolean[] = []
  const queue: AnalysisQueue = {
    enqueue: (_kind, path, extra) => {
      const id = `job-${jobs.length + 1}`
      let resolve!: (outcome: StageOutcome) => void
      let reject!: (error: unknown) => void
      const done = new Promise<StageOutcome>((res, rej) => {
        resolve = res
        reject = rej
      })
      done.catch(() => undefined)
      jobs.push({ id, path, stage: extra.stage, resolve, reject })
      return { id, done }
    },
    cancel: (id) => {
      const job = jobs.find((candidate) => candidate.id === id)
      if (!job) return false
      cancelled.push(id)
      job.reject(new JobCancelledError())
      return true
    },
    setHeld: (_kind, value) => {
      held.push(value)
    }
  }
  return { queue, jobs, cancelled, held }
}

function memoryStorage(initial: AnalysisFile = emptyAnalysisFile()) {
  let stored = initial
  const saved: AnalysisFile[] = []
  const storage: AnalysisStorage = {
    load: async () => stored,
    save: async (_folder, file) => {
      stored = file
      saved.push(file)
    }
  }
  return {
    storage,
    saved,
    get stored() {
      return stored
    }
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const media: MediaTarget[] = [{ id: 'clip-1', path: 'C:/footage/clip-1.mp4' }]
const folder = 'C:/projects/demo'

describe('AnalysisService', () => {
  it('creates a record and starts the transcript stage when analysis is on', async () => {
    const { queue, jobs } = fakeQueue()
    const service = new AnalysisService({ queue, storage: memoryStorage().storage })

    const file = await service.sync(folder, media)

    expect(jobs.map((job) => job.stage)).toEqual(['transcript'])
    expect(jobs[0].path).toBe('C:/footage/clip-1.mp4')
    expect(file.records['clip-1'].stages.transcript.status).toBe('running')
    expect(file.records['clip-1'].stages.shots.status).toBe('pending')
  })

  it('runs the stages in order, and a skipped stage counts as finished', async () => {
    const { queue, jobs } = fakeQueue()
    const store = memoryStorage()
    const service = new AnalysisService({ queue, storage: store.storage })
    await service.sync(folder, media)

    jobs[0].resolve('skipped')
    await flush()
    jobs[1].resolve('done')
    await flush()
    jobs[2].resolve('done')
    await flush()

    expect(jobs.map((job) => job.stage)).toEqual(ANALYSIS_STAGES)
    expect(store.stored.records['clip-1'].stages).toEqual({
      transcript: { status: 'skipped' },
      shots: { status: 'done' },
      vision: { status: 'done' }
    })
  })

  it('marks a failed stage with a plain message and stops the chain', async () => {
    const { queue, jobs } = fakeQueue()
    const store = memoryStorage()
    const service = new AnalysisService({ queue, storage: store.storage })
    await service.sync(folder, media)

    jobs[0].reject(new Error('model timed out'))
    await flush()

    expect(jobs).toHaveLength(1)
    expect(store.stored.records['clip-1'].stages.transcript).toEqual({
      status: 'failed',
      error: { message: 'Transcribing failed.', details: 'model timed out' }
    })
  })

  it('keeps a user-facing failure message as it is', async () => {
    const { queue, jobs } = fakeQueue()
    const service = new AnalysisService({ queue, storage: memoryStorage().storage })
    const file = await service.sync(folder, media)
    expect(file.records['clip-1'].stages.transcript.status).toBe('running')

    jobs[0].reject(new UserFacingError('Not enough disk space.', 'C: is full'))
    await flush()
    const after = await service.sync(folder, media)

    expect(after.records['clip-1'].stages.transcript.error).toEqual({
      message: 'Not enough disk space.',
      details: 'C: is full'
    })
  })

  it('queues nothing when the project does not analyze automatically', async () => {
    const { queue, jobs } = fakeQueue()
    const store = memoryStorage({ autoAnalyze: false, records: {} })
    const service = new AnalysisService({ queue, storage: store.storage })

    const file = await service.sync(folder, media)

    expect(jobs).toHaveLength(0)
    expect(file.records['clip-1'].stages.transcript.status).toBe('pending')
  })

  it('starts pending work when the toggle is turned on', async () => {
    const { queue, jobs } = fakeQueue()
    const store = memoryStorage({ autoAnalyze: false, records: {} })
    const service = new AnalysisService({ queue, storage: store.storage })
    await service.sync(folder, media)

    const file = await service.setAutoAnalyze(folder, true, media)

    expect(file.autoAnalyze).toBe(true)
    expect(jobs.map((job) => job.stage)).toEqual(['transcript'])
  })

  it('holds analysis while playback runs and resumes the cancelled stage after', async () => {
    const { queue, jobs, held } = fakeQueue()
    const store = memoryStorage()
    const service = new AnalysisService({ queue, storage: store.storage })
    await service.sync(folder, media)

    service.setPlaybackActive(true)
    jobs[0].reject(new JobCancelledError())
    await flush()

    expect(held).toEqual([true])
    expect(store.stored.records['clip-1'].stages.transcript.status).toBe('pending')
    expect(jobs).toHaveLength(1)

    service.setPlaybackActive(false)
    await flush()

    expect(held).toEqual([true, false])
    expect(jobs.map((job) => job.stage)).toEqual(['transcript', 'transcript'])
    expect(store.stored.records['clip-1'].stages.transcript.status).toBe('running')
  })

  it('goes back to pending on restart and runs again, instead of staying running', async () => {
    const record = newAnalysisRecord('clip-1')
    record.stages.transcript = { status: 'running' }
    const { queue, jobs } = fakeQueue()
    const service = new AnalysisService({
      queue,
      storage: memoryStorage({ autoAnalyze: true, records: { 'clip-1': record } }).storage
    })

    const file = await service.sync(folder, media)

    expect(jobs.map((job) => job.stage)).toEqual(['transcript'])
    expect(file.records['clip-1'].stages.transcript.status).toBe('running')
  })

  it('re-analyze starts a new version, cancels the old job, and ignores its late result', async () => {
    const { queue, jobs, cancelled } = fakeQueue()
    const store = memoryStorage()
    const service = new AnalysisService({ queue, storage: store.storage })
    await service.sync(folder, media)

    const file = await service.reanalyze(folder, media[0])
    jobs[0].resolve('done')
    await flush()

    expect(cancelled).toEqual(['job-1'])
    expect(file.records['clip-1'].version).toBe(2)
    expect(jobs.map((job) => job.stage)).toEqual(['transcript', 'transcript'])
    expect(store.stored.records['clip-1'].version).toBe(2)
    expect(store.stored.records['clip-1'].stages.transcript.status).toBe('running')
    expect(store.stored.records['clip-1'].stages.shots.status).toBe('pending')
  })

  it('reports every change to the renderer hook', async () => {
    const { queue } = fakeQueue()
    const changes: AnalysisFile[] = []
    const service = new AnalysisService({
      queue,
      storage: memoryStorage().storage,
      onChange: (change) => changes.push(change.file)
    })

    await service.sync(folder, media)

    expect(changes.length).toBeGreaterThan(0)
    expect(changes[changes.length - 1].records['clip-1'].stages.transcript.status).toBe('running')
  })
})
