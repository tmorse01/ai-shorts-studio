// Which clip the clip audio controls edit for a selection (Epic 07, #91). One selected clip with a sound
// is edited directly: an audio clip, or a video clip with its own sound. A video clip whose sound was
// detached is edited through its audio clip, since that clip's sound is the one that plays. Returns
// null for no selection, several clips, or a clip with no sound.
import type { Clip, Timeline } from '@shared/timeline/timeline'

export function soundClipFor(timeline: Timeline, clipIds: readonly string[]): Clip | null {
  if (clipIds.length !== 1) return null
  const clipId = clipIds[0]
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (!clip) continue
    if (clip.linkedAudio) {
      const audio = timeline.tracks
        .flatMap((item) => item.clips)
        .find((item) => item.id === clip.linkedAudio)
      return audio ?? null
    }
    if (track.kind === 'audio') return clip
    if (track.kind === 'video' && clip.mediaId) return clip
    return null
  }
  return null
}
