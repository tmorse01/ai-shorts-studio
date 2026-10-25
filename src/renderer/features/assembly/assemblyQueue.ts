// The footage plan state a script row and the review panel show (#145, #146). Plans come from the assembly
// batch (see reportAssemblyBatch). A plan only fills in the review panel: nothing reaches a short until the
// user applies it there.
import type { Batch, BatchItem } from '@shared/batch/batch'
import type { FootageMatchResultData } from '@shared/assembly/footageMatchRequest'

export type AssemblyPlanState =
  | { status: 'queued' }
  | { status: 'running' }
  | { status: 'ready'; result: FootageMatchResultData }
  | { status: 'failed'; message: string }

/**
 * The plan state of each script in an assembly batch, keyed by script id (the item id). Items that were
 * cancelled or failed read as failed, with the message the batch saved.
 */
export function assemblyPlanStates(batch: Batch): Record<string, AssemblyPlanState> {
  const states: Record<string, AssemblyPlanState> = {}
  for (const item of batch.items) states[item.id] = planStateOf(item)
  return states
}

function planStateOf(item: BatchItem): AssemblyPlanState {
  switch (item.status) {
    case 'queued':
      return { status: 'queued' }
    case 'running':
      return { status: 'running' }
    case 'done':
      return item.plan
        ? { status: 'ready', result: item.plan }
        : { status: 'failed', message: 'The footage could not be matched.' }
    case 'failed':
      return {
        status: 'failed',
        message: item.error?.message ?? 'The footage could not be matched.'
      }
    case 'cancelled':
      return { status: 'failed', message: 'Footage matching was cancelled.' }
  }
}

/** The short status text a script row shows for its footage plan. Null when nothing is queued. */
export function assemblyStatusLabel(state: AssemblyPlanState | undefined): string | null {
  if (!state) return null
  switch (state.status) {
    case 'queued':
      return 'Footage queued'
    case 'running':
      return 'Matching footage'
    case 'ready':
      return 'Footage ready to review'
    case 'failed':
      return 'Footage not matched'
  }
}
