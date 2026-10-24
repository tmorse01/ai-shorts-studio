import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyAnalysisFile } from '@shared/analysis/analysis'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { visionResultPath } from '../src/main/analysis/analysisFile'
import { saveVisionResult } from '../src/main/ai/visionResultFile'

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'vision-ipc-'))
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    analysisStorage: {
      load: async () => emptyAnalysisFile(),
      save: async () => undefined
    }
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { folder, api }
}

describe('analysis:vision:read round trip', () => {
  it('returns the described shots of a media item', async () => {
    const { folder, api } = setup()
    await saveVisionResult(visionResultPath(folder, 'clip-1'), {
      model: 'claude-haiku-5-5',
      shots: [
        {
          shotIndex: 0,
          description: 'A lighthouse at dusk',
          tags: ['night', 'coast'],
          frames: [{ name: 'shot-0000-0.jpg', mtimeMs: 1 }]
        }
      ]
    })

    const result = await api.invoke('analysis:vision:read', {
      projectFolder: folder,
      mediaId: 'clip-1'
    })

    expect(result).toEqual({
      ok: true,
      data: {
        shots: [{ shotIndex: 0, description: 'A lighthouse at dusk', tags: ['night', 'coast'] }]
      }
    })
  })

  it('returns no shots when the item has no vision results yet', async () => {
    const { folder, api } = setup()

    const result = await api.invoke('analysis:vision:read', {
      projectFolder: folder,
      mediaId: 'clip-2'
    })

    expect(result).toEqual({ ok: true, data: { shots: [] } })
  })

  it('rejects a media id that could escape the vision folder', async () => {
    const { folder, api } = setup()

    const result = await api.invoke('analysis:vision:read', {
      projectFolder: folder,
      mediaId: '../secrets'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })
})
