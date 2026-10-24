import { describe, expect, it } from 'vitest'
import {
  emptyAnalysisFile,
  newAnalysisRecord,
  visionAwaitingShotCount,
  withStageStatus,
  type AnalysisFile,
  type AnalysisStage,
  type StageResult
} from '@shared/analysis/analysis'
import type { VisionAvailability } from '@shared/ai/aiSettings'
import {
  AnalysisService,
  type AnalysisQueue,
  type MediaTarget
} from '../src/main/analysis/analysisService'

const folder = '/projects/demo'
const media: MediaTarget[] = [{ id: 'clip-1', path: '/projects/demo/clip-1.mp4' }]
const TWO_SHOTS = [
  { startSec: 0, endSec: 4 },
  { startSec: 4, endSec: 9 }
]

interface FakeJob {
  stage: AnalysisStage
  resolve: (result: StageResult) => void
}

// A queue the test finishes by hand. It records which stages were actually started.
function fakeQueue() {
  const jobs: FakeJob[] = []
  const queue: AnalysisQueue = {
    enqueue: (_kind, _path, extra) => {
      let resolve!: (result: StageResult) => void
      const done = new Promise<StageResult>((res) => {
        resolve = res
      })
      jobs.push({ stage: extra.stage, resolve })
      return { id: `job-${jobs.length}`, done }
    },
    cancel: () => false,
    setHeld: () => undefined
  }
  return { queue, jobs, started: () => jobs.map((job) => job.stage) }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(availability: VisionAvailability) {
  const fake = fakeQueue()
  let stored: AnalysisFile = emptyAnalysisFile()
  const service = new AnalysisService({
    queue: fake.queue,
    storage: {
      load: async () => stored,
      save: async (_folder, file) => {
        stored = file
      }
    },
    vision: { availability: () => availability }
  })
  return { service, ...fake, file: () => stored }
}

// Runs transcript and shots to completion, so the next stage is vision.
async function finishBeforeVision(harness: ReturnType<typeof setup>): Promise<void> {
  await harness.service.sync(folder, media)
  harness.jobs[0].resolve('done')
  await flush()
  harness.jobs[1].resolve({ outcome: 'done', shots: TWO_SHOTS })
  await flush()
}

describe('vision stage gate', () => {
  it('skips vision without an API key, and never queues it', async () => {
    const harness = setup('no-key')
    await finishBeforeVision(harness)

    expect(harness.started()).toEqual(['transcript', 'shots'])
    expect(harness.file().records['clip-1'].stages.vision).toEqual({ status: 'skipped' })
  })

  it('skips vision once the monthly cap is reached', async () => {
    const harness = setup('capped')
    await finishBeforeVision(harness)

    expect(harness.started()).toEqual(['transcript', 'shots'])
    expect(harness.file().records['clip-1'].stages.vision).toEqual({ status: 'skipped' })
  })

  it('waits for the cost answer before the first vision pass', async () => {
    const harness = setup('ready')
    await finishBeforeVision(harness)

    expect(harness.started()).toEqual(['transcript', 'shots'])
    expect(harness.file().records['clip-1'].stages.vision).toEqual({ status: 'pending' })
    expect(visionAwaitingShotCount(harness.file())).toBe(2)
  })

  it('starts the waiting vision stage when the user confirms', async () => {
    const harness = setup('ready')
    await finishBeforeVision(harness)

    await harness.service.setVisionDecision(folder, 'confirmed')
    await flush()

    expect(harness.started()).toEqual(['transcript', 'shots', 'vision'])
    expect(harness.file().visionDecision).toBe('confirmed')
    expect(visionAwaitingShotCount(harness.file())).toBe(0)
  })

  it('skips the waiting vision stage when the user skips vision', async () => {
    const harness = setup('ready')
    await finishBeforeVision(harness)

    await harness.service.setVisionDecision(folder, 'skipped')
    await flush()

    expect(harness.started()).toEqual(['transcript', 'shots'])
    expect(harness.file().records['clip-1'].stages.vision).toEqual({ status: 'skipped' })
  })

  it('does not ask again once the project has an answer', async () => {
    const harness = setup('ready')
    await harness.service.setVisionDecision(folder, 'skipped')
    await finishBeforeVision(harness)

    expect(harness.file().visionDecision).toBe('skipped')
    expect(visionAwaitingShotCount(harness.file())).toBe(0)
  })
})

describe('visionAwaitingShotCount', () => {
  it('counts nothing while an earlier stage is still running', () => {
    let record = newAnalysisRecord('clip-1')
    record = withStageStatus(record, 'transcript', 'done')
    record = withStageStatus(record, 'shots', 'running')
    const file: AnalysisFile = {
      autoAnalyze: true,
      records: { 'clip-1': { ...record, shots: TWO_SHOTS } }
    }
    expect(visionAwaitingShotCount(file)).toBe(0)
  })

  it('waits until every item has finished its earlier stages', () => {
    let done = newAnalysisRecord('a')
    done = withStageStatus(done, 'transcript', 'skipped')
    done = withStageStatus(done, 'shots', 'done')
    const file: AnalysisFile = {
      autoAnalyze: true,
      records: { a: { ...done, shots: [{ startSec: 0, endSec: 3 }] }, b: newAnalysisRecord('b') }
    }
    // Item b has not reached its shots stage yet, so the answer is not asked for yet.
    expect(visionAwaitingShotCount(file)).toBe(0)
  })
})
