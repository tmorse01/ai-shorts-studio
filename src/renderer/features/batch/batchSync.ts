// Applies the batches main reports to the open project's copy. Main saves batch status changes itself,
// so the renderer only has to keep its copy current; otherwise its next project save would write
// the batches it loaded earlier and drop the ones main changed.
import type { Batch } from '@shared/batch/batch'
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

/** Keeps the open project's batches current from every batch:changed event. */
export function watchBatches(
  api: BatchEvents,
  store: { getState: () => BatchSyncTarget }
): Unsubscribe {
  return api.on('batch:changed', ({ projectFolder, batch }) => {
    store.getState().applyBatch(projectFolder, batch)
  })
}
