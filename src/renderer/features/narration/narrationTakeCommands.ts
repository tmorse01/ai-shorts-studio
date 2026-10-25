// Adds a recorded take as one undoable command (Epic 10, #108): the take's footage goes into the project's
// media list, and its narration clip lands on the Narration lane. One undo removes both, and redo brings
// both back. The narration lane is created when the short has none yet.
import type { MediaRef, Project } from '@shared/project/schema'
import { addTrack, insertClip } from '@shared/timeline/edits'
import type { Clip, Timeline } from '@shared/timeline/timeline'
import type { Command } from '../history/historyStore'
import { timelineCommand } from '../timeline/timelineCommands'

export interface AddNarrationTakeInput {
  shortId: string
  label: string
  now: string
  media: MediaRef
  clip: Clip
  // Id for a Narration track the short does not have yet.
  narrationTrackId: string
}

function withNarrationTrack(timeline: Timeline, trackId: string): Timeline {
  if (timeline.tracks.some((track) => track.role === 'narration')) return timeline
  return addTrack(timeline, {
    id: trackId,
    kind: 'audio',
    role: 'narration',
    muted: false,
    clips: []
  })
}

export function addNarrationTakeCommand(input: AddNarrationTakeInput): Command<Project> {
  const { media, clip } = input
  const timeline = timelineCommand(input.shortId, input.label, input.now, (current) => {
    const withTrack = withNarrationTrack(current, input.narrationTrackId)
    const track = withTrack.tracks.find((item) => item.role === 'narration')
    if (!track) throw new Error('The short has no Narration lane.')
    return insertClip(withTrack, track.id, clip, clip.startMs)
  })
  return {
    label: input.label,
    produce: (draft) => {
      if (!draft.media.some((item) => item.id === media.id)) draft.media.push(media)
      timeline.produce(draft)
    }
  }
}
