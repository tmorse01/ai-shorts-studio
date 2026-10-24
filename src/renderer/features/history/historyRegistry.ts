// One undo history per short. Each id (a short id, for now) gets its own history store, so
// switching the active id switches which undo stack the editor sees. Histories are created on
// first use from createInitial(id); the caller loads real content with reset().
import { createStore, type StoreApi } from 'zustand/vanilla'
import { createHistoryStore, type HistoryApi, type HistoryOptions } from './historyStore'

export interface HistoryRegistryOptions<S extends object> extends HistoryOptions {
  createInitial: (id: string) => S
}

export interface ActiveHistorySelection {
  activeId: string | null
  setActive: (id: string | null) => void
}

export interface HistoryRegistry<S extends object> {
  // Returns the history for an id, creating it if needed.
  get: (id: string) => HistoryApi<S>
  has: (id: string) => boolean
  // Drops an id's history, for example when a short is deleted. Clears the selection if it was active.
  remove: (id: string) => void
  ids: () => string[]
  // Store that holds which id is active. Components subscribe to it through selectors.
  selection: StoreApi<ActiveHistorySelection>
  // History of the active id, or null when nothing is active.
  active: () => HistoryApi<S> | null
}

export function createHistoryRegistry<S extends object>(
  options: HistoryRegistryOptions<S>
): HistoryRegistry<S> {
  const { createInitial, ...historyOptions } = options
  const histories = new Map<string, HistoryApi<S>>()

  const selection = createStore<ActiveHistorySelection>()((set) => ({
    activeId: null,
    setActive: (id) => set({ activeId: id })
  }))

  const get = (id: string): HistoryApi<S> => {
    let history = histories.get(id)
    if (!history) {
      history = createHistoryStore(createInitial(id), historyOptions)
      histories.set(id, history)
    }
    return history
  }

  return {
    get,
    has: (id) => histories.has(id),
    remove: (id) => {
      histories.delete(id)
      if (selection.getState().activeId === id) selection.getState().setActive(null)
    },
    ids: () => [...histories.keys()],
    selection,
    active: () => {
      const id = selection.getState().activeId
      return id === null ? null : get(id)
    }
  }
}
