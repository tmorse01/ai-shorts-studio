// Which shorts use which footage, derived from each short's timeline. Pure, so the media cards, the
// source viewer's shading and the tests share one answer. A clip uses the source range from its
// sourceInMs for its duration. Text clips have no media and are skipped.
import type { Short } from '../project/schema'
import type { Timeline } from './timeline'

export interface UsedRange {
  startMs: number
  endMs: number
  shortIds: string[]
}

export interface MediaUsage {
  // The distinct shorts that use this footage at least once, in project order.
  shortIds: string[]
  // One entry per clip that uses the footage, sorted by source start.
  ranges: UsedRange[]
}

// Returns the usage of each footage item by the given shorts' timelines.
export function mediaUsageIndex(shorts: readonly Short[]): Map<string, MediaUsage> {
  const index = new Map<string, MediaUsage>()
  for (const short of shorts) {
    for (const [mediaId, ranges] of rangesByMedia(short.timeline)) {
      const usage = index.get(mediaId) ?? { shortIds: [], ranges: [] }
      if (!usage.shortIds.includes(short.id)) usage.shortIds.push(short.id)
      for (const range of ranges) {
        usage.ranges.push({ ...range, shortIds: [short.id] })
      }
      index.set(mediaId, usage)
    }
  }
  for (const usage of index.values()) {
    usage.ranges.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  }
  return index
}

// The source ranges one timeline uses, grouped by footage id.
function rangesByMedia(timeline: Timeline): Map<string, { startMs: number; endMs: number }[]> {
  const byMedia = new Map<string, { startMs: number; endMs: number }[]>()
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.mediaId === undefined) continue
      const list = byMedia.get(clip.mediaId) ?? []
      list.push({ startMs: clip.sourceInMs, endMs: clip.sourceInMs + clip.durationMs })
      byMedia.set(clip.mediaId, list)
    }
  }
  return byMedia
}

// The number of distinct shorts that use the footage. Zero when none do.
export function shortCountForMedia(
  index: ReadonlyMap<string, MediaUsage>,
  mediaId: string
): number {
  return index.get(mediaId)?.shortIds.length ?? 0
}

// "Used in 1 short" or "Used in 3 shorts". Empty when the footage is unused.
export function usedInLabel(count: number): string {
  if (count === 0) return ''
  return count === 1 ? 'Used in 1 short' : `Used in ${count} shorts`
}
