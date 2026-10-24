import { mkdtempSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureMediaProxies, type ProxyItem } from '../src/main/media/ensureProxies'
import { makeProxy } from '../src/main/media/proxies'

const folder = 'G:/Projects/demo'
const bigItem: ProxyItem = {
  id: 'v1',
  path: 'G:/Footage/4k.mp4',
  kind: 'video',
  sizeBytes: 100_000_000,
  durationSec: 60,
  video: { width: 3840, height: 2160, codec: 'h264' }
}

function setup(present: string[] = []) {
  const queued: { path: string; extra: unknown }[] = []
  const queue = {
    enqueue: (_kind: 'proxy', path: string, extra: unknown) => {
      queued.push({ path, extra })
      return undefined
    }
  }
  const existing = new Set(present)
  return { queued, queue, fileExists: async (file: string) => existing.has(file) }
}

describe('ensureMediaProxies', () => {
  it('queues a proxy for 4K footage with no proxy on disk', async () => {
    const { queued, queue, fileExists } = setup()
    const counts = await ensureMediaProxies(folder, [bigItem], queue, fileExists)
    expect(counts).toEqual({ queued: 1, cached: 0, skipped: 0 })
    expect(queued[0]).toMatchObject({
      path: bigItem.path,
      extra: { durationSec: 60, outPath: join(folder, 'cache', 'proxies', 'v1.mp4') }
    })
  })

  it('skips footage that does not need a proxy', async () => {
    const { queued, queue, fileExists } = setup()
    const hd = { ...bigItem, video: { width: 1920, height: 1080, codec: 'h264' }, sizeBytes: 1000 }
    expect(await ensureMediaProxies(folder, [hd], queue, fileExists)).toEqual({
      queued: 0,
      cached: 0,
      skipped: 1
    })
    expect(queued).toEqual([])
  })

  it('leaves an existing proxy alone', async () => {
    const outPath = join(folder, 'cache', 'proxies', 'v1.mp4')
    const { queued, queue, fileExists } = setup([outPath])
    expect(await ensureMediaProxies(folder, [bigItem], queue, fileExists)).toEqual({
      queued: 0,
      cached: 1,
      skipped: 0
    })
    expect(queued).toEqual([])
  })
})

describe('makeProxy failure', () => {
  it('leaves neither the proxy nor its partial file when FFmpeg cannot run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'proxy-fail-'))
    const outPath = join(dir, 'v1.mp4')
    await expect(
      makeProxy('missing.mov', outPath, 10, {
        ffmpeg: join(dir, 'no-such-ffmpeg'),
        onProgress: () => undefined
      })
    ).rejects.toThrow()
    await expect(access(outPath)).rejects.toThrow()
    await expect(access(`${outPath}.partial`)).rejects.toThrow()
  })
})
