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

// The clip the Audio tab edits (Epic 08, #97): one selected audio clip that stands on its own. A clip
// linked to a video clip (its detached sound) is edited in the Video clip section, so it gives null
// here. So does any selection that is not one audio clip.
export function audioTargetFor(timeline: Timeline, clipIds: readonly string[]): Clip | null {
  if (clipIds.length !== 1) return null
  const clipId = clipIds[0]
  const linked = timeline.tracks.some((track) =>
    track.clips.some((clip) => clip.linkedAudio === clipId)
  )
  if (linked) return null
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return track.kind === 'audio' ? clip : null
  }
  return null
}

// The sound one selected clip contributes to a multi-selection's shared sound fields (#99). A video clip
// contributes its linked audio clip, or null when its sound is detached. An audio clip contributes itself,
// unless a video clip links to it, in which case it is edited through that video clip (as audioTargetFor
// does). Any other clip contributes null. The result has one entry per selected clip, in order.
export function soundsFor(timeline: Timeline, clipIds: readonly string[]): (Clip | null)[] {
  const allClips = timeline.tracks.flatMap((track) => track.clips)
  return clipIds.map((clipId) => {
    const clip = allClips.find((item) => item.id === clipId)
    if (!clip) return null
    const kind = timeline.tracks.find((track) => track.clips.includes(clip))?.kind
    if (kind === 'video') {
      return clip.linkedAudio
        ? (allClips.find((item) => item.id === clip.linkedAudio) ?? null)
        : null
    }
    if (kind === 'audio') {
      const linked = allClips.some((item) => item.linkedAudio === clipId)
      return linked ? null : clip
    }
    return null
  })
}
