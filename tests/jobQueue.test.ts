import { describe, expect, it } from 'vitest'
import {
  JobCancelledError,
  JobQueue,
  unavailableExecutors,
  type JobContext,
  type JobExecutors,
  type JobInput
} from '../src/main/jobs/jobQueue'
import type { JobKind } from '@shared/media/jobs'
import { UserFacingError } from '../src/main/errors'

// An executor the test finishes by hand, so the queue's state can be checked between steps.
interface Pending {
  path: string
  ctx: JobContext
  resolve: () => void
  reject: (error: unknown) => void
}

function manualExecutors() {
  const started: Pending[] = []
  const run = (input: JobInput, ctx: JobContext) =>
    new Promise<never>((resolve, reject) => {
      started.push({ path: input.path, ctx, resolve: resolve as () => void, reject })
    })
  const executors: JobExecutors = {
    probe: run as JobExecutors['probe'],
    thumbs: run as JobExecutors['thumbs'],
    filmstrip: run as JobExecutors['filmstrip'],
    proxy: run as JobExecutors['proxy']
  }
  return { executors, started }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('JobQueue', () => {
  it('runs at most the concurrency limit at once', async () => {
    const { executors, started } = manualExecutors()
    const queue = new JobQueue(executors, 2)
    queue.enqueue('thumbs', 'a.mp4')
    queue.enqueue('thumbs', 'b.mp4')
    queue.enqueue('thumbs', 'c.mp4')
    await tick()
    expect(started.map((s) => s.path)).toEqual(['a.mp4', 'b.mp4'])
    expect(queue.list().map((job) => job.status)).toEqual(['running', 'running', 'queued'])
  })

  it('starts probe jobs before queued thumbnail work', async () => {
    const { executors, started } = manualExecutors()
    const queue = new JobQueue(executors, 1)
    queue.enqueue('proxy', 'busy.mp4')
    await tick()
    queue.enqueue('thumbs', 'thumbs.mp4')
    queue.enqueue('probe', 'probe.mp4')
    started[0].resolve()
    await tick()
    expect(started.map((s) => s.path)).toEqual(['busy.mp4', 'probe.mp4'])
  })

  it('keeps first-in order within one priority', async () => {
    const { executors, started } = manualExecutors()
    const queue = new JobQueue(executors, 1)
    queue.enqueue('thumbs', 'first.mp4')
    queue.enqueue('thumbs', 'second.mp4')
    queue.enqueue('thumbs', 'third.mp4')
    for (let i = 0; i < 3; i += 1) {
      await tick()
      started[i].resolve()
    }
    await tick()
    expect(started.map((s) => s.path)).toEqual(['first.mp4', 'second.mp4', 'third.mp4'])
  })

  it('resolves with the executor result and marks the job done at progress 1', async () => {
    const queue = new JobQueue({
      ...unavailableExecutors(),
      probe: async () => ({
        durationSec: 3,
        video: null,
        audio: []
      })
    })
    const job = queue.enqueue('probe', 'clip.mp4')
    await expect(job.done).resolves.toEqual({ durationSec: 3, video: null, audio: [] })
    expect(queue.list()).toEqual([
      expect.objectContaining({ id: job.id, label: 'clip.mp4', status: 'done', progress: 1 })
    ])
  })

  it('reports progress as a fraction, clamped, and notifies listeners', async () => {
    const { executors, started } = manualExecutors()
    const queue = new JobQueue(executors)
    const seen: { status: string; progress: number }[] = []
    queue.subscribe((job) => seen.push({ status: job.status, progress: job.progress }))
    queue.enqueue('thumbs', 'clip.mp4')
    await tick()
    started[0].ctx.reportProgress(0.5)
    started[0].ctx.reportProgress(4)
    expect(queue.list()[0].progress).toBe(1)
    expect(seen).toContainEqual({ status: 'running', progress: 0.5 })
  })

  it('marks a failing job failed with a plain message and the technical detail', async () => {
    const queue = new JobQueue({
      ...unavailableExecutors(),
      thumbs: async () => {
        throw new Error('ENOSPC: disk full')
      }
    })
    const job = queue.enqueue('thumbs', 'clip.mp4')
    await expect(job.done).rejects.toThrow('ENOSPC')
    expect(queue.list()[0]).toMatchObject({
      status: 'failed',
      error: { message: 'Making thumbnails failed.', details: 'ENOSPC: disk full' }
    })
  })

  it('keeps the message of a UserFacingError as the failure message', async () => {
    const queue = new JobQueue({
      ...unavailableExecutors(),
      proxy: async () => {
        throw new UserFacingError('Not enough room for the proxy.', 'Free up some disk space.')
      }
    })
    queue.enqueue('proxy', 'clip.mp4')
    await tick()
    await tick()
    expect(queue.list()[0].error).toEqual({
      message: 'Not enough room for the proxy.',
      details: 'Free up some disk space.'
    })
  })

  it('cancels a queued job without running it', async () => {
    const { executors, started } = manualExecutors()
    const queue = new JobQueue(executors, 1)
    queue.enqueue('thumbs', 'running.mp4')
    const waiting = queue.enqueue('thumbs', 'waiting.mp4')
    await tick()
    expect(queue.cancel(waiting.id)).toBe(true)
    await expect(waiting.done).rejects.toBeInstanceOf(JobCancelledError)
    started[0].resolve()
    await tick()
    expect(started.map((s) => s.path)).toEqual(['running.mp4'])
    expect(queue.list().find((job) => job.id === waiting.id)?.status).toBe('cancelled')
  })

  it('aborts a running job and marks it cancelled, not failed', async () => {
    const seenSignal: AbortSignal[] = []
    const queue = new JobQueue({
      ...unavailableExecutors(),
      filmstrip: ({ path }, ctx) =>
        new Promise<void>((_resolve, reject) => {
          seenSignal.push(ctx.signal)
          ctx.signal.addEventListener('abort', () => reject(new Error(`stopped ${path}`)))
        })
    })
    const job = queue.enqueue('filmstrip', 'clip.mp4')
    await tick()
    expect(queue.cancel(job.id)).toBe(true)
    await expect(job.done).rejects.toBeInstanceOf(JobCancelledError)
    expect(seenSignal[0].aborted).toBe(true)
    expect(queue.list()[0].status).toBe('cancelled')
  })

  it('does not cancel a job that has already finished', async () => {
    const queue = new JobQueue(unavailableExecutors())
    const job = queue.enqueue('thumbs', 'clip.mp4')
    await expect(job.done).rejects.toThrow()
    expect(queue.cancel(job.id)).toBe(false)
    expect(queue.cancel('no-such-job')).toBe(false)
  })

  it('keeps finished jobs in the list for a reloaded renderer, up to a limit', async () => {
    const queue = new JobQueue({ ...unavailableExecutors(), thumbs: async () => undefined })
    for (let i = 0; i < 55; i += 1) {
      await queue.enqueue('thumbs', `clip-${i}.mp4`).done
    }
    const jobs = queue.list()
    expect(jobs).toHaveLength(50)
    expect(jobs[jobs.length - 1].label).toBe('clip-54.mp4')
  })

  it('fails every job with a clear message when no tools are wired up', async () => {
    const queue = new JobQueue(unavailableExecutors())
    const kinds: JobKind[] = ['probe', 'thumbs', 'filmstrip', 'proxy']
    for (const kind of kinds) {
      const job = queue.enqueue(kind, 'clip.mp4')
      await expect(job.done).rejects.toMatchObject({
        message: expect.stringContaining('not available')
      })
    }
  })
})
