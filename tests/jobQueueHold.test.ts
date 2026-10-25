import { describe, expect, it } from 'vitest'
import {
  JobCancelledError,
  JobQueue,
  type JobContext,
  type JobExecutors,
  type JobInput
} from '../src/main/jobs/jobQueue'

// Analysis executor that records when it starts and only finishes when the test says so.
function analysisRunner() {
  const started: { ctx: JobContext; resolve: () => void }[] = []
  // Like the real executors, it gives up as soon as the job is aborted.
  const run = (_input: JobInput, ctx: JobContext) =>
    new Promise<never>((resolve, reject) => {
      ctx.signal.addEventListener('abort', () => reject(new Error('aborted')))
      started.push({ ctx, resolve: resolve as () => void })
    })
  const executors = {
    analysis: run as JobExecutors['analysis']
  } as unknown as JobExecutors
  return { executors, started }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('JobQueue hold', () => {
  it('keeps queued jobs of a held kind from starting until released', async () => {
    const { executors, started } = analysisRunner()
    const queue = new JobQueue(executors, 2)
    queue.setHeld('analysis', true)
    queue.enqueue('analysis', 'a.mp4', { stage: 'transcript' })
    await tick()
    expect(started).toHaveLength(0)
    expect(queue.list()[0].status).toBe('queued')

    queue.setHeld('analysis', false)
    await tick()
    expect(started).toHaveLength(1)
  })

  it('aborts running jobs of a held kind and rejects them as cancelled', async () => {
    const { executors, started } = analysisRunner()
    const queue = new JobQueue(executors, 2)
    const job = queue.enqueue('analysis', 'a.mp4', { stage: 'transcript' })
    await tick()

    queue.setHeld('analysis', true)

    expect(started[0].ctx.signal.aborted).toBe(true)
    await expect(job.done).rejects.toBeInstanceOf(JobCancelledError)
  })

  it('leaves other kinds running while analysis is held', async () => {
    const ran: string[] = []
    const queue = new JobQueue(
      {
        probe: async () => {
          ran.push('probe')
          return { durationSec: 1, video: null, audio: null } as never
        },
        thumbs: async () => undefined,
        filmstrip: async () => undefined,
        proxy: async () => undefined,
        poster: async () => undefined,
        analysis: () => new Promise<never>(() => undefined),
        export: async () => ({ outPath: 'clip.mp4' })
      } as JobExecutors,
      2
    )
    queue.setHeld('analysis', true)
    queue.enqueue('probe', 'clip.mp4')
    await tick()
    expect(ran).toEqual(['probe'])
  })
})

describe('JobQueue analysis priority', () => {
  it('runs analysis after probe, thumbnails and proxies that are waiting', async () => {
    const started: string[] = []
    const run = (kind: string) => (_input: JobInput, ctx: JobContext) =>
      new Promise<never>((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(new Error('aborted')))
        started.push(kind)
      })
    const queue = new JobQueue(
      {
        probe: run('probe'),
        thumbs: run('thumbs'),
        filmstrip: run('filmstrip'),
        proxy: run('proxy'),
        analysis: run('analysis')
      } as unknown as JobExecutors,
      1
    )
    queue.enqueue('proxy', 'busy.mp4')
    await tick()
    queue.enqueue('analysis', 'a.mp4', { stage: 'transcript' })
    queue.enqueue('proxy', 'waiting.mp4')
    queue.enqueue('thumbs', 'thumb.mp4')
    queue.enqueue('probe', 'probe.mp4')
    queue.cancel('job-1')
    await tick()

    expect(started).toEqual(['proxy', 'probe'])
  })
})
