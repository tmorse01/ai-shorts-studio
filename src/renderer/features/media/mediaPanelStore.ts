// What the media panel remembers while it is open: the view, the sort, the filter and the selection.
// The view and the filter are remembered per project folder for this session only; saving them across
// launches needs the layout file.
import { createStore } from 'zustand/vanilla'
import {
  EMPTY_MEDIA_FILTER,
  EMPTY_SELECTION,
  selectItem,
  type MediaFilter,
  type MediaSortKey,
  type Selection,
  type SelectModifiers,
  type SortDirection
} from './mediaView'

export type MediaViewMode = 'grid' | 'list'

export interface MediaPanelState {
  viewByProject: Record<string, MediaViewMode>
  filterByProject: Record<string, MediaFilter>
  sortKey: MediaSortKey
  sortDirection: SortDirection
  selection: Selection
}

export interface MediaPanelActions {
  setView: (folderPath: string, view: MediaViewMode) => void
  // Replaces the part of the project's filter given in `patch`.
  setFilter: (folderPath: string, patch: Partial<MediaFilter>) => void
  clearFilter: (folderPath: string) => void
  setSort: (key: MediaSortKey, direction: SortDirection) => void
  select: (id: string, modifiers: SelectModifiers, order: readonly string[]) => void
  clearSelection: () => void
}

export type MediaPanelStore = MediaPanelState & MediaPanelActions

export const mediaPanelStore = createStore<MediaPanelStore>()((set, get) => ({
  viewByProject: {},
  filterByProject: {},
  sortKey: 'name',
  sortDirection: 'asc',
  selection: EMPTY_SELECTION,

  setView: (folderPath, view) =>
    set({ viewByProject: { ...get().viewByProject, [folderPath]: view } }),
  setFilter: (folderPath, patch) => {
    const current = get().filterByProject[folderPath] ?? EMPTY_MEDIA_FILTER
    set({
      filterByProject: {
        ...get().filterByProject,
        [folderPath]: { ...current, ...patch }
      }
    })
  },
  clearFilter: (folderPath) =>
    set({ filterByProject: { ...get().filterByProject, [folderPath]: EMPTY_MEDIA_FILTER } }),
  setSort: (sortKey, sortDirection) => set({ sortKey, sortDirection }),
  select: (id, modifiers, order) =>
    set({ selection: selectItem(get().selection, id, modifiers, order) }),
  clearSelection: () => set({ selection: EMPTY_SELECTION })
}))
