// Which clip the pan section edits for a selection (Epic 09, #105). One selected video clip that is
// fill-framed is edited directly. A blur-fit clip has no crop to pan, and several clips or no clip give
// nothing. Pure, so the rule is tested directly.
import type { Clip, Timeline } from '@shared/timeline/timeline'

export function framedClipFor(timeline: Timeline, clipIds: readonly string[]): Clip | null {
  if (clipIds.length !== 1) return null
  const clipId = clipIds[0]
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (!clip) continue
    if (track.kind !== 'video' || !clip.mediaId) return null
    if ((clip.framing?.mode ?? 'fill') !== 'fill') return null
    return clip
  }
  return null
}
