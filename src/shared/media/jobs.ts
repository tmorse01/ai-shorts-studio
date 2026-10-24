// Background media jobs as the renderer sees them. Main owns the queue; the renderer gets snapshots.
import { z } from 'zod'

export const jobKindSchema = z.enum(['probe', 'thumbs', 'filmstrip', 'proxy', 'poster', 'analysis'])
export type JobKind = z.infer<typeof jobKindSchema>

export const jobStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled'])
export type JobStatus = z.infer<typeof jobStatusSchema>

export function isJobFinished(status: JobStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

export const jobSnapshotSchema = z.object({
  id: z.string().min(1),
  kind: jobKindSchema,
  // The file the job works on, by name only. Shown in toasts.
  label: z.string(),
  status: jobStatusSchema,
  // 0 to 1. Jobs that do not report progress go from 0 to 1 when they finish.
  progress: z.number().min(0).max(1),
  // Plain-language message for failed jobs, with technical detail for the toast's details view.
  error: z
    .object({
      message: z.string(),
      details: z.string().optional()
    })
    .optional()
})
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>
