// Pure helpers for showing saved moments: which moments belong to a clip, how long they run and what
// a new moment is called by default.
import type { Moment } from '@shared/project/schema'
import { formatDuration } from '../media/mediaView'

// The moments of one source clip, in source order (earliest In first).
export function momentsOfMedia(moments: readonly Moment[], mediaId: string): Moment[] {
  return moments.filter((moment) => moment.mediaId === mediaId).sort((a, b) => a.inMs - b.inMs)
}

// "12.3s" under a minute, then "m:ss" as the media panel shows durations.
export function formatMomentDuration(ms: number): string {
  if (ms < 60_000) return `${(Math.max(ms, 0) / 1000).toFixed(1)}s`
  return formatDuration(ms)
}

// The name a moment gets when the user saves one without typing a name.
export function defaultMomentName(existingCount: number): string {
  return `Moment ${existingCount + 1}`
}
