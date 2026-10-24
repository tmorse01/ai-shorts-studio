import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'
import { allowedSourceFile } from '../src/main/media/sourceProtocol'
import type { MediaRef } from '../src/shared/project/schema'

function setup(folder: string) {
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(unavailableExecutors())
  })
  return createBridge((channel, input) => routeIpc(handlers, channel, input))
}

function videoRef(overrides: Partial<MediaRef>): MediaRef {
  return {
    id: 'clip1',
    path: 'clip1.mp4',
    pathKind: 'relative',
    fileName: 'clip1.mp4',
    sizeBytes: 10,
    kind: 'video',
    ...overrides
  }
}

describe('media:source round trip', () => {
  it('plays the original when no proxy is chosen, and allows that file', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-source-ipc-'))
    writeFileSync(join(folder, 'clip1.mp4'), 'x')
    const api = setup(folder)

    const result = await api.invoke('media:source', {
      projectFolder: folder,
      media: videoRef({})
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.proxy).toBe(false)
    expect(allowedSourceFile(result.data.url)).toBe(join(folder, 'clip1.mp4'))
  })

  it('plays the proxy when it is chosen and on disk', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-source-proxy-'))
    writeFileSync(join(folder, 'clip1.mp4'), 'x')
    const proxyDir = join(folder, 'cache', 'proxies')
    mkdirSync(proxyDir, { recursive: true })
    writeFileSync(join(proxyDir, 'clip1.mp4'), 'p')
    const api = setup(folder)

    const result = await api.invoke('media:source', {
      projectFolder: folder,
      media: videoRef({ useProxy: true })
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.proxy).toBe(true)
    expect(allowedSourceFile(result.data.url)).toBe(join(proxyDir, 'clip1.mp4'))
  })

  it('refuses an offline file with a plain-language message', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'media-source-offline-'))
    const api = setup(folder)

    const result = await api.invoke('media:source', {
      projectFolder: folder,
      media: videoRef({ path: 'missing.mp4', fileName: 'missing.mp4' })
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('This file is offline. Relink it to play it.')
  })
})
