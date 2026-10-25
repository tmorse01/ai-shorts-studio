// A batch runs one analysis stage over many media items (Epic 16, #143). The batch is stored in the
// project so it survives a restart. Pure logic only: the runner in main does the queueing and I/O.
import { z } from 'zod'
import { analysisStageSchema, type AnalysisStage } from '../analysis/analysis'

const nonEmptyString = z.string().trim().min(1)

export const batchItemStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled'])
export type BatchItemStatus = z.infer<typeof batchItemStatusSchema>

export const batchStatusSchema = z.enum(['running', 'done', 'failed', 'cancelled'])
export type BatchStatus = z.infer<typeof batchStatusSchema>

export const MAX_BATCH_ITEMS = 500

export const batchItemSchema = z.object({
  // The media id. One item per media item in a batch.
  id: nonEmptyString,
  status: batchItemStatusSchema,
  // 0 to 1, while the item runs.
  progress: z.number().min(0).max(1),
  // How many times the item has started. Retrying counts again.
  attempts: z.number().int().nonnegative(),
  error: z
    .object({
      message: z.string(),
      details: z.string().optional()
    })
    .optional()
})
export type BatchItem = z.infer<typeof batchItemSchema>

export const batchSchema = z.object({
  id: nonEmptyString,
  stage: analysisStageSchema,
  status: batchStatusSchema,
  createdAt: z.iso.datetime(),
  items: z.array(batchItemSchema).min(1).max(MAX_BATCH_ITEMS)
})
export type Batch = z.infer<typeof batchSchema>

export function isBatchItemSettled(status: BatchItemStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

/** Items that can be retried: they failed or were cancelled. */
export function isBatchItemRetryable(status: BatchItemStatus): boolean {
  return status === 'failed' || status === 'cancelled'
}

// The batch status follows its items: running while any item is queued or running, then done when
// every item is done, failed when any item failed, and cancelled otherwise.
export function batchStatusOf(items: readonly BatchItem[]): BatchStatus {
  if (items.some((item) => item.status === 'queued' || item.status === 'running')) return 'running'
  if (items.every((item) => item.status === 'done')) return 'done'
  if (items.some((item) => item.status === 'failed')) return 'failed'
  return 'cancelled'
}

export function createBatch(input: {
  id: string
  stage: AnalysisStage
  mediaIds: readonly string[]
  createdAt: string
}): Batch {
  const seen = new Set<string>()
  for (const id of input.mediaIds) {
    if (seen.has(id)) throw new Error(`Media item "${id}" is in the batch more than once.`)
    seen.add(id)
  }
  const items: BatchItem[] = input.mediaIds.map((id) => ({
    id,
    status: 'queued',
    progress: 0,
    attempts: 0
  }))
  return batchSchema.parse({
    id: input.id,
    stage: input.stage,
    status: batchStatusOf(items),
    createdAt: input.createdAt,
    items
  })
}

/** Returns a copy of the batch with one item changed, and its status recomputed. */
export function updateBatchItem(
  batch: Batch,
  itemId: string,
  patch: Partial<Omit<BatchItem, 'id'>>
): Batch {
  const items = batch.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
  return { ...batch, items, status: batchStatusOf(items) }
}

export function findBatchItem(batch: Batch, itemId: string): BatchItem | undefined {
  return batch.items.find((item) => item.id === itemId)
}

/**
 * Cancels one item that is queued or running. Other items are left alone. Returns the batch
 * unchanged when the item is missing or already settled.
 */
export function cancelBatchItem(batch: Batch, itemId: string): Batch {
  const item = findBatchItem(batch, itemId)
  if (!item || isBatchItemSettled(item.status)) return batch
  return updateBatchItem(batch, itemId, { status: 'cancelled', progress: 0 })
}

/**
 * Resets failed and cancelled items to queued, so they can run again. Pass item ids to retry only
 * those; leave them out to retry every retryable item. Items that are running or done are not touched.
 */
export function resetBatchItemsForRetry(batch: Batch, itemIds?: readonly string[]): Batch {
  const wanted = itemIds ? new Set(itemIds) : undefined
  const items = batch.items.map((item) => {
    if (!isBatchItemRetryable(item.status)) return item
    if (wanted && !wanted.has(item.id)) return item
    return { ...item, status: 'queued' as const, progress: 0, error: undefined }
  })
  return { ...batch, items, status: batchStatusOf(items) }
}

export const INTERRUPTED_MESSAGE = 'Stopped when the app closed. Retry to run it again.'

/**
 * Called when a project is opened. Items that were queued or running when the app stopped cannot
 * still be running, so they become failed with a plain message and can be retried.
 */
export function recoverInterruptedBatch(batch: Batch): Batch {
  const items = batch.items.map((item) =>
    item.status === 'queued' || item.status === 'running'
      ? {
          ...item,
          status: 'failed' as const,
          progress: 0,
          error: { message: INTERRUPTED_MESSAGE }
        }
      : item
  )
  return { ...batch, items, status: batchStatusOf(items) }
}

/** Average progress across the items, from 0 to 1. Settled items count as complete. */
export function batchProgress(batch: Batch): number {
  if (batch.items.length === 0) return 0
  const total = batch.items.reduce(
    (sum, item) => sum + (isBatchItemSettled(item.status) ? 1 : item.progress),
    0
  )
  return total / batch.items.length
}
