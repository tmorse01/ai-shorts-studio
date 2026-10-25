// Sorting and filtering for the shorts grid. Pure, so the grid and the tests use the same answers.
// The grid's own order (`order`) is the Manual sort, the only one where cards can be dragged.
import type { Script, Short, ShortStatus } from '@shared/project/schema'

export type SortMode = 'manual' | 'updated' | 'status' | 'length'

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'updated', label: 'Last updated' },
  { value: 'status', label: 'Status' },
  { value: 'length', label: 'Length' }
]

export const STATUS_FILTERS: { value: ShortStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'exported', label: 'Exported' }
]

const STATUS_RANK: Record<ShortStatus, number> = { draft: 0, ready: 1, exported: 2 }

// Returns a new array. Last updated puts the newest first. Status goes Draft, Ready, Exported. Length
// puts the shortest target first, using the effective maximum target length. Ties keep the grid order.
export function sortShorts(
  shorts: readonly Short[],
  mode: SortMode,
  targetMaxSec: (short: Short) => number
): Short[] {
  const byOrder = [...shorts].sort((a, b) => a.order - b.order)
  switch (mode) {
    case 'manual':
      return byOrder
    case 'updated':
      return byOrder.sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
      )
    case 'status':
      return byOrder.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
    case 'length':
      return byOrder.sort((a, b) => targetMaxSec(a) - targetMaxSec(b))
  }
}

// Keeps the shorts whose status is one of `statuses`. An empty list keeps every short.
export function filterShorts(shorts: readonly Short[], statuses: readonly ShortStatus[]): Short[] {
  if (statuses.length === 0) return [...shorts]
  return shorts.filter((short) => statuses.includes(short.status))
}

/** The batch drafts when `reviewOnly` is set, otherwise every short. Keeps the input order. */
export function filterBatchDrafts(shorts: readonly Short[], reviewOnly: boolean): Short[] {
  if (!reviewOnly) return [...shorts]
  return shorts.filter((short) => short.batchDraft === true)
}

/**
 * A batch draft can be regenerated when the script it was written from still exists. Regenerating runs
 * footage matching for that script again; the new plan is reviewed before anything changes.
 */
export function canRegenerateBatchDraft(short: Short, scripts: readonly Script[]): boolean {
  return (
    short.batchDraft === true &&
    short.scriptId !== undefined &&
    scripts.some((script) => script.id === short.scriptId)
  )
}
