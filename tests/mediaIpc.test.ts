import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { JobQueue, unavailableExecutors, type JobExecutors } from '../src/main/jobs/jobQueue'
import type { ProbeResult } from '@shared/media/probe'

const probed: ProbeResult = {
  durationSec: 12.5,
  video: { width: 1920, height: 1080, fps: 30, codec: 'h264', rotation: 90 },
  audio: [{ index: 1, codec: 'aac', channels: 2, sampleRate: 48000 }]
}

// A queue whose probe job is replaced by the test, so the channel round trip needs no FFmpeg.
function setup(probe: JobExecutors['probe'] = async () => probed) {
  const jobs = new JobQueue({ ...unavailableExecutors(), probe })
  const layoutFile = join(mkdtempSync(join(tmpdir(), 'media-ipc-')), 'ui-layout.json')
  const handlers = createIpcHandlers({ layoutFile, jobs })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { api, jobs }
}

describe('media:probe round trip', () => {
  it('returns the validated probe result for a file', async () => {
    const { api, jobs } = setup()
    const result = await api.invoke('media:probe', { path: 'G:\\Footage\\clip.mp4' })
    expect(result).toEqual({ ok: true, data: probed })
    expect(jobs.list()).toEqual([
      expect.objectContaining({ kind: 'probe', label: 'clip.mp4', status: 'done' })
    ])
  })

  it('fails with a typed error when the probe job fails', async () => {
    const { api } = setup(async () => {
      throw new Error('No such file')
    })
    const result = await api.invoke('media:probe', { path: 'missing.mp4' })
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'HANDLER_FAILED',
        message: 'media:probe failed.',
        details: 'No such file'
      }
    })
  })

  it('rejects an empty path before any job starts', async () => {
    const { api, jobs } = setup()
    const result = await api.invoke('media:probe', { path: '   ' })
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
    expect(jobs.list()).toEqual([])
  })
})

describe('media:job:list round trip', () => {
  it('lists the jobs the queue holds', async () => {
    const { api, jobs } = setup()
    await api.invoke('media:probe', { path: 'a.mp4' })
    expect(await api.invoke('media:job:list', {})).toEqual({
      ok: true,
      data: { jobs: jobs.list() }
    })
  })
})

describe('media:job:cancel round trip', () => {
  it('reports false for a job that is unknown or already finished', async () => {
    const { api } = setup()
    expect(await api.invoke('media:job:cancel', { jobId: 'job-404' })).toEqual({
      ok: true,
      data: { cancelled: false }
    })
  })

  it('cancels a probe job that is still running', async () => {
    const { api, jobs } = setup(
      ({ path }, { signal }) =>
        new Promise<ProbeResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error(`stopped ${path}`)))
        })
    )
    const pending = api.invoke('media:probe', { path: 'slow.mp4' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const [job] = jobs.list()
    expect(await api.invoke('media:job:cancel', { jobId: job.id })).toEqual({
      ok: true,
      data: { cancelled: true }
    })
    expect(jobs.list()[0].status).toBe('cancelled')
    // The renderer's call ends with a typed failure, not a hang.
    expect(await pending).toMatchObject({ ok: false })
  })
})
