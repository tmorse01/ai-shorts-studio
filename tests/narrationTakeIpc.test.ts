import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, type JobExecutors } from '../src/main/jobs/jobQueue'

function pendingForever(): JobExecutors {
  const never = () => new Promise<never>(() => undefined)
  return {
    probe: never,
    thumbs: never,
    filmstrip: never,
    proxy: never,
    analysis: never
  } as unknown as JobExecutors
}

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'take-ipc-'))
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(pendingForever())
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { folder, api }
}

describe('narration take IPC round trip', () => {
  it('narration:take:save writes the WAV into the project media folder and returns its ref', async () => {
    const { folder, api } = setup()
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])

    const result = await api.invoke('narration:take:save', { projectFolder: folder, bytes })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toMatchObject({ pathKind: 'relative', sizeBytes: bytes.byteLength })
    expect(result.data.path).toMatch(/^media\/narration\/take-.*\.wav$/)
    const onDisk = join(folder, ...result.data.path.split('/'))
    expect(existsSync(onDisk)).toBe(true)
    expect(Array.from(readFileSync(onDisk))).toEqual(Array.from(bytes))
  })

  it('narration:take:save rejects an empty take', async () => {
    const { folder, api } = setup()
    expect(
      await api.invoke('narration:take:save', { projectFolder: folder, bytes: new Uint8Array(0) })
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })
})
