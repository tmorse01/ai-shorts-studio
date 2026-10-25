// Applies the batches main reports to the open project's copy. Main saves batch status changes itself,
// so the renderer only has to keep its copy current; otherwise its next project save would write
// the batches it loaded earlier and drop the ones main changed.
import type { Batch, BatchItemStatus } from '@shared/batch/batch'
import type { GeneratedScript } from '@shared/ai/scriptGeneration'
import type { Unsubscribe } from '@shared/ipc'

export interface BatchSyncTarget {
  applyBatch: (folderPath: string, batch: Batch) => void
}

export interface BatchEvents {
  on: (
    channel: 'batch:changed',
    listener: (payload: { projectFolder: string; batch: Batch }) => void
  ) => Unsubscribe
}

/**
 * The drafts of script items that finished since the last call. An item counts as finished only when
 * this watcher saw it leave queued or running, so drafts already in the project are not imported again
 * after a restart or a retry of another item.
 */
export function newlyFinishedScriptDrafts(
  batch: Batch,
  lastStatus: Map<string, BatchItemStatus>
): GeneratedScript[] {
  const drafts: GeneratedScript[] = []
  for (const item of batch.items) {
    const key = `${batch.id}:${item.id}`
    const previous = lastStatus.get(key)
    lastStatus.set(key, item.status)
    const wasActive = previous === 'queued' || previous === 'running'
    if (batch.kind === 'script' && item.status === 'done' && wasActive && item.scripts) {
      drafts.push(...item.scripts)
    }
  }
  return drafts
}

/**
 * Keeps the open project's batches current from every batch:changed event. Drafts from finished script
 * batches go to `onScriptDrafts` once each.
 */
export function watchBatches(
  api: BatchEvents,
  store: { getState: () => BatchSyncTarget },
  onScriptDrafts?: (projectFolder: string, drafts: GeneratedScript[]) => void
): Unsubscribe {
  const lastStatus = new Map<string, BatchItemStatus>()
  return api.on('batch:changed', ({ projectFolder, batch }) => {
    store.getState().applyBatch(projectFolder, batch)
    const drafts = newlyFinishedScriptDrafts(batch, lastStatus)
    if (drafts.length > 0) onScriptDrafts?.(projectFolder, drafts)
  })
}
