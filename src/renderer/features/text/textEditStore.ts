// The text overlay being edited on the preview canvas (Epic 13, #127). A double click starts editing and
// the editor closes when it commits or cancels. It is view state, so it is not in the history.
import { createStore } from 'zustand/vanilla'

export interface TextEditState {
  editingClipId: string | null
  start: (clipId: string) => void
  stop: () => void
}

export const textEditStore = createStore<TextEditState>()((set) => ({
  editingClipId: null,
  start: (clipId) => set({ editingClipId: clipId }),
  stop: () => set({ editingClipId: null })
}))
