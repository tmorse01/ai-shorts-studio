// What the media panel remembers while it is open: the view, the sort and the selection. The view is
// remembered per project folder for this session only; saving it across launches needs the layout file.
import { createStore } from 'zustand/vanilla'
import {
  EMPTY_SELECTION,
  selectItem,
  type MediaSortKey,
  type Selection,
  type SelectModifiers,
  type SortDirection
} from './mediaView'

export type MediaViewMode = 'grid' | 'list'

export interface MediaPanelState {
  viewByProject: Record<string, MediaViewMode>
  sortKey: MediaSortKey
  sortDirection: SortDirection
  selection: Selection
}

export interface MediaPanelActions {
  setView: (folderPath: string, view: MediaViewMode) => void
  setSort: (key: MediaSortKey, direction: SortDirection) => void
  select: (id: string, modifiers: SelectModifiers, order: readonly string[]) => void
  clearSelection: () => void
}

export type MediaPanelStore = MediaPanelState & MediaPanelActions

export const mediaPanelStore = createStore<MediaPanelStore>()((set, get) => ({
  viewByProject: {},
  sortKey: 'name',
  sortDirection: 'asc',
  selection: EMPTY_SELECTION,

  setView: (folderPath, view) =>
    set({ viewByProject: { ...get().viewByProject, [folderPath]: view } }),
  setSort: (sortKey, sortDirection) => set({ sortKey, sortDirection }),
  select: (id, modifiers, order) =>
    set({ selection: selectItem(get().selection, id, modifiers, order) }),
  clearSelection: () => set({ selection: EMPTY_SELECTION })
}))
