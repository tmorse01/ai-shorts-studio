import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'

function bridgeFor(folder: string) {
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(unavailableExecutors())
  })
  return createBridge((channel, input) => routeIpc(handlers, channel, input))
}

const frame = { shortId: 'short1', mediaId: 'vid1', sourceTimeMs: 2000 }

describe('media:poster:read round trip', () => {
  it('reports a cached poster frame as rendered', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'poster-read-'))
    const dir = join(folder, 'cache', 'posters', 'short1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'vid1-2000.jpg'), Buffer.from([1, 2, 3]))

    const result = await bridgeFor(folder).invoke('media:poster:read', {
      projectFolder: folder,
      frame
    })

    expect(result).toEqual({ ok: true, data: { rendered: true } })
  })

  it('reports an empty file as not rendered, and a missing frame too; rejects path-like ids', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'poster-read-miss-'))
    const dir = join(folder, 'cache', 'posters', 'short1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'vid1-2000.jpg'), Buffer.alloc(0))
    const api = bridgeFor(folder)

    const empty = await api.invoke('media:poster:read', { projectFolder: folder, frame })
    expect(empty).toEqual({ ok: true, data: { rendered: false } })

    const missing = await api.invoke('media:poster:read', {
      projectFolder: folder,
      frame: { ...frame, sourceTimeMs: 9000 }
    })
    expect(missing).toEqual({ ok: true, data: { rendered: false } })

    const traversal = await api.invoke('media:poster:read', {
      projectFolder: folder,
      frame: { ...frame, shortId: '../secret' }
    })
    expect(traversal.ok).toBe(false)
  })
})

describe('media:posters round trip', () => {
  it('counts a cached frame and queues a missing one', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'posters-queue-'))
    const dir = join(folder, 'cache', 'posters', 'short1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'vid1-2000.jpg'), Buffer.from([1]))

    const result = await bridgeFor(folder).invoke('media:posters', {
      projectFolder: folder,
      items: [
        { ...frame, path: 'clip.mp4', pathKind: 'relative' },
        {
          shortId: 'short2',
          mediaId: 'vid1',
          sourceTimeMs: 0,
          path: 'clip.mp4',
          pathKind: 'relative'
        }
      ]
    })

    expect(result).toEqual({ ok: true, data: { queued: 1, cached: 1 } })
  })
})
