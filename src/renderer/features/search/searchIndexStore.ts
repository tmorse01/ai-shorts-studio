// The search index the Media panel queries, and the project it was built for. The index itself is
// mutable and lives here once; `revision` goes up whenever it changes, so the search box re-runs.
import { createStore } from 'zustand/vanilla'
import { SearchIndex } from '@shared/search/searchIndex'

export const searchIndex = new SearchIndex()

export interface SearchIndexState {
  folderPath: string | null
  revision: number
}

export interface SearchIndexActions {
  /** Empties the index for a different project. */
  reset: (folderPath: string) => void
  /** Tells subscribers the index changed. */
  commit: () => void
}

export type SearchIndexStore = SearchIndexState & SearchIndexActions

export const searchIndexStore = createStore<SearchIndexStore>()((set, get) => ({
  folderPath: null,
  revision: 0,
  reset: (folderPath) => {
    searchIndex.clear()
    set({ folderPath, revision: get().revision + 1 })
  },
  commit: () => set({ revision: get().revision + 1 })
}))
