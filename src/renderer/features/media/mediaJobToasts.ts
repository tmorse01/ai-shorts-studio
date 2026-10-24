// Shows an error toast when a media job fails. Jobs run in main, so this only listens; it does not
// drive the queue.
import type { RendererApi } from '@shared/ipc'
import type { JobSnapshot } from '@shared/media/jobs'
import type { ToastInput } from '../toasts/toast'

export function toastInputForFailedJob(job: JobSnapshot): ToastInput {
  return {
    title: job.error?.message ?? 'A media job failed.',
    description: `File: ${job.label}`,
    details: job.error?.details
  }
}

/** Calls notify for every job that fails. Returns the function that stops listening. */
export function watchMediaJobs(
  api: Pick<RendererApi, 'on'>,
  notify: (input: ToastInput) => void
): () => void {
  return api.on('media:job:changed', (job) => {
    if (job.status === 'failed') notify(toastInputForFailedJob(job))
  })
}
