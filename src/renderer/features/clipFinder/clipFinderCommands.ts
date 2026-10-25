// Clip Finder commands that change the project: Add to timeline. It is one project command, so one undo
// takes the clip back off the short. Accepting a draft reuses the suggestion command in suggestions/.
import { current } from 'immer'
import type { Project } from '@shared/project/schema'
import type { DragPayload } from '@shared/timeline/dragPayload'
import type { Command } from '../history/historyStore'
import { markEdited } from '../shorts/shortCommands'
import { appendFootageToMain } from './clipFinderTimeline'

export interface AddToTimelineInput {
  shortId: string
  payload: DragPayload
  /** The id for the new clip. */
  clipId: string
  now: string
}

export function addToTimelineCommand(input: AddToTimelineInput): Command<Project> {
  return {
    label: 'Add clip to timeline',
    produce: (draft) => {
      const short = draft.shorts.find((item) => item.id === input.shortId)
      if (!short) throw new Error('The short is no longer in the project.')
      // Edits return new objects, so run them on a plain copy and assign the result back.
      short.timeline = appendFootageToMain(
        structuredClone(current(short.timeline)),
        current(draft.media),
        input.payload,
        input.clipId
      )
      markEdited(short, input.now)
    }
  }
}
