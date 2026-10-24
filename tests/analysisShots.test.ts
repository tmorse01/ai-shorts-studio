import { describe, expect, it } from 'vitest'
import { emptyAnalysisFile, type AnalysisFile, type StageResult } from '@shared/analysis/analysis'
import { AnalysisService, type AnalysisQueue } from '../src/main/analysis/analysisService'
import { analysisFramesDir } from '../src/main/analysis/frameCache'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// Records each enqueued job. The test finishes each job by hand with the result it wants.
function fakeQueue() {
  const jobs: {
    stage: string
    outDir?: string
    resolve: (result: StageResult) => void
  }[] = []
  const queue: AnalysisQueue = {
    enqueue: (_kind, _path, extra) => {
      let resolve!: (result: StageResult) => void
      const done = new Promise<StageResult>((res) => {
        resolve = res
      })
      jobs.push({ stage: extra.stage, outDir: extra.outDir, resolve })
      return { id: `job-${jobs.length}`, done }
    },
    cancel: () => false,
    setHeld: () => undefined
  }
  return { queue, jobs }
}

describe('analysis service with the shots stage', () => {
  it('sends the frame folder with each job and keeps the shot ranges on the record', async () => {
    const { queue, jobs } = fakeQueue()
    let latest: AnalysisFile = emptyAnalysisFile()
    const service = new AnalysisService({
      queue,
      storage: {
        load: async () => emptyAnalysisFile(),
        save: async () => undefined
      },
      onChange: ({ file }) => {
        latest = file
      }
    })

    const folder = 'G:/Projects/demo'
    await service.sync(folder, [{ id: 'clip-1', path: 'clip.mp4' }])
    jobs[0].resolve('done')
    await tick()

    expect(jobs[1].stage).toBe('shots')
    expect(jobs[1].outDir).toBe(analysisFramesDir(folder, 'clip-1'))

    jobs[1].resolve({ outcome: 'done', shots: [{ startSec: 0, endSec: 4 }] })
    await tick()

    const record = latest.records['clip-1']
    expect(record.stages.shots).toEqual({ status: 'done' })
    expect(record.shots).toEqual([{ startSec: 0, endSec: 4 }])
  })
})
