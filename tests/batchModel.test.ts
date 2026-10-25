import { describe, expect, it } from 'vitest'
import {
  batchProgress,
  batchStatusOf,
  cancelBatchItem,
  createBatch,
  INTERRUPTED_MESSAGE,
  recoverInterruptedBatch,
  resetBatchItemsForRetry,
  updateBatchItem
} from '@shared/batch/batch'

const NOW = '2026-10-24T10:00:00.000Z'

function batchOf(ids: string[]) {
  return createBatch({ id: 'batch-1', stage: 'shots', mediaIds: ids, createdAt: NOW })
}

describe('batch model', () => {
  it('starts every item queued and the batch running', () => {
    const batch = batchOf(['a', 'b'])
    expect(batch.status).toBe('running')
    expect(batch.items.map((item) => item.status)).toEqual(['queued', 'queued'])
    expect(batch.items.every((item) => item.attempts === 0)).toBe(true)
  })

  it('rejects a media item listed twice', () => {
    expect(() => batchOf(['a', 'a'])).toThrow(/more than once/)
  })

  it('follows its items for the batch status', () => {
    expect(batchStatusOf([{ id: 'a', status: 'done', progress: 1, attempts: 1 }])).toBe('done')
    expect(
      batchStatusOf([
        { id: 'a', status: 'done', progress: 1, attempts: 1 },
        { id: 'b', status: 'failed', progress: 0, attempts: 1 }
      ])
    ).toBe('failed')
    expect(
      batchStatusOf([
        { id: 'a', status: 'done', progress: 1, attempts: 1 },
        { id: 'b', status: 'cancelled', progress: 0, attempts: 1 }
      ])
    ).toBe('cancelled')
  })

  it('cancels only the chosen item, and leaves settled items alone', () => {
    let batch = batchOf(['a', 'b'])
    batch = updateBatchItem(batch, 'a', { status: 'done', progress: 1, attempts: 1 })
    batch = cancelBatchItem(batch, 'a')
    expect(batch.items[0]?.status).toBe('done')
    batch = cancelBatchItem(batch, 'b')
    expect(batch.items[1]?.status).toBe('cancelled')
    expect(batch.status).toBe('cancelled')
  })

  it('resets only failed or cancelled items for retry', () => {
    let batch = batchOf(['a', 'b', 'c'])
    batch = updateBatchItem(batch, 'a', { status: 'failed', attempts: 1, error: { message: 'x' } })
    batch = updateBatchItem(batch, 'b', { status: 'done', progress: 1, attempts: 1 })
    batch = updateBatchItem(batch, 'c', { status: 'cancelled', attempts: 1 })

    const retried = resetBatchItemsForRetry(batch, ['a'])
    expect(retried.items.map((item) => item.status)).toEqual(['queued', 'done', 'cancelled'])
    expect(retried.items[0]?.error).toBeUndefined()

    const all = resetBatchItemsForRetry(batch)
    expect(all.items.map((item) => item.status)).toEqual(['queued', 'done', 'queued'])
  })

  it('marks items that were in flight at shutdown as failed and retryable', () => {
    let batch = batchOf(['a', 'b', 'c'])
    batch = updateBatchItem(batch, 'a', { status: 'running', progress: 0.4, attempts: 1 })
    batch = updateBatchItem(batch, 'b', { status: 'done', progress: 1, attempts: 1 })
    const recovered = recoverInterruptedBatch(batch)
    expect(recovered.items.map((item) => item.status)).toEqual(['failed', 'done', 'failed'])
    expect(recovered.items[0]?.error?.message).toBe(INTERRUPTED_MESSAGE)
    expect(recovered.status).toBe('failed')
  })

  it('averages progress, counting settled items as complete', () => {
    let batch = batchOf(['a', 'b'])
    batch = updateBatchItem(batch, 'a', { status: 'running', progress: 0.5, attempts: 1 })
    expect(batchProgress(batch)).toBeCloseTo(0.25)
    batch = updateBatchItem(batch, 'b', { status: 'done', progress: 1, attempts: 1 })
    expect(batchProgress(batch)).toBeCloseTo(0.75)
  })
})
