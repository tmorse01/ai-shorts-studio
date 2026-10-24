// Which clip the framing inspector edits for a selection (Epic 09, #105 and #106). One selected video
// clip with media is edited, in either framing mode. Several clips or no clip give nothing. Pure, so
// the rule is tested directly.
import type { Clip, Timeline } from '@shared/timeline/timeline'

export function framingClipFor(timeline: Timeline, clipIds: readonly string[]): Clip | null {
  if (clipIds.length !== 1) return null
  const clipId = clipIds[0]
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (!clip) continue
    if (track.kind !== 'video' || !clip.mediaId) return null
    return clip
  }
  return null
}
