// Which clips make sound on a timeline. Shared by the preview mix (renderer audioMix.ts) and the export
// render graph, so both pick the same clips. Pure: no DOM, no store.
import type { Clip, TrackKind } from './timeline'

// Whether a clip on a track sounds at all. Muted tracks and muted clips are silent, and so is a clip
// with no footage or with no sound track. A video clip with detached audio is silent, because its sound
// plays from the audio clip it links to. `hasAudio` says whether a media id has a sound track.
export function isSoundingClip(
  clip: Clip,
  trackKind: TrackKind,
  trackMuted: boolean,
  hasAudio: (mediaId: string) => boolean
): boolean {
  if (trackMuted || clip.muted || !clip.mediaId || !hasAudio(clip.mediaId)) return false
  if (trackKind !== 'audio' && trackKind !== 'video') return false
  if (trackKind === 'video' && clip.linkedAudio) return false
  return true
}
