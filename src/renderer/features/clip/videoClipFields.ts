// Pure rules for the video clip section (Epic 08, #96): which video clip the inspector edits, and the
// timeline edits behind its Source In, Out and Duration fields. The fields use the same trim rules as
// the timeline's trim handles (trimClip), so the limits match. No DOM, so the rules are tested directly.
import { trimClip } from '@shared/timeline/edits'
import type { Clip, Timeline } from '@shared/timeline/timeline'

export type TimelineEdit = (timeline: Timeline) => Timeline

export interface VideoSelection {
  clip: Clip
  // The clip's linked audio, or null when its sound is detached or it never had one.
  linkedAudio: Clip | null
}

// The video clip the inspector edits: one selected clip on a video track. Several clips, or any other
// track kind, give null.
export function videoSelectionFor(
  timeline: Timeline,
  clipIds: readonly string[]
): VideoSelection | null {
  if (clipIds.length !== 1) return null
  const clipId = clipIds[0]
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (!clip) continue
    if (track.kind !== 'video') return null
    const allClips = timeline.tracks.flatMap((item) => item.clips)
    const linkedAudio = clip.linkedAudio
      ? (allClips.find((item) => item.id === clip.linkedAudio) ?? null)
      : null
    return { clip, linkedAudio }
  }
  return null
}

// Source In, Out and Duration, in ms. Out is In plus the clip's length on the timeline.
export function sourceWindowOf(clip: Clip): { inMs: number; outMs: number; durationMs: number } {
  return {
    inMs: clip.sourceInMs,
    outMs: clip.sourceInMs + clip.durationMs,
    durationMs: clip.durationMs
  }
}

// Source In: moves the start edge so the clip plays from inMs. The clip's start moves with it, as
// dragging the start handle does.
export function setSourceIn(clip: Clip, inMs: number): TimelineEdit {
  return (timeline) => trimClip(timeline, clip.id, 'start', clip.startMs + (inMs - clip.sourceInMs))
}

// Source Out: moves the end edge so the clip plays up to outMs. It stops at the source's length.
export function setSourceOut(clip: Clip, outMs: number, sourceLengthMs?: number): TimelineEdit {
  return (timeline) =>
    trimClip(timeline, clip.id, 'end', clip.startMs + (outMs - clip.sourceInMs), sourceLengthMs)
}

// Duration: moves the end edge so the clip is durationMs long on the timeline.
export function setDuration(clip: Clip, durationMs: number, sourceLengthMs?: number): TimelineEdit {
  return (timeline) => trimClip(timeline, clip.id, 'end', clip.startMs + durationMs, sourceLengthMs)
}
