import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { MediaSourceRegistry } from '../src/main/media/mediaSources'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'
import { mediaUrl } from '@shared/media/previewSource'
import { serveMediaRequest } from '../src/main/media/mediaProtocol'

describe('media:sources round trip', () => {
  it('reports online originals and ready proxies, and lets the protocol serve them', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-sources-ipc-'))
    mkdirSync(join(folder, 'cache', 'proxies'), { recursive: true })
    writeFileSync(join(folder, 'clip.mp4'), 'original-bytes')
    writeFileSync(join(folder, 'cache', 'proxies', 'clip1.mp4'), 'proxy-bytes')

    const registry = new MediaSourceRegistry()
    const handlers = createIpcHandlers({
      layoutFile: join(folder, 'ui-layout.json'),
      recentFile: join(folder, 'recent-projects.json'),
      jobs: new JobQueue(unavailableExecutors()),
      mediaSources: registry
    })
    const api = createBridge((channel, input) => routeIpc(handlers, channel, input))

    const result = await api.invoke('media:sources', {
      projectFolder: folder,
      media: [
        { id: 'clip1', path: 'clip.mp4', pathKind: 'relative' },
        { id: 'gone1', path: 'missing.mp4', pathKind: 'relative' }
      ]
    })

    expect(result).toEqual({
      ok: true,
      data: {
        sources: [
          { id: 'clip1', online: true, hasProxy: true },
          { id: 'gone1', online: false, hasProxy: false }
        ]
      }
    })

    const proxy = await serveMediaRequest(new Request(mediaUrl('clip1', 'proxy')), registry)
    expect(await proxy.text()).toBe('proxy-bytes')
    const gone = await serveMediaRequest(new Request(mediaUrl('gone1', 'original')), registry)
    expect(gone.status).toBe(404)
  })

  it('rejects a media id that is not a plain token', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-sources-bad-'))
    const handlers = createIpcHandlers({
      layoutFile: join(folder, 'ui-layout.json'),
      recentFile: join(folder, 'recent-projects.json')
    })
    const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
    const result = await api.invoke('media:sources', {
      projectFolder: folder,
      media: [{ id: '../escape', path: 'x.mp4', pathKind: 'relative' }]
    })
    expect(result.ok).toBe(false)
  })
})
