// Timeline edits as commands in the project history (Epic 07, #84). Each one runs a pure edit from
// shared/timeline/edits.ts on a short's timeline, so do and undo come from the history engine. Edits
// that share a mergeKey (a drag, a trim) fold into one history entry.
import { current } from 'immer'
import type { Project } from '@shared/project/schema'
import type { Timeline } from '@shared/timeline/timeline'
import type { Command } from '../history/historyStore'
import { markEdited } from '../shorts/shortCommands'

export function timelineCommand(
  shortId: string,
  label: string,
  now: string,
  edit: (timeline: Timeline) => Timeline,
  mergeKey?: string
): Command<Project> {
  return {
    label,
    mergeKey,
    produce: (draft) => {
      const short = draft.shorts.find((item) => item.id === shortId)
      if (!short) throw new Error(`No short with id ${shortId}`)
      // Edits return new objects, so run them on a plain copy and assign the result back.
      short.timeline = edit(structuredClone(current(short.timeline)))
      markEdited(short, now)
    }
  }
}
