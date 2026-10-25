// Applying a reviewed footage plan as one project command (Epic 15, #139). One undo step puts back every
// clip the plan replaced, so the user can always return to the timeline as it was before Apply.
import { applyAssemblyPlan, type AssemblyPlan } from '@shared/assembly/assemblyPlan'
import type { Project } from '@shared/project/schema'
import { addTrack } from '@shared/timeline/edits'
import type { Timeline } from '@shared/timeline/timeline'
import type { Command } from '../history/historyStore'
import { createShortFromScriptCommand } from '../scripts/scriptCommands'
import { timelineCommand } from '../timeline/timelineCommands'

export interface ApplyFootagePlanInput {
  shortId: string
  trackId: string
  plan: AssemblyPlan
  now: string
  newId: () => string
  /**
   * Set when the script has no short yet (#146). The draft short is created from the script in the same
   * step, with a main video track for the footage, so one undo removes both.
   */
  createFromScript?: {
    scriptId: string
    /** Set when the plan came from an assembly batch. The new short then waits for review (#148). */
    batchDraft?: boolean
  }
}

export function applyFootagePlanCommand(input: ApplyFootagePlanInput): Command<Project> {
  const lineCount = input.plan.lines.length
  const label = `Apply footage for ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`
  const apply = timelineCommand(input.shortId, label, input.now, (timeline) =>
    applyAssemblyPlan(timeline, input.plan, { trackId: input.trackId, newId: input.newId })
  )
  const fromScript = input.createFromScript
  if (!fromScript) return apply
  const create = createShortFromScriptCommand(input.shortId, fromScript.scriptId, input.now)
  return {
    label,
    produce: (draft) => {
      create.produce(draft)
      const short = draft.shorts.find((item) => item.id === input.shortId)
      if (!short) throw new Error('The short could not be created.')
      if (fromScript.batchDraft) short.batchDraft = true
      // A new short has no tracks, so the footage gets its main video track first.
      const empty: Timeline = { tracks: [] }
      const withTrack = addTrack(empty, {
        id: input.trackId,
        kind: 'video',
        role: 'main',
        muted: false,
        clips: []
      })
      short.timeline = applyAssemblyPlan(withTrack, input.plan, {
        trackId: input.trackId,
        newId: input.newId
      })
    }
  }
}
