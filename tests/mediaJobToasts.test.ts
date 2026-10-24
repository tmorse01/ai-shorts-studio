import { describe, expect, it, vi } from 'vitest'
import type { JobSnapshot } from '@shared/media/jobs'
import type { RendererApi } from '@shared/ipc'
import {
  toastInputForFailedJob,
  watchMediaJobs
} from '../src/renderer/features/media/mediaJobToasts'

const failed: JobSnapshot = {
  id: 'job-1',
  kind: 'probe',
  label: 'interview.mp4',
  status: 'failed',
  progress: 0,
  error: { message: 'Reading media info failed.', details: 'No such file' }
}

describe('toastInputForFailedJob', () => {
  it('puts the plain message in the title and the technical detail in the details view', () => {
    expect(toastInputForFailedJob(failed)).toEqual({
      title: 'Reading media info failed.',
      description: 'File: interview.mp4',
      details: 'No such file'
    })
  })
})

describe('watchMediaJobs', () => {
  // Fake of the preload's event bridge: keeps the listener so the test can send events.
  function fakeApi() {
    let listener: ((job: JobSnapshot) => void) | undefined
    const unsubscribe = vi.fn()
    const api = {
      on: vi.fn((_event: string, next: (job: JobSnapshot) => void) => {
        listener = next
        return unsubscribe
      })
    } as unknown as Pick<RendererApi, 'on'>
    return { api, send: (job: JobSnapshot) => listener?.(job), unsubscribe }
  }

  it('notifies once for each failed job and ignores the other states', () => {
    const { api, send } = fakeApi()
    const notify = vi.fn()
    watchMediaJobs(api, notify)
    send({ ...failed, status: 'running' })
    send({ ...failed, status: 'cancelled', error: undefined })
    send(failed)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: failed.error?.message }))
  })

  it('returns the unsubscribe function from the event bridge', () => {
    const { api, unsubscribe } = fakeApi()
    const stop = watchMediaJobs(api, vi.fn())
    stop()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
