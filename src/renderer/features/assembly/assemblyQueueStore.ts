// The footage-matching state for scripts (#145, #146). Holds each script's plan state for the session, so the
// scripts list and the review panel can show it. Plans come from assembly batches and are not saved to the
// project: a batch keeps its own plans, and the review panel applies one only when the user asks.
import { create } from 'zustand'
import type { Batch } from '@shared/batch/batch'
import type { FootageMatchRequest } from '@shared/assembly/footageMatchRequest'
import { analysisStore } from '../analysis/analysisStore'
import { projectStore } from '../project/projectStore'
import { searchIndex } from '../search/searchIndexStore'
import { toast } from '../toasts/toast'
import { buildMatchRequest, shotsByMediaOf } from './assemblyReview'
import { assemblyPlanStates, type AssemblyPlanState } from './assemblyQueue'

interface AssemblyQueueStore {
  plans: Record<string, AssemblyPlanState>
  setPlan: (scriptId: string, state: AssemblyPlanState) => void
  setPlans: (states: Record<string, AssemblyPlanState>) => void
}

export const useAssemblyQueueStore = create<AssemblyQueueStore>()((set) => ({
  plans: {},
  setPlan: (scriptId, state) => set((store) => ({ plans: { ...store.plans, [scriptId]: state } })),
  setPlans: (states) => set((store) => ({ plans: { ...store.plans, ...states } }))
}))

/**
 * Starts one assembly batch that matches footage for each script (#146). Scripts with no lines are
 * skipped. Returns whether the batch started. Nothing is applied to a short here.
 */
export async function startAssemblyBatch(
  scriptIds: readonly string[],
  reuse: boolean
): Promise<boolean> {
  const current = projectStore.getState().current
  if (!current) return false
  const items = scriptIds.flatMap((scriptId) => {
    const footage = requestForScript(scriptId)
    return footage ? [{ id: scriptId, footage }] : []
  })
  if (items.length === 0) {
    toast.info({
      title: 'Nothing to match',
      description: 'Write some lines in the approved scripts first.'
    })
    return false
  }
  const result = await window.api.invoke('batch:run', {
    projectFolder: current.folderPath,
    kind: 'assembly',
    reuseFootage: reuse,
    items
  })
  if (!result.ok) {
    toast.error({
      title: 'Could not start footage matching',
      description: result.error.message,
      details: result.error.details
    })
    return false
  }
  reportAssemblyBatch(result.data.batch)
  toast.info({
    title:
      items.length === 1
        ? 'Queued footage matching for 1 script'
        : `Queued footage matching for ${items.length} scripts`,
    description: 'Review each one in its script before it is applied to a short.'
  })
  return true
}

/** Shows the plan state of every script in an assembly batch. Other batch kinds are ignored. */
export function reportAssemblyBatch(batch: Batch): void {
  if (batch.kind !== 'assembly') return
  useAssemblyQueueStore.getState().setPlans(assemblyPlanStates(batch))
}

// The same request the review panel builds, from the open project and its search index.
function requestForScript(scriptId: string): FootageMatchRequest | null {
  const current = projectStore.getState().current
  if (!current) return null
  const script = current.project.scripts.find((item) => item.id === scriptId)
  if (!script) return null
  const request = buildMatchRequest({
    script,
    project: current.project,
    docs: searchIndex.docs(),
    shotsByMedia: shotsByMediaOf(analysisStore.getState().filesByFolder[current.folderPath])
  })
  return request.lines.length === 0 ? null : request
}
