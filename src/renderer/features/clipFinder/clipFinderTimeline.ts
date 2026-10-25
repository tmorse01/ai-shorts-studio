// Appends a footage range to the end of a short's main track, for the Clip Finder's Add to timeline. The
// drop rules come from footageClipForDrop, so a moment keeps its id on the clip exactly as a drag does.
// Pure: the command wraps it, and the tests call it directly.
import type { MediaRef } from '@shared/project/schema'
import type { DragPayload } from '@shared/timeline/dragPayload'
import { addTrack, insertClip } from '@shared/timeline/edits'
import { footageClipForDrop } from '@shared/timeline/footageDrop'
import type { Timeline } from '@shared/timeline/timeline'

/** The end of the main track: where a clip added from the Clip Finder goes. */
export function mainTrackEndMs(timeline: Timeline): number {
  const main = timeline.tracks.find((track) => track.role === 'main')
  if (!main) return 0
  return main.clips.reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0)
}

/** Throws with the reason when the range cannot go on the main track. */
export function appendFootageToMain(
  timeline: Timeline,
  media: readonly MediaRef[],
  payload: DragPayload,
  clipId: string
): Timeline {
  // A new short has no tracks, so the footage gets its main video track first, as the assembly does.
  const withMain = timeline.tracks.some((track) => track.role === 'main')
    ? timeline
    : addTrack(timeline, {
        id: `${clipId}-main`,
        kind: 'video',
        role: 'main',
        muted: false,
        clips: []
      })
  const main = withMain.tracks.find((track) => track.role === 'main')
  if (!main) throw new Error('This short has no main track.')
  const result = footageClipForDrop(payload, media, main, clipId, mainTrackEndMs(withMain))
  if (!result.ok) throw new Error(result.reason)
  return insertClip(withMain, main.id, result.clip, result.clip.startMs)
}
