import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureMediaThumbs, type ThumbQueue } from '../src/main/media/ensureThumbs'
import { thumbCacheDir } from '../src/main/media/thumbnails'

const folder = 'G:/Projects/demo'

// Records queued jobs; the cache is a set of files that "exist".
function setup(cached: string[] = []) {
  const queued: { kind: string; path: string; extra: unknown }[] = []
  const queue: ThumbQueue = {
    enqueue: (kind, path, extra) => {
      queued.push({ kind, path, extra })
      return undefined
    }
  }
  const present = new Set(cached)
  const fileExists = async (file: string) => present.has(file)
  return { queued, queue, fileExists }
}

describe('ensureMediaThumbs', () => {
  it('queues a poster and a filmstrip for a video with no cache', async () => {
    const { queued, queue, fileExists } = setup()
    const counts = await ensureMediaThumbs(
      folder,
      [{ id: 'v1', path: 'clip.mp4', kind: 'video', durationSec: 30 }],
      queue,
      fileExists
    )
    const outDir = thumbCacheDir(folder, 'v1')
    expect(counts).toEqual({ queued: 2, cached: 0, waiting: 0 })
    expect(queued).toEqual([
      { kind: 'thumbs', path: 'clip.mp4', extra: { outDir, mediaKind: 'video' } },
      { kind: 'filmstrip', path: 'clip.mp4', extra: { outDir, durationSec: 30 } }
    ])
  })

  it('waits for the duration before queueing a video filmstrip', async () => {
    const { queued, queue, fileExists } = setup()
    const counts = await ensureMediaThumbs(
      folder,
      [{ id: 'v1', path: 'clip.mp4', kind: 'video' }],
      queue,
      fileExists
    )
    expect(counts).toEqual({ queued: 1, cached: 0, waiting: 1 })
    expect(queued.map((job) => job.kind)).toEqual(['thumbs'])
  })

  it('leaves items alone when their thumbnails are already cached', async () => {
    const outDir = thumbCacheDir(folder, 'img1')
    const { queued, queue, fileExists } = setup([join(outDir, 'thumb.jpg')])
    const counts = await ensureMediaThumbs(
      folder,
      [{ id: 'img1', path: 'still.png', kind: 'image' }],
      queue,
      fileExists
    )
    expect(counts).toEqual({ queued: 0, cached: 1, waiting: 0 })
    expect(queued).toEqual([])
  })

  it('rebuilds the cache when it has been cleared', async () => {
    const { queued, queue, fileExists } = setup()
    const counts = await ensureMediaThumbs(
      folder,
      [{ id: 'a1', path: 'voice.wav', kind: 'audio' }],
      queue,
      fileExists
    )
    expect(counts.queued).toBe(1)
    expect(queued[0]).toMatchObject({ kind: 'thumbs', extra: { mediaKind: 'audio' } })
  })
})
