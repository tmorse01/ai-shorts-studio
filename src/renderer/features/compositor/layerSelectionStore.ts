// The clip selected on the preview canvas and in the timeline. One selection for both, so a layer
// picked on the canvas is the one the timeline and the inspector show. It is view state, not part of
// the short, so it is not in the history.
import { createStore } from 'zustand/vanilla'

export interface LayerSelectionState {
  selectedClipId: string | null
  select: (clipId: string | null) => void
}

export const layerSelectionStore = createStore<LayerSelectionState>()((set) => ({
  selectedClipId: null,
  select: (clipId) => set({ selectedClipId: clipId })
}))
