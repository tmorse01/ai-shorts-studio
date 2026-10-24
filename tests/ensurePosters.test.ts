import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureShortPosters, type PosterQueue } from '../src/main/media/ensurePosters'
import { posterFrameArgs, posterFramePath } from '../src/main/media/posters'

const folder = 'G:/Projects/demo'

// Records queued poster jobs. Each job's `done` promise is held so the test can settle it.
function setup(cached: string[] = []) {
  const queued: { path: string; extra: { outPath: string; sourceTimeSec: number } }[] = []
  const settlers: (() => void)[] = []
  const queue: PosterQueue = {
    enqueue: (_kind, path, extra) => {
      queued.push({ path, extra })
      return {
        done: new Promise<unknown>((resolve) => {
          settlers.push(() => resolve(undefined))
        })
      }
    }
  }
  const present = new Set(cached)
  const fileExists = async (file: string) => present.has(file)
  return { queued, queue, fileExists, settlers }
}

const frame = {
  shortId: 'short-1',
  mediaId: 'vid1',
  sourceTimeMs: 2500,
  path: 'footage/clip.mp4',
  pathKind: 'relative' as const
}

describe('ensureShortPosters', () => {
  it('queues a poster job for a frame with no cache, reading the footage it is taken from', async () => {
    const { queued, queue, fileExists } = setup()
    const counts = await ensureShortPosters(folder, [frame], queue, new Set(), fileExists)

    expect(counts).toEqual({ queued: 1, cached: 0 })
    expect(queued).toEqual([
      {
        path: join(folder, 'footage/clip.mp4'),
        extra: { outPath: posterFramePath(folder, frame), sourceTimeSec: 2.5 }
      }
    ])
  })

  it('leaves a cached frame alone', async () => {
    const { queued, queue, fileExists } = setup([posterFramePath(folder, frame)])
    const counts = await ensureShortPosters(folder, [frame], queue, new Set(), fileExists)

    expect(counts).toEqual({ queued: 0, cached: 1 })
    expect(queued).toEqual([])
  })

  it('does not queue a frame twice while its job is still running', async () => {
    const pending = new Set<string>()
    const first = setup()
    await ensureShortPosters(folder, [frame], first.queue, pending, first.fileExists)

    const second = setup()
    const counts = await ensureShortPosters(
      folder,
      [frame],
      second.queue,
      pending,
      second.fileExists
    )
    expect(counts.queued).toBe(0)
    expect(second.queued).toEqual([])

    // Once the job settles, a later request may queue it again, for example after a failure.
    first.settlers[0]()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pending.size).toBe(0)
  })
})

describe('posterFrameArgs', () => {
  it('grabs one scaled frame at the given time', () => {
    expect(posterFrameArgs('in.mp4', 'out.jpg', 2.5)).toEqual([
      '-y',
      '-v',
      'error',
      '-ss',
      '2.500',
      '-i',
      'in.mp4',
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-2',
      'out.jpg'
    ])
  })
})
