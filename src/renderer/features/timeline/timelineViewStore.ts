// The timeline pane's zoom. Kept apart from the timeline data: zoom is how the pane looks, not part
// of the short, so it is not in the history.
import { createStore } from 'zustand'
import { clampZoom, DEFAULT_PX_PER_MS, zoomStep } from './timelineView'

export interface TimelineViewState {
  pxPerMs: number
  zoomIn: () => void
  zoomOut: () => void
  setPxPerMs: (pxPerMs: number) => void
}

export const timelineViewStore = createStore<TimelineViewState>()((set, get) => ({
  pxPerMs: DEFAULT_PX_PER_MS,
  zoomIn: () => set({ pxPerMs: zoomStep(get().pxPerMs, 1) }),
  zoomOut: () => set({ pxPerMs: zoomStep(get().pxPerMs, -1) }),
  setPxPerMs: (pxPerMs) => set({ pxPerMs: clampZoom(pxPerMs) })
}))
