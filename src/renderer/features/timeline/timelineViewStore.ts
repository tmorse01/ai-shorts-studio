// The timeline pane's zoom and snapping. Kept apart from the timeline data: they are how the pane
// behaves, not part of the short, so they are not in the history.
import { createStore } from 'zustand'
import { clampZoom, DEFAULT_PX_PER_MS, zoomStep } from './timelineView'

export interface TimelineViewState {
  pxPerMs: number
  zoomIn: () => void
  zoomOut: () => void
  setPxPerMs: (pxPerMs: number) => void
  // Whether drags snap to the playhead and clip edges. N toggles it; holding Alt skips it per drag.
  snapping: boolean
  toggleSnapping: () => void
}

export const timelineViewStore = createStore<TimelineViewState>()((set, get) => ({
  pxPerMs: DEFAULT_PX_PER_MS,
  zoomIn: () => set({ pxPerMs: zoomStep(get().pxPerMs, 1) }),
  zoomOut: () => set({ pxPerMs: zoomStep(get().pxPerMs, -1) }),
  setPxPerMs: (pxPerMs) => set({ pxPerMs: clampZoom(pxPerMs) }),
  snapping: true,
  toggleSnapping: () => set({ snapping: !get().snapping })
}))
