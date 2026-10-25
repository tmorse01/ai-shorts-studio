// The timeline edit behind a caption generate or regenerate (Epic 11, #118). It replaces the captions
// in one range of the captions track, and adds that track when the short has none. Pure, so the history
// command that runs it can be tested without the app.
import type { Timeline, Track } from '../timeline/timeline'
import { TimelineEditError, addTrack } from '../timeline/edits'
import type { CaptionBlock } from './captionBlock'
import { replaceCaptionsInRange } from './captionRemap'

export interface CaptionRangeEdit {
  rangeStartMs: number
  rangeEndMs: number
  blocks: readonly CaptionBlock[]
  // Id for the captions track, used only when the timeline has none yet.
  newTrackId: string
}

export function applyCaptionRange(timeline: Timeline, edit: CaptionRangeEdit): Timeline {
  if (edit.rangeEndMs < edit.rangeStartMs) {
    throw new TimelineEditError('The caption range ends before it starts.')
  }
  const track = timeline.tracks.find((item) => item.role === 'captions')
  if (!track) {
    const created: Track = {
      id: edit.newTrackId,
      kind: 'text',
      role: 'captions',
      muted: false,
      clips: [],
      captions: replaceCaptionsInRange([], edit.rangeStartMs, edit.rangeEndMs, edit.blocks)
    }
    return addTrack(timeline, created)
  }
  if (track.locked) {
    throw new TimelineEditError('The captions track is locked.')
  }
  const captions = replaceCaptionsInRange(
    track.captions ?? [],
    edit.rangeStartMs,
    edit.rangeEndMs,
    edit.blocks
  )
  return {
    ...timeline,
    tracks: timeline.tracks.map((item) => (item.id === track.id ? { ...item, captions } : item))
  }
}
