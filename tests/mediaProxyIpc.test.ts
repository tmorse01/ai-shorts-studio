import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'

describe('media:proxy round trip', () => {
  it('queues a proxy for 4K footage and skips footage that needs none', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-proxy-ipc-'))
    const jobs = new JobQueue(unavailableExecutors())
    const handlers = createIpcHandlers({
      layoutFile: join(folder, 'ui-layout.json'),
      recentFile: join(folder, 'recent-projects.json'),
      jobs
    })
    const api = createBridge((channel, input) => routeIpc(handlers, channel, input))

    const result = await api.invoke('media:proxy', {
      projectFolder: folder,
      items: [
        {
          id: 'big',
          path: join(folder, 'big.mp4'),
          kind: 'video',
          sizeBytes: 100_000_000,
          durationSec: 60,
          video: { width: 3840, height: 2160, codec: 'h264' }
        },
        {
          id: 'small',
          path: join(folder, 'small.mp4'),
          kind: 'video',
          sizeBytes: 1000,
          durationSec: 60,
          video: { width: 1280, height: 720, codec: 'h264' }
        }
      ]
    })

    expect(result).toEqual({ ok: true, data: { queued: 1, cached: 0, skipped: 1 } })
    expect(jobs.list()).toEqual([expect.objectContaining({ kind: 'proxy' })])
  })
})
