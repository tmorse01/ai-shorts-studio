import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'

const fixture = fileURLToPath(new URL('./fixtures/media/sample.mp4', import.meta.url))

// The picker is replaced by the test; the rest of the handlers are the real ones.
function setup(picked: string[] = []) {
  const folder = mkdtempSync(join(tmpdir(), 'media-import-ipc-'))
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    system: { pickMediaFiles: async () => picked }
  })
  return createBridge((channel, input) => routeIpc(handlers, channel, input))
}

describe('media:stat round trip', () => {
  it('reports the name and size of a file and lists paths that are missing', async () => {
    const api = setup()
    const result = await api.invoke('media:stat', {
      paths: [fixture, join(tmpdir(), 'no-such-clip.mp4')]
    })
    expect(result).toEqual({
      ok: true,
      data: {
        files: [expect.objectContaining({ path: fixture, fileName: 'sample.mp4' })],
        missing: [join(tmpdir(), 'no-such-clip.mp4')]
      }
    })
    if (result.ok) expect(result.data.files[0]?.sizeBytes).toBeGreaterThan(0)
  })
})

describe('media:pick round trip', () => {
  it('returns the paths the user picked', async () => {
    const api = setup([fixture])
    expect(await api.invoke('media:pick', {})).toEqual({ ok: true, data: { paths: [fixture] } })
  })

  it('returns an empty list when the user cancels', async () => {
    const api = setup([])
    expect(await api.invoke('media:pick', {})).toEqual({ ok: true, data: { paths: [] } })
  })
})
