// Gaps on the main track (Epic 07, #90). A gap is empty time on the main sequence that a clip follows,
// either before the first clip or between two clips. Empty time after the last clip is not a gap: there
// is nothing to close it against. Gaps can be selected and closed (closeGap in ./edits.ts).
import type { Timeline } from './timeline'

export interface Gap {
  trackId: string
  startMs: number
  endMs: number
}

// The closable gaps on every main track, in time order per track.
export function mainGaps(timeline: Timeline): Gap[] {
  const gaps: Gap[] = []
  for (const track of timeline.tracks) {
    if (track.role !== 'main') continue
    const sorted = [...track.clips].sort((a, b) => a.startMs - b.startMs)
    let cursor = 0
    for (const clip of sorted) {
      if (clip.startMs > cursor)
        gaps.push({ trackId: track.id, startMs: cursor, endMs: clip.startMs })
      cursor = Math.max(cursor, clip.startMs + clip.durationMs)
    }
  }
  return gaps
}
