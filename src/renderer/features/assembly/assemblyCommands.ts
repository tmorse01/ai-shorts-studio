// Applying a reviewed footage plan as one project command (Epic 15, #139). One undo step puts back every
// clip the plan replaced, so the user can always return to the timeline as it was before Apply.
import { applyAssemblyPlan, type AssemblyPlan } from '@shared/assembly/assemblyPlan'
import type { Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'
import { timelineCommand } from '../timeline/timelineCommands'

export interface ApplyFootagePlanInput {
  shortId: string
  trackId: string
  plan: AssemblyPlan
  now: string
  newId: () => string
}

export function applyFootagePlanCommand(input: ApplyFootagePlanInput): Command<Project> {
  const lineCount = input.plan.lines.length
  const label = `Apply footage for ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`
  return timelineCommand(input.shortId, label, input.now, (timeline) =>
    applyAssemblyPlan(timeline, input.plan, { trackId: input.trackId, newId: input.newId })
  )
}
