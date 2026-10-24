// Caption generate and regenerate as one undoable command (Epic 11, #118). The command replaces the
// captions in one range of the short's captions track, so one undo step restores the range exactly.
import type { Project } from '@shared/project/schema'
import type { CaptionBlock } from '@shared/captions/captionBlock'
import { applyCaptionRange } from '@shared/captions/captionTrack'
import type { Command } from '../history/historyStore'
import { timelineCommand } from '../timeline/timelineCommands'

export interface GenerateCaptionsInput {
  shortId: string
  label: string
  now: string
  rangeStartMs: number
  rangeEndMs: number
  blocks: readonly CaptionBlock[]
  // Id for a captions track the short does not have yet.
  newTrackId: string
}

export function generateCaptionsCommand(input: GenerateCaptionsInput): Command<Project> {
  return timelineCommand(input.shortId, input.label, input.now, (timeline) =>
    applyCaptionRange(timeline, {
      rangeStartMs: input.rangeStartMs,
      rangeEndMs: input.rangeEndMs,
      blocks: input.blocks,
      newTrackId: input.newTrackId
    })
  )
}
