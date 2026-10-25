// The footage-matching queue for approved scripts (#145). Holds each script's plan state for the session,
// so the scripts list and the review panel can show it. Plans are not saved to the project.
import { create } from 'zustand'
import type { FootageMatchRequest } from '@shared/assembly/footageMatchRequest'
import { analysisStore } from '../analysis/analysisStore'
import { projectStore } from '../project/projectStore'
import { searchIndex } from '../search/searchIndexStore'
import { matchScriptFootage } from './assemblyActions'
import { buildMatchRequest, shotsByMediaOf } from './assemblyReview'
import { runAssemblyQueue, type AssemblyPlanState } from './assemblyQueue'

interface AssemblyQueueStore {
  plans: Record<string, AssemblyPlanState>
  setPlan: (scriptId: string, state: AssemblyPlanState) => void
}

export const useAssemblyQueueStore = create<AssemblyQueueStore>()((set) => ({
  plans: {},
  setPlan: (scriptId, state) => set((store) => ({ plans: { ...store.plans, [scriptId]: state } }))
}))

// Matches run one after another across calls too, so two queued batches never overlap.
let chain: Promise<void> = Promise.resolve()

/** Queues footage matching for each script, in order. Nothing is applied to a short. */
export function queueFootageMatching(scriptIds: readonly string[]): void {
  const { setPlan } = useAssemblyQueueStore.getState()
  for (const scriptId of scriptIds) setPlan(scriptId, { status: 'queued' })
  chain = chain
    .then(() =>
      runAssemblyQueue(scriptIds, {
        requestFor: requestForScript,
        match: (request) => matchScriptFootage(window.api, request),
        report: setPlan
      })
    )
    .catch(() => undefined)
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
