// The render queue as the renderer sees it (Epic 17, #152): one row per export, with its progress and
// time left. Main owns the queue (src/main/export/renderQueue.ts); this file has the shared schema and the
// pure rules for progress and time left, so both sides agree. No Electron or Node imports here.
import { z } from 'zod'
import { jobStatusSchema } from '../media/jobs'

export const renderJobSchema = z.object({
  id: z.string().min(1),
  shortId: z.string().min(1),
  shortName: z.string(),
  // The output file's name, without its folder. Main reveals the full path on request.
  fileName: z.string(),
  status: jobStatusSchema,
  // 0 to 1, from FFmpeg's progress output.
  progress: z.number().min(0).max(1),
  // Seconds left, or null until the encode has made measurable progress.
  etaSec: z.number().nonnegative().nullable(),
  // Plain-language message for a failed export, with technical detail for the details view.
  error: z
    .object({
      message: z.string(),
      details: z.string().optional()
    })
    .optional()
})
export type RenderJob = z.infer<typeof renderJobSchema>

// Seconds left from the share of work done and the time it took. Null when there is nothing to go on
// yet, or when the work is already finished.
export function renderEtaSec(progress: number, elapsedMs: number): number | null {
  if (!(progress > 0) || progress >= 1 || !(elapsedMs >= 0)) return null
  return Math.round((elapsedMs * (1 - progress)) / progress / 1000)
}

// The fraction of an encode done, from one line of `ffmpeg -progress`. FFmpeg writes the position in
// microseconds under out_time_us (and, in some builds, out_time_ms, which is also microseconds). Lines
// that carry no position, such as "N/A" at the start, give undefined.
export function exportProgressFromLine(line: string, durationMs: number): number | undefined {
  if (!(durationMs > 0)) return undefined
  const match = /^out_time_(?:us|ms)=(-?\d+)\s*$/.exec(line.trim())
  if (!match?.[1]) return undefined
  const microseconds = Number(match[1])
  if (!Number.isFinite(microseconds)) return undefined
  return Math.min(1, Math.max(0, microseconds / 1000 / durationMs))
}
