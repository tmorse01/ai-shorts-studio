import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'

describe('media:thumbs round trip', () => {
  it('queues the missing thumbnails and reports the counts', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-thumbs-ipc-'))
    const jobs = new JobQueue(unavailableExecutors())
    const handlers = createIpcHandlers({
      layoutFile: join(folder, 'ui-layout.json'),
      recentFile: join(folder, 'recent-projects.json'),
      jobs
    })
    const api = createBridge((channel, input) => routeIpc(handlers, channel, input))

    const result = await api.invoke('media:thumbs', {
      projectFolder: folder,
      items: [{ id: 'img1', path: join(folder, 'still.png'), kind: 'image' }]
    })

    expect(result).toEqual({ ok: true, data: { queued: 1, cached: 0, waiting: 0 } })
    expect(jobs.list()).toEqual([expect.objectContaining({ kind: 'thumbs' })])
  })
})
