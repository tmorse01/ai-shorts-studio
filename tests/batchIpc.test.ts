import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors } from '../src/main/jobs/jobQueue'
import { createProject, readProjectBatch } from '../src/main/project/projectStorage'

describe('batch IPC round trip', () => {
  it('runs a batch, saves it to the project, and answers cancel and retry', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'batch-ipc-'))
    await createProject(folder, 'Batch test')
    // The analysis stage is faked: each item finishes at once.
    const jobs = new JobQueue({
      ...unavailableExecutors(),
      analysis: async () => ({ outcome: 'done' })
    })
    const handlers = createIpcHandlers({
      layoutFile: join(folder, 'ui-layout.json'),
      recentFile: join(folder, 'recent-projects.json'),
      jobs
    })
    const api = createBridge((channel, input) => routeIpc(handlers, channel, input))

    const started = await api.invoke('batch:run', {
      projectFolder: folder,
      stage: 'shots',
      items: [
        { id: 'clip-1', path: join(folder, 'one.mp4') },
        { id: 'clip-2', path: join(folder, 'two.mp4') }
      ]
    })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const batchId = started.data.batch.id

    await waitFor(async () => {
      try {
        return (await readProjectBatch(folder, batchId))?.status === 'done'
      } catch {
        // Reads can race the save's rename on Windows. The next poll sees the file.
        return false
      }
    })
    const saved = await readProjectBatch(folder, batchId)
    expect(saved?.items.map((item) => item.status)).toEqual(['done', 'done'])

    const cancelled = await api.invoke('batch:cancel', {
      projectFolder: folder,
      batchId,
      itemId: 'clip-1'
    })
    expect(cancelled).toMatchObject({ ok: true, data: { cancelled: false } })

    const retried = await api.invoke('batch:retry', {
      projectFolder: folder,
      batchId,
      items: [{ id: 'clip-1', path: join(folder, 'one.mp4') }]
    })
    expect(retried).toMatchObject({ ok: true, data: { retried: [] } })
  }, 20_000)

  it('refuses a batch that lists one media item twice', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'batch-ipc-dup-'))
    await createProject(folder, 'Batch test')
    const handlers = createIpcHandlers({
      layoutFile: join(folder, 'ui-layout.json'),
      recentFile: join(folder, 'recent-projects.json'),
      jobs: new JobQueue(unavailableExecutors())
    })
    const api = createBridge((channel, input) => routeIpc(handlers, channel, input))

    const result = await api.invoke('batch:run', {
      projectFolder: folder,
      stage: 'transcript',
      items: [
        { id: 'clip-1', path: join(folder, 'one.mp4') },
        { id: 'clip-1', path: join(folder, 'one.mp4') }
      ]
    })
    expect(result.ok).toBe(false)
  })
})

// Polls until the check passes, so the test does not depend on queue timing.
async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('timed out waiting for the batch to finish')
}
