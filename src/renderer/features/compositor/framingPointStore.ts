// Which pose of a pan the canvas gizmo edits: the start or the end (see FramingPoint in
// shared/timeline/framing.ts). The pan section sets it. It is view state, so it is not in the history.
import { createStore } from 'zustand/vanilla'
import type { FramingPoint } from '@shared/timeline/framing'

export interface FramingPointState {
  point: FramingPoint
  setPoint: (point: FramingPoint) => void
}

export const framingPointStore = createStore<FramingPointState>()((set) => ({
  point: 'start',
  setPoint: (point) => set({ point })
}))
