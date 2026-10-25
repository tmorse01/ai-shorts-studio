import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'

function bridgeWith(
  saveSrtFile: (file: { suggestedName: string; text: string }) => Promise<string | null>
) {
  const folder = mkdtempSync(join(tmpdir(), 'srt-export-'))
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(unavailableExecutors()),
    system: { saveSrtFile }
  })
  return createBridge((channel, input) => routeIpc(handlers, channel, input))
}

describe('captions:exportSrt round trip', () => {
  it('passes the name and text to the save dialog and returns the saved path', async () => {
    const save = vi.fn(async () => 'C:/Videos/Launch.srt')
    const result = await bridgeWith(save).invoke('captions:exportSrt', {
      suggestedName: 'Launch.srt',
      srt: '1\n00:00:00,000 --> 00:00:01,000\nHi\n'
    })

    expect(save).toHaveBeenCalledWith({
      suggestedName: 'Launch.srt',
      text: '1\n00:00:00,000 --> 00:00:01,000\nHi\n'
    })
    expect(result).toEqual({ ok: true, data: { savedPath: 'C:/Videos/Launch.srt' } })
  })

  it('returns a null path when the user cancels', async () => {
    const result = await bridgeWith(async () => null).invoke('captions:exportSrt', {
      suggestedName: 'Launch.srt',
      srt: ''
    })
    expect(result).toEqual({ ok: true, data: { savedPath: null } })
  })

  it('rejects a file name that holds a folder, without opening the dialog', async () => {
    const save = vi.fn(async () => null)
    const result = await bridgeWith(save).invoke('captions:exportSrt', {
      suggestedName: '../secret.srt',
      srt: ''
    })
    expect(result.ok).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})
