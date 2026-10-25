// Re-assembles one script line on its short (Epic 15, #142). Footage is matched for that line only, and the
// match is applied as one undoable command. The command replaces only the line's unlocked clips (see
// clipIdsReplacedBy); locked clips and the other lines stay where they are. Nothing changes when no footage
// is found for the line.
import { projectStore } from '../project/projectStore'
import { analysisStore } from '../analysis/analysisStore'
import { searchIndex } from '../search/searchIndexStore'
import { applyProjectCommand, undoProjectEdit } from '../shorts/shortActions'
import { toast } from '../toasts/toast'
import { applyFootagePlanCommand } from './assemblyCommands'
import { matchScriptFootage } from './assemblyActions'
import { acceptedPlan, buildMatchRequest, shotsByMediaOf, videoTrackId } from './assemblyReview'

export type ReassembleOutcome = 'applied' | 'unmatched' | 'failed'

export async function reassembleLine(shortId: string, lineId: string): Promise<ReassembleOutcome> {
  const current = projectStore.getState().current
  if (!current) return 'failed'
  const { project, folderPath } = current
  const short = project.shorts.find((item) => item.id === shortId)
  const script = project.scripts.find((item) => item.id === short?.scriptId)
  const line = script?.lines.find((item) => item.id === lineId)
  if (!short || !script || !line) return 'failed'

  const trackId = videoTrackId(short)
  if (!trackId) {
    toast.error({
      title: 'Could not re-assemble the line',
      description: 'The short has no unlocked video track to put footage on.'
    })
    return 'failed'
  }
  if (line.text.trim() === '') {
    toast.info({
      title: 'The line is empty',
      description: 'Write the line before re-assembling it.'
    })
    return 'unmatched'
  }

  const request = buildMatchRequest({
    script: { ...script, lines: [line] },
    project,
    docs: searchIndex.docs(),
    shotsByMedia: shotsByMediaOf(analysisStore.getState().filesByFolder[folderPath])
  })
  const data = await matchScriptFootage(window.api, request)
  if (!data) return 'failed'

  // Only this line is applied, even if the matcher returned others.
  const plan = acceptedPlan(data.plan, new Set([lineId]))
  if (plan.lines.length === 0) {
    toast.info({
      title: 'No footage found for this line',
      description: 'Its clips are left as they are.'
    })
    return 'unmatched'
  }

  try {
    applyProjectCommand(
      applyFootagePlanCommand({
        shortId,
        trackId,
        plan,
        now: new Date().toISOString(),
        newId: () => crypto.randomUUID(),
        label: 'Re-assemble line'
      })
    )
  } catch (error) {
    toast.error({
      title: 'Could not re-assemble the line',
      description: error instanceof Error ? error.message : 'Try again.'
    })
    return 'failed'
  }
  toast.success({
    title: 'Line re-assembled',
    description: 'Undo restores the timeline.',
    action: { label: 'Undo', run: () => undoProjectEdit() }
  })
  return 'applied'
}
