import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'

function bridgeFor(folder: string) {
  const jobs = new JobQueue(unavailableExecutors())
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs
  })
  return createBridge((channel, input) => routeIpc(handlers, channel, input))
}

describe('media:thumb:read round trip', () => {
  it('returns a data URL for a cached waveform', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-thumb-read-'))
    const cacheDir = join(folder, 'cache', 'thumbs', 'aud1')
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(join(cacheDir, 'waveform.png'), Buffer.from([1, 2, 3]))

    const result = await bridgeFor(folder).invoke('media:thumb:read', {
      projectFolder: folder,
      mediaId: 'aud1',
      file: 'waveform.png'
    })

    expect(result).toEqual({
      ok: true,
      data: { dataUrl: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}` }
    })
  })

  it('returns null when the cache has no such file, and rejects a path-like media id', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-thumb-read-miss-'))
    const api = bridgeFor(folder)

    const missing = await api.invoke('media:thumb:read', {
      projectFolder: folder,
      mediaId: 'vid1',
      file: 'filmstrip.jpg'
    })
    expect(missing).toEqual({ ok: true, data: { dataUrl: null } })

    const traversal = await api.invoke('media:thumb:read', {
      projectFolder: folder,
      mediaId: '../secret',
      file: 'poster.jpg'
    })
    expect(traversal.ok).toBe(false)
  })
})
