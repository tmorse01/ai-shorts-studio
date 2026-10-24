import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, type JobExecutors } from '../src/main/jobs/jobQueue'
import { emptyAnalysisFile } from '@shared/analysis/analysis'

// Analysis jobs that never finish, so the test sees the records while stages are running.
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
  const folder = mkdtempSync(join(tmpdir(), 'analysis-ipc-'))
  const jobs = new JobQueue(pendingForever())
  const changes: string[] = []
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs,
    analysisStorage: {
      load: async () => emptyAnalysisFile(),
      save: async () => undefined
    },
    onAnalysisChanged: (change) => changes.push(change.projectFolder)
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { folder, api, jobs, changes }
}

describe('analysis IPC round trip', () => {
  it('syncs records and starts the first stage of each media item', async () => {
    const { folder, api, jobs, changes } = setup()

    const result = await api.invoke('analysis:sync', {
      projectFolder: folder,
      items: [{ id: 'clip-1', path: join(folder, 'clip-1.mp4') }]
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.file.autoAnalyze).toBe(true)
    expect(result.data.file.records['clip-1'].stages.transcript.status).toBe('running')
    expect(jobs.list()).toEqual([expect.objectContaining({ kind: 'analysis' })])
    expect(changes).toContain(folder)
  })

  it('turns the project toggle off without queuing new work', async () => {
    const { folder, api, jobs } = setup()
    const items = [{ id: 'clip-1', path: join(folder, 'clip-1.mp4') }]

    const result = await api.invoke('analysis:setAuto', {
      projectFolder: folder,
      enabled: false,
      items
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.file.autoAnalyze).toBe(false)
    expect(result.data.file.records['clip-1'].stages.transcript.status).toBe('pending')
    expect(jobs.list()).toHaveLength(0)
  })

  it('re-analyzes one item with a new version', async () => {
    const { folder, api } = setup()
    const item = { id: 'clip-1', path: join(folder, 'clip-1.mp4') }
    await api.invoke('analysis:setAuto', { projectFolder: folder, enabled: false, items: [item] })

    const result = await api.invoke('analysis:reanalyze', { projectFolder: folder, item })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.file.records['clip-1'].version).toBe(2)
    expect(result.data.file.records['clip-1'].stages.transcript.status).toBe('running')
  })

  it('accepts playback changes', async () => {
    const { api } = setup()
    expect(await api.invoke('analysis:playback', { playing: true })).toEqual({
      ok: true,
      data: { playing: true }
    })
  })

  it('rejects a sync request with no project folder', async () => {
    const { api } = setup()
    const result = await api.invoke('analysis:sync', { projectFolder: '', items: [] })
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })
})
