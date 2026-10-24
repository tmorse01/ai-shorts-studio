// Undo and redo for one document. Every user edit is a command: an Immer producer plus a label.
// execute() applies the producer and records its Immer patches and inverse patches, so undo and
// redo replay those patches instead of keeping copies of whole states. Commands that share a
// mergeKey and land within the merge window become one history entry (a drag is one undo step).
import { createStore, type StoreApi } from 'zustand/vanilla'
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'

enablePatches()

export const DEFAULT_HISTORY_LIMIT = 200
export const DEFAULT_MERGE_WINDOW_MS = 500

export interface Command<S extends object> {
  // Plain-language name, for a future undo/redo menu.
  label: string
  // Immer producer. Mutate the draft; Immer records what changed.
  produce: (draft: Draft<S>) => void
  // Consecutive commands with the same key, recorded within the merge window, become one entry.
  mergeKey?: string
  // Overrides the history's merge window for this command. A gesture that can pause, such as a drag,
  // passes Infinity so the whole gesture stays one step however long it holds.
  mergeWindowMs?: number
}

export interface HistoryEntry {
  label: string
  mergeKey?: string
  // Time of the last command folded into this entry. Used for the merge window.
  recordedAt: number
  patches: Patch[]
  inversePatches: Patch[]
}

export interface HistoryOptions {
  // Maximum number of undo steps kept. Oldest steps are dropped first.
  limit?: number
  // Milliseconds after the last command within which a same-key command still merges.
  mergeWindowMs?: number
  // Clock, injectable for tests.
  now?: () => number
}

export interface HistoryState<S extends object> {
  present: S
  // Undo steps, oldest first. The last entry is the next one to undo.
  past: HistoryEntry[]
  // Undone steps, most recent first. The first entry is the next one to redo.
  future: HistoryEntry[]
  limit: number
}

export interface HistoryActions<S extends object> {
  // Returns false when the command changed nothing (nothing is recorded).
  execute: (command: Command<S>) => boolean
  undo: () => boolean
  redo: () => boolean
  // Replaces the document and drops all history. Used when a document is loaded.
  reset: (present: S) => void
  setLimit: (limit: number) => void
}

export type HistoryStore<S extends object> = HistoryState<S> & HistoryActions<S>

export type HistoryApi<S extends object> = StoreApi<HistoryStore<S>>

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`History limit must be a non-negative integer, got ${limit}`)
  }
}

function keepLatest(entries: HistoryEntry[], limit: number): HistoryEntry[] {
  return entries.length > limit ? entries.slice(entries.length - limit) : entries
}

export function createHistoryStore<S extends object>(
  initial: S,
  options: HistoryOptions = {}
): HistoryApi<S> {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS
  const now = options.now ?? Date.now
  assertLimit(limit)

  return createStore<HistoryStore<S>>()((set, get) => ({
    present: initial,
    past: [],
    future: [],
    limit,
    execute: (command) => {
      const { present, past, future, limit: max } = get()
      // Wrapped so a producer's return value is ignored. Immer would otherwise treat it as a
      // replacement for the whole state.
      const [next, patches, inversePatches] = produceWithPatches(present, (draft) => {
        command.produce(draft)
      })
      if (patches.length === 0) return false

      const at = now()
      const last = past[past.length - 1]
      // Merging only folds into the newest step. After an undo there is no newest step to fold
      // into, so the first edit after an undo always starts a new entry.
      const canMerge =
        future.length === 0 &&
        command.mergeKey !== undefined &&
        last !== undefined &&
        last.mergeKey === command.mergeKey &&
        at - last.recordedAt <= (command.mergeWindowMs ?? mergeWindowMs)

      const nextPast = canMerge
        ? [
            ...past.slice(0, -1),
            {
              ...last,
              recordedAt: at,
              patches: [...last.patches, ...patches],
              // The newest change is undone first, so its inverse goes in front.
              inversePatches: [...inversePatches, ...last.inversePatches]
            }
          ]
        : keepLatest(
            [
              ...past,
              {
                label: command.label,
                mergeKey: command.mergeKey,
                recordedAt: at,
                patches,
                inversePatches
              }
            ],
            max
          )

      set({ present: next, past: nextPast, future: [] })
      return true
    },
    undo: () => {
      const { present, past, future } = get()
      const entry = past[past.length - 1]
      if (!entry) return false
      set({
        present: applyPatches(present, entry.inversePatches),
        past: past.slice(0, -1),
        future: [entry, ...future]
      })
      return true
    },
    redo: () => {
      const { present, past, future, limit: max } = get()
      const entry = future[0]
      if (!entry) return false
      set({
        present: applyPatches(present, entry.patches),
        past: keepLatest([...past, entry], max),
        future: future.slice(1)
      })
      return true
    },
    reset: (present) => set({ present, past: [], future: [] }),
    setLimit: (next) => {
      assertLimit(next)
      set((state) => ({ limit: next, past: keepLatest(state.past, next) }))
    }
  }))
}
